"use client";

import Link from "next/link";
import { ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/forms/confirm-action";
import type { RowAction } from "@/server/reports/types";
import { deleteEntryAction, restoreEntryAction } from "@/app/(app)/raw-materials/actions";
import { deleteProductAction, restoreProductAction } from "@/app/(app)/products/actions";

const CONFIRM = {
  deleteEntry: {
    title: (n: string) => `Delete ${n}?`,
    description:
      "The entry is removed from lists, counts and the inspection queue. It is kept on record with your reason in the audit trail, and can be restored.",
    reasonLabel: "Reason for deleting",
    confirmLabel: "Delete entry",
    destructive: true,
    action: deleteEntryAction,
    field: "entryId",
  },
  restoreEntry: {
    title: (n: string) => `Restore ${n}?`,
    description: "The entry goes back to the inspection queue as pending.",
    reasonLabel: "Reason for restoring",
    confirmLabel: "Restore entry",
    destructive: false,
    action: restoreEntryAction,
    field: "entryId",
  },
  deleteProduct: {
    title: (n: string) => `Delete ${n}?`,
    description:
      "Only possible when the product holds no stock. It disappears from the product master and pickers; its batches, transactions and reports are kept, and the SKU stays reserved. It can be restored.",
    reasonLabel: "Reason for deleting",
    confirmLabel: "Delete product",
    destructive: true,
    action: deleteProductAction,
    field: "productId",
  },
  restoreProduct: {
    title: (n: string) => `Restore ${n}?`,
    description: "The product returns to the master as active, with its full history.",
    reasonLabel: "Reason for restoring",
    confirmLabel: "Restore product",
    destructive: false,
    action: restoreProductAction,
    field: "productId",
  },
} as const;

export function RowActions({ actions }: { actions: RowAction[] }) {
  return (
    <div className="flex justify-end gap-1">
      {actions.map((a) => {
        if ("href" in a) {
          return (
            <Button key={a.label} variant="ghost" size="sm" className="h-7 px-2" asChild>
              <Link href={a.href}>
                <Pencil className="size-3.5" /> {a.label}
              </Link>
            </Button>
          );
        }
        const c = CONFIRM[a.kind];
        const Icon = a.kind.startsWith("delete") ? Trash2 : ArchiveRestore;
        return (
          <ConfirmAction
            key={a.label}
            trigger={
              <Button variant="ghost" size="sm" className={c.destructive ? "h-7 px-2 text-destructive hover:text-destructive" : "h-7 px-2"}>
                <Icon className="size-3.5" /> {a.label}
              </Button>
            }
            title={c.title(a.name)}
            description={<p>{c.description}</p>}
            reasonLabel={c.reasonLabel}
            confirmLabel={c.confirmLabel}
            destructive={c.destructive}
            fields={{ [c.field]: a.id }}
            action={c.action}
          />
        );
      })}
    </div>
  );
}
