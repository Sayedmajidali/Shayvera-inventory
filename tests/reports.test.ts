import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { REPORTS, getReport } from "@/server/reports";
import { cellText, type RunContext } from "@/server/reports/types";
import { ecomPeriodTotals } from "@/server/reports/ecommerce";
import { approveEntry, rejectEntry } from "@/server/services/raw-materials";
import { createDispatch, createReturn, recordStoreSale } from "@/server/services/ecommerce";
import { getDashboard } from "@/server/services/dashboard";
import { dayOffset, dispatch, key, nowLocal, product, rawEntry, receive, resetDb, seedFixture, today, TZ, type Fixture } from "./helpers";

let f: Fixture;
let productA: string;
let productB: string;

const ctx = (over: Partial<RunContext> = {}): RunContext => ({
  tz: TZ,
  today: today(),
  dateFormat: "dd MMM yyyy",
  page: { skip: 0, take: 50 },
  dir: "desc",
  ...over,
});

beforeAll(async () => {
  await resetDb();
  f = await seedFixture();
  const e1 = await rawEntry(f, { quantity: "10" });
  const e2 = await rawEntry(f, { quantity: "4", materialName: "Cocoa Butter" });
  await rawEntry(f, { quantity: "7" });
  await approveEntry(f.admin, { entryId: e1.id });
  await rejectEntry(f.admin, { entryId: e2.id, rejectionReason: "Wet" });

  productA = (await product(f, { name: "Alpha Serum", lowStockThreshold: "30" })).id;
  productB = (await product(f, { name: "Beta Cream", lowStockThreshold: "5" })).id;
  await receive(f, productA, "50", dayOffset(10));
  await receive(f, productB, "30", dayOffset(200));

  const d1 = (
    await dispatch(
      f,
      [
        { productId: productA, quantity: "12" },
        { productId: productB, quantity: "5" },
      ],
      f.storeId,
    )
  ).dispatch;
  await dispatch(f, [{ productId: productA, quantity: "8" }], f.store2Id);
  const line = await prisma.dispatchLine.findFirstOrThrow({ where: { dispatchId: d1.id, productId: productA } });
  await createReturn(f.staff, {
    idempotencyKey: key(),
    returnDate: nowLocal(),
    dispatchId: d1.id,
    reason: "Damaged in transit",
    lines: [{ dispatchLineId: line.id, quantity: "2", condition: "DAMAGED" }],
  });
  await recordStoreSale(
    { ...f.staff, permissions: ["ecom.sales"] },
    { idempotencyKey: key(), saleDate: nowLocal(), storeId: f.storeId, productId: productA, quantity: "4" },
  );
});

describe("reports", () => {
  it("every report runs with and without filters, and for CSV (no paging)", async () => {
    for (const def of REPORTS) {
      const res = await def.run({}, ctx());
      expect(res.total, def.key).toBeGreaterThanOrEqual(0);
      const filtered = await def.run(
        { from: dayOffset(-1), to: today(), storeId: f.storeId, productId: productA, q: "a", sku: "SKU", ref: "DSP" },
        ctx({ dir: "asc" }),
      );
      expect(filtered.rows.length, def.key).toBeLessThanOrEqual(50);
      for (const col of def.columns.filter((c) => c.sortable)) {
        await def.run({}, ctx({ sort: col.key }));
      }
      await def.run({}, ctx({ page: null }));
    }
  });

  it("store-wise and date-wise filters work together", async () => {
    const all = await ecomPeriodTotals({ from: today(), to: today() }, ctx());
    const pcs = all.byUnit.find((u) => u.unit === "pieces")!;
    expect(Number(pcs.dispatched)).toBe(25);
    expect(Number(pcs.returned)).toBe(2);
    expect(Number(pcs.net)).toBe(23);
    expect(all.dispatchDocs + all.returnDocs).toBe(3);

    const store1 = await ecomPeriodTotals({ from: today(), to: today(), storeId: f.storeId }, ctx());
    expect(Number(store1.byUnit[0].dispatched)).toBe(17);
    expect(Number(store1.byUnit[0].net)).toBe(15);

    const yesterday = await ecomPeriodTotals({ from: dayOffset(-5), to: dayOffset(-1) }, ctx());
    expect(yesterday.byUnit).toHaveLength(0);
  });

  it("store-wise net movement separates movement from reported sales", async () => {
    const res = await getReport("ec-net-movement")!.run({ storeId: f.storeId }, ctx());
    expect(res.rows).toHaveLength(1);
    expect(cellText(res.rows[0].dispatched)).toBe("17");
    expect(cellText(res.rows[0].returned)).toBe("2");
    expect(cellText(res.rows[0].net)).toBe("15");
    expect(cellText(res.rows[0].sold)).toBe("4");
  });

  it("raw material reports reflect inspection status", async () => {
    const pending = await getReport("rm-pending")!.run({}, ctx());
    const rejected = await getReport("rm-rejected")!.run({}, ctx());
    const stock = await getReport("rm-stock")!.run({ q: "shea" }, ctx());
    expect(pending.total).toBe(1);
    expect(rejected.total).toBe(1);
    expect(cellText(stock.rows[0].balance)).toBe("10");
    expect(cellText(stock.rows[0].pending)).toBe("7");
  });

  it("low-stock and reconciliation reports agree with the database", async () => {
    const low = await getReport("pr-low-stock")!.run({}, ctx());
    expect(low.rows.map((r) => cellText(r.name))).toEqual(["Alpha Serum"]); // 50 - 12 - 8 = 30 <= 30; the damaged return does not restock
    const rec = await getReport("ec-reconciliation")!.run({}, ctx());
    expect(rec.rows.every((r) => cellText(r.status) === "Reconciled")).toBe(true);
  });
});

describe("business-day boundaries", () => {
  it("counts a dispatch made just after midnight in that business day", async () => {
    // 00:30 in the business timezone is the previous UTC day for zones ahead of UTC.
    const p = await product(f, { name: "Midnight Balm", lowStockThreshold: "0" });
    await receive(f, p.id, "10", dayOffset(200));
    const day = dayOffset(-1);
    await createDispatch(f.staff, {
      idempotencyKey: key(),
      dispatchDate: `${day}T00:30`,
      storeId: f.store2Id,
      lines: [{ productId: p.id, quantity: "3" }],
    });

    const totals = await ecomPeriodTotals({ from: day, to: day, productId: p.id }, ctx());
    expect(Number(totals.byUnit[0]?.dispatched ?? 0)).toBe(3);
    const before = await ecomPeriodTotals({ from: dayOffset(-2), to: dayOffset(-2), productId: p.id }, ctx());
    expect(before.byUnit).toHaveLength(0);

    const dash = await getDashboard({ from: day, to: day, tz: TZ, today: today(), dateFormat: "dd MMM yyyy" });
    expect(dash.dailyChart).toEqual([{ day, dispatched: 3, returned: 0 }]);
  });
});
