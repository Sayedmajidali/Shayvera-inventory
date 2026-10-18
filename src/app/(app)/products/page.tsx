import Link from "@/components/app/fast-link";
import { Plus } from "lucide-react";
import { requirePage } from "@/server/auth";
import { can } from "@/server/permissions";
import { getReport } from "@/server/reports";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Product master" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePage("product.view");
  return (
    <>
      <PageHeader
        title="Product master"
        description="Finished products ready for sale, each with its own low-stock threshold and expiry alert period."
        crumbs={[{ label: "Ready Products" }, { label: "Product master" }]}
        actions={
          can(actor, "admin.masters") && (
            <Button asChild>
              <Link href="/products/new">
                <Plus /> New product
              </Link>
            </Button>
          )
        }
      />
      <ReportView
        def={getReport("pr-master")!}
        params={await searchParams}
        basePath="/products"
        showSummary={false}
        emptyTitle="No products yet"
      />
    </>
  );
}
