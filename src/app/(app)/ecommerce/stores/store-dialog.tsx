"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError } from "@/components/forms/field";
import { useSubmit } from "@/components/forms/use-submit";
import { saveStoreAction } from "../actions";

export interface StoreValues {
  id?: string;
  name: string;
  code: string;
  storeType: string;
  contact: string;
  notes: string;
}

export function StoreDialog({ store }: { store?: StoreValues }) {
  const [open, setOpen] = useState(false);
  const { submit, pending, fieldErrors, error } = useSubmit(saveStoreAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        {store ? (
          <Button variant="ghost" size="sm">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button>
            <Plus /> New store
          </Button>
        )}
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
            <DialogTitle>{store ? `Edit ${store.name}` : "New store"}</DialogTitle>
            <DialogDescription>Marketplaces, online shops or external warehouses that receive dispatches.</DialogDescription>
          </DialogHeader>
          {store?.id && <input type="hidden" name="id" value={store.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Store name" htmlFor="s-name" required error={fieldErrors.name} className="sm:col-span-2">
              <Input id="s-name" name="name" defaultValue={store?.name} required maxLength={150} />
            </Field>
            <Field label="Store code" htmlFor="s-code" error={fieldErrors.code} hint="Auto-generated if empty">
              <Input id="s-code" name="code" defaultValue={store?.code} maxLength={20} className="uppercase" />
            </Field>
            <Field label="Store type / marketplace" htmlFor="s-type" required error={fieldErrors.storeType}>
              <Input id="s-type" name="storeType" defaultValue={store?.storeType} list="store-types" required maxLength={60} />
              <datalist id="store-types">
                <option value="Marketplace" />
                <option value="Online shop" />
                <option value="External warehouse" />
                <option value="Retail partner" />
              </datalist>
            </Field>
            <Field label="Contact details" htmlFor="s-contact" className="sm:col-span-2">
              <Input id="s-contact" name="contact" defaultValue={store?.contact} maxLength={300} />
            </Field>
            <Field label="Notes" htmlFor="s-notes" className="sm:col-span-2">
              <Textarea id="s-notes" name="notes" defaultValue={store?.notes} rows={2} maxLength={1000} />
            </Field>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}Save store
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
