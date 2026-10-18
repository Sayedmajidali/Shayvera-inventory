import { requirePage } from "@/server/auth";
import { IMPORT_KINDS } from "@/server/services/importer";
import { PageHeader } from "@/components/app/page-header";
import { ImportForm } from "./import-form";

export const metadata = { title: "CSV import" };

export default async function ImportPage() {
  await requirePage("admin.import");
  return (
    <>
      <PageHeader
        title="CSV import"
        description="Every row is validated first. If any row is invalid, nothing is imported. Products whose SKU already exists are rejected, so opening stock is never posted twice."
        crumbs={[{ label: "Administration" }, { label: "Settings", href: "/admin/settings" }, { label: "CSV import" }]}
      />
      <ImportForm kinds={Object.entries(IMPORT_KINDS).map(([value, k]) => ({ value, label: k.label, columns: [...k.columns] }))} />
    </>
  );
}
