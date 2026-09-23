import { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import type { KeywordDoc } from "../types.js";
import type {
  ClusterDoc,
  ClusterEventDoc,
  ClusterEventType,
  ClusterStage,
  SpokeBrief,
  ThemeDoc,
} from "../cluster/types.js";

/**
 * DAL + job-queue operations for cluster runs (roadmap 4C). Mirrors the
 * article-run queue in dal/runs.ts: lease-claim via findOneAndUpdate,
 * heartbeat, retry with resume-from-failed-stage, append-only event stream
 * with per-cluster seq.
 */

export interface EnqueueClusterInput {
  companyId: string;
  seed: string;
  k?: number;
  models: { main: string; fanout: string };
  maxAttempts?: number;
}

export async function enqueueClusterRun(
  db: EngineDb,
  input: EnqueueClusterInput,
): Promise<ClusterDoc> {
  const now = new Date();
  const doc: ClusterDoc = {
    companyId: input.companyId,
    seed: input.seed.trim(),
    status: "queued",
    stage: "expansion",
    completedStages: [],
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 2,
    eventSeq: 0,
    k: input.k ?? 5,
    models: input.models,
    usage: {
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      dataForSeoCalls: 0,
      dataForSeoCostUsd: 0,
    },
    queuedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const res = await db.clusters.insertOne(doc);
  doc._id = res.insertedId;
  await emitClusterEvent(db, {
    companyId: doc.companyId,
    clusterId: res.insertedId,
    type: "cluster.queued",
    message: `Cluster run queued for seed "${doc.seed}"`,
  });
  return doc;
}

export async function claimClusterRun(
  db: EngineDb,
  workerId: string,
  leaseMs: number,
): Promise<ClusterDoc | null> {
  const now = new Date();
  const res = await db.clusters.findOneAndUpdate(
    {
      $or: [
        { status: "queued" },
        { status: "running", leaseUntil: { $lt: now } },
      ],
    },
    {
      $set: {
        status: "running",
        workerId,
        leaseUntil: new Date(now.getTime() + leaseMs),
        startedAt: now,
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { queuedAt: 1 }, returnDocument: "after" },
  );
  return res ?? null;
}

export async function heartbeatCluster(
  db: EngineDb,
  clusterId: ObjectId,
  workerId: string,
  leaseMs: number,
): Promise<boolean> {
  const now = new Date();
  const res = await db.clusters.updateOne(
    { _id: clusterId, status: "running", workerId },
    { $set: { leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now } },
  );
  return res.matchedCount === 1;
}

export async function getCluster(db: EngineDb, id: ObjectId): Promise<ClusterDoc | null> {
  return db.clusters.findOne({ _id: id });
}

export async function listClusters(
  db: EngineDb,
  companyId: string,
  limit = 50,
): Promise<ClusterDoc[]> {
  return db.clusters.find({ companyId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

/** Persist stage output fields and advance the stage pointer. */
export async function saveClusterStage(
  db: EngineDb,
  clusterId: ObjectId,
  completedStage: ClusterStage,
  nextStage: ClusterStage | "done",
  fields: Partial<ClusterDoc>,
): Promise<void> {
  const $set: Record<string, unknown> = { stage: nextStage, updatedAt: new Date() };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) $set[k] = v;
  }
  await db.clusters.updateOne(
    { _id: clusterId },
    { $set, $addToSet: { completedStages: completedStage } },
  );
}

export async function updateClusterUsage(
  db: EngineDb,
  clusterId: ObjectId,
  delta: Partial<ClusterDoc["usage"]>,
): Promise<void> {
  const $inc: Record<string, number> = {};
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === "number" && v !== 0) $inc[`usage.${k}`] = v;
  }
  if (Object.keys($inc).length === 0) return;
  await db.clusters.updateOne({ _id: clusterId }, { $inc, $set: { updatedAt: new Date() } });
}

export async function completeClusterRun(
  db: EngineDb,
  clusterId: ObjectId,
  output: Record<string, unknown>,
  outputProblems: string[],
): Promise<void> {
  const now = new Date();
  await db.clusters.updateOne(
    { _id: clusterId },
    {
      $set: {
        status: "succeeded",
        stage: "done",
        output,
        outputProblems,
        endedAt: now,
        updatedAt: now,
      },
      $unset: { leaseUntil: "", workerId: "" },
    },
  );
}

/**
 * Fail a cluster run. Below maxAttempts it requeues; completed stages are
 * kept so the retry resumes at the failing stage.
 */
export async function failClusterRun(
  db: EngineDb,
  clusterId: ObjectId,
  error: string,
): Promise<"requeued" | "failed"> {
  const now = new Date();
  const cluster = await db.clusters.findOne({ _id: clusterId });
  if (!cluster) return "failed";
  if (cluster.attempts < cluster.maxAttempts) {
    await db.clusters.updateOne(
      { _id: clusterId },
      {
        $set: { status: "queued", error, queuedAt: now, updatedAt: now },
        $unset: { leaseUntil: "", workerId: "" },
      },
    );
    return "requeued";
  }
  await db.clusters.updateOne(
    { _id: clusterId },
    {
      $set: { status: "failed", error, endedAt: now, updatedAt: now },
      $unset: { leaseUntil: "", workerId: "" },
    },
  );
  return "failed";
}

export async function emitClusterEvent(
  db: EngineDb,
  params: {
    companyId: string;
    clusterId: ObjectId;
    type: ClusterEventType;
    message: string;
    data?: Record<string, unknown>;
  },
): Promise<ClusterEventDoc | null> {
  const cluster = await db.clusters.findOneAndUpdate(
    { _id: params.clusterId },
    { $inc: { eventSeq: 1 } },
    { returnDocument: "after", projection: { eventSeq: 1 } },
  );
  if (!cluster) return null;
  const doc: ClusterEventDoc = {
    companyId: params.companyId,
    clusterId: params.clusterId,
    seq: cluster.eventSeq,
    ts: new Date(),
    type: params.type,
    message: params.message,
    ...(params.data ? { data: params.data } : {}),
  };
  const res = await db.clusterEvents.insertOne(doc);
  doc._id = res.insertedId;
  return doc;
}

export async function clusterEventsAfter(
  db: EngineDb,
  clusterId: ObjectId,
  afterSeq = 0,
  limit = 200,
): Promise<ClusterEventDoc[]> {
  return db.clusterEvents
    .find({ clusterId, seq: { $gt: afterSeq } })
    .sort({ seq: 1 })
    .limit(limit)
    .toArray();
}

/** Replace a cluster's themes (idempotent per clustering pass). */
export async function replaceThemes(
  db: EngineDb,
  clusterId: ObjectId,
  companyId: string,
  themes: Omit<ThemeDoc, "_id" | "companyId" | "clusterId" | "createdAt" | "updatedAt">[],
): Promise<ThemeDoc[]> {
  await db.themes.deleteMany({ clusterId });
  const now = new Date();
  const docs: ThemeDoc[] = themes.map((t) => ({
    ...t,
    companyId,
    clusterId,
    createdAt: now,
    updatedAt: now,
  }));
  if (docs.length > 0) {
    const res = await db.themes.insertMany(docs);
    docs.forEach((d, i) => {
      d._id = res.insertedIds[i];
    });
  }
  return docs;
}

export async function getThemesForCluster(db: EngineDb, clusterId: ObjectId): Promise<ThemeDoc[]> {
  return db.themes.find({ clusterId }).sort({ "scores.total": -1, stability: -1 }).toArray();
}

export async function updateTheme(
  db: EngineDb,
  themeId: ObjectId,
  fields: Partial<ThemeDoc>,
): Promise<void> {
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) $set[k] = v;
  }
  await db.themes.updateOne({ _id: themeId }, { $set });
}

