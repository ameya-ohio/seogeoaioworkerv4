import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildInterviewContext,
  parseCaptured,
  type ArticleDoc,
  type InterviewCaptured,
  type InterviewContextInput,
} from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";
import { caseStudies, estimateCostUsd, parseFiles, type DirectLlm } from "./directRunner.js";
import { articleDir } from "./workspace.js";

/**
 * D59: opens the expert interview. One call to the interviewer
 * (agents/interviewer.md) writes the interview plan and the first message —
 * the frame and the angle question — so when the operator opens the chat,
 * the interviewer is already waiting with something concrete to react to.
 * The live turns after that run in the web app on the same context.
 */
export interface InterviewOpening {
  plan: string;
  opening: string;
  captured?: InterviewCaptured;
  model: string;
  costUsd?: number;
}

export interface InterviewOpener {
  open(input: { article: ArticleDoc; companyName: string; onProgress?: (t: string) => void }): Promise<InterviewOpening>;
}

/** The interviewer's context from the article folder and the (Admin-applied) repo copy of context/. */
export async function interviewContextFromDisk(
  cfg: WorkerConfig,
  article: ArticleDoc,
  companyName: string,
  companyDescription?: string,
): Promise<InterviewContextInput> {
  const dir = articleDir(cfg, article);
  const read = async (abs: string) => (existsSync(abs) ? await readFile(abs, "utf-8") : undefined);
  const repo = (rel: string) => read(join(cfg.repoRoot, rel));
  const context: { path: string; content: string }[] = [];
  for (const rel of ["context/brand/positioning.md", "context/sales/value-props.md", "context/sales/icp.md"]) {
    const content = await repo(rel);
    if (content?.trim()) context.push({ path: rel, content });
  }
  const pageMd = await read(join(dir, "page.md"));
  const proofPoints = await repo("context/sales/proof-points.md");
  const competitive = await repo("context/sales/competitive-landscape.md");
  return {
    companyName,
    ...(companyDescription ? { companyDescription } : {}),
    topic: article.topic,
    ...(article.targetKeyword ? { keyword: article.targetKeyword } : {}),
    researchNotes: (await read(join(dir, "research-notes.md"))) ?? article.artifacts.researchNotes ?? "",
    // D61: the interview runs before any outline — an outline left from an
    // earlier run is stale, so the opener builds from research alone.
    ...(pageMd ? { pageMd } : {}),
    ...(article.brief?.spec?.companyPosition ? { companyPosition: article.brief.spec.companyPosition } : {}),
    context,
    caseStudies: (await caseStudies(cfg)).map((f) => ({ path: f.path, content: f.content })),
    ...(proofPoints ? { proofPoints } : {}),
    ...(competitive ? { competitive } : {}),
    ...(article.interview?.captured ? { previous: article.interview.captured } : {}),
  };
}

export class LlmInterviewOpener implements InterviewOpener {
  constructor(
    private readonly llm: DirectLlm,
    private readonly cfg: WorkerConfig,
    private readonly companyDescription?: string,
  ) {}

  async open(input: { article: ArticleDoc; companyName: string; onProgress?: (t: string) => void }): Promise<InterviewOpening> {
    const { openModel: model, effort } = this.cfg.interview;
    const spec = await readFile(join(this.cfg.repoRoot, "agents", "interviewer.md"), "utf-8");
    const context = buildInterviewContext(
      await interviewContextFromDisk(this.cfg, input.article, input.companyName, this.companyDescription),
    );
    const res = await this.llm.generate({
      model,
      system: [
        { type: "text", text: spec },
        { type: "text", text: context, cache_control: { type: "ephemeral" } },
      ],
      prompt: [
        `Open the interview (see "Opening call" in your spec).`,
        `Return exactly these files, each wrapped as <file name="NAME">…</file>, and nothing else:`,
        `- interview-plan.md`,
        `- opening.md (your first message to the expert, ending with the <captured> block)`,
      ].join("\n"),
      maxTokens: 16_000,
      effort,
      // Security topics trip the cyber classifier on Opus-tier models.
      fallbacks: true,
      ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    });
    if (res.stopReason === "refusal") throw new Error("interview opening refused");
    const files = parseFiles(res.text, ["interview-plan.md", "opening.md"]);
    const plan = files.get("interview-plan.md")?.trim();
    const rawOpening = files.get("opening.md");
    if (!plan || !rawOpening) throw new Error("interview opening missing interview-plan.md or opening.md");
    const { text: opening, captured } = parseCaptured(rawOpening);
    if (!opening) throw new Error("interview opening message is empty");
    const served = res.servedModel ?? model;
    const costUsd = estimateCostUsd(served, res.usage);
    return {
      plan,
      opening,
      ...(captured ? { captured } : {}),
      model: served,
      ...(costUsd !== undefined ? { costUsd } : {}),
    };
  }
}
