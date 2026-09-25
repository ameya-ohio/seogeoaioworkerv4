import { slugify } from "../pipelineOps.js";
import type { ParsedWorkbook } from "./xlsx.js";
import {
  type FunnelStage,
  type PageRole,
  type PlanColumn,
  type PlanConcept,
  type PlanMapping,
  type PlanPillar,
  type PlanSheet,
  type PlanSubtopic,
  type PriorityTier,
  type SearchIntent,
} from "./types.js";
import { PLAN_FIELD_SPECS, normalizeHeader } from "./mapping.js";

/**
 * Turn mapped spreadsheet rows into typed rows, joined to the taxonomy
 * sheets.
 *
 * Rows are joined to pillars and subtopics BY NAME, not by id: the name
 * columns are the only ones guaranteed to exist in an arbitrary map, whereas
 * a hierarchical id scheme like "P01-S03-A07" is this workbook's convention
 * and the next company's will differ. Ids are used when present, for display
 * and as a tiebreak, never as the join key.
 */

export interface NormalizedPlanRow {
  externalId: string;
  sheetRow: number;
  pageRole: PageRole;
  pillarId: string;
  pillarName: string;
  subtopicId: string | null;
  subtopicName: string | null;
  title: string;
  format: string;
  funnel: FunnelStage;
  searchIntent: SearchIntent;
  priority: PriorityTier;
  tieIn: string;
  sourcePages: string[];
}

export interface NormalizeResult {
  rows: NormalizedPlanRow[];
  skipped: { row: number; reason: string }[];
  /** Facet values the value maps did not cover, with the rows carrying them. */
  unrecognized: { field: PlanColumn; value: string; rows: number[] }[];
  /** Fields that fell back to a default because the column was unmapped. */
  defaulted: PlanColumn[];
}

export const DEFAULT_FUNNEL: FunnelStage = "mofu";
export const DEFAULT_PRIORITY: PriorityTier = 2;
export const DEFAULT_INTENT: SearchIntent = "informational";

/** Subtopic cells that mean "this row IS the pillar page". */
const PILLAR_SENTINELS = new Set(["", "pillarpage", "pillar", "none", "na", "n/a"]);

export function splitList(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A stable id for a name, used when the workbook carries no id scheme. */
function derivedId(name: string): string {
  return slugify(name || "unknown");
}

function cell(row: string[], col: number | undefined): string {
  if (col === undefined) return "";
  return (row[col] ?? "").trim();
}

/** "P01-S03-A07" -> ["P01", "P01-S03"]; returns [] for a non-hierarchical id. */
export function parseHierarchicalId(id: string): string[] {
  const parts = id.split("-").filter(Boolean);
  if (parts.length < 2) return parts.length === 1 ? [parts[0] as string] : [];
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) out.push(parts.slice(0, i + 1).join("-"));
  return out;
}

export interface TaxonomyIndex {
  pillarByName: Map<string, PlanPillar>;
  subtopicByName: Map<string, PlanSubtopic>;
}

export function indexTaxonomy(
  pillars: PlanPillar[],
  subtopics: PlanSubtopic[],
): TaxonomyIndex {
  return {
    pillarByName: new Map(pillars.map((p) => [normalizeHeader(p.name), p])),
    subtopicByName: new Map(
      // Key on pillar+subtopic so two pillars can reuse a subtopic name.
      subtopics.map((s) => [`${normalizeHeader(s.pillarId)}::${normalizeHeader(s.name)}`, s]),
    ),
  };
}

