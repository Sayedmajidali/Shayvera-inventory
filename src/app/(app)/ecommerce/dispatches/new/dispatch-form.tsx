"use client";

import Link from "@/components/app/fast-link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, NativeSelect } from "@/components/forms/field";
import { FileInput } from "@/components/forms/file-input";
import { useIdempotencyKey, useSubmit } from "@/components/forms/use-submit";
import { createDispatchAction } from "../../actions";

export interface ProductOption {
  id: string;
  name: string;
  sku: string;
  unit: string;
  allowsDecimal: boolean;
  available: string;
  batches: { id: string; label: string; qty: string }[];
}

interface Line {
  key: number;
  productId: string;
  batchId: string;
  quantity: string;
}

export function DispatchForm({
  stores,
  products,
  defaultDate,
  defaultStoreId,
  canUpload,
  maxMb,
  timezone,
}: {
  stores: { id: string; name: string; code: string }[];
  products: ProductOption[];
  defaultDate: string;
  defaultStoreId?: string;
  canUpload: boolean;
  maxMb: number;
  timezone: string;
}) {
  const [key] = useIdempotencyKey();
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", batchId: "", quantity: "" }]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const { submit, pending, fieldErrors, error } = useSubmit(createDispatchAction, {
    redirectTo: (d) => (d ? `/ecommerce/dispatches/${d.id}` : undefined),
  });

  // Client-side check mirrors the server rule; the server re-validates under row locks.
  const requestedByProduct = new Map<string, number>();
  for (const l of lines)
    if (l.productId) requestedByProduct.set(l.productId, (requestedByProduct.get(l.productId) ?? 0) + (Number(l.quantity) || 0));
  const lineProblem = (l: Line): string | undefined => {
    const p = byId.get(l.productId);
    if (!p || !l.quantity) return undefined;
    const q = Number(l.quantity);
    if (!(q > 0)) return "Enter a quantity greater than zero";
    if (!p.allowsDecimal && !Number.isInteger(q)) return `Whole ${p.unit} only`;
    if (l.batchId) {
      const b = p.batches.find((x) => x.id === l.batchId);
      if (b && q > Number(b.qty)) return `Only ${b.qty} in this batch`;
    }
    if ((requestedByProduct.get(p.id) ?? 0) > Number(p.available)) return `Only ${p.available} ${p.unit} available in total`;
    return undefined;
  };
  const hasProblem = lines.some((l) => lineProblem(l)) || lines.some((l) => !l.productId || !l.quantity);

  const update = (k: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set(
          "lines",
          JSON.stringify(lines.map((l) => ({ productId: l.productId, quantity: l.quantity, batchId: l.batchId || undefined }))),
        );
        void submit(fd);
      }}
      noValidate
    >
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Dispatch date and time"
            htmlFor="dispatchDate"
            required
            error={fieldErrors.dispatchDate}
            hint={`Time zone: ${timezone}`}
          >
            <Input id="dispatchDate" name="dispatchDate" type="datetime-local" defaultValue={defaultDate} required />
          </Field>
          <Field
            label="Store"
            htmlFor="storeId"
            required
            error={fieldErrors.storeId}
            hint={
              stores.length === 0 ? (
                <Link className="text-primary underline" href="/ecommerce/stores">
                  Create a store first
                </Link>
              ) : undefined
            }
          >
            <NativeSelect id="storeId" name="storeId" required defaultValue={defaultStoreId ?? ""}>
              <option value="" disabled>
                Select store
              </option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Order / shipment reference" htmlFor="orderRef" error={fieldErrors.orderRef}>
            <Input id="orderRef" name="orderRef" maxLength={80} />
          </Field>
          <Field label="Invoice / bill number" htmlFor="invoiceNumber" error={fieldErrors.invoiceNumber}>
            <Input id="invoiceNumber" name="invoiceNumber" maxLength={80} />
          </Field>
          {canUpload && (
            <Field label="Bill attachment" error={fieldErrors.file} className="lg:col-span-2" hint="Optional">
              <FileInput name="bill" maxMb={maxMb} />
            </Field>
          )}
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2 lg:col-span-3">
            <Textarea id="notes" name="notes" rows={2} maxLength={1000} />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-xs">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Products</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLines((ls) => [...ls, { key: Math.max(...ls.map((l) => l.key)) + 1, productId: "", batchId: "", quantity: "" }])
            }
            disabled={lines.length >= 100}
          >
            <Plus /> Add line
          </Button>
        </div>
        <div className="divide-y">
          {lines.map((l, i) => {
            const p = byId.get(l.productId);
            const problem = lineProblem(l) ?? fieldErrors[`lines.${i}.quantity`] ?? fieldErrors[`lines.${i}.productId`];
            return (
              <div key={l.key} className="grid gap-3 px-4 py-4 md:grid-cols-12 md:items-start">
                <div className="md:col-span-5">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Product</label>
                  <NativeSelect
                    value={l.productId}
                    onChange={(e) => update(l.key, { productId: e.target.value, batchId: "" })}
                    aria-label={`Line ${i + 1} product`}
                  >
                    <option value="">Select product</option>
                    {products.map((o) => (
                      <option key={o.id} value={o.id} disabled={Number(o.available) <= 0}>
                        {o.name} · {o.sku} — {o.available} {o.unit} available
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Batch</label>
                  <NativeSelect
                    value={l.batchId}
                    onChange={(e) => update(l.key, { batchId: e.target.value })}
                    disabled={!p}
                    aria-label={`Line ${i + 1} batch`}
                  >
                    <option value="">Automatic (first expiry first out)</option>
                    {p?.batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label} — {b.qty}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Quantity {p ? `(${p.unit})` : ""}</label>
                  <Input
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    inputMode="decimal"
                    aria-invalid={!!problem}
                    aria-label={`Line ${i + 1} quantity`}
                  />
                  {problem && <p className="mt-1 text-xs text-destructive">{problem}</p>}
                  {p && !problem && <p className="mt-1 text-xs text-muted-foreground">SKU {p.sku}</p>}
                </div>
                <div className="flex md:col-span-1 md:justify-end md:pt-5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    disabled={lines.length === 1}
                    aria-label={`Remove line ${i + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <FormError message={error} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" asChild>
          <Link href="/ecommerce/dispatches">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending || hasProblem}>
          {pending && <Loader2 className="animate-spin" />}
          Post dispatch
        </Button>
      </div>
    </form>
  );
}
