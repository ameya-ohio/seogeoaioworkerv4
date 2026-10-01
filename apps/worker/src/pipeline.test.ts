import { mkdtempSync, symlinkSync, writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  LocalStorage,
  appendExpertMessage,
  claimRun,
  closeInterview,
  connect,
  framerExportProblems,
  createArticle,
  enqueueRun,
  eventsAfter,
  saveRepoFile,
  type EngineDb,
} from "@blogagent/engine";
import type { ObjectId } from "mongodb";
import type { CitationReport } from "@blogagent/engine";
import type { AgentInvocation, AgentInvoker, AgentRunOutcome } from "./agentRunner.js";
import type { WorkerConfig } from "./config.js";
import {
  DirectPhaseRunner,
  type DirectLlm,
  type DirectLlmRequest,
  type DirectLlmResponse,
  type HeaderRenderer,
} from "./directRunner.js";
import { flagUnresolved, hashText, runPipeline, type PipelineDeps } from "./pipeline.js";
import { loadBannedPhrases, verifyIssuesBlock, type PhaseContext } from "./phases.js";

const flagUnresolvedForTest = (md: string) =>
  flagUnresolved(md, [
    { kind: "technical_error", quote: "Body text about layers.", problem: "Vague.", fix: "Name them." },
    { kind: "contradiction", quote: "not in the text", problem: "Elsewhere.", fix: "Fix." },
  ]);
import type { TechReviewer } from "./techReview.js";
import type { InterviewOpener } from "./interviewOpener.js";
import type { CitationVerifier, LinkChecker } from "./quality.js";

const REAL_REPO = join(import.meta.dirname, "..", "..", "..");

let mongod: MongoMemoryServer;
let db: EngineDb;
let repoRoot: string;
let cfg: WorkerConfig;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  db = await connect(mongod.getUri(), "pipeline_test");

  // Temp repo: symlink the real engine dirs, real articles/ stays untouched.
  repoRoot = mkdtempSync(join(tmpdir(), "blogagent-pipeline-"));
  for (const dir of ["scripts", "standards", "templates", "agents", "config"]) {
    symlinkSync(join(REAL_REPO, dir), join(repoRoot, dir));
  }
  writeFileSync(join(repoRoot, "CLAUDE.md"), "# test repo\n");
  mkdirSync(join(repoRoot, "articles"));

  cfg = {
    repoRoot,
    mongoUri: mongod.getUri(),
    mongoDb: "pipeline_test",
    workerId: "test-worker",
    concurrency: 1,
    pollIntervalMs: 50,
    leaseMs: 60_000,
    heartbeatMs: 60_000,
    maxRunAttempts: 2,
    maxGateAttempts: 2,
    models: {
      research: "m",
      outline: "m",
      interview: "m",
      evidence: "m",
      verify: "m",
      write: "m",
      edit: "m",
      hdcp: "m",
      schema: "m",
      design: "m",
    },
    maxTurns: { research: 1, outline: 1, interview: 1, evidence: 1, verify: 1, write: 1, edit: 1, hdcp: 1, schema: 1, design: 1 },
    direct: {
      routes: { outline: "agent", interview: "agent", verify: "agent", write: "agent", edit: "agent", hdcp: "agent", schema: "agent", design: "agent" },
      effort: { outline: "high", interview: "high", verify: "high", write: "high", edit: "high", hdcp: "high", schema: "high", design: "high" },
      maxTokens: 64_000,
    },
    interview: { openModel: "fake-interviewer", effort: "high" },
    techReview: { enabled: false, model: "fake-reviewer", effort: "high" },
    verifierModel: "fake-verifier",
    plan: { enrichModel: "fake-enrich", concurrency: 2, maxAttempts: 2 },
    schedule: { enabled: false, pollIntervalMs: 60000, dryRun: false },
    cluster: {
      mainModel: "m",
      fanoutModel: "f",
      k: 5,
      maxValidations: 5,
      serpChecksPerTheme: 1,
      maxAttempts: 2,
    },
    scrape: { maxAttempts: 2, timeoutMs: 60_000 },
    pythonBin: "python3",
    headerGenPython: "python3",
    scraperPython: "python3",
  };
}, 180_000);

afterAll(async () => {
  await db?.close();
  await mongod?.stop();
});

const urlList = (n: number, host: string) =>
  Array.from({ length: n }, (_, i) => `- https://${host}${i}.com/source-${i}`).join("\n");

const RESEARCH = `# Research Notes: test

## Topic Summary
Enough substantial words to look like a real researched summary of the topic.

## Subject Material
### Mechanism
${"Retrieval returns chunks ranked by similarity; the window caps how many fit, so chunk size sets recall. ".repeat(10)}

## Candidate Positions
### P1: Context failures, not model quality, explain most AI SDR underperformance
- Supported by: Mechanism
- Strongest objection: newer models tolerate noise — recall still caps quality
- The article would argue: fix context before the model
### P2: Chunk size is the most under-tuned setting
- Supported by: Mechanism
- Strongest objection: defaults work — not for call notes
- The article would argue: tune chunking per document type

## Target Keyword Analysis
Primary candidate: context engineering. Informational intent.

## Top Ranking Pages
${urlList(5, "serp")}

## Authoritative Sources
${urlList(5, "authority")}

## Key Entities
- Retrieval-augmented generation — https://en.wikipedia.org/wiki/Retrieval-augmented_generation

## Statistics & Data Points
- 42% of teams report improved reply rates (Source: https://authority0.com/source-0)

## Quotes Worth Including
- "Context beats cleverness."

## Questions People Are Asking
- What is context engineering?

## Debates & Counterpoints
- Fine-tuning vs retrieval.

## Content Gaps (Opportunities)
- Nobody explains chunk-size math for sales corpora in plain language with worked examples.

## AI Engine Patterns
- Engines cite tables and definitions.
`;

const OUTLINE = `# Strategy & Outline: Test Article

## Angle
> Unlike listicles, this piece gives the 4-layer architecture with real numbers.

## Thesis
Context failures, not model quality, explain most AI SDR underperformance, so fixing the context layer beats upgrading the model.

## Argument Spine
1. Retrieval recall caps answer quality — proof: mechanism
2. Recall is set by chunking and format — proof: reasoning
3. So the context layer is the cheaper fix — proof: reasoning

## Keywords
- Primary: context engineering
- Secondary: [ai sdr architecture]

## Search Intent
informational — evaluating architectures

## Target Word Count
1800 — SERP median is 1500

## GEO/AIO Angle
- Definition block up top

## Target Entities (for \`mentions\` array)
- Retrieval-augmented generation — https://en.wikipedia.org/wiki/Retrieval-augmented_generation

## FAQ Candidates
1. What is context engineering?
2. How many layers do I need?
3. Should I use Markdown or PDFs?

## Internal Link Opportunities
- /blog/example — intro

## External Citations to Use
1. Citation #1 — supports spine #1, in section "Layers"

## Quotable Sound Bites
- Context beats cleverness.

## Page Facets
- Page role: cluster
- Article type: Deep-dive
- Search intent: informational
- Funnel: MOFU

## Hook Strategy
Contrarian stat.

## Closing / CTA
Book a demo.

## Full Outline

### Intro (≈ 150 words)
Hook.

### Key Takeaways (4–6 bullets)
Bullets.

### H2: The Four Layers (≈ 300 words)
- Advances: spine #1
- Claim: retrieval caps quality

### H2: The Six Artifacts (≈ 300 words)
- Advances: format — the reference list
- Claim: six artifacts make up the context layer

### H2: Markdown Over PDFs (≈ 250 words)
- Advances: spine #2
- Claim: format changes recall

### H2: Chunk-Size Math (≈ 250 words)
- Advances: spine #3
- Claim: chunk tuning is the cheapest fix

### H2: Frequently Asked Questions
- Q1

### Closing (≈ 100 words)
CTA.
`;

