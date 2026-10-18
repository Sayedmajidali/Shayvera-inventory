"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout } from "@/server/auth";

const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) });

export type LoginState = { error: string; attempt: number; email: string } | undefined;

export async function loginAction(prev: LoginState, fd: FormData): Promise<LoginState> {
  // `attempt` changes on every failure so the form can replay its shake animation.
  const attempt = (prev?.attempt ?? 0) + 1;
  const email = String(fd.get("email") ?? "").slice(0, 200); // kept so the user doesn't retype it
  const parsed = schema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: "Enter your email and password.", attempt, email };
  const res = await login(parsed.data.email, parsed.data.password);
  if (!res.ok) return { error: res.error, attempt, email };
  redirect("/dashboard");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
