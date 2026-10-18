import Link from "next/link";
import { notFound } from "next/navigation";
import { Undo2 } from "lucide-react";
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
import { BUCKET, DOC_STATUS, RETURN_CONDITION } from "@/lib/labels";
import { formatDateTime } from "@/lib/dates";
import { formatQty } from "@/lib/decimal";
import { reverseReturnAction, uploadEcomDocAction } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const row = await prisma.productReturn.findUnique({ where: { id: (await params).id }, select: { returnNo: true } });
  return { title: row?.returnNo ?? "Not found" };
}

export default async function ReturnDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage(["ecom.view", "ecom.return"]);
  const { id } = await params;
  const settings = await getSettings();
  const r = await prisma.productReturn.findUnique({
    where: { id },
    include: {
      store: true,
      dispatch: true,
      createdBy: { select: { name: true } },
      reversedBy: { select: { name: true } },
      lines: { include: { product: { include: { unit: true } } } },
      transactions: { orderBy: { createdAt: "asc" }, include: { batch: true } },
      attachments: { orderBy: { uploadedAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
    },
  });
  if (!r) notFound();
  const tz = settings.timezone;
  const df = settings.dateFormat;
  return (
    <>
      <PageHeader
        title={r.returnNo}
        description={`From ${r.store.name} · ${formatDateTime(r.returnDate, tz, df)}`}
        crumbs={[{ label: "E-commerce" }, { label: "Returns", href: "/ecommerce/returns" }, { label: r.returnNo }]}
        actions={
          <>
            <Pill map={DOC_STATUS} value={r.status} />
            {r.status === "POSTED" && can(actor, "inventory.reverse") && (
              <ConfirmAction
                trigger={
                  <Button variant="outline">
                    <Undo2 /> Reverse return
                  </Button>
                }
                title={`Reverse ${r.returnNo}?`}
                description={
                  <p>
                    The returned quantities are removed from the stock buckets they were added to, and become returnable again on{" "}
                    {r.dispatch.dispatchNo}. The original return stays on record.
                  </p>
                }
                reasonLabel="Reason for reversal"
                confirmLabel="Reverse return"
                destructive
                fields={{ returnId: r.id }}
                action={reverseReturnAction}
              />
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <SectionCard title="Return details">
            <DetailGrid
              items={[
                { label: "Return ID", value: r.returnNo },
                { label: "Date", value: formatDateTime(r.returnDate, tz, df) },
                { label: "Store", value: r.store.name },
                {
                  label: "Original dispatch",
                  value: (
                    <Link className="text-primary hover:underline" href={`/ecommerce/dispatches/${r.dispatchId}`}>
                      {r.dispatch.dispatchNo}
                    </Link>
                  ),
                },
                { label: "Reason", value: r.reason },
                { label: "Recorded by", value: `${r.createdBy.name} · ${formatDateTime(r.createdAt, tz, df)}` },
                { label: "Notes", value: r.notes },
                ...(r.reversedAt
                  ? [{ label: "Reversed", value: `${r.reversedBy?.name} · ${formatDateTime(r.reversedAt, tz, df)} — ${r.reversalReason}` }]
                  : []),
              ]}
            />
          </SectionCard>
          <SectionCard title="Returned products">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2">Condition</th>
                  <th className="px-4 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {r.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2">
                      <Link href={`/products/${l.productId}`} className="font-medium hover:underline">
                        {l.product.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{l.product.sku}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatQty(l.quantity, l.product.unit.code)}</td>
                    <td className="px-4 py-2">
                      <Pill map={RETURN_CONDITION} value={l.condition} />
                    </td>
                    <td className="px-4 py-2">{l.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
          <SectionCard title="Stock impact" description="Ledger rows posted by this return.">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Txn</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Batch</th>
                  <th className="px-4 py-2">Bucket</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {r.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2">{t.txnNo}</td>
                    <td className="px-4 py-2">{t.type === "REVERSAL" ? "Reversal" : "Return"}</td>
                    <td className="px-4 py-2">{t.batch.batchNo}</td>
                    <td className="px-4 py-2">
                      <Pill map={BUCKET} value={t.bucket} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {t.quantity.gt(0) ? "+" : ""}
                      {formatQty(t.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </div>
        <div className="space-y-6">
          {can(actor, "ecom.bills") && (
            <SectionCard
              title="Return documents"
              actions={
                <UploadDialog
                  title="Upload return document"
                  action={uploadEcomDocAction}
                  hidden={{ returnId: r.id, category: "RETURN_DOCUMENT" }}
                  maxMb={settings.maxUploadMb}
                  triggerLabel="Add"
                />
              }
            >
              <AttachmentList attachments={r.attachments} tz={tz} dateFormat={df} canReplace maxMb={settings.maxUploadMb} />
            </SectionCard>
          )}
          <SectionCard title="Activity">
            <AuditTrail entityType="ProductReturn" entityId={r.id} tz={tz} dateFormat={df} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
