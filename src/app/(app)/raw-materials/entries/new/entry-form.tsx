"use client";

import Link from "@/components/app/fast-link";
import { Loader2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, NativeSelect } from "@/components/forms/field";
import { FileInput } from "@/components/forms/file-input";
import { useIdempotencyKey, useSubmit } from "@/components/forms/use-submit";
import { createEntryAction, updateEntryAction } from "../../actions";

export interface EntryValues {
  id: string;
  entryNo: string;
  entryDate: string;
  materialName: string;
  supplierId: string;
  quantity: string;
  unitId: string;
  poNumber: string;
  invoiceNumber: string;
  notes: string;
}

export function EntryForm({
  suppliers,
  units,
  materialNames,
  defaultDate,
  timezone,
  canUpload,
  maxMb,
  canManageSuppliers,
  initial,
}: {
  suppliers: { id: string; name: string; code: string }[];
  units: { id: string; code: string; name: string }[];
  materialNames: string[];
  defaultDate: string;
  timezone: string;
  canUpload: boolean;
  maxMb: number;
  canManageSuppliers: boolean;
  /** When set, the form edits this pending entry instead of creating one. */
  initial?: EntryValues;
}) {
  const editing = !!initial;
  const formRef = useRef<HTMLFormElement>(null);
  const [key] = useIdempotencyKey();
  const { submit, pending, fieldErrors, error } = useSubmit(editing ? updateEntryAction : createEntryAction, {
    redirectTo: (d) => (d ? `/raw-materials/entries/${d.id}` : undefined),
  });

  return (
    <form
      ref={formRef}
      className="max-w-3xl space-y-6 rounded-xl border bg-card p-5 shadow-xs sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(new FormData(e.currentTarget));
      }}
      noValidate
    >
      {editing ? <input type="hidden" name="entryId" value={initial.id} /> : <input type="hidden" name="idempotencyKey" value={key} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Entry date and time" htmlFor="entryDate" required error={fieldErrors.entryDate} hint={`Time zone: ${timezone}`}>
          <Input
            id="entryDate"
            name="entryDate"
            type="datetime-local"
            defaultValue={initial?.entryDate ?? defaultDate}
            required
            aria-invalid={!!fieldErrors.entryDate}
          />
        </Field>
        <Field
          label="Supplier"
          htmlFor="supplierId"
          required
          error={fieldErrors.supplierId}
          hint={
            suppliers.length === 0 ? (
              canManageSuppliers ? (
                <Link className="text-primary underline" href="/admin/suppliers">
                  Add a supplier first
                </Link>
              ) : (
                "Ask an administrator to add suppliers"
              )
            ) : undefined
          }
        >
          <NativeSelect
            id="supplierId"
            name="supplierId"
            required
            defaultValue={initial?.supplierId ?? ""}
            aria-invalid={!!fieldErrors.supplierId}
          >
            <option value="" disabled>
              Select supplier
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Product name"
          htmlFor="materialName"
          required
          error={fieldErrors.materialName}
          hint="Pick an existing material or type a new one"
          className="sm:col-span-2"
        >
          <Input
            id="materialName"
            name="materialName"
            list="material-names"
            defaultValue={initial?.materialName}
            required
            maxLength={150}
            aria-invalid={!!fieldErrors.materialName}
            autoComplete="off"
          />
          <datalist id="material-names">
            {materialNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Quantity"
          htmlFor="quantity"
          required
          error={fieldErrors.quantity}
          hint="kg allows up to 3 decimals; pieces must be whole numbers"
        >
          <Input
            id="quantity"
            name="quantity"
            inputMode="decimal"
            defaultValue={initial?.quantity}
            required
            aria-invalid={!!fieldErrors.quantity}
            placeholder="0"
          />
        </Field>
        <Field label="Unit of measurement" htmlFor="unitId" required error={fieldErrors.unitId}>
          <NativeSelect id="unitId" name="unitId" required defaultValue={initial?.unitId ?? units[0]?.id ?? ""}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="PO number" htmlFor="poNumber" error={fieldErrors.poNumber}>
          <Input id="poNumber" name="poNumber" defaultValue={initial?.poNumber} maxLength={60} />
        </Field>
        <Field
          label="Invoice number"
          htmlFor="invoiceNumber"
          error={fieldErrors.invoiceNumber}
          hint="Enter a PO number, an invoice number, or both"
        >
          <Input
            id="invoiceNumber"
            name="invoiceNumber"
            defaultValue={initial?.invoiceNumber}
            maxLength={60}
            aria-invalid={!!fieldErrors.invoiceNumber}
          />
        </Field>
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
          <Textarea id="notes" name="notes" defaultValue={initial?.notes} rows={3} maxLength={1000} />
        </Field>
        {editing && (
          <Field
            label="Reason for the change"
            htmlFor="reason"
            required
            error={fieldErrors.reason}
            className="sm:col-span-2"
            hint="Recorded in the entry's history with the old and new values."
          >
            <Textarea id="reason" name="reason" rows={2} maxLength={1000} required aria-invalid={!!fieldErrors.reason} />
          </Field>
        )}
        {canUpload && !editing && (
          <Field
            label="Bill / invoice attachment"
            error={fieldErrors.file}
            className="sm:col-span-2"
            hint="Optional. You can also upload it later from Bill Entries."
          >
            <FileInput name="bill" maxMb={maxMb} invalid={!!fieldErrors.file} />
          </Field>
        )}
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <p className="text-xs text-muted-foreground">
          {editing ? (
            <>Only entries pending inspection can be edited. Bills are managed on the entry page.</>
          ) : (
            <>
              Entered by you · Status will be <strong>Pending inspection</strong>
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href={editing ? `/raw-materials/entries/${initial.id}` : "/raw-materials/entries"}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {editing ? "Save changes" : "Save entry"}
          </Button>
        </div>
      </div>
    </form>
  );
}
