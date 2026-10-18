"use client";

import { Loader2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/forms/field";
import { useSubmit } from "@/components/forms/use-submit";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const ref = useRef<HTMLFormElement>(null);
  const { submit, pending, fieldErrors, error } = useSubmit(changePasswordAction, { onSuccess: () => ref.current?.reset() });
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        void submit(new FormData(e.currentTarget));
      }}
      className="max-w-md space-y-4 rounded-xl border bg-card p-5 shadow-xs"
    >
      <Field label="Current password" htmlFor="cur" required error={fieldErrors.current}>
        <Input id="cur" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="nxt" required error={fieldErrors._} hint="At least 10 characters">
        <Input id="nxt" name="next" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <FormError message={error} />
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}Change password
      </Button>
    </form>
  );
}
