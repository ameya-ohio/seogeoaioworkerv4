import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Caption, Status, StatusPill, type StatusFamily } from "./kit";

/**
 * Server-safe vocabulary for the plan screens: status families and labels
 * for plans, plan items, cadences and releases, plus the settings-style
 * group/row layout and the import stepper. No hooks here, so both server
 * pages and client components can use it.
 */

// ── plan status ──────────────────────────────────────────────────────────

const PLAN_STATUS: Record<string, { family: StatusFamily; label: string }> = {
  draft: { family: "needs", label: "Draft" },
  enriching: { family: "working", label: "Sharpening briefs" },
  ready: { family: "done", label: "Ready" },
  failed: { family: "problem", label: "Failed" },
  archived: { family: "idle", label: "Archived" },
};

export function PlanStatusBadge({ status }: { status: string }) {
  const s = PLAN_STATUS[status] ?? { family: "idle" as const, label: humanize(status) };
  return <StatusPill family={s.family}>{s.label}</StatusPill>;
}

// ── plan item status ─────────────────────────────────────────────────────

export const ITEM_STATUS: Record<string, { family: StatusFamily; label: string }> = {
  planned: { family: "idle", label: "Planned" },
  enqueued: { family: "working", label: "Queued" },
  in_progress: { family: "working", label: "In progress" },
  done: { family: "done", label: "Done" },
  failed: { family: "problem", label: "Failed" },
  quarantined: { family: "problem", label: "Quarantined" },
  skipped: { family: "idle", label: "Skipped" },
  slug_conflict: { family: "needs", label: "Slug conflict" },
};

export function itemStatus(status: string): { family: StatusFamily; label: string } {
  return ITEM_STATUS[status] ?? { family: "idle", label: humanize(status) };
}

/** Dot + label: the plan item's status, as rows show it. */
export function PlanItemStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = itemStatus(status);
  return (
    <Status family={s.family} className={className}>
      {s.label}
    </Status>
  );
}

// ── cadence status ───────────────────────────────────────────────────────

const SCHEDULE_STATUS: Record<string, { family: StatusFamily; label: string }> = {
  active: { family: "done", label: "Running" },
  paused: { family: "needs", label: "Paused" },
  completed: { family: "idle", label: "Completed" },
};

export function scheduleStatus(status: string): { family: StatusFamily; label: string } {
  return SCHEDULE_STATUS[status] ?? { family: "idle", label: humanize(status) };
}

export function ScheduleStatusBadge({ status }: { status: string }) {
  const s = scheduleStatus(status);
  return <StatusPill family={s.family}>{s.label}</StatusPill>;
}

// ── enrichment, role, hold ───────────────────────────────────────────────

export function EnrichmentBadge({ state }: { state: string }) {
  // "deterministic" is the honest label for a brief that was never enriched
  // or whose enrichment was rejected — it is still complete and usable.
  const map: Record<string, { family: StatusFamily; label: string }> = {
    pending: { family: "idle", label: "Pending" },
    done: { family: "done", label: "Sharpened" },
    failed: { family: "idle", label: "Deterministic" },
    skipped: { family: "idle", label: "Skipped" },
  };
  const s = map[state] ?? { family: "idle" as const, label: humanize(state) };
  return (
    <Status family={s.family} pulse={false}>
      {s.label}
    </Status>
  );
}

export const ROLE_LABEL: Record<string, string> = {
  pillar: "Pillar page",
  hub: "Subtopic hub",
  cluster: "Cluster article",
};

export const ROLE_SHORT: Record<string, string> = {
  pillar: "Pillar",
  hub: "Hub",
  cluster: "Article",
};

/** Quiet role label: roles are structure, not status, so they carry no color. */
export function RoleBadge({ role, short = false }: { role: string; short?: boolean }) {
  return <span className="text-[13px] whitespace-nowrap text-label-2">{(short ? ROLE_SHORT : ROLE_LABEL)[role] ?? role}</span>;
}

export const HOLD_LABEL: Record<string, string> = {
  signoff: "Hand send and sign-off",
  fact_sheet: "Needs a fact sheet",
  dataset: "Needs a dataset",
  not_producible: "Not produced here",
};

export const FUNNEL_LABEL: Record<string, string> = {
  tofu: "Top of funnel",
  mofu: "Middle of funnel",
  bofu: "Bottom of funnel",
};

// ── cadence copy ─────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon, Wed and Fri", "every day", "weekdays". */
export function describeDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "every day";
  if (sorted.join() === "1,2,3,4,5") return "weekdays";
  if (sorted.join() === "0,6") return "weekends";
  const names = sorted.map((d) => DAY_NAMES[d] ?? String(d));
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function describeCadence(c: {
  daysOfWeek: number[];
  timeOfDay: string;
  timezone: string;
  batchSize: number;
}): string {
  const perWeek = c.batchSize * c.daysOfWeek.length;
  const days = describeDays(c.daysOfWeek);
  const on = days === "every day" ? days : `on ${days}`;
  return (
    `${c.batchSize} article${c.batchSize === 1 ? "" : "s"} ${on} at ${c.timeOfDay} ${c.timezone}, ` +
    `about ${perWeek} a week`
  );
}

