import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { adjustStock, createProduct, reconcileProducts, receiveStock, stockSummaries } from "@/server/services/products";
import { expiryStatus } from "@/server/services/inventory-core";
import { dayOffset, dispatch, key, product, receive, resetDb, saleable, seedFixture, today, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
});

describe("product master", () => {
  it("creates opening stock as an auditable ledger transaction", async () => {
    const p = await product(f, { openingQty: "40", openingExpiryDate: dayOffset(200) });
    expect(await saleable(p.id)).toBe(40);
    const txns = await prisma.productTransaction.findMany({ where: { productId: p.id } });
    expect(txns).toHaveLength(1);
    expect(txns[0].type).toBe("OPENING");
  });

  it("enforces unique SKUs", async () => {
    await product(f, { sku: "ROSE-1" });
    await expect(product(f, { sku: "rose-1" })).rejects.toThrow(/SKU is already used/);
  });

  it("only admins can create products", async () => {
    await expect(
      createProduct(f.staff, { name: "X", sku: "X1", unitId: f.pieces.id, lowStockThreshold: 0, expiryAlertDays: 10, tracksExpiry: false }),
    ).rejects.toThrow(/permission/);
  });
});

describe("low-stock alerts", () => {
  it("uses each product's own threshold and opens a single alert", async () => {
    const a = await product(f, { lowStockThreshold: "20" });
    const b = await product(f, { lowStockThreshold: "50" });
    await receive(f, a.id, "30", dayOffset(300));
    await receive(f, b.id, "30", dayOffset(300));

    expect(await prisma.lowStockAlert.count({ where: { productId: a.id, status: "OPEN" } })).toBe(0);
    expect(await prisma.lowStockAlert.count({ where: { productId: b.id, status: "OPEN" } })).toBe(1);

    await dispatch(f, [{ productId: a.id, quantity: "10" }]); // A: 20 <= 20 -> low
    await dispatch(f, [{ productId: a.id, quantity: "1" }]); // still low; no duplicate
    expect(await prisma.lowStockAlert.count({ where: { productId: a.id, status: "OPEN" } })).toBe(1);

    await receive(f, a.id, "100", dayOffset(300));
    expect(await prisma.lowStockAlert.count({ where: { productId: a.id, status: "OPEN" } })).toBe(0);
    // one alert opened at creation (zero stock) and resolved by the first receipt, one from the dispatches
    expect(await prisma.lowStockAlert.count({ where: { productId: a.id, status: "RESOLVED" } })).toBe(2);
  });
});

describe("batches and expiry", () => {
  it("keeps separate expiry dates per batch", async () => {
    const p = await product(f);
    await receive(f, p.id, "10", dayOffset(10), "B-EARLY");
    await receive(f, p.id, "15", dayOffset(90), "B-LATE");
    const batches = await prisma.productBatch.findMany({ where: { productId: p.id }, orderBy: { batchNo: "asc" } });
    expect(batches.map((b) => b.expiryDate?.toISOString().slice(0, 10))).toEqual([dayOffset(10), dayOffset(90)]);
  });

  it("applies each product's own expiry alert period", () => {
    const expiry = new Date(dayOffset(20) + "T00:00:00Z");
    expect(expiryStatus(expiry, today(), 30)).toBe("NEAR_EXPIRY"); // product A: alert 30 days before
    expect(expiryStatus(expiry, today(), 15)).toBe("OK"); // product B: alert 15 days before
    expect(expiryStatus(new Date(dayOffset(-1) + "T00:00:00Z"), today(), 15)).toBe("EXPIRED");
    expect(expiryStatus(new Date(today() + "T00:00:00Z"), today(), 0)).toBe("NEAR_EXPIRY");
    expect(expiryStatus(null, today(), 15)).toBe("NO_EXPIRY");
  });

  it("excludes expired batches from available stock", async () => {
    const p = await product(f);
    await receive(f, p.id, "10", dayOffset(-2), "B-OLD");
    await receive(f, p.id, "5", dayOffset(60), "B-NEW");
    const s = (await stockSummaries([p.id], today())).get(p.id)!;
    expect(Number(s.available)).toBe(5);
    expect(Number(s.expiredSaleable)).toBe(10);
  });

  it("rejects a reused batch number with a different expiry", async () => {
    const p = await product(f);
    await receive(f, p.id, "10", dayOffset(30), "B1");
    await expect(receive(f, p.id, "10", dayOffset(31), "B1")).rejects.toThrow(/different expiry/);
  });

  it("a duplicate receipt submission posts once", async () => {
    const p = await product(f);
    const input = { idempotencyKey: key(), productId: p.id, receivedDate: today(), expiryDate: dayOffset(50), quantity: "7" };
    await Promise.all([receiveStock(f.admin, input), receiveStock(f.admin, input)]);
    expect(await saleable(p.id)).toBe(7);
  });
});

describe("adjustments", () => {
  it("create ledger records with a reason and cannot go negative", async () => {
    const p = await product(f);
    await receive(f, p.id, "10", dayOffset(100), "B1");
    const batch = await prisma.productBatch.findFirstOrThrow({ where: { productId: p.id } });

    await expect(
      adjustStock(f.admin, {
        idempotencyKey: key(),
        productId: p.id,
        batchId: batch.id,
        bucket: "SALEABLE",
        quantityDelta: "-2",
        reason: "",
      }),
    ).rejects.toThrow(/Reason/);
    await adjustStock(f.admin, {
      idempotencyKey: key(),
      productId: p.id,
      batchId: batch.id,
      bucket: "SALEABLE",
      quantityDelta: "-2",
      reason: "Broken in storage",
    });
    expect(await saleable(p.id)).toBe(8);
    const adj = await prisma.inventoryAdjustment.findFirstOrThrow({ include: { transactions: true } });
    expect(adj.transactions).toHaveLength(1);
    expect(adj.reason).toBe("Broken in storage");

    await expect(
      adjustStock(f.admin, {
        idempotencyKey: key(),
        productId: p.id,
        batchId: batch.id,
        bucket: "SALEABLE",
        quantityDelta: "-50",
        reason: "x",
      }),
    ).rejects.toThrow(/Insufficient/);
    await expect(
      adjustStock(f.staff, {
        idempotencyKey: key(),
        productId: p.id,
        batchId: batch.id,
        bucket: "SALEABLE",
        quantityDelta: "1",
        reason: "x",
      }),
    ).rejects.toThrow(/permission/);
    expect(await reconcileProducts()).toHaveLength(0);
  });
});
