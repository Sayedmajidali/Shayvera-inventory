import Link from "@/components/app/fast-link";
import { ArrowRight, Boxes, FileUp, FlaskConical, Plus, Ruler, Store, Tags, Truck, type LucideIcon } from "lucide-react";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SupplierDialog } from "./suppliers/supplier-dialog";
import { StoreDialog } from "./stores/store-dialog";
import { MaterialDialog } from "./raw-materials/material-dialog";

export const metadata = { title: "Master data" };

function MasterCard({
  title,
  description,
  icon: Icon,
  tone,
  active,
  total,
  recent,
  href,
  add,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  active: number;
  total: number;
  recent: string[];
  href: string;
  add?: React.ReactNode;
}) {
  return (
    <article className="group flex flex-col rounded-2xl border bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex size-11 items-center justify-center rounded-xl ring-1", tone)}>
          <Icon className="size-5" />
        </span>
        <div className="text-right">
          <p className="font-display text-3xl leading-none font-extrabold tabular-nums">{active}</p>
          <p className="mt-1 text-xs text-muted-foreground">{active === total ? "active" : `active · ${total - active} inactive`}</p>
        </div>
      </div>
      <h2 className="mt-4 font-display text-lg font-extrabold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-3 min-h-6 text-xs text-muted-foreground">
        {recent.length > 0 ? (
          <>
            Latest: <span className="text-foreground">{recent.join(" · ")}</span>
          </>
        ) : (
          "None added yet"
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        {add}
        <Button variant="ghost" size="sm" asChild className="ml-auto">
          <Link href={href}>
            View all <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

const addButton = (label = "Add") => (
  <Button size="sm">
    <Plus /> {label}
  </Button>
);

export default async function MastersPage() {
  const actor = await requirePage(["admin.masters", "product.view", "ecom.view", "rm.view"]);
  const manage = can(actor, "admin.masters");

  const [products, materials, suppliers, stores, units, categories] = await Promise.all([
    Promise.all([
      prisma.readyProduct.count({ where: { deletedAt: null, active: true } }),
      prisma.readyProduct.count({ where: { deletedAt: null } }),
      prisma.readyProduct.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 3, select: { name: true } }),
    ]),
    Promise.all([
      prisma.rawMaterial.count({ where: { active: true } }),
      prisma.rawMaterial.count(),
      prisma.rawMaterial.findMany({ orderBy: { createdAt: "desc" }, take: 3, select: { name: true } }),
    ]),
    Promise.all([
      prisma.supplier.count({ where: { active: true } }),
      prisma.supplier.count(),
      prisma.supplier.findMany({ orderBy: { createdAt: "desc" }, take: 3, select: { name: true } }),
    ]),
    Promise.all([
      prisma.store.count({ where: { active: true } }),
      prisma.store.count(),
      prisma.store.findMany({ orderBy: { createdAt: "desc" }, take: 3, select: { name: true } }),
    ]),
    prisma.unit.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, code: true, active: true } }),
    prisma.productCategory.findMany({ orderBy: { createdAt: "desc" }, select: { name: true, active: true } }),
  ]);
  const names = (rows: { name: string }[]) => rows.map((r) => r.name);
  const activeUnits = units.filter((u) => u.active);

  const cards = [
    can(actor, "product.view") && (
      <MasterCard
        key="products"
        title="Products"
        description="Finished goods you sell, with SKU, low-stock threshold and expiry alert period."
        icon={Boxes}
        tone="bg-emerald-50 text-brand-green ring-emerald-100"
        active={products[0]}
        total={products[1]}
        recent={names(products[2])}
        href="/products"
        add={
          manage && (
            <Button size="sm" asChild>
              <Link href="/products/new">
                <Plus /> Add product
              </Link>
            </Button>
          )
        }
      />
    ),
    (manage || can(actor, "rm.view")) && (
      <MasterCard
        key="materials"
        title="Raw materials"
        description="Ingredients and packaging you buy; picked when recording incoming stock."
        icon={FlaskConical}
        tone="bg-lime-50 text-lime-700 ring-lime-100"
        active={materials[0]}
        total={materials[1]}
        recent={names(materials[2])}
        href="/masters/raw-materials"
        add={manage && <MaterialDialog units={activeUnits} trigger={addButton("Add material")} />}
      />
    ),
    manage && (
      <MasterCard
        key="suppliers"
        title="Suppliers"
        description="Who you buy raw materials from, with contact and GST details."
        icon={Truck}
        tone="bg-orange-50 text-brand-orange ring-orange-100"
        active={suppliers[0]}
        total={suppliers[1]}
        recent={names(suppliers[2])}
        href="/masters/suppliers"
        add={<SupplierDialog />}
      />
    ),
    can(actor, "ecom.view") && (
      <MasterCard
        key="stores"
        title="Stores"
        description="Marketplaces, online shops and warehouses you dispatch to."
        icon={Store}
        tone="bg-sky-50 text-sky-700 ring-sky-100"
        active={stores[0]}
        total={stores[1]}
        recent={names(stores[2])}
        href="/masters/stores"
        add={manage && <StoreDialog />}
      />
    ),
    manage && (
      <MasterCard
        key="units"
        title="Units"
        description="How quantities are measured, e.g. kg (decimals) and pieces (whole numbers)."
        icon={Ruler}
        tone="bg-slate-50 text-slate-700 ring-slate-100"
        active={activeUnits.length}
        total={units.length}
        recent={units.slice(-3).map((u) => u.code)}
        href="/masters/units"
      />
    ),
    manage && (
      <MasterCard
        key="categories"
        title="Product categories"
        description="Groups for products, e.g. Spices, Dry fruits, Makhana."
        icon={Tags}
        tone="bg-amber-50 text-amber-700 ring-amber-100"
        active={categories.filter((c) => c.active).length}
        total={categories.length}
        recent={names(categories.slice(0, 3))}
        href="/masters/categories"
      />
    ),
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Master data"
        description="Set up the lists everything else is built on. Add products, materials, suppliers and stores here once, then pick them in entries, dispatches and returns."
        crumbs={[{ label: "Master Data" }]}
      />
      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards}</div>
      {can(actor, "admin.import") && (
        <Link
          href="/admin/import"
          className="group mt-6 flex items-center gap-4 rounded-2xl border border-dashed bg-card/60 p-5 transition-all duration-200 hover:border-primary/40 hover:bg-card"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
            <FileUp className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block font-display text-lg font-extrabold">Import from a spreadsheet</span>
            <span className="block text-sm text-muted-foreground">
              Add many suppliers, stores or products at once from a CSV file. Every row is checked before anything is saved.
            </span>
          </span>
          <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </>
  );
}
