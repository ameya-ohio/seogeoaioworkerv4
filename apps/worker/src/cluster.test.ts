import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ObjectId } from "mongodb";
import {
  acceptSpokeBrief,
  claimClusterRun,
  clusterEventsAfter,
  connect,
  enqueueArticlePipeline,
  enqueueClusterRun,
  getThemesForCluster,
  type EngineDb,
} from "@blogagent/engine";
import { runCluster, type ClusterDeps } from "./clusterRunner.js";
import type { LlmClient, LlmRequest, LlmResponse } from "./llm.js";
import type { WorkerConfig } from "./config.js";
import { phaseDefs } from "./phases.js";
import { materializeWorkspace } from "./workspace.js";

const REAL_REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Full cluster-run E2E with a fake LLM and no SERP client: fake generations,
 * REAL clustering math / tier thresholds / architecture rules / output gate —
 * the Phase-2 fake-agents-real-gates pattern applied to 4C (roadmap 4.8
 * build directive). Zero API spend.
 */

// Deterministic fake fan-out per run number:
//   run 1: pricing + integration + real-estate   (3 sub-queries)
//   run 2: pricing + integration                 (2)
//   runs 3–5: pricing only                       (1)
// → stability: pricing 1.0 (core), integration 0.4 (secondary), real-estate 0.2 (noise)
const FANOUT_BY_RUN: Record<number, { text: string; type: string }[]> = {
  1: [
    { text: "ai sdr pricing", type: "follow_up" },
    { text: "ai sdr hubspot integration", type: "specification" },
    { text: "ai sdr for real estate", type: "specification" },
  ],
  2: [
    { text: "ai sdr pricing", type: "follow_up" },
    { text: "ai sdr hubspot integration", type: "entailment" },
  ],
  3: [{ text: "ai sdr pricing", type: "clarification" }],
  4: [{ text: "ai sdr pricing", type: "follow_up" }],
  5: [{ text: "ai sdr pricing", type: "follow_up" }],
};

const THEME_BY_TEXT: Record<string, string> = {
  "ai sdr pricing": "Pricing and ROI",
  "ai sdr hubspot integration": "CRM integration",
  "ai sdr for real estate": "Vertical use cases",
};

class FakeLlm implements LlmClient {
  archCalls = 0;
  calls = 0;

