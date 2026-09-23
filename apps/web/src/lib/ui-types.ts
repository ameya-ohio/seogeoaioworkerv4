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
