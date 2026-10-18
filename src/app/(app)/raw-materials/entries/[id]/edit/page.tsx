import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { toLocalDateTimeInput } from "@/lib/dates";
import { qtyString } from "@/lib/decimal";
import { EntryForm } from "../../new/entry-form";

export const metadata = { title: "Edit material entry" };

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage("rm.entry.edit");
  const { id } = await params;
  const settings = await getSettings();
  const entry = await prisma.rawMaterialEntry.findUnique({ where: { id }, include: { rawMaterial: true } });
  if (!entry) notFound();
  // Inspected or deleted entries are read-only; send the user back to the record.
  if (entry.deletedAt || entry.status !== "PENDING_INSPECTION") redirect(`/raw-materials/entries/${id}`);

  const [suppliers, units, materials] = await Promise.all([
    prisma.supplier.findMany({
      where: { OR: [{ active: true }, { id: entry.supplierId }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.unit.findMany({
      where: { OR: [{ active: true }, { id: entry.unitId }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.rawMaterial.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  return (
    <>
      <PageHeader
        title={`Edit ${entry.entryNo}`}
        description="Correct the details of an entry that has not been inspected yet. Every change is recorded with the old value, new value, your name and the reason."
        crumbs={[
          { label: "Raw Materials" },
          { label: "Material entries", href: "/raw-materials/entries" },
          { label: entry.entryNo, href: `/raw-materials/entries/${id}` },
          { label: "Edit" },
        ]}
      />
      <EntryForm
        suppliers={suppliers}
        units={units}
        materialNames={[...new Set(materials.map((m) => m.name))]}
        defaultDate={toLocalDateTimeInput(entry.entryDate, settings.timezone)}
        timezone={settings.timezone}
        canUpload={false}
        maxMb={settings.maxUploadMb}
        canManageSuppliers={can(actor, "admin.masters")}
        initial={{
          id: entry.id,
          entryNo: entry.entryNo,
          entryDate: toLocalDateTimeInput(entry.entryDate, settings.timezone),
          materialName: entry.rawMaterial.name,
          supplierId: entry.supplierId,
          quantity: qtyString(entry.quantity),
          unitId: entry.unitId,
          poNumber: entry.poNumber ?? "",
          invoiceNumber: entry.invoiceNumber ?? "",
          notes: entry.notes ?? "",
        }}
      />
    </>
  );
}
