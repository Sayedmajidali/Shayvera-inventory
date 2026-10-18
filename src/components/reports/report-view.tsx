import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { prisma } from "@/server/db";
import { runReport, type Params } from "@/server/reports/run";
import type { Cell, FilterKey, Filters, ReportDef, SelectOption } from "@/server/reports/types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { FilterBar, type FilterField } from "./filter-bar";
import { PrintButton } from "./print-button";
import { RowActions } from "./row-actions";
import { getCurrentUser } from "@/server/auth";

const LABELS: Record<FilterKey, string> = {
  q: "Search",
  from: "From date",
  to: "To date",
  supplierId: "Supplier",
  materialId: "Material",
  unitId: "Unit",
  status: "Status",
  storeId: "Store",
  productId: "Product",
  sku: "SKU",
  txnType: "Transaction type",
  ref: "Reference no.",
  categoryId: "Category",
  expiryStatus: "Expiry status",
  stockStatus: "Stock status",
  condition: "Condition",
  category: "Type",
};

async function optionsFor(key: FilterKey, def: ReportDef): Promise<SelectOption[] | undefined> {
  if (def.options?.[key]) return def.options[key];
  switch (key) {
    case "supplierId":
      return (await prisma.supplier.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] })).map((s) => ({
        value: s.id,
        label: s.active ? s.name : `${s.name} (inactive)`,
      }));
    case "materialId":
      return (await prisma.rawMaterial.findMany({ include: { unit: true }, orderBy: { name: "asc" } })).map((m) => ({
        value: m.id,
        label: `${m.name} (${m.unit.code})`,
      }));
    case "unitId":
      return (await prisma.unit.findMany({ orderBy: { code: "asc" } })).map((u) => ({ value: u.id, label: u.code }));
    case "storeId":
      return (await prisma.store.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] })).map((s) => ({
        value: s.id,
        label: s.active ? s.name : `${s.name} (inactive)`,
      }));
    case "productId":
      // Deleted products stay filterable for history, listed last.
      return (await prisma.readyProduct.findMany({ orderBy: [{ deletedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }] })).map(
        (p) => ({
          value: p.id,
          label: `${p.name} · ${p.sku}${p.deletedAt ? " (deleted)" : ""}`,
        }),
      );
    case "categoryId":
      return (await prisma.productCategory.findMany({ orderBy: { name: "asc" } })).map((c) => ({ value: c.id, label: c.name }));
    default:
      return undefined;
  }
}

function qs(params: Params, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) p.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) p.delete(k);
    else p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

// Free-text columns may wrap; everything else stays on one line and the table scrolls sideways.
// Row actions stay visible at the right edge while the rest of a wide table scrolls.
const STICKY = "no-print sticky right-0 z-10 bg-card shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.18)]";

const WRAP = new Set(["notes", "reason", "summary", "description"]);

export function CellView({ cell }: { cell: Cell }) {
  if (cell === null || cell === undefined || cell === "") return <span className="text-muted-foreground">—</span>;
  if (typeof cell !== "object") return <>{cell}</>;
  if ("actions" in cell) return <RowActions actions={cell.actions} />;
  if (cell.tone) return <StatusBadge tone={cell.tone}>{cell.text}</StatusBadge>;
  if (cell.href?.startsWith("/api/files/"))
    return (
      <a
        href={cell.href}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
      >
        <FileText className="size-3.5" />
        <span className="max-w-48 truncate">{cell.text}</span>
      </a>
    );
  if (cell.href)
    return (
      <Link href={cell.href} className="font-medium text-primary hover:underline">
        {cell.text}
      </Link>
    );
  return <>{cell.text}</>;
}

