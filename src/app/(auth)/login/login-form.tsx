"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const trackCaps = (e: React.KeyboardEvent) => setCapsLock(e.getModifierState("CapsLock"));

  return (
    <form action={formAction} className="space-y-5">
      {/* Re-keyed on each failed attempt so the shake replays. */}
      <div key={state?.attempt ?? 0} className={cn("space-y-5", state?.error && "animate-shake")}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus={!state?.email}
              defaultValue={state?.email}
              placeholder="you@shayvera.com"
              className="h-11 pl-9 transition-shadow focus-visible:shadow-[0_0_0_4px_rgb(10_119_78/0.08)]"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              autoFocus={!!state?.email}
              onKeyDown={trackCaps}
              onKeyUp={trackCaps}
              className="h-11 pr-11 pl-9 transition-shadow focus-visible:shadow-[0_0_0_4px_rgb(10_119_78/0.08)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {capsLock && (
            <p className="flex animate-fade-up items-center gap-1.5 text-xs text-warning">
              <TriangleAlert className="size-3.5" /> Caps Lock is on
            </p>
          )}
        </div>
        {state?.error && (
          <p
            role="alert"
            className="animate-fade-up rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={pending} className="group h-11 w-full text-base shadow-sm shadow-primary/20">
        {pending ? (
          <>
            <Loader2 className="animate-spin" /> Signing in…
          </>
        ) : (
          <>
            Sign in <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1" />
          </>
        )}
      </Button>
    </form>
  );
}
