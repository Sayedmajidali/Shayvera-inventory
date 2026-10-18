import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { BUCKET, EXPIRY_STATUS, PRODUCT_TXN_TYPE, STOCK_STATUS, toOptions } from "@/lib/labels";
import { and, badge, calDay, dt, like, link, paging, qty, range, sqlOrder, sqlPaging } from "./util";
import type { Filters, ReportDef, RunContext } from "./types";
import { can } from "../permissions";
import { daysBetween, dateOnlyString } from "@/lib/dates";

const PR_REPORT = ["product.reports"] as ReportDef["permission"];

type StockRow = {
  id: string;
  productCode: string;
  name: string;
  sku: string;
  category: string | null;
  unit: string;
  active: boolean;
  threshold: Prisma.Decimal;
  alertDays: number;
  available: Prisma.Decimal;
  expiredSaleable: Prisma.Decimal;
  quarantine: Prisma.Decimal;
  damaged: Prisma.Decimal;
  expired: Prisma.Decimal;
  dispatched: Prisma.Decimal;
  returned: Prisma.Decimal;
  adjusted: Prisma.Decimal;
  lastTxn: Date | null;
  nextExpiry: Date | null;
  stockStatus: string;
  expiryStatus: string;
};

/** Per-product stock snapshot computed from balances and the ledger. */
export function productStockSql(today: string, f: Filters) {
  const parts: Prisma.Sql[] = [];
  if (f.categoryId) parts.push(Prisma.sql`x."categoryId" = ${f.categoryId}`);
  if (f.productId) parts.push(Prisma.sql`x."id" = ${f.productId}`);
  if (f.q) parts.push(Prisma.sql`(x."name" ILIKE ${like(f.q)} OR x."sku" ILIKE ${like(f.q)} OR x."productCode" ILIKE ${like(f.q)})`);
  if (f.sku) parts.push(Prisma.sql`x."sku" ILIKE ${like(f.sku)}`);
  if (f.stockStatus && f.stockStatus in STOCK_STATUS) parts.push(Prisma.sql`x."stockStatus" = ${f.stockStatus}`);
  if (f.expiryStatus && f.expiryStatus in EXPIRY_STATUS) parts.push(Prisma.sql`x."expiryStatus" = ${f.expiryStatus}`);
  if (f.status === "ACTIVE") parts.push(Prisma.sql`x."active" = true`);
  if (f.status === "INACTIVE") parts.push(Prisma.sql`x."active" = false`);
  // Deleted products (always zero stock) are hidden unless explicitly requested.
  parts.push(f.status === "DELETED" ? Prisma.sql`x."deletedAt" IS NOT NULL` : Prisma.sql`x."deletedAt" IS NULL`);
  return Prisma.sql`
    WITH bal AS (
      SELECT sb."productId",
        COALESCE(SUM(sb."quantity") FILTER (WHERE sb."bucket" = 'SALEABLE' AND (b."expiryDate" IS NULL OR b."expiryDate" >= ${today}::date)), 0) AS available,
        COALESCE(SUM(sb."quantity") FILTER (WHERE sb."bucket" = 'SALEABLE' AND b."expiryDate" < ${today}::date), 0) AS "expiredSaleable",
        COALESCE(SUM(sb."quantity") FILTER (WHERE sb."bucket" = 'QUARANTINE'), 0) AS quarantine,
        COALESCE(SUM(sb."quantity") FILTER (WHERE sb."bucket" = 'DAMAGED'), 0) AS damaged,
        COALESCE(SUM(sb."quantity") FILTER (WHERE sb."bucket" = 'EXPIRED'), 0) AS expired,
        MIN(b."expiryDate") FILTER (WHERE sb."bucket" = 'SALEABLE' AND sb."quantity" > 0) AS "nextExpiry"
      FROM "StockBalance" sb JOIN "ProductBatch" b ON b."id" = sb."batchId"
      GROUP BY sb."productId"
    ), mov AS (
      SELECT "productId",
        COALESCE(-SUM("quantity") FILTER (WHERE "type" = 'DISPATCH' OR ("type" = 'REVERSAL' AND "returnId" IS NULL AND "dispatchId" IS NOT NULL)), 0) AS dispatched,
        COALESCE(SUM("quantity") FILTER (WHERE "type" = 'RETURN' OR ("type" = 'REVERSAL' AND "returnId" IS NOT NULL)), 0) AS returned,
        COALESCE(SUM("quantity") FILTER (WHERE "type" = 'ADJUSTMENT'), 0) AS adjusted,
        MAX("createdAt") AS "lastTxn"
      FROM "ProductTransaction" GROUP BY "productId"
    ), x AS (
      SELECT p."id", p."productCode", p."name", p."sku", p."categoryId", c."name" AS category, u."code" AS unit, p."active", p."deletedAt",
        p."lowStockThreshold" AS threshold, p."expiryAlertDays" AS "alertDays",
        COALESCE(bal.available, 0) AS available, COALESCE(bal."expiredSaleable", 0) AS "expiredSaleable",
        COALESCE(bal.quarantine, 0) AS quarantine, COALESCE(bal.damaged, 0) AS damaged, COALESCE(bal.expired, 0) AS expired,
        COALESCE(mov.dispatched, 0) AS dispatched, COALESCE(mov.returned, 0) AS returned, COALESCE(mov.adjusted, 0) AS adjusted,
        mov."lastTxn", bal."nextExpiry",
        CASE WHEN COALESCE(bal.available, 0) <= 0 THEN 'OUT'
             WHEN p."lowStockThreshold" > 0 AND COALESCE(bal.available, 0) <= p."lowStockThreshold" THEN 'LOW'
             ELSE 'OK' END AS "stockStatus",
        CASE WHEN bal."nextExpiry" IS NULL THEN 'NO_EXPIRY'
             WHEN bal."nextExpiry" < ${today}::date THEN 'EXPIRED'
             WHEN bal."nextExpiry" <= ${today}::date + p."expiryAlertDays" THEN 'NEAR_EXPIRY'
             ELSE 'OK' END AS "expiryStatus"
      FROM "ReadyProduct" p
      JOIN "Unit" u ON u."id" = p."unitId"
      LEFT JOIN "ProductCategory" c ON c."id" = p."categoryId"
      LEFT JOIN bal ON bal."productId" = p."id"
      LEFT JOIN mov ON mov."productId" = p."id"
    )
    SELECT * FROM x ${and(parts)}`;
}

