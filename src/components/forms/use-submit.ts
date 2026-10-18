"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/action";

/** One idempotency key per form instance; renewed only after a successful post. */
export function useIdempotencyKey() {
  const [key, setKey] = useState(() => crypto.randomUUID());
  return [key, () => setKey(crypto.randomUUID())] as const;
}

export function useSubmit<T>(
  action: (fd: FormData) => Promise<ActionResult<T>>,
  opts: {
    onSuccess?: (data: T | undefined) => void;
    successMessage?: string;
    redirectTo?: (data: T | undefined) => string | undefined;
  } = {},
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    (fd: FormData) =>
      new Promise<ActionResult<T>>((resolve) => {
        setError(null);
        startTransition(async () => {
          const res = await action(fd);
          if (res.ok) {
            setFieldErrors({});
            toast.success(res.message ?? opts.successMessage ?? "Saved");
            opts.onSuccess?.(res.data);
            const to = opts.redirectTo?.(res.data);
            if (to) router.push(to);
            else router.refresh();
          } else {
            setFieldErrors(res.fieldErrors ?? {});
            setError(res.error);
            toast.error(res.error);
          }
          resolve(res);
        });
      }),
    [action, opts, router],
  );

  return { submit, pending, fieldErrors, error, setFieldErrors };
}
