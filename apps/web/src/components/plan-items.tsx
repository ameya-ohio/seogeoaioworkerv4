"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Ban, ExternalLink, Eye, Filter, Hammer, Link2, MoreHorizontal, PanelRight, Play, RotateCcw, Search, Undo2, Unlock, X, Zap } from "lucide-react";
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
import type { UiPlanItemRow } from "@/lib/ui-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EmptyState, inputCls, stageLabel, Status, tableCls } from "./kit";
import { HOLD_LABEL, ROLE_SHORT, humanize, itemStatus } from "./plan-ui";
import { BuildConfirm } from "./plan/build-confirm";
import { BuildTag, ItemSheet, type ItemActions } from "./plan/item-sheet";
import { FilterField, SortMenu } from "./plan/items-filters";
import {
  FILTER_KEYS,
  VALUE,
  compareBy,
  matches,
  optionLabel,
  parseView,
  subtopicValue,
  writeView,
  type FilterKey,
  type FilterOption,
  type SortKey,
  type ViewState,
} from "./plan/items-model";

/**
 * The Articles tab: the content map as a table you can slice.
 *
 * The table stays narrow (page, role, format, funnel, status); every column
 * of the workbook is still a filter (any combination, AND-ed) and a sort key,
 * from the filter bar above it. The whole plan is loaded once, so filtering
 * never waits on the server, and the view lives in the URL so it can be
 * bookmarked or shared. A row opens its page details in a sheet.
 *
 * Building works on the unit that ships: selecting any row queues its whole
 * subtopic — cluster articles first, then the hub, then the pillar page once
 * every hub in the pillar is built.
 */

const PAGE = 200;

type ActionResult = { error?: string; message?: string };

