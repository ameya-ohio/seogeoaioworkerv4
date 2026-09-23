import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ObjectId } from "mongodb";
import { connect, type EngineDb } from "./db.js";
import {
  computeBreadth,
  computeStability,
  computeThemeScores,
  gapScore,
  isAwarenessPlay,
  normalizeLengthBand,
  stabilityScore,
  tierForStability,
  validateArchitecture,
} from "./cluster/scoring.js";
import {
  extractJson,
  parseClusteringResponse,
  parseExpansionResponse,
  parseFanoutResponse,
  parseTypeClassification,
} from "./cluster/parse.js";
import { assembleClusterOutput, validateClusterOutput } from "./cluster/schema.js";
import { renderBriefMarkdown } from "./cluster/brief.js";
import type { ClusterDoc, FanoutSubQuery, SpokeBrief, ThemeDoc } from "./cluster/types.js";
import {
  acceptSpokeBrief,
  claimClusterRun,
  clusterEventsAfter,
  emitClusterEvent,
  enqueueClusterRun,
  failClusterRun,
  getThemesForCluster,
  replaceThemes,
  saveClusterStage,
} from "./dal/clusters.js";
import { enqueueArticlePipeline } from "./pipelineOps.js";

/**
 * Build-directive tests (roadmap 4.8): the fan-out/clustering math is
 * deterministic once generations exist — these run on fake generations,
 * before any API spend, the same fake-inputs/real-logic pattern Phase 2
 * used for the pipeline.
 */

function sq(run: number, type: FanoutSubQuery["type"], text: string): FanoutSubQuery {
  return { promptId: "p1", run, type, text, source: "simulated" };
}

describe("stability scoring (spec §3.2)", () => {
  it("stability = distinct runs the theme appeared in ÷ total runs", () => {
    const subQueries = [
      sq(1, "equivalent", "a"),
      sq(1, "specification", "b"),
      sq(3, "follow_up", "c"),
      { ...sq(3, "follow_up", "d"), promptId: "p2" },
    ];
    // Appears in runs {1, 3} of 5.
    expect(computeStability(subQueries, 5)).toBeCloseTo(0.4);
    expect(computeStability([], 5)).toBe(0);
    expect(computeStability(subQueries, 0)).toBe(0);
  });

  it("breadth = distinct sub-query types", () => {
    expect(
      computeBreadth([
        sq(1, "equivalent", "a"),
        sq(2, "equivalent", "b"),
        sq(2, "clarification", "c"),
      ]),
    ).toBe(2);
  });

  it("tier thresholds: core ≥ 0.6, secondary 0.3–0.59, noise < 0.3", () => {
    expect(tierForStability(1)).toBe("core");
    expect(tierForStability(0.6)).toBe("core");
    expect(tierForStability(0.59)).toBe("secondary");
    expect(tierForStability(0.3)).toBe("secondary");
    expect(tierForStability(0.29)).toBe("noise");
    expect(tierForStability(0)).toBe("noise");
  });

  it("stability factor is stability × 5 rounded, clamped to 1–5", () => {
    expect(stabilityScore(1)).toBe(5);
    expect(stabilityScore(0.6)).toBe(3);
    expect(stabilityScore(0.05)).toBe(1);
  });
});

describe("45-point prioritization (spec §7)", () => {
  it("weights: decisiveness ×3, gap ×2, right-to-win ×2, stability ×1, openness ×1", () => {
    const max = computeThemeScores({
      decisiveness: 5,
      gapStatus: "missing",
      rightToWin: 5,
      stability: 1,
      openness: 5,
    });
    expect(max.total).toBe(45);

    const mixed = computeThemeScores({
      decisiveness: 4,
      gapStatus: "buried",
      rightToWin: 3,
      stability: 0.6,
      openness: 2,
    });
    // 4*3 + 3*2 + 3*2 + 3 + 2 = 29
    expect(mixed.total).toBe(29);
    expect(mixed.gap).toBe(3);
  });

  it("gap points: owned 0 / buried 3 / missing 5", () => {
    expect(gapScore("owned")).toBe(0);
    expect(gapScore("buried")).toBe(3);
    expect(gapScore("missing")).toBe(5);
  });

  it("LLM factors are clamped to 1–5", () => {
    const scores = computeThemeScores({
      decisiveness: 9,
      gapStatus: "owned",
      rightToWin: 0,
      stability: 0.5,
      openness: -2,
    });
    expect(scores.decisiveness).toBe(5);
    expect(scores.rightToWin).toBe(1);
    expect(scores.openness).toBe(1);
  });

  it("right-to-win ≤ 2 flags an awareness play", () => {
    expect(isAwarenessPlay(2)).toBe(true);
    expect(isAwarenessPlay(3)).toBe(false);
  });
});

