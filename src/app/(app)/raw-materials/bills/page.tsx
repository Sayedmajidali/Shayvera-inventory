import { requirePage } from "@/server/auth";
import { getReport } from "@/server/reports";
import { getSettings } from "@/server/settings";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";
import { UploadDialog } from "@/components/docs/upload-dialog";
import { uploadRawBillAction } from "../actions";

export const metadata = { title: "Bill entries" };

export default async function RawBillsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePage("rm.bills");
  const settings = await getSettings();
  return (
    <>
      <PageHeader
        title="Bill entries"
        description="Supplier bills and invoices, stored privately. Replacements keep the earlier version on record."
        crumbs={[{ label: "Raw Materials" }, { label: "Bill entries" }]}
        actions={
          <UploadDialog
            title="Upload supplier bill"
            description="Link the bill to a raw material entry. The supplier is taken from the entry."
            action={uploadRawBillAction}
            extraFields={[{ name: "entryNo", label: "Entry ID", placeholder: "RM-000001", required: true }]}
            maxMb={settings.maxUploadMb}
            triggerLabel="Upload bill"
            triggerVariant="default"
          />
        }
      />
      <ReportView
        def={getReport("rm-bills")!}
        params={await searchParams}
        basePath="/raw-materials/bills"
        showSummary={false}
        emptyTitle="No bills uploaded yet"
      />
    </>
  );
}
