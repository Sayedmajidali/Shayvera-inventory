import { Power } from "lucide-react";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { setSupplierActiveAction } from "../actions";
import { SupplierDialog } from "./supplier-dialog";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePage("admin.masters");
  const sp = await searchParams;
  const suppliers = await prisma.supplier.findMany({
    where: sp.q
      ? {
          OR: [
            { name: { contains: sp.q, mode: "insensitive" } },
            { code: { contains: sp.q, mode: "insensitive" } },
            { contactPerson: { contains: sp.q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { entries: true } } },
  });
  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Supplier master for incoming raw materials."
        crumbs={[{ label: "Administration" }, { label: "Suppliers" }]}
        actions={<SupplierDialog />}
      />
      <form className="no-print mb-4 flex gap-2" role="search">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search suppliers"
          className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
        />
        <Button type="submit" size="sm" className="h-9" variant="outline">
          Search
        </Button>
      </form>
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {suppliers.length === 0 ? (
          <EmptyState title="No suppliers yet" action={<SupplierDialog />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-4 py-2.5">Contact</th>
                  <th className="px-4 py-2.5">Address</th>
                  <th className="px-4 py-2.5 text-right">Entries</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {suppliers.map((s) => (
                  <tr key={s.id} className={s.active ? "" : "text-muted-foreground"}>
                    <td className="px-4 py-2.5 font-mono text-xs">{s.code}</td>
                    <td className="px-4 py-2.5 font-medium">
                      {s.name}
                      {s.gstNumber && <span className="block text-xs font-normal text-muted-foreground">GST {s.gstNumber}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{[s.contactPerson, s.phone, s.email].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="max-w-xs px-4 py-2.5 text-xs">{s.address ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s._count.entries}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={s.active ? "success" : "muted"}>{s.active ? "Active" : "Inactive"}</StatusBadge>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <SupplierDialog
                        supplier={{
                          id: s.id,
                          name: s.name,
                          contactPerson: s.contactPerson ?? "",
                          phone: s.phone ?? "",
                          email: s.email ?? "",
                          address: s.address ?? "",
                          gstNumber: s.gstNumber ?? "",
                        }}
                      />
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Power /> {s.active ? "Deactivate" : "Activate"}
                          </Button>
                        }
                        title={s.active ? `Deactivate ${s.name}?` : `Activate ${s.name}?`}
                        description={
                          s.active
                            ? "The supplier will no longer be selectable for new entries. History is kept."
                            : "The supplier can be selected again."
                        }
                        fields={{ id: s.id, active: String(!s.active) }}
                        action={setSupplierActiveAction}
                        destructive={s.active}
                      />
                    </td>
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
