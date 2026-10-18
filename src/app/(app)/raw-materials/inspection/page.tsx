import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, FileWarning } from "lucide-react";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { formatQty } from "@/lib/decimal";
import { InspectionPanel } from "./inspection-panel";

export const metadata = { title: "Quality inspection" };
const PAGE = 10;

export default async function InspectionPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePage(["rm.inspect", "rm.view"]);
  const sp = await searchParams;
  const settings = await getSettings();
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    status: "PENDING_INSPECTION" as const,
    supplierId: sp.supplierId || undefined,
    ...(sp.q
      ? {
          OR: [
            { entryNo: { contains: sp.q, mode: "insensitive" as const } },
            { rawMaterial: { name: { contains: sp.q, mode: "insensitive" as const } } },
            { invoiceNumber: { contains: sp.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [entries, total, suppliers, decided] = await Promise.all([
    prisma.rawMaterialEntry.findMany({
      where,
      orderBy: [{ entryDate: "asc" }, { entryNo: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        rawMaterial: true,
        supplier: true,
        unit: true,
        createdBy: { select: { name: true } },
        attachments: { where: { status: "ACTIVE" }, orderBy: { uploadedAt: "desc" } },
      },
    }),
    prisma.rawMaterialEntry.count({ where }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.qualityInspection.findMany({
      where: { reversedAt: null },
      orderBy: { inspectedAt: "desc" },
      take: 8,
      include: { entry: { include: { rawMaterial: true, unit: true } }, inspectedBy: { select: { name: true } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const canInspect = can(actor, "rm.inspect");
  const tz = settings.timezone;
  const df = settings.dateFormat;

  return (
    <>
      <PageHeader
        title="Quality inspection"
        description="Approve or reject incoming materials. Pending quantities do not count as stock until approved."
        crumbs={[{ label: "Raw Materials" }, { label: "Quality inspection" }]}
        actions={<StatusBadge tone={total ? "warning" : "success"}>{total} pending</StatusBadge>}
      />
      <form className="no-print mb-4 flex flex-wrap gap-3 rounded-xl border bg-card p-3 shadow-xs" role="search">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Entry ID, product or invoice no."
          className="h-9 min-w-56 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <select
          name="supplierId"
          defaultValue={sp.supplierId ?? ""}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
        >
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" className="h-9">
          Filter
        </Button>
      </form>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {entries.length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EmptyState title="Nothing waiting for inspection" description="New raw material entries will appear here." />
            </div>
          ) : (
            entries.map((e) => (
              <article key={e.id} className="rounded-xl border bg-card p-4 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/raw-materials/entries/${e.id}`} className="text-sm font-semibold text-primary hover:underline">
                      {e.entryNo}
                    </Link>
                    <h3 className="text-lg font-semibold">{e.rawMaterial.name}</h3>
                    <p className="text-sm text-muted-foreground">{e.supplier.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold tabular-nums">{formatQty(e.quantity, e.unit.code)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(e.entryDate, tz, df)}</p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">PO no.</dt>
                    <dd>{e.poNumber ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Invoice no.</dt>
                    <dd>{e.invoiceNumber ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Entered by</dt>
                    <dd>{e.createdBy.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Bill</dt>
                    <dd>
                      {e.attachments[0] ? (
                        <a
                          href={`/api/files/${e.attachments[0].id}`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Eye className="size-3.5" /> View{e.attachments.length > 1 ? ` (${e.attachments.length})` : ""}
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <FileWarning className="size-3.5" /> None
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
                {e.notes && <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-sm">{e.notes}</p>}
                {canInspect && (
                  <div className="mt-4 border-t pt-4">
                    <InspectionPanel
                      entryId={e.id}
                      summary={`${e.entryNo}: ${formatQty(e.quantity, e.unit.code)} of ${e.rawMaterial.name}`}
                    />
                  </div>
                )}
              </article>
            ))
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" asChild className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
                <Link href={`?${new URLSearchParams({ ...sp, page: String(page - 1) })}`}>
                  <ChevronLeft /> Previous
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button variant="outline" size="sm" asChild className={page >= pages ? "pointer-events-none opacity-50" : ""}>
                <Link href={`?${new URLSearchParams({ ...sp, page: String(page + 1) })}`}>
                  Next <ChevronRight />
                </Link>
              </Button>
            </div>
          )}
        </div>
        <aside className="space-y-3">
          <div className="rounded-xl border bg-card shadow-xs">
            <h2 className="border-b px-4 py-3 text-sm font-semibold">Recent decisions</h2>
            {decided.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No decisions yet.</p>
            ) : (
              <ul className="divide-y">
                {decided.map((d) => (
                  <li key={d.id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/raw-materials/entries/${d.entryId}`} className="font-medium hover:underline">
                        {d.entry.entryNo}
                      </Link>
                      <StatusBadge tone={d.decision === "APPROVED" ? "success" : "danger"}>
                        {d.decision === "APPROVED" ? "Approved" : "Rejected"}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {d.entry.rawMaterial.name} · {formatQty(d.entry.quantity, d.entry.unit.code)} · {d.inspectedBy.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-2 text-sm">
            <Link className="text-primary hover:underline" href="/reports/rm-approved">
              All approved
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link className="text-primary hover:underline" href="/reports/rm-rejected">
              All rejected
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
