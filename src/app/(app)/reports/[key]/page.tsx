import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/server/auth";
import { canViewReport, getReport } from "@/server/reports";
import { ReportView } from "@/components/reports/report-view";
import { PageHeader } from "@/components/app/page-header";

const MODULE = {
  raw: { label: "Raw Materials", href: "/raw-materials/reports" },
  product: { label: "Ready Products", href: "/products/reports" },
  ecom: { label: "E-commerce", href: "/ecommerce/reports" },
};

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const def = getReport((await params).key);
  return { title: def?.title ?? "Report" };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await requirePage();
  const { key } = await params;
  const def = getReport(key);
  if (!def) notFound();
  if (!canViewReport(actor, def)) redirect("/forbidden");
  const m = MODULE[def.module];
  return (
    <>
      <PageHeader
        title={def.title}
        description={def.description}
        crumbs={[{ label: m.label }, { label: "Reports", href: m.href }, { label: def.title }]}
      />
      <ReportView def={def} params={await searchParams} basePath={`/reports/${key}`} />
    </>
  );
}
