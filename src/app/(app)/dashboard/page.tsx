import Image from "next/image";
import Link from "@/components/app/fast-link";
import {
  ArrowLeftRight,
  Boxes,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  PackageOpen,
  PackageX,
  Plus,
  ShieldAlert,
  Timer,
  Truck,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { requirePage } from "@/server/auth";
import { can } from "@/server/permissions";
import { getSettings } from "@/server/settings";
import { getDashboard } from "@/server/services/dashboard";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ENTRY_STATUS, PRODUCT_TXN_TYPE } from "@/lib/labels";
import { formatCalendarDate, formatDate, formatDateTime, isIsoDay, shiftDay, todayInTz } from "@/lib/dates";
import { formatQty } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { DailyChart, StoreChart } from "./charts";
import { ActivityFeed, Kpi, StockHealth, TopProducts, type FeedItem } from "./parts";

export const metadata = { title: "Dashboard" };

const PRESETS = [
  { label: "7 days", days: 6 },
  { label: "30 days", days: 29 },
  { label: "90 days", days: 89 },
];

function greeting(hour: number) {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

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
  const now = new Date();
  const range = `from=${from}&to=${to}`;
  const firstName = actor.name.split(" ")[0];
  const unitsText = (rows: { unit: string; qty: string }[]) => (rows.length ? rows.map((r) => formatQty(r.qty, r.unit)).join(" · ") : "0");
  const periodQty = (k: "dispatched" | "returned" | "net") =>
    d.period.byUnit.length ? d.period.byUnit.map((u) => formatQty(u[k], u.unit)).join(" · ") : "0";
  const periodLabel = `${formatCalendarDate(new Date(from + "T00:00:00Z"), df)} – ${formatCalendarDate(new Date(to + "T00:00:00Z"), df)}`;
  const s = d.snapshot;

  // What needs a person today, most urgent first. Only non-zero items are shown.
  const attention = [
    {
      n: s.expiredBatches,
      label: s.expiredBatches === 1 ? "expired batch" : "expired batches",
      href: "/products/alerts?tab=expiry&expiryStatus=EXPIRED",
      icon: PackageX,
      cls: "text-red-300",
    },
    { n: s.lowStock, label: "low on stock", href: "/products/alerts?tab=low", icon: TriangleAlert, cls: "text-amber-300" },
    {
      n: s.pendingInspection,
      label: "awaiting inspection",
      href: "/raw-materials/inspection",
      icon: ClipboardCheck,
      cls: "text-amber-300",
    },
    {
      n: s.nearExpiryBatches,
      label: "expiring soon",
      href: "/products/alerts?tab=expiry&expiryStatus=NEAR_EXPIRY",
      icon: Timer,
      cls: "text-orange-300",
    },
    { n: s.quarantinedProducts, label: "in quarantine", href: "/products/alerts?tab=quarantine", icon: ShieldAlert, cls: "text-lime-300" },
  ].filter((a) => a.n > 0);

  const actions = [
    can(actor, "ecom.dispatch") && { label: "New dispatch", href: "/ecommerce/dispatches/new", icon: Truck },
    can(actor, "rm.entry.create") && { label: "New material entry", href: "/raw-materials/entries/new", icon: ClipboardList },
    can(actor, "ecom.return") && { label: "Record return", href: "/ecommerce/returns/new", icon: Undo2 },
    can(actor, "rm.inspect") && s.pendingInspection > 0 && { label: "Inspect", href: "/raw-materials/inspection", icon: ClipboardCheck },
  ].filter(Boolean) as { label: string; href: string; icon: typeof Truck }[];

  const feed: FeedItem[] = [
    ...d.recentTxns.map((t) => ({
      id: `t-${t.id}`,
      at: t.createdAt,
      kind: t.type as FeedItem["kind"],
      title: `${PRODUCT_TXN_TYPE[t.type] ?? t.type} · ${t.product.name}`,
      detail: t.store?.name ?? t.product.sku,
      amount: `${t.quantity.gt(0) ? "+" : ""}${formatQty(t.quantity, t.unit.code)}`,
      positive: t.quantity.gt(0),
      href: `/products/${t.product.id}`,
      who: t.createdBy.name,
    })),
    ...d.recentEntries.map((e) => ({
      id: `e-${e.id}`,
      at: e.createdAt,
      kind: "ENTRY" as const,
      title: `Received ${e.rawMaterial.name}`,
      detail: `${e.entryNo} · ${e.supplier.name} · ${ENTRY_STATUS[e.status]?.label ?? e.status}`,
      amount: formatQty(e.quantity, e.unit.code),
      href: `/raw-materials/entries/${e.id}`,
      who: e.createdBy.name,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 9);

  return (
    <>
      {/* Hero */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-sidebar p-6 text-white shadow-lg shadow-primary/10 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-16 size-80 animate-aurora rounded-full bg-[#13a36b]/35 blur-3xl" />
          <div className="absolute -right-24 -bottom-32 size-96 animate-aurora rounded-full bg-[#f08a45]/20 blur-3xl [animation-delay:-8s]" />
          <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.08)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:linear-gradient(to_right,transparent,black_60%)]" />
          <Image
            src="/brand/shayvera-mark-light.png"
            alt=""
            width={560}
            height={371}
            className="absolute top-1/2 -right-10 hidden w-72 -translate-y-1/2 animate-float opacity-25 md:block lg:right-6 lg:w-80"
          />
        </div>
        <div className="relative max-w-2xl">
          <p className="text-xs font-bold tracking-[0.22em] text-sidebar-primary uppercase">{formatDate(now, tz, "EEEE, d MMMM yyyy")}</p>
          <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">
            {greeting(Number(formatDate(now, tz, "H")))}, {firstName}
          </h1>
          <p className="mt-1.5 text-sm text-white/75">
            {attention.length
              ? "A few things need your attention today:"
              : "Everything is in order. Nothing needs your attention right now."}
          </p>
          {attention.length > 0 && (
            <ul className="stagger mt-4 flex flex-wrap gap-2">
              {attention.map((a) => (
                <li key={a.label}>
                  <Link
                    href={a.href}
                    className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/15 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/15"
                  >
                    <a.icon className={cn("size-4", a.cls)} />
                    <span className="font-bold tabular-nums">{a.n}</span>
                    <span className="text-white/85">{a.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {attention.length === 0 && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/15">
              <CircleCheck className="size-4 text-lime-300" /> All clear
            </p>
          )}
          {actions.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {actions.map((a, i) => (
                <Button
                  key={a.href}
                  asChild
                  size="sm"
                  className={cn(
                    "h-9 rounded-full px-4",
                    i === 0 ? "bg-white text-primary hover:bg-white/90" : "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20",
                  )}
                >
                  <Link href={a.href}>
                    {i === 0 ? <Plus /> : <a.icon />} {a.label}
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Live snapshot */}
      <section aria-labelledby="snapshot" className="mb-6">
        <h2 id="snapshot" className="mb-3 text-xs font-bold tracking-[0.22em] text-brand-orange uppercase">
          Right now
        </h2>
        <div className="stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi
            label="Available to sell"
            value={unitsText(s.availableByUnit)}
            hint="Saleable and not expired"
            href="/products/stock"
            icon={Boxes}
            tone="green"
          />
          <Kpi
            label="Active products"
            value={s.activeProducts}
            hint={`${s.stockHealth.low} low · ${s.stockHealth.out} out of stock`}
            href="/products?status=ACTIVE"
            icon={PackageOpen}
            tone="lime"
          />
          <Kpi
            label="Awaiting inspection"
            value={s.pendingInspection}
            hint="Raw material entries"
            href="/raw-materials/inspection"
            icon={ClipboardCheck}
            tone="amber"
            alert={s.pendingInspection > 0}
          />
          <Kpi
            label="Low-stock products"
            value={s.lowStock}
            hint="At or below their threshold"
            href="/products/alerts?tab=low"
            icon={CircleAlert}
            tone={s.lowStock ? "red" : "slate"}
            alert={s.lowStock > 0}
          />
        </div>
      </section>

      {/* Period activity */}
      <section aria-labelledby="activity" className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="activity" className="text-xs font-bold tracking-[0.22em] text-brand-orange uppercase">
            Activity · {periodLabel}
          </h2>
          <form className="no-print flex flex-wrap items-center gap-2" aria-label="Dashboard period">
            <div className="flex rounded-full bg-muted p-1">
              {PRESETS.map((p) => {
                const active = from === shiftDay(today, -p.days) && to === today;
                return (
                  <Link
                    key={p.label}
                    href={`/dashboard?from=${shiftDay(today, -p.days)}&to=${today}`}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200",
                      active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </Link>
                );
              })}
            </div>
            <Input type="date" name="from" defaultValue={from} max={today} className="h-8 w-36 rounded-full" aria-label="From date" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" name="to" defaultValue={to} max={today} className="h-8 w-36 rounded-full" aria-label="To date" />
            <Button type="submit" size="sm" variant="outline" className="h-8 rounded-full">
              Apply
            </Button>
          </form>
        </div>
        <div className="stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi
            label="Dispatches"
            value={d.period.dispatchDocs}
            hint={periodQty("dispatched")}
            href={`/ecommerce/dispatches?${range}`}
            icon={Truck}
            tone="orange"
            trend={d.dailyChart.map((r) => r.dispatched)}
          />
          <Kpi
            label="Returns"
            value={d.period.returnDocs}
            hint={periodQty("returned")}
            href={`/ecommerce/returns?${range}`}
            icon={Undo2}
            tone="slate"
            trend={d.dailyChart.map((r) => r.returned)}
          />
          <Kpi
            label="Net sent out"
            value={periodQty("net")}
            hint="Dispatched − returned (not sales)"
            href={`/reports/ec-net-movement?${range}`}
            icon={ArrowLeftRight}
            tone="green"
            trend={d.dailyChart.map((r) => r.dispatched - r.returned)}
          />
          <Kpi
            label="Materials received"
            value={d.period.entriesPending + d.period.entriesApproved + d.period.entriesRejected}
            hint={`${d.period.entriesApproved} approved · ${d.period.entriesPending} pending · ${d.period.entriesRejected} rejected`}
            href={`/raw-materials/entries?${range}`}
            icon={ClipboardList}
            tone="lime"
          />
        </div>
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Dispatch vs returns"
          description="Units per day"
          className="xl:col-span-2"
          actions={
            <Link className="text-xs font-medium text-primary hover:underline" href={`/reports/ec-dispatch-register?${range}`}>
              Dispatch register
            </Link>
          }
        >
          <div className="p-4">
            <DailyChart data={d.dailyChart.map((r) => ({ ...r, label: formatCalendarDate(new Date(r.day + "T00:00:00Z"), "dd MMM") }))} />
          </div>
        </SectionCard>
        <SectionCard title="Stock health" description="Live, across all active products">
          <StockHealth
            ok={s.stockHealth.ok}
            low={s.stockHealth.low}
            out={s.stockHealth.out}
            expired={s.expiredBatches}
            near={s.nearExpiryBatches}
            fresh={s.okBatches}
          />
        </SectionCard>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Top products dispatched"
          description={periodLabel}
          actions={
            <Link className="text-xs font-medium text-primary hover:underline" href={`/reports/ec-product-dispatch?${range}`}>
              All products
            </Link>
          }
        >
          <TopProducts items={d.topProducts} />
        </SectionCard>
        <SectionCard
          title="Store-wise movement"
          description="Units dispatched and returned per store"
          className="xl:col-span-2"
          actions={
            <Link className="text-xs font-medium text-primary hover:underline" href={`/reports/ec-store-dispatch?${range}`}>
              Store-wise report
            </Link>
          }
        >
          <div className="p-4">
            <StoreChart data={d.storeChart} />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Recent activity"
          description="Latest stock movements and material entries"
          className="xl:col-span-2"
          actions={
            can(actor, "product.reports") && (
              <Link className="text-xs font-medium text-primary hover:underline" href="/reports/pr-ledger">
                Full ledger
              </Link>
            )
          }
        >
          <ActivityFeed items={feed} now={now} fallbackDate={(at) => formatDateTime(at, tz, df)} />
        </SectionCard>

        <div className="space-y-6">
          <SectionCard
            title="Awaiting inspection"
            actions={
              <Link className="text-xs font-medium text-primary hover:underline" href="/raw-materials/inspection">
                Inspect
              </Link>
            }
          >
            {d.pendingEntries.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
                <CircleCheck className="size-4 text-brand-green" /> Nothing waiting.
              </p>
            ) : (
              <ul className="divide-y">
                {d.pendingEntries.map((e) => (
                  <li key={e.id}>
                    <Link href={`/raw-materials/entries/${e.id}`} className="block px-4 py-2.5 text-sm transition-colors hover:bg-muted/60">
                      <span className="flex justify-between gap-2">
                        <span className="truncate font-medium">{e.rawMaterial.name}</span>
                        <span className="shrink-0 tabular-nums">{formatQty(e.quantity, e.unit.code)}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {e.entryNo} · {e.supplier.name} · {formatDateTime(e.entryDate, tz, df)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Low stock"
            actions={
              <Link className="text-xs font-medium text-primary hover:underline" href="/products/alerts?tab=low">
                All alerts
              </Link>
            }
          >
            {d.lowStock.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
                <CircleCheck className="size-4 text-brand-green" /> All products above threshold.
              </p>
            ) : (
              <ul className="divide-y">
                {d.lowStock.map((a) => {
                  const pct = Math.min(100, (Number(a.availableQty) / Math.max(Number(a.threshold), 1)) * 100);
                  return (
                    <li key={a.id}>
                      <Link href={`/products/${a.productId}`} className="block px-4 py-2.5 text-sm transition-colors hover:bg-muted/60">
                        <span className="flex justify-between gap-2">
                          <span className="truncate font-medium">{a.product.name}</span>
                          <span className="shrink-0 text-xs tabular-nums">
                            <span className="font-semibold">{formatQty(a.availableQty)}</span>
                            <span className="text-muted-foreground"> / {formatQty(a.threshold, a.product.unit.code)}</span>
                          </span>
                        </span>
                        <span className="mt-1.5 block h-1.5 rounded-full bg-muted">
                          <span
                            className={cn("block h-full rounded-full", pct < 50 ? "bg-red-500" : "bg-amber-500")}
                            style={{ width: `${Math.max(pct, 3)}%` }}
                          />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Expiry alerts"
            actions={
              <Link className="text-xs font-medium text-primary hover:underline" href="/products/alerts?tab=expiry">
                All
              </Link>
            }
          >
            {d.expiring.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
                <CircleCheck className="size-4 text-brand-green" /> No batches expired or expiring soon.
              </p>
            ) : (
              <ul className="divide-y">
                {d.expiring.map((b) => (
                  <li key={b.batchId}>
                    <Link
                      href={`/products/${b.productId}`}
                      className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{b.product}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          Batch {b.batchNo} · {formatQty(b.qty, b.unit)} · {formatCalendarDate(b.expiryDate, df)}
                        </span>
                      </span>
                      <StatusBadge tone={b.expired ? "danger" : "warning"}>{b.expired ? "Expired" : "Expiring soon"}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
