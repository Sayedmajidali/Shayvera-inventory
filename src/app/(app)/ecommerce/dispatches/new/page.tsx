import { Prisma } from "@prisma/client";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { formatCalendarDate, toLocalDateTimeInput, todayInTz } from "@/lib/dates";
import { DispatchForm, type ProductOption } from "./dispatch-form";

export const metadata = { title: "New dispatch" };

export default async function NewDispatchPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePage("ecom.dispatch");
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayInTz(settings.timezone);
  const [stores, products, batches] = await Promise.all([
    prisma.store.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.readyProduct.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { unit: true } }),
    prisma.$queryRaw<{ productId: string; batchId: string; batchNo: string; expiryDate: Date | null; qty: Prisma.Decimal }[]>`
      SELECT sb."productId", b."id" AS "batchId", b."batchNo", b."expiryDate", sb."quantity" AS qty
      FROM "StockBalance" sb JOIN "ProductBatch" b ON b."id" = sb."batchId" JOIN "ReadyProduct" p ON p."id" = sb."productId"
      WHERE sb."bucket" = 'SALEABLE' AND sb."quantity" > 0 AND p."active" AND (b."expiryDate" IS NULL OR b."expiryDate" >= ${today}::date)
      ORDER BY b."expiryDate" ASC NULLS LAST, b."receivedDate" ASC`,
  ]);
  const options: ProductOption[] = products.map((p) => {
    const bs = batches.filter((b) => b.productId === p.id);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit.code,
      allowsDecimal: p.unit.allowsDecimal,
      available: bs.reduce((a, b) => a.plus(b.qty), new Prisma.Decimal(0)).toString(),
      batches: bs.map((b) => ({
        id: b.batchId,
        label: `${b.batchNo}${b.expiryDate ? ` · exp ${formatCalendarDate(b.expiryDate, settings.dateFormat)}` : ""}`,
        qty: b.qty.toString(),
      })),
    };
  });
  return (
    <>
      <PageHeader
        title="New dispatch"
        description="Send products from Shayvera inventory to a store. Stock is deducted when you post, using first-expiry-first-out unless you pick a batch. Expired stock is never dispatched."
        crumbs={[{ label: "E-commerce" }, { label: "Dispatches", href: "/ecommerce/dispatches" }, { label: "New" }]}
      />
      <DispatchForm
        stores={stores}
        products={options}
        defaultDate={toLocalDateTimeInput(new Date(), settings.timezone)}
        defaultStoreId={sp.store}
        canUpload={can(actor, "ecom.bills")}
        maxMb={settings.maxUploadMb}
        timezone={settings.timezone}
      />
    </>
  );
}
