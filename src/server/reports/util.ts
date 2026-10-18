import { Prisma } from "@prisma/client";
import { dayRange, formatCalendarDate, formatDate, formatDateTime } from "@/lib/dates";
import { qtyString } from "@/lib/decimal";
import { CSV_ROW_LIMIT, type Cell, type Filters, type RunContext, type Tone } from "./types";

export const badge = (map: Record<string, { label: string; tone: Tone }>, key: string | null | undefined): Cell =>
  key ? { text: map[key]?.label ?? key, tone: map[key]?.tone ?? "neutral" } : null;

export const link = (text: string, href: string): Cell => ({ text, href });

export const qty = (v: Prisma.Decimal.Value | null | undefined) => qtyString(v ?? 0);

export const dt = (ctx: RunContext, d: Date | null | undefined) => formatDateTime(d, ctx.tz, ctx.dateFormat);
export const day = (ctx: RunContext, d: Date | null | undefined) => formatDate(d, ctx.tz, ctx.dateFormat);
export const calDay = (ctx: RunContext, d: Date | null | undefined) => formatCalendarDate(d ?? null, ctx.dateFormat);

export const range = (f: Filters, ctx: RunContext) => {
  const r = dayRange(f.from, f.to, ctx.tz);
  return r.gte || r.lt ? r : undefined;
};

export const paging = (ctx: RunContext): { skip: number; take: number } =>
  ctx.page ? { skip: ctx.page.skip, take: ctx.page.take } : { skip: 0, take: CSV_ROW_LIMIT };

/** Prisma.sql LIMIT/OFFSET fragment. */
export const sqlPaging = (ctx: RunContext) =>
  ctx.page ? Prisma.sql`LIMIT ${ctx.page.take} OFFSET ${ctx.page.skip}` : Prisma.sql`LIMIT ${CSV_ROW_LIMIT}`;

/** Safe ORDER BY from a whitelist map (never interpolates user input). */
export const sqlOrder = (map: Record<string, string>, key: string, dir: "asc" | "desc") =>
  Prisma.raw(`${map[key] ?? Object.values(map)[0]} ${dir === "asc" ? "ASC" : "DESC"} NULLS LAST`);

export const and = (parts: Prisma.Sql[]) => (parts.length ? Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}` : Prisma.empty);

export const like = (q: string) => `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;

export const toNumber = (v: unknown) => Number(v ?? 0);
