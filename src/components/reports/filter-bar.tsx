"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FilterField {
  key: string;
  label: string;
  type: "search" | "text" | "date" | "select";
  options?: { value: string; label: string }[];
  allLabel?: string;
}

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

export function FilterBar({ fields, dateLabel }: { fields: FilterField[]; dateLabel?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);

  function submit() {
    const fd = new FormData(formRef.current!);
    const next = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (typeof v === "string" && v.trim()) next.set(k, v.trim());
    for (const k of ["sort", "dir"]) {
      const v = params.get(k);
      if (v) next.set(k, v);
    }
    router.push(`${pathname}${next.size ? `?${next}` : ""}`);
  }

  const search = fields.find((f) => f.type === "search");
  const others = fields.filter((f) => f.type !== "search");
  const active = fields.some((f) => params.get(f.key));
  const activeCount = others.filter((f) => params.get(f.key)).length;
  const hasRange = others.some((f) => f.key === "from");
  // On phones the extra filters fold away so the results stay in view.
  const [open, setOpen] = useState(activeCount > 0);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="no-print rounded-xl border bg-card p-3 shadow-xs"
      role="search"
    >
      {others.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-2 w-full justify-between sm:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal /> Filters{activeCount > 0 && ` (${activeCount})`}
          </span>
          <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
        </Button>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {search && (
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{search.label}</span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name={search.key} defaultValue={params.get(search.key) ?? ""} placeholder="Search…" className="pl-8" />
            </div>
          </label>
        )}
        {others.map((f) => (
          <label key={f.key} className={cn(!open && "hidden sm:block")}>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {f.key === "from" && hasRange && dateLabel ? `${dateLabel} from` : f.key === "to" && dateLabel ? `${dateLabel} to` : f.label}
            </span>
            {f.type === "date" ? (
              <Input type="date" name={f.key} defaultValue={params.get(f.key) ?? ""} onChange={() => submit()} />
            ) : f.type === "text" ? (
              <Input name={f.key} defaultValue={params.get(f.key) ?? ""} maxLength={100} />
            ) : (
              <select name={f.key} defaultValue={params.get(f.key) ?? ""} onChange={() => submit()} className={selectClass}>
                <option value="">{f.allLabel ?? "All"}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        ))}
        <div className={cn("flex items-end gap-2", !search && others.length === 0 && "hidden", !search && !open && "hidden sm:flex")}>
          <Button type="submit" size="sm" className="h-9">
            Apply
          </Button>
          {active && (
            <Button variant="ghost" size="sm" className="h-9" asChild>
              <Link href={pathname}>
                <X /> Reset
              </Link>
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
