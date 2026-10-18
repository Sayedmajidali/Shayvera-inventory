"use server";

import { act, formBool, formFile, formObject } from "@/server/action";
import {
  adjustStock,
  createProduct,
  deleteProduct,
  disposeQuarantine,
  receiveStock,
  restoreProduct,
  setProductActive,
  updateProduct,
} from "@/server/services/products";

const PATHS = ["/products", "/masters", "/dashboard", "/ecommerce"];

function productInput(fd: FormData) {
  return { ...formObject(fd), tracksExpiry: formBool(fd, "tracksExpiry") };
}

export async function createProductAction(fd: FormData) {
  return act(async (actor) => ({ id: (await createProduct(actor, productInput(fd), formFile(fd, "image"))).id }), {
    revalidate: PATHS,
    message: "Product created",
  });
}

export async function updateProductAction(fd: FormData) {
  return act(async (actor) => ({ id: (await updateProduct(actor, String(fd.get("id")), productInput(fd), formFile(fd, "image"))).id }), {
    revalidate: PATHS,
    message: "Product updated",
  });
}

export async function setProductActiveAction(fd: FormData) {
  return act((actor) => setProductActive(actor, String(fd.get("id")), fd.get("active") === "true").then(() => undefined), {
    revalidate: PATHS,
    message: "Product status updated",
  });
}

export async function receiveStockAction(fd: FormData) {
  return act((actor) => receiveStock(actor, formObject(fd)).then(() => undefined), { revalidate: PATHS, message: "Stock received" });
}

export async function adjustStockAction(fd: FormData) {
  return act((actor) => adjustStock(actor, formObject(fd)).then(() => undefined), { revalidate: PATHS, message: "Adjustment posted" });
}

export async function disposeAction(fd: FormData) {
  return act((actor) => disposeQuarantine(actor, formObject(fd)).then(() => undefined), {
    revalidate: PATHS,
    message: "Quarantine decision posted",
  });
}

export async function deleteProductAction(fd: FormData) {
  return act((actor) => deleteProduct(actor, formObject(fd)), { revalidate: PATHS, message: "Product deleted — history kept" });
}

export async function restoreProductAction(fd: FormData) {
  return act((actor) => restoreProduct(actor, formObject(fd)), { revalidate: PATHS, message: "Product restored" });
}
