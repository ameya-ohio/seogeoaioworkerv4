import { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import { enqueueArticlePipeline } from "../pipelineOps.js";
import type { ArticleDoc, RunDoc } from "../types.js";
import type { DraftPlanItem } from "../plan/import.js";
import type {
  PlanDoc,
  PlanConcept,
  PlanImportReport,
  PlanItemDoc,
  PlanItemStatus,
  PlanMapping,
  PlanPillar,
  PlanSheet,
  PlanSubtopic,
} from "../plan/types.js";
import { emitPlanEvent } from "./planEvents.js";

/** Data access for imported content plans and their items. */

export class PlanNotFoundError extends Error {}
export class PlanItemNotFoundError extends Error {}
export class PlanNotCommittableError extends Error {}

// ── plans ─────────────────────────────────────────────────────────────────

export interface CreatePlanInput {
  companyId: string;
  filename: string;
  sheets: PlanSheet[];
  mapping: PlanMapping;
  taxonomy: { pillars: PlanPillar[]; subtopics: PlanSubtopic[] };
  concepts: PlanConcept[];
  notes?: string;
  report?: PlanImportReport;
  sourceKey?: string;
  maxAttempts?: number;
}

export async function createPlan(db: EngineDb, input: CreatePlanInput): Promise<PlanDoc> {
  const now = new Date();
  const doc: PlanDoc = {
    companyId: input.companyId,
    filename: input.filename,
    status: "draft",
    stage: "enrich",
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 2,
    eventSeq: 0,
    sheets: input.sheets,
    mapping: input.mapping,
    taxonomy: input.taxonomy,
    concepts: input.concepts,
    usage: { llmCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    createdAt: now,
    updatedAt: now,
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.report ? { report: input.report } : {}),
    ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}),
  };
  const res = await db.plans.insertOne(doc);
  doc._id = res.insertedId;
  await emitPlanEvent(db, {
    companyId: input.companyId,
    planId: res.insertedId,
    type: "plan.created",
    message: `Imported "${input.filename}"`,
  });
  return doc;
}

export async function getPlan(db: EngineDb, planId: ObjectId): Promise<PlanDoc | null> {
  return db.plans.findOne({ _id: planId });
}

