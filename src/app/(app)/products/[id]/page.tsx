import Link from "@/components/app/fast-link";
import { notFound } from "next/navigation";
import { ArchiveRestore, Pencil, Power, Trash2 } from "lucide-react";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { getSettings } from "@/server/settings";
import { getReport } from "@/server/reports";
import { stockSummaries } from "@/server/services/products";
import { expiryStatus } from "@/server/services/inventory-core";
import { PageHeader } from "@/components/app/page-header";
import { DetailGrid, SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
import { Pill, StatusBadge } from "@/components/app/status-badge";
import { ReportView } from "@/components/reports/report-view";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { EXPIRY_STATUS } from "@/lib/labels";
import { dateOnlyString, daysBetween, formatCalendarDate, formatDateTime, todayInTz } from "@/lib/dates";
import { dec, formatQty, qtyString } from "@/lib/decimal";
import { deleteProductAction, restoreProductAction, setProductActiveAction } from "../actions";
import { AuditTrail } from "@/components/app/audit-trail";
import { AdjustDialog, DisposeDialog, ReceiveDialog, type BatchOption } from "./stock-dialogs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const row = await prisma.readyProduct.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: row?.name ?? "Not found" };
}

export default async function ProductDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await requirePage("product.view");
  const { id } = await params;
  const settings = await getSettings();
  const today = todayInTz(settings.timezone);
  const product = await prisma.readyProduct.findUnique({
    where: { id },
    include: {
      unit: true,
      category: true,
      batches: { orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedDate: "asc" }], include: { balances: true } },
      lowStockAlerts: { orderBy: { triggeredAt: "desc" }, take: 5 },
      deletedBy: { select: { name: true } },
    },
  });
  if (!product) notFound();
  const deleted = !!product.deletedAt;
  const s = (await stockSummaries([id], today)).get(id)!;
  const u = product.unit.code;
  const threshold = dec(product.lowStockThreshold);
  const low = threshold.gt(0) && s.available.lte(threshold);

  const batches = product.batches.map((b) => {
    const get = (k: string) => dec(b.balances.find((x) => x.bucket === k)?.quantity);
    const status = expiryStatus(b.expiryDate, today, product.expiryAlertDays);
    return { b, saleable: get("SALEABLE"), quarantine: get("QUARANTINE"), damaged: get("DAMAGED"), expired: get("EXPIRED"), status };
  });
  const batchOptions: BatchOption[] = batches.map((x) => ({
    id: x.b.id,
    batchNo: x.b.batchNo,
    expiry: x.b.expiryDate ? formatCalendarDate(x.b.expiryDate, settings.dateFormat) : null,
    saleable: qtyString(x.saleable),
    quarantine: qtyString(x.quarantine),
    damaged: qtyString(x.damaged),
    expired: qtyString(x.expired),
    isExpired: x.status === "EXPIRED",
  }));
  const visibleBatches = batches.filter((x) => !(x.saleable.isZero() && x.quarantine.isZero() && x.damaged.isZero() && x.expired.isZero()));

  return (
    <>
      <PageHeader
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{product.sku}</span>· {product.productCode}
            {product.category && <>· {product.category.name}</>}
            {!product.active && <StatusBadge tone="muted">Inactive</StatusBadge>}
          </span>
        }
        crumbs={[{ label: "Ready Products" }, { label: "Product master", href: "/products" }, { label: product.name }]}
        actions={
          deleted ? (
            can(actor, "admin.masters") && (
              <ConfirmAction
                trigger={
                  <Button variant="outline">
                    <ArchiveRestore /> Restore
                  </Button>
                }
                title={`Restore ${product.name}?`}
                description={<p>The product returns to the master as active, with its full history.</p>}
                reasonLabel="Reason for restoring"
                confirmLabel="Restore product"
                fields={{ productId: product.id }}
                action={restoreProductAction}
              />
            )
          ) : (
            <>
              {can(actor, "product.receive") && product.active && (
                <ReceiveDialog productId={product.id} unit={u} tracksExpiry={product.tracksExpiry} today={today} />
              )}
              {can(actor, "product.disposition") && <DisposeDialog unit={u} batches={batchOptions} />}
              {can(actor, "inventory.adjust") && <AdjustDialog productId={product.id} unit={u} batches={batchOptions} />}
              {can(actor, "admin.masters") && (
                <>
                  <Button variant="outline" asChild>
                    <Link href={`/products/${product.id}/edit`}>
                      <Pencil /> Edit
                    </Link>
                  </Button>
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost">
                        <Power /> {product.active ? "Deactivate" : "Activate"}
                      </Button>
                    }
                    title={product.active ? "Deactivate product?" : "Activate product?"}
                    description={
                      product.active
                        ? "Inactive products cannot be dispatched. Stock and history are kept."
                        : "The product can be dispatched again."
                    }
                    fields={{ id: product.id, active: String(!product.active) }}
                    action={setProductActiveAction}
                    destructive={product.active}
                  />
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" className="text-destructive hover:text-destructive">
                        <Trash2 /> Delete
                      </Button>
                    }
                    title={`Delete ${product.name}?`}
                    description={
                      <>
                        <p>
                          The product disappears from the product master, stock lists and pickers. Its batches, transactions and reports are
                          kept, the SKU stays reserved, and it can be restored.
                        </p>
                        <p>Deleting is only possible when it holds no stock in any bucket.</p>
                      </>
                    }
                    reasonLabel="Reason for deleting"
                    confirmLabel="Delete product"
                    destructive
                    fields={{ productId: product.id }}
                    action={deleteProductAction}
                  />
                </>
              )}
            </>
          )
        }
      />
      {deleted && (
        <div role="status" className="mb-6 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm">
          <p className="font-medium text-red-900">This product was deleted</p>
          <p className="text-red-900/80">
            {product.deletedBy?.name} · {formatDateTime(product.deletedAt!, settings.timezone, settings.dateFormat)} —{" "}
            {product.deleteReason}
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Available" value={formatQty(s.available, u)} hint="Saleable, not expired" tone={low ? "warning" : "default"} />
        <StatCard
          label="Low-stock threshold"
          value={formatQty(threshold, u)}
          hint={threshold.isZero() ? "Alert off" : low ? "At or below threshold" : "Above threshold"}
        />
        <StatCard
          label="Expired in stock"
          value={formatQty(s.expiredSaleable, u)}
          tone={s.expiredSaleable.gt(0) ? "danger" : "default"}
          hint="Not dispatchable"
        />
        <StatCard
          label="Quarantine"
          value={formatQty(s.quarantine, u)}
          tone={s.quarantine.gt(0) ? "warning" : "default"}
          hint="Returns awaiting inspection"
        />
        <StatCard label="Damaged / expired returns" value={formatQty(s.damaged.plus(s.expired), u)} hint="Non-saleable" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Batches"
          description={
            product.tracksExpiry
              ? `Expiry alert ${product.expiryAlertDays} days before expiry. Dispatches use first-expiry-first-out.`
              : "This product does not track expiry."
          }
          className="xl:col-span-2"
        >
          {visibleBatches.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No stock on hand.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Batch</th>
                    <th className="px-4 py-2">Received</th>
                    <th className="px-4 py-2">Expiry</th>
                    <th className="px-4 py-2 text-right">Saleable</th>
                    <th className="px-4 py-2 text-right">Quarantine</th>
                    <th className="px-4 py-2 text-right">Damaged</th>
                    <th className="px-4 py-2 text-right">Expired</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleBatches.map(({ b, saleable, quarantine, damaged, expired, status }) => {
                    const day = dateOnlyString(b.expiryDate);
                    return (
                      <tr key={b.id}>
                        <td className="px-4 py-2 font-medium">{b.batchNo}</td>
                        <td className="px-4 py-2">{formatCalendarDate(b.receivedDate, settings.dateFormat)}</td>
                        <td className="px-4 py-2">
                          {formatCalendarDate(b.expiryDate, settings.dateFormat)}
                          {day && (
                            <span className="block text-xs text-muted-foreground">
                              {daysBetween(today, day) >= 0
                                ? `${daysBetween(today, day)} days left`
                                : `${-daysBetween(today, day)} days ago`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatQty(saleable)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatQty(quarantine)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatQty(damaged)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatQty(expired)}</td>
                        <td className="px-4 py-2">
                          <Pill map={EXPIRY_STATUS} value={status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
        <div className="space-y-6">
          {product.imageAttachmentId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/${product.imageAttachmentId}`}
              alt={product.name}
              className="aspect-square w-full rounded-xl border bg-muted object-cover"
            />
          )}
          <SectionCard title="Product details">
            <DetailGrid
              items={[
                { label: "Unit", value: u },
                { label: "Barcode", value: product.barcode },
                { label: "Expiry alert", value: product.tracksExpiry ? `${product.expiryAlertDays} days` : "Not tracked" },
                { label: "Created", value: formatDateTime(product.createdAt, settings.timezone, settings.dateFormat) },
                { label: "Description", value: product.description },
              ]}
            />
          </SectionCard>
          <SectionCard title="Low-stock alerts">
            {product.lowStockAlerts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No alerts.</p>
            ) : (
              <ul className="divide-y">
                {product.lowStockAlerts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span>
                      {formatDateTime(a.triggeredAt, settings.timezone, settings.dateFormat)}
                      <span className="block text-xs text-muted-foreground">
                        {formatQty(a.availableQty, u)} vs threshold {formatQty(a.threshold, u)}
                        {a.resolvedAt && ` · resolved ${formatDateTime(a.resolvedAt, settings.timezone, settings.dateFormat)}`}
                      </span>
                    </span>
                    <StatusBadge tone={a.status === "OPEN" ? "warning" : "muted"}>{a.status === "OPEN" ? "Open" : "Resolved"}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="Change history"
        description="Edits, deletions and stock actions on this product, with old and new values."
        className="mt-6"
      >
        <AuditTrail entityType="ReadyProduct" entityId={product.id} tz={settings.timezone} dateFormat={settings.dateFormat} />
      </SectionCard>

      {can(actor, "product.reports") && (
        <div className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold">Stock movement ledger</h2>
          <ReportView
            def={getReport("pr-ledger")!}
            params={await searchParams}
            basePath={`/products/${id}`}
            fixed={{ productId: id }}
            hide={["categoryId"]}
            showSummary={false}
          />
        </div>
      )}
    </>
  );
}
