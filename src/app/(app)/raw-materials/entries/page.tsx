import Link from "@/components/app/fast-link";
import { Plus } from "lucide-react";
import { requirePage } from "@/server/auth";
import { can } from "@/server/permissions";
import { getReport } from "@/server/reports";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Material entries" };

export default async function EntriesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requirePage(["rm.view", "rm.entry.create"]);
  return (
    <>
      <PageHeader
        title="Material entries"
        description="Incoming raw materials. New entries wait for quality inspection and do not count as stock until approved."
        crumbs={[{ label: "Raw Materials" }, { label: "Material entries" }]}
        actions={
          can(actor, "rm.entry.create") && (
            <Button asChild>
              <Link href="/raw-materials/entries/new">
                <Plus /> New entry
              </Link>
            </Button>
          )
        }
      />
      {can(actor, "rm.view") ? (
        <ReportView
          def={getReport("rm-entries")!}
          params={await searchParams}
          basePath="/raw-materials/entries"
          emptyTitle="No raw material entries yet"
        />
      ) : (
        <p className="text-sm text-muted-foreground">You can record new entries. Ask an administrator for access to view the entry list.</p>
      )}
    </>
  );
}
