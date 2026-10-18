import { Prisma, type EntryStatus } from "@prisma/client";
import { prisma } from "../db";
import { ENTRY_STATUS, RAW_TXN_TYPE, ATTACHMENT_STATUS, toOptions } from "@/lib/labels";
import { and, badge, dt, like, link, paging, qty, range, sqlOrder, sqlPaging } from "./util";
import type { Cell, Filters, ReportDef, RowAction, RunContext } from "./types";
import { can } from "../permissions";

const RM_REPORT = ["rm.reports"] as ReportDef["permission"];

function entryWhere(f: Filters, ctx: RunContext, fixedStatus?: EntryStatus): Prisma.RawMaterialEntryWhereInput {
  // Deleted entries are hidden unless the "Deleted" status is chosen explicitly.
  const showDeleted = !fixedStatus && f.status === "DELETED";
  const status = fixedStatus ?? (f.status && f.status in ENTRY_STATUS ? (f.status as EntryStatus) : undefined);
  return {
    deletedAt: showDeleted ? { not: null } : null,
    entryDate: range(f, ctx),
    supplierId: f.supplierId || undefined,
    rawMaterialId: f.materialId || undefined,
    unitId: f.unitId || undefined,
    status,
    ...(f.q
      ? {
          OR: [
            { entryNo: { contains: f.q, mode: "insensitive" } },
            { invoiceNumber: { contains: f.q, mode: "insensitive" } },
            { poNumber: { contains: f.q, mode: "insensitive" } },
            { rawMaterial: { name: { contains: f.q, mode: "insensitive" } } },
            { supplier: { name: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

const ENTRY_SORT: Record<string, (dir: "asc" | "desc") => Prisma.RawMaterialEntryOrderByWithRelationInput> = {
  entryNo: (dir) => ({ entryNo: dir }),
  entryDate: (dir) => ({ entryDate: dir }),
  material: (dir) => ({ rawMaterial: { name: dir } }),
  supplier: (dir) => ({ supplier: { name: dir } }),
  quantity: (dir) => ({ quantity: dir }),
  invoice: (dir) => ({ invoiceNumber: dir }),
  status: (dir) => ({ status: dir }),
};

async function totalsByUnit(where: Prisma.RawMaterialEntryWhereInput) {
  const groups = await prisma.rawMaterialEntry.groupBy({ by: ["unitId"], where, _sum: { quantity: true }, _count: true });
  const units = await prisma.unit.findMany({ where: { id: { in: groups.map((g) => g.unitId) } } });
  return groups.map((g) => ({
    label: `Total ${units.find((u) => u.id === g.unitId)?.code ?? ""}`,
    value: qty(g._sum.quantity),
    hint: `${g._count} entries`,
  }));
}

function entryActions(e: { id: string; entryNo: string; status: EntryStatus; deletedAt: Date | null }, ctx: RunContext): Cell {
  const actions: RowAction[] = [];
  if (e.deletedAt) {
    if (can(ctx.actor, "rm.entry.delete")) actions.push({ label: "Restore", kind: "restoreEntry", id: e.id, name: e.entryNo });
  } else if (e.status === "PENDING_INSPECTION") {
    if (can(ctx.actor, "rm.entry.edit")) actions.push({ label: "Edit", href: `/raw-materials/entries/${e.id}/edit` });
    if (can(ctx.actor, "rm.entry.delete")) actions.push({ label: "Delete", kind: "deleteEntry", id: e.id, name: e.entryNo });
  } else if (can(ctx.actor, "rm.entry.edit") || can(ctx.actor, "rm.entry.delete")) {
    // Inspected entries have stock on the ledger; they unlock only via an inspection reversal.
    return { text: "Locked", tone: "muted" };
  }
  return actions.length ? { text: "", actions } : null;
}

function entriesReport(key: string, title: string, description: string, fixedStatus?: EntryStatus): ReportDef {
  const permission: ReportDef["permission"] =
    fixedStatus === "PENDING_INSPECTION" ? ["rm.view", "rm.inspect", "rm.reports"] : ["rm.view", "rm.reports"];
  const isRejected = fixedStatus === "REJECTED";
  const showInspection = fixedStatus === "APPROVED" || fixedStatus === "REJECTED";
  return {
    key,
    title,
    description,
    module: "raw",
    permission,
    filters: fixedStatus
      ? ["q", "from", "to", "supplierId", "materialId", "unitId"]
      : ["q", "from", "to", "supplierId", "materialId", "unitId", "status"],
    options: { status: toOptions(ENTRY_STATUS) },
    filterLabels: { status: "Inspection status", materialId: "Product" },
    columns: [
      { key: "entryNo", label: "Entry ID", sortable: true },
      { key: "entryDate", label: "Entry date", sortable: true },
      { key: "material", label: "Product", sortable: true },
      { key: "supplier", label: "Supplier", sortable: true },
      { key: "quantity", label: "Quantity", align: "right", sortable: true },
      { key: "unit", label: "Unit" },
      { key: "po", label: "PO no." },
      { key: "invoice", label: "Invoice no.", sortable: true },
      { key: "status", label: "Status", sortable: true },
      ...(showInspection
        ? [
            { key: "inspectedBy", label: "Inspected by" },
            { key: "inspectedAt", label: "Inspected at" },
            { key: isRejected ? "reason" : "notes", label: isRejected ? "Rejection reason" : "Inspection notes" },
          ]
        : [{ key: "bills", label: "Bills" }]),
      { key: "enteredBy", label: "Entered by" },
      ...(fixedStatus ? [] : [{ key: "actions", label: "", screenOnly: true }]),
    ],
    defaultSort: "entryDate",
    async run(f, ctx) {
      const where = entryWhere(f, ctx, fixedStatus);
      const [rows, total, summary] = await Promise.all([
        prisma.rawMaterialEntry.findMany({
          where,
          include: {
            rawMaterial: true,
            supplier: true,
            unit: true,
            createdBy: { select: { name: true } },
            inspections: { where: { reversedAt: null }, include: { inspectedBy: { select: { name: true } } } },
            _count: { select: { attachments: { where: { status: "ACTIVE" } } } },
          },
          orderBy: [(ENTRY_SORT[ctx.sort ?? ""] ?? ENTRY_SORT.entryDate)(ctx.dir), { entryNo: "desc" }],
          ...paging(ctx),
        }),
        prisma.rawMaterialEntry.count({ where }),
        totalsByUnit(where),
      ]);
      return {
        total,
        summary: [{ label: "Entries", value: String(total) }, ...summary],
        rows: rows.map((e) => {
          const insp = e.inspections[0];
          return {
            entryNo: link(e.entryNo, `/raw-materials/entries/${e.id}`),
            entryDate: dt(ctx, e.entryDate),
            material: e.rawMaterial.name,
            supplier: e.supplier.name,
            quantity: qty(e.quantity),
            unit: e.unit.code,
            po: e.poNumber ?? "—",
            invoice: e.invoiceNumber ?? "—",
            status: e.deletedAt ? { text: "Deleted", tone: "muted" } : badge(ENTRY_STATUS, e.status),
            bills: e._count.attachments ? `${e._count.attachments}` : { text: "None", tone: "muted" },
            inspectedBy: insp?.inspectedBy.name ?? "—",
            inspectedAt: insp ? dt(ctx, insp.inspectedAt) : "—",
            reason: insp?.rejectionReason ?? "—",
            notes: insp?.notes ?? "—",
            enteredBy: e.createdBy.name,
            actions: entryActions(e, ctx),
          };
        }),
      };
    },
  };
}

function groupedInward(key: string, title: string, description: string, by: "supplier" | "material"): ReportDef {
  const nameCol = by === "supplier" ? "supplier" : "material";
  return {
    key,
    title,
    description,
    module: "raw",
    permission: RM_REPORT,
    filters: ["from", "to", "supplierId", "materialId", "unitId", "status"],
    options: { status: toOptions(ENTRY_STATUS) },
    filterLabels: { status: "Inspection status", materialId: "Product" },
    columns: [
      { key: nameCol, label: by === "supplier" ? "Supplier" : "Product", sortable: true },
      { key: "unit", label: "Unit", sortable: true },
      { key: "entries", label: "Entries", align: "right", sortable: true },
      { key: "pending", label: "Pending qty", align: "right", sortable: true },
      { key: "approved", label: "Approved qty", align: "right", sortable: true },
      { key: "rejected", label: "Rejected qty", align: "right", sortable: true },
      { key: "total", label: "Total received", align: "right", sortable: true },
    ],
    defaultSort: "total",
    async run(f, ctx) {
      const r = range(f, ctx);
      const parts: Prisma.Sql[] = [];
      if (r?.gte) parts.push(Prisma.sql`e."entryDate" >= ${r.gte}`);
      if (r?.lt) parts.push(Prisma.sql`e."entryDate" < ${r.lt}`);
      if (f.supplierId) parts.push(Prisma.sql`e."supplierId" = ${f.supplierId}`);
      if (f.materialId) parts.push(Prisma.sql`e."rawMaterialId" = ${f.materialId}`);
      if (f.unitId) parts.push(Prisma.sql`e."unitId" = ${f.unitId}`);
      parts.push(Prisma.sql`e."deletedAt" IS NULL`);
      if (f.status && f.status in ENTRY_STATUS) parts.push(Prisma.sql`e."status" = ${f.status}::"EntryStatus"`);
      const groupCol = by === "supplier" ? Prisma.sql`s."id", s."name"` : Prisma.sql`m."id", m."name"`;
      const order = sqlOrder(
        {
          [nameCol]: "name",
          unit: "unit",
          entries: "entries",
          pending: "pending",
          approved: "approved",
          rejected: "rejected",
          total: "total",
        },
        ctx.sort ?? "total",
        ctx.dir,
      );
      const base = Prisma.sql`
        FROM "RawMaterialEntry" e
        JOIN "Supplier" s ON s."id" = e."supplierId"
        JOIN "RawMaterial" m ON m."id" = e."rawMaterialId"
        JOIN "Unit" u ON u."id" = e."unitId"
        ${and(parts)}
        GROUP BY ${groupCol}, u."code"`;
      const [rows, count] = await Promise.all([
        prisma.$queryRaw<
          {
            name: string;
            unit: string;
            entries: bigint;
            pending: Prisma.Decimal;
            approved: Prisma.Decimal;
            rejected: Prisma.Decimal;
            total: Prisma.Decimal;
          }[]
        >`
          SELECT ${by === "supplier" ? Prisma.sql`s."name"` : Prisma.sql`m."name"`} AS name, u."code" AS unit, COUNT(*) AS entries,
            COALESCE(SUM(e."quantity") FILTER (WHERE e."status" = 'PENDING_INSPECTION'), 0) AS pending,
            COALESCE(SUM(e."quantity") FILTER (WHERE e."status" = 'APPROVED'), 0) AS approved,
            COALESCE(SUM(e."quantity") FILTER (WHERE e."status" = 'REJECTED'), 0) AS rejected,
            SUM(e."quantity") AS total
          ${base} ORDER BY ${order} ${sqlPaging(ctx)}`,
        prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (SELECT 1 ${base}) x`,
      ]);
      return {
        total: Number(count[0]?.n ?? 0),
        rows: rows.map((r) => ({
          [nameCol]: r.name,
          unit: r.unit,
          entries: Number(r.entries),
          pending: qty(r.pending),
          approved: qty(r.approved),
          rejected: qty(r.rejected),
          total: qty(r.total),
        })),
      };
    },
  };
}

const poRegister: ReportDef = {
  key: "rm-po-register",
  title: "PO / invoice register",
  description: "Every purchase order and invoice number with the material lines received against it.",
  module: "raw",
  permission: RM_REPORT,
  filters: ["q", "from", "to", "supplierId", "materialId", "unitId", "status"],
  options: { status: toOptions(ENTRY_STATUS) },
  filterLabels: { status: "Inspection status", q: "PO / invoice no.", materialId: "Product" },
  columns: [
    { key: "invoice", label: "Invoice no.", sortable: true },
    { key: "po", label: "PO no." },
    { key: "supplier", label: "Supplier", sortable: true },
    { key: "entryDate", label: "Entry date", sortable: true },
    { key: "entryNo", label: "Entry ID", sortable: true },
    { key: "material", label: "Product", sortable: true },
    { key: "quantity", label: "Quantity", align: "right", sortable: true },
    { key: "unit", label: "Unit" },
    { key: "status", label: "Status", sortable: true },
    { key: "bills", label: "Bills", align: "right" },
  ],
  defaultSort: "invoice",
  defaultDir: "asc",
  async run(f, ctx) {
    const where = entryWhere(f, ctx);
    const [rows, total] = await Promise.all([
      prisma.rawMaterialEntry.findMany({
        where,
        include: { rawMaterial: true, supplier: true, unit: true, _count: { select: { attachments: { where: { status: "ACTIVE" } } } } },
        orderBy: [(ENTRY_SORT[ctx.sort ?? ""] ?? ENTRY_SORT.invoice)(ctx.dir), { poNumber: ctx.dir }, { entryNo: "asc" }],
        ...paging(ctx),
      }),
      prisma.rawMaterialEntry.count({ where }),
    ]);
    return {
      total,
      rows: rows.map((e) => ({
        invoice: e.invoiceNumber ?? "—",
        po: e.poNumber ?? "—",
        supplier: e.supplier.name,
        entryDate: dt(ctx, e.entryDate),
        entryNo: link(e.entryNo, `/raw-materials/entries/${e.id}`),
        material: e.rawMaterial.name,
        quantity: qty(e.quantity),
        unit: e.unit.code,
        status: badge(ENTRY_STATUS, e.status),
        bills: e._count.attachments,
      })),
    };
  },
};

export const rawStock: ReportDef = {
  key: "rm-stock",
  title: "Raw material stock",
  description: "Live balance per material and unit. Only quality-approved quantities count as stock.",
  module: "raw",
  permission: ["rm.view", "rm.reports"],
  filters: ["q", "materialId", "unitId"],
  filterLabels: { materialId: "Product" },
  columns: [
    { key: "material", label: "Material", sortable: true },
    { key: "unit", label: "Unit", sortable: true },
    { key: "inward", label: "Approved inward", align: "right", sortable: true },
    { key: "issued", label: "Consumed / issued", align: "right", sortable: true },
    { key: "corrections", label: "Reversals & adjustments", align: "right" },
    { key: "pending", label: "Pending inspection", align: "right", sortable: true },
    { key: "balance", label: "Current balance", align: "right", sortable: true },
    { key: "lastTxn", label: "Last transaction", sortable: true },
  ],
  defaultSort: "material",
  defaultDir: "asc",
  async run(f, ctx) {
    const parts: Prisma.Sql[] = [];
    if (f.materialId) parts.push(Prisma.sql`m."id" = ${f.materialId}`);
    if (f.unitId) parts.push(Prisma.sql`m."unitId" = ${f.unitId}`);
    if (f.q) parts.push(Prisma.sql`m."name" ILIKE ${like(f.q)}`);
    const order = sqlOrder(
      {
        material: `m."name"`,
        unit: `u."code"`,
        inward: "inward",
        issued: "issued",
        pending: "pending",
        balance: `m."currentBalance"`,
        lastTxn: `"lastTxn"`,
      },
      ctx.sort ?? "material",
      ctx.dir,
    );
    const [rows, count] = await Promise.all([
      prisma.$queryRaw<
        {
          id: string;
          name: string;
          unit: string;
          balance: Prisma.Decimal;
          inward: Prisma.Decimal;
          issued: Prisma.Decimal;
          corrections: Prisma.Decimal;
          pending: Prisma.Decimal;
          lastTxn: Date | null;
        }[]
      >`
        SELECT m."id", m."name", u."code" AS unit, m."currentBalance" AS balance,
          COALESCE((SELECT SUM(t."quantity") FROM "RawMaterialTransaction" t WHERE t."rawMaterialId" = m."id" AND t."type" = 'INWARD_APPROVED'), 0) AS inward,
          COALESCE((SELECT -SUM(t."quantity") FROM "RawMaterialTransaction" t WHERE t."rawMaterialId" = m."id" AND t."type" = 'PRODUCTION_ISSUE'), 0) AS issued,
          COALESCE((SELECT SUM(t."quantity") FROM "RawMaterialTransaction" t WHERE t."rawMaterialId" = m."id" AND t."type" IN ('INSPECTION_REVERSAL', 'ADJUSTMENT')), 0) AS corrections,
          COALESCE((SELECT SUM(e."quantity") FROM "RawMaterialEntry" e WHERE e."rawMaterialId" = m."id" AND e."status" = 'PENDING_INSPECTION' AND e."deletedAt" IS NULL), 0) AS pending,
          (SELECT MAX(t."createdAt") FROM "RawMaterialTransaction" t WHERE t."rawMaterialId" = m."id") AS "lastTxn"
        FROM "RawMaterial" m JOIN "Unit" u ON u."id" = m."unitId"
        ${and(parts)}
        ORDER BY ${order} ${sqlPaging(ctx)}`,
      prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "RawMaterial" m ${and(parts)}`,
    ]);
    return {
      total: Number(count[0]?.n ?? 0),
      rows: rows.map((r) => ({
        material: link(r.name, `/raw-materials/stock/${r.id}`),
        unit: r.unit,
        inward: qty(r.inward),
        issued: qty(r.issued),
        corrections: qty(r.corrections),
        pending: qty(r.pending),
        balance: qty(r.balance),
        lastTxn: r.lastTxn ? dt(ctx, r.lastTxn) : "—",
      })),
    };
  },
};

const rawLedger: ReportDef = {
  key: "rm-ledger",
  title: "Raw material stock ledger",
  description: "Every posted raw material stock movement, with running balance.",
  module: "raw",
  permission: RM_REPORT,
  filters: ["q", "from", "to", "materialId", "unitId", "txnType"],
  options: { txnType: toOptions(RAW_TXN_TYPE) },
  filterLabels: { materialId: "Product", txnType: "Transaction type" },
  columns: [
    { key: "txnNo", label: "Txn ID", sortable: true },
    { key: "date", label: "Date", sortable: true },
    { key: "material", label: "Material", sortable: true },
    { key: "type", label: "Type", sortable: true },
    { key: "quantity", label: "Quantity", align: "right", sortable: true },
    { key: "unit", label: "Unit" },
    { key: "balanceAfter", label: "Balance after", align: "right" },
    { key: "entry", label: "Entry" },
    { key: "reference", label: "Reference" },
    { key: "reason", label: "Reason / notes" },
    { key: "user", label: "Recorded by" },
  ],
  defaultSort: "date",
  async run(f, ctx) {
    const where: Prisma.RawMaterialTransactionWhereInput = {
      createdAt: range(f, ctx),
      rawMaterialId: f.materialId || undefined,
      unitId: f.unitId || undefined,
      type: f.txnType && f.txnType in RAW_TXN_TYPE ? (f.txnType as never) : undefined,
      ...(f.q
        ? {
            OR: [
              { txnNo: { contains: f.q, mode: "insensitive" } },
              { reference: { contains: f.q, mode: "insensitive" } },
              { rawMaterial: { name: { contains: f.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const sorts: Record<string, Prisma.RawMaterialTransactionOrderByWithRelationInput> = {
      txnNo: { txnNo: ctx.dir },
      date: { createdAt: ctx.dir },
      material: { rawMaterial: { name: ctx.dir } },
      type: { type: ctx.dir },
      quantity: { quantity: ctx.dir },
    };
    const [rows, total] = await Promise.all([
      prisma.rawMaterialTransaction.findMany({
        where,
        include: { rawMaterial: true, unit: true, entry: { select: { id: true, entryNo: true } }, createdBy: { select: { name: true } } },
        orderBy: [sorts[ctx.sort ?? "date"] ?? sorts.date, { txnNo: ctx.dir }],
        ...paging(ctx),
      }),
      prisma.rawMaterialTransaction.count({ where }),
    ]);
    return {
      total,
      rows: rows.map((t) => ({
        txnNo: t.txnNo,
        date: dt(ctx, t.createdAt),
        material: t.rawMaterial.name,
        type: RAW_TXN_TYPE[t.type] ?? t.type,
        quantity: (t.quantity.gt(0) ? "+" : "") + qty(t.quantity),
        unit: t.unit.code,
        balanceAfter: qty(t.balanceAfter),
        entry: t.entry ? link(t.entry.entryNo, `/raw-materials/entries/${t.entry.id}`) : "—",
        reference: t.reference ?? "—",
        reason: t.reason ?? "—",
        user: t.createdBy.name,
      })),
    };
  },
};

export const rawBills: ReportDef = {
  key: "rm-bills",
  title: "Raw material bill register",
  description: "All uploaded supplier bills and invoices, including replaced versions.",
  module: "raw",
  permission: ["rm.bills"],
  filters: ["q", "from", "to", "supplierId", "status"],
  options: { status: toOptions(ATTACHMENT_STATUS) },
  filterLabels: { q: "Entry ID / invoice no. / file", status: "Document status" },
  dateFilterLabel: "Upload date",
  columns: [
    { key: "file", label: "File" },
    { key: "billNumber", label: "Bill / invoice no.", sortable: true },
    { key: "supplier", label: "Supplier", sortable: true },
    { key: "entry", label: "Entry" },
    { key: "po", label: "PO no." },
    { key: "uploadedAt", label: "Uploaded", sortable: true },
    { key: "uploadedBy", label: "Uploaded by" },
    { key: "size", label: "Size", align: "right" },
    { key: "status", label: "Status" },
  ],
  defaultSort: "uploadedAt",
  async run(f, ctx) {
    const where: Prisma.BillAttachmentWhereInput = {
      category: "RAW_MATERIAL_BILL",
      uploadedAt: range(f, ctx),
      supplierId: f.supplierId || undefined,
      status: f.status === "ACTIVE" || f.status === "REPLACED" ? f.status : undefined,
      ...(f.q
        ? {
            OR: [
              { fileName: { contains: f.q, mode: "insensitive" } },
              { billNumber: { contains: f.q, mode: "insensitive" } },
              { rawMaterialEntry: { entryNo: { contains: f.q, mode: "insensitive" } } },
              { rawMaterialEntry: { invoiceNumber: { contains: f.q, mode: "insensitive" } } },
              { rawMaterialEntry: { poNumber: { contains: f.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const sorts: Record<string, Prisma.BillAttachmentOrderByWithRelationInput> = {
      billNumber: { billNumber: ctx.dir },
      supplier: { supplier: { name: ctx.dir } },
      uploadedAt: { uploadedAt: ctx.dir },
    };
    const [rows, total] = await Promise.all([
      prisma.billAttachment.findMany({
        where,
        include: {
          supplier: true,
          rawMaterialEntry: { select: { id: true, entryNo: true, poNumber: true } },
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
        billNumber: a.billNumber ?? "—",
        supplier: a.supplier?.name ?? "—",
        entry: a.rawMaterialEntry ? link(a.rawMaterialEntry.entryNo, `/raw-materials/entries/${a.rawMaterialEntry.id}`) : "—",
        po: a.rawMaterialEntry?.poNumber ?? "—",
        uploadedAt: dt(ctx, a.uploadedAt),
        uploadedBy: a.uploadedBy.name,
        size: `${Math.max(1, Math.round(a.sizeBytes / 1024))} KB`,
        status: badge(ATTACHMENT_STATUS, a.status),
      })),
    };
  },
};

export const rawReports: ReportDef[] = [
  entriesReport("rm-entries", "All raw material entries", "Every incoming raw material entry with its inspection status."),
  entriesReport(
    "rm-pending",
    "Pending quality inspections",
    "Entries awaiting a quality decision. Their quantities are not in stock yet.",
    "PENDING_INSPECTION",
  ),
  entriesReport("rm-approved", "Approved entries", "Entries that passed inspection and were added to stock.", "APPROVED"),
  entriesReport("rm-rejected", "Rejected entries", "Entries that failed inspection. Never added to stock.", "REJECTED"),
  groupedInward(
    "rm-supplier-wise",
    "Supplier-wise inward quantities",
    "Quantities received per supplier and unit, split by inspection outcome.",
    "supplier",
  ),
  groupedInward(
    "rm-material-wise",
    "Material-wise inward quantities",
    "Quantities received per material and unit, split by inspection outcome.",
    "material",
  ),
  poRegister,
  rawStock,
  rawLedger,
  rawBills,
];
