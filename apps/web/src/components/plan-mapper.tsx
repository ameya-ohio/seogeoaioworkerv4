"use client";

import { useState, useTransition } from "react";
import {
  commitPlanAction,
  deletePlan,
  setValueMapping,
  updateMapping,
} from "@/lib/actions/plans";
import { buttonCls, Card, cls, inputCls } from "./ui";

/**
 * Column mapping. Nothing about the shape of a plan is hardcoded: the fields
 * are auto-detected, and anything the detection got wrong is corrected here
 * rather than in code, so a differently-shaped workbook still imports.
 */

export interface MapperField {
  field: string;
  label: string;
  required: boolean;
  column: number | null;
  confidence: number;
}

export interface UnresolvedValue {
  field: "pageRole" | "funnel" | "priority" | "searchIntent";
  value: string;
  rows: number;
}

const CANONICAL: Record<UnresolvedValue["field"], { value: string; label: string }[]> = {
  pageRole: [
    { value: "pillar", label: "Pillar page" },
    { value: "hub", label: "Subtopic hub" },
    { value: "cluster", label: "Cluster article" },
  ],
  funnel: [
    { value: "tofu", label: "Top (TOFU)" },
    { value: "mofu", label: "Middle (MOFU)" },
    { value: "bofu", label: "Bottom (BOFU)" },
  ],
  priority: [
    { value: "1", label: "P1" },
    { value: "2", label: "P2" },
    { value: "3", label: "P3" },
  ],
  searchIntent: [
    { value: "informational", label: "Informational" },
    { value: "commercial", label: "Commercial" },
    { value: "transactional", label: "Transactional" },
    { value: "navigational", label: "Navigational" },
  ],
};

export function PlanMapper({
  planId,
  sheets,
  activeSheet,
  headers,
  fields,
  unresolved,
  blocking,
}: {
  planId: string;
  sheets: { name: string; rows: number }[];
  activeSheet: string;
  headers: string[];
  fields: MapperField[];
  unresolved: UnresolvedValue[];
  blocking: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrich, setEnrich] = useState(true);

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else if (res.message) setNotice(res.message);
    });
  };

  return (
    <div className="space-y-4">
      <Card title="Which sheet holds the articles?">
        <div className="flex flex-wrap gap-2">
          {sheets.map((s) => (
            <button
              key={s.name}
              type="button"
              disabled={pending}
              onClick={() => run(() => updateMapping(planId, { sheet: s.name }))}
              className={cls(
                "rounded-md border px-3 py-1.5 text-sm",
                s.name === activeSheet
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
              )}
            >
              {s.name}
              <span className="ml-1.5 tabular-nums text-xs text-slate-500">{s.rows}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Columns">
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.field} className="block">
              <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                {f.label}
                {f.required && <span className="text-red-500">*</span>}
                {f.column !== null && f.confidence < 3 && (
                  <span className="rounded bg-amber-50 px-1 text-xs font-normal text-amber-700">
                    guessed — check this
                  </span>
                )}
              </span>
              <select
                className={inputCls}
                disabled={pending}
                value={f.column ?? ""}
                onChange={(e) =>
                  run(() =>
                    updateMapping(planId, {
                      columns: { [f.field]: e.target.value === "" ? null : Number(e.target.value) },
                    }),
                  )
                }
              >
                <option value="">— not mapped —</option>
                {headers.map((h, i) => (
                  <option key={`${h}-${i}`} value={i}>
                    {h || `(column ${i + 1})`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Card>

      {unresolved.length > 0 && (
        <Card title="Values we could not place">
          <p className="mb-3 text-sm text-slate-600">
            These appear in the sheet but do not match anything known. A page role must be
            assigned; the rest fall back to a sensible default.
          </p>
          <div className="space-y-2">
            {unresolved.map((u) => (
              <div key={`${u.field}-${u.value}`} className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">
                  {u.value}
                </code>
                <span className="text-xs text-slate-500">
                  {u.field} · {u.rows} row{u.rows === 1 ? "" : "s"}
                </span>
                <select
                  className={cls(inputCls, "w-auto")}
                  disabled={pending}
                  defaultValue=""
                  onChange={(e) =>
                    e.target.value &&
                    run(() => setValueMapping(planId, u.field, u.value, e.target.value))
                  }
                >
                  <option value="">means…</option>
                  {CANONICAL[u.field].map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Import">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={buttonCls("primary")}
            disabled={pending || blocking.length > 0}
            onClick={() => run(() => commitPlanAction(planId, { enrich }))}
          >
            {pending ? "Working…" : "Create the plan"}
          </button>
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={enrich}
              onChange={(e) => setEnrich(e.target.checked)}
              disabled={pending}
            />
            Sharpen briefs with a cheap model pass
          </label>
          <button
            type="button"
            className={buttonCls("ghost")}
            disabled={pending}
            onClick={() => run(() => deletePlan(planId))}
          >
            Discard
          </button>
        </div>
        {blocking.length > 0 && (
          <p className="mt-2 text-sm text-amber-700">
            Fix the problems above first — importing now would create articles you would have to
            unpick later.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Creating the plan writes no articles and spends nothing. Production only starts when you
          set a cadence or send articles by hand.
        </p>
        {notice && <p className="mt-2 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>
    </div>
  );
}
