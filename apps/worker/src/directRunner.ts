import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import type { PhaseUsage } from "@blogagent/engine";
import type { AgentRunOutcome } from "./agentRunner.js";
import type { DirectPhase, Effort, WorkerConfig } from "./config.js";
import { feedback, type PhaseContext } from "./phases.js";
import { articleDir } from "./workspace.js";

const execFileAsync = promisify(execFile);

/**
 * Direct Messages API route for the tool-less phases (D25 / roadmap 10.3).
 *
 * The Agent SDK route spawns a Claude Code session per phase and lets the
 * model read and write files through tools, turn by turn. None of these five
 * phases need tools: the worker already knows every input a spec asks for, so
 * it inlines them, makes ONE streaming call with the spec as the system
 * prompt, parses the returned files, and writes them itself. Gates, code
 * steps, and persistence are unchanged — the pipeline can't tell the routes
 * apart except by speed and cost.
 *
 * Two phases also move mechanical work out of the model:
 * - schema: the model returns schema.json only; the worker embeds it in
 *   article.md, so the "byte-equivalent embed" rule holds by construction.
 * - design: the model picks the pattern and alt text; the worker runs the
 *   header CLI and sets the two frontmatter fields.
 */

export interface DirectLlmRequest {
  model: string;
  system: Anthropic.TextBlockParam[];
  prompt: string;
  maxTokens: number;
  effort: Effort;
}

export interface DirectLlmResponse {
  text: string;
  stopReason: string | null;
  usage: Required<Omit<PhaseUsage, "costUsd" | "numTurns" | "model">>;
}

/** Injectable so the pipeline E2E runs the direct route with zero API spend. */
export interface DirectLlm {
  generate(req: DirectLlmRequest): Promise<DirectLlmResponse>;
}

export class SdkDirectLlm implements DirectLlm {
  private client: Anthropic | undefined;

