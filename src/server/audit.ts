import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { prisma } from "./db";

export async function audit(
  db: Tx | typeof prisma,
  entry: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    details?: Prisma.InputJsonValue;
  },
) {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      details: entry.details,
    },
  });
}
