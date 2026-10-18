import Link from "@/components/app/fast-link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "No access" };

export default function Forbidden() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <div className="rounded-full bg-amber-50 p-3 text-amber-700">
        <ShieldAlert className="size-6" />
      </div>
      <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="text-sm text-muted-foreground">Ask an administrator to grant you the permission if you need it.</p>
      <Button asChild variant="outline">
        <Link href="/">Go to my start page</Link>
      </Button>
    </div>
  );
}
