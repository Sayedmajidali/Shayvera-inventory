import type { Actor, Permission } from "../permissions";

export type FilterKey =
  | "q"
  | "from"
  | "to"
  | "supplierId"
  | "materialId"
  | "unitId"
  | "status"
  | "storeId"
  | "productId"
  | "sku"
  | "txnType"
  | "ref"
  | "categoryId"
  | "expiryStatus"
  | "stockStatus"
  | "condition"
  | "category";

export type Filters = Partial<Record<FilterKey, string>>;

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "muted";

export type RowAction =
  | { label: string; href: string }
  | { label: string; kind: "deleteEntry" | "restoreEntry" | "deleteProduct" | "restoreProduct"; id: string; name: string };

export type Cell =
  | string
  | number
  | null
  | { text: string; href?: string; tone?: Tone; download?: boolean }
  | { text: ""; actions: RowAction[] };

export interface Column {
  key: string;
  label: string;
  align?: "left" | "right";
  sortable?: boolean;
  /** Hidden in the on-screen table but included in CSV. */
  csvOnly?: boolean;
  /** Shown on screen only (e.g. row action buttons); never exported. */
  screenOnly?: boolean;
}

export interface RunContext {
  /** The viewer, so a report can offer row actions they are allowed to use. */
  actor?: Pick<Actor, "role" | "permissions">;
  tz: string;
  today: string;
  dateFormat: string;
  page: { skip: number; take: number } | null; // null = all rows (CSV, capped)
  sort?: string;
  dir: "asc" | "desc";
}

export interface ReportResult {
  rows: Record<string, Cell>[];
  total: number;
  summary?: { label: string; value: string; hint?: string }[];
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  module: "raw" | "product" | "ecom";
  permission: Permission[];
  filters: FilterKey[];
  /** Fixed options for status-like filters. */
  options?: Partial<Record<FilterKey, SelectOption[]>>;
  /** Labels override for filters (e.g. "Status" -> "Inspection status"). */
  filterLabels?: Partial<Record<FilterKey, string>>;
  defaults?: Filters;
  columns: Column[];
  defaultSort: string;
  defaultDir?: "asc" | "desc";
  dateFilterLabel?: string;
  run(filters: Filters, ctx: RunContext): Promise<ReportResult>;
}

export const CSV_ROW_LIMIT = 50_000;

export function cellText(c: Cell): string {
  if (c === null || c === undefined) return "";
  if (typeof c === "object") return "actions" in c ? "" : c.text;
  return String(c);
}

export function sortKey(def: Pick<ReportDef, "columns" | "defaultSort">, requested?: string) {
  const sortable = def.columns.filter((c) => c.sortable).map((c) => c.key);
  return requested && sortable.includes(requested) ? requested : def.defaultSort;
}