export async function listPlans(db: EngineDb, companyId: string, limit = 50): Promise<PlanDoc[]> {
  return db.plans.find({ companyId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function updatePlanMapping(
  db: EngineDb,
  planId: ObjectId,
  mapping: PlanMapping,
  report?: PlanImportReport,
): Promise<void> {
  await db.plans.updateOne(
    { _id: planId, status: "draft" },
    { $set: { mapping, updatedAt: new Date(), ...(report ? { report } : {}) } },
  );
}

export async function deletePlan(db: EngineDb, planId: ObjectId): Promise<boolean> {
  // Only a draft can be deleted outright; a committed plan owns articles.
  const res = await db.plans.deleteOne({ _id: planId, status: "draft" });
  if (res.deletedCount === 1) {
    await db.planItems.deleteMany({ planId });
    await db.planEvents.deleteMany({ planId });
    return true;
  }
  return false;
}

// ── commit ────────────────────────────────────────────────────────────────

/**
 * Turn the analyzed draft into plan_items.
 *
 * Parent links are resolved in a second pass, after every row has an _id —
 * the workbook references parents by its own external ids, which only become
 * ObjectIds here.
 */
export async function commitPlan(
  db: EngineDb,
  params: {
    companyId: string;
    planId: ObjectId;
    items: DraftPlanItem[];
    report: PlanImportReport;
    /** Skip the blocking check — only for a CLI caller that has confirmed. */
    force?: boolean;
  },
): Promise<{ itemCount: number }> {
  const plan = await getPlan(db, params.planId);
  if (!plan) throw new PlanNotFoundError(`plan ${params.planId.toHexString()} not found`);
  if (plan.status !== "draft") {
    throw new PlanNotCommittableError(`plan is already ${plan.status}`);
  }
  if (!params.force && params.report.blocking.length > 0) {
    throw new PlanNotCommittableError(
      `resolve these first: ${params.report.blocking.join(" ")}`,
    );
  }

  // Re-committing a draft replaces its items rather than duplicating them.
  await db.planItems.deleteMany({ planId: params.planId });

  const now = new Date();
  const docs: PlanItemDoc[] = params.items.map((i) => ({
    companyId: params.companyId,
    planId: params.planId,
    externalId: i.externalId,
    sheetRow: i.sheetRow,
    pageRole: i.pageRole,
    pillarId: i.pillarId,
    pillarName: i.pillarName,
    subtopicId: i.subtopicId,
    subtopicName: i.subtopicName,
    title: i.title,
    format: i.format,
    funnel: i.funnel,
    searchIntent: i.searchIntent,
    priority: i.priority,
    tierHint: i.tierHint,
    tieIn: i.tieIn,
    sourcePages: i.sourcePages,
    slug: i.slug,
    slugStrategy: i.slugStrategy,
    primaryQueryTarget: i.primaryQueryTarget,
    needsQueryTarget: i.needsQueryTarget,
    brief: i.brief,
    enrichment: "pending",
    sequence: i.sequence,
    status: "planned",
    failureCount: 0,
    createdAt: now,
    updatedAt: now,
  }));
  if (docs.length > 0) await db.planItems.insertMany(docs);

  // Second pass: external id -> ObjectId.
  const inserted = await db.planItems
    .find({ planId: params.planId })
    .project<{ _id: ObjectId; externalId: string }>({ externalId: 1 })
    .toArray();
  const idByExternal = new Map(inserted.map((d) => [d.externalId, d._id]));
  const parentWrites = params.items
    .filter((i) => i.parentExternalId)
    .map((i) => ({
      updateOne: {
        filter: { planId: params.planId, externalId: i.externalId },
        update: { $set: { parentItemId: idByExternal.get(i.parentExternalId as string) } },
      },
    }))
    .filter((w) => w.updateOne.update.$set.parentItemId !== undefined);
  if (parentWrites.length > 0) await db.planItems.bulkWrite(parentWrites);

  await db.plans.updateOne(
    { _id: params.planId },
    {
      $set: {
        status: "ready",
        report: params.report,
        itemCount: docs.length,
        updatedAt: now,
      },
    },
  );
  await emitPlanEvent(db, {
    companyId: params.companyId,
    planId: params.planId,
    type: "plan.committed",
    message: `Committed ${docs.length} planned articles`,
    data: { itemCount: docs.length },
  });
  return { itemCount: docs.length };
}

// ── items ─────────────────────────────────────────────────────────────────

export async function getPlanItem(db: EngineDb, id: ObjectId): Promise<PlanItemDoc | null> {
  return db.planItems.findOne({ _id: id });
}

export interface PlanItemQuery {
  planId: ObjectId;
  status?: PlanItemStatus[];
  pillarId?: string;
  enrichment?: PlanItemDoc["enrichment"];
  limit?: number;
  skip?: number;
}

export async function listPlanItems(db: EngineDb, q: PlanItemQuery): Promise<PlanItemDoc[]> {
  const filter: Record<string, unknown> = { planId: q.planId };
  if (q.status?.length) filter.status = { $in: q.status };
  if (q.pillarId) filter.pillarId = q.pillarId;
  if (q.enrichment) filter.enrichment = q.enrichment;
  return db.planItems
    .find(filter)
    .sort({ sequence: 1 })
    .skip(q.skip ?? 0)
    .limit(q.limit ?? 200)
    .toArray();
}

export interface PlanCounts {
  total: number;
  byStatus: Record<string, number>;
  byEnrichment: Record<string, number>;
  produced: number;
}

export async function planCounts(db: EngineDb, planId: ObjectId): Promise<PlanCounts> {
  const [byStatus, byEnrichment] = await Promise.all([
    db.planItems
      .aggregate<{ _id: string; n: number }>([
        { $match: { planId } },
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ])
      .toArray(),
    db.planItems
      .aggregate<{ _id: string; n: number }>([
        { $match: { planId } },
        { $group: { _id: "$enrichment", n: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const status: Record<string, number> = {};
  for (const r of byStatus) status[r._id] = r.n;
  const enrichment: Record<string, number> = {};
  for (const r of byEnrichment) enrichment[r._id] = r.n;
  return {
    total: Object.values(status).reduce((a, b) => a + b, 0),
    byStatus: status,
    byEnrichment: enrichment,
    produced: status.done ?? 0,
  };
}

/** Total spend on the articles this plan has produced. */
export async function planCostUsd(db: EngineDb, planId: ObjectId): Promise<number> {
  const rows = await db.articles
    .aggregate<{ total: number }>([
      { $match: { planId } },
      { $lookup: { from: "runs", localField: "_id", foreignField: "articleId", as: "runs" } },
      { $unwind: { path: "$runs", preserveNullAndEmptyArrays: false } },
      { $unwind: { path: "$runs.phaseResults", preserveNullAndEmptyArrays: false } },
      { $group: { _id: null, total: { $sum: "$runs.phaseResults.usage.costUsd" } } },
    ])
    .toArray();
  return rows[0]?.total ?? 0;
}

export async function setPlanItemStatus(
  db: EngineDb,
  id: ObjectId,
  status: PlanItemStatus,
  extra: Partial<PlanItemDoc> = {},
): Promise<void> {
  await db.planItems.updateOne({ _id: id }, { $set: { status, updatedAt: new Date(), ...extra } });
}

/**
 * The one operation that turns a plan item into an article. The manual
 * "send to pipeline" action and the scheduler both call this, so there is
 * exactly one place that knows how a plan item becomes production work.
 */
export async function enqueuePlanItem(
  db: EngineDb,
  params: {
    companyId: string;
    planItemId: ObjectId;
    maxAttempts?: number;
    eventData?: Record<string, unknown>;
  },
): Promise<{ article: ArticleDoc; run: RunDoc; item: PlanItemDoc }> {
  const item = await getPlanItem(db, params.planItemId);
  if (!item) throw new PlanItemNotFoundError(params.planItemId.toHexString());

  const { article, run } = await enqueueArticlePipeline(db, {
    companyId: params.companyId,
    topic: item.title,
    keyword: item.primaryQueryTarget || item.title,
    // The slug was reserved at import; never re-derive it here.
    slug: item.slug,
    planItemId: params.planItemId,
    ...(params.maxAttempts !== undefined ? { maxAttempts: params.maxAttempts } : {}),
    ...(params.eventData ? { eventData: params.eventData } : {}),
  });

  await db.planItems.updateOne(
    { _id: params.planItemId },
    {
      $set: {
        status: "in_progress",
        articleId: article._id,
        runId: run._id,
        enqueuedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );
  return { article, run, item };
}

// ── enrichment job claim (same lease idiom as runs/clusters/scrapes) ──────

export async function claimPlanEnrichment(
  db: EngineDb,
  workerId: string,
  leaseMs: number,
): Promise<PlanDoc | null> {
  const now = new Date();
  const res = await db.plans.findOneAndUpdate(
    {
      status: "enriching",
      $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: now } }],
    },
    {
      $set: { workerId, leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now },
      $inc: { attempts: 1 },
    },
    { sort: { updatedAt: 1 }, returnDocument: "after" },
  );
  return res ?? null;
}

export async function heartbeatPlan(
  db: EngineDb,
  planId: ObjectId,
  workerId: string,
  leaseMs: number,
): Promise<boolean> {
  const res = await db.plans.updateOne(
    { _id: planId, status: "enriching", workerId },
    { $set: { leaseUntil: new Date(Date.now() + leaseMs), updatedAt: new Date() } },
  );
  return res.matchedCount === 1;
}

/** Queue (or re-queue) a plan's enrichment pass. */
export async function requestPlanEnrichment(
  db: EngineDb,
  planId: ObjectId,
  opts: { onlyFailed?: boolean } = {},
): Promise<number> {
  const filter: Record<string, unknown> = { planId };
  filter.enrichment = opts.onlyFailed ? "failed" : { $in: ["pending", "failed"] };
  const reset = await db.planItems.updateMany(filter, {
    $set: { enrichment: "pending", updatedAt: new Date() },
    $unset: { enrichmentProblems: "" },
  });
  await db.plans.updateOne(
    { _id: planId },
    {
      $set: { status: "enriching", stage: "enrich", attempts: 0, updatedAt: new Date() },
      $unset: { leaseUntil: "", workerId: "", error: "" },
    },
  );
  return reset.modifiedCount;
}

export async function completePlanEnrichment(
  db: EngineDb,
  planId: ObjectId,
  usageDelta: { llmCalls: number; inputTokens: number; outputTokens: number; costUsd: number },
): Promise<void> {
  await db.plans.updateOne(
    { _id: planId },
    {
      $set: { status: "ready", stage: "done", updatedAt: new Date() },
      $unset: { leaseUntil: "", workerId: "" },
      $inc: {
        "usage.llmCalls": usageDelta.llmCalls,
        "usage.inputTokens": usageDelta.inputTokens,
        "usage.outputTokens": usageDelta.outputTokens,
        "usage.costUsd": usageDelta.costUsd,
      },
    },
  );
}

export async function failPlanEnrichment(
  db: EngineDb,
  plan: PlanDoc,
  error: string,
): Promise<void> {
  const planId = plan._id;
  if (!planId) return;
  const retry = plan.attempts < plan.maxAttempts;
  await db.plans.updateOne(
    { _id: planId },
    {
      $set: { status: retry ? "enriching" : "failed", error, updatedAt: new Date() },
      $unset: { leaseUntil: "", workerId: "" },
    },
  );
}
