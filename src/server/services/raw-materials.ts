import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma, withTransaction, isUniqueViolation, type Tx } from "../db";
import { audit } from "../audit";
import { NotFoundError, ValidationError } from "../errors";
import { assertCan, type Actor } from "../permissions";
import { nextNumber } from "../sequence";
import { readSettings } from "../settings";
import { assertUnitPrecision, idempotencyKey, optionalText, parse, positiveQty, requiredText, signedQty } from "../validation";
import { parseLocalDateTime } from "@/lib/dates";
import { dec } from "@/lib/decimal";
import { createAttachmentRecord, storeFile, type UploadFile } from "./attachments";

export function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

async function findOrCreateMaterial(tx: Tx, name: string, unitId: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeName(clean);
  const existing = await tx.rawMaterial.findUnique({ where: { normalizedName_unitId: { normalizedName, unitId } } });
  if (existing) return existing;
  // ON CONFLICT makes two first-time entries for the same material safe to race.
  await tx.$executeRaw`
    INSERT INTO "RawMaterial" ("id", "name", "normalizedName", "unitId", "currentBalance", "active", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, ${clean}, ${normalizedName}, ${unitId}, 0, true, now(), now())
    ON CONFLICT ("normalizedName", "unitId") DO NOTHING`;
  return tx.rawMaterial.findUniqueOrThrow({ where: { normalizedName_unitId: { normalizedName, unitId } } });
}

