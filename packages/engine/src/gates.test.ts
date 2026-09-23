import { describe, expect, it } from "vitest";
import { editGate, outlineGate, researchGate, writeGate } from "./gates.js";
import { parseScriptOutput } from "./scriptRunner.js";
import type { CitationCheckResult, CitationReport, LinkReport } from "./citations.js";

/** A passing D34 report: N verified sources, nothing unsupported. */
function okCitations(n = 3): CitationReport {
  const urls = Array.from({ length: n }, (_, i) => `https://authority${i}.com/source-${i}`);
  return {
    ranAt: new Date(),
    results: urls.map((url, i) => ({
      sourceN: i + 1,
      url,
      claim: `claim ${i}`,
      kind: "key_claim" as const,
      verdict: "supported" as const,
    })),
    verifiedSourceCount: n,
    verifiedUrls: urls,
    unsupportedCount: 0,
    unreachableCount: 0,
  };
}

const okLinks = (): LinkReport => ({ ranAt: new Date(), results: [], missingCount: 0 });

function urlList(n: number): string {
  return Array.from({ length: n }, (_, i) => `- https://example${i}.com/source-${i}`).join("\n");
}

const GOOD_RESEARCH = `# Research Notes: test

## Topic Summary
A summary of the topic with enough substance to count as real words here.

## Target Keyword Analysis
Primary candidate: context engineering. Volume is decent, intent informational.

## Top Ranking Pages
${urlList(4)}

## Authoritative Sources
${urlList(6).replace(/example/g, "authority")}

## Key Entities
- Retrieval-augmented generation — https://en.wikipedia.org/wiki/RAG
- HubSpot — https://en.wikipedia.org/wiki/HubSpot

## Statistics & Data Points
- 42% of teams report improved reply rates (Source: https://authority0.com/source-0)

## Quotes Worth Including
- "Context beats cleverness." — someone credible

## Questions People Are Asking
- What is context engineering?

## Debates & Counterpoints
- Fine-tuning vs retrieval.

## Content Gaps (Opportunities)
- Nobody explains chunk-size math for sales corpora in plain language.

## AI Engine Patterns
- Engines cite tables and definitions.
`;

describe("researchGate", () => {
  it("passes complete notes with a clean citation report", () => {
    const g = researchGate({ researchNotes: GOOD_RESEARCH, citationReport: okCitations() });
    expect(g.problems).toEqual([]);
    expect(g.ok).toBe(true);
  });

  it("fails on missing file", () => {
    expect(researchGate({}).ok).toBe(false);
  });

  it("fails when sources are thin", () => {
    const thin = GOOD_RESEARCH.replace(/https?:\/\/\S+/g, "(source)");
    const g = researchGate({ researchNotes: thin, citationReport: okCitations() });
    expect(g.ok).toBe(false);
    expect(g.problems.join(" ")).toMatch(/distinct source URLs/);
  });

  it("hard-fails without a citation report (D34)", () => {
    const g = researchGate({ researchNotes: GOOD_RESEARCH });
    expect(g.ok).toBe(false);
    expect(g.problems.join(" ")).toMatch(/citation verification did not run/);
  });

  it("fails on unsupported claims and names the URL (D34)", () => {
    const report = okCitations(4);
    const bad: CitationCheckResult = {
      sourceN: 9,
      url: "https://quest.example.com/product-page",
      claim: "Over 70% of AD environments contain an exploitable path",
      kind: "statistic",
      verdict: "unsupported",
    };
    report.results.push(bad);
    report.unsupportedCount = 1;
    const g = researchGate({ researchNotes: GOOD_RESEARCH, citationReport: report });
    expect(g.ok).toBe(false);
    expect(g.problems.join(" ")).toContain("quest.example.com");
  });

  it("fails below 3 verified sources — the re-research trigger", () => {
    const g = researchGate({ researchNotes: GOOD_RESEARCH, citationReport: okCitations(2) });
    expect(g.ok).toBe(false);
    expect(g.problems.join(" ")).toMatch(/2 source\(s\) survived live verification; need >= 3/);
  });
});

const GOOD_OUTLINE = `# Strategy & Outline: Test Article

## Angle
> Unlike listicles, this article gives the 4-layer architecture with real numbers.

**Why this angle:** the SERP is shallow.

## Thesis
Context failures, not model failures, explain most AI SDR underperformance — and fixing the context layer beats upgrading the model.

## Keywords
- Primary: context engineering for ai sdr
- Secondary: [ai sdr architecture]

## Search Intent
informational — readers are evaluating architectures

## Target Word Count
1800 — SERP median is 1500, gaps justify more depth

## GEO/AIO Angle
- Definition block up top
- Stat table

## Target Entities (for \`mentions\` array)
- Retrieval-augmented generation — https://en.wikipedia.org/wiki/RAG

## FAQ Candidates
1. What is context engineering?
2. How many layers does an AI SDR knowledge base need?
3. Should I use Markdown or PDFs?
4. What stays out of vector memory?

## Internal Link Opportunities
- /blog/how-to-build-ai-sdr — in the intro

## External Citations to Use
1. Citation #1 — used in section "Layers"

## Quotable Sound Bites
- Context beats cleverness.

## Hook Strategy
Contrarian stat — most AI SDR failures are context failures.

## Closing / CTA
Book a demo.

## Full Outline

### Intro (≈ 150 words)
Hook + thesis.

### Key Takeaways (4–6 bullets)
The bullets.

### H2: The Four Layers (≈ 300 words)
- What the section covers
- Citations: [1]

### H2: The Six Artifacts (≈ 300 words)
- Covers artifacts

### H2: Markdown Over PDFs (≈ 250 words)
- Format guidance

### H2: Chunk-Size Math (≈ 250 words)
- The numbers

### H2: Frequently Asked Questions
- Q1: What is context engineering?

### Closing (≈ 100 words)
CTA shape.
`;

