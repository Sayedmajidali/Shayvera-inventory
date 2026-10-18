"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError } from "@/components/forms/field";
import { useSubmit } from "@/components/forms/use-submit";
import { saveSupplierAction } from "../actions";

export interface SupplierValues {
  id?: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  gstNumber: string;
}

export function SupplierDialog({ supplier }: { supplier?: SupplierValues }) {
  const [open, setOpen] = useState(false);
  const { submit, pending, fieldErrors, error } = useSubmit(saveSupplierAction, { onSuccess: () => setOpen(false) });
  const s = supplier;
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        {s ? (
          <Button variant="ghost" size="sm">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button>
            <Plus /> New supplier
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
            <DialogTitle>{s ? `Edit ${s.name}` : "New supplier"}</DialogTitle>
            <DialogDescription>Suppliers appear in the raw material entry form.</DialogDescription>
          </DialogHeader>
          {s?.id && <input type="hidden" name="id" value={s.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplier name" htmlFor="sp-name" required error={fieldErrors.name} className="sm:col-span-2">
              <Input id="sp-name" name="name" defaultValue={s?.name} required maxLength={150} />
            </Field>
            <Field label="Contact person" htmlFor="sp-cp">
              <Input id="sp-cp" name="contactPerson" defaultValue={s?.contactPerson} maxLength={100} />
            </Field>
            <Field label="Phone" htmlFor="sp-ph">
              <Input id="sp-ph" name="phone" defaultValue={s?.phone} maxLength={40} />
            </Field>
            <Field label="Email" htmlFor="sp-em" error={fieldErrors.email}>
              <Input id="sp-em" name="email" type="email" defaultValue={s?.email} />
            </Field>
            <Field label="GST / tax number" htmlFor="sp-gst">
              <Input id="sp-gst" name="gstNumber" defaultValue={s?.gstNumber} maxLength={30} />
            </Field>
            <Field label="Address" htmlFor="sp-ad" className="sm:col-span-2">
              <Textarea id="sp-ad" name="address" defaultValue={s?.address} rows={2} maxLength={500} />
            </Field>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}Save supplier
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
