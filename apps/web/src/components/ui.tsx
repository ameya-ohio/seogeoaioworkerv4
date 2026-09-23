import Link from "next/link";
import type { Stage } from "@blogagent/engine";

export function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const BUTTON_VARIANTS = {
  primary:
    "bg-accent text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-500",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 disabled:text-slate-400",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export function buttonCls(variant: ButtonVariant = "primary", extra?: string): string {
  return cls(
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
    BUTTON_VARIANTS[variant],
    extra,
  );
}

export function Card({
  title,
  children,
  className,
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={cls("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/** Link-based tabs — the selected tab is a URL search param, so every tab is server-rendered. */
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
    <nav className="mb-5 flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={hrefFor(t.key)}
          className={cls(
            "-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors",
            t.key === active
              ? "border-accent text-accent"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

const STAGE_STYLE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-600",
  research: "bg-sky-100 text-sky-700",
  outline: "bg-cyan-100 text-cyan-700",
  write: "bg-blue-100 text-blue-700",
  edit: "bg-indigo-100 text-indigo-700",
  schema: "bg-violet-100 text-violet-700",
  design: "bg-purple-100 text-purple-700",
  review: "bg-amber-100 text-amber-800",
  approved: "bg-lime-100 text-lime-800",
  publishing: "bg-teal-100 text-teal-800",
  published: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
  paused: "bg-zinc-100 text-zinc-600",
};

export function StageBadge({ stage }: { stage: Stage | string }) {
  return (
    <span
      className={cls(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        STAGE_STYLE[stage] ?? "bg-slate-100 text-slate-600",
      )}
    >
      {stage}
    </span>
  );
}

const KEYWORD_STATUS_STYLE: Record<string, string> = {
  idea: "bg-slate-100 text-slate-600",
  queued: "bg-sky-100 text-sky-700",
  in_production: "bg-indigo-100 text-indigo-700",
  in_review: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-800",
  archived: "bg-zinc-100 text-zinc-500",
};

export function KeywordStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cls(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        KEYWORD_STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export const inputCls =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export const tableCls = {
  table: "w-full border-collapse text-sm",
  th: "border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500",
  td: "border-b border-slate-100 px-3 py-2 align-middle",
  tr: "hover:bg-slate-50",
};
