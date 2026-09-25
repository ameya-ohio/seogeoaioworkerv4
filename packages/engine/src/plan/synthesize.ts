import { renderBriefMarkdown } from "../cluster/brief.js";
import type { SpokeBrief } from "../cluster/types.js";
import { deriveQueryTarget } from "./queryTarget.js";
import type { NormalizedPlanRow } from "./normalize.js";
import { normalizeHeader } from "./mapping.js";
import type { FunnelStage, PageRole, PlanConcept, PlanPillar, PlanSubtopic } from "./types.js";

/**
 * Build a complete SpokeBrief from one planned row, deterministically.
 *
 * This runs FIRST and ALWAYS, before any LLM call, and is pure and total: an
 * item is enqueueable whether or not enrichment ever succeeds. Enrichment
 * sharpens the prose-shaped fields; it never touches the length band, the
 * schema types, or the link graph, all of which are derived from
 * operator-authored facets and must stay auditable.
 *
 * Nothing here invents evidence. `evidence.external` carries REQUIREMENTS
 * ("a dated statistic for X, cited to the page that states it"), never a
 * statistic or a URL — the Researcher sources those live, and D34 verifies
 * every one of them against the page it is attributed to.
 */

export interface SynthesisContext {
  pillars: Map<string, PlanPillar>;
  subtopics: Map<string, PlanSubtopic>;
  /** Concepts grouped by pillarId — the proprietary-evidence allowlist. */
  conceptsByPillar: Map<string, PlanConcept[]>;
  /** Every row in the plan, so link and child computation can see the tree. */
  rows: NormalizedPlanRow[];
  companyName: string;
  /** ICP placeholder used until enrichment proposes a real persona. */
  defaultPersona: string;
}

/** Siblings listed per D35; more than this is link spam, not navigation. */
const MAX_SIBLINGS = 5;

// ── length bands (all within D31's 800–2,000 unless justified) ────────────

interface Band {
  min: number;
  max: number;
}

const ROUTING_BANDS: Record<"pillar" | "hub", Band> = {
  // A pillar page is a ROUTING page, not the retired encyclopedic 3,500–4,500
  // pillar (D31 amended that model away).
  pillar: { min: 1400, max: 2000 },
  hub: { min: 1000, max: 1600 },
};

const FORMAT_BANDS: { match: RegExp; band: Band }[] = [
  { match: /definition|explainer/i, band: { min: 800, max: 1200 } },
  { match: /integration|solution page|landing page|offer/i, band: { min: 800, max: 1200 } },
  { match: /stats|data|original research|examples|use case|listicle|tools/i, band: { min: 900, max: 1400 } },
  { match: /how-?to|checklist|template|framework/i, band: { min: 1000, max: 1600 } },
  { match: /thought leadership/i, band: { min: 1000, max: 1500 } },
  { match: /comparison|alternatives|vs\b/i, band: { min: 1200, max: 1800 } },
  { match: /deep-?dive|best practices|assessment|buyer|metrics/i, band: { min: 1400, max: 2000 } },
];

/** D31's default when a format is unmapped. */
const DEFAULT_BAND: Band = { min: 800, max: 2000 };

export function lengthBandFor(
  format: string,
  pageRole: PageRole,
): { min: number; max: number; justification: string } {
  if (pageRole === "pillar" || pageRole === "hub") {
    const band = ROUTING_BANDS[pageRole];
    return {
      ...band,
      justification: `${pageRole === "pillar" ? "Pillar" : "Hub"} routing page (content plan import) — routes to its children, never an encyclopedic guide`,
    };
  }
  const hit = FORMAT_BANDS.find((f) => f.match.test(format));
  const band = hit?.band ?? DEFAULT_BAND;
  return {
    ...band,
    justification: format
      ? `Format: ${format} (content plan import)`
      : "No format given in the plan — D31 default band",
  };
}

// ── schema ────────────────────────────────────────────────────────────────

/**
 * Only types `standards/schema-spec.md` actually documents — stamping a type
 * the Schema Builder has no spec for means it improvises or silently drops
 * it. CollectionPage and ItemList were added to that spec for routing pages;
 * pass `routingTypesDocumented: false` for a company whose schema spec has
 * been edited to remove them.
 */
export const ROUTING_SCHEMA_TYPES = ["CollectionPage", "ItemList"] as const;

