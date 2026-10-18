import Link from "@/components/app/fast-link";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { setCategoryActiveAction } from "@/app/(app)/admin/actions";
import { AddCategoryForm } from "../master-lists";

export const metadata = { title: "Product categories" };

export default async function CategoriesPage() {
  await requirePage("admin.masters");
  const categories = await prisma.productCategory.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  return (
    <>
      <PageHeader
        title="Product categories"
        description="Group products for filtering and reports, e.g. Spices, Dry fruits, Makhana."
        crumbs={[{ label: "Master Data", href: "/masters" }, { label: "Categories" }]}
      />
      <SectionCard title={`${categories.length} categories`}>
        {categories.length === 0 ? (
          <EmptyState title="No categories yet" description="Add your first category below." />
        ) : (
          <ul className="divide-y">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-secondary/50"
              >
                <span className={c.active ? "" : "text-muted-foreground"}>
                  <span className="font-medium">{c.name}</span>{" "}
                  <Link href={`/products?categoryId=${c.id}`} className="text-xs text-muted-foreground hover:text-primary hover:underline">
                    · {c._count.products} products
                  </Link>
                </span>
                <span className="flex items-center gap-1">
                  {!c.active && <StatusBadge tone="muted">Inactive</StatusBadge>}
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="sm">
                        {c.active ? "Deactivate" : "Activate"}
                      </Button>
                    }
                    title={`${c.active ? "Deactivate" : "Activate"} ${c.name}?`}
                    description="Products keep their category; inactive categories can't be chosen for new products."
                    fields={{ id: c.id, active: String(!c.active) }}
                    action={setCategoryActiveAction}
                    destructive={c.active}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <AddCategoryForm />
      </SectionCard>
    </>
  );
}
