import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Tiny trend line rendered on the server as plain SVG (no chart library).
 * Decorative: the number next to it carries the meaning, so it is aria-hidden.
 */
export function Sparkline({ values, color = "var(--brand-green)", className }: { values: number[]; color?: string; className?: string }) {
  const id = `spark${useId().replace(/:/g, "")}`;
  if (values.length < 2 || values.every((v) => v === 0)) {
    return <div aria-hidden className={cn("h-8 border-b border-dashed border-border", className)} />;
  }
  const w = 120;
  const h = 32;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-8 w-full overflow-visible", className)}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          {/* style, not attributes: SVG presentation attributes ignore CSS variables */}
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.22 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        style={{ stroke: color }}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
