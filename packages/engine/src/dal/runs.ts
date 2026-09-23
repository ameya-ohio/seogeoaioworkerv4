import { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import type { PhaseResult, RunDoc, WorkStage } from "../types.js";

export interface EnqueueInput {
  companyId: string;
  articleId: ObjectId;
  fromStage?: WorkStage;
  maxAttempts?: number;
}

export async function enqueueRun(db: EngineDb, input: EnqueueInput): Promise<RunDoc> {
  const now = new Date();
  const doc: RunDoc = {
    companyId: input.companyId,
    articleId: input.articleId,
    kind: "pipeline",
    fromStage: input.fromStage ?? "research",
    status: "queued",
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 2,
    phaseResults: [],
    eventSeq: 0,
    queuedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const res = await db.runs.insertOne(doc);
  doc._id = res.insertedId;
  return doc;
}

/**
 * Atomically claim the next run: oldest queued run, or a running run whose
 * lease expired (worker died). Sets a lease the claimer must heartbeat.
 */
export async function claimRun(
  db: EngineDb,
  workerId: string,
  leaseMs: number,
): Promise<RunDoc | null> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const res = await db.runs.findOneAndUpdate(
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
        leaseUntil,
        startedAt: now,
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { queuedAt: 1 }, returnDocument: "after" },
  );
  return res ?? null;
}

export async function heartbeat(
  db: EngineDb,
  runId: ObjectId,
  workerId: string,
  leaseMs: number,
): Promise<boolean> {
  const now = new Date();
  const res = await db.runs.updateOne(
    { _id: runId, status: "running", workerId },
    { $set: { leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now } },
  );
  return res.matchedCount === 1;
}

export async function pushPhaseResult(
  db: EngineDb,
  runId: ObjectId,
  result: PhaseResult,
): Promise<void> {
  await db.runs.updateOne(
    { _id: runId },
    {
      $push: { phaseResults: result },
      $set: { currentPhase: result.phase, updatedAt: new Date() },
    },
  );
}

/** Replace the most recent phaseResults entry for `phase` (attempt update). */
export async function updateLastPhaseResult(
  db: EngineDb,
  runId: ObjectId,
  result: PhaseResult,
): Promise<void> {
  const run = await db.runs.findOne({ _id: runId }, { projection: { phaseResults: 1 } });
  if (!run) return;
  let idx = -1;
  for (let i = run.phaseResults.length - 1; i >= 0; i--) {
    const pr = run.phaseResults[i];
    if (pr && pr.phase === result.phase && pr.attempt === result.attempt) {
      idx = i;
      break;
    }
  }
  if (idx === -1) {
    await pushPhaseResult(db, runId, result);
    return;
  }
  await db.runs.updateOne(
    { _id: runId },
    { $set: { [`phaseResults.${idx}`]: result, updatedAt: new Date() } },
  );
}

export async function completeRun(db: EngineDb, runId: ObjectId): Promise<void> {
  const now = new Date();
  await db.runs.updateOne(
    { _id: runId },
    {
      $set: { status: "succeeded", endedAt: now, updatedAt: now },
      $unset: { leaseUntil: "", workerId: "" },
    },
  );
}

/**
 * Fail a run. If attempts < maxAttempts it goes back to `queued` with
 * fromStage set to the failing phase so the retry resumes there — completed
 * phases are never re-run.
 */
export async function failRun(
  db: EngineDb,
  runId: ObjectId,
  error: string,
  resumeFrom?: WorkStage,
): Promise<"requeued" | "failed"> {
  const now = new Date();
  const run = await db.runs.findOne({ _id: runId });
  if (!run) return "failed";
  if (run.attempts < run.maxAttempts) {
    await db.runs.updateOne(
      { _id: runId },
      {
        $set: {
          status: "queued",
          error,
          queuedAt: now,
          updatedAt: now,
          ...(resumeFrom ? { fromStage: resumeFrom } : {}),
        },
        $unset: { leaseUntil: "", workerId: "" },
      },
    );
    return "requeued";
  }
  await db.runs.updateOne(
    { _id: runId },
    {
      $set: { status: "failed", error, endedAt: now, updatedAt: now },
      $unset: { leaseUntil: "", workerId: "" },
    },
  );
  return "failed";
}

export async function cancelRun(db: EngineDb, runId: ObjectId): Promise<void> {
  const now = new Date();
  await db.runs.updateOne(
    { _id: runId, status: { $in: ["queued", "running"] } },
    {
      $set: { status: "canceled", endedAt: now, updatedAt: now },
      $unset: { leaseUntil: "", workerId: "" },
    },
  );
}
