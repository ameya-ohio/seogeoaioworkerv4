"use client";

import { useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import {
  checkCsvRows,
  commitCsvRows,
  type CsvCheckResult,
  type CsvRow,
} from "@/lib/actions/keywords";
import { Card, EmptyState, buttonCls, cls, tableCls } from "./ui";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [check, setCheck] = useState<CsvCheckResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const onFile = (file: File) => {
    setDone(null);
    setCheck(null);
    setParseError(null);
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
              startTransition(async () => setCheck(await checkCsvRows(rows)));
            },
          });
          return;
        }
        startTransition(async () => setCheck(await checkCsvRows(rows)));
      },
      error: (err: Error) => setParseError(`CSV parse failed: ${err.message}`),
    });
  };

  const commit = () => {
    if (!check) return;
    startTransition(async () => {
      const n = await commitCsvRows(check.fresh);
      setDone(n);
      setCheck(null);
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  return (
    <div className="max-w-3xl space-y-4">
      <Card title="Upload a keyword CSV">
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
            className="block text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
          />
          <p className="text-xs text-slate-400">
            Columns recognized: <span className="font-mono">keyword</span> (required),{" "}
            <span className="font-mono">volume</span>, <span className="font-mono">difficulty</span>,{" "}
            <span className="font-mono">priority</span>. A plain one-keyword-per-line file works too.
          </p>
          {parseError && <p className="text-sm text-red-600">{parseError}</p>}
          {done !== null && (
            <p className="text-sm text-emerald-700">
              Imported {done} keyword{done === 1 ? "" : "s"} into the library (status: idea).
            </p>
          )}
        </div>
      </Card>

      {pending && !check && <p className="text-sm text-slate-500">Checking against the library…</p>}

      {check && (
        <Card
          title={`Ready to import: ${check.fresh.length} new · ${check.duplicates.length} already in the library`}
          actions={
            <button onClick={commit} disabled={pending || check.fresh.length === 0} className={buttonCls("primary")}>
              {pending ? "Importing…" : `Import ${check.fresh.length}`}
            </button>
          }
        >
          {check.fresh.length === 0 ? (
            <EmptyState title="Every row already exists in the library." />
          ) : (
            <div className="max-h-80 overflow-auto rounded-md border border-slate-100">
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={tableCls.th}>Keyword</th>
                    <th className={tableCls.th}>Volume</th>
                    <th className={tableCls.th}>Difficulty</th>
                    <th className={tableCls.th}>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {check.fresh.map((r) => (
                    <tr key={r.text} className={tableCls.tr}>
                      <td className={cls(tableCls.td, "font-medium text-slate-800")}>{r.text}</td>
                      <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>{r.volume ?? "—"}</td>
                      <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>{r.difficulty ?? "—"}</td>
                      <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>{r.priority ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {check.duplicates.length > 0 && (
            <p className="mt-3 text-xs text-slate-400">
              Skipping duplicates: {check.duplicates.slice(0, 12).join(", ")}
              {check.duplicates.length > 12 ? "…" : ""}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
