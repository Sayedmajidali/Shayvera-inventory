import { cn } from "@/lib/utils";
import type { Tone } from "@/server/reports/types";

const TONES: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground ring-border",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  muted: "bg-muted text-muted-foreground ring-border",
};

export function StatusBadge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

export function Pill({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value: string }) {
  const m = map[value];
  return <StatusBadge tone={m?.tone ?? "neutral"}>{m?.label ?? value}</StatusBadge>;
}
