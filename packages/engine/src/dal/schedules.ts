import type { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import type { PlanScope } from "../plan/types.js";
import {
  DEFAULT_CADENCE,
  DEFAULT_ESTIMATED_ARTICLE_MINUTES,
  DEFAULT_LIMITS,
  type Cadence,
  type CompleteReason,
  type PauseReason,
  type ScheduleDoc,
  type ScheduleLimits,
} from "../schedule/types.js";
import { nextOccurrenceAfter, validateCadence } from "../schedule/calendar.js";

/**
 * Schedule persistence and the tick claim.
 *
 * There is deliberately no leader-election machinery: the resource that needs
 * mutual exclusion is a single schedule document, and Mongo's atomic
 * findOneAndUpdate already provides exactly that — the same idiom claimRun,
 * claimClusterRun and claimScrapeRun all use.
 */

export class ScheduleNotFoundError extends Error {}
export class InvalidCadenceError extends Error {}

export interface CreateScheduleInput {
  companyId: string;
  planId: ObjectId;
  name: string;
  cadence?: Partial<Cadence>;
  limits?: Partial<ScheduleLimits>;
  scope?: PlanScope;
  requireApproval?: boolean;
  estimatedArticleMinutes?: number;
  /** Start paused so the operator reviews the plan before anything runs. */
  startPaused?: boolean;
}

export async function createSchedule(
  db: EngineDb,
  input: CreateScheduleInput,
): Promise<ScheduleDoc> {
  const cadence: Cadence = { ...DEFAULT_CADENCE, ...input.cadence };
  const problems = validateCadence(cadence);
  if (problems.length > 0) throw new InvalidCadenceError(problems.join("; "));

  const now = new Date();
  const paused = input.startPaused ?? true;
  const doc: ScheduleDoc = {
    companyId: input.companyId,
    planId: input.planId,
    name: input.name,
    // Default to paused: a schedule that starts firing the moment it is
    // created would spend money before anyone looked at the plan.
    status: paused ? "paused" : "active",
    cadence,
    limits: { ...DEFAULT_LIMITS, ...input.limits },
    scope: input.scope ?? {},
    catchUp: { enabled: true, maxMissedFires: 1 },
    requireApproval: input.requireApproval ?? false,
    estimatedArticleMinutes: input.estimatedArticleMinutes ?? DEFAULT_ESTIMATED_ARTICLE_MINUTES,
    nextFireAt: paused ? null : nextOccurrenceAfter(cadence, now),
    fireSeq: 0,
    consecutiveFailures: 0,
    createdAt: now,
    updatedAt: now,
    ...(paused ? { pause: { reason: "operator" as PauseReason, at: now, detail: "created paused" } } : {}),
  };
  const res = await db.schedules.insertOne(doc);
  doc._id = res.insertedId;
  return doc;
}

export async function getSchedule(db: EngineDb, planId: ObjectId): Promise<ScheduleDoc | null> {
  return db.schedules.findOne({ planId });
}

export async function updateSchedule(
  db: EngineDb,
  planId: ObjectId,
  patch: {
    cadence?: Cadence;
    limits?: Partial<ScheduleLimits>;
    scope?: PlanScope;
    requireApproval?: boolean;
    estimatedArticleMinutes?: number;
    catchUp?: { enabled: boolean; maxMissedFires: number };
  },
): Promise<ScheduleDoc | null> {
  const existing = await getSchedule(db, planId);
  if (!existing) throw new ScheduleNotFoundError(planId.toHexString());

  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.cadence) {
    const problems = validateCadence(patch.cadence);
    if (problems.length > 0) throw new InvalidCadenceError(problems.join("; "));
    $set.cadence = patch.cadence;
    // A cadence change must move the next fire, or the old time sticks.
    if (existing.status === "active") {
      $set.nextFireAt = nextOccurrenceAfter(patch.cadence, new Date());
    }
  }
  if (patch.limits) $set.limits = { ...existing.limits, ...patch.limits };
  if (patch.scope) $set.scope = patch.scope;
  if (patch.requireApproval !== undefined) $set.requireApproval = patch.requireApproval;
  if (patch.estimatedArticleMinutes !== undefined) {
    $set.estimatedArticleMinutes = patch.estimatedArticleMinutes;
  }
  if (patch.catchUp) $set.catchUp = patch.catchUp;

  const res = await db.schedules.findOneAndUpdate(
    { planId },
    { $set },
    { returnDocument: "after" },
  );
  return res ?? null;
}

