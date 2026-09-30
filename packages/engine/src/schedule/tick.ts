import { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import { SlugTakenError } from "../pipelineOps.js";
import { getArticleBySlug } from "../dal/articles.js";
import { emitPlanEvent } from "../dal/planEvents.js";
import {
  enqueuePlanItem,
  planCostUsd,
  releaseMetHolds,
} from "../dal/plans.js";
import {
  claimScheduleTick,
  completeSchedule,
  heartbeatSchedule,
  pauseSchedule,
  recordFailureStreak,
  releaseScheduleTick,
} from "../dal/schedules.js";
import type { PlanItemDoc, PlanScope } from "../plan/types.js";
import type { Stage } from "../types.js";
import { WORK_STAGES } from "../types.js";
import {
  lastOccurrenceAtOrBefore,
  nextOccurrenceAfter,
  occurrencesBetween,
  startOfLocalWeek,
} from "./calendar.js";
import { loadPlanGraph } from "./graph.js";
import { isReady, isProducedStage, retryBackoffMs } from "./readiness.js";
import type { ScheduleDoc } from "./types.js";

/**
 * One scheduler tick.
 *
 * Idempotency lives on the PLAN ITEM, not on the tick. Every enqueue is a
 * compare-and-set on the item's status, so a duplicated tick simply finds
 * fewer candidates and a missed tick leaves them for the next fire. There is
 * no "did fire #37 already run?" bookkeeping to get wrong.
 *
 * Ordering is resolved here rather than in claimRun: the tick only ever
 * enqueues items whose children are already produced, in sequence order, so
 * the article queue's plain FIFO is already a valid execution order. That is
 * why RunDoc needs no priority or dependency fields.
 */

export interface TickDeps {
  db: EngineDb;
  companyId: string;
  workerId: string;
  leaseMs: number;
  heartbeatMs: number;
  maxRunAttempts?: number;
  /** Log and report what WOULD happen without enqueueing anything. */
  dryRun?: boolean;
  /** D51: releases fact-sheet / dataset holds whose file now exists. */
  contextFileExists?: (repoPath: string) => boolean;
  log?: (msg: string) => void;
  now?: () => Date;
}

export interface TickOutcome {
  status:
    | "no_work"
    | "enqueued"
    | "throttled"
    | "paused"
    | "completed"
    | "nothing_ready";
  planId?: string;
  fireSeq?: number;
  servedFire?: Date;
  nextFireAt?: Date | null;
  enqueued: { planItemId: string; slug: string; sequence: number; title: string }[];
  skipped: { planItemId: string; slug: string; reason: string }[];
  /** Which limit bound this fire's budget, when one did. */
  binding?: string;
  detail?: string;
}

const emptyOutcome = (status: TickOutcome["status"]): TickOutcome => ({
  status,
  enqueued: [],
  skipped: [],
});

function scopeFilter(scope: PlanScope): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (scope.maxSequence !== undefined) f.sequence = { $lte: scope.maxSequence };
  if (scope.pillarIds?.length) f.pillarId = { $in: scope.pillarIds };
  if (scope.roles?.length) f.pageRole = { $in: scope.roles };
  if (scope.tiers?.length) f.priority = { $in: scope.tiers };
  return f;
}

/**
 * Bring plan items back in step with the articles they produced.
 *
 * This is what makes the whole thing self-healing: a worker that died between
 * claiming an item and enqueueing it leaves an item marked `enqueued` with no
 * article, and this returns it to `planned`. It is also the plan board's data
 * source, so there is no second place that decides what "done" means.
 */
