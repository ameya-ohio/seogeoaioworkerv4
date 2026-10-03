import type { UiPlanItemRow } from "@/lib/ui-types";
import { ITEM_STATUS, ROLE_LABEL } from "../plan-ui";

/**
 * The Articles tab's view model: every workbook column is a filter (any
 * combination, AND-ed) and a sort key (several, in order). The whole view
 * lives in the URL, so a view can be bookmarked or shared.
 */

export type FilterKey = "pillar" | "subtopic" | "role" | "intent" | "type" | "funnel" | "priority" | "status" | "build";

export type SortKey = "sequence" | "id" | "title" | FilterKey;

export interface ViewState {
  filters: Partial<Record<FilterKey, string[]>>;
  sort: { key: SortKey; dir: 1 | -1 }[];
  q: string;
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

const ROLE_ORDER: Record<string, number> = { pillar: 0, hub: 1, cluster: 2 };
const FUNNEL_ORDER: Record<string, number> = { tofu: 0, mofu: 1, bofu: 2 };
const STATUS_ORDER = ["planned", "enqueued", "in_progress", "done", "failed", "quarantined", "skipped", "slug_conflict"];

export const subtopicValue = (r: UiPlanItemRow) => `${r.pillarId}/${r.subtopicId ?? ""}`;

/** Value used for filtering and grouping, per column. */
export const VALUE: Record<FilterKey, (r: UiPlanItemRow) => string> = {
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

export const FILTER_LABEL: Record<FilterKey, string> = {
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

export const FILTER_KEYS = Object.keys(FILTER_LABEL) as FilterKey[];

export const SORT_KEYS: SortKey[] = ["sequence", "id", "title", ...FILTER_KEYS];

export const SORT_LABEL: Record<SortKey, string> = {
  sequence: "Build order",
  id: "ID",
  title: "Title",
  ...FILTER_LABEL,
};

export function optionLabel(key: FilterKey, value: string, rows: UiPlanItemRow[]): string {
  if (key === "pillar") return rows.find((r) => r.pillarId === value)?.pillarName ?? value;
  if (key === "subtopic") {
    const r = rows.find((x) => subtopicValue(x) === value);
    return r?.subtopicName ?? "(pillar page)";
  }
  if (key === "role") return ROLE_LABEL[value] ?? value;
  if (key === "funnel") return value.toUpperCase();
  if (key === "status") return ITEM_STATUS[value]?.label ?? value.replace(/_/g, " ");
  if (key === "intent") return value.charAt(0).toUpperCase() + value.slice(1);
  if (key === "build") return value === "queued" ? "Queued for build" : "Not queued";
  return value;
}

export function compareBy(key: SortKey): (a: UiPlanItemRow, b: UiPlanItemRow) => number {
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
      return (a, b) => VALUE[key](a).localeCompare(VALUE[key](b), undefined, { numeric: true });
    default:
      return (a, b) => VALUE[key](a).localeCompare(VALUE[key](b));
  }
}

export function parseView(query: string): ViewState {
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

export function viewQuery(v: ViewState): string {
  const p = new URLSearchParams({ tab: "items" });
  for (const k of FILTER_KEYS) for (const val of v.filters[k] ?? []) p.append(k, val);
  for (const s of v.sort) p.append("sort", `${s.dir === -1 ? "-" : ""}${s.key}`);
  if (v.q) p.set("q", v.q);
  return p.toString();
}

export function writeView(v: ViewState): void {
  window.history.replaceState(null, "", `?${viewQuery(v)}`);
}

export function matches(r: UiPlanItemRow, v: ViewState, skip?: FilterKey): boolean {
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

/**
 * Clicking a sort key that is already in the sort cycles it in place:
 * ascending, descending, removed. A key not in the sort replaces it
 * (`add` appends it as the next key instead).
 */
export function nextSort(sort: ViewState["sort"], key: SortKey, add: boolean): ViewState["sort"] {
  const existing = sort.find((s) => s.key === key);
  if (!existing) return add ? [...sort, { key, dir: 1 }] : [{ key, dir: 1 }];
  if (existing.dir === 1) return sort.map((s) => (s.key === key ? { key, dir: -1 as const } : s));
  return sort.filter((s) => s.key !== key);
}
