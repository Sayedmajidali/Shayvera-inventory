import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  approveEntry,
  deleteRawMaterialEntry,
  rejectEntry,
  restoreRawMaterialEntry,
  reverseInspection,
  updateRawMaterialEntry,
} from "@/server/services/raw-materials";
import {
  adjustStock,
  batchDeletionPreview,
  deleteBatch,
  deleteProduct,
  deletionPreview,
  receiveStock,
  restoreProduct,
  stockSummaries,
  updateBatch,
  updateProduct,
} from "@/server/services/products";
import { createReturn } from "@/server/services/ecommerce";
import { getReport } from "@/server/reports";
import { cellText, type RunContext } from "@/server/reports/types";
import { getDashboard } from "@/server/services/dashboard";
import { toLocalDateTimeInput } from "@/lib/dates";
import { dayOffset, dispatch, key, nowLocal, product, rawEntry, receive, resetDb, seedFixture, today, TZ, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
});

const ctx = (actor = f.admin): RunContext => ({
  tz: TZ,
  today: today(),
  dateFormat: "dd MMM yyyy",
  page: { skip: 0, take: 50 },
  dir: "desc",
  actor,
});
const editor = () => ({ ...f.staff, permissions: [...f.staff.permissions, "rm.entry.edit", "rm.entry.delete"] });

function editInput(entryId: string, over: Record<string, unknown> = {}) {
  return {
    entryId,
    entryDate: nowLocal(),
    materialName: "Shea Butter",
    supplierId: f.supplierId,
    quantity: "25.5",
    unitId: f.kg.id,
    invoiceNumber: "INV-100",
    reason: "Typo on the delivery note",
    ...over,
  };
}

describe("editing raw material entries", () => {
  it("updates a pending entry and records every changed field with the reason", async () => {
    const entry = await rawEntry(f, { quantity: "25.5" });
    const res = await updateRawMaterialEntry(
      editor(),
      editInput(entry.id, { entryDate: toLocalDateTimeInput(entry.entryDate, TZ), quantity: "30", invoiceNumber: "INV-101" }),
    );
    expect(res.changes.map((c) => c.field).sort()).toEqual(["invoiceNumber", "quantity"]);
    expect(res.changes.map((c) => c.field)).toEqual(expect.arrayContaining(["quantity", "invoiceNumber"]));

    const updated = await prisma.rawMaterialEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(Number(updated.quantity)).toBe(30);
    expect(updated.invoiceNumber).toBe("INV-101");

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "raw_entry.update", entityId: entry.id } });
    const details = log.details as { changes: { field: string; from: string; to: string }[]; reason: string };
    expect(details.reason).toBe("Typo on the delivery note");
    expect(details.changes.find((c) => c.field === "quantity")).toMatchObject({ from: "25.5", to: "30" });
    expect(log.actorId).toBe(f.staff.id);
  });

  it("requires a reason, the permission, and an actual change", async () => {
    const entry = await rawEntry(f);
    await expect(updateRawMaterialEntry(editor(), editInput(entry.id, { reason: "" }))).rejects.toThrow(/Reason for the change/);
    await expect(updateRawMaterialEntry(f.staff, editInput(entry.id))).rejects.toThrow(/permission/);
    await expect(
      updateRawMaterialEntry(editor(), editInput(entry.id, { entryDate: toLocalDateTimeInput(entry.entryDate, TZ) })),
    ).rejects.toThrow(/Nothing was changed/);
  });

  it("cannot edit an inspected entry", async () => {
    const entry = await rawEntry(f);
    await approveEntry(f.admin, { entryId: entry.id });
    await expect(updateRawMaterialEntry(f.admin, editInput(entry.id, { quantity: "1" }))).rejects.toThrow(
      /Only entries pending inspection/,
    );
  });

  it("can edit again after an administrator reverses the decision", async () => {
    const entry = await rawEntry(f, { quantity: "10" });
    const { inspection } = await approveEntry(f.admin, { entryId: entry.id });
    await reverseInspection(f.admin, { inspectionId: inspection.id, reason: "Wrong quantity" });
    await updateRawMaterialEntry(f.admin, editInput(entry.id, { quantity: "8" }));
    await approveEntry(f.admin, { entryId: entry.id });
    const material = await prisma.rawMaterial.findUniqueOrThrow({ where: { id: entry.rawMaterialId } });
    expect(Number(material.currentBalance)).toBe(8);
  });
});

