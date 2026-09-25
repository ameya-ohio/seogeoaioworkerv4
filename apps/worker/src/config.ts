import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkStage } from "@blogagent/engine";

/**
 * Invocation route per phase (D25 / roadmap 10.3). `agent` runs the phase as
 * an Agent SDK session with tools; `direct` is one Messages API call with the
 * inputs inlined and the worker doing all file I/O. Research is agent-only:
 * its live WebSearch/WebFetch depth is the no-fabrication guardrail.
 */
export type PhaseRoute = "agent" | "direct";
export type DirectPhase = Exclude<WorkStage, "research">;
export const DIRECT_PHASES: readonly DirectPhase[] = ["outline", "write", "edit", "schema", "design"];
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

export interface WorkerConfig {
  repoRoot: string;
  mongoUri: string;
  mongoDb: string;
  workerId: string;
  concurrency: number;
  pollIntervalMs: number;
  leaseMs: number;
  heartbeatMs: number;
  maxRunAttempts: number;
  /** Max in-phase gate-feedback retries before the phase counts as failed. */
  maxGateAttempts: number;
  models: Record<WorkStage, string>;
  maxTurns: Record<WorkStage, number>;
  /** Direct Messages API route for the tool-less phases (roadmap 10.3). */
  direct: {
    routes: Record<DirectPhase, PhaseRoute>;
    effort: Record<DirectPhase, Effort>;
    /** Streaming call, so a high ceiling costs nothing unless it is used. */
    maxTokens: number;
  };
  /** Topic & Cluster Generator settings (roadmap 4C, D26 tiers). */
  cluster: {
    /** Main reasoning tier (clustering, scoring, architecture, briefs). */
    mainModel: string;
    /** Cheap tier for bulk fan-out generation + classification. */
    fanoutModel: string;
    /** K varied fan-out runs per prompt (spec §2.3). */
    k: number;
    /** Cost guard: max themes given SERP/AI-surface validation per run. */
    maxValidations: number;
    /** SERP checks per validated theme (spec §5: 1–2 representative queries). */
    serpChecksPerTheme: number;
    maxAttempts: number;
  };
  /** Cheap tier for citation verification (D34). */
  verifierModel: string;
  /** Content-plan brief enrichment. */
  plan: {
    enrichModel: string;
    /** Parallel enrichment calls per plan. */
    concurrency: number;
    maxAttempts: number;
  };
  /** Cadence scheduler. */
  schedule: {
    /** Off by default: a cadence must be switched on deliberately. */
    enabled: boolean;
    pollIntervalMs: number;
    /** Report what each tick WOULD enqueue, without enqueueing it. */
    dryRun: boolean;
  };
  /** Competitive scrape jobs (roadmap 6.1). */
  scrape: {
    maxAttempts: number;
    /** Hard kill for a single scraper/index subprocess. */
    timeoutMs: number;
  };
  pythonBin: string;
  /** Python used for blogheaderimagegen (venv locally, system python in the container). */
  headerGenPython: string;
  /** Python used for blogscraper (venv locally, /opt/scraper-venv in the container). */
  scraperPython: string;
  companyConfigPath?: string;
}

function findRepoRoot(): string {
  // dist/config.js lives at apps/worker/dist/ → repo root is ../../..
  const here = fileURLToPath(import.meta.url);
  let dir = resolve(here, "..");
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "CLAUDE.md")) && existsSync(join(dir, "agents"))) return dir;
    dir = resolve(dir, "..");
  }
  return process.cwd();
}

function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number.parseInt(v, 10) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Per-phase model selection (decision D13): default is Sonnet everywhere —
 * good quality at pipeline cost. Override any phase with
 * PHASE_MODEL_<PHASE> (e.g. PHASE_MODEL_WRITE=claude-opus-5) or all phases
 * with PHASE_MODEL_DEFAULT. Per-phase token usage + cost are recorded on the
 * run doc, so cost tuning is data-driven later.
 */
const DEFAULT_MODEL = "claude-sonnet-5";

function phaseModels(): Record<WorkStage, string> {
  const def = process.env["PHASE_MODEL_DEFAULT"] ?? DEFAULT_MODEL;
  const get = (phase: string) => process.env[`PHASE_MODEL_${phase.toUpperCase()}`] ?? def;
  return {
    research: get("research"),
    outline: get("outline"),
    write: get("write"),
    edit: get("edit"),
    schema: get("schema"),
    design: get("design"),
  };
}

/**
 * PHASE_ROUTE_<PHASE>=agent|direct (default direct) is the per-phase
 * rollback switch; PHASE_EFFORT_<PHASE> tunes direct calls (default high —
 * the API default, so moving a phase off the Agent SDK doesn't also lower
 * its reasoning depth). Unknown values fall back to the default.
 */
