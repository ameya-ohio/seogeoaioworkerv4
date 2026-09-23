"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  addKeyword,
  bulkKeywordAction,
  sendKeywordsToPipeline,
  type BulkAction,
} from "@/lib/actions/keywords";
import type { UiKeyword } from "@/lib/ui-types";
import { EmptyState, KeywordStatusBadge, buttonCls, cls, inputCls, tableCls } from "./ui";

export function KeywordsTable({ rows }: { rows: UiKeyword[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulk = (action: BulkAction) =>
    startTransition(async () => {
      await bulkKeywordAction(action, [...selected]);
      setSelected(new Set());
      setNotice(null);
    });

  const runSend = () =>
    startTransition(async () => {
      const res = await sendKeywordsToPipeline([...selected]);
      setSelected(new Set());
      const parts = [];
      if (res.sent.length) parts.push(`${res.sent.length} sent to pipeline`);
      for (const e of res.errors) parts.push(`${e.text}: ${e.message}`);
      setNotice(parts.join(" · ") || null);
    });

  return (
    <div className="space-y-3">
      <form
        action={(fd) =>
          startTransition(async () => {
            await addKeyword(fd);
          })
        }
        className="flex items-center gap-2"
      >
        <input name="text" placeholder="Add a keyword or topic idea…" className={cls(inputCls, "w-80")} />
        <input name="priority" placeholder="Priority" type="number" min={0} max={9} className={cls(inputCls, "w-24")} />
        <button type="submit" disabled={pending} className={buttonCls("secondary")}>
          Add
        </button>
      </form>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-indigo-200 bg-accent-soft px-3 py-2">
          <span className="text-sm font-medium text-accent">{selected.size} selected</span>
          <button onClick={runSend} disabled={pending} className={buttonCls("primary")}>
            Send to pipeline
          </button>
          <button onClick={() => runBulk("prioritize")} disabled={pending} className={buttonCls("secondary")}>
            Prioritize
          </button>
          <button onClick={() => runBulk("queue")} disabled={pending} className={buttonCls("secondary")}>
            Mark queued
          </button>
          <button onClick={() => runBulk("archive")} disabled={pending} className={buttonCls("danger")}>
            Archive
          </button>
          <button onClick={() => runBulk("unarchive")} disabled={pending} className={buttonCls("ghost")}>
            Unarchive
          </button>
        </div>
      )}
      {notice && <p className="text-sm text-slate-600">{notice}</p>}

      {rows.length === 0 ? (
        <EmptyState
          title="No keywords match."
          hint="Add ideas above, upload a CSV in Content Strategy, or run the keyword agent (Phase 4)."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className={tableCls.table}>
            <thead>
              <tr>
                <th className={cls(tableCls.th, "w-8")}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th className={tableCls.th}>Keyword</th>
                <th className={tableCls.th}>Source</th>
                <th className={tableCls.th}>Volume</th>
                <th className={tableCls.th}>Difficulty</th>
                <th className={tableCls.th}>Priority</th>
                <th className={tableCls.th}>Status</th>
                <th className={tableCls.th}>Article</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={tableCls.tr}>
                  <td className={tableCls.td}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      aria-label={`Select ${row.text}`}
                    />
                  </td>
                  <td className={cls(tableCls.td, "font-medium text-slate-800")}>{row.text}</td>
                  <td className={cls(tableCls.td, "text-slate-500")}>{row.source}</td>
                  <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>
                    {row.volume ?? "—"}
                  </td>
                  <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>
                    {row.difficulty ?? "—"}
                  </td>
                  <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>
                    {row.priority ?? "—"}
                  </td>
                  <td className={tableCls.td}>
                    <KeywordStatusBadge status={row.status} />
                  </td>
                  <td className={tableCls.td}>
                    {row.articleSlug ? (
                      <Link href={`/articles/${row.articleSlug}`} className="text-accent hover:underline">
                        {row.articleSlug}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
