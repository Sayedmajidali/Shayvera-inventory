"use server";

import { act, formFile, formJson, formObject } from "@/server/action";
import { prisma } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { createStore, setStoreActive, updateStore } from "@/server/services/masters";
import { createDispatch, createReturn, recordStoreSale, reverseDispatch, reverseReturn } from "@/server/services/ecommerce";
import { uploadAttachment } from "@/server/services/attachments";

const PATHS = ["/ecommerce", "/products", "/dashboard"];

export async function saveStoreAction(fd: FormData) {
  return act(
    async (actor) => {
      const o = formObject(fd);
      if (o.id) await updateStore(actor, o.id, o);
      else await createStore(actor, o);
    },
    { revalidate: ["/ecommerce"], message: "Store saved" },
  );
}

export async function setStoreActiveAction(fd: FormData) {
  return act((actor) => setStoreActive(actor, String(fd.get("id")), fd.get("active") === "true").then(() => undefined), {
    revalidate: ["/ecommerce"],
    message: "Store status updated",
  });
}

export async function createDispatchAction(fd: FormData) {
  return act(
    async (actor) => {
      const { dispatch, duplicate } = await createDispatch(
        actor,
        { ...formObject(fd), lines: formJson(fd, "lines") ?? [] },
        formFile(fd, "bill"),
      );
      return { id: dispatch.id, duplicate };
    },
    { revalidate: PATHS, message: "Dispatch posted — stock deducted" },
  );
}

export async function reverseDispatchAction(fd: FormData) {
  return act((actor) => reverseDispatch(actor, formObject(fd)).then(() => undefined), {
    revalidate: PATHS,
    message: "Dispatch reversed — stock restored",
  });
}

export async function createReturnAction(fd: FormData) {
  return act(
    async (actor) => {
      const { productReturn, duplicate } = await createReturn(
        actor,
        { ...formObject(fd), lines: formJson(fd, "lines") ?? [] },
        formFile(fd, "document"),
      );
      return { id: productReturn.id, duplicate };
    },
    { revalidate: PATHS, message: "Return recorded" },
  );
}

export async function reverseReturnAction(fd: FormData) {
  return act((actor) => reverseReturn(actor, formObject(fd)).then(() => undefined), { revalidate: PATHS, message: "Return reversed" });
}

export async function recordSaleAction(fd: FormData) {
  return act((actor) => recordStoreSale(actor, formObject(fd)).then(() => undefined), {
    revalidate: PATHS,
    message: "Store sale recorded (no stock change)",
  });
}

export async function uploadEcomDocAction(fd: FormData) {
  return act(
    async (actor) => {
      const o = formObject(fd);
      const file = formFile(fd);
      if (!file) throw new ValidationError("Choose a file to upload.", { file: "Required" });
      const category =
        o.category === "RETURN_DOCUMENT" ? "RETURN_DOCUMENT" : o.category === "SHIPMENT_DOCUMENT" ? "SHIPMENT_DOCUMENT" : "DISPATCH_BILL";
      let { dispatchId, returnId } = o;
      if (!dispatchId && !returnId && o.reference) {
        const ref = o.reference.trim().toUpperCase();
        if (category === "RETURN_DOCUMENT") {
          returnId = (await prisma.productReturn.findUnique({ where: { returnNo: ref } }))?.id ?? "";
          if (!returnId) throw new ValidationError(`No return found with ID ${ref}.`, { reference: "Not found" });
        } else {
          dispatchId = (await prisma.dispatch.findUnique({ where: { dispatchNo: ref } }))?.id ?? "";
          if (!dispatchId) throw new ValidationError(`No dispatch found with ID ${ref}.`, { reference: "Not found" });
        }
      }
      await uploadAttachment(actor, category, file, { dispatchId, returnId, billNumber: o.billNumber, notes: o.notes });
    },
    { revalidate: ["/ecommerce"], message: "Document uploaded" },
  );
}
