import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ATTACHMENT_STATUS, DOC_STATUS, PRODUCT_TXN_TYPE, RETURN_CONDITION, BUCKET, toOptions } from "@/lib/labels";
import { CATEGORY_LABEL } from "../services/attachments";
import { and, badge, dt, like, link, paging, qty, range, sqlOrder, sqlPaging } from "./util";
import type { Filters, ReportDef, RunContext } from "./types";

const EC_REPORT = ["ecom.reports"] as ReportDef["permission"];

const MOVEMENT_FILTERS: ReportDef["filters"] = ["from", "to", "storeId", "productId", "sku", "ref"];

/** WHERE parts for posted dispatch lines (alias d = Dispatch, l = DispatchLine, p = ReadyProduct). */
function dispatchParts(f: Filters, ctx: RunContext, opts: { includeReversed?: boolean } = {}) {
  const r = range(f, ctx);
  const parts: Prisma.Sql[] = [];
  if (!opts.includeReversed) parts.push(Prisma.sql`d."status" = 'POSTED'`);
  else if (f.status === "POSTED" || f.status === "REVERSED") parts.push(Prisma.sql`d."status" = ${f.status}::"DocStatus"`);
  if (r?.gte) parts.push(Prisma.sql`d."dispatchDate" >= ${r.gte}`);
  if (r?.lt) parts.push(Prisma.sql`d."dispatchDate" < ${r.lt}`);
  if (f.storeId) parts.push(Prisma.sql`d."storeId" = ${f.storeId}`);
  if (f.productId) parts.push(Prisma.sql`l."productId" = ${f.productId}`);
  if (f.sku) parts.push(Prisma.sql`p."sku" ILIKE ${like(f.sku)}`);
  if (f.ref)
    parts.push(
      Prisma.sql`(d."dispatchNo" ILIKE ${like(f.ref)} OR d."orderRef" ILIKE ${like(f.ref)} OR d."invoiceNumber" ILIKE ${like(f.ref)})`,
    );
  return parts;
}

/** WHERE parts for posted return lines (alias r = ProductReturn, rl = ProductReturnLine, d = Dispatch, p = ReadyProduct). */
function returnParts(f: Filters, ctx: RunContext, opts: { includeReversed?: boolean } = {}) {
  const rg = range(f, ctx);
  const parts: Prisma.Sql[] = [];
  if (!opts.includeReversed) parts.push(Prisma.sql`r."status" = 'POSTED'`);
  else if (f.status === "POSTED" || f.status === "REVERSED") parts.push(Prisma.sql`r."status" = ${f.status}::"DocStatus"`);
  if (rg?.gte) parts.push(Prisma.sql`r."returnDate" >= ${rg.gte}`);
  if (rg?.lt) parts.push(Prisma.sql`r."returnDate" < ${rg.lt}`);
  if (f.storeId) parts.push(Prisma.sql`r."storeId" = ${f.storeId}`);
  if (f.productId) parts.push(Prisma.sql`rl."productId" = ${f.productId}`);
  if (f.sku) parts.push(Prisma.sql`p."sku" ILIKE ${like(f.sku)}`);
  if (f.condition && f.condition in RETURN_CONDITION) parts.push(Prisma.sql`rl."condition" = ${f.condition}::"ReturnCondition"`);
  if (f.ref)
    parts.push(
      Prisma.sql`(r."returnNo" ILIKE ${like(f.ref)} OR d."dispatchNo" ILIKE ${like(f.ref)} OR d."orderRef" ILIKE ${like(f.ref)} OR d."invoiceNumber" ILIKE ${like(f.ref)})`,
    );
  return parts;
}

/**
 * Period totals shown on e-commerce reports and the dashboard.
 * Net sent out = dispatched − returned for the selected period. This is a stock
 * movement measure, not marketplace sales.
 */
