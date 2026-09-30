import type { ObjectId } from "mongodb";
import type { CitationReport, LinkReport } from "./citations.js";
import type { SpokeBrief } from "./cluster/types.js";
import type { FunnelStage, PageRole, SearchIntent } from "./plan/types.js";

/**
 * Article lifecycle stages (roadmap §4). The six work stages map 1:1 to the
 * pipeline phases in agents/*.md; the rest are human/publish states.
 */
export const WORK_STAGES = [
  "research",
  "outline",
  // Expert interview (agents/interviewer.md, D59): the run waits for the
  // operator's point of view, then the outline is refined from it.
  "interview",
  "write",
  "edit",
  // HDCP (agents/hdcp.md): editorial rewrite after the Editor, before Schema.
  "hdcp",
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
      return "interview";
    case "interview":
      return "write";
    case "write":
      return "edit";
    case "edit":
      return "hdcp";
    case "hdcp":
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

export type TechnicalIssueKind = "technical_error" | "contradiction" | "outdated" | "unsupported_number";

export interface TechnicalIssue {
  kind: TechnicalIssueKind;
  /** Exact text from the article (verified present before it is kept). */
  quote: string;
  problem: string;
  fix: string;
}

export interface TechnicalReview {
  ranAt: Date;
  model: string;
  issues: TechnicalIssue[];
  /** Issues the model returned whose quote isn't in the article (dropped). */
  droppedUnquoted: number;
  /** Set when the review didn't run to completion; the pipeline carries on. */
  skipped?: string;
  costUsd?: number;
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
  /** Invocation route (D25): Agent SDK session or one direct Messages API call. */
  route?: "agent" | "direct";
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
  /** D59: the Expert POV brief the interview refiner wrote (pov.md). */
  pov?: string;
}

/**
 * What every brief carries, whatever produced it. These are the only fields
 * the pipeline actually reads: materializeWorkspace writes `markdown` to
 * brief.md, and the Strategist prompt quotes `lengthBand`.
 */
/**
 * The four page facets (D45–D49). Page role sets the skeleton, article type
 * (a formats.json slug) sets the body, search intent is what the SERP
 * expects, and funnel sets the CTA and how much the company appears.
 */
/** The HDCP agent's log (agents/hdcp.md → Log format), as stored on the article. */
export interface HdcpLog {
  ranAt: Date;
  model: string;
  /** Step 1: the prioritized, plain-language diagnosis. */
  diagnosis: string;
  /** "<change> — <which diagnosed problem it fixes>" */
  changes: string[];
  cuts: { content: string; reason: string }[];
  /** [HUMAN INPUT: …] flags (empty when the log says "none"). */
  flags: string[];
  editorNotes: string;
  /** The log exactly as returned. */
  markdown: string;
}

/** D59: whether a run stops for the expert interview after the outline. */
export type InterviewMode = "pause" | "skip";

/**
 * D59 interview lifecycle. `open`: questions are out and the run waits
 * (status awaiting_input). `complete`/`skipped`: the operator finished or
 * skipped it and the run was requeued; `refined`: the refiner rewrote the
 * outline from the answers.
 */
export type InterviewStatus = "open" | "complete" | "skipped" | "refined";

export interface InterviewMessage {
  role: "assistant" | "user";
  content: string;
  at: Date;
}

/** What the interviewer reports it has captured so far (the live checklist). */
export interface InterviewCaptured {
  angle?: string;
  thesis?: string;
  objection?: string;
  anchor?: string;
  product?: string;
  quote?: string;
  /** Name and title, only when the expert opted in to attribution. */
  attribution?: string;
}

export interface ArticleInterview {
  status: InterviewStatus;
  /**
   * The run that opened it. A later run reaching the interview stage (a
   * re-run from outline) opens a new interview rather than reusing this one.
   */
  runId?: ObjectId;
  /** The interviewer's plan (wedge, candidate positions, beats), in markdown. */
  plan: string;
  messages: InterviewMessage[];
  captured: InterviewCaptured;
  openedAt: Date;
  completedAt?: Date;
  refinedAt?: Date;
  /** Summed estimate across the opening call and every chat turn. */
  costUsd?: number;
}

export interface ArticleFacets {
  pageRole: PageRole;
  searchIntent: SearchIntent;
  /** Slug in standards/formats.json ("generic" when none applies). */
  articleType: string;
  funnel: FunnelStage;
  /** Who set them: the plan import, a cluster brief, the Strategist, or an operator edit. */
  source: "plan" | "cluster" | "strategist" | "operator";
}

export interface ArticleBriefBase {
  /** Rendered brief the Strategist receives (materialized as brief.md). */
  markdown: string;
  /** D31: replaces the SERP-median word-count rule for this article. */
  lengthBand: { min: number; max: number; justification?: string };
  /**
   * The structured brief. Previously only markdown + lengthBand survived onto
   * the article, so h2Outline / evidence / internalLinks were unqueryable.
   */
  spec?: SpokeBrief;
  /** Routing pages (pillar, hub) are briefed differently from spokes. */
  pageRole?: PageRole;
  /** The page's facets as the brief was built with them. */
  facets?: ArticleFacets;
}

/**
 * Brief from the Topic & Cluster Generator (4.12, D31).
 *
 * `source` is OPTIONAL here on purpose: article docs written before plans
 * existed carry no `source` field, so absence means "cluster" and no data
 * migration is needed. TypeScript still narrows correctly on
 * `brief.source === "plan"`.
 */
export interface ClusterArticleBrief extends ArticleBriefBase {
  source?: "cluster";
  clusterId: ObjectId;
  themeId: ObjectId;
  themeName: string;
}

/** Brief from an imported SEO content plan (a pillar map). */
export interface PlanArticleBrief extends ArticleBriefBase {
  source: "plan";
  /** The workbook's own id, e.g. "P01-S03-A07". */
  externalId: string;
  /** Subtopic (or pillar) name — display parity with the cluster arm. */
  themeName: string;
}

export type ArticleBrief = ClusterArticleBrief | PlanArticleBrief;

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
  /** D45–D49: set from the plan item or brief, or proposed by the Strategist. */
  facets?: ArticleFacets;
  /** D46: site path, e.g. "/learn/identity-exposure-management/identity-exposure/vs-identity-risk/". */
  path?: string;
  /** Absolute canonical URL built from the path; stamped into frontmatter by the worker. */
  canonicalUrl?: string;
  /** D46: the page's ancestors and itself, for breadcrumbs (pillar → hub → page). */
  trail?: { name: string; path: string }[];
  /** D59: pause for the expert interview (default) or skip it. */
  interviewMode?: InterviewMode;
  /** D59: the expert interview — plan, transcript, captured POV. */
  interview?: ArticleInterview;
  /** HDCP (agents/hdcp.md): the diagnosis, cuts, flags and self-verification of the last run. */
  hdcp?: HdcpLog;
  /** D53: internal links in the body as of the last edit — the site-wide anchor registry. */
  internalLinks?: { url: string; anchor: string }[];
  /** D52: the page confirmed live on the site (Framer export target). */
  live?: { url: string; verifiedAt: Date; status: number };
  /** D51: human sign-off for formats that require it, before export. */
  signoff?: { by: string; at: Date; note?: string };
  /** D52: last Framer export download. */
  exportedAt?: Date;
  header?: { storageKey: string; url?: string; contentType: string };
  audit?: ScriptReport;
  schemaValidation?: ScriptReport;
  gates?: Partial<Record<WorkStage, GateResult>>;
  /** HubSpot post status (roadmap Phase 5), synced by the publish actions. */
  hubspot?: {
    postId?: string;
    url?: string;
    /** HubSpot's state: DRAFT, PUBLISHED, SCHEDULED, … */
    state?: string;
    featuredImageUrl?: string;
    publishedAt?: Date;
    syncedAt?: Date;
  };
  /**
   * Brief from the Topic & Cluster Generator or from an imported content
   * plan. When set, the Strategist receives it as a first-class input and its
   * length band overrides the SERP-median word-count rule (D31).
   */
  brief?: ArticleBrief;
  /** Set when this article was produced from a content plan item. */
  planId?: ObjectId;
  planItemId?: ObjectId;
  /** Live citation verification (D34) — research-stage, refreshed at edit. */
  citationChecks?: CitationReport;
  /** Internal-link resolution (D35) — edit-stage. */
  linkChecks?: LinkReport;
  /** Expert read of the Writer's draft (agents/technical-reviewer.md), handed to the Editor. */
  technicalReview?: TechnicalReview;
  /** Everything handed to the Editor before its first attempt (gate problems, technical findings, advisory). */
  editPreAudit?: { ranAt: Date; items: string[] };
  /**
   * Planned cluster-sibling pages the article references as plain mentions;
   * Phase 5 turns them into links when the siblings publish (D35).
   */
  pendingLinks?: string[];
  /**
   * Internal links that resolved against a same-plan sibling's RESERVED
   * canonical URL rather than a live page (the sibling is produced but not
   * published yet). They are real hyperlinks in the body, so Phase 5 must
   * re-verify every one of them strictly before publishing.
   */
  deferredLinks?: string[];
  /** Set when stage === "failed". */
  error?: string;
  /** True for docs backfilled from pre-Mongo article folders. */
  imported?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `awaiting_input` (D59): the run stopped at the interview and waits for the
 * operator. claimRun never picks it up; resumeRun puts it back in the queue.
 */
export type RunStatus = "queued" | "running" | "awaiting_input" | "succeeded" | "failed" | "canceled";

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
  | "stage.changed"
  | "interview.opened"
  | "interview.completed"
  | "interview.skipped";

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
  /** Page facets carried into the pipeline when this keyword is sent. */
  facets?: ArticleFacets;
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

/**
 * A repo file (standards/, templates/, agents/, context/) saved from the
 * web Admin. The container filesystem is rebuilt on every deploy and the
 * worker is a separate container, so Admin edits live here and the worker
 * writes them over its repo copy before each run (applyRepoFiles).
 */
export interface RepoFileDoc {
  _id?: ObjectId;
  companyId: string;
  /** Repo-relative, e.g. "context/case-studies/regional-health-system.md". */
  path: string;
  content: string;
  /** A deleted file stays as a tombstone so the worker removes its copy too. */
  deleted?: boolean;
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
