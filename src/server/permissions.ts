import type { Role } from "@prisma/client";
import { ForbiddenError } from "./errors";

/**
 * Permission catalogue. ADMIN implicitly holds every permission.
 * STAFF hold only what an admin grants; `adminOnly` permissions can never be
 * granted to staff (enforced on save and on every check).
 */
export const PERMISSIONS = {
  // Raw materials
  "rm.view": { label: "View raw material entries and stock", group: "Raw Materials" },
  "rm.entry.create": { label: "Record incoming raw materials", group: "Raw Materials" },
  "rm.inspect": { label: "Approve / reject quality inspections", group: "Raw Materials" },
  "rm.bills": { label: "Upload and view raw material bills", group: "Raw Materials" },
  "rm.reports": { label: "View raw material reports", group: "Raw Materials" },
  // Ready products
  "product.view": { label: "View products, stock and alerts", group: "Ready Products" },
  "product.receive": { label: "Receive new stock batches", group: "Ready Products" },
  "product.disposition": { label: "Decide quarantined returns", group: "Ready Products" },
  "product.reports": { label: "View ready product reports", group: "Ready Products" },
  // E-commerce
  "ecom.view": { label: "View stores, dispatches and returns", group: "E-commerce" },
  "ecom.dispatch": { label: "Record dispatches", group: "E-commerce" },
  "ecom.return": { label: "Record returns", group: "E-commerce" },
  "ecom.sales": { label: "Record store-reported sales", group: "E-commerce" },
  "ecom.bills": { label: "Upload and view e-commerce documents", group: "E-commerce" },
  "ecom.reports": { label: "View e-commerce reports", group: "E-commerce" },
  // Dashboard
  "dashboard.view": { label: "View the dashboard", group: "General" },
  // Admin only
  "admin.users": { label: "Manage users and permissions", group: "Administration", adminOnly: true },
  "admin.masters": { label: "Manage suppliers, stores, products, units", group: "Administration", adminOnly: true },
  "admin.settings": { label: "Change business settings", group: "Administration", adminOnly: true },
  "admin.audit": { label: "View audit log", group: "Administration", adminOnly: true },
  "inventory.adjust": { label: "Post inventory corrections", group: "Administration", adminOnly: true },
  "inventory.reverse": { label: "Reverse posted documents and inspections", group: "Administration", adminOnly: true },
  "admin.import": { label: "Import master data from CSV", group: "Administration", adminOnly: true },
} as const satisfies Record<string, { label: string; group: string; adminOnly?: boolean }>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const GRANTABLE_TO_STAFF = ALL_PERMISSIONS.filter((p) => !("adminOnly" in PERMISSIONS[p] && PERMISSIONS[p].adminOnly));

export const DEFAULT_STAFF_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "rm.view",
  "rm.entry.create",
  "rm.bills",
  "product.view",
  "ecom.view",
  "ecom.dispatch",
  "ecom.return",
  "ecom.bills",
];

export interface Actor {
  id: string;
  name: string;
  role: Role;
  permissions: string[];
}

export function can(actor: Pick<Actor, "role" | "permissions"> | null | undefined, permission: Permission): boolean {
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;
  if (!GRANTABLE_TO_STAFF.includes(permission)) return false;
  return actor.permissions.includes(permission);
}

export function canAny(actor: Pick<Actor, "role" | "permissions"> | null | undefined, permissions: Permission[]) {
  return permissions.some((p) => can(actor, p));
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError();
}

export function assertAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN") throw new ForbiddenError("Only administrators can perform this action.");
}

export function sanitizePermissions(role: Role, permissions: string[]): Permission[] {
  if (role === "ADMIN") return [];
  const set = new Set(permissions);
  return GRANTABLE_TO_STAFF.filter((p) => set.has(p));
}
