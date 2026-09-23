import {
  QUESTION_TYPES,
  SUB_QUERY_TYPES,
  type ArchitectureType,
  type ClusterHub,
  type ClusterPrompt,
  type GapStatus,
  type QuestionType,
  type SubQueryType,
  type TermEntry,
} from "./types.js";

/**
 * Parsers for the cluster runner's LLM stage responses. Every stage asks
 * for JSON only; these parsers are tolerant of fences and prose around the
 * JSON but strict about the shapes the scoring code depends on. Each
 * returns problems instead of throwing so the runner can retry a stage
 * with feedback, the same pattern as the pipeline gates.
 */

export interface Parsed<T> {
  value?: T;
  problems: string[];
}

/** Extract the first JSON object/array from LLM text (fenced or bare). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(text);
  const candidates: string[] = [];
  if (fenced?.[1]) candidates.push(fenced[1]);
  const firstBrace = text.search(/[[{]/);
  if (firstBrace !== -1) candidates.push(text.slice(firstBrace));
  candidates.push(text);
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      // Try trimming trailing prose after the JSON by balancing brackets.
      const balanced = balancedSlice(trimmed);
      if (balanced) {
        try {
          return JSON.parse(balanced);
        } catch {
          /* next candidate */
        }
      }
    }
  }
  return undefined;
}

function balancedSlice(text: string): string | undefined {
  const open = text[0];
  if (open !== "{" && open !== "[") return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return undefined;
}

const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const asArray = (v: unknown): unknown[] | undefined => (Array.isArray(v) ? v : undefined);
const asString = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const asNumber = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const TERM_CATEGORIES: TermEntry["category"][] = [
  "primary_seed",
  "equivalent_phrasing",
  "canonical_term",
  "entity",
  "persona_terminology",
  "adjacent_concept",
];
const INTENTS: TermEntry["intent"][] = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
];

function normalizeEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const s = asString(raw)?.toLowerCase().replace(/[\s-]+/g, "_");
  return (allowed as readonly string[]).includes(s ?? "") ? (s as T) : fallback;
}

/** Stage 1 (spec §1): entity/term map + realistic prompts. */
export function parseExpansionResponse(text: string): Parsed<{
  terms: TermEntry[];
  prompts: ClusterPrompt[];
}> {
  const problems: string[] = [];
  const root = asRecord(extractJson(text));
  if (!root) return { problems: ["response is not a JSON object"] };

  const terms: TermEntry[] = [];
  for (const raw of asArray(root["terms"]) ?? []) {
    const rec = asRecord(raw);
    const term = asString(rec?.["term"]);
    if (!rec || !term) continue;
    terms.push({
      term,
      category: normalizeEnum(rec["category"], TERM_CATEGORIES, "adjacent_concept"),
      intent: normalizeEnum(rec["intent"], INTENTS, "informational"),
    });
  }
  if (terms.length < 10) problems.push(`only ${terms.length} terms — the spec asks for 15–20`);

  const prompts: ClusterPrompt[] = [];
  const seenIds = new Set<string>();
  for (const raw of asArray(root["prompts"]) ?? []) {
    const rec = asRecord(raw);
    const promptText = asString(rec?.["text"]);
    if (!rec || !promptText) continue;
    let id = asString(rec["id"]) ?? `p${prompts.length + 1}`;
    while (seenIds.has(id)) id = `${id}x`;
    seenIds.add(id);
    prompts.push({
      id,
      text: promptText,
      persona: asString(rec["persona"]) ?? "unspecified",
      stage: asString(rec["stage"]) ?? "unspecified",
    });
  }
  if (prompts.length < 4) {
    problems.push(`only ${prompts.length} prompts — the spec asks for 6–8 realistic prompts`);
    return { problems };
  }
  return { value: { terms, prompts: prompts.slice(0, 8) }, problems };
}

/** Simulated fan-out: sub-queries with their 8-type classification. */
export function parseFanoutResponse(text: string): Parsed<{ text: string; type: SubQueryType }[]> {
  const root = extractJson(text);
  const list = asArray(root) ?? asArray(asRecord(root)?.["sub_queries"]);
  if (!list) return { problems: ["response is not a JSON array of sub-queries"] };
  const out: { text: string; type: SubQueryType }[] = [];
  for (const raw of list) {
    const rec = asRecord(raw);
    const sq = asString(rec?.["text"]) ?? asString(raw);
    if (!sq) continue;
    out.push({
      text: sq,
      type: normalizeEnum(rec?.["type"], SUB_QUERY_TYPES, "equivalent"),
    });
  }
  if (out.length === 0) return { problems: ["no sub-queries in response"] };
  return { value: out, problems: [] };
}

