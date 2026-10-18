import { Download, Eye, FileText, ImageIcon } from "lucide-react";
import type { BillAttachment } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDateTime } from "@/lib/dates";
import { ReplaceDialog } from "./replace-dialog";

type Att = BillAttachment & { uploadedBy: { name: string } };

export function AttachmentList({
  attachments,
  tz,
  dateFormat,
  canReplace,
  maxMb,
  empty = "No documents uploaded yet.",
}: {
  attachments: Att[];
  tz: string;
  dateFormat: string;
  canReplace: boolean;
  maxMb?: number;
  empty?: string;
}) {
  if (attachments.length === 0) return <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {attachments.map((a) => {
        const Icon = a.mimeType.startsWith("image/") ? ImageIcon : FileText;
        return (
          <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {a.billNumber && <>No. {a.billNumber} · </>}
                {formatDateTime(a.uploadedAt, tz, dateFormat)} by {a.uploadedBy.name} · {Math.max(1, Math.round(a.sizeBytes / 1024))} KB
                {a.replacementReason && <> · Replacement: {a.replacementReason}</>}
              </p>
            </div>
            {a.status === "REPLACED" && <StatusBadge tone="muted">Replaced</StatusBadge>}
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" asChild>
                <a href={`/api/files/${a.id}`} target="_blank" rel="noopener">
                  <Eye /> Preview
                </a>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={`/api/files/${a.id}?download=1`}>
                  <Download /> Download
                </a>
              </Button>
              {canReplace && a.status === "ACTIVE" && <ReplaceDialog attachmentId={a.id} fileName={a.fileName} maxMb={maxMb} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