export function normalizeRows(
  sheet: PlanSheet,
  mapping: PlanMapping,
  taxonomy: TaxonomyIndex,
): NormalizeResult {
  const cols = mapping.columns;
  const skipped: NormalizeResult["skipped"] = [];
  const rows: NormalizedPlanRow[] = [];
  const unrecognizedMap = new Map<string, { field: PlanColumn; value: string; rows: number[] }>();

  const noteUnrecognized = (field: PlanColumn, value: string, rowNum: number) => {
    const key = `${field}::${value.toLowerCase()}`;
    const existing = unrecognizedMap.get(key);
    if (existing) existing.rows.push(rowNum);
    else unrecognizedMap.set(key, { field, value, rows: [rowNum] });
  };

  const defaulted: PlanColumn[] = [];
  for (const f of ["funnel", "priority", "searchIntent", "format"] as PlanColumn[]) {
    if (cols[f] === undefined) defaulted.push(f);
  }

  sheet.rows.forEach((raw, i) => {
    const sheetRow = i;
    const externalId = cell(raw, cols.externalId);
    const title = cell(raw, cols.title);
    const pillarName = cell(raw, cols.pillar);

    if (!externalId && !title) return; // fully blank row: not worth reporting
    if (!externalId) {
      skipped.push({ row: sheetRow, reason: "missing ID" });
      return;
    }
    if (!title) {
      skipped.push({ row: sheetRow, reason: `row "${externalId}" has no title` });
      return;
    }
    if (!pillarName) {
      skipped.push({ row: sheetRow, reason: `row "${externalId}" has no pillar` });
      return;
    }

    const roleRaw = cell(raw, cols.pageRole);
    const pageRole = mapping.values.pageRole[roleRaw.toLowerCase()];
    if (!pageRole) {
      // Blocking, not defaultable: a brief cannot be built without knowing
      // whether this is a routing page or a spoke.
      noteUnrecognized("pageRole", roleRaw || "(empty)", sheetRow);
      skipped.push({
        row: sheetRow,
        reason: `row "${externalId}" has an unmapped page role "${roleRaw}"`,
      });
      return;
    }

    const funnelRaw = cell(raw, cols.funnel);
    let funnel = mapping.values.funnel[funnelRaw.toLowerCase()];
    if (!funnel) {
      if (funnelRaw) noteUnrecognized("funnel", funnelRaw, sheetRow);
      funnel = DEFAULT_FUNNEL;
    }

    const priorityRaw = cell(raw, cols.priority);
    let priority = mapping.values.priority[priorityRaw.toLowerCase()];
    if (!priority) {
      if (priorityRaw) noteUnrecognized("priority", priorityRaw, sheetRow);
      priority = DEFAULT_PRIORITY;
    }

    const intentRaw = cell(raw, cols.searchIntent);
    let searchIntent = mapping.values.searchIntent[intentRaw.toLowerCase()];
    if (!searchIntent) {
      if (intentRaw) noteUnrecognized("searchIntent", intentRaw, sheetRow);
      searchIntent = DEFAULT_INTENT;
    }

    const pillar = taxonomy.pillarByName.get(normalizeHeader(pillarName));
    const idChain = parseHierarchicalId(externalId);
    const pillarId = pillar?.pillarId ?? idChain[0] ?? derivedId(pillarName);

    const subtopicRaw = cell(raw, cols.subtopic);
    const subtopicIsSentinel = PILLAR_SENTINELS.has(
      subtopicRaw.toLowerCase().replace(/[^a-z/]/g, ""),
    );
    const isPillarRow = pageRole === "pillar";
    const subtopicName = isPillarRow || subtopicIsSentinel ? null : subtopicRaw || null;

    let subtopicId: string | null = null;
    if (subtopicName) {
      const sub = taxonomy.subtopicByName.get(
        `${normalizeHeader(pillarId)}::${normalizeHeader(subtopicName)}`,
      );
      subtopicId = sub?.subtopicId ?? idChain[1] ?? `${pillarId}-${derivedId(subtopicName)}`;
    }

    rows.push({
      externalId,
      sheetRow,
      pageRole,
      pillarId,
      pillarName,
      subtopicId,
      subtopicName,
      title,
      format: cell(raw, cols.format),
      funnel,
      searchIntent,
      priority,
      tieIn: cell(raw, cols.tieIn),
      sourcePages: splitList(cell(raw, cols.sourcePages)),
    });
  });

  return { rows, skipped, unrecognized: [...unrecognizedMap.values()], defaulted };
}

// ── taxonomy sheets ───────────────────────────────────────────────────────
// These are read with the same alias scoring as the payload sheet, so a
// differently-worded Pillar Summary still resolves.

