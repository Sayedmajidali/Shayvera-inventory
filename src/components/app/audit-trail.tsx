import { prisma } from "@/server/db";
import type { FieldChange } from "@/server/changes";
import { formatDateTime } from "@/lib/dates";

/** ISO timestamps in change records are shown in the business timezone. */
function showValue(v: string | null, tz: string, dateFormat: string) {
  if (v === null) return <span className="text-muted-foreground italic">empty</span>;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) return formatDateTime(v, tz, dateFormat);
  return v;
}

export async function AuditTrail({
  entityType,
  entityId,
  tz,
  dateFormat,
}: {
  entityType: string;
  entityId: string;
  tz: string;
  dateFormat: string;
}) {
  const logs = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true } } },
  });
  if (logs.length === 0) return <p className="px-4 py-6 text-sm text-muted-foreground">No activity recorded.</p>;
  return (
    <ol className="relative space-y-4 px-4 py-4">
      {logs.map((l) => {
        const details = (l.details ?? {}) as { changes?: FieldChange[]; reason?: string | null };
        const changes = Array.isArray(details.changes) ? details.changes : [];
        return (
          <li key={l.id} className="relative pl-5">
            <span aria-hidden className="absolute top-1.5 left-0 size-2 rounded-full bg-primary/60" />
            <p className="text-sm">{l.summary}</p>
            {changes.length > 0 && (
              <ul className="mt-1.5 space-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs">
                {changes.map((c) => (
                  <li key={c.field}>
                    <span className="font-medium">{c.label}:</span>{" "}
                    <span className="text-muted-foreground line-through decoration-muted-foreground/50">
                      {showValue(c.from, tz, dateFormat)}
                    </span>
                    {" → "}
                    <span>{showValue(c.to, tz, dateFormat)}</span>
                  </li>
                ))}
              </ul>
            )}
            {details.reason && changes.length > 0 && <p className="mt-1 text-xs">Reason: {details.reason}</p>}
            <p className="text-xs text-muted-foreground">
              {l.actor?.name ?? "System"} · {formatDateTime(l.createdAt, tz, dateFormat)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
