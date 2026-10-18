"use server";

import { act, formFile, formObject } from "@/server/action";
import { prisma } from "@/server/db";
import { ValidationError } from "@/server/errors";
import {
  adjustRawMaterial,
  approveEntry,
  createRawMaterialEntry,
  deleteRawMaterialEntry,
  rejectEntry,
  restoreRawMaterialEntry,
  reverseInspection,
  updateRawMaterialEntry,
} from "@/server/services/raw-materials";
import { replaceAttachment, uploadAttachment } from "@/server/services/attachments";

const PATHS = ["/raw-materials", "/dashboard"];

export async function createEntryAction(fd: FormData) {
  return act(
    async (actor) => {
      const { entry, duplicate } = await createRawMaterialEntry(actor, formObject(fd), formFile(fd, "bill"));
      return { id: entry.id, entryNo: entry.entryNo, duplicate };
    },
    { revalidate: PATHS, message: "Entry saved — pending quality inspection" },
  );
}

export async function updateEntryAction(fd: FormData) {
  return act(async (actor) => ({ id: (await updateRawMaterialEntry(actor, formObject(fd))).id }), {
    revalidate: PATHS,
    message: "Entry updated — the change is recorded in its history",
  });
}

export async function deleteEntryAction(fd: FormData) {
  return act((actor) => deleteRawMaterialEntry(actor, formObject(fd)), {
    revalidate: PATHS,
    message: "Entry deleted — kept in the audit trail",
  });
}

export async function restoreEntryAction(fd: FormData) {
  return act((actor) => restoreRawMaterialEntry(actor, formObject(fd)), {
    revalidate: PATHS,
    message: "Entry restored to pending inspection",
  });
}

export async function approveAction(fd: FormData) {
  return act((actor) => approveEntry(actor, formObject(fd)).then(() => undefined), {
    revalidate: PATHS,
    message: "Approved — stock updated",
  });
}

export async function rejectAction(fd: FormData) {
  return act((actor) => rejectEntry(actor, formObject(fd)).then(() => undefined), { revalidate: PATHS, message: "Entry rejected" });
}

export async function reverseInspectionAction(fd: FormData) {
  return act((actor) => reverseInspection(actor, formObject(fd)).then(() => undefined), {
    revalidate: PATHS,
    message: "Decision reversed — entry is pending re-inspection",
  });
}

export async function adjustRawAction(fd: FormData) {
  return act((actor) => adjustRawMaterial(actor, formObject(fd)).then(() => undefined), {
    revalidate: PATHS,
    message: "Adjustment posted",
  });
}

export async function uploadRawBillAction(fd: FormData) {
  return act(
    async (actor) => {
      const o = formObject(fd);
      let entryId = o.entryId;
      if (!entryId && o.entryNo) {
        const entry = await prisma.rawMaterialEntry.findUnique({ where: { entryNo: o.entryNo.trim().toUpperCase() } });
        if (!entry) throw new ValidationError(`No entry found with ID ${o.entryNo}.`, { entryNo: "Not found" });
        entryId = entry.id;
      }
      const file = formFile(fd);
      if (!file) throw new ValidationError("Choose a file to upload.", { file: "Required" });
      await uploadAttachment(actor, "RAW_MATERIAL_BILL", file, { rawMaterialEntryId: entryId, billNumber: o.billNumber, notes: o.notes });
    },
    { revalidate: PATHS, message: "Bill uploaded" },
  );
}

export async function replaceBillAction(fd: FormData) {
  return act(
    async (actor) => {
      const file = formFile(fd);
      if (!file) throw new ValidationError("Choose the replacement file.", { file: "Required" });
      await replaceAttachment(actor, String(fd.get("attachmentId")), file, String(fd.get("reason") ?? ""));
    },
    { revalidate: ["/raw-materials", "/ecommerce"], message: "Document replaced. The previous version is kept in the register." },
  );
}
