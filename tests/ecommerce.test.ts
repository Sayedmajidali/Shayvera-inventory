import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createDispatch, createReturn, recordStoreSale, reverseDispatch, reverseReturn } from "@/server/services/ecommerce";
import { disposeQuarantine, reconcileProducts } from "@/server/services/products";
import { bucket, dayOffset, dispatch, key, nowLocal, product, receive, resetDb, saleable, seedFixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
});

async function stocked(qty = "100", expiry = dayOffset(180)) {
  const p = await product(f, { lowStockThreshold: "0" });
  await receive(f, p.id, qty, expiry, "B1");
  return p;
}

async function returnFor(dispatchId: string, lines: { quantity: string; condition: string; line?: number }[]) {
  const d = await prisma.dispatch.findUniqueOrThrow({ where: { id: dispatchId }, include: { lines: { orderBy: { lineNo: "asc" } } } });
  return createReturn(f.staff, {
    idempotencyKey: key(),
    returnDate: nowLocal(),
    dispatchId,
    reason: "Customer return",
    lines: lines.map((l) => ({ dispatchLineId: d.lines[l.line ?? 0].id, quantity: l.quantity, condition: l.condition })),
  });
}

describe("dispatch", () => {
  it("deducts stock and records a stock-out transaction per batch", async () => {
    const p = await stocked();
    const { dispatch: d } = await dispatch(f, [{ productId: p.id, quantity: "30" }]);
    expect(await saleable(p.id)).toBe(70);
    const txns = await prisma.productTransaction.findMany({ where: { dispatchId: d.id } });
    expect(txns).toHaveLength(1);
    expect(Number(txns[0].quantity)).toBe(-30);
    expect(txns[0].storeId).toBe(f.storeId);
  });

  it("rejects excessive or invalid dispatches without partial posting", async () => {
    const a = await stocked("10");
    const b = await stocked("10");
    await expect(
      dispatch(f, [
        { productId: a.id, quantity: "5" },
        { productId: b.id, quantity: "11" },
      ]),
    ).rejects.toThrow(/insufficient stock/);
    expect(await saleable(a.id)).toBe(10); // line 1 not posted
    expect(await prisma.dispatch.count()).toBe(0);
    await expect(dispatch(f, [{ productId: a.id, quantity: "0" }])).rejects.toThrow(/greater than zero/);
  });

  it("refuses inactive products", async () => {
    const p = await stocked();
    await prisma.readyProduct.update({ where: { id: p.id }, data: { active: false } });
    await expect(dispatch(f, [{ productId: p.id, quantity: "1" }])).rejects.toThrow(/inactive/);
  });

  it("allocates first-expiry-first-out and skips expired batches", async () => {
    const p = await product(f, { lowStockThreshold: "0" });
    await receive(f, p.id, "5", dayOffset(-1), "EXPIRED");
    await receive(f, p.id, "10", dayOffset(90), "LATE");
    await receive(f, p.id, "10", dayOffset(20), "EARLY");
    const { dispatch: d } = await dispatch(f, [{ productId: p.id, quantity: "15" }]);
    const allocs = await prisma.dispatchAllocation.findMany({ where: { line: { dispatchId: d.id } }, include: { batch: true } });
    const byBatch = Object.fromEntries(allocs.map((a) => [a.batch.batchNo, Number(a.quantity)]));
    expect(byBatch).toEqual({ EARLY: 10, LATE: 5 });
    await expect(dispatch(f, [{ productId: p.id, quantity: "6" }])).rejects.toThrow(/Available \(non-expired\): 5/);
  });

  it("concurrent dispatches cannot oversell", async () => {
    const p = await stocked("10");
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => dispatch(f, [{ productId: p.id, quantity: "3" }])));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(3);
    expect(await saleable(p.id)).toBe(1);
    expect(await reconcileProducts()).toHaveLength(0);
  });

  it("a duplicate submission deducts stock once", async () => {
    const p = await stocked("10");
    const input = { idempotencyKey: key(), dispatchDate: nowLocal(), storeId: f.storeId, lines: [{ productId: p.id, quantity: "4" }] };
    const [a, b] = await Promise.all([createDispatch(f.staff, input), createDispatch(f.staff, input)]);
    expect(a.dispatch.id).toBe(b.dispatch.id);
    expect(await saleable(p.id)).toBe(6);
  });

  it("reversal restores stock and preserves the original transactions", async () => {
    const p = await stocked("10");
    const { dispatch: d } = await dispatch(f, [{ productId: p.id, quantity: "4" }]);
    await expect(reverseDispatch(f.staff, { dispatchId: d.id, reason: "x" })).rejects.toThrow(/permission/);
    await reverseDispatch(f.admin, { dispatchId: d.id, reason: "Entered twice" });
    expect(await saleable(p.id)).toBe(10);
    const txns = await prisma.productTransaction.findMany({ where: { dispatchId: d.id }, orderBy: { createdAt: "asc" } });
    expect(txns.map((t) => t.type)).toEqual(["DISPATCH", "REVERSAL"]);
    expect(txns[1].reversalOfId).toBe(txns[0].id);
    await expect(reverseDispatch(f.admin, { dispatchId: d.id, reason: "again" })).rejects.toThrow(/already been reversed/);
  });
});

