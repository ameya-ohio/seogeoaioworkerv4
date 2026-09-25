import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  analyzePlan,
  commitPlan,
  connect,
  createPlan,
  listPlanItems,
  readWorkbook,
  requestPlanEnrichment,
  suggestMapping,
  type EngineDb,
  type PlanDoc,
} from "@blogagent/engine";
import { runPlanEnrichment, type PlanDeps } from "./planRunner.js";
import type { WorkerConfig } from "./config.js";
import type { LlmClient, LlmRequest, LlmResponse } from "./llm.js";

const REAL_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FIXTURE = join(REAL_REPO, "packages", "engine", "src", "plan", "__fixtures__", "sample-plan.xlsx");
const COMPANY = "testco";

/** A well-formed answer, so the happy path needs no network. */
const goodAnswer = {
  persona: "the platform engineer who owns widget configuration",
  buying_stage: "consideration",
  required_passages: [
    "What this is, answered in the first 40 words",
    "How it differs from the neighbouring concept",
    "What the reader should change as a result",
  ],
  representative_questions: ["How do I tell these apart?"],
  differentiation_angle: "Separates two ideas the current top results conflate.",
  external_evidence: ["A dated figure from a primary source, cited to the page that states it."],
  quotable_stat_candidate: "A sourced one-sentence claim about widget exposure.",
};

class FakeLlm implements LlmClient {
  calls = 0;
  /** Queue of canned replies; the last one repeats once exhausted. */
  constructor(private readonly replies: (string | Error)[]) {}
  async complete(_req: LlmRequest): Promise<LlmResponse> {
    const reply = this.replies[Math.min(this.calls, this.replies.length - 1)];
    this.calls++;
    if (reply instanceof Error) throw reply;
    return { text: reply ?? "{}", inputTokens: 100, outputTokens: 50 };
  }
}

