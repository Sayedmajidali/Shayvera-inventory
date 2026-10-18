import Link from "@/components/app/fast-link";
import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  ClipboardList,
  PackagePlus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Sparkline } from "@/components/app/sparkline";
import { cn } from "@/lib/utils";

export type Tone = "green" | "orange" | "lime" | "amber" | "red" | "slate";

const TONE: Record<Tone, { chip: string; line: string }> = {
  green: { chip: "bg-emerald-50 text-brand-green ring-emerald-100", line: "var(--brand-green)" },
  orange: { chip: "bg-orange-50 text-brand-orange ring-orange-100", line: "#dc7128" },
  lime: { chip: "bg-lime-50 text-lime-700 ring-lime-100", line: "#7aa62a" },
  amber: { chip: "bg-amber-50 text-amber-700 ring-amber-100", line: "#c27410" },
  red: { chip: "bg-red-50 text-red-700 ring-red-100", line: "#c81e1e" },
  slate: { chip: "bg-slate-50 text-slate-600 ring-slate-100", line: "#64748b" },
};

/** KPI tile: tinted icon, big number, hint, optional trend sparkline. */
export function Kpi({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = "green",
  trend,
  alert,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  icon: LucideIcon;
  tone?: Tone;
  trend?: number[];
  alert?: boolean;
}) {
  const t = TONE[tone];
  const body = (
    <div
      className={cn(
        "group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-4 shadow-xs transition-all duration-200",
        href && "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
        alert && "border-amber-200 bg-gradient-to-br from-amber-50/70 to-card",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex size-9 items-center justify-center rounded-xl ring-1", t.chip)}>
          <Icon className="size-[18px]" />
        </span>
        {href && (
          <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 font-display text-2xl leading-tight font-extrabold tracking-tight tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      {trend && <Sparkline values={trend} color={t.line} className="-mx-1 mt-auto" />}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Products by stock status as a segmented bar, plus batch expiry counts. */
export function StockHealth({
  ok,
  low,
  out,
  expired,
  near,
  fresh,
}: {
  ok: number;
  low: number;
  out: number;
  expired: number;
  near: number;
  fresh: number;
}) {
  const total = ok + low + out;
  const seg = [
    {
      key: "ok",
      label: "In stock",
      n: ok,
      color: "bg-brand-green",
      icon: CircleCheck,
      text: "text-brand-green",
      href: "/products/stock?stockStatus=OK",
    },
    {
      key: "low",
      label: "Low stock",
      n: low,
      color: "bg-amber-500",
      icon: CircleAlert,
      text: "text-amber-600",
      href: "/products/alerts?tab=low",
    },
    {
      key: "out",
      label: "Out of stock",
      n: out,
      color: "bg-red-600",
      icon: CircleX,
      text: "text-red-600",
      href: "/products/stock?stockStatus=OUT",
    },
  ];
  return (
    <div className="space-y-5 p-4">
      <div>
        <div className="flex items-baseline justify-between">
          <p className="font-display text-3xl font-extrabold tabular-nums">{total}</p>
          <p className="text-xs text-muted-foreground">active products</p>
        </div>
        {total > 0 ? (
          <div
            className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={`${ok} in stock, ${low} low, ${out} out of stock`}
          >
            {seg
              .filter((s) => s.n > 0)
              .map((s) => (
                <div
                  key={s.key}
                  className={cn("h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full", s.color)}
                  style={{ flexGrow: s.n }}
                />
              ))}
          </div>
        ) : (
          <div className="mt-3 h-3 rounded-full bg-muted" />
        )}
        <ul className="mt-3 space-y-1.5">
          {seg.map((s) => (
            <li key={s.key}>
              <Link
                href={s.href}
                className="flex items-center justify-between rounded-md px-1 py-0.5 text-sm transition-colors hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <s.icon className={cn("size-4", s.text)} />
                  {s.label}
                </span>
                <span className="font-semibold tabular-nums">{s.n}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t pt-4">
        <p className="mb-2 text-[11px] font-bold tracking-[0.18em] text-brand-orange uppercase">Batches with stock</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Expired", n: expired, cls: "bg-red-50 text-red-700", href: "/products/alerts?tab=expiry&expiryStatus=EXPIRED" },
            {
              label: "Expiring soon",
              n: near,
              cls: "bg-amber-50 text-amber-700",
              href: "/products/alerts?tab=expiry&expiryStatus=NEAR_EXPIRY",
            },
            { label: "Fresh", n: fresh, cls: "bg-emerald-50 text-brand-green", href: "/reports/pr-batches?expiryStatus=OK" },
          ].map((b) => (
            <Link
              key={b.label}
              href={b.href}
              className={cn("rounded-xl px-2 py-2.5 transition-transform duration-200 hover:-translate-y-0.5", b.cls)}
            >
              <p className="font-display text-xl font-extrabold tabular-nums">{b.n}</p>
              <p className="text-[11px] font-medium">{b.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Top products by quantity dispatched, as simple labelled bars. */
export function TopProducts({ items }: { items: { id: string; name: string; sku: string; unit: string; qty: number }[] }) {
  if (items.length === 0) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">No dispatches in this period.</p>;
  const max = Math.max(...items.map((i) => i.qty), 1);
  return (
    <ol className="space-y-3.5 p-4">
      {items.map((p, i) => (
        <li key={p.id}>
          <Link href={`/products/${p.id}`} className="group block">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                  {i + 1}
                </span>
                <span className="truncate font-medium group-hover:text-primary">{p.name}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold">{p.qty.toLocaleString()}</span>{" "}
                <span className="text-xs text-muted-foreground">{p.unit}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-green to-[#13a36b] transition-all duration-700"
                style={{ width: `${Math.max(4, (p.qty / max) * 100)}%` }}
              />
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export interface FeedItem {
  id: string;
  at: Date;
  kind: "DISPATCH" | "RETURN" | "RECEIPT" | "OPENING" | "ADJUSTMENT" | "DISPOSITION" | "REVERSAL" | "PRODUCTION_RECEIPT" | "ENTRY";
  title: string;
  detail: string;
  amount?: string;
  positive?: boolean;
  href: string;
  who: string;
}

const FEED_STYLE: Record<FeedItem["kind"], { icon: LucideIcon; cls: string }> = {
  DISPATCH: { icon: Truck, cls: "bg-orange-50 text-brand-orange" },
  RETURN: { icon: Undo2, cls: "bg-sky-50 text-sky-700" },
  RECEIPT: { icon: PackagePlus, cls: "bg-emerald-50 text-brand-green" },
  OPENING: { icon: PackagePlus, cls: "bg-emerald-50 text-brand-green" },
  PRODUCTION_RECEIPT: { icon: PackagePlus, cls: "bg-emerald-50 text-brand-green" },
  ADJUSTMENT: { icon: SlidersHorizontal, cls: "bg-amber-50 text-amber-700" },
  DISPOSITION: { icon: ShieldCheck, cls: "bg-lime-50 text-lime-700" },
  REVERSAL: { icon: RotateCcw, cls: "bg-slate-100 text-slate-600" },
  ENTRY: { icon: ClipboardList, cls: "bg-emerald-50 text-brand-green" },
};

function ago(at: Date, now: Date) {
  const s = Math.round((now.getTime() - at.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (s < 60) return "just now";
  if (s < 3600) return rtf.format(-Math.floor(s / 60), "minute");
  if (s < 86_400) return rtf.format(-Math.floor(s / 3600), "hour");
  if (s < 7 * 86_400) return rtf.format(-Math.floor(s / 86_400), "day");
  return null;
}

/** Unified timeline of recent stock movements and raw material entries. */
export function ActivityFeed({ items, now, fallbackDate }: { items: FeedItem[]; now: Date; fallbackDate: (d: Date) => string }) {
  if (items.length === 0) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative px-4 py-3">
      <span aria-hidden className="absolute top-6 bottom-6 left-[2.05rem] w-px bg-border" />
      {items.map((it) => {
        const st = FEED_STYLE[it.kind];
        return (
          <li key={it.id} className="relative">
            <Link href={it.href} className="group flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
              <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card", st.cls)}>
                <st.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium group-hover:text-primary">{it.title}</span>
                  {it.amount && (
                    <span
                      className={cn("shrink-0 text-sm font-semibold tabular-nums", it.positive ? "text-brand-green" : "text-foreground")}
                    >
                      {it.amount}
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {it.detail} · {it.who} · {ago(it.at, now) ?? fallbackDate(it.at)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