describe("returns", () => {
  it("saleable returns restore saleable stock", async () => {
    const p = await stocked("10");
    const { dispatch: d } = await dispatch(f, [{ productId: p.id, quantity: "6" }]);
    await returnFor(d.id, [{ quantity: "2", condition: "SALEABLE" }]);
    expect(await saleable(p.id)).toBe(6);
  });

  it("damaged, expired and pending returns never increase saleable stock", async () => {
    const p = await stocked("10");
    const { dispatch: d } = await dispatch(f, [{ productId: p.id, quantity: "9" }]);
    await returnFor(d.id, [
      { quantity: "2", condition: "DAMAGED" },
      { quantity: "3", condition: "EXPIRED" },
      { quantity: "1", condition: "PENDING_INSPECTION" },
    ]);
    expect(await saleable(p.id)).toBe(1);
    expect(await bucket(p.id, "DAMAGED")).toBe(2);
    expect(await bucket(p.id, "EXPIRED")).toBe(3);
    expect(await bucket(p.id, "QUARANTINE")).toBe(1);

    // authorized disposition moves quarantine stock
    const batch = await prisma.productBatch.findFirstOrThrow({ where: { productId: p.id } });
    await expect(
      disposeQuarantine(f.staff, { idempotencyKey: key(), batchId: batch.id, toBucket: "SALEABLE", quantity: "1" }),
    ).rejects.toThrow(/permission/);
    await disposeQuarantine(f.admin, { idempotencyKey: key(), batchId: batch.id, toBucket: "SALEABLE", quantity: "1" });
    expect(await saleable(p.id)).toBe(2);
    expect(await bucket(p.id, "QUARANTINE")).toBe(0);
  });

  it("cumulative returns cannot exceed the dispatched quantity, even concurrently", async () => {
    const p = await stocked("10");
    const { dispatch: d } = await dispatch(f, [{ productId: p.id, quantity: "5" }]);
    await returnFor(d.id, [{ quantity: "3", condition: "SALEABLE" }]);
    await expect(returnFor(d.id, [{ quantity: "3", condition: "SALEABLE" }])).rejects.toThrow(/remaining: 2/);

    const results = await Promise.allSettled([
      returnFor(d.id, [{ quantity: "2", condition: "DAMAGED" }]),
      returnFor(d.id, [{ quantity: "2", condition: "DAMAGED" }]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const line = await prisma.dispatchLine.findFirstOrThrow({ where: { dispatchId: d.id } });
    expect(Number(line.returnedQty)).toBe(5);
  });

  it("refuses returns against a reversed dispatch and saleable returns of expired batches", async () => {
    const p = await stocked("10");
    const { dispatch: d } = await dispatch(f, [{ productId: p.id, quantity: "5" }]);
    await reverseDispatch(f.admin, { dispatchId: d.id, reason: "error" });
    await expect(returnFor(d.id, [{ quantity: "1", condition: "SALEABLE" }])).rejects.toThrow(/reversed dispatch/);

    // a batch that expired after dispatch can only come back as expired / pending
    const q = await stocked("10", dayOffset(5));
    const { dispatch: d2 } = await dispatch(f, [{ productId: q.id, quantity: "2" }]);
    await prisma.$executeRaw`UPDATE "ProductBatch" SET "expiryDate" = ${new Date(dayOffset(-1) + "T00:00:00Z")} WHERE "productId" = ${q.id}`;
    await expect(returnFor(d2.id, [{ quantity: "1", condition: "SALEABLE" }])).rejects.toThrow(/expired/);
    await returnFor(d2.id, [{ quantity: "1", condition: "EXPIRED" }]);
  });

  it("return reversal restores the returnable quantity", async () => {
    const p = await stocked("10");
    const { dispatch: d } = await dispatch(f, [{ productId: p.id, quantity: "5" }]);
    const { productReturn } = await returnFor(d.id, [{ quantity: "5", condition: "SALEABLE" }]);
    await reverseReturn(f.admin, { returnId: productReturn.id, reason: "Wrong dispatch" });
    expect(await saleable(p.id)).toBe(5);
    await returnFor(d.id, [{ quantity: "5", condition: "DAMAGED" }]);
    expect(await reconcileProducts()).toHaveLength(0);
  });
});

describe("store sales", () => {
  it("cannot report more sales than the net quantity sent to the store", async () => {
    const p = await stocked("10");
    await dispatch(f, [{ productId: p.id, quantity: "5" }]);
    const sale = (q: string, storeId = f.storeId) =>
      recordStoreSale(
        { ...f.staff, permissions: ["ecom.sales"] },
        { idempotencyKey: key(), saleDate: nowLocal(), storeId, productId: p.id, quantity: q },
      );
    await sale("3");
    await expect(sale("3")).rejects.toThrow(/Unsold at store: 2/);
    await expect(sale("1", f.store2Id)).rejects.toThrow(/Unsold at store: 0/);
    expect(await saleable(p.id)).toBe(5); // sales do not move Shayvera stock
  });
});
