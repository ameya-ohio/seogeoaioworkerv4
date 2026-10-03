import Link from "next/link";
import type { Stage, WorkStage } from "@blogagent/engine";
import { ChevronRight, Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * The app's own primitives (apps/web/DESIGN.md): page frame, status
 * families, phase stepper, segmented controls, cards and empty states.
 * shadcn components live in ./ui/*; this file composes them into the
 * vocabulary every screen shares.
 */

export function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ── buttons (legacy string API over the shadcn variants) ─────────────────

const LEGACY_VARIANT = {
  primary: "default",
  secondary: "secondary",
  danger: "destructive",
  ghost: "ghost",
  tinted: "tinted",
  needs: "needs",
} as const;

export type ButtonVariant = keyof typeof LEGACY_VARIANT;

export function buttonCls(variant: ButtonVariant = "primary", extra?: string): string {
  return cn(buttonVariants({ variant: LEGACY_VARIANT[variant] }), extra);
}

// ── page frame ───────────────────────────────────────────────────────────

export interface Crumb {
  label: React.ReactNode;
  href?: string;
}

/** The sticky, translucent toolbar every page starts with. */
export function Toolbar({
  crumbs,
  actions,
  center,
}: {
  crumbs: Crumb[];
  actions?: React.ReactNode;
  center?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 border-b-[0.5px] border-separator-strong bg-bar px-5 py-2 backdrop-blur-xl backdrop-saturate-[1.8] md:px-6">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-[1_1_220px]">
        <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className={cn("flex min-w-0 items-center gap-1.5", !last && "shrink-0")}>
                {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-label-3" />}
                {last || !c.href ? (
                  <span aria-current={last ? "page" : undefined} className={cn("truncate", last ? "font-semibold text-label" : "text-label-2")}>
                    {c.label}
                  </span>
                ) : (
                  <Link href={c.href} className="truncate text-label-2 hover:text-label hover:underline">
                    {c.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {center}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const WIDTH = {
  narrow: "max-w-[760px]",
  default: "max-w-[1200px]",
  wide: "max-w-[1480px]",
  full: "max-w-none",
} as const;

/**
 * One page: toolbar, then a centered column with the large title.
 * `bleed` hands the area under the toolbar to the page (editors, panes).
 */
export function Page({
  crumbs,
  title,
  subtitle,
  eyebrow,
  actions,
  headerActions,
  center,
  width = "default",
  bleed = false,
  children,
}: {
  crumbs?: Crumb[];
  title?: string;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** Toolbar actions (top right). */
  actions?: React.ReactNode;
  /** Actions beside the large title. */
  headerActions?: React.ReactNode;
  center?: React.ReactNode;
  width?: keyof typeof WIDTH;
  bleed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Toolbar crumbs={crumbs ?? [{ label: title ?? "" }]} actions={actions} center={center} />
      {bleed ? (
        children
      ) : (
        <div className={cn("mx-auto w-full px-4 pt-7 pb-16 sm:px-6 md:px-10", WIDTH[width])}>
          {title && <PageHeader title={title} subtitle={subtitle} eyebrow={eyebrow} actions={headerActions} />}
          {children}
        </div>
      )}
    </>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow && <p className="text-[13px] font-semibold text-label-2">{eyebrow}</p>}
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.02em] text-balance">{title}</h1>
        {subtitle && <p className="max-w-[68ch] text-[15px] leading-5 text-label-2 text-pretty">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Section title inside a page (Title style, 20/26). */
export function SectionHeader({
  title,
  count,
  actions,
  className,
}: {
  title: React.ReactNode;
  count?: number;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-3", className)}>
      <h2 className="flex items-baseline gap-2 text-xl leading-[26px] font-semibold tracking-[-0.01em]">
        {title}
        {count !== undefined && <span className="font-medium text-label-2 tabular-nums">{count}</span>}
      </h2>
      {actions}
    </div>
  );
}

/** Small all-caps label. Use sparingly. */
export function Caption({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[11px] leading-[14px] font-semibold tracking-[0.04em] text-label-2 uppercase", className)}>{children}</p>;
}

/** Inline navigation link with a chevron ("Open Production ›"). */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-[13px] font-medium text-primary hover:underline">
      {children}
      <ChevronRight className="size-3.5" />
    </Link>
  );
}

// ── surfaces ─────────────────────────────────────────────────────────────

export function Card({
  title,
  children,
  className,
  actions,
  flush = false,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  /** No body padding: lists and tables run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl bg-surface shadow-card", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b-[0.5px] border-separator px-4 py-2">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  hint,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl px-6 py-12 text-center", className)}>
      <Icon aria-hidden className="mb-1 size-9 stroke-[1.3] text-label-3" />
      <p className="text-[15px] font-semibold text-label">{title}</p>
      {hint && <p className="max-w-md text-[13px] leading-[18px] text-label-2 text-pretty">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ── segmented controls ───────────────────────────────────────────────────

export interface SegmentItem {
  key: string;
  label: React.ReactNode;
  count?: number;
  href: string;
}

/** Link-driven segmented control: each segment is a URL, so every view is server-rendered. */
export function SegmentedNav({
  items,
  active,
  label = "View",
  size = "default",
  className,
}: {
  items: SegmentItem[];
  active: string;
  label?: string;
  size?: "default" | "sm";
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("inline-flex max-w-full flex-wrap gap-0.5 rounded-[9px] bg-fill p-0.5", className)}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Link
            key={it.key}
            href={it.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] px-3 text-[13px] whitespace-nowrap transition-colors",
              size === "sm" ? "h-[26px]" : "h-7",
              on ? "bg-raised font-semibold text-label shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]" : "font-medium text-label-2 hover:text-label",
            )}
          >
            {it.label}
            {it.count !== undefined && <span className="font-medium text-label-2 tabular-nums">{it.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Legacy tab API, now a segmented control. */
export function TabNav({
  tabs,
  active,
  hrefFor,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  hrefFor: (key: string) => string;
}) {
  return (
    <SegmentedNav
      className="mb-6"
      items={tabs.map((t) => ({ key: t.key, label: t.label, href: hrefFor(t.key) }))}
      active={active}
      label="Sections"
    />
  );
}

/** A filter chip (link) with an optional count. Lighter than a segment, for long lists. */
export function FilterChip({
  href,
  active,
  children,
  count,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs whitespace-nowrap transition-colors",
        active ? "bg-primary-soft font-semibold text-primary" : "text-label-2 shadow-[inset_0_0_0_0.5px_var(--separator-strong)] hover:bg-fill-2 hover:text-label",
      )}
    >
      {children}
      {count !== undefined && count > 0 && <span className="tabular-nums opacity-70">{count}</span>}
    </Link>
  );
}

// ── status families ──────────────────────────────────────────────────────

export type StatusFamily = "idle" | "working" | "needs" | "done" | "problem";

const FAMILY = {
  idle: { dot: "bg-idle", fg: "text-label-2", pill: "bg-fill-2 text-label-2" },
  working: { dot: "bg-primary", fg: "text-primary", pill: "bg-primary-soft text-primary" },
  needs: { dot: "bg-needs", fg: "text-needs-fg", pill: "bg-needs-bg text-needs-fg" },
  done: { dot: "bg-done", fg: "text-done-fg", pill: "bg-done-bg text-done-fg" },
  problem: { dot: "bg-problem", fg: "text-problem-fg", pill: "bg-problem-bg text-problem-fg" },
} as const;

export function StatusDot({ family, pulse, className }: { family: StatusFamily; pulse?: boolean; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", FAMILY[family].dot, pulse && "pulse-dot", className)} />;
}

/** Dot + label. Colored text for the families that ask for attention. */
export function Status({
  family,
  children,
  pulse,
  colored,
  className,
}: {
  family: StatusFamily;
  children: React.ReactNode;
  pulse?: boolean;
  colored?: boolean;
  className?: string;
}) {
  const color = (colored ?? (family === "needs" || family === "problem" || family === "done")) ? FAMILY[family].fg : "text-label-2";
  return (
    <span className={cn("inline-flex items-center gap-[7px] text-[13px] font-medium whitespace-nowrap", color, className)}>
      <StatusDot family={family} pulse={pulse ?? family === "working"} />
      {children}
    </span>
  );
}

export function StatusPill({ family, children, className }: { family: StatusFamily; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap", FAMILY[family].pill, className)}>
      {children}
    </span>
  );
}

export function stageFamily(stage: string): StatusFamily {
  if (stage === "queued" || stage === "paused") return "idle";
  if (stage === "interview" || stage === "review") return "needs";
  if (stage === "approved" || stage === "published") return "done";
  if (stage === "failed") return "problem";
  return "working";
}

export const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  research: "Researching",
  interview: "Interview",
  evidence: "Checking evidence",
  outline: "Outlining",
  write: "Writing",
  hdcp: "Rewriting",
  edit: "Editing",
  verify: "Verifying",
  schema: "Schema",
  design: "Header image",
  review: "In review",
  approved: "Approved",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  paused: "Paused",
};

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}

/** An article stage as dot + label. */
export function StageBadge({ stage, pulse }: { stage: Stage | string; pulse?: boolean }) {
  const family = stageFamily(stage);
  return (
    <Status family={family} pulse={pulse ?? false}>
      {stageLabel(stage)}
    </Status>
  );
}

const KEYWORD_FAMILY: Record<string, StatusFamily> = {
  idea: "idle",
  queued: "idle",
  in_production: "working",
  in_review: "needs",
  published: "done",
  archived: "idle",
};

export function KeywordStatusBadge({ status }: { status: string }) {
  const label = status.replace("_", " ");
  return (
    <Status family={KEYWORD_FAMILY[status] ?? "idle"} pulse={false}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Status>
  );
}

// ── phase stepper ────────────────────────────────────────────────────────

export const PHASE_LABEL: Record<string, string> = {
  research: "Research",
  interview: "Interview",
  evidence: "Evidence",
  outline: "Outline",
  write: "Write",
  hdcp: "HDCP",
  edit: "Edit",
  verify: "Verify",
  schema: "Schema",
  design: "Design",
};

/** WORK_STAGES from the engine, inlined: this file is imported by client components. */
export const PHASE_ORDER: readonly WorkStage[] = ["research", "interview", "evidence", "outline", "write", "hdcp", "edit", "verify", "schema", "design"];

export type PhaseState = "done" | "current" | "waiting" | "failed" | "pending";

/**
 * Phase states for an article: everything before its stage is done, its
 * stage is current (or waiting/failed), everything after is pending.
 */
export function phaseStates(stage: string, opts: { waiting?: boolean; failedAt?: string } = {}): PhaseState[] {
  const order = PHASE_ORDER as readonly string[];
  if (stage === "queued" || stage === "paused") return order.map(() => "pending");
  if (stage === "failed") {
    const at = opts.failedAt ? order.indexOf(opts.failedAt) : -1;
    return order.map((_, i) => (at === -1 ? "pending" : i < at ? "done" : i === at ? "failed" : "pending"));
  }
  const idx = order.indexOf(stage);
  if (idx === -1) return order.map(() => "done");
  return order.map((_, i) => (i < idx ? "done" : i === idx ? (opts.waiting ? "waiting" : "current") : "pending"));
}

const DOT_STATE: Record<PhaseState, string> = {
  done: "bg-phase-done",
  current: "bg-primary pulse-dot",
  waiting: "bg-needs shadow-[0_0_0_3px_var(--needs-bg)]",
  failed: "bg-problem shadow-[0_0_0_3px_var(--problem-bg)]",
  pending: "shadow-[inset_0_0_0_1.5px_var(--separator-strong)]",
};

export function PhaseStepper({ states, size = "default" }: { states: PhaseState[]; size?: "default" | "lg" }) {
  const order = PHASE_ORDER as readonly string[];
  const done = states.filter((s) => s === "done").length;
  return (
    <span role="img" aria-label={`${done} of ${states.length} phases done`} className="inline-flex shrink-0 items-center">
      {states.map((s, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && (
            <span
              aria-hidden
              className={cn("inline-block h-[1.5px]", size === "lg" ? "w-2" : "w-1.5", states[i - 1] === "done" && s !== "pending" ? "bg-phase-done" : "bg-separator-strong")}
            />
          )}
          <span title={PHASE_LABEL[order[i] ?? ""]} className={cn("inline-block shrink-0 rounded-full", size === "lg" ? "size-[9px]" : "size-2", DOT_STATE[s])} />
        </span>
      ))}
    </span>
  );
}

// ── progress ─────────────────────────────────────────────────────────────

export function ProgressBar({ value, family = "working", className }: { value: number; family?: StatusFamily; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className={cn("block h-1.5 overflow-hidden rounded-full bg-fill", className)}>
      <span className={cn("block h-full rounded-full transition-[width] duration-500", FAMILY[family].dot)} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function ProgressRing({
  value,
  total,
  size = 40,
  stroke = 4,
  family = "working",
  label = true,
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  family?: StatusFamily;
  label?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = total > 0 ? c * (1 - value / total) : c;
  const color = { idle: "var(--idle)", working: "var(--primary)", needs: "var(--needs)", done: "var(--done)", problem: "var(--problem)" }[family];
  return (
    <span role="img" aria-label={`${value} of ${total}`} className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      {label && (
        <span className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums" style={{ fontSize: Math.max(10, Math.round(size / 4)) }}>
          {value}
        </span>
      )}
    </span>
  );
}

// ── event log ────────────────────────────────────────────────────────────

export interface LogEvent {
  id: string;
  ts: string | number | Date;
  type: string;
  message: string;
}

function eventFamily(type: string): StatusFamily {
  if (type.includes("failed") || type.includes("error")) return "problem";
  if (type.includes("awaiting") || type.includes("review") || type.includes("interview")) return "needs";
  if (type.includes("succeeded") || type.includes("completed") || type.includes("published") || type.includes("done")) return "done";
  if (type.includes("started") || type.includes("progress")) return "working";
  return "idle";
}

/** One shared activity list: time, status dot, message. */
export function EventLog({ events, empty = "No activity yet.", className }: { events: LogEvent[]; empty?: string; className?: string }) {
  if (events.length === 0) return <p className={cn("px-4 py-6 text-center text-[13px] text-label-2", className)}>{empty}</p>;
  return (
    <ul className={cn("divide-y-[0.5px] divide-separator", className)}>
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 px-4 py-2.5">
          <time className="w-14 shrink-0 pt-px text-xs text-label-2 tabular-nums">
            {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </time>
          <span className="pt-[6px]">
            <StatusDot family={eventFamily(e.type)} className="size-[7px]" />
          </span>
          <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-label">
            {e.message}
            <span className="ml-2 font-mono text-[11px] text-label-3">{e.type}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── form + table class strings (legacy API, new look) ────────────────────

export const inputCls =
  "h-8 rounded-lg border-0 bg-fill-2 px-3 text-[13px] text-label shadow-[inset_0_0_0_0.5px_var(--separator-strong)] placeholder:text-label-3 transition-shadow focus:outline-none focus:shadow-[inset_0_0_0_0.5px_var(--separator-strong),0_0_0_3px_var(--ring)] disabled:opacity-50";

export const tableCls = {
  table: "w-full border-collapse text-[13px]",
  th: "h-9 border-b-[0.5px] border-separator-strong px-3.5 text-left text-xs font-semibold whitespace-nowrap text-label-2",
  td: "border-b-[0.5px] border-separator px-3.5 py-2.5 align-middle",
  tr: "transition-colors hover:bg-fill-2",
};