export async function ecomPeriodTotals(f: Filters, ctx: RunContext) {
  const [disp, ret] = await Promise.all([
    prisma.$queryRaw<{ unit: string; qty: Prisma.Decimal; docs: bigint }[]>`
      SELECT u."code" AS unit, SUM(l."quantity") AS qty, COUNT(DISTINCT d."id") AS docs
      FROM "DispatchLine" l JOIN "Dispatch" d ON d."id" = l."dispatchId" JOIN "ReadyProduct" p ON p."id" = l."productId" JOIN "Unit" u ON u."id" = p."unitId"
      ${and(dispatchParts(f, ctx))} GROUP BY u."code"`,
    prisma.$queryRaw<{ unit: string; qty: Prisma.Decimal; docs: bigint }[]>`
      SELECT u."code" AS unit, SUM(rl."quantity") AS qty, COUNT(DISTINCT r."id") AS docs
      FROM "ProductReturnLine" rl JOIN "ProductReturn" r ON r."id" = rl."returnId" JOIN "Dispatch" d ON d."id" = r."dispatchId"
      JOIN "ReadyProduct" p ON p."id" = rl."productId" JOIN "Unit" u ON u."id" = p."unitId"
      ${and(returnParts(f, ctx))} GROUP BY u."code"`,
  ]);
  const units = [...new Set([...disp.map((d) => d.unit), ...ret.map((r) => r.unit)])];
  const fmt = (rows: { unit: string; qty: Prisma.Decimal }[], unit: string) =>
    new Prisma.Decimal(rows.find((r) => r.unit === unit)?.qty ?? 0);
  const join = (parts: string[]) => parts.join(" · ") || "0";
  const dispatchDocs = disp.reduce((a, d) => a + Number(d.docs), 0);
  const returnDocs = ret.reduce((a, r) => a + Number(r.docs), 0);
  return {
    byUnit: units.map((u) => ({ unit: u, dispatched: fmt(disp, u), returned: fmt(ret, u), net: fmt(disp, u).minus(fmt(ret, u)) })),
    dispatchDocs,
    returnDocs,
    summary: [
      { label: "Total dispatched", value: join(units.map((u) => `${qty(fmt(disp, u))} ${u}`)) },
      { label: "Total returned", value: join(units.map((u) => `${qty(fmt(ret, u))} ${u}`)) },
      {
        label: "Net sent out",
        value: join(units.map((u) => `${qty(fmt(disp, u).minus(fmt(ret, u)))} ${u}`)),
        hint: "Dispatched − returned. Not marketplace sales.",
      },
      { label: "Transactions", value: String(dispatchDocs + returnDocs), hint: `${dispatchDocs} dispatches · ${returnDocs} returns` },
    ],
  };
}

