"use client";

import { useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import {
  checkCsvRows,
  commitCsvRows,
  type CsvCheckResult,
  type CsvRow,
} from "@/lib/actions/keywords";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, EmptyState, cls, tableCls } from "./kit";

/**
 * Upload Keywords tab (3.4): CSV → parse (client-side) → dedupe against the
 * library → confirm → rows land as source=csv, status=idea.
 * Recognized headers: keyword/text, volume/search_volume, difficulty/kd,
 * priority — case-insensitive; headerless single-column files work too.
 */
function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function mapRows(data: Record<string, unknown>[] | unknown[][]): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const raw of data) {
    if (Array.isArray(raw)) {
      const text = String(raw[0] ?? "").trim();
      if (text) rows.push({ text });
      continue;
    }
    const rec: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) rec[k.trim().toLowerCase()] = v;
    const text = String(rec["keyword"] ?? rec["text"] ?? rec["query"] ?? "").trim();
    if (!text) continue;
    const row: CsvRow = { text };
    const volume = toNumber(rec["volume"] ?? rec["search_volume"] ?? rec["search volume"]);
    const difficulty = toNumber(rec["difficulty"] ?? rec["kd"] ?? rec["keyword difficulty"]);
    const priority = toNumber(rec["priority"]);
    if (volume !== undefined) row.volume = volume;
    if (difficulty !== undefined) row.difficulty = difficulty;
    if (priority !== undefined) row.priority = priority;
    rows.push(row);
  }
  return rows;
}

export function UploadCsv() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [check, setCheck] = useState<CsvCheckResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  const runCheck = (rows: CsvRow[]) =>
    startTransition(async () => {
      try {
        setCheck(await checkCsvRows(rows));
      } catch {
        setParseError("Couldn't check the file against the library. Try again.");
      }
    });

  const onFile = (file: File) => {
    setCheck(null);
    setParseError(null);
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        let rows = mapRows(result.data as Record<string, unknown>[]);
        if (rows.length === 0) {
          // maybe headerless — reparse without header
          Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: (res2) => {
              rows = mapRows(res2.data as unknown[][]);
              if (rows.length === 0) {
                setParseError("No keywords found. Expected a `keyword` column (or one keyword per line).");
                return;
              }
              runCheck(rows);
            },
          });
          return;
        }
        runCheck(rows);
      },
      error: (err: Error) => setParseError(`CSV parse failed: ${err.message}`),
    });
  };

  const reset = () => {
    setCheck(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const commit = () => {
    if (!check) return;
    startTransition(async () => {
      try {
        const n = await commitCsvRows(check.fresh);
        reset();
        toast.success(`Imported ${n} keyword${n === 1 ? "" : "s"}`, {
          description: "They're in the library as ideas.",
          action: { label: "Open Keywords", onClick: () => router.push("/keywords?status=idea") },
        });
      } catch {
        toast.error("Import failed. Try again.");
      }
    });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <label
        htmlFor="csv-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-[1.5px] border-dashed px-6 py-12 text-center transition-colors",
          dragging ? "border-primary bg-primary-soft" : "border-separator-strong bg-surface hover:bg-fill-2",
        )}
      >
        <span className="mb-1 inline-flex size-11 items-center justify-center rounded-xl bg-fill-2 text-label-2">
          <FileUp aria-hidden className="size-5 stroke-[1.6]" />
        </span>
        <span className="text-[15px] font-semibold">{fileName ?? "Drop a keyword CSV here"}</span>
        <span className="text-[13px] text-label-2">
          or <span className="font-medium text-primary">choose a file</span>
        </span>
        <span className="mt-2 max-w-md text-xs leading-[18px] text-label-2">
          Columns recognized: <span className="font-mono">keyword</span> (required), <span className="font-mono">volume</span>,{" "}
          <span className="font-mono">difficulty</span>, <span className="font-mono">priority</span>. A plain one-keyword-per-line file
          works too.
        </span>
        <input
          ref={fileRef}
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="sr-only"
        />
      </label>

      {parseError && (
        <p role="alert" className="rounded-lg bg-problem-bg px-3 py-2 text-[13px] text-problem-fg">
          {parseError}
        </p>
      )}

      {pending && !check && (
        <p className="flex items-center justify-center gap-2 text-[13px] text-label-2">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Checking against the library…
        </p>
      )}

      {check && (
        <Card
          flush
          title={
            <span className="flex flex-col">
              <span>Ready to import</span>
              <span className="text-xs font-normal text-label-2">
                {check.fresh.length} new · {check.duplicates.length} already in the library
              </span>
            </span>
          }
          actions={
            <span className="flex items-center gap-2">
              <Button variant="ghost" onClick={reset} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={commit} disabled={pending || check.fresh.length === 0}>
                {pending ? "Importing…" : `Import ${check.fresh.length}`}
              </Button>
            </span>
          }
        >
          {check.fresh.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Every row already exists in the library" />
          ) : (
            <div className="max-h-80 overflow-auto">
              <table className={tableCls.table}>
                <thead className="sticky top-0 bg-surface">
                  <tr>
                    <th scope="col" className={tableCls.th}>Keyword</th>
                    <th scope="col" className={cls(tableCls.th, "text-right")}>Volume</th>
                    <th scope="col" className={cls(tableCls.th, "text-right")}>Difficulty</th>
                    <th scope="col" className={cls(tableCls.th, "text-right")}>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {check.fresh.map((r) => (
                    <tr key={r.text} className={tableCls.tr}>
                      <td className={cls(tableCls.td, "font-semibold")}>{r.text}</td>
                      <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>{r.volume ?? "—"}</td>
                      <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>{r.difficulty ?? "—"}</td>
                      <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>{r.priority ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {check.duplicates.length > 0 && (
            <p className="border-t-[0.5px] border-separator px-4 py-3 text-xs text-label-2">
              Skipping duplicates: {check.duplicates.slice(0, 12).join(", ")}
              {check.duplicates.length > 12 ? "…" : ""}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
