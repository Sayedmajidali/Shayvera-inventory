import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { BrandLockupLight, BrandLogo, BrandMark } from "@/components/app/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const LINES = ["Spices", "Dry fruits", "Makhana", "Herbal", "Food"];

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <BrandLockupLight caption="Inventory" size="lg" />
        <div className="relative z-10 max-w-md space-y-5">
          <h1 className="font-display text-4xl leading-tight font-extrabold text-white">Every unit, accounted for.</h1>
          <p className="text-sidebar-foreground/80">
            Raw materials, finished products and marketplace dispatches in one ledger, with quality inspection, expiry and low-stock control
            built in.
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold tracking-[0.25em] text-sidebar-primary uppercase">
            {LINES.map((l, i) => (
              <span key={l} className="flex items-center gap-3">
                {i > 0 && <span aria-hidden className="size-1 bg-sidebar-primary" />}
                {l}
              </span>
            ))}
          </p>
        </div>
        <p className="relative z-10 text-xs text-sidebar-foreground/60">© {new Date().getFullYear()} Shayvera</p>
        {/* Lotus watermark */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-20 w-[34rem] opacity-[0.07] grayscale invert">
          <BrandMark className="w-full" />
        </div>
      </section>
      <section className="flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="mx-auto w-56 lg:hidden">
            <BrandLogo priority />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-primary">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use the account your administrator created for you.</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
