import { z } from "zod";
import type { Prisma, ReturnCondition, StockBucket } from "@prisma/client";
import { prisma, withTransaction, isUniqueViolation } from "../db";
import { audit } from "../audit";
import { NotFoundError, ValidationError } from "../errors";
import { assertCan, type Actor } from "../permissions";
import { nextNumber } from "../sequence";
import { readSettings } from "../settings";
import { assertUnitPrecision, idempotencyKey, optionalText, parse, positiveQty, requiredText } from "../validation";
import { dateOnly, parseLocalDateTime, todayInTz } from "@/lib/dates";
import { dec } from "@/lib/decimal";
import { createAttachmentRecord, storeFile, type UploadFile } from "./attachments";
import { evaluateLowStock, postProductTxn } from "./inventory-core";

const optionalId = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().optional());

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const dispatchSchema = z.object({
  idempotencyKey,
  dispatchDate: z.string().min(1, "Dispatch date is required"),
  storeId: requiredText(50, "Store"),
  orderRef: optionalText(80),
  invoiceNumber: optionalText(80),
  notes: optionalText(1000),
  lines: z
    .array(z.object({ productId: requiredText(50, "Product"), quantity: positiveQty, batchId: optionalId }))
    .min(1, "Add at least one product line")
    .max(100, "A dispatch can have at most 100 lines"),
});

type LockedBalance = { balanceId: string; batchId: string; batchNo: string; quantity: Prisma.Decimal; expiryDate: Date | null };