const ARTICLE = `---
title: "Context Engineering Basics for Modern AI Sales Teams"
slug: "pipeline-e2e"
author: "Ameya Deshmukh"
publish_date: "2026-09-14"
modified_date: "2026-09-14"
meta_description: "${"m".repeat(150)}"
primary_keyword: "context engineering"
secondary_keywords: ["ai sdr architecture"]
canonical_url: "https://www.example.com/blog/pipeline-e2e"
---

# Context Engineering Basics for AI Sales Teams

Context engineering decides what an AI sales agent knows before it writes a word. This guide covers the layers, the artifacts, and the rollout order for a working setup.

## Key Takeaways

- Layers beat lumps.
- Markdown beats PDFs.
- Versioned context beats ad hoc prompts.

## The Four Layers

Body text about layers.

## The Six Artifacts

Body text about artifacts.

## Chunk-Size Math

Numbers and reasoning.

## Frequently Asked Questions

### What is context engineering?

The practice of deciding what a model sees.

### How many layers do I need?

Four layers cover most teams.

### Should I use Markdown or PDFs?

Markdown, because models parse its structure directly.
`;

const HDCP_LOG = `# HDCP log — pipeline-e2e — 2026-09-14

## Diagnosis
The layer count is stated in the intro and again in the body, and the case study sits at the end.

## Changes made
- Kept the layer count once, in the Layers section — repeated statistic
- Ended the Layers section on the point instead of an aphorism — punchy closer

## Cuts
- Second copy of the layer count — duplicate

## Flags
- none

## Editor notes
Cut the repeated layer count.
`;

const SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "@id": "https://example.com/blog/pipeline-e2e#post",
      headline: "Context Engineering Basics for Modern AI Sales Teams",
      author: { "@id": "https://example.com/#person" },
      datePublished: "2026-09-14",
      image: { "@id": "https://example.com/blog/pipeline-e2e#image" },
      publisher: { "@id": "https://example.com/#org" },
      mainEntityOfPage: { "@id": "https://example.com/blog/pipeline-e2e#page" },
      description: "desc",
      wordCount: 300,
      keywords: ["context engineering"],
    },
    { "@type": "Person", "@id": "https://example.com/#person", name: "Ameya Deshmukh", sameAs: ["https://www.linkedin.com/in/ameyadeshmukh/"] },
    { "@type": "Organization", "@id": "https://example.com/#org", name: "Example" },
    { "@type": "BreadcrumbList", "@id": "https://example.com/blog/pipeline-e2e#crumbs" },
    {
      "@type": "FAQPage",
      "@id": "https://example.com/blog/pipeline-e2e#faq",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is context engineering?",
          acceptedAnswer: { "@type": "Answer", text: "The practice of deciding what a model sees." },
        },
        {
          "@type": "Question",
          name: "How many layers do I need?",
          acceptedAnswer: { "@type": "Answer", text: "Four layers cover most teams." },
        },
      ],
    },
    { "@type": "WebPage", "@id": "https://example.com/blog/pipeline-e2e#page", speakable: { "@type": "SpeakableSpecification", cssSelector: ["#key-takeaways"] } },
    { "@type": "ImageObject", "@id": "https://example.com/blog/pipeline-e2e#image", url: "https://example.com/header.png" },
  ],
};

/** Fake invoker: writes what a well-behaved phase agent would produce. */
class FakeInvoker implements AgentInvoker {
  calls: { phase: string; prompt: string }[] = [];
  /** D60: research-brief.md as the Researcher found it when it started. */
  researchBrief: string | undefined;
  /** Phases that should write junk on their first attempt (gate-retry test). */
  flakyOnce = new Set<string>();