export function schemaTypesFor(
  format: string,
  pageRole: PageRole,
  opts: { routingTypesDocumented?: boolean } = {},
): string[] {
  const base = ["BlogPosting", "BreadcrumbList"];
  if (pageRole === "pillar" || pageRole === "hub") {
    return opts.routingTypesDocumented === false ? base : [...base, ...ROUTING_SCHEMA_TYPES];
  }
  // A definition page is the one case where DefinedTerm is unambiguous.
  if (/definition|explainer/i.test(format)) return [...base, "DefinedTerm"];
  // FAQPage is deliberately NOT stamped: agents/strategist.md decides whether
  // an article has genuine Q&A. Pre-stamping it manufactures an obligatory
  // FAQ block on every article, which is answer-farm pressure by the back door.
  return base;
}

// ── other deterministic facets ────────────────────────────────────────────

const BUYING_STAGE: Record<FunnelStage, string> = {
  tofu: "awareness",
  mofu: "consideration",
  bofu: "decision",
};

export function buyingStageFor(funnel: FunnelStage): string {
  return BUYING_STAGE[funnel];
}

/**
 * Keep the 0–45 scale `renderBriefMarkdown` prints, so a plan brief and a
 * cluster brief read the same to the Strategist.
 */
export function priorityScoreFor(
  priority: 1 | 2 | 3,
  tier: "A" | "B" | "C" | null,
  funnel: FunnelStage,
): number {
  const base = priority === 1 ? 45 : priority === 2 ? 30 : 15;
  const tierAdjust = tier === "B" ? -3 : tier === "C" ? -6 : 0;
  const funnelAdjust = funnel === "bofu" ? 3 : 0;
  return Math.max(0, Math.min(45, base + tierAdjust + funnelAdjust));
}

// ── the tree ──────────────────────────────────────────────────────────────

function keyOf(row: NormalizedPlanRow): string {
  return row.externalId;
}

/** The row that must exist before this one: hub for a spoke, pillar for a hub. */
export function parentOf(
  row: NormalizedPlanRow,
  rows: NormalizedPlanRow[],
): NormalizedPlanRow | null {
  if (row.pageRole === "pillar") return null;
  if (row.pageRole === "hub") {
    return rows.find((r) => r.pageRole === "pillar" && r.pillarId === row.pillarId) ?? null;
  }
  const hub = rows.find(
    (r) => r.pageRole === "hub" && r.pillarId === row.pillarId && r.subtopicId === row.subtopicId,
  );
  if (hub) return hub;
  // A subtopic with no hub row falls back to the pillar page, so the article
  // still has an ancestor to link up to rather than dangling.
  return rows.find((r) => r.pageRole === "pillar" && r.pillarId === row.pillarId) ?? null;
}

export function childrenOf(
  row: NormalizedPlanRow,
  rows: NormalizedPlanRow[],
): NormalizedPlanRow[] {
  if (row.pageRole === "pillar") {
    return rows.filter((r) => r.pageRole === "hub" && r.pillarId === row.pillarId);
  }
  if (row.pageRole === "hub") {
    return rows.filter(
      (r) =>
        r.pageRole === "cluster" &&
        r.pillarId === row.pillarId &&
        r.subtopicId === row.subtopicId,
    );
  }
  return [];
}

function siblingsOf(row: NormalizedPlanRow, rows: NormalizedPlanRow[]): NormalizedPlanRow[] {
  if (row.pageRole === "cluster") {
    return rows.filter(
      (r) =>
        r.pageRole === "cluster" &&
        r.pillarId === row.pillarId &&
        r.subtopicId === row.subtopicId &&
        keyOf(r) !== keyOf(row),
    );
  }
  if (row.pageRole === "hub") {
    return rows.filter(
      (r) => r.pageRole === "hub" && r.pillarId === row.pillarId && keyOf(r) !== keyOf(row),
    );
  }
  return [];
}

/**
 * Link direction by page role:
 *   pillar  — down only (it has no parent)
 *   hub     — up to its pillar, down to its articles, sideways to co-pillar hubs
 *   cluster — up to its hub, sideways to co-subtopic articles
 */
export function internalLinksFor(
  row: NormalizedPlanRow,
  rows: NormalizedPlanRow[],
): SpokeBrief["internalLinks"] {
  const parent = parentOf(row, rows);
  const children = childrenOf(row, rows).map((c) => c.title);
  const siblings = siblingsOf(row, rows)
    .slice(0, MAX_SIBLINGS)
    .map((s) => s.title);
  const links: SpokeBrief["internalLinks"] = {
    hub: parent?.title ?? "",
    siblings,
  };
  if (children.length > 0) links.children = children;
  return links;
}

