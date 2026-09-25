import type { SpokeBrief } from "../cluster/types.js";
import { computeSequence, type Promotion, type SequenceInput } from "../schedule/sequencing.js";
import type { ParsedWorkbook } from "./xlsx.js";
import {
  collectNotes,
  extractConcepts,
  extractPillars,
  extractSubtopics,
  indexTaxonomy,
  missingRequiredColumns,
  normalizeRows,
} from "./normalize.js";
import { assignSlugs, type SlugPlanInput } from "./slug.js";
import { buildSynthesisContext, parentOf, synthesizeBrief } from "./synthesize.js";
import type {
  FunnelStage,
  PageRole,
  PlanConcept,
  PlanImportReport,
  PlanMapping,
  PlanPillar,
  PlanSubtopic,
  PriorityTier,
  SearchIntent,
  SlugStrategy,
} from "./types.js";
/**
 * Assemble a complete, reviewable import from a parsed workbook and a column
 * mapping — parse, normalize, synthesize briefs, reserve slugs, and order the
 * plan — WITHOUT writing anything.
 *
 * Everything that could go wrong is surfaced in the report first, so the
 * operator resolves it while watching rather than discovering it weeks into a
 * cadence. That is the whole reason this is a two-step (analyze, then commit)
 * flow rather than a single upload action.
 */
