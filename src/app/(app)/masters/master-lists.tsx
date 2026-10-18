"use client";

import { Loader2, Plus } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmit } from "@/components/forms/use-submit";
import { createCategoryAction, createUnitAction } from "@/app/(app)/admin/actions";

export function AddUnitForm() {
  const ref = useRef<HTMLFormElement>(null);
  const { submit, pending, fieldErrors } = useSubmit(createUnitAction, { onSuccess: () => ref.current?.reset() });
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        void submit(new FormData(e.currentTarget));
      }}
      className="flex flex-wrap items-end gap-2 border-t p-4"
    >
      <div className="w-28">
        <Label className="mb-1 text-xs" htmlFor="un-code">
          Code
        </Label>
        <Input id="un-code" name="code" placeholder="litre" required aria-invalid={!!fieldErrors.code} />
      </div>
      <div className="min-w-32 flex-1">
        <Label className="mb-1 text-xs" htmlFor="un-name">
          Name
        </Label>
        <Input id="un-name" name="name" placeholder="Litre" required />
      </div>
      <div className="flex h-9 items-center gap-2">
        <Checkbox id="un-dec" name="allowsDecimal" value="true" />
        <Label htmlFor="un-dec" className="text-xs font-normal">
          Decimals
        </Label>
      </div>
      <Button type="submit" size="sm" className="h-9" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />}Add
      </Button>
      {fieldErrors.code && <p className="w-full text-xs text-destructive">{fieldErrors.code}</p>}
    </form>
  );
}

export function AddCategoryForm() {
  const ref = useRef<HTMLFormElement>(null);
  const { submit, pending, fieldErrors } = useSubmit(createCategoryAction, { onSuccess: () => ref.current?.reset() });
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        void submit(new FormData(e.currentTarget));
      }}
      className="flex items-end gap-2 border-t p-4"
    >
      <div className="flex-1">
        <Label className="mb-1 text-xs" htmlFor="cat-name">
          New category
        </Label>
        <Input id="cat-name" name="name" required maxLength={80} aria-invalid={!!fieldErrors.name} />
      </div>
      <Button type="submit" size="sm" className="h-9" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />}Add
      </Button>
    </form>
  );
}