// ── required passages ─────────────────────────────────────────────────────

const FORMAT_PASSAGES: { match: RegExp; passages: (subject: string) => string[] }[] = [
  { match: /definition|explainer/i, passages: (s) => [
    `What ${s} means, in one extractable definition`,
    `How ${s} differs from the adjacent terms it gets confused with`,
    `Why ${s} matters to the reader's environment right now`,
  ] },
  { match: /comparison|alternatives|vs\b/i, passages: (s) => [
    `What each side of ${s} actually is`,
    `Where the two genuinely differ, not just in marketing terms`,
    `Which one fits which situation, stated plainly`,
  ] },
  { match: /how-?to/i, passages: (s) => [
    `What has to be true before starting ${s}`,
    `The steps for ${s}, in the order they are performed`,
    `How to confirm ${s} worked, and what to do when it did not`,
  ] },
  { match: /checklist|template|framework/i, passages: (s) => [
    `The items ${s} covers, each independently actionable`,
    `How to apply ${s} without turning it into box-ticking`,
  ] },
  { match: /listicle|tools/i, passages: (s) => [
    `What to evaluate ${s} against before looking at any vendor`,
    `Where each option genuinely fits, and where it does not`,
  ] },
  { match: /stats|data|original research/i, passages: (s) => [
    `The load-bearing numbers on ${s}, each cited to the page that states it`,
    `What the numbers do and do not support`,
  ] },
  { match: /deep-?dive|best practices|assessment|buyer|metrics/i, passages: (s) => [
    `What ${s} involves in practice`,
    `The failure modes practitioners hit with ${s}`,
    `How to judge whether ${s} is working`,
  ] },
];

function subjectOf(row: NormalizedPlanRow): string {
  return row.subtopicName ?? row.pillarName;
}

/**
 * D33: these are a COVERAGE CONTRACT, not an outline. Each must be answered
 * somewhere as an extractable, answer-first passage; the Strategist owns the
 * narrative arc and the (declarative) headings.
 */
export function requiredPassagesFor(
  row: NormalizedPlanRow,
  rows: NormalizedPlanRow[],
): string[] {
  const subject = subjectOf(row);

  if (row.pageRole === "pillar") {
    const children = childrenOf(row, rows);
    return [
      `What ${row.pillarName} covers, and who this page is for`,
      ...children.map(
        (c) => `What ${c.subtopicName ?? c.title} is, in 2–3 sentences, and where to go for the detail`,
      ),
      `The thesis that ties these subtopics into one argument, not a list`,
    ];
  }

  if (row.pageRole === "hub") {
    const children = childrenOf(row, rows);
    return [
      `What ${subject} is, and where it sits under ${row.pillarName}`,
      ...children.map((c) => `A 2–3 sentence answer to "${c.title}", and where to go for the full treatment`),
      `Why ${subject} is worth a reader's attention now`,
    ];
  }

  const hit = FORMAT_PASSAGES.find((f) => f.match.test(row.format));
  const fromFormat = hit ? hit.passages(subject) : [
    `A direct answer to "${row.title}" in the first 40–60 words`,
    `What the reader should do differently as a result`,
  ];
  return [...fromFormat, `A direct, extractable answer to "${row.title}"`];
}

// ── evidence ──────────────────────────────────────────────────────────────

function evidenceFor(
  row: NormalizedPlanRow,
  ctx: SynthesisContext,
): SpokeBrief["evidence"] {
  const subject = subjectOf(row);
  const concepts = ctx.conceptsByPillar.get(row.pillarId) ?? [];

  const proprietary: string[] = [];
  if (row.tieIn) proprietary.push(row.tieIn);
  const sub = row.subtopicId ? ctx.subtopics.get(row.subtopicId) : undefined;
  if (sub?.tieIn && sub.tieIn !== row.tieIn) proprietary.push(sub.tieIn);
  for (const c of concepts) {
    if (proprietary.length >= 6) break;
    if (!proprietary.some((p) => normalizeHeader(p) === normalizeHeader(c.term))) {
      proprietary.push(c.term);
    }
  }

  return {
    proprietary,
    // Requirements only — never a statistic, never a URL. The Researcher
    // sources these live and D34 verifies each against the page it cites.
    external: [
      {
        requirement:
          `A dated, attributable statistic about ${subject} from a primary or recognised source, ` +
          `cited to the page that states it (never to a third party quoting it).`,
      },
      {
        requirement:
          `At least one independent source that corroborates the article's central claim about ${subject}.`,
      },
    ],
    quotableStatCandidate:
      `A single quotable sentence about ${subject} that ${ctx.companyName} can stand behind — ` +
      `the Researcher must source and verify it; do not invent a number.`,
  };
}

