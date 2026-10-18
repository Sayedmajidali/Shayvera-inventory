"use client";

import { Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSubmit } from "@/components/forms/use-submit";
import { approveAction, rejectAction } from "../actions";

export function InspectionPanel({ entryId, summary }: { entryId: string; summary: string }) {
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const approve = useSubmit(approveAction, { onSuccess: () => setConfirm(null) });
  const reject = useSubmit(rejectAction, { onSuccess: () => setConfirm(null) });
  const pending = approve.pending || reject.pending;

  const run = () => {
    const fd = new FormData();
    fd.set("entryId", entryId);
    fd.set("notes", notes);
    if (confirm === "reject") {
      fd.set("rejectionReason", reason);
      void reject.submit(fd);
    } else void approve.submit(fd);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`notes-${entryId}`}>Inspection notes</Label>
        <Textarea
          id={`notes-${entryId}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Optional observations"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setConfirm("approve")} disabled={pending} className="bg-emerald-700 hover:bg-emerald-800">
          <Check /> Approve
        </Button>
        <Button
          variant="outline"
          onClick={() => setConfirm("reject")}
          disabled={pending}
          className="border-red-200 text-red-700 hover:bg-red-50"
        >
          <X /> Reject
        </Button>
      </div>
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !pending && !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "approve" ? "Approve this entry?" : "Reject this entry?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {summary}.{" "}
              {confirm === "approve"
                ? "The quantity will be added to raw material stock. This decision can only be changed by an administrator through a recorded reversal."
                : "The quantity will not be added to stock. The entry stays visible in reports as rejected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "reject" && (
            <div className="space-y-1.5">
              <Label htmlFor={`reason-${entryId}`}>
                Rejection reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id={`reason-${entryId}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={1000}
                autoFocus
              />
            </div>
          )}
          {(approve.error || reject.error) && <p className="text-sm text-destructive">{approve.error || reject.error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              onClick={run}
              disabled={pending || (confirm === "reject" && !reason.trim())}
              variant={confirm === "reject" ? "destructive" : "default"}
            >
              {pending && <Loader2 className="animate-spin" />}
              {confirm === "approve" ? "Approve and add stock" : "Reject entry"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
