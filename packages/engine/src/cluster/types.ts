import type { ObjectId } from "mongodb";

/**
 * Domain types for the Topic & Cluster Generator (roadmap Phase 4C, decisions
 * D30/D31). The spec at agents/topic-cluster-generator.md is the single
 * source of behavior; these types mirror its output schema so the worker's
 * staged runner and the review UI (4D) share one shape.
 */

/** The 8 fan-out sub-query types from spec §2.2. */
export const SUB_QUERY_TYPES = [
  "equivalent",
  "specification",
  "generalization",
  "follow_up",
  "canonicalization",
  "entailment",
  "clarification",
  "translation",
] as const;
export type SubQueryType = (typeof SUB_QUERY_TYPES)[number];

/** Guardrail: every data point is labeled with where it came from. */
export type SubQuerySource = "observed:gemini" | "simulated";
export type QuestionSource = "serp" | "community" | "company" | "simulated";

export interface TermEntry {
  term: string;
  category:
    | "primary_seed"
    | "equivalent_phrasing"
    | "canonical_term"
    | "entity"
    | "persona_terminology"
    | "adjacent_concept";
  intent: "informational" | "commercial" | "transactional" | "navigational";
}

export interface ClusterPrompt {
  id: string;
  text: string;
  persona: string;
  stage: string;
}

/** One logged fan-out sub-query (spec §2.3: prompt id, run, type, source). */
export interface FanoutSubQuery {
  promptId: string;
  run: number;
  type: SubQueryType;
  text: string;
  source: SubQuerySource;
}