describe("architecture hard rules (spec §8)", () => {
  const base = { subQueryCount: 5 };
  it("passes a valid hub-and-spoke assignment", () => {
    const problems = validateArchitecture([
      { theme: "Pricing and ROI", tier: "core", architecture: "spoke", ...base },
      { theme: "CRM integration", tier: "secondary", architecture: "section", parentSpoke: "Pricing and ROI", ...base },
      { theme: "Analyst coverage", tier: "secondary", architecture: "off_site", ...base },
    ]);
    expect(problems).toEqual([]);
  });

  it("rejects noise-tier spokes, orphan sections, and one-page-per-sub-query", () => {
    const problems = validateArchitecture([
      { theme: "A", tier: "noise", architecture: "spoke", subQueryCount: 3 },
      { theme: "B", tier: "core", architecture: "spoke", subQueryCount: 1 },
      { theme: "C", tier: "secondary", architecture: "section", subQueryCount: 4 },
      { theme: "D", tier: "secondary", architecture: "section", parentSpoke: "Nope", subQueryCount: 4 },
    ]);
    expect(problems.some((p) => p.includes("noise-tier"))).toBe(true);
    expect(problems.some((p) => p.includes("single-sub-query"))).toBe(true);
    expect(problems.some((p) => p.includes('section "C" has no parent'))).toBe(true);
    expect(problems.some((p) => p.includes('"Nope", which is not a spoke'))).toBe(true);
  });

  it("requires at least one spoke", () => {
    const problems = validateArchitecture([
      { theme: "A", tier: "core", architecture: "section", parentSpoke: "A", subQueryCount: 3 },
    ]);
    expect(problems.some((p) => p.includes("at least one spoke"))).toBe(true);
  });
});

describe("length band (D31)", () => {
  it("defaults to 800–2,000 and snaps unjustified outliers back", () => {
    expect(normalizeLengthBand({})).toEqual({ min: 800, max: 2000 });
    expect(normalizeLengthBand({ min: 3000, max: 4500 })).toEqual({ min: 800, max: 2000 });
    expect(normalizeLengthBand({ min: 2500, max: 3500, justification: "genuine comparison depth" }))
      .toEqual({ min: 2500, max: 3500, justification: "genuine comparison depth" });
    expect(normalizeLengthBand({ min: 900, max: 1500 })).toEqual({ min: 900, max: 1500 });
  });
});

describe("LLM response parsing", () => {
  it("extractJson handles fences, prose, and trailing text", () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n{"a": [1, 2]} — hope that helps!')).toEqual({ a: [1, 2] });
    expect(extractJson("[1, 2, 3] trailing")).toEqual([1, 2, 3]);
    expect(extractJson("no json here")).toBeUndefined();
  });

  it("parseExpansionResponse enforces prompt minimums and unique ids", () => {
    const good = parseExpansionResponse(
      JSON.stringify({
        terms: Array.from({ length: 15 }, (_, i) => ({
          term: `term ${i}`,
          category: "entity",
          intent: "informational",
        })),
        prompts: Array.from({ length: 6 }, (_, i) => ({
          id: `p${i + 1}`,
          text: `prompt ${i}`,
          persona: "VP Sales",
          stage: "solution-aware",
        })),
      }),
    );
    expect(good.value?.prompts).toHaveLength(6);
    expect(good.problems).toEqual([]);

    const bad = parseExpansionResponse(JSON.stringify({ terms: [], prompts: [{ id: "p1", text: "only one" }] }));
    expect(bad.value).toBeUndefined();
    expect(bad.problems.some((p) => p.includes("prompts"))).toBe(true);
  });

  it("parseFanoutResponse normalizes types and rejects empties", () => {
    const parsed = parseFanoutResponse(
      JSON.stringify([
        { text: "ai sdr pricing", type: "Follow-up" },
        { text: "autonomous sdr agent", type: "canonicalization" },
        { text: "bogus type", type: "nonsense" },
      ]),
    );
    expect(parsed.value).toEqual([
      { text: "ai sdr pricing", type: "follow_up" },
      { text: "autonomous sdr agent", type: "canonicalization" },
      { text: "bogus type", type: "equivalent" },
    ]);
    expect(parseFanoutResponse("{}").problems.length).toBeGreaterThan(0);
  });

  it("parseTypeClassification aligns with input order and pads safely", () => {
    const parsed = parseTypeClassification(JSON.stringify(["specification", "entailment"]), 3);
    expect(parsed.value).toEqual(["specification", "entailment", "equivalent"]);
  });

  it("parseQuestionsResponse accepts an explicitly empty list (honest refusal)", async () => {
    const { parseQuestionsResponse } = await import("./cluster/parse.js");
    const empty = parseQuestionsResponse('```json\n{"questions": []}\n```\nNo relevant input.');
    expect(empty.value).toEqual([]);
    expect(empty.problems).toEqual([]);
    expect(parseQuestionsResponse("no json at all").problems.length).toBeGreaterThan(0);
    const malformed = parseQuestionsResponse('{"questions": [{"nope": 1}]}');
    expect(malformed.value).toBeUndefined();
    expect(malformed.problems[0]).toContain("none had text + theme");
  });

  it("parseClusteringResponse drops out-of-range indexes and duplicate names", () => {
    const parsed = parseClusteringResponse(
      JSON.stringify({
        themes: [
          { name: "Pricing and ROI", sub_query_indexes: [0, 2, 99] },
          { name: "pricing and roi", sub_query_indexes: [1] },
          { name: "Empty", sub_query_indexes: [] },
        ],
      }),
      3,
    );
    expect(parsed.value).toEqual([{ name: "Pricing and ROI", subQueryIndexes: [0, 2] }]);
    expect(parsed.problems.some((p) => p.includes("duplicate"))).toBe(true);
    expect(parsed.problems.some((p) => p.includes('"Empty"'))).toBe(true);
  });
});

