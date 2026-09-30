import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GATES,
  applyRepoFiles,
  awaitInput,
  defaultInterviewMode,
  markInterviewRefined,
  openInterview,
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
  setRunPhase,
  runSchemaValidation,
  runSeoAudit,
  runResearchCompetitorCheck,
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
  parseHdcpLog,
  parseOutlineFacets,
  extractMarkdownLinks,
  type FormatRegistry,
  type LinkTarget,
  type PageRules,
} from "@blogagent/engine";
import { materializePageSpec, pageRulesFor, stampArticleFrontmatter } from "./pageSpec.js";
import type { AgentInvoker, AgentRunOutcome } from "./agentRunner.js";
import type { WorkerConfig } from "./config.js";
import type { DirectPhaseRunner } from "./directRunner.js";
import type { InterviewOpener } from "./interviewOpener.js";
import { PHASE_ORDER, phaseDefs, type PhaseContext } from "./phases.js";
import { articleProse, type CitationVerifier, type LinkChecker } from "./quality.js";
import { formatIssue, type TechReviewer } from "./techReview.js";
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
  /** Pre-edit expert read of the draft; findings join the edit pre-audit. */
  techReviewer?: TechReviewer;
  /** D59: opens the expert interview. Absent = interviews are skipped. */
  interviewer?: InterviewOpener;
  companyName: string;
  log: (msg: string) => void;
}

interface CodeStepOutputs {
  report?: ScriptReport;
  citationReport?: CitationReport;
  competitorReport?: ScriptReport;
  linkReport?: LinkReport;
}

