"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  overrideItemDependency,
  sendPlanItemsToPipeline,
  setItemQueryTarget,
  setItemStatus,
} from "@/lib/actions/plans";
import type { UiPlanItemRow } from "@/lib/ui-types";
import { buttonCls, cls, inputCls, tableCls } from "./ui";
import { EnrichmentBadge, PlanItemStatusBadge, RoleBadge } from "./plan-ui";

/** The planned-article table: production order, per-row escapes, bulk send. */
export function PlanItemsTable({ rows }: { rows: UiPlanItemRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else if (res.message) setNotice(res.message);
    });
  };

  const send = () => {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const res = await sendPlanItemsToPipeline([...selected]);
      setSelected(new Set());
      const parts: string[] = [];
      if (res.sent.length) parts.push(`Queued ${res.sent.length}`);
      if (res.errors.length) parts.push(`${res.errors.length} skipped`);
      setNotice(parts.join(" · ") || "Nothing to queue");
      if (res.errors.length) setError(res.errors.map((e) => `${e.slug}: ${e.message}`).join("; "));
    });
  };

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2">
          <span className="text-sm font-medium text-accent">{selected.size} selected</span>
          <button type="button" className={buttonCls("primary")} onClick={send} disabled={pending}>
            Produce these now
          </button>
          <button
            type="button"
            className={buttonCls("ghost")}
            onClick={() => setSelected(new Set())}
            disabled={pending}
          >
            Clear
          </button>
          <span className="text-xs text-accent">
            Queues them immediately, outside the cadence.
          </span>
        </div>
      )}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className={tableCls.table}>
          <thead>
            <tr>
              <th className={tableCls.th}></th>
              <th className={tableCls.th}>#</th>
              <th className={tableCls.th}>Title</th>
              <th className={tableCls.th}>Role</th>
              <th className={tableCls.th}>P</th>
              <th className={tableCls.th}>Keyword target</th>
              <th className={tableCls.th}>Brief</th>
              <th className={tableCls.th}>Status</th>
              <th className={tableCls.th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={tableCls.tr}>
                <td className={tableCls.td}>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    disabled={pending || r.status !== "planned"}
                  />
                </td>
                <td className={cls(tableCls.td, "tabular-nums text-slate-400")}>{r.sequence}</td>
                <td className={tableCls.td}>
                  <div className="font-medium text-slate-800">{r.title}</div>
                  <div className="text-xs text-slate-400">
                    {r.pillarName}
                    {r.subtopicName ? ` › ${r.subtopicName}` : ""} · {r.slug}
                  </div>
                  {r.lastError && (
                    <div className="mt-0.5 text-xs text-red-600">{r.lastError}</div>
                  )}
                </td>
                <td className={tableCls.td}>
                  <RoleBadge role={r.pageRole} />
                </td>
                <td className={cls(tableCls.td, "tabular-nums text-slate-500")}>P{r.priority}</td>
                <td className={tableCls.td}>
                  {editing === r.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        className={cls(inputCls, "w-48")}
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setEditing(null);
                            run(() => setItemQueryTarget(r.id, draft));
                          }
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                      <button
                        type="button"
                        className={buttonCls("ghost")}
                        onClick={() => {
                          setEditing(null);
                          run(() => setItemQueryTarget(r.id, draft));
                        }}
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => {
                        setEditing(r.id);
                        setDraft(r.primaryQueryTarget);
                      }}
                      disabled={pending}
                    >
                      <span className={r.needsQueryTarget ? "text-amber-700" : "text-slate-700"}>
                        {r.primaryQueryTarget || "—"}
                      </span>
                      {r.needsQueryTarget && (
                        <span className="ml-1 text-xs text-amber-600">needs a human</span>
                      )}
                    </button>
                  )}
                </td>
                <td className={tableCls.td}>
                  <EnrichmentBadge state={r.enrichment} />
                </td>
                <td className={tableCls.td}>
                  <PlanItemStatusBadge status={r.status} />
                </td>
                <td className={cls(tableCls.td, "whitespace-nowrap")}>
                  {r.articleSlug && (
                    <Link
                      href={`/production/review/${r.articleSlug}`}
                      className="mr-2 text-accent hover:underline"
                    >
                      review
                    </Link>
                  )}
                  {(r.status === "failed" || r.status === "quarantined") && (
                    <button
                      type="button"
                      className="mr-2 text-accent hover:underline"
                      disabled={pending}
                      onClick={() => run(() => setItemStatus(r.id, "planned"))}
                    >
                      retry
                    </button>
                  )}
                  {r.status === "planned" && (
                    <button
                      type="button"
                      className="mr-2 text-slate-500 hover:underline"
                      disabled={pending}
                      onClick={() => run(() => setItemStatus(r.id, "skipped"))}
                    >
                      skip
                    </button>
                  )}
                  {r.status === "skipped" && (
                    <button
                      type="button"
                      className="mr-2 text-slate-500 hover:underline"
                      disabled={pending}
                      onClick={() => run(() => setItemStatus(r.id, "planned"))}
                    >
                      restore
                    </button>
                  )}
                  {r.status === "planned" && r.pageRole !== "pillar" && (
                    <button
                      type="button"
                      className="text-slate-400 hover:underline"
                      disabled={pending}
                      title="Produce this without waiting for its parent page"
                      onClick={() => run(() => overrideItemDependency(r.id, true))}
                    >
                      unblock
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
