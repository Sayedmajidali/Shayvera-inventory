import Link from "@/components/app/fast-link";
import { Prisma } from "@prisma/client";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { formatCalendarDate, formatDateTime, toLocalDateTimeInput, todayInTz } from "@/lib/dates";
import { dec, qtyString } from "@/lib/decimal";
import { ReturnForm } from "./return-form";

export const metadata = { title: "New return" };

export default async function NewReturnPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePage("ecom.return");
  const sp = await searchParams;
  const settings = await getSettings();
  const tz = settings.timezone;
  const df = settings.dateFormat;

  if (!sp.dispatch) {
    const q = sp.q?.trim();
    const candidates = await prisma.$queryRaw<
      { id: string; dispatchNo: string; dispatchDate: Date; store: string; orderRef: string | null; returnable: Prisma.Decimal }[]
    >`
      SELECT d."id", d."dispatchNo", d."dispatchDate", s."name" AS store, d."orderRef", SUM(l."quantity" - l."returnedQty") AS returnable
      FROM "Dispatch" d JOIN "Store" s ON s."id" = d."storeId" JOIN "DispatchLine" l ON l."dispatchId" = d."id"
      WHERE d."status" = 'POSTED' ${q ? Prisma.sql`AND (d."dispatchNo" ILIKE ${"%" + q + "%"} OR d."orderRef" ILIKE ${"%" + q + "%"} OR d."invoiceNumber" ILIKE ${"%" + q + "%"} OR s."name" ILIKE ${"%" + q + "%"})` : Prisma.empty}
      GROUP BY d."id", s."name" HAVING SUM(l."quantity" - l."returnedQty") > 0
      ORDER BY d."dispatchDate" DESC LIMIT 30`;
    return (
      <>
        <PageHeader
          title="New return"
          description="Step 1: choose the original dispatch. Returns can never exceed what was dispatched."
          crumbs={[{ label: "E-commerce" }, { label: "Returns", href: "/ecommerce/returns" }, { label: "New" }]}
        />
        <form className="mb-4 flex max-w-xl gap-2" role="search">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Dispatch ID, order ref, invoice no. or store"
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            autoFocus
          />
          <Button type="submit" size="sm" className="h-9">
            Search
          </Button>
        </form>
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          {candidates.length === 0 ? (
            <EmptyState
              title="No returnable dispatches found"
              description="Only posted dispatches with quantity still returnable are listed."
            />
          ) : (
            <ul className="divide-y">
              {candidates.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/ecommerce/returns/new?dispatch=${c.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40"
                  >
                    <span>
                      <span className="font-medium text-primary">{c.dispatchNo}</span> · {c.store}
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(c.dispatchDate, tz, df)}
                        {c.orderRef && ` · ${c.orderRef}`}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">{qtyString(c.returnable)} returnable</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  const d = await prisma.dispatch.findUnique({
    where: { id: sp.dispatch },
    include: {
      store: true,
      lines: { orderBy: { lineNo: "asc" }, include: { product: { include: { unit: true } }, allocations: { include: { batch: true } } } },
    },
  });
  if (!d)
    return (
      <EmptyState
        title="Dispatch not found"
        action={
          <Button asChild variant="outline">
            <Link href="/ecommerce/returns/new">Choose another dispatch</Link>
          </Button>
        }
      />
    );
  const today = todayInTz(tz);
  return (
    <>
      <PageHeader
        title={`Return against ${d.dispatchNo}`}
        description={`${d.store.name} · dispatched ${formatDateTime(d.dispatchDate, tz, df)}. Saleable returns go back to available stock; damaged and expired goods never do; pending inspection goes to quarantine.`}
        crumbs={[{ label: "E-commerce" }, { label: "Returns", href: "/ecommerce/returns" }, { label: "New" }]}
        actions={
          <Button variant="outline" asChild>
            <Link href="/ecommerce/returns/new">Change dispatch</Link>
          </Button>
        }
      />
      {d.status !== "POSTED" ? (
        <EmptyState title="This dispatch has been reversed" description="Returns cannot be recorded against a reversed dispatch." />
      ) : (
        <ReturnForm
          dispatchId={d.id}
          defaultDate={toLocalDateTimeInput(new Date(), tz)}
          timezone={tz}
          canUpload={can(actor, "ecom.bills")}
          maxMb={settings.maxUploadMb}
          lines={d.lines.map((l) => ({
            id: l.id,
            product: l.product.name,
            sku: l.product.sku,
            unit: l.product.unit.code,
            sent: qtyString(l.quantity),
            returnable: qtyString(dec(l.quantity).minus(l.returnedQty)),
            batches: l.allocations
              .map(
                (a) =>
                  `${a.batch.batchNo}${a.batch.expiryDate ? ` (exp ${formatCalendarDate(a.batch.expiryDate, df)}${a.batch.expiryDate < new Date(today + "T00:00:00Z") ? ", expired" : ""})` : ""}`,
              )
              .join(", "),
          }))}
        />
      )}
    </>
  );
}
