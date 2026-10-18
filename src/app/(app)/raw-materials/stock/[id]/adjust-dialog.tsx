"use client";

import { Loader2, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError } from "@/components/forms/field";
import { useIdempotencyKey, useSubmit } from "@/components/forms/use-submit";
import { adjustRawAction } from "../../actions";

export function RawAdjustDialog({ materialId, unit }: { materialId: string; unit: string }) {
  const [open, setOpen] = useState(false);
  const [key, renew] = useIdempotencyKey();
  const { submit, pending, fieldErrors, error } = useSubmit(adjustRawAction, {
    onSuccess: () => {
      setOpen(false);
      renew();
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal /> Adjust stock
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
            <DialogTitle>Inventory correction</DialogTitle>
            <DialogDescription>Posts an auditable adjustment transaction. Use a negative number to reduce stock.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="idempotencyKey" value={key} />
          <input type="hidden" name="rawMaterialId" value={materialId} />
          <Field label={`Quantity change (${unit})`} htmlFor="adj-q" required error={fieldErrors.quantity}>
            <Input id="adj-q" name="quantity" inputMode="decimal" placeholder="e.g. -2.5" required />
          </Field>
          <Field label="Reason" htmlFor="adj-r" required error={fieldErrors.reason}>
            <Textarea id="adj-r" name="reason" rows={3} required maxLength={1000} />
          </Field>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}Post adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
