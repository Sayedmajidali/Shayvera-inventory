"use client";

import { Loader2, ReceiptText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FormError, NativeSelect } from "@/components/forms/field";
import { useIdempotencyKey, useSubmit } from "@/components/forms/use-submit";
import { recordSaleAction } from "../actions";

export function SaleDialog({
  stores,
  products,
  defaultDate,
}: {
  stores: { id: string; name: string }[];
  products: { id: string; label: string }[];
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [key, renew] = useIdempotencyKey();
  const { submit, pending, fieldErrors, error } = useSubmit(recordSaleAction, {
    onSuccess: () => {
      setOpen(false);
      renew();
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ReceiptText /> Record store sale
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(new FormData(e.currentTarget));
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Record store-reported sale</DialogTitle>
            <DialogDescription>
              Records sales reported by a marketplace for reconciliation. It does not change Shayvera stock — the goods already left with a
              dispatch.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="idempotencyKey" value={key} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sale date" htmlFor="sl-date" required error={fieldErrors.saleDate}>
              <Input id="sl-date" name="saleDate" type="datetime-local" defaultValue={defaultDate} required />
            </Field>
            <Field label="Store" htmlFor="sl-store" required error={fieldErrors.storeId}>
              <NativeSelect id="sl-store" name="storeId" required defaultValue="">
                <option value="" disabled>
                  Select store
                </option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Product" htmlFor="sl-product" required error={fieldErrors.productId} className="sm:col-span-2">
              <NativeSelect id="sl-product" name="productId" required defaultValue="">
                <option value="" disabled>
                  Select product
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Quantity sold" htmlFor="sl-q" required error={fieldErrors.quantity}>
              <Input id="sl-q" name="quantity" inputMode="decimal" required />
            </Field>
            <Field label="Report / settlement reference" htmlFor="sl-ref">
              <Input id="sl-ref" name="reference" maxLength={80} />
            </Field>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}Record sale
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
