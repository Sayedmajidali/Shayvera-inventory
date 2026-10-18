import Link from "@/components/app/fast-link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: "default" | "warning" | "danger" | "success";
  icon?: React.ReactNode;
}) {
  const body = (
    <div
      className={cn(
        "group relative h-full rounded-xl border bg-card p-4 shadow-xs transition-colors",
        href && "hover:border-primary/40 hover:shadow-sm",
        tone === "warning" && "border-amber-200 bg-amber-50/40",
        tone === "danger" && "border-red-200 bg-red-50/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {href && (
        <ArrowUpRight className="absolute right-3 bottom-3 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full focus-visible:outline-2 focus-visible:outline-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