export async function createDispatch(actor: Actor, input: unknown, bill?: UploadFile | null) {
  assertCan(actor, "ecom.dispatch");
  const data = parse(dispatchSchema, input);

  const existing = await prisma.dispatch.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (existing) return { dispatch: existing, duplicate: true as const };

  const settings = await readSettings();
  const today = todayInTz(settings.timezone);
  const dispatchDate = parseLocalDateTime(data.dispatchDate, settings.timezone);
  if (!dispatchDate) throw new ValidationError("Enter a valid dispatch date and time.", { dispatchDate: "Invalid date" });
  if (dispatchDate.getTime() > Date.now() + 5 * 60_000)
    throw new ValidationError("Dispatch date cannot be in the future.", { dispatchDate: "In the future" });

  const store = await prisma.store.findUnique({ where: { id: data.storeId } });
  if (!store || !store.active) throw new ValidationError("Select an active store.", { storeId: "Select an active store" });

  const productIds = [...new Set(data.lines.map((l) => l.productId))];
  const products = await prisma.readyProduct.findMany({ where: { id: { in: productIds } }, include: { unit: true } });
  const byId = new Map(products.map((p) => [p.id, p]));
  data.lines.forEach((line, i) => {
    const p = byId.get(line.productId);
    if (!p) throw new ValidationError(`Line ${i + 1}: product not found.`, { [`lines.${i}.productId`]: "Not found" });
    if (!p.active) throw new ValidationError(`Line ${i + 1}: ${p.name} is inactive.`, { [`lines.${i}.productId`]: "Inactive product" });
    assertUnitPrecision(line.quantity, p.unit, `lines.${i}.quantity`);
  });

  const allowExpired = settings.allowExpiredDispatchByAdmin && actor.role === "ADMIN";
  if (bill && bill.size > 0) assertCan(actor, "ecom.bills");
  const prepared = bill && bill.size > 0 ? await storeFile(bill, "DISPATCH_BILL") : null;

  try {
    const dispatch = await withTransaction(async (tx) => {
      // Lock every saleable balance row of the products involved, in a stable
      // order, so concurrent dispatches serialize instead of overselling.
      const locked = await tx.$queryRaw<(LockedBalance & { productId: string; receivedDate: Date })[]>`
        SELECT sb."id" AS "balanceId", sb."productId", sb."batchId", b."batchNo", sb."quantity", b."expiryDate", b."receivedDate"
        FROM "StockBalance" sb JOIN "ProductBatch" b ON b."id" = sb."batchId"
        WHERE sb."productId" = ANY(${productIds}::text[]) AND sb."bucket" = 'SALEABLE'
        ORDER BY sb."id"
        FOR UPDATE OF sb`;

      // FEFO: earliest expiry first; batches without expiry last; then oldest received.
      const pools = new Map<string, LockedBalance[]>();
      for (const row of [...locked].sort(fefo)) {
        const expired = row.expiryDate !== null && row.expiryDate < dateOnly(today);
        if (expired && !allowExpired) continue;
        if (!pools.has(row.productId)) pools.set(row.productId, []);
        pools.get(row.productId)!.push({ ...row, quantity: dec(row.quantity) });
      }

      const dispatch = await tx.dispatch.create({
        data: {
          dispatchNo: await nextNumber(tx, "dispatch"),
          dispatchDate,
          storeId: store.id,
          orderRef: data.orderRef,
          invoiceNumber: data.invoiceNumber,
          notes: data.notes,
          idempotencyKey: data.idempotencyKey,
          createdById: actor.id,
        },
      });

      for (const [i, line] of data.lines.entries()) {
        const product = byId.get(line.productId)!;
        let pool = pools.get(product.id) ?? [];
        if (line.batchId) pool = pool.filter((b) => b.batchId === line.batchId);
        const available = pool.reduce((acc, b) => acc.plus(b.quantity), dec(0));
        if (available.lt(line.quantity)) {
          throw new ValidationError(
            `Line ${i + 1}: insufficient stock for ${product.name}${line.batchId ? " in the selected batch" : ""}. Available (non-expired): ${available.toString()} ${product.unit.code}, requested: ${line.quantity.toString()}.`,
            { [`lines.${i}.quantity`]: `Only ${available.toString()} available` },
          );
        }
        const dLine = await tx.dispatchLine.create({
          data: { dispatchId: dispatch.id, lineNo: i + 1, productId: product.id, quantity: line.quantity },
        });
        let remaining = line.quantity;
        for (const b of pool) {
          if (remaining.lte(0)) break;
          if (b.quantity.lte(0)) continue;
          const take = b.quantity.lt(remaining) ? b.quantity : remaining;
          b.quantity = b.quantity.minus(take);
          remaining = remaining.minus(take);
          await tx.dispatchAllocation.upsert({
            where: { lineId_batchId: { lineId: dLine.id, batchId: b.batchId } },
            create: { lineId: dLine.id, batchId: b.batchId, quantity: take },
            update: { quantity: { increment: take } },
          });
          await postProductTxn(tx, actor, {
            type: "DISPATCH",
            productId: product.id,
            batchId: b.batchId,
            bucket: "SALEABLE",
            unitId: product.unitId,
            quantity: take.negated(),
            storeId: store.id,
            dispatchId: dispatch.id,
            reference: data.orderRef ?? data.invoiceNumber ?? dispatch.dispatchNo,
            notes: data.notes,
          });
        }
      }

      for (const pid of productIds) await evaluateLowStock(tx, pid, today);
      if (prepared) {
        await createAttachmentRecord(tx, actor, "DISPATCH_BILL", prepared, {
          dispatchId: dispatch.id,
          storeId: store.id,
          billNumber: data.invoiceNumber,
        });
      }
      await audit(tx, {
        actorId: actor.id,
        action: "dispatch.create",
        entityType: "Dispatch",
        entityId: dispatch.id,
        summary: `Dispatched ${data.lines.length} line(s) to ${store.name} (${dispatch.dispatchNo})`,
        details: {
          lines: data.lines.map((l) => ({ productId: l.productId, quantity: l.quantity.toString(), batchId: l.batchId ?? null })),
        },
      });
      return dispatch;
    });
    return { dispatch, duplicate: false as const };
  } catch (e) {
    if (isUniqueViolation(e, "idempotencyKey")) {
      return {
        dispatch: await prisma.dispatch.findUniqueOrThrow({ where: { idempotencyKey: data.idempotencyKey } }),
        duplicate: true as const,
      };
    }
    throw e;
  }
}

function fefo(
  a: { expiryDate: Date | null; receivedDate: Date; batchNo: string },
  b: { expiryDate: Date | null; receivedDate: Date; batchNo: string },
) {
  const ae = a.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const be = b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ae !== be) return ae - be;
  if (a.receivedDate.getTime() !== b.receivedDate.getTime()) return a.receivedDate.getTime() - b.receivedDate.getTime();
  return a.batchNo.localeCompare(b.batchNo);
}

