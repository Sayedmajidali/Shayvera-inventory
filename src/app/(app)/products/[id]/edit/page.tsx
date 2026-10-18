import { notFound } from "next/navigation";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { qtyString } from "@/lib/decimal";
import { ProductForm } from "../../product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("admin.masters");
  const { id } = await params;
  const [p, units, categories, txns] = await Promise.all([
    prisma.readyProduct.findUnique({ where: { id } }),
    prisma.unit.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, code: true } }),
    prisma.productCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.productTransaction.count({ where: { productId: id } }),
  ]);
  if (!p) notFound();
  return (
    <>
      <PageHeader
        title={`Edit ${p.name}`}
        crumbs={[
          { label: "Ready Products" },
          { label: "Product master", href: "/products" },
          { label: p.name, href: `/products/${p.id}` },
          { label: "Edit" },
        ]}
      />
      <ProductForm
        units={units}
        categories={categories}
        unitLocked={txns > 0}
        initial={{
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode ?? "",
          categoryId: p.categoryId ?? "",
          unitId: p.unitId,
          lowStockThreshold: qtyString(p.lowStockThreshold),
          expiryAlertDays: String(p.expiryAlertDays),
          tracksExpiry: p.tracksExpiry,
          description: p.description ?? "",
        }}
      />
    </>
  );
}
