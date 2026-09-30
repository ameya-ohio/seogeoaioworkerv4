import { describe, expect, it } from "vitest";
import { editGate, interviewGate, outlineGate, researchGate, writeGate } from "./gates.js";
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

## Subject Material
### Mechanism
${"The retrieval layer returns chunks ranked by embedding similarity; the prompt window caps how many fit, so chunk size sets recall. ".repeat(8)}

## Candidate Positions
### P1: Context failures, not model failures, explain most AI SDR underperformance
- Supported by: Mechanism; Source #1
- Strongest objection: newer models tolerate noisy context — the evidence says recall still caps quality
- The article would argue: fix the context layer before upgrading the model
### P2: Chunk size is the most under-tuned setting in sales corpora
- Supported by: Mechanism
- Strongest objection: defaults are fine — they are tuned for prose, not call notes
- The article would argue: tune chunking to the document type

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
- "Context beats cleverness." — someone credible, Source #2 (supports: P1)

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

  it("requires Subject Material and 2+ Candidate Positions (D60)", () => {
    const noMaterial = GOOD_RESEARCH.replace(/## Subject Material[\s\S]*?(?=## Candidate Positions)/, "## Subject Material\nthin\n\n");
    expect(researchGate({ researchNotes: noMaterial, citationReport: okCitations() }).problems.join(" ")).toMatch(/Subject Material has/);
    const onePosition = GOOD_RESEARCH.replace(/### P2:[\s\S]*?(?=## Target Keyword)/, "");
    expect(researchGate({ researchNotes: onePosition, citationReport: okCitations() }).problems.join(" ")).toMatch(/Candidate Positions lists 1/);
  });

  it("requires every banked figure to name the position it supports (D60)", () => {
    const untagged = GOOD_RESEARCH.replace("Source #2 (supports: P1)", "Source #2");
    expect(researchGate({ researchNotes: untagged, citationReport: okCitations() }).problems.join(" ")).toMatch(/not tagged with the position/);
    const unknown = GOOD_RESEARCH.replace("(supports: P1)", "(supports: P7)");
    expect(researchGate({ researchNotes: unknown, citationReport: okCitations() }).problems.join(" ")).toMatch(/P7, which is not a Candidate Position/);
  });

  it("accepts an explicit 'None needed' in place of statistics (D60)", () => {
    const none = GOOD_RESEARCH.replace(/## Statistics & Data Points\n[^\n]+\n/, "## Statistics & Data Points\nNone needed: a procedure.\n");
    expect(researchGate({ researchNotes: none, citationReport: okCitations() }).problems).toEqual([]);
  });

  it("fails when the competitor check found a head-to-head vendor as a source", () => {
    const competitorReport = parseScriptOutput(
      "FAIL  Research: head-to-head competitor XM Cyber used as a source — remove the entry: …Alex Gardner (XM Cyber), The Hacker News…\n",
      1,
    );
    const g = researchGate({ researchNotes: GOOD_RESEARCH, citationReport: okCitations(), competitorReport });
    expect(g.ok).toBe(false);
    expect(g.problems.join(" ")).toMatch(/XM Cyber used as a source/);
    const clean = parseScriptOutput("PASS  Research: no head-to-head vendor used as a source (8 checked).\n", 0);
    expect(researchGate({ researchNotes: GOOD_RESEARCH, citationReport: okCitations(), competitorReport: clean }).ok).toBe(true);
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

## Argument Spine
1. Retrieval recall caps answer quality — proof: mechanism
2. Recall is set by chunking and format, not the model — proof: reasoning
3. So the context layer is the cheaper fix — proof: evidence: Source #1

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
1. Citation #1 — supports spine #3, in section "Chunk-Size Math"

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
- Advances: spine #1
- Claim: answer quality is capped by what retrieval returns
- Citations: [1]

### H2: The Six Artifacts (≈ 300 words)
- Advances: format — the reference list the format carries
- Claim: six artifacts make up the context layer

### H2: Markdown Over PDFs (≈ 250 words)
- Advances: spine #2
- Claim: format changes recall more than model choice

### H2: Chunk-Size Math (≈ 250 words)
- Advances: spine #3
- Claim: tuning chunk size is the cheapest quality gain

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
      outline: GOOD_OUTLINE.replace(/### H2: Markdown Over PDFs[\s\S]*?(?=### H2: Frequently)/, ""),
    });
    expect(g.problems.join(" ")).toMatch(/H2 section/);
  });

  it("requires an Argument Spine whose claims every section advances (D60)", () => {
    const noSpine = GOOD_OUTLINE.replace(/## Argument Spine[\s\S]*?(?=## Keywords)/, "");
    expect(outlineGate({ outline: noSpine }).problems.join(" ")).toMatch(/Missing required section: ## Argument Spine/);
    const noAdvances = GOOD_OUTLINE.replace("- Advances: spine #2\n", "");
    const p1 = outlineGate({ outline: noAdvances }).problems.join(" ");
    expect(p1).toMatch(/"Markdown Over PDFs" has no "- Advances:"/);
    expect(p1).toMatch(/claim #2 is not advanced/);
    const allFormat = GOOD_OUTLINE.replace(/Advances: spine #\d/g, "Advances: format — filler");
    expect(outlineGate({ outline: allFormat }).problems.join(" ")).toMatch(/only 0 of 4 body H2s advance a spine claim/);
    const badRef = GOOD_OUTLINE.replace("Advances: spine #3", "Advances: spine #9");
    expect(outlineGate({ outline: badRef }).problems.join(" ")).toMatch(/spine #9, which is not in the Argument Spine/);
  });

  it("requires each planned citation to name the spine claim it supports (D60)", () => {
    const g = outlineGate({ outline: GOOD_OUTLINE.replace("supports spine #3, in section", "used in section") });
    expect(g.problems.join(" ")).toMatch(/must name the spine claim it supports/);
  });

  it("requires an Action on procedure steps and Specifics on examples (D60)", () => {
    const page = (researchMode: string, slug: string) =>
      ({ format: { researchMode, slug }, routing: false }) as unknown as import("./pageRules.js").PageRules;
    const steps = GOOD_OUTLINE.replace("### H2: The Four Layers", "### H2: Step 1: Map the Four Layers");
    expect(outlineGate({ outline: steps, page: page("procedure", "how-to-guide") }).problems.join(" ")).toMatch(
      /Step "Step 1: Map the Four Layers" has no "- Action:"/,
    );
    const withAction = steps.replace("- Claim: answer quality", "- Action: `kubectl get pods`\n- Claim: answer quality");
    expect(outlineGate({ outline: withAction, page: page("procedure", "how-to-guide") }).problems).toEqual([]);
    expect(outlineGate({ outline: GOOD_OUTLINE, page: page("catalog", "examples") }).problems.join(" ")).toMatch(
      /0 example section\(s\) carry "- Specifics:"/,
    );
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
    expect(g.problems.join(" ")).toMatch(/link inventory/);
  });
});

const GOOD_POV = `# Expert POV: Test Article

## Thesis
Attack path analysis fails when its graph counts only human accounts, because the paths that reach a domain controller now cross service accounts.

## Argument Spine
1. The graph decides what the analysis can see — expert reasoning
2. Machine identities are now an entry point of comparable size — research #3
3. The dangerous paths cross between human and machine identities — anchor

## Objection & Answer
Objection: machine identities are too many to model. Answer: you only model the ones with a path to tier zero.

## Real-World Anchor
context/case-studies/hospital-and-healthcare.md — the service account that reached the EHR admin group. Boundary: anonymized.

## Company Role
In "The dangerous paths cross", as the worked mechanism. No proof point.

## Approved Quotes
none

## Rejected
- Starting path analysis from machine identities only.
`;

describe("interviewGate", () => {
  it("passes a skipped interview without looking at anything", () => {
    expect(interviewGate({ interviewSkipped: true }).ok).toBe(true);
  });

  it("passes a revised outline that still passes the outline gate, plus a complete pov.md", () => {
    const g = interviewGate({ outline: GOOD_OUTLINE, pov: GOOD_POV });
    expect(g.problems).toEqual([]);
  });

  it("fails a missing pov.md and a broken revised outline", () => {
    const g = interviewGate({ outline: GOOD_OUTLINE.replace(/^## Thesis[\s\S]*?(?=^## )/m, ""), pov: "" });
    expect(g.ok).toBe(false);
    expect(g.problems.some((p) => p.startsWith("revised outline: No thesis"))).toBe(true);
    expect(g.problems).toContain("pov.md missing or still a stub");
  });

  it("names each missing pov section and a spine outside 3-5 claims", () => {
    const pov = GOOD_POV.replace(/## Rejected[\s\S]*$/, "").replace(/^3\. .*$/m, "");
    const g = interviewGate({ outline: GOOD_OUTLINE, pov });
    expect(g.problems).toContain("pov.md is missing ## Rejected (or it is empty)");
    expect(g.problems).toContain("pov.md Argument Spine has 2 numbered claim(s); need 3-5");
  });
});