  async generate(req: DirectLlmRequest): Promise<DirectLlmResponse> {
    // Lazy: constructing the client without credentials throws, and the
    // worker must still start (and run agent-route phases) without one.
    this.client ??= new Anthropic();
    // Streaming: an article-length response plus adaptive thinking can run
    // past a non-streaming request's HTTP timeout.
    const message = await this.client.messages
      .stream({
        model: req.model,
        max_tokens: req.maxTokens,
        thinking: { type: "adaptive" },
        output_config: { effort: req.effort },
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
      })
      .finalMessage();
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return {
      text,
      stopReason: message.stop_reason,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}

/**
 * USD per million tokens. The Agent SDK reports a cost per phase; the
 * Messages API reports tokens only, and the plan budget brake sums
 * phaseResults[].usage.costUsd — so direct phases estimate it here (cache
 * writes 1.25× input, cache reads 0.1× input). Unknown models record no cost
 * rather than a wrong one.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export function estimateCostUsd(model: string, u: DirectLlmResponse["usage"]): number | undefined {
  const p = PRICES[model];
  if (!p) return undefined;
  const inputSide =
    u.inputTokens * p.input + u.cacheCreationTokens * p.input * 1.25 + u.cacheReadTokens * p.input * 0.1;
  return (inputSide + u.outputTokens * p.output) / 1_000_000;
}

/** Header patterns the generator accepts — mirrors PATTERN_NAMES in blogheaderimagegen/lib/patterns.py. */
export const HEADER_PATTERNS = [
  "clean-light",
  "contrarian",
  "stat-highlight",
  "question-hook",
  "report-cover",
] as const;

interface InputFile {
  path: string;
  content: string;
}

interface PhasePlan {
  /** Identical for every article — cached behind the system prompt. */
  reference: InputFile[];
  /** This article's inputs. */
  inputs: InputFile[];
  task: string;
  outputs: string[];
}

const TEXT_EXT = /\.(md|txt|ya?ml|json)$/i;

async function readRel(cfg: WorkerConfig, rel: string): Promise<InputFile | null> {
  const abs = join(cfg.repoRoot, rel);
  if (!existsSync(abs)) return null;
  return { path: rel, content: await readFile(abs, "utf-8") };
}

/** Text files in a repo-relative folder, sorted so the cached prefix is stable. */
async function readDir(cfg: WorkerConfig, rel: string): Promise<InputFile[]> {
  const abs = join(cfg.repoRoot, rel);
  if (!existsSync(abs)) return [];
  const names = (await readdir(abs)).filter((n) => TEXT_EXT.test(n)).sort();
  const files: InputFile[] = [];
  for (const n of names) {
    const f = await readRel(cfg, join(rel, n));
    if (f && f.content.trim()) files.push(f);
  }
  return files;
}

async function readAll(cfg: WorkerConfig, rels: string[]): Promise<InputFile[]> {
  const out: InputFile[] = [];
  for (const rel of rels) {
    const f = await readRel(cfg, rel);
    if (f) out.push(f);
  }
  return out;
}

function renderInputs(files: InputFile[]): string {
  return files.map((f) => `<input path="${f.path}">\n${f.content.trimEnd()}\n</input>`).join("\n\n");
}

function frontmatterOf(md: string): string {
  const m = /^---\n[\s\S]*?\n---/.exec(md);
  return m ? m[0] : "";
}

async function planPhase(phase: DirectPhase, ctx: PhaseContext): Promise<PhasePlan> {
  const { cfg, article } = ctx;
  const folder = `articles/${article.folder}`;
  const inFolder = (name: string) => `${folder}/${name}`;

  switch (phase) {
    case "outline": {
      const standards = await readDir(cfg, "standards");
      return {
        reference: [
          ...standards.filter((f) => f.path.endsWith(".md")),
          ...(await readDir(cfg, "context/brand")),
          ...(await readDir(cfg, "context/marketing")),
          ...(await readDir(cfg, "context/sales")),
        ],
        inputs: await readAll(cfg, [
          inFolder("research-notes.md"),
          ...(article.brief ? [inFolder("brief.md")] : []),
        ]),
        task: [
          `Write the strategy + outline as outline.md.`,
          ...(article.brief
            ? [
                `${inFolder("brief.md")} is a SPOKE BRIEF — a first-class input (D31): use its H2 outline`,
                `vocabulary and answer-first passage requirements, and take the target word count from its`,
                `length band (${article.brief.lengthBand.min}–${article.brief.lengthBand.max} words) INSTEAD of the SERP-median rule in your spec.`,
              ]
            : []),
        ].join("\n"),
        outputs: ["outline.md"],
      };
    }
    case "write":
      return {
        reference: [
          ...(await readDir(cfg, "context/author-style")),
          ...(await readDir(cfg, "context/brand")),
          ...(await readAll(cfg, ["config/company.yaml"])),
        ],
        inputs: await readAll(cfg, [
          inFolder("outline.md"),
          inFolder("research-notes.md"),
          inFolder("article.md"),
          inFolder("meta.json"),
        ]),
        task: [
          `Write the full article as article.md (the current article.md is the scaffold whose`,
          `frontmatter you fill in completely), and update meta.json (title, slug, meta_description,`,
          `keywords, canonical). If context/author-style/ is absent, use your spec's default voice rules.`,
        ].join("\n"),
        outputs: ["article.md", "meta.json"],
      };
    case "edit":
      return {
        reference: [
          ...(await readAll(cfg, [
            "standards/quality-bar.md",
            "standards/seo-checklist.md",
            "standards/geo-checklist.md",
            "standards/aio-checklist.md",
            "standards/banned-phrases.txt",
            "config/company.yaml",
          ])),
          ...(await readDir(cfg, "context/author-style")),
        ],
        inputs: await readAll(cfg, [inFolder("article.md"), inFolder("research-notes.md")]),
        task: [
          `Walk every checklist item, fix every failure, and return the complete edited article.md`,
          `with the HTML-comment edit summary appended at the bottom.`,
        ].join("\n"),
        outputs: ["article.md"],
      };
    case "schema":
      return {
        reference: await readAll(cfg, [
          "standards/schema-spec.md",
          "templates/schema-template.json",
          "config/company.yaml",
        ]),
        inputs: await readAll(cfg, [inFolder("article.md")]),
        task: [
          `Return the complete @graph as schema.json (valid JSON, no comments).`,
          `Return ONLY schema.json: the worker validates it with scripts/validate_schema.py and embeds`,
          `the identical JSON into article.md itself, so skip your spec's validate and embed steps.`,
        ].join("\n"),
        outputs: ["schema.json"],
      };
    case "design": {
      const md = (await readRel(cfg, inFolder("article.md")))?.content ?? "";
      return {
        reference: [],
        inputs: [{ path: `${inFolder("article.md")} (frontmatter)`, content: frontmatterOf(md) }],
        task: [
          `Choose the header for this article and return header.json:`,
          `{"pattern": "auto" | ${HEADER_PATTERNS.map((p) => `"${p}"`).join(" | ")},`,
          ` "subtitle": null | "<6–14-word dek, only when meta_description is too long for a header>",`,
          ` "hero_image_alt": "<short, accurate alt text>"}`,
          `The worker runs the header generator with your choices and sets hero_image and`,
          `hero_image_alt in the frontmatter — return only header.json.`,
        ].join("\n"),
        outputs: ["header.json"],
      };
    }
  }
}

function buildUserPrompt(phase: DirectPhase, ctx: PhaseContext, plan: PhasePlan): string {
  const { article } = ctx;
  return [
    `You are running the ${phase} phase of the blog pipeline for ${ctx.companyName}.`,
    `Topic: ${article.topic}`,
    `Target keyword: ${article.targetKeyword ?? "not specified — use what research/strategy chose"}`,
    `Article folder: articles/${article.folder}/`,
    ``,
    `You are running headless with no tools: you cannot read, write, or run anything.`,
    `Every input your spec tells you to load is inlined in <input> tags (reference material`,
    `in the system prompt, this article's files below). Where your spec says to write a file,`,
    `return it instead. Follow your spec's output format and hard rules exactly.`,
    ``,
    renderInputs(plan.inputs),
    ``,
    `TASK`,
    plan.task,
    ``,
    `OUTPUT FORMAT — respond with only these files, each complete (never a diff), wrapped as:`,
    `<file name="FILENAME">`,
    `…full file content…`,
    `</file>`,
    `Files: ${plan.outputs.join(", ")}. Nothing outside the file tags.`,
    feedback(ctx),
  ].join("\n");
}

/** The model sometimes wraps a file body in a code fence; the file is the inside. */
function unfence(content: string): string {
  const m = /^```[\w-]*\n([\s\S]*?)\n```\s*$/.exec(content.trim());
  return m ? (m[1] as string) : content;
}

export function parseFiles(text: string, allowed: string[]): Map<string, string> {
  const files = new Map<string, string>();
  const re = /<file name="([^"]+)">\n?([\s\S]*?)\n?<\/file>/g;
  for (const m of text.matchAll(re)) {
    const name = m[1] as string;
    if (allowed.includes(name)) files.set(name, unfence(m[2] as string));
  }
  return files;
}

