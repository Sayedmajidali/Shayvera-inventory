import type { Prisma } from "@prisma/client";

export interface FieldChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

type Value = string | number | boolean | Date | Prisma.Decimal | null | undefined;

function show(v: Value): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

/**
 * Field-level differences for the audit log. Values are stored as display
 * strings so the history stays readable even if the record changes later.
 */
export function diffFields(fields: { field: string; label: string; from: Value; to: Value }[]): FieldChange[] {
  return fields.map((f) => ({ field: f.field, label: f.label, from: show(f.from), to: show(f.to) })).filter((c) => c.from !== c.to);
}

export function describeChanges(changes: FieldChange[]): string {
  return changes.map((c) => c.label.toLowerCase()).join(", ");
}