  async run(inv: AgentInvocation): Promise<AgentRunOutcome> {
    const phase = /Phase [\d.]+ \((\w[\w ]*)\)/.exec(inv.prompt)?.[1] ?? "?";
    this.calls.push({ phase, prompt: inv.prompt });
    const folderMatch = /Article folder: (articles\/\S+)\//.exec(inv.prompt);
    const dir = join(inv.cwd, folderMatch?.[1] ?? "");

    const ok = (): AgentRunOutcome => ({
      success: true,
      finalText: "done",
      usage: { costUsd: 0.01, numTurns: 1, model: inv.model },
    });

    switch (phase) {
      case "Researcher":
        this.researchBrief = existsSync(join(dir, "research-brief.md"))
          ? readFileSync(join(dir, "research-brief.md"), "utf-8")
          : undefined;
        if (this.flakyOnce.delete("research")) {
          writeFileSync(join(dir, "research-notes.md"), "# thin\n");
          return ok();
        }
        writeFileSync(join(dir, "research-notes.md"), RESEARCH);
        return ok();
      case "Strategist":
        writeFileSync(join(dir, "outline.md"), OUTLINE);
        return ok();
      case "Writer":
        writeFileSync(join(dir, "article.md"), ARTICLE);
        writeFileSync(
          join(dir, "meta.json"),
          JSON.stringify({ title: "t", slug: "pipeline-e2e" }, null, 2),
        );
        return ok();
      case "Editor":
        appendFileSync(join(dir, "article.md"), "\n<!-- EDIT SUMMARY: no changes needed -->\n");
        return ok();
      case "HDCP":
        // Rewrites in place (here: unchanged) and logs its own verification.
        writeFileSync(join(dir, "hdcp.md"), HDCP_LOG);
        return ok();
      case "Evidence":
        // D61: verifies the interview's facts and appends them to the notes.
        appendFileSync(join(dir, "research-notes.md"), `\n${INTERVIEW_EVIDENCE}`);
        return ok();
      case "Schema Builder": {
        writeFileSync(join(dir, "schema.json"), JSON.stringify(SCHEMA, null, 2));
        const md = readFileSync(join(dir, "article.md"), "utf-8");
        const withFence = md.replace(
          "<!-- EDIT SUMMARY",
          "```json-ld\n" + JSON.stringify(SCHEMA, null, 2) + "\n```\n\n<!-- EDIT SUMMARY",
        );
        writeFileSync(join(dir, "article.md"), withFence);
        return ok();
      }
      case "Header Designer": {
        writeFileSync(join(dir, "header.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        writeFileSync(join(dir, "header.html"), "<html>header</html>");
        const md = readFileSync(join(dir, "article.md"), "utf-8");
        writeFileSync(
          join(dir, "article.md"),
          md.replace(
            'canonical_url: "https://www.example.com/blog/pipeline-e2e"',
            'canonical_url: "https://www.example.com/blog/pipeline-e2e"\nhero_image: "header.png"\nhero_image_alt: "Blue header reading Context Engineering Basics"',
          ),
        );
        return ok();
      }
      default:
        return { success: false, finalText: "", usage: {}, errorSubtype: `unknown phase ${phase}` };
    }
  }
}

/** Passing D34/D35 fakes — verification logic itself is unit-tested elsewhere. */
function passingCitations(): CitationReport {
  const urls = ["https://a.example.com/1", "https://b.example.com/2", "https://c.example.com/3"];
  return {
    ranAt: new Date(),
    results: urls.map((url, i) => ({
      sourceN: i + 1,
      url,
      claim: `claim ${i}`,
      kind: "key_claim" as const,
      verdict: "supported" as const,
    })),
    verifiedSourceCount: urls.length,
    verifiedUrls: urls,
    unsupportedCount: 0,
    unreachableCount: 0,
  };
}

const fakeVerifier: CitationVerifier = {
  verifyResearch: async () => passingCitations(),
  verifyArticleBody: () => passingCitations(),
};
const fakeLinkChecker: LinkChecker = {
  check: async () => ({ ranAt: new Date(), results: [], missingCount: 0 }),
};

/** Agent-route tests must never reach the direct route. */
const noDirectLlm: DirectLlm = {
  generate: async () => {
    throw new Error("direct route called in an agent-route test");
  },
};

function makeDeps(
  invoker: AgentInvoker,
  opts: { cfg?: WorkerConfig; direct?: DirectPhaseRunner; techReviewer?: TechReviewer; interviewer?: InterviewOpener } = {},
): PipelineDeps {
  return {
    ...(opts.techReviewer ? { techReviewer: opts.techReviewer } : {}),
    ...(opts.interviewer ? { interviewer: opts.interviewer } : {}),
    db,
    cfg: opts.cfg ?? cfg,
    storage: new LocalStorage(join(repoRoot, "storage")),
    invoker,
    direct: opts.direct ?? new DirectPhaseRunner(noDirectLlm),
    citationVerifier: fakeVerifier,
    linkChecker: fakeLinkChecker,
    companyName: "TestCo",
    log: () => {},
  };
}

describe("runPipeline end-to-end (fake agents, real gates + python checks)", () => {
  it("runs all six phases, persists artifacts, lands in review", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "pipeline-e2e",
      folder: "2026-09-14-pipeline-e2e",
      topic: "Context engineering basics",
      targetKeyword: "context engineering",
    });
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);
    expect(claimed).not.toBeNull();

    const invoker = new FakeInvoker();
    await runPipeline(makeDeps(invoker), claimed!);

    expect(invoker.calls.map((c) => c.phase)).toEqual([
      "Researcher",
      "Strategist",
      "Writer",
      "HDCP",
      "Editor",
      "Schema Builder",
      "Header Designer",
    ]);
    // D60: the Researcher reads what it's researching for, first.
    expect(invoker.calls[0]?.prompt).toContain("research-brief.md");
    expect(invoker.researchBrief).toMatch(/## Research playbook: /);
    expect(invoker.researchBrief).toContain("## Adjustments for this page");

    const doc = await db.articles.findOne({ _id: article._id });
    expect(doc?.stage).toBe("review");
    expect(doc?.artifacts.researchNotes).toContain("## Content Gaps");
    expect(doc?.artifacts.outline).toContain("## Full Outline");
    expect(doc?.artifacts.article).toContain("```json-ld");
    expect(doc?.artifacts.schema?.["@graph"]).toBeDefined();
    expect(doc?.frontmatter?.["hero_image"]).toBe("header.png");
    expect(doc?.header?.storageKey).toBe("articles/2026-09-14-pipeline-e2e/header.png");
    expect(existsSync(join(repoRoot, "storage", "articles", "2026-09-14-pipeline-e2e", "header.png"))).toBe(true);
    // Final audit (stored at design) has zero failures.
    expect(doc?.audit?.failures).toBe(0);
    expect(doc?.schemaValidation?.exitCode).toBe(0);
    // D45: a page without a plan item takes its facets from the Strategist,
    // page.md carries them to later phases, and the worker stamps them.
    expect(doc?.facets).toEqual({
      pageRole: "cluster",
      articleType: "deep-dive",
      searchIntent: "informational",
      funnel: "mofu",
      source: "strategist",
    });
    expect(doc?.frontmatter?.["article_type"]).toBe("deep-dive");
    // HDCP ran between Write and Edit (D61) and its log is on the article.
    expect(doc?.hdcp?.diagnosis).toContain("layer count");
    expect(doc?.hdcp?.changes).toHaveLength(2);
    expect(doc?.hdcp?.cuts).toEqual([{ content: "Second copy of the layer count", reason: "duplicate" }]);
    expect(doc?.hdcp?.flags).toEqual([]);
    expect(doc?.hdcp?.editorNotes).toContain("layer count");
    expect(doc?.frontmatter?.["funnel"]).toBe("mofu");
    const pageMd = readFileSync(join(repoRoot, "articles", "2026-09-14-pipeline-e2e", "page.md"), "utf-8");
    const hdcpInputs = readFileSync(join(repoRoot, "articles", "2026-09-14-pipeline-e2e", "hdcp-inputs.md"), "utf-8");
    expect(hdcpInputs).toContain("## cluster_context");
    expect(hdcpInputs).toContain("### glossary");
    expect(pageMd).toContain("Deep-dive (`deep-dive`)");
    expect(pageMd).toContain("Key Takeaways:** exactly 3");

    const runDoc = await db.runs.findOne({ _id: run._id });
    expect(runDoc?.status).toBe("succeeded");
    expect(runDoc?.phaseResults.filter((p) => p.status === "succeeded")).toHaveLength(7);
    expect(runDoc?.currentPhase).toBe("design"); // each phase records itself: a reclaim resumes there

    const events = await eventsAfter(db, run._id as ObjectId, 0, 500);
    expect(events.some((e) => e.type === "run.succeeded")).toBe(true);
    // Seven phases, plus the verify stage's gate on the final text (D61).
    expect(events.filter((e) => e.type === "gate.passed")).toHaveLength(8);
    expect(doc?.verification?.completedAt).toBeDefined();
    expect(doc?.gates?.verify?.ok).toBe(true);
  }, 120_000);

  it("retries a phase with gate feedback, then succeeds", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "pipeline-retry",
      folder: "2026-09-14-pipeline-retry",
      topic: "Retry topic",
    });
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);

    const invoker = new FakeInvoker();
    invoker.flakyOnce.add("research");
    await runPipeline(makeDeps(invoker), claimed!);

    const researchCalls = invoker.calls.filter((c) => c.phase === "Researcher");
    expect(researchCalls).toHaveLength(2);
    expect(researchCalls[1]?.prompt).toContain("GATE FEEDBACK");

    const runDoc = await db.runs.findOne({ _id: run._id });
    expect(runDoc?.status).toBe("succeeded");
    const researchResults = runDoc?.phaseResults.filter((p) => p.phase === "research");
    expect(researchResults?.map((p) => p.status)).toEqual(["failed", "succeeded"]);

    const doc = await db.articles.findOne({ _id: article._id });
    expect(doc?.stage).toBe("review");
  }, 120_000);
});

/**
 * Fake Messages API: answers each direct phase in the <file> protocol with
 * the same fixtures the fake agent writes, so both routes meet the same
 * real gates + python checks.
 */
class FakeDirectLlm implements DirectLlm {
  calls: { phase: string; req: DirectLlmRequest }[] = [];
  /** Return invalid schema JSON on the first schema call (gate-retry test). */
  badSchemaOnce = false;
  /** Writer drafts contain a banned phrase (edit pre-audit test). */
  dirtyDraft = false;
  /** Edit and HDCP each write one internal link, with different anchors. */
  anchors?: { edit: string; hdcp: string; url: string };

