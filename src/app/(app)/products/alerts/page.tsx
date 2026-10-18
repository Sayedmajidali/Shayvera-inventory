import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { getReport } from "@/server/reports";
import { getSettings } from "@/server/settings";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { todayInTz } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Stock alerts" };

const TABS = [
  { key: "low", label: "Low stock" },
  { key: "expiry", label: "Expiry" },
  { key: "quarantine", label: "Quarantine" },
] as const;

export default async function AlertsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePage("product.view");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab : "low";
  const settings = await getSettings();
  const today = todayInTz(settings.timezone);

  const [counts] = await prisma.$queryRaw<{ expired: bigint; near: bigint; ok: bigint; quarantine: bigint; low: bigint }[]>`
    SELECT
      (SELECT COUNT(*) FROM "ProductBatch" b JOIN "ReadyProduct" p ON p."id" = b."productId"
        WHERE b."expiryDate" < ${today}::date AND EXISTS (SELECT 1 FROM "StockBalance" sb WHERE sb."batchId" = b."id" AND sb."bucket" = 'SALEABLE' AND sb."quantity" > 0)) AS expired,
      (SELECT COUNT(*) FROM "ProductBatch" b JOIN "ReadyProduct" p ON p."id" = b."productId"
        WHERE b."expiryDate" >= ${today}::date AND b."expiryDate" <= ${today}::date + p."expiryAlertDays"
          AND EXISTS (SELECT 1 FROM "StockBalance" sb WHERE sb."batchId" = b."id" AND sb."bucket" = 'SALEABLE' AND sb."quantity" > 0)) AS near,
      (SELECT COUNT(*) FROM "ProductBatch" b JOIN "ReadyProduct" p ON p."id" = b."productId"
        WHERE (b."expiryDate" IS NULL OR b."expiryDate" > ${today}::date + p."expiryAlertDays")
          AND EXISTS (SELECT 1 FROM "StockBalance" sb WHERE sb."batchId" = b."id" AND sb."bucket" = 'SALEABLE' AND sb."quantity" > 0)) AS ok,
      (SELECT COUNT(DISTINCT sb."productId") FROM "StockBalance" sb WHERE sb."bucket" = 'QUARANTINE' AND sb."quantity" > 0) AS quarantine,
      (SELECT COUNT(*) FROM "LowStockAlert" a JOIN "ReadyProduct" p ON p."id" = a."productId" WHERE a."status" = 'OPEN' AND p."active") AS low`;

  const quarantined =
    tab === "quarantine"
      ? await prisma.$queryRaw<{ id: string; name: string; sku: string; unit: string; qty: Prisma.Decimal; batches: bigint }[]>`
          SELECT p."id", p."name", p."sku", u."code" AS unit, SUM(sb."quantity") AS qty, COUNT(*) AS batches
          FROM "StockBalance" sb JOIN "ReadyProduct" p ON p."id" = sb."productId" JOIN "Unit" u ON u."id" = p."unitId"
          WHERE sb."bucket" = 'QUARANTINE' AND sb."quantity" > 0 GROUP BY p."id", u."code" ORDER BY p."name"`
      : [];

  return (
    <>
      <PageHeader
        title="Stock alerts"
        description="Low-stock alerts use each product's own threshold. Expiry alerts use each product's own alert period and every batch's expiry date."
        crumbs={[{ label: "Ready Products" }, { label: "Alerts" }]}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Low-stock products"
          value={Number(counts.low)}
          tone={counts.low ? "warning" : "default"}
          href="/products/alerts?tab=low"
        />
        <StatCard
          label="Expired batches"
          value={Number(counts.expired)}
          tone={counts.expired ? "danger" : "default"}
          hint="Still holding saleable stock"
          href="/products/alerts?tab=expiry&expiryStatus=EXPIRED"
        />
        <StatCard
          label="Expiring soon"
          value={Number(counts.near)}
          tone={counts.near ? "warning" : "default"}
          hint="Within alert period"
          href="/products/alerts?tab=expiry&expiryStatus=NEAR_EXPIRY"
        />
        <StatCard label="Not yet expiring" value={Number(counts.ok)} hint="Batches with stock" href="/reports/pr-batches?expiryStatus=OK" />
        <StatCard
          label="Products in quarantine"
          value={Number(counts.quarantine)}
          tone={counts.quarantine ? "warning" : "default"}
          href="/products/alerts?tab=quarantine"
        />
      </div>
      <div className="no-print mb-4 flex gap-1 rounded-lg border bg-muted/50 p-1 sm:w-fit" role="tablist">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/products/alerts?tab=${t.key}`}
            role="tab"
            aria-selected={tab === t.key}
            className={cn(
              "flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium sm:flex-none",
              tab === t.key ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {tab === "low" && (
        <ReportView
          def={getReport("pr-low-stock")!}
          params={sp}
          basePath="/products/alerts"
          showSummary={false}
          emptyTitle="No low-stock products"
          emptyDescription="All active products are above their thresholds."
        />
      )}
      {tab === "expiry" && (
        <ReportView
          def={getReport("pr-expiry")!}
          params={sp}
          basePath="/products/alerts"
          showSummary={false}
          emptyTitle="No expiry alerts"
          emptyDescription="No batch with saleable stock is expired or inside its alert period."
        />
      )}
      {tab === "quarantine" && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          {quarantined.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No returned goods are waiting for inspection.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2 text-right">Quarantined</th>
                  <th className="px-4 py-2 text-right">Batches</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quarantined.map((q) => (
                  <tr key={q.id}>
                    <td className="px-4 py-2">
                      <Link href={`/products/${q.id}`} className="font-medium text-primary hover:underline">
                        {q.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{q.sku}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {q.qty.toString()} {q.unit}
                    </td>
                    <td className="px-4 py-2 text-right">{Number(q.batches)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
