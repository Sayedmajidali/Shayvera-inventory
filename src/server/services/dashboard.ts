import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { dayRange } from "@/lib/dates";
import { ecomPeriodTotals } from "../reports/ecommerce";
import { productStockSql } from "../reports/products";
import type { RunContext } from "../reports/types";

export interface DashboardInput {
  from: string;
  to: string;
  tz: string;
  today: string;
  dateFormat: string;
}

/** All dashboard numbers come from the database; nothing is hardcoded. */
export async function getDashboard({ from, to, tz, today, dateFormat }: DashboardInput) {
  const range = dayRange(from, to, tz);
  const ctx: RunContext = { tz, today, dateFormat, page: { skip: 0, take: 10 }, dir: "desc" };

  const [
    activeProducts,
    availableByUnit,
    entryCounts,
    pendingTotal,
    lowStockCount,
    expiryCounts,
    period,
    recentTxns,
    recentEntries,
    pendingEntries,
    lowStock,
    expiring,
    storeChart,
    dailyChart,
    stockHealth,
    topProducts,
    quarantined,
  ] = await Promise.all([
    prisma.readyProduct.count({ where: { active: true } }),
    prisma.$queryRaw<{ unit: string; qty: Prisma.Decimal }[]>`
      SELECT u."code" AS unit, COALESCE(SUM(sb."quantity"), 0) AS qty
      FROM "StockBalance" sb JOIN "ProductBatch" b ON b."id" = sb."batchId" JOIN "ReadyProduct" p ON p."id" = sb."productId" JOIN "Unit" u ON u."id" = p."unitId"
      WHERE sb."bucket" = 'SALEABLE' AND p."active" = true AND (b."expiryDate" IS NULL OR b."expiryDate" >= ${today}::date)
      GROUP BY u."code" ORDER BY u."code"`,
    prisma.rawMaterialEntry.groupBy({ by: ["status"], where: { entryDate: range, deletedAt: null }, _count: true }),
    prisma.rawMaterialEntry.count({ where: { status: "PENDING_INSPECTION", deletedAt: null } }),
    prisma.lowStockAlert.count({ where: { status: "OPEN", product: { active: true } } }),
    prisma.$queryRaw<{ expired: bigint; near: bigint; ok: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE b."expiryDate" < ${today}::date) AS expired,
        COUNT(*) FILTER (WHERE b."expiryDate" >= ${today}::date AND b."expiryDate" <= ${today}::date + p."expiryAlertDays") AS near,
        COUNT(*) FILTER (WHERE b."expiryDate" > ${today}::date + p."expiryAlertDays") AS ok
      FROM "ProductBatch" b JOIN "ReadyProduct" p ON p."id" = b."productId"
      WHERE b."expiryDate" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "StockBalance" sb WHERE sb."batchId" = b."id" AND sb."bucket" = 'SALEABLE' AND sb."quantity" > 0)`,
    ecomPeriodTotals({ from, to }, ctx),
    prisma.productTransaction.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        unit: true,
        store: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.rawMaterialEntry.findMany({
      take: 6,
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { rawMaterial: true, supplier: true, unit: true, createdBy: { select: { name: true } } },
    }),
    prisma.rawMaterialEntry.findMany({
      take: 6,
      where: { status: "PENDING_INSPECTION", deletedAt: null },
      orderBy: { entryDate: "asc" },
      include: { rawMaterial: true, supplier: true, unit: true },
    }),
    prisma.lowStockAlert.findMany({
      take: 6,
      where: { status: "OPEN", product: { active: true } },
      orderBy: { triggeredAt: "desc" },
      include: { product: { include: { unit: true } } },
    }),
    prisma.$queryRaw<
      {
        batchId: string;
        batchNo: string;
        productId: string;
        product: string;
        expiryDate: Date;
        qty: Prisma.Decimal;
        unit: string;
        expired: boolean;
      }[]
    >`
      SELECT b."id" AS "batchId", b."batchNo", p."id" AS "productId", p."name" AS product, b."expiryDate", sb."quantity" AS qty, u."code" AS unit,
        b."expiryDate" < ${today}::date AS expired
      FROM "ProductBatch" b JOIN "ReadyProduct" p ON p."id" = b."productId" JOIN "Unit" u ON u."id" = p."unitId"
      JOIN "StockBalance" sb ON sb."batchId" = b."id" AND sb."bucket" = 'SALEABLE' AND sb."quantity" > 0
      WHERE b."expiryDate" IS NOT NULL AND b."expiryDate" <= ${today}::date + p."expiryAlertDays"
      ORDER BY b."expiryDate" ASC LIMIT 6`,
    prisma.$queryRaw<{ store: string; dispatched: Prisma.Decimal; returned: Prisma.Decimal }[]>`
      WITH d AS (
        SELECT dp."storeId", SUM(l."quantity") AS qty FROM "DispatchLine" l JOIN "Dispatch" dp ON dp."id" = l."dispatchId"
        WHERE dp."status" = 'POSTED' AND dp."dispatchDate" >= ${range.gte!} AND dp."dispatchDate" < ${range.lt!} GROUP BY 1
      ), r AS (
        SELECT pr."storeId", SUM(rl."quantity") AS qty FROM "ProductReturnLine" rl JOIN "ProductReturn" pr ON pr."id" = rl."returnId"
        WHERE pr."status" = 'POSTED' AND pr."returnDate" >= ${range.gte!} AND pr."returnDate" < ${range.lt!} GROUP BY 1
      )
      SELECT s."name" AS store, COALESCE(d.qty, 0) AS dispatched, COALESCE(r.qty, 0) AS returned
      FROM "Store" s LEFT JOIN d ON d."storeId" = s."id" LEFT JOIN r ON r."storeId" = s."id"
      WHERE d.qty IS NOT NULL OR r.qty IS NOT NULL ORDER BY COALESCE(d.qty, 0) DESC LIMIT 12`,
    prisma.$queryRaw<{ day: string; dispatched: Prisma.Decimal; returned: Prisma.Decimal }[]>`
      WITH days AS (
        SELECT to_char(g, 'YYYY-MM-DD') AS day FROM generate_series(${from}::date, ${to}::date, interval '1 day') g
      ), d AS (
        SELECT to_char(dp."dispatchDate" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, SUM(l."quantity") AS qty
        FROM "DispatchLine" l JOIN "Dispatch" dp ON dp."id" = l."dispatchId"
        WHERE dp."status" = 'POSTED' AND dp."dispatchDate" >= ${range.gte!} AND dp."dispatchDate" < ${range.lt!} GROUP BY 1
      ), r AS (
        SELECT to_char(pr."returnDate" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, SUM(rl."quantity") AS qty
        FROM "ProductReturnLine" rl JOIN "ProductReturn" pr ON pr."id" = rl."returnId"
        WHERE pr."status" = 'POSTED' AND pr."returnDate" >= ${range.gte!} AND pr."returnDate" < ${range.lt!} GROUP BY 1
      )
      SELECT days.day, COALESCE(d.qty, 0) AS dispatched, COALESCE(r.qty, 0) AS returned
      FROM days LEFT JOIN d ON d.day = days.day LEFT JOIN r ON r.day = days.day ORDER BY days.day`,
    // Active products by stock status (same rules as the stock report)
    prisma.$queryRaw<{ status: string; n: bigint }[]>`
      SELECT s."stockStatus" AS status, COUNT(*) AS n FROM (${productStockSql(today, { status: "ACTIVE" })}) s GROUP BY 1`,
    // Most-dispatched products in the period
    prisma.$queryRaw<{ id: string; name: string; sku: string; unit: string; qty: Prisma.Decimal }[]>`
      SELECT p."id", p."name", p."sku", u."code" AS unit, SUM(l."quantity") AS qty
      FROM "DispatchLine" l JOIN "Dispatch" d ON d."id" = l."dispatchId"
      JOIN "ReadyProduct" p ON p."id" = l."productId" JOIN "Unit" u ON u."id" = p."unitId"
      WHERE d."status" = 'POSTED' AND d."dispatchDate" >= ${range.gte!} AND d."dispatchDate" < ${range.lt!}
      GROUP BY p."id", u."code" ORDER BY qty DESC LIMIT 5`,
    // Products holding returned goods that still need an inspection decision
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT sb."productId") AS n FROM "StockBalance" sb WHERE sb."bucket" = 'QUARANTINE' AND sb."quantity" > 0`,
  ]);

  const statusCount = (s: string) => entryCounts.find((e) => e.status === s)?._count ?? 0;
  return {
    snapshot: {
      activeProducts,
      availableByUnit: availableByUnit.map((r) => ({ unit: r.unit, qty: r.qty.toString() })),
      pendingInspection: pendingTotal,
      lowStock: lowStockCount,
      expiredBatches: Number(expiryCounts[0]?.expired ?? 0),
      nearExpiryBatches: Number(expiryCounts[0]?.near ?? 0),
      okBatches: Number(expiryCounts[0]?.ok ?? 0),
      quarantinedProducts: Number(quarantined[0]?.n ?? 0),
      stockHealth: {
        ok: Number(stockHealth.find((r) => r.status === "OK")?.n ?? 0),
        low: Number(stockHealth.find((r) => r.status === "LOW")?.n ?? 0),
        out: Number(stockHealth.find((r) => r.status === "OUT")?.n ?? 0),
      },
    },
    period: {
      entriesPending: statusCount("PENDING_INSPECTION"),
      entriesApproved: statusCount("APPROVED"),
      entriesRejected: statusCount("REJECTED"),
      dispatchDocs: period.dispatchDocs,
      returnDocs: period.returnDocs,
      byUnit: period.byUnit.map((u) => ({
        unit: u.unit,
        dispatched: u.dispatched.toString(),
        returned: u.returned.toString(),
        net: u.net.toString(),
      })),
    },
    recentTxns,
    recentEntries,
    pendingEntries,
    lowStock,
    expiring,
    storeChart: storeChart.map((r) => ({ store: r.store, dispatched: Number(r.dispatched), returned: Number(r.returned) })),
    dailyChart: dailyChart.map((r) => ({ day: r.day, dispatched: Number(r.dispatched), returned: Number(r.returned) })),
    topProducts: topProducts.map((p) => ({ id: p.id, name: p.name, sku: p.sku, unit: p.unit, qty: Number(p.qty) })),
  };
}
