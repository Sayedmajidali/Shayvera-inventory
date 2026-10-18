import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { ProductForm } from "../product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requirePage("admin.masters");
  const [units, categories] = await Promise.all([
    prisma.unit.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, code: true } }),
    prisma.productCategory.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader
        title="New product"
        crumbs={[{ label: "Master Data", href: "/masters" }, { label: "Products", href: "/products" }, { label: "New" }]}
      />
      <ProductForm units={units} categories={categories} />
    </>
  );
}
