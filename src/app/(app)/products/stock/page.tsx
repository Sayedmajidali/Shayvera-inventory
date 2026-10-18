import { requirePage } from "@/server/auth";
import { getReport } from "@/server/reports";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Stock overview" };

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePage("product.view");
  return (
    <>
      <PageHeader
        title="Stock overview"
        description="Available = saleable stock that has not expired. Dispatched and returned totals come from the ledger, net of reversals."
        crumbs={[{ label: "Ready Products" }, { label: "Stock overview" }]}
      />
      <ReportView def={getReport("pr-stock")!} params={await searchParams} basePath="/products/stock" showSummary={false} />
    </>
  );
}