export class BriefNotFoundError extends Error {}

/**
 * Accept a spoke brief into the keyword library (roadmap 4.12): the brief's
 * most stable representative sub-query becomes the library entry (source
 * "agent", status "idea"), linked to its cluster + theme so send-to-pipeline
 * can hand the brief to the Strategist. Idempotent on the keyword text.
 */
export async function acceptSpokeBrief(
  db: EngineDb,
  params: { companyId: string; clusterId: ObjectId; themeName: string },
): Promise<{ keyword: KeywordDoc; brief: SpokeBrief; theme: ThemeDoc }> {
  const cluster = await getCluster(db, params.clusterId);
  if (!cluster) throw new BriefNotFoundError(`cluster ${params.clusterId.toHexString()} not found`);
  const brief = (cluster.spokeBriefs ?? []).find((b) => b.themeName === params.themeName);
  if (!brief) {
    throw new BriefNotFoundError(
      `no spoke brief for theme "${params.themeName}" on cluster ${params.clusterId.toHexString()}`,
    );
  }
  const theme = await db.themes.findOne({ clusterId: params.clusterId, name: params.themeName });
  if (!theme?._id) {
    throw new BriefNotFoundError(`theme "${params.themeName}" not found for cluster`);
  }

  // D32: the library keyword is the brief's natural primary query target —
  // NEVER a fan-out sub-query string (that was the Session-14 stuffed-lede
  // bug). Legacy briefs without a target fall back to the working title,
  // which is at least human-shaped.
  const text = (brief.primaryQueryTarget || brief.workingTitle).toLowerCase();
  const now = new Date();
  const res = await db.keywords.findOneAndUpdate(
    { companyId: params.companyId, text },
    {
      $set: {
        source: "agent" as const,
        cluster: cluster.seed,
        clusterId: params.clusterId,
        themeId: theme._id,
        rationale: brief.differentiationAngle,
        priority: brief.priorityScore,
        updatedAt: now,
      },
      $setOnInsert: {
        companyId: params.companyId,
        text,
        status: "idea" as const,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!res) throw new Error("keyword upsert returned no document");
  return { keyword: res, brief, theme };
}
