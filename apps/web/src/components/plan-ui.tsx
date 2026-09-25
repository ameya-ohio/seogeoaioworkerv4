import { cls } from "./ui";

/** Server-safe badges for plan screens (mirrors cluster-ui.tsx). */

const PLAN_STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  ready: "bg-emerald-50 text-emerald-700",
  enriching: "bg-indigo-50 text-indigo-700",
  failed: "bg-red-50 text-red-700",
  archived: "bg-slate-100 text-slate-500",
};

const ITEM_STATUS_STYLE: Record<string, string> = {
  planned: "bg-slate-100 text-slate-700",
  enqueued: "bg-indigo-50 text-indigo-700",
  in_progress: "bg-indigo-50 text-indigo-700",
  done: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  quarantined: "bg-red-100 text-red-800",
  skipped: "bg-slate-100 text-slate-500",
  slug_conflict: "bg-amber-50 text-amber-700",
};

const SCHEDULE_STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  completed: "bg-slate-100 text-slate-600",
};

const ENRICHMENT_STYLE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  done: "bg-emerald-50 text-emerald-700",
  failed: "bg-amber-50 text-amber-700",
  skipped: "bg-slate-100 text-slate-500",
};

const base = "inline-block rounded px-1.5 py-0.5 text-xs font-medium";

function Badge({ styles, value, label }: { styles: Record<string, string>; value: string; label?: string }) {
  return (
    <span className={cls(base, styles[value] ?? "bg-slate-100 text-slate-700")}>
      {label ?? value.replace(/_/g, " ")}
    </span>
  );
}

export function PlanStatusBadge({ status }: { status: string }) {
  return <Badge styles={PLAN_STATUS_STYLE} value={status} />;
}

export function PlanItemStatusBadge({ status }: { status: string }) {
  return <Badge styles={ITEM_STATUS_STYLE} value={status} />;
}

export function ScheduleStatusBadge({ status }: { status: string }) {
  return <Badge styles={SCHEDULE_STATUS_STYLE} value={status} />;
}

export function EnrichmentBadge({ state }: { state: string }) {
  // "deterministic" is the honest label for a brief that was never enriched
  // or whose enrichment was rejected — it is still complete and usable.
  const label = state === "failed" ? "deterministic" : state;
  return <Badge styles={ENRICHMENT_STYLE} value={state} label={label} />;
}

export function RoleBadge({ role }: { role: string }) {
  const label = role === "pillar" ? "pillar page" : role === "hub" ? "hub" : "article";
  const style =
    role === "pillar"
      ? "bg-indigo-50 text-indigo-700"
      : role === "hub"
        ? "bg-sky-50 text-sky-700"
        : "bg-slate-100 text-slate-600";
  return <span className={cls(base, style)}>{label}</span>;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeCadence(c: {
  daysOfWeek: number[];
  timeOfDay: string;
  timezone: string;
  batchSize: number;
}): string {
  const days = [...c.daysOfWeek].sort().map((d) => DAY_NAMES[d] ?? String(d));
  const perWeek = c.batchSize * c.daysOfWeek.length;
  return (
    `${c.batchSize} article${c.batchSize === 1 ? "" : "s"} on ${days.join(", ")} ` +
    `at ${c.timeOfDay} ${c.timezone} — about ${perWeek} a week`
  );
}

export { DAY_NAMES };
