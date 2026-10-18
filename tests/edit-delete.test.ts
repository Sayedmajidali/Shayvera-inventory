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
import { adjustStock, deleteProduct, receiveStock, restoreProduct, updateProduct } from "@/server/services/products";
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
