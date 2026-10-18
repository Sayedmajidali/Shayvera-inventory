import Image from "next/image";
import { redirect } from "next/navigation";
import { BookCheck, CalendarClock, Lock, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { BrandLockupLight, BrandLogo } from "@/components/app/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const LINES = ["Spices", "Dry fruits", "Makhana", "Herbal", "Food"];

const FEATURES = [
  { icon: ShieldCheck, text: "Quality-checked before anything counts as stock" },
  { icon: CalendarClock, text: "Batch-wise expiry, first-expiry-first-out dispatch" },
  { icon: BookCheck, text: "Every movement on a permanent, auditable ledger" },
];

// Leaves and spice seeds drifting up the brand panel. Fixed values so the
// server and browser render identical markup; negative delays start them mid-flight.
const PARTICLES = [
  { kind: "leaf", left: "8%", size: 18, duration: 19, delay: -2, x: 60, r: 260 },
  { kind: "seed", left: "18%", size: 6, duration: 14, delay: -9, x: -30, r: 0 },
  { kind: "leaf", left: "29%", size: 14, duration: 22, delay: -15, x: -50, r: -200 },
  { kind: "seed", left: "41%", size: 5, duration: 17, delay: -4, x: 40, r: 0 },
  { kind: "leaf", left: "53%", size: 22, duration: 25, delay: -11, x: 80, r: 300 },
  { kind: "seed", left: "64%", size: 7, duration: 15, delay: -13, x: -20, r: 0 },
  { kind: "leaf", left: "74%", size: 16, duration: 21, delay: -6, x: -70, r: -240 },
  { kind: "seed", left: "86%", size: 5, duration: 18, delay: -1, x: 30, r: 0 },
  { kind: "leaf", left: "93%", size: 12, duration: 23, delay: -18, x: -40, r: 180 },
] as const;

function Leaf({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2C6 6 4 12 6 18c1 3 3.5 4 6 4s5-1 6-4c2-6 0-12-6-16Z" style={{ fill: "var(--brand-lime)" }} opacity="0.55" />
      <path d="M12 5v15" style={{ stroke: "var(--sidebar)" }} strokeWidth="1.2" opacity="0.5" />
    </svg>
  );
}

function BrandPanel() {
  return (
    <section className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
      {/* Aurora glow in brand colours */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 size-[30rem] animate-aurora rounded-full bg-[#13a36b]/30 blur-3xl" />
        <div className="absolute top-1/3 -right-40 size-[34rem] animate-aurora rounded-full bg-[#f08a45]/20 blur-3xl [animation-delay:-7s]" />
        <div className="absolute -bottom-40 left-1/4 size-[28rem] animate-aurora rounded-full bg-[#a1cc3d]/20 blur-3xl [animation-delay:-13s]" />
        {/* Fine dot texture, fading out towards the edges */}
        <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.09)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]" />
      </div>

      {/* Drifting leaves and seeds */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-full">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute -bottom-8 animate-drift"
            style={
              {
                left: p.left,
                "--drift-duration": `${p.duration}s`,
                "--drift-x": `${p.x}px`,
                "--drift-r": `${p.r}deg`,
                animationDelay: `${p.delay}s`,
              } as React.CSSProperties
            }
          >
            {p.kind === "leaf" ? (
              <Leaf size={p.size} />
            ) : (
              <span className="block rounded-full bg-sidebar-primary/70" style={{ width: p.size, height: p.size }} />
            )}
          </span>
        ))}
      </div>

      {/* Breathing lotus with a slow halo */}
      <div aria-hidden className="pointer-events-none absolute top-1/2 right-[-11rem] -translate-y-1/2 2xl:right-[-5rem]">
        <div className="relative flex size-[30rem] items-center justify-center">
          <div className="absolute inset-0 animate-spin-slow rounded-full border border-dashed border-white/10" />
          <div className="absolute inset-12 animate-spin-slow rounded-full border border-white/[0.07] [animation-direction:reverse]" />
          <div className="absolute inset-24 rounded-full bg-[radial-gradient(circle,rgb(240_138_69/0.18),transparent_70%)]" />
          <Image
            src="/brand/shayvera-mark-light.png"
            alt=""
            width={560}
            height={371}
            priority
            className="relative w-80 animate-breathe opacity-90"
          />
        </div>
      </div>

      <div className="relative z-10 animate-fade-up">
        <BrandLockupLight caption="Inventory" size="lg" />
      </div>

      <div className="relative z-10 max-w-md space-y-6">
        <h1 className="animate-fade-up font-display text-5xl leading-[1.05] font-black tracking-tight text-white [animation-delay:80ms]">
          Every unit,
          <br />
          <span className="relative inline-block text-sidebar-primary">
            accounted for.
            <svg aria-hidden viewBox="0 0 300 18" preserveAspectRatio="none" className="absolute -bottom-3 left-0 h-3 w-full">
              <path
                d="M4 12 C 70 2, 150 2, 296 10"
                fill="none"
                style={{ stroke: "var(--brand-lime)" }}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="320"
                strokeDashoffset="320"
                className="animate-draw"
              />
            </svg>
          </span>
        </h1>
        <p className="animate-fade-up text-base text-sidebar-foreground/80 [animation-delay:160ms]">
          Raw materials, finished products and marketplace dispatches in one ledger.
        </p>
        <ul className="stagger space-y-3 [&>*:nth-child(1)]:[animation-delay:260ms] [&>*:nth-child(2)]:[animation-delay:340ms] [&>*:nth-child(3)]:[animation-delay:420ms]">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-white/90">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 backdrop-blur">
                <Icon className="size-4 text-sidebar-primary" />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          {LINES.map((l, i) => (
            <span
              key={l}
              className="animate-fade-up rounded-full border border-sidebar-primary/30 bg-sidebar-primary/10 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-sidebar-primary uppercase"
              style={{ animationDelay: `${520 + i * 70}ms` }}
            >
              {l}
            </span>
          ))}
        </div>
      </div>

      <p className="relative z-10 text-xs text-sidebar-foreground/60">
        © {new Date().getFullYear()} Shayvera · Spices · Dry fruits · Makhana · Herbal · Food
      </p>
    </section>
  );
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.15fr_1fr]">
      <BrandPanel />
      <section className="relative flex items-center justify-center overflow-hidden bg-white p-6">
        {/* Soft brand wash behind the form */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -right-40 size-[26rem] rounded-full bg-[#0a774e]/[0.06] blur-3xl" />
          <div className="absolute -bottom-40 -left-32 size-[22rem] rounded-full bg-[#d4651d]/[0.06] blur-3xl" />
        </div>
        <div className="relative w-full max-w-sm animate-fade-up space-y-8 [animation-delay:120ms]">
          <div className="mx-auto w-56 animate-float lg:hidden">
            <BrandLogo priority />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-bold tracking-[0.25em] text-brand-orange uppercase">Shayvera Inventory</p>
            <h2 className="font-display text-3xl font-black tracking-tight text-primary">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in with the account your administrator created for you.</p>
          </div>
          <LoginForm />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" /> Secure sign-in · sessions end automatically after 12 hours
          </p>
        </div>
      </section>
    </main>
  );
}
