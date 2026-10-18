import { createHash, randomUUID } from "node:crypto";
import type { AttachmentCategory, BillAttachment } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { audit } from "../audit";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { assertCan, can, type Actor, type Permission } from "../permissions";
import { readSettings, ALLOWED_FILE_TYPES } from "../settings";
import { storage } from "../storage";

export interface UploadFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

const CATEGORY_PERMISSION: Record<AttachmentCategory, Permission> = {
  RAW_MATERIAL_BILL: "rm.bills",
  DISPATCH_BILL: "ecom.bills",
  SHIPMENT_DOCUMENT: "ecom.bills",
  RETURN_DOCUMENT: "ecom.bills",
  PRODUCT_IMAGE: "product.view",
};

export const CATEGORY_LABEL: Record<AttachmentCategory, string> = {
  RAW_MATERIAL_BILL: "Raw material bill",
  DISPATCH_BILL: "Dispatch bill / invoice",
  SHIPMENT_DOCUMENT: "Shipment document",
  RETURN_DOCUMENT: "Return document",
  PRODUCT_IMAGE: "Product image",
};

export function canViewAttachment(actor: Actor, category: AttachmentCategory): boolean {
  if (category === "RAW_MATERIAL_BILL") return can(actor, "rm.bills") || can(actor, "rm.inspect");
  return can(actor, CATEGORY_PERMISSION[category]);
}

export function assertCanUpload(actor: Actor, category: AttachmentCategory) {
  if (category === "PRODUCT_IMAGE") return assertCan(actor, "admin.masters");
  assertCan(actor, CATEGORY_PERMISSION[category]);
}

function sniffMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export interface PreparedFile {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
}