function differentiationFor(row: NormalizedPlanRow, ctx: SynthesisContext): string {
  const parts: string[] = [];
  const pillar = ctx.pillars.get(row.pillarId);
  if (pillar?.whyWeCanOwnIt) parts.push(pillar.whyWeCanOwnIt);
  if (row.tieIn) parts.push(row.tieIn);
  const sub = row.subtopicId ? ctx.subtopics.get(row.subtopicId) : undefined;
  if (sub?.tieIn && sub.tieIn !== row.tieIn) parts.push(sub.tieIn);
  if (parts.length === 0) {
    return `${ctx.companyName}'s own position on ${subjectOf(row)} — state it plainly and back it.`;
  }
  return parts.join(" ");
}

// ── the synthesizer ───────────────────────────────────────────────────────

export interface SynthesisResult {
  brief: SpokeBrief;
  needsQueryTarget: boolean;
}

export function synthesizeBrief(
  row: NormalizedPlanRow,
  ctx: SynthesisContext,
  opts: { routingTypesDocumented?: boolean } = {},
): SynthesisResult {
  const pillar = ctx.pillars.get(row.pillarId);
  const sub = row.subtopicId ? ctx.subtopics.get(row.subtopicId) : undefined;

  const queryCtx: { headTerm?: string; subtopicName?: string } = {};
  if (pillar?.headTerm) queryCtx.headTerm = pillar.headTerm;
  if (row.subtopicName) queryCtx.subtopicName = row.subtopicName;
  // A pillar page's head term IS its query target — the one row where D32
  // derivation is trivial and the workbook already did the work.
  const derived =
    row.pageRole === "pillar" && pillar?.headTerm
      ? { target: pillar.headTerm.toLowerCase(), needsReview: false }
      : deriveQueryTarget(row.title, queryCtx);

  const withoutMarkdown: Omit<SpokeBrief, "markdown"> = {
    themeName: row.subtopicName ?? row.pillarName,
    workingTitle: row.title,
    primaryQueryTarget: derived.target,
    queryTargetAlternates: [],
    persona: ctx.defaultPersona,
    buyingStage: buyingStageFor(row.funnel),
    // No fan-out produced this brief, so there are no sub-queries. Inventing
    // them would be fabricating provenance.
    representativeSubQueries: [],
    h2Outline: requiredPassagesFor(row, ctx.rows),
    evidence: evidenceFor(row, ctx),
    differentiationAngle: differentiationFor(row, ctx),
    internalLinks: internalLinksFor(row, ctx.rows),
    lengthBand: lengthBandFor(row.format, row.pageRole),
    schemaTypes: schemaTypesFor(row.format, row.pageRole, opts),
    priorityScore: priorityScoreFor(row.priority, sub?.tier ?? null, row.funnel),
  };

  return {
    brief: { ...withoutMarkdown, markdown: renderBriefMarkdown(withoutMarkdown) },
    needsQueryTarget: derived.needsReview,
  };
}

/** Build the synthesis context from the extracted taxonomy. */
export function buildSynthesisContext(params: {
  pillars: PlanPillar[];
  subtopics: PlanSubtopic[];
  concepts: PlanConcept[];
  rows: NormalizedPlanRow[];
  companyName: string;
  defaultPersona?: string;
}): SynthesisContext {
  const conceptsByPillar = new Map<string, PlanConcept[]>();
  for (const c of params.concepts) {
    if (!c.pillarId) continue;
    const list = conceptsByPillar.get(c.pillarId);
    if (list) list.push(c);
    else conceptsByPillar.set(c.pillarId, [c]);
  }
  return {
    pillars: new Map(params.pillars.map((p) => [p.pillarId, p])),
    subtopics: new Map(params.subtopics.map((s) => [s.subtopicId, s])),
    conceptsByPillar,
    rows: params.rows,
    companyName: params.companyName,
    defaultPersona:
      params.defaultPersona ??
      "the practitioner who owns this problem day to day (placeholder — refine at enrichment)",
  };
}
