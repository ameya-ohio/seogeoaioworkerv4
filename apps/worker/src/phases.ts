import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cfgGet, loadCompanyConfig, type ArticleDoc, type TechnicalIssue, type WorkStage } from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";

/**
 * Phase definitions: which agent spec drives the phase, which tools it may
 * use, and the task prompt. The specs in agents/*.md are the single source
 * of behavior (D2/D10) — the worker feeds them to the Agent SDK verbatim as
 * the system prompt; this file only supplies the run-specific wiring.
 */
export interface PhaseDef {
  phase: WorkStage;
  title: string;
  specFile: string;
  allowedTools: string[];
  buildPrompt(ctx: PhaseContext): string;
}

export interface PhaseContext {
  article: ArticleDoc;
  cfg: WorkerConfig;
  companyName: string;
  /** 6.3: competitor-gaps.md was materialized into the article folder. */
  hasCompetitorGaps?: boolean;
  /** Gate problems from the previous attempt, when retrying. */
  gateFeedback?: string[];
  /** Edit only: the edit gate's problems on the incoming draft, before attempt 1. */
  preAudit?: string[];
  /** Design only: the format's default header pattern (formats.json). */
  headerPattern?: string;
  /** Verify only (D61): the issues the fix pass must resolve, and nothing else. */
  verifyIssues?: TechnicalIssue[];
  /** Verify only: the banned list the Edit gate fails on, printed beside the issues. */
  bannedPhrases?: string[];
}

/**
 * The list seo_audit.py fails on: standards/banned-phrases.txt plus the
 * company's voice.banned_phrases, lowercased and deduped — the same rules as
 * scripts/company_config.py load_banned_phrases.
 */
export function loadBannedPhrases(cfg: Pick<WorkerConfig, "repoRoot" | "companyConfigPath">): string[] {
  const phrases: string[] = [];
  const file = join(cfg.repoRoot, "standards", "banned-phrases.txt");
  if (existsSync(file)) {
    for (const raw of readFileSync(file, "utf-8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      phrases.push((/^(["']).*\1$/.test(line) && line.length >= 2 ? line.slice(1, -1) : line).toLowerCase());
    }
  }
  try {
    const extra = cfgGet<unknown[]>(loadCompanyConfig(cfg.repoRoot, cfg.companyConfigPath), "voice.banned_phrases", []);
    if (Array.isArray(extra)) phrases.push(...extra.map((x) => String(x).toLowerCase()));
  } catch {
    // No company config in this checkout: the generic list still applies.
  }
  return [...new Set(phrases)];
}

/** D61: the verify fix pass's brief — fix exactly these, in Fix mode (agents/editor.md). */
export function verifyIssuesBlock(ctx: PhaseContext): string {
  if (!ctx.verifyIssues?.length) return "";
  return [
    ``,
    `FIX MODE — the expert review of the final text found these issues. Fix each one (the quote shows where),`,
    `change nothing else, and keep every check the article already passes:`,
    ...ctx.verifyIssues.map((i) => `- ${i.kind}: "${i.quote}" — ${i.problem}${i.fix ? ` Fix: ${i.fix}` : ""}`),
    ...(ctx.bannedPhrases?.length
      ? [
          ``,
          `BANNED WORDS AND PHRASES — the Edit gate fails the article if any of these appears (case-insensitive, whole`,
          `words). A sentence you rewrite must contain none of them; "just" and "it's not just" are the ones fixes slip in:`,
          ctx.bannedPhrases.map((p) => `"${p}"`).join(", "),
        ]
      : []),
  ].join("\n");
}

const FILE_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];
const WEB_TOOLS = ["WebSearch", "WebFetch"];

