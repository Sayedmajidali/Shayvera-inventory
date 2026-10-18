"use client";

import { KeyRound, Loader2, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FormError, NativeSelect } from "@/components/forms/field";
import { useSubmit } from "@/components/forms/use-submit";
import { resetPasswordAction, saveUserAction } from "../actions";

export interface PermissionGroup {
  group: string;
  items: { key: string; label: string }[];
}

export function UserDialog({
  user,
  groups,
  defaults,
}: {
  user?: { id: string; name: string; email: string; role: "ADMIN" | "STAFF"; permissions: string[] };
  groups: PermissionGroup[];
  defaults: string[];
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"ADMIN" | "STAFF">(user?.role ?? "STAFF");
  const [perms, setPerms] = useState<Set<string>>(new Set(user?.permissions ?? defaults));
  const { submit, pending, fieldErrors, error } = useSubmit(saveUserAction, { onSuccess: () => setOpen(false) });

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        {user ? (
          <Button variant="ghost" size="sm">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button>
            <UserPlus /> New user
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.delete("permissions");
            if (role === "STAFF") for (const p of perms) fd.append("permissions", p);
            void submit(fd);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{user ? `Edit ${user.name}` : "New user"}</DialogTitle>
            <DialogDescription>
              Administrators have full access. Staff can only use the modules and actions ticked below; this is enforced on the server.
            </DialogDescription>
          </DialogHeader>
          {user && <input type="hidden" name="id" value={user.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="u-name" required error={fieldErrors.name}>
              <Input id="u-name" name="name" defaultValue={user?.name} required maxLength={100} />
            </Field>
            <Field label="Email" htmlFor="u-email" required error={fieldErrors.email}>
              <Input id="u-email" name="email" type="email" defaultValue={user?.email} required disabled={!!user} />
            </Field>
            <Field label="Role" htmlFor="u-role" required>
              <NativeSelect id="u-role" name="role" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "STAFF")}>
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Administrator</option>
              </NativeSelect>
            </Field>
            {!user && (
              <Field
                label="Initial password"
                htmlFor="u-pw"
                required
                error={fieldErrors.password}
                hint="At least 10 characters. Share it securely."
              >
                <Input id="u-pw" name="password" type="password" autoComplete="new-password" required minLength={10} />
              </Field>
            )}
          </div>
          {role === "STAFF" && (
            <fieldset className="space-y-3 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">Permissions</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {groups.map((g) => (
                  <div key={g.group} className="space-y-2">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.group}</p>
                    {g.items.map((p) => (
                      <div key={p.key} className="flex items-start gap-2">
                        <Checkbox
                          id={`perm-${p.key}`}
                          checked={perms.has(p.key)}
                          onCheckedChange={(c) =>
                            setPerms((s) => {
                              const n = new Set(s);
                              if (c === true) n.add(p.key);
                              else n.delete(p.key);
                              return n;
                            })
                          }
                        />
                        <Label htmlFor={`perm-${p.key}`} className="text-sm leading-tight font-normal">
                          {p.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </fieldset>
          )}
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}Save user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const { submit, pending, fieldErrors, error } = useSubmit(resetPasswordAction, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <KeyRound /> Reset password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(new FormData(e.currentTarget));
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Reset password for {name}</DialogTitle>
            <DialogDescription>All of this user&apos;s sessions will be signed out.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="id" value={userId} />
          <Field label="New password" htmlFor="rp" required error={fieldErrors._ ?? fieldErrors.password}>
            <Input id="rp" name="password" type="password" autoComplete="new-password" minLength={10} required />
          </Field>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
