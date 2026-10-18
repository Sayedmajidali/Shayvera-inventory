"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, NativeSelect } from "@/components/forms/field";
import { FileInput } from "@/components/forms/file-input";
import { useIdempotencyKey, useSubmit } from "@/components/forms/use-submit";
import { createReturnAction } from "../../actions";

interface LineInfo {
  id: string;
  product: string;
  sku: string;
  unit: string;
  sent: string;
  returnable: string;
  batches: string;
}

const CONDITIONS = [
  { value: "SALEABLE", label: "Saleable — restock" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "EXPIRED", label: "Expired" },
  { value: "PENDING_INSPECTION", label: "Pending inspection — quarantine" },
];

export function ReturnForm({
  dispatchId,
  lines,
  defaultDate,
  timezone,
  canUpload,
  maxMb,
}: {
  dispatchId: string;
  lines: LineInfo[];
  defaultDate: string;
  timezone: string;
  canUpload: boolean;
  maxMb: number;
}) {
  const [key] = useIdempotencyKey();
  const [values, setValues] = useState<Record<string, { quantity: string; condition: string; notes: string }>>(
    Object.fromEntries(lines.map((l) => [l.id, { quantity: "", condition: "SALEABLE", notes: "" }])),
  );
  const { submit, pending, fieldErrors, error } = useSubmit(createReturnAction, {
    redirectTo: (d) => (d ? `/ecommerce/returns/${d.id}` : undefined),
  });

  const chosen = lines.filter((l) => values[l.id].quantity.trim());
  const problem = (l: LineInfo) => {
    const q = Number(values[l.id].quantity);
    if (!values[l.id].quantity.trim()) return undefined;
    if (!(q > 0)) return "Enter a quantity greater than zero";
    if (q > Number(l.returnable)) return `At most ${l.returnable} can be returned`;
    return undefined;
  };
  const invalid = chosen.length === 0 || lines.some((l) => problem(l));

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("lines", JSON.stringify(chosen.map((l) => ({ dispatchLineId: l.id, ...values[l.id] }))));
        void submit(fd);
      }}
      noValidate
    >
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="dispatchId" value={dispatchId} />
      <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Return date and time" htmlFor="returnDate" required error={fieldErrors.returnDate} hint={`Time zone: ${timezone}`}>
            <Input id="returnDate" name="returnDate" type="datetime-local" defaultValue={defaultDate} required />
          </Field>
          <Field label="Return reason" htmlFor="reason" required error={fieldErrors.reason}>
            <Input id="reason" name="reason" list="reasons" required maxLength={500} />
            <datalist id="reasons">
              <option value="Customer return" />
              <option value="Damaged in transit" />
              <option value="Unsold stock recalled" />
              <option value="Near expiry recall" />
              <option value="Wrong item shipped" />
            </datalist>
          </Field>
          {canUpload && (
            <Field label="Return document" hint="Optional">
              <FileInput name="document" maxMb={maxMb} />
            </Field>
          )}
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={2} maxLength={1000} />
          </Field>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Returned products</h2>
          <p className="text-xs text-muted-foreground">Fill in only the products that came back.</p>
        </div>
        <div className="divide-y">
          {lines.map((l, i) => {
            const p = problem(l) ?? fieldErrors[`lines.${i}.quantity`];
            const none = Number(l.returnable) <= 0;
            return (
              <div key={l.id} className="grid gap-3 px-4 py-4 md:grid-cols-12 md:items-start">
                <div className="md:col-span-4">
                  <p className="font-medium">{l.product}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.sku} · sent {l.sent} {l.unit} · returnable <strong>{l.returnable}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground">Batches: {l.batches}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Qty returned</label>
                  <Input
                    inputMode="decimal"
                    disabled={none}
                    value={values[l.id].quantity}
                    onChange={(e) => setValues((v) => ({ ...v, [l.id]: { ...v[l.id], quantity: e.target.value } }))}
                    aria-invalid={!!p}
                  />
                  {p && <p className="mt-1 text-xs text-destructive">{p}</p>}
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Condition</label>
                  <NativeSelect
                    disabled={none}
                    value={values[l.id].condition}
                    onChange={(e) => setValues((v) => ({ ...v, [l.id]: { ...v[l.id], condition: e.target.value } }))}
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Line notes</label>
                  <Input
                    disabled={none}
                    value={values[l.id].notes}
                    maxLength={500}
                    onChange={(e) => setValues((v) => ({ ...v, [l.id]: { ...v[l.id], notes: e.target.value } }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" asChild>
          <Link href="/ecommerce/returns">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending || invalid}>
          {pending && <Loader2 className="animate-spin" />}Record return
        </Button>
      </div>
    </form>
  );
}