function header(ctx: PhaseContext, phaseNo: number, title: string): string {
  const { article } = ctx;
  return [
    `You are running Phase ${phaseNo} (${title}) of the blog pipeline for ${ctx.companyName}.`,
    ``,
    `Repo root is your working directory. Company config: config/company.yaml.`,
    `Article folder: articles/${article.folder}/`,
    `Topic: ${article.topic}`,
    `Target keyword: ${article.targetKeyword ?? "not specified — use what research/strategy chose"}`,
    ``,
    `Follow your phase spec (your system prompt) exactly, including its output format and hard rules.`,
  ].join("\n");
}

/**
 * The machine-checked problems already present in the draft. Reading a
 * 70-phrase list against a 3,000-word article by eye misses hits; handing
 * the Editor the gate's exact findings (with quoted context) up front is
 * what makes attempt 1 pass instead of attempt 2.
 */
export function preAuditBlock(ctx: PhaseContext): string {
  if (!ctx.preAudit?.length || ctx.gateFeedback?.length) return "";
  return [
    ``,
    `PRE-AUDIT — the worker ran the Editor gate's machine checks on the current draft.`,
    `Every item below fails that gate today; fix each one (quoted context shows where),`,
    `in addition to your full checklist pass, and don't introduce new ones:`,
    ...ctx.preAudit.map((p) => `- ${p}`),
  ].join("\n");
}

export function feedback(ctx: PhaseContext): string {
  if (!ctx.gateFeedback?.length) return "";
  return [
    ``,
    `GATE FEEDBACK — your previous attempt failed these machine-checked gate conditions.`,
    `Fix every one of them this time:`,
    ...ctx.gateFeedback.map((p) => `- ${p}`),
  ].join("\n");
}

/**
 * D59: the Expert POV inputs, when the article was interviewed. The Writer
 * builds on pov.md; the Editor and HDCP also get the transcript, because
 * expert statements are sourced to it rather than to the research notes.
 */
export function povLines(ctx: PhaseContext, withTranscript: boolean): string[] {
  if (!ctx.article.artifacts.pov) return [];
  return [
    `- articles/${ctx.article.folder}/pov.md — the Expert POV brief (D59): the thesis, argument spine,`,
    `  anchor, company role and approved quotes the article is built on. Its thesis and spine are locked.`,
    ...(withTranscript
      ? [`- articles/${ctx.article.folder}/interview.md — the interview transcript; expert statements trace to it`]
      : []),
  ];
}

