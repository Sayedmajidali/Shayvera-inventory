"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect } from "@/components/forms/field";
import { FileInput } from "@/components/forms/file-input";
import { useSubmit } from "@/components/forms/use-submit";
import type { ImportResult } from "@/server/services/importer";
import { importCsvAction } from "../actions";

export function ImportForm({ kinds }: { kinds: { value: string; label: string; columns: string[] }[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState(kinds[0].value);
  const [result, setResult] = useState<ImportResult | null>(null);
  const { submit, pending } = useSubmit(importCsvAction, { onSuccess: (d) => setResult(d ?? null), successMessage: "Import finished" });
  const send = (dryRun: boolean) => {
    const fd = new FormData(ref.current!);
    fd.set("dryRun", String(dryRun));
    setResult(null);
    void submit(fd);
  };
  const cols = kinds.find((k) => k.value === kind)!.columns;
  return (
    <div className="space-y-4">
      <form ref={ref} onSubmit={(e) => e.preventDefault()} className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What are you importing?" htmlFor="kind">
            <NativeSelect id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="CSV file" required>
            <FileInput accept=".csv,text/csv" hint="CSV with a header row" maxMb={5} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Columns: <code className="rounded bg-muted px-1">{cols.join(", ")}</code>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => send(true)} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}Validate only
          </Button>
          <Button type="button" onClick={() => send(false)} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}Validate and import
          </Button>
        </div>
      </form>
      {result && (
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <p className="font-medium">
            {result.errors.length
              ? `${result.errors.length} row(s) have problems — ${result.dryRun || result.imported === 0 ? "nothing was imported" : `${result.imported} imported`}.`
              : result.dryRun
                ? `All ${result.rows} rows are valid. Run the import when ready.`
                : `Imported ${result.imported} of ${result.rows} rows.`}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto text-sm">
              {result.errors.map((e, i) => (
                <li key={i}>
                  <span className="font-mono text-xs text-muted-foreground">Row {e.row}:</span> {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
