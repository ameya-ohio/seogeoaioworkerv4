"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { markReleaseLive } from "@/lib/actions/publishing";
import { buttonCls, cls } from "./ui";
import { RoleBadge } from "./plan-ui";

/**
 * The Releases tab: each subtopic ships as one unit (its hub plus every
 * cluster article), then each pillar page after its subtopics. A release is
 * downloadable once every page in it is approved.
 */

export interface UiReleaseMember {
  externalId: string;
  title: string;
  role: string;
  slug: string;
  path: string | null;
  stage: string | null;
  live: boolean;
  liveUrl: string | null;
  exportedAt: string | null;
  blocking: string | null;
  hasArticle: boolean;
}

export interface UiRelease {
  key: string;
  kind: "subtopic" | "pillar";
  pillarId: string;
  pillarName: string;
  subtopicName: string | null;
  title: string;
  state: string;
  members: UiReleaseMember[];
  excluded: { externalId: string; title: string; reason: string }[];
  counts: { total: number; produced: number; approved: number; live: number };
}

const STATE_LABEL: Record<string, string> = {
  planned: "not started",
  building: "building",
  in_review: "in review",
  ready: "ready to release",
  partly_live: "partly live",
  live: "live",
};

const STATE_STYLE: Record<string, string> = {
  planned: "bg-slate-100 text-slate-500",
  building: "bg-indigo-50 text-indigo-700",
  in_review: "bg-amber-50 text-amber-700",
  ready: "bg-emerald-600 text-white",
  partly_live: "bg-orange-50 text-orange-700",
  live: "bg-emerald-50 text-emerald-700",
};

const STATE_ORDER = ["ready", "partly_live", "in_review", "building", "live", "planned"];