export const QUESTION_TYPES = ["what", "how", "why", "which_best", "vs", "cost_roi"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Spec §4 weights per question type. */
export const QUESTION_WEIGHTS: Record<QuestionType, "medium" | "high" | "very_high"> = {
  what: "medium",
  how: "high",
  why: "medium",
  which_best: "high",
  vs: "high",
  cost_roi: "very_high",
};

export interface MinedQuestion {
  text: string;
  source: QuestionSource;
  qType: QuestionType;
  theme?: string;
}

export type ThemeTier = "core" | "secondary" | "noise";
export type GapStatus = "owned" | "buried" | "missing";
export type ArchitectureType = "spoke" | "section" | "non_blog" | "off_site";

export interface ThemeScores {
  decisiveness: number;
  gap: number;
  rightToWin: number;
  stability: number;
  openness: number;
  total: number;
}

export interface SerpObservation {
  subQuery: string;
  results: { rank: number; title: string; domain: string; url: string }[];
  peopleAlsoAsk: string[];
  aiOverviewPresent: boolean;
  /** LLM summary: dominant format, depth, freshness, gaps. */
  analysis?: string;
}

export interface AiSurfaceObservation {
  surface: string;
  prompt: string;
  citedDomains: string[];
  citedUrls: string[];
  answerExcerpt?: string;
}

export interface ThemeValidation {
  serp?: SerpObservation[];
  aiSurfaces?: AiSurfaceObservation[];
  /** Set when validation could not run (e.g. no DataForSEO credentials). */
  skipped?: string;
}

export interface ThemeDoc {
  _id?: ObjectId;
  companyId: string;
  clusterId: ObjectId;
  name: string;
  /** runs where the theme appeared ÷ total runs (spec §3.2). */
  stability: number;
  /** distinct sub-query types in the theme (spec §3.2). */
  breadth: number;
  tier: ThemeTier;
  /** True when the theme was added by question mining, not fan-out (spec §4). */
  questionMined?: boolean;
  subQueries: FanoutSubQuery[];
  mappedQuestions: MinedQuestion[];
  gapStatus?: GapStatus;
  ownerAsset?: string;
  /** Non-blog / off-site ownership flags from the gap map (spec §6). */
  nonBlogAsset?: string;
  offSiteChannel?: string;
  validation?: ThemeValidation;
  scores?: ThemeScores;
  rationale?: Record<string, string>;
  /** Low right-to-win themes are awareness plays, never silently core (spec §7). */
  awarenessPlay?: boolean;
  architecture?: ArchitectureType;
  parentSpoke?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpokeBrief {
  themeName: string;
  workingTitle: string;
  /**
   * The article's keyword target (D32): a natural query a person would
   * type. NEVER a fan-out sub-query string — sub-queries shape passages,
   * not titles (spec guardrail).
   */
  primaryQueryTarget: string;
  queryTargetAlternates?: string[];
  persona: string;
  buyingStage: string;
  representativeSubQueries: string[];
  /** Required passages (D33): a coverage contract, not the article outline. */
  h2Outline: string[];
  evidence: {
    proprietary: string[];
    external: { requirement: string; sourceUrl?: string }[];
    quotableStatCandidate: string;
  };
  differentiationAngle: string;
  /**
   * `hub` is the page above (empty for a pillar page, which has none),
   * `siblings` are peers, and `children` are the pages a ROUTING page must
   * link down to. Values are page TITLES, not URLs.
   */
  internalLinks: { hub: string; siblings: string[]; children?: string[] };
  lengthBand: { min: number; max: number; justification?: string };
  schemaTypes: string[];
  /** Rendered markdown brief — what the Strategist receives (4.12). */
  markdown: string;
  priorityScore: number;
}

/** Stages of a cluster run, in execution order. */
export const CLUSTER_STAGES = [
  "expansion",
  "fanout",
  "clustering",
  "questions",
  "validation",
  "gap_map",
  "prioritization",
  "architecture",
  "briefs",
] as const;
export type ClusterStage = (typeof CLUSTER_STAGES)[number];

export type ClusterStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface ClusterUsage {
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  dataForSeoCalls: number;
  dataForSeoCostUsd: number;
}

export interface ClusterHub {
  title: string;
  themeSummaries: { theme: string; summary: string }[];
}

/**
 * One cluster run: the job document (lease-claim queue, same pattern as
 * RunDoc) and the accumulating result. Stage outputs persist as they
 * complete so a retry resumes at the failed stage.
 */
export interface ClusterDoc {
  _id?: ObjectId;
  companyId: string;
  seed: string;
  status: ClusterStatus;
  stage: ClusterStage | "done";
  completedStages: ClusterStage[];
  attempts: number;
  maxAttempts: number;
  workerId?: string;
  leaseUntil?: Date;
  eventSeq: number;
  /** K repeated fan-out runs per prompt (spec §2.3, default 5). */
  k: number;
  mode?: "observed" | "simulated";
  models: { main: string; fanout: string };
  entityMap?: TermEntry[];
  prompts?: ClusterPrompt[];
  generations?: FanoutSubQuery[];
  questions?: MinedQuestion[];
  hub?: ClusterHub;
  spokeBriefs?: SpokeBrief[];
  /** Theme names whose briefs the operator rejected in review (4D). */
  dismissedBriefs?: string[];
  /** Final JSON in the spec's output schema, assembled after briefs. */
  output?: Record<string, unknown>;
  outputProblems?: string[];
  usage: ClusterUsage;
  error?: string;
  queuedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ClusterEventType =
  | "cluster.queued"
  | "cluster.started"
  | "cluster.succeeded"
  | "cluster.failed"
  | "cluster.retried"
  | "stage.started"
  | "stage.progress"
  | "stage.succeeded"
  | "stage.failed";

export interface ClusterEventDoc {
  _id?: ObjectId;
  companyId: string;
  clusterId: ObjectId;
  seq: number;
  ts: Date;
  type: ClusterEventType;
  message: string;
  data?: Record<string, unknown>;
}

/** Per-call external API cost ledger (shared with Phase 9 per roadmap 4.1). */
export interface ApiCostDoc {
  _id?: ObjectId;
  companyId: string;
  provider: "dataforseo" | "anthropic" | "gemini";
  endpoint: string;
  costUsd: number;
  at: Date;
  meta?: Record<string, unknown>;
}
