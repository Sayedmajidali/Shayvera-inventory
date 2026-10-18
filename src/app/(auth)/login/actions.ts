"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout } from "@/server/auth";

const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) });

export async function loginAction(_prev: { error?: string } | undefined, fd: FormData) {
  const parsed = schema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const res = await login(parsed.data.email, parsed.data.password);
  if (!res.ok) return { error: res.error };
  redirect("/dashboard");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