describe("deleting raw material entries", () => {
  it("soft-deletes a pending entry, keeps it on record and hides it everywhere", async () => {
    const keep = await rawEntry(f, { quantity: "5" });
    const gone = await rawEntry(f, { quantity: "7" });
    await expect(deleteRawMaterialEntry(editor(), { entryId: gone.id, reason: "" })).rejects.toThrow(/Reason for deleting/);
    await deleteRawMaterialEntry(editor(), { entryId: gone.id, reason: "Duplicate of RM-000001" });

    const row = await prisma.rawMaterialEntry.findUniqueOrThrow({ where: { id: gone.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deleteReason).toBe("Duplicate of RM-000001");

    // hidden from lists, pending counts and stock figures, visible under the Deleted filter
    const list = await getReport("rm-entries")!.run({}, ctx());
    expect(list.rows.map((r) => cellText(r.entryNo))).toEqual([keep.entryNo]);
    const deleted = await getReport("rm-entries")!.run({ status: "DELETED" }, ctx());
    expect(deleted.rows.map((r) => cellText(r.entryNo))).toEqual([gone.entryNo]);
    expect((await getReport("rm-pending")!.run({}, ctx())).total).toBe(1);
    const stock = await getReport("rm-stock")!.run({}, ctx());
    expect(cellText(stock.rows[0].pending)).toBe("5");
    const dash = await getDashboard({ from: dayOffset(-1), to: today(), tz: TZ, today: today(), dateFormat: "dd MMM yyyy" });
    expect(dash.snapshot.pendingInspection).toBe(1);

    // a deleted entry can never be inspected or edited
    await expect(approveEntry(f.admin, { entryId: gone.id })).rejects.toThrow(/deleted/);
    await expect(updateRawMaterialEntry(f.admin, editInput(gone.id))).rejects.toThrow(/deleted/);
    expect(await prisma.auditLog.count({ where: { action: "raw_entry.delete", entityId: gone.id } })).toBe(1);
  });

  it("refuses approved or rejected entries and staff without permission", async () => {
    const a = await rawEntry(f);
    const r = await rawEntry(f);
    const p = await rawEntry(f);
    await approveEntry(f.admin, { entryId: a.id });
    await rejectEntry(f.admin, { entryId: r.id, rejectionReason: "Wet" });
    await expect(deleteRawMaterialEntry(f.admin, { entryId: a.id, reason: "x" })).rejects.toThrow(/Approved entries cannot be deleted/);
    await expect(deleteRawMaterialEntry(f.admin, { entryId: r.id, reason: "x" })).rejects.toThrow(/Rejected entries stay on record/);
    await expect(deleteRawMaterialEntry(f.staff, { entryId: p.id, reason: "x" })).rejects.toThrow(/permission/);
  });

  it("restore puts the entry back in the inspection queue", async () => {
    const e = await rawEntry(f);
    await deleteRawMaterialEntry(f.admin, { entryId: e.id, reason: "Mistake" });
    await restoreRawMaterialEntry(f.admin, { entryId: e.id, reason: "Deleted the wrong one" });
    await approveEntry(f.admin, { entryId: e.id });
    expect((await prisma.rawMaterialEntry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("APPROVED");
  });

  it("the database refuses a delete without who and why", async () => {
    const e = await rawEntry(f);
    await expect(prisma.rawMaterialEntry.update({ where: { id: e.id }, data: { deletedAt: new Date() } })).rejects.toThrow(
      /raw_entry_delete_complete/,
    );
  });
});

describe("editing and deleting products", () => {
  it("records field-level changes on edit", async () => {
    const p = await product(f, { lowStockThreshold: "10" });
    await updateProduct(f.admin, p.id, {
      name: "Rose Face Serum 30ml",
      sku: p.sku,
      unitId: f.pieces.id,
      lowStockThreshold: "25",
      expiryAlertDays: 45,
      tracksExpiry: true,
      changeReason: "New reorder policy",
    });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "product.update", entityId: p.id } });
    const d = log.details as { changes: { field: string; from: string; to: string }[]; reason: string };
    expect(d.reason).toBe("New reorder policy");
    expect(d.changes.map((c) => c.field).sort()).toEqual(["expiryAlertDays", "lowStockThreshold", "name"]);
    expect(d.changes.find((c) => c.field === "lowStockThreshold")).toMatchObject({ from: "10", to: "25" });
  });

  it("deletes only when no stock remains, keeps history and blocks further use", async () => {
    const p = await product(f, { lowStockThreshold: "0" });
    await receive(f, p.id, "5", dayOffset(100), "B1");
    await expect(deleteProduct(f.admin, { productId: p.id, reason: "Discontinued" })).rejects.toThrow(
      /still has stock \(5 pieces saleable\)/,
    );

    const batch = await prisma.productBatch.findFirstOrThrow({ where: { productId: p.id } });
    await adjustStock(f.admin, {
      idempotencyKey: key(),
      productId: p.id,
      batchId: batch.id,
      bucket: "SALEABLE",
      quantityDelta: "-5",
      reason: "Written off",
    });
    await expect(deleteProduct(f.staff, { productId: p.id, reason: "x" })).rejects.toThrow(/permission/);
    await deleteProduct(f.admin, { productId: p.id, reason: "Discontinued" });

    const row = await prisma.readyProduct.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.active).toBe(false);
    expect(await prisma.productTransaction.count({ where: { productId: p.id } })).toBe(2); // history kept

    expect((await getReport("pr-master")!.run({}, ctx())).total).toBe(0);
    expect((await getReport("pr-master")!.run({ status: "DELETED" }, ctx())).total).toBe(1);
    expect((await getReport("pr-stock")!.run({}, ctx())).total).toBe(0);

    await expect(
      updateProduct(f.admin, p.id, {
        name: "X",
        sku: p.sku,
        unitId: f.pieces.id,
        lowStockThreshold: "0",
        expiryAlertDays: 1,
        tracksExpiry: true,
      }),
    ).rejects.toThrow(/Deleted products cannot be edited/);
    await expect(
      receiveStock(f.admin, { idempotencyKey: key(), productId: p.id, receivedDate: today(), expiryDate: dayOffset(30), quantity: "1" }),
    ).rejects.toThrow(/active product/);
    await expect(dispatch(f, [{ productId: p.id, quantity: "1" }])).rejects.toThrow(/inactive/);

    await restoreProduct(f.admin, { productId: p.id, reason: "Back in the range" });
    expect((await prisma.readyProduct.findUniqueOrThrow({ where: { id: p.id } })).active).toBe(true);
  });

  it("blocks returns against a deleted product until it is restored", async () => {
    const p = await product(f, { lowStockThreshold: "0" });
    await receive(f, p.id, "5", dayOffset(100), "B1");
    const { dispatch: d } = await dispatch(f, [{ productId: p.id, quantity: "5" }]);
    await deleteProduct(f.admin, { productId: p.id, reason: "Discontinued" });
    const line = await prisma.dispatchLine.findFirstOrThrow({ where: { dispatchId: d.id } });
    const ret = () =>
      createReturn(f.staff, {
        idempotencyKey: key(),
        returnDate: nowLocal(),
        dispatchId: d.id,
        reason: "Customer return",
        lines: [{ dispatchLineId: line.id, quantity: "1", condition: "SALEABLE" }],
      });
    await expect(ret()).rejects.toThrow(/has been deleted/);
    await restoreProduct(f.admin, { productId: p.id, reason: "Return arrived" });
    await ret();
  });
});