async function loadGateFiles(
  cfg: WorkerConfig,
  article: ArticleDoc,
  phase: WorkStage,
  outputs: CodeStepOutputs,
  page?: { rules: PageRules; formats: FormatRegistry },
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
  if (phase === "hdcp") {
    const hdcpLog = await read("hdcp.md");
    if (hdcpLog !== undefined) files.hdcpLog = hdcpLog;
  }
  if (phase === "interview") {
    const pov = await read("pov.md");
    if (pov !== undefined) files.pov = pov;
  }
  if (phase === "design") files.headerPngExists = existsSync(join(dir, "header.png"));
  if (outputs.report) files.report = outputs.report;
  if (outputs.citationReport) files.citationReport = outputs.citationReport;
  if (outputs.competitorReport) files.competitorReport = outputs.competitorReport;
  if (outputs.linkReport) files.linkReport = outputs.linkReport;
  if (page) {
    files.page = page.rules;
    // A page with no facets gets them from the Strategist, validated here.
    if (phase === "outline" && !article.facets) files.facetRegistry = page.formats;
  }
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
  rules?: PageRules,
  inventory: LinkTarget[] = [],
): Promise<CodeStepOutputs> {
  const { cfg, db } = deps;
  // The worker owns the facet and canonical_url frontmatter keys (D45–D46):
  // stamp them before anything reads the article.
  if (rules && (phase === "write" || phase === "edit" || phase === "hdcp" || phase === "schema")) {
    if (await stampArticleFrontmatter(cfg, article, rules)) {
      deps.log(`[${article.slug}/${phase}] stamped facet/canonical frontmatter`);
    }
  }
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
    const competitorReport = await runResearchCompetitorCheck(
      opts,
      join(relFolder, "research-notes.md"),
      article.facets?.articleType,
    );
    if (competitorReport.failures > 0) {
      deps.log(`[${article.slug}/research] competitor sources found: ${competitorReport.failures} vendor(s)`);
    }
    return { citationReport, competitorReport };
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
    const linkReport = await recordLinks(deps, article, body, inventory);
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

/**
 * Expert read of the Writer's draft (agents/technical-reviewer.md), stored
 * on the article and returned as pre-audit lines. Never blocks: a skipped
 * review is logged and the Editor runs without it.
 */
async function runTechnicalReview(deps: PipelineDeps, article: ArticleDoc): Promise<string[]> {
  const { cfg, db } = deps;
  if (!deps.techReviewer || !cfg.techReview.enabled) return [];
  const dir = articleDir(cfg, article);
  const read = async (name: string) =>
    existsSync(join(dir, name)) ? await readFile(join(dir, name), "utf-8") : "";
  const review = await deps.techReviewer.review({
    articleMd: await read("article.md"),
    researchNotes: await read("research-notes.md"),
    onProgress: (t) => deps.log(`[${article.slug}/tech-review] ${t}`),
  });
  if (article._id) {
    await db.articles.updateOne(
      { _id: article._id },
      { $set: { technicalReview: review, updatedAt: new Date() } },
    );
  }
  deps.log(
    `[${article.slug}/tech-review] ` +
      (review.skipped
        ? `skipped (${review.skipped})`
        : `${review.issues.length} issue(s)${review.droppedUnquoted ? `, ${review.droppedUnquoted} dropped (quote not in draft)` : ""}`) +
      ` — ${review.model}${review.costUsd !== undefined ? `, $${review.costUsd.toFixed(3)}` : ""}`,
  );
  for (const i of review.issues) {
    deps.log(`[${article.slug}/tech-review]   - ${i.kind}: "${i.quote.slice(0, 90)}" — ${i.problem.slice(0, 160)}`);
  }
  return review.issues.map(formatIssue);
}

/**
 * HDCP inputs (agents/hdcp.md): the protocol's `cluster_context` — the hub,
 * the pages that own sibling topics, the glossary when context/glossary.md
 * exists — plus what the pipeline already knows about the draft (the
 * technical review's findings and the edit-stage audit's failures/warnings).
 */
async function materializeHdcpInputs(cfg: WorkerConfig, article: ArticleDoc, inventory: LinkTarget[]): Promise<void> {
  const tr = article.technicalReview;
  const checks = (article.audit?.checks ?? []).filter((c) => c.level !== "pass");
  const role = article.facets?.pageRole ?? "";
  const hubPath = role === "cluster" && article.trail && article.trail.length >= 2 ? article.trail[article.trail.length - 2]?.path : undefined;
  const base = article.canonicalUrl && article.path && article.canonicalUrl.endsWith(article.path)
    ? article.canonicalUrl.slice(0, -article.path.length)
    : "";
  const hubUrl = hubPath ? (inventory.find((t) => t.path === hubPath)?.url ?? (base ? `${base}${hubPath}` : hubPath)) : undefined;
  const glossaryPath = join(cfg.repoRoot, "context", "glossary.md");
  const glossary = existsSync(glossaryPath) ? (await readFile(glossaryPath, "utf-8")).trim() : "";
  const lines = [
    `# HDCP inputs`,
    ``,
    `## Target`,
    ``,
    `- target_keyword: ${String(article.frontmatter?.["primary_keyword"] ?? article.targetKeyword ?? "")}`,
    `- content_role: ${role || "(not set)"}`,
    ``,
    `## cluster_context`,
    ``,
    `### hub_url`,
    ``,
    hubUrl ?? (role === "cluster" ? "_unknown_" : `_none: this page is a ${role || "standalone page"}_`),
    ``,
    `### pages (the topic each one owns — summarize and link, don't retell)`,
    ``,
    ...(inventory.length ? inventory.map((t) => `- **${t.title}** — ${t.url}\n  - Owns: ${t.query}. ${t.covers}`) : [`_none_`]),
    ``,
    `### glossary`,
    ``,
    glossary || `_none: no context/glossary.md yet — hold each core term to one definition within the article_`,
    ``,
    `## Technical review (before the Editor)`,
    ``,
    ...(tr && !tr.skipped && tr.issues.length
      ? tr.issues.map((i) => `- ${i.kind}: "${i.quote}" — ${i.problem}${i.fix ? ` Fix: ${i.fix}` : ""}`)
      : [tr?.skipped ? `_skipped: ${tr.skipped}_` : `_no findings_`]),
    ``,
    `## Latest audit (edit stage): failures and warnings`,
    ``,
    ...(checks.length ? checks.map((c) => `- ${c.level.toUpperCase()}: ${c.message}`) : [`_clean_`]),
    ``,
  ];
  await writeFile(join(articleDir(cfg, article), "hdcp-inputs.md"), lines.join("\n"), "utf-8");
}

/**
 * D53: resolve the body's internal links and record them — the link report
 * Review shows, and the site-wide anchor registry the next article is checked
 * against. The Edit gate uses the report; after HDCP it is re-recorded so the
 * registry holds the anchors that actually ship (bookkeeping, never a gate).
 */
async function recordLinks(
  deps: PipelineDeps,
  article: ArticleDoc,
  body: string,
  inventory: LinkTarget[],
): Promise<LinkReport> {
  const linkReport = await deps.linkChecker.check(body, {
    ...(article._id ? { articleId: article._id } : {}),
    inventory,
  });
  const hosts = new Set(linkReport.results.map((r) => r.url));
  const internalLinks = extractMarkdownLinks(articleProse(body))
    .filter((l) => hosts.has(l.url))
    .map((l) => ({ url: l.url, anchor: l.anchor }));
  if (article._id) {
    await deps.db.articles.updateOne(
      { _id: article._id },
      { $set: { linkChecks: linkReport, internalLinks, updatedAt: new Date() } },
    );
  }
  return linkReport;
}

/** Store the HDCP log on the article and put its changes, cuts and flags in the run log. */
async function recordHdcp(deps: PipelineDeps, article: ArticleDoc, hdcpLog: string | undefined): Promise<void> {
  const { log } = parseHdcpLog(hdcpLog, deps.cfg.models.hdcp);
  if (!log || !article._id) return;
  await deps.db.articles.updateOne({ _id: article._id }, { $set: { hdcp: log, updatedAt: new Date() } });
  const tag = `[${article.slug}/hdcp]`;
  deps.log(`${tag} ${log.changes.length} change(s), ${log.cuts.length} cut(s), ${log.flags.length} flag(s)`);
  deps.log(`${tag}   diagnosis: ${log.diagnosis.replace(/\s+/g, " ").slice(0, 400)}`);
  for (const c of log.changes) deps.log(`${tag}   change: ${c.slice(0, 200)}`);
  for (const c of log.cuts) deps.log(`${tag}   cut: ${c.content.slice(0, 140)}${c.reason ? ` — ${c.reason.slice(0, 100)}` : ""}`);
  for (const f of log.flags) deps.log(`${tag}   flag: ${f.slice(0, 200)}`);
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

  // page.md (D45–D50) is rebuilt for every phase, so facets the Strategist
  // chose for a page that had none reach the Writer.
  const page = await pageRulesFor(db, cfg, article);
  await materializePageSpec(cfg, article, page.rules, page.inventory);
  if (phase === "hdcp") await materializeHdcpInputs(cfg, article, page.inventory);

  // Edit pre-audit: run the edit gate's own checks on the incoming draft so
  // attempt 1 starts with the exact problems a retry would have been given.
  let preAudit: string[] | undefined;
  if (phase === "edit") {
    const preOutputs = await runCodeStep(deps, article, phase, page.rules, page.inventory);
    const pre = GATES.edit(await loadGateFiles(cfg, article, phase, preOutputs, page));
    // Style WARNs (rhythm, lists of three, signposts) don't fail the gate,
    // but they're the same class of problem — hand them over as advisory.
    const advisory = (preOutputs.report?.checks ?? [])
      .filter((c) => c.level === "warn" && c.message.startsWith("Style:"))
      .map((c) => `(advisory) ${c.message}`);
    const technical = await runTechnicalReview(deps, article);
    const items = [...(pre.ok ? [] : pre.problems), ...technical, ...advisory];
    if (items.length) preAudit = items;
    deps.log(
      `[${article.slug}/edit] pre-audit: ${pre.ok ? "draft passes the gate" : `${pre.problems.length} gate problem(s)`}` +
        `, ${technical.length} technical, ${advisory.length} advisory`,
    );
    // One line per non-technical item (technical ones were logged by the review).
    for (const item of [...(pre.ok ? [] : pre.problems), ...advisory]) {
      deps.log(`[${article.slug}/edit]   - ${item.slice(0, 220)}`);
    }
    await db.articles.updateOne(
      { _id: articleId },
      { $set: { editPreAudit: { ranAt: new Date(), items }, updatedAt: new Date() } },
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
      headerPattern: page.rules.format.headerPattern,
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

    const outputs = await runCodeStep(deps, article, phase, page.rules, page.inventory);
    const files = await loadGateFiles(cfg, article, phase, outputs, page);
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
      if (phase === "hdcp") {
        await recordHdcp(deps, article, files.hdcpLog);
        // HDCP rewrote the anchors: record the ones that ship. Not a gate
        // (operator decision) — a problem shows in Review, it doesn't block.
        if (files.article) {
          const lr = await recordLinks(deps, article, files.article, page.inventory);
          const flagged = lr.results.filter((r) => r.status === "missing" || r.status === "off_target" || r.status === "anchor_conflict");
          deps.log(
            `[${article.slug}/hdcp] links re-recorded: ${lr.results.length} internal, ${lr.deferredCount ?? 0} deferred` +
              (flagged.length ? `, ${flagged.length} to review: ${flagged.map((r) => `${r.status} ${r.url}`).join("; ")}` : ""),
          );
        }
      }
      if (phase === "outline" && files.outline) {
        // Which case study (or incident, or none) the article is anchored on.
        const anchor = /^##\s+Real-World Anchor\s*\n+([^\n]+)/im.exec(files.outline)?.[1]?.trim();
        deps.log(`[${article.slug}/outline] real-world anchor: ${anchor ? anchor.slice(0, 200) : "(section missing)"}`);
        // No plan or brief set this page's facets: adopt the Strategist's.
        if (!article.facets) {
          const chosen = parseOutlineFacets(files.outline, page.formats).facets;
          if (chosen) {
            await db.articles.updateOne({ _id: articleId }, { $set: { facets: chosen, updatedAt: new Date() } });
            deps.log(
              `[${article.slug}/outline] facets set by the Strategist: ${chosen.pageRole} · ${chosen.articleType} · ${chosen.searchIntent} · ${chosen.funnel}`,
            );
          }
        }
      }
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
 * D59: what the interview stage does for this run.
 * - `park`: the interview was just opened (plan + first question); the run
 *   waits for the operator as awaiting_input.
 * - `refine`: the operator finished this run's interview; the refiner runs.
 * - `skip`: skipped by the operator, the plan, or company.yaml.
 * An interview another run opened (before a re-run from outline) doesn't
 * count: this run opens its own.
 */
async function interviewStep(deps: PipelineDeps, run: RunDoc, article: ArticleDoc): Promise<"park" | "refine" | "skip"> {
  const { db, cfg } = deps;
  const runId = run._id;
  const articleId = article._id;
  if (!runId || !articleId) throw new Error("run/article missing _id");
  const tag = `[${article.slug}/interview]`;
  const iv = article.interview;
  // Answers not yet turned into an outline are never thrown away: a run that
  // failed while refining (a refusal, a gate failure) is re-run and refines
  // them, and an open interview carries over to the run that re-ran it.
  if (iv?.status === "complete") return "refine";
  if (iv?.status === "open") {
    await db.articles.updateOne({ _id: articleId }, { $set: { "interview.runId": runId } });
    await awaitInput(db, runId, cfg.workerId, "interview");
    deps.log(`${tag} interview already open — waiting for the operator`);
    return "park";
  }
  if (iv?.runId?.equals(runId)) {
    deps.log(`${tag} ${iv.status === "skipped" ? "skipped by the operator" : "already refined"} — on to the Writer`);
    return "skip";
  }
  const mode = article.interviewMode ?? (await defaultInterviewMode(db, article.companyId, article.planId));
  if (mode === "skip" || !deps.interviewer) {
    const why = mode === "skip" ? "set to skip for this article" : "no interviewer configured";
    deps.log(`${tag} skipped (${why})`);
    await emitEvent(db, {
      companyId: run.companyId,
      runId,
      articleId,
      type: "interview.skipped",
      message: `Interview skipped (${why})`,
    });
    return "skip";
  }

  const startedAt = new Date();
  const opening = await deps.interviewer.open({
    article,
    companyName: deps.companyName,
    onProgress: (t) => deps.log(`${tag} ${t.slice(0, 160)}`),
  });
  // A POV from an earlier interview no longer matches the new outline.
  if (article.artifacts.pov) {
    await db.articles.updateOne({ _id: articleId }, { $unset: { "artifacts.pov": "" } });
    await rm(join(articleDir(cfg, article), "pov.md"), { force: true });
  }
  await openInterview(db, articleId, {
    runId,
    plan: opening.plan,
    opening: opening.opening,
    ...(opening.captured ? { captured: opening.captured } : {}),
    ...(opening.costUsd !== undefined ? { costUsd: opening.costUsd } : {}),
  });
  // Recorded like a phase attempt, so run cost and the plan budget brake see it.
  await pushPhaseResult(db, runId, {
    phase: "interview",
    status: "succeeded",
    attempt: 1,
    route: "direct",
    startedAt,
    endedAt: new Date(),
    usage: { model: opening.model, numTurns: 1, ...(opening.costUsd !== undefined ? { costUsd: opening.costUsd } : {}) },
  });
  if (!(await awaitInput(db, runId, cfg.workerId, "interview"))) {
    throw new Error("lost the run's lease before it could wait for the interview");
  }
  await emitEvent(db, {
    companyId: run.companyId,
    runId,
    articleId,
    type: "interview.opened",
    message: "Interview open — waiting for the expert",
  });
  deps.log(
    `${tag} opened (${opening.model}${opening.costUsd !== undefined ? `, $${opening.costUsd.toFixed(3)}` : ""}) — run waits for the expert`,
  );
  return "park";
}

/**
 * Run the pipeline for one claimed run, from run.fromStage through design.
 * Each stage persists its artifacts and records itself as run.currentPhase, so
 * a retry (failRun), a reclaim after a crash (claimRun) or a release on
 * shutdown (releaseRun) resumes at that phase; earlier phases never re-run.
 */
export async function runPipeline(deps: PipelineDeps, run: RunDoc): Promise<"completed" | "awaiting_input"> {
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

  // Admin-saved specs, standards and context (repo_files) take effect on the
  // next run without a redeploy — including new case studies.
  const applied = await applyRepoFiles(db, run.companyId, cfg.repoRoot);
  if (applied.written || applied.removed) {
    deps.log(`[${article.slug}] applied ${applied.written} Admin-saved file(s), removed ${applied.removed}`);
  }
  await materializeWorkspace(cfg, article);
  await materializeCompetitorGaps(db, cfg, article);

  const startIdx = PHASE_ORDER.indexOf(run.fromStage);
  const phases = PHASE_ORDER.slice(startIdx === -1 ? 0 : startIdx);

  let currentPhase: WorkStage | undefined;
  try {
    for (const phase of phases) {
      currentPhase = phase;
      // Recorded on the run so a reclaim (crashed worker) or a release
      // (deploy SIGTERM) resumes here instead of at run.fromStage.
      await setRunPhase(db, runId, phase);
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
      if (phase === "interview") {
        const step = await interviewStep(deps, run, fresh);
        if (step === "park") return "awaiting_input";
        if (step === "skip") continue;
      }
      await executePhase(deps, run, fresh, phase);
      if (phase === "interview") await markInterviewRefined(db, articleId);
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
    return "completed";
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
