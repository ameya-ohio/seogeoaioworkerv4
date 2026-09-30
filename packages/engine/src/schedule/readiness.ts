import type { Stage } from "../types.js";
import type { PlanItemStatus } from "../plan/types.js";

/**
 * Whether a plan item may be enqueued on this tick.
 *
 * Plans build BOTTOM-UP: a subtopic hub waits for its cluster articles, and a
 * pillar page waits for its hubs. A routing page summarizes and links to the
 * pages under it, so it is written best once they exist; and a subtopic's
 * articles and its hub go live together as one release, so nothing links to
 * a page that is not up yet.
 *
 * The old top-down order existed because the edit gate stripped a link to an
 * unbuilt page (D35). Since D53 a planned page is linked to its reserved
 * /learn/ URL and the link is deferred, not stripped, so a cluster article
 * can link up to a hub that is written after it.
 */

/**
 * "Produced" = the pipeline finished and the article exists with a slug and a
 * draft. This set is decision 1 ("the cadence stops at review") written down:
 * requiring `approved` instead would hold every hub behind human approval of
 * all its cluster articles, which is a human-gated schedule rather than the
 * automatic one the operator asked for. Approval gates the RELEASE instead
 * (see ./release.ts).
 */
export const PRODUCED_STAGES: readonly Stage[] = ["review", "approved", "publishing", "published"];

/** For `requireApproval`: the cost-cautious operator's stricter bar. */
export const APPROVED_STAGES: readonly Stage[] = ["approved", "publishing", "published"];

export function isProducedStage(stage: Stage | undefined): boolean {
  return stage !== undefined && PRODUCED_STAGES.includes(stage);
}

export type NotReadyReason =
  | "children_pending"
  | "children_in_flight"
  | "children_blocked"
  | "children_unapproved"
  | "not_before"
  | "terminal"
  | "attempts_exhausted";

export interface ReadinessItem {
  /** Stable identity within the plan (the item's _id hex, or its externalId). */
  key: string;
  status: PlanItemStatus;
  failureCount: number;
  retryAfter?: Date | undefined;
  /** Operator escape: produce this item without waiting for its children. */
  dependencyOverride?: boolean | undefined;
  /** The parent's key, if it has one. */
  parentKey?: string | null | undefined;
  /** D51: held and not yet started — the scheduler will never produce it on its own. */
  held?: boolean | undefined;
  /** Current stage of the article this item produced, when one exists. */
  articleStage?: Stage | undefined;
}

export interface ReadinessOptions {
  requireApproval: boolean;
  itemMaxAttempts: number;
  now: Date;
}

export type Readiness = { ready: true } | { ready: false; reason: NotReadyReason };

/**
 * Cross-tick backoff. This is a THIRD retry layer, distinct from the two that
 * already exist and deliberately slower than both:
 *   - gate retries (MAX_GATE_ATTEMPTS) re-run a phase immediately
 *   - run retries (MAX_RUN_ATTEMPTS) re-queue the run immediately
 *   - this one waits, because a failure that survived both of those is
 *     usually environmental (an expired key, a site blocking the fetcher),
 *     and retrying it hard just burns money at ~$8 an article.
 */
export function retryBackoffMs(failureCount: number): number {
  const HOUR = 3_600_000;
  if (failureCount <= 1) return HOUR;
  if (failureCount === 2) return 6 * HOUR;
  return 24 * HOUR;
}

/** Statuses that can still become an article. */
export function isCandidateStatus(status: PlanItemStatus): boolean {
  return status === "planned" || status === "failed";
}

/**
 * Whether an item is eligible at all, before looking at its parent.
 * Separated so the tick's Mongo query and this predicate stay in agreement.
 */
export function isEligible(item: ReadinessItem, opts: ReadinessOptions): Readiness {
  if (!isCandidateStatus(item.status)) return { ready: false, reason: "terminal" };
  if (item.failureCount >= opts.itemMaxAttempts) {
    return { ready: false, reason: "attempts_exhausted" };
  }
  if (item.status === "failed" && item.retryAfter && item.retryAfter > opts.now) {
    return { ready: false, reason: "not_before" };
  }
  return { ready: true };
}

