"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  cancelBuildAction,
  overrideItemDependency,
  previewBuildAction,
  queueBuildAction,
  sendPlanItemsToPipeline,
  setItemPath,
  setItemQueryTarget,
  setItemStatus,
  type UiBuildSummary,
} from "@/lib/actions/plans";
import { FunnelBadge, HoldBadge, IntentBadge, TypeBadge } from "./facets";
import type { UiPlanItemRow } from "@/lib/ui-types";
import { buttonCls, cls, inputCls, tableCls } from "./ui";
import { PlanItemStatusBadge, RoleBadge } from "./plan-ui";

/**
 * The Articles tab: the content map as a table you can slice.
 *
 * Every column of the workbook is a filter (any combination, AND-ed) and a
 * sort key (shift-click to add a second or third). The whole plan is loaded
 * once, so filtering never waits on the server, and the filter state lives in
 * the URL so a view can be bookmarked or shared.
 *
 * Building works on the unit that ships: selecting any row queues its whole
 * subtopic — cluster articles first, then the hub, then the pillar page once
 * every hub in the pillar is built.
 */

// ── columns ──────────────────────────────────────────────────────────────

type FilterKey =
  | "pillar"
  | "subtopic"
  | "role"
  | "intent"
  | "type"
  | "funnel"
  | "priority"
  | "status"
  | "build";

type SortKey = "sequence" | "id" | "title" | FilterKey;

const ROLE_LABEL: Record<string, string> = {
  pillar: "Pillar page",
  hub: "Subtopic hub",
  cluster: "Cluster article",
};
const ROLE_ORDER: Record<string, number> = { pillar: 0, hub: 1, cluster: 2 };
const FUNNEL_ORDER: Record<string, number> = { tofu: 0, mofu: 1, bofu: 2 };
const STATUS_ORDER = [
  "planned", "enqueued", "in_progress", "done", "failed", "quarantined", "skipped", "slug_conflict",
];

const subtopicValue = (r: UiPlanItemRow) => `${r.pillarId}/${r.subtopicId ?? ""}`;

/** Value used for filtering and grouping, per column. */
const VALUE: Record<FilterKey, (r: UiPlanItemRow) => string> = {
  pillar: (r) => r.pillarId,
  subtopic: subtopicValue,
  role: (r) => r.pageRole,
  intent: (r) => r.searchIntent,
  type: (r) => r.articleTypeLabel,
  funnel: (r) => r.funnel,
  priority: (r) => `P${r.priority}`,
  status: (r) => r.status,
  build: (r) => (r.buildQueued ? "queued" : "not queued"),
};

const FILTER_LABEL: Record<FilterKey, string> = {
  pillar: "Pillar",
  subtopic: "Subtopic",
  role: "Page role",
  intent: "Search intent",
  type: "Article type",
  funnel: "Funnel",
  priority: "Priority",
  status: "Status",
  build: "Build",
};

const FILTER_KEYS = Object.keys(FILTER_LABEL) as FilterKey[];

function optionLabel(key: FilterKey, value: string, rows: UiPlanItemRow[]): string {
  if (key === "pillar") return rows.find((r) => r.pillarId === value)?.pillarName ?? value;
  if (key === "subtopic") {
    const r = rows.find((x) => subtopicValue(x) === value);
    return r?.subtopicName ?? "(pillar page)";
  }
  if (key === "role") return ROLE_LABEL[value] ?? value;
  if (key === "funnel") return value.toUpperCase();
  if (key === "status") return value.replace(/_/g, " ");
  return value;
}

