import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { setUnitActiveAction } from "@/app/(app)/admin/actions";
import { AddUnitForm } from "../master-lists";

export const metadata = { title: "Units" };

export default async function UnitsPage() {
  await requirePage("admin.masters");
  const units = await prisma.unit.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { products: true, rawMaterials: true } } },
  });
  return (
    <>
      <PageHeader
        title="Units of measurement"
        description="Units used for raw materials and products. Units in use can't be removed, only deactivated."
        crumbs={[{ label: "Master Data", href: "/masters" }, { label: "Units" }]}
      />
      <SectionCard
        title={`${units.length} units`}
        description="Whole-number units (like pieces) reject fractions; decimal units (like kg) allow up to 3 decimals."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Quantities</th>
                <th className="px-4 py-2.5 text-right">Raw materials</th>
                <th className="px-4 py-2.5 text-right">Products</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {units.map((u) => (
                <tr key={u.id} className={u.active ? "transition-colors hover:bg-secondary/50" : "text-muted-foreground"}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{u.code}</td>
                  <td className="px-4 py-2.5">{u.name}</td>
                  <td className="px-4 py-2.5">{u.allowsDecimal ? "Decimals (up to 3)" : "Whole numbers"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{u._count.rawMaterials}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{u._count.products}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={u.active ? "success" : "muted"}>{u.active ? "Active" : "Inactive"}</StatusBadge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <ConfirmAction
                      trigger={
                        <Button variant="ghost" size="sm">
                          {u.active ? "Deactivate" : "Activate"}
                        </Button>
                      }
                      title={`${u.active ? "Deactivate" : "Activate"} ${u.code}?`}
                      description={
                        u.active
                          ? "Existing stock in this unit is unaffected; it just can't be chosen for new records."
                          : "The unit can be chosen again."
                      }
                      fields={{ id: u.id, active: String(!u.active) }}
                      action={setUnitActiveAction}
                      destructive={u.active}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddUnitForm />
      </SectionCard>
    </>
  );
}