/** Type classification for observed queries: types aligned with input order. */
export function parseTypeClassification(text: string, count: number): Parsed<SubQueryType[]> {
  const root = extractJson(text);
  const list = asArray(root) ?? asArray(asRecord(root)?.["types"]);
  if (!list) return { problems: ["response is not a JSON array of types"] };
  const types: SubQueryType[] = [];
  for (let i = 0; i < count; i++) {
    const raw = list[i];
    const rec = asRecord(raw);
    types.push(normalizeEnum(rec?.["type"] ?? raw, SUB_QUERY_TYPES, "equivalent"));
  }
  return { value: types, problems: [] };
}

/** Stage 3 (spec §3.1): themes as groups of sub-query indexes. */
export function parseClusteringResponse(
  text: string,
  subQueryCount: number,
): Parsed<{ name: string; subQueryIndexes: number[] }[]> {
  const problems: string[] = [];
  const root = extractJson(text);
  const list = asArray(root) ?? asArray(asRecord(root)?.["themes"]);
  if (!list) return { problems: ["response is not a JSON array of themes"] };
  const themes: { name: string; subQueryIndexes: number[] }[] = [];
  const seenNames = new Set<string>();
  for (const raw of list) {
    const rec = asRecord(raw);
    const name = asString(rec?.["name"]);
    if (!rec || !name) continue;
    if (seenNames.has(name.toLowerCase())) {
      problems.push(`duplicate theme name "${name}"`);
      continue;
    }
    seenNames.add(name.toLowerCase());
    const indexes: number[] = [];
    for (const idx of asArray(rec["sub_query_indexes"]) ?? asArray(rec["subQueryIndexes"]) ?? []) {
      const n = asNumber(idx);
      if (n !== undefined && Number.isInteger(n) && n >= 0 && n < subQueryCount) indexes.push(n);
    }
    if (indexes.length === 0) {
      problems.push(`theme "${name}" has no valid sub-query indexes`);
      continue;
    }
    themes.push({ name, subQueryIndexes: indexes });
  }
  if (themes.length === 0) return { problems: [...problems, "no usable themes in response"] };
  return { value: themes, problems };
}

/**
 * Stage 4 (spec §4): questions mapped to themes and classified. An
 * explicitly EMPTY questions array is a valid answer (the model may rightly
 * refuse to map irrelevant input — never punish honesty with a retry);
 * only a response with no parseable questions array at all is a problem.
 */
export function parseQuestionsResponse(text: string): Parsed<
  { text: string; qType: QuestionType; theme: string }[]
> {
  const root = extractJson(text);
  const list = asArray(root) ?? asArray(asRecord(root)?.["questions"]);
  if (!list) return { problems: ["response is not a JSON array of questions"] };
  const out: { text: string; qType: QuestionType; theme: string }[] = [];
  for (const raw of list) {
    const rec = asRecord(raw);
    const q = asString(rec?.["text"]);
    const theme = asString(rec?.["theme"]);
    if (!rec || !q || !theme) continue;
    out.push({
      text: q,
      qType: normalizeEnum(rec["type"] ?? rec["qType"], QUESTION_TYPES, "what"),
      theme,
    });
  }
  if (out.length === 0 && list.length > 0) {
    return { problems: ["questions present but none had text + theme fields"] };
  }
  return { value: out, problems: [] };
}

const GAP_STATUSES: GapStatus[] = ["owned", "buried", "missing"];

/** Stage 6 (spec §6): gap status + owner asset per theme. */
export function parseGapMapResponse(text: string): Parsed<
  {
    theme: string;
    gapStatus: GapStatus;
    ownerAsset?: string;
    nonBlogAsset?: string;
    offSiteChannel?: string;
  }[]
