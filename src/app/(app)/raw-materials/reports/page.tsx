import { requirePage } from "@/server/auth";
import { reportsFor } from "@/server/reports";
import { PageHeader } from "@/components/app/page-header";
import { ReportIndex } from "@/components/reports/report-index";

export const metadata = { title: "Raw material reports" };

export default async function Page() {
  const actor = await requirePage("rm.reports");
  return (
    <>
      <PageHeader
        title="Raw material reports"
        description="Filter by date, supplier, product, unit and inspection status. Export to CSV or print."
        crumbs={[{ label: "Raw Materials" }, { label: "Reports" }]}
      />
      <ReportIndex reports={reportsFor(actor, "raw")} />
    </>
  );
}