/** Validate type, size and content; then write to private storage. */
export async function storeFile(file: UploadFile, category: AttachmentCategory): Promise<PreparedFile> {
  const settings = await readSettings();
  const maxBytes = settings.maxUploadMb * 1024 * 1024;
  if (!file || file.size === 0) throw new ValidationError("The selected file is empty.", { file: "File is empty" });
  if (file.size > maxBytes) throw new ValidationError(`Files must be ${settings.maxUploadMb} MB or smaller.`, { file: "File too large" });

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = sniffMime(bytes);
  const allowed: string[] = category === "PRODUCT_IMAGE" ? ["image/jpeg", "image/png", "image/webp"] : settings.allowedFileTypes;
  if (!detected || !allowed.includes(detected)) {
    const names = allowed.map((t) => ALLOWED_FILE_TYPES[t as keyof typeof ALLOWED_FILE_TYPES]).join(", ");
    throw new ValidationError(`Unsupported file type. Allowed: ${names}.`, { file: "Unsupported file type" });
  }

  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-150) || "document";
  const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[detected];
  const now = new Date();
  const storageKey = `${category.toLowerCase()}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
  await storage().put(storageKey, bytes, detected);

  return {
    fileName: safeName,
    mimeType: detected,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    storageKey,
  };
}

export interface AttachmentLinks {
  supplierId?: string | null;
  storeId?: string | null;
  rawMaterialEntryId?: string | null;
  dispatchId?: string | null;
  returnId?: string | null;
  billNumber?: string | null;
  notes?: string | null;
}

export async function createAttachmentRecord(
  tx: Tx,
  actor: Actor,
  category: AttachmentCategory,
  prepared: PreparedFile,
  links: AttachmentLinks,
) {
  const att = await tx.billAttachment.create({
    data: {
      category,
      ...prepared,
      supplierId: links.supplierId ?? null,
      storeId: links.storeId ?? null,
      rawMaterialEntryId: links.rawMaterialEntryId ?? null,
      dispatchId: links.dispatchId ?? null,
      returnId: links.returnId ?? null,
      billNumber: links.billNumber?.trim() || null,
      notes: links.notes?.trim() || null,
      uploadedById: actor.id,
    },
  });
  await audit(tx, {
    actorId: actor.id,
    action: "attachment.upload",
    entityType: "BillAttachment",
    entityId: att.id,
    summary: `Uploaded ${CATEGORY_LABEL[category].toLowerCase()} "${att.fileName}"`,
    details: { ...links, sha256: prepared.sha256, sizeBytes: prepared.sizeBytes },
  });
  return att;
}

/** Upload an additional document and link it to existing records. */
export async function uploadAttachment(actor: Actor, category: AttachmentCategory, file: UploadFile, links: AttachmentLinks) {
  assertCanUpload(actor, category);
  await validateLinks(category, links);
  const prepared = await storeFile(file, category);
  return prisma.$transaction((tx) => createAttachmentRecord(tx, actor, category, prepared, links));
}

async function validateLinks(category: AttachmentCategory, links: AttachmentLinks) {
  if (category === "RAW_MATERIAL_BILL") {
    if (!links.rawMaterialEntryId) throw new ValidationError("Select the raw material entry this bill belongs to.");
    const entry = await prisma.rawMaterialEntry.findUnique({ where: { id: links.rawMaterialEntryId } });
    if (!entry) throw new NotFoundError("Raw material entry");
    if (entry.deletedAt) throw new ValidationError("This entry has been deleted.");
    links.supplierId = entry.supplierId;
    links.billNumber = links.billNumber || entry.invoiceNumber || entry.poNumber;
  }
  if (category === "DISPATCH_BILL" || category === "SHIPMENT_DOCUMENT") {
    if (!links.dispatchId) throw new ValidationError("Select the dispatch this document belongs to.");
    const d = await prisma.dispatch.findUnique({ where: { id: links.dispatchId } });
    if (!d) throw new NotFoundError("Dispatch");
    links.storeId = d.storeId;
    links.billNumber = links.billNumber || d.invoiceNumber;
  }
  if (category === "RETURN_DOCUMENT") {
    if (!links.returnId) throw new ValidationError("Select the return this document belongs to.");
    const r = await prisma.productReturn.findUnique({ where: { id: links.returnId } });
    if (!r) throw new NotFoundError("Return");
    links.storeId = r.storeId;
    links.dispatchId = r.dispatchId;
  }
}

/** Controlled replacement: the old file is kept and marked REPLACED; the new one points back to it. */
export async function replaceAttachment(actor: Actor, attachmentId: string, file: UploadFile, reason: string) {
  const old = await prisma.billAttachment.findUnique({ where: { id: attachmentId } });
  if (!old) throw new NotFoundError("Document");
  assertCanUpload(actor, old.category);
  if (!reason?.trim()) throw new ValidationError("A reason is required to replace a document.", { reason: "Required" });
  if (old.status !== "ACTIVE") throw new ValidationError("This document has already been replaced.");

  const prepared = await storeFile(file, old.category);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.billAttachment.updateMany({
      where: { id: old.id, status: "ACTIVE" },
      data: { status: "REPLACED", replacedAt: new Date(), replacedById: actor.id },
    });
    if (updated.count !== 1) throw new ValidationError("This document has already been replaced.");
    const att = await tx.billAttachment.create({
      data: {
        category: old.category,
        ...prepared,
        supplierId: old.supplierId,
        storeId: old.storeId,
        rawMaterialEntryId: old.rawMaterialEntryId,
        dispatchId: old.dispatchId,
        returnId: old.returnId,
        billNumber: old.billNumber,
        notes: old.notes,
        replacesId: old.id,
        replacementReason: reason.trim(),
        uploadedById: actor.id,
      },
    });
    await audit(tx, {
      actorId: actor.id,
      action: "attachment.replace",
      entityType: "BillAttachment",
      entityId: att.id,
      summary: `Replaced "${old.fileName}" with "${att.fileName}"`,
      details: { previousId: old.id, reason: reason.trim() },
    });
    return att;
  });
}

/** Authorized read of a private document. */
export async function readAttachment(actor: Actor, id: string): Promise<{ att: BillAttachment; body: Buffer }> {
  const att = await prisma.billAttachment.findUnique({ where: { id } });
  if (!att) throw new NotFoundError("Document");
  if (!canViewAttachment(actor, att.category)) throw new ForbiddenError("You do not have access to this document.");
  const body = await storage().get(att.storageKey);
  return { att, body };
}