> {
  const root = extractJson(text);
  const list = asArray(root) ?? asArray(asRecord(root)?.["themes"]);
  if (!list) return { problems: ["response is not a JSON array of theme gap entries"] };
  const out: {
    theme: string;
    gapStatus: GapStatus;
    ownerAsset?: string;
    nonBlogAsset?: string;
    offSiteChannel?: string;
  }[] = [];
  for (const raw of list) {
    const rec = asRecord(raw);
    const theme = asString(rec?.["theme"]);
    if (!rec || !theme) continue;
    const ownerAsset = asString(rec["owner_asset"] ?? rec["ownerAsset"]);
    const nonBlogAsset = asString(rec["non_blog_asset"] ?? rec["nonBlogAsset"]);
    const offSiteChannel = asString(rec["off_site_channel"] ?? rec["offSiteChannel"]);
    out.push({
      theme,
      gapStatus: normalizeEnum(rec["gap_status"] ?? rec["gapStatus"], GAP_STATUSES, "missing"),
      ...(ownerAsset ? { ownerAsset } : {}),
      ...(nonBlogAsset ? { nonBlogAsset } : {}),
      ...(offSiteChannel ? { offSiteChannel } : {}),
    });
  }
  if (out.length === 0) return { problems: ["no usable gap entries in response"] };
  return { value: out, problems: [] };
}

/** Stage 7 (spec §7): the three LLM-judged factors with one-line rationales. */
export function parseScoresResponse(text: string): Parsed<
  {
    theme: string;
    decisiveness: number;
    rightToWin: number;
    openness: number;
    rationale: Record<string, string>;
  }[]
> {
  const root = extractJson(text);
  const list = asArray(root) ?? asArray(asRecord(root)?.["themes"]);
  if (!list) return { problems: ["response is not a JSON array of theme scores"] };
  const out: {
    theme: string;
    decisiveness: number;
    rightToWin: number;
    openness: number;
    rationale: Record<string, string>;
  }[] = [];
  for (const raw of list) {
    const rec = asRecord(raw);
    const theme = asString(rec?.["theme"]);
    if (!rec || !theme) continue;
    const rationaleRec = asRecord(rec["rationale"]) ?? {};
    const rationale: Record<string, string> = {};
    for (const [k, v] of Object.entries(rationaleRec)) {
      const s = asString(v);
      if (s) rationale[k] = s;
    }
    out.push({
      theme,
      decisiveness: asNumber(rec["decisiveness"]) ?? 3,
      rightToWin: asNumber(rec["right_to_win"] ?? rec["rightToWin"]) ?? 3,
      openness: asNumber(rec["openness"]) ?? 3,
      rationale,
    });
  }
  if (out.length === 0) return { problems: ["no usable score entries in response"] };
  return { value: out, problems: [] };
}

const ARCHITECTURES: ArchitectureType[] = ["spoke", "section", "non_blog", "off_site"];

/** Stage 8 (spec §8): architecture assignment per theme + the hub. */
export function parseArchitectureResponse(text: string): Parsed<{
  assignments: { theme: string; architecture: ArchitectureType; parentSpoke?: string }[];
  hub: ClusterHub;
}> {
  const problems: string[] = [];
  const root = asRecord(extractJson(text));
  if (!root) return { problems: ["response is not a JSON object"] };
  const assignments: { theme: string; architecture: ArchitectureType; parentSpoke?: string }[] = [];
  for (const raw of asArray(root["assignments"]) ?? []) {
    const rec = asRecord(raw);
    const theme = asString(rec?.["theme"]);
    if (!rec || !theme) continue;
    const parentSpoke = asString(rec["parent_spoke"] ?? rec["parentSpoke"]);
    assignments.push({
      theme,
      architecture: normalizeEnum(rec["architecture"], ARCHITECTURES, "section"),
      ...(parentSpoke ? { parentSpoke } : {}),
    });
  }
  if (assignments.length === 0) problems.push("no architecture assignments in response");

  const hubRec = asRecord(root["hub"]);
  const hubTitle = asString(hubRec?.["title"]);
  if (!hubTitle) problems.push("hub.title missing");
  const themeSummaries: { theme: string; summary: string }[] = [];
  for (const raw of asArray(hubRec?.["theme_summaries"]) ?? asArray(hubRec?.["themeSummaries"]) ?? []) {
    const rec = asRecord(raw);
    const theme = asString(rec?.["theme"]);
    const summary = asString(rec?.["summary"]);
    if (theme && summary) themeSummaries.push({ theme, summary });
  }
  if (problems.length > 0 && (assignments.length === 0 || !hubTitle)) return { problems };
  return {
    value: { assignments, hub: { title: hubTitle as string, themeSummaries } },
    problems,
  };
}

export interface ParsedBrief {
  workingTitle: string;
  primaryQueryTarget: string;
  queryTargetAlternates: string[];
  persona: string;
  buyingStage: string;
  h2Outline: string[];
  evidence: {
    proprietary: string[];
    external: { requirement: string; sourceUrl?: string }[];
    quotableStatCandidate: string;
  };
  differentiationAngle: string;
  siblingLinks: string[];
  lengthBand: { min?: number; max?: number; justification?: string };
  schemaTypes: string[];
}

