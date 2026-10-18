import Papa from "papaparse";
import { prisma } from "../db";
import { audit } from "../audit";
import { AppError, ValidationError } from "../errors";
import { assertCan, type Actor } from "../permissions";
import { createStore, createSupplier, storeSchema, supplierSchema } from "./masters";
import { createProduct, openingSchema, productSchema } from "./products";

export const IMPORT_KINDS = {
  suppliers: {
    label: "Suppliers",
    columns: ["name", "contactPerson", "phone", "email", "address", "gstNumber"],
    required: ["name"],
  },
  stores: {
    label: "Stores",
    columns: ["name", "code", "storeType", "contact", "notes"],
    required: ["name", "storeType"],
  },
  products: {
    label: "Products",
    columns: [
      "name",
      "sku",
      "barcode",
      "category",
      "unit",
      "lowStockThreshold",
      "expiryAlertDays",
      "tracksExpiry",
      "description",
      "openingQty",
      "openingBatchNo",
      "openingExpiryDate",
    ],
    required: ["name", "sku", "unit"],
  },
} as const;

export type ImportKind = keyof typeof IMPORT_KINDS;
export interface ImportResult {
  kind: ImportKind;
  dryRun: boolean;
  rows: number;
  imported: number;
  errors: { row: number; message: string }[];
}

const MAX_ROWS = 2000;
const truthy = (v: string | undefined) => /^(1|y|yes|true)$/i.test((v ?? "").trim());

/**
 * Validate every row first. If any row is invalid nothing is imported.
 * Product opening stock is posted only for SKUs that do not already exist, so
 * re-running the same file can never post opening stock twice.
 */
export async function importCsv(actor: Actor, kindRaw: string, text: string, dryRun: boolean): Promise<ImportResult> {
  assertCan(actor, "admin.import");
  if (!(kindRaw in IMPORT_KINDS)) throw new ValidationError("Choose what to import.");
  const kind = kindRaw as ImportKind;
  if (!text.trim()) throw new ValidationError("The CSV file is empty.", { file: "Empty file" });

  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data;
  if (rows.length > MAX_ROWS) throw new ValidationError(`Import at most ${MAX_ROWS} rows at a time.`);
  const missing = IMPORT_KINDS[kind].required.filter((c) => !parsed.meta.fields?.includes(c));
  if (missing.length) throw new ValidationError(`Missing required column(s): ${missing.join(", ")}.`);

  const errors: ImportResult["errors"] = [];
  const rowNo = (i: number) => i + 2; // header is row 1
  const prepared: unknown[] = [];

  if (kind === "suppliers") {
    rows.forEach((r, i) => {
      const res = supplierSchema.safeParse(r);
      if (!res.success)
        errors.push({ row: rowNo(i), message: res.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
      else prepared.push(r);
    });
  }

  if (kind === "stores") {
    const codes = new Set((await prisma.store.findMany({ select: { code: true } })).map((s) => s.code));
    rows.forEach((r, i) => {
      const res = storeSchema.safeParse(r);
      if (!res.success)
        return errors.push({ row: rowNo(i), message: res.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
      if (res.data.code) {
        if (codes.has(res.data.code)) return errors.push({ row: rowNo(i), message: `Store code ${res.data.code} already exists` });
        codes.add(res.data.code);
      }
      prepared.push(r);
    });
  }

  if (kind === "products") {
    const [units, categories, existing] = await Promise.all([
      prisma.unit.findMany({ where: { active: true } }),
      prisma.productCategory.findMany({ where: { active: true } }),
      prisma.readyProduct.findMany({ select: { sku: true, barcode: true } }),
    ]);
    const skus = new Set(existing.map((p) => p.sku));
    const barcodes = new Set(existing.map((p) => p.barcode).filter(Boolean));
    rows.forEach((r, i) => {
      const unit = units.find((u) => u.code === (r.unit ?? "").trim().toLowerCase());
      const category = r.category?.trim() ? categories.find((c) => c.name.toLowerCase() === r.category.trim().toLowerCase()) : null;
      const problems: string[] = [];
      if (!unit) problems.push(`unknown unit "${r.unit ?? ""}"`);
      if (r.category?.trim() && !category) problems.push(`unknown category "${r.category}" (create it in Settings first)`);
      const input = {
        ...r,
        unitId: unit?.id ?? "",
        categoryId: category?.id ?? "",
        lowStockThreshold: r.lowStockThreshold || "0",
        expiryAlertDays: r.expiryAlertDays || "30",
        tracksExpiry: r.tracksExpiry === undefined || r.tracksExpiry === "" ? true : truthy(r.tracksExpiry),
      };
      const p = productSchema.safeParse(input);
      const o = openingSchema.safeParse(input);
      if (!p.success) problems.push(...p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`));
      if (!o.success) problems.push(...o.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`));
      if (p.success) {
        if (skus.has(p.data.sku)) problems.push(`SKU ${p.data.sku} already exists — opening stock will not be posted again`);
        if (p.data.barcode && barcodes.has(p.data.barcode)) problems.push(`barcode ${p.data.barcode} already exists`);
        skus.add(p.data.sku);
        if (p.data.barcode) barcodes.add(p.data.barcode);
        if (unit && !unit.allowsDecimal && !p.data.lowStockThreshold.isInteger()) problems.push("threshold must be a whole number");
        if (o.success && unit && !unit.allowsDecimal && !o.data.openingQty.isInteger())
          problems.push("opening quantity must be a whole number");
        if (o.success && o.data.openingQty.gt(0) && p.data.tracksExpiry && !o.data.openingExpiryDate)
          problems.push("openingExpiryDate is required when opening stock is given");
      }
      if (problems.length) errors.push({ row: rowNo(i), message: problems.join("; ") });
      else prepared.push(input);
    });
  }

  if (errors.length || dryRun) return { kind, dryRun, rows: rows.length, imported: 0, errors };

  let imported = 0;
  for (const [i, input] of prepared.entries()) {
    try {
      if (kind === "suppliers") await createSupplier(actor, input);
      else if (kind === "stores") await createStore(actor, input);
      else await createProduct(actor, input);
      imported++;
    } catch (e) {
      errors.push({ row: rowNo(i), message: e instanceof AppError ? e.message : "Unexpected error" });
    }
  }
  await audit(prisma, {
    actorId: actor.id,
    action: "import.csv",
    entityType: "Import",
    entityId: kind,
    summary: `Imported ${imported} of ${rows.length} ${IMPORT_KINDS[kind].label.toLowerCase()} from CSV`,
    details: { errors },
  });
  return { kind, dryRun, rows: rows.length, imported, errors };
}