export async function pauseSchedule(
  db: EngineDb,
  planId: ObjectId,
  reason: PauseReason,
  detail: string,
): Promise<void> {
  await db.schedules.updateOne(
    { planId },
    {
      $set: {
        status: "paused",
        // Freeze the clock: a paused schedule must not silently accrue fires.
        nextFireAt: null,
        pause: { reason, at: new Date(), detail },
        updatedAt: new Date(),
      },
      $unset: { tickLeaseUntil: "", tickWorkerId: "" },
    },
  );
}

export async function completeSchedule(
  db: EngineDb,
  planId: ObjectId,
  reason: CompleteReason,
): Promise<void> {
  await db.schedules.updateOne(
    { planId },
    {
      $set: {
        status: "completed",
        nextFireAt: null,
        completedReason: reason,
        updatedAt: new Date(),
      },
      $unset: { tickLeaseUntil: "", tickWorkerId: "" },
    },
  );
}

export async function resumeSchedule(db: EngineDb, planId: ObjectId): Promise<ScheduleDoc | null> {
  const schedule = await getSchedule(db, planId);
  if (!schedule) throw new ScheduleNotFoundError(planId.toHexString());
  const problems = validateCadence(schedule.cadence);
  if (problems.length > 0) throw new InvalidCadenceError(problems.join("; "));

  const res = await db.schedules.findOneAndUpdate(
    { planId },
    {
      $set: {
        status: "active",
        nextFireAt: nextOccurrenceAfter(schedule.cadence, new Date()),
        // Resuming clears the failure streak; otherwise the schedule would
        // re-pause on the next single failure.
        consecutiveFailures: 0,
        updatedAt: new Date(),
      },
      $unset: { pause: "", completedReason: "", tickLeaseUntil: "", tickWorkerId: "" },
    },
    { returnDocument: "after" },
  );
  return res ?? null;
}

/**
 * Claim the next due schedule.
 *
 * This single atomic update IS the leader election: two workers racing on the
 * same due schedule, only one wins the lease. `$inc fireSeq` gives the winner
 * a monotonic token used as a compare-and-set on release, so a slow tick
 * whose lease expired cannot clobber a newer one.
 */
export async function claimScheduleTick(
  db: EngineDb,
  companyId: string,
  workerId: string,
  leaseMs: number,
  now = new Date(),
): Promise<ScheduleDoc | null> {
  const res = await db.schedules.findOneAndUpdate(
    {
      companyId,
      status: "active",
      nextFireAt: { $ne: null, $lte: now },
      $or: [{ tickLeaseUntil: { $exists: false } }, { tickLeaseUntil: { $lt: now } }],
    },
    {
      $set: {
        tickWorkerId: workerId,
        tickLeaseUntil: new Date(now.getTime() + leaseMs),
        lastTickAt: now,
        updatedAt: now,
      },
      $inc: { fireSeq: 1 },
    },
    { sort: { nextFireAt: 1 }, returnDocument: "after" },
  );
  return res ?? null;
}

export async function heartbeatSchedule(
  db: EngineDb,
  planId: ObjectId,
  workerId: string,
  leaseMs: number,
): Promise<boolean> {
  const res = await db.schedules.updateOne(
    { planId, tickWorkerId: workerId },
    { $set: { tickLeaseUntil: new Date(Date.now() + leaseMs), updatedAt: new Date() } },
  );
  return res.matchedCount === 1;
}

/**
 * Advance to the next fire and release the lease — but only if no one else
 * has ticked in the meantime (the fireSeq compare-and-set).
 */
export async function releaseScheduleTick(
  db: EngineDb,
  planId: ObjectId,
  fireSeq: number,
  nextFireAt: Date,
  servedFire: Date,
): Promise<boolean> {
  const res = await db.schedules.updateOne(
    { planId, fireSeq },
    {
      $set: { nextFireAt, lastFiredAt: servedFire, updatedAt: new Date() },
      $unset: { tickLeaseUntil: "", tickWorkerId: "" },
    },
  );
  return res.matchedCount === 1;
}

export async function recordFailureStreak(
  db: EngineDb,
  planId: ObjectId,
  consecutiveFailures: number,
): Promise<void> {
  await db.schedules.updateOne(
    { planId },
    { $set: { consecutiveFailures, updatedAt: new Date() } },
  );
}

export async function listSchedules(db: EngineDb, companyId: string): Promise<ScheduleDoc[]> {
  return db.schedules.find({ companyId }).sort({ createdAt: -1 }).toArray();
}
