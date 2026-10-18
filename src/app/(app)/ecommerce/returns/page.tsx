import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePage } from "@/server/auth";
import { can } from "@/server/permissions";
import { getReport } from "@/server/reports";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Returns" };

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePage(["ecom.view", "ecom.return"]);
  return (
    <>
      <PageHeader
        title="Returns"
        description="Products returned by stores. Only saleable returns go back to available stock."
        crumbs={[{ label: "E-commerce" }, { label: "Returns" }]}
        actions={
          can(actor, "ecom.return") && (
            <Button asChild>
              <Link href="/ecommerce/returns/new">
                <Plus /> New return
              </Link>
            </Button>
          )
        }
      />
      {can(actor, "ecom.view") ? (
        <ReportView
          def={getReport("ec-return-register")!}
          params={await searchParams}
          basePath="/ecommerce/returns"
          emptyTitle="No returns yet"
        />
      ) : (
        <p className="text-sm text-muted-foreground">You can record returns. Ask an administrator for access to view the register.</p>
      )}
    </>
  );
}
