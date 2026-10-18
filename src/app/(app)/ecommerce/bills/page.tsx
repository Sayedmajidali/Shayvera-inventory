import { requirePage } from "@/server/auth";
import { getReport } from "@/server/reports";
import { getSettings } from "@/server/settings";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";
import { UploadDialog } from "@/components/docs/upload-dialog";
import { uploadEcomDocAction } from "../actions";

export const metadata = { title: "E-commerce bills" };

export default async function EcomBillsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePage("ecom.bills");
  const settings = await getSettings();
  return (
    <>
      <PageHeader
        title="Bills and documents"
        description="Invoices, shipment and return documents, linked to their store and dispatch or return."
        crumbs={[{ label: "E-commerce" }, { label: "Bills" }]}
        actions={
          <UploadDialog
            title="Upload document"
            description="Enter the dispatch ID (DSP-…) or, for return documents, the return ID (RET-…)."
            action={uploadEcomDocAction}
            extraFields={[
              {
                name: "category",
                label: "Document type",
                options: [
                  { value: "DISPATCH_BILL", label: "Bill / invoice" },
                  { value: "SHIPMENT_DOCUMENT", label: "Shipment document" },
                  { value: "RETURN_DOCUMENT", label: "Return document" },
                ],
              },
              { name: "reference", label: "Dispatch or return ID", placeholder: "DSP-000001", required: true },
            ]}
            maxMb={settings.maxUploadMb}
            triggerLabel="Upload document"
            triggerVariant="default"
          />
        }
      />
      <ReportView
        def={getReport("ec-bills")!}
        params={await searchParams}
        basePath="/ecommerce/bills"
        showSummary={false}
        emptyTitle="No documents uploaded yet"
      />
    </>
  );
}