  /** Verify fix pass: replace this text in the article (the reviewer's quote). */
  fixReplace?: { from: string; to: string };
  /** The POV writer's pov.md (default: no facts to verify). */
  pov = POV;

  async generate(req: DirectLlmRequest): Promise<DirectLlmResponse> {
    const phase = /You are running the (\w+) phase/.exec(req.prompt)?.[1] ?? "?";
    this.calls.push({ phase, req });
    const file = (name: string, content: string) => `<file name="${name}">\n${content}\n</file>`;
    // The article as the phase received it (inlined), for phases that rewrite in place.
    const inlined = /<input path="[^"]*\/article\.md">\n([\s\S]*?)\n<\/input>/.exec(req.prompt)?.[1] ?? ARTICLE;
    const fixed = this.fixReplace ? inlined.replace(this.fixReplace.from, this.fixReplace.to) : inlined;
    const bodies: Record<string, string> = {
      // The Strategist plans from pov.md when the interview ran (D61): its thesis is the expert's.
      outline: file(
        "outline.md",
        req.prompt.includes('/pov.md">') ? OUTLINE.replace(/## Thesis\n[^\n]+/, `## Thesis\n${POV_THESIS}`) : OUTLINE,
      ),
      interview: file("pov.md", this.pov),
      verify: file("article.md", fixed),
      // Fenced on purpose: the runner must unwrap a code-fenced file body.
      write:
        file("article.md", "```markdown\n" + ARTICLE + "\n```") +
        "\n" +
        file("meta.json", JSON.stringify({ title: "t", slug: "pipeline-e2e" })),
      edit: file("article.md", ARTICLE + "\n<!-- EDIT SUMMARY: no changes needed -->\n"),
      // HDCP runs on the Writer's draft (D61) and returns it restructured — here, unchanged.
      hdcp: file("article.md", inlined) + "\n" + file("hdcp.md", HDCP_LOG),
      schema: file("schema.json", JSON.stringify(SCHEMA)),
      design: file(
        "header.json",
        JSON.stringify({ pattern: "contrarian", subtitle: null, hero_image_alt: "Alt text for the header" }),
      ),
    };
    if (this.anchors) {
      const withLink = (anchor: string) =>
        ARTICLE.replace("Body text about layers.", `Body text about layers, and [${anchor}](${this.anchors!.url}) covers the rest.`) +
        "\n<!-- EDIT SUMMARY: no changes needed -->\n";
      bodies["hdcp"] = file("article.md", withLink(this.anchors.hdcp)) + "\n" + file("hdcp.md", HDCP_LOG);
      bodies["edit"] = file("article.md", withLink(this.anchors.edit));
    }
    if (phase === "write" && this.dirtyDraft) {
      bodies["write"] = file("article.md", ARTICLE.replace("Body text about layers.", "Body text about the blast radius of layers.")) +
        "\n" + file("meta.json", JSON.stringify({ title: "t", slug: "pipeline-e2e" }));
    }
    if (phase === "schema" && this.badSchemaOnce) {
      this.badSchemaOnce = false;
      bodies["schema"] = file("schema.json", "{ not json");
    }
    return {
      text: bodies[phase] ?? "",
      stopReason: "end_turn",
      usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheCreationTokens: 0 },
    };
  }
}

const POV_THESIS =
  "Context engineering fails when teams treat retrieval as the whole context layer, because the failures that matter come from what never reaches the model.";

const POV = `# Expert POV: Test Article

## Thesis
${POV_THESIS}

## Argument Spine
1. The context layer decides what the model can know — expert reasoning
2. Retrieval covers only part of that layer — research #1
3. The costly failures come from the part retrieval never sees — expert reasoning

## Objection & Answer
Objection: better models close the gap. Answer: a model can't reason about context it never received.

## Real-World Anchor
none — the expert offered none and the planned anchor was a documented incident they rejected

## Company Role
In the third section, as the mechanism that assembles the missing context. No proof point.

## Approved Quotes
- "Context beats cleverness." — unattributed

## Rejected
- Upgrading the model as the first fix.

## Facts to Verify
none — the expert raised no third-party facts
`;

/** A pov.md whose expert raised one third-party fact (D61 evidence stage). */
const POV_WITH_FACTS = POV.replace(
  "none — the expert raised no third-party facts",
  "- F1: Retrieval-augmented generation was introduced in a 2020 paper — check: the paper — said: \"the 2020 RAG paper\"",
);

const INTERVIEW_EVIDENCE = `## Interview Evidence

### F1: Retrieval-augmented generation was introduced in a 2020 paper
- Verdict: verified
- Source 101: **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks** — Lewis et al., 2020. https://arxiv.org/abs/2005.11401
- Key claim: The paper introduces retrieval-augmented generation (RAG) models.
- Supporting quote: "We explore a general-purpose fine-tuning recipe for retrieval-augmented generation (RAG)"
- Use: as stated
`;

/** Records every open call; answers with a fixed plan and first question. */
class FakeInterviewer implements InterviewOpener {
  calls = 0;
  async open() {
    this.calls += 1;
    return {
      plan: "## Wedge\nRetrieval and context are treated as the same thing.",
      opening: "People treat retrieval as the whole context layer. Which is closest to what you'd argue: A, B or C?",
      captured: {},
      model: "fake-interviewer",
      costUsd: 0.05,
    };
  }
}

/** Stub the Chromium render; record what the runner asked for. */
function fakeRenderer(choices: { pattern: string }[]): HeaderRenderer {
  return async (c, folder, choice) => {
    choices.push(choice);
    const dir = join(c.repoRoot, "articles", folder);
    writeFileSync(join(dir, "header.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(dir, "header.html"), "<html>header</html>");
  };
}

function directCfg(): WorkerConfig {
  return {
    ...cfg,
    models: {
      research: "m",
      outline: "claude-sonnet-5",
      interview: "claude-sonnet-5",
      evidence: "claude-sonnet-5",
      verify: "claude-sonnet-5",
      write: "claude-sonnet-5",
      edit: "claude-sonnet-5",
      hdcp: "claude-opus-5-5",
      schema: "claude-sonnet-5",
      design: "claude-sonnet-5",
    },
    direct: {
      ...cfg.direct,
      routes: { outline: "direct", interview: "direct", verify: "direct", write: "direct", edit: "direct", hdcp: "direct", schema: "direct", design: "direct" },
    },
  };
}

describe("runPipeline, a worker that lost the run", () => {
  it("stops at the next phase boundary and leaves the run and article alone", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "pipeline-lease-lost",
      folder: "2026-10-01-pipeline-lease-lost",
      topic: "Context engineering basics",
      targetKeyword: "context engineering",
    });
    await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);
    const invoker = new FakeInvoker();
    // The run is canceled while research is in flight.
    let calls = 0;
    const leaseLost = () => ++calls > 1;
    expect(await runPipeline(makeDeps(invoker), claimed!, { leaseLost })).toBe("abandoned");
    expect(invoker.calls.map((c) => c.phase)).toEqual(["Researcher"]);
    const doc = await db.articles.findOne({ _id: article._id });
    expect(doc?.stage).toBe("research");
    const runDoc = await db.runs.findOne({ _id: claimed!._id });
    expect(runDoc?.currentPhase).toBe("research");
    expect(runDoc?.status).toBe("running");
  });
});

