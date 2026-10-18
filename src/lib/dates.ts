import { TZDate } from "@date-fns/tz";
import { addDays, format as dfFormat } from "date-fns";

/**
 * Timezone policy
 * - All timestamps are stored in UTC (timestamptz semantics).
 * - Business calendar days (report ranges, "today", expiry checks) are evaluated
 *   in the configured business timezone.
 * - Report date ranges are inclusive: from 00:00:00 on the "from" day up to the
 *   end of the "to" day, implemented as [start(from), start(to + 1 day)).
 * - Expiry dates are calendar dates (DATE columns) stored as UTC midnight.
 */

export const DATE_FORMATS = ["dd MMM yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string | null | undefined): value is string {
  return !!value && ISO_DAY.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
}

/** UTC instant of 00:00 on `day` (YYYY-MM-DD) in timezone `tz`. */
export function startOfDayInTz(day: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, tz).getTime());
}

/** Inclusive calendar range converted to a half-open UTC range for queries. */
export function dayRange(from: string | null | undefined, to: string | null | undefined, tz: string) {
  const range: { gte?: Date; lt?: Date } = {};
  if (isIsoDay(from)) range.gte = startOfDayInTz(from, tz);
  if (isIsoDay(to)) range.lt = startOfDayInTz(shiftDay(to, 1), tz);
  return range;
}

export function shiftDay(day: string, days: number): string {
  const d = new Date(day + "T00:00:00Z");
  return addDays(d, days).toISOString().slice(0, 10);
}

/** Today's calendar date (YYYY-MM-DD) in the business timezone. */
export function todayInTz(tz: string, now: Date = new Date()): string {
  return dfFormat(new TZDate(now.getTime(), tz), "yyyy-MM-dd");
}

/** A DATE column value (UTC midnight) for a calendar day. */
export function dateOnly(day: string): Date {
  return new Date(day + "T00:00:00.000Z");
}

/** Calendar day string for a DATE column value. */
export function dateOnlyString(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Parse an <input type="datetime-local"> value as wall-clock time in `tz`. */
export function parseLocalDateTime(value: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(new TZDate(y, mo - 1, d, h, mi, s || 0, tz).getTime());
}

/** Value for an <input type="datetime-local"> showing `date` in `tz`. */
export function toLocalDateTimeInput(date: Date, tz: string): string {
  return dfFormat(new TZDate(date.getTime(), tz), "yyyy-MM-dd'T'HH:mm");
}

export function formatDate(value: Date | string | null | undefined, tz: string, fmt: string = "dd MMM yyyy"): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return dfFormat(new TZDate(date.getTime(), tz), fmt);
}

export function formatDateTime(value: Date | string | null | undefined, tz: string, fmt: string = "dd MMM yyyy"): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return dfFormat(new TZDate(date.getTime(), tz), `${fmt}, HH:mm`);
}

/** Format a DATE column (calendar date, not an instant). */
export function formatCalendarDate(value: Date | null | undefined, fmt: string = "dd MMM yyyy"): string {
  if (!value) return "—";
  const [y, m, d] = value.toISOString().slice(0, 10).split("-").map(Number);
  return dfFormat(new Date(y, m - 1, d), fmt);
}

/** Whole days from `today` to `day` (both YYYY-MM-DD). Negative when in the past. */
export function daysBetween(today: string, day: string): number {
  return Math.round((Date.parse(day + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
}
