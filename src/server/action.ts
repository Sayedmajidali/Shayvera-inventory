import "server-only";
import { revalidatePath } from "next/cache";
import { AppError } from "./errors";
import { requireActor } from "./auth";
import type { Actor } from "./permissions";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Wrap a server action: authenticate, run the service (which validates input and
 * checks permissions itself), map known errors to friendly messages.
 */
export async function act<T>(
  fn: (actor: Actor) => Promise<T>,
  opts: { revalidate?: string[]; message?: string } = {},
): Promise<ActionResult<T>> {
  try {
    const actor = await requireActor();
    const data = await fn(actor);
    for (const path of opts.revalidate ?? []) revalidatePath(path, "layout");
    return { ok: true, data, message: opts.message };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    console.error("[action] unexpected error", err);
    return { ok: false, error: "Something went wrong while saving. Nothing was posted — please try again." };
  }
}

export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function formFile(fd: FormData, name = "file"): File | null {
  const v = fd.get(name);
  return v instanceof File && v.size > 0 ? v : null;
}

export function formJson<T = unknown>(fd: FormData, name: string): T | undefined {
  const v = fd.get(name);
  if (typeof v !== "string" || !v) return undefined;
  try {
    return JSON.parse(v) as T;
  } catch {
    return undefined;
  }
}

export const formBool = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
};
