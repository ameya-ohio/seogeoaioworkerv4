import { extractJson, type Parsed } from "../cluster/parse.js";
import { MAX_QUERY_TARGET_WORDS } from "./queryTarget.js";

/**
 * Parse and POLICE the brief-enrichment response.
 *
 * The enrichment pass may sharpen prose-shaped fields. It may not invent
 * evidence, and it may not widen the link graph. Those are not suggestions in
 * the prompt — they are enforced here, in code, because a prompt instruction
 * that is only checked by another prompt is not a guarantee. This is the same
 * reasoning behind D34's live citation verification.
 */

export interface ParsedEnrichment {
  persona?: string;
  buyingStage?: string;
  primaryQueryTarget?: string;
  queryTargetAlternates?: string[];
  requiredPassages?: string[];
  representativeQuestions?: string[];
  differentiationAngle?: string;
  proprietaryEvidence?: string[];
  externalEvidence?: string[];
  quotableStatCandidate?: string;
}

export interface EnrichmentAllowlist {
  hub: string;
  siblings: string[];
  children: string[];
  /** The ONLY proprietary claims this article may name (D34). */
  concepts: string[];
}

/**
 * Anything that looks like a fact the model made up.
 *
 * A URL means it is citing something it never fetched. A number with a unit
 * means it is stating a statistic — and the Researcher, not the brief writer,
 * is the only role allowed to produce one, because only the Researcher's
 * claims get live-verified against the page they are attributed to.
 */
const FABRICATED_EVIDENCE =
  /(https?:\/\/)|(\b\d[\d,.]*\s*(%|percent|x\b|×|million|billion|bn\b|k\b|usd|eur|\$|€))/i;

/** A bare year or a "in 2026" style date claim is equally unsourced. */
const DATE_CLAIM = /\b(19|20)\d{2}\b/;

const MIN_REQUIRED_PASSAGES = 3;

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  return out.length > 0 ? out : undefined;
}

/** Loose containment so "shadow admins" matches "Shadow admins (AD)". */
function fuzzyIncludes(haystack: string[], needle: string): boolean {
  const n = needle.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!n) return false;
  return haystack.some((h) => {
    const x = h.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return x.includes(n) || n.includes(x);
  });
}

