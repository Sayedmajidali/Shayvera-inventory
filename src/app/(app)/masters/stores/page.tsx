import { Power } from "lucide-react";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { setStoreActiveAction } from "@/app/(app)/ecommerce/actions";
import { StoreDialog } from "./store-dialog";

export const metadata = { title: "Stores" };

export default async function StoresPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePage("ecom.view");
  const sp = await searchParams;
  const manage = can(actor, "admin.masters");
  const stores = await prisma.store.findMany({
    where: sp.q
      ? {
          OR: [
            { name: { contains: sp.q, mode: "insensitive" } },
            { code: { contains: sp.q, mode: "insensitive" } },
            { storeType: { contains: sp.q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { dispatches: { where: { status: "POSTED" } }, returns: { where: { status: "POSTED" } } } } },
  });
  return (
    <>
      <PageHeader
        title="Stores"
        description="Sales channels that receive Shayvera stock."
        crumbs={[{ label: "Master Data", href: "/masters" }, { label: "Stores" }]}
        actions={manage && <StoreDialog />}
      />
      <form className="no-print mb-4 flex gap-2" role="search">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search stores"
          className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
        />
        <Button type="submit" size="sm" className="h-9" variant="outline">
          Search
        </Button>
      </form>
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {stores.length === 0 ? (
          <EmptyState
            title="No stores yet"
            description={manage ? "Create your first store to start recording dispatches." : "An administrator needs to create stores."}
            action={manage && <StoreDialog />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Store</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Contact</th>
                  <th className="px-4 py-2.5 text-right">Dispatches</th>
                  <th className="px-4 py-2.5 text-right">Returns</th>
                  <th className="px-4 py-2.5">Status</th>
                  {manage && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {stores.map((s) => (
                  <tr key={s.id} className={s.active ? "" : "text-muted-foreground"}>
                    <td className="px-4 py-2.5 font-mono text-xs">{s.code}</td>
                    <td className="px-4 py-2.5 font-medium">
                      {s.name}
                      {s.notes && <span className="block text-xs font-normal text-muted-foreground">{s.notes}</span>}
                    </td>
                    <td className="px-4 py-2.5">{s.storeType}</td>
                    <td className="px-4 py-2.5">{s.contact ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s._count.dispatches}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s._count.returns}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={s.active ? "success" : "muted"}>{s.active ? "Active" : "Inactive"}</StatusBadge>
                    </td>
                    {manage && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <StoreDialog
                          store={{
                            id: s.id,
                            name: s.name,
                            code: s.code,
                            storeType: s.storeType,
                            contact: s.contact ?? "",
                            notes: s.notes ?? "",
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
                              ? "No new dispatches can be sent to this store. History is kept and returns can still be recorded."
                              : "The store becomes available for dispatches again."
                          }
                          fields={{ id: s.id, active: String(!s.active) }}
                          action={setStoreActiveAction}
                          destructive={s.active}
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
