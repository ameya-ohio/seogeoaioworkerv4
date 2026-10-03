import { cls } from "./kit";

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

const base = "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap";

/** Human label for a funnel stage ("Top of funnel"), for prose and meta lines. */
export const FUNNEL_LONG: Record<string, string> = {
  tofu: "Top of funnel",
  mofu: "Middle of funnel",
  bofu: "Bottom of funnel",
};

export function FunnelBadge({ funnel }: { funnel: string }) {
  return (
    <span className={cls(base, "bg-fill-2 text-label-2 tracking-[0.02em]")} title={FUNNEL_LONG[funnel]}>
      {funnel.toUpperCase()}
    </span>
  );
}

export function IntentBadge({ intent }: { intent: string }) {
  return <span className={cls(base, "bg-transparent px-1 font-medium text-label-2 capitalize")}>{intent}</span>;
}

export function TypeBadge({ label }: { label: string }) {
  return <span className={cls(base, "bg-fill text-label")}>{label}</span>;
}

const HOLD_STYLE: Record<string, string> = {
  signoff: "bg-needs-bg text-needs-fg",
  fact_sheet: "bg-needs-bg text-needs-fg",
  dataset: "bg-needs-bg text-needs-fg",
  not_producible: "bg-fill-2 text-label-2",
};

const HOLD_LABEL: Record<string, string> = {
  signoff: "Hand send + sign-off",
  fact_sheet: "Needs fact sheet",
  dataset: "Needs dataset",
  not_producible: "Not produced",
};

export function HoldBadge({ kind, reason }: { kind: string; reason: string }) {
  return (
    <span className={cls(base, HOLD_STYLE[kind] ?? "bg-fill-2 text-label-2")} title={reason}>
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