export function parsePlanEnrichment(
  text: string,
  allowed: EnrichmentAllowlist,
): Parsed<ParsedEnrichment> {
  const problems: string[] = [];
  const raw = extractJson(text);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { problems: ["response was not a JSON object"] };
  }
  const o = raw as Record<string, unknown>;
  const value: ParsedEnrichment = {};

  const persona = asString(o.persona);
  if (persona) value.persona = persona;
  const buyingStage = asString(o.buying_stage ?? o.buyingStage);
  if (buyingStage) value.buyingStage = buyingStage;

  // ── query target (D32) ──────────────────────────────────────────────────
  const target = asString(o.primary_query_target ?? o.primaryQueryTarget);
  if (target) {
    const words = target.split(/\s+/).filter(Boolean);
    if (words.length > MAX_QUERY_TARGET_WORDS) {
      problems.push(
        `primary_query_target "${target}" is ${words.length} words; a real query is at most ${MAX_QUERY_TARGET_WORDS}`,
      );
    } else if (/[?!.]$/.test(target)) {
      problems.push(`primary_query_target "${target}" is a sentence, not a query`);
    } else {
      value.primaryQueryTarget = target.toLowerCase();
    }
  }
  const alternates = asStringArray(o.query_target_alternates ?? o.queryTargetAlternates);
  if (alternates) {
    const tooLong = alternates.filter((a) => a.split(/\s+/).length > MAX_QUERY_TARGET_WORDS);
    if (tooLong.length > 0) {
      problems.push(`these alternates are too long to be real queries: ${tooLong.join("; ")}`);
    } else {
      value.queryTargetAlternates = alternates.map((a) => a.toLowerCase());
    }
  }

  // ── required passages (D33) ─────────────────────────────────────────────
  const passages = asStringArray(o.required_passages ?? o.requiredPassages ?? o.h2_outline);
  if (!passages || passages.length < MIN_REQUIRED_PASSAGES) {
    problems.push(
      `required_passages must have at least ${MIN_REQUIRED_PASSAGES} entries (got ${passages?.length ?? 0})`,
    );
  } else {
    value.requiredPassages = passages;
  }

  const questions = asStringArray(o.representative_questions ?? o.representativeQuestions);
  if (questions) value.representativeQuestions = questions;

  const angle = asString(o.differentiation_angle ?? o.differentiationAngle);
  if (angle) {
    if (FABRICATED_EVIDENCE.test(angle)) {
      problems.push(
        `differentiation_angle states a figure or URL ("${angle.slice(0, 80)}") — ` +
          `the brief describes what to prove, it never supplies the proof`,
      );
    } else value.differentiationAngle = angle;
  }

  // ── evidence: requirements only, never evidence (D34) ───────────────────
  const external = asStringArray(o.external_evidence ?? o.externalEvidence);
  if (external) {
    const offenders = external.filter((e) => FABRICATED_EVIDENCE.test(e) || DATE_CLAIM.test(e));
    if (offenders.length > 0) {
      problems.push(
        `external_evidence must state REQUIREMENTS, not facts. These contain a figure, date or URL: ` +
          offenders.map((e) => `"${e.slice(0, 80)}"`).join("; "),
      );
    } else value.externalEvidence = external;
  }

  const quotable = asString(o.quotable_stat_candidate ?? o.quotableStatCandidate);
  if (quotable) {
    if (FABRICATED_EVIDENCE.test(quotable) || DATE_CLAIM.test(quotable)) {
      problems.push(
        `quotable_stat_candidate must describe the SHAPE of a claim to source, not state one: "${quotable.slice(0, 80)}"`,
      );
    } else value.quotableStatCandidate = quotable;
  }

  const proprietary = asStringArray(o.proprietary_evidence ?? o.proprietaryEvidence);
  if (proprietary) {
    const invented = proprietary.filter((p) => !fuzzyIncludes(allowed.concepts, p));
    if (invented.length > 0) {
      problems.push(
        `proprietary_evidence may only name claims from the supplied concept list. ` +
          `Not in it: ${invented.map((p) => `"${p}"`).join("; ")}`,
      );
    } else value.proprietaryEvidence = proprietary;
  }

  // ── links: the allowlist is the whole graph ─────────────────────────────
  const linkFields: [string, unknown][] = [
    ["siblings", o.siblings ?? o.internal_links_siblings],
    ["children", o.children ?? o.internal_links_children],
    ["hub", o.hub ?? o.internal_links_hub],
  ];
  const permitted = [allowed.hub, ...allowed.siblings, ...allowed.children].filter(Boolean);
  for (const [name, val] of linkFields) {
    const list = typeof val === "string" ? [val] : asStringArray(val);
    if (!list) continue;
    const outside = list.filter((l) => !fuzzyIncludes(permitted, l));
    if (outside.length > 0) {
      problems.push(
        `${name} may only reference pages in this plan. Not in it: ${outside
          .map((l) => `"${l}"`)
          .join("; ")}`,
      );
    }
  }

  if (problems.length > 0) return { problems };
  return { value, problems: [] };
}

/**
 * Apply a validated enrichment onto the deterministic brief.
 *
 * The length band and schema types are deliberately not touched: they are
 * derived from operator-authored facets, they are auditable, and letting a
 * model adjust them across hundreds of rows would be hundreds of unreviewable
 * decisions and a direct D31 regression risk.
 */
export function applyEnrichment<
  T extends {
    persona: string;
    buyingStage: string;
    primaryQueryTarget: string;
    queryTargetAlternates?: string[];
    representativeSubQueries: string[];
    h2Outline: string[];
    differentiationAngle: string;
    evidence: {
      proprietary: string[];
      external: { requirement: string; sourceUrl?: string }[];
      quotableStatCandidate: string;
    };
  },
>(brief: T, e: ParsedEnrichment): T {
  const next: T = {
    ...brief,
    evidence: {
      ...brief.evidence,
      proprietary: e.proprietaryEvidence ?? brief.evidence.proprietary,
      external: e.externalEvidence
        ? e.externalEvidence.map((requirement) => ({ requirement }))
        : brief.evidence.external,
      quotableStatCandidate: e.quotableStatCandidate ?? brief.evidence.quotableStatCandidate,
    },
  };
  if (e.persona) next.persona = e.persona;
  if (e.buyingStage) next.buyingStage = e.buyingStage;
  if (e.primaryQueryTarget) next.primaryQueryTarget = e.primaryQueryTarget;
  if (e.queryTargetAlternates) next.queryTargetAlternates = e.queryTargetAlternates;
  if (e.requiredPassages) next.h2Outline = e.requiredPassages;
  if (e.differentiationAngle) next.differentiationAngle = e.differentiationAngle;
  // Questions the article should answer are passage-shaping vocabulary; they
  // are NOT fan-out sub-queries and must never become keyword targets (D32).
  if (e.representativeQuestions) next.representativeSubQueries = e.representativeQuestions;
  return next;
}