export function PlanReleases({
  planId,
  releases,
  reexport,
}: {
  planId: string;
  releases: UiRelease[];
  reexport: { slug: string; title: string; links: number }[];
}) {
  const [state, setState] = useState<string | null>(null);
  const [pillar, setPillar] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of releases) if (!pillar || r.pillarId === pillar) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [releases, pillar]);

  const pillars = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of releases) if (!seen.has(r.pillarId)) seen.set(r.pillarId, r.pillarName);
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [releases]);

  const shown = releases.filter((r) => (!state || r.state === state) && (!pillar || r.pillarId === pillar));
  const byPillar = new Map<string, UiRelease[]>();
  for (const r of shown) {
    const list = byPillar.get(r.pillarId) ?? [];
    list.push(r);
    byPillar.set(r.pillarId, list);
  }
  const pillarOrder = [...byPillar.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const markLive = (key: string) => {
    setNotice(null);
    setError(null);
    setBusyKey(key);
    startTransition(async () => {
      const res = await markReleaseLive(planId, key);
      setBusyKey(null);
      if (res.error) setError(res.error);
      else if (res.message) setNotice(res.message);
    });
  };

  return (
    <div className="space-y-4">
      {reexport.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-medium">
            {reexport.length} live page{reexport.length === 1 ? "" : "s"} now {reexport.length === 1 ? "has" : "have"} links to switch on
          </div>
          <p className="mt-0.5 text-xs text-amber-800">
            Pages they link to have gone live since they were exported. Re-download each one and re-paste its body in Framer.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {reexport.map((r) => (
              <li key={r.slug}>
                <a href={`/api/export/${r.slug}`} className="text-accent hover:underline">
                  {r.title}
                </a>{" "}
                <span className="text-xs text-amber-700">({r.links} link{r.links === 1 ? "" : "s"})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => setState(null)} className={chip(!state)}>
          all {pillar ? releases.filter((r) => r.pillarId === pillar).length : releases.length}
        </button>
        {STATE_ORDER.filter((s) => counts[s]).map((s) => (
          <button key={s} type="button" onClick={() => setState(state === s ? null : s)} className={chip(state === s)}>
            {STATE_LABEL[s]} {counts[s]}
          </button>
        ))}
        <select
          className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
          value={pillar ?? ""}
          onChange={(e) => setPillar(e.target.value || null)}
          aria-label="Pillar"
        >
          <option value="">All pillars</option>
          {pillars.map(([id, name]) => (
            <option key={id} value={id}>
              {id} · {name}
            </option>
          ))}
        </select>
      </div>

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {pillarOrder.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No releases match.
        </p>
      )}

      {pillarOrder.map((pid) => {
        const units = byPillar.get(pid) ?? [];
        return (
          <section key={pid} className="rounded-lg border border-slate-200 bg-white">
            <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-800">
              <span className="font-mono text-xs text-slate-400">{pid}</span> {units[0]?.pillarName}
            </h3>
            <ul>
              {units.map((u) => (
                <ReleaseRow
                  key={u.key}
                  planId={planId}
                  unit={u}
                  busy={pending && busyKey === u.key}
                  disabled={pending}
                  onMarkLive={() => markLive(u.key)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ReleaseRow({
  planId,
  unit,
  busy,
  disabled,
  onMarkLive,
}: {
  planId: string;
  unit: UiRelease;
  busy: boolean;
  disabled: boolean;
  onMarkLive: () => void;
}) {
  const [open, setOpen] = useState(unit.state === "ready" || unit.state === "partly_live");
  const releasable = unit.state === "ready" || unit.state === "partly_live";
  const exported = unit.members.some((m) => !m.live && m.exportedAt);
  const { counts } = unit;
  const pct = counts.total ? Math.round((counts.approved / counts.total) * 100) : 0;

  return (
    <li className="border-b border-slate-100 last:border-0">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <span className="text-slate-400">{open ? "▾" : "▸"}</span>
          <span className="min-w-0 truncate font-medium text-slate-800">
            {unit.kind === "pillar" ? (
              <>
                <span className="mr-1 text-xs font-normal text-slate-500">Pillar page ·</span>
                {unit.title}
              </>
            ) : (
              unit.subtopicName ?? unit.title
            )}
          </span>
          <span className={cls("shrink-0 rounded px-1.5 py-0.5 text-xs font-medium", STATE_STYLE[unit.state])}>
            {STATE_LABEL[unit.state] ?? unit.state}
          </span>
        </button>
        <div className="flex w-56 items-center gap-2 text-xs text-slate-500" title="approved (or live) of pages in the release">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums">
            {counts.approved}/{counts.total} approved
            {counts.live ? ` · ${counts.live} live` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {releasable ? (
            <>
              <a
                href={`/api/export/release?plan=${planId}&unit=${encodeURIComponent(unit.key)}`}
                className={buttonCls(exported ? "secondary" : "primary")}
              >
                Download release
              </a>
              <button
                type="button"
                className={buttonCls(exported ? "primary" : "secondary")}
                disabled={disabled}
                onClick={onMarkLive}
                title="After publishing every page in Framer: checks each URL and marks them live together"
              >
                {busy ? "Checking URLs…" : "Mark release live"}
              </button>
            </>
          ) : (
            <span className="text-xs text-slate-400">
              {unit.state === "live"
                ? "all pages live"
                : unit.state === "planned"
                  ? "build it from the Articles tab"
                  : "downloadable once every page is approved"}
            </span>
          )}
        </div>
      </div>
      {open && (
        <div className="px-4 pb-3 pl-10">
          <table className="w-full text-sm">
            <tbody>
              {unit.members.map((m) => (
                <tr key={m.externalId} className="border-t border-slate-50">
                  <td className="w-24 py-1 pr-2 font-mono text-xs text-slate-400">{m.externalId}</td>
                  <td className="w-20 py-1 pr-2">
                    <RoleBadge role={m.role} />
                  </td>
                  <td className="py-1 pr-2 text-slate-700">
                    {m.hasArticle ? (
                      <Link href={`/production/review/${m.slug}`} className="hover:text-accent hover:underline">
                        {m.title}
                      </Link>
                    ) : (
                      m.title
                    )}
                  </td>
                  <td className="py-1 text-right text-xs">
                    {m.live ? (
                      m.liveUrl ? (
                        <a href={m.liveUrl} target="_blank" rel="noopener" className="text-emerald-700 hover:underline">
                          live ↗
                        </a>
                      ) : (
                        <span className="text-emerald-700">live</span>
                      )
                    ) : m.blocking ? (
                      <span className={m.blocking === "awaiting approval" ? "text-amber-700" : "text-slate-500"}>{m.blocking}</span>
                    ) : (
                      <span className="text-emerald-700">approved{m.exportedAt ? " · downloaded" : ""}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {unit.excluded.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Not in this release:{" "}
              {unit.excluded.map((e) => `${e.title} (${e.reason})`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function chip(active: boolean): string {
  return cls(
    "rounded-full px-2.5 py-1 text-xs",
    active ? "bg-accent text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
  );
}
