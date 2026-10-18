import { requirePage } from "@/server/auth";
import { getReport } from "@/server/reports";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Raw material stock" };

export default async function RawStockPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePage("rm.view");
  return (
    <>
      <PageHeader
        title="Raw material stock"
        description="Live balances from the stock ledger. kg and pieces are tracked separately and never combined. Pending inspection quantities are shown for information only."
        crumbs={[{ label: "Raw Materials" }, { label: "Stock" }]}
      />
      <ReportView
        def={getReport("rm-stock")!}
        params={await searchParams}
        basePath="/raw-materials/stock"
        showSummary={false}
        emptyTitle="No approved raw materials yet"
      />
    </>
  );
}
