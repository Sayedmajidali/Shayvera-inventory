import Link from "@/components/app/fast-link";
import { Power } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { formatQty } from "@/lib/decimal";
import { setRawMaterialActiveAction } from "../actions";
import { MaterialDialog } from "./material-dialog";

export const metadata = { title: "Raw material master" };

export default async function RawMaterialsMasterPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePage(["admin.masters", "rm.view"]);
  const sp = await searchParams;
  const manage = can(actor, "admin.masters");
  const where: Prisma.RawMaterialWhereInput = {
    unitId: sp.unitId || undefined,
    active: sp.status === "ACTIVE" ? true : sp.status === "INACTIVE" ? false : undefined,
    ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" } } : {}),
  };
  const [materials, units, pending] = await Promise.all([
    prisma.rawMaterial.findMany({
      where,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { unit: true, _count: { select: { entries: { where: { deletedAt: null } } } } },
      take: 500,
    }),
    prisma.unit.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, code: true, active: true } }),
    prisma.rawMaterialEntry.groupBy({
      by: ["rawMaterialId"],
      where: { status: "PENDING_INSPECTION", deletedAt: null },
      _sum: { quantity: true },
    }),
  ]);
  const pendingOf = (id: string) => pending.find((p) => p.rawMaterialId === id)?._sum.quantity ?? 0;
  const activeUnits = units.filter((u) => u.active);

  return (
    <>
      <PageHeader
        title="Raw material master"
        description="The materials you buy. Add them here once and pick them when recording incoming stock; names typed in a new entry are added automatically too."
        crumbs={[{ label: "Master Data", href: "/masters" }, { label: "Raw materials" }]}
        actions={manage && <MaterialDialog units={activeUnits} />}
      />
      <form className="no-print mb-4 flex flex-wrap gap-2 rounded-xl border bg-card p-3 shadow-xs" role="search">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search materials"
          className="h-9 min-w-48 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <select
          name="unitId"
          defaultValue={sp.unitId ?? ""}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Unit"
        >
          <option value="">All units</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.code}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Status"
        >
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <Button type="submit" size="sm" className="h-9">
          Filter
        </Button>
      </form>
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {materials.length === 0 ? (
          <EmptyState
            title="No raw materials yet"
            description={
              manage
                ? "Add the materials you buy so staff can pick them when recording entries."
                : "Materials appear here once they're added or received."
            }
            action={manage && <MaterialDialog units={activeUnits} />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Material</th>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5 text-right">In stock</th>
                  <th className="px-4 py-2.5 text-right">Pending inspection</th>
                  <th className="px-4 py-2.5 text-right">Entries</th>
                  <th className="px-4 py-2.5">Status</th>
                  {manage && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {materials.map((m) => (
                  <tr key={m.id} className={m.active ? "transition-colors hover:bg-secondary/50" : "text-muted-foreground"}>
                    <td className="px-4 py-2.5">
                      <Link href={`/raw-materials/stock/${m.id}`} className="font-medium hover:text-primary hover:underline">
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{m.unit.code}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatQty(m.currentBalance)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatQty(pendingOf(m.id))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{m._count.entries}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={m.active ? "success" : "muted"}>{m.active ? "Active" : "Inactive"}</StatusBadge>
                    </td>
                    {manage && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <MaterialDialog
                          material={{ id: m.id, name: m.name, unitId: m.unitId }}
                          units={units}
                          unitLocked={m._count.entries > 0}
                        />
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="sm">
                              <Power /> {m.active ? "Deactivate" : "Activate"}
                            </Button>
                          }
                          title={m.active ? `Deactivate ${m.name}?` : `Activate ${m.name}?`}
                          description={
                            m.active
                              ? "It can't be used for new entries. Stock and history are kept."
                              : "It can be used for new entries again."
                          }
                          fields={{ id: m.id, active: String(!m.active) }}
                          action={setRawMaterialActiveAction}
                          destructive={m.active}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
