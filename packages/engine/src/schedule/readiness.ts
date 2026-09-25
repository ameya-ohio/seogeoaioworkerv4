import type { Stage } from "../types.js";
import type { PlanItemStatus } from "../plan/types.js";

/**
 * Whether a plan item may be enqueued on this tick.
 *
 * The dependency exists for exactly one reason: an article must be able to
 * link up to its hub, and the edit gate (D35) strips a link to a page that
 * does not resolve. So a parent must be PRODUCED before its children run.
 */

/**
 * "Produced" = the pipeline finished and the article exists with a slug and a
 * draft. This set is decision 1 ("the cadence stops at review") written down:
 * requiring `approved` instead would stall an entire plan behind human
 * approval of its pillar pages, which is a human-gated schedule rather than
 * the automatic one the operator asked for.
 */
export const PRODUCED_STAGES: readonly Stage[] = ["review", "approved", "publishing", "published"];

/** For `requireApproval`: the cost-cautious operator's stricter bar. */
export const APPROVED_STAGES: readonly Stage[] = ["approved", "publishing", "published"];

export function isProducedStage(stage: Stage | undefined): boolean {
  return stage !== undefined && PRODUCED_STAGES.includes(stage);
}

export type NotReadyReason =
  | "parent_pending"
  | "parent_in_flight"
  | "parent_blocked"
  | "parent_unapproved"
  | "not_before"
  | "terminal"
  | "attempts_exhausted";

export interface ReadinessItem {
  /** Stable identity within the plan (the item's _id hex, or its externalId). */
  key: string;
  status: PlanItemStatus;
  failureCount: number;
  retryAfter?: Date | undefined;
  /** Operator escape: produce this item even though its parent is unfinished. */
  dependencyOverride?: boolean | undefined;
  /** The parent's key, if it has one. */
  parentKey?: string | null | undefined;
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
 * @param enqueuedThisTick keys enqueued earlier in THIS fire. With
 * WORKER_CONCURRENCY > 1 the article queue is FIFO but not serial, so a child
 * enqueued in the same batch as its parent could start first. Treating a
 * same-tick parent as in-flight is what keeps enqueue order equal to a valid
 * execution order — and is why `claimRun` needs no dependency predicate.
 */
export function isReady(
  item: ReadinessItem,
  parent: ReadinessItem | null,
  enqueuedThisTick: ReadonlySet<string>,
  opts: ReadinessOptions,
): Readiness {
  const eligible = isEligible(item, opts);
  if (!eligible.ready) return eligible;

  if (!item.parentKey || item.dependencyOverride) return { ready: true };
  if (!parent) {
    // A named parent that is not in the plan was already reported at import;
    // do not hold the child hostage to it.
    return { ready: true };
  }
  if (enqueuedThisTick.has(parent.key)) return { ready: false, reason: "parent_in_flight" };

  switch (parent.status) {
    case "done":
      if (opts.requireApproval) {
        const stage = parent.articleStage;
        if (!stage || !APPROVED_STAGES.includes(stage)) {
          return { ready: false, reason: "parent_unapproved" };
        }
      }
      return { ready: true };
    // A skipped parent is a deliberate operator decision: the page will be
    // written by hand, so the child proceeds (flagged, so the brief drops the
    // parent mention rather than pointing at a page that may never exist).
    case "skipped":
      return { ready: true };
    case "enqueued":
    case "in_progress":
      return { ready: false, reason: "parent_in_flight" };
    case "quarantined":
    case "slug_conflict":
      return { ready: false, reason: "parent_blocked" };
    case "planned":
    case "failed":
      return { ready: false, reason: "parent_pending" };
    default:
      return { ready: false, reason: "parent_pending" };
  }
}

/** Human-readable reason, for the plan board's Blocked list. */
export function explainNotReady(reason: NotReadyReason): string {
  switch (reason) {
    case "parent_pending":
      return "waiting for its parent page to be produced";
    case "parent_in_flight":
      return "its parent page is being produced right now";
    case "parent_blocked":
      return "its parent page is blocked — resolve or skip the parent to release this subtree";
    case "parent_unapproved":
      return "its parent page is produced but not yet approved";
    case "not_before":
      return "waiting out the retry backoff after a failure";
    case "terminal":
      return "already produced, skipped, or quarantined";
    case "attempts_exhausted":
      return "out of retry attempts — quarantined until an operator intervenes";
  }
}