export async function ReportView({
  def,
  params,
  basePath,
  fixed,
  hide = [],
  exportable = true,
  showSummary = true,
  emptyTitle,
  emptyDescription,
  pageSize,
}: {
  def: ReportDef;
  params: Params;
  basePath: string;
  fixed?: Filters;
  hide?: FilterKey[];
  exportable?: boolean;
  showSummary?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
}) {
  const actor = await getCurrentUser();
  const { result, filters, page, size, sort, dir, settings } = await runReport(def, params, { fixed, pageSize, actor: actor ?? undefined });
  const visibleFilters = def.filters.filter((k) => !hide.includes(k) && !(fixed && k in fixed));
  const fields: FilterField[] = await Promise.all(
    visibleFilters.map(async (k) => ({
      key: k,
      label: def.filterLabels?.[k] ?? LABELS[k],
      type: k === "q" ? "search" : k === "from" || k === "to" ? "date" : k === "sku" || k === "ref" ? "text" : "select",
      options: await optionsFor(k, def),
      allLabel: k === "storeId" ? "All stores" : k === "productId" ? "All products" : k === "supplierId" ? "All suppliers" : "All",
    })),
  );
  const pages = Math.max(1, Math.ceil(result.total / size));
  const columns = def.columns.filter((c) => !c.csvOnly);
  const exportHref = `/api/reports/${def.key}${qs(params, { page: undefined, ...Object.fromEntries(Object.entries(fixed ?? {}).map(([k, v]) => [k, v])) })}`;
  const appliedFilters = Object.entries(filters).filter(([, v]) => v);

  return (
    <div className="space-y-4">
      {fields.length > 0 && <FilterBar fields={fields} dateLabel={def.dateFilterLabel} />}

      {/* Print header: what was printed, with which filters */}
      <div className="hidden print:block">
        <p className="font-display text-lg font-extrabold">Shayvera — {def.title}</p>
        <p className="text-xs">
          Printed {formatDateTime(new Date(), settings.timezone, settings.dateFormat)} ({settings.timezone})
          {appliedFilters.length > 0 && (
            <>
              {" "}
              · Filters:{" "}
              {appliedFilters
                .map(
                  ([k, v]) =>
                    `${LABELS[k as FilterKey]}=${fields.find((f) => f.key === k)?.options?.find((o) => o.value === v)?.label ?? v}`,
                )
                .join(", ")}
            </>
          )}
        </p>
      </div>

      {showSummary && result.summary && result.summary.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {result.summary.map((s) => (
            <div key={s.label} className="rounded-xl border bg-card px-4 py-3 shadow-xs">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{s.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{s.value}</p>
              {s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <p className="text-sm text-muted-foreground">
            {result.total === 0
              ? "No records"
              : `${((page - 1) * size + 1).toLocaleString()}–${Math.min(page * size, result.total).toLocaleString()} of ${result.total.toLocaleString()}`}
          </p>
          {exportable && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={exportHref}>
                  <Download /> CSV
                </a>
              </Button>
              <PrintButton />
            </div>
          )}
        </div>
        {result.rows.length === 0 ? (
          <EmptyState
            title={emptyTitle ?? "No matching records"}
            description={emptyDescription ?? (appliedFilters.length ? "Try widening the date range or clearing filters." : undefined)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  {columns.map((c) => {
                    const activeSort = sort === c.key;
                    const nextDir = activeSort && dir === "desc" ? "asc" : "desc";
                    const Icon = activeSort ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        className={cn(
                          c.screenOnly && STICKY,
                          "px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted-foreground",
                          c.align === "right" && "text-right",
                        )}
                      >
                        {c.sortable ? (
                          <Link
                            href={`${basePath}${qs(params, { sort: c.key, dir: nextDir, page: undefined })}`}
                            className={cn("inline-flex items-center gap-1 hover:text-foreground", activeSort && "text-foreground")}
                            aria-sort={activeSort ? (dir === "asc" ? "ascending" : "descending") : undefined}
                          >
                            {c.label}
                            <Icon className="no-print size-3" />
                          </Link>
                        ) : (
                          c.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          c.screenOnly && STICKY,
                          "px-3 py-2.5 align-top",
                          c.align === "right"
                            ? "text-right tabular-nums whitespace-nowrap"
                            : WRAP.has(c.key)
                              ? "min-w-48"
                              : "whitespace-nowrap",
                        )}
                      >
                        <CellView cell={row[c.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="no-print flex items-center justify-between border-t px-4 py-2.5">
            <Button variant="outline" size="sm" asChild disabled={page <= 1} className={cn(page <= 1 && "pointer-events-none opacity-50")}>
              <Link href={`${basePath}${qs(params, { page: String(page - 1) })}`} aria-disabled={page <= 1}>
                <ChevronLeft /> Previous
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {pages}
            </span>
            <Button variant="outline" size="sm" asChild className={cn(page >= pages && "pointer-events-none opacity-50")}>
              <Link href={`${basePath}${qs(params, { page: String(page + 1) })}`} aria-disabled={page >= pages}>
                Next <ChevronRight />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
