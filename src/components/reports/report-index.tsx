import Link from "@/components/app/fast-link";
import { ArrowRight, FileBarChart } from "lucide-react";
import type { ReportDef } from "@/server/reports/types";
import { EmptyState } from "@/components/app/empty-state";

export function ReportIndex({ reports }: { reports: ReportDef[] }) {
  if (reports.length === 0) return <EmptyState title="No reports available" description="Ask an administrator for report access." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {reports.map((r) => (
        <Link
          key={r.key}
          href={`/reports/${r.key}`}
          className="group flex gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/40"
        >
          <div className="h-fit rounded-lg bg-accent p-2 text-accent-foreground">
            <FileBarChart className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center justify-between gap-2 font-medium">
              {r.title}
              <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{r.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
