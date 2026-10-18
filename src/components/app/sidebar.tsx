"use client";

import Link from "@/components/app/fast-link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ChevronDown, Database, FlaskConical, LayoutDashboard, Settings2, Store } from "lucide-react";
import { useState } from "react";
import type { NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { BrandLockupLight } from "./logo";

/** Shows the moment a menu item is clicked, until its page arrives. */
function PendingDot() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "ml-auto size-1.5 rounded-full bg-sidebar-primary transition-opacity",
        pending ? "animate-pulse opacity-100" : "opacity-0",
      )}
    />
  );
}

const ICONS = { dashboard: LayoutDashboard, masters: Database, raw: FlaskConical, product: Boxes, ecom: Store, admin: Settings2 };

function isActive(pathname: string, href: string) {
  // The Master Data overview is only "current" on its own page, not on its sub-pages.
  if (href === "/masters") return pathname === "/masters";
  // Product Master owns /products and /products/<id>, but not the sibling sections.
  if (href === "/products") return pathname === "/products" || /^\/products\/(?!stock|alerts|reports)[^/]+/.test(pathname);
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {sections.map((section) => {
        const Icon = ICONS[section.icon];
        if (section.href) {
          const active = isActive(pathname, section.href);
          return (
            <Link
              key={section.label}
              href={section.href}
              prefetch={null}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {section.label}
              <PendingDot />
            </Link>
          );
        }
        const open = !collapsed[section.label];
        const sectionActive = section.items?.some((i) => isActive(pathname, i.href));
        return (
          <div key={section.label} className="pt-3">
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [section.label]: open }))}
              aria-expanded={open}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase",
                sectionActive ? "text-sidebar-primary" : "text-sidebar-foreground/55 hover:text-sidebar-foreground/80",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1 text-left">{section.label}</span>
              <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
            </button>
            {open && (
              <ul className="mt-1 space-y-0.5">
                {section.items?.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        prefetch={null}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative ml-5 flex items-center rounded-md py-1.5 pr-3 pl-5 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:top-1.5 before:bottom-1.5 before:left-1.5 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        {item.label}
                        <PendingDot />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function SidebarBrand() {
  return (
    <div className="flex h-20 items-center border-b border-sidebar-border px-5">
      <Link
        href="/dashboard"
        aria-label="Shayvera dashboard"
        className="rounded-md focus-visible:outline-2 focus-visible:outline-sidebar-ring"
      >
        <BrandLockupLight />
      </Link>
    </div>
  );
}