function compareBy(key: SortKey): (a: UiPlanItemRow, b: UiPlanItemRow) => number {
  switch (key) {
    case "sequence":
      return (a, b) => a.sequence - b.sequence;
    case "id":
      return (a, b) => a.externalId.localeCompare(b.externalId, undefined, { numeric: true });
    case "title":
      return (a, b) => a.title.localeCompare(b.title);
    case "role":
      return (a, b) => (ROLE_ORDER[a.pageRole] ?? 9) - (ROLE_ORDER[b.pageRole] ?? 9);
    case "funnel":
      return (a, b) => (FUNNEL_ORDER[a.funnel] ?? 9) - (FUNNEL_ORDER[b.funnel] ?? 9);
    case "priority":
      return (a, b) => a.priority - b.priority;
    case "status":
      return (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    case "pillar":
    case "subtopic":
      // IDs follow the workbook's order (P01 before P02, S01 before S02).
      return (a, b) =>
        VALUE[key](a).localeCompare(VALUE[key](b), undefined, { numeric: true });
    default:
      return (a, b) => VALUE[key](a).localeCompare(VALUE[key](b));
  }
}

// ── URL state ────────────────────────────────────────────────────────────

interface ViewState {
  filters: Partial<Record<FilterKey, string[]>>;
  sort: { key: SortKey; dir: 1 | -1 }[];
  q: string;
}

const SORT_KEYS: SortKey[] = ["sequence", "id", "title", ...FILTER_KEYS];

function parseView(query: string): ViewState {
  const p = new URLSearchParams(query);
  const filters: ViewState["filters"] = {};
  for (const k of FILTER_KEYS) {
    const vals = p.getAll(k);
    if (vals.length) filters[k] = vals;
  }
  const sort: ViewState["sort"] = [];
  for (const raw of p.getAll("sort")) {
    const desc = raw.startsWith("-");
    const key = (desc ? raw.slice(1) : raw) as SortKey;
    if (SORT_KEYS.includes(key)) sort.push({ key, dir: desc ? -1 : 1 });
  }
  return { filters, sort, q: p.get("q") ?? "" };
}

function writeView(v: ViewState): void {
  const p = new URLSearchParams({ tab: "items" });
  for (const k of FILTER_KEYS) for (const val of v.filters[k] ?? []) p.append(k, val);
  for (const s of v.sort) p.append("sort", `${s.dir === -1 ? "-" : ""}${s.key}`);
  if (v.q) p.set("q", v.q);
  window.history.replaceState(null, "", `?${p.toString()}`);
}

function matches(r: UiPlanItemRow, v: ViewState, skip?: FilterKey): boolean {
  for (const k of FILTER_KEYS) {
    if (k === skip) continue;
    const want = v.filters[k];
    if (want?.length && !want.includes(VALUE[k](r))) return false;
  }
  if (v.q) {
    const q = v.q.toLowerCase();
    const hay = `${r.externalId} ${r.title} ${r.primaryQueryTarget} ${r.slug}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// ── component ────────────────────────────────────────────────────────────

const PAGE = 200;

/** Fifteen columns: tighter than the shared table so it fits a laptop screen. */
const th = tableCls.th.replace("px-3", "px-2");
const td = tableCls.td.replace("px-3", "px-2");

export function PlanItemsTable({
  planId,
  rows,
  initialQuery,
}: {
  planId: string;
  rows: UiPlanItemRow[];
  initialQuery: string;
}) {
  const [view, setView] = useState<ViewState>(() => parseView(initialQuery));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [confirm, setConfirm] = useState<{ ids: string[]; summary: UiBuildSummary } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [pathDraft, setPathDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (next: ViewState) => {
    setView(next);
    setShown(PAGE);
    writeView(next);
  };

  const filtered = useMemo(() => {
    const out = rows.filter((r) => matches(r, view));
    const sorts = view.sort.length ? view.sort : [{ key: "sequence" as SortKey, dir: 1 as const }];
    const cmps = sorts.map((s) => ({ cmp: compareBy(s.key), dir: s.dir }));
    return out.sort((a, b) => {
      for (const { cmp, dir } of cmps) {
        const d = cmp(a, b) * dir;
        if (d) return d;
      }
      return a.sequence - b.sequence;
    });
  }, [rows, view]);

  /** Options per column, counted against every OTHER active filter. */
  const options = useMemo(() => {
    const out = {} as Record<FilterKey, { value: string; label: string; count: number }[]>;
    for (const k of FILTER_KEYS) {
      const counts = new Map<string, number>();
      for (const r of rows) {
        if (!matches(r, view, k)) continue;
        const v = VALUE[k](r);
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      for (const v of view.filters[k] ?? []) if (!counts.has(v)) counts.set(v, 0);
      const cmp = compareBy(k);
      const sample = new Map<string, UiPlanItemRow>();
      for (const r of rows) if (!sample.has(VALUE[k](r))) sample.set(VALUE[k](r), r);
      out[k] = [...counts.entries()]
        .map(([value, count]) => ({ value, label: optionLabel(k, value, rows), count }))
        .sort((a, b) => {
          const ra = sample.get(a.value);
          const rb = sample.get(b.value);
          return ra && rb ? cmp(ra, rb) || a.label.localeCompare(b.label) : a.label.localeCompare(b.label);
        });
    }
    return out;
  }, [rows, view]);

  const toggleFilter = (k: FilterKey, value: string) => {
    const cur = new Set(view.filters[k] ?? []);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    const filters = { ...view.filters, [k]: [...cur] };
    // A subtopic belongs to a pillar: narrowing pillars drops subtopics outside them.
    if (k === "pillar" && filters.pillar?.length && filters.subtopic?.length) {
      filters.subtopic = filters.subtopic.filter((s) => filters.pillar?.includes(s.split("/")[0] ?? ""));
    }
    update({ ...view, filters });
  };

  const clearFilter = (k: FilterKey) => update({ ...view, filters: { ...view.filters, [k]: [] } });

  const clickSort = (key: SortKey, add: boolean) => {
    const existing = view.sort.find((s) => s.key === key);
    let sort: ViewState["sort"];
    if (!add) {
      sort = !existing ? [{ key, dir: 1 }] : existing.dir === 1 ? [{ key, dir: -1 }] : [];
    } else if (!existing) {
      sort = [...view.sort, { key, dir: 1 }];
    } else if (existing.dir === 1) {
      sort = view.sort.map((s) => (s.key === key ? { key, dir: -1 as const } : s));
    } else {
      sort = view.sort.filter((s) => s.key !== key);
    }
    update({ ...view, sort });
  };

  const activeFilters = FILTER_KEYS.filter((k) => view.filters[k]?.length);

  // One subtopic (or one pillar) in view → offer to build it without selecting.
  const scope = useMemo(() => {
    if (!activeFilters.length && !view.q) return null;
    if (filtered.length === 0) return null;
    const subs = new Set(filtered.filter((r) => r.pageRole !== "pillar").map(subtopicValue));
    const pillars = new Set(filtered.map((r) => r.pillarId));
    if (subs.size === 1) {
      const r = filtered.find((x) => x.pageRole !== "pillar") as UiPlanItemRow;
      return { label: `Build “${r.subtopicName ?? r.pillarName}”`, ids: [r.id] };
    }
    if (pillars.size === 1) {
      const pillar = rows.find((r) => r.pillarId === [...pillars][0] && r.pageRole === "pillar");
      if (pillar) return { label: `Build all of “${pillar.pillarName}”`, ids: [pillar.id] };
    }
    return null;
  }, [filtered, activeFilters.length, view.q, rows]);

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else if (res.message) setNotice(res.message);
    });
  };

  const askBuild = (ids: string[]) => {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const summary = await previewBuildAction(planId, ids);
      if (summary.error) setError(summary.error);
      else setConfirm({ ids, summary });
    });
  };

  const doBuild = () => {
    if (!confirm) return;
    const ids = confirm.ids;
    setConfirm(null);
    run(async () => {
      const res = await queueBuildAction(planId, ids);
      setSelected(new Set());
      return res;
    });
  };

  const sendNow = () => {
    setNotice(null);
    setError(null);
    const ids = [...selected].filter((id) => rows.find((r) => r.id === id)?.status === "planned");
    startTransition(async () => {
      const res = await sendPlanItemsToPipeline(ids);
      setSelected(new Set());
      const parts: string[] = [];
      if (res.sent.length) parts.push(`Queued ${res.sent.length}`);
      if (res.errors.length) parts.push(`${res.errors.length} skipped`);
      setNotice(parts.join(" · ") || "Nothing to queue");
      if (res.errors.length) setError(res.errors.map((e) => `${e.slug}: ${e.message}`).join("; "));
    });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const selectAllFiltered = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) for (const r of filtered) next.delete(r.id);
      else for (const r of filtered) next.add(r.id);
      return next;
    });
  const selectedPlanned = [...selected].filter((id) => rows.find((r) => r.id === id)?.status === "planned").length;
  const selectedQueued = [...selected].filter((id) => rows.find((r) => r.id === id)?.buildQueued).length;

  const sortMark = (key: SortKey) => {
    const i = view.sort.findIndex((s) => s.key === key);
    if (i === -1) return null;
    const s = view.sort[i] as ViewState["sort"][number];
    return (
      <span className="ml-0.5 text-accent">
        {s.dir === 1 ? "▲" : "▼"}
        {view.sort.length > 1 && <sup>{i + 1}</sup>}
      </span>
    );
  };

  const filterButton = (k: FilterKey) => (
    <FilterButton
      k={k}
      active={view.filters[k]?.length ?? 0}
      open={openFilter === k}
      onOpen={() => setOpenFilter(openFilter === k ? null : k)}
      onClose={() => setOpenFilter(null)}
      options={options[k]}
      selected={view.filters[k] ?? []}
      onToggle={(v) => toggleFilter(k, v)}
      onClear={() => clearFilter(k)}
    />
  );

  const header = ({ label, sortKey, filterKey, className }: {
    label: string;
    sortKey?: SortKey;
    filterKey?: FilterKey;
    className?: string;
  }) => (
    <th className={cls(th, "whitespace-nowrap", className)}>
      <span className="inline-flex items-center gap-1">
        {sortKey ? (
          <button
            type="button"
            className="uppercase tracking-wide hover:text-slate-800"
            title="Sort (shift-click to add a sort key)"
            onClick={(e) => clickSort(sortKey, e.shiftKey)}
          >
            {label}
            {sortMark(sortKey)}
          </button>
        ) : (
          label
        )}
        {filterKey && filterButton(filterKey)}
      </span>
    </th>
  );

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={cls(inputCls, "w-64")}
          placeholder="Search title, ID, keyword…"
          value={view.q}
          onChange={(e) => update({ ...view, q: e.target.value })}
        />
        {activeFilters.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent"
          >
            <span className="font-medium">{FILTER_LABEL[k]}:</span>
            <span className="max-w-[16rem] truncate">
              {(view.filters[k] ?? []).map((v) => optionLabel(k, v, rows)).join(", ")}
            </span>
            <button type="button" className="ml-0.5 hover:text-indigo-900" onClick={() => clearFilter(k)} aria-label={`Clear ${FILTER_LABEL[k]} filter`}>
              ×
            </button>
          </span>
        ))}
        {(activeFilters.length > 0 || view.q || view.sort.length > 0) && (
          <button
            type="button"
            className="text-xs text-slate-500 hover:underline"
            onClick={() => update({ filters: {}, sort: [], q: "" })}
          >
            reset view
          </button>
        )}
        <span className="ml-auto text-sm text-slate-500">
          {filtered.length === rows.length ? `${rows.length} articles` : `${filtered.length} of ${rows.length} articles`}
        </span>
        {scope && selected.size === 0 && (
          <button type="button" className={buttonCls("secondary")} disabled={pending} onClick={() => askBuild(scope.ids)}>
            {scope.label}
          </button>
        )}
      </div>

      {/* Selection toolbar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2">
          <span className="text-sm font-medium text-accent">{selected.size} selected</span>
          {!allFilteredSelected && filtered.length > 0 && (
            <button type="button" className="text-xs text-accent underline" onClick={selectAllFiltered}>
              select all {filtered.length} matching
            </button>
          )}
          <button type="button" className={buttonCls("primary")} onClick={() => askBuild([...selected])} disabled={pending}>
            Build…
          </button>
          {selectedQueued > 0 && (
            <button
              type="button"
              className={buttonCls("secondary")}
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await cancelBuildAction(planId, [...selected]);
                  setSelected(new Set());
                  return res;
                })
              }
            >
              Cancel build
            </button>
          )}
          {selectedPlanned > 0 && (
            <button
              type="button"
              className={buttonCls("ghost")}
              onClick={sendNow}
              disabled={pending}
              title="Queue exactly these rows now: no subtopic expansion, no bottom-up order"
            >
              Produce only these now
            </button>
          )}
          <button type="button" className={buttonCls("ghost")} onClick={() => setSelected(new Set())} disabled={pending}>
            Clear
          </button>
          <span className="text-xs text-accent">
            Build takes each selected row’s whole subtopic: cluster articles, then the hub, then the pillar page.
          </span>
        </div>
      )}

      {confirm && (
        <BuildConfirm
          summary={confirm.summary}
          pending={pending}
          onCancel={() => setConfirm(null)}
          onConfirm={doBuild}
        />
      )}

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No articles match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className={tableCls.table}>
            <thead>
              <tr>
                <th className={th}>
                  <input
                    type="checkbox"
                    aria-label="Select all matching"
                    checked={allFilteredSelected}
                    onChange={selectAllFiltered}
                  />
                </th>
                {header({ label: "#", sortKey: "sequence" })}
                {header({ label: "ID", sortKey: "id" })}
                {header({ label: "Pillar", sortKey: "pillar", filterKey: "pillar" })}
                {header({ label: "Subtopic", sortKey: "subtopic", filterKey: "subtopic" })}
                {header({ label: "Title", sortKey: "title" })}
                {header({ label: "Role", sortKey: "role", filterKey: "role" })}
                {header({ label: "Intent", sortKey: "intent", filterKey: "intent" })}
                {header({ label: "Type", sortKey: "type", filterKey: "type" })}
                {header({ label: "Funnel", sortKey: "funnel", filterKey: "funnel" })}
                {header({ label: "P", sortKey: "priority", filterKey: "priority" })}
                <th className={th}>Keyword target</th>
                <th className={cls(th, "whitespace-nowrap")}>
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      className="uppercase tracking-wide hover:text-slate-800"
                      title="Sort (shift-click to add a sort key)"
                      onClick={(e) => clickSort("status", e.shiftKey)}
                    >
                      Status{sortMark("status")}
                    </button>
                    {filterButton("status")}
                    <span className="ml-1">Build</span>
                    {filterButton("build")}
                  </span>
                </th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, shown).map((r) => (
                <tr key={r.id} className={cls(tableCls.tr, selected.has(r.id) && "bg-indigo-50/50")}>
                  <td className={td}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.title}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      disabled={pending}
                    />
                  </td>
                  <td className={cls(td, "tabular-nums text-slate-400")}>{r.sequence}</td>
                  <td className={cls(td, "whitespace-nowrap font-mono text-xs text-slate-500")}>{r.externalId}</td>
                  <td className={cls(td, "max-w-[8rem] truncate text-xs text-slate-600")} title={r.pillarName}>
                    {r.pillarName}
                  </td>
                  <td className={cls(td, "max-w-[8rem] truncate text-xs text-slate-600")} title={r.subtopicName ?? ""}>
                    {r.subtopicName ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className={cls(td, "min-w-[13rem]")}>
                    <div className="font-medium text-slate-800" title={r.slug}>{r.title}</div>
                    {editingPath === r.id ? (
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          className={cls(inputCls, "w-80 py-0.5 font-mono text-xs")}
                          value={pathDraft}
                          autoFocus
                          onChange={(e) => setPathDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              setEditingPath(null);
                              run(() => setItemPath(r.id, pathDraft));
                            }
                            if (e.key === "Escape") setEditingPath(null);
                          }}
                        />
                        <button
                          type="button"
                          className={buttonCls("ghost")}
                          onClick={() => {
                            setEditingPath(null);
                            run(() => setItemPath(r.id, pathDraft));
                          }}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      r.path && (
                        <button
                          type="button"
                          className="mt-0.5 block text-left font-mono text-xs text-slate-500 hover:text-accent"
                          disabled={pending || Boolean(r.articleSlug)}
                          title={r.articleSlug ? "In production — the URL is fixed" : "Edit the reserved /learn/ path"}
                          onClick={() => {
                            setEditingPath(r.id);
                            setPathDraft(r.path ?? "");
                          }}
                        >
                          {r.path}
                        </button>
                      )
                    )}
                    {r.lastError && <div className="mt-0.5 text-xs text-red-600">{r.lastError}</div>}
                  </td>
                  <td className={td}>
                    <RoleBadge role={r.pageRole} />
                  </td>
                  <td className={td}>
                    <IntentBadge intent={r.searchIntent} />
                  </td>
                  <td className={td}>
                    <TypeBadge label={r.articleTypeLabel} />
                  </td>
                  <td className={td}>
                    <FunnelBadge funnel={r.funnel} />
                  </td>
                  <td className={cls(td, "tabular-nums text-slate-500")}>P{r.priority}</td>
                  <td className={cls(td, "min-w-[8rem]")}>
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
                        disabled={pending || Boolean(r.articleSlug)}
                      >
                        <span className={r.needsQueryTarget ? "text-amber-700" : "text-slate-700"}>
                          {r.primaryQueryTarget || "—"}
                        </span>
                        {r.needsQueryTarget && <span className="ml-1 text-xs text-amber-600">needs a human</span>}
                      </button>
                    )}
                  </td>
                  <td className={cls(td, "min-w-[8rem]")}>
                    <div className="flex flex-col items-start gap-1">
                      <span className="inline-flex flex-wrap gap-1">
                        <PlanItemStatusBadge status={r.status} />
                        {r.buildQueued && (r.status === "planned" || r.status === "failed") && (
                          <span
                            className="inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700"
                            title="Queued for build: it starts as soon as the pages under it are produced"
                          >
                            {r.waiting ? "in build" : "in build · next"}
                          </span>
                        )}
                      </span>
                      {r.waiting && (r.status === "planned" || r.status === "failed") && (
                        <span className={cls("text-xs", r.buildQueued ? "text-slate-600" : "text-slate-400")}>{r.waiting}</span>
                      )}
                      {r.articleStage && r.status !== "planned" && (
                        <span className="text-xs text-slate-500">article: {r.articleStage}</span>
                      )}
                      {r.held && <HoldBadge kind={r.held.kind} reason={r.held.reason} />}
                      {r.publishedUrl && (
                        <a href={r.publishedUrl} target="_blank" rel="noopener" className="text-xs text-emerald-700 hover:underline">
                          live ↗
                        </a>
                      )}
                    </div>
                  </td>
                  <td className={cls(td, "whitespace-nowrap text-xs [&>*]:block [&>*]:py-0.5")}>
                    {r.articleSlug && (
                      <Link href={`/production/review/${r.articleSlug}`} className="mr-2 text-accent hover:underline">
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
                    {r.status === "planned" && r.hasChildren && r.waiting && (
                      <button
                        type="button"
                        className="text-slate-400 hover:underline"
                        disabled={pending}
                        title="Produce this without waiting for the pages under it"
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
          {filtered.length > shown && (
            <div className="border-t border-slate-100 px-3 py-2 text-center">
              <button type="button" className="text-sm text-accent hover:underline" onClick={() => setShown(filtered.length)}>
                Show all {filtered.length} ({filtered.length - shown} more)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── filter popover ───────────────────────────────────────────────────────

function FilterButton({
  k,
  active,
  open,
  onOpen,
  onClose,
  options,
  selected,
  onToggle,
  onClear,
}: {
  k: FilterKey;
  active: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  options: { value: string; label: string; count: number }[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  // Fixed, not absolute: the table scrolls horizontally, and an absolute
  // popover would be clipped by that container on a short filtered table.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const r = button.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 296) });
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // The page moved under a fixed panel: close rather than float detached.
    const onScroll = (e: Event) => {
      if (panel.current && e.target instanceof Node && panel.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
    // onClose changes identity every render; the listeners only need `open`.
  }, [open]);

  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <span ref={ref} className="relative normal-case tracking-normal">
      <button
        ref={button}
        type="button"
        onClick={onOpen}
        aria-label={`Filter by ${FILTER_LABEL[k]}`}
        aria-expanded={open}
        className={cls(
          "rounded px-1 text-[10px] leading-4",
          active ? "bg-accent text-white" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700",
        )}
      >
        {active ? active : "▾"}
      </button>
      {open && pos && (
        <div
          ref={panel}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-30 w-72 rounded-lg border border-slate-200 bg-white p-2 text-left font-normal shadow-lg"
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">{FILTER_LABEL[k]}</span>
            {active > 0 && (
              <button type="button" className="text-xs text-accent hover:underline" onClick={onClear}>
                clear
              </button>
            )}
          </div>
          {options.length > 8 && (
            <input
              className={cls(inputCls, "mb-1.5 w-full py-1 text-xs")}
              placeholder="Find…"
              value={q}
              autoFocus
              onChange={(e) => setQ(e.target.value)}
            />
          )}
          <ul className="max-h-72 overflow-y-auto">
            {shown.map((o) => (
              <li key={o.value}>
                <label
                  className={cls(
                    "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50",
                    o.count === 0 && !selected.includes(o.value) && "text-slate-400",
                  )}
                >
                  <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
                  <span className="min-w-0 flex-1 truncate text-slate-700" title={o.label}>{o.label}</span>
                  <span className="tabular-nums text-slate-400">{o.count}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-1.5 py-1 text-xs text-slate-400">No values.</li>}
          </ul>
        </div>
      )}
    </span>
  );
}

// ── build confirmation ───────────────────────────────────────────────────

function BuildConfirm({
  summary,
  pending,
  onCancel,
  onConfirm,
}: {
  summary: UiBuildSummary;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { byRole } = summary;
  const parts = [
    byRole.cluster && `${byRole.cluster} cluster article${byRole.cluster === 1 ? "" : "s"}`,
    byRole.hub && `${byRole.hub} hub${byRole.hub === 1 ? "" : "s"}`,
    byRole.pillar && `${byRole.pillar} pillar page${byRole.pillar === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const others = [
    summary.alreadyProduced && `${summary.alreadyProduced} already produced`,
    summary.inProgress && `${summary.inProgress} in production`,
    summary.alreadyQueued && `${summary.alreadyQueued} already queued`,
    summary.held && `${summary.held} held (hand send, fact sheet or not produced here)`,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">
        {summary.toQueue ? `Build ${parts.join(", ")}?` : "Nothing new to build"}
      </h3>
      <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
        {summary.subtopics.slice(0, 8).map((s) => (
          <li key={`${s.pillarName}/${s.subtopicName}`}>
            <span className="text-slate-400">{s.pillarName} ›</span> {s.subtopicName ?? "(pillar-level articles)"}:{" "}
            {s.clusters} article{s.clusters === 1 ? "" : "s"}
            {s.hub ? ", then the hub" : ""}
          </li>
        ))}
        {summary.subtopics.length > 8 && <li className="text-slate-400">…and {summary.subtopics.length - 8} more subtopics</li>}
        {summary.pillarPages.map((t) => (
          <li key={t}>
            Then <span className="font-medium">{t}</span>, once every hub in its pillar is built.
          </li>
        ))}
      </ul>
      {others.length > 0 && <p className="mt-2 text-xs text-slate-500">Also in scope: {others.join(" · ")}.</p>}
      {summary.toQueue > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Estimated ${summary.estimatedCostUsd.toFixed(0)} at ${summary.costPerArticle.toFixed(2)} an article
          {summary.costFromPlan ? " (this plan’s average so far)" : " (from the acceptance run)"}. Runs up to the plan’s
          in-flight limit at a time, and stops at review: the subtopic goes live together once every page in it is approved.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {summary.toQueue > 0 && (
          <button type="button" className={buttonCls("primary")} disabled={pending} onClick={onConfirm}>
            Queue build
          </button>
        )}
        <button type="button" className={buttonCls("secondary")} disabled={pending} onClick={onCancel}>
          {summary.toQueue > 0 ? "Cancel" : "Close"}
        </button>
      </div>
    </div>
  );
}
