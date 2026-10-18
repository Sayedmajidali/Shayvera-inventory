import type { Tone } from "@/server/reports/types";

export const ENTRY_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING_INSPECTION: { label: "Pending inspection", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

export const RAW_TXN_TYPE: Record<string, string> = {
  INWARD_APPROVED: "Inward (approved)",
  INSPECTION_REVERSAL: "Inspection reversal",
  PRODUCTION_ISSUE: "Production issue",
  ADJUSTMENT: "Adjustment",
};

export const PRODUCT_TXN_TYPE: Record<string, string> = {
  OPENING: "Opening stock",
  RECEIPT: "Stock receipt",
  PRODUCTION_RECEIPT: "Production receipt",
  ADJUSTMENT: "Adjustment",
  DISPATCH: "Dispatch",
  RETURN: "Return",
  DISPOSITION: "Quarantine disposition",
  REVERSAL: "Reversal",
  SALE: "Sale (store reported)",
};

export const BUCKET: Record<string, { label: string; tone: Tone }> = {
  SALEABLE: { label: "Saleable", tone: "success" },
  QUARANTINE: { label: "Quarantine", tone: "warning" },
  DAMAGED: { label: "Damaged", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "muted" },
};

export const RETURN_CONDITION: Record<string, { label: string; tone: Tone }> = {
  SALEABLE: { label: "Saleable", tone: "success" },
  DAMAGED: { label: "Damaged", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "muted" },
  PENDING_INSPECTION: { label: "Pending inspection", tone: "warning" },
};

export const EXPIRY_STATUS: Record<string, { label: string; tone: Tone }> = {
  EXPIRED: { label: "Expired", tone: "danger" },
  NEAR_EXPIRY: { label: "Expiring soon", tone: "warning" },
  OK: { label: "Not expired", tone: "success" },
  NO_EXPIRY: { label: "No expiry", tone: "muted" },
};

export const STOCK_STATUS: Record<string, { label: string; tone: Tone }> = {
  OUT: { label: "Out of stock", tone: "danger" },
  LOW: { label: "Low stock", tone: "warning" },
  OK: { label: "In stock", tone: "success" },
};

export const DOC_STATUS: Record<string, { label: string; tone: Tone }> = {
  POSTED: { label: "Posted", tone: "success" },
  REVERSED: { label: "Reversed", tone: "muted" },
};

export const ATTACHMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  REPLACED: { label: "Replaced", tone: "muted" },
};

export const toOptions = (map: Record<string, { label: string } | string>) =>
  Object.entries(map).map(([value, v]) => ({ value, label: typeof v === "string" ? v : v.label }));
