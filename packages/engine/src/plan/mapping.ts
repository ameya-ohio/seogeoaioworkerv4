import type { ParsedWorkbook } from "./xlsx.js";
import {
  PLAN_COLUMNS,
  type FunnelStage,
  type PageRole,
  type PlanColumn,
  type PlanMapping,
  type PlanSheet,
  type PriorityTier,
  type SearchIntent,
} from "./types.js";

/**
 * Header and facet-value detection.
 *
 * Nothing here is hardcoded to one workbook: every field carries aliases, the
 * best assignment is suggested, and the operator adjusts it in the import UI.
 * A map with different column names therefore needs no code change — which
 * matters because the next company's map will not look like this one.
 */

export interface PlanFieldSpec {
  field: PlanColumn;
  label: string;
  required: boolean;
  /** Normalized header aliases (see normalizeHeader). */
  aliases: string[];
}

export const PLAN_FIELD_SPECS: PlanFieldSpec[] = [
  { field: "externalId", label: "ID", required: true,
    aliases: ["id", "articleid", "rowid", "ref", "code", "key"] },
  { field: "pillar", label: "Pillar", required: true,
    aliases: ["pillar", "pillarname", "topic", "category", "theme"] },
  { field: "subtopic", label: "Subtopic", required: false,
    aliases: ["subtopic", "subtopiccluster", "cluster", "group", "subcategory"] },
  { field: "title", label: "Title", required: true,
    aliases: ["articlephrasecombo", "article", "title", "articletitle", "workingtitle", "pagetitle", "headline"] },
  { field: "pageRole", label: "Page Role", required: true,
    aliases: ["pagerole", "role", "pagetype", "type", "contentrole"] },
  { field: "searchIntent", label: "Search Intent", required: false,
    aliases: ["searchintent", "intent", "queryintent"] },
  { field: "format", label: "Format", required: false,
    aliases: ["format", "contenttype", "articletype", "contentformat"] },
  { field: "funnel", label: "Funnel", required: false,
    aliases: ["funnel", "funnelstage", "stage", "tofumofubofu", "journeystage"] },
  { field: "priority", label: "Priority", required: false,
    aliases: ["priority", "prio", "rank", "wave", "tier"] },
  { field: "tieIn", label: "Tie-in", required: false,
    aliases: ["tiein", "productangle", "proprietaryangle", "angle", "whyus"] },
  { field: "sourcePages", label: "Source Pages", required: false,
    aliases: ["sourcepages", "sourcepage", "sources", "references", "sourceurl"] },
];

const SPEC_BY_FIELD = new Map(PLAN_FIELD_SPECS.map((s) => [s.field, s]));

export function planFieldSpec(field: PlanColumn): PlanFieldSpec {
  const spec = SPEC_BY_FIELD.get(field);
  if (!spec) throw new Error(`no field spec for "${field}"`);
  return spec;
}

