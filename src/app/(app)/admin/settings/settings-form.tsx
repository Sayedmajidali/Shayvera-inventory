"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FormError, NativeSelect } from "@/components/forms/field";
import { useSubmit } from "@/components/forms/use-submit";
import { saveSettingsAction } from "../actions";

export function SettingsForm({
  values,
  timezones,
  dateFormats,
  fileTypes,
}: {
  values: {
    businessName: string;
    timezone: string;
    dateFormat: string;
    maxUploadMb: number;
    allowedFileTypes: string[];
    allowExpiredDispatchByAdmin: boolean;
  };
  timezones: string[];
  dateFormats: { value: string; example: string }[];
  fileTypes: { value: string; label: string }[];
}) {
  const [types, setTypes] = useState(new Set(values.allowedFileTypes));
  const [allowExpired, setAllowExpired] = useState(values.allowExpiredDispatchByAdmin);
  const { submit, pending, fieldErrors, error } = useSubmit(saveSettingsAction);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.delete("allowedFileTypes");
        for (const t of types) fd.append("allowedFileTypes", t);
        fd.set("allowExpiredDispatchByAdmin", String(allowExpired));
        void submit(fd);
      }}
      className="space-y-5 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" htmlFor="st-name" required error={fieldErrors.businessName}>
          <Input id="st-name" name="businessName" defaultValue={values.businessName} required />
        </Field>
        <Field
          label="Time zone"
          htmlFor="st-tz"
          required
          error={fieldErrors.timezone}
          hint="Used for all dates, 'today', report ranges and expiry checks"
        >
          <NativeSelect id="st-tz" name="timezone" defaultValue={values.timezone}>
            {timezones.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Date format" htmlFor="st-df" required>
          <NativeSelect id="st-df" name="dateFormat" defaultValue={values.dateFormat}>
            {dateFormats.map((d) => (
              <option key={d.value} value={d.value}>
                {d.example}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Maximum upload size (MB)" htmlFor="st-mb" required error={fieldErrors.maxUploadMb}>
          <Input id="st-mb" name="maxUploadMb" type="number" min={1} max={25} defaultValue={values.maxUploadMb} required />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Permitted bill / document file types</legend>
        <div className="flex flex-wrap gap-4">
          {fileTypes.map((t) => (
            <div key={t.value} className="flex items-center gap-2">
              <Checkbox
                id={`ft-${t.value}`}
                checked={types.has(t.value)}
                onCheckedChange={(c) =>
                  setTypes((s) => {
                    const n = new Set(s);
                    if (c === true) n.add(t.value);
                    else n.delete(t.value);
                    return n;
                  })
                }
              />
              <Label htmlFor={`ft-${t.value}`} className="font-normal">
                {t.label}
              </Label>
            </div>
          ))}
        </div>
        {fieldErrors.allowedFileTypes && <p className="text-xs text-destructive">Select at least one file type</p>}
      </fieldset>
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
        <Checkbox id="st-exp" checked={allowExpired} onCheckedChange={(c) => setAllowExpired(c === true)} />
        <Label htmlFor="st-exp" className="leading-snug font-normal">
          Exception policy: allow administrators to dispatch batches that have already expired. Off by default; every such dispatch is in
          the audit log.
        </Label>
      </div>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}Save settings
        </Button>
      </div>
    </form>
  );
}