const STOCK_SORT = {
  name: `"name"`,
  sku: `"sku"`,
  category: `"category"`,
  available: `"available"`,
  dispatched: `"dispatched"`,
  returned: `"returned"`,
  threshold: `"threshold"`,
  lastTxn: `"lastTxn"`,
  nextExpiry: `"nextExpiry"`,
  stockStatus: `"stockStatus"`,
};

async function runStock(f: Filters, ctx: RunContext) {
  const base = productStockSql(ctx.today, f);
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<
      StockRow[]
    >`SELECT * FROM (${base}) s ORDER BY ${sqlOrder(STOCK_SORT, ctx.sort ?? "name", ctx.dir)}, "sku" ASC ${sqlPaging(ctx)}`,
    prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (${base}) s`,
  ]);
  return { rows, total: Number(count[0]?.n ?? 0) };
}

export const productStock: ReportDef = {
  key: "pr-stock",
  title: "Current stock report",
  description: "Live stock per product. Available = saleable and not expired. Quarantined, damaged and expired goods are shown separately.",
  module: "product",
  permission: ["product.view", "product.reports"],
  filters: ["q", "categoryId", "stockStatus", "expiryStatus"],
  options: { stockStatus: toOptions(STOCK_STATUS), expiryStatus: toOptions(EXPIRY_STATUS) },
  columns: [
    { key: "name", label: "Product", sortable: true },
    { key: "sku", label: "SKU", sortable: true },
    { key: "available", label: "Available", align: "right", sortable: true },
    { key: "expiredSaleable", label: "Expired (in stock)", align: "right" },
    { key: "quarantine", label: "Quarantine", align: "right" },
    { key: "damaged", label: "Damaged", align: "right" },
    { key: "dispatched", label: "Dispatched", align: "right", sortable: true },
    { key: "returned", label: "Returned", align: "right", sortable: true },
    { key: "adjusted", label: "Adjustments", align: "right" },
    { key: "threshold", label: "Low-stock at", align: "right", sortable: true },
    { key: "stockStatus", label: "Stock status", sortable: true },
    { key: "expiryStatus", label: "Expiry status" },
    { key: "lastTxn", label: "Last updated", sortable: true },
    { key: "category", label: "Category", csvOnly: true },
    { key: "unit", label: "Unit", csvOnly: true },
  ],
  defaultSort: "name",
  defaultDir: "asc",
  async run(f, ctx) {
    const { rows, total } = await runStock(f, ctx);
    return {
      total,
      rows: rows.map((r) => ({
        name: link(r.name, `/products/${r.id}`),
        sku: r.sku,
        available: `${qty(r.available)} ${r.unit}`,
        expiredSaleable: qty(r.expiredSaleable),
        quarantine: qty(r.quarantine),
        damaged: qty(r.damaged),
        dispatched: qty(r.dispatched),
        returned: qty(r.returned),
        adjusted: qty(r.adjusted),
        threshold: qty(r.threshold),
        stockStatus: badge(STOCK_STATUS, r.stockStatus),
        expiryStatus: badge(EXPIRY_STATUS, r.expiryStatus),
        lastTxn: r.lastTxn ? dt(ctx, r.lastTxn) : "—",
        category: r.category ?? "",
        unit: r.unit,
      })),
    };
  },
};

const productMaster: ReportDef = {
  key: "pr-master",
  title: "Product master report",
  description: "All products with their configured thresholds and expiry alert periods.",
  module: "product",
  permission: ["product.view", "product.reports"],
  filters: ["q", "categoryId", "status"],
  options: {
    status: [
      { value: "ACTIVE", label: "Active" },
      { value: "INACTIVE", label: "Inactive" },
      { value: "DELETED", label: "Deleted" },
    ],
  },
  columns: [
    { key: "code", label: "Product ID", sortable: true },
    { key: "name", label: "Product", sortable: true },
    { key: "sku", label: "SKU", sortable: true },
    { key: "barcode", label: "Barcode" },
    { key: "category", label: "Category", sortable: true },
    { key: "unit", label: "Unit" },
    { key: "threshold", label: "Low-stock threshold", align: "right", sortable: true },
    { key: "alertDays", label: "Expiry alert (days)", align: "right", sortable: true },
    { key: "tracksExpiry", label: "Tracks expiry" },
    { key: "status", label: "Status" },
    { key: "actions", label: "", screenOnly: true },
  ],
  defaultSort: "name",
  defaultDir: "asc",
  async run(f, ctx) {
    const where: Prisma.ReadyProductWhereInput = {
      categoryId: f.categoryId || undefined,
      active: f.status === "ACTIVE" ? true : f.status === "INACTIVE" ? false : undefined,
      deletedAt: f.status === "DELETED" ? { not: null } : null,
      ...(f.q
        ? {
            OR: [
              { name: { contains: f.q, mode: "insensitive" } },
              { sku: { contains: f.q, mode: "insensitive" } },
              { barcode: { contains: f.q, mode: "insensitive" } },
              { productCode: { contains: f.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const sorts: Record<string, Prisma.ReadyProductOrderByWithRelationInput> = {
      code: { productCode: ctx.dir },
      name: { name: ctx.dir },
      sku: { sku: ctx.dir },
      category: { category: { name: ctx.dir } },
      threshold: { lowStockThreshold: ctx.dir },
      alertDays: { expiryAlertDays: ctx.dir },
    };
    const [rows, total] = await Promise.all([
      prisma.readyProduct.findMany({
        where,
        include: { category: true, unit: true },
        orderBy: [sorts[ctx.sort ?? "name"] ?? sorts.name, { sku: "asc" }],
        ...paging(ctx),
      }),
      prisma.readyProduct.count({ where }),
    ]);
    return {
      total,
      rows: rows.map((p) => ({
        code: p.productCode,
        name: link(p.name, `/products/${p.id}`),
        sku: p.sku,
        barcode: p.barcode ?? "—",
        category: p.category?.name ?? "—",
        unit: p.unit.code,
        threshold: qty(p.lowStockThreshold),
        alertDays: p.tracksExpiry ? p.expiryAlertDays : "—",
        tracksExpiry: p.tracksExpiry ? "Yes" : "No",
        status: p.deletedAt
          ? { text: "Deleted", tone: "muted" }
          : p.active
            ? { text: "Active", tone: "success" }
            : { text: "Inactive", tone: "muted" },
        actions: can(ctx.actor, "admin.masters")
          ? p.deletedAt
            ? { text: "", actions: [{ label: "Restore", kind: "restoreProduct", id: p.id, name: p.name }] }
            : {
                text: "",
                actions: [
                  { label: "Edit", href: `/products/${p.id}/edit` },
                  { label: "Delete", kind: "deleteProduct", id: p.id, name: p.name },
                ],
              }
          : null,
      })),
    };
  },
};

function batchReport(key: string, title: string, description: string, onlyAlerts: boolean): ReportDef {
  return {
    key,
    title,
    description,
    module: "product",
    permission: ["product.view", "product.reports"],
    filters: ["q", "productId", "categoryId", "expiryStatus", "from", "to"],
    options: { expiryStatus: toOptions(EXPIRY_STATUS) },
    dateFilterLabel: "Expiry date",
    defaults: onlyAlerts ? {} : {},
    columns: [
      { key: "batchNo", label: "Batch", sortable: true },
      { key: "product", label: "Product", sortable: true },
      { key: "sku", label: "SKU" },
      { key: "received", label: "Received", sortable: true },
      { key: "expiry", label: "Expiry date", sortable: true },
      { key: "days", label: "Days left", align: "right", sortable: true },
      { key: "initial", label: "Batch qty", align: "right" },
      { key: "remaining", label: "Remaining (saleable)", align: "right", sortable: true },
      { key: "quarantine", label: "Quarantine", align: "right" },
      { key: "damaged", label: "Damaged", align: "right" },
      { key: "expired", label: "Expired bucket", align: "right" },
      { key: "status", label: "Expiry status", sortable: true },
    ],
    defaultSort: "expiry",
    defaultDir: "asc",
    async run(f, ctx) {
      const parts: Prisma.Sql[] = [];
      if (f.productId) parts.push(Prisma.sql`x."productId" = ${f.productId}`);
      if (f.categoryId) parts.push(Prisma.sql`x."categoryId" = ${f.categoryId}`);
      if (f.q) parts.push(Prisma.sql`(x."batchNo" ILIKE ${like(f.q)} OR x."product" ILIKE ${like(f.q)} OR x."sku" ILIKE ${like(f.q)})`);
      if (f.from) parts.push(Prisma.sql`x."expiryDate" >= ${f.from}::date`);
      if (f.to) parts.push(Prisma.sql`x."expiryDate" <= ${f.to}::date`);
      if (f.expiryStatus && f.expiryStatus in EXPIRY_STATUS) parts.push(Prisma.sql`x."status" = ${f.expiryStatus}`);
      if (onlyAlerts) parts.push(Prisma.sql`x."remaining" > 0 AND x."status" IN ('EXPIRED', 'NEAR_EXPIRY')`);
      const base = Prisma.sql`
        WITH x AS (
          SELECT b."id", b."batchNo", b."productId", p."name" AS product, p."sku", p."categoryId", u."code" AS unit,
            b."receivedDate", b."expiryDate", b."initialQty",
            COALESCE(SUM(sb."quantity") FILTER (WHERE sb."bucket" = 'SALEABLE'), 0) AS remaining,
            COALESCE(SUM(sb."quantity") FILTER (WHERE sb."bucket" = 'QUARANTINE'), 0) AS quarantine,
            COALESCE(SUM(sb."quantity") FILTER (WHERE sb."bucket" = 'DAMAGED'), 0) AS damaged,
            COALESCE(SUM(sb."quantity") FILTER (WHERE sb."bucket" = 'EXPIRED'), 0) AS expired,
            CASE WHEN b."expiryDate" IS NULL THEN 'NO_EXPIRY'
                 WHEN b."expiryDate" < ${ctx.today}::date THEN 'EXPIRED'
                 WHEN b."expiryDate" <= ${ctx.today}::date + p."expiryAlertDays" THEN 'NEAR_EXPIRY'
                 ELSE 'OK' END AS status
          FROM "ProductBatch" b
          JOIN "ReadyProduct" p ON p."id" = b."productId"
          JOIN "Unit" u ON u."id" = p."unitId"
          LEFT JOIN "StockBalance" sb ON sb."batchId" = b."id"
          GROUP BY b."id", p."id", u."code"
        )
        SELECT * FROM x ${and(parts)}`;
      const order = sqlOrder(
        {
          batchNo: `"batchNo"`,
          product: `"product"`,
          received: `"receivedDate"`,
          expiry: `"expiryDate"`,
          days: `"expiryDate"`,
          remaining: `"remaining"`,
          status: `"status"`,
        },
        ctx.sort ?? "expiry",
        ctx.dir,
      );
      const [rows, count] = await Promise.all([
        prisma.$queryRaw<
          {
            id: string;
            batchNo: string;
            productId: string;
            product: string;
            sku: string;
            unit: string;
            receivedDate: Date;
            expiryDate: Date | null;
            initialQty: Prisma.Decimal;
            remaining: Prisma.Decimal;
            quarantine: Prisma.Decimal;
            damaged: Prisma.Decimal;
            expired: Prisma.Decimal;
            status: string;
          }[]
        >`
          SELECT * FROM (${base}) s ORDER BY ${order}, "batchNo" ASC ${sqlPaging(ctx)}`,
        prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (${base}) s`,
      ]);
      return {
        total: Number(count[0]?.n ?? 0),
        rows: rows.map((b) => {
          const exp = dateOnlyString(b.expiryDate);
          return {
            batchNo: b.batchNo,
            product: link(b.product, `/products/${b.productId}`),
            sku: b.sku,
            received: calDay(ctx, b.receivedDate),
            expiry: calDay(ctx, b.expiryDate),
            days: exp ? daysBetween(ctx.today, exp) : "—",
            initial: qty(b.initialQty),
            remaining: `${qty(b.remaining)} ${b.unit}`,
            quarantine: qty(b.quarantine),
            damaged: qty(b.damaged),
            expired: qty(b.expired),
            status: badge(EXPIRY_STATUS, b.status),
          };
        }),
      };
    },
  };
}

