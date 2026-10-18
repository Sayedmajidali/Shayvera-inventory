"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError } from "@/components/forms/field";
import { FileInput } from "@/components/forms/file-input";
import { useSubmit } from "@/components/forms/use-submit";
import { replaceBillAction } from "@/app/(app)/raw-materials/actions";

export function ReplaceDialog({ attachmentId, fileName, maxMb = 10 }: { attachmentId: string; fileName: string; maxMb?: number }) {
  const [open, setOpen] = useState(false);
  const { submit, pending, fieldErrors, error } = useSubmit(replaceBillAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <RefreshCw /> Replace
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
            <DialogTitle>Replace document</DialogTitle>
            <DialogDescription>
              &ldquo;{fileName}&rdquo; will be kept in the register and marked as replaced. The reason is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="attachmentId" value={attachmentId} />
          <Field label="Replacement file" required error={fieldErrors.file}>
            <FileInput maxMb={maxMb} invalid={!!fieldErrors.file} />
          </Field>
          <Field label="Reason for replacement" htmlFor="rep-reason" required error={fieldErrors.reason}>
            <Textarea id="rep-reason" name="reason" rows={2} required maxLength={500} />
          </Field>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Replace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
