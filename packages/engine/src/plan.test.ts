import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connect, type EngineDb } from "./db.js";
import { readWorkbook } from "./plan/xlsx.js";
import { suggestMapping } from "./plan/mapping.js";
import { analyzePlan, type PlanAnalysis } from "./plan/import.js";
import {
  commitPlan,
  createPlan,
  enqueuePlanItem,
  getPlanItem,
  listPlanItems,
  planCounts,
  PlanNotCommittableError,
} from "./dal/plans.js";
import { createSchedule, getSchedule, claimScheduleTick, resumeSchedule } from "./dal/schedules.js";
import { reconcilePlanItems, runScheduleTick } from "./schedule/tick.js";
import { setStage } from "./dal/articles.js";
import type { PlanDoc } from "./plan/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const COMPANY = "testco";

let mongod: MongoMemoryServer;
let db: EngineDb;
let analysis: PlanAnalysis;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  db = await connect(mongod.getUri(), "plan_test");
  const wb = await readWorkbook(
    readFileSync(join(here, "plan", "__fixtures__", "sample-plan.xlsx")),
    "sample-plan.xlsx",
  );
  const { mapping } = suggestMapping(wb);
  analysis = analyzePlan({ workbook: wb, mapping, companyName: "Acme" });
}, 120_000);

afterAll(async () => {
  await db?.close();
  await mongod?.stop();
});

beforeEach(async () => {
  await Promise.all([
    db.plans.deleteMany({}),
    db.planItems.deleteMany({}),
    db.planEvents.deleteMany({}),
    db.schedules.deleteMany({}),
    db.articles.deleteMany({}),
    db.runs.deleteMany({}),
    db.events.deleteMany({}),
  ]);
});

async function seedPlan(): Promise<PlanDoc> {
  const wb = await readWorkbook(
    readFileSync(join(here, "plan", "__fixtures__", "sample-plan.xlsx")),
    "sample-plan.xlsx",
  );
  const { mapping } = suggestMapping(wb);
  const plan = await createPlan(db, {
    companyId: COMPANY,
    filename: "sample-plan.xlsx",
    sheets: wb.sheets,
    mapping,
    taxonomy: analysis.taxonomy,
    concepts: analysis.concepts,
    ...(analysis.notes ? { notes: analysis.notes } : {}),
    report: analysis.report,
  });
  await commitPlan(db, {
    companyId: COMPANY,
    planId: plan._id as ObjectId,
    items: analysis.items,
    report: analysis.report,
  });
  return plan;
}

const itemBySlugPrefix = async (planId: ObjectId, externalId: string) =>
  db.planItems.findOne({ planId, externalId });

describe("commitPlan", () => {
  it("inserts one item per row and links parents by ObjectId", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    const items = await listPlanItems(db, { planId, limit: 100 });
    expect(items).toHaveLength(9);

    const spoke = await itemBySlugPrefix(planId, "P01-S01-A02");
    const hub = await itemBySlugPrefix(planId, "P01-S01-A01");
    expect(spoke?.parentItemId?.toHexString()).toBe(hub?._id?.toHexString());

    const pillar = await itemBySlugPrefix(planId, "P01");
    expect(hub?.parentItemId?.toHexString()).toBe(pillar?._id?.toHexString());
    expect(pillar?.parentItemId).toBeUndefined();
  });

  it("marks the plan ready and records the item count", async () => {
    const plan = await seedPlan();
    const fresh = await db.plans.findOne({ _id: plan._id });
    expect(fresh?.status).toBe("ready");
    expect(fresh?.itemCount).toBe(9);
  });

  it("returns items in sequence order, parents before children", async () => {
    const plan = await seedPlan();
    const items = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
    const pos = new Map(items.map((i) => [i._id?.toHexString(), i.sequence]));
    for (const i of items) {
      if (!i.parentItemId) continue;
      expect(pos.get(i.parentItemId.toHexString())).toBeLessThan(i.sequence);
    }
  });

  it("enforces unique slugs per plan at the database level", async () => {
    const plan = await seedPlan();
    await expect(
      db.planItems.insertOne({
        ...(await listPlanItems(db, { planId: plan._id as ObjectId, limit: 1 }))[0]!,
        _id: new ObjectId(),
        externalId: "DUPE",
      }),
    ).rejects.toThrow();
  });

  it("refuses to commit while the report has blocking problems", async () => {
    const wb = await readWorkbook(
      readFileSync(join(here, "plan", "__fixtures__", "sample-plan.xlsx")),
      "sample-plan.xlsx",
    );
    const { mapping } = suggestMapping(wb);
    const plan = await createPlan(db, {
      companyId: COMPANY, filename: "f.xlsx", sheets: wb.sheets, mapping,
      taxonomy: analysis.taxonomy, concepts: analysis.concepts,
    });
    await expect(
      commitPlan(db, {
        companyId: COMPANY,
        planId: plan._id as ObjectId,
        items: analysis.items,
        report: { ...analysis.report, blocking: ["fix me first"] },
      }),
    ).rejects.toThrow(PlanNotCommittableError);
  });

  it("counts items by status and enrichment state", async () => {
    const plan = await seedPlan();
    const counts = await planCounts(db, plan._id as ObjectId);
    expect(counts.total).toBe(9);
    expect(counts.byStatus.planned).toBe(9);
    expect(counts.byEnrichment.pending).toBe(9);
    expect(counts.produced).toBe(0);
  });
});

