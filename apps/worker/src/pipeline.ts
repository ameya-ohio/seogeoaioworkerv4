import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GATES,
  applyRepoFiles,
  demoteUnverifiedEvidence,
  evidenceAsSources,
  factsToVerify,
  markdownSection,
  parseInterviewEvidence,
  verifyGate,
  type ArticleVerification,
  type TechnicalIssue,
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
  refreshPlanBrief,
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
  parseLinkPlan,
  unwrapResearchNotes,
  type FormatRegistry,
  type LinkTarget,
  type PageRules,
} from "@blogagent/engine";
import { materializePageSpec, materializeResearchBrief, pageRulesFor, stampArticleFrontmatter } from "./pageSpec.js";
import type { AgentInvoker, AgentRunOutcome } from "./agentRunner.js";
import { AGENT_ONLY_PHASES, type DirectPhase, type WorkerConfig } from "./config.js";
import type { DirectPhaseRunner } from "./directRunner.js";
import type { InterviewOpener } from "./interviewOpener.js";
import { PHASE_ORDER, phaseDefs, type PhaseContext } from "./phases.js";
import { articleProse, type CitationVerifier, type LinkChecker } from "./quality.js";
import type { TechReviewer } from "./techReview.js";
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
  /** D61: expert read of the final text, in the verify stage. */
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
  page?: { rules: PageRules; formats: FormatRegistry; inventory?: LinkTarget[] },
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
    // D61: the draft as it was before HDCP, so no editor note can be deleted.
    if (article.artifacts.article) files.priorArticle = article.artifacts.article;
  }
  if (phase === "interview" || phase === "evidence") {
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
    if (phase === "outline" && page.inventory) files.linkInventory = page.inventory;
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
): Promise<CodeStepOutputs> {
  const { cfg, db } = deps;
  // The worker owns the facet and canonical_url frontmatter keys (D45–D46):
  // stamp them before anything reads the article.
  if (rules && (phase === "write" || phase === "hdcp" || phase === "edit" || phase === "verify" || phase === "schema")) {
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
    const raw = await readIf("research-notes.md");
    // Wrapped source entries are joined first, so every check below reads
    // each URL and the whole of each claim.
    let notes = unwrapResearchNotes(raw);
    if (notes !== raw) await writeFile(join(dir, "research-notes.md"), notes, "utf-8");
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
  if (phase === "evidence") {
    // D61: the verified interview facts get the same live check research's
    // claims do, and join the research-verified set the Edit gate cites from.
    const notes = await readIf("research-notes.md");
    const entries = parseInterviewEvidence(notes).filter((e) => e.verdict !== "unsourced" && e.url);
    const competitorReport = await runResearchCompetitorCheck(
      opts,
      join(relFolder, "research-notes.md"),
      article.facets?.articleType,
    );
    if (!entries.length) return { competitorReport };
    let citationReport = await deps.citationVerifier.verifyResearch(evidenceAsSources(entries));
    // D61 auto-demote (research's D37 auto-prune for interview facts): a fact
    // whose source failed the live check becomes the expert's opinion, so it
    // can't reach the article as verified and can't stall the run.
    const failed = citationReport.results.filter((r) => r.verdict === "unsupported" || r.verdict === "unreachable");
    if (failed.length) {
      const { notes: demotedNotes, demoted } = demoteUnverifiedEvidence(notes, failed);
      if (demoted.length) {
        await writeFile(join(dir, "research-notes.md"), demotedNotes, "utf-8");
        const gone = new Set(failed.map((r) => r.sourceN));
        const results = citationReport.results.filter((r) => !gone.has(r.sourceN));
        citationReport = {
          ...citationReport,
          results,
          unsupportedCount: results.filter((r) => r.verdict === "unsupported").length,
          unreachableCount: results.filter((r) => r.verdict === "unreachable").length,
        };
        deps.log(
          `[${article.slug}/evidence] auto-demoted ${demoted.length} fact(s) to unsourced (failed the live check): ` +
            failed.map((r) => `#${r.sourceN} "${r.claim.slice(0, 60)}"`).join("; "),
        );
      }
    }
    if (article._id && citationReport.verifiedUrls.length) {
      const prior = article.citationChecks;
      const merged: CitationReport = prior
        ? {
            ...prior,
            results: [...prior.results.filter((r) => r.sourceN < 101), ...citationReport.results],
            verifiedUrls: [...new Set([...prior.verifiedUrls, ...citationReport.verifiedUrls])],
            verifiedSourceCount: prior.verifiedSourceCount + citationReport.verifiedSourceCount,
          }
        : citationReport;
      await db.articles.updateOne({ _id: article._id }, { $set: { citationChecks: merged, updatedAt: new Date() } });
    }
    deps.log(
      `[${article.slug}/evidence] ${entries.length} fact source(s) checked: ${citationReport.verifiedSourceCount} verified, ` +
        `${citationReport.unsupportedCount} unsupported, ${citationReport.unreachableCount} unreachable`,
    );
    return { citationReport, competitorReport };
  }
  if (phase === "outline") {
    // D62: the planned links resolve, and no planned anchor already points
    // at a different page on the site — checked now, because every later
    // phase must use the plan exactly and couldn't fix either.
    const plan = parseLinkPlan(await readIf("outline.md"));
    if (!plan) return {};
    const linkReport = await deps.linkChecker.check(
      plan.map((l) => `[${l.anchor}](${l.url})`).join("\n\n"),
      article._id ? { articleId: article._id } : {},
    );
    return { linkReport };
  }
  if (phase === "edit" || phase === "verify" || phase === "design") {
    const report = await runSeoAudit(opts, relFolder);
    if (article._id) {
      await db.articles.updateOne(
        { _id: article._id },
        { $set: { audit: report, updatedAt: new Date() } },
      );
    }
    if (phase === "design") return {};
    const body = await readIf("article.md");
    // Body citations check deterministically against the research-verified
    // set; internal links resolve against inventory + the live site.
    const citationReport = deps.citationVerifier.verifyArticleBody(
      body,
      article.citationChecks,
      rules?.cta?.url ? [rules.cta.url] : [],
    );
    const linkReport = await recordLinks(deps, article, body);
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

/** Stable id for a text, so a verification round is reused for the text it read. */
/**
 * Stable id for a text, so a verification round is reused for the text it
 * read. The stage's own [VERIFY: …] notes are left out: a run that stopped
 * after flagging resumes on the same text plus its notes, and must find its
 * rounds instead of asking the reviewer again (and getting a different list).
 */
export function hashText(text: string): string {
  const core = text.replace(/\s?\[VERIFY:[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  return createHash("sha256").update(core).digest("hex").slice(0, 16);
}

/**
 * D61: put a `[VERIFY: …]` note right after each unresolved issue's quote,
 * so the editor sees it in place and the export refuses until it's resolved.
 * A quote the text no longer contains gets its note at the end of the body.
 */
export function flagUnresolved(md: string, issues: TechnicalIssue[]): string {
  let out = md;
  const tail: string[] = [];
  for (const i of issues) {
    const problem = i.problem.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
    const note = `[VERIFY: ${problem}]`;
    if (out.includes(note)) continue;
    const at = out.indexOf(i.quote);
    if (at !== -1) {
      const end = at + i.quote.length;
      out = `${out.slice(0, end)} ${note}${out.slice(end)}`;
    } else {
      tail.push(`[VERIFY: "${i.quote.replace(/[[\]]/g, "").slice(0, 160)}" — ${problem}]`);
    }
  }
  if (!tail.length) return out;
  const block = `${tail.join("\n\n")}\n\n`;
  const at = [out.indexOf("```json-ld"), out.indexOf("<!-- EDIT SUMMARY")].filter((n) => n !== -1).sort((a, b) => a - b)[0];
  return at === undefined ? `${out.trimEnd()}\n\n${block}` : `${out.slice(0, at)}${block}${out.slice(at)}`;
}

/**
 * HDCP inputs (agents/hdcp.md): the protocol's `cluster_context` — the hub,
 * the pages that own sibling topics, the glossary when context/glossary.md
 * exists — plus the audit of the Writer's draft (D61: HDCP runs before the
 * Editor, and the expert review reads the final text later).
 */
async function materializeHdcpInputs(
  cfg: WorkerConfig,
  article: ArticleDoc,
  inventory: LinkTarget[],
  draftAudit?: ScriptReport,
): Promise<void> {
  const checks = (draftAudit?.checks ?? []).filter((c) => c.level !== "pass");
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
    `## Audit of the draft: failures and warnings (the Editor clears what's left after you)`,
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
async function recordLinks(deps: PipelineDeps, article: ArticleDoc, body: string): Promise<LinkReport> {
  const linkReport = await deps.linkChecker.check(body, article._id ? { articleId: article._id } : {});
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
  /** D61 verify fix pass: the issues to fix, and the Edit gate instead of the verify gate. */
  opts: { verifyIssues?: TechnicalIssue[]; gate?: (files: GateFiles) => GateResult } = {},
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

  const route = AGENT_ONLY_PHASES.includes(phase) ? "agent" : cfg.direct.routes[phase as DirectPhase];

  // page.md (D45–D50) is rebuilt for every phase, so facets the Strategist
  // chose for a page that had none reach the Writer.
  const page = await pageRulesFor(db, cfg, article);
  await materializePageSpec(cfg, article, page.rules, page.inventory);
  if (phase === "research") await materializeResearchBrief(cfg, article, page.rules, page.formats, page.inventory);
  if (phase === "hdcp") {
    const opts2 = {
      repoRoot: cfg.repoRoot,
      pythonBin: cfg.pythonBin,
      ...(cfg.companyConfigPath ? { companyConfigPath: cfg.companyConfigPath } : {}),
    };
    if (page.rules) await stampArticleFrontmatter(cfg, article, page.rules);
    const draftAudit = await runSeoAudit(opts2, join("articles", article.folder));
    await materializeHdcpInputs(cfg, article, page.inventory, draftAudit);
  }

  // Edit pre-audit: run the edit gate's own checks on the incoming draft so
  // attempt 1 starts with the exact problems a retry would have been given.
  let preAudit: string[] | undefined;
  if (phase === "edit") {
    const preOutputs = await runCodeStep(deps, article, phase, page.rules);
    const pre = GATES.edit(await loadGateFiles(cfg, article, phase, preOutputs, page));
    // Style WARNs (rhythm, lists of three, signposts) don't fail the gate,
    // but they're the same class of problem — hand them over as advisory.
    const advisory = (preOutputs.report?.checks ?? [])
      .filter((c) => c.level === "warn" && c.message.startsWith("Style:"))
      .map((c) => `(advisory) ${c.message}`);
    // D61: the technical review reads the final text in the verify stage.
    const items = [...(pre.ok ? [] : pre.problems), ...advisory];
    if (items.length) preAudit = items;
    deps.log(
      `[${article.slug}/edit] pre-audit: ${pre.ok ? "draft passes the gate" : `${pre.problems.length} gate problem(s)`}` +
        `, ${advisory.length} advisory`,
    );
    for (const item of items) {
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
      ...(opts.verifyIssues ? { verifyIssues: opts.verifyIssues } : {}),
      headerPattern: page.rules.format.headerPattern,
    };
    const onProgress = (text: string) => deps.log(`[${article.slug}/${phase}] ${text.slice(0, 160)}`);
    const outcome: AgentRunOutcome =
      route === "direct"
        ? await deps.direct.run(phase as DirectPhase, def.specFile, ctx, onProgress)
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

    const outputs = await runCodeStep(deps, article, phase, page.rules);
    const files = await loadGateFiles(cfg, article, phase, outputs, page);
    gate = (opts.gate ?? GATES[phase])(files);
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
      // D61: the Editor runs after HDCP and records the links that ship.
      if (phase === "hdcp") await recordHdcp(deps, article, files.hdcpLog);
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
 * - `refine`: the operator finished the interview; the POV writer turns the
 *   answers into pov.md, before the Strategist plans (D61).
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
  // The opener reads the page's facets and CTA from page.md (D61: no outline exists yet).
  const page = await pageRulesFor(db, cfg, article);
  await materializePageSpec(cfg, article, page.rules, page.inventory);
  const opening = await deps.interviewer.open({
    article,
    companyName: deps.companyName,
    onProgress: (t) => deps.log(`${tag} ${t.slice(0, 160)}`),
  });
  // A POV from an earlier interview no longer matches the new research.
  if (article.artifacts.pov) {
    await db.articles.updateOne({ _id: articleId }, { $unset: { "artifacts.pov": "" } });
    await rm(join(articleDir(cfg, article), "pov.md"), { force: true });
  }
  await openInterview(db, articleId, {
    runId,
    basis: "research",
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
 * D61: the evidence stage runs when pov.md lists facts to verify, or when an
 * interviewed article's pov.md predates the list (the agent then reads the
 * transcript for them). Otherwise there is nothing to check.
 */
function needsEvidence(article: ArticleDoc): boolean {
  const pov = article.artifacts.pov;
  if (!pov) return false;
  if (factsToVerify(pov).length) return true;
  return !markdownSection(pov, "Facts to Verify") && Boolean(article.interview?.messages.some((m) => m.role === "user"));
}

const MAX_VERIFY_ROUNDS = 2;

/**
 * D61 verify stage: an expert read of the FINAL text, after the last
 * rewrite. Round 1 reviews it fresh; if it finds issues a fix pass (the
 * Editor in Fix mode, gated by the Edit checks) resolves them, and round 2
 * only confirms the listed issues (plus new technical errors). What's left
 * becomes inline [VERIFY: …] notes the export refuses. Each round is stored
 * against the hash of the text it read, and each fix against the text it
 * produced, so a restart picks up where the loop was instead of asking the
 * reviewer again and getting a different list.
 */
async function verifyStep(deps: PipelineDeps, run: RunDoc, article: ArticleDoc): Promise<void> {
  const { cfg, db } = deps;
  const runId = run._id;
  const articleId = article._id;
  if (!runId || !articleId) throw new Error("run/article missing _id");
  const tag = `[${article.slug}/verify]`;
  const dir = articleDir(cfg, article);
  const read = async (name: string) =>
    existsSync(join(dir, name)) ? await readFile(join(dir, name), "utf-8") : "";
  const page = await pageRulesFor(db, cfg, article);
  await materializePageSpec(cfg, article, page.rules, page.inventory);

  const prior = article.verification;
  const v: ArticleVerification = prior?.runId?.equals(runId)
    ? { ...prior, rounds: [...prior.rounds] }
    : { runId, rounds: [], unresolved: [] };
  delete v.completedAt;
  const save = () => db.articles.updateOne({ _id: articleId }, { $set: { verification: v, updatedAt: new Date() } });

  let open: TechnicalIssue[] = [];
  if (!deps.techReviewer || !cfg.techReview.enabled) {
    deps.log(`${tag} technical review off — verifying the Edit checks only`);
  } else {
    for (let round = 1; round <= MAX_VERIFY_ROUNDS; round++) {
      const md = await read("article.md");
      const hash = hashText(md);
      // This round's fix already produced the current text: go on to confirm it.
      if (v.rounds.some((x) => x.round === round && x.fixedHash === hash)) continue;
      const mode = round === 1 ? "review" : "confirm";
      let r = v.rounds.find((x) => x.round === round && x.articleHash === hash);
      if (r) {
        deps.log(`${tag} round ${round}: reusing the stored ${r.mode} of this text (${r.open.length} open)`);
      } else {
        const startedAt = new Date();
        const previous = v.rounds.find((x) => x.round === round - 1)?.open;
        const review = await deps.techReviewer.review({
          articleMd: md,
          researchNotes: await read("research-notes.md"),
          pageMd: await read("page.md"),
          outline: await read("outline.md"),
          pov: await read("pov.md"),
          interview: await read("interview.md"),
          mode,
          ...(previous?.length ? { previous } : {}),
          onProgress: (t) => deps.log(`${tag} ${t.slice(0, 160)}`),
        });
        r = { round, articleHash: hash, mode, review, open: review.skipped ? [] : review.issues, fixed: false, at: new Date() };
        // A fresh review of round N supersedes any later round from an earlier pass.
        v.rounds = [...v.rounds.filter((x) => x.round < round), r];
        await save();
        await pushPhaseResult(db, runId, {
          phase: "verify",
          status: "succeeded",
          attempt: round,
          route: "direct",
          startedAt,
          endedAt: new Date(),
          usage: { model: review.model, numTurns: 1, ...(review.costUsd !== undefined ? { costUsd: review.costUsd } : {}) },
        });
        deps.log(
          `${tag} round ${round} (${mode}): ` +
            (review.skipped ? `skipped (${review.skipped})` : `${review.issues.length} issue(s)`) +
            ` — ${review.model}${review.costUsd !== undefined ? `, $${review.costUsd.toFixed(3)}` : ""}`,
        );
        for (const i of r.open) deps.log(`${tag}   - ${i.kind}: "${i.quote.slice(0, 90)}" — ${i.problem.slice(0, 160)}`);
      }
      open = r.open;
      if (!open.length || round === MAX_VERIFY_ROUNDS) break;
      // Fix exactly these, gated by every Edit check. A fix pass that can't
      // pass them (a judged check, like link relevance, can trip on any
      // rewording) must not fail the run: keep the text from before it and
      // leave the issues for the editor as [VERIFY: …] notes.
      const before = await read("article.md");
      try {
        await executePhase(deps, run, (await getArticle(db, articleId)) ?? article, "verify", {
          verifyIssues: open,
          gate: GATES.edit,
        });
      } catch (err) {
        await writeFile(join(dir, "article.md"), before, "utf-8");
        deps.log(
          `${tag} fix pass couldn't pass the Edit checks (${err instanceof Error ? err.message.slice(0, 200) : String(err)}) — ` +
            `keeping the text from before it; the ${open.length} issue(s) go to the editor`,
        );
        break;
      }
      r.fixed = true;
      r.fixedHash = hashText(await read("article.md"));
      await save();
    }
  }

  if (open.length) {
    const flagged = flagUnresolved(await read("article.md"), open);
    await writeFile(join(dir, "article.md"), flagged, "utf-8");
    deps.log(`${tag} ${open.length} issue(s) left for the editor as [VERIFY: …] notes (the export refuses until resolved)`);
  }
  v.unresolved = open;
  v.completedAt = new Date();
  await save();

  // The text that ships passes every Edit check and carries its notes.
  const outputs = await runCodeStep(deps, article, "verify", page.rules);
  const files = await loadGateFiles(cfg, article, "verify", outputs, page);
  files.verification = v;
  const gate = verifyGate(files);
  await saveGateResult(db, articleId, "verify", gate);
  deps.log(`${tag} ${gate.ok ? "gate passed" : `gate FAILED: ${gate.problems.join("; ").slice(0, 1200)}`}`);
  if (!gate.ok) throw new Error(`verify: ${gate.problems.join("; ")}`);
  await persistPhaseOutputs(db, cfg, deps.storage, article, "verify");
  await emitEvent(db, {
    companyId: run.companyId,
    runId,
    articleId,
    type: "gate.passed",
    message: `Verify passed${open.length ? ` — ${open.length} issue(s) flagged for the editor` : ""}`,
    data: { phase: "verify", rounds: v.rounds.length, unresolved: open.length },
  });
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
  const loaded = await getArticle(db, run.articleId);
  if (!loaded) throw new Error(`article ${run.articleId} not found`);
  // D60: a run that starts from research picks up the plan item's current
  // (enriched) brief instead of the one copied at first enqueue.
  const article =
    (run.currentPhase ?? run.fromStage) === "research" ? await refreshPlanBrief(db, loaded) : loaded;
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
      if (phase === "evidence" && !needsEvidence(fresh)) {
        deps.log(`[${fresh.slug}/evidence] nothing to verify — ${fresh.artifacts.pov ? "the interview raised no third-party facts" : "no interview"}`);
        continue;
      }
      if (phase === "verify") {
        await verifyStep(deps, run, fresh);
        continue;
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
