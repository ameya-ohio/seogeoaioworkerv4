import { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import type { PhaseResult, RunDoc, WorkStage } from "../types.js";
import { markFailed } from "./articles.js";
import { emitEvent } from "./events.js";

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
 *
 * A reclaimed run resumes at the phase it was in (`currentPhase`), not at the
 * stage it was first queued from: the phases before it already persisted their
 * artifacts, so re-running them only repeats paid work. A reclaim still counts
 * as an attempt, and a lost run with no attempts left is failed instead of
 * reclaimed (failLostRuns), so a phase that keeps crashing its worker can't loop.
 */
export async function claimRun(
  db: EngineDb,
  workerId: string,
  leaseMs: number,
): Promise<RunDoc | null> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + leaseMs);
  await failLostRuns(db, now);
  const res = await db.runs.findOneAndUpdate(
    {
      $or: [
        { status: "queued" },
        { status: "running", leaseUntil: { $lt: now }, $expr: { $lt: ["$attempts", "$maxAttempts"] } },
      ],
    },
    [
      {
        $set: {
          // Evaluated against the document before this update: only a reclaim
          // (status still "running") moves the resume point.
          fromStage: {
            $cond: [{ $eq: ["$status", "running"] }, { $ifNull: ["$currentPhase", "$fromStage"] }, "$fromStage"],
          },
          status: "running",
          workerId,
          leaseUntil,
          startedAt: now,
          updatedAt: now,
          attempts: { $add: ["$attempts", 1] },
        },
      },
    ],
    { sort: { queuedAt: 1 }, returnDocument: "after" },
  );
  return res ?? null;
}

/**
 * Fail runs whose worker died (lease expired) with no attempts left. Without
 * this, claimRun would reclaim them forever: only failRun checked maxAttempts.
 */
export async function failLostRuns(db: EngineDb, now = new Date()): Promise<number> {
  const lost = await db.runs
    .find({ status: "running", leaseUntil: { $lt: now }, $expr: { $gte: ["$attempts", "$maxAttempts"] } })
    .toArray();
  let failed = 0;
  for (const run of lost) {
    const error = `worker lost the run during ${run.currentPhase ?? run.fromStage} with no attempts left (${run.attempts}/${run.maxAttempts})`;
    const res = await db.runs.updateOne(
      { _id: run._id, status: "running", leaseUntil: { $lt: now } },
      { $set: { status: "failed", error, endedAt: now, updatedAt: now }, $unset: { leaseUntil: "", workerId: "" } },
    );
    if (res.modifiedCount !== 1 || !run._id) continue;
    failed++;
    await markFailed(db, run.articleId, error);
    await emitEvent(db, {
      companyId: run.companyId,
      runId: run._id,
      articleId: run.articleId,
      type: "run.failed",
      message: `Run failed permanently: ${error}`,
    });
  }
  return failed;
}

/** Record the phase a run is starting, so a reclaim or release resumes there. */
export async function setRunPhase(db: EngineDb, runId: ObjectId, phase: WorkStage): Promise<void> {
  await db.runs.updateOne({ _id: runId }, { $set: { currentPhase: phase, updatedAt: new Date() } });
}

/**
 * Hand a run back to the queue on worker shutdown (a deploy's SIGTERM): it
 * resumes at its current phase and the attempt is refunded — a deploy isn't
 * the run's failure. Only the worker holding the lease can release it.
 * Returns the released run, or null if this worker no longer held it.
 */
export async function releaseRun(db: EngineDb, runId: ObjectId, workerId: string): Promise<RunDoc | null> {
  return db.runs.findOneAndUpdate(
    { _id: runId, status: "running", workerId },
    [
      {
        $set: {
          status: "queued",
          fromStage: { $ifNull: ["$currentPhase", "$fromStage"] },
          attempts: { $max: [{ $subtract: ["$attempts", 1] }, 0] },
          updatedAt: new Date(),
        },
      },
      { $unset: ["leaseUntil", "workerId"] },
    ],
    { returnDocument: "after" },
  );
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

/**
 * D59: stop a run for operator input. It leaves the queue (claimRun only
 * takes queued runs and expired running ones), keeps its attempts, and
 * resumes at `resumeFrom` once resumeRun puts it back. Only the worker
 * holding the lease can park it.
 */
export async function awaitInput(
  db: EngineDb,
  runId: ObjectId,
  workerId: string,
  resumeFrom: WorkStage,
): Promise<boolean> {
  const res = await db.runs.updateOne(
    { _id: runId, status: "running", workerId },
    {
      $set: { status: "awaiting_input", fromStage: resumeFrom, currentPhase: resumeFrom, updatedAt: new Date() },
      $unset: { leaseUntil: "", workerId: "" },
    },
  );
  return res.modifiedCount === 1;
}

/**
 * D59: put a run that was waiting for input back in the queue. The wait
 * doesn't count against it: the attempt it was claimed with is refunded,
 * like a release on shutdown. Returns the requeued run, or null when the
 * run wasn't waiting (already resumed, canceled).
 */
export async function resumeRun(db: EngineDb, runId: ObjectId): Promise<RunDoc | null> {
  const now = new Date();
  return db.runs.findOneAndUpdate(
    { _id: runId, status: "awaiting_input" },
    [
      {
        $set: {
          status: "queued",
          queuedAt: now,
          updatedAt: now,
          attempts: { $max: [{ $subtract: ["$attempts", 1] }, 0] },
        },
      },
    ],
    { returnDocument: "after" },
  );
}

export async function cancelRun(db: EngineDb, runId: ObjectId): Promise<void> {
  const now = new Date();
  await db.runs.updateOne(
    { _id: runId, status: { $in: ["queued", "running", "awaiting_input"] } },
    {
      $set: { status: "canceled", endedAt: now, updatedAt: now },
      $unset: { leaseUntil: "", workerId: "" },
    },
  );
}