  private json(value: unknown): LlmResponse {
    return { text: JSON.stringify(value), inputTokens: 100, outputTokens: 50 };
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    const p = req.prompt;

    if (p.includes("TASK — Phase 0 + Phase 1")) {
      return this.json({
        terms: Array.from({ length: 16 }, (_, i) => ({
          term: `term ${i}`,
          category: "entity",
          intent: "informational",
        })),
        prompts: Array.from({ length: 6 }, (_, i) => ({
          id: `p${i + 1}`,
          text: `best ai sdr tools for a ${100 + i}-person saas team vs hiring sdrs`,
          persona: "VP Sales",
          stage: "vendor-evaluation",
        })),
      });
    }

    if (p.includes("Fan-Out Generation")) {
      expect(req.model).toBe("fake-fanout"); // bulk generation on the cheap tier (D26)
      const run = Number(/run (\d+) of \d+/.exec(p)?.[1] ?? 0);
      return this.json(FANOUT_BY_RUN[run] ?? []);
    }

    if (p.includes("TASK — Phase 3.1 only")) {
      // The runner lists UNIQUE sub-queries (dedupe guard against the
      // output-token ceiling); group them by text like a real model would.
      const byTheme = new Map<string, number[]>();
      const lines = [...p.matchAll(/^(\d+): \[runs [^\]]+\] \[types [^\]]+\] (.+)$/gm)];
      expect(lines).toHaveLength(3); // 527-entry-style logs collapse to uniques
      for (const m of lines) {
        const theme = THEME_BY_TEXT[(m[2] as string).trim()];
        if (!theme) continue;
        const list = byTheme.get(theme) ?? [];
        list.push(Number(m[1]));
        byTheme.set(theme, list);
      }
      return this.json({
        themes: [...byTheme.entries()].map(([name, idx]) => ({ name, sub_query_indexes: idx })),
      });
    }

    if (p.includes("TASK — Phase 4 only")) {
      expect(p).toContain("No live PAA/community access is available");
      return this.json({
        questions: [
          { text: "How much do AI SDR tools cost?", type: "cost_roi", theme: "Pricing and ROI" },
          { text: "Does an AI SDR integrate with HubSpot?", type: "how", theme: "CRM integration" },
          { text: "How do security teams review AI SDR vendors?", type: "how", theme: "NEW: Security review" },
        ],
      });
    }

    if (p.includes("TASK — Phase 6 only")) {
      expect(p).toContain("Security review"); // question-mined theme reaches the gap map
      return this.json({
        themes: [
          { theme: "Pricing and ROI", gap_status: "missing" },
          { theme: "CRM integration", gap_status: "buried", owner_asset: "old integrations post" },
          { theme: "Vertical use cases", gap_status: "missing" },
          { theme: "Security review", gap_status: "missing", non_blog_asset: "security/trust page" },
        ],
      });
    }

    if (p.includes("TASK — Phase 7 only")) {
      return this.json({
        themes: [
          {
            theme: "Pricing and ROI",
            decisiveness: 5,
            right_to_win: 4,
            openness: 5, // must be overridden to 3 — validation was skipped
            rationale: { decisiveness: "cost decides vendors", right_to_win: "own pricing data", openness: "fabricated claim" },
          },
          { theme: "CRM integration", decisiveness: 4, right_to_win: 3, openness: 3, rationale: {} },
          { theme: "Vertical use cases", decisiveness: 2, right_to_win: 2, openness: 3, rationale: {} },
          { theme: "Security review", decisiveness: 3, right_to_win: 2, openness: 3, rationale: {} },
        ],
      });
    }

    if (p.includes("TASK — Phase 8 only")) {
      this.archCalls += 1;
      if (this.archCalls === 1) {
        // Breaks two hard rules: noise theme as spoke, section with no parent.
        return this.json({
          assignments: [
            { theme: "Pricing and ROI", architecture: "spoke" },
            { theme: "Vertical use cases", architecture: "spoke" },
            { theme: "CRM integration", architecture: "section" },
            { theme: "Security review", architecture: "non_blog" },
          ],
          hub: { title: "AI SDR tools", theme_summaries: [{ theme: "Pricing and ROI", summary: "s" }] },
        });
      }
      expect(p).toContain("FEEDBACK");
      return this.json({
        assignments: [
          { theme: "Pricing and ROI", architecture: "spoke" },
          { theme: "Vertical use cases", architecture: "section", parent_spoke: "Pricing and ROI" },
          { theme: "CRM integration", architecture: "section", parent_spoke: "Pricing and ROI" },
          { theme: "Security review", architecture: "non_blog" },
        ],
        hub: {
          title: "AI SDR tools: what they do and what they cost",
          theme_summaries: [
            { theme: "Pricing and ROI", summary: "What AI SDRs cost and how ROI is measured in practice." },
            { theme: "CRM integration", summary: "How AI SDRs plug into HubSpot and the rest of the stack." },
          ],
        },
      });
    }

    if (p.includes("TASK — Phase 9 only")) {
      expect(p).toContain("primary_query_target");
      return this.json({
        working_title: "AI SDR pricing: what you actually pay in 2026",
        primary_query_target: "ai sdr pricing",
        query_target_alternates: ["ai sdr cost", "ai sdr pricing model"],
        persona: "VP Sales",
        buying_stage: "vendor-evaluation",
        h2_outline: [
          "How much do AI SDR tools cost?",
          "What drives AI SDR pricing up or down?",
          "How do teams measure AI SDR ROI?",
        ],
        evidence: {
          proprietary: ["Customer benchmark from company context"],
          external: [{ requirement: "Named analyst pricing benchmark — writer must source" }],
          quotable_stat_candidate: "Median cost per qualified meeting across customer base",
        },
        differentiation_angle: "Publishes real pricing math instead of contact-us walls",
        internal_links: { siblings: ["CRM integration"] }, // not a spoke → must be filtered out
        length_band: { min: 3000, max: 4500 }, // unjustified → snapped to 800–2000
        schema: ["Article"],
      });
    }

    throw new Error(`FakeLlm: unexpected prompt: ${p.slice(0, 120)}`);
  }
}

