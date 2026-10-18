import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Connection string for the app. `DATABASE_URL` wins; on Netlify, Netlify
 * Database provides `NETLIFY_DB_URL` (older Netlify DB sites:
 * `NETLIFY_DATABASE_URL`). Neon's pooled endpoint runs PgBouncer in
 * transaction mode, so Prisma is told about it and each serverless function
 * keeps a small pool.
 */
export function databaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL || process.env.NETLIFY_DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.hostname.includes("-pooler")) {
      if (!url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
      if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "5");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl(),
    // PRISMA_LOG_QUERIES=1 prints every query (useful for spotting slow or repeated ones).
    log:
      process.env.PRISMA_LOG_QUERIES === "1"
        ? ["query", "warn", "error"]
        : process.env.NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;

/**
 * Run a stock-changing unit of work in a single database transaction.
 * Serialization failures / deadlocks caused by concurrent postings are retried.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await prisma.$transaction(fn, { timeout: 20_000, maxWait: 10_000 });
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) throw err;
      await new Promise((r) => setTimeout(r, 25 * (i + 1) + Math.random() * 50));
    }
  }
  throw lastError;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: write conflict / deadlock
    return err.code === "P2034";
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /deadlock detected|could not serialize access/i.test(msg);
}

export function isUniqueViolation(err: unknown, field?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  if (!field) return true;
  const target = (err.meta?.target ?? []) as string[] | string;
  return Array.isArray(target) ? target.includes(field) : String(target).includes(field);
}