/**
 * Whether one child stops its parent from being built, and why.
 *
 * Only unfinished work blocks. A child the operator skipped, a held child
 * nobody has sent, and a quarantined child are all left out of the parent:
 * the parent links to their reserved URL and the link stays deferred.
 */
export function childHold(
  child: ReadinessItem,
  enqueuedThisTick: ReadonlySet<string>,
  opts: Pick<ReadinessOptions, "requireApproval">,
): NotReadyReason | null {
  if (enqueuedThisTick.has(child.key)) return "children_in_flight";
  switch (child.status) {
    case "done":
      if (opts.requireApproval) {
        const stage = child.articleStage;
        if (!stage || !APPROVED_STAGES.includes(stage)) return "children_unapproved";
      }
      return null;
    case "skipped":
    case "quarantined":
      return null;
    case "enqueued":
    case "in_progress":
      return "children_in_flight";
    case "slug_conflict":
      return "children_blocked";
    case "planned":
    case "failed":
      return child.held ? null : "children_pending";
    default:
      return "children_pending";
  }
}

/** The most actionable reason first: a blocked child needs the operator. */
const CHILD_REASON_RANK: NotReadyReason[] = [
  "children_blocked",
  "children_pending",
  "children_in_flight",
  "children_unapproved",
];

/**
 * @param children the item's direct children (a hub's cluster articles, a
 * pillar's hubs). Grandchildren need not be passed: a hub is not done until
 * its own children were, so waiting on the hubs waits on the whole subtree.
 * @param enqueuedThisTick keys enqueued earlier in THIS fire. With
 * WORKER_CONCURRENCY > 1 the article queue is FIFO but not serial, so a
 * parent enqueued in the same batch as its last child could start first.
 * Treating a same-tick child as in flight keeps enqueue order equal to a
 * valid execution order — and is why `claimRun` needs no dependency predicate.
 */
export function isReady(
  item: ReadinessItem,
  children: readonly ReadinessItem[],
  enqueuedThisTick: ReadonlySet<string>,
  opts: ReadinessOptions,
): Readiness {
  const eligible = isEligible(item, opts);
  if (!eligible.ready) return eligible;
  if (item.dependencyOverride || children.length === 0) return { ready: true };

  let worst: NotReadyReason | null = null;
  for (const child of children) {
    const hold = childHold(child, enqueuedThisTick, opts);
    if (!hold) continue;
    if (!worst || CHILD_REASON_RANK.indexOf(hold) < CHILD_REASON_RANK.indexOf(worst)) worst = hold;
  }
  return worst ? { ready: false, reason: worst } : { ready: true };
}

/** How many of an item's children are still holding it back. */
export function childrenOutstanding(
  children: readonly ReadinessItem[],
  opts: Pick<ReadinessOptions, "requireApproval">,
): { waiting: number; counted: number } {
  let waiting = 0;
  let counted = 0;
  const none = new Set<string>();
  for (const c of children) {
    if (c.status === "skipped" || c.status === "quarantined") continue;
    if ((c.status === "planned" || c.status === "failed") && c.held) continue;
    counted++;
    if (childHold(c, none, opts)) waiting++;
  }
  return { waiting, counted };
}

/** Human-readable reason, for the plan board's Blocked list. */
export function explainNotReady(reason: NotReadyReason): string {
  switch (reason) {
    case "children_pending":
      return "waiting for the pages under it to be produced";
    case "children_in_flight":
      return "the pages under it are being produced right now";
    case "children_blocked":
      return "a page under it is blocked — resolve or skip that page to release this one";
    case "children_unapproved":
      return "the pages under it are produced but not yet approved";
    case "not_before":
      return "waiting out the retry backoff after a failure";
    case "terminal":
      return "already produced, skipped, or quarantined";
    case "attempts_exhausted":
      return "out of retry attempts — quarantined until an operator intervenes";
  }
}
