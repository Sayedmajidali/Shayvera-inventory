import { requirePage } from "@/server/auth";
import { can } from "@/server/permissions";
import { NAV, type NavSection } from "@/lib/nav";
import { SidebarBrand, SidebarNav } from "@/components/app/sidebar";
import { MobileNav } from "@/components/app/mobile-nav";
import { UserMenu } from "@/components/app/user-menu";
import { getSettings } from "@/server/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePage();
  const settings = await getSettings();
  const sections: NavSection[] = NAV.flatMap((s) => {
    if (s.href) return s.permission?.some((p) => can(actor, p)) ? [s] : [];
    const items = s.items?.filter((i) => i.permission.some((p) => can(actor, p))) ?? [];
    return items.length ? [{ ...s, items }] : [];
  });

  return (
    <div className="flex min-h-svh">
      <aside className="no-print sticky top-0 hidden h-svh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarBrand />
        <SidebarNav sections={sections} />
        <div className="border-t border-sidebar-border px-5 py-3 text-[11px] text-sidebar-foreground/50">
          Times shown in {settings.timezone}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <MobileNav sections={sections} />
          <div className="flex-1" />
          <UserMenu name={actor.name} role={actor.role} />
        </header>
        <main className="print-full mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
