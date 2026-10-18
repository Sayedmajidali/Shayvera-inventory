import { z } from "zod";
import type { Prisma, StockBucket } from "@prisma/client";
import { prisma, withTransaction, isUniqueViolation, type Tx } from "../db";
import { audit } from "../audit";
import { NotFoundError, ValidationError } from "../errors";
import { assertCan, type Actor } from "../permissions";
import { nextNumber } from "../sequence";
import { readSettings } from "../settings";
import {
  assertUnitPrecision,
  idempotencyKey,
  isoDay,
  nonNegativeQty,
  optionalText,
  parse,
  positiveQty,
  requiredText,
  signedQty,
} from "../validation";
import { dateOnly, todayInTz } from "@/lib/dates";
import { dec } from "@/lib/decimal";
import { createAttachmentRecord, storeFile, type UploadFile } from "./attachments";
import { evaluateLowStock, postProductTxn } from "./inventory-core";
import { describeChanges, diffFields } from "../changes";

const optionalDay = z.preprocess((v) => (v === "" || v === null ? undefined : v), isoDay.optional());

export const productSchema = z.object({
  name: requiredText(150, "Product name"),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._\-/]{0,39}$/, "SKU: letters, digits, . _ - / (max 40)"),
  barcode: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(64).optional()).transform((v) => v ?? null),
  categoryId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()).transform((v) => v ?? null),
  unitId: requiredText(50, "Unit"),
  lowStockThreshold: nonNegativeQty,
  expiryAlertDays: z.coerce.number({ invalid_type_error: "Enter a number of days" }).int("Whole days only").min(0).max(3650),
  tracksExpiry: z.boolean(),
  description: optionalText(2000),
});

export const openingSchema = z.object({
  openingQty: z.preprocess((v) => (v === "" || v === null || v === undefined ? "0" : v), nonNegativeQty),
  openingBatchNo: optionalText(40),
  openingExpiryDate: optionalDay,
});

async function loadUnitAndCategory(unitId: string, categoryId: string | null) {
  const [unit, category] = await Promise.all([
    prisma.unit.findUnique({ where: { id: unitId } }),
    categoryId ? prisma.productCategory.findUnique({ where: { id: categoryId } }) : Promise.resolve(null),
  ]);
  if (!unit || !unit.active) throw new ValidationError("Select a valid unit.", { unitId: "Select a valid unit" });
  if (categoryId && !category) throw new ValidationError("Select a valid category.", { categoryId: "Invalid category" });
  return unit;
}

function uniqueError(e: unknown) {
  if (isUniqueViolation(e, "sku")) return new ValidationError("That SKU is already used by another product.", { sku: "Already in use" });
  if (isUniqueViolation(e, "barcode"))
    return new ValidationError("That barcode is already used by another product.", { barcode: "Already in use" });
  return null;
}

export async function createProduct(actor: Actor, input: unknown, image?: UploadFile | null) {
  assertCan(actor, "admin.masters");
  const data = parse(productSchema, input);
  const opening = parse(openingSchema, input);
  const unit = await loadUnitAndCategory(data.unitId, data.categoryId);
  assertUnitPrecision(data.lowStockThreshold, unit, "lowStockThreshold");
  assertUnitPrecision(opening.openingQty, unit, "openingQty");
  if (opening.openingQty.gt(0) && data.tracksExpiry && !opening.openingExpiryDate) {
    throw new ValidationError("Enter the expiry date of the opening stock batch.", { openingExpiryDate: "Required for opening stock" });
  }
  const settings = await readSettings();
  const today = todayInTz(settings.timezone);
  const prepared = image && image.size > 0 ? await storeFile(image, "PRODUCT_IMAGE") : null;

  try {
    return await withTransaction(async (tx) => {
      let imageAttachmentId: string | null = null;
      if (prepared) imageAttachmentId = (await createAttachmentRecord(tx, actor, "PRODUCT_IMAGE", prepared, {})).id;
      const product = await tx.readyProduct.create({
        data: { ...data, productCode: await nextNumber(tx, "product"), imageAttachmentId },
      });
      if (opening.openingQty.gt(0)) {
        const batch = await tx.productBatch.create({
          data: {
            batchNo: opening.openingBatchNo || (await nextNumber(tx, "batch")),
            productId: product.id,
            receivedDate: dateOnly(today),
            expiryDate: data.tracksExpiry && opening.openingExpiryDate ? dateOnly(opening.openingExpiryDate) : null,
            initialQty: opening.openingQty,
            notes: "Opening stock",
            createdById: actor.id,
          },
        });
        await postProductTxn(tx, actor, {
          type: "OPENING",
          productId: product.id,
          batchId: batch.id,
          bucket: "SALEABLE",
          unitId: unit.id,
          quantity: opening.openingQty,
          reference: batch.batchNo,
          notes: "Opening stock",
        });
      }
      await evaluateLowStock(tx, product.id, today);
      await audit(tx, {
        actorId: actor.id,
        action: "product.create",
        entityType: "ReadyProduct",
        entityId: product.id,
        summary: `Created product ${product.name} (${product.sku})${opening.openingQty.gt(0) ? ` with opening stock ${opening.openingQty.toString()} ${unit.code}` : ""}`,
        details: { lowStockThreshold: data.lowStockThreshold.toString(), expiryAlertDays: data.expiryAlertDays },
      });
      return product;
    });
  } catch (e) {
    throw uniqueError(e) ?? e;
  }
}

