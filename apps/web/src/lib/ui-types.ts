import type {
  ArticleDoc,
  ClusterDoc,
  ClusterEventDoc,
  EventDoc,
  KeywordDoc,
  PhaseResult,
  RunDoc,
  ScrapeDoc,
  ScrapeEventDoc,
  SpokeBrief,
  Stage,
  ThemeDoc,
  PlanDoc,
  PlanEventDoc,
  PlanItemDoc,
  ScheduleDoc,
  PreviewEntry,
} from "@blogagent/engine";

/**
 * Plain-JSON shapes safe to pass into client components (no ObjectId/Date).
 * Server components map Mongo docs through these before handing them down.
 */

export interface UiKeyword {
  id: string;
  text: string;
  source: string;
  volume: number | null;
  difficulty: number | null;
  priority: number | null;
  status: string;
  articleSlug: string | null;
  cluster: string | null;
  updatedAt: string;
}

export interface UiArticleSummary {
  id: string;
  slug: string;
  folder: string;
  topic: string;
  title: string;
  targetKeyword: string | null;
  stage: Stage;
  updatedAt: string;
  imported: boolean;
  hasHeader: boolean;
  auditFailures: number | null;
  hubspotUrl: string | null;
}

export interface UiPhaseResult {
  phase: string;
  status: string;
  attempt: number;
  startedAt: string;
  endedAt: string | null;
  costUsd: number | null;
  gateProblems: string[];
}

export interface UiRun {
  id: string;
  articleId: string;
  status: string;
  fromStage: string;
  attempts: number;
  maxAttempts: number;
  currentPhase: string | null;
  error: string | null;
  queuedAt: string;
  phaseResults: UiPhaseResult[];
}

export interface UiEvent {
  id: string;
  runId: string;
  articleId: string;
  seq: number;
  ts: string;
  type: string;
  message: string;
}

