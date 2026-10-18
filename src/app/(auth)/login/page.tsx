import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { LogoMark } from "@/components/app/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <LogoMark className="size-10" />
          <span className="font-display text-2xl font-semibold tracking-wide">Shayvera</span>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="font-display text-4xl leading-tight font-semibold">Every unit, accounted for.</h1>
          <p className="text-sidebar-foreground/70">
            Raw materials, finished products and marketplace dispatches in one ledger, with inspection, expiry and low-stock control built
            in.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">© {new Date().getFullYear()} Shayvera</p>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -bottom-32 size-[28rem] rounded-full border border-sidebar-primary/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -bottom-16 size-[20rem] rounded-full border border-sidebar-primary/30"
        />
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center gap-3 lg:hidden">
            <LogoMark />
            <span className="font-display text-xl font-semibold">Shayvera</span>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use the account your administrator created for you.</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