const MIN_FUZZY_ALIAS = 4;

function headerIndex(headers: string[], aliases: string[]): number | undefined {
  // A blank header (a "#" column normalizes to "") must be skipped, not just
  // rejected after the fact: the empty string is a substring of every alias,
  // so leaving it in makes the partial pass match column 0 every time and
  // starves every real column of a match.
  const normalized = headers.map((h) => normalizeHeader(h));
  const candidates = normalized
    .map((h, i) => ({ h, i }))
    .filter((c) => c.h !== "");

  for (const alias of aliases) {
    const exact = candidates.find((c) => c.h === alias);
    if (exact) return exact.i;
  }
  // Only fuzzy-match on aliases long enough to be meaningful. A 2-3 character
  // alias as a substring is a false-positive machine: "no" matches inside
  // "whyAcmeCanOwnIt", "id" inside "identity".
  for (const alias of aliases) {
    if (alias.length < MIN_FUZZY_ALIAS) continue;
    const partial = candidates.find((c) => c.h.includes(alias) || alias.includes(c.h));
    if (partial) return partial.i;
  }
  return undefined;
}

/**
 * Locate an id column.
 *
 * Alias matching alone is not enough: real workbooks label this column "#",
 * which normalizes to the empty string and matches nothing. So when aliases
 * fail, fall back to the column whose VALUES look like ids — a letter-digit
 * code, optionally hierarchical ("P01", "P01-S03-A07") — and are unique.
 */
function findIdColumn(sheet: PlanSheet): number | undefined {
  const byAlias = headerIndex(sheet.headers, ["id", "ref", "code", "no", "num", "number"]);
  if (byAlias !== undefined) return byAlias;

  const looksLikeId = /^[A-Za-z]+\d+(?:-[A-Za-z]+\d+)*$/;
  for (let col = 0; col < sheet.headers.length; col++) {
    const values = sheet.rows.map((r) => (r[col] ?? "").trim()).filter(Boolean);
    if (values.length === 0) continue;
    if (!values.every((v) => looksLikeId.test(v))) continue;
    if (new Set(values).size !== values.length) continue;
    return col;
  }
  return undefined;
}

/** Find the sheet whose headers best match a set of required aliases. */
function findSheet(
  wb: ParsedWorkbook,
  exclude: string,
  required: string[][],
): PlanSheet | undefined {
  let best: { sheet: PlanSheet; hits: number } | undefined;
  for (const sheet of wb.sheets) {
    if (sheet.name === exclude) continue;
    const hits = required.filter((aliases) => headerIndex(sheet.headers, aliases) !== undefined).length;
    if (hits === required.length && (!best || sheet.rows.length > best.sheet.rows.length)) {
      best = { sheet, hits };
    }
  }
  return best?.sheet;
}

export function extractPillars(wb: ParsedWorkbook, payloadSheet: string): PlanPillar[] {
  const sheet = findSheet(wb, payloadSheet, [
    ["pillar", "topic"],
    ["headterm", "headkeyword", "primarykeyword"],
  ]);
  if (!sheet) return [];
  const iId = findIdColumn(sheet);
  const iName = headerIndex(sheet.headers, ["pillar", "topic"]);
  const iTitle = headerIndex(sheet.headers, ["pillarpagetitle", "pagetitle", "title"]);
  const iHead = headerIndex(sheet.headers, ["headterm", "headkeyword", "primarykeyword"]);
  const iWhy = headerIndex(sheet.headers, [
    "canownit",
    "whywecanownit",
    "righttowin",
    "rationale",
    "differentiation",
    "angle",
  ]);
  const iSrc = headerIndex(sheet.headers, ["sourcepages", "sources", "references"]);
  if (iName === undefined) return [];

  const out: PlanPillar[] = [];
  for (const row of sheet.rows) {
    const name = cell(row, iName);
    if (!name || name.toLowerCase() === "total") continue;
    out.push({
      pillarId: cell(row, iId) || derivedId(name),
      name,
      pageTitle: cell(row, iTitle),
      headTerm: cell(row, iHead),
      whyWeCanOwnIt: cell(row, iWhy),
      sourcePages: splitList(cell(row, iSrc)),
    });
  }
  return out;
}

