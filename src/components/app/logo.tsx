import Image from "next/image";
import { cn } from "@/lib/utils";

// Logo files are generated from the official Shayvera logo (public/brand).

/** Full-colour logo with tagline, for light backgrounds. */
export function BrandLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/shayvera-logo.png"
      alt="Shayvera — spices, dry fruits, makhana, herbal, food"
      width={720}
      height={415}
      priority={priority}
      className={cn("h-auto w-full", className)}
    />
  );
}

/** Lotus mark only, full colour. */
export function BrandMark({ className }: { className?: string }) {
  return <Image src="/brand/shayvera-mark.png" alt="" aria-hidden width={240} height={159} className={cn("h-auto", className)} />;
}

/** Mark + wordmark in white/orange/lime, for the dark green sidebar and brand panels. */
export function BrandLockupLight({
  className,
  caption = "Inventory",
  size = "sm",
}: {
  className?: string;
  caption?: string;
  size?: "sm" | "lg";
}) {
  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <Image
        src="/brand/shayvera-lockup-light.png"
        alt="Shayvera"
        width={726}
        height={160}
        priority
        className={size === "lg" ? "h-14 w-auto" : "h-9 w-auto"}
      />
      {caption && <span className="pl-0.5 text-[10px] font-bold tracking-[0.32em] text-sidebar-primary uppercase">{caption}</span>}
    </div>
  );
}
