import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ValidationError } from "./errors";

export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    const first = result.error.issues[0];
    throw new ValidationError(first ? `${first.path.join(".") || "Input"}: ${first.message}` : "Invalid input", fieldErrors);
  }
  return result.data;
}

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optionalText = (max = 500) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional()).transform((v) => v ?? null);

export const requiredText = (max = 200, label = "This field") =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max);

/** Positive quantity with at most 3 decimal places, returned as a Prisma.Decimal. */
export const positiveQty = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const s = String(v).trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s)) {
    ctx.addIssue({ code: "custom", message: "Enter a valid quantity (up to 3 decimals)" });
    return z.NEVER;
  }
  const d = new Prisma.Decimal(s);
  if (d.lte(0)) {
    ctx.addIssue({ code: "custom", message: "Quantity must be greater than zero" });
    return z.NEVER;
  }
  if (d.gt("999999999999")) {
    ctx.addIssue({ code: "custom", message: "Quantity is too large" });
    return z.NEVER;
  }
  return d;
});

/** Non-negative quantity (thresholds, opening stock). */
export const nonNegativeQty = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const s = String(v).trim() || "0";
  if (!/^\d+(\.\d{1,3})?$/.test(s)) {
    ctx.addIssue({ code: "custom", message: "Enter a valid non-negative number (up to 3 decimals)" });
    return z.NEVER;
  }
  return new Prisma.Decimal(s);
});

/** Signed non-zero quantity for adjustments. */
export const signedQty = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const s = String(v).trim();
  if (!/^-?\d+(\.\d{1,3})?$/.test(s) || new Prisma.Decimal(s).isZero()) {
    ctx.addIssue({ code: "custom", message: "Enter a non-zero quantity, e.g. 5 or -2" });
    return z.NEVER;
  }
  return new Prisma.Decimal(s);
});

export const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

export const idempotencyKey = z.string().min(8).max(100);

export function assertUnitPrecision(qty: Prisma.Decimal, unit: { code: string; allowsDecimal: boolean }, field = "quantity") {
  if (!unit.allowsDecimal && !qty.isInteger()) {
    throw new ValidationError(`Quantities in ${unit.code} must be whole numbers.`, { [field]: "Whole numbers only" });
  }
}
