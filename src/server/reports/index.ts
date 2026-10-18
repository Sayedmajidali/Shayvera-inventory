import { can, type Actor } from "../permissions";
import { rawReports } from "./raw";
import { productReports } from "./products";
import { ecomReports } from "./ecommerce";
import type { ReportDef } from "./types";

export const REPORTS: ReportDef[] = [...rawReports, ...productReports, ...ecomReports];

export function getReport(key: string): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key);
}

export function canViewReport(actor: Actor, def: ReportDef) {
  return def.permission.some((p) => can(actor, p));
}

export function reportsFor(actor: Actor, module: ReportDef["module"]) {
  return REPORTS.filter((r) => r.module === module && canViewReport(actor, r));
}