function fakeBrief(themeName: string): SpokeBrief {
  const brief: Omit<SpokeBrief, "markdown"> = {
    themeName,
    workingTitle: `The real cost of ${themeName}`,
    primaryQueryTarget: "ai sdr pricing",
    persona: "VP Sales",
    buyingStage: "vendor-evaluation",
    representativeSubQueries: [`${themeName} pricing`, `${themeName} roi calculator`],
    h2Outline: [`What does ${themeName} cost?`, "How do teams measure ROI?", "Which pricing model fits?"],
    evidence: {
      proprietary: ["Customer benchmark: 34% reply-rate lift"],
      external: [{ requirement: "Named analyst pricing stat", sourceUrl: "https://example.com/stat" }],
      quotableStatCandidate: "34% median reply-rate lift across 120 customers",
    },
    differentiationAngle: "Publishes real pricing math instead of 'contact us'",
    internalLinks: { hub: "hub-page", siblings: [] },
    lengthBand: { min: 800, max: 2000 },
    schemaTypes: ["Article"],
    priorityScore: 38,
  };
  return { ...brief, markdown: renderBriefMarkdown(brief) };
}

function fakeThemes(clusterId: ObjectId): Omit<ThemeDoc, "_id" | "companyId" | "clusterId" | "createdAt" | "updatedAt">[] {
  return [
    {
      name: "Pricing and ROI",
      stability: 0.8,
      breadth: 4,
      tier: "core",
      subQueries: [sq(1, "follow_up", "ai sdr pricing"), sq(2, "specification", "ai sdr cost per seat")],
      mappedQuestions: [{ text: "How much do AI SDRs cost?", source: "simulated", qType: "cost_roi" }],
      gapStatus: "missing",
      scores: { decisiveness: 5, gap: 5, rightToWin: 4, stability: 4, openness: 3, total: 40 },
      rationale: { decisiveness: "directly changes vendor choice" },
      architecture: "spoke",
    },
    {
      name: "CRM integration",
      stability: 0.4,
      breadth: 2,
      tier: "secondary",
      subQueries: [sq(1, "specification", "ai sdr hubspot integration"), sq(4, "entailment", "crm sync limits")],
      mappedQuestions: [],
      gapStatus: "buried",
      scores: { decisiveness: 4, gap: 3, rightToWin: 3, stability: 2, openness: 3, total: 29 },
      rationale: {},
      architecture: "section",
      parentSpoke: "Pricing and ROI",
    },
  ];
}

