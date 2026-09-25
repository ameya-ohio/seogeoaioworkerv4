import type { UiPlanReport } from "@/lib/ui-types";
import { cls, tableCls } from "./ui";

/** Distribution chips + every problem the import found, server-rendered. */

function Chips({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </span>
      {entries.map(([k, n]) => (
        <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
          {k.replace(/_/g, " ")} <span className="tabular-nums font-medium">{n}</span>
        </span>
      ))}
    </div>
  );
}

function Problems({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: { key: string; text: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <details className="rounded border border-slate-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-800">
        {title} <span className="tabular-nums text-slate-500">({rows.length})</span>
      </summary>
      <div className="border-t border-slate-100 px-3 py-2">
        <p className="mb-2 text-xs text-slate-500">{hint}</p>
        <ul className="space-y-1 text-xs text-slate-700">
          {rows.slice(0, 50).map((r) => (
            <li key={r.key} className="font-mono">
              {r.text}
            </li>
          ))}
          {rows.length > 50 && (
            <li className="text-slate-500">…and {rows.length - 50} more</li>
          )}
        </ul>
      </div>
    </details>
  );
}

export function PlanReport({ report }: { report: UiPlanReport }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="text-sm text-slate-700">
          Reading <span className="font-medium">{report.sheet}</span> —{" "}
          <span className="tabular-nums font-medium">{report.mappedRows}</span> of{" "}
          <span className="tabular-nums">{report.totalRows}</span> rows mapped
        </div>
        <Chips title="Role" counts={report.byPageRole} />
        <Chips title="Priority" counts={report.byPriority} />
        <Chips title="Funnel" counts={report.byFunnel} />
        <Chips title="Intent" counts={report.byIntent} />
      </div>

      {report.blocking.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-3">
          <div className="text-sm font-medium text-red-800">
            Resolve before importing
          </div>
          <ul className="mt-1 space-y-1 text-sm text-red-700">
            {report.blocking.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <Problems
          title="Rows skipped"
          hint="These rows will not become articles."
          rows={report.skippedRows.map((s) => ({ key: `${s.row}`, text: `row ${s.row + 2}: ${s.reason}` }))}
        />
        <Problems
          title="Collides with an existing article"
          hint="Rename the row's slug, skip it, or leave it out — the existing article is never overwritten."
          rows={report.articleCollisions.map((c) => ({
            key: c.externalId,
            text: `${c.externalId} → ${c.slug} (existing article is ${c.stage})`,
          }))}
        />
        <Problems
          title="Duplicate slugs inside this file"
          hint="Two rows want the same URL. Rename one."
          rows={report.duplicateSlugs.map((d) => ({
            key: d.slug,
            text: `${d.slug} ← ${d.externalIds.join(", ")}`,
          }))}
        />
        <Problems
          title="Needs a human keyword target"
          hint="The title could not be reduced to something a person would actually type. Set these on the Articles tab before producing them."
          rows={report.needsQueryTarget.map((id) => ({ key: id, text: id }))}
        />
        <Problems
          title="Already in the keyword library"
          hint="Not a problem — just so you know these overlap with existing ideas."
          rows={report.keywordCollisions.map((k) => ({
            key: k.externalId,
            text: `${k.externalId} → "${k.text}" (${k.status})`,
          }))}
        />
        <Problems
          title="Subtopics with no hub row"
          hint="Their articles will link up to the pillar page instead."
          rows={report.missingHubs.map((h) => ({ key: h, text: h }))}
        />
      </div>

      {report.unrecognized.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
          <table className={tableCls.table}>
            <thead>
              <tr>
                <th className={tableCls.th}>Unrecognized value</th>
                <th className={tableCls.th}>Field</th>
                <th className={tableCls.th}>Rows</th>
              </tr>
            </thead>
            <tbody>
              {report.unrecognized.map((u) => (
                <tr key={`${u.field}-${u.value}`} className={tableCls.tr}>
                  <td className={cls(tableCls.td, "font-mono text-slate-800")}>{u.value}</td>
                  <td className={tableCls.td}>{u.field}</td>
                  <td className={cls(tableCls.td, "tabular-nums text-slate-500")}>{u.rows.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
