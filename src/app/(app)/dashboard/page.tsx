import Link from "@/components/app/fast-link";
import { AlertTriangle, ClipboardCheck, PackageX, Timer } from "lucide-react";
import { requirePage } from "@/server/auth";
import { can } from "@/server/permissions";
import { getSettings } from "@/server/settings";
import { getDashboard } from "@/server/services/dashboard";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
import { Pill, StatusBadge } from "@/components/app/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ENTRY_STATUS, PRODUCT_TXN_TYPE } from "@/lib/labels";
import { formatCalendarDate, formatDateTime, isIsoDay, shiftDay, todayInTz } from "@/lib/dates";
import { formatQty } from "@/lib/decimal";
import { DailyChart, StoreChart } from "./charts";

export const metadata = { title: "Dashboard" };

const PRESETS = [
  { label: "7 days", days: 6 },
  { label: "30 days", days: 29 },
  { label: "90 days", days: 89 },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePage("dashboard.view");
  const sp = await searchParams;
  const settings = await getSettings();
  const tz = settings.timezone;
  const df = settings.dateFormat;
  const today = todayInTz(tz);
  let from = isIsoDay(sp.from) ? sp.from : shiftDay(today, -29);
  let to = isIsoDay(sp.to) ? sp.to : today;
  if (from > to) [from, to] = [to, from];
  if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) from = shiftDay(to, -365);

  const d = await getDashboard({ from, to, tz, today, dateFormat: df });
  const range = `from=${from}&to=${to}`;
  const unitsText = (rows: { unit: string; qty: string }[]) => (rows.length ? rows.map((r) => formatQty(r.qty, r.unit)).join(" · ") : "0");
  const periodQty = (k: "dispatched" | "returned" | "net") =>
    d.period.byUnit.length ? d.period.byUnit.map((u) => formatQty(u[k], u.unit)).join(" · ") : "0";
  const periodLabel = `${formatCalendarDate(new Date(from + "T00:00:00Z"), df)} – ${formatCalendarDate(new Date(to + "T00:00:00Z"), df)}`;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${actor.name.split(" ")[0]}`}
        description={`${settings.businessName} at a glance. Current stock is a live snapshot; activity figures cover ${periodLabel}.`}
      />

      <section aria-labelledby="snapshot" className="mb-8">
        <h2 id="snapshot" className="mb-3 text-xs font-bold tracking-[0.22em] text-brand-orange uppercase">
          Current snapshot
        </h2>
        <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Active products" value={d.snapshot.activeProducts} href="/products?status=ACTIVE" />
          <StatCard
            label="Available units"
            value={<span className="text-xl">{unitsText(d.snapshot.availableByUnit)}</span>}
            hint="Saleable, not expired"
            href="/products/stock"
          />
          <StatCard
            label="Pending inspection"
            value={d.snapshot.pendingInspection}
            tone={d.snapshot.pendingInspection ? "warning" : "default"}
            icon={<ClipboardCheck className="size-4" />}
            href="/raw-materials/inspection"
            hint="Raw material entries"
          />
          <StatCard
            label="Low stock"
            value={d.snapshot.lowStock}
            tone={d.snapshot.lowStock ? "warning" : "default"}
            icon={<AlertTriangle className="size-4" />}
            href="/products/alerts?tab=low"
            hint="At or below threshold"
          />
          <StatCard
            label="Expired batches"
            value={d.snapshot.expiredBatches}
            tone={d.snapshot.expiredBatches ? "danger" : "default"}
            icon={<PackageX className="size-4" />}
            href="/products/alerts?tab=expiry&expiryStatus=EXPIRED"
            hint="Holding saleable stock"
          />
          <StatCard
            label="Expiring soon"
            value={d.snapshot.nearExpiryBatches}
            tone={d.snapshot.nearExpiryBatches ? "warning" : "default"}
            icon={<Timer className="size-4" />}
            href="/products/alerts?tab=expiry&expiryStatus=NEAR_EXPIRY"
            hint="Within alert period"
          />
        </div>
      </section>

      <section aria-labelledby="activity" className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="activity" className="text-xs font-bold tracking-[0.22em] text-brand-orange uppercase">
            Activity · {periodLabel}
          </h2>
          <form className="no-print flex flex-wrap items-center gap-2" aria-label="Dashboard period">
            {PRESETS.map((p) => (
              <Button key={p.label} variant={from === shiftDay(today, -p.days) && to === today ? "secondary" : "ghost"} size="sm" asChild>
                <Link href={`/dashboard?from=${shiftDay(today, -p.days)}&to=${today}`}>{p.label}</Link>
              </Button>
            ))}
            <Input type="date" name="from" defaultValue={from} max={today} className="h-8 w-36" aria-label="From date" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" name="to" defaultValue={to} max={today} className="h-8 w-36" aria-label="To date" />
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
          </form>
        </div>
        <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Dispatches"
            value={d.period.dispatchDocs}
            hint={periodQty("dispatched")}
            href={`/ecommerce/dispatches?${range}`}
          />
          <StatCard label="Returns" value={d.period.returnDocs} hint={periodQty("returned")} href={`/ecommerce/returns?${range}`} />
          <StatCard
            label="Net sent out"
            value={<span className="text-xl">{periodQty("net")}</span>}
            hint="Dispatched − returned (not sales)"
            href={`/reports/ec-net-movement?${range}`}
          />
          <StatCard
            label="Entries pending"
            value={d.period.entriesPending}
            href={`/reports/rm-pending?${range}`}
            hint="Received in period"
          />
          <StatCard
            label="Entries approved"
            value={d.period.entriesApproved}
            href={`/reports/rm-approved?${range}`}
            hint="Received in period"
          />
          <StatCard
            label="Entries rejected"
            value={d.period.entriesRejected}
            href={`/reports/rm-rejected?${range}`}
            hint="Received in period"
          />
        </div>
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Dispatch vs returns"
          description="Units per day"
          actions={
            <Link className="text-xs text-primary hover:underline" href={`/reports/ec-dispatch-register?${range}`}>
              Dispatch register
            </Link>
          }
        >
          <div className="p-4">
            <DailyChart data={d.dailyChart.map((r) => ({ ...r, label: formatCalendarDate(new Date(r.day + "T00:00:00Z"), "dd MMM") }))} />
          </div>
        </SectionCard>
        <SectionCard
          title="Store-wise movement"
          description="Units dispatched and returned per store"
          actions={
            <Link className="text-xs text-primary hover:underline" href={`/reports/ec-store-dispatch?${range}`}>
              Store-wise report
            </Link>
          }
        >
          <div className="p-4">
            <StoreChart data={d.storeChart} />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <SectionCard
          title="Pending quality inspections"
          actions={
            <Link className="text-xs text-primary hover:underline" href="/raw-materials/inspection">
              Inspect
            </Link>
          }
        >
          {d.pendingEntries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nothing waiting.</p>
          ) : (
            <ul className="divide-y">
              {d.pendingEntries.map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-sm">
                  <Link href={`/raw-materials/entries/${e.id}`} className="font-medium hover:underline">
                    {e.rawMaterial.name}
                  </Link>
                  <span className="float-right tabular-nums">{formatQty(e.quantity, e.unit.code)}</span>
                  <p className="text-xs text-muted-foreground">
                    {e.entryNo} · {e.supplier.name} · {formatDateTime(e.entryDate, tz, df)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard
          title="Low-stock products"
          actions={
            <Link className="text-xs text-primary hover:underline" href="/products/alerts?tab=low">
              All alerts
            </Link>
          }
        >
          {d.lowStock.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">All products above threshold.</p>
          ) : (
            <ul className="divide-y">
              {d.lowStock.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <Link href={`/products/${a.productId}`} className="font-medium hover:underline">
                    {a.product.name}
                  </Link>
                  <span className="float-right tabular-nums">
                    {formatQty(a.availableQty)} / {formatQty(a.threshold, a.product.unit.code)}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {a.product.sku} · since {formatDateTime(a.triggeredAt, tz, df)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard
          title="Expiry alerts"
          actions={
            <Link className="text-xs text-primary hover:underline" href="/products/alerts?tab=expiry">
              All
            </Link>
          }
        >
          {d.expiring.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No batches expired or expiring soon.</p>
          ) : (
            <ul className="divide-y">
              {d.expiring.map((b) => (
                <li key={b.batchId} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>
                    <Link href={`/products/${b.productId}`} className="font-medium hover:underline">
                      {b.product}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      Batch {b.batchNo} · {formatQty(b.qty, b.unit)} · {formatCalendarDate(b.expiryDate, df)}
                    </span>
                  </span>
                  <StatusBadge tone={b.expired ? "danger" : "warning"}>{b.expired ? "Expired" : "Expiring soon"}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard
          title="Recent raw material entries"
          className="lg:col-span-1"
          actions={
            can(actor, "rm.view") && (
              <Link className="text-xs text-primary hover:underline" href="/raw-materials/entries">
                All entries
              </Link>
            )
          }
        >
          {d.recentEntries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <ul className="divide-y">
              {d.recentEntries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>
                    <Link href={`/raw-materials/entries/${e.id}`} className="font-medium hover:underline">
                      {e.rawMaterial.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {e.entryNo} · {formatQty(e.quantity, e.unit.code)} · {e.supplier.name}
                    </span>
                  </span>
                  <Pill map={ENTRY_STATUS} value={e.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard
          title="Recent stock transactions"
          className="lg:col-span-1 xl:col-span-2"
          actions={
            can(actor, "product.reports") && (
              <Link className="text-xs text-primary hover:underline" href="/reports/pr-ledger">
                Full ledger
              </Link>
            )
          }
        >
          {d.recentTxns.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No stock movements yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {d.recentTxns.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatDateTime(t.createdAt, tz, df)}</td>
                      <td className="px-4 py-2">
                        <Link href={`/products/${t.product.id}`} className="font-medium hover:underline">
                          {t.product.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        {PRODUCT_TXN_TYPE[t.type]}
                        {t.store && <span className="text-muted-foreground"> · {t.store.name}</span>}
                      </td>
                      <td
                        className={`px-4 py-2 text-right whitespace-nowrap tabular-nums ${t.quantity.gt(0) ? "text-emerald-700" : "text-foreground"}`}
                      >
                        {t.quantity.gt(0) ? "+" : ""}
                        {formatQty(t.quantity, t.unit.code)}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{t.createdBy.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
