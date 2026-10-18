"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Validated pair (lightness band, CVD separation, contrast on light surface).
const DISPATCHED = "#9a3d7c";
const RETURNED = "#c27c1c";
const GRID = "oklch(0.92 0.01 330)";
const AXIS = { fontSize: 12, fill: "oklch(0.5 0.02 330)" };

function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-medium text-foreground tabular-nums">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

const legend = (value: string) => <span className="text-xs text-muted-foreground">{value}</span>;

export function StoreChart({ data }: { data: { store: string; dispatched: number; returned: number }[] }) {
  if (data.length === 0) return <p className="py-16 text-center text-sm text-muted-foreground">No dispatches or returns in this period.</p>;
  return (
    <div style={{ height: Math.max(220, data.length * 56 + 60) }} role="img" aria-label="Units dispatched and returned per store">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="store" tick={AXIS} axisLine={false} tickLine={false} width={120} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "oklch(0.96 0.01 330)" }} />
          <Legend formatter={legend} iconType="circle" iconSize={8} />
          <Bar dataKey="dispatched" name="Dispatched" fill={DISPATCHED} radius={[0, 4, 4, 0]} maxBarSize={18} />
          <Bar dataKey="returned" name="Returned" fill={RETURNED} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyChart({ data }: { data: { day: string; label: string; dispatched: number; returned: number }[] }) {
  return (
    <div className="h-64" role="img" aria-label="Units dispatched and returned per day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barGap={2} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "oklch(0.96 0.01 330)" }} />
          <Legend formatter={legend} iconType="circle" iconSize={8} />
          <Bar dataKey="dispatched" name="Dispatched" fill={DISPATCHED} radius={[4, 4, 0, 0]} maxBarSize={14} />
          <Bar dataKey="returned" name="Returned" fill={RETURNED} radius={[4, 4, 0, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
