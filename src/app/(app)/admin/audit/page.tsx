import Link from "@/components/app/fast-link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { dayRange, formatDateTime } from "@/lib/dates";

export const metadata = { title: "Audit log" };
const PAGE = 50;

const ENTITY_LINK: Record<string, (id: string) => string> = {
  RawMaterialEntry: (id) => `/raw-materials/entries/${id}`,
  ReadyProduct: (id) => `/products/${id}`,
  Dispatch: (id) => `/ecommerce/dispatches/${id}`,
  ProductReturn: (id) => `/ecommerce/returns/${id}`,
  RawMaterial: (id) => `/raw-materials/stock/${id}`,
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePage("admin.audit");
  const sp = await searchParams;
  const settings = await getSettings();
  const page = Math.max(1, Number(sp.page) || 1);
  const r = dayRange(sp.from, sp.to, settings.timezone);
  const where: Prisma.AuditLogWhereInput = {
    createdAt: r.gte || r.lt ? r : undefined,
    entityType: sp.entity || undefined,
    actorId: sp.user || undefined,
    ...(sp.q ? { OR: [{ summary: { contains: sp.q, mode: "insensitive" } }, { action: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [logs, total, users, entities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (p: number) => `?${new URLSearchParams({ ...sp, page: String(p) })}`;
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only record of administrative and inventory actions. Entries cannot be edited or deleted."
        crumbs={[{ label: "Administration" }, { label: "Audit log" }]}
      />
      <form className="no-print mb-4 grid gap-3 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-2 lg:grid-cols-6" role="search">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search actions"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm lg:col-span-2"
        />
        <select name="entity" defaultValue={sp.entity ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">All records</option>
          {entities.map((e) => (
            <option key={e.entityType}>{e.entityType}</option>
          ))}
        </select>
        <select name="user" defaultValue={sp.user ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={sp.from ?? ""}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="From date"
        />
        <div className="flex gap-2">
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="To date"
          />
          <Button type="submit" size="sm" className="h-9">
            Filter
          </Button>
        </div>
      </form>
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDateTime(l.createdAt, settings.timezone, settings.dateFormat)}</td>
                  <td className="px-4 py-2.5">{l.actor?.name ?? "System"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{l.action}</td>
                  <td className="px-4 py-2.5">
                    {l.entityId && ENTITY_LINK[l.entityType] ? (
                      <Link href={ENTITY_LINK[l.entityType](l.entityId)} className="hover:underline">
                        {l.summary}
                      </Link>
                    ) : (
                      l.summary
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-2.5 text-sm">
          <Button variant="outline" size="sm" asChild className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
            <Link href={link(page - 1)}>
              <ChevronLeft /> Previous
            </Link>
          </Button>
          <span className="text-muted-foreground">
            {total.toLocaleString()} entries · page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" asChild className={page >= pages ? "pointer-events-none opacity-50" : ""}>
            <Link href={link(page + 1)}>
              Next <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