export { DAY_NAMES };

// ── release state ────────────────────────────────────────────────────────

export const RELEASE_STATE: Record<string, { family: StatusFamily; label: string }> = {
  planned: { family: "idle", label: "Not started" },
  building: { family: "working", label: "Building" },
  in_review: { family: "needs", label: "In review" },
  ready: { family: "done", label: "Ready to ship" },
  partly_live: { family: "needs", label: "Partly live" },
  live: { family: "done", label: "Live" },
};

// ── layout helpers ───────────────────────────────────────────────────────

/** A titled group of settings rows, like macOS System Settings. */
export function SettingsGroup({
  title,
  footer,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-1.5", className)}>
      {(title || actions) && (
        <div className="flex items-baseline justify-between gap-3 px-4">
          {title && <Caption>{title}</Caption>}
          {actions}
        </div>
      )}
      <div className="overflow-hidden rounded-xl bg-surface shadow-card">{children}</div>
      {footer && <p className="px-4 pt-0.5 text-xs leading-4 text-label-2 text-pretty">{footer}</p>}
    </section>
  );
}

/** One row: label (and hint) on the left, its control on the right. */
export function SettingsRow({
  label,
  hint,
  htmlFor,
  children,
  stack = false,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  children?: React.ReactNode;
  /** Put the control under the label (wide controls). */
  stack?: boolean;
  className?: string;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div
      className={cn(
        "flex min-h-12 border-b-[0.5px] border-separator px-4 py-2.5 last:border-0",
        stack ? "flex-col gap-2" : "flex-wrap items-center gap-x-5 gap-y-2",
        className,
      )}
    >
      <span className={cn("flex min-w-0 flex-col gap-0.5", !stack && "flex-[1_1_200px]")}>
        <Label htmlFor={htmlFor} className="text-[13px] font-medium text-label">
          {label}
        </Label>
        {hint && <span className="text-xs leading-4 text-label-2 text-pretty">{hint}</span>}
      </span>
      {children !== undefined && (
        <span className={cn("flex min-w-0 items-center gap-2", !stack && "flex-[0_1_auto] justify-end")}>{children}</span>
      )}
    </div>
  );
}

/** A tinted note: a hold, a pause, a re-export reminder. */
export function Callout({
  family = "needs",
  icon: Icon,
  title,
  children,
  className,
}: {
  family?: "needs" | "problem" | "working";
  icon?: LucideIcon;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const tone = {
    needs: { box: "bg-needs-bg", fg: "text-needs-fg" },
    problem: { box: "bg-problem-bg", fg: "text-problem-fg" },
    working: { box: "bg-primary-soft", fg: "text-primary" },
  }[family];
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl px-3.5 py-3", tone.box, className)}>
      {Icon && <Icon aria-hidden className={cn("mt-px size-4 shrink-0", tone.fg)} />}
      <div className="flex min-w-0 flex-col gap-0.5 text-[13px] leading-[18px]">
        {title && <span className={cn("font-semibold", tone.fg)}>{title}</span>}
        {children && <div className="text-label">{children}</div>}
      </div>
    </div>
  );
}

/** Upload → Map columns → Confirm, for a draft plan. */
export function ImportSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Upload", "Map columns", "Confirm"];
  return (
    <ol aria-label="Import steps" className="flex items-center gap-2.5">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={label} className={cn("flex items-center gap-2.5", i > 0 && "min-w-0 flex-1")}>
            {i > 0 && <span aria-hidden className="h-[1.5px] min-w-5 flex-1 bg-separator-strong" />}
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 text-[13px] whitespace-nowrap",
                state === "current" ? "font-semibold text-label" : state === "done" ? "font-medium text-label" : "font-medium text-label-2",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  state === "done" && "bg-primary text-primary-foreground",
                  state === "current" && "text-primary shadow-[inset_0_0_0_2px_var(--primary)]",
                  state === "todo" && "text-label-2 shadow-[inset_0_0_0_1.5px_var(--separator-strong)]",
                )}
              >
                {state === "done" ? <Check aria-hidden className="size-3.5 stroke-[2.6]" /> : n}
              </span>
              {label}
              {state === "done" && <span className="sr-only">(done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A quiet number tile: big tabular value, small label. */
export function StatTile({ label, value, family }: { label: string; value: number; family?: StatusFamily }) {
  const tone = family === "needs" ? "text-needs-fg" : family === "problem" ? "text-problem-fg" : "text-label";
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-fill-2 px-3.5 py-2.5">
      <span className={cn("text-xl leading-7 font-semibold tabular-nums", value > 0 ? tone : "text-label")}>{value}</span>
      <span className="truncate text-xs text-label-2">{label}</span>
    </div>
  );
}

export function humanize(v: string): string {
  const s = v.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
