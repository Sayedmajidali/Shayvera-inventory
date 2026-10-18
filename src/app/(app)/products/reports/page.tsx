import { requirePage } from "@/server/auth";
import { reportsFor } from "@/server/reports";
import { PageHeader } from "@/components/app/page-header";
import { ReportIndex } from "@/components/reports/report-index";

export const metadata = { title: "Ready product reports" };

export default async function Page() {
  const actor = await requirePage("product.reports");
  return (
    <>
      <PageHeader
        title="Ready product reports"
        description="Stock, batches, expiry, low stock, movements and adjustments."
        crumbs={[{ label: "Ready Products" }, { label: "Reports" }]}
      />
      <ReportIndex reports={reportsFor(actor, "product")} />
    </>
  );
}
