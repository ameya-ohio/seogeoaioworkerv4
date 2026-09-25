import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GATES,
  MIN_VERIFIED_SOURCES,
  pruneUnverifiedCitations,
  trimExcessClaims,
  completeRun,
  emitEvent,
  failRun,
  getArticle,
  markFailed,
  nextStage,
  pushPhaseResult,
  runSchemaValidation,
  runSeoAudit,
  saveGateResult,
  setStage,
  updateLastPhaseResult,
  type ArticleDoc,
  type CitationReport,
  type EngineDb,
  type GateFiles,
  type GateResult,
  type LinkReport,
  type PhaseResult,
  type RunDoc,
  type ScriptReport,
  type Storage,
  type WorkStage,
} from "@blogagent/engine";
import type { AgentInvoker, AgentRunOutcome } from "./agentRunner.js";
import type { WorkerConfig } from "./config.js";
import type { DirectPhaseRunner } from "./directRunner.js";
import { PHASE_ORDER, phaseDefs, type PhaseContext } from "./phases.js";
import type { CitationVerifier, LinkChecker } from "./quality.js";
import {
  articleDir,
  materializeCompetitorGaps,
  materializeWorkspace,
  persistPhaseOutputs,
} from "./workspace.js";

export interface PipelineDeps {
  db: EngineDb;
  cfg: WorkerConfig;
  storage: Storage;
  invoker: AgentInvoker;
  /** 10.3: runs phases whose cfg.direct.routes entry is "direct". */
  direct: DirectPhaseRunner;
  /** D34: live citation verification — research + edit gates depend on it. */
  citationVerifier: CitationVerifier;
  /** D35: internal-link resolution — edit gate depends on it. */
  linkChecker: LinkChecker;
  companyName: string;
  log: (msg: string) => void;
}

interface CodeStepOutputs {
  report?: ScriptReport;
  citationReport?: CitationReport;
  linkReport?: LinkReport;
}

async function loadGateFiles(
  cfg: WorkerConfig,
  article: ArticleDoc,
  phase: WorkStage,
  outputs: CodeStepOutputs,
): Promise<GateFiles> {
  const dir = articleDir(cfg, article);
  const read = async (name: string) =>
    existsSync(join(dir, name)) ? await readFile(join(dir, name), "utf-8") : undefined;
  const files: GateFiles = {};
  const researchNotes = await read("research-notes.md");
  if (researchNotes !== undefined) files.researchNotes = researchNotes;
  const outline = await read("outline.md");
  if (outline !== undefined) files.outline = outline;
  const articleMd = await read("article.md");
  if (articleMd !== undefined) files.article = articleMd;
  const schemaJson = await read("schema.json");
  if (schemaJson !== undefined) files.schemaJson = schemaJson;
  if (phase === "design") files.headerPngExists = existsSync(join(dir, "header.png"));
  if (outputs.report) files.report = outputs.report;
  if (outputs.citationReport) files.citationReport = outputs.citationReport;
  if (outputs.linkReport) files.linkReport = outputs.linkReport;
  return files;
}

/**
 * Post-agent code steps: canonical Python checks (D12) plus the truth layer
 * (D34 citation verification, D35 link resolution). Stored, not printed.
 */
async function runCodeStep(
  deps: PipelineDeps,
  article: ArticleDoc,
  phase: WorkStage,
): Promise<CodeStepOutputs> {
  const { cfg, db } = deps;
  const opts = {
    repoRoot: cfg.repoRoot,
    pythonBin: cfg.pythonBin,
    ...(cfg.companyConfigPath ? { companyConfigPath: cfg.companyConfigPath } : {}),
  };
  const dir = articleDir(cfg, article);
  const relFolder = join("articles", article.folder);
  const readIf = async (name: string) =>
    existsSync(join(dir, name)) ? await readFile(join(dir, name), "utf-8") : "";

  if (phase === "research") {
    let notes = await readIf("research-notes.md");
    // D37 auto-trim: enforce the claim budget mechanically before spending
    // verification calls — the budget gate stays only as a backstop.
    const trim = trimExcessClaims(notes);
    if (trim.trimmed.length > 0) {
      notes = trim.notes;
      await writeFile(join(dir, "research-notes.md"), notes, "utf-8");
      deps.log(
        `[citations] auto-trimmed ${trim.trimmed.length} over-budget claim(s) (D37): ` +
          trim.trimmed.map((t) => `"${t.text.slice(0, 50)}"`).join("; "),
      );
    }
    let citationReport = await deps.citationVerifier.verifyResearch(notes);
    // D37 auto-prune: D34's "cut or replaced" performed deterministically —
    // when enough sources survived, cut the failing claims from the notes
    // instead of re-running the whole research phase.
    const failures = citationReport.unsupportedCount + citationReport.unreachableCount;
    if (failures > 0 && citationReport.verifiedSourceCount >= MIN_VERIFIED_SOURCES) {
      const pruned = pruneUnverifiedCitations(notes, citationReport);
      await writeFile(join(dir, "research-notes.md"), pruned.notes, "utf-8");
      citationReport = pruned.report;
      deps.log(
        `[citations] auto-pruned ${pruned.removed.length} unverified claim(s) from research notes (D37): ` +
          pruned.removed.map((r) => `"${r.claim.slice(0, 60)}"`).join("; "),
      );
    }
    if (article._id) {
      await db.articles.updateOne(
        { _id: article._id },
        { $set: { citationChecks: citationReport, updatedAt: new Date() } },
      );
    }
    return { citationReport };
  }
  if (phase === "edit" || phase === "design") {
    const report = await runSeoAudit(opts, relFolder);
    if (article._id) {
      await db.articles.updateOne(
        { _id: article._id },
        { $set: { audit: report, updatedAt: new Date() } },
      );
    }
    if (phase !== "edit") return {};
    const body = await readIf("article.md");
    // Body citations check deterministically against the research-verified
    // set; internal links resolve against inventory + the live site.
    const citationReport = deps.citationVerifier.verifyArticleBody(body, article.citationChecks);
    const linkReport = await deps.linkChecker.check(body);
    if (article._id) {
      await db.articles.updateOne(
        { _id: article._id },
        { $set: { linkChecks: linkReport, updatedAt: new Date() } },
      );
    }
    return { report, citationReport, linkReport };
  }
  if (phase === "schema") {
    const report = await runSchemaValidation(opts, join(relFolder, "schema.json"));
    if (article._id) {
      await db.articles.updateOne(
        { _id: article._id },
        { $set: { schemaValidation: report, updatedAt: new Date() } },
      );
    }
    return { report };
  }
  return {};
}

