import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { can } from "@/server/permissions";
import { PageHeader } from "@/components/app/page-header";
import { toLocalDateTimeInput } from "@/lib/dates";
import { EntryForm } from "./entry-form";

export const metadata = { title: "New material entry" };

export default async function NewEntryPage() {
  const actor = await requirePage("rm.entry.create");
  const settings = await getSettings();
  const [suppliers, units, materials] = await Promise.all([
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.unit.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.rawMaterial.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  return (
    <>
      <PageHeader
        title="New material entry"
        description="Record raw materials received from a supplier. The entry will be sent to quality inspection."
        crumbs={[{ label: "Raw Materials" }, { label: "Material entries", href: "/raw-materials/entries" }, { label: "New" }]}
      />
      <EntryForm
        suppliers={suppliers}
        units={units}
        materialNames={[...new Set(materials.map((m) => m.name))]}
        defaultDate={toLocalDateTimeInput(new Date(), settings.timezone)}
        timezone={settings.timezone}
        canUpload={can(actor, "rm.bills")}
        maxMb={settings.maxUploadMb}
        canManageSuppliers={can(actor, "admin.masters")}
      />
    </>
  );
}
