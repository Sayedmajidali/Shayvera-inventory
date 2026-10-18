import { notFound } from "next/navigation";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { getReport } from "@/server/reports";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { formatQty } from "@/lib/decimal";
import { RawAdjustDialog } from "./adjust-dialog";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const row = await prisma.rawMaterial.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: row?.name ?? "Not found" };
}

export default async function MaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await requirePage("rm.view");
  const { id } = await params;
  const m = await prisma.rawMaterial.findUnique({ where: { id }, include: { unit: true } });
  if (!m) notFound();
  const pending = await prisma.rawMaterialEntry.aggregate({
    where: { rawMaterialId: id, status: "PENDING_INSPECTION", deletedAt: null },
    _sum: { quantity: true },
    _count: true,
  });
  return (
    <>
      <PageHeader
        title={m.name}
        description={`Stock ledger in ${m.unit.code}`}
        crumbs={[{ label: "Raw Materials" }, { label: "Stock", href: "/raw-materials/stock" }, { label: m.name }]}
        actions={can(actor, "inventory.adjust") && <RawAdjustDialog materialId={m.id} unit={m.unit.code} />}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Current balance" value={formatQty(m.currentBalance, m.unit.code)} />
        <StatCard
          label="Pending inspection"
          value={formatQty(pending._sum.quantity ?? 0, m.unit.code)}
          hint={`${pending._count} entries — not in stock`}
          href="/raw-materials/inspection"
        />
      </div>
      {can(actor, "rm.reports") ? (
        <ReportView
          def={getReport("rm-ledger")!}
          params={await searchParams}
          basePath={`/raw-materials/stock/${id}`}
          fixed={{ materialId: id }}
          hide={["unitId"]}
          showSummary={false}
        />
      ) : (
        <p className="text-sm text-muted-foreground">The full ledger is available to users with raw material report access.</p>
      )}
    </>
  );
}
