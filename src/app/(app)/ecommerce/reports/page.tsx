import { requirePage } from "@/server/auth";
import { reportsFor } from "@/server/reports";
import { PageHeader } from "@/components/app/page-header";
import { ReportIndex } from "@/components/reports/report-index";

export const metadata = { title: "E-commerce reports" };

export default async function Page() {
  const actor = await requirePage("ecom.reports");
  return (
    <>
      <PageHeader
        title="E-commerce reports"
        description="Store-wise and product-wise dispatches and returns. Net sent out = dispatched − returned; it is a stock movement, not marketplace sales."
        crumbs={[{ label: "E-commerce" }, { label: "Reports" }]}
      />
      <ReportIndex reports={reportsFor(actor, "ecom")} />
    </>
  );
}