export function extractSubtopics(wb: ParsedWorkbook, payloadSheet: string): PlanSubtopic[] {
  const sheet = findSheet(wb, payloadSheet, [
    ["subtopiccluster", "subtopic", "cluster"],
    ["hubpage", "hub", "hubtitle"],
  ]);
  if (!sheet) return [];
  const iId = findIdColumn(sheet);
  const iPillar = headerIndex(sheet.headers, ["pillar", "topic"]);
  const iName = headerIndex(sheet.headers, ["subtopiccluster", "subtopic", "cluster"]);
  const iHub = headerIndex(sheet.headers, ["hubpage", "hub", "hubtitle"]);
  const iTier = headerIndex(sheet.headers, ["tier"]);
  const iTie = headerIndex(sheet.headers, ["tiein", "angle", "whyus"]);
  const iSrc = headerIndex(sheet.headers, ["sourcepages", "sources", "references"]);
  if (iName === undefined) return [];

  const out: PlanSubtopic[] = [];
  for (const row of sheet.rows) {
    const name = cell(row, iName);
    if (!name || name.toLowerCase() === "total") continue;
    const id = cell(row, iId);
    const tierRaw = cell(row, iTier).toUpperCase();
    out.push({
      subtopicId: id || derivedId(name),
      pillarId: parseHierarchicalId(id)[0] ?? derivedId(cell(row, iPillar)),
      name,
      hubTitle: cell(row, iHub),
      tier: tierRaw === "A" || tierRaw === "B" || tierRaw === "C" ? tierRaw : null,
      tieIn: cell(row, iTie),
      sourcePages: splitList(cell(row, iSrc)),
    });
  }
  return out;
}

/**
 * The concepts sheet: the only proprietary-evidence vocabulary in a workbook,
 * and therefore the only proprietary proof the enrichment pass may name (D34).
 */
export function extractConcepts(wb: ParsedWorkbook, payloadSheet: string, pillars: PlanPillar[]): PlanConcept[] {
  const sheet = findSheet(wb, payloadSheet, [
    ["termclaim", "term", "concept", "claim"],
    ["mappedpillar", "pillar"],
  ]);
  if (!sheet) return [];
  const iTerm = headerIndex(sheet.headers, ["termclaim", "term", "concept", "claim"]);
  const iWhere = headerIndex(sheet.headers, ["whereitappears", "where", "source", "appears"]);
  const iPillar = headerIndex(sheet.headers, ["mappedpillar", "pillar"]);
  if (iTerm === undefined) return [];

  const byName = new Map(pillars.map((p) => [normalizeHeader(p.name), p.pillarId]));
  const out: PlanConcept[] = [];
  for (const row of sheet.rows) {
    const term = cell(row, iTerm);
    if (!term) continue;
    const mapped = cell(row, iPillar);
    // A concept row may name several pillars; the first recognized one wins.
    let pillarId: string | null = null;
    for (const candidate of splitList(mapped).concat(mapped ? [mapped] : [])) {
      const hit = byName.get(normalizeHeader(candidate));
      if (hit) {
        pillarId = hit;
        break;
      }
    }
    out.push({ term, whereItAppears: cell(row, iWhere), pillarId });
  }
  return out;
}

/** Join every README-ish sheet into one operator-facing note blob. */
export function collectNotes(wb: ParsedWorkbook): string | undefined {
  const entries = Object.entries(wb.textSheets).filter(([, v]) => v.trim() !== "");
  if (entries.length === 0) return undefined;
  return entries.map(([name, body]) => `## ${name}\n\n${body}`).join("\n\n");
}

/** Required fields whose absence blocks a commit. */
export function missingRequiredColumns(mapping: PlanMapping): string[] {
  return PLAN_FIELD_SPECS.filter((s) => s.required && mapping.columns[s.field] === undefined).map(
    (s) => s.label,
  );
}