describe("outlineGate", () => {
  it("passes a complete outline", () => {
    const g = outlineGate({ outline: GOOD_OUTLINE });
    expect(g.problems).toEqual([]);
  });

  it("fails without a primary keyword", () => {
    const g = outlineGate({ outline: GOOD_OUTLINE.replace("- Primary: context engineering for ai sdr", "- Primary: []") });
    expect(g.problems.join(" ")).toMatch(/primary keyword/i);
  });

  it("fails with too few FAQ candidates", () => {
    const g = outlineGate({
      outline: GOOD_OUTLINE.replace(/^2\. .*\n3\. .*\n4\. .*\n/m, ""),
    });
    expect(g.problems.join(" ")).toMatch(/FAQ Candidates has 1/);
  });

  it("fails with too few H2 sections", () => {
    const g = outlineGate({
      outline: GOOD_OUTLINE.replace("### H2: Chunk-Size Math (≈ 250 words)\n- The numbers\n\n", "").replace(
        "### H2: Markdown Over PDFs (≈ 250 words)\n- Format guidance\n\n",
        "",
      ),
    });
    expect(g.problems.join(" ")).toMatch(/H2 section/);
  });

  it("fails without a thesis (D33)", () => {
    const g = outlineGate({
      outline: GOOD_OUTLINE.replace(/## Thesis\n[^\n]+\n/, ""),
    });
    expect(g.ok).toBe(false);
    expect(g.problems.join(" ")).toMatch(/thesis/i);
  });
});

const GOOD_ARTICLE = `---
title: "Context Engineering Basics for Modern AI Sales Teams"
slug: "context-engineering-basics"
author: "Ameya Deshmukh"
publish_date: "2026-09-14"
meta_description: "${"m".repeat(150)}"
primary_keyword: "context engineering"
canonical_url: "https://www.saporo.io/resources/blog/context-engineering-basics"
---

# Context Engineering Basics for AI Sales Teams

Context engineering decides what an AI sales agent knows before it writes a word. This guide covers the layers, the artifacts, and the rollout order.

## Key Takeaways

- Layers beat lumps.
- Markdown beats PDFs.

## The Four Layers

Body text.

## The Six Artifacts

Body text.

## Rollout Order

Body text.

## Frequently Asked Questions

### What is context engineering?

Answer.

### How many layers do I need?

Four.
`;

describe("writeGate", () => {
  it("passes a complete draft", () => {
    const g = writeGate({ article: GOOD_ARTICLE });
    expect(g.problems).toEqual([]);
  });

  it("fails on missing frontmatter and sections", () => {
    const broken = GOOD_ARTICLE.replace('primary_keyword: "context engineering"', 'primary_keyword: ""').replace("## Key Takeaways", "## Takeaways");
    const g = writeGate({ article: broken });
    expect(g.problems.join(" ")).toMatch(/primary_keyword/);
    expect(g.problems.join(" ")).toMatch(/Key Takeaways/);
  });
});

describe("parseScriptOutput + editGate", () => {
  it("parses PASS/WARN/FAIL lines and promotes title/meta warns", () => {
    const stdout = [
      "PASS  article.md present",
      "WARN  Title length: 44 chars (target 50–60)",
      "FAIL  Banned phrase found (1×): 'seamless'",
      "FAIL  json-ld fenced block missing from article.md",
      "",
      "RESULT: 1 pass / 1 warn / 2 fail",
    ].join("\n");
    const report = parseScriptOutput(stdout, 1);
    expect(report.passes).toBe(1);
    expect(report.warnings).toBe(1);
    expect(report.failures).toBe(2);

    const g = editGate({ report, citationReport: okCitations(), linkReport: okLinks() });
    // json-ld failure is Phase 5's problem, not the Editor's.
    expect(g.problems).toHaveLength(2);
    expect(g.problems.join(" ")).toMatch(/Banned phrase/);
    expect(g.problems.join(" ")).toMatch(/Title length/);
  });

  it("passes a clean report", () => {
    const report = parseScriptOutput("PASS  ok\n\nRESULT: 1 pass / 0 warn / 0 fail", 0);
    expect(editGate({ report, citationReport: okCitations(), linkReport: okLinks() }).ok).toBe(true);
  });

  it("hard-fails without citation/link reports and on their failures (D34/D35)", () => {
    const report = parseScriptOutput("PASS  ok\n\nRESULT: 1 pass / 0 warn / 0 fail", 0);
    const bare = editGate({ report });
    expect(bare.ok).toBe(false);
    expect(bare.problems.join(" ")).toMatch(/body citation check did not run/);
    expect(bare.problems.join(" ")).toMatch(/internal link check did not run/);

    const badCitations = okCitations(3);
    badCitations.results.push({
      sourceN: 0,
      url: "https://unverified.example.com/page",
      claim: "body cites a URL that never passed research verification",
      kind: "statistic",
      verdict: "unsupported",
    });
    const badLinks: LinkReport = {
      ranAt: new Date(),
      results: [{ url: "https://www.saporo.io/resources/blog/not-published-yet", status: "missing" }],
      missingCount: 1,
    };
    const g = editGate({ report, citationReport: badCitations, linkReport: badLinks });
    expect(g.ok).toBe(false);
    expect(g.problems.join(" ")).toContain("unverified.example.com");
    expect(g.problems.join(" ")).toContain("not-published-yet");
    expect(g.problems.join(" ")).toMatch(/plain-text mention/);
  });
});