describe("output schema validation (spec §Output Schema)", () => {
  it("accepts an assembled output and pinpoints missing pieces", () => {
    const cluster = {
      seed: "ai sdr tools",
      prompts: [{ id: "p1", text: "best ai sdr for hubspot shops", persona: "VP Sales", stage: "vendor-evaluation" }],
      hub: { title: "AI SDR tools", themeSummaries: [{ theme: "Pricing and ROI", summary: "What it costs." }] },
      spokeBriefs: [fakeBrief("Pricing and ROI")],
    } as unknown as ClusterDoc;
    const themes = fakeThemes(undefined as unknown as ObjectId).map((t) => ({
      ...t,
      companyId: "testco",
      clusterId: undefined as unknown as ObjectId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as ThemeDoc[];

    const output = assembleClusterOutput(cluster, themes);
    expect(validateClusterOutput(output)).toEqual([]);

    // Every sub-query in the output carries its source tag (guardrail).
    const outThemes = output["themes"] as { sub_queries: { source?: string; run?: number }[] }[];
    for (const t of outThemes) {
      for (const s of t.sub_queries) {
        expect(s.source).toBeTruthy();
        expect(typeof s.run).toBe("number");
      }
    }

    const broken = { ...output, hub: { title: "", theme_summaries: [] } };
    const problems = validateClusterOutput(broken as Record<string, unknown>);
    expect(problems.some((p) => p.includes("hub.title"))).toBe(true);
    expect(problems.some((p) => p.includes("theme_summaries"))).toBe(true);
  });
});

describe("cluster DAL + 4.12 integration", () => {
  let mongod: MongoMemoryServer;
  let db: EngineDb;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    db = await connect(mongod.getUri(), "cluster_test");
  }, 120_000);

  afterAll(async () => {
    await db?.close();
    await mongod?.stop();
  });

  it("enqueue → claim → stage save → retry keeps completed stages", async () => {
    const cluster = await enqueueClusterRun(db, {
      companyId: "testco",
      seed: "ai sdr tools",
      models: { main: "claude-sonnet-5", fanout: "claude-haiku-4-5-20251001" },
    });
    const id = cluster._id as ObjectId;
    expect(cluster.status).toBe("queued");
    expect(cluster.k).toBe(5);

    const claimed = await claimClusterRun(db, "worker-a", 60_000);
    expect(claimed?._id?.toHexString()).toBe(id.toHexString());
    expect(await claimClusterRun(db, "worker-b", 60_000)).toBeNull();

    await saveClusterStage(db, id, "expansion", "fanout", {
      prompts: [{ id: "p1", text: "x", persona: "y", stage: "z" }],
    });
    const requeued = await failClusterRun(db, id, "fanout blew up");
    expect(requeued).toBe("requeued");
    const after = await db.clusters.findOne({ _id: id });
    expect(after?.status).toBe("queued");
    expect(after?.completedStages).toContain("expansion");
    expect(after?.stage).toBe("fanout");

    await claimClusterRun(db, "worker-a", 60_000);
    expect(await failClusterRun(db, id, "again")).toBe("failed");
  });

  it("event stream is ordered per cluster", async () => {
    const cluster = await enqueueClusterRun(db, {
      companyId: "testco",
      seed: "events seed",
      models: { main: "m", fanout: "f" },
    });
    const id = cluster._id as ObjectId;
    await emitClusterEvent(db, { companyId: "testco", clusterId: id, type: "stage.started", message: "expansion" });
    await emitClusterEvent(db, { companyId: "testco", clusterId: id, type: "stage.succeeded", message: "expansion done" });
    const events = await clusterEventsAfter(db, id);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]); // queued + 2
  });

  it("acceptSpokeBrief lands a linked library idea; enqueue stamps the brief (4.12)", async () => {
    const cluster = await enqueueClusterRun(db, {
      companyId: "testco",
      seed: "ai sdr tools accept",
      models: { main: "m", fanout: "f" },
    });
    const id = cluster._id as ObjectId;
    const themes = await replaceThemes(db, id, "testco", fakeThemes(id));
    expect(themes).toHaveLength(2);
    await db.clusters.updateOne({ _id: id }, { $set: { spokeBriefs: [fakeBrief("Pricing and ROI")] } });

    const { keyword, theme } = await acceptSpokeBrief(db, {
      companyId: "testco",
      clusterId: id,
      themeName: "Pricing and ROI",
    });
    expect(keyword.status).toBe("idea");
    expect(keyword.source).toBe("agent");
    // D32: the keyword is the brief's natural query target, never a sub-query.
    expect(keyword.text).toBe("ai sdr pricing");
    expect(keyword.themeId?.toHexString()).toBe(theme._id?.toHexString());
    expect(keyword.priority).toBe(38);

    // Accepting twice is idempotent on the keyword text.
    const again = await acceptSpokeBrief(db, { companyId: "testco", clusterId: id, themeName: "Pricing and ROI" });
    expect(again.keyword._id?.toHexString()).toBe(keyword._id?.toHexString());

    const { article } = await enqueueArticlePipeline(db, {
      companyId: "testco",
      topic: "The real cost of Pricing and ROI",
      keyword: keyword.text,
      themeId: theme._id as ObjectId,
    });
    expect(article.brief?.themeName).toBe("Pricing and ROI");
    expect(article.brief?.lengthBand).toEqual({ min: 800, max: 2000 });
    expect(article.brief?.markdown).toContain("Answer-first requirement");

    const themesSorted = await getThemesForCluster(db, id);
    expect(themesSorted[0]?.name).toBe("Pricing and ROI");
  });
});
