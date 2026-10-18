"use server";

import { act } from "@/server/action";
import { verifyPassword } from "@/server/auth-hash";
import { changeOwnPassword } from "@/server/services/masters";

export async function changePasswordAction(fd: FormData) {
  return act((actor) => changeOwnPassword(actor, String(fd.get("current") ?? ""), String(fd.get("next") ?? ""), verifyPassword), {
    message: "Password changed",
  });
}
