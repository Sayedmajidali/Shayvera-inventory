import Link from "@/components/app/fast-link";
import { ArrowRight, Database, FileUp } from "lucide-react";
import { requirePage } from "@/server/auth";
import { can } from "@/server/permissions";
import { ALLOWED_FILE_TYPES, getSettings, PLATFORM_UPLOAD_CAP_MB } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { DATE_FORMATS, formatDate } from "@/lib/dates";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requirePage(["admin.settings", "admin.masters"]);
  const settings = await getSettings();
  const timezones = Intl.supportedValuesOf("timeZone");
  return (
    <>
      <PageHeader title="Settings" description="Business preferences." crumbs={[{ label: "Administration" }, { label: "Settings" }]} />
      <div className="grid gap-6 xl:grid-cols-3">
        {can(actor, "admin.settings") && (
          <SectionCard title="Business settings" className="xl:col-span-2">
            <SettingsForm
              values={settings}
              timezones={timezones.includes(settings.timezone) ? timezones : [settings.timezone, ...timezones]}
              dateFormats={DATE_FORMATS.map((f) => ({ value: f, example: `${formatDate(new Date(), settings.timezone, f)}  (${f})` }))}
              fileTypes={Object.entries(ALLOWED_FILE_TYPES).map(([value, label]) => ({ value, label }))}
              uploadCapMb={PLATFORM_UPLOAD_CAP_MB}
            />
          </SectionCard>
        )}
        <div className="space-y-3">
          {can(actor, "admin.masters") && (
            <Link
              href="/masters"
              className="group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <Database className="size-5 text-primary" />
              <span className="flex-1">
                <span className="block font-medium">Master Data</span>
                <span className="block text-sm text-muted-foreground">
                  Products, raw materials, suppliers, stores, units and categories
                </span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
          {can(actor, "admin.import") && (
            <Link
              href="/admin/import"
              className="group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <FileUp className="size-5 text-primary" />
              <span className="flex-1">
                <span className="block font-medium">CSV import</span>
                <span className="block text-sm text-muted-foreground">Bulk-add suppliers, stores and products</span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
