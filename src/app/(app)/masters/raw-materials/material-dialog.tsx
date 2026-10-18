"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FormError, NativeSelect } from "@/components/forms/field";
import { useSubmit } from "@/components/forms/use-submit";
import { saveRawMaterialAction } from "../actions";

export function MaterialDialog({
  material,
  units,
  unitLocked,
  trigger,
}: {
  material?: { id: string; name: string; unitId: string };
  units: { id: string; code: string }[];
  unitLocked?: boolean;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { submit, pending, fieldErrors, error } = useSubmit(saveRawMaterialAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        {trigger ??
          (material ? (
            <Button variant="ghost" size="sm">
              <Pencil /> Edit
            </Button>
          ) : (
            <Button>
              <Plus /> New raw material
            </Button>
          ))}
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
            <DialogTitle>{material ? `Edit ${material.name}` : "New raw material"}</DialogTitle>
            <DialogDescription>
              Materials in the master can be picked when recording incoming raw materials. The same name can exist once per unit.
            </DialogDescription>
          </DialogHeader>
          {material && <input type="hidden" name="id" value={material.id} />}
          <Field label="Material name" htmlFor="rm-name" required error={fieldErrors.name}>
            <Input
              id="rm-name"
              name="name"
              defaultValue={material?.name}
              required
              maxLength={150}
              autoFocus
              placeholder="e.g. Turmeric powder"
            />
          </Field>
          <Field
            label="Unit"
            htmlFor="rm-unit"
            required
            error={fieldErrors.unitId}
            hint={unitLocked ? "Locked once entries exist" : undefined}
          >
            <NativeSelect id="rm-unit" name="unitId" defaultValue={material?.unitId ?? units[0]?.id} disabled={unitLocked}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </NativeSelect>
            {unitLocked && <input type="hidden" name="unitId" value={material?.unitId} />}
          </Field>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save material
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
