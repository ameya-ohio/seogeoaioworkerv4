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
import { runPipeline, type PipelineDeps } from "./pipeline.js";
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
      write: "m",
      edit: "m",
      hdcp: "m",
      schema: "m",
      design: "m",
    },
    maxTurns: { research: 1, outline: 1, interview: 1, write: 1, edit: 1, hdcp: 1, schema: 1, design: 1 },
    direct: {
      routes: { outline: "agent", interview: "agent", write: "agent", edit: "agent", hdcp: "agent", schema: "agent", design: "agent" },
      effort: { outline: "high", interview: "high", write: "high", edit: "high", hdcp: "high", schema: "high", design: "high" },
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
1. Citation #1 — section "Layers"

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
- Coverage

### H2: The Six Artifacts (≈ 300 words)
- Coverage

### H2: Markdown Over PDFs (≈ 250 words)
- Coverage

### H2: Chunk-Size Math (≈ 250 words)
- Coverage

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
      "Editor",
      "HDCP",
      "Schema Builder",
      "Header Designer",
    ]);

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
    // HDCP ran between Edit and Schema and its log is on the article.
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
    expect(events.filter((e) => e.type === "gate.passed")).toHaveLength(7);
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

  async generate(req: DirectLlmRequest): Promise<DirectLlmResponse> {
    const phase = /You are running the (\w+) phase/.exec(req.prompt)?.[1] ?? "?";
    this.calls.push({ phase, req });
    const file = (name: string, content: string) => `<file name="${name}">\n${content}\n</file>`;
    const bodies: Record<string, string> = {
      outline: file("outline.md", OUTLINE),
      interview: file("pov.md", POV) + "\n" + file("outline.md", OUTLINE.replace(/## Thesis\n[^\n]+/, `## Thesis\n${POV_THESIS}`)),
      // Fenced on purpose: the runner must unwrap a code-fenced file body.
      write:
        file("article.md", "```markdown\n" + ARTICLE + "\n```") +
        "\n" +
        file("meta.json", JSON.stringify({ title: "t", slug: "pipeline-e2e" })),
      edit: file("article.md", ARTICLE + "\n<!-- EDIT SUMMARY: no changes needed -->\n"),
      hdcp: file("article.md", ARTICLE + "\n<!-- EDIT SUMMARY: no changes needed -->\n") + "\n" + file("hdcp.md", HDCP_LOG),
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
      bodies["edit"] = file("article.md", withLink(this.anchors.edit));
      bodies["hdcp"] = file("article.md", withLink(this.anchors.hdcp)) + "\n" + file("hdcp.md", HDCP_LOG);
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
      write: "claude-sonnet-5",
      edit: "claude-sonnet-5",
      hdcp: "claude-opus-5-5",
      schema: "claude-sonnet-5",
      design: "claude-sonnet-5",
    },
    direct: {
      ...cfg.direct,
      routes: { outline: "direct", interview: "direct", write: "direct", edit: "direct", hdcp: "direct", schema: "direct", design: "direct" },
    },
  };
}

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
    expect(llm.calls.map((c) => c.phase)).toEqual(["outline", "write", "edit", "hdcp", "schema", "design"]);

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
      ["edit", "direct"],
      ["hdcp", "direct"],
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

  it("re-records links and anchors after HDCP rewrites them (D53 registry, not a gate)", async () => {
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
    // The edit gate checked the Editor's anchors; the registry holds HDCP's.
    expect(seen).toContain("edit");
    expect(seen[seen.length - 1]).toBe("hdcp");
    expect(doc?.internalLinks).toEqual([{ url, anchor: "measuring context layers" }]);
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

  it("hands the technical reviewer's findings to the Editor and stores them", async () => {
    const article = await createArticle(db, {
      companyId: "testco",
      slug: "direct-techreview",
      folder: "2026-09-14-direct-techreview",
      topic: "Tech review topic",
      targetKeyword: "context engineering",
    });
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const claimed = await claimRun(db, "test-worker", 60_000);

    const seen: string[] = [];
    const reviewer: TechReviewer = {
      review: async ({ articleMd }) => {
        seen.push(articleMd);
        return {
          ranAt: new Date(),
          model: "fake-reviewer",
          droppedUnquoted: 0,
          issues: [
            {
              kind: "technical_error",
              quote: "Four layers cover most teams.",
              problem: "The outline defines five layers.",
              fix: "Say five layers.",
            },
          ],
        };
      },
    };
    const llm = new FakeDirectLlm();
    const direct = new DirectPhaseRunner(llm, fakeRenderer([]));
    const c = { ...directCfg(), techReview: { ...cfg.techReview, enabled: true } };
    await runPipeline(makeDeps(new FakeInvoker(), { cfg: c, direct, techReviewer: reviewer }), claimed!);

    // Reviewed the Writer's draft, before the Editor touched it.
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toContain("EDIT SUMMARY");
    const editPrompt = llm.calls.find((x) => x.phase === "edit")!.req.prompt;
    expect(editPrompt).toContain('technical review (technical_error): "Four layers cover most teams."');
    const doc = await db.articles.findOne({ _id: article._id });
    expect(doc?.technicalReview?.issues).toHaveLength(1);
    expect((await db.runs.findOne({ _id: run._id }))?.status).toBe("succeeded");
  }, 120_000);

  it("runs the Editor normally when the technical review is skipped", async () => {
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
    expect(doc?.technicalReview?.skipped).toBe("stop_reason refusal");
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
  it("parks at the interview, then refines the outline from the answers and hands pov.md on", async () => {
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
    expect(llm.calls.map((c) => c.phase)).toEqual(["outline"]);
    // Parked runs stay out of the queue.
    expect(await claimRun(db, "test-worker", 60_000)).toBeNull();

    await appendExpertMessage(db, id, "C. The failures that matter come from what never reaches the model.");
    await closeInterview(db, (await db.articles.findOne({ _id: id }))!, "complete");
    const resumed = await claimRun(db, "test-worker", 60_000);
    expect(resumed?._id?.equals(run._id as ObjectId)).toBe(true);
    expect(resumed?.fromStage).toBe("interview");
    expect(await runPipeline(deps, resumed!)).toBe("completed");

    expect(interviewer.calls).toBe(1);
    expect(llm.calls.map((c) => c.phase)).toEqual(["outline", "interview", "write", "edit", "hdcp", "schema", "design"]);
    const folder = "articles/2026-09-30-interview-e2e";
    const refine = llm.calls.find((c) => c.phase === "interview")!.req;
    expect(refine.system[0]?.text).toContain("Interview Refiner");
    expect(refine.prompt).toContain(`<input path="${folder}/interview.md">`);
    expect(refine.prompt).toContain("never reaches the model");
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