export interface PhaseOutcome {
  gate: GateResult;
  attempts: number;
}

async function executePhase(
  deps: PipelineDeps,
  run: RunDoc,
  article: ArticleDoc,
  phase: WorkStage,
): Promise<PhaseOutcome> {
  const { cfg, db, invoker } = deps;
  const defs = phaseDefs(cfg);
  const def = defs[phase];
  const runId = run._id;
  const articleId = article._id;
  if (!runId || !articleId) throw new Error("run/article missing _id");

  let gate: GateResult = { ok: false, problems: ["not checked"], checkedAt: new Date() };
  let attempt = 0;
  let gateFeedback: string[] | undefined;

  const route = phase === "research" ? "agent" : cfg.direct.routes[phase];

  // Edit pre-audit: run the edit gate's own checks on the incoming draft so
  // attempt 1 starts with the exact problems a retry would have been given.
  let preAudit: string[] | undefined;
  if (phase === "edit") {
    const pre = GATES.edit(await loadGateFiles(cfg, article, phase, await runCodeStep(deps, article, phase)));
    if (!pre.ok) preAudit = pre.problems;
    deps.log(
      `[${article.slug}/edit] pre-audit: ${pre.ok ? "draft already passes" : `${pre.problems.length} problem(s) handed to the Editor`}`,
    );
  }

  while (attempt < cfg.maxGateAttempts) {
    attempt += 1;
    const startedAt = new Date();
    const phaseResult: PhaseResult = { phase, status: "running", attempt, route, startedAt };
    await pushPhaseResult(db, runId, phaseResult);
    await emitEvent(db, {
      companyId: run.companyId,
      runId,
      articleId,
      type: "phase.started",
      message: `Phase ${def.title} started (attempt ${attempt}, ${route})`,
      data: { phase, attempt, model: cfg.models[phase], route },
    });

    const ctx: PhaseContext = {
      article,
      cfg,
      companyName: deps.companyName,
      // 6.3: materialized into the workspace by runPipeline when scraped
      // competitor corpora exist for this company.
      hasCompetitorGaps: existsSync(join(articleDir(cfg, article), "competitor-gaps.md")),
      ...(gateFeedback ? { gateFeedback } : {}),
      ...(preAudit ? { preAudit } : {}),
    };
    const onProgress = (text: string) => deps.log(`[${article.slug}/${phase}] ${text.slice(0, 160)}`);
    const outcome: AgentRunOutcome =
      phase !== "research" && route === "direct"
        ? await deps.direct.run(phase, def.specFile, ctx, onProgress)
        : await invoker.run({
            systemPromptFile: def.specFile,
            prompt: def.buildPrompt(ctx),
            model: cfg.models[phase],
            cwd: cfg.repoRoot,
            allowedTools: def.allowedTools,
            maxTurns: cfg.maxTurns[phase],
            onProgress,
          });

    if (!outcome.success) {
      const err = `Agent run failed (${outcome.errorSubtype ?? "unknown"})`;
      await updateLastPhaseResult(db, runId, {
        ...phaseResult,
        status: "failed",
        endedAt: new Date(),
        usage: outcome.usage,
        error: err,
      });
      await emitEvent(db, {
        companyId: run.companyId,
        runId,
        articleId,
        type: "phase.failed",
        message: `Phase ${def.title}: ${err}`,
        data: { phase, attempt },
      });
      throw new Error(`${phase}: ${err}`);
    }

    const outputs = await runCodeStep(deps, article, phase);
    const files = await loadGateFiles(cfg, article, phase, outputs);
    gate = GATES[phase](files);
    await saveGateResult(db, articleId, phase, gate);

    // Gate outcomes otherwise live only in Mongo; the log is where an
    // operator watching a run (or tuning PHASE_EFFORT_*) actually looks.
    const u = outcome.usage;
    deps.log(
      `[${article.slug}/${phase}] attempt ${attempt} (${route}) ${gate.ok ? "gate passed" : "gate FAILED"} ` +
        `in ${Math.round((Date.now() - startedAt.getTime()) / 1000)}s` +
        (u.outputTokens !== undefined ? `, ${u.inputTokens ?? 0} in / ${u.outputTokens} out tokens` : "") +
        (u.costUsd !== undefined ? `, $${u.costUsd.toFixed(3)}` : "") +
        (gate.ok ? "" : `: ${gate.problems.join("; ").slice(0, 1500)}`),
    );

    await updateLastPhaseResult(db, runId, {
      ...phaseResult,
      status: gate.ok ? "succeeded" : "failed",
      endedAt: new Date(),
      usage: outcome.usage,
      gate,
    });

    if (gate.ok) {
      await emitEvent(db, {
        companyId: run.companyId,
        runId,
        articleId,
        type: "gate.passed",
        message: `Phase ${def.title} gate passed`,
        data: { phase, attempt },
      });
      await persistPhaseOutputs(deps.db, cfg, deps.storage, article, phase);
      return { gate, attempts: attempt };
    }

    await emitEvent(db, {
      companyId: run.companyId,
      runId,
      articleId,
      type: "gate.failed",
      message: `Phase ${def.title} gate failed: ${gate.problems.join("; ")}`,
      data: { phase, attempt, problems: gate.problems },
    });
    gateFeedback = gate.problems;
  }

  throw new Error(
    `${phase}: gate failed after ${cfg.maxGateAttempts} attempt(s): ${gate.problems.join("; ")}`,
  );
}

