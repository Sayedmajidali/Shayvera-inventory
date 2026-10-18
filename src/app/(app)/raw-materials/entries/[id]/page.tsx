import { notFound } from "next/navigation";
import { Undo2 } from "lucide-react";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { DetailGrid, SectionCard } from "@/components/app/section-card";
import { Pill, StatusBadge } from "@/components/app/status-badge";
import { AuditTrail } from "@/components/app/audit-trail";
import { AttachmentList } from "@/components/docs/attachment-list";
import { UploadDialog } from "@/components/docs/upload-dialog";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { ENTRY_STATUS, RAW_TXN_TYPE } from "@/lib/labels";
import { formatDateTime } from "@/lib/dates";
import { formatQty } from "@/lib/decimal";
import { InspectionPanel } from "../../inspection/inspection-panel";
import { reverseInspectionAction, uploadRawBillAction } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const row = await prisma.rawMaterialEntry.findUnique({ where: { id: (await params).id }, select: { entryNo: true } });
  return { title: row?.entryNo ?? "Not found" };
}

export default async function EntryDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage(["rm.view", "rm.inspect", "rm.entry.create"]);
  const { id } = await params;
  const settings = await getSettings();
  const entry = await prisma.rawMaterialEntry.findUnique({
    where: { id },
    include: {
      rawMaterial: true,
      supplier: true,
      unit: true,
      createdBy: { select: { name: true } },
      inspections: {
        orderBy: { inspectedAt: "desc" },
        include: { inspectedBy: { select: { name: true } }, reversedBy: { select: { name: true } } },
      },
      transactions: { orderBy: { createdAt: "asc" }, include: { createdBy: { select: { name: true } } } },
      attachments: { orderBy: { uploadedAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
    },
  });
  if (!entry) notFound();
  const tz = settings.timezone;
  const df = settings.dateFormat;
  const canBills = can(actor, "rm.bills") || can(actor, "rm.inspect");
  const active = entry.inspections.find((i) => !i.reversedAt);

  return (
    <>
      <PageHeader
        title={entry.entryNo}
        description={`${formatQty(entry.quantity, entry.unit.code)} of ${entry.rawMaterial.name} from ${entry.supplier.name}`}
        crumbs={[{ label: "Raw Materials" }, { label: "Material entries", href: "/raw-materials/entries" }, { label: entry.entryNo }]}
        actions={<Pill map={ENTRY_STATUS} value={entry.status} />}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <SectionCard title="Entry details">
            <DetailGrid
              items={[
                { label: "Entry ID", value: entry.entryNo },
                { label: "Entry date", value: formatDateTime(entry.entryDate, tz, df) },
                { label: "Status", value: <Pill map={ENTRY_STATUS} value={entry.status} /> },
                { label: "Product", value: entry.rawMaterial.name },
                { label: "Supplier", value: `${entry.supplier.name} (${entry.supplier.code})` },
                { label: "Quantity", value: formatQty(entry.quantity, entry.unit.code) },
                { label: "PO number", value: entry.poNumber },
                { label: "Invoice number", value: entry.invoiceNumber },
                { label: "Entered by", value: `${entry.createdBy.name} · ${formatDateTime(entry.createdAt, tz, df)}` },
                { label: "Notes", value: entry.notes },
              ]}
            />
          </SectionCard>

          {entry.status === "PENDING_INSPECTION" && can(actor, "rm.inspect") && (
            <SectionCard title="Quality inspection" description="Approving adds the quantity to raw material stock exactly once.">
              <div className="p-4">
                <InspectionPanel
                  entryId={entry.id}
                  summary={`${entry.entryNo}: ${formatQty(entry.quantity, entry.unit.code)} of ${entry.rawMaterial.name}`}
                />
              </div>
            </SectionCard>
          )}

          <SectionCard title="Inspection history">
            {entry.inspections.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Awaiting inspection.</p>
            ) : (
              <ul className="divide-y">
                {entry.inspections.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={i.reversedAt ? "muted" : i.decision === "APPROVED" ? "success" : "danger"}>
                          {i.decision === "APPROVED" ? "Approved" : "Rejected"}
                          {i.reversedAt && " · reversed"}
                        </StatusBadge>
                        <span className="text-muted-foreground">
                          by {i.inspectedBy.name} · {formatDateTime(i.inspectedAt, tz, df)}
                        </span>
                      </div>
                      {i.rejectionReason && <p>Reason: {i.rejectionReason}</p>}
                      {i.notes && <p className="text-muted-foreground">Notes: {i.notes}</p>}
                      {i.reversedAt && (
                        <p className="text-muted-foreground">
                          Reversed by {i.reversedBy?.name} · {formatDateTime(i.reversedAt, tz, df)} — {i.reversalReason}
                        </p>
                      )}
                    </div>
                    {i.id === active?.id && can(actor, "inventory.reverse") && (
                      <ConfirmAction
                        trigger={
                          <Button variant="outline" size="sm">
                            <Undo2 /> Reverse for re-inspection
                          </Button>
                        }
                        title="Reverse inspection decision?"
                        description={
                          <>
                            <p>The original decision stays on record and is marked as reversed. The entry returns to Pending inspection.</p>
                            {i.decision === "APPROVED" && (
                              <p>
                                The approved quantity will be removed from stock with a reversal transaction. This fails if the stock has
                                already been used.
                              </p>
                            )}
                          </>
                        }
                        reasonLabel="Reason for reversal"
                        confirmLabel="Reverse decision"
                        destructive
                        fields={{ inspectionId: i.id }}
                        action={reverseInspectionAction}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Stock postings" description="Immutable ledger rows created by this entry.">
            {entry.transactions.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No stock has been posted for this entry.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Txn</th>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2 text-right">Quantity</th>
                      <th className="px-4 py-2 text-right">Balance after</th>
                      <th className="px-4 py-2">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {entry.transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 py-2">{t.txnNo}</td>
                        <td className="px-4 py-2">{formatDateTime(t.createdAt, tz, df)}</td>
                        <td className="px-4 py-2">{RAW_TXN_TYPE[t.type]}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {t.quantity.gt(0) ? "+" : ""}
                          {formatQty(t.quantity, entry.unit.code)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatQty(t.balanceAfter)}</td>
                        <td className="px-4 py-2">{t.createdBy.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          {canBills && (
            <SectionCard
              title="Bills and invoices"
              actions={
                can(actor, "rm.bills") && (
                  <UploadDialog
                    title="Upload bill"
                    description={`Attach a bill to ${entry.entryNo}.`}
                    action={uploadRawBillAction}
                    hidden={{ entryId: entry.id }}
                    maxMb={settings.maxUploadMb}
                    triggerLabel="Add"
                  />
                )
              }
            >
              <AttachmentList
                attachments={entry.attachments}
                tz={tz}
                dateFormat={df}
                canReplace={can(actor, "rm.bills")}
                maxMb={settings.maxUploadMb}
              />
            </SectionCard>
          )}
          <SectionCard title="Activity">
            <AuditTrail entityType="RawMaterialEntry" entityId={entry.id} tz={tz} dateFormat={df} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
