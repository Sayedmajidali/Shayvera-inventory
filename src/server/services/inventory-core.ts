import type { Prisma, ProductTxnType, StockBucket } from "@prisma/client";
import type { Tx } from "../db";
import { ValidationError } from "../errors";
import type { Actor } from "../permissions";
import { nextNumber } from "../sequence";
import { dec } from "@/lib/decimal";
import { daysBetween, dateOnlyString } from "@/lib/dates";

export type ExpiryStatus = "EXPIRED" | "NEAR_EXPIRY" | "OK" | "NO_EXPIRY";

export function expiryStatus(expiryDate: Date | null | undefined, today: string, alertDays: number): ExpiryStatus {
  const day = dateOnlyString(expiryDate ?? null);
  if (!day) return "NO_EXPIRY";
  const days = daysBetween(today, day);
  if (days < 0) return "EXPIRED"; // usable through the end of its expiry date
  if (days <= alertDays) return "NEAR_EXPIRY";
  return "OK";
}

/**
 * Post one signed movement to a (batch, bucket) balance and the product ledger.
 * The balance row is created on demand and updated with a guarded statement so
 * it can never go below zero, even under concurrency (CHECK constraint backs it up).
 */
export async function postProductTxn(
  tx: Tx,
  actor: Actor,
  args: {
    type: ProductTxnType;
    productId: string;
    batchId: string;
    bucket: StockBucket;
    unitId: string;
    quantity: Prisma.Decimal;
    storeId?: string | null;
    dispatchId?: string | null;
    returnId?: string | null;
    adjustmentId?: string | null;
    dispositionId?: string | null;
    reversalOfId?: string | null;
    reference?: string | null;
    notes?: string | null;
    idempotencyKey?: string | null;
  },
) {
  if (args.quantity.isZero()) throw new ValidationError("Quantity cannot be zero.");

  await tx.$executeRaw`
    INSERT INTO "StockBalance" ("id", "productId", "batchId", "bucket", "quantity", "updatedAt")
    VALUES (gen_random_uuid()::text, ${args.productId}, ${args.batchId}, ${args.bucket}::"StockBucket", 0, now())
    ON CONFLICT ("batchId", "bucket") DO NOTHING`;

  const updated = await tx.$executeRaw`
    UPDATE "StockBalance" SET "quantity" = "quantity" + ${args.quantity}, "updatedAt" = now()
    WHERE "batchId" = ${args.batchId} AND "bucket" = ${args.bucket}::"StockBucket"
      AND "quantity" + ${args.quantity} >= 0`;
  if (updated !== 1) {
    const bal = await tx.stockBalance.findUnique({
      where: { batchId_bucket: { batchId: args.batchId, bucket: args.bucket } },
      include: { batch: true },
    });
    throw new ValidationError(
      `Insufficient ${args.bucket.toLowerCase()} stock in batch ${bal?.batch.batchNo ?? ""}. Available: ${dec(bal?.quantity).toString()}.`,
    );
  }

  return tx.productTransaction.create({
    data: {
      txnNo: await nextNumber(tx, "productTxn"),
      type: args.type,
      productId: args.productId,
      batchId: args.batchId,
      bucket: args.bucket,
      unitId: args.unitId,
      quantity: args.quantity,
      storeId: args.storeId ?? null,
      dispatchId: args.dispatchId ?? null,
      returnId: args.returnId ?? null,
      adjustmentId: args.adjustmentId ?? null,
      dispositionId: args.dispositionId ?? null,
      reversalOfId: args.reversalOfId ?? null,
      reference: args.reference ?? null,
      notes: args.notes ?? null,
      idempotencyKey: args.idempotencyKey ?? null,
      createdById: actor.id,
    },
  });
}

/** Saleable, non-expired quantity of a product (what can be dispatched). */
export async function availableSaleable(tx: Tx, productId: string, today: string): Promise<Prisma.Decimal> {
  const rows = await tx.$queryRaw<{ qty: Prisma.Decimal | null }[]>`
    SELECT SUM(sb."quantity") AS qty
    FROM "StockBalance" sb JOIN "ProductBatch" b ON b."id" = sb."batchId"
    WHERE sb."productId" = ${productId} AND sb."bucket" = 'SALEABLE'
      AND (b."expiryDate" IS NULL OR b."expiryDate" >= ${today}::date)`;
  return dec(rows[0]?.qty);
}

/**
 * Open or resolve the product's low-stock alert. Called inside every
 * stock-changing transaction; the partial unique index guarantees at most one
 * OPEN alert per product, so repeated evaluation never creates duplicates.
 */
export async function evaluateLowStock(tx: Tx, productId: string, today: string) {
  const product = await tx.readyProduct.findUnique({
    where: { id: productId },
    select: { id: true, lowStockThreshold: true, active: true },
  });
  if (!product) return;
  const available = await availableSaleable(tx, productId, today);
  const threshold = dec(product.lowStockThreshold);
  const isLow = product.active && threshold.gt(0) && available.lte(threshold);
  const open = await tx.lowStockAlert.findFirst({ where: { productId, status: "OPEN" } });

  if (isLow && !open) {
    await tx.$executeRaw`
      INSERT INTO "LowStockAlert" ("id", "productId", "status", "availableQty", "threshold", "triggeredAt")
      VALUES (gen_random_uuid()::text, ${productId}, 'OPEN', ${available}, ${threshold}, now())
      ON CONFLICT DO NOTHING`;
  } else if (isLow && open) {
    await tx.lowStockAlert.update({ where: { id: open.id }, data: { availableQty: available, threshold } });
  } else if (!isLow && open) {
    await tx.lowStockAlert.update({
      where: { id: open.id },
      data: { status: "RESOLVED", resolvedAt: new Date(), availableQty: available },
    });
  }
}
