import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  approveEntry,
  createRawMaterialEntry,
  reconcileRawMaterials,
  rejectEntry,
  reverseInspection,
} from "@/server/services/raw-materials";
import { readAttachment, uploadAttachment } from "@/server/services/attachments";
import { key, nowLocal, pdfFile, rawEntry, resetDb, seedFixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
});

const balanceOf = async (rawMaterialId: string) =>
  Number((await prisma.rawMaterial.findUniqueOrThrow({ where: { id: rawMaterialId } })).currentBalance);

describe("raw material entries", () => {
  it("starts as pending inspection and does not affect stock", async () => {
    const entry = await rawEntry(f);
    expect(entry.status).toBe("PENDING_INSPECTION");
    expect(entry.entryNo).toMatch(/^RM-\d{6}$/);
    expect(await balanceOf(entry.rawMaterialId)).toBe(0);
    expect(await prisma.rawMaterialTransaction.count()).toBe(0);
  });

  it("rejects zero or negative quantities and missing references", async () => {
    await expect(rawEntry(f, { quantity: "0" })).rejects.toThrow(/greater than zero/);
    await expect(rawEntry(f, { quantity: "-3" })).rejects.toThrow();
    await expect(rawEntry(f, { invoiceNumber: "", poNumber: "" })).rejects.toThrow(/PO number or an invoice number/);
  });

  it("rejects fractional quantities for pieces", async () => {
    await expect(rawEntry(f, { unitId: f.pieces.id, quantity: "2.5" })).rejects.toThrow(/whole numbers/);
  });

  it("keeps kg and pieces of the same material separate", async () => {
    const a = await rawEntry(f, { quantity: "10" });
    const b = await rawEntry(f, { unitId: f.pieces.id, quantity: "4" });
    expect(a.rawMaterialId).not.toBe(b.rawMaterialId);
  });

  it("allows multiple entries with the same invoice number", async () => {
    await rawEntry(f, { materialName: "Shea Butter" });
    await rawEntry(f, { materialName: "Cocoa Butter" });
    expect(await prisma.rawMaterialEntry.count({ where: { invoiceNumber: "INV-100" } })).toBe(2);
  });

  it("treats a repeated submission with the same idempotency key as one entry", async () => {
    const input = {
      idempotencyKey: key(),
      entryDate: nowLocal(),
      materialName: "Aloe",
      supplierId: f.supplierId,
      quantity: "5",
      unitId: f.kg.id,
      poNumber: "PO-1",
    };
    const [a, b] = await Promise.all([createRawMaterialEntry(f.staff, input), createRawMaterialEntry(f.staff, input)]);
    expect(a.entry.id).toBe(b.entry.id);
    expect(await prisma.rawMaterialEntry.count()).toBe(1);
  });
});