/**
 * Run the pipeline for one claimed run, from run.fromStage through design.
 * Completed stages are skipped on resume; each stage persists artifacts and
 * advances article.stage, so a crash resumes exactly where it stopped.
 */
export async function runPipeline(deps: PipelineDeps, run: RunDoc): Promise<void> {
  const { db, cfg } = deps;
  const runId = run._id;
  if (!runId) throw new Error("run missing _id");
  const article = await getArticle(db, run.articleId);
  if (!article) throw new Error(`article ${run.articleId} not found`);
  const articleId = article._id as NonNullable<ArticleDoc["_id"]>;

  await emitEvent(db, {
    companyId: run.companyId,
    runId,
    articleId,
    type: "run.started",
    message: `Run started (attempt ${run.attempts}/${run.maxAttempts}) from ${run.fromStage}`,
  });

  await materializeWorkspace(cfg, article);
  await materializeCompetitorGaps(db, cfg, article);

  const startIdx = PHASE_ORDER.indexOf(run.fromStage);
  const phases = PHASE_ORDER.slice(startIdx === -1 ? 0 : startIdx);

  let currentPhase: WorkStage | undefined;
  try {
    for (const phase of phases) {
      currentPhase = phase;
      await setStage(db, articleId, phase, runId);
      await emitEvent(db, {
        companyId: run.companyId,
        runId,
        articleId,
        type: "stage.changed",
        message: `Stage → ${phase}`,
        data: { stage: phase },
      });
      // Refresh the doc so prompts see artifacts from earlier phases.
      const fresh = (await getArticle(db, articleId)) ?? article;
      await executePhase(deps, run, fresh, phase);
    }

    await setStage(db, articleId, "review", runId);
    await emitEvent(db, {
      companyId: run.companyId,
      runId,
      articleId,
      type: "stage.changed",
      message: "Stage → review (awaiting human approval)",
      data: { stage: "review" },
    });
    await completeRun(db, runId);
    await emitEvent(db, {
      companyId: run.companyId,
      runId,
      articleId,
      type: "run.succeeded",
      message: "Pipeline complete — article is in review",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const disposition = await failRun(db, runId, message, currentPhase);
    if (disposition === "requeued") {
      await emitEvent(db, {
        companyId: run.companyId,
        runId,
        articleId,
        type: "run.retried",
        message: `Run requeued after error: ${message}`,
        data: { resumeFrom: currentPhase },
      });
    } else {
      await markFailed(db, articleId, message);
      await emitEvent(db, {
        companyId: run.companyId,
        runId,
        articleId,
        type: "run.failed",
        message: `Run failed permanently: ${message}`,
      });
    }
    throw err;
  }
}

export { nextStage };
