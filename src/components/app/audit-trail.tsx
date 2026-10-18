import { prisma } from "@/server/db";
import { formatDateTime } from "@/lib/dates";

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
    take: 50,
    include: { actor: { select: { name: true } } },
  });
  if (logs.length === 0) return <p className="px-4 py-6 text-sm text-muted-foreground">No activity recorded.</p>;
  return (
    <ol className="relative space-y-4 px-4 py-4">
      {logs.map((l) => (
        <li key={l.id} className="relative pl-5">
          <span aria-hidden className="absolute top-1.5 left-0 size-2 rounded-full bg-primary/60" />
          <p className="text-sm">{l.summary}</p>
          <p className="text-xs text-muted-foreground">
            {l.actor?.name ?? "System"} · {formatDateTime(l.createdAt, tz, dateFormat)}
          </p>
        </li>
      ))}
    </ol>
  );
}
