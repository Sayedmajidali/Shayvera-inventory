"use client";

import { Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, NativeSelect } from "@/components/forms/field";
import { FileInput } from "@/components/forms/file-input";
import { useSubmit } from "@/components/forms/use-submit";
import type { ActionResult } from "@/server/action";

export interface ExtraField {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

export function UploadDialog({
  title = "Upload document",
  description,
  action,
  hidden = {},
  extraFields = [],
  showBillNumber = true,
  maxMb = 10,
  triggerLabel = "Upload",
  triggerVariant = "outline",
}: {
  title?: string;
  description?: string;
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  hidden?: Record<string, string>;
  extraFields?: ExtraField[];
  showBillNumber?: boolean;
  maxMb?: number;
  triggerLabel?: string;
  triggerVariant?: "outline" | "default" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const { submit, pending, fieldErrors, error } = useSubmit(action, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm">
          <Upload /> {triggerLabel}
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
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {extraFields.map((f) => (
            <Field key={f.name} label={f.label} htmlFor={`up-${f.name}`} required={f.required} error={fieldErrors[f.name]}>
              {f.options ? (
                <NativeSelect id={`up-${f.name}`} name={f.name} defaultValue={f.options[0]?.value}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <Input id={`up-${f.name}`} name={f.name} placeholder={f.placeholder} required={f.required} />
              )}
            </Field>
          ))}
          {showBillNumber && (
            <Field label="Bill / invoice number" htmlFor="up-billNumber" error={fieldErrors.billNumber}>
              <Input id="up-billNumber" name="billNumber" maxLength={80} />
            </Field>
          )}
          <Field label="File" required error={fieldErrors.file}>
            <FileInput maxMb={maxMb} invalid={!!fieldErrors.file} />
          </Field>
          <Field label="Notes" htmlFor="up-notes">
            <Textarea id="up-notes" name="notes" rows={2} maxLength={500} />
          </Field>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
