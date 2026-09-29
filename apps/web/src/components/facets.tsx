import { cls } from "./ui";

/**
 * Page facets (D45–D49) as badges, shared by the plan, production, articles
 * and review screens. Values are the engine's canonical enums; labels live
 * here once so every screen says the same thing.
 */

export const FACET_OPTIONS = {
  pageRole: [
    { value: "pillar", label: "Pillar page" },
    { value: "hub", label: "Subtopic hub" },
    { value: "cluster", label: "Cluster article" },
  ],
  searchIntent: [
    { value: "informational", label: "Informational" },
    { value: "commercial", label: "Commercial" },
    { value: "transactional", label: "Transactional" },
    { value: "navigational", label: "Navigational" },
  ],
  funnel: [
    { value: "tofu", label: "TOFU" },
    { value: "mofu", label: "MOFU" },
    { value: "bofu", label: "BOFU" },
  ],
} as const;

const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const FUNNEL_STYLE: Record<string, string> = {
  tofu: "bg-emerald-50 text-emerald-700",
  mofu: "bg-amber-50 text-amber-700",
  bofu: "bg-rose-50 text-rose-700",
};

export function FunnelBadge({ funnel }: { funnel: string }) {
  return <span className={cls(base, FUNNEL_STYLE[funnel] ?? "bg-slate-100 text-slate-600")}>{funnel.toUpperCase()}</span>;
}

export function IntentBadge({ intent }: { intent: string }) {
  return <span className={cls(base, "bg-slate-100 text-slate-600")}>{intent}</span>;
}

export function TypeBadge({ label }: { label: string }) {
  return <span className={cls(base, "bg-violet-50 text-violet-700")}>{label}</span>;
}

const HOLD_STYLE: Record<string, string> = {
  signoff: "bg-amber-50 text-amber-700",
  fact_sheet: "bg-orange-50 text-orange-700",
  dataset: "bg-orange-50 text-orange-700",
  not_producible: "bg-slate-100 text-slate-500",
};

const HOLD_LABEL: Record<string, string> = {
  signoff: "hand send + sign-off",
  fact_sheet: "needs fact sheet",
  dataset: "needs dataset",
  not_producible: "not produced",
};

export function HoldBadge({ kind, reason }: { kind: string; reason: string }) {
  return (
    <span className={cls(base, HOLD_STYLE[kind] ?? "bg-slate-100 text-slate-600")} title={reason}>
      {HOLD_LABEL[kind] ?? kind}
    </span>
  );
}

/** Type · funnel · intent in one row, for cards and tables. */
export function FacetBadges({
  typeLabel,
  funnel,
  intent,
}: {
  typeLabel: string;
  funnel: string;
  intent?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <TypeBadge label={typeLabel} />
      <FunnelBadge funnel={funnel} />
      {intent && <IntentBadge intent={intent} />}
    </span>
  );
}
