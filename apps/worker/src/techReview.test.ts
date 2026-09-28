import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkerConfig } from "./config.js";
import type { DirectLlm, DirectLlmRequest, DirectLlmResponse } from "./directRunner.js";
import { LlmTechReviewer, formatIssue, validateIssues } from "./techReview.js";

const REAL_REPO = join(import.meta.dirname, "..", "..", "..");

const DRAFT = `---
title: "Kerberoasting Detection"
publish_date: "2026-09-25"
---

# Kerberoasting Detection

A detection built on single events will miss **Rubeus, Impacket, and Hashcat** equally.

| Phase | Date | RC4 |
|---|---|---|
| 3 | July 2026 | removed entirely |

RC4 support isn't removed outright in July.
`;

const usage = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheCreationTokens: 0 };

class FakeLlm implements DirectLlm {
  last?: DirectLlmRequest;
  constructor(private readonly reply: Partial<DirectLlmResponse> | Error) {}
  async generate(req: DirectLlmRequest): Promise<DirectLlmResponse> {
    this.last = req;
    if (this.reply instanceof Error) throw this.reply;
    return { text: "", stopReason: "end_turn", usage, ...this.reply };
  }
}

const cfg = {
  repoRoot: REAL_REPO,
  direct: { maxTokens: 64_000 },
  techReview: { enabled: true, model: "claude-opus-5-5", effort: "high" },
} as unknown as WorkerConfig;

const HASHCAT = {
  kind: "technical_error",
  quote: "will miss Rubeus, Impacket, and Hashcat equally",
  problem: "Hashcat is an offline cracker; it never requests tickets, so it produces no ticket-request telemetry.",
  fix: "Name only the ticket-requesting tools (Rubeus, Impacket) and describe Hashcat as the offline step.",
};

describe("validateIssues", () => {
  it("keeps issues whose quote is in the draft, ignoring emphasis and whitespace", () => {
    const { issues, dropped } = validateIssues(
      [
        HASHCAT,
        { ...HASHCAT, quote: "a sentence the draft never contains" },
        { kind: "style", quote: "RC4 support", problem: "p", fix: "f" },
        { kind: "contradiction", quote: "RC4 support isn't removed outright", problem: "p" },
      ],
      DRAFT,
    );
    expect(issues).toEqual([HASHCAT]);
    expect(dropped).toBe(3);
  });

  it("caps the list and tolerates a non-array reply", () => {
    expect(validateIssues(Array.from({ length: 20 }, () => HASHCAT), DRAFT).issues).toHaveLength(12);
    expect(validateIssues({ not: "a list" }, DRAFT)).toEqual({ issues: [], dropped: 0 });
  });

  it("formats an issue as a pre-audit line", () => {
    expect(formatIssue(HASHCAT as never)).toMatch(/^technical review \(technical_error\): "will miss/);
  });
});

describe("LlmTechReviewer", () => {
  it("calls the configured model with server-side fallbacks and parses review.json", async () => {
    const llm = new FakeLlm({
      text: `<file name="review.json">\n${JSON.stringify([HASHCAT])}\n</file>`,
      servedModel: "claude-opus-5-5",
    });
    const review = await new LlmTechReviewer(llm, cfg).review({ articleMd: DRAFT, researchNotes: "# notes" });
    expect(llm.last?.model).toBe("claude-opus-5-5");
    expect(llm.last?.fallbacks).toBe(true);
    expect(llm.last?.system[0]?.text).toContain("Technical Reviewer");
    expect(llm.last?.prompt).toContain('<input path="article.md">');
    expect(review.skipped).toBeUndefined();
    expect(review.issues).toEqual([HASHCAT]);
    expect(review.costUsd).toBeCloseTo(0.008, 6); // 1000 × $4 + 200 × $20, per million
  });

  it("records the fallback model that actually answered", async () => {
    const llm = new FakeLlm({ text: `<file name="review.json">[]</file>`, servedModel: "claude-opus-4-8" });
    const review = await new LlmTechReviewer(llm, cfg).review({ articleMd: DRAFT, researchNotes: "" });
    expect(review.model).toBe("claude-opus-4-8");
    expect(review.issues).toEqual([]);
  });

  it("never throws: refusal, bad JSON and API errors come back as skipped", async () => {
    const run = (reply: Partial<DirectLlmResponse> | Error) =>
      new LlmTechReviewer(new FakeLlm(reply), cfg).review({ articleMd: DRAFT, researchNotes: "" });
    expect((await run({ stopReason: "refusal" })).skipped).toBe("stop_reason refusal");
    expect((await run({ text: `<file name="review.json">{ nope</file>` })).skipped).toMatch(/not valid JSON/);
    expect((await run({ text: "no file here" })).skipped).toMatch(/no review.json/);
    expect((await run(new Error("529 overloaded"))).skipped).toMatch(/529 overloaded/);
  });
});