export function PlanItemsTable({ planId, rows, initialQuery }: { planId: string; rows: UiPlanItemRow[]; initialQuery: string }) {
  const [view, setView] = useState<ViewState>(() => parseView(initialQuery));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [confirm, setConfirm] = useState<{ ids: string[]; summary: UiBuildSummary } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
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
    const out = {} as Record<FilterKey, FilterOption[]>;
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

  const activeFilters = FILTER_KEYS.filter((k) => view.filters[k]?.length);
  const viewChanged = activeFilters.length > 0 || Boolean(view.q) || view.sort.length > 0;

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

  const run = (fn: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else if (res.message) toast.success(res.message);
    });
  };

  const askBuild = (ids: string[]) => {
    startTransition(async () => {
      const summary = await previewBuildAction(planId, ids);
      if (summary.error) toast.error(summary.error);
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

  const sendNow = (ids: string[], clearSelection: boolean) => {
    startTransition(async () => {
      const res = await sendPlanItemsToPipeline(ids);
      if (clearSelection) setSelected(new Set());
      const parts: string[] = [];
      if (res.sent.length) parts.push(`Queued ${res.sent.length}`);
      if (res.errors.length) parts.push(`${res.errors.length} skipped`);
      if (res.sent.length || !res.errors.length) toast.success(parts.join(" · ") || "Nothing to queue");
      if (res.errors.length) toast.error(res.errors.map((e) => `${e.slug}: ${e.message}`).join("; "));
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
  const someFilteredSelected = !allFilteredSelected && filtered.some((r) => selected.has(r.id));
  const selectAllFiltered = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) for (const r of filtered) next.delete(r.id);
      else for (const r of filtered) next.add(r.id);
      return next;
    });
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const selectedPlanned = [...selected].filter((id) => byId.get(id)?.status === "planned");
  const selectedQueued = [...selected].filter((id) => byId.get(id)?.buildQueued).length;

  const itemActions: ItemActions = {
    pending,
    setTarget: (id, t) => run(() => setItemQueryTarget(id, t)),
    setPath: (id, p) => run(() => setItemPath(id, p)),
    setStatus: (id, s) => run(() => setItemStatus(id, s)),
    unblock: (id) => run(() => overrideItemDependency(id, true)),
    produceOnly: (id) => sendNow([id], false),
  };

  const activeIndex = activeId ? filtered.findIndex((r) => r.id === activeId) : -1;
  const activeRow = activeId ? (byId.get(activeId) ?? null) : null;
  const step = (delta: -1 | 1) => {
    const next = filtered[activeIndex + delta];
    if (next) {
      setActiveId(next.id);
      // Keep the open row within the rendered page.
      const at = activeIndex + delta;
      if (at >= shown) setShown(at + 1);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link to this view copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  return (
    <div className={cn("flex flex-col gap-5", selected.size > 0 && "pb-24")}>
      {/* Filter bar */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex w-full max-w-[300px] items-center sm:w-[280px]">
            <span className="sr-only">Search articles</span>
            <Search aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-label-3" />
            <input
              type="search"
              className={cn(inputCls, "w-full pl-8")}
              placeholder="Search title, ID, keyword…"
              value={view.q}
              onChange={(e) => update({ ...view, q: e.target.value })}
            />
          </label>
          <SortMenu sort={view.sort} onChange={(sort) => update({ ...view, sort })} />
          <span className="flex-1" />
          <span className="text-[13px] text-label-2 tabular-nums" aria-live="polite">
            {filtered.length === rows.length ? `${rows.length} articles` : `${filtered.length} of ${rows.length} articles`}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Copy a link to this view" onClick={copyLink}>
                <Link2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy a link to this view</TooltipContent>
          </Tooltip>
          {scope && selected.size === 0 && (
            <Button variant="secondary" disabled={pending} onClick={() => askBuild(scope.ids)}>
              <Play data-icon="inline-start" />
              {scope.label}
            </Button>
          )}
        </div>
        <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-1.5">
          <Filter aria-hidden className="mr-0.5 size-[15px] text-label-2" />
          {FILTER_KEYS.map((k) => (
            <FilterField
              key={k}
              k={k}
              options={options[k]}
              selected={view.filters[k] ?? []}
              selectedLabels={(view.filters[k] ?? []).map((v) => optionLabel(k, v, rows))}
              onToggle={(v) => toggleFilter(k, v)}
              onClear={() => clearFilter(k)}
            />
          ))}
          {viewChanged && (
            <Button variant="ghost" size="sm" onClick={() => update({ filters: {}, sort: [], q: "" })}>
              <RotateCcw data-icon="inline-start" />
              Reset view
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-surface shadow-card">
          <EmptyState
            icon={Search}
            title="No articles match these filters"
            action={
              <Button variant="secondary" onClick={() => update({ filters: {}, sort: [], q: "" })}>
                Reset view
              </Button>
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th scope="col" className={cn(tableCls.th, "w-10 pr-0")}>
                    <Checkbox
                      aria-label={`Select all ${filtered.length} matching`}
                      checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                      onCheckedChange={selectAllFiltered}
                    />
                  </th>
                  <th scope="col" className={tableCls.th}>
                    Page
                  </th>
                  <th scope="col" className={tableCls.th}>
                    Role
                  </th>
                  <th scope="col" className={tableCls.th}>
                    Format
                  </th>
                  <th scope="col" className={tableCls.th}>
                    Funnel
                  </th>
                  <th scope="col" className={tableCls.th}>
                    Status
                  </th>
                  <th scope="col" className={tableCls.th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map((r) => (
                  <ItemRow
                    key={r.id}
                    r={r}
                    checked={selected.has(r.id)}
                    active={r.id === activeId}
                    pending={pending}
                    onToggle={() => toggle(r.id)}
                    onOpen={() => setActiveId(r.id)}
                    onBuild={() => askBuild([r.id])}
                    actions={itemActions}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > shown && (
            <div className="border-t-[0.5px] border-separator px-3 py-2 text-center">
              <Button variant="ghost" className="text-primary" onClick={() => setShown(filtered.length)}>
                Show all {filtered.length} ({filtered.length - shown} more)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Selection: a floating action bar, like selection in Photos. */}
      {selected.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div
            role="toolbar"
            aria-label="Selection actions"
            className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl bg-raised py-1.5 pr-1.5 pl-4 shadow-pop"
          >
            <span className="mr-1 text-[13px] font-semibold whitespace-nowrap tabular-nums">{selected.size} selected</span>
            {!allFilteredSelected && filtered.length > 0 && (
              <Button variant="ghost" className="text-primary" onClick={selectAllFiltered}>
                Select all {filtered.length} matching
              </Button>
            )}
            {selectedPlanned.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="secondary" disabled={pending} onClick={() => sendNow(selectedPlanned, true)}>
                    <Zap data-icon="inline-start" />
                    Produce only these now
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Queue exactly these rows now: no subtopic expansion, no bottom-up order.</TooltipContent>
              </Tooltip>
            )}
            {selectedQueued > 0 && (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const res = await cancelBuildAction(planId, [...selected]);
                    setSelected(new Set());
                    return res;
                  })
                }
              >
                <Ban data-icon="inline-start" />
                Cancel build
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button disabled={pending} onClick={() => askBuild([...selected])}>
                  <Play data-icon="inline-start" />
                  Build…
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">
                Build takes each selected row’s whole subtopic: cluster articles, then the hub, then the pillar page.
              </TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="icon" aria-label="Clear selection" disabled={pending} onClick={() => setSelected(new Set())}>
              <X />
            </Button>
          </div>
        </div>
      )}

      <BuildConfirm summary={confirm?.summary ?? null} pending={pending} onCancel={() => setConfirm(null)} onConfirm={doBuild} />

      <ItemSheet
        row={activeRow}
        index={activeIndex}
        total={filtered.length}
        onClose={() => setActiveId(null)}
        onStep={step}
        actions={itemActions}
      />
    </div>
  );
}

// ── one row ───────────────────────────────────────────────────────────────

/** The single most useful line under a row's status. */
function statusNote(r: UiPlanItemRow): { text: string; tone: "problem" | "needs" | "quiet" } | null {
  const open = r.status === "planned" || r.status === "failed";
  if (r.lastError) return { text: r.lastError, tone: "problem" };
  if (r.held) return { text: HOLD_LABEL[r.held.kind] ?? r.held.kind, tone: "needs" };
  if (r.needsQueryTarget) return { text: "Needs a keyword", tone: "needs" };
  if (open && r.waiting) return { text: humanize(r.waiting), tone: "quiet" };
  if (r.articleStage && r.status !== "planned") return { text: `Article: ${stageLabel(r.articleStage).toLowerCase()}`, tone: "quiet" };
  return null;
}

function ItemRow({
  r,
  checked,
  active,
  pending,
  onToggle,
  onOpen,
  onBuild,
  actions,
}: {
  r: UiPlanItemRow;
  checked: boolean;
  active: boolean;
  pending: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onBuild: () => void;
  actions: ItemActions;
}) {
  const st = itemStatus(r.status);
  const open = r.status === "planned" || r.status === "failed";
  const note = statusNote(r);
  const retryable = r.status === "failed" || r.status === "quarantined";

  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, input, label, [role=checkbox], [role=menuitem]")) return;
        onOpen();
      }}
      className={cn(
        tableCls.tr,
        "cursor-default",
        checked && "bg-primary-soft hover:bg-primary-soft",
        active && !checked && "bg-fill shadow-[inset_3px_0_0_var(--primary)] hover:bg-fill",
      )}
    >
      <td className={cn(tableCls.td, "w-10 pr-0")}>
        <Checkbox aria-label={`Select ${r.title}`} checked={checked} onCheckedChange={onToggle} disabled={pending} />
      </td>
      <td className={cn(tableCls.td, "w-full max-w-0 min-w-[16rem]")}>
        <button type="button" onClick={onOpen} className="block max-w-full text-left text-[13px] font-semibold text-label hover:underline">
          {r.title}
        </button>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-label-2" title={r.path ?? r.slug}>
          {r.path ?? r.slug}
        </span>
      </td>
      <td className={cn(tableCls.td, "whitespace-nowrap text-label")}>{ROLE_SHORT[r.pageRole] ?? r.pageRole}</td>
      <td className={cn(tableCls.td, "whitespace-nowrap text-label-2")}>{r.articleTypeLabel}</td>
      <td className={cn(tableCls.td, "text-label-2")}>{r.funnel.toUpperCase()}</td>
      <td className={cn(tableCls.td, "min-w-[11rem]")}>
        <span className="flex flex-wrap items-center gap-2">
          <Status family={st.family}>{st.label}</Status>
          {r.buildQueued && open && <BuildTag next={!r.waiting} />}
        </span>
        {note && (
          <span
            title={note.text}
            className={cn(
              "mt-0.5 block max-w-[16rem] truncate pl-[15px] text-xs",
              note.tone === "problem" ? "text-problem-fg" : note.tone === "needs" ? "text-needs-fg" : "text-label-2",
            )}
          >
            {note.text}
          </span>
        )}
      </td>
      <td className={cn(tableCls.td, "text-right whitespace-nowrap")}>
        <span className="inline-flex items-center gap-1">
          {r.articleSlug ? (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/production/review/${r.articleSlug}`}>Review</Link>
            </Button>
          ) : retryable ? (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => actions.setStatus(r.id, "planned")}>
              Retry
            </Button>
          ) : r.status === "skipped" ? (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => actions.setStatus(r.id, "planned")}>
              Restore
            </Button>
          ) : null}
          <RowMenu r={r} pending={pending} onOpen={onOpen} onBuild={onBuild} actions={actions} />
        </span>
      </td>
    </tr>
  );
}

function RowMenu({
  r,
  pending,
  onOpen,
  onBuild,
  actions,
}: {
  r: UiPlanItemRow;
  pending: boolean;
  onOpen: () => void;
  onBuild: () => void;
  actions: ItemActions;
}) {
  const retryable = r.status === "failed" || r.status === "quarantined";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${r.title}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onOpen}>
          <PanelRight />
          Show details
        </DropdownMenuItem>
        {r.articleSlug && (
          <DropdownMenuItem asChild>
            <Link href={`/production/review/${r.articleSlug}`}>
              <Eye />
              Open in review
            </Link>
          </DropdownMenuItem>
        )}
        {r.publishedUrl && (
          <DropdownMenuItem asChild>
            <a href={r.publishedUrl} target="_blank" rel="noopener">
              <ExternalLink />
              Open live page
            </a>
          </DropdownMenuItem>
        )}
        {(r.status === "planned" || r.status === "failed") && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={pending} onSelect={onBuild}>
              <Hammer />
              Build its subtopic…
            </DropdownMenuItem>
          </>
        )}
        {r.status === "planned" && (
          <DropdownMenuItem disabled={pending} onSelect={() => actions.produceOnly(r.id)}>
            <Zap />
            Produce only this now
          </DropdownMenuItem>
        )}
        {r.status === "planned" && r.hasChildren && r.waiting && (
          <DropdownMenuItem disabled={pending} onSelect={() => actions.unblock(r.id)}>
            <Unlock />
            Unblock (don’t wait for pages under it)
          </DropdownMenuItem>
        )}
        {retryable && (
          <DropdownMenuItem disabled={pending} onSelect={() => actions.setStatus(r.id, "planned")}>
            <RotateCcw />
            Retry
          </DropdownMenuItem>
        )}
        {r.status === "skipped" && (
          <DropdownMenuItem disabled={pending} onSelect={() => actions.setStatus(r.id, "planned")}>
            <Undo2 />
            Restore
          </DropdownMenuItem>
        )}
        {r.status === "planned" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={pending} onSelect={() => actions.setStatus(r.id, "skipped")}>
              <Ban />
              Skip
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