/** Reverse an entire dispatch (e.g. entered in error). Only allowed while it has no posted returns. */
export async function reverseDispatch(actor: Actor, input: unknown) {
  assertCan(actor, "inventory.reverse");
  const data = parse(z.object({ dispatchId: requiredText(50), reason: requiredText(1000, "Reason") }), input);
  const settings = await readSettings();
  const today = todayInTz(settings.timezone);
  return withTransaction(async (tx) => {
    const moved = await tx.dispatch.updateMany({
      where: { id: data.dispatchId, status: "POSTED" },
      data: { status: "REVERSED", reversedAt: new Date(), reversedById: actor.id, reversalReason: data.reason },
    });
    if (moved.count !== 1) {
      const d = await tx.dispatch.findUnique({ where: { id: data.dispatchId } });
      throw d ? new ValidationError("This dispatch has already been reversed.") : new NotFoundError("Dispatch");
    }
    const postedReturns = await tx.productReturn.count({ where: { dispatchId: data.dispatchId, status: "POSTED" } });
    if (postedReturns > 0) throw new ValidationError("Reverse the returns recorded against this dispatch first.");

    const dispatch = await tx.dispatch.findUniqueOrThrow({ where: { id: data.dispatchId }, include: { store: true } });
    const txns = await tx.productTransaction.findMany({ where: { dispatchId: dispatch.id, type: "DISPATCH" } });
    for (const t of txns) {
      await postProductTxn(tx, actor, {
        type: "REVERSAL",
        productId: t.productId,
        batchId: t.batchId,
        bucket: t.bucket,
        unitId: t.unitId,
        quantity: dec(t.quantity).negated(),
        storeId: t.storeId,
        dispatchId: dispatch.id,
        reversalOfId: t.id,
        reference: dispatch.dispatchNo,
        notes: data.reason,
      });
    }
    for (const pid of new Set(txns.map((t) => t.productId))) {
      const [net] = await tx.$queryRaw<{ sent: Prisma.Decimal | null; sold: Prisma.Decimal | null }[]>`
        SELECT
          (SELECT -SUM(t."quantity") FROM "ProductTransaction" t
             WHERE t."storeId" = ${dispatch.storeId} AND t."productId" = ${pid}
               AND (t."type" = 'DISPATCH' OR t."type" = 'RETURN' OR (t."type" = 'REVERSAL' AND t."dispatchId" IS NOT NULL))) AS sent,
          (SELECT SUM(s."quantity") FROM "StoreSale" s WHERE s."storeId" = ${dispatch.storeId} AND s."productId" = ${pid}) AS sold`;
      if (dec(net?.sold).gt(dec(net?.sent))) {
        throw new ValidationError("This dispatch cannot be reversed: the store has already reported sales of these goods.");
      }
      await evaluateLowStock(tx, pid, today);
    }
    await audit(tx, {
      actorId: actor.id,
      action: "dispatch.reverse",
      entityType: "Dispatch",
      entityId: dispatch.id,
      summary: `Reversed dispatch ${dispatch.dispatchNo} to ${dispatch.store.name}: ${data.reason}`,
    });
  });
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

const CONDITION_BUCKET: Record<ReturnCondition, StockBucket> = {
  SALEABLE: "SALEABLE",
  DAMAGED: "DAMAGED",
  EXPIRED: "EXPIRED",
  PENDING_INSPECTION: "QUARANTINE",
};

const returnSchema = z.object({
  idempotencyKey,
  returnDate: z.string().min(1, "Return date is required"),
  dispatchId: requiredText(50, "Original dispatch"),
  reason: requiredText(500, "Return reason"),
  notes: optionalText(1000),
  lines: z
    .array(
      z.object({
        dispatchLineId: requiredText(50, "Dispatch line"),
        quantity: positiveQty,
        condition: z.enum(["SALEABLE", "DAMAGED", "EXPIRED", "PENDING_INSPECTION"]),
        notes: optionalText(500),
      }),
    )
    .min(1, "Add at least one returned product"),
});

export async function createReturn(actor: Actor, input: unknown, document?: UploadFile | null) {
  assertCan(actor, "ecom.return");
  const data = parse(returnSchema, input);

  const existing = await prisma.productReturn.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (existing) return { productReturn: existing, duplicate: true as const };

  const settings = await readSettings();
  const today = todayInTz(settings.timezone);
  const returnDate = parseLocalDateTime(data.returnDate, settings.timezone);
  if (!returnDate) throw new ValidationError("Enter a valid return date and time.", { returnDate: "Invalid date" });
  if (returnDate.getTime() > Date.now() + 5 * 60_000)
    throw new ValidationError("Return date cannot be in the future.", { returnDate: "In the future" });

  if (document && document.size > 0) assertCan(actor, "ecom.bills");
  const prepared = document && document.size > 0 ? await storeFile(document, "RETURN_DOCUMENT") : null;

  try {
    const productReturn = await withTransaction(async (tx) => {
      const dispatch = await tx.dispatch.findUnique({ where: { id: data.dispatchId }, include: { store: true } });
      if (!dispatch) throw new ValidationError("Select a valid original dispatch.", { dispatchId: "Not found" });
      if (dispatch.status !== "POSTED")
        throw new ValidationError("Returns cannot be recorded against a reversed dispatch.", { dispatchId: "Dispatch reversed" });
      if (returnDate < dispatch.dispatchDate)
        throw new ValidationError("Return date cannot be before the dispatch date.", { returnDate: "Before dispatch" });

      const lineIds = [...new Set(data.lines.map((l) => l.dispatchLineId))];
      // Lock the dispatch lines so concurrent returns cannot together exceed the dispatched quantity.
      const lockedLines = await tx.$queryRaw<
        { id: string; dispatchId: string; productId: string; quantity: Prisma.Decimal; returnedQty: Prisma.Decimal }[]
      >`
        SELECT "id", "dispatchId", "productId", "quantity", "returnedQty" FROM "DispatchLine"
        WHERE "id" = ANY(${lineIds}::text[]) ORDER BY "id" FOR UPDATE`;
      const lineMap = new Map(lockedLines.map((l) => [l.id, { ...l, remaining: dec(l.quantity).minus(dec(l.returnedQty)) }]));

      const allocations = await tx.$queryRaw<
        {
          id: string;
          lineId: string;
          batchId: string;
          quantity: Prisma.Decimal;
          returnedQty: Prisma.Decimal;
          expiryDate: Date | null;
          batchNo: string;
        }[]
      >`
        SELECT a."id", a."lineId", a."batchId", a."quantity", a."returnedQty", b."expiryDate", b."batchNo"
        FROM "DispatchAllocation" a JOIN "ProductBatch" b ON b."id" = a."batchId"
        WHERE a."lineId" = ANY(${lineIds}::text[]) ORDER BY a."id" FOR UPDATE OF a`;
      const allocRemaining = new Map(allocations.map((a) => [a.id, dec(a.quantity).minus(dec(a.returnedQty))]));

      const products = await tx.readyProduct.findMany({
        where: { id: { in: lockedLines.map((l) => l.productId) } },
        include: { unit: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const pr = await tx.productReturn.create({
        data: {
          returnNo: await nextNumber(tx, "return"),
          returnDate,
          storeId: dispatch.storeId,
          dispatchId: dispatch.id,
          reason: data.reason,
          notes: data.notes,
          idempotencyKey: data.idempotencyKey,
          createdById: actor.id,
        },
      });

      for (const [i, line] of data.lines.entries()) {
        const dl = lineMap.get(line.dispatchLineId);
        if (!dl || dl.dispatchId !== dispatch.id) {
          throw new ValidationError(`Line ${i + 1}: product line does not belong to dispatch ${dispatch.dispatchNo}.`, {
            [`lines.${i}.dispatchLineId`]: "Invalid line",
          });
        }
        const product = productMap.get(dl.productId)!;
        assertUnitPrecision(line.quantity, product.unit, `lines.${i}.quantity`);
        if (line.quantity.gt(dl.remaining)) {
          throw new ValidationError(
            `Line ${i + 1}: cannot return ${line.quantity.toString()} ${product.unit.code} of ${product.name}. Returnable quantity remaining: ${dl.remaining.toString()}.`,
            { [`lines.${i}.quantity`]: `Max ${dl.remaining.toString()}` },
          );
        }
        dl.remaining = dl.remaining.minus(line.quantity);

        const rLine = await tx.productReturnLine.create({
          data: {
            returnId: pr.id,
            dispatchLineId: dl.id,
            productId: dl.productId,
            quantity: line.quantity,
            condition: line.condition,
            notes: line.notes,
          },
        });

        // Map the returned quantity back onto the batches it was dispatched from.
        // Saleable returns can only go back to batches that have not expired.
        const isExpired = (d: Date | null) => d !== null && d < dateOnly(today);
        const candidates = allocations
          .filter((a) => a.lineId === dl.id && allocRemaining.get(a.id)!.gt(0))
          .filter((a) => line.condition !== "SALEABLE" || !isExpired(a.expiryDate))
          .sort((a, b) => (b.expiryDate?.getTime() ?? Infinity) - (a.expiryDate?.getTime() ?? Infinity));
        const capacity = candidates.reduce((acc, a) => acc.plus(allocRemaining.get(a.id)!), dec(0));
        if (capacity.lt(line.quantity)) {
          throw new ValidationError(
            `Line ${i + 1}: ${product.name} was dispatched from batch(es) that have expired. Record the returned goods as Expired or Pending inspection.`,
            { [`lines.${i}.condition`]: "Batch expired" },
          );
        }
        let remaining = line.quantity;
        for (const a of candidates) {
          if (remaining.lte(0)) break;
          const room = allocRemaining.get(a.id)!;
          const take = room.lt(remaining) ? room : remaining;
          allocRemaining.set(a.id, room.minus(take));
          remaining = remaining.minus(take);
          await tx.productReturnAllocation.create({ data: { returnLineId: rLine.id, dispatchAllocationId: a.id, quantity: take } });
          await tx.dispatchAllocation.update({ where: { id: a.id }, data: { returnedQty: { increment: take } } });
          await postProductTxn(tx, actor, {
            type: "RETURN",
            productId: dl.productId,
            batchId: a.batchId,
            bucket: CONDITION_BUCKET[line.condition],
            unitId: product.unitId,
            quantity: take,
            storeId: dispatch.storeId,
            dispatchId: dispatch.id,
            returnId: pr.id,
            reference: dispatch.dispatchNo,
            notes: `${line.condition.replace("_", " ").toLowerCase()}: ${data.reason}`,
          });
        }
        await tx.dispatchLine.update({ where: { id: dl.id }, data: { returnedQty: { increment: line.quantity } } });
      }

      for (const pid of new Set(lockedLines.map((l) => l.productId))) await evaluateLowStock(tx, pid, today);
      if (prepared) {
        await createAttachmentRecord(tx, actor, "RETURN_DOCUMENT", prepared, {
          returnId: pr.id,
          dispatchId: dispatch.id,
          storeId: dispatch.storeId,
        });
      }
      await audit(tx, {
        actorId: actor.id,
        action: "return.create",
        entityType: "ProductReturn",
        entityId: pr.id,
        summary: `Recorded return ${pr.returnNo} from ${dispatch.store.name} against ${dispatch.dispatchNo}`,
        details: {
          lines: data.lines.map((l) => ({ dispatchLineId: l.dispatchLineId, quantity: l.quantity.toString(), condition: l.condition })),
        },
      });
      return pr;
    });
    return { productReturn, duplicate: false as const };
  } catch (e) {
    if (isUniqueViolation(e, "idempotencyKey")) {
      return {
        productReturn: await prisma.productReturn.findUniqueOrThrow({ where: { idempotencyKey: data.idempotencyKey } }),
        duplicate: true as const,
      };
    }
    throw e;
  }
}

export async function reverseReturn(actor: Actor, input: unknown) {
  assertCan(actor, "inventory.reverse");
  const data = parse(z.object({ returnId: requiredText(50), reason: requiredText(1000, "Reason") }), input);
  const settings = await readSettings();
  const today = todayInTz(settings.timezone);
  return withTransaction(async (tx) => {
    const moved = await tx.productReturn.updateMany({
      where: { id: data.returnId, status: "POSTED" },
      data: { status: "REVERSED", reversedAt: new Date(), reversedById: actor.id, reversalReason: data.reason },
    });
    if (moved.count !== 1) {
      const r = await tx.productReturn.findUnique({ where: { id: data.returnId } });
      throw r ? new ValidationError("This return has already been reversed.") : new NotFoundError("Return");
    }
    const pr = await tx.productReturn.findUniqueOrThrow({
      where: { id: data.returnId },
      include: { lines: { include: { allocations: true, dispositions: true } }, store: true },
    });
    if (pr.lines.some((l) => l.dispositions.length > 0)) {
      throw new ValidationError("Quarantined goods from this return have already been dispositioned; post an adjustment instead.");
    }
    const txns = await tx.productTransaction.findMany({ where: { returnId: pr.id, type: "RETURN" } });
    for (const t of txns) {
      await postProductTxn(tx, actor, {
        type: "REVERSAL",
        productId: t.productId,
        batchId: t.batchId,
        bucket: t.bucket,
        unitId: t.unitId,
        quantity: dec(t.quantity).negated(),
        storeId: t.storeId,
        dispatchId: t.dispatchId,
        returnId: pr.id,
        reversalOfId: t.id,
        reference: pr.returnNo,
        notes: data.reason,
      });
    }
    for (const line of pr.lines) {
      await tx.dispatchLine.update({ where: { id: line.dispatchLineId }, data: { returnedQty: { decrement: line.quantity } } });
      for (const a of line.allocations) {
        await tx.dispatchAllocation.update({ where: { id: a.dispatchAllocationId }, data: { returnedQty: { decrement: a.quantity } } });
      }
    }
    for (const pid of new Set(txns.map((t) => t.productId))) await evaluateLowStock(tx, pid, today);
    await audit(tx, {
      actorId: actor.id,
      action: "return.reverse",
      entityType: "ProductReturn",
      entityId: pr.id,
      summary: `Reversed return ${pr.returnNo} from ${pr.store.name}: ${data.reason}`,
    });
  });
}

// ---------------------------------------------------------------------------
// Store-reported sales (no Shayvera stock impact)
// ---------------------------------------------------------------------------

const saleSchema = z.object({
  idempotencyKey,
  saleDate: z.string().min(1, "Sale date is required"),
  storeId: requiredText(50, "Store"),
  productId: requiredText(50, "Product"),
  quantity: positiveQty,
  reference: optionalText(80),
  notes: optionalText(500),
});

export async function recordStoreSale(actor: Actor, input: unknown) {
  assertCan(actor, "ecom.sales");
  const data = parse(saleSchema, input);
  const existing = await prisma.storeSale.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (existing) return { sale: existing, duplicate: true as const };
  const settings = await readSettings();
  const saleDate = parseLocalDateTime(data.saleDate, settings.timezone);
  if (!saleDate) throw new ValidationError("Enter a valid sale date.", { saleDate: "Invalid date" });

  try {
    const sale = await withTransaction(async (tx) => {
      const [store, product] = await Promise.all([
        tx.store.findUnique({ where: { id: data.storeId } }),
        tx.readyProduct.findUnique({ where: { id: data.productId }, include: { unit: true } }),
      ]);
      if (!store) throw new ValidationError("Select a store.", { storeId: "Required" });
      if (!product) throw new ValidationError("Select a product.", { productId: "Required" });
      assertUnitPrecision(data.quantity, product.unit);
      // Serialize sales for the same store+product so the cap below holds under concurrency.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"sale:" + store.id + ":" + product.id}))`;
      const [net] = await tx.$queryRaw<{ sent: Prisma.Decimal | null; sold: Prisma.Decimal | null }[]>`
        SELECT
          (SELECT -SUM(t."quantity") FROM "ProductTransaction" t
             WHERE t."storeId" = ${store.id} AND t."productId" = ${product.id}
               AND (t."type" = 'DISPATCH' OR t."type" = 'RETURN' OR (t."type" = 'REVERSAL' AND t."dispatchId" IS NOT NULL))) AS sent,
          (SELECT SUM(s."quantity") FROM "StoreSale" s WHERE s."storeId" = ${store.id} AND s."productId" = ${product.id}) AS sold`;
      const unsold = dec(net?.sent).minus(dec(net?.sold));
      if (data.quantity.gt(unsold)) {
        throw new ValidationError(
          `Reported sales exceed the net quantity held at ${store.name}. Unsold at store: ${unsold.toString()} ${product.unit.code}.`,
          { quantity: `Max ${unsold.toString()}` },
        );
      }
      const sale = await tx.storeSale.create({
        data: {
          saleNo: await nextNumber(tx, "sale"),
          saleDate,
          storeId: store.id,
          productId: product.id,
          quantity: data.quantity,
          reference: data.reference,
          notes: data.notes,
          idempotencyKey: data.idempotencyKey,
          createdById: actor.id,
        },
      });
      await audit(tx, {
        actorId: actor.id,
        action: "sale.record",
        entityType: "StoreSale",
        entityId: sale.id,
        summary: `Recorded ${data.quantity.toString()} ${product.unit.code} of ${product.name} sold by ${store.name}`,
      });
      return sale;
    });
    return { sale, duplicate: false as const };
  } catch (e) {
    if (isUniqueViolation(e, "idempotencyKey"))
      return {
        sale: await prisma.storeSale.findUniqueOrThrow({ where: { idempotencyKey: data.idempotencyKey } }),
        duplicate: true as const,
      };
    throw e;
  }
}
