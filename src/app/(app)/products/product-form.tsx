"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, NativeSelect } from "@/components/forms/field";
import { FileInput } from "@/components/forms/file-input";
import { useSubmit } from "@/components/forms/use-submit";
import { createProductAction, updateProductAction } from "./actions";

export interface ProductFormValues {
  id?: string;
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  unitId: string;
  lowStockThreshold: string;
  expiryAlertDays: string;
  tracksExpiry: boolean;
  description: string;
}

export function ProductForm({
  initial,
  units,
  categories,
  unitLocked,
}: {
  initial?: ProductFormValues;
  units: { id: string; code: string }[];
  categories: { id: string; name: string }[];
  unitLocked?: boolean;
}) {
  const editing = !!initial?.id;
  const [tracksExpiry, setTracksExpiry] = useState(initial?.tracksExpiry ?? true);
  const { submit, pending, fieldErrors, error } = useSubmit(editing ? updateProductAction : createProductAction, {
    redirectTo: (d) => (d ? `/products/${d.id}` : undefined),
  });
  const v = initial;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("tracksExpiry", String(tracksExpiry));
        void submit(fd);
      }}
      className="max-w-3xl space-y-6 rounded-xl border bg-card p-5 shadow-xs sm:p-6"
      noValidate
    >
      {editing && <input type="hidden" name="id" value={v!.id} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Product name" htmlFor="name" required error={fieldErrors.name} className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={v?.name} required maxLength={150} />
        </Field>
        <Field label="SKU / product code" htmlFor="sku" required error={fieldErrors.sku} hint="Must be unique. Stored in capitals.">
          <Input id="sku" name="sku" defaultValue={v?.sku} required maxLength={40} className="uppercase" />
        </Field>
        <Field label="Barcode" htmlFor="barcode" error={fieldErrors.barcode}>
          <Input id="barcode" name="barcode" defaultValue={v?.barcode} maxLength={64} />
        </Field>
        <Field label="Category" htmlFor="categoryId" error={fieldErrors.categoryId}>
          <NativeSelect id="categoryId" name="categoryId" defaultValue={v?.categoryId ?? ""}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Unit of measurement"
          htmlFor="unitId"
          required
          error={fieldErrors.unitId}
          hint={unitLocked ? "Locked once stock has been posted" : undefined}
        >
          <NativeSelect
            id="unitId"
            name="unitId"
            defaultValue={v?.unitId ?? units.find((u) => u.code === "pieces")?.id ?? units[0]?.id}
            disabled={unitLocked}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code}
              </option>
            ))}
          </NativeSelect>
          {unitLocked && <input type="hidden" name="unitId" value={v?.unitId} />}
        </Field>
        <Field
          label="Low-stock threshold"
          htmlFor="lowStockThreshold"
          required
          error={fieldErrors.lowStockThreshold}
          hint="Alert when available stock is at or below this. 0 turns the alert off."
        >
          <Input id="lowStockThreshold" name="lowStockThreshold" inputMode="decimal" defaultValue={v?.lowStockThreshold ?? "0"} required />
        </Field>
        <div className="space-y-3 sm:col-span-2">
          <div className="flex items-center gap-2">
            <Checkbox id="tracksExpiry" checked={tracksExpiry} onCheckedChange={(c) => setTracksExpiry(c === true)} />
            <Label htmlFor="tracksExpiry">Track expiry dates per batch</Label>
          </div>
        </div>
        {tracksExpiry ? (
          <Field
            label="Expiry alert period (days)"
            htmlFor="expiryAlertDays"
            required
            error={fieldErrors.expiryAlertDays}
            hint="Warn this many days before a batch expires"
          >
            <Input id="expiryAlertDays" name="expiryAlertDays" inputMode="numeric" defaultValue={v?.expiryAlertDays ?? "30"} required />
          </Field>
        ) : (
          <input type="hidden" name="expiryAlertDays" value={v?.expiryAlertDays ?? "0"} />
        )}
        <Field label="Product image" error={fieldErrors.file} hint="Optional. JPG, PNG or WEBP.">
          <FileInput name="image" accept="image/jpeg,image/png,image/webp" hint="JPG, PNG or WEBP" />
        </Field>
        <Field label="Description" htmlFor="description" className="sm:col-span-2">
          <Textarea id="description" name="description" rows={3} defaultValue={v?.description} maxLength={2000} />
        </Field>

        {editing && (
          <Field
            label="Note for this change"
            htmlFor="changeReason"
            className="sm:col-span-2"
            hint="Optional. Saved in the product's change history with the old and new values."
          >
            <Input id="changeReason" name="changeReason" maxLength={1000} />
          </Field>
        )}
        {!editing && (
          <fieldset className="space-y-4 rounded-lg border border-dashed p-4 sm:col-span-2">
            <legend className="px-1 text-sm font-medium">Opening stock (optional)</legend>
            <p className="text-xs text-muted-foreground">Posted as an auditable opening-stock transaction in its own batch.</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Opening quantity" htmlFor="openingQty" error={fieldErrors.openingQty}>
                <Input id="openingQty" name="openingQty" inputMode="decimal" placeholder="0" />
              </Field>
              <Field label="Batch number" htmlFor="openingBatchNo" hint="Auto-generated if empty">
                <Input id="openingBatchNo" name="openingBatchNo" maxLength={40} />
              </Field>
              {tracksExpiry && (
                <Field label="Batch expiry date" htmlFor="openingExpiryDate" error={fieldErrors.openingExpiryDate}>
                  <Input id="openingExpiryDate" name="openingExpiryDate" type="date" />
                </Field>
              )}
            </div>
          </fieldset>
        )}
      </div>
      <FormError message={error} />
      <div className="flex justify-end gap-2 border-t pt-5">
        <Button variant="outline" type="button" asChild>
          <Link href={editing ? `/products/${v!.id}` : "/products"}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {editing ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