export function phaseDefs(cfg: WorkerConfig): Record<WorkStage, PhaseDef> {
  return {
    research: {
      phase: "research",
      title: "Researcher",
      specFile: "agents/researcher.md",
      allowedTools: [...FILE_TOOLS, ...WEB_TOOLS],
      buildPrompt: (ctx) =>
        [
          header(ctx, 1, "Researcher"),
          ``,
          ...(ctx.hasCompetitorGaps
            ? [
                `Optional input to read first:`,
                `- articles/${ctx.article.folder}/competitor-gaps.md — a digest of competitor blog`,
                `  coverage from scraped corpora. Use it ONLY for the Content Gaps section (what`,
                `  competitors cover heavily vs. what nobody covers well); it is internal evidence,`,
                `  never a citable source.`,
                ``,
              ]
            : []),
          `Inputs to read first, in this order:`,
          `- articles/${ctx.article.folder}/research-brief.md — WHAT YOU ARE RESEARCHING FOR (D60): this page's`,
          `  facets, what it must cover, the research playbook its article type selects, the adjustments for its`,
          `  role, funnel and intent, and the pages that own neighbouring topics. Your process follows it.`,
          `- articles/${ctx.article.folder}/page.md — the page's rules and format guide`,
          ...(ctx.article.brief ? [`- articles/${ctx.article.folder}/brief.md — the page's brief (coverage and evidence requirements)`] : []),
          `- context/sales/competitive-landscape.md if it exists: head-to-head vendors listed there (and their`,
          `  executives quoted anywhere) are never sources.`,
          ``,
          `Research the material this page is built from (the playbook's Subject Material), form the candidate`,
          `positions it supports, and bank the evidence each one needs. Use web search and fetch extensively:`,
          `at least 8 distinct sources, biased toward primary documentation and standards. Write the notes to:`,
          `  articles/${ctx.article.folder}/research-notes.md`,
          `in the exact section format from your spec.`,
          feedback(ctx),
        ].join("\n"),
    },
    outline: {
      phase: "outline",
      title: "Strategist",
      specFile: "agents/strategist.md",
      allowedTools: FILE_TOOLS,
      buildPrompt: (ctx) =>
        [
          header(ctx, 3, "Strategist"),
          ``,
          `Inputs to read first:`,
          `- articles/${ctx.article.folder}/page.md — this page's spec (D45–D50): facets, the rules they`,
          `  resolve to (length band, Key Takeaways count, FAQ range, CTA) and the format guide. Build the`,
          `  outline on the format guide and include a \`## Page Facets\` section${ctx.article.facets ? " copied from page.md" : " — this page has no facets yet, so choose them from standards/formats.json"}.`,
          `- articles/${ctx.article.folder}/research-notes.md (with ## Interview Evidence when the expert raised facts)`,
          ...(ctx.article.artifacts.pov
            ? [
                `- articles/${ctx.article.folder}/pov.md — the EXPERT POV BRIEF from the interview (D61). Its thesis is the`,
                `  article's thesis, its Argument Spine is your spine's starting point, and nothing under ## Rejected is`,
                `  argued. An interview fact is used only as its Interview Evidence verdict allows.`,
              ]
            : []),
          ...(ctx.article.brief
            ? [
                `- articles/${ctx.article.folder}/brief.md — a SPOKE BRIEF from the Topic & Cluster`,
                `  Generator. It is a first-class input (D31): use its H2 outline vocabulary and`,
                `  answer-first passage requirements, and take the target word count from its`,
                `  length band (${ctx.article.brief.lengthBand.min}–${ctx.article.brief.lengthBand.max} words) INSTEAD of the SERP-median rule in your spec.`,
              ]
            : []),
          `- all files in standards/ (seo-checklist.md, geo-checklist.md, aio-checklist.md, schema-spec.md, quality-bar.md)`,
          `- context/brand/, context/marketing/, context/sales/ (skip empty folders silently)`,
          `- context/case-studies/ — real engagements (skip README.md, _template.md, and any file marked "Permission: internal only")`,
          ``,
          `Write the strategy + outline to: articles/${ctx.article.folder}/outline.md`,
          feedback(ctx),
        ].join("\n"),
    },
    interview: {
      phase: "interview",
      title: "POV Writer",
      specFile: "agents/pov-writer.md",
      allowedTools: FILE_TOOLS,
      buildPrompt: (ctx) =>
        [
          header(ctx, 2, "POV Writer"),
          ``,
          `Inputs to read first:`,
          `- articles/${ctx.article.folder}/interview.md — the expert interview transcript (the source for the POV)`,
          `- articles/${ctx.article.folder}/research-notes.md — Candidate Positions, Subject Material and the evidence bank`,
          `- articles/${ctx.article.folder}/page.md (facets, CTA, format guide)`,
          `- standards/quality-bar.md, context/sales/proof-points.md (Citable: yes only)`,
          `- context/case-studies/ (skip README.md, _template.md, and any file marked "Permission: internal only")`,
          ``,
          `Write the Expert POV brief to articles/${ctx.article.folder}/pov.md, per your spec. The Strategist plans`,
          `the outline from it next; you don't write an outline.`,
          feedback(ctx),
        ].join("\n"),
    },
    evidence: {
      phase: "evidence",
      title: "Evidence",
      specFile: "agents/evidence.md",
      allowedTools: [...FILE_TOOLS, ...WEB_TOOLS],
      buildPrompt: (ctx) =>
        [
          header(ctx, 2.5, "Evidence"),
          ``,
          `Inputs to read first:`,
          `- articles/${ctx.article.folder}/pov.md — ## Facts to Verify: the third-party facts the expert raised`,
          `- articles/${ctx.article.folder}/interview.md — the transcript (catch a fact pov.md missed; see your spec)`,
          `- articles/${ctx.article.folder}/research-notes.md — skip a fact research already verified`,
          `- articles/${ctx.article.folder}/research-brief.md — the page's facets and neighbouring pages`,
          `- context/sales/competitive-landscape.md if it exists: head-to-head vendors (and their executives quoted`,
          `  anywhere) are never sources.`,
          ``,
          `Verify each fact on the web against a primary source and APPEND a \`## Interview Evidence\` section to`,
          `  articles/${ctx.article.folder}/research-notes.md`,
          `in the exact format from your spec. Change nothing else in the file.`,
          feedback(ctx),
        ].join("\n"),
    },
    write: {
      phase: "write",
      title: "Writer",
      specFile: "agents/writer.md",
      allowedTools: FILE_TOOLS,
      buildPrompt: (ctx) =>
        [
          header(ctx, 4, "Writer"),
          ``,
          `Inputs to read first:`,
          `- articles/${ctx.article.folder}/page.md (format guide, Key Takeaways count, FAQ range, closing CTA)`,
          `- articles/${ctx.article.folder}/outline.md`,
          ...povLines(ctx, false),
          `- articles/${ctx.article.folder}/research-notes.md`,
          `- context/author-style/ (or your spec's default voice rules if empty)`,
          `- context/brand/ (skip if empty)`,
          `- context/case-studies/ — real engagements (skip README.md, _template.md, and any file marked "Permission: internal only")`,
          `- config/company.yaml (author for frontmatter; the worker stamps canonical_url and the facet keys)`,
          `- context/sales/proof-points.md — the only company numbers you may cite (Citable: yes entries only)`,
          ``,
          `Write the full article to: articles/${ctx.article.folder}/article.md`,
          `Also update articles/${ctx.article.folder}/meta.json (title, slug, meta_description, keywords, canonical).`,
          feedback(ctx),
        ].join("\n"),
    },
    edit: {
      phase: "edit",
      title: "Editor",
      specFile: "agents/editor.md",
      allowedTools: FILE_TOOLS,
      buildPrompt: (ctx) =>
        [
          header(ctx, 6, "Editor"),
          ``,
          `Inputs to read first:`,
          `- standards/quality-bar.md, standards/seo-checklist.md, standards/geo-checklist.md, standards/aio-checklist.md`,
          `- standards/banned-phrases.txt and the voice rules in config/company.yaml`,
          `- articles/${ctx.article.folder}/page.md (format guide, Key Takeaways count, FAQ range, closing CTA)`,
          `- articles/${ctx.article.folder}/article.md and research-notes.md`,
          `- articles/${ctx.article.folder}/outline.md (the thesis, Argument Spine and each H2's Claim — Pass 6.6)`,
          ...povLines(ctx, true),
          `- context/sales/competitive-landscape.md (head-to-head vs. complementary vendors; skip if absent)`,
          `- context/sales/proof-points.md (company numbers: only Citable: yes entries may stay)`,
          `- context/case-studies/ — real engagements (skip README.md, _template.md, and any file marked "Permission: internal only")`,
          ``,
          `HDCP has already restructured this draft (D61): make the smallest edits that pass every check, and don't`,
          `restructure. Walk every checklist item, edit article.md in place to fix all failures,`,
          `and append the HTML-comment edit summary at the bottom.`,
          preAuditBlock(ctx),
          feedback(ctx),
        ].join("\n"),
    },
    verify: {
      phase: "verify",
      title: "Verify (fix pass)",
      specFile: "agents/editor.md",
      allowedTools: FILE_TOOLS,
      buildPrompt: (ctx) =>
        [
          header(ctx, 7, "Verify fix pass"),
          ``,
          `Inputs to read first:`,
          `- articles/${ctx.article.folder}/article.md (the final text), research-notes.md, outline.md, page.md`,
          ...povLines(ctx, true),
          `- standards/quality-bar.md and standards/banned-phrases.txt`,
          ``,
          `Run your spec's "Fix mode" on articles/${ctx.article.folder}/article.md: fix exactly the issues below`,
          `and edit it in place.`,
          verifyIssuesBlock(ctx),
          feedback(ctx),
        ].join("\n"),
    },
    hdcp: {
      phase: "hdcp",
      title: "HDCP",
      specFile: "agents/hdcp.md",
      allowedTools: FILE_TOOLS,
      buildPrompt: (ctx) =>
        [
          header(ctx, 5, "HDCP"),
          ``,
          `Inputs to read first:`,
          `- articles/${ctx.article.folder}/page.md (facets, CTA, format guide, internal link inventory)`,
          `- articles/${ctx.article.folder}/hdcp-inputs.md (target_keyword, content_role, cluster_context, the draft's audit findings)`,
          `- articles/${ctx.article.folder}/article.md (the Writer's draft — the fact boundary; the Editor runs after you)`,
          `- articles/${ctx.article.folder}/research-notes.md (context only; never bring a fact in from it)`,
          ...povLines(ctx, true),
          `- standards/quality-bar.md and context/sales/proof-points.md`,
          ``,
          `Diagnose, then rewrite, following "How this runs in the pipeline" in your spec. Rewrite`,
          `articles/${ctx.article.folder}/article.md in place (frontmatter unchanged, no editor notes in it) and write`,
          `the log, with its ## Editor notes, to articles/${ctx.article.folder}/hdcp.md.`,
          feedback(ctx),
        ].join("\n"),
    },
    schema: {
      phase: "schema",
      title: "Schema Builder",
      specFile: "agents/schema-builder.md",
      allowedTools: [...FILE_TOOLS, "Bash"],
      buildPrompt: (ctx) =>
        [
          header(ctx, 8, "Schema Builder"),
          ``,
          `Inputs to read first:`,
          `- standards/schema-spec.md and templates/schema-template.json`,
          `- articles/${ctx.article.folder}/page.md (the schema types for this page's format)`,
          `- articles/${ctx.article.folder}/article.md (finalized frontmatter + body + FAQ)`,
          `- config/company.yaml (Organization/Person/breadcrumb/locale values)`,
          ``,
          `Write the @graph to articles/${ctx.article.folder}/schema.json, then validate with:`,
          `  ${ctx.cfg.pythonBin} scripts/validate_schema.py articles/${ctx.article.folder}/schema.json`,
          `Fix and re-run until exit code 0. Then embed the same JSON in article.md`,
          `inside a fenced \`\`\`json-ld block at the end (above the edit-summary comment).`,
          feedback(ctx),
        ].join("\n"),
    },
    design: {
      phase: "design",
      title: "Header Designer",
      specFile: "agents/header-designer.md",
      allowedTools: [...FILE_TOOLS, "Bash"],
      buildPrompt: (ctx) =>
        [
          header(ctx, 9, "Header Designer"),
          ``,
          `Generate the 1200×600 hero image with:`,
          `  ${ctx.cfg.headerGenPython} blogheaderimagegen/generate_header.py \\`,
          `    --from-article articles/${ctx.article.folder}/ \\`,
          `    --pattern ${ctx.headerPattern ?? "auto"}`,
          `(Override --pattern with a named pattern only when your spec gives you a reason.)`,
          ``,
          `After generation, update articles/${ctx.article.folder}/article.md frontmatter:`,
          `set hero_image: "header.png" and write a short, accurate hero_image_alt.`,
          feedback(ctx),
        ].join("\n"),
    },
  };
}

/** D61: the point of view before the plan; the last rewrite always gated; a final read of the finished text. */
export const PHASE_ORDER: WorkStage[] = [
  "research",
  "interview",
  "evidence",
  "outline",
  "write",
  "hdcp",
  "edit",
  "verify",
  "schema",
  "design",
];