export async function reconcilePlanItems(
  db: EngineDb,
  planId: ObjectId,
  now: Date,
): Promise<{ done: number; failed: number; recovered: number; running: number }> {
  const inFlight = await db.planItems
    .find({ planId, status: { $in: ["enqueued", "in_progress"] } })
    .toArray();

  let done = 0;
  let failed = 0;
  let recovered = 0;
  let running = 0;

  for (const item of inFlight) {
    const itemId = item._id;
    if (!itemId) continue;
    const article = item.articleId ? await db.articles.findOne({ _id: item.articleId }) : null;

    if (!article) {
      await db.planItems.updateOne(
        { _id: itemId },
        { $set: { status: "planned", updatedAt: now }, $unset: { articleId: "", runId: "" } },
      );
      recovered++;
      continue;
    }
    if (isProducedStage(article.stage)) {
      await db.planItems.updateOne(
        { _id: itemId },
        { $set: { status: "done", completedAt: now, updatedAt: now } },
      );
      done++;
      continue;
    }
    if (article.stage === "failed") {
      const failureCount = item.failureCount + 1;
      await db.planItems.updateOne(
        { _id: itemId },
        {
          $set: {
            status: "failed",
            failureCount,
            retryAfter: new Date(now.getTime() + retryBackoffMs(failureCount)),
            lastError: article.error ?? "article pipeline failed",
            updatedAt: now,
          },
        },
      );
      failed++;
      continue;
    }
    if (item.status !== "in_progress") {
      await db.planItems.updateOne({ _id: itemId }, { $set: { status: "in_progress", updatedAt: now } });
    }
    running++;
  }
  return { done, failed, recovered, running };
}

/** Consecutive plan articles that reached `failed` with no success after them. */
async function consecutiveFailures(db: EngineDb, planId: ObjectId): Promise<number> {
  const recent = await db.planItems
    .find({ planId, status: { $in: ["failed", "done", "quarantined"] } })
    .sort({ updatedAt: -1 })
    .limit(20)
    .toArray();
  let streak = 0;
  for (const item of recent) {
    if (item.status === "done") break;
    if (item.status === "failed" || item.status === "quarantined") streak++;
  }
  return streak;
}

export async function runScheduleTick(deps: TickDeps): Promise<TickOutcome> {
  const { db, companyId } = deps;
  const log = deps.log ?? (() => {});
  const now = deps.now?.() ?? new Date();

  // 1. CLAIM — the leader election.
  const schedule = await claimScheduleTick(db, companyId, deps.workerId, deps.leaseMs, now);
  if (!schedule?._id) return emptyOutcome("no_work");
  const planId = schedule.planId;
  const fireSeq = schedule.fireSeq;
  const servedFire = schedule.nextFireAt ?? now;

  const beat = setInterval(() => {
    void heartbeatSchedule(db, planId, deps.workerId, deps.leaseMs).then((ok) => {
      if (!ok) log(`lost schedule lease on plan ${planId.toHexString()}`);
    });
  }, deps.heartbeatMs);

  try {
    return await tickBody(deps, schedule, { now, planId, fireSeq, servedFire, log });
  } finally {
    clearInterval(beat);
  }
}