export async function updateProduct(actor: Actor, id: string, input: unknown, image?: UploadFile | null) {
  assertCan(actor, "admin.masters");
  const data = parse(productSchema, input);
  const note = parse(z.object({ changeReason: optionalText(1000) }), input).changeReason;
  const before = await prisma.readyProduct.findUnique({ where: { id }, include: { unit: true, category: true } });
  if (!before) throw new NotFoundError("Product");
  if (before.deletedAt) throw new ValidationError("Deleted products cannot be edited.");
  const unit = await loadUnitAndCategory(data.unitId, data.categoryId);
  assertUnitPrecision(data.lowStockThreshold, unit, "lowStockThreshold");
  if (data.unitId !== before.unitId) {
    const moved = await prisma.productTransaction.count({ where: { productId: id } });
    if (moved > 0)
      throw new ValidationError("The unit cannot be changed after stock has been posted.", { unitId: "Locked after first transaction" });
  }
  const category = data.categoryId ? await prisma.productCategory.findUnique({ where: { id: data.categoryId } }) : null;
  const changes = diffFields([
    { field: "name", label: "Product name", from: before.name, to: data.name },
    { field: "sku", label: "SKU", from: before.sku, to: data.sku },
    { field: "barcode", label: "Barcode", from: before.barcode, to: data.barcode },
    { field: "category", label: "Category", from: before.category?.name, to: category?.name },
    { field: "unit", label: "Unit", from: before.unit.code, to: unit.code },
    {
      field: "lowStockThreshold",
      label: "Low-stock threshold",
      from: dec(before.lowStockThreshold).toString(),
      to: data.lowStockThreshold.toString(),
    },
    { field: "tracksExpiry", label: "Tracks expiry", from: before.tracksExpiry, to: data.tracksExpiry },
    { field: "expiryAlertDays", label: "Expiry alert (days)", from: before.expiryAlertDays, to: data.expiryAlertDays },
    { field: "description", label: "Description", from: before.description, to: data.description },
  ]);
  const settings = await readSettings();
  const prepared = image && image.size > 0 ? await storeFile(image, "PRODUCT_IMAGE") : null;
  if (prepared)
    changes.push({
      field: "image",
      label: "Product image",
      from: before.imageAttachmentId ? "previous image" : null,
      to: prepared.fileName,
    });
  if (changes.length === 0) throw new ValidationError("Nothing was changed.");
  try {
    return await withTransaction(async (tx) => {
      let imageAttachmentId = before.imageAttachmentId;
      if (prepared) {
        if (before.imageAttachmentId) {
          await tx.billAttachment.update({
            where: { id: before.imageAttachmentId },
            data: { status: "REPLACED", replacedAt: new Date(), replacedById: actor.id },
          });
        }
        imageAttachmentId = (await createAttachmentRecord(tx, actor, "PRODUCT_IMAGE", prepared, {})).id;
      }
      const updated = await tx.readyProduct.updateMany({ where: { id, deletedAt: null }, data: { ...data, imageAttachmentId } });
      if (updated.count !== 1) throw new ValidationError("This product was deleted while you were editing it.");
      await evaluateLowStock(tx, id, todayInTz(settings.timezone));
      await audit(tx, {
        actorId: actor.id,
        action: "product.update",
        entityType: "ReadyProduct",
        entityId: id,
        summary: `Edited product ${data.name} (${data.sku}): ${describeChanges(changes)}`,
        details: { changes: changes as unknown as Prisma.InputJsonValue, reason: note },
      });
      return { id, changes };
    });
  } catch (e) {
    throw uniqueError(e) ?? e;
  }
}