describe("deleting a product that still has stock", () => {
  it("writes the stock off when confirmed, frees the SKU, and restore puts it back", async () => {
    const p = await product(f, { lowStockThreshold: "0", sku: "ROSE-30", barcode: "8901234567890" });
    await receive(f, p.id, "5", dayOffset(100), "B1");
    await receive(f, p.id, "3", dayOffset(200), "B2");

    const preview = await deletionPreview(f.admin, p.id);
    expect(preview.holdings.map((h) => `${h.batchNo}:${h.bucket}:${h.qty}`).sort()).toEqual(["B1:SALEABLE:5", "B2:SALEABLE:3"]);

    const res = await deleteProduct(f.admin, { productId: p.id, reason: "Entered by mistake", writeOffStock: "true" });
    expect(res.writtenOff).toBe(2);
    expect(Number((await prisma.stockBalance.aggregate({ where: { productId: p.id }, _sum: { quantity: true } }))._sum.quantity)).toBe(0);
    const adjustments = await prisma.inventoryAdjustment.findMany({ where: { productId: p.id } });
    expect(adjustments.map((a) => Number(a.quantityDelta)).sort((a, b) => a - b)).toEqual([-5, -3]);
    expect(adjustments[0].reason).toMatch(/Written off on product deletion: Entered by mistake/);
    expect(await prisma.productTransaction.count({ where: { productId: p.id } })).toBe(4); // 2 receipts + 2 write-offs

    const row = await prisma.readyProduct.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.sku).not.toBe("ROSE-30");
    expect(row.retiredSku).toBe("ROSE-30");
    expect(row.barcode).toBeNull();
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "product.delete", entityId: p.id } });
    expect((log.details as { writtenOff: unknown[] }).writtenOff).toHaveLength(2);

    // The SKU and barcode can be used for a corrected product straight away.
    const again = await product(f, { lowStockThreshold: "0", sku: "ROSE-30", barcode: "8901234567890" });
    await expect(restoreProduct(f.admin, { productId: p.id, reason: "Oops" })).rejects.toThrow(/SKU ROSE-30 is now used by/);
    await updateProduct(f.admin, again.id, {
      name: again.name,
      sku: "ROSE-30-B",
      unitId: f.pieces.id,
      lowStockThreshold: "0",
      expiryAlertDays: 30,
      tracksExpiry: true,
      barcode: "8901234567890",
    });
    await restoreProduct(f.admin, { productId: p.id, reason: "Oops" });
    const restored = await prisma.readyProduct.findUniqueOrThrow({ where: { id: p.id } });
    expect(restored).toMatchObject({ sku: "ROSE-30", retiredSku: null, barcode: null, active: true, deletedAt: null });
  });
});