async function tickBody(
  deps: TickDeps,
  schedule: ScheduleDoc,
  c: {
    now: Date;
    planId: ObjectId;
    fireSeq: number;
    servedFire: Date;
    log: (m: string) => void;
  },
): Promise<TickOutcome> {
  const { db, companyId } = deps;
  const { now, planId, fireSeq, servedFire, log } = c;
  const outcome: TickOutcome = {
    ...emptyOutcome("enqueued"),
    planId: planId.toHexString(),
    fireSeq,
    servedFire,
  };

  // 2. CATCH-UP — collapse a backlog rather than replaying every missed fire.
  let advanceFloor = servedFire;
  const missed = occurrencesBetween(schedule.cadence, servedFire, now, 50).length;
  if (missed > schedule.catchUp.maxMissedFires || !schedule.catchUp.enabled) {
    const latest = lastOccurrenceAtOrBefore(schedule.cadence, now, servedFire);
    if (latest) advanceFloor = latest;
    await emitPlanEvent(db, {
      companyId,
      planId,
      type: "schedule.skipped",
      message: `Skipped ${missed} missed fire(s) after downtime — resuming from the latest`,
      data: { missed, from: servedFire, to: advanceFloor },
    });
  }

  // 3. RECONCILE.
  const rec = await reconcilePlanItems(db, planId, now);
  if (rec.done || rec.failed || rec.recovered) {
    log(
      `plan ${planId.toHexString()}: reconciled ${rec.done} done, ${rec.failed} failed, ${rec.recovered} recovered`,
    );
  }
  const streak = await consecutiveFailures(db, planId);
  await recordFailureStreak(db, planId, streak);

  const finish = async (status: TickOutcome["status"], extra: Partial<TickOutcome> = {}) => {
    const next = nextOccurrenceAfter(schedule.cadence, advanceFloor);
    await releaseScheduleTick(db, planId, fireSeq, next, servedFire);
    await emitPlanEvent(db, {
      companyId,
      planId,
      type: "schedule.tick",
      message:
        `Fire ${fireSeq}: ${outcome.enqueued.length} queued` +
        (extra.binding ? ` (held by ${extra.binding})` : ""),
      data: {
        fireSeq,
        enqueued: outcome.enqueued.length,
        nextFireAt: next,
        ...(extra.binding ? { binding: extra.binding } : {}),
      },
    });
    return { ...outcome, ...extra, status, nextFireAt: next };
  };

  const halt = async (
    status: "paused" | "completed",
    reason: string,
    detail: string,
  ): Promise<TickOutcome> => {
    if (status === "paused") {
      await pauseSchedule(db, planId, reason as "consecutive_failures" | "budget_cap", detail);
      await emitPlanEvent(db, {
        companyId, planId, type: "schedule.paused",
        message: detail, data: { reason },
      });
    } else {
      await completeSchedule(db, planId, reason as "volume_cap" | "plan_finished");
      await emitPlanEvent(db, {
        companyId, planId, type: "plan.completed",
        message: detail, data: { reason },
      });
    }
    return { ...outcome, status, detail, nextFireAt: null };
  };

  // 4. HARD BRAKES.
  const limits = schedule.limits;
  if (streak >= limits.consecutiveFailureLimit) {
    const last = await db.planItems
      .find({ planId, status: "failed" })
      .sort({ updatedAt: -1 })
      .limit(1)
      .toArray();
    const detail =
      `${streak} consecutive failures — last: "${last[0]?.slug ?? "unknown"}" ` +
      `(${last[0]?.lastError ?? "no error recorded"})`;
    return halt("paused", "consecutive_failures", detail);
  }
  if (limits.maxCostUsd !== undefined) {
    const spent = await planCostUsd(db, planId);
    if (spent >= limits.maxCostUsd) {
      return halt(
        "paused",
        "budget_cap",
        `Plan spend $${spent.toFixed(2)} reached the cap of $${limits.maxCostUsd.toFixed(2)}`,
      );
    }
  }
  const doneCount = await db.planItems.countDocuments({ planId, status: "done" });
  if (limits.maxTotalArticles !== undefined && doneCount >= limits.maxTotalArticles) {
    return halt(
      "completed",
      "volume_cap",
      `Produced ${doneCount} articles, reaching the plan cap of ${limits.maxTotalArticles}`,
    );
  }

  // 5. SOFT BRAKES — shrink this fire's budget; never accrue a backlog.
  const scope = scopeFilter(schedule.scope);
  const inFlight = await db.planItems.countDocuments({
    planId,
    status: { $in: ["enqueued", "in_progress"] },
  });
  // Company-wide: the human review gate is a shared resource, and an ad-hoc
  // Chat article consumes exactly the same attention a plan article does.
  const awaitingReview = await db.articles.countDocuments({ companyId, stage: "review" });

  let weekCount = 0;
  if (limits.maxPerCalendarWeek !== undefined) {
    const weekStart = startOfLocalWeek(now, schedule.cadence.timezone);
    weekCount = await db.planItems.countDocuments({ planId, enqueuedAt: { $gte: weekStart } });
  }

  const budgets: { name: string; value: number }[] = [
    { name: "batch size", value: schedule.cadence.batchSize },
    { name: "max in flight", value: limits.maxInFlight - inFlight },
    { name: "review queue", value: limits.maxAwaitingReview - awaitingReview },
  ];
  if (limits.maxPerCalendarWeek !== undefined) {
    budgets.push({ name: "weekly cap", value: limits.maxPerCalendarWeek - weekCount });
  }
  if (limits.maxTotalArticles !== undefined) {
    budgets.push({ name: "plan volume cap", value: limits.maxTotalArticles - doneCount });
  }
  budgets.sort((a, b) => a.value - b.value);
  const tightest = budgets[0] as { name: string; value: number };
  let budget = tightest.value;

  if (budget <= 0) {
    await emitPlanEvent(db, {
      companyId, planId, type: "schedule.throttled",
      message:
        `Fire ${fireSeq} skipped — held by ${tightest.name} ` +
        `(in flight ${inFlight}/${limits.maxInFlight}, awaiting review ${awaitingReview}/${limits.maxAwaitingReview}). ` +
        `This slot is skipped, not owed.`,
      data: { inFlight, awaitingReview, binding: tightest.name },
    });
    return finish("throttled", { binding: tightest.name });
  }

  // 6. SELECT + ENQUEUE — sequence order, readiness per item, skip never stall.
  // D51: held items (vendor formats, missing fact sheets, non-producible
  // formats) are never produced unattended. Release the ones now met first.
  if (deps.contextFileExists && !deps.dryRun) {
    const released = await releaseMetHolds(db, planId, deps.contextFileExists);
    if (released.length) log(`released ${released.length} held item(s): ${released.join(", ")}`);
  }
  const candidates = await db.planItems
    .find({
      planId,
      ...scope,
      status: { $in: ["planned", "failed"] },
      held: { $exists: false },
    })
    .sort({ sequence: 1 })
    .toArray();

  const graph = await loadPlanGraph(db, planId);

  const enqueuedThisTick = new Set<string>();
  const blockedReported = new Set<string>();

  for (const item of candidates) {
    if (budget <= 0) break;
    const itemId = item._id;
    if (!itemId) continue;

    const ready = isReady(graph.readiness(item), graph.children(item), enqueuedThisTick, {
      requireApproval: schedule.requireApproval,
      itemMaxAttempts: limits.itemMaxAttempts,
      now,
    });

    if (!ready.ready) {
      // Skip to the next candidate — never stall the cadence on one blocked
      // page. A stuck cluster article costs its hub, not the schedule.
      if (ready.reason === "children_blocked" && !blockedReported.has(item.externalId)) {
        blockedReported.add(item.externalId);
        await emitPlanEvent(db, {
          companyId, planId, planItemId: itemId, type: "item.blocked",
          message: `"${item.title}" is blocked: a page under it needs attention`,
        });
      }
      if (ready.reason === "attempts_exhausted" && item.status === "failed") {
        await db.planItems.updateOne(
          { _id: itemId },
          { $set: { status: "quarantined", updatedAt: now } },
        );
        await emitPlanEvent(db, {
          companyId, planId, planItemId: itemId, type: "item.quarantined",
          message: `"${item.title}" quarantined after ${item.failureCount} attempts`,
          data: { failureCount: item.failureCount, lastError: item.lastError },
        });
      }
      outcome.skipped.push({
        planItemId: itemId.toHexString(),
        slug: item.slug,
        reason: ready.reason,
      });
      continue;
    }

    if (deps.dryRun) {
      log(`[dry-run] would enqueue #${item.sequence} ${item.slug}`);
      outcome.enqueued.push({
        planItemId: itemId.toHexString(),
        slug: item.slug,
        sequence: item.sequence,
        title: item.title,
      });
      enqueuedThisTick.add(itemId.toHexString());
      budget--;
      continue;
    }

    const res = await claimAndEnqueue(db, {
      companyId,
      planId,
      item,
      now,
      fireSeq,
      ...(deps.maxRunAttempts !== undefined ? { maxRunAttempts: deps.maxRunAttempts } : {}),
    });
    if (res === "lost") continue;
    if (res === "slug_conflict") {
      // The fire still owes an article, so the next candidate gets the slot.
      outcome.skipped.push({
        planItemId: itemId.toHexString(),
        slug: item.slug,
        reason: "slug_conflict",
      });
      continue;
    }
    enqueuedThisTick.add(itemId.toHexString());
    budget--;
    if (res === "enqueued") {
      outcome.enqueued.push({
        planItemId: itemId.toHexString(),
        slug: item.slug,
        sequence: item.sequence,
        title: item.title,
      });
    }
  }

  if (outcome.enqueued.length === 0) {
    const remaining = await db.planItems.countDocuments({
      planId,
      ...scope,
      status: { $in: ["planned", "failed", "enqueued", "in_progress"] },
    });
    if (remaining === 0) {
      return halt("completed", "plan_finished", "Every article in scope has been produced");
    }
    return finish("nothing_ready");
  }
  return finish("enqueued");
}

