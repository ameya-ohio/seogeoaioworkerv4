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
import { testFormats } from "./__testutil__/formats.js";
import { buildLinkInventory, extractMarkdownLinks, renderLinkInventory, stillDeferredLinks } from "./links/inventory.js";
import { outlineGate } from "./gates.js";
import {
  commitPlan,
  createPlan,
  enqueuePlanItem,
  setPlanItemPath,
  getPlanItem,
  listPlanItems,
  planCounts,
  PlanNotCommittableError,
} from "./dal/plans.js";
import { createSchedule, getSchedule, claimScheduleTick, resumeSchedule } from "./dal/schedules.js";
import { reconcilePlanItems, runScheduleTick } from "./schedule/tick.js";
import { cancelBuild, queueBuild, resequencePlan, runBuildSweep } from "./schedule/build.js";
import { describeWaiting, loadPlanGraph } from "./schedule/graph.js";
import { articlesToReexport, buildReleaseBundle, getRelease, listReleases, ReleaseNotReadyError } from "./export/release.js";
import { unzip } from "./plan/zip.js";
import type { CompanyConfig } from "./companyConfig.js";
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
  analysis = analyzePlan({ workbook: wb, mapping, companyName: "Acme", formats: testFormats() });
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

/**
 * `enriched` (default) marks every brief enriched, as production has them
 * before a build: D60 builds wait on pending briefs.
 */