let mongod: MongoMemoryServer;
let db: EngineDb;
let cfg: WorkerConfig;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  db = await connect(mongod.getUri(), "plan_worker_test");
  cfg = {
    repoRoot: REAL_REPO,
    mongoUri: mongod.getUri(),
    mongoDb: "plan_worker_test",
    workerId: "test-worker",
    concurrency: 1,
    pollIntervalMs: 50,
    leaseMs: 60_000,
    heartbeatMs: 60_000,
    maxRunAttempts: 2,
    maxGateAttempts: 2,
    models: { research: "m", outline: "m", write: "m", edit: "m", schema: "m", design: "m" },
    maxTurns: { research: 1, outline: 1, write: 1, edit: 1, schema: 1, design: 1 },
    verifierModel: "fake-verifier",
    plan: { enrichModel: "fake-enrich", concurrency: 2, maxAttempts: 2 },
    schedule: { enabled: false, pollIntervalMs: 60_000, dryRun: false },
    cluster: {
      mainModel: "fake", fanoutModel: "fake", k: 5,
      maxValidations: 5, serpChecksPerTheme: 1, maxAttempts: 2,
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

beforeEach(async () => {
  await Promise.all([
    db.plans.deleteMany({}),
    db.planItems.deleteMany({}),
    db.planEvents.deleteMany({}),
  ]);
});

async function seedPlan(): Promise<PlanDoc> {
  const wb = await readWorkbook(readFileSync(FIXTURE), "sample-plan.xlsx");
  const { mapping } = suggestMapping(wb);
  const analysis = analyzePlan({ workbook: wb, mapping, companyName: "Acme" });
  const plan = await createPlan(db, {
    companyId: COMPANY,
    filename: "sample-plan.xlsx",
    sheets: wb.sheets,
    mapping,
    taxonomy: analysis.taxonomy,
    concepts: analysis.concepts,
    report: analysis.report,
  });
  await commitPlan(db, {
    companyId: COMPANY,
    planId: plan._id as ObjectId,
    items: analysis.items,
    report: analysis.report,
  });
  await requestPlanEnrichment(db, plan._id as ObjectId);
  return (await db.plans.findOne({ _id: plan._id })) as PlanDoc;
}

const deps = (llm: LlmClient): PlanDeps => ({ db, cfg, llm, log: () => {} });

describe("runPlanEnrichment", () => {
  it("enriches every item and marks the plan ready", async () => {
    const plan = await seedPlan();
    const llm = new FakeLlm([JSON.stringify(goodAnswer)]);
    await runPlanEnrichment(deps(llm), plan);

    const items = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
    expect(items).toHaveLength(9);
    expect(items.every((i) => i.enrichment === "done")).toBe(true);
    expect(items[0]?.brief.persona).toContain("platform engineer");
    expect(items[0]?.brief.h2Outline).toHaveLength(3);

    const fresh = await db.plans.findOne({ _id: plan._id });
    expect(fresh?.status).toBe("ready");
    expect(fresh?.usage.llmCalls).toBe(9);
  });

  it("re-renders the brief markdown so the Strategist sees the enriched text", async () => {
    const plan = await seedPlan();
    await runPlanEnrichment(deps(new FakeLlm([JSON.stringify(goodAnswer)])), plan);
    const item = (await listPlanItems(db, { planId: plan._id as ObjectId, limit: 1 }))[0];
    expect(item?.brief.markdown).toContain("platform engineer");
    expect(item?.brief.markdown).toContain("How it differs from the neighbouring concept");
  });

  it("never lets enrichment change the length band or schema types", async () => {
    const plan = await seedPlan();
    const before = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
    const bands = new Map(before.map((i) => [i.externalId, JSON.stringify(i.brief.lengthBand)]));
    const schemas = new Map(before.map((i) => [i.externalId, i.brief.schemaTypes.join(",")]));

    // An answer that TRIES to move them.
    const greedy = { ...goodAnswer, length_band: { min: 4000, max: 6000 }, schema: ["HowTo"] };
    await runPlanEnrichment(deps(new FakeLlm([JSON.stringify(greedy)])), plan);

    for (const i of await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 })) {
      expect(JSON.stringify(i.brief.lengthBand)).toBe(bands.get(i.externalId));
      expect(i.brief.schemaTypes.join(",")).toBe(schemas.get(i.externalId));
    }
  });

  describe("D34 — invented evidence is rejected, then degraded", () => {
    it("retries once with feedback, then keeps the deterministic brief", async () => {
      const plan = await seedPlan();
      const fabricated = JSON.stringify({
        ...goodAnswer,
        external_evidence: ["Widget exposure grew 74% in 2025"],
      });
      const llm = new FakeLlm([fabricated]); // always fabricates
      await runPlanEnrichment(deps(llm), plan);

      const items = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
      expect(items.every((i) => i.enrichment === "failed")).toBe(true);
      // Two attempts per item, never more.
      expect(llm.calls).toBe(18);
      // The deterministic brief survived intact and is still usable.
      for (const i of items) {
        expect(i.brief.markdown).toContain("# Spoke Brief:");
        expect(i.brief.evidence.external[0]?.requirement).not.toMatch(/74%/);
        expect(i.enrichmentProblems?.join(" ")).toContain("REQUIREMENTS, not facts");
      }
    });

    it("accepts a corrected answer on the retry", async () => {
      const plan = await seedPlan();
      const bad = JSON.stringify({ ...goodAnswer, external_evidence: ["90% of firms"] });
      const llm = new FakeLlm([bad, JSON.stringify(goodAnswer)]);
      await runPlanEnrichment(deps(llm), plan);
      const items = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
      // The first item retried and succeeded; the rest got the good answer.
      expect(items.filter((i) => i.enrichment === "done").length).toBeGreaterThan(0);
    });

    it("rejects a proprietary claim outside the concept allowlist", async () => {
      const plan = await seedPlan();
      const invented = JSON.stringify({
        ...goodAnswer,
        proprietary_evidence: ["Our patented zero-latency widget engine"],
      });
      await runPlanEnrichment(deps(new FakeLlm([invented])), plan);
      const items = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
      expect(items.every((i) => i.enrichment === "failed")).toBe(true);
      expect(items[0]?.enrichmentProblems?.join(" ")).toContain("supplied concept list");
    });

    it("rejects a link outside the plan", async () => {
      const plan = await seedPlan();
      const outside = JSON.stringify({ ...goodAnswer, siblings: ["A Page In Another Plan"] });
      await runPlanEnrichment(deps(new FakeLlm([outside])), plan);
      const items = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
      expect(items[0]?.enrichmentProblems?.join(" ")).toContain("only reference pages in this plan");
    });
  });

  it("marks an item failed when the call itself throws, rather than looping", async () => {
    const plan = await seedPlan();
    const llm = new FakeLlm([new Error("connection reset")]);
    await runPlanEnrichment(deps(llm), plan);
    const items = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
    expect(items.every((i) => i.enrichment === "failed")).toBe(true);
    expect(items[0]?.enrichmentProblems?.join(" ")).toContain("connection reset");
  });

  it("resumes after a mid-batch crash without redoing finished items", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;

    // Simulate a crash: three items got enriched before the worker died.
    const first = await listPlanItems(db, { planId, limit: 3 });
    await db.planItems.updateMany(
      { _id: { $in: first.map((i) => i._id as ObjectId) } },
      { $set: { enrichment: "done", enrichedAt: new Date() } },
    );

    const llm = new FakeLlm([JSON.stringify(goodAnswer)]);
    await runPlanEnrichment(deps(llm), plan);

    // Only the six still-pending items were called for.
    expect(llm.calls).toBe(6);
    const items = await listPlanItems(db, { planId, limit: 100 });
    expect(items.every((i) => i.enrichment === "done")).toBe(true);
  });

  it("re-queues only the failed items when asked", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    await runPlanEnrichment(
      deps(new FakeLlm([JSON.stringify({ ...goodAnswer, external_evidence: ["50% of firms"] })])),
      plan,
    );
    expect((await listPlanItems(db, { planId, limit: 100 })).every((i) => i.enrichment === "failed")).toBe(true);

    const n = await requestPlanEnrichment(db, planId, { onlyFailed: true });
    expect(n).toBe(9);
    const reloaded = (await db.plans.findOne({ _id: planId })) as PlanDoc;
    const llm = new FakeLlm([JSON.stringify(goodAnswer)]);
    await runPlanEnrichment(deps(llm), reloaded);
    expect((await listPlanItems(db, { planId, limit: 100 })).every((i) => i.enrichment === "done")).toBe(true);
  });

  it("emits start and finish events with the failure count", async () => {
    const plan = await seedPlan();
    await runPlanEnrichment(deps(new FakeLlm([JSON.stringify(goodAnswer)])), plan);
    const types = (await db.planEvents.find({ planId: plan._id }).toArray()).map((e) => e.type);
    expect(types).toContain("plan.enrich.started");
    expect(types).toContain("plan.enrich.succeeded");
  });
});