/**
 * Delete a product from the master (soft delete). Allowed only when it holds no
 * stock in any bucket, so no inventory disappears; batches, ledger rows and
 * reports keep the full history, and the SKU stays reserved.
 */
export async function deleteProduct(actor: Actor, input: unknown) {
  assertCan(actor, "admin.masters");
  const data = parse(z.object({ productId: requiredText(50, "Product"), reason: requiredText(1000, "Reason for deleting") }), input);
  const settings = await readSettings();
  return withTransaction(async (tx) => {
    // Lock the product (receipts take the same lock) and its balances so no stock can arrive while we check.
    await tx.$queryRaw`SELECT "id" FROM "ReadyProduct" WHERE "id" = ${data.productId} FOR UPDATE`;
    const balances = await tx.$queryRaw<{ bucket: StockBucket; qty: Prisma.Decimal }[]>`
      SELECT "bucket", "quantity" AS qty FROM "StockBalance" WHERE "productId" = ${data.productId} FOR UPDATE`;
    const product = await tx.readyProduct.findUnique({ where: { id: data.productId }, include: { unit: true } });
    if (!product) throw new NotFoundError("Product");
    if (product.deletedAt) throw new ValidationError("This product has already been deleted.");
    const held = balances.filter((b) => dec(b.qty).gt(0));
    if (held.length) {
      const list = held.map((b) => `${dec(b.qty).toString()} ${product.unit.code} ${b.bucket.toLowerCase()}`).join(", ");
      throw new ValidationError(
        `${product.name} still has stock (${list}). Dispatch it, or post adjustments with a reason to bring every bucket to zero, before deleting.`,
      );
    }
    const updated = await tx.readyProduct.updateMany({
      where: { id: product.id, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: actor.id, deleteReason: data.reason, active: false },
    });
    if (updated.count !== 1) throw new ValidationError("This product has already been deleted.");
    await evaluateLowStock(tx, product.id, todayInTz(settings.timezone));
    await audit(tx, {
      actorId: actor.id,
      action: "product.delete",
      entityType: "ReadyProduct",
      entityId: product.id,
      summary: `Deleted product ${product.name} (${product.sku}): ${data.reason}`,
      details: {
        reason: data.reason,
        snapshot: {
          productCode: product.productCode,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          unit: product.unit.code,
          lowStockThreshold: dec(product.lowStockThreshold).toString(),
          expiryAlertDays: product.expiryAlertDays,
        },
      },
    });
  });
}

/** Undo a product deletion. The product comes back active with its full history. */
export async function restoreProduct(actor: Actor, input: unknown) {
  assertCan(actor, "admin.masters");
  const data = parse(z.object({ productId: requiredText(50, "Product"), reason: requiredText(1000, "Reason for restoring") }), input);
  const settings = await readSettings();
  return withTransaction(async (tx) => {
    const product = await tx.readyProduct.findUnique({ where: { id: data.productId } });
    if (!product) throw new NotFoundError("Product");
    const updated = await tx.readyProduct.updateMany({
      where: { id: product.id, deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null, deleteReason: null, active: true },
    });
    if (updated.count !== 1) throw new ValidationError("This product is not deleted.");
    await evaluateLowStock(tx, product.id, todayInTz(settings.timezone));
    await audit(tx, {
      actorId: actor.id,
      action: "product.restore",
      entityType: "ReadyProduct",
      entityId: product.id,
      summary: `Restored product ${product.name} (${product.sku}): ${data.reason}`,
      details: { reason: data.reason, previousDeleteReason: product.deleteReason },
    });
  });
}

export async function setProductActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "admin.masters");
  const settings = await readSettings();
  return withTransaction(async (tx) => {
    const current = await tx.readyProduct.findUnique({ where: { id } });
    if (!current) throw new NotFoundError("Product");
    if (current.deletedAt) throw new ValidationError("Deleted products cannot be reactivated.");
    const p = await tx.readyProduct.update({ where: { id }, data: { active } });
    await evaluateLowStock(tx, id, todayInTz(settings.timezone));
    await audit(tx, {
      actorId: actor.id,
      action: active ? "product.activate" : "product.deactivate",
      entityType: "ReadyProduct",
      entityId: id,
      summary: `${active ? "Activated" : "Deactivated"} product ${p.name}`,
    });
    return p;
  });
}