function directConfig(): WorkerConfig["direct"] {
  const routes = {} as Record<DirectPhase, PhaseRoute>;
  const effort = {} as Record<DirectPhase, Effort>;
  for (const phase of DIRECT_PHASES) {
    const route = process.env[`PHASE_ROUTE_${phase.toUpperCase()}`];
    routes[phase] = route === "agent" ? "agent" : "direct";
    const e = process.env[`PHASE_EFFORT_${phase.toUpperCase()}`] as Effort | undefined;
    effort[phase] = e && EFFORTS.includes(e) ? e : "high";
  }
  return { routes, effort, maxTokens: intEnv("PHASE_MAX_TOKENS", 64_000) };
}

export function loadWorkerConfig(): WorkerConfig {
  const repoRoot = process.env["REPO_ROOT"] ?? findRepoRoot();
  const venvPython = join(repoRoot, "blogheaderimagegen", ".venv", "bin", "python");
  const scraperVenvPython = join(repoRoot, "blogscraper", ".venv", "bin", "python");
  const cfg: WorkerConfig = {
    repoRoot,
    mongoUri: process.env["MONGODB_URI"] ?? "mongodb://localhost:27017",
    mongoDb: process.env["MONGODB_DB"] ?? "blogagent",
    workerId: process.env["WORKER_ID"] ?? `${hostname()}-${process.pid}`,
    concurrency: intEnv("WORKER_CONCURRENCY", 1),
    pollIntervalMs: intEnv("POLL_INTERVAL_MS", 3000),
    leaseMs: intEnv("LEASE_SECONDS", 300) * 1000,
    heartbeatMs: intEnv("HEARTBEAT_SECONDS", 60) * 1000,
    maxRunAttempts: intEnv("MAX_RUN_ATTEMPTS", 2),
    maxGateAttempts: intEnv("MAX_GATE_ATTEMPTS", 2),
    models: phaseModels(),
    maxTurns: {
      research: intEnv("PHASE_MAX_TURNS_RESEARCH", 120),
      outline: intEnv("PHASE_MAX_TURNS_OUTLINE", 40),
      write: intEnv("PHASE_MAX_TURNS_WRITE", 60),
      edit: intEnv("PHASE_MAX_TURNS_EDIT", 80),
      schema: intEnv("PHASE_MAX_TURNS_SCHEMA", 60),
      design: intEnv("PHASE_MAX_TURNS_DESIGN", 40),
    },
    direct: directConfig(),
    cluster: {
      mainModel: process.env["CLUSTER_MODEL"] ?? DEFAULT_MODEL,
      fanoutModel: process.env["CLUSTER_FANOUT_MODEL"] ?? "claude-haiku-4-5-20251001",
      k: intEnv("CLUSTER_FANOUT_K", 5),
      maxValidations: intEnv("CLUSTER_MAX_VALIDATIONS", 5),
      serpChecksPerTheme: Math.min(2, Math.max(1, intEnv("CLUSTER_SERP_CHECKS_PER_THEME", 1))),
      maxAttempts: intEnv("CLUSTER_MAX_ATTEMPTS", 2),
    },
    verifierModel: process.env["CITATION_MODEL"] ?? "claude-haiku-4-5-20251001",
    plan: {
      enrichModel:
        process.env["PLAN_ENRICH_MODEL"] ??
        process.env["CLUSTER_FANOUT_MODEL"] ??
        "claude-haiku-4-5-20251001",
      concurrency: intEnv("PLAN_ENRICH_CONCURRENCY", 6),
      maxAttempts: intEnv("PLAN_MAX_ATTEMPTS", 2),
    },
    schedule: {
      enabled: (process.env["SCHEDULER_ENABLED"] ?? "0") === "1",
      pollIntervalMs: intEnv("SCHEDULE_POLL_INTERVAL_MS", 60_000),
      dryRun: (process.env["SCHEDULE_DRY_RUN"] ?? "0") === "1",
    },
    scrape: {
      maxAttempts: intEnv("SCRAPE_MAX_ATTEMPTS", 2),
      timeoutMs: intEnv("SCRAPE_TIMEOUT_MS", 45 * 60 * 1000),
    },
    pythonBin: process.env["PYTHON_BIN"] ?? "python3",
    headerGenPython:
      process.env["HEADERGEN_PYTHON"] ?? (existsSync(venvPython) ? venvPython : "python3"),
    scraperPython:
      process.env["SCRAPER_PYTHON"] ??
      (existsSync(scraperVenvPython) ? scraperVenvPython : "python3"),
  };
  if (process.env["COMPANY_CONFIG"]) cfg.companyConfigPath = process.env["COMPANY_CONFIG"];
  return cfg;
}
