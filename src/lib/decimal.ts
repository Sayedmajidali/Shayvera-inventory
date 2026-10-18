import { Prisma } from "@prisma/client";

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export const ZERO = new Prisma.Decimal(0);

export function dec(value: Prisma.Decimal.Value | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined || value === "") return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

export function sum(values: Array<Prisma.Decimal.Value | null | undefined>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.plus(dec(v)), new Prisma.Decimal(0));
}

/** Format a quantity: integers for whole-unit items, up to 3 decimals for weights. */
export function formatQty(value: Prisma.Decimal.Value | null | undefined, unitCode?: string | null): string {
  const d = dec(value);
  const decimals = d.isInteger() ? 0 : 3;
  const n = Number(d.toFixed(decimals));
  const formatted = n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  return unitCode ? `${formatted} ${unitCode}` : formatted;
}

/** Serialize a Decimal to a plain string for client components and CSV. */
export function qtyString(value: Prisma.Decimal.Value | null | undefined): string {
  const d = dec(value);
  return d.isInteger() ? d.toFixed(0) : d.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