/** Lock the material row and apply a signed change to its cached balance + ledger. */
async function postRawTransaction(
  tx: Tx,
  actor: Actor,
  args: {
    rawMaterialId: string;
    type: Prisma.RawMaterialTransactionCreateInput["type"];
    quantity: Prisma.Decimal;
    entryId?: string | null;
    inspectionId?: string | null;
    reference?: string | null;
    reason?: string | null;
    idempotencyKey?: string | null;
  },
) {
  const rows = await tx.$queryRaw<{ id: string; currentBalance: Prisma.Decimal; unitId: string }[]>`
    SELECT "id", "currentBalance", "unitId" FROM "RawMaterial" WHERE "id" = ${args.rawMaterialId} FOR UPDATE`;
  const material = rows[0];
  if (!material) throw new NotFoundError("Raw material");
  const balanceAfter = dec(material.currentBalance).plus(args.quantity);
  if (balanceAfter.lt(0)) {
    throw new ValidationError(`Insufficient raw material stock. Available: ${dec(material.currentBalance).toString()}.`);
  }
  await tx.rawMaterial.update({ where: { id: material.id }, data: { currentBalance: balanceAfter } });
  return tx.rawMaterialTransaction.create({
    data: {
      txnNo: await nextNumber(tx, "rawTxn"),
      type: args.type,
      rawMaterialId: material.id,
      unitId: material.unitId,
      quantity: args.quantity,
      balanceAfter,
      entryId: args.entryId ?? null,
      inspectionId: args.inspectionId ?? null,
      reference: args.reference ?? null,
      reason: args.reason ?? null,
      idempotencyKey: args.idempotencyKey ?? null,
      createdById: actor.id,
    },
  });
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

const entrySchema = z
  .object({
    idempotencyKey,
    entryDate: z.string().min(1, "Entry date is required"),
    materialName: requiredText(150, "Product name"),
    supplierId: requiredText(50, "Supplier"),
    quantity: positiveQty,
    unitId: requiredText(50, "Unit"),
    poNumber: optionalText(60),
    invoiceNumber: optionalText(60),
    notes: optionalText(1000),
  })
  .refine((v) => v.poNumber || v.invoiceNumber, {
    message: "Enter a PO number or an invoice number",
    path: ["invoiceNumber"],
  });

export async function createRawMaterialEntry(actor: Actor, input: unknown, bill?: UploadFile | null) {
  assertCan(actor, "rm.entry.create");
  const data = parse(entrySchema, input);

  const existing = await prisma.rawMaterialEntry.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (existing) return { entry: existing, duplicate: true as const };

  const settings = await readSettings();
  const entryDate = parseLocalDateTime(data.entryDate, settings.timezone);
  if (!entryDate) throw new ValidationError("Enter a valid entry date and time.", { entryDate: "Invalid date" });
  if (entryDate.getTime() > Date.now() + 5 * 60_000)
    throw new ValidationError("Entry date cannot be in the future.", { entryDate: "In the future" });

  const [supplier, unit] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: data.supplierId } }),
    prisma.unit.findUnique({ where: { id: data.unitId } }),
  ]);
  if (!supplier || !supplier.active) throw new ValidationError("Select an active supplier.", { supplierId: "Select an active supplier" });
  if (!unit || !unit.active) throw new ValidationError("Select a valid unit.", { unitId: "Select a valid unit" });
  assertUnitPrecision(data.quantity, unit);

  if (bill && bill.size > 0) assertCan(actor, "rm.bills");
  const prepared = bill && bill.size > 0 ? await storeFile(bill, "RAW_MATERIAL_BILL") : null;

  try {
    const entry = await withTransaction(async (tx) => {
      const material = await findOrCreateMaterial(tx, data.materialName, unit.id);
      const entry = await tx.rawMaterialEntry.create({
        data: {
          entryNo: await nextNumber(tx, "rawEntry"),
          entryDate,
          rawMaterialId: material.id,
          supplierId: supplier.id,
          quantity: data.quantity,
          unitId: unit.id,
          poNumber: data.poNumber,
          invoiceNumber: data.invoiceNumber,
          notes: data.notes,
          idempotencyKey: data.idempotencyKey,
          createdById: actor.id,
        },
      });
      if (prepared) {
        await createAttachmentRecord(tx, actor, "RAW_MATERIAL_BILL", prepared, {
          rawMaterialEntryId: entry.id,
          supplierId: supplier.id,
          billNumber: data.invoiceNumber ?? data.poNumber,
        });
      }
      await audit(tx, {
        actorId: actor.id,
        action: "raw_entry.create",
        entityType: "RawMaterialEntry",
        entityId: entry.id,
        summary: `Recorded ${data.quantity.toString()} ${unit.code} of ${material.name} from ${supplier.name} (${entry.entryNo}) — pending inspection`,
      });
      return entry;
    });
    return { entry, duplicate: false as const };
  } catch (e) {
    if (isUniqueViolation(e, "idempotencyKey")) {
      const entry = await prisma.rawMaterialEntry.findUniqueOrThrow({ where: { idempotencyKey: data.idempotencyKey } });
      return { entry, duplicate: true as const };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

const approveSchema = z.object({ entryId: requiredText(50), notes: optionalText(1000) });
const rejectSchema = z.object({
  entryId: requiredText(50),
  rejectionReason: requiredText(1000, "Rejection reason"),
  notes: optionalText(1000),
});

export async function approveEntry(actor: Actor, input: unknown) {
  assertCan(actor, "rm.inspect");
  const data = parse(approveSchema, input);
  return withTransaction(async (tx) => {
    // The conditional update is the idempotency guard: only one request can
    // move an entry out of PENDING_INSPECTION.
    const moved = await tx.rawMaterialEntry.updateMany({
      where: { id: data.entryId, status: "PENDING_INSPECTION" },
      data: { status: "APPROVED" },
    });
    if (moved.count !== 1) throw await alreadyDecided(tx, data.entryId);

    const entry = await tx.rawMaterialEntry.findUniqueOrThrow({ where: { id: data.entryId }, include: { rawMaterial: true, unit: true } });
    const inspection = await tx.qualityInspection.create({
      data: { entryId: entry.id, decision: "APPROVED", notes: data.notes, inspectedById: actor.id },
    });
    const txn = await postRawTransaction(tx, actor, {
      rawMaterialId: entry.rawMaterialId,
      type: "INWARD_APPROVED",
      quantity: dec(entry.quantity),
      entryId: entry.id,
      inspectionId: inspection.id,
      reference: entry.invoiceNumber ?? entry.poNumber,
      reason: data.notes,
    });
    await audit(tx, {
      actorId: actor.id,
      action: "inspection.approve",
      entityType: "RawMaterialEntry",
      entityId: entry.id,
      summary: `Approved ${entry.entryNo}: +${dec(entry.quantity).toString()} ${entry.unit.code} ${entry.rawMaterial.name}`,
      details: { inspectionId: inspection.id, txnNo: txn.txnNo },
    });
    return { inspection, txn };
  });
}

export async function rejectEntry(actor: Actor, input: unknown) {
  assertCan(actor, "rm.inspect");
  const data = parse(rejectSchema, input);
  return withTransaction(async (tx) => {
    const moved = await tx.rawMaterialEntry.updateMany({
      where: { id: data.entryId, status: "PENDING_INSPECTION" },
      data: { status: "REJECTED" },
    });
    if (moved.count !== 1) throw await alreadyDecided(tx, data.entryId);
    const entry = await tx.rawMaterialEntry.findUniqueOrThrow({ where: { id: data.entryId } });
    const inspection = await tx.qualityInspection.create({
      data: { entryId: entry.id, decision: "REJECTED", rejectionReason: data.rejectionReason, notes: data.notes, inspectedById: actor.id },
    });
    await audit(tx, {
      actorId: actor.id,
      action: "inspection.reject",
      entityType: "RawMaterialEntry",
      entityId: entry.id,
      summary: `Rejected ${entry.entryNo}: ${data.rejectionReason}`,
      details: { inspectionId: inspection.id },
    });
    return { inspection };
  });
}

async function alreadyDecided(tx: Tx, entryId: string) {
  const entry = await tx.rawMaterialEntry.findUnique({ where: { id: entryId } });
  if (!entry) return new NotFoundError("Raw material entry");
  return new ValidationError(`This entry has already been ${entry.status === "APPROVED" ? "approved" : "rejected"}.`);
}

/**
 * Controlled correction of an inspection decision. The original decision stays
 * on record (marked reversed); an approval's stock is removed with a reversal
 * transaction; the entry goes back to Pending Inspection for re-inspection.
 */
export async function reverseInspection(actor: Actor, input: unknown) {
  assertCan(actor, "inventory.reverse");
  const data = parse(z.object({ inspectionId: requiredText(50), reason: requiredText(1000, "Reason") }), input);
  return withTransaction(async (tx) => {
    const inspection = await tx.qualityInspection.findUnique({
      where: { id: data.inspectionId },
      include: { entry: { include: { rawMaterial: true, unit: true } } },
    });
    if (!inspection) throw new NotFoundError("Inspection");
    const marked = await tx.qualityInspection.updateMany({
      where: { id: inspection.id, reversedAt: null },
      data: { reversedAt: new Date(), reversedById: actor.id, reversalReason: data.reason },
    });
    if (marked.count !== 1) throw new ValidationError("This inspection decision has already been reversed.");

    const entry = inspection.entry;
    const moved = await tx.rawMaterialEntry.updateMany({
      where: { id: entry.id, status: inspection.decision },
      data: { status: "PENDING_INSPECTION" },
    });
    if (moved.count !== 1) throw new ValidationError("Entry status no longer matches this decision.");

    if (inspection.decision === "APPROVED") {
      await postRawTransaction(tx, actor, {
        rawMaterialId: entry.rawMaterialId,
        type: "INSPECTION_REVERSAL",
        quantity: dec(entry.quantity).negated(),
        entryId: entry.id,
        inspectionId: inspection.id,
        reference: entry.entryNo,
        reason: data.reason,
      });
    }
    await audit(tx, {
      actorId: actor.id,
      action: "inspection.reverse",
      entityType: "RawMaterialEntry",
      entityId: entry.id,
      summary: `Reversed ${inspection.decision.toLowerCase()} decision on ${entry.entryNo} for re-inspection: ${data.reason}`,
      details: { inspectionId: inspection.id },
    });
  });
}

// ---------------------------------------------------------------------------
// Adjustments (admin corrections)
// ---------------------------------------------------------------------------

export async function adjustRawMaterial(actor: Actor, input: unknown) {
  assertCan(actor, "inventory.adjust");
  const data = parse(
    z.object({ idempotencyKey, rawMaterialId: requiredText(50), quantity: signedQty, reason: requiredText(1000, "Reason") }),
    input,
  );
  const existing = await prisma.rawMaterialTransaction.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (existing) return existing;
  const material = await prisma.rawMaterial.findUnique({ where: { id: data.rawMaterialId }, include: { unit: true } });
  if (!material) throw new NotFoundError("Raw material");
  assertUnitPrecision(data.quantity.abs(), material.unit);
  try {
    return await withTransaction(async (tx) => {
      const txn = await postRawTransaction(tx, actor, {
        rawMaterialId: material.id,
        type: "ADJUSTMENT",
        quantity: data.quantity,
        reason: data.reason,
        idempotencyKey: data.idempotencyKey,
      });
      await audit(tx, {
        actorId: actor.id,
        action: "raw_material.adjust",
        entityType: "RawMaterial",
        entityId: material.id,
        summary: `Adjusted ${material.name} by ${data.quantity.toString()} ${material.unit.code}: ${data.reason}`,
        details: { txnNo: txn.txnNo },
      });
      return txn;
    });
  } catch (e) {
    if (isUniqueViolation(e, "idempotencyKey"))
      return prisma.rawMaterialTransaction.findUniqueOrThrow({ where: { idempotencyKey: data.idempotencyKey } });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/** Materials whose cached balance differs from the sum of their ledger. Should always be empty. */
export async function reconcileRawMaterials() {
  return prisma.$queryRaw<{ id: string; name: string; cached: Prisma.Decimal; ledger: Prisma.Decimal }[]>`
    SELECT m."id", m."name", m."currentBalance" AS cached, COALESCE(SUM(t."quantity"), 0) AS ledger
    FROM "RawMaterial" m LEFT JOIN "RawMaterialTransaction" t ON t."rawMaterialId" = m."id"
    GROUP BY m."id"
    HAVING m."currentBalance" <> COALESCE(SUM(t."quantity"), 0)`;
}