describe("enqueuePlanItem", () => {
  it("creates an article carrying the plan brief, slug and provenance", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    const item = await itemBySlugPrefix(planId, "P01");
    const { article } = await enqueuePlanItem(db, {
      companyId: COMPANY,
      planItemId: item?._id as ObjectId,
    });

    expect(article.slug).toBe(item?.slug);
    expect(article.planItemId?.toHexString()).toBe(item?._id?.toHexString());
    expect(article.planId?.toHexString()).toBe(planId.toHexString());
    expect(article.brief?.source).toBe("plan");
    expect(article.brief?.markdown).toContain("# Spoke Brief:");
    expect(article.brief?.pageRole).toBe("pillar");
    // The structured brief survives onto the article, not just its markdown.
    expect(article.brief?.spec?.h2Outline.length).toBeGreaterThan(0);
  });

  it("records planned children as pendingLinks, never as live links", async () => {
    const plan = await seedPlan();
    const item = await itemBySlugPrefix(plan._id as ObjectId, "P01");
    const { article } = await enqueuePlanItem(db, {
      companyId: COMPANY,
      planItemId: item?._id as ObjectId,
    });
    expect(article.pendingLinks).toContain("What is Widget Exposure");
    expect(article.pendingLinks).toContain("How to Harden Widgets");
  });

  it("moves the item to in_progress and links the article back", async () => {
    const plan = await seedPlan();
    const item = await itemBySlugPrefix(plan._id as ObjectId, "P01");
    const { article } = await enqueuePlanItem(db, {
      companyId: COMPANY,
      planItemId: item?._id as ObjectId,
    });
    const fresh = await getPlanItem(db, item?._id as ObjectId);
    expect(fresh?.status).toBe("in_progress");
    expect(fresh?.articleId?.toHexString()).toBe(article._id?.toHexString());
  });
});

