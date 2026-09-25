import type { ArticleDoc, WorkStage } from "@blogagent/engine";
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

export function feedback(ctx: PhaseContext): string {
  if (!ctx.gateFeedback?.length) return "";
  return [
    ``,
    `GATE FEEDBACK — your previous attempt failed these machine-checked gate conditions.`,
    `Fix every one of them this time:`,
    ...ctx.gateFeedback.map((p) => `- ${p}`),
  ].join("\n");
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
          `Conduct deep multi-source web research (minimum 8 distinct sources, biased`,
          `toward primary/authoritative) and write the research notes to:`,
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
          header(ctx, 2, "Strategist"),
          ``,
          `Inputs to read first:`,
          `- articles/${ctx.article.folder}/research-notes.md`,
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
          ``,
          `Write the strategy + outline to: articles/${ctx.article.folder}/outline.md`,
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
          header(ctx, 3, "Writer"),
          ``,
          `Inputs to read first:`,
          `- articles/${ctx.article.folder}/outline.md`,
          `- articles/${ctx.article.folder}/research-notes.md`,
          `- context/author-style/ (or your spec's default voice rules if empty)`,
          `- context/brand/ (skip if empty)`,
          `- config/company.yaml (author + canonical URL pattern for frontmatter)`,
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
          header(ctx, 4, "Editor"),
          ``,
          `Inputs to read first:`,
          `- standards/quality-bar.md, standards/seo-checklist.md, standards/geo-checklist.md, standards/aio-checklist.md`,
          `- standards/banned-phrases.txt and the voice rules in config/company.yaml`,
          `- articles/${ctx.article.folder}/article.md and research-notes.md`,
          ``,
          `Walk every checklist item, edit article.md in place to fix all failures,`,
          `and append the HTML-comment edit summary at the bottom.`,
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
          header(ctx, 5, "Schema Builder"),
          ``,
          `Inputs to read first:`,
          `- standards/schema-spec.md and templates/schema-template.json`,
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
          header(ctx, 6, "Header Designer"),
          ``,
          `Generate the 1200×600 hero image with:`,
          `  ${ctx.cfg.headerGenPython} blogheaderimagegen/generate_header.py \\`,
          `    --from-article articles/${ctx.article.folder}/ \\`,
          `    --pattern auto`,
          `(Override --pattern with a named pattern only when your spec gives you a reason.)`,
          ``,
          `After generation, update articles/${ctx.article.folder}/article.md frontmatter:`,
          `set hero_image: "header.png" and write a short, accurate hero_image_alt.`,
          feedback(ctx),
        ].join("\n"),
    },
  };
}

export const PHASE_ORDER: WorkStage[] = ["research", "outline", "write", "edit", "schema", "design"];
