import Link from "next/link";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { can } from "@/server/permissions";
import { ALLOWED_FILE_TYPES, getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { DATE_FORMATS, formatDate } from "@/lib/dates";
import { setCategoryActiveAction, setUnitActiveAction } from "../actions";
import { SettingsForm } from "./settings-form";
import { AddCategoryForm, AddUnitForm } from "./master-lists";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requirePage(["admin.settings", "admin.masters"]);
  const settings = await getSettings();
  const [units, categories] = await Promise.all([
    prisma.unit.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { products: true, rawMaterials: true } } } }),
    prisma.productCategory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } }),
  ]);
  const timezones = Intl.supportedValuesOf("timeZone");
  return (
    <>
      <PageHeader
        title="Settings"
        description="Business preferences and master lists."
        crumbs={[{ label: "Administration" }, { label: "Settings" }]}
        actions={
          can(actor, "admin.import") && (
            <Button variant="outline" asChild>
              <Link href="/admin/import">CSV import</Link>
            </Button>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        {can(actor, "admin.settings") && (
          <SectionCard title="Business settings" className="xl:col-span-2">
            <SettingsForm
              values={settings}
              timezones={timezones.includes(settings.timezone) ? timezones : [settings.timezone, ...timezones]}
              dateFormats={DATE_FORMATS.map((f) => ({ value: f, example: `${formatDate(new Date(), settings.timezone, f)}  (${f})` }))}
              fileTypes={Object.entries(ALLOWED_FILE_TYPES).map(([value, label]) => ({ value, label }))}
            />
          </SectionCard>
        )}
        {can(actor, "admin.masters") && (
          <div className="space-y-6">
            <SectionCard title="Units of measurement" description="Units in use cannot be removed, only deactivated.">
              <ul className="divide-y">
                {units.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span>
                      <span className="font-medium">{u.code}</span> · {u.name}{" "}
                      {u.allowsDecimal ? (
                        <span className="text-xs text-muted-foreground">(decimals)</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">(whole numbers)</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      {!u.active && <StatusBadge tone="muted">Inactive</StatusBadge>}
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="sm">
                            {u.active ? "Deactivate" : "Activate"}
                          </Button>
                        }
                        title={`${u.active ? "Deactivate" : "Activate"} ${u.code}?`}
                        description={
                          u.active
                            ? "Existing stock in this unit is unaffected; it just cannot be chosen for new records."
                            : "The unit can be chosen again."
                        }
                        fields={{ id: u.id, active: String(!u.active) }}
                        action={setUnitActiveAction}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              <AddUnitForm />
            </SectionCard>
            <SectionCard title="Product categories">
              {categories.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">No categories yet.</p>
              ) : (
                <ul className="divide-y">
                  {categories.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span>
                        {c.name} <span className="text-xs text-muted-foreground">· {c._count.products} products</span>
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
                          description="Products keep their category."
                          fields={{ id: c.id, active: String(!c.active) }}
                          action={setCategoryActiveAction}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <AddCategoryForm />
            </SectionCard>
          </div>
        )}
      </div>
    </>
  );
}