const ensureNewline = (s: string) => (s.endsWith("\n") ? s : `${s}\n`);

/**
 * Put the schema in article.md as the single ```json-ld fence, before the
 * edit-summary comment (or at the end). Replaces any existing fence, so a
 * gate retry never stacks two.
 */
export function embedSchema(md: string, schemaJson: string): string {
  const fence = "```json-ld\n" + schemaJson.trimEnd() + "\n```\n";
  const stripped = md.replace(/\n*```json-ld\n[\s\S]*?\n```\n*/g, "\n\n");
  const at = stripped.indexOf("<!-- EDIT SUMMARY");
  if (at === -1) return ensureNewline(stripped.trimEnd() + "\n\n" + fence);
  return ensureNewline(stripped.slice(0, at).trimEnd() + "\n\n" + fence + "\n" + stripped.slice(at));
}

/** Set top-level frontmatter keys (JSON strings are valid YAML double-quoted scalars). */
export function setFrontmatter(md: string, fields: Record<string, string>): string {
  const m = /^---\n([\s\S]*?)\n---/.exec(md);
  if (!m) return md;
  let block = m[1] as string;
  for (const [key, value] of Object.entries(fields)) {
    const line = `${key}: ${JSON.stringify(value)}`;
    const re = new RegExp(`^${key}:.*$`, "m");
    block = re.test(block) ? block.replace(re, line) : `${block}\n${line}`;
  }
  return `---\n${block}\n---` + md.slice(m[0].length);
}

interface HeaderChoice {
  pattern: string;
  subtitle: string | null;
  heroImageAlt: string;
}

function parseHeaderChoice(raw: string, fallbackAlt: string): HeaderChoice {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Unparseable choice → safe defaults; the generator's auto-pick is the spec's default.
  }
  const pattern = String(parsed["pattern"] ?? "auto");
  const subtitle = typeof parsed["subtitle"] === "string" && parsed["subtitle"].trim() ? parsed["subtitle"].trim() : null;
  const alt = typeof parsed["hero_image_alt"] === "string" ? parsed["hero_image_alt"].trim() : "";
  return {
    pattern: (HEADER_PATTERNS as readonly string[]).includes(pattern) ? pattern : "auto",
    subtitle,
    heroImageAlt: alt || fallbackAlt,
  };
}