describe("verify fix pass prompt", () => {
  it("prints the banned list beside the issues", () => {
    const banned = loadBannedPhrases({ repoRoot: join(__dirname, "..", "..", "..") });
    expect(banned).toContain("just");
    expect(banned).toContain("it's not just");
    expect(banned.some((p) => p.startsWith("#"))).toBe(false);
    const block = verifyIssuesBlock({
      verifyIssues: [{ kind: "technical_error", quote: "x", problem: "y", fix: "z" }],
      bannedPhrases: banned,
    } as unknown as PhaseContext);
    expect(block).toContain("BANNED WORDS AND PHRASES");
    expect(block).toContain('"just"');
  });
});

describe("runPipeline, direct Messages API route (10.3)", () => {
  it("runs research on the agent and the other five phases as direct calls", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "direct-e2e",
      folder: "2026-09-14-direct-e2e",
      topic: "Context engineering basics",
      targetKeyword: "context engineering",
    });
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);

    const invoker = new FakeInvoker();
    const llm = new FakeDirectLlm();
    const choices: { pattern: string }[] = [];
    const direct = new DirectPhaseRunner(llm, fakeRenderer(choices));
    await runPipeline(makeDeps(invoker, { cfg: directCfg(), direct }), claimed!);

    expect(invoker.calls.map((c) => c.phase)).toEqual(["Researcher"]);
    expect(llm.calls.map((c) => c.phase)).toEqual(["outline", "write", "hdcp", "edit", "schema", "design"]);

    // Inputs inlined; stable reference material sits behind the cache breakpoint.
    const outlineReq = llm.calls[0]!.req;
    expect(outlineReq.prompt).toContain('<input path="articles/2026-09-14-direct-e2e/research-notes.md">');
    expect(outlineReq.prompt).toContain("## Content Gaps");
    expect(outlineReq.system).toHaveLength(2);
    expect(outlineReq.system[0]?.text).toContain("Strategist");
    expect(outlineReq.system[1]?.cache_control).toEqual({ type: "ephemeral" });
    expect(outlineReq.system[1]?.text).toContain('<input path="standards/seo-checklist.md">');
    expect(outlineReq.effort).toBe("high");

    const doc = await db.articles.findOne({ _id: article._id });
    expect(doc?.stage).toBe("review");
    expect(doc?.audit?.failures).toBe(0);
    expect(doc?.schemaValidation?.exitCode).toBe(0);

    // Exactly one fence, byte-equal to schema.json, above the edit summary.
    const md = doc?.artifacts.article ?? "";
    const fences = [...md.matchAll(/```json-ld\n([\s\S]*?)\n```/g)];
    expect(fences).toHaveLength(1);
    const schemaFile = readFileSync(join(repoRoot, "articles", "2026-09-14-direct-e2e", "schema.json"), "utf-8");
    expect(fences[0]?.[1]).toBe(schemaFile.trimEnd());
    expect(md.indexOf("```json-ld")).toBeLessThan(md.indexOf("<!-- EDIT SUMMARY"));
    expect(md).not.toContain("```markdown");

    // Design: the model chose, the worker rendered and set the frontmatter.
    expect(choices.map((c) => c.pattern)).toEqual(["contrarian"]);
    expect(doc?.frontmatter?.["hero_image"]).toBe("header.png");
    expect(doc?.frontmatter?.["hero_image_alt"]).toBe("Alt text for the header");
    expect(doc?.header?.storageKey).toBe("articles/2026-09-14-direct-e2e/header.png");

    // Route + estimated cost land on every phase result.
    const runDoc = await db.runs.findOne({ _id: run._id });
    expect(runDoc?.status).toBe("succeeded");
    const results = runDoc?.phaseResults ?? [];
    expect(results.map((p) => [p.phase, p.route])).toEqual([
      ["research", "agent"],
      ["outline", "direct"],
      ["write", "direct"],
      ["hdcp", "direct"],
      ["edit", "direct"],
      ["schema", "direct"],
      ["design", "direct"],
    ]);
    // 1000 in × $2 + 2000 cache-read × $0.2 + 500 out × $10, per million (Sonnet phases;
    // HDCP runs on Opus 5.5 and is priced as such).
    for (const p of results.slice(1).filter((r) => r.phase !== "hdcp")) expect(p.usage?.costUsd).toBeCloseTo(0.0074, 6);
    expect(results.find((r) => r.phase === "hdcp")?.usage?.costUsd).toBeGreaterThan(0);
  }, 120_000);

  it("retries a direct phase with gate feedback without stacking json-ld fences", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "direct-retry",
      folder: "2026-09-14-direct-retry",
      topic: "Retry topic",
      targetKeyword: "context engineering",
    });
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);

    const llm = new FakeDirectLlm();
    llm.badSchemaOnce = true;
    const direct = new DirectPhaseRunner(llm, fakeRenderer([]));
    await runPipeline(makeDeps(new FakeInvoker(), { cfg: directCfg(), direct }), claimed!);

    const schemaCalls = llm.calls.filter((c) => c.phase === "schema");
    expect(schemaCalls).toHaveLength(2);
    expect(schemaCalls[1]?.req.prompt).toContain("GATE FEEDBACK");

    const runDoc = await db.runs.findOne({ _id: run._id });
    expect(runDoc?.status).toBe("succeeded");
    expect(runDoc?.phaseResults.filter((p) => p.phase === "schema").map((p) => p.status)).toEqual([
      "failed",
      "succeeded",
    ]);
    const doc = await db.articles.findOne({ _id: article._id });
    expect([...(doc?.artifacts.article ?? "").matchAll(/```json-ld/g)]).toHaveLength(1);
    expect(doc?.stage).toBe("review");
  }, 120_000);

  it("records the Editor's anchors — the last rewrite — in the D53 registry (D61)", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "hdcp-anchors",
      folder: "2026-09-14-hdcp-anchors",
      topic: "Context engineering basics",
      targetKeyword: "context engineering",
    });
    await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);
    const url = "https://www.testco.example/learn/context/layers/";
    const llm = new FakeDirectLlm();
    llm.anchors = { edit: "How to measure context layers", hdcp: "measuring context layers", url };
    const seen: string[] = [];
    const linkChecker: LinkChecker = {
      check: async (body) => {
        seen.push(body.includes("measuring context layers") ? "hdcp" : "edit");
        return { ranAt: new Date(), results: body.includes(url) ? [{ url, status: "deferred" }] : [], missingCount: 0, deferredCount: 1 };
      },
    };
    const direct = new DirectPhaseRunner(llm, fakeRenderer([]));
    await runPipeline({ ...makeDeps(new FakeInvoker(), { cfg: directCfg(), direct }), linkChecker }, claimed!);

    const doc = await db.articles.findOne({ _id: article._id });
    expect(doc?.stage).toBe("review");
    // The Editor's pre-audit checked HDCP's anchors; the text that ships is the Editor's.
    expect(seen[0]).toBe("hdcp");
    expect(seen[seen.length - 1]).toBe("edit");
    expect(doc?.internalLinks).toEqual([{ url, anchor: "How to measure context layers" }]);
  }, 120_000);

  it("hands the Editor the edit gate's findings on the draft before attempt 1", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "direct-preaudit",
      folder: "2026-09-14-direct-preaudit",
      topic: "Pre-audit topic",
      targetKeyword: "context engineering",
    });
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);

    const llm = new FakeDirectLlm();
    llm.dirtyDraft = true;
    const direct = new DirectPhaseRunner(llm, fakeRenderer([]));
    await runPipeline(makeDeps(new FakeInvoker(), { cfg: directCfg(), direct }), claimed!);

    const editCalls = llm.calls.filter((c) => c.phase === "edit");
    // The fixture Editor returns a clean article, so the pre-audit is what
    // lets attempt 1 pass: one edit call, not a gate retry.
    expect(editCalls).toHaveLength(1);
    const prompt = editCalls[0]!.req.prompt;
    expect(prompt).toContain("PRE-AUDIT");
    expect(prompt).toContain("'blast radius'");
    expect(prompt).toContain("the blast radius of layers");
    expect(prompt).not.toContain("GATE FEEDBACK");

    const runDoc = await db.runs.findOne({ _id: run._id });
    expect(runDoc?.status).toBe("succeeded");
  }, 120_000);

  it("verify: reviews the final text, fixes the issue, and a confirm round closes it (D61)", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "direct-verify",
      folder: "2026-09-14-direct-verify",
      topic: "Verify topic",
      targetKeyword: "context engineering",
    });
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);

    const calls: { mode: string | undefined; md: string; previous: number }[] = [];
    const reviewer: TechReviewer = {
      review: async ({ articleMd, mode, previous }) => {
        calls.push({ mode, md: articleMd, previous: previous?.length ?? 0 });
        const issues = articleMd.includes("Body text about layers.")
          ? [{ kind: "technical_error" as const, quote: "Body text about layers.", problem: "Says nothing about which layers.", fix: "Name them." }]
          : [];
        return { ranAt: new Date(), model: "fake-reviewer", droppedUnquoted: 0, issues };
      },
    };
    const llm = new FakeDirectLlm();
    llm.fixReplace = { from: "Body text about layers.", to: "Body text about the retrieval and memory layers." };
    const direct = new DirectPhaseRunner(llm, fakeRenderer([]));
    const c = { ...directCfg(), techReview: { ...cfg.techReview, enabled: true } };
    await runPipeline(makeDeps(new FakeInvoker(), { cfg: c, direct, techReviewer: reviewer }), claimed!);

    // It read the FINAL text (after the Editor), fixed once, then confirmed.
    expect(calls.map((x) => x.mode)).toEqual(["review", "confirm"]);
    expect(calls[0]?.md).toContain("EDIT SUMMARY");
    expect(calls[1]?.previous).toBe(1);
    expect(llm.calls.map((x) => x.phase)).toEqual(["outline", "write", "hdcp", "edit", "verify", "schema", "design"]);
    expect(llm.calls.find((x) => x.phase === "verify")!.req.prompt).toContain('FIX MODE');
    const doc = await db.articles.findOne({ _id: article._id });
    expect(doc?.artifacts.article).toContain("the retrieval and memory layers");
    expect(doc?.verification?.rounds).toHaveLength(2);
    expect(doc?.verification?.rounds[0]?.fixed).toBe(true);
    expect(doc?.verification?.unresolved).toEqual([]);
    expect((await db.runs.findOne({ _id: run._id }))?.status).toBe("succeeded");
  }, 120_000);

  it("verify: an issue still open after the confirm round is flagged inline and blocks export", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "direct-verify-open",
      folder: "2026-09-14-direct-verify-open",
      topic: "Verify open topic",
      targetKeyword: "context engineering",
    });
    await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);
    const reviewer: TechReviewer = {
      review: async () => ({
        ranAt: new Date(),
        model: "fake-reviewer",
        droppedUnquoted: 0,
        issues: [{ kind: "technical_error", quote: "Body text about layers.", problem: "Says nothing about which layers.", fix: "Name them." }],
      }),
    };
    const llm = new FakeDirectLlm(); // its fix pass changes nothing
    const c = { ...directCfg(), techReview: { ...cfg.techReview, enabled: true } };
    await runPipeline(makeDeps(new FakeInvoker(), { cfg: c, direct: new DirectPhaseRunner(llm, fakeRenderer([])), techReviewer: reviewer }), claimed!);

    const doc = await db.articles.findOne({ _id: article._id });
    expect(doc?.stage).toBe("review");
    expect(doc?.artifacts.article).toContain("Body text about layers. [VERIFY: Says nothing about which layers.]");
    expect(doc?.verification?.unresolved).toHaveLength(1);
    expect(llm.calls.filter((x) => x.phase === "verify")).toHaveLength(1); // one fix pass, then flag
    expect(framerExportProblems(doc!, { signoffRequired: false }).join(" ")).toContain("[VERIFY:");
  }, 120_000);

  it("verify: a restart after the fix pass confirms instead of re-reviewing the fixed text", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "direct-verify-restart",
      folder: "2026-09-14-direct-verify-restart",
      topic: "Verify restart topic",
      targetKeyword: "context engineering",
    });
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const modes: (string | undefined)[] = [];
    let crashOnce = true;
    const reviewer: TechReviewer = {
      review: async ({ articleMd, mode }) => {
        modes.push(mode);
        if (mode === "confirm" && crashOnce) {
          crashOnce = false;
          throw new Error("worker lost during the confirm round");
        }
        const issues = articleMd.includes("Body text about layers.")
          ? [{ kind: "technical_error" as const, quote: "Body text about layers.", problem: "Vague.", fix: "Name them." }]
          : [];
        return { ranAt: new Date(), model: "fake-reviewer", droppedUnquoted: 0, issues };
      },
    };
    const llm = new FakeDirectLlm();
    llm.fixReplace = { from: "Body text about layers.", to: "Body text about the retrieval and memory layers." };
    const c = { ...directCfg(), techReview: { ...cfg.techReview, enabled: true } };
    const deps = makeDeps(new FakeInvoker(), { cfg: c, direct: new DirectPhaseRunner(llm, fakeRenderer([])), techReviewer: reviewer });
    await expect(runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).rejects.toThrow(/confirm round/);
    const requeued = await db.runs.findOne({ _id: run._id });
    expect(requeued?.status).toBe("queued");
    expect(requeued?.fromStage).toBe("verify");

    expect(await runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).toBe("completed");
    // One fresh review ever: the resumed run found its fix and went straight to confirming it.
    expect(modes).toEqual(["review", "confirm", "confirm"]);
    expect(llm.calls.filter((x) => x.phase === "verify")).toHaveLength(1);
    const doc = await db.articles.findOne({ _id: article._id });
    expect(doc?.verification?.unresolved).toEqual([]);
  }, 120_000);

  it("verify: a fix pass that can't pass the Edit checks keeps the prior text and flags the issues", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "direct-verify-fixfail",
      folder: "2026-09-14-direct-verify-fixfail",
      topic: "Verify fix-fail topic",
      targetKeyword: "context engineering",
    });
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const reviewer: TechReviewer = {
      review: async () => ({
        ranAt: new Date(),
        model: "fake-reviewer",
        droppedUnquoted: 0,
        issues: [{ kind: "technical_error", quote: "Body text about layers.", problem: "Vague about which layers.", fix: "Name them." }],
      }),
    };
    const llm = new FakeDirectLlm();
    // Every fix attempt introduces a banned phrase, so it never passes the Edit gate.
    llm.fixReplace = { from: "Body text about layers.", to: "Body text about the blast radius of layers." };
    const c = { ...directCfg(), techReview: { ...cfg.techReview, enabled: true } };
    expect(
      await runPipeline(
        makeDeps(new FakeInvoker(), { cfg: c, direct: new DirectPhaseRunner(llm, fakeRenderer([])), techReviewer: reviewer }),
        (await claimRun(db, "test-worker", 60_000))!,
      ),
    ).toBe("completed");
    const doc = await db.articles.findOne({ _id: article._id });
    expect(doc?.stage).toBe("review");
    expect(doc?.artifacts.article).not.toContain("blast radius");
    expect(doc?.artifacts.article).toContain("Body text about layers. [VERIFY: Vague about which layers.]");
    expect(doc?.verification?.unresolved).toHaveLength(1);
    expect(doc?.verification?.rounds[0]?.fixed).toBe(false);
    expect((await db.runs.findOne({ _id: run._id }))?.status).toBe("succeeded");
  }, 120_000);

  it("hashText ignores the verify stage's own notes, so a flagged restart finds its rounds", () => {
    const md = "# T\n\nBody text about layers.\n\nMore.\n";
    const flagged = flagUnresolvedForTest(md);
    expect(flagged).toContain("[VERIFY:");
    expect(hashText(flagged)).toBe(hashText(md));
    expect(hashText(md.replace("More.", "Different."))).not.toBe(hashText(md));
  });

  it("verify passes on the Edit checks when the technical review is skipped", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "direct-techreview-skip",
      folder: "2026-09-14-direct-techreview-skip",
      topic: "Tech review skip",
      targetKeyword: "context engineering",
    });
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);
    const reviewer: TechReviewer = {
      review: async () => ({ ranAt: new Date(), model: "m", issues: [], droppedUnquoted: 0, skipped: "stop_reason refusal" }),
    };
    const c = { ...directCfg(), techReview: { ...cfg.techReview, enabled: true } };
    await runPipeline(
      makeDeps(new FakeInvoker(), { cfg: c, direct: new DirectPhaseRunner(new FakeDirectLlm(), fakeRenderer([])), techReviewer: reviewer }),
      claimed!,
    );
    const doc = await db.articles.findOne({ _id: article._id });
    expect(doc?.verification?.rounds[0]?.review.skipped).toBe("stop_reason refusal");
    expect(doc?.gates?.verify?.ok).toBe(true);
    expect((await db.runs.findOne({ _id: run._id }))?.status).toBe("succeeded");
  }, 120_000);

  it("feeds Admin-saved case studies to the direct phases, never internal-only ones", async () => {
    // Saved the way the web Admin saves them (repo_files); applied before the run.
    await saveRepoFile(
      db,
      "testco",
      "context/case-studies/regional-health.md",
      "# Case study: Regional health system\n\n## Publishing boundary\n- Permission: anonymized OK\n\n## What we found\n- 41 crackable service accounts\n",
    );
    await saveRepoFile(
      db,
      "testco",
      "context/case-studies/secret-bank.md",
      "# Case study: Bank\n\n## Publishing boundary\n- Permission: internal only — do not use\n",
    );
    await saveRepoFile(db, "testco", "context/case-studies/_template.md", "# Case study: {{title}}\n");
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "direct-casestudy",
      folder: "2026-09-14-direct-casestudy",
      topic: "Case study topic",
      targetKeyword: "context engineering",
    });
    await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);
    const llm = new FakeDirectLlm();
    await runPipeline(
      makeDeps(new FakeInvoker(), { cfg: directCfg(), direct: new DirectPhaseRunner(llm, fakeRenderer([])) }),
      claimed!,
    );

    for (const phase of ["outline", "write", "edit"]) {
      const reference = llm.calls.find((c) => c.phase === phase)!.req.system.map((b) => b.text).join("\n");
      expect(reference, phase).toContain('<input path="context/case-studies/regional-health.md">');
      expect(reference, phase).toContain("41 crackable service accounts");
      expect(reference, phase).not.toContain('<input path="context/case-studies/secret-bank.md">');
      expect(reference, phase).not.toContain('<input path="context/case-studies/_template.md">');
      expect(reference, phase).not.toContain("Permission: internal only — do not use");
    }
    expect(llm.calls.find((c) => c.phase === "outline")!.req.prompt).toContain("real-world anchor");
  }, 120_000);
});

describe("runPipeline, expert interview (D59)", () => {
  it("parks right after research, writes pov.md from the answers, then plans once from it (D61)", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "interview-e2e",
      folder: "2026-09-30-interview-e2e",
      topic: "Context engineering basics",
      targetKeyword: "context engineering",
      interviewMode: "pause",
    });
    const id = article._id as ObjectId;
    const run = await enqueueRun(db, { companyId: "testco", articleId: id });
    const llm = new FakeDirectLlm();
    const interviewer = new FakeInterviewer();
    const deps = makeDeps(new FakeInvoker(), {
      cfg: directCfg(),
      direct: new DirectPhaseRunner(llm, fakeRenderer([])),
      interviewer,
    });

    expect(await runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).toBe("awaiting_input");
    const parked = await db.runs.findOne({ _id: run._id });
    expect(parked?.status).toBe("awaiting_input");
    expect(parked?.fromStage).toBe("interview");
    expect(parked?.phaseResults.find((p) => p.phase === "interview")?.usage?.costUsd).toBe(0.05);
    let doc = await db.articles.findOne({ _id: id });
    expect(doc?.stage).toBe("interview");
    expect(doc?.interview?.status).toBe("open");
    expect(doc?.interview?.runId?.equals(run._id as ObjectId)).toBe(true);
    expect(doc?.interview?.messages[0]?.content).toContain("Which is closest");
    // D61: the interview opens right after research — nothing is planned yet.
    expect(llm.calls.map((c) => c.phase)).toEqual([]);
    expect(doc?.artifacts.outline ?? "").not.toContain("## Full Outline");
    // Parked runs stay out of the queue.
    expect(await claimRun(db, "test-worker", 60_000)).toBeNull();

    await appendExpertMessage(db, id, "C. The failures that matter come from what never reaches the model.");
    await closeInterview(db, (await db.articles.findOne({ _id: id }))!, "complete");
    const resumed = await claimRun(db, "test-worker", 60_000);
    expect(resumed?._id?.equals(run._id as ObjectId)).toBe(true);
    expect(resumed?.fromStage).toBe("interview");
    expect(await runPipeline(deps, resumed!)).toBe("completed");

    expect(interviewer.calls).toBe(1);
    // No facts to verify, so evidence is skipped; the Strategist plans once, from pov.md.
    expect(llm.calls.map((c) => c.phase)).toEqual(["interview", "outline", "write", "hdcp", "edit", "schema", "design"]);
    const folder = "articles/2026-09-30-interview-e2e";
    const povWriter = llm.calls.find((c) => c.phase === "interview")!.req;
    expect(povWriter.system[0]?.text).toContain("POV Writer");
    expect(povWriter.prompt).toContain(`<input path="${folder}/interview.md">`);
    expect(povWriter.prompt).toContain("never reaches the model");
    expect(povWriter.prompt).not.toContain(`<input path="${folder}/outline.md">`);
    const strategist = llm.calls.find((c) => c.phase === "outline")!.req.prompt;
    expect(strategist).toContain(`<input path="${folder}/pov.md">`);
    expect(strategist).toContain("EXPERT POV BRIEF");
    const write = llm.calls.find((c) => c.phase === "write")!.req.prompt;
    expect(write).toContain(`<input path="${folder}/pov.md">`);
    expect(write).toContain("the first sentence carries");
    const edit = llm.calls.find((c) => c.phase === "edit")!.req.prompt;
    expect(edit).toContain(`<input path="${folder}/interview.md">`);

    doc = await db.articles.findOne({ _id: id });
    expect(doc?.stage).toBe("review");
    expect(doc?.interview?.status).toBe("refined");
    expect(doc?.artifacts.pov).toContain("## Argument Spine");
    expect(doc?.artifacts.outline).toContain(POV_THESIS);
    expect(doc?.gates?.interview?.ok).toBe(true);
    const types = (await eventsAfter(db, run._id as ObjectId, 0, 500)).map((e) => e.type);
    expect(types).toContain("interview.opened");
    expect(types).toContain("interview.completed");
    expect((await db.runs.findOne({ _id: run._id }))?.status).toBe("succeeded");
  }, 120_000);

  it("verifies the facts the expert raised before the Strategist plans (D61 evidence)", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "interview-evidence",
      folder: "2026-09-30-interview-evidence",
      topic: "Context engineering basics",
      targetKeyword: "context engineering",
      interviewMode: "pause",
    });
    const id = article._id as ObjectId;
    await enqueueRun(db, { companyId: "testco", articleId: id });
    const llm = new FakeDirectLlm();
    llm.pov = POV_WITH_FACTS;
    const invoker = new FakeInvoker();
    const deps = makeDeps(invoker, { cfg: directCfg(), direct: new DirectPhaseRunner(llm, fakeRenderer([])), interviewer: new FakeInterviewer() });
    expect(await runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).toBe("awaiting_input");
    await appendExpertMessage(db, id, "C — and the 2020 RAG paper is where retrieval started.");
    await closeInterview(db, (await db.articles.findOne({ _id: id }))!, "complete");
    expect(await runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).toBe("completed");

    expect(invoker.calls.map((c) => c.phase)).toEqual(["Researcher", "Evidence"]);
    const doc = await db.articles.findOne({ _id: id });
    expect(doc?.artifacts.researchNotes).toContain("## Interview Evidence");
    expect(doc?.gates?.evidence?.ok).toBe(true);
    const strategist = llm.calls.find((c) => c.phase === "outline")!.req.prompt;
    expect(strategist).toContain("### F1: Retrieval-augmented generation was introduced in a 2020 paper");
  }, 120_000);

  it("a fact whose source fails the live check is demoted to unsourced, and the run goes on (D61)", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "interview-evidence-demote",
      folder: "2026-09-30-interview-evidence-demote",
      topic: "Context engineering basics",
      targetKeyword: "context engineering",
      interviewMode: "pause",
    });
    const id = article._id as ObjectId;
    await enqueueRun(db, { companyId: "testco", articleId: id });
    const llm = new FakeDirectLlm();
    llm.pov = POV_WITH_FACTS;
    const failingEvidence: CitationVerifier = {
      verifyResearch: async (notes) =>
        notes.includes("interview evidence F1")
          ? {
              ranAt: new Date(),
              results: [{ sourceN: 101, url: "https://arxiv.org/abs/2005.11401", claim: "c", kind: "key_claim", verdict: "unsupported", note: "claim not on page" }],
              verifiedSourceCount: 0,
              verifiedUrls: [],
              unsupportedCount: 1,
              unreachableCount: 0,
            }
          : passingCitations(),
      verifyArticleBody: () => passingCitations(),
    };
    const deps = {
      ...makeDeps(new FakeInvoker(), { cfg: directCfg(), direct: new DirectPhaseRunner(llm, fakeRenderer([])), interviewer: new FakeInterviewer() }),
      citationVerifier: failingEvidence,
    };
    expect(await runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).toBe("awaiting_input");
    await appendExpertMessage(db, id, "C — and the 2020 RAG paper is where retrieval started.");
    await closeInterview(db, (await db.articles.findOne({ _id: id }))!, "complete");
    expect(await runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).toBe("completed");
    const doc = await db.articles.findOne({ _id: id });
    expect(doc?.gates?.evidence?.ok).toBe(true);
    expect(doc?.artifacts.researchNotes).toMatch(/### F1:[^\n]*\n- Verdict: unsourced\n- Use: expert opinion only/);
    expect(doc?.citationChecks?.verifiedUrls ?? []).not.toContain("https://arxiv.org/abs/2005.11401");
  }, 120_000);

  it("an operator skip resumes at the Writer without refining", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "interview-skip-op",
      folder: "2026-09-30-interview-skip-op",
      topic: "Skip topic",
      targetKeyword: "context engineering",
      interviewMode: "pause",
    });
    const id = article._id as ObjectId;
    await enqueueRun(db, { companyId: "testco", articleId: id });
    const llm = new FakeDirectLlm();
    const deps = makeDeps(new FakeInvoker(), {
      cfg: directCfg(),
      direct: new DirectPhaseRunner(llm, fakeRenderer([])),
      interviewer: new FakeInterviewer(),
    });
    expect(await runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).toBe("awaiting_input");
    await closeInterview(db, (await db.articles.findOne({ _id: id }))!, "skipped");
    expect(await runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).toBe("completed");
    expect(llm.calls.map((c) => c.phase)).not.toContain("interview");
    const doc = await db.articles.findOne({ _id: id });
    expect(doc?.stage).toBe("review");
    expect(doc?.artifacts.pov).toBeUndefined();
    expect(llm.calls.find((c) => c.phase === "write")!.req.prompt).not.toContain("pov.md");
  }, 120_000);

  it("a re-run after a failed refine refines the finished interview instead of reopening it", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "interview-refine-rerun",
      folder: "2026-09-30-interview-refine-rerun",
      topic: "Refine rerun topic",
      targetKeyword: "context engineering",
      interviewMode: "pause",
    });
    const id = article._id as ObjectId;
    const first = await enqueueRun(db, { companyId: "testco", articleId: id });
    const interviewer = new FakeInterviewer();
    const llm = new FakeDirectLlm();
    const deps = makeDeps(new FakeInvoker(), {
      cfg: directCfg(),
      direct: new DirectPhaseRunner(llm, fakeRenderer([])),
      interviewer,
    });
    expect(await runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).toBe("awaiting_input");
    await appendExpertMessage(db, id, "C. The failures come from what never reaches the model.");
    await closeInterview(db, (await db.articles.findOne({ _id: id }))!, "complete");
    // The refine attempt dies (a refusal, say) and the run fails for good.
    await db.runs.updateOne({ _id: first._id }, { $set: { status: "failed" } });

    await enqueueRun(db, { companyId: "testco", articleId: id, fromStage: "interview" });
    expect(await runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).toBe("completed");
    expect(interviewer.calls).toBe(1);
    const doc = await db.articles.findOne({ _id: id });
    expect(doc?.interview?.status).toBe("refined");
    expect(doc?.interview?.messages.some((m) => m.content.includes("never reaches the model"))).toBe(true);
    expect(doc?.artifacts.pov).toContain("## Argument Spine");
  }, 120_000);

  it("interviewMode skip never opens an interview", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "interview-skip-mode",
      folder: "2026-09-30-interview-skip-mode",
      topic: "Skip mode topic",
      targetKeyword: "context engineering",
      interviewMode: "skip",
    });
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const interviewer = new FakeInterviewer();
    const deps = makeDeps(new FakeInvoker(), {
      cfg: directCfg(),
      direct: new DirectPhaseRunner(new FakeDirectLlm(), fakeRenderer([])),
      interviewer,
    });
    expect(await runPipeline(deps, (await claimRun(db, "test-worker", 60_000))!)).toBe("completed");
    expect(interviewer.calls).toBe(0);
    const types = (await eventsAfter(db, run._id as ObjectId, 0, 500)).map((e) => e.type);
    expect(types).toContain("interview.skipped");
  }, 120_000);
});
