import "server-only";
import { readSettings } from "../settings";
import { todayInTz } from "@/lib/dates";
import { sortKey, type FilterKey, type Filters, type ReportDef, type ReportResult } from "./types";

export const PAGE_SIZE = 25;

export type Params = Record<string, string | string[] | undefined>;

export function str(params: Params, key: string): string | undefined {
  const v = params[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim().slice(0, 200) : undefined;
}

export function filtersFrom(def: ReportDef, params: Params, fixed: Filters = {}): Filters {
  const f: Filters = { ...def.defaults };
  for (const k of def.filters) {
    const v = str(params, k);
    if (v !== undefined) f[k as FilterKey] = v;
  }
  return { ...f, ...fixed };
}

export async function runReport(def: ReportDef, params: Params, opts: { all?: boolean; fixed?: Filters; pageSize?: number } = {}) {
  const settings = await readSettings();
  const filters = filtersFrom(def, params, opts.fixed);
  const page = Math.max(1, Number.parseInt(str(params, "page") ?? "1", 10) || 1);
  const size = opts.pageSize ?? PAGE_SIZE;
  const sort = sortKey(def, str(params, "sort"));
  const dirParam = str(params, "dir");
  const dir: "asc" | "desc" = dirParam === "asc" || dirParam === "desc" ? dirParam : (def.defaultDir ?? "desc");
  const result: ReportResult = await def.run(filters, {
    tz: settings.timezone,
    today: todayInTz(settings.timezone),
    dateFormat: settings.dateFormat,
    page: opts.all ? null : { skip: (page - 1) * size, take: size },
    sort,
    dir,
  });
  return { result, filters, page, size, sort, dir, settings };
}