/**
 * Claim one ready plan item and turn it into an article. Shared by the
 * cadence tick and the build sweep, so both park a slug conflict and adopt a
 * crashed enqueue the same way.
 *
 * - "enqueued": a new article run was queued.
 * - "adopted": a previous claim crashed after creating the article; adopted.
 *   It counts against the caller's budget.
 * - "slug_conflict": the slug belongs to another article; the item is parked.
 * - "lost": another tick claimed it first.
 */
export async function claimAndEnqueue(
  db: EngineDb,
  p: {
    companyId: string;
    planId: ObjectId;
    item: PlanItemDoc;
    now: Date;
    fireSeq?: number;
    maxRunAttempts?: number;
    eventType?: "schedule.enqueued" | "build.enqueued";
  },
): Promise<"enqueued" | "adopted" | "slug_conflict" | "lost"> {
  const { companyId, planId, item, now } = p;
  const itemId = item._id as ObjectId;

  // Per-item compare-and-set: this is the idempotency guarantee. A second
  // tick racing here simply loses and moves on.
  const claimed = await db.planItems.findOneAndUpdate(
    { _id: itemId, status: item.status },
    {
      $set: {
        status: "enqueued",
        enqueuedAt: now,
        ...(p.fireSeq !== undefined ? { fireSeq: p.fireSeq } : {}),
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  if (!claimed) return "lost";

  try {
    const { article } = await enqueuePlanItem(db, {
      companyId,
      planItemId: itemId,
      ...(p.maxRunAttempts !== undefined ? { maxAttempts: p.maxRunAttempts } : {}),
      eventData: {
        planId: planId.toHexString(),
        planItemId: itemId.toHexString(),
        sequence: item.sequence,
        ...(p.fireSeq !== undefined ? { fireSeq: p.fireSeq } : {}),
      },
    });
    await emitPlanEvent(db, {
      companyId, planId, planItemId: itemId, type: p.eventType ?? "schedule.enqueued",
      message: `Queued #${item.sequence} "${item.title}"`,
      data: { slug: item.slug, sequence: item.sequence, articleId: article._id?.toHexString() },
    });
    return "enqueued";
  } catch (err) {
    if (err instanceof SlugTakenError) {
      const existing = await getArticleBySlug(db, companyId, item.slug);
      if (existing?.planItemId && existing.planItemId.equals(itemId)) {
        // A previous tick crashed between the CAS and the enqueue: adopt the
        // article it already created.
        await db.planItems.updateOne(
          { _id: itemId },
          { $set: { status: "in_progress", articleId: existing._id, updatedAt: now } },
        );
        return "adopted";
      }
      // Never auto-suffix a slug: two near-identical URLs is a canonical
      // mess. Park the item.
      await db.planItems.updateOne(
        { _id: itemId },
        {
          $set: {
            status: "slug_conflict",
            ...(existing?._id ? { conflictWith: existing._id } : {}),
            lastError: err.message,
            updatedAt: now,
          },
        },
      );
      await emitPlanEvent(db, {
        companyId, planId, planItemId: itemId, type: "item.slug_conflict",
        message: `"${item.slug}" is already taken by another article — resolve it in the plan`,
        data: { slug: item.slug },
      });
      return "slug_conflict";
    }
    // Unexpected: release the claim so the item is retried, then rethrow.
    await db.planItems.updateOne({ _id: itemId }, { $set: { status: item.status, updatedAt: now } });
    throw err;
  }
}

/** Consecutive-failure count, exported for the build sweep's brake. */
export { consecutiveFailures };

/** Work stages an article passes through while a plan item is in progress. */
export const IN_PROGRESS_STAGES: readonly Stage[] = ["queued", ...WORK_STAGES];