/** Lowercase and drop everything but letters and digits. */
export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Split a header into word-ish tokens for the fuzzy tier. */
function tokens(h: string): Set<string> {
  return new Set(
    h
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * 3 = the header IS an alias, 2 = one contains the other, 1 = the tokens
 * mostly agree, 0 = no match. Kept coarse on purpose: the operator confirms.
 */
const MIN_FUZZY_ALIAS = 4;

export function scoreHeader(header: string, spec: PlanFieldSpec): number {
  const norm = normalizeHeader(header);
  if (!norm) return 0;
  if (spec.aliases.includes(norm)) return 3;
  // Substring matching only on aliases long enough to be meaningful: "id"
  // would otherwise match "Identity Pillar", "ref" would match "Preferred".
  // Short aliases still match exactly, above.
  for (const alias of spec.aliases) {
    if (alias.length < MIN_FUZZY_ALIAS) continue;
    if (norm.includes(alias) || alias.includes(norm)) return 2;
  }
  const headerTokens = tokens(header);
  for (const alias of spec.aliases) {
    if (jaccard(headerTokens, tokens(alias)) >= 0.5) return 1;
  }
  return 0;
}

// ── facet value vocabulary ────────────────────────────────────────────────

const PAGE_ROLE_VOCAB: Record<string, PageRole> = {
  pillarpage: "pillar",
  pillar: "pillar",
  pillarguide: "pillar",
  subtopichub: "hub",
  hub: "hub",
  hubpage: "hub",
  clusterhub: "hub",
  clusterarticle: "cluster",
  cluster: "cluster",
  article: "cluster",
  spoke: "cluster",
  spokearticle: "cluster",
  supportingarticle: "cluster",
};

const FUNNEL_VOCAB: Record<string, FunnelStage> = {
  tofu: "tofu", top: "tofu", topoffunnel: "tofu", awareness: "tofu",
  mofu: "mofu", middle: "mofu", middleoffunnel: "mofu", consideration: "mofu",
  bofu: "bofu", bottom: "bofu", bottomoffunnel: "bofu", decision: "bofu", conversion: "bofu",
};

const PRIORITY_VOCAB: Record<string, PriorityTier> = {
  p1: 1, "1": 1, one: 1, high: 1, p01: 1,
  p2: 2, "2": 2, two: 2, medium: 2, med: 2, p02: 2,
  p3: 3, "3": 3, three: 3, low: 3, p03: 3,
};

const INTENT_VOCAB: Record<string, SearchIntent> = {
  informational: "informational", info: "informational", information: "informational",
  commercial: "commercial", commercialinvestigation: "commercial",
  transactional: "transactional", transaction: "transactional",
  navigational: "navigational", navigation: "navigational", brand: "navigational",
};

function normalizeValue(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Resolve one raw cell value against a vocabulary, or undefined if unknown. */
function lookup<T>(vocab: Record<string, T>, raw: string): T | undefined {
  return vocab[normalizeValue(raw)];
}

export function suggestPageRole(raw: string): PageRole | undefined {
  return lookup(PAGE_ROLE_VOCAB, raw);
}
export function suggestFunnel(raw: string): FunnelStage | undefined {
  return lookup(FUNNEL_VOCAB, raw);
}
export function suggestPriority(raw: string): PriorityTier | undefined {
  return lookup(PRIORITY_VOCAB, raw);
}
export function suggestSearchIntent(raw: string): SearchIntent | undefined {
  return lookup(INTENT_VOCAB, raw);
}

/**
 * Build value maps from the values actually present in the sheet, so the UI
 * only ever asks about values it could not resolve.
 */
export function suggestValueMaps(
  sheet: PlanSheet,
  columns: Partial<Record<PlanColumn, number>>,
): PlanMapping["values"] {
  const values: PlanMapping["values"] = {
    pageRole: {},
    funnel: {},
    priority: {},
    searchIntent: {},
  };
  const collect = <T>(
    field: PlanColumn,
    resolve: (raw: string) => T | undefined,
    into: Record<string, T>,
  ) => {
    const col = columns[field];
    if (col === undefined) return;
    for (const row of sheet.rows) {
      const raw = (row[col] ?? "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (key in into) continue;
      const resolved = resolve(raw);
      if (resolved !== undefined) into[key] = resolved;
    }
  };
  collect("pageRole", suggestPageRole, values.pageRole);
  collect("funnel", suggestFunnel, values.funnel);
  collect("priority", suggestPriority, values.priority);
  collect("searchIntent", suggestSearchIntent, values.searchIntent);
  return values;
}

// ── sheet + column assignment ─────────────────────────────────────────────

export interface MappingSuggestion {
  mapping: PlanMapping;
  /** Per-field score 0–3, so the UI can flag a weak guess for confirmation. */
  confidence: Partial<Record<PlanColumn, number>>;
  /** Every candidate sheet with its score, best first (drives the picker). */
  sheetScores: { sheet: string; score: number; rows: number }[];
}

/** Greedy best-first assignment: one column per field, one field per column. */
export function assignColumns(headers: string[]): {
  columns: Partial<Record<PlanColumn, number>>;
  confidence: Partial<Record<PlanColumn, number>>;
} {
  const candidates: { field: PlanColumn; col: number; score: number }[] = [];
  for (const spec of PLAN_FIELD_SPECS) {
    headers.forEach((h, col) => {
      const score = scoreHeader(h, spec);
      if (score > 0) candidates.push({ field: spec.field, col, score });
    });
  }
  // Ties resolve left-to-right and in PLAN_COLUMNS order, so the suggestion is
  // deterministic for a given sheet.
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      PLAN_COLUMNS.indexOf(a.field) - PLAN_COLUMNS.indexOf(b.field) ||
      a.col - b.col,
  );

  const columns: Partial<Record<PlanColumn, number>> = {};
  const confidence: Partial<Record<PlanColumn, number>> = {};
  const takenCols = new Set<number>();
  for (const c of candidates) {
    if (columns[c.field] !== undefined || takenCols.has(c.col)) continue;
    columns[c.field] = c.col;
    confidence[c.field] = c.score;
    takenCols.add(c.col);
  }
  return { columns, confidence };
}

/**
 * How well a sheet works as the payload: required fields are worth most,
 * optional fields break near-ties, and row count settles the rest. This is
 * what makes a Content Map beat a Subtopics tab even though both carry
 * ID/Pillar columns.
 */
function scoreSheet(sheet: PlanSheet): number {
  const { columns, confidence } = assignColumns(sheet.headers);
  let score = 0;
  for (const spec of PLAN_FIELD_SPECS) {
    if (columns[spec.field] === undefined) continue;
    score += (spec.required ? 10 : 2) * (confidence[spec.field] ?? 1);
  }
  return score;
}

export function suggestMapping(wb: ParsedWorkbook): MappingSuggestion {
  const sheetScores = wb.sheets
    .map((s) => ({ sheet: s.name, score: scoreSheet(s), rows: s.rows.length }))
    .sort((a, b) => b.score - a.score || b.rows - a.rows);

  const bestName = sheetScores[0]?.sheet;
  const sheet = wb.sheets.find((s) => s.name === bestName);
  if (!sheet) {
    return {
      mapping: {
        sheet: "",
        columns: {},
        values: { pageRole: {}, funnel: {}, priority: {}, searchIntent: {} },
      },
      confidence: {},
      sheetScores,
    };
  }

  const { columns, confidence } = assignColumns(sheet.headers);
  return {
    mapping: { sheet: sheet.name, columns, values: suggestValueMaps(sheet, columns) },
    confidence,
    sheetScores,
  };
}

/** Re-derive value maps after the operator changes the sheet or a column. */
export function remapValues(wb: ParsedWorkbook, mapping: PlanMapping): PlanMapping {
  const sheet = wb.sheets.find((s) => s.name === mapping.sheet);
  if (!sheet) return mapping;
  const fresh = suggestValueMaps(sheet, mapping.columns);
  // Operator-set entries win over re-derived ones.
  return {
    ...mapping,
    values: {
      pageRole: { ...fresh.pageRole, ...mapping.values.pageRole },
      funnel: { ...fresh.funnel, ...mapping.values.funnel },
      priority: { ...fresh.priority, ...mapping.values.priority },
      searchIntent: { ...fresh.searchIntent, ...mapping.values.searchIntent },
    },
  };
}
