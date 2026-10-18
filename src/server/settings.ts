import { cache } from "react";
import { z } from "zod";
import { DATE_FORMATS } from "@/lib/dates";
import { prisma } from "./db";

export const ALLOWED_FILE_TYPES = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
} as const;

export const settingsSchema = z.object({
  businessName: z.string().trim().min(1).max(100),
  timezone: z
    .string()
    .trim()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
  dateFormat: z.enum(DATE_FORMATS),
  maxUploadMb: z.coerce.number().int().min(1).max(25),
  allowedFileTypes: z.array(z.enum(Object.keys(ALLOWED_FILE_TYPES) as [string, ...string[]])).min(1),
  // When true, admins may dispatch batches that are already expired (logged in the audit trail).
  allowExpiredDispatchByAdmin: z.boolean(),
});

export type BusinessSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: "Shayvera",
  timezone: process.env.APP_TIMEZONE || "UTC",
  dateFormat: "dd MMM yyyy",
  maxUploadMb: 10,
  allowedFileTypes: ["application/pdf", "image/jpeg", "image/png"],
  allowExpiredDispatchByAdmin: false,
};

/**
 * Hosting limit on upload size. Netlify Functions accept request bodies up to
 * 6 MB, so files are capped at 4 MB there whatever the admin setting says.
 */
export const PLATFORM_UPLOAD_CAP_MB = process.env.STORAGE_DRIVER === "netlify" || process.env.NETLIFY === "true" ? 4 : 25;

async function loadSettings(): Promise<BusinessSettings> {
  const row = await prisma.setting.findUnique({ where: { key: "business" } });
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...((row?.value as object) ?? {}) });
  const settings = parsed.success ? parsed.data : DEFAULT_SETTINGS;
  return { ...settings, maxUploadMb: Math.min(settings.maxUploadMb, PLATFORM_UPLOAD_CAP_MB) };
}

/** Per-request cached settings for server components. */
export const getSettings = cache(loadSettings);

/** Uncached read for services and tests. */
export const readSettings = loadSettings;
