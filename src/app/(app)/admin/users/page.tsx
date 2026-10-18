import { Power } from "lucide-react";
import { requirePage } from "@/server/auth";
import { prisma } from "@/server/db";
import { DEFAULT_STAFF_PERMISSIONS, GRANTABLE_TO_STAFF, PERMISSIONS } from "@/server/permissions";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { setUserActiveAction } from "../actions";
import { ResetPasswordDialog, UserDialog, type PermissionGroup } from "./user-dialog";

export const metadata = { title: "Users and roles" };

export default async function UsersPage() {
  const actor = await requirePage("admin.users");
  const settings = await getSettings();
  const users = await prisma.user.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }] });
  const groups: PermissionGroup[] = [];
  for (const key of GRANTABLE_TO_STAFF) {
    const p = PERMISSIONS[key];
    let g = groups.find((x) => x.group === p.group);
    if (!g) groups.push((g = { group: p.group, items: [] }));
    g.items.push({ key, label: p.label });
  }
  const labelOf = (k: string) => (k in PERMISSIONS ? PERMISSIONS[k as keyof typeof PERMISSIONS].label : k);

  return (
    <>
      <PageHeader
        title="Users and roles"
        description="Create accounts, assign roles and choose exactly what each staff member can do."
        crumbs={[{ label: "Administration" }, { label: "Users and roles" }]}
        actions={<UserDialog groups={groups} defaults={DEFAULT_STAFF_PERMISSIONS} />}
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Access</th>
                <th className="px-4 py-2.5">Last sign-in</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "text-muted-foreground"}>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {u.name}
                      {u.id === actor.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === "ADMIN" ? <StatusBadge tone="info">Administrator</StatusBadge> : <StatusBadge>Staff</StatusBadge>}
                  </td>
                  <td className="max-w-md px-4 py-3 text-xs">
                    {u.role === "ADMIN" ? "Full access" : u.permissions.length ? u.permissions.map(labelOf).join(" · ") : "No access"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt, settings.timezone, settings.dateFormat) : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={u.active ? "success" : "muted"}>{u.active ? "Active" : "Deactivated"}</StatusBadge>
                    {u.lockedUntil && u.lockedUntil > new Date() && (
                      <StatusBadge tone="warning" className="ml-1">
                        Locked
                      </StatusBadge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <UserDialog
                      user={{ id: u.id, name: u.name, email: u.email, role: u.role, permissions: u.permissions }}
                      groups={groups}
                      defaults={DEFAULT_STAFF_PERMISSIONS}
                    />
                    <ResetPasswordDialog userId={u.id} name={u.name} />
                    {u.id !== actor.id && (
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Power /> {u.active ? "Deactivate" : "Activate"}
                          </Button>
                        }
                        title={u.active ? `Deactivate ${u.name}?` : `Activate ${u.name}?`}
                        description={
                          u.active
                            ? "They will be signed out immediately and cannot sign in. Their history is kept."
                            : "They will be able to sign in again."
                        }
                        fields={{ id: u.id, active: String(!u.active) }}
                        action={setUserActiveAction}
                        destructive={u.active}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
