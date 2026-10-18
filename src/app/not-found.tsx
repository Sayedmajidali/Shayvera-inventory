import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-display text-5xl font-black text-primary">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">The record may have been moved, or the link is incorrect.</p>
      <Button asChild variant="outline">
        <Link href="/">Back to Shayvera</Link>
      </Button>
    </main>
  );
}
