import type { ObjectId } from "mongodb";
import type { SpokeBrief } from "../cluster/types.js";

/**
 * Domain types for an imported SEO content plan (a "pillar map"): a
 * spreadsheet of planned articles the operator authored outside the system.
 *
 * Unlike a cluster run, a plan is DATA, not a job. The only job a plan owns
 * is the optional LLM brief-enrichment pass over its items; production is
 * driven by the scheduler (see ../schedule/).
 *
 * Why not reuse `clusters`/`themes`: `claimClusterRun` matches ANY clusters
 * doc with status "queued" regardless of shape, so an imported map would be
 * claimed and run through all nine LLM stages; `enqueueArticlePipeline`
 * resolves a brief 1:1 by theme name (a map has ~6 articles per subtopic);
 * and `ThemeDoc` requires fan-out artifacts (stability, breadth, subQueries)
 * that would have to be fabricated 84 times.
 */

/** Pillar page and subtopic hub are ROUTING pages; cluster is a normal spoke. */
export const PAGE_ROLES = ["pillar", "hub", "cluster"] as const;
export type PageRole = (typeof PAGE_ROLES)[number];

export const FUNNEL_STAGES = ["tofu", "mofu", "bofu"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const SEARCH_INTENTS = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

/** P1 / P2 / P3 in the workbook's vocabulary. */
export type PriorityTier = 1 | 2 | 3;

/** The fields a spreadsheet column can be mapped onto. */
export const PLAN_COLUMNS = [
  "externalId",
  "pillar",
  "subtopic",
  "title",
  "pageRole",
  "searchIntent",
  "format",
  "funnel",
  "priority",
  "tieIn",
  "sourcePages",
] as const;
export type PlanColumn = (typeof PLAN_COLUMNS)[number];

/**
 * Operator-adjustable header -> field assignment. Auto-detected by
 * suggestMapping(), then editable in the import UI, so a differently-shaped
 * workbook needs no code change.
 */
export interface PlanMapping {
  /** Name of the payload sheet (the one with one row per planned article). */
  sheet: string;
  /** field -> 0-based column index in that sheet; absent means unmapped. */
  columns: Partial<Record<PlanColumn, number>>;
  /** Raw cell value (lowercased, trimmed) -> canonical facet value. */
  values: {
    pageRole: Record<string, PageRole>;
    funnel: Record<string, FunnelStage>;
    priority: Record<string, PriorityTier>;
    searchIntent: Record<string, SearchIntent>;
  };
}

/** One parsed sheet as a raw grid, kept so re-mapping needs no re-upload. */
export interface PlanSheet {
  name: string;
  headers: string[];
  rows: string[][];
  /** True when rows were cut short by the parser's row cap. */
  truncated?: boolean;
}

/** Pillar Summary sheet: head terms and the pillar-level differentiation angle. */
export interface PlanPillar {
  pillarId: string;
  name: string;
  pageTitle: string;
  headTerm: string;
  /** "Why <company> Can Own It" -> the inherited differentiation angle. */
  whyWeCanOwnIt: string;
  sourcePages: string[];
}

/** Subtopics sheet: hub titles, tier, and the subtopic-level product hook. */
export interface PlanSubtopic {
  subtopicId: string;
  pillarId: string;
  name: string;
  hubTitle: string;
  tier: "A" | "B" | "C" | null;
  tieIn: string;
  sourcePages: string[];
}

/**
 * Concepts sheet: the ONLY proprietary-evidence vocabulary in the workbook,
 * and therefore the only proprietary proof the enrichment pass may name
 * (D34 forbids fabricated evidence).
 */
export interface PlanConcept {
  term: string;
  whereItAppears: string;
  pillarId: string | null;
}

/** What the operator sees before committing an import. */
export interface PlanImportReport {
  sheet: string;
  totalRows: number;
  mappedRows: number;
  skippedRows: { row: number; reason: string }[];
  byPageRole: Record<string, number>;
  byFunnel: Record<string, number>;
  byPriority: Record<string, number>;
  byIntent: Record<string, number>;
  byFormat: Record<string, number>;
  /** Facet values no value-map entry covers, with the rows carrying them. */
  unrecognized: { field: PlanColumn; value: string; rows: number[] }[];
  /** Two rows in THIS import resolving to the same slug after disambiguation. */
  duplicateSlugs: { slug: string; externalIds: string[] }[];
  duplicateTitles: { title: string; externalIds: string[] }[];
  /** A row's slug already belongs to an existing ArticleDoc. */
  articleCollisions: { externalId: string; slug: string; stage: string }[];
  /** A row's query target already exists in the keyword library. */
  keywordCollisions: { externalId: string; text: string; status: string }[];
  orphanRows: { externalId: string; reason: string }[];
  missingHubs: string[];
  missingPillars: string[];
  /** Rows whose query target could not be derived naturally (D32). */
  needsQueryTarget: string[];
  /** Non-empty means the Commit action is refused. */
  blocking: string[];
}

export type PlanStatus = "draft" | "ready" | "enriching" | "failed" | "archived";

/** Enrichment is one stage; per-item resume is a query, not a checkpoint. */
export type PlanStage = "enrich" | "done";

export interface PlanUsage {
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Which plan items the scheduler may produce. Scoping a 504-row plan is done
 * with this filter, never by deleting rows, so widening scope later touches
 * no sequence value.
 */
export interface PlanScope {
  maxSequence?: number;
  pillarIds?: string[];
  roles?: PageRole[];
  tiers?: PriorityTier[];
}

export interface PlanDoc {
  _id?: ObjectId;
  companyId: string;
  /** Uploaded filename, e.g. "Saporo_SEO_Pillar_Map.xlsx". */
  filename: string;
  /** Storage key of the archived source file (plans/<id>/source.xlsx). */
  sourceKey?: string;
  status: PlanStatus;

  /** Enrichment job state — same lease semantics as ScrapeDoc. */
  stage: PlanStage;
  attempts: number;
  maxAttempts: number;
  workerId?: string;
  leaseUntil?: Date;
  eventSeq: number;

  /** Every parsed sheet, kept so re-mapping needs no re-upload. */
  sheets: PlanSheet[];
  mapping: PlanMapping;
  report?: PlanImportReport;
  taxonomy: { pillars: PlanPillar[]; subtopics: PlanSubtopic[] };
  concepts: PlanConcept[];
  /** README-style sheets, verbatim and unparsed — operator context only. */
  notes?: string;

  /** Set at commit: how many plan_items were created. */
  itemCount?: number;
  usage: PlanUsage;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Plan item lifecycle. Note there is deliberately no "blocked" state: being
 * blocked by an unfinished parent is DERIVED per tick by isReady(), so a
 * subtree unblocks automatically the moment its parent completes.
 */
export const PLAN_ITEM_STATUSES = [
  "planned",
  "enqueued",
  "in_progress",
  "done",
  "failed",
  "quarantined",
  "skipped",
  "slug_conflict",
] as const;
export type PlanItemStatus = (typeof PLAN_ITEM_STATUSES)[number];

/** Statuses an item can never leave on its own. */
export const TERMINAL_PLAN_ITEM_STATUSES: readonly PlanItemStatus[] = [
  "done",
  "quarantined",
  "skipped",
];

export type EnrichmentState = "pending" | "done" | "failed" | "skipped";

/** How a plan item's slug was arrived at (surfaced in the import report). */
export type SlugStrategy = "title" | "trimmed" | "suffixed" | "manual";

export interface PlanItemDoc {
  _id?: ObjectId;
  companyId: string;
  planId: ObjectId;
  /** The workbook's own primary key, e.g. "P01-S03-A07" or "P01". */
  externalId: string;
  /** 0-based row index in the payload sheet — a stable final tiebreak. */
  sheetRow: number;

  pageRole: PageRole;
  pillarId: string;
  pillarName: string;
  subtopicId: string | null;
  subtopicName: string | null;
  /** Hub row for a cluster article; pillar row for a hub. */
  parentItemId?: ObjectId;

  title: string;
  /** Raw sheet value, e.g. "Comparison (Concept)" — drives the length band. */
  format: string;
  funnel: FunnelStage;
  searchIntent: SearchIntent;
  priority: PriorityTier;
  /** A/B/C from the Subtopics sheet; a planning signal, not an ordering one. */
  tierHint: "A" | "B" | "C" | null;
  tieIn: string;
  sourcePages: string[];

  /** Reserved at import; immutable once articleId is set. */
  slug: string;
  slugStrategy: SlugStrategy;
  /** D32: a natural query a person would type. Human-editable before enqueue. */
  primaryQueryTarget: string;
  /** True when derivation could not reach a natural query — needs a human. */
  needsQueryTarget: boolean;

  brief: SpokeBrief;
  enrichment: EnrichmentState;
  enrichedAt?: Date;
  enrichmentProblems?: string[];

  /** Production order, computed at import by computeSequence(). */
  sequence: number;
  status: PlanItemStatus;
  articleId?: ObjectId;
  runId?: ObjectId;
  /** Scheduler bookkeeping. */
  enqueuedAt?: Date;
  completedAt?: Date;
  fireSeq?: number;
  failureCount: number;
  retryAfter?: Date;
  lastError?: string;
  /** Operator escape: produce this item even though its parent is unfinished. */
  dependencyOverride?: boolean;
  /** Set when the parent was skipped, so the brief drops the parent mention. */
  parentSkipped?: boolean;
  /** Set with status "slug_conflict": the article already holding the slug. */
  conflictWith?: ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * One event stream for both halves of the feature (import/enrichment and the
 * scheduler). A separate collection from `events` because EventDoc requires
 * runId + articleId and allocates seq via $inc on the run doc — a scheduler
 * tick has neither. Precedents: cluster_events, scrape_events.
 */
export type PlanEventType =
  // import + enrichment
  | "plan.created"
  | "plan.committed"
  | "plan.enrich.started"
  | "plan.enrich.progress"
  | "plan.enrich.succeeded"
  | "plan.enrich.failed"
  | "item.enriched"
  | "item.enrich.failed"
  // scheduler
  | "schedule.tick"
  | "schedule.enqueued"
  | "schedule.throttled"
  | "schedule.skipped"
  | "schedule.paused"
  | "schedule.resumed"
  | "item.blocked"
  | "item.failed"
  | "item.quarantined"
  | "item.skipped"
  | "item.slug_conflict"
  | "plan.completed";

export interface PlanEventDoc {
  _id?: ObjectId;
  companyId: string;
  planId: ObjectId;
  planItemId?: ObjectId;
  seq: number;
  ts: Date;
  type: PlanEventType;
  message: string;
  data?: Record<string, unknown>;
}
