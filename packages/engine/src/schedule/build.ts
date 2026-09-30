import { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import { emitPlanEvent } from "../dal/planEvents.js";
import { releaseMetHolds } from "../dal/plans.js";
import type { PageRole, PlanItemDoc } from "../plan/types.js";
import { itemKey, loadPlanGraph, type PlanGraph } from "./graph.js";
import { isReady } from "./readiness.js";
import { computeSequence, type SequenceInput } from "./sequencing.js";
import { claimAndEnqueue, consecutiveFailures, reconcilePlanItems } from "./tick.js";
import { DEFAULT_LIMITS } from "./types.js";

/**
 * Operator-queued builds.
 *
 * The operator picks what to build — a subtopic, or a whole pillar — and the
 * build sweep produces it bottom-up with no cadence involved: the subtopic's
 * cluster articles first, its hub once they are all produced, and the pillar
 * page once every hub in the pillar is.
 *
 * The unit is the SUBTOPIC because that is what goes live: a subtopic's
 * articles and its hub are released together (see ./release.ts), so
 * selecting any row in a subtopic queues all of it.
 */

const CANDIDATE = new Set(["planned", "failed"]);

/** One subtopic a build touches. */
export interface BuildSubtopic {
  pillarId: string;
  pillarName: string;
  subtopicId: string | null;
  subtopicName: string | null;
  clusters: number;
  hub: boolean;
}

export interface BuildSummary {
  subtopics: BuildSubtopic[];
  /** Pillar pages that will follow once all their hubs are produced. */
  pillarPages: { pillarId: string; title: string }[];
  /** Items this build will queue (not yet produced, not already queued). */
  toQueue: string[];
  byRole: Record<PageRole, number>;
  alreadyProduced: number;
  inProgress: number;
  alreadyQueued: number;
  /** Held items in scope: skipped by the sweep until an operator acts (D51). */
  held: number;
}

function subtopicKey(i: PlanItemDoc): string {
  return `${i.pillarId}::${i.subtopicId ?? ""}`;
}

/**
 * Expand a selection to the units that ship: every row's whole subtopic
 * (cluster articles plus hub), its pillar page, and — for a selected pillar
 * page — the whole pillar.
 */
export function expandBuildSelection(graph: PlanGraph, keys: readonly string[]): PlanItemDoc[] {
  const pillars = new Set<string>();
  const subtopics = new Set<string>();
  for (const k of keys) {
    const item = graph.byKey.get(k);
    if (!item) continue;
    if (item.pageRole === "pillar") pillars.add(item.pillarId);
    else subtopics.add(subtopicKey(item));
  }
  const picked = new Map<string, PlanItemDoc>();
  for (const i of graph.items) {
    if (pillars.has(i.pillarId) || (i.pageRole !== "pillar" && subtopics.has(subtopicKey(i)))) {
      picked.set(itemKey(i), i);
    }
  }
  // Every ancestor follows: the hub (for a subtopic whose clusters sit under
  // it) and the pillar page.
  for (const i of [...picked.values()]) {
    let parentKey = i.parentItemId?.toHexString();
    while (parentKey && !picked.has(parentKey)) {
      const parent = graph.byKey.get(parentKey);
      if (!parent) break;
      picked.set(parentKey, parent);
      parentKey = parent.parentItemId?.toHexString();
    }
  }
  return [...picked.values()].sort((a, b) => a.sequence - b.sequence);
}

export function summarizeBuild(graph: PlanGraph, keys: readonly string[]): BuildSummary {
  const items = expandBuildSelection(graph, keys);
  const summary: BuildSummary = {
    subtopics: [],
    pillarPages: [],
    toQueue: [],
    byRole: { pillar: 0, hub: 0, cluster: 0 },
    alreadyProduced: 0,
    inProgress: 0,
    alreadyQueued: 0,
    held: 0,
  };
  const subs = new Map<string, BuildSubtopic>();
  for (const i of items) {
    if (i.pageRole === "pillar") {
      summary.pillarPages.push({ pillarId: i.pillarId, title: i.title });
    } else {
      const k = subtopicKey(i);
      const sub = subs.get(k) ?? {
        pillarId: i.pillarId,
        pillarName: i.pillarName,
        subtopicId: i.subtopicId,
        subtopicName: i.subtopicName,
        clusters: 0,
        hub: false,
      };
      if (i.pageRole === "hub") sub.hub = true;
      else sub.clusters++;
      subs.set(k, sub);
    }
    if (i.status === "done") summary.alreadyProduced++;
    else if (i.status === "enqueued" || i.status === "in_progress") summary.inProgress++;
    else if (i.held && CANDIDATE.has(i.status)) summary.held++;
    else if (CANDIDATE.has(i.status)) {
      if (i.buildQueuedAt) summary.alreadyQueued++;
      else {
        summary.toQueue.push(itemKey(i));
        summary.byRole[i.pageRole]++;
      }
    }
  }
  summary.subtopics = [...subs.values()];
  return summary;
}

/** Queue a selection for build. Returns what was queued. */
export async function queueBuild(
  db: EngineDb,
  p: { companyId: string; planId: ObjectId; keys: readonly string[]; now?: Date },
): Promise<BuildSummary> {
  const now = p.now ?? new Date();
  const graph = await loadPlanGraph(db, p.planId);
  const summary = summarizeBuild(graph, p.keys);
  const ids = summary.toQueue.filter((k) => ObjectId.isValid(k)).map((k) => new ObjectId(k));
  if (ids.length) {
    await db.planItems.updateMany(
      { _id: { $in: ids }, status: { $in: ["planned", "failed"] } },
      { $set: { buildQueuedAt: now, updatedAt: now } },
    );
    const where = summary.subtopics
      .map((s) => s.subtopicName ?? s.pillarName)
      .slice(0, 4)
      .join(", ");
    await emitPlanEvent(db, {
      companyId: p.companyId,
      planId: p.planId,
      type: "build.queued",
      message:
        `Build queued: ${ids.length} page(s) across ${summary.subtopics.length} subtopic(s)` +
        (where ? ` (${where}${summary.subtopics.length > 4 ? ", …" : ""})` : ""),
      data: { count: ids.length, byRole: summary.byRole },
    });
  }
  return summary;
}

/** Take not-yet-started items out of the build. Work already running continues. */
export async function cancelBuild(
  db: EngineDb,
  p: { companyId: string; planId: ObjectId; keys: readonly string[] },
): Promise<number> {
  const graph = await loadPlanGraph(db, p.planId);
  const items = expandBuildSelection(graph, p.keys).filter(
    (i) => i.buildQueuedAt && CANDIDATE.has(i.status),
  );
  if (!items.length) return 0;
  await db.planItems.updateMany(
    { _id: { $in: items.map((i) => i._id as ObjectId) }, status: { $in: ["planned", "failed"] } },
    { $unset: { buildQueuedAt: "" }, $set: { updatedAt: new Date() } },
  );
  await emitPlanEvent(db, {
    companyId: p.companyId,
    planId: p.planId,
    type: "build.cancelled",
    message: `Build cancelled for ${items.length} page(s) not yet started`,
    data: { count: items.length },
  });
  return items.length;
}

export interface BuildSweepDeps {
  db: EngineDb;
  companyId: string;
  /** Limit to one plan (the web's "build now"); otherwise every plan with queued work. */
  planId?: ObjectId;
  maxRunAttempts?: number;
  contextFileExists?: (repoPath: string) => boolean;
  log?: (msg: string) => void;
  now?: () => Date;
}

export interface BuildSweepOutcome {
  planId: string;
  enqueued: { slug: string; sequence: number; title: string }[];
  held?: string;
}

/**
 * Produce queued build items that are ready, up to the plan's in-flight limit.
 *
 * Limits come from the plan's cadence when it has one, else the defaults. The
 * review-queue cap is deliberately NOT applied: the operator asked for this
 * build by hand, and its articles are approved as one release. The failure
 * brake is: a run of failures usually means something environmental (an
 * expired key), and a build would otherwise keep paying for it.
 *
 * Idempotent like the tick — every enqueue is a compare-and-set on the item —
 * so it is safe to run from several workers and from the web at once. Two
 * sweeps racing can overshoot maxInFlight by one or two; they never
 * double-produce an item.
 */
export async function runBuildSweep(deps: BuildSweepDeps): Promise<BuildSweepOutcome[]> {
  const { db, companyId } = deps;
  const log = deps.log ?? (() => {});
  const now = deps.now?.() ?? new Date();

  const planIds: ObjectId[] = deps.planId
    ? [deps.planId]
    : await db.planItems.distinct("planId", {
        companyId,
        buildQueuedAt: { $exists: true },
        status: { $in: ["planned", "failed", "enqueued", "in_progress"] },
      });

  const outcomes: BuildSweepOutcome[] = [];
  for (const planId of planIds) {
    const queued = await db.planItems.countDocuments({
      planId,
      buildQueuedAt: { $exists: true },
      status: { $in: ["planned", "failed", "enqueued", "in_progress"] },
    });
    if (queued === 0) continue;
    outcomes.push(await sweepPlan(deps, planId, now, log));
  }
  return outcomes;
}

async function sweepPlan(
  deps: BuildSweepDeps,
  planId: ObjectId,
  now: Date,
  log: (m: string) => void,
): Promise<BuildSweepOutcome> {
  const { db, companyId } = deps;
  const outcome: BuildSweepOutcome = { planId: planId.toHexString(), enqueued: [] };

  await reconcilePlanItems(db, planId, now);
  if (deps.contextFileExists) await releaseMetHolds(db, planId, deps.contextFileExists);

  const schedule = await db.schedules.findOne({ planId });
  const limits = schedule?.limits ?? DEFAULT_LIMITS;
  const requireApproval = schedule?.requireApproval ?? false;

  const setHold = async (hold: string | null) => {
    const plan = await db.plans.findOne({ _id: planId }, { projection: { buildHold: 1 } });
    if ((plan?.buildHold ?? null) === hold) return;
    if (hold) {
      await db.plans.updateOne({ _id: planId }, { $set: { buildHold: hold, updatedAt: now } });
      await emitPlanEvent(db, { companyId, planId, type: "build.held", message: hold });
    } else {
      await db.plans.updateOne({ _id: planId }, { $unset: { buildHold: "" }, $set: { updatedAt: now } });
    }
  };

  const streak = await consecutiveFailures(db, planId);
  if (streak >= limits.consecutiveFailureLimit) {
    const hold =
      `Builds paused: ${streak} articles failed in a row. ` +
      `Retry or skip them on the Articles tab to resume.`;
    await setHold(hold);
    outcome.held = hold;
    log(`plan ${planId.toHexString()}: ${hold}`);
    return outcome;
  }
  await setHold(null);

  const inFlight = await db.planItems.countDocuments({
    planId,
    status: { $in: ["enqueued", "in_progress"] },
  });
  let budget = limits.maxInFlight - inFlight;
  if (budget <= 0) return outcome;

  const graph = await loadPlanGraph(db, planId);
  const enqueuedThisTick = new Set<string>();
  const candidates = graph.items.filter(
    (i) => i.buildQueuedAt && CANDIDATE.has(i.status) && !i.held,
  );

  for (const item of candidates) {
    if (budget <= 0) break;
    const ready = isReady(graph.readiness(item), graph.children(item), enqueuedThisTick, {
      requireApproval,
      itemMaxAttempts: limits.itemMaxAttempts,
      now,
    });
    if (!ready.ready) {
      if (ready.reason === "attempts_exhausted" && item.status === "failed") {
        await db.planItems.updateOne(
          { _id: item._id },
          { $set: { status: "quarantined", updatedAt: now } },
        );
        await emitPlanEvent(db, {
          companyId, planId, planItemId: item._id, type: "item.quarantined",
          message: `"${item.title}" quarantined after ${item.failureCount} attempts`,
          data: { failureCount: item.failureCount, lastError: item.lastError },
        });
      }
      continue;
    }
    const res = await claimAndEnqueue(db, {
      companyId,
      planId,
      item,
      now,
      eventType: "build.enqueued",
      ...(deps.maxRunAttempts !== undefined ? { maxRunAttempts: deps.maxRunAttempts } : {}),
    });
    if (res === "lost" || res === "slug_conflict") continue;
    enqueuedThisTick.add(itemKey(item));
    budget--;
    if (res === "enqueued") {
      outcome.enqueued.push({ slug: item.slug, sequence: item.sequence, title: item.title });
    }
  }
  if (outcome.enqueued.length) {
    log(
      `plan ${planId.toHexString()}: build queued ${outcome.enqueued
        .map((e) => `#${e.sequence} ${e.slug}`)
        .join(", ")}`,
    );
  }
  return outcome;
}

/**
 * Recompute an imported plan's `sequence` with the current (bottom-up) rule.
 * Plans committed before the direction changed carry top-down numbers; the
 * readiness check already enforces the new order, so this only fixes the
 * order shown in the Articles tab and the tiebreak among ready items.
 */
export async function resequencePlan(
  db: EngineDb,
  planId: ObjectId,
  opts: { write?: boolean } = {},
): Promise<{ changed: number; violations: string[] }> {
  const items = await db.planItems.find({ planId }).toArray();
  const extOf = new Map(items.map((i) => [i._id?.toHexString() ?? "", i.externalId]));
  const inputs: SequenceInput[] = items.map((i) => ({
    key: i.externalId,
    parentKey: i.parentItemId ? extOf.get(i.parentItemId.toHexString()) ?? null : null,
    rowIndex: i.sheetRow,
    pillarId: i.pillarId,
    subtopicId: i.subtopicId,
    role: i.pageRole,
    priority: i.priority,
    funnel: i.funnel,
    tier: i.tierHint,
  }));
  const { ordered, violations } = computeSequence(inputs);
  const next = new Map(ordered.map((o) => [o.key, o.sequence]));
  const changes = items.filter((i) => next.get(i.externalId) !== i.sequence);
  if (opts.write && changes.length) {
    await db.planItems.bulkWrite(
      changes.map((i) => ({
        updateOne: {
          filter: { _id: i._id },
          update: { $set: { sequence: next.get(i.externalId) as number } },
        },
      })),
    );
  }
  return { changed: changes.length, violations };
}
