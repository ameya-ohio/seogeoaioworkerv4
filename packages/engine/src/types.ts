import type { ObjectId } from "mongodb";
import type { CitationReport, LinkReport } from "./citations.js";

/**
 * Article lifecycle stages (roadmap §4). The six work stages map 1:1 to the
 * pipeline phases in agents/*.md; the rest are human/publish states.
 */
export const WORK_STAGES = [
  "research",
  "outline",
  "write",
  "edit",
  "schema",
  "design",
] as const;
export type WorkStage = (typeof WORK_STAGES)[number];

export const STAGES = [
  "queued",
  ...WORK_STAGES,
  "review",
  "approved",
  "publishing",
  "published",
  "failed",
  "paused",
] as const;
export type Stage = (typeof STAGES)[number];

/** The stage an article enters after a work stage completes. */
export function nextStage(stage: Stage): Stage | null {
  switch (stage) {
    case "queued":
      return "research";
    case "research":
      return "outline";
    case "outline":
      return "write";
    case "write":
      return "edit";
    case "edit":
      return "schema";
    case "schema":
      return "design";
    case "design":
      return "review";
    case "review":
      return "approved";
    case "approved":
      return "publishing";
    case "publishing":
      return "published";
    default:
      return null;
  }
}

export function isWorkStage(stage: string): stage is WorkStage {
  return (WORK_STAGES as readonly string[]).includes(stage);
}

/** One PASS/WARN/FAIL line from seo_audit.py or validate_schema.py. */
export interface CheckLine {
  level: "pass" | "warn" | "fail";
  message: string;
}

export interface ScriptReport {
  checks: CheckLine[];
  passes: number;
  warnings: number;
  failures: number;
  exitCode: number;
  ranAt: Date;
  raw: string;
}

export interface GateResult {
  ok: boolean;
  problems: string[];
  checkedAt: Date;
}

export interface PhaseUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd?: number;
  numTurns?: number;
  model?: string;
}

export interface PhaseResult {
  phase: WorkStage;
  status: "running" | "succeeded" | "failed";
  attempt: number;
  startedAt: Date;
  endedAt?: Date;
  usage?: PhaseUsage;
  gate?: GateResult;
  error?: string;
}

/** Markdown/JSON artifacts an article accumulates as stages complete. */
export interface ArticleArtifacts {
  researchNotes?: string;
  outline?: string;
  /** First full draft as written by Phase 3, before the Editor touches it. */
  draft?: string;
  /** Current article.md (post-edit; later phases keep updating it). */
  article?: string;
  meta?: Record<string, unknown>;
  schema?: Record<string, unknown>;
  headerHtml?: string;
}

export interface ArticleDoc {
  _id?: ObjectId;
  companyId: string;
  slug: string;
  /** Folder name under articles/, e.g. "2026-09-14-my-slug". */
  folder: string;
  /** The originating request: topic or full prompt. */
  topic: string;
  targetKeyword?: string;
  stage: Stage;
  stageHistory: { stage: Stage; at: Date; runId?: ObjectId }[];
  artifacts: ArticleArtifacts;
  frontmatter?: Record<string, unknown>;
  header?: { storageKey: string; url?: string; contentType: string };
  audit?: ScriptReport;
  schemaValidation?: ScriptReport;
  gates?: Partial<Record<WorkStage, GateResult>>;
  hubspot?: { postId?: string; url?: string; state?: string };
  /**
   * Spoke brief from the Topic & Cluster Generator (4.12, D31). When set,
   * the Strategist receives it as a first-class input and its length band
   * overrides the SERP-median word-count rule.
   */
  brief?: {
    clusterId: ObjectId;
    themeId: ObjectId;
    themeName: string;
    markdown: string;
    lengthBand: { min: number; max: number; justification?: string };
  };
  /** Live citation verification (D34) — research-stage, refreshed at edit. */
  citationChecks?: CitationReport;
  /** Internal-link resolution (D35) — edit-stage. */
  linkChecks?: LinkReport;
  /**
   * Planned cluster-sibling pages the article references as plain mentions;
   * Phase 5 turns them into links when the siblings publish (D35).
   */
  pendingLinks?: string[];
  /** Set when stage === "failed". */
  error?: string;
  /** True for docs backfilled from pre-Mongo article folders. */
  imported?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface RunDoc {
  _id?: ObjectId;
  companyId: string;
  articleId: ObjectId;
  kind: "pipeline";
  /** Work stage to start from (resume point on retry). */
  fromStage: WorkStage;
  status: RunStatus;
  attempts: number;
  maxAttempts: number;
  workerId?: string;
  leaseUntil?: Date;
  currentPhase?: WorkStage;
  phaseResults: PhaseResult[];
  eventSeq: number;
  error?: string;
  queuedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type EventType =
  | "run.queued"
  | "run.started"
  | "run.succeeded"
  | "run.failed"
  | "run.retried"
  | "phase.started"
  | "phase.progress"
  | "phase.succeeded"
  | "phase.failed"
  | "gate.passed"
  | "gate.failed"
  | "stage.changed";

export interface EventDoc {
  _id?: ObjectId;
  companyId: string;
  runId: ObjectId;
  articleId: ObjectId;
  seq: number;
  ts: Date;
  type: EventType;
  message: string;
  data?: Record<string, unknown>;
}

export type KeywordSource = "chat" | "csv" | "agent";
export type KeywordStatus =
  | "idea"
  | "queued"
  | "in_production"
  | "in_review"
  | "published"
  | "archived";

export interface KeywordDoc {
  _id?: ObjectId;
  companyId: string;
  text: string;
  source: KeywordSource;
  volume?: number;
  difficulty?: number;
  priority?: number;
  status: KeywordStatus;
  articleId?: ObjectId;
  cluster?: string;
  /** Set when the keyword came from an accepted spoke brief (4.12). */
  clusterId?: ObjectId;
  themeId?: ObjectId;
  rationale?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyDoc {
  _id?: ObjectId;
  /** company.id from company.yaml — the future multi-tenant key (D1). */
  companyId: string;
  name: string;
  /** Full parsed company.yaml snapshot. */
  config: Record<string, unknown>;
  configPath: string;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettingDoc {
  _id?: ObjectId;
  companyId: string;
  key: string;
  value: unknown;
  updatedAt: Date;
}
