"use client";

import { AlertTriangle, Ban, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/server/action";
import { useSubmit } from "./use-submit";

export interface StockPreview {
  /** Stock that deleting would write off, e.g. { label: "Batch B1 · Saleable", qty: "5 kg" }. */
  holdings: { label: string; qty: string }[];
  /** Set when deletion isn't possible at all, with the reason. */
  blocked: string | null;
}

/**
 * Delete confirmation that checks for stock when it opens. With stock on hand it
 * warns and lists what will be written off; the server only writes stock off
 * when `writeOffStock` is sent, so stock that appears after the check is never
 * removed silently.
 */
export function StockWarningDelete({
  trigger,
  title,
  description,
  what,
  preview,
  fields,
  action,
  confirmLabel,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  /** "product" or "batch", used in the warning text. */
  what: string;
  preview: () => Promise<ActionResult<StockPreview>>;
  fields: Record<string, string>;
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  confirmLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [check, setCheck] = useState<{ loading: boolean; data?: StockPreview; error?: string }>({ loading: false });

  const load = useCallback(async () => {
    setCheck({ loading: true });
    const res = await preview();
    setCheck(res.ok ? { loading: false, data: res.data } : { loading: false, error: res.error });
  }, [preview]);

  const { submit, pending, error } = useSubmit(action, {
    onSuccess: () => setOpen(false),
  });

  const holdings = check.data?.holdings ?? [];
  const hasStock = holdings.length > 0;
  const blocked = check.data?.blocked ?? check.error ?? null;
  const ready = !check.loading && !!check.data && !blocked;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) {
          setReason("");
          void load();
        }
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {check.loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking stock…
          </p>
        )}
        {blocked && (
          <div role="alert" className="flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
            <Ban className="mt-0.5 size-4 shrink-0" />
            <p>{blocked}</p>
          </div>
        )}
        {!check.loading && !blocked && hasStock && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4 shrink-0 text-amber-600" /> This {what} still has stock
            </p>
            <ul className="mt-2 space-y-0.5 pl-6">
              {holdings.map((h) => (
                <li key={h.label} className="flex justify-between gap-4">
                  <span>{h.label}</span>
                  <span className="font-medium tabular-nums">{h.qty}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-amber-900/90">
              Deleting writes all of it off with stock adjustments. The adjustments are kept in the ledger and change history.
            </p>
          </div>
        )}

        {!blocked && (
          <div className="space-y-1.5">
            <Label htmlFor="delete-reason">
              Reason for deleting <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="delete-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Entered by mistake"
            />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{blocked ? "Close" : "Cancel"}</AlertDialogCancel>
          {!blocked && (
            <Button
              variant="destructive"
              disabled={pending || !ready || !reason.trim()}
              onClick={async () => {
                const fd = new FormData();
                for (const [k, v] of Object.entries(fields)) fd.set(k, v);
                fd.set("reason", reason);
                if (hasStock) fd.set("writeOffStock", "true");
                const res = await submit(fd);
                // Stock changed since the check: show the current holdings.
                if (!res.ok) void load();
              }}
            >
              {pending && <Loader2 className="animate-spin" />}
              {hasStock ? "Write off stock and delete" : confirmLabel}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