/** Stage 9 (spec §9): one spoke brief. */
export function parseBriefResponse(text: string): Parsed<ParsedBrief> {
  const problems: string[] = [];
  const root = asRecord(extractJson(text));
  if (!root) return { problems: ["response is not a JSON object"] };
  const workingTitle = asString(root["working_title"] ?? root["workingTitle"]);
  if (!workingTitle) problems.push("working_title missing");
  // D32: a natural typed query, required. Reject sub-query-length strings.
  const primaryQueryTarget = asString(root["primary_query_target"] ?? root["primaryQueryTarget"]);
  if (!primaryQueryTarget) {
    problems.push("primary_query_target missing — a natural 2–6 word query a person would type");
  } else if (primaryQueryTarget.trim().split(/\s+/).length > 7) {
    problems.push(
      `primary_query_target "${primaryQueryTarget}" is ${primaryQueryTarget.trim().split(/\s+/).length} words — that is a sub-query string, not a query a person types; give a natural 2–6 word target`,
    );
  }
  const queryTargetAlternates = (asArray(root["query_target_alternates"]) ?? [])
    .map((v) => asString(v))
    .filter((v): v is string => Boolean(v))
    .slice(0, 3);
  const h2Outline: string[] = [];
  for (const raw of asArray(root["required_passages"]) ??
    asArray(root["h2_outline"]) ??
    asArray(root["h2Outline"]) ??
    []) {
    const h2 = asString(asRecord(raw)?.["heading"]) ?? asString(raw);
    if (h2) h2Outline.push(h2);
  }
  if (h2Outline.length < 3) problems.push(`only ${h2Outline.length} required passages — a spoke needs real coverage`);

  const evidenceRec = asRecord(root["evidence"]) ?? {};
  const proprietary = (asArray(evidenceRec["proprietary"]) ?? [])
    .map((v) => asString(v))
    .filter((v): v is string => Boolean(v));
  const external: { requirement: string; sourceUrl?: string }[] = [];
  for (const raw of asArray(evidenceRec["external"]) ?? []) {
    const rec = asRecord(raw);
    const requirement = asString(rec?.["requirement"]) ?? asString(raw);
    if (!requirement) continue;
    const sourceUrl = asString(rec?.["source_url"] ?? rec?.["sourceUrl"]);
    external.push({ requirement, ...(sourceUrl ? { sourceUrl } : {}) });
  }
  const quotable = asString(
    evidenceRec["quotable_stat_candidate"] ?? evidenceRec["quotableStatCandidate"],
  );
  if (!quotable) problems.push("evidence.quotable_stat_candidate missing");

  const differentiationAngle = asString(
    root["differentiation_angle"] ?? root["differentiationAngle"],
  );
  if (!differentiationAngle) problems.push("differentiation_angle missing");

  const siblingLinks = (asArray(asRecord(root["internal_links"] ?? root["internalLinks"])?.["siblings"]) ?? [])
    .map((v) => asString(v))
    .filter((v): v is string => Boolean(v));

  const bandRec = asRecord(root["length_band"] ?? root["lengthBand"]) ?? {};
  const lengthBand: { min?: number; max?: number; justification?: string } = {};
  const min = asNumber(bandRec["min"]);
  const max = asNumber(bandRec["max"]);
  const justification = asString(bandRec["justification"]);
  if (min !== undefined) lengthBand.min = min;
  if (max !== undefined) lengthBand.max = max;
  if (justification) lengthBand.justification = justification;

  const schemaTypes = (asArray(root["schema"]) ?? asArray(root["schema_types"]) ?? [])
    .map((v) => asString(v))
    .filter((v): v is string => Boolean(v));

  const targetOk =
    primaryQueryTarget && primaryQueryTarget.trim().split(/\s+/).length <= 7;
  if (!workingTitle || !differentiationAngle || !quotable || h2Outline.length < 3 || !targetOk) {
    return { problems };
  }
  return {
    value: {
      workingTitle,
      primaryQueryTarget: primaryQueryTarget as string,
      queryTargetAlternates,
      persona: asString(root["persona"]) ?? "unspecified",
      buyingStage: asString(root["buying_stage"] ?? root["buyingStage"]) ?? "unspecified",
      h2Outline,
      evidence: { proprietary, external, quotableStatCandidate: quotable },
      differentiationAngle,
      siblingLinks,
      lengthBand,
      schemaTypes: schemaTypes.length > 0 ? schemaTypes : ["Article"],
    },
    problems,
  };
}
