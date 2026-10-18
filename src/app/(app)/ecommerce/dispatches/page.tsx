import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { getReport } from "@/server/reports";
import { getSettings } from "@/server/settings";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { toLocalDateTimeInput } from "@/lib/dates";
import { SaleDialog } from "./sale-dialog";

export const metadata = { title: "Dispatches" };

export default async function DispatchesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePage(["ecom.view", "ecom.dispatch"]);
  const settings = await getSettings();
  const canSales = can(actor, "ecom.sales");
  const [stores, products] = canSales
    ? await Promise.all([
        prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.readyProduct.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true } }),
      ])
    : [[], []];
  return (
    <>
      <PageHeader
        title="Dispatch / Sales"
        description="Products sent to stores. A dispatch moves stock out of Shayvera; it is not a confirmed sale. Record store-reported sales separately for reconciliation."
        crumbs={[{ label: "E-commerce" }, { label: "Dispatches" }]}
        actions={
          <>
            {canSales && (
              <SaleDialog
                stores={stores}
                products={products.map((p) => ({ id: p.id, label: `${p.name} · ${p.sku}` }))}
                defaultDate={toLocalDateTimeInput(new Date(), settings.timezone)}
              />
            )}
            {can(actor, "ecom.dispatch") && (
              <Button asChild>
                <Link href="/ecommerce/dispatches/new">
                  <Plus /> New dispatch
                </Link>
              </Button>
            )}
          </>
        }
      />
      {can(actor, "ecom.view") ? (
        <ReportView
          def={getReport("ec-dispatch-register")!}
          params={await searchParams}
          basePath="/ecommerce/dispatches"
          emptyTitle="No dispatches yet"
        />
      ) : (
        <p className="text-sm text-muted-foreground">You can record dispatches. Ask an administrator for access to view the register.</p>
      )}
    </>
  );
}