export interface DraftPlanItem {
  externalId: string;
  sheetRow: number;
  pageRole: PageRole;
  pillarId: string;
  pillarName: string;
  subtopicId: string | null;
  subtopicName: string | null;
  /** Resolved to a real ObjectId at insert time. */
  parentExternalId: string | null;
  title: string;
  format: string;
  funnel: FunnelStage;
  searchIntent: SearchIntent;
  priority: PriorityTier;
  tierHint: "A" | "B" | "C" | null;
  tieIn: string;
  sourcePages: string[];
  slug: string;
  slugStrategy: SlugStrategy;
  primaryQueryTarget: string;
  needsQueryTarget: boolean;
  brief: SpokeBrief;
  sequence: number;
}
export interface PlanAnalysisInput {
  workbook: ParsedWorkbook;
  mapping: PlanMapping;
  companyName: string;
  /** slug -> stage of an existing article, for collision reporting. */
  takenSlugs?: Map<string, string>;
  /** keyword text -> status, for duplicate reporting. */
  existingKeywords?: Map<string, string>;
  slugOverrides?: Map<string, string>;
  queryTargetOverrides?: Map<string, string>;
  /** Set false for a company whose schema spec drops CollectionPage/ItemList. */
  routingTypesDocumented?: boolean;
  defaultPersona?: string;
}
export interface PlanAnalysis {
  report: PlanImportReport;
  taxonomy: { pillars: PlanPillar[]; subtopics: PlanSubtopic[] };
  concepts: PlanConcept[];
  notes?: string;
  items: DraftPlanItem[];
  /** Where the structural rule overrode the plan's own priority ordering. */
  promotions: Promotion[];
}
function countBy<T extends string | number>(values: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    const key = String(v);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
export function analyzePlan(input: PlanAnalysisInput): PlanAnalysis {
  const { workbook, mapping } = input;
  const blocking: string[] = [];
  const missing = missingRequiredColumns(mapping);
  if (missing.length > 0) {
    blocking.push(`Map these required columns before importing: ${missing.join(", ")}.`);
  }
  const sheet = workbook.sheets.find((s) => s.name === mapping.sheet);
  if (!sheet) {
    return {
      report: emptyReport(mapping.sheet, [
        ...blocking,
        `Sheet "${mapping.sheet}" is not in this workbook.`,
      ]),
      taxonomy: { pillars: [], subtopics: [] },
      concepts: [],
      items: [],
      promotions: [],
    };
  }
  const pillars = extractPillars(workbook, mapping.sheet);
  const subtopics = extractSubtopics(workbook, mapping.sheet);
  const concepts = extractConcepts(workbook, mapping.sheet, pillars);
  const taxonomyIndex = indexTaxonomy(pillars, subtopics);
  const { rows, skipped, unrecognized, defaulted } = normalizeRows(sheet, mapping, taxonomyIndex);
  if (rows.length === 0) {
    blocking.push("No rows could be read with this mapping — check the sheet and columns.");
  }
  const unmappedRoles = unrecognized.filter((u) => u.field === "pageRole");
  if (unmappedRoles.length > 0) {
    blocking.push(
      `Assign a page role for: ${unmappedRoles.map((u) => `"${u.value}"`).join(", ")}. ` +
        `A brief cannot be built without knowing whether a row is a routing page.`,
    );
  }
  // ── slugs ───────────────────────────────────────────────────────────────
  const slugInputs: SlugPlanInput[] = rows.map((r) => ({
    externalId: r.externalId,
    title: r.title,
    pillarId: r.pillarId,
    subtopicId: r.subtopicId,
  }));
  const taken = new Set(input.takenSlugs?.keys() ?? []);
  const { assignments } = assignSlugs(slugInputs, taken, input.slugOverrides ?? new Map());
  const slugByExternalId = new Map(assignments.map((a) => [a.externalId, a]));
  const duplicateSlugs: PlanImportReport["duplicateSlugs"] = [];
  const bySlug = new Map<string, string[]>();
  for (const a of assignments) {
    const list = bySlug.get(a.slug);
    if (list) list.push(a.externalId);
    else bySlug.set(a.slug, [a.externalId]);
  }
  for (const [slug, ids] of bySlug) {
    if (ids.length > 1) duplicateSlugs.push({ slug, externalIds: ids });
  }
  if (duplicateSlugs.length > 0) {
    blocking.push(
      `${duplicateSlugs.length} slug(s) are claimed by more than one row — rename one of each pair.`,
    );
  }
  const articleCollisions: PlanImportReport["articleCollisions"] = [];
  for (const a of assignments) {
    const stage = input.takenSlugs?.get(a.slug);
    if (stage) articleCollisions.push({ externalId: a.externalId, slug: a.slug, stage });
  }
  if (articleCollisions.length > 0) {
    blocking.push(
      `${articleCollisions.length} row(s) collide with an existing article — ` +
        `skip, rename, or link each one before importing.`,
    );
  }
  // ── titles ──────────────────────────────────────────────────────────────
  const duplicateTitles: PlanImportReport["duplicateTitles"] = [];
  const byTitle = new Map<string, string[]>();
  for (const r of rows) {
    const key = r.title.trim().toLowerCase();
    const list = byTitle.get(key);
    if (list) list.push(r.externalId);
    else byTitle.set(key, [r.externalId]);
  }
  for (const [, ids] of byTitle) {
    if (ids.length > 1) {
      const first = rows.find((r) => r.externalId === ids[0]);
      duplicateTitles.push({ title: first?.title ?? "", externalIds: ids });
    }
  }
  // ── hierarchy ───────────────────────────────────────────────────────────
  const orphanRows: PlanImportReport["orphanRows"] = [];
  const pillarsWithRows = new Set(rows.map((r) => r.pillarId));
  const pillarPageIds = new Set(rows.filter((r) => r.pageRole === "pillar").map((r) => r.pillarId));
  const missingPillars = [...pillarsWithRows].filter((p) => !pillarPageIds.has(p));
  const hubKeys = new Set(
    rows.filter((r) => r.pageRole === "hub").map((r) => `${r.pillarId}::${r.subtopicId ?? ""}`),
  );
  const missingHubs = [
    ...new Set(
      rows
        .filter((r) => r.pageRole === "cluster" && r.subtopicId)
        .map((r) => `${r.pillarId}::${r.subtopicId ?? ""}`)
        .filter((k) => !hubKeys.has(k)),
    ),
  ];
  for (const r of rows) {
    if (r.pageRole === "cluster" && !r.subtopicId) {
      orphanRows.push({ externalId: r.externalId, reason: "cluster article with no subtopic" });
    }
  }
  // ── briefs ──────────────────────────────────────────────────────────────
  const ctx = buildSynthesisContext({
    pillars,
    subtopics,
    concepts,
    rows,
    companyName: input.companyName,
    ...(input.defaultPersona ? { defaultPersona: input.defaultPersona } : {}),
  });
  const synthOpts =
    input.routingTypesDocumented === false ? { routingTypesDocumented: false } : {};
  const needsQueryTarget: string[] = [];
  const briefs = new Map<string, { brief: SpokeBrief; needsQueryTarget: boolean }>();
  for (const r of rows) {
    const result = synthesizeBrief(r, ctx, synthOpts);
    const override = input.queryTargetOverrides?.get(r.externalId);
    if (override) {
      result.brief.primaryQueryTarget = override.trim().toLowerCase();
      result.needsQueryTarget = false;
    }
    if (result.needsQueryTarget) needsQueryTarget.push(r.externalId);
    briefs.set(r.externalId, result);
  }
  const keywordCollisions: PlanImportReport["keywordCollisions"] = [];
  if (input.existingKeywords) {
    for (const r of rows) {
      const text = briefs.get(r.externalId)?.brief.primaryQueryTarget ?? "";
      const status = input.existingKeywords.get(text);
      if (status) keywordCollisions.push({ externalId: r.externalId, text, status });
    }
  }
  // ── order ───────────────────────────────────────────────────────────────
  const parentByExternalId = new Map<string, string | null>();
  for (const r of rows) parentByExternalId.set(r.externalId, parentOf(r, rows)?.externalId ?? null);
  const sequenceInputs: SequenceInput[] = rows.map((r) => {
    const sub = r.subtopicId ? subtopics.find((s) => s.subtopicId === r.subtopicId) : undefined;
    return {
      key: r.externalId,
      parentKey: parentByExternalId.get(r.externalId) ?? null,
      rowIndex: r.sheetRow,
      pillarId: r.pillarId,
      subtopicId: r.subtopicId,
      role: r.pageRole,
      priority: r.priority,
      funnel: r.funnel,
      tier: sub?.tier ?? null,
    };
  });
  const { ordered, promotions, violations } = computeSequence(sequenceInputs);
  const sequenceByKey = new Map(ordered.map((o) => [o.key, o.sequence]));
  for (const v of violations) orphanRows.push({ externalId: "(plan)", reason: v });
  // ── items ───────────────────────────────────────────────────────────────
  const items: DraftPlanItem[] = rows.map((r) => {
    const slug = slugByExternalId.get(r.externalId);
    const synth = briefs.get(r.externalId);
    const sub = r.subtopicId ? subtopics.find((s) => s.subtopicId === r.subtopicId) : undefined;
    return {
      externalId: r.externalId,
      sheetRow: r.sheetRow,
      pageRole: r.pageRole,
      pillarId: r.pillarId,
      pillarName: r.pillarName,
      subtopicId: r.subtopicId,
      subtopicName: r.subtopicName,
      parentExternalId: parentByExternalId.get(r.externalId) ?? null,
      title: r.title,
      format: r.format,
      funnel: r.funnel,
      searchIntent: r.searchIntent,
      priority: r.priority,
      tierHint: sub?.tier ?? null,
      tieIn: r.tieIn,
      sourcePages: r.sourcePages,
      slug: slug?.slug ?? "",
      slugStrategy: slug?.strategy ?? "title",
      primaryQueryTarget: synth?.brief.primaryQueryTarget ?? "",
      needsQueryTarget: synth?.needsQueryTarget ?? true,
      brief: synth?.brief as SpokeBrief,
      sequence: sequenceByKey.get(r.externalId) ?? r.sheetRow,
    };
  });
  const report: PlanImportReport = {
    sheet: mapping.sheet,
    totalRows: sheet.rows.length,
    mappedRows: rows.length,
    skippedRows: skipped,
    byPageRole: countBy(rows.map((r) => r.pageRole)),
    byFunnel: countBy(rows.map((r) => r.funnel)),
    byPriority: countBy(rows.map((r) => `P${r.priority}`)),
    byIntent: countBy(rows.map((r) => r.searchIntent)),
    byFormat: countBy(rows.map((r) => r.format || "(none)")),
    unrecognized,
    duplicateSlugs,
    duplicateTitles,
    articleCollisions,
    keywordCollisions,
    orphanRows,
    missingHubs,
    missingPillars,
    needsQueryTarget,
    blocking,
  };
  // Defaulted facets are a warning, never blocking — a map without a funnel
  // column is still a usable map.
  if (defaulted.length > 0 && sheet.truncated) {
    report.skippedRows.push({
      row: -1,
      reason: `sheet was truncated at ${sheet.rows.length} rows — split the file or raise the cap`,
    });
  }
  if (sheet.truncated) {
    blocking.push(
      `The sheet was truncated at ${sheet.rows.length} rows. Importing would silently drop the rest.`,
    );
  }
  const analysis: PlanAnalysis = {
    report,
    taxonomy: { pillars, subtopics },
    concepts,
    items,
    promotions,
  };
  const notes = collectNotes(workbook);
  if (notes) analysis.notes = notes;
  return analysis;
}
function emptyReport(sheet: string, blocking: string[]): PlanImportReport {
  return {
    sheet,
    totalRows: 0,
    mappedRows: 0,
    skippedRows: [],
    byPageRole: {},
    byFunnel: {},
    byPriority: {},
    byIntent: {},
    byFormat: {},
    unrecognized: [],
    duplicateSlugs: [],
    duplicateTitles: [],
    articleCollisions: [],
    keywordCollisions: [],
    orphanRows: [],
    missingHubs: [],
    missingPillars: [],
    needsQueryTarget: [],
    blocking,
  };
}
