"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/server/action";
import { useSubmit } from "./use-submit";

/**
 * Confirmation dialog for important actions. When `reasonLabel` is set the user
 * must type a reason, which is sent as `reason`.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  reasonLabel,
  fields,
  action,
  successMessage,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  reasonLabel?: string;
  fields?: Record<string, string>;
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  successMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { submit, pending, error } = useSubmit(action, { successMessage, onSuccess: () => setOpen(false) });

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {reasonLabel && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason">
              {reasonLabel} <span className="text-destructive">*</span>
            </Label>
            <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending || (!!reasonLabel && !reason.trim())}
            onClick={() => {
              const fd = new FormData();
              for (const [k, v] of Object.entries(fields ?? {})) fd.set(k, v);
              if (reasonLabel) fd.set("reason", reason);
              void submit(fd);
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