async function seedPlan(opts: { enriched?: boolean } = {}): Promise<PlanDoc> {
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
  if (opts.enriched !== false) {
    await db.planItems.updateMany({ planId: plan._id as ObjectId }, { $set: { enrichment: "done" } });
  }
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

  it("returns items in sequence order, children before parents", async () => {
    const plan = await seedPlan();
    const items = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
    const pos = new Map(items.map((i) => [i._id?.toHexString(), i.sequence]));
    for (const i of items) {
      if (!i.parentItemId) continue;
      expect(pos.get(i.parentItemId.toHexString())).toBeGreaterThan(i.sequence);
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
    const plan = await seedPlan({ enriched: false });
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

  it("carries facets, the reserved /learn/ path and the breadcrumb trail (D45/D46)", async () => {
    const plan = await seedPlan();
    const items = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
    const spoke = items.find((i) => i.pageRole === "cluster" && i.parentItemId);
    expect(spoke?.path).toMatch(/^\/learn\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\/$/);
    const { article } = await enqueuePlanItem(db, { companyId: COMPANY, planItemId: spoke?._id as ObjectId });
    expect(article.facets).toMatchObject({ pageRole: "cluster", source: "plan", funnel: spoke?.funnel });
    expect(article.facets?.articleType).toBe(spoke?.articleType);
    expect(article.path).toBe(spoke?.path);
    // Pillar → hub → page, each with its own reserved path.
    expect(article.trail?.map((t) => t.path)).toHaveLength(3);
    expect(article.trail?.[2]?.path).toBe(spoke?.path);
    expect(article.trail?.[0]?.path).toMatch(/^\/learn\/[a-z0-9-]+\/$/);
  });

  it("lets an operator change a path until the item is in production", async () => {
    const plan = await seedPlan();
    const items = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
    const [a, b] = items.filter((i) => i.pageRole === "cluster");
    const moved = await setPlanItemPath(db, a?._id as ObjectId, "Learn/Widgets/Custom Page");
    expect(moved).toEqual({ ok: true, path: "/learn/widgets/custom-page/" });
    const fresh = await getPlanItem(db, a?._id as ObjectId);
    expect(fresh?.brief.markdown).toContain("/learn/widgets/custom-page/");
    const clash = await setPlanItemPath(db, b?._id as ObjectId, "/learn/widgets/custom-page/");
    expect(clash.ok).toBe(false);
    await enqueuePlanItem(db, { companyId: COMPANY, planItemId: a?._id as ObjectId });
    expect((await setPlanItemPath(db, a?._id as ObjectId, "/learn/x/")).ok).toBe(false);
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

describe("internal-link inventory (D53)", () => {
  it("lists parent, grandparent and siblings with their URLs, what they cover, and status", async () => {
    const plan = await seedPlan();
    const items = await listPlanItems(db, { planId: plan._id as ObjectId, limit: 100 });
    const spoke = items.find((i) => i.externalId === "P01-S01-A02");
    const { article } = await enqueuePlanItem(db, { companyId: COMPANY, planItemId: spoke?._id as ObjectId });
    const inv = await buildLinkInventory(db, article, "https://www.acme.test");
    const titles = inv.map((t) => t.title);
    expect(titles).toContain("What is Widget Exposure"); // parent
    expect(titles).toContain("Widget Security: The Complete Guide"); // grandparent
    expect(titles).toContain("Why Widget Exposure Grows in Hybrid & Cloud Estates"); // sibling
    expect(titles).not.toContain(spoke?.title); // never itself
    for (const t of inv) {
      expect(t.url.startsWith("https://www.acme.test/learn/")).toBe(true);
      expect(t.covers.length).toBeGreaterThan(10);
      expect(t.status).toBe("planned");
    }
    const md = renderLinkInventory(inv);
    expect(md).toContain("at most once");
    expect(md).not.toMatch(/Hub:|Sibling spoke/);
  });

  it("finds each link's sentence and resolves still-deferred links", async () => {
    const links = extractMarkdownLinks(
      "Intro sentence. These weaknesses build up differently, and [what causes it](https://x.test/a/) breaks each one down. Next.",
    );
    expect(links[0]).toMatchObject({ anchor: "what causes it", url: "https://x.test/a/" });
    expect(links[0]?.sentence).toBe("These weaknesses build up differently, and what causes it breaks each one down.");
    const art = { companyId: COMPANY, linkChecks: { ranAt: new Date(), missingCount: 0, results: [{ url: "https://x.test/learn/p/q/", status: "deferred" as const, anchor: "q" }] } };
    expect(await stillDeferredLinks(db, art)).toEqual([{ url: "https://x.test/learn/p/q/", anchor: "q" }]);
  });
});

describe("outline gate: internal links (D53)", () => {
  it("fails a target planned twice", () => {
    const outline = `# S\n\n${"word ".repeat(50)}\n\n## Internal Links\n| Target URL | Section | Need | Anchor |\n|---|---|---|---|\n| https://x.test/a/ | One | n | a |\n| https://x.test/a | Two | n | b |\n`;
    expect(outlineGate({ outline }).problems.join(" ")).toContain("more than once");
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

  it("waits for pending briefs and queues their enrichment (D60)", async () => {
    const plan = await seedPlan({ enriched: false });
    const planId = plan._id as ObjectId;
    await activeSchedule(planId);
    const out = await tick();
    expect(out.enqueued).toHaveLength(0);
    expect(out.skipped.some((s) => s.reason === "awaiting_enrichment")).toBe(true);
    expect((await db.plans.findOne({ _id: planId }))?.status).toBe("enriching");
  });

  it("enqueues the first ready item in sequence order", async () => {
    const plan = await seedPlan();
    await activeSchedule(plan._id as ObjectId);
    const out = await tick();
    expect(out.status).toBe("enqueued");
    expect(out.enqueued).toHaveLength(1);
    // #0 is a held sign-off article, so #1 goes: the hub over it, which has
    // no other child and so waits on nothing.
    expect(out.enqueued[0]?.sequence).toBe(1);
    const item = await db.planItems.findOne({ _id: new ObjectId(out.enqueued[0]?.planItemId) });
    expect(item?.pageRole).toBe("hub");
  });

  it("never enqueues a parent before its children are produced", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    await activeSchedule(planId, { cadence: { timezone: "UTC", daysOfWeek: [0,1,2,3,4,5,6], timeOfDay: "00:00", batchSize: 9 } });

    const out = await tick();
    expect(out.enqueued.length).toBeGreaterThan(0);
    for (const e of out.enqueued) {
      const id = new ObjectId(e.planItemId);
      const kids = await db.planItems.find({ parentItemId: id }).toArray();
      // Any child still waiting to be built would have held this item back.
      const unbuilt = kids.filter((k) => k.status === "planned" && !k.held);
      expect(unbuilt).toEqual([]);
    }
    const roles = await Promise.all(
      out.enqueued.map(async (e) =>
        (await db.planItems.findOne({ _id: new ObjectId(e.planItemId) }))?.pageRole,
      ),
    );
    expect(roles).not.toContain("pillar");
  });

  it("releases the hub once its cluster articles reach review", async () => {
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
    // The first item the tick will try: sequence order, skipping held items.
    const first = (await listPlanItems(db, { planId, limit: 100 })).find((i) => !i.held);
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

describe("builds — bottom-up, by subtopic", () => {
  const idOf = async (planId: ObjectId, externalId: string) =>
    ((await db.planItems.findOne({ planId, externalId }))?._id as ObjectId).toHexString();
  const sweep = (planId: ObjectId) => runBuildSweep({ db, companyId: COMPANY, planId });
  const toReview = async () => {
    for (const a of await db.articles.find({ stage: { $ne: "review" } }).toArray()) {
      await setStage(db, a._id as ObjectId, "review");
    }
  };
  const externalIds = async (keys: string[]) =>
    (await db.planItems.find({ _id: { $in: keys.map((k) => new ObjectId(k)) } }).toArray())
      .map((i) => i.externalId)
      .sort();

  it("expands one selected article to its whole subtopic, its hub and its pillar page", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    const summary = await queueBuild(db, { companyId: COMPANY, planId, keys: [await idOf(planId, "P01-S01-A02")] });
    expect(await externalIds(summary.toQueue)).toEqual(["P01", "P01-S01-A01", "P01-S01-A02", "P01-S01-A03"]);
    expect(summary.subtopics).toHaveLength(1);
    expect(summary.subtopics[0]).toMatchObject({ clusters: 2, hub: true });
    expect(summary.pillarPages.map((p) => p.pillarId)).toEqual(["P01"]);
    expect(await db.planItems.countDocuments({ planId, buildQueuedAt: { $exists: true } })).toBe(4);
  });

  it("queues brief enrichment with the build, and builds once briefs are enriched (D60)", async () => {
    const plan = await seedPlan({ enriched: false });
    const planId = plan._id as ObjectId;
    await queueBuild(db, { companyId: COMPANY, planId, keys: [await idOf(planId, "P01-S01-A02")] });
    expect((await db.plans.findOne({ _id: planId }))?.status).toBe("enriching");
    expect((await sweep(planId))[0]?.enqueued ?? []).toHaveLength(0);
    // A failed enrichment falls back to the deterministic brief and builds.
    await db.planItems.updateMany({ planId }, { $set: { enrichment: "failed" } });
    expect((await sweep(planId))[0]?.enqueued.length).toBe(2);
  });

  it("builds the cluster articles first, then the hub, then the pillar once every hub is built", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    await queueBuild(db, { companyId: COMPANY, planId, keys: [await idOf(planId, "P01-S01-A02")] });

    let out = await sweep(planId);
    expect(out[0]?.enqueued.map((e) => e.slug).length).toBe(2);
    const first = await db.planItems.find({ planId, status: "in_progress" }).toArray();
    expect(first.map((i) => i.pageRole)).toEqual(["cluster", "cluster"]);

    await toReview();
    out = await sweep(planId);
    const hub = await db.planItems.findOne({ planId, externalId: "P01-S01-A01" });
    expect(hub?.status).toBe("in_progress");
    expect(out[0]?.enqueued).toHaveLength(1);

    // The pillar still waits: the S02 hub has not been built.
    await toReview();
    out = await sweep(planId);
    expect(out[0]?.enqueued ?? []).toHaveLength(0);
    const graph = await loadPlanGraph(db, planId);
    const pillar = graph.items.find((i) => i.externalId === "P01");
    expect(describeWaiting(graph, pillar!)).toBe("waiting on 1 of 2 hub pages");

    // Building S02 (whose only article is a held sign-off) frees the pillar.
    await queueBuild(db, { companyId: COMPANY, planId, keys: [await idOf(planId, "P01-S02-A01")] });
    await sweep(planId);
    await toReview();
    await sweep(planId);
    expect((await db.planItems.findOne({ planId, externalId: "P01" }))?.status).toBe("in_progress");
  });

  it("resequences a plan committed with top-down numbers", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    const items = await db.planItems.find({ planId }).toArray();
    const original = new Map(items.map((i) => [i.externalId, i.sequence]));
    // Simulate an old import: reverse the order.
    for (const i of items) {
      await db.planItems.updateOne({ _id: i._id }, { $set: { sequence: items.length - 1 - i.sequence } });
    }
    const dry = await resequencePlan(db, planId);
    expect(dry.changed).toBeGreaterThan(0);
    expect(await db.planItems.countDocuments({ planId, sequence: original.get("P01") as number })).toBe(1);
    const res = await resequencePlan(db, planId, { write: true });
    expect(res.violations).toEqual([]);
    for (const i of await db.planItems.find({ planId }).toArray()) {
      expect(i.sequence).toBe(original.get(i.externalId));
    }
    expect((await resequencePlan(db, planId)).changed).toBe(0);
  });

  it("never produces anything that was not queued", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    expect(await runBuildSweep({ db, companyId: COMPANY })).toEqual([]);
    expect(await db.articles.countDocuments({})).toBe(0);
  });

  it("cancels what has not started and leaves running work alone", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    const key = await idOf(planId, "P01-S01-A02");
    await queueBuild(db, { companyId: COMPANY, planId, keys: [key] });
    await sweep(planId);
    const cancelled = await cancelBuild(db, { companyId: COMPANY, planId, keys: [key] });
    expect(cancelled).toBe(2); // the hub and the pillar page; both clusters are running
    expect(await db.planItems.countDocuments({ planId, status: "in_progress" })).toBe(2);
  });

  it("holds the build after a run of failures, and says so on the plan", async () => {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    await queueBuild(db, { companyId: COMPANY, planId, keys: [await idOf(planId, "P01-S01-A02")] });
    await db.planItems.updateMany(
      { planId, externalId: { $in: ["P02", "P02-S01-A01", "P02-S01-A02"] } },
      { $set: { status: "failed", failureCount: 1, updatedAt: new Date() } },
    );
    const out = await sweep(planId);
    expect(out[0]?.held).toContain("3 articles failed in a row");
    expect((await db.plans.findOne({ _id: planId }))?.buildHold).toBeDefined();
    expect(await db.articles.countDocuments({})).toBe(0);
  });
});

describe("releases — a subtopic goes live as one unit", () => {
  const company: CompanyConfig = {
    path: "/x/company.yaml",
    brandAssetsDir: "/x",
    companyId: COMPANY,
    companyName: "Acme",
    raw: { site: { base_url: "https://acme.test" } },
  };
  const SITE = "https://acme.test";

  /** Build S01 of P01 to review: two cluster articles, then the hub. */
  async function builtSubtopic(): Promise<ObjectId> {
    const plan = await seedPlan();
    const planId = plan._id as ObjectId;
    const a02 = await db.planItems.findOne({ planId, externalId: "P01-S01-A02" });
    await queueBuild(db, { companyId: COMPANY, planId, keys: [a02?._id?.toHexString() as string] });
    for (let i = 0; i < 3; i++) {
      await runBuildSweep({ db, companyId: COMPANY, planId });
      for (const a of await db.articles.find({ stage: "queued" }).toArray()) {
        await setStage(db, a._id as ObjectId, "review");
      }
    }
    // Give every article a body that links to the rest of its release and up to the pillar.
    const items = await db.planItems.find({ planId }).toArray();
    const pathOf = (ext: string) => items.find((i) => i.externalId === ext)?.path as string;
    const inRelease = ["P01-S01-A01", "P01-S01-A02", "P01-S01-A03"];
    for (const ext of inRelease) {
      const item = items.find((i) => i.externalId === ext);
      const others = inRelease.filter((e) => e !== ext);
      const links = [...others.map((e) => ({ url: `${SITE}${pathOf(e)}`, anchor: `about ${e}` })), { url: `${SITE}${pathOf("P01")}`, anchor: "the pillar" }];
      const body = links.map((l) => `See [${l.anchor}](${l.url}).`).join("\n\n");
      await db.articles.updateOne(
        { _id: item?.articleId },
        {
          $set: {
            path: pathOf(ext),
            "artifacts.article": `---\ntitle: "${item?.title}"\ncanonical_url: "${SITE}${pathOf(ext)}"\n---\n\n# ${item?.title}\n\n${body}\n`,
            linkChecks: { ranAt: new Date(), missingCount: 0, results: links.map((l) => ({ ...l, status: "deferred" as const })) },
          },
        },
      );
    }
    return planId;
  }

  it("groups a subtopic's hub and articles, hub first, and tracks its state", async () => {
    const planId = await builtSubtopic();
    const unit = await getRelease(db, planId, "P01/P01-S01");
    expect(unit?.kind).toBe("subtopic");
    expect(unit?.members.map((m) => m.externalId)).toEqual(["P01-S01-A01", "P01-S01-A02", "P01-S01-A03"]);
    expect(unit?.state).toBe("in_review");
    expect(unit?.members.every((m) => m.blocking === "awaiting approval")).toBe(true);

    const releases = await listReleases(db, planId);
    const pillar = releases.find((r) => r.key === "P01/pillar");
    expect(pillar?.state).toBe("planned");
    // A pillar's release comes after its subtopics'.
    expect(releases.indexOf(pillar!)).toBeGreaterThan(releases.findIndex((r) => r.key === "P01/P01-S01"));
    // The held sign-off article is left out of its release, with the reason.
    const s02 = releases.find((r) => r.key === "P01/P01-S02");
    expect(s02?.excluded.map((e) => e.externalId)).toEqual(["P01-S02-A02"]);
  });

  it("refuses to export until every page is approved", async () => {
    const planId = await builtSubtopic();
    const unit = (await getRelease(db, planId, "P01/P01-S01"))!;
    await expect(buildReleaseBundle(db, company, unit)).rejects.toThrow(ReleaseNotReadyError);
    // Approving two of three is not enough.
    const [first, second] = unit.members;
    for (const m of [first, second]) await setStage(db, new ObjectId(m!.articleId!), "approved");
    await expect(buildReleaseBundle(db, company, (await getRelease(db, planId, "P01/P01-S01"))!)).rejects.toThrow(/awaiting approval/);
  });

  it("packs every page with links inside the release on and links out of it deferred", async () => {
    const planId = await builtSubtopic();
    for (const a of await db.articles.find({}).toArray()) await setStage(db, a._id as ObjectId, "approved");
    const unit = (await getRelease(db, planId, "P01/P01-S01"))!;
    expect(unit.state).toBe("ready");
    const bundle = await buildReleaseBundle(db, company, unit);
    const files = unzip(bundle.zip);
    expect(bundle.pages).toHaveLength(3);
    expect(bundle.pages[0]).toMatch(/^01-/);
    const readme = files.get("README.md")?.toString() ?? "";
    expect(readme).toContain("go live together");
    expect(readme).toContain("the pillar");

    const hubBody = files.get(`${bundle.pages[0]}/body.html`)?.toString() ?? "";
    const items = await db.planItems.find({ planId }).toArray();
    const a02 = items.find((i) => i.externalId === "P01-S01-A02")?.path as string;
    const pillarPath = items.find((i) => i.externalId === "P01")?.path as string;
    expect(hubBody).toContain(`href="${SITE}${a02}"`); // inside the release: a real link
    expect(hubBody).not.toContain(`href="${SITE}${pillarPath}"`); // outside: plain text
    expect(hubBody).toContain("the pillar");
  });

  it("names live pages that need re-exporting once a target they link to goes live", async () => {
    const planId = await builtSubtopic();
    const items = await db.planItems.find({ planId }).toArray();
    const past = new Date(Date.now() - 60_000);
    for (const ext of ["P01-S01-A01", "P01-S01-A02", "P01-S01-A03"]) {
      const item = items.find((i) => i.externalId === ext);
      await db.articles.updateOne(
        { _id: item?.articleId },
        { $set: { stage: "published", exportedAt: past, live: { url: `${SITE}${item?.path}`, verifiedAt: past, status: 200 } } },
      );
    }
    expect((await getRelease(db, planId, "P01/P01-S01"))?.state).toBe("live");
    // Exported before its siblings went live? No — they went live at the same moment as the export.
    // Now the pillar page goes live: every S01 page links to it and needs a re-export.
    const pillar = items.find((i) => i.externalId === "P01");
    await db.articles.insertOne({
      companyId: COMPANY, slug: "pillar-live", folder: "x", topic: "pillar", stage: "published",
      stageHistory: [], artifacts: {}, path: pillar?.path as string,
      live: { url: `${SITE}${pillar?.path}`, verifiedAt: new Date(), status: 200 },
      createdAt: new Date(), updatedAt: new Date(),
    });
    const stale = await articlesToReexport(db, COMPANY, planId);
    expect(stale.map((s) => s.links).sort()).toEqual([3, 3, 3]);
  });
});
