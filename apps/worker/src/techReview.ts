import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TechnicalIssue, TechnicalIssueKind, TechnicalReview } from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";
import { caseStudies, competitiveLandscape, estimateCostUsd, parseFiles, renderInputs, type DirectLlm } from "./directRunner.js";

/**
 * Expert read of the article (agents/technical-reviewer.md). Since D61 it
 * reads the FINAL text, in the verify stage after the Editor, so nothing a
 * later rewrite introduces escapes it.
 *
 * It still isn't a per-attempt gate: an LLM judge re-run on every retry can
 * find new nits each time. The verify stage bounds it instead — one fresh
 * review, a fix pass, then a `confirm` round that only re-checks the listed
 * issues (plus new technical errors) — and stores each round against the
 * text's hash, so a restart reuses it. A refusal, error or unparseable reply
 * records `skipped`.
 */
export interface TechReviewer {
  review(input: {
    articleMd: string;
    researchNotes: string;
    /** D60: the page spec and outline, so substance findings know the format and the thesis. */
    pageMd?: string;
    outline?: string;
    /** D61: the Expert POV brief and transcript — expert claims are checked against them. */
    pov?: string;
    interview?: string;
    /**
     * D61 verify loop. `review` reads the text fresh; `confirm` is handed the
     * previous round's issues and reports which remain, plus only new
     * technical errors or a thesis that isn't first — never fresh nits, so a
     * re-review can't keep a clean article looping.
     */
    mode?: "review" | "confirm";
    previous?: TechnicalIssue[];
    onProgress?: (t: string) => void;
  }): Promise<TechnicalReview>;
}

const KINDS: readonly TechnicalIssueKind[] = [
  "technical_error",
  "contradiction",
  "outdated",
  "unsupported_number",
  "not_actionable",
  "generic_example",
  "thesis_unsupported",
  "thesis_not_first",
];
const MAX_ISSUES = 12;

/** Whitespace- and emphasis-insensitive form, for matching quotes back to the draft. */
function normalize(s: string): string {
  return s
    .replace(/[*_`]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Keep only well-formed issues whose quote really occurs in the draft — the
 * cheap, deterministic guard against a reviewer inventing problems.
 */
export function validateIssues(raw: unknown, articleMd: string): { issues: TechnicalIssue[]; dropped: number } {
  const hay = normalize(articleMd);
  const list = Array.isArray(raw) ? raw : [];
  const issues: TechnicalIssue[] = [];
  let dropped = 0;
  for (const item of list) {
    const o = (item ?? {}) as Record<string, unknown>;
    const kind = o["kind"] as TechnicalIssueKind;
    const quote = typeof o["quote"] === "string" ? o["quote"].trim() : "";
    const problem = typeof o["problem"] === "string" ? o["problem"].trim() : "";
    const fix = typeof o["fix"] === "string" ? o["fix"].trim() : "";
    if (!KINDS.includes(kind) || !quote || !problem || !fix || !hay.includes(normalize(quote))) {
      dropped += 1;
      continue;
    }
    if (issues.length < MAX_ISSUES) issues.push({ kind, quote, problem, fix });
  }
  return { issues, dropped };
}

/** One pre-audit line per issue, in the same shape as gate problems. */
export function formatIssue(i: TechnicalIssue): string {
  return `technical review (${i.kind}): "${i.quote}" — ${i.problem} Fix: ${i.fix}`;
}

export class LlmTechReviewer implements TechReviewer {
  constructor(
    private readonly llm: DirectLlm,
    private readonly cfg: WorkerConfig,
  ) {}

  async review(input: {
    articleMd: string;
    researchNotes: string;
    pageMd?: string;
    outline?: string;
    pov?: string;
    interview?: string;
    mode?: "review" | "confirm";
    previous?: TechnicalIssue[];
    onProgress?: (t: string) => void;
  }): Promise<TechnicalReview> {
    const { model, effort } = this.cfg.techReview;
    const base = { ranAt: new Date(), model, issues: [] as TechnicalIssue[], droppedUnquoted: 0 };
    try {
      const spec = await readFile(join(this.cfg.repoRoot, "agents", "technical-reviewer.md"), "utf-8");
      const res = await this.llm.generate({
        model,
        effort,
        maxTokens: this.cfg.direct.maxTokens,
        fallbacks: true,
        system: [{ type: "text", text: spec, cache_control: { type: "ephemeral" } }],
        prompt: [
          renderInputs([
            { path: "article.md", content: input.articleMd },
            { path: "research-notes.md", content: input.researchNotes },
            ...(input.pageMd ? [{ path: "page.md", content: input.pageMd }] : []),
            ...(input.outline ? [{ path: "outline.md", content: input.outline }] : []),
            ...(input.pov ? [{ path: "pov.md", content: input.pov }] : []),
            ...(input.interview ? [{ path: "interview.md", content: input.interview }] : []),
            // Case-study facts are sourced (the company's own engagements), not unsupported numbers.
            ...(await caseStudies(this.cfg)),
            // Vendor map: catches wrong or stale claims about competing/complementary products.
            ...(await competitiveLandscape(this.cfg)),
          ]),
          ``,
          ...(input.mode === "confirm" && input.previous?.length
            ? [
                `CONFIRM MODE (see your spec). The previous round found the issues below and a fix pass ran. For each`,
                `one still present, return it again, quoting the CURRENT text. Add a new issue only if it is a`,
                `technical_error or thesis_not_first. Return an empty list when all are resolved.`,
                ...input.previous.map((i) => `- ${i.kind}: "${i.quote}" — ${i.problem}`),
                ``,
              ]
            : []),
          `Review the ${input.mode === "confirm" ? "fixed article" : "article"} per your spec and return review.json.`,
        ].join("\n"),
        ...(input.onProgress ? { onProgress: input.onProgress } : {}),
      });
      const cost = estimateCostUsd(res.servedModel ?? model, res.usage);
      const withCost = { ...base, model: res.servedModel ?? model, ...(cost !== undefined ? { costUsd: cost } : {}) };
      if (res.stopReason === "refusal" || res.stopReason === "max_tokens") {
        return { ...withCost, skipped: `stop_reason ${res.stopReason}` };
      }
      const file = parseFiles(res.text, ["review.json"]).get("review.json");
      if (file === undefined) return { ...withCost, skipped: "no review.json in the response" };
      let parsed: unknown;
      try {
        parsed = JSON.parse(file);
      } catch {
        return { ...withCost, skipped: "review.json is not valid JSON" };
      }
      const { issues, dropped } = validateIssues(parsed, input.articleMd);
      return { ...withCost, issues, droppedUnquoted: dropped };
    } catch (err) {
      return { ...base, skipped: `error: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}` };
    }
  }
}
