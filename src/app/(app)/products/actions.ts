"use server";

import { act, formBool, formFile, formObject } from "@/server/action";
import { BUCKET } from "@/lib/labels";
import { formatQty } from "@/lib/decimal";
import {
  adjustStock,
  batchDeletionPreview,
  createProduct,
  deleteBatch,
  deleteProduct,
  deletionPreview,
  disposeQuarantine,
  receiveStock,
  restoreProduct,
  setProductActive,
  updateBatch,
  updateProduct,
} from "@/server/services/products";
import type { StockPreview } from "@/components/forms/stock-warning-delete";

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

/** What deleting a product would write off, for the confirmation popup. */
export async function productDeletionPreviewAction(productId: string) {
  return act<StockPreview>(async (actor) => {
    const p = await deletionPreview(actor, productId);
    return {
      holdings: p.holdings.map((h) => ({
        label: `Batch ${h.batchNo} · ${BUCKET[h.bucket]?.label ?? h.bucket}`,
        qty: formatQty(h.qty, p.unit),
      })),
      blocked: null,
    };
  });
}

export async function batchDeletionPreviewAction(batchId: string) {
  return act<StockPreview>(async (actor) => {
    const p = await batchDeletionPreview(actor, batchId);
    return {
      holdings: p.holdings.map((h) => ({ label: BUCKET[h.bucket]?.label ?? h.bucket, qty: formatQty(h.qty, p.unit) })),
      blocked:
        Number(p.returnable) > 0
          ? `${formatQty(p.returnable, p.unit)} dispatched from this batch could still come back as returns, so it can't be deleted. Correct its stock with an adjustment instead.`
          : null,
    };
  });
}

export async function updateBatchAction(fd: FormData) {
  return act((actor) => updateBatch(actor, formObject(fd)).then(() => undefined), { revalidate: PATHS, message: "Batch updated" });
}

export async function deleteBatchAction(fd: FormData) {
  return act((actor) => deleteBatch(actor, formObject(fd)), { revalidate: PATHS, message: "Batch deleted — history kept" });
}

export async function restoreProductAction(fd: FormData) {
  return act((actor) => restoreProduct(actor, formObject(fd)), { revalidate: PATHS, message: "Product restored" });
}