export const lowStock: ReportDef = {
  key: "pr-low-stock",
  title: "Low-stock report",
  description: "Active products whose available stock is at or below their own low-stock threshold.",
  module: "product",
  permission: ["product.view", "product.reports"],
  filters: ["q", "categoryId"],
  columns: [
    { key: "name", label: "Product", sortable: true },
    { key: "sku", label: "SKU", sortable: true },
    { key: "available", label: "Available", align: "right", sortable: true },
    { key: "threshold", label: "Threshold", align: "right", sortable: true },
    { key: "below", label: "Below threshold by", align: "right" },
    { key: "status", label: "Alert status" },
    { key: "since", label: "Alert since" },
  ],
  defaultSort: "available",
  defaultDir: "asc",
  async run(f, ctx) {
    const base = productStockSql(ctx.today, f);
    const filtered = Prisma.sql`SELECT * FROM (${base}) s WHERE s."active" = true AND s."threshold" > 0 AND s."available" <= s."threshold"`;
    const [rows, count] = await Promise.all([
      prisma.$queryRaw<StockRow[]>`${filtered} ORDER BY ${sqlOrder(STOCK_SORT, ctx.sort ?? "available", ctx.dir)} ${sqlPaging(ctx)}`,
      prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (${filtered}) c`,
    ]);
    const alerts = await prisma.lowStockAlert.findMany({ where: { status: "OPEN", productId: { in: rows.map((r) => r.id) } } });
    return {
      total: Number(count[0]?.n ?? 0),
      rows: rows.map((r) => {
        const alert = alerts.find((a) => a.productId === r.id);
        return {
          name: link(r.name, `/products/${r.id}`),
          sku: r.sku,
          available: `${qty(r.available)} ${r.unit}`,
          threshold: qty(r.threshold),
          below: qty(new Prisma.Decimal(r.threshold).minus(r.available)),
          status: Number(r.available) <= 0 ? { text: "Out of stock", tone: "danger" } : { text: "Low stock", tone: "warning" },
          since: alert ? dt(ctx, alert.triggeredAt) : "—",
        };
      }),
    };
  },
};

export const productLedger: ReportDef = {
  key: "pr-ledger",
  title: "Stock movement ledger",
  description: "Every posted ready-product stock movement by batch and stock bucket.",
  module: "product",
  permission: PR_REPORT,
  filters: ["q", "from", "to", "productId", "categoryId", "txnType", "storeId"],
  options: { txnType: toOptions(Object.fromEntries(Object.entries(PRODUCT_TXN_TYPE).filter(([k]) => k !== "SALE"))) },
  filterLabels: { txnType: "Transaction type" },
  columns: [
    { key: "txnNo", label: "Txn ID", sortable: true },
    { key: "date", label: "Date", sortable: true },
    { key: "product", label: "Product", sortable: true },
    { key: "sku", label: "SKU" },
    { key: "batch", label: "Batch" },
    { key: "type", label: "Type", sortable: true },
    { key: "bucket", label: "Bucket" },
    { key: "quantity", label: "Quantity", align: "right", sortable: true },
    { key: "store", label: "Store" },
    { key: "reference", label: "Reference" },
    { key: "notes", label: "Notes" },
    { key: "user", label: "Recorded by" },
  ],
  defaultSort: "date",
  async run(f, ctx) {
    const where: Prisma.ProductTransactionWhereInput = {
      createdAt: range(f, ctx),
      productId: f.productId || undefined,
      storeId: f.storeId || undefined,
      type: f.txnType && f.txnType in PRODUCT_TXN_TYPE && f.txnType !== "SALE" ? (f.txnType as never) : undefined,
      product: f.categoryId ? { categoryId: f.categoryId } : undefined,
      ...(f.q
        ? {
            OR: [
              { txnNo: { contains: f.q, mode: "insensitive" } },
              { reference: { contains: f.q, mode: "insensitive" } },
              { product: { name: { contains: f.q, mode: "insensitive" } } },
              { product: { sku: { contains: f.q, mode: "insensitive" } } },
              { batch: { batchNo: { contains: f.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const sorts: Record<string, Prisma.ProductTransactionOrderByWithRelationInput> = {
      txnNo: { txnNo: ctx.dir },
      date: { createdAt: ctx.dir },
      product: { product: { name: ctx.dir } },
      type: { type: ctx.dir },
      quantity: { quantity: ctx.dir },
    };
    const [rows, total] = await Promise.all([
      prisma.productTransaction.findMany({
        where,
        include: { product: true, batch: true, unit: true, store: true, createdBy: { select: { name: true } } },
        orderBy: [sorts[ctx.sort ?? "date"] ?? sorts.date, { txnNo: ctx.dir }],
        ...paging(ctx),
      }),
      prisma.productTransaction.count({ where }),
    ]);
    return {
      total,
      rows: rows.map((t) => ({
        txnNo: t.txnNo,
        date: dt(ctx, t.createdAt),
        product: link(t.product.name, `/products/${t.productId}`),
        sku: t.product.sku,
        batch: t.batch.batchNo,
        type: PRODUCT_TXN_TYPE[t.type] ?? t.type,
        bucket: badge(BUCKET, t.bucket),
        quantity: `${t.quantity.gt(0) ? "+" : ""}${qty(t.quantity)} ${t.unit.code}`,
        store: t.store?.name ?? "—",
        reference: t.reference ?? "—",
        notes: t.notes ?? "—",
        user: t.createdBy.name,
      })),
    };
  },
};

const adjustmentReport: ReportDef = {
  key: "pr-adjustments",
  title: "Manual adjustment report",
  description: "Authorized stock corrections with their mandatory reasons.",
  module: "product",
  permission: PR_REPORT,
  filters: ["q", "from", "to", "productId", "categoryId"],
  columns: [
    { key: "adjustmentNo", label: "Adjustment", sortable: true },
    { key: "date", label: "Date", sortable: true },
    { key: "product", label: "Product", sortable: true },
    { key: "sku", label: "SKU" },
    { key: "batch", label: "Batch" },
    { key: "bucket", label: "Bucket" },
    { key: "delta", label: "Change", align: "right", sortable: true },
    { key: "reason", label: "Reason" },
    { key: "user", label: "Authorized by" },
  ],
  defaultSort: "date",
  async run(f, ctx) {
    const where: Prisma.InventoryAdjustmentWhereInput = {
      createdAt: range(f, ctx),
      productId: f.productId || undefined,
      product: f.categoryId ? { categoryId: f.categoryId } : undefined,
      ...(f.q
        ? {
            OR: [
              { adjustmentNo: { contains: f.q, mode: "insensitive" } },
              { reason: { contains: f.q, mode: "insensitive" } },
              { product: { name: { contains: f.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const sorts: Record<string, Prisma.InventoryAdjustmentOrderByWithRelationInput> = {
      adjustmentNo: { adjustmentNo: ctx.dir },
      date: { createdAt: ctx.dir },
      product: { product: { name: ctx.dir } },
      delta: { quantityDelta: ctx.dir },
    };
    const [rows, total] = await Promise.all([
      prisma.inventoryAdjustment.findMany({
        where,
        include: { product: { include: { unit: true } }, batch: true, createdBy: { select: { name: true } } },
        orderBy: [sorts[ctx.sort ?? "date"] ?? sorts.date, { adjustmentNo: ctx.dir }],
        ...paging(ctx),
      }),
      prisma.inventoryAdjustment.count({ where }),
    ]);
    return {
      total,
      rows: rows.map((a) => ({
        adjustmentNo: a.adjustmentNo,
        date: dt(ctx, a.createdAt),
        product: link(a.product.name, `/products/${a.productId}`),
        sku: a.product.sku,
        batch: a.batch.batchNo,
        bucket: badge(BUCKET, a.bucket),
        delta: `${a.quantityDelta.gt(0) ? "+" : ""}${qty(a.quantityDelta)} ${a.product.unit.code}`,
        reason: a.reason,
        user: a.createdBy.name,
      })),
    };
  },
};

export const productReports: ReportDef[] = [
  productStock,
  productMaster,
  batchReport(
    "pr-batches",
    "Batch-wise stock report",
    "Each batch with its expiry date and remaining quantity in every stock bucket.",
    false,
  ),
  batchReport(
    "pr-expiry",
    "Expiry report",
    "Batches with saleable stock that have expired or fall inside their product's expiry alert period.",
    true,
  ),
  lowStock,
  productLedger,
  adjustmentReport,
];
