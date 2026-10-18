import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn("size-9", className)}>
      <rect width="40" height="40" rx="11" fill="var(--sidebar-primary)" />
      <path
        d="M26.5 13.2c-1.6-1.5-3.8-2.3-6.3-2.3-4 0-6.8 2.1-6.8 5.3 0 3.3 2.7 4.5 6.4 5.4 3 .7 4.3 1.3 4.3 2.8 0 1.6-1.6 2.6-4 2.6-2.4 0-4.5-.9-6.1-2.6l-1.9 2.4c1.9 2 4.7 3.1 7.9 3.1 4.3 0 7.3-2.2 7.3-5.6 0-3.4-2.6-4.6-6.6-5.5-2.8-.7-4.1-1.2-4.1-2.6 0-1.4 1.4-2.3 3.5-2.3 1.9 0 3.6.6 4.9 1.8l1.5-2.5Z"
        fill="var(--sidebar-primary-foreground)"
      />
    </svg>
  );
}

export function Wordmark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="leading-tight">
        <div className={cn("font-display text-lg font-semibold tracking-wide", light ? "text-sidebar-foreground" : "text-foreground")}>
          Shayvera
        </div>
        <div className={cn("text-[10px] uppercase tracking-[0.2em]", light ? "text-sidebar-foreground/60" : "text-muted-foreground")}>
          Inventory
        </div>
      </div>
    </div>
  );
}