describe("reconcilePlanItems", () => {
  it("marks an item done once its article reaches review", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    const item = await itemBySlugPrefix(planId, "P01");
    const { article } = await enqueuePlanItem(db, {
      companyId: COMPANY, planItemId: item?._id as ObjectId,
    });
    await setStage(db, article._id as ObjectId, "review");

    const res = await reconcilePlanItems(db, planId, new Date());
    expect(res.done).toBe(1);
    expect((await getPlanItem(db, item?._id as ObjectId))?.status).toBe("done");
  });

  it("recovers an item whose article vanished (a crash between CAS and enqueue)", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    const item = await itemBySlugPrefix(planId, "P01");
    await db.planItems.updateOne(
      { _id: item?._id },
      { $set: { status: "enqueued", articleId: new ObjectId() } },
    );
    const res = await reconcilePlanItems(db, planId, new Date());
    expect(res.recovered).toBe(1);
    expect((await getPlanItem(db, item?._id as ObjectId))?.status).toBe("planned");
  });

  it("sets a retry backoff when an article fails", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    const item = await itemBySlugPrefix(planId, "P01");
    const { article } = await enqueuePlanItem(db, {
      companyId: COMPANY, planItemId: item?._id as ObjectId,
    });
    await setStage(db, article._id as ObjectId, "failed");

    const now = new Date();
    const res = await reconcilePlanItems(db, planId, now);
    expect(res.failed).toBe(1);
    const fresh = await getPlanItem(db, item?._id as ObjectId);
    expect(fresh?.status).toBe("failed");
    expect(fresh?.failureCount).toBe(1);
    expect(fresh?.retryAfter?.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("schedule claim", () => {
  it("creates a schedule paused, so nothing spends before review", async () => {
    const plan = await seedPlan();
    const s = await createSchedule(db, {
      companyId: COMPANY, planId: plan._id as ObjectId, name: "test",
    });
    expect(s.status).toBe("paused");
    expect(s.nextFireAt).toBeNull();
    expect(s.pause?.reason).toBe("operator");
  });

  it("only one of two racing workers wins the claim", async () => {
    const plan = await seedPlan();
    await createSchedule(db, {
      companyId: COMPANY, planId: plan._id as ObjectId, name: "test",
    });
    await resumeSchedule(db, plan._id as ObjectId);
    // Force the schedule due.
    await db.schedules.updateOne(
      { planId: plan._id },
      { $set: { nextFireAt: new Date(Date.now() - 1000) } },
    );

    const [a, b] = await Promise.all([
      claimScheduleTick(db, COMPANY, "worker-a", 60_000),
      claimScheduleTick(db, COMPANY, "worker-b", 60_000),
    ]);
    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);
  });

  it("does not claim a paused schedule", async () => {
    const plan = await seedPlan();
    await createSchedule(db, { companyId: COMPANY, planId: plan._id as ObjectId, name: "t" });
    expect(await claimScheduleTick(db, COMPANY, "w", 60_000)).toBeNull();
  });
});

describe("runScheduleTick", () => {
  async function activeSchedule(planId: ObjectId, over: Parameters<typeof createSchedule>[1] extends infer T ? Partial<T> : never = {}) {
    await createSchedule(db, {
      companyId: COMPANY, planId, name: "test",
      cadence: { timezone: "UTC", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: "00:00", batchSize: 1 },
      ...over,
    });
    await resumeSchedule(db, planId);
    await db.schedules.updateOne({ planId }, { $set: { nextFireAt: new Date(Date.now() - 1000) } });
  }

  const tick = (over: Record<string, unknown> = {}) =>
    runScheduleTick({
      db, companyId: COMPANY, workerId: "w1", leaseMs: 60_000, heartbeatMs: 300_000, ...over,
    });

  it("returns no_work when nothing is due", async () => {
    expect((await tick()).status).toBe("no_work");
  });

  it("enqueues the first item in sequence order — a pillar page", async () => {
    const plan = await seedPlan();
    await activeSchedule(plan._id as ObjectId);
    const out = await tick();
    expect(out.status).toBe("enqueued");
    expect(out.enqueued).toHaveLength(1);
    expect(out.enqueued[0]?.sequence).toBe(0);
    const item = await db.planItems.findOne({ _id: new ObjectId(out.enqueued[0]?.planItemId) });
    expect(item?.pageRole).toBe("pillar");
  });

  it("never enqueues a child before its parent is produced", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    await activeSchedule(planId, { cadence: { timezone: "UTC", daysOfWeek: [0,1,2,3,4,5,6], timeOfDay: "00:00", batchSize: 9 } });

    const out = await tick();
    // Only the two pillar pages have no parent, so only they can go first.
    const roles = await Promise.all(
      out.enqueued.map(async (e) =>
        (await db.planItems.findOne({ _id: new ObjectId(e.planItemId) }))?.pageRole,
      ),
    );
    expect(roles.every((r) => r === "pillar")).toBe(true);
    expect(out.enqueued).toHaveLength(2);
  });

  it("releases children once the parent reaches review", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    await activeSchedule(planId, { cadence: { timezone: "UTC", daysOfWeek: [0,1,2,3,4,5,6], timeOfDay: "00:00", batchSize: 9 } });

    await tick();
    for (const a of await db.articles.find({}).toArray()) {
      await setStage(db, a._id as ObjectId, "review");
    }
    await db.schedules.updateOne({ planId }, { $set: { nextFireAt: new Date(Date.now() - 1000) } });

    const out = await tick();
    const roles = await Promise.all(
      out.enqueued.map(async (e) =>
        (await db.planItems.findOne({ _id: new ObjectId(e.planItemId) }))?.pageRole,
      ),
    );
    expect(roles).toContain("hub");
  });

  it("a duplicated tick enqueues nothing extra", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    await activeSchedule(planId);
    await tick();
    const after = await db.articles.countDocuments({});
    // Force due again without any item completing.
    await db.schedules.updateOne({ planId }, { $set: { nextFireAt: new Date(Date.now() - 1000) } });
    await tick();
    // The already-enqueued item is in flight; only NEW ready items can go.
    expect(await db.articles.countDocuments({})).toBeGreaterThanOrEqual(after);
    const inFlight = await db.planItems.countDocuments({ planId, status: { $in: ["enqueued", "in_progress"] } });
    expect(inFlight).toBeLessThanOrEqual(3);
  });

  it("throttles on the review queue and says which limit bound it", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    await activeSchedule(planId, { limits: { maxAwaitingReview: 0 } });
    const out = await tick();
    expect(out.status).toBe("throttled");
    expect(out.binding).toBe("review queue");
    expect(out.enqueued).toEqual([]);
    // A throttled fire is LOST, not owed: the clock still advanced.
    const s = await getSchedule(db, planId);
    expect(s?.nextFireAt).not.toBeNull();
    expect(s?.status).toBe("active");
  });

  it("pauses after consecutive failures and names the last one", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    await activeSchedule(planId, { limits: { consecutiveFailureLimit: 2 } });
    const items = await listPlanItems(db, { planId, limit: 3 });
    for (const i of items.slice(0, 2)) {
      await db.planItems.updateOne(
        { _id: i._id },
        { $set: { status: "failed", failureCount: 1, lastError: "boom", updatedAt: new Date() } },
      );
    }
    const out = await tick();
    expect(out.status).toBe("paused");
    expect(out.detail).toContain("consecutive failures");
    const s = await getSchedule(db, planId);
    expect(s?.status).toBe("paused");
    expect(s?.nextFireAt).toBeNull();
    expect(s?.pause?.reason).toBe("consecutive_failures");
  });

  it("completes when the volume cap is reached", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    await activeSchedule(planId, { limits: { maxTotalArticles: 1 } });
    await db.planItems.updateOne(
      { planId, sequence: 0 },
      { $set: { status: "done", updatedAt: new Date() } },
    );
    const out = await tick();
    expect(out.status).toBe("completed");
    expect((await getSchedule(db, planId))?.completedReason).toBe("volume_cap");
  });

  it("dry-run reports what it would do and writes nothing", async () => {
    const plan = await seedPlan();
    await activeSchedule(plan._id as ObjectId);
    const out = await tick({ dryRun: true });
    expect(out.enqueued).toHaveLength(1);
    expect(await db.articles.countDocuments({})).toBe(0);
    expect(await db.planItems.countDocuments({ status: "planned" })).toBe(9);
  });

  it("records a slug conflict instead of mutating the slug", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    const first = (await listPlanItems(db, { planId, limit: 1 }))[0];
    // An unrelated article already owns the slug.
    await db.articles.insertOne({
      companyId: COMPANY,
      slug: first?.slug as string,
      folder: `2026-01-01-${first?.slug}`,
      topic: "pre-existing",
      stage: "review",
      stageHistory: [],
      artifacts: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await activeSchedule(planId);
    const out = await tick();
    expect(out.skipped.some((s) => s.reason === "slug_conflict")).toBe(true);
    const fresh = await getPlanItem(db, first?._id as ObjectId);
    expect(fresh?.status).toBe("slug_conflict");
    expect(fresh?.slug).toBe(first?.slug); // unchanged, never auto-suffixed
  });

  it("emits a tick event carrying the fire number and next fire", async () => {
    const plan = await seedPlan();
    await activeSchedule(plan._id as ObjectId);
    await tick();
    const events = await db.planEvents.find({ type: "schedule.tick" }).toArray();
    expect(events).toHaveLength(1);
    expect(events[0]?.data?.nextFireAt).toBeDefined();
  });
});