let mongod: MongoMemoryServer;
let db: EngineDb;
let repoRoot: string;
let cfg: WorkerConfig;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  db = await connect(mongod.getUri(), "cluster_e2e_test");
  repoRoot = mkdtempSync(join(tmpdir(), "blogagent-cluster-"));
  for (const dir of ["scripts", "standards", "templates", "agents", "config"]) {
    symlinkSync(join(REAL_REPO, dir), join(repoRoot, dir));
  }
  writeFileSync(join(repoRoot, "CLAUDE.md"), "# test repo\n");
  mkdirSync(join(repoRoot, "articles"));
  mkdirSync(join(repoRoot, "context", "sales"), { recursive: true });
  writeFileSync(
    join(repoRoot, "context", "sales", "icp.md"),
    "# ICP\nMid-market SaaS sales leaders. Proof: customer benchmark of reply-rate lift.\n",
  );

  cfg = {
    repoRoot,
    mongoUri: mongod.getUri(),
    mongoDb: "cluster_e2e_test",
    workerId: "test-worker",
    concurrency: 1,
    pollIntervalMs: 50,
    leaseMs: 60_000,
    heartbeatMs: 60_000,
    maxRunAttempts: 2,
    maxGateAttempts: 2,
    models: { research: "m", outline: "m", write: "m", edit: "m", schema: "m", design: "m" },
    maxTurns: { research: 1, outline: 1, write: 1, edit: 1, schema: 1, design: 1 },
    direct: {
      routes: { outline: "agent", write: "agent", edit: "agent", schema: "agent", design: "agent" },
      effort: { outline: "high", write: "high", edit: "high", schema: "high", design: "high" },
      maxTokens: 64_000,
    },
    verifierModel: "fake-verifier",
    plan: { enrichModel: "fake-enrich", concurrency: 2, maxAttempts: 2 },
    schedule: { enabled: false, pollIntervalMs: 60000, dryRun: false },
    cluster: {
      mainModel: "fake-main",
      fanoutModel: "fake-fanout",
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

describe("cluster run E2E (fake LLM, real math + gates)", () => {
  it("runs all stages and lands validated themes, hub, and briefs", async () => {
    const fake = new FakeLlm();
    const deps: ClusterDeps = {
      db,
      cfg,
      llm: fake,
      observer: null, // simulated mode
      serpClient: null, // validation must record skipped
      serpSandbox: false,
      market: { locationCode: 2840, languageCode: "en" },
      companyName: "Test Co",
      log: () => {},
    };
    const queued = await enqueueClusterRun(db, {
      companyId: "testco",
      seed: "ai sdr tools",
      k: cfg.cluster.k,
      models: { main: cfg.cluster.mainModel, fanout: cfg.cluster.fanoutModel },
      maxAttempts: cfg.cluster.maxAttempts,
    });
    const claimed = await claimClusterRun(db, cfg.workerId, cfg.leaseMs);
    expect(claimed?._id?.toHexString()).toBe(queued._id?.toHexString());

    await runCluster(deps, claimed ?? queued);

    const cluster = await db.clusters.findOne({ _id: queued._id });
    expect(cluster?.status).toBe("succeeded");
    expect(cluster?.stage).toBe("done");
    expect(cluster?.mode).toBe("simulated");
    expect(cluster?.prompts).toHaveLength(6);
    // 6 prompts × (3+2+1+1+1) sub-queries across K=5 runs.
    expect(cluster?.generations).toHaveLength(48);
    for (const sq of cluster?.generations ?? []) {
      expect(sq.source).toBe("simulated"); // every data point labeled (guardrail)
      expect(sq.promptId).toMatch(/^p\d$/);
      expect(sq.run).toBeGreaterThanOrEqual(1);
      expect(sq.run).toBeLessThanOrEqual(5);
    }
    expect(cluster?.usage.llmCalls).toBe(fake.calls);
    expect(cluster?.usage.dataForSeoCalls).toBe(0);

    const themes = await getThemesForCluster(db, queued._id as ObjectId);
    const byName = new Map(themes.map((t) => [t.name, t]));
    expect(byName.get("Pricing and ROI")?.stability).toBe(1);
    expect(byName.get("Pricing and ROI")?.tier).toBe("core");
    expect(byName.get("CRM integration")?.stability).toBeCloseTo(0.4);
    expect(byName.get("CRM integration")?.tier).toBe("secondary");
    expect(byName.get("Vertical use cases")?.stability).toBeCloseTo(0.2);
    expect(byName.get("Vertical use cases")?.tier).toBe("noise");
    expect(byName.get("Security review")?.questionMined).toBe(true);

    // Validation skipped (no DataForSEO) → openness forced to neutral 3.
    const pricing = byName.get("Pricing and ROI");
    expect(pricing?.validation?.skipped).toContain("no DataForSEO");
    expect(pricing?.scores?.openness).toBe(3);
    expect(pricing?.rationale?.["openness"]).toContain("neutral default");
    // decisiveness 5×3 + gap 5×2 + rtw 4×2 + stability 5 + openness 3 = 41
    expect(pricing?.scores?.total).toBe(41);
    expect(pricing?.awarenessPlay).toBe(false);
    expect(byName.get("Vertical use cases")?.awarenessPlay).toBe(true);

    // Architecture passed only after the hard-rule feedback retry.
    expect(fake.archCalls).toBe(2);
    expect(pricing?.architecture).toBe("spoke");
    expect(byName.get("CRM integration")?.parentSpoke).toBe("Pricing and ROI");
    expect(byName.get("Security review")?.architecture).toBe("non_blog");

    // Brief: D31 band snapped, non-spoke sibling filtered, markdown rendered.
    expect(cluster?.spokeBriefs).toHaveLength(1);
    const brief = cluster?.spokeBriefs?.[0];
    expect(brief?.themeName).toBe("Pricing and ROI");
    expect(brief?.lengthBand).toEqual({ min: 800, max: 2000 });
    expect(brief?.internalLinks.siblings).toEqual([]);
    expect(brief?.priorityScore).toBe(41);
    expect(brief?.markdown).toContain("Answer-first requirement");

    // Output passed the schema gate and events tell the story.
    expect(cluster?.outputProblems).toEqual([]);
    expect((cluster?.output?.["themes"] as unknown[]).length).toBe(4);
    const events = await clusterEventsAfter(db, queued._id as ObjectId);
    const types = events.map((e) => e.type);
    expect(types).toContain("cluster.started");
    expect(types).toContain("cluster.succeeded");
    expect(types.filter((t) => t === "stage.succeeded")).toHaveLength(9);
  }, 60_000);

  it("hands the accepted brief to the Strategist (4.12)", async () => {
    const cluster = await db.clusters.findOne({ seed: "ai sdr tools" });
    const { keyword, theme } = await acceptSpokeBrief(db, {
      companyId: "testco",
      clusterId: cluster?._id as ObjectId,
      themeName: "Pricing and ROI",
    });
    expect(keyword.text).toBe("ai sdr pricing");
    expect(keyword.status).toBe("idea");

    const { article } = await enqueueArticlePipeline(db, {
      companyId: "testco",
      topic: "AI SDR pricing: what you actually pay in 2026",
      keyword: keyword.text,
      themeId: theme._id as ObjectId,
    });
    expect(article.brief?.themeName).toBe("Pricing and ROI");

    // The workspace materializes brief.md and the outline prompt points at it
    // with the D31 length-band override.
    await materializeWorkspace(cfg, article);
    const briefPath = join(repoRoot, "articles", article.folder, "brief.md");
    expect(existsSync(briefPath)).toBe(true);
    expect(readFileSync(briefPath, "utf-8")).toContain("Spoke Brief");

    const prompt = phaseDefs(cfg).outline.buildPrompt({
      article,
      cfg,
      companyName: "Test Co",
    });
    expect(prompt).toContain("brief.md");
    expect(prompt).toContain("SPOKE BRIEF");
    expect(prompt).toContain("800–2000 words");
    expect(prompt).toContain("INSTEAD of the SERP-median rule");
  });
});
