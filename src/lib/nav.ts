import type { Permission } from "@/server/permissions";

export interface NavItem {
  label: string;
  href: string;
  permission: Permission[];
}

export interface NavSection {
  label: string;
  icon: "dashboard" | "masters" | "raw" | "product" | "ecom" | "admin";
  href?: string;
  permission?: Permission[];
  items?: NavItem[];
}

export const NAV: NavSection[] = [
  { label: "Dashboard", icon: "dashboard", href: "/dashboard", permission: ["dashboard.view"] },
  {
    label: "Master Data",
    icon: "masters",
    items: [
      { label: "Overview", href: "/masters", permission: ["admin.masters", "product.view", "ecom.view", "rm.view"] },
      { label: "Products", href: "/products", permission: ["product.view"] },
      { label: "Raw Materials", href: "/masters/raw-materials", permission: ["admin.masters", "rm.view"] },
      { label: "Suppliers", href: "/masters/suppliers", permission: ["admin.masters"] },
      { label: "Stores", href: "/masters/stores", permission: ["ecom.view"] },
      { label: "Units", href: "/masters/units", permission: ["admin.masters"] },
      { label: "Categories", href: "/masters/categories", permission: ["admin.masters"] },
    ],
  },
  {
    label: "Raw Materials",
    icon: "raw",
    items: [
      { label: "Material Entries", href: "/raw-materials/entries", permission: ["rm.view", "rm.entry.create"] },
      { label: "Quality Inspection", href: "/raw-materials/inspection", permission: ["rm.inspect", "rm.view"] },
      { label: "Raw Material Stock", href: "/raw-materials/stock", permission: ["rm.view"] },
      { label: "Bill Entries", href: "/raw-materials/bills", permission: ["rm.bills"] },
      { label: "Reports", href: "/raw-materials/reports", permission: ["rm.reports"] },
    ],
  },
  {
    label: "Ready Products",
    icon: "product",
    items: [
      { label: "Stock Overview", href: "/products/stock", permission: ["product.view"] },
      { label: "Alerts", href: "/products/alerts", permission: ["product.view"] },
      { label: "Reports", href: "/products/reports", permission: ["product.reports"] },
    ],
  },
  {
    label: "E-commerce",
    icon: "ecom",
    items: [
      { label: "Dispatch / Sales", href: "/ecommerce/dispatches", permission: ["ecom.view", "ecom.dispatch"] },
      { label: "Returns", href: "/ecommerce/returns", permission: ["ecom.view", "ecom.return"] },
      { label: "Transaction History", href: "/ecommerce/transactions", permission: ["ecom.view"] },
      { label: "Bills", href: "/ecommerce/bills", permission: ["ecom.bills"] },
      { label: "Reports", href: "/ecommerce/reports", permission: ["ecom.reports"] },
    ],
  },
  {
    label: "Administration",
    icon: "admin",
    items: [
      { label: "Users and Roles", href: "/admin/users", permission: ["admin.users"] },
      { label: "Settings", href: "/admin/settings", permission: ["admin.settings"] },
      { label: "Audit Log", href: "/admin/audit", permission: ["admin.audit"] },
    ],
  },
];
