import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { can } from "@/server/permissions";
import { NAV } from "@/lib/nav";

/** Send each user to the first page they are allowed to see. */
export default async function Home() {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (can(actor, "dashboard.view")) redirect("/dashboard");
  for (const s of NAV) for (const i of s.items ?? []) if (i.permission.some((p) => can(actor, p))) redirect(i.href);
  redirect("/account");
}
