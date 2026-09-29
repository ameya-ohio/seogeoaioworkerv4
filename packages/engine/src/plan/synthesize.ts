import { renderBriefMarkdown } from "../cluster/brief.js";
import type { SpokeBrief } from "../cluster/types.js";
import { deriveQueryTarget } from "./queryTarget.js";
import type { NormalizedPlanRow } from "./normalize.js";
import { normalizeHeader } from "./mapping.js";
import type { FunnelStage, PageRole, PlanConcept, PlanPillar, PlanSubtopic } from "./types.js";
import {
  facetWarnings,
  faqRangeFor,
  fillPassage,
  formatBySlug,
  isRoutingRole,
  lengthBandForFormat,
  schemaTypesForFormat,
  takeawaysFor,
  type FormatRegistry,
  type FormatSpec,
} from "../formats.js";

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
  /** D45: the format registry (standards/formats.json). */
  formats: FormatRegistry;
  /** D46: reserved site paths by externalId, when the plan computed them. */
  paths?: Map<string, string>;
}

/** Siblings listed per D35; more than this is link spam, not navigation. */
const MAX_SIBLINGS = 5;

// ── length, schema (D45: from the format registry) ─────────────────────

function formatOf(row: NormalizedPlanRow, ctx: SynthesisContext): FormatSpec {
  return formatBySlug(ctx.formats, row.articleType);
}

export function lengthBandFor(
  row: Pick<NormalizedPlanRow, "articleType" | "format" | "pageRole">,
  formats: FormatRegistry,
): { min: number; max: number; justification: string } {
  const format = formatBySlug(formats, row.articleType);
  const band = lengthBandForFormat(formats, format, row.pageRole);
  if (isRoutingRole(formats, row.pageRole)) {
    return {
      ...band,
      justification: `Hub routing page (content plan import) — routes to its children; ${format.label} sets only its framing (D47)`,
    };
  }
  return {
    ...band,
    justification: row.format
      ? `Format: ${format.label} (content plan import, formats.json)`
      : "No format given in the plan — generic band",
  };
}

/**
 * Only types `standards/schema-spec.md` documents — stamping a type the
 * Schema Builder has no spec for means it improvises or silently drops it.
 * Pass `routingTypesDocumented: false` for a company whose schema spec has
 * been edited to remove CollectionPage/ItemList.
 */
export const ROUTING_SCHEMA_TYPES = ["CollectionPage", "ItemList"] as const;

export function schemaTypesFor(
  row: Pick<NormalizedPlanRow, "articleType" | "pageRole" | "funnel">,
  formats: FormatRegistry,
  opts: { routingTypesDocumented?: boolean } = {},
): string[] {
  const format = formatBySlug(formats, row.articleType);
  const types = schemaTypesForFormat(formats, format, row.pageRole, row.funnel);
  if (opts.routingTypesDocumented === false) {
    return types.filter((t) => !(ROUTING_SCHEMA_TYPES as readonly string[]).includes(t) || format.schema.includes(t));
  }
  return types;
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

function subjectOf(row: NormalizedPlanRow): string {
  return row.subtopicName ?? row.pillarName;
}

/**
 * D33: these are a COVERAGE CONTRACT, not an outline. Each must be answered
 * somewhere as an extractable, answer-first passage; the Strategist owns the
 * narrative arc and the (declarative) headings.
 *
 * D47: a pillar is a full Pillar Guide — every sub-theme answered completely,
 * then pointed down to. A hub routes: its format frames the opening only.
 */
export function requiredPassagesFor(
  row: NormalizedPlanRow,
  rows: NormalizedPlanRow[],
  formats: FormatRegistry,
): string[] {
  const subject = subjectOf(row);
  const format = formatBySlug(formats, row.articleType);
  const vars = { subject, title: row.title };
  const fromFormat = format.passages.map((p) => fillPassage(p, vars));

  if (row.pageRole === "pillar") {
    const children = childrenOf(row, rows);
    return [
      ...fromFormat,
      ...children.map(
        (c) => `A section on ${c.subtopicName ?? c.title} that answers its own question completely, then links down to "${c.title}"`,
      ),
      `The thesis that ties these subtopics into one argument, not a list`,
    ];
  }

  if (isRoutingRole(formats, row.pageRole)) {
    const children = childrenOf(row, rows);
    return [
      ...(fromFormat[0] ? [fromFormat[0]] : []),
      `What ${subject} is, and where it sits under ${row.pillarName}`,
      ...children.map((c) => `A 2–3 sentence answer to "${c.title}", and where to go for the full treatment`),
      `Why ${subject} is worth a reader's attention now`,
    ];
  }

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

// ── facets (D45–D49) ──────────────────────────────────────────────────────

export function pageFacetsFor(row: NormalizedPlanRow, ctx: SynthesisContext): NonNullable<SpokeBrief["page"]> {
  const format = formatOf(row, ctx);
  const path = ctx.paths?.get(row.externalId);
  return {
    pageRole: row.pageRole,
    articleType: format.slug,
    articleTypeLabel: format.label,
    searchIntent: row.searchIntent,
    funnel: row.funnel,
    ...(path ? { path } : {}),
    faq: faqRangeFor(ctx.formats, format, row.pageRole, row.funnel),
    takeaways: takeawaysFor(ctx.formats, format),
    routing: isRoutingRole(ctx.formats, row.pageRole),
    competitorMode: format.competitorMode,
    signoff: format.signoff,
  };
}

/** Import warnings for combinations the build spec calls mis-tagged. */
export function facetWarningsFor(row: NormalizedPlanRow, formats: FormatRegistry): string[] {
  if (!row.format) return [];
  return facetWarnings(formatBySlug(formats, row.articleType), row.pageRole, row.funnel, row.searchIntent);
}

function siblingQueriesFor(row: NormalizedPlanRow, ctx: SynthesisContext): { title: string; query: string }[] {
  const pillar = ctx.pillars.get(row.pillarId);
  return siblingsOf(row, ctx.rows)
    .slice(0, MAX_SIBLINGS)
    .map((s) => {
      const q: { headTerm?: string; subtopicName?: string } = {};
      if (pillar?.headTerm) q.headTerm = pillar.headTerm;
      if (s.subtopicName) q.subtopicName = s.subtopicName;
      return { title: s.title, query: deriveQueryTarget(s.title, q).target };
    });
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
    h2Outline: requiredPassagesFor(row, ctx.rows, ctx.formats),
    evidence: evidenceFor(row, ctx),
    differentiationAngle: differentiationFor(row, ctx),
    internalLinks: internalLinksFor(row, ctx.rows),
    lengthBand: lengthBandFor(row, ctx.formats),
    schemaTypes: schemaTypesFor(row, ctx.formats, opts),
    priorityScore: priorityScoreFor(row.priority, sub?.tier ?? null, row.funnel),
    page: pageFacetsFor(row, ctx),
    siblingQueries: siblingQueriesFor(row, ctx),
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
  formats: FormatRegistry;
  paths?: Map<string, string>;
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
    formats: params.formats,
    ...(params.paths ? { paths: params.paths } : {}),
    defaultPersona:
      params.defaultPersona ??
      "the practitioner who owns this problem day to day (placeholder — refine at enrichment)",
  };
}
