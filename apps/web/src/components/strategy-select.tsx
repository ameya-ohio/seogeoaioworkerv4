"use client";

import { useState, useTransition } from "react";
import { sendKeywordsToPipeline } from "@/lib/actions/keywords";
import type { UiKeyword } from "@/lib/ui-types";
import { EmptyState, KeywordStatusBadge, buttonCls, cls, tableCls } from "./ui";

/** Select tab (3.5): stage keywords → batch "send to pipeline". */
export function SelectTable({ rows }: { rows: UiKeyword[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const send = () =>
    startTransition(async () => {
      const res = await sendKeywordsToPipeline([...selected]);
      setSelected(new Set());
      const parts = [];
      if (res.sent.length) parts.push(`${res.sent.length} run(s) queued — see Production › Work`);
      for (const e of res.errors) parts.push(`${e.text}: ${e.message}`);
      setNotice(parts.join(" · ") || null);
    });

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing staged."
        hint="Keywords with status idea or queued appear here. Add them on the Target Keywords screen or upload a CSV."
      />
    );
  }

  return (
    <div className="max-w-4xl space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={send} disabled={pending || selected.size === 0} className={buttonCls("primary")}>
          {pending ? "Queuing…" : `Send ${selected.size || ""} to pipeline`}
        </button>
        <p className="text-xs text-slate-400">One article + one queued pipeline run per keyword.</p>
      </div>
      {notice && <p className="text-sm text-slate-600">{notice}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className={tableCls.table}>
          <thead>
            <tr>
              <th className={cls(tableCls.th, "w-8")}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  aria-label="Select all"
                />
              </th>
              <th className={tableCls.th}>Keyword</th>
              <th className={tableCls.th}>Source</th>
              <th className={tableCls.th}>Volume</th>
              <th className={tableCls.th}>Priority</th>
              <th className={tableCls.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={tableCls.tr}>
                <td className={tableCls.td}>
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      })
                    }
                    aria-label={`Select ${row.text}`}
                  />
                </td>
                <td className={cls(tableCls.td, "font-medium text-slate-800")}>{row.text}</td>
                <td className={cls(tableCls.td, "text-slate-500")}>{row.source}</td>
                <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>{row.volume ?? "—"}</td>
                <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>{row.priority ?? "—"}</td>
                <td className={tableCls.td}>
                  <KeywordStatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