/** Runs the header generator (injectable: tests stub the Chromium render). */
export type HeaderRenderer = (cfg: WorkerConfig, folder: string, choice: HeaderChoice) => Promise<void>;

export const renderHeaderCli: HeaderRenderer = async (cfg, folder, choice) => {
  await execFileAsync(
    cfg.headerGenPython,
    [
      "blogheaderimagegen/generate_header.py",
      "--from-article",
      `articles/${folder}/`,
      "--pattern",
      choice.pattern,
      ...(choice.subtitle ? ["--subtitle", choice.subtitle] : []),
    ],
    { cwd: cfg.repoRoot, timeout: 180_000 },
  );
};

export class DirectPhaseRunner {
  constructor(
    private readonly llm: DirectLlm,
    private readonly renderHeader: HeaderRenderer = renderHeaderCli,
  ) {}

  async run(
    phase: DirectPhase,
    specFile: string,
    ctx: PhaseContext,
    onProgress?: (text: string) => void,
  ): Promise<AgentRunOutcome> {
    const { cfg, article } = ctx;
    const model = cfg.models[phase];
    const usage: PhaseUsage = { model, numTurns: 1 };
    const fail = (errorSubtype: string, finalText = ""): AgentRunOutcome => ({
      success: false,
      finalText,
      usage,
      errorSubtype,
    });

    const plan = await planPhase(phase, ctx);
    const spec = await readFile(join(cfg.repoRoot, specFile), "utf-8");
    const system: Anthropic.TextBlockParam[] = plan.reference.length
      ? [
          { type: "text", text: spec },
          {
            type: "text",
            text: `Reference material (identical for every article):\n\n${renderInputs(plan.reference)}`,
            cache_control: { type: "ephemeral" },
          },
        ]
      : [{ type: "text", text: spec, cache_control: { type: "ephemeral" } }];

    onProgress?.(`direct call (${model}, effort ${cfg.direct.effort[phase]})`);
    const res = await this.llm.generate({
      model,
      system,
      prompt: buildUserPrompt(phase, ctx, plan),
      maxTokens: cfg.direct.maxTokens,
      effort: cfg.direct.effort[phase],
    });
    Object.assign(usage, res.usage);
    const cost = estimateCostUsd(model, res.usage);
    if (cost !== undefined) usage.costUsd = cost;

    // A truncated or refused response must never reach disk as a "file".
    if (res.stopReason === "max_tokens") return fail("max_tokens", res.text);
    if (res.stopReason === "refusal") return fail("refusal", res.text);

    const files = parseFiles(res.text, plan.outputs);
    const missing = plan.outputs.filter((f) => !files.has(f));
    if (missing.length) return fail(`missing_output:${missing.join(",")}`, res.text.slice(0, 2000));

    const dir = articleDir(cfg, article);
    if (phase === "schema") {
      const raw = files.get("schema.json") as string;
      // Pretty-print when parseable; otherwise write as-is and let the
      // validator's report drive the gate feedback.
      let json = raw;
      try {
        json = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        /* invalid JSON — validate_schema.py reports it */
      }
      await writeFile(join(dir, "schema.json"), ensureNewline(json), "utf-8");
      const md = await readFile(join(dir, "article.md"), "utf-8");
      await writeFile(join(dir, "article.md"), embedSchema(md, json), "utf-8");
    } else if (phase === "design") {
      const md = await readFile(join(dir, "article.md"), "utf-8");
      const title = /^title:\s*"?(.*?)"?\s*$/m.exec(frontmatterOf(md))?.[1] ?? article.topic;
      const choice = parseHeaderChoice(files.get("header.json") as string, `${title} — ${ctx.companyName}`);
      try {
        await this.renderHeader(cfg, article.folder, choice);
      } catch (err) {
        return fail(`header_render_failed: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`);
      }
      await writeFile(
        join(dir, "article.md"),
        setFrontmatter(md, { hero_image: "header.png", hero_image_alt: choice.heroImageAlt }),
        "utf-8",
      );
    } else {
      for (const [name, content] of files) {
        await writeFile(join(dir, name), ensureNewline(content), "utf-8");
      }
    }
    return { success: true, finalText: `wrote ${plan.outputs.join(", ")}`, usage };
  }
}
