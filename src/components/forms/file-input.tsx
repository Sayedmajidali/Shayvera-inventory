"use client";

import { FileUp, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FileInput({
  name = "file",
  accept = "application/pdf,image/jpeg,image/png",
  maxMb = 10,
  hint = "PDF, JPG or PNG",
  invalid,
}: {
  name?: string;
  accept?: string;
  maxMb?: number;
  hint?: string;
  invalid?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <input
        ref={ref}
        type="file"
        name={name}
        accept={accept}
        className="sr-only"
        id={`file-${name}`}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f && f.size > maxMb * 1024 * 1024) {
            setErr(`File is larger than ${maxMb} MB.`);
            e.target.value = "";
            setFile(null);
            return;
          }
          setErr(null);
          setFile(f);
        }}
      />
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="truncate">
            {file.name} <span className="text-muted-foreground">· {Math.max(1, Math.round(file.size / 1024))} KB</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Remove file"
            onClick={() => {
              if (ref.current) ref.current.value = "";
              setFile(null);
            }}
          >
            <X />
          </Button>
        </div>
      ) : (
        <label
          htmlFor={`file-${name}`}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40",
            invalid && "border-destructive",
          )}
        >
          <FileUp className="size-4" />
          <span>
            Choose a file{" "}
            <span className="text-xs">
              ({hint}, max {maxMb} MB)
            </span>
          </span>
        </label>
      )}
      {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
    </div>
  );
}
