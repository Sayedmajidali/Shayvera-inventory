"use client";

import { Loader2, PackagePlus, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, NativeSelect } from "@/components/forms/field";
import { useIdempotencyKey, useSubmit } from "@/components/forms/use-submit";
import type { ActionResult } from "@/server/action";
import { adjustStockAction, disposeAction, receiveStockAction } from "../actions";

export interface BatchOption {
  id: string;
  batchNo: string;
  expiry: string | null;
  saleable: string;
  quarantine: string;
  damaged: string;
  expired: string;
  isExpired: boolean;
}

function StockDialog({
  trigger,
  title,
  description,
  action,
  submitLabel,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  submitLabel: string;
  children: (errors: Record<string, string>) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [key, renew] = useIdempotencyKey();
  const { submit, pending, fieldErrors, error } = useSubmit(action, {
    onSuccess: () => {
      setOpen(false);
      renew();
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(new FormData(e.currentTarget));
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="idempotencyKey" value={key} />
          {children(fieldErrors)}
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReceiveDialog({
  productId,
  unit,
  tracksExpiry,
  today,
}: {
  productId: string;
  unit: string;
  tracksExpiry: boolean;
  today: string;
}) {
  return (
    <StockDialog
      trigger={
        <Button>
          <PackagePlus /> Receive stock
        </Button>
      }
      title="Receive stock"
      description="Adds a new batch (or tops up an existing batch number with the same expiry) as a saleable stock receipt."
      action={receiveStockAction}
      submitLabel="Post receipt"
    >
      {(e) => (
        <>
          <input type="hidden" name="productId" value={productId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Batch number" htmlFor="r-batch" hint="Auto-generated if empty" error={e.batchNo}>
              <Input id="r-batch" name="batchNo" maxLength={40} />
            </Field>
            <Field label={`Quantity (${unit})`} htmlFor="r-qty" required error={e.quantity}>
              <Input id="r-qty" name="quantity" inputMode="decimal" required />
            </Field>
            <Field label="Received / manufactured date" htmlFor="r-date" required error={e.receivedDate}>
              <Input id="r-date" name="receivedDate" type="date" defaultValue={today} max={today} required />
            </Field>
            {tracksExpiry && (
              <Field label="Expiry date" htmlFor="r-exp" required error={e.expiryDate}>
                <Input id="r-exp" name="expiryDate" type="date" required />
              </Field>
            )}
          </div>
          <Field label="Notes" htmlFor="r-notes">
            <Textarea id="r-notes" name="notes" rows={2} maxLength={1000} />
          </Field>
        </>
      )}
    </StockDialog>
  );
}

export function AdjustDialog({ productId, unit, batches }: { productId: string; unit: string; batches: BatchOption[] }) {
  return (
    <StockDialog
      trigger={
        <Button variant="outline" disabled={batches.length === 0}>
          <SlidersHorizontal /> Adjust
        </Button>
      }
      title="Inventory correction"
      description="Posts an auditable adjustment to one batch and stock bucket. Use a negative number to remove stock. A reason is required."
      action={adjustStockAction}
      submitLabel="Post adjustment"
    >
      {(e) => (
        <>
          <input type="hidden" name="productId" value={productId} />
          <Field label="Batch" htmlFor="a-batch" required error={e.batchId}>
            <NativeSelect id="a-batch" name="batchId" required>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchNo}
                  {b.expiry ? ` · exp ${b.expiry}` : ""} · saleable {b.saleable}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stock bucket" htmlFor="a-bucket" required>
              <NativeSelect id="a-bucket" name="bucket" defaultValue="SALEABLE">
                <option value="SALEABLE">Saleable</option>
                <option value="QUARANTINE">Quarantine</option>
                <option value="DAMAGED">Damaged</option>
                <option value="EXPIRED">Expired</option>
              </NativeSelect>
            </Field>
            <Field label={`Change (${unit})`} htmlFor="a-q" required error={e.quantityDelta}>
              <Input id="a-q" name="quantityDelta" inputMode="decimal" placeholder="e.g. -3" required />
            </Field>
          </div>
          <Field label="Reason" htmlFor="a-r" required error={e.reason}>
            <Textarea id="a-r" name="reason" rows={3} required maxLength={1000} />
          </Field>
        </>
      )}
    </StockDialog>
  );
}

export function DisposeDialog({ unit, batches }: { unit: string; batches: BatchOption[] }) {
  const quarantined = batches.filter((b) => Number(b.quarantine) > 0);
  if (quarantined.length === 0) return null;
  return (
    <StockDialog
      trigger={
        <Button variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50">
          <ShieldCheck /> Decide quarantine
        </Button>
      }
      title="Quarantined returns"
      description="Move returned goods awaiting inspection to saleable, damaged or expired stock."
      action={disposeAction}
      submitLabel="Post decision"
    >
      {(e) => (
        <>
          <Field label="Batch" htmlFor="d-batch" required error={e.batchId}>
            <NativeSelect id="d-batch" name="batchId" required>
              {quarantined.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchNo} · {b.quarantine} {unit} in quarantine{b.isExpired ? " · expired" : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Move to" htmlFor="d-to" required error={e.toBucket}>
              <NativeSelect id="d-to" name="toBucket" defaultValue="SALEABLE">
                <option value="SALEABLE">Saleable (restock)</option>
                <option value="DAMAGED">Damaged</option>
                <option value="EXPIRED">Expired</option>
              </NativeSelect>
            </Field>
            <Field label={`Quantity (${unit})`} htmlFor="d-q" required error={e.quantity}>
              <Input id="d-q" name="quantity" inputMode="decimal" required />
            </Field>
          </div>
          <Field label="Inspection notes" htmlFor="d-n">
            <Textarea id="d-n" name="notes" rows={2} maxLength={1000} />
          </Field>
        </>
      )}
    </StockDialog>
  );
}