// ---------------------------------------------------------------------------
// Stock receipts (new batches)
// ---------------------------------------------------------------------------

const receiptSchema = z.object({
  idempotencyKey,
  productId: requiredText(50, "Product"),
  batchNo: optionalText(40),
  receivedDate: isoDay,
  expiryDate: optionalDay,
  quantity: positiveQty,
  notes: optionalText(1000),
});

export async function receiveStock(actor: Actor, input: unknown) {
  assertCan(actor, "product.receive");
  const data = parse(receiptSchema, input);
  const existing = await prisma.productTransaction.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (existing) return { txn: existing, duplicate: true as const };

  const product = await prisma.readyProduct.findUnique({ where: { id: data.productId }, include: { unit: true } });
  if (!product || !product.active) throw new ValidationError("Select an active product.", { productId: "Select an active product" });
  assertUnitPrecision(data.quantity, product.unit);
  if (product.tracksExpiry && !data.expiryDate) throw new ValidationError("Enter the batch expiry date.", { expiryDate: "Required" });
  if (data.expiryDate && data.expiryDate < data.receivedDate)
    throw new ValidationError("Expiry date cannot be before the received date.", { expiryDate: "Before received date" });

  const settings = await readSettings();
  const today = todayInTz(settings.timezone);
  try {
    const txn = await withTransaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ active: boolean; deletedAt: Date | null }[]>`
        SELECT "active", "deletedAt" FROM "ReadyProduct" WHERE "id" = ${product.id} FOR UPDATE`;
      if (!locked?.active || locked.deletedAt)
        throw new ValidationError("Select an active product.", { productId: "Inactive or deleted product" });
      const batchNo = data.batchNo || (await nextNumber(tx, "batch"));
      let batch = await tx.productBatch.findUnique({ where: { productId_batchNo: { productId: product.id, batchNo } } });
      const expiry = product.tracksExpiry && data.expiryDate ? dateOnly(data.expiryDate) : null;
      if (batch) {
        if ((batch.expiryDate?.getTime() ?? null) !== (expiry?.getTime() ?? null)) {
          throw new ValidationError(`Batch ${batchNo} already exists with a different expiry date. Use a new batch number.`, {
            batchNo: "Expiry mismatch",
          });
        }
        await tx.productBatch.update({ where: { id: batch.id }, data: { initialQty: { increment: data.quantity } } });
      } else {
        batch = await tx.productBatch.create({
          data: {
            batchNo,
            productId: product.id,
            receivedDate: dateOnly(data.receivedDate),
            expiryDate: expiry,
            initialQty: data.quantity,
            notes: data.notes,
            createdById: actor.id,
          },
        });
      }
      const txn = await postProductTxn(tx, actor, {
        type: "RECEIPT",
        productId: product.id,
        batchId: batch.id,
        bucket: "SALEABLE",
        unitId: product.unitId,
        quantity: data.quantity,
        reference: batchNo,
        notes: data.notes,
        idempotencyKey: data.idempotencyKey,
      });
      await evaluateLowStock(tx, product.id, today);
      await audit(tx, {
        actorId: actor.id,
        action: "product.receive",
        entityType: "ReadyProduct",
        entityId: product.id,
        summary: `Received ${data.quantity.toString()} ${product.unit.code} of ${product.name} into batch ${batchNo}`,
        details: { txnNo: txn.txnNo, expiryDate: data.expiryDate ?? null },
      });
      return txn;
    });
    return { txn, duplicate: false as const };
  } catch (e) {
    if (isUniqueViolation(e, "idempotencyKey")) {
      return {
        txn: await prisma.productTransaction.findUniqueOrThrow({ where: { idempotencyKey: data.idempotencyKey } }),
        duplicate: true as const,
      };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Adjustments (admin corrections; reason mandatory)
// ---------------------------------------------------------------------------

const BUCKETS = ["SALEABLE", "QUARANTINE", "DAMAGED", "EXPIRED"] as const;

const adjustmentSchema = z.object({
  idempotencyKey,
  productId: requiredText(50, "Product"),
  batchId: requiredText(50, "Batch"),
  bucket: z.enum(BUCKETS),
  quantityDelta: signedQty,
  reason: requiredText(1000, "Reason"),
});

export async function adjustStock(actor: Actor, input: unknown) {
  assertCan(actor, "inventory.adjust");
  const data = parse(adjustmentSchema, input);
  const existing = await prisma.inventoryAdjustment.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (existing) return { adjustment: existing, duplicate: true as const };

  const batch = await prisma.productBatch.findUnique({ where: { id: data.batchId }, include: { product: { include: { unit: true } } } });
  if (!batch || batch.productId !== data.productId)
    throw new ValidationError("Select a batch of this product.", { batchId: "Invalid batch" });
  assertUnitPrecision(data.quantityDelta.abs(), batch.product.unit, "quantityDelta");
  const settings = await readSettings();

  try {
    const adjustment = await withTransaction(async (tx) => {
      const adj = await tx.inventoryAdjustment.create({
        data: {
          adjustmentNo: await nextNumber(tx, "adjustment"),
          productId: batch.productId,
          batchId: batch.id,
          bucket: data.bucket,
          quantityDelta: data.quantityDelta,
          reason: data.reason,
          idempotencyKey: data.idempotencyKey,
          createdById: actor.id,
        },
      });
      await postProductTxn(tx, actor, {
        type: "ADJUSTMENT",
        productId: batch.productId,
        batchId: batch.id,
        bucket: data.bucket,
        unitId: batch.product.unitId,
        quantity: data.quantityDelta,
        adjustmentId: adj.id,
        reference: adj.adjustmentNo,
        notes: data.reason,
      });
      await evaluateLowStock(tx, batch.productId, todayInTz(settings.timezone));
      await audit(tx, {
        actorId: actor.id,
        action: "inventory.adjust",
        entityType: "ReadyProduct",
        entityId: batch.productId,
        summary: `Adjusted ${batch.product.name} batch ${batch.batchNo} (${data.bucket.toLowerCase()}) by ${data.quantityDelta.toString()}: ${data.reason}`,
        details: { adjustmentNo: adj.adjustmentNo },
      });
      return adj;
    });
    return { adjustment, duplicate: false as const };
  } catch (e) {
    if (isUniqueViolation(e, "idempotencyKey")) {
      return {
        adjustment: await prisma.inventoryAdjustment.findUniqueOrThrow({ where: { idempotencyKey: data.idempotencyKey } }),
        duplicate: true as const,
      };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Quarantine disposition (returned goods awaiting inspection)
// ---------------------------------------------------------------------------

const dispositionSchema = z.object({
  idempotencyKey,
  batchId: requiredText(50, "Batch"),
  returnLineId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  toBucket: z.enum(["SALEABLE", "DAMAGED", "EXPIRED"]),
  quantity: positiveQty,
  notes: optionalText(1000),
});

export async function disposeQuarantine(actor: Actor, input: unknown) {
  assertCan(actor, "product.disposition");
  const data = parse(dispositionSchema, input);
  const existing = await prisma.quarantineDisposition.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (existing) return { disposition: existing, duplicate: true as const };

  const batch = await prisma.productBatch.findUnique({ where: { id: data.batchId }, include: { product: { include: { unit: true } } } });
  if (!batch) throw new NotFoundError("Batch");
  assertUnitPrecision(data.quantity, batch.product.unit);
  const settings = await readSettings();
  const today = todayInTz(settings.timezone);
  if (data.toBucket === "SALEABLE" && batch.expiryDate && batch.expiryDate < dateOnly(today)) {
    throw new ValidationError(`Batch ${batch.batchNo} has expired and cannot be released as saleable.`, { toBucket: "Batch expired" });
  }

  try {
    const disposition = await withTransaction(async (tx) => {
      const d = await tx.quarantineDisposition.create({
        data: {
          dispositionNo: await nextNumber(tx, "disposition"),
          returnLineId: data.returnLineId ?? null,
          batchId: batch.id,
          toBucket: data.toBucket,
          quantity: data.quantity,
          notes: data.notes,
          idempotencyKey: data.idempotencyKey,
          createdById: actor.id,
        },
      });
      const common = {
        type: "DISPOSITION" as const,
        productId: batch.productId,
        batchId: batch.id,
        unitId: batch.product.unitId,
        dispositionId: d.id,
        reference: d.dispositionNo,
        notes: data.notes,
      };
      await postProductTxn(tx, actor, { ...common, bucket: "QUARANTINE", quantity: data.quantity.negated() });
      await postProductTxn(tx, actor, { ...common, bucket: data.toBucket, quantity: data.quantity });
      await evaluateLowStock(tx, batch.productId, today);
      await audit(tx, {
        actorId: actor.id,
        action: "quarantine.dispose",
        entityType: "ReadyProduct",
        entityId: batch.productId,
        summary: `Released ${data.quantity.toString()} ${batch.product.unit.code} of ${batch.product.name} (batch ${batch.batchNo}) from quarantine to ${data.toBucket.toLowerCase()}`,
        details: { dispositionNo: d.dispositionNo },
      });
      return d;
    });
    return { disposition, duplicate: false as const };
  } catch (e) {
    if (isUniqueViolation(e, "idempotencyKey")) {
      return {
        disposition: await prisma.quarantineDisposition.findUniqueOrThrow({ where: { idempotencyKey: data.idempotencyKey } }),
        duplicate: true as const,
      };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ProductStockSummary {
  saleable: Prisma.Decimal;
  available: Prisma.Decimal; // saleable and not expired
  expiredSaleable: Prisma.Decimal; // still in saleable bucket but past expiry
  quarantine: Prisma.Decimal;
  damaged: Prisma.Decimal;
  expired: Prisma.Decimal;
}

export async function stockSummaries(productIds: string[], today: string, db: Tx | typeof prisma = prisma) {
  const map = new Map<string, ProductStockSummary>();
  if (productIds.length === 0) return map;
  const rows = await db.$queryRaw<{ productId: string; bucket: StockBucket; isExpired: boolean; qty: Prisma.Decimal }[]>`
    SELECT sb."productId", sb."bucket", (b."expiryDate" IS NOT NULL AND b."expiryDate" < ${today}::date) AS "isExpired", SUM(sb."quantity") AS qty
    FROM "StockBalance" sb JOIN "ProductBatch" b ON b."id" = sb."batchId"
    WHERE sb."productId" = ANY(${productIds}::text[])
    GROUP BY 1, 2, 3`;
  for (const id of productIds) {
    map.set(id, { saleable: dec(0), available: dec(0), expiredSaleable: dec(0), quarantine: dec(0), damaged: dec(0), expired: dec(0) });
  }
  for (const r of rows) {
    const s = map.get(r.productId)!;
    const q = dec(r.qty);
    if (r.bucket === "SALEABLE") {
      s.saleable = s.saleable.plus(q);
      if (r.isExpired) s.expiredSaleable = s.expiredSaleable.plus(q);
      else s.available = s.available.plus(q);
    } else if (r.bucket === "QUARANTINE") s.quarantine = s.quarantine.plus(q);
    else if (r.bucket === "DAMAGED") s.damaged = s.damaged.plus(q);
    else s.expired = s.expired.plus(q);
  }
  return map;
}

/** Re-evaluate low-stock alerts for all products (idempotent; never duplicates). */
export async function refreshLowStockAlerts() {
  const settings = await readSettings();
  const today = todayInTz(settings.timezone);
  const products = await prisma.readyProduct.findMany({ select: { id: true } });
  for (const p of products) {
    await prisma.$transaction((tx) => evaluateLowStock(tx, p.id, today));
  }
}

/** (batch, bucket) balances that differ from their ledger. Should always be empty. */
export async function reconcileProducts() {
  return prisma.$queryRaw<{ productId: string; batchId: string; bucket: StockBucket; cached: Prisma.Decimal; ledger: Prisma.Decimal }[]>`
    WITH ledger AS (
      SELECT "productId", "batchId", "bucket", SUM("quantity") AS qty FROM "ProductTransaction" GROUP BY 1, 2, 3
    )
    SELECT COALESCE(sb."productId", l."productId") AS "productId", COALESCE(sb."batchId", l."batchId") AS "batchId",
           COALESCE(sb."bucket", l."bucket") AS "bucket", COALESCE(sb."quantity", 0) AS cached, COALESCE(l.qty, 0) AS ledger
    FROM "StockBalance" sb FULL OUTER JOIN ledger l ON l."batchId" = sb."batchId" AND l."bucket" = sb."bucket"
    WHERE COALESCE(sb."quantity", 0) <> COALESCE(l.qty, 0)`;
}

export type { Tx };