function groupedMovement(
  key: string,
  title: string,
  description: string,
  by: "store" | "product",
  kind: "dispatch" | "return" | "net",
): ReportDef {
  const nameKey = by === "store" ? "store" : "product";
  const cols: ReportDef["columns"] = [
    { key: nameKey, label: by === "store" ? "Store" : "Product", sortable: true },
    ...(by === "product" ? [{ key: "sku", label: "SKU", sortable: true }] : [{ key: "storeType", label: "Type" }]),
    { key: "unit", label: "Unit" },
  ];
  if (kind !== "return")
    cols.push(
      { key: "dispatches", label: "Dispatches", align: "right", sortable: true },
      { key: "dispatched", label: "Qty dispatched", align: "right", sortable: true },
    );
  if (kind !== "dispatch")
    cols.push(
      { key: "returns", label: "Returns", align: "right", sortable: true },
      { key: "returned", label: "Qty returned", align: "right", sortable: true },
    );
  if (kind === "return")
    cols.push(
      { key: "saleable", label: "Saleable", align: "right" },
      { key: "damaged", label: "Damaged", align: "right" },
      { key: "expired", label: "Expired", align: "right" },
      { key: "pending", label: "Pending insp.", align: "right" },
    );
  if (kind === "net")
    cols.push(
      { key: "net", label: "Net sent out", align: "right", sortable: true },
      { key: "sold", label: "Reported sold", align: "right" },
      { key: "txns", label: "Transactions", align: "right", sortable: true },
    );

  return {
    key,
    title,
    description,
    module: "ecom",
    permission: EC_REPORT,
    filters: kind === "return" ? [...MOVEMENT_FILTERS, "condition"] : MOVEMENT_FILTERS,
    options: { condition: toOptions(RETURN_CONDITION) },
    filterLabels: { ref: "Reference / invoice no." },
    columns: cols,
    defaultSort: kind === "return" ? "returned" : "dispatched",
    async run(f, ctx) {
      // Store rows are grouped per (store, unit) so incompatible units are never added together.
      const groupId = by === "store" ? Prisma.sql`s."id" || '|' || u."code"` : Prisma.sql`p."id"`;
      const dSql = Prisma.sql`
        SELECT ${groupId} AS gid, COUNT(DISTINCT d."id") AS docs, SUM(l."quantity") AS qty
        FROM "DispatchLine" l JOIN "Dispatch" d ON d."id" = l."dispatchId" JOIN "Store" s ON s."id" = d."storeId"
        JOIN "ReadyProduct" p ON p."id" = l."productId" JOIN "Unit" u ON u."id" = p."unitId"
        ${and(dispatchParts(f, ctx))} GROUP BY 1`;
      const rSql = Prisma.sql`
        SELECT ${groupId} AS gid, COUNT(DISTINCT r."id") AS docs, SUM(rl."quantity") AS qty,
          SUM(rl."quantity") FILTER (WHERE rl."condition" = 'SALEABLE') AS saleable,
          SUM(rl."quantity") FILTER (WHERE rl."condition" = 'DAMAGED') AS damaged,
          SUM(rl."quantity") FILTER (WHERE rl."condition" = 'EXPIRED') AS expired,
          SUM(rl."quantity") FILTER (WHERE rl."condition" = 'PENDING_INSPECTION') AS pending
        FROM "ProductReturnLine" rl JOIN "ProductReturn" r ON r."id" = rl."returnId" JOIN "Dispatch" d ON d."id" = r."dispatchId"
        JOIN "Store" s ON s."id" = r."storeId" JOIN "ReadyProduct" p ON p."id" = rl."productId" JOIN "Unit" u ON u."id" = p."unitId"
        ${and(returnParts(f, ctx))} GROUP BY 1`;
      const rg = range(f, ctx);
      const saleParts: Prisma.Sql[] = [];
      if (rg?.gte) saleParts.push(Prisma.sql`ss."saleDate" >= ${rg.gte}`);
      if (rg?.lt) saleParts.push(Prisma.sql`ss."saleDate" < ${rg.lt}`);
      if (f.storeId) saleParts.push(Prisma.sql`ss."storeId" = ${f.storeId}`);
      if (f.productId) saleParts.push(Prisma.sql`ss."productId" = ${f.productId}`);
      if (f.sku) saleParts.push(Prisma.sql`p."sku" ILIKE ${like(f.sku)}`);
      const saleGroup = by === "store" ? Prisma.sql`ss."storeId" || '|' || u."code"` : Prisma.sql`ss."productId"`;
      const sSql = Prisma.sql`
        SELECT ${saleGroup} AS gid, SUM(ss."quantity") AS qty
        FROM "StoreSale" ss JOIN "ReadyProduct" p ON p."id" = ss."productId" JOIN "Unit" u ON u."id" = p."unitId"
        ${and(saleParts)} GROUP BY 1`;

      const entity =
        by === "store"
          ? Prisma.sql`SELECT s."id" || '|' || u."code" AS gid, s."id", s."name", s."storeType" AS extra, u."code" AS unit FROM "Store" s CROSS JOIN "Unit" u`
          : Prisma.sql`SELECT p."id" AS gid, p."id", p."name", p."sku" AS extra, u."code" AS unit FROM "ReadyProduct" p JOIN "Unit" u ON u."id" = p."unitId"`;

      const query = Prisma.sql`
        WITH e AS (${entity}), dq AS (${dSql}), rq AS (${rSql}), sq AS (${sSql})
        SELECT e."id", e."name", e."extra", e."unit",
          COALESCE(dq.docs, 0) AS dispatches, COALESCE(dq.qty, 0) AS dispatched,
          COALESCE(rq.docs, 0) AS returns, COALESCE(rq.qty, 0) AS returned,
          COALESCE(rq.saleable, 0) AS saleable, COALESCE(rq.damaged, 0) AS damaged, COALESCE(rq.expired, 0) AS expired, COALESCE(rq.pending, 0) AS pending,
          COALESCE(dq.qty, 0) - COALESCE(rq.qty, 0) AS net, COALESCE(sq.qty, 0) AS sold,
          COALESCE(dq.docs, 0) + COALESCE(rq.docs, 0) AS txns
        FROM e LEFT JOIN dq ON dq.gid = e.gid LEFT JOIN rq ON rq.gid = e.gid LEFT JOIN sq ON sq.gid = e.gid
        WHERE ${kind === "dispatch" ? Prisma.sql`dq.gid IS NOT NULL` : kind === "return" ? Prisma.sql`rq.gid IS NOT NULL` : Prisma.sql`(dq.gid IS NOT NULL OR rq.gid IS NOT NULL)`}`;
      const order = sqlOrder(
        {
          [nameKey]: `"name"`,
          sku: `"extra"`,
          dispatches: `"dispatches"`,
          dispatched: `"dispatched"`,
          returns: `"returns"`,
          returned: `"returned"`,
          net: `"net"`,
          txns: `"txns"`,
        },
        ctx.sort ?? (kind === "return" ? "returned" : "dispatched"),
        ctx.dir,
      );
      type Row = {
        id: string;
        name: string;
        extra: string;
        unit: string;
        dispatches: bigint;
        dispatched: Prisma.Decimal;
        returns: bigint;
        returned: Prisma.Decimal;
        saleable: Prisma.Decimal;
        damaged: Prisma.Decimal;
        expired: Prisma.Decimal;
        pending: Prisma.Decimal;
        net: Prisma.Decimal;
        sold: Prisma.Decimal;
        txns: bigint;
      };
      const [rows, count, totals] = await Promise.all([
        prisma.$queryRaw<Row[]>`SELECT * FROM (${query}) z ORDER BY ${order}, "name" ASC ${sqlPaging(ctx)}`,
        prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (${query}) z`,
        ecomPeriodTotals(f, ctx),
      ]);
      return {
        total: Number(count[0]?.n ?? 0),
        summary: totals.summary,
        rows: rows.map((r) => ({
          [nameKey]: by === "store" ? r.name : link(r.name, `/products/${r.id}`),
          sku: r.extra,
          storeType: r.extra,
          unit: r.unit,
          dispatches: Number(r.dispatches),
          dispatched: qty(r.dispatched),
          returns: Number(r.returns),
          returned: qty(r.returned),
          saleable: qty(r.saleable),
          damaged: qty(r.damaged),
          expired: qty(r.expired),
          pending: qty(r.pending),
          net: qty(r.net),
          sold: qty(r.sold),
          txns: Number(r.txns),
        })),
      };
    },
  };
}

export const dispatchRegister: ReportDef = {
  key: "ec-dispatch-register",
  title: "Dispatch register",
  description: "Every dispatch line sent to stores, with returned quantities.",
  module: "ecom",
  permission: ["ecom.view", "ecom.reports"],
  filters: [...MOVEMENT_FILTERS, "status"],
  options: { status: toOptions(DOC_STATUS) },
  filterLabels: { ref: "Reference / invoice no.", status: "Document status" },
  columns: [
    { key: "dispatchNo", label: "Dispatch ID", sortable: true },
    { key: "date", label: "Date", sortable: true },
    { key: "store", label: "Store", sortable: true },
    { key: "product", label: "Product", sortable: true },
    { key: "sku", label: "SKU" },
    { key: "quantity", label: "Qty sent", align: "right", sortable: true },
    { key: "returned", label: "Returned", align: "right" },
    { key: "orderRef", label: "Order / shipment ref" },
    { key: "invoice", label: "Invoice no." },
    { key: "status", label: "Status" },
    { key: "user", label: "Recorded by" },
  ],
  defaultSort: "date",
  async run(f, ctx) {
    const parts = dispatchParts(f, ctx, { includeReversed: true });
    const base = Prisma.sql`
      FROM "DispatchLine" l JOIN "Dispatch" d ON d."id" = l."dispatchId" JOIN "Store" s ON s."id" = d."storeId"
      JOIN "ReadyProduct" p ON p."id" = l."productId" JOIN "Unit" u ON u."id" = p."unitId" JOIN "User" us ON us."id" = d."createdById"
      ${and(parts)}`;
    const order = sqlOrder(
      { dispatchNo: `d."dispatchNo"`, date: `d."dispatchDate"`, store: `s."name"`, product: `p."name"`, quantity: `l."quantity"` },
      ctx.sort ?? "date",
      ctx.dir,
    );
    const [rows, count, totals] = await Promise.all([
      prisma.$queryRaw<
        {
          id: string;
          dispatchNo: string;
          dispatchDate: Date;
          store: string;
          productId: string;
          product: string;
          sku: string;
          unit: string;
          quantity: Prisma.Decimal;
          returnedQty: Prisma.Decimal;
          orderRef: string | null;
          invoiceNumber: string | null;
          status: string;
          user: string;
        }[]
      >`
        SELECT d."id", d."dispatchNo", d."dispatchDate", s."name" AS store, p."id" AS "productId", p."name" AS product, p."sku", u."code" AS unit,
          l."quantity", l."returnedQty", d."orderRef", d."invoiceNumber", d."status", us."name" AS user
        ${base} ORDER BY ${order}, d."dispatchNo" DESC, l."lineNo" ASC ${sqlPaging(ctx)}`,
      prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n ${base}`,
      ecomPeriodTotals(f, ctx),
    ]);
    return {
      total: Number(count[0]?.n ?? 0),
      summary: totals.summary,
      rows: rows.map((r) => ({
        dispatchNo: link(r.dispatchNo, `/ecommerce/dispatches/${r.id}`),
        date: dt(ctx, r.dispatchDate),
        store: r.store,
        product: r.product,
        sku: r.sku,
        quantity: `${qty(r.quantity)} ${r.unit}`,
        returned: qty(r.returnedQty),
        orderRef: r.orderRef ?? "—",
        invoice: r.invoiceNumber ?? "—",
        status: badge(DOC_STATUS, r.status),
        user: r.user,
      })),
    };
  },
};

export const returnRegister: ReportDef = {
  key: "ec-return-register",
  title: "Return register",
  description: "Every returned product line with its condition and original dispatch.",
  module: "ecom",
  permission: ["ecom.view", "ecom.reports"],
  filters: [...MOVEMENT_FILTERS, "condition", "status"],
  options: { condition: toOptions(RETURN_CONDITION), status: toOptions(DOC_STATUS) },
  filterLabels: { ref: "Reference / invoice no.", status: "Document status" },
  columns: [
    { key: "returnNo", label: "Return ID", sortable: true },
    { key: "date", label: "Date", sortable: true },
    { key: "store", label: "Store", sortable: true },
    { key: "dispatch", label: "Original dispatch" },
    { key: "product", label: "Product", sortable: true },
    { key: "sku", label: "SKU" },
    { key: "quantity", label: "Qty returned", align: "right", sortable: true },
    { key: "condition", label: "Condition" },
    { key: "reason", label: "Reason" },
    { key: "status", label: "Status" },
    { key: "user", label: "Recorded by" },
  ],
  defaultSort: "date",
  async run(f, ctx) {
    const parts = returnParts(f, ctx, { includeReversed: true });
    const base = Prisma.sql`
      FROM "ProductReturnLine" rl JOIN "ProductReturn" r ON r."id" = rl."returnId" JOIN "Dispatch" d ON d."id" = r."dispatchId"
      JOIN "Store" s ON s."id" = r."storeId" JOIN "ReadyProduct" p ON p."id" = rl."productId" JOIN "Unit" u ON u."id" = p."unitId"
      JOIN "User" us ON us."id" = r."createdById"
      ${and(parts)}`;
    const order = sqlOrder(
      { returnNo: `r."returnNo"`, date: `r."returnDate"`, store: `s."name"`, product: `p."name"`, quantity: `rl."quantity"` },
      ctx.sort ?? "date",
      ctx.dir,
    );
    const [rows, count, totals] = await Promise.all([
      prisma.$queryRaw<
        {
          id: string;
          returnNo: string;
          returnDate: Date;
          store: string;
          dispatchId: string;
          dispatchNo: string;
          product: string;
          sku: string;
          unit: string;
          quantity: Prisma.Decimal;
          condition: string;
          reason: string;
          status: string;
          user: string;
        }[]
      >`
        SELECT r."id", r."returnNo", r."returnDate", s."name" AS store, d."id" AS "dispatchId", d."dispatchNo", p."name" AS product, p."sku", u."code" AS unit,
          rl."quantity", rl."condition", r."reason", r."status", us."name" AS user
        ${base} ORDER BY ${order}, r."returnNo" DESC ${sqlPaging(ctx)}`,
      prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n ${base}`,
      ecomPeriodTotals(f, ctx),
    ]);
    return {
      total: Number(count[0]?.n ?? 0),
      summary: totals.summary,
      rows: rows.map((r) => ({
        returnNo: link(r.returnNo, `/ecommerce/returns/${r.id}`),
        date: dt(ctx, r.returnDate),
        store: r.store,
        dispatch: link(r.dispatchNo, `/ecommerce/dispatches/${r.dispatchId}`),
        product: r.product,
        sku: r.sku,
        quantity: `${qty(r.quantity)} ${r.unit}`,
        condition: badge(RETURN_CONDITION, r.condition),
        reason: r.reason,
        status: badge(DOC_STATUS, r.status),
        user: r.user,
      })),
    };
  },
};

const ECOM_CATEGORIES = ["DISPATCH_BILL", "SHIPMENT_DOCUMENT", "RETURN_DOCUMENT"] as const;

export const ecomBills: ReportDef = {
  key: "ec-bills",
  title: "E-commerce document register",
  description: "Bills, invoices, shipment and return documents linked to stores, dispatches and returns.",
  module: "ecom",
  permission: ["ecom.bills"],
  filters: ["q", "from", "to", "storeId", "category", "status"],
  options: {
    category: ECOM_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
    status: toOptions(ATTACHMENT_STATUS),
  },
  filterLabels: { q: "Bill no. / reference / file", category: "Document type", status: "Document status" },
  dateFilterLabel: "Upload date",
  columns: [
    { key: "file", label: "File" },
    { key: "category", label: "Type" },
    { key: "billNumber", label: "Bill / invoice no.", sortable: true },
    { key: "store", label: "Store", sortable: true },
    { key: "linked", label: "Linked to" },
    { key: "uploadedAt", label: "Uploaded", sortable: true },
    { key: "uploadedBy", label: "Uploaded by" },
    { key: "status", label: "Status" },
  ],
  defaultSort: "uploadedAt",
  async run(f, ctx) {
    const where: Prisma.BillAttachmentWhereInput = {
      category:
        f.category && (ECOM_CATEGORIES as readonly string[]).includes(f.category) ? (f.category as never) : { in: [...ECOM_CATEGORIES] },
      uploadedAt: range(f, ctx),
      storeId: f.storeId || undefined,
      status: f.status === "ACTIVE" || f.status === "REPLACED" ? f.status : undefined,
      ...(f.q
        ? {
            OR: [
              { fileName: { contains: f.q, mode: "insensitive" } },
              { billNumber: { contains: f.q, mode: "insensitive" } },
              { dispatch: { dispatchNo: { contains: f.q, mode: "insensitive" } } },
              { dispatch: { orderRef: { contains: f.q, mode: "insensitive" } } },
              { productReturn: { returnNo: { contains: f.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const sorts: Record<string, Prisma.BillAttachmentOrderByWithRelationInput> = {
      billNumber: { billNumber: ctx.dir },
      store: { store: { name: ctx.dir } },
      uploadedAt: { uploadedAt: ctx.dir },
    };
    const [rows, total] = await Promise.all([
      prisma.billAttachment.findMany({
        where,
        include: {
          store: true,
          dispatch: { select: { id: true, dispatchNo: true } },
          productReturn: { select: { id: true, returnNo: true } },
          uploadedBy: { select: { name: true } },
        },
        orderBy: [sorts[ctx.sort ?? "uploadedAt"] ?? sorts.uploadedAt, { id: "asc" }],
        ...paging(ctx),
      }),
      prisma.billAttachment.count({ where }),
    ]);
    return {
      total,
      rows: rows.map((a) => ({
        file: { text: a.fileName, href: `/api/files/${a.id}` },
        category: CATEGORY_LABEL[a.category],
        billNumber: a.billNumber ?? "—",
        store: a.store?.name ?? "—",
        linked: a.productReturn
          ? link(a.productReturn.returnNo, `/ecommerce/returns/${a.productReturn.id}`)
          : a.dispatch
            ? link(a.dispatch.dispatchNo, `/ecommerce/dispatches/${a.dispatch.id}`)
            : "—",
        uploadedAt: dt(ctx, a.uploadedAt),
        uploadedBy: a.uploadedBy.name,
        status: badge(ATTACHMENT_STATUS, a.status),
      })),
    };
  },
};

const ECOM_TXN_TYPES = {
  DISPATCH: "Dispatch",
  SALE: "Sale (store reported)",
  RETURN: "Return",
  REVERSAL: "Reversal",
  ADJUSTMENT: "Adjustment",
};

export const ecomTransactions: ReportDef = {
  key: "ec-transactions",
  title: "E-commerce transaction history",
  description: "Unified log of dispatches, store-reported sales, returns, reversals and adjustments. Posted entries are never deleted.",
  module: "ecom",
  permission: ["ecom.view", "ecom.reports"],
  filters: ["q", "from", "to", "storeId", "productId", "sku", "txnType", "ref"],
  options: { txnType: toOptions(ECOM_TXN_TYPES) },
  filterLabels: { txnType: "Transaction type", ref: "Reference / invoice no." },
  columns: [
    { key: "txnNo", label: "Txn ID", sortable: true },
    { key: "date", label: "Date", sortable: true },
    { key: "store", label: "Store", sortable: true },
    { key: "product", label: "Product", sortable: true },
    { key: "sku", label: "SKU" },
    { key: "type", label: "Type", sortable: true },
    { key: "quantity", label: "Quantity", align: "right" },
    { key: "unit", label: "Unit" },
    { key: "reference", label: "Reference" },
    { key: "dispatchRef", label: "Original dispatch" },
    { key: "impact", label: "Stock impact" },
    { key: "notes", label: "Notes" },
    { key: "user", label: "Recorded by" },
  ],
  defaultSort: "date",
  async run(f, ctx) {
    const rg = range(f, ctx);
    const tParts: Prisma.Sql[] = [
      Prisma.sql`t."type" IN ('DISPATCH', 'RETURN', 'REVERSAL', 'ADJUSTMENT')`,
      Prisma.sql`(t."type" <> 'REVERSAL' OR t."dispatchId" IS NOT NULL)`,
    ];
    const sParts: Prisma.Sql[] = [];
    if (rg?.gte) {
      tParts.push(Prisma.sql`t."createdAt" >= ${rg.gte}`);
      sParts.push(Prisma.sql`ss."saleDate" >= ${rg.gte}`);
    }
    if (rg?.lt) {
      tParts.push(Prisma.sql`t."createdAt" < ${rg.lt}`);
      sParts.push(Prisma.sql`ss."saleDate" < ${rg.lt}`);
    }
    if (f.storeId) {
      tParts.push(Prisma.sql`t."storeId" = ${f.storeId}`);
      sParts.push(Prisma.sql`ss."storeId" = ${f.storeId}`);
    }
    if (f.productId) {
      tParts.push(Prisma.sql`t."productId" = ${f.productId}`);
      sParts.push(Prisma.sql`ss."productId" = ${f.productId}`);
    }
    const base = Prisma.sql`
      SELECT t."txnNo", t."createdAt" AS date, s."name" AS store, p."name" AS product, p."sku", t."type"::text AS type, t."quantity", u."code" AS unit,
        COALESCE(rt."returnNo", t."reference") AS reference, d."dispatchNo" AS "dispatchRef", d."id" AS "dispatchId", t."bucket"::text AS bucket, t."notes", us."name" AS "user"
      FROM "ProductTransaction" t
      JOIN "ReadyProduct" p ON p."id" = t."productId" JOIN "Unit" u ON u."id" = t."unitId" JOIN "User" us ON us."id" = t."createdById"
      LEFT JOIN "Store" s ON s."id" = t."storeId" LEFT JOIN "Dispatch" d ON d."id" = t."dispatchId" LEFT JOIN "ProductReturn" rt ON rt."id" = t."returnId"
      ${and(tParts)}
      UNION ALL
      SELECT ss."saleNo", ss."saleDate", s."name", p."name", p."sku", 'SALE', ss."quantity", u."code", ss."reference", NULL, NULL, NULL, ss."notes", us."name"
      FROM "StoreSale" ss JOIN "Store" s ON s."id" = ss."storeId" JOIN "ReadyProduct" p ON p."id" = ss."productId"
      JOIN "Unit" u ON u."id" = p."unitId" JOIN "User" us ON us."id" = ss."createdById"
      ${and(sParts)}`;
    const outer: Prisma.Sql[] = [];
    if (f.txnType && f.txnType in ECOM_TXN_TYPES) outer.push(Prisma.sql`x."type" = ${f.txnType}`);
    if (f.sku) outer.push(Prisma.sql`x."sku" ILIKE ${like(f.sku)}`);
    if (f.ref) outer.push(Prisma.sql`(x."reference" ILIKE ${like(f.ref)} OR x."dispatchRef" ILIKE ${like(f.ref)})`);
    if (f.q)
      outer.push(
        Prisma.sql`(x."txnNo" ILIKE ${like(f.q)} OR x."product" ILIKE ${like(f.q)} OR x."notes" ILIKE ${like(f.q)} OR x."reference" ILIKE ${like(f.q)})`,
      );
    const order = sqlOrder(
      { txnNo: `x."txnNo"`, date: `x."date"`, store: `x."store"`, product: `x."product"`, type: `x."type"` },
      ctx.sort ?? "date",
      ctx.dir,
    );
    type Row = {
      txnNo: string;
      date: Date;
      store: string | null;
      product: string;
      sku: string;
      type: string;
      quantity: Prisma.Decimal;
      unit: string;
      reference: string | null;
      dispatchRef: string | null;
      dispatchId: string | null;
      bucket: string | null;
      notes: string | null;
      user: string;
    };
    const [rows, count] = await Promise.all([
      prisma.$queryRaw<Row[]>`SELECT * FROM (${base}) x ${and(outer)} ORDER BY ${order}, x."txnNo" DESC ${sqlPaging(ctx)}`,
      prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (${base}) x ${and(outer)}`,
    ]);
    return {
      total: Number(count[0]?.n ?? 0),
      rows: rows.map((r) => {
        const q = new Prisma.Decimal(r.quantity);
        return {
          txnNo: r.txnNo,
          date: dt(ctx, r.date),
          store: r.store ?? "—",
          product: r.product,
          sku: r.sku,
          type: PRODUCT_TXN_TYPE[r.type] ?? r.type,
          quantity: qty(q.abs()),
          unit: r.unit,
          reference: r.reference ?? "—",
          dispatchRef: r.dispatchRef && r.dispatchId ? link(r.dispatchRef, `/ecommerce/dispatches/${r.dispatchId}`) : "—",
          impact:
            r.type === "SALE"
              ? { text: "None (already dispatched)", tone: "muted" }
              : {
                  text: `${q.gt(0) ? "+" : "−"}${qty(q.abs())} ${BUCKET[r.bucket ?? ""]?.label.toLowerCase() ?? ""}`,
                  tone: q.gt(0) ? "success" : "danger",
                },
          notes: r.notes ?? "—",
          user: r.user,
        };
      }),
    };
  },
};

export const reconciliation: ReportDef = {
  key: "ec-reconciliation",
  title: "Reconciliation report",
  description:
    "Checks that dispatches, returns and every other posted movement add up to the stored balances. Any difference indicates a problem to investigate.",
  module: "ecom",
  permission: EC_REPORT,
  filters: ["q", "productId", "categoryId"],
  columns: [
    { key: "product", label: "Product", sortable: true },
    { key: "sku", label: "SKU", sortable: true },
    { key: "received", label: "Opening + receipts", align: "right" },
    { key: "adjusted", label: "Adjustments", align: "right" },
    { key: "dispatched", label: "Dispatched (net)", align: "right" },
    { key: "returned", label: "Returned (net)", align: "right" },
    { key: "ledger", label: "Ledger balance", align: "right" },
    { key: "cached", label: "Stored balance", align: "right" },
    { key: "difference", label: "Difference", align: "right", sortable: true },
    { key: "sold", label: "Store-reported sold", align: "right" },
    { key: "atStores", label: "Held at stores", align: "right" },
    { key: "status", label: "Status", sortable: true },
  ],
  defaultSort: "difference",
  async run(f, ctx) {
    const parts: Prisma.Sql[] = [];
    if (f.productId) parts.push(Prisma.sql`p."id" = ${f.productId}`);
    if (f.categoryId) parts.push(Prisma.sql`p."categoryId" = ${f.categoryId}`);
    if (f.q) parts.push(Prisma.sql`(p."name" ILIKE ${like(f.q)} OR p."sku" ILIKE ${like(f.q)})`);
    const base = Prisma.sql`
      SELECT p."id", p."name", p."sku", u."code" AS unit,
        COALESCE((SELECT SUM(t."quantity") FROM "ProductTransaction" t WHERE t."productId" = p."id" AND t."type" IN ('OPENING', 'RECEIPT', 'PRODUCTION_RECEIPT')), 0) AS received,
        COALESCE((SELECT SUM(t."quantity") FROM "ProductTransaction" t WHERE t."productId" = p."id" AND t."type" = 'ADJUSTMENT'), 0) AS adjusted,
        COALESCE((SELECT -SUM(t."quantity") FROM "ProductTransaction" t WHERE t."productId" = p."id" AND (t."type" = 'DISPATCH' OR (t."type" = 'REVERSAL' AND t."returnId" IS NULL AND t."dispatchId" IS NOT NULL))), 0) AS dispatched,
        COALESCE((SELECT SUM(t."quantity") FROM "ProductTransaction" t WHERE t."productId" = p."id" AND (t."type" = 'RETURN' OR (t."type" = 'REVERSAL' AND t."returnId" IS NOT NULL))), 0) AS returned,
        COALESCE((SELECT SUM(t."quantity") FROM "ProductTransaction" t WHERE t."productId" = p."id"), 0) AS ledger,
        COALESCE((SELECT SUM(sb."quantity") FROM "StockBalance" sb WHERE sb."productId" = p."id"), 0) AS cached,
        COALESCE((SELECT SUM(ss."quantity") FROM "StoreSale" ss WHERE ss."productId" = p."id"), 0) AS sold,
        COALESCE((SELECT SUM(l."quantity" - l."returnedQty") FROM "DispatchLine" l JOIN "Dispatch" d ON d."id" = l."dispatchId" WHERE l."productId" = p."id" AND d."status" = 'POSTED'), 0) AS "docNet"
      FROM "ReadyProduct" p JOIN "Unit" u ON u."id" = p."unitId" ${and(parts)}`;
    type Row = {
      id: string;
      name: string;
      sku: string;
      unit: string;
      received: Prisma.Decimal;
      adjusted: Prisma.Decimal;
      dispatched: Prisma.Decimal;
      returned: Prisma.Decimal;
      ledger: Prisma.Decimal;
      cached: Prisma.Decimal;
      sold: Prisma.Decimal;
      docNet: Prisma.Decimal;
    };
    const order = sqlOrder(
      {
        product: `"name"`,
        sku: `"sku"`,
        difference: `abs("cached" - "ledger") + abs(("dispatched" - "returned") - "docNet")`,
        status: `abs("cached" - "ledger") + abs(("dispatched" - "returned") - "docNet")`,
      },
      ctx.sort ?? "difference",
      ctx.dir,
    );
    const [rows, count] = await Promise.all([
      prisma.$queryRaw<Row[]>`SELECT * FROM (${base}) x ORDER BY ${order}, "name" ASC ${sqlPaging(ctx)}`,
      prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "ReadyProduct" p ${and(parts)}`,
    ]);
    let mismatches = 0;
    const mapped = rows.map((r) => {
      const diff = new Prisma.Decimal(r.cached).minus(r.ledger);
      const docDiff = new Prisma.Decimal(r.dispatched).minus(r.returned).minus(r.docNet);
      const ok = diff.isZero() && docDiff.isZero();
      if (!ok) mismatches++;
      return {
        product: link(r.name, `/products/${r.id}`),
        sku: r.sku,
        received: qty(r.received),
        adjusted: qty(r.adjusted),
        dispatched: qty(r.dispatched),
        returned: qty(r.returned),
        ledger: qty(r.ledger),
        cached: qty(r.cached),
        difference: qty(diff),
        sold: qty(r.sold),
        atStores: qty(new Prisma.Decimal(r.dispatched).minus(r.returned).minus(r.sold)),
        status: ok ? { text: "Reconciled", tone: "success" as const } : { text: "Mismatch", tone: "danger" as const },
      };
    });
    return {
      total: Number(count[0]?.n ?? 0),
      summary: [
        { label: "Products checked", value: String(rows.length) },
        {
          label: "Mismatches on this page",
          value: String(mismatches),
          hint: mismatches ? "Investigate the ledger for these products" : "All balances match the ledger",
        },
      ],
      rows: mapped,
    };
  },
};

export const ecomReports: ReportDef[] = [
  groupedMovement(
    "ec-store-dispatch",
    "Store-wise dispatch report",
    "Quantities dispatched to each store in the selected period.",
    "store",
    "dispatch",
  ),
  groupedMovement("ec-store-return", "Store-wise return report", "Quantities returned from each store, by condition.", "store", "return"),
  groupedMovement(
    "ec-product-dispatch",
    "Product-wise dispatch report",
    "Quantities of each product dispatched to stores.",
    "product",
    "dispatch",
  ),
  groupedMovement(
    "ec-product-return",
    "Product-wise return report",
    "Quantities of each product returned, by condition.",
    "product",
    "return",
  ),
  groupedMovement(
    "ec-net-movement",
    "Store-wise net movement",
    "Dispatched − returned per store. A dispatch is not a sale; store-reported sales are shown for comparison.",
    "store",
    "net",
  ),
  dispatchRegister,
  returnRegister,
  ecomBills,
  ecomTransactions,
  reconciliation,
];