describe("editing and deleting batches", () => {
  async function batchOf(productId: string, batchNo: string) {
    return prisma.productBatch.findFirstOrThrow({ where: { productId, batchNo } });
  }

  it("corrects the batch number, received date and expiry date with a reason", async () => {
    const p = await product(f, { lowStockThreshold: "0" });
    await receive(f, p.id, "5", dayOffset(100), "B1");
    const b = await batchOf(p.id, "B1");

    await updateBatch(f.admin, { batchId: b.id, batchNo: "B1-A", receivedDate: dayOffset(-10), expiryDate: dayOffset(-1), reason: "Typo" });
    const row = await prisma.productBatch.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.batchNo).toBe("B1-A");
    // The new expiry is in the past, so the stock is no longer available.
    expect((await stockSummaries([p.id], today())).get(p.id)!.available.toNumber()).toBe(0);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "batch.update", entityId: p.id } });
    const d = log.details as { changes: { field: string; from: string; to: string }[]; reason: string };
    expect(d.reason).toBe("Typo");
    expect(d.changes.map((c) => c.field).sort()).toEqual(["batchNo", "expiryDate", "receivedDate"]);
    expect(d.changes.find((c) => c.field === "expiryDate")).toMatchObject({ from: dayOffset(100), to: dayOffset(-1) });
  });

  it("validates batch edits", async () => {
    const p = await product(f, { lowStockThreshold: "0" });
    await receive(f, p.id, "5", dayOffset(100), "B1");
    await receive(f, p.id, "5", dayOffset(120), "B2");
    const b = await batchOf(p.id, "B1");
    const base = { batchId: b.id, batchNo: "B1", receivedDate: dayOffset(-30), expiryDate: dayOffset(100), reason: "Fix" };

    await expect(updateBatch(f.staff, { ...base, expiryDate: dayOffset(90) })).rejects.toThrow(/permission/);
    await expect(updateBatch(f.admin, base)).rejects.toThrow(/Nothing was changed/);
    await expect(updateBatch(f.admin, { ...base, expiryDate: dayOffset(-40) })).rejects.toThrow(/before the received date/);
    await expect(updateBatch(f.admin, { ...base, receivedDate: dayOffset(1) })).rejects.toThrow(/future/);
    await expect(updateBatch(f.admin, { ...base, expiryDate: "" })).rejects.toThrow(/expiry date/);
    await expect(updateBatch(f.admin, { ...base, batchNo: "B2" })).rejects.toThrow(/already has a batch with that number/);
    await expect(updateBatch(f.admin, { ...base, expiryDate: dayOffset(90), reason: "" })).rejects.toThrow(/Reason/);
  });

  it("deletes a batch after confirming the write-off, and frees its number", async () => {
    const p = await product(f, { lowStockThreshold: "0" });
    await receive(f, p.id, "5", dayOffset(100), "B1");
    await receive(f, p.id, "2", dayOffset(150), "B2");
    const b = await batchOf(p.id, "B1");

    expect(await batchDeletionPreview(f.admin, b.id)).toMatchObject({
      batchNo: "B1",
      holdings: [{ bucket: "SALEABLE", qty: "5" }],
      returnable: "0",
    });
    await expect(deleteBatch(f.admin, { batchId: b.id, reason: "Duplicate receipt" })).rejects.toThrow(
      /Batch B1 still has stock \(5 pieces saleable\)/,
    );
    await expect(deleteBatch(f.staff, { batchId: b.id, reason: "x", writeOffStock: "true" })).rejects.toThrow(/permission/);
    await deleteBatch(f.admin, { batchId: b.id, reason: "Duplicate receipt", writeOffStock: "true" });

    const row = await prisma.productBatch.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deleteReason).toBe("Duplicate receipt");
    expect(row.batchNo).not.toBe("B1");
    expect((await stockSummaries([p.id], today())).get(p.id)!.available.toNumber()).toBe(2);
    const adj = await prisma.inventoryAdjustment.findFirstOrThrow({ where: { batchId: b.id } });
    expect(Number(adj.quantityDelta)).toBe(-5);
    expect(await prisma.auditLog.count({ where: { action: "batch.delete", entityId: p.id } })).toBe(1);

    const batches = await getReport("pr-batches")!.run({}, ctx());
    expect(batches.total).toBe(1);
    const ledger = await getReport("pr-ledger")!.run({ productId: p.id }, ctx());
    expect(ledger.rows.filter((r) => r.batch === "B1 (deleted)")).toHaveLength(2); // receipt + write-off
    await expect(deleteBatch(f.admin, { batchId: b.id, reason: "again", writeOffStock: "true" })).rejects.toThrow(/not found/i);

    // The number can be received again as a fresh batch.
    await expect(receive(f, p.id, "4", dayOffset(100), "B1~X")).rejects.toThrow(/can't contain ~/);
    await receive(f, p.id, "4", dayOffset(100), "B1");
    const fresh = await batchOf(p.id, "B1");
    expect(fresh.id).not.toBe(b.id);
    expect(Number(fresh.initialQty)).toBe(4);
  });

  it("deletes an empty batch without writing anything off", async () => {
    const p = await product(f, { lowStockThreshold: "0" });
    await receive(f, p.id, "5", dayOffset(100), "B1");
    const b = await batchOf(p.id, "B1");
    await adjustStock(f.admin, {
      idempotencyKey: key(),
      productId: p.id,
      batchId: b.id,
      bucket: "SALEABLE",
      quantityDelta: "-5",
      reason: "Count",
    });
    expect(await deleteBatch(f.admin, { batchId: b.id, reason: "Empty" })).toEqual({ writtenOff: 0 });
  });

  it("refuses to delete a batch whose dispatched stock could still be returned", async () => {
    const p = await product(f, { lowStockThreshold: "0" });
    await receive(f, p.id, "5", dayOffset(100), "B1");
    const b = await batchOf(p.id, "B1");
    await dispatch(f, [{ productId: p.id, quantity: "2" }]);
    expect((await batchDeletionPreview(f.admin, b.id)).returnable).toBe("2");
    await expect(deleteBatch(f.admin, { batchId: b.id, reason: "x", writeOffStock: "true" })).rejects.toThrow(/could still be returned/);
    expect((await prisma.productBatch.findUniqueOrThrow({ where: { id: b.id } })).deletedAt).toBeNull();
  });
});