export function toUiKeyword(doc: KeywordDoc, articleSlug?: string | null): UiKeyword {
  return {
    id: doc._id?.toHexString() ?? "",
    text: doc.text,
    source: doc.source,
    volume: doc.volume ?? null,
    difficulty: doc.difficulty ?? null,
    priority: doc.priority ?? null,
    status: doc.status,
    articleSlug: articleSlug ?? null,
    cluster: doc.cluster ?? null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toUiArticleSummary(doc: ArticleDoc): UiArticleSummary {
  return {
    id: doc._id?.toHexString() ?? "",
    slug: doc.slug,
    folder: doc.folder,
    topic: doc.topic,
    title: String(doc.frontmatter?.["title"] ?? doc.topic ?? doc.slug),
    targetKeyword: doc.targetKeyword ?? null,
    stage: doc.stage,
    updatedAt: doc.updatedAt.toISOString(),
    imported: doc.imported ?? false,
    hasHeader: Boolean(doc.header),
    auditFailures: doc.audit ? doc.audit.failures : null,
    hubspotUrl: doc.hubspot?.url ?? null,
  };
}

function toUiPhaseResult(pr: PhaseResult): UiPhaseResult {
  return {
    phase: pr.phase,
    status: pr.status,
    attempt: pr.attempt,
    startedAt: pr.startedAt.toISOString(),
    endedAt: pr.endedAt?.toISOString() ?? null,
    costUsd: pr.usage?.costUsd ?? null,
    gateProblems: pr.gate?.problems ?? [],
  };
}

export function toUiRun(doc: RunDoc): UiRun {
  return {
    id: doc._id?.toHexString() ?? "",
    articleId: doc.articleId.toHexString(),
    status: doc.status,
    fromStage: doc.fromStage,
    attempts: doc.attempts,
    maxAttempts: doc.maxAttempts,
    currentPhase: doc.currentPhase ?? null,
    error: doc.error ?? null,
    queuedAt: doc.queuedAt.toISOString(),
    phaseResults: doc.phaseResults.map(toUiPhaseResult),
  };
}

export function toUiEvent(doc: EventDoc): UiEvent {
  return {
    id: doc._id?.toHexString() ?? "",
    runId: doc.runId.toHexString(),
    articleId: doc.articleId.toHexString(),
    seq: doc.seq,
    ts: doc.ts.toISOString(),
    type: doc.type,
    message: doc.message,
  };
}

// --- Topic & Cluster Generator (4D) ----------------------------------------

export interface UiClusterSummary {
  id: string;
  seed: string;
  status: string;
  stage: string;
  attempts: number;
  maxAttempts: number;
  mode: string | null;
  k: number;
  themeCount: number;
  briefCount: number;
  llmCalls: number;
  dataForSeoCalls: number;
  error: string | null;
  queuedAt: string;
  updatedAt: string;
}

export interface UiSpokeBrief {
  themeName: string;
  workingTitle: string;
  primaryQueryTarget: string;
  persona: string;
  buyingStage: string;
  representativeSubQueries: string[];
  h2Outline: string[];
  proprietaryEvidence: string[];
  externalEvidence: { requirement: string; sourceUrl: string | null }[];
  quotableStatCandidate: string;
  differentiationAngle: string;
  hub: string;
  siblings: string[];
  lengthBand: { min: number; max: number; justification: string | null };
  schemaTypes: string[];
  priorityScore: number;
  dismissed: boolean;
}

export interface UiTheme {
  id: string;
  name: string;
  stability: number;
  breadth: number;
  tier: string;
  questionMined: boolean;
  subQueryCount: number;
  representativeSubQueries: string[];
  mappedQuestions: { text: string; qType: string; source: string }[];
  gapStatus: string | null;
  ownerAsset: string | null;
  nonBlogAsset: string | null;
  offSiteChannel: string | null;
  validationSkipped: string | null;
  serpAnalysis: string | null;
  scores: {
    decisiveness: number;
    gap: number;
    rightToWin: number;
    stability: number;
    openness: number;
    total: number;
  } | null;
  rationale: Record<string, string>;
  awarenessPlay: boolean;
  architecture: string | null;
  parentSpoke: string | null;
}

export interface UiClusterEvent {
  id: string;
  seq: number;
  ts: string;
  type: string;
  message: string;
}

export function toUiClusterSummary(doc: ClusterDoc, themeCount: number): UiClusterSummary {
  return {
    id: doc._id?.toHexString() ?? "",
    seed: doc.seed,
    status: doc.status,
    stage: doc.stage,
    attempts: doc.attempts,
    maxAttempts: doc.maxAttempts,
    mode: doc.mode ?? null,
    k: doc.k,
    themeCount,
    briefCount: doc.spokeBriefs?.length ?? 0,
    llmCalls: doc.usage.llmCalls,
    dataForSeoCalls: doc.usage.dataForSeoCalls,
    error: doc.error ?? null,
    queuedAt: doc.queuedAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toUiSpokeBrief(brief: SpokeBrief, dismissed: boolean): UiSpokeBrief {
  return {
    themeName: brief.themeName,
    workingTitle: brief.workingTitle,
    primaryQueryTarget: brief.primaryQueryTarget ?? "",
    persona: brief.persona,
    buyingStage: brief.buyingStage,
    representativeSubQueries: brief.representativeSubQueries,
    h2Outline: brief.h2Outline,
    proprietaryEvidence: brief.evidence.proprietary,
    externalEvidence: brief.evidence.external.map((e) => ({
      requirement: e.requirement,
      sourceUrl: e.sourceUrl ?? null,
    })),
    quotableStatCandidate: brief.evidence.quotableStatCandidate,
    differentiationAngle: brief.differentiationAngle,
    hub: brief.internalLinks.hub,
    siblings: brief.internalLinks.siblings,
    lengthBand: {
      min: brief.lengthBand.min,
      max: brief.lengthBand.max,
      justification: brief.lengthBand.justification ?? null,
    },
    schemaTypes: brief.schemaTypes,
    priorityScore: brief.priorityScore,
    dismissed,
  };
}

function themeReps(doc: ThemeDoc, limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const sq of doc.subQueries) {
    const key = sq.text.toLowerCase().trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const byText = new Map(doc.subQueries.map((sq) => [sq.text.toLowerCase().trim(), sq.text]));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => byText.get(key) ?? key);
}

export function toUiTheme(doc: ThemeDoc): UiTheme {
  return {
    id: doc._id?.toHexString() ?? "",
    name: doc.name,
    stability: doc.stability,
    breadth: doc.breadth,
    tier: doc.tier,
    questionMined: doc.questionMined ?? false,
    subQueryCount: doc.subQueries.length,
    representativeSubQueries: themeReps(doc),
    mappedQuestions: doc.mappedQuestions.map((q) => ({
      text: q.text,
      qType: q.qType,
      source: q.source,
    })),
    gapStatus: doc.gapStatus ?? null,
    ownerAsset: doc.ownerAsset ?? null,
    nonBlogAsset: doc.nonBlogAsset ?? null,
    offSiteChannel: doc.offSiteChannel ?? null,
    validationSkipped: doc.validation?.skipped ?? null,
    serpAnalysis: doc.validation?.serp?.[0]?.analysis ?? null,
    scores: doc.scores
      ? {
          decisiveness: doc.scores.decisiveness,
          gap: doc.scores.gap,
          rightToWin: doc.scores.rightToWin,
          stability: doc.scores.stability,
          openness: doc.scores.openness,
          total: doc.scores.total,
        }
      : null,
    rationale: doc.rationale ?? {},
    awarenessPlay: doc.awarenessPlay ?? false,
    architecture: doc.architecture ?? null,
    parentSpoke: doc.parentSpoke ?? null,
  };
}

export function toUiClusterEvent(doc: ClusterEventDoc): UiClusterEvent {
  return {
    id: doc._id?.toHexString() ?? "",
    seq: doc.seq,
    ts: doc.ts.toISOString(),
    type: doc.type,
    message: doc.message,
  };
}

// --- Competitive module (Phase 6) ------------------------------------------

export interface UiScrape {
  id: string;
  url: string;
  domain: string;
  status: string;
  stage: string;
  completedStages: string[];
  useBrowser: boolean;
  maxArticles: number | null;
  withImages: boolean;
  attempts: number;
  maxAttempts: number;
  imported: boolean;
  articleCount: number | null;
  totalWords: number | null;
  avgWordsPerArticle: number | null;
  topicCount: number | null;
  storagePrefix: string | null;
  storedFiles: number | null;
  error: string | null;
  queuedAt: string;
  endedAt: string | null;
}

export interface UiScrapeEvent {
  id: string;
  seq: number;
  ts: string;
  type: string;
  message: string;
}

export function toUiScrape(doc: ScrapeDoc): UiScrape {
  return {
    id: doc._id?.toHexString() ?? "",
    url: doc.url,
    domain: doc.domain,
    status: doc.status,
    stage: doc.stage,
    completedStages: doc.completedStages,
    useBrowser: doc.options.useBrowser,
    maxArticles: doc.options.maxArticles ?? null,
    withImages: doc.options.withImages,
    attempts: doc.attempts,
    maxAttempts: doc.maxAttempts,
    imported: doc.imported ?? false,
    articleCount: doc.corpus?.articleCount ?? null,
    totalWords: doc.corpus?.totalWords ?? null,
    avgWordsPerArticle: doc.corpus?.avgWordsPerArticle ?? null,
    topicCount: doc.topicIndex?.top_topics.length ?? null,
    storagePrefix: doc.storage?.prefix ?? null,
    storedFiles: doc.storage?.files ?? null,
    error: doc.error ?? null,
    queuedAt: doc.queuedAt.toISOString(),
    endedAt: doc.endedAt?.toISOString() ?? null,
  };
}

export function toUiScrapeEvent(doc: ScrapeEventDoc): UiScrapeEvent {
  return {
    id: doc._id?.toHexString() ?? "",
    seq: doc.seq,
    ts: doc.ts.toISOString(),
    type: doc.type,
    message: doc.message,
  };
}

// ── content plans ────────────────────────────────────────────────────────
// The row/detail split matters: a 504-row plan carrying ~2 KB of brief
// markdown per row would be ~1 MB of payload on every table render.

export interface UiPlanSummary {
  id: string;
  filename: string;
  status: string;
  itemCount: number;
  produced: number;
  byStatus: Record<string, number>;
  byEnrichment: Record<string, number>;
  llmCalls: number;
  costUsd: number;
  blocking: number;
  createdAt: string;
}

export interface UiPlanItemRow {
  id: string;
  externalId: string;
  sequence: number;
  title: string;
  slug: string;
  pageRole: string;
  pillarName: string;
  subtopicName: string | null;
  format: string;
  funnel: string;
  priority: number;
  status: string;
  enrichment: string;
  primaryQueryTarget: string;
  needsQueryTarget: boolean;
  failureCount: number;
  lastError: string | null;
  articleSlug: string | null;
}

export interface UiPlanItemDetail extends UiPlanItemRow {
  briefMarkdown: string;
  lengthBand: { min: number; max: number; justification?: string };
  schemaTypes: string[];
  internalLinks: { hub: string; siblings: string[]; children: string[] };
  enrichmentProblems: string[];
}

export interface UiPlanReport {
  sheet: string;
  totalRows: number;
  mappedRows: number;
  byPageRole: Record<string, number>;
  byFunnel: Record<string, number>;
  byPriority: Record<string, number>;
  byIntent: Record<string, number>;
  byFormat: Record<string, number>;
  unrecognized: { field: string; value: string; rows: number[] }[];
  skippedRows: { row: number; reason: string }[];
  duplicateSlugs: { slug: string; externalIds: string[] }[];
  articleCollisions: { externalId: string; slug: string; stage: string }[];
  keywordCollisions: { externalId: string; text: string; status: string }[];
  missingHubs: string[];
  missingPillars: string[];
  needsQueryTarget: string[];
  blocking: string[];
}

export interface UiSchedule {
  planId: string;
  name: string;
  status: string;
  timezone: string;
  daysOfWeek: number[];
  timeOfDay: string;
  batchSize: number;
  limits: {
    maxInFlight: number;
    maxAwaitingReview: number;
    maxPerCalendarWeek: number | null;
    maxTotalArticles: number | null;
    maxCostUsd: number | null;
    consecutiveFailureLimit: number;
    itemMaxAttempts: number;
  };
  requireApproval: boolean;
  estimatedArticleMinutes: number;
  nextFireAt: string | null;
  lastFiredAt: string | null;
  consecutiveFailures: number;
  pause: { reason: string; at: string; detail: string } | null;
  completedReason: string | null;
}

export interface UiPlanEvent {
  id: string;
  planId: string;
  seq: number;
  ts: string;
  type: string;
  message: string;
}

export interface UiPreviewEntry {
  fireAt: string;
  items: { sequence: number; slug: string; title: string; role: string }[];
  note: string | null;
}

export function toUiPlanSummary(
  doc: PlanDoc,
  counts: { total: number; byStatus: Record<string, number>; byEnrichment: Record<string, number>; produced: number },
): UiPlanSummary {
  return {
    id: doc._id?.toHexString() ?? "",
    filename: doc.filename,
    status: doc.status,
    itemCount: counts.total || (doc.itemCount ?? 0),
    produced: counts.produced,
    byStatus: counts.byStatus,
    byEnrichment: counts.byEnrichment,
    llmCalls: doc.usage.llmCalls,
    costUsd: doc.usage.costUsd,
    blocking: doc.report?.blocking.length ?? 0,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function toUiPlanItemRow(doc: PlanItemDoc, articleSlug?: string): UiPlanItemRow {
  return {
    id: doc._id?.toHexString() ?? "",
    externalId: doc.externalId,
    sequence: doc.sequence,
    title: doc.title,
    slug: doc.slug,
    pageRole: doc.pageRole,
    pillarName: doc.pillarName,
    subtopicName: doc.subtopicName,
    format: doc.format,
    funnel: doc.funnel,
    priority: doc.priority,
    status: doc.status,
    enrichment: doc.enrichment,
    primaryQueryTarget: doc.primaryQueryTarget,
    needsQueryTarget: doc.needsQueryTarget,
    failureCount: doc.failureCount,
    lastError: doc.lastError ?? null,
    articleSlug: articleSlug ?? null,
  };
}

export function toUiPlanItemDetail(doc: PlanItemDoc, articleSlug?: string): UiPlanItemDetail {
  return {
    ...toUiPlanItemRow(doc, articleSlug),
    briefMarkdown: doc.brief.markdown,
    lengthBand: doc.brief.lengthBand,
    schemaTypes: doc.brief.schemaTypes,
    internalLinks: {
      hub: doc.brief.internalLinks.hub,
      siblings: doc.brief.internalLinks.siblings,
      children: doc.brief.internalLinks.children ?? [],
    },
    enrichmentProblems: doc.enrichmentProblems ?? [],
  };
}

export function toUiPlanReport(r: NonNullable<PlanDoc["report"]>): UiPlanReport {
  return {
    sheet: r.sheet,
    totalRows: r.totalRows,
    mappedRows: r.mappedRows,
    byPageRole: r.byPageRole,
    byFunnel: r.byFunnel,
    byPriority: r.byPriority,
    byIntent: r.byIntent,
    byFormat: r.byFormat,
    unrecognized: r.unrecognized.map((u) => ({ field: u.field, value: u.value, rows: u.rows })),
    skippedRows: r.skippedRows,
    duplicateSlugs: r.duplicateSlugs,
    articleCollisions: r.articleCollisions,
    keywordCollisions: r.keywordCollisions,
    missingHubs: r.missingHubs,
    missingPillars: r.missingPillars,
    needsQueryTarget: r.needsQueryTarget,
    blocking: r.blocking,
  };
}

export function toUiSchedule(doc: ScheduleDoc): UiSchedule {
  return {
    planId: doc.planId.toHexString(),
    name: doc.name,
    status: doc.status,
    timezone: doc.cadence.timezone,
    daysOfWeek: doc.cadence.daysOfWeek,
    timeOfDay: doc.cadence.timeOfDay,
    batchSize: doc.cadence.batchSize,
    limits: {
      maxInFlight: doc.limits.maxInFlight,
      maxAwaitingReview: doc.limits.maxAwaitingReview,
      maxPerCalendarWeek: doc.limits.maxPerCalendarWeek ?? null,
      maxTotalArticles: doc.limits.maxTotalArticles ?? null,
      maxCostUsd: doc.limits.maxCostUsd ?? null,
      consecutiveFailureLimit: doc.limits.consecutiveFailureLimit,
      itemMaxAttempts: doc.limits.itemMaxAttempts,
    },
    requireApproval: doc.requireApproval,
    estimatedArticleMinutes: doc.estimatedArticleMinutes,
    nextFireAt: doc.nextFireAt?.toISOString() ?? null,
    lastFiredAt: doc.lastFiredAt?.toISOString() ?? null,
    consecutiveFailures: doc.consecutiveFailures,
    pause: doc.pause
      ? { reason: doc.pause.reason, at: doc.pause.at.toISOString(), detail: doc.pause.detail }
      : null,
    completedReason: doc.completedReason ?? null,
  };
}

export function toUiPlanEvent(doc: PlanEventDoc): UiPlanEvent {
  return {
    id: doc._id?.toHexString() ?? "",
    planId: doc.planId.toHexString(),
    seq: doc.seq,
    ts: doc.ts.toISOString(),
    type: doc.type,
    message: doc.message,
  };
}

export function toUiPreviewEntry(e: PreviewEntry): UiPreviewEntry {
  return {
    fireAt: e.fireAt.toISOString(),
    items: e.items.map((i) => ({ sequence: i.sequence, slug: i.slug, title: i.title, role: i.role })),
    note: e.note ?? null,
  };
}