describe("quality inspection", () => {
  it("approval adds stock exactly once, even with concurrent requests", async () => {
    const entry = await rawEntry(f, { quantity: "25.5" });
    const results = await Promise.allSettled([
      approveEntry(f.admin, { entryId: entry.id }),
      approveEntry(f.admin, { entryId: entry.id }),
      approveEntry(f.admin, { entryId: entry.id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balanceOf(entry.rawMaterialId)).toBe(25.5);
    expect(await prisma.rawMaterialTransaction.count({ where: { type: "INWARD_APPROVED" } })).toBe(1);
    const updated = await prisma.rawMaterialEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updated.status).toBe("APPROVED");
  });

  it("records the inspector, timestamp and notes", async () => {
    const entry = await rawEntry(f);
    await approveEntry(f.admin, { entryId: entry.id, notes: "Looks good" });
    const insp = await prisma.qualityInspection.findFirstOrThrow({ where: { entryId: entry.id } });
    expect(insp.inspectedById).toBe(f.admin.id);
    expect(insp.notes).toBe("Looks good");
    expect(insp.inspectedAt).toBeInstanceOf(Date);
    expect(await prisma.auditLog.count({ where: { action: "inspection.approve" } })).toBe(1);
  });

  it("rejection does not add stock and requires a reason", async () => {
    const entry = await rawEntry(f);
    await expect(rejectEntry(f.admin, { entryId: entry.id, rejectionReason: "" })).rejects.toThrow(/Rejection reason/);
    await rejectEntry(f.admin, { entryId: entry.id, rejectionReason: "Contaminated" });
    expect(await balanceOf(entry.rawMaterialId)).toBe(0);
    const e = await prisma.rawMaterialEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(e.status).toBe("REJECTED");
    // a rejected entry cannot later be approved
    await expect(approveEntry(f.admin, { entryId: entry.id })).rejects.toThrow(/already been rejected/);
  });

  it("staff without the inspect permission cannot approve", async () => {
    const entry = await rawEntry(f);
    await expect(approveEntry(f.staff, { entryId: entry.id })).rejects.toThrow(/permission/);
    await expect(rejectEntry(f.staff, { entryId: entry.id, rejectionReason: "x" })).rejects.toThrow(/permission/);
    expect(await balanceOf(entry.rawMaterialId)).toBe(0);
  });

  it("staff granted the inspect permission can approve", async () => {
    const entry = await rawEntry(f);
    await approveEntry({ ...f.staff, permissions: [...f.staff.permissions, "rm.inspect"] }, { entryId: entry.id });
    expect(await balanceOf(entry.rawMaterialId)).toBe(25.5);
  });

  it("reversal removes approved stock, keeps history and allows re-inspection", async () => {
    const entry = await rawEntry(f, { quantity: "10" });
    const { inspection } = await approveEntry(f.admin, { entryId: entry.id });
    await expect(reverseInspection(f.staff, { inspectionId: inspection.id, reason: "x" })).rejects.toThrow(/permission/);
    await reverseInspection(f.admin, { inspectionId: inspection.id, reason: "Approved wrong entry" });
    await expect(reverseInspection(f.admin, { inspectionId: inspection.id, reason: "again" })).rejects.toThrow(/already been reversed/);

    expect(await balanceOf(entry.rawMaterialId)).toBe(0);
    expect(await prisma.rawMaterialTransaction.count()).toBe(2); // inward + reversal, nothing deleted
    expect((await prisma.rawMaterialEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("PENDING_INSPECTION");

    await rejectEntry(f.admin, { entryId: entry.id, rejectionReason: "Failed re-inspection" });
    expect(await prisma.qualityInspection.count({ where: { entryId: entry.id } })).toBe(2);
    expect(await reconcileRawMaterials()).toHaveLength(0);
  });

  it("posted ledger rows cannot be updated or deleted", async () => {
    const entry = await rawEntry(f);
    await approveEntry(f.admin, { entryId: entry.id });
    await expect(prisma.rawMaterialTransaction.updateMany({ data: { quantity: 999 } })).rejects.toThrow(/immutable/);
    await expect(prisma.rawMaterialTransaction.deleteMany({})).rejects.toThrow(/immutable/);
  });
});

describe("raw material bills", () => {
  it("uploads with an entry and is readable by authorized users only", async () => {
    const { entry } = await createRawMaterialEntry(
      f.staff,
      {
        idempotencyKey: key(),
        entryDate: nowLocal(),
        materialName: "Beeswax",
        supplierId: f.supplierId,
        quantity: "3",
        unitId: f.kg.id,
        invoiceNumber: "INV-9",
      },
      pdfFile(),
    );
    const att = await prisma.billAttachment.findFirstOrThrow({ where: { rawMaterialEntryId: entry.id } });
    expect(att.billNumber).toBe("INV-9");
    expect(att.storageKey).not.toMatch(/^public/);

    const { body } = await readAttachment(f.staff, att.id);
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");

    const outsider = { ...f.staff, permissions: ["ecom.view"] };
    await expect(readAttachment(outsider, att.id)).rejects.toThrow(/access/);
  });

  it("rejects files whose content does not match an allowed type", async () => {
    const fake = new File([Buffer.from("MZ executable")], "bill.pdf", { type: "application/pdf" });
    const entry = await rawEntry(f);
    await expect(uploadAttachment(f.staff, "RAW_MATERIAL_BILL", fake, { rawMaterialEntryId: entry.id })).rejects.toThrow(
      /Unsupported file type/,
    );
  });
});
