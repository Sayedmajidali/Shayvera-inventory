import Link from "next/link";
import { notFound } from "next/navigation";
import { Undo2, Undo } from "lucide-react";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { DetailGrid, SectionCard } from "@/components/app/section-card";
import { Pill } from "@/components/app/status-badge";
import { AuditTrail } from "@/components/app/audit-trail";
import { AttachmentList } from "@/components/docs/attachment-list";
import { UploadDialog } from "@/components/docs/upload-dialog";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { DOC_STATUS } from "@/lib/labels";
import { formatCalendarDate, formatDateTime } from "@/lib/dates";
import { dec, formatQty } from "@/lib/decimal";
import { reverseDispatchAction, uploadEcomDocAction } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const row = await prisma.dispatch.findUnique({ where: { id: (await params).id }, select: { dispatchNo: true } });
  return { title: row?.dispatchNo ?? "Not found" };
}

export default async function DispatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage(["ecom.view", "ecom.dispatch"]);
  const { id } = await params;
  const settings = await getSettings();
  const d = await prisma.dispatch.findUnique({
    where: { id },
    include: {
      store: true,
      createdBy: { select: { name: true } },
      reversedBy: { select: { name: true } },
      lines: { orderBy: { lineNo: "asc" }, include: { product: { include: { unit: true } }, allocations: { include: { batch: true } } } },
      returns: { orderBy: { returnDate: "desc" }, include: { lines: true } },
      attachments: { orderBy: { uploadedAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
    },
  });
  if (!d) notFound();
  const tz = settings.timezone;
  const df = settings.dateFormat;
  const returnable = d.lines.some((l) => dec(l.quantity).gt(dec(l.returnedQty)));
  const postedReturns = d.returns.filter((r) => r.status === "POSTED").length;

  return (
    <>
      <PageHeader
        title={d.dispatchNo}
        description={`To ${d.store.name} · ${formatDateTime(d.dispatchDate, tz, df)}`}
        crumbs={[{ label: "E-commerce" }, { label: "Dispatches", href: "/ecommerce/dispatches" }, { label: d.dispatchNo }]}
        actions={
          <>
            <Pill map={DOC_STATUS} value={d.status} />
            {d.status === "POSTED" && returnable && can(actor, "ecom.return") && (
              <Button variant="outline" asChild>
                <Link href={`/ecommerce/returns/new?dispatch=${d.id}`}>
                  <Undo /> Record return
                </Link>
              </Button>
            )}
            {d.status === "POSTED" && can(actor, "inventory.reverse") && (
              <ConfirmAction
                trigger={
                  <Button variant="outline" disabled={postedReturns > 0} title={postedReturns ? "Reverse its returns first" : undefined}>
                    <Undo2 /> Reverse dispatch
                  </Button>
                }
                title={`Reverse ${d.dispatchNo}?`}
                description={
                  <p>
                    All dispatched quantities go back to their original batches as reversal transactions. The original dispatch stays on
                    record as Reversed.
                  </p>
                }
                reasonLabel="Reason for reversal"
                confirmLabel="Reverse dispatch"
                destructive
                fields={{ dispatchId: d.id }}
                action={reverseDispatchAction}
              />
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <SectionCard title="Dispatch details">
            <DetailGrid
              items={[
                { label: "Dispatch ID", value: d.dispatchNo },
                { label: "Date", value: formatDateTime(d.dispatchDate, tz, df) },
                { label: "Store", value: `${d.store.name} (${d.store.code})` },
                { label: "Order / shipment ref", value: d.orderRef },
                { label: "Invoice / bill no.", value: d.invoiceNumber },
                { label: "Recorded by", value: `${d.createdBy.name} · ${formatDateTime(d.createdAt, tz, df)}` },
                { label: "Notes", value: d.notes },
                ...(d.reversedAt
                  ? [{ label: "Reversed", value: `${d.reversedBy?.name} · ${formatDateTime(d.reversedAt, tz, df)} — ${d.reversalReason}` }]
                  : []),
              ]}
            />
          </SectionCard>
          <SectionCard title="Lines and batch allocation">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2">Batches</th>
                    <th className="px-4 py-2 text-right">Sent</th>
                    <th className="px-4 py-2 text-right">Returned</th>
                    <th className="px-4 py-2 text-right">Returnable</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {d.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2 text-muted-foreground">{l.lineNo}</td>
                      <td className="px-4 py-2">
                        <Link href={`/products/${l.productId}`} className="font-medium hover:underline">
                          {l.product.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{l.product.sku}</span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {l.allocations.map((a) => (
                          <div key={a.id}>
                            {a.batch.batchNo}
                            {a.batch.expiryDate && ` (exp ${formatCalendarDate(a.batch.expiryDate, df)})`}: {formatQty(a.quantity)}
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatQty(l.quantity, l.product.unit.code)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatQty(l.returnedQty)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {d.status === "POSTED" ? formatQty(dec(l.quantity).minus(l.returnedQty)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
          <SectionCard title="Returns against this dispatch">
            {d.returns.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No returns recorded.</p>
            ) : (
              <ul className="divide-y">
                {d.returns.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span>
                      <Link href={`/ecommerce/returns/${r.id}`} className="font-medium text-primary hover:underline">
                        {r.returnNo}
                      </Link>{" "}
                      · {formatDateTime(r.returnDate, tz, df)} · {r.reason}
                    </span>
                    <Pill map={DOC_STATUS} value={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
        <div className="space-y-6">
          {can(actor, "ecom.bills") && (
            <SectionCard
              title="Bills and shipment documents"
              actions={
                <UploadDialog
                  title="Upload document"
                  action={uploadEcomDocAction}
                  hidden={{ dispatchId: d.id }}
                  extraFields={[
                    {
                      name: "category",
                      label: "Document type",
                      options: [
                        { value: "DISPATCH_BILL", label: "Bill / invoice" },
                        { value: "SHIPMENT_DOCUMENT", label: "Shipment document" },
                      ],
                    },
                  ]}
                  maxMb={settings.maxUploadMb}
                  triggerLabel="Add"
                />
              }
            >
              <AttachmentList attachments={d.attachments} tz={tz} dateFormat={df} canReplace maxMb={settings.maxUploadMb} />
            </SectionCard>
          )}
          <SectionCard title="Activity">
            <AuditTrail entityType="Dispatch" entityId={d.id} tz={tz} dateFormat={df} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
