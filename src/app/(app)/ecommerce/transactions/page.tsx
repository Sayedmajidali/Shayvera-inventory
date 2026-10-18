import { requirePage } from "@/server/auth";
import { getReport } from "@/server/reports";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Transaction history" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePage("ecom.view");
  return (
    <>
      <PageHeader
        title="Transaction history"
        description="Every dispatch, store-reported sale, return, reversal and adjustment. Posted transactions are never deleted; corrections appear as reversal entries."
        crumbs={[{ label: "E-commerce" }, { label: "Transaction history" }]}
      />
      <ReportView def={getReport("ec-transactions")!} params={await searchParams} basePath="/ecommerce/transactions" showSummary={false} />
    </>
  );
}
