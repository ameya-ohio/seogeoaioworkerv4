import type { ObjectId } from "mongodb";
import type { PlanScope } from "../plan/types.js";

/**
 * Cadence + guardrail configuration for producing a content plan on a
 * schedule. One schedule per plan (enforced by a unique index on planId).
 *
 * The scheduler resolves ordering and dependencies itself and then enqueues
 * through the ordinary `enqueueArticlePipeline` path, so `RunDoc`, `claimRun`
 * and the article queue are untouched: enqueue order IS execution order,
 * because the scheduler only ever enqueues ready items in sequence order.
 */

/**
 * No cron expressions on purpose: nobody types "0 7 * * 1,3,5" into this UI,
 * and a cron string makes both the date preview and DST handling harder.
 */
export interface Cadence {
  /** IANA zone, e.g. "Europe/Zurich". All day/time fields are local to it. */
  timezone: string;
  /** 0 = Sunday … 6 = Saturday, local to `timezone`. */
  daysOfWeek: number[];
  /** 24h local wall-clock time, "HH:MM". */
  timeOfDay: string;
  /** Articles to enqueue per fire, before the guardrails shrink it. */
  batchSize: number;
}

/**
 * Two classes of brake, and the distinction is operational:
 *
 * - SOFT (maxInFlight, maxAwaitingReview, maxPerCalendarWeek) shrink a single
 *   fire's budget, possibly to zero. The schedule stays active and self-heals.
 *   A throttled fire is LOST, NOT OWED — a cadence is a rate, not a debt.
 *   Deferring would accumulate a backlog that dumps the instant review clears,
 *   which is exactly the runaway the cap exists to prevent.
 * - HARD (consecutiveFailureLimit, maxCostUsd, maxTotalArticles) pause or
 *   complete the schedule and require the operator to act.
 */
export interface ScheduleLimits {
  /** Plan items enqueued-or-running at once. */
  maxInFlight: number;
  /**
   * Articles sitting at stage "review", counted COMPANY-WIDE rather than
   * per-plan: the human review gate is a shared resource, and an ad-hoc Chat
   * article consumes the same attention a plan article does.
   */
  maxAwaitingReview: number;
  /** Optional hard rate ceiling per local calendar week. */
  maxPerCalendarWeek?: number;
  /** Per-plan volume cap — the answer to "504 articles is two years". */
  maxTotalArticles?: number;
  /** Per-plan spend cap, summed from runs.phaseResults[].usage.costUsd. */
  maxCostUsd?: number;
  /** Consecutive plan articles reaching stage "failed" before auto-pause. */
  consecutiveFailureLimit: number;
  /**
   * Cross-tick retries per item before quarantine. Distinct from the two
   * existing layers: MAX_GATE_ATTEMPTS (in-phase) and MAX_RUN_ATTEMPTS
   * (immediate re-queue). This is the backoff layer the system lacks.
   */
  itemMaxAttempts: number;
}

export type ScheduleStatus = "active" | "paused" | "completed";

export type PauseReason =
  | "consecutive_failures"
  | "budget_cap"
  | "operator"
  | "plan_missing";

export type CompleteReason = "volume_cap" | "plan_finished";

export interface ScheduleDoc {
  _id?: ObjectId;
  companyId: string;
  planId: ObjectId;
  name: string;
  status: ScheduleStatus;
  cadence: Cadence;
  limits: ScheduleLimits;
  /** Which plan items are eligible; widening this touches no sequence value. */
  scope: PlanScope;
  catchUp: { enabled: boolean; maxMissedFires: number };
  /**
   * When false (the default), a parent reaching stage "review" unblocks its
   * children. Requiring approval would stall a 504-article plan behind human
   * approval of 16 pillar pages — a human-gated schedule, not an automatic
   * one. True is available for a cost-cautious operator.
   */
  requireApproval: boolean;
  /** Used by the preview to project when an enqueued article reaches review. */
  estimatedArticleMinutes: number;

  // ── scheduler-owned state ──
  /** Null when paused or completed. */
  nextFireAt: Date | null;
  lastFiredAt?: Date;
  lastTickAt?: Date;
  /** Claim lease — this doc's atomic claim IS the leader election. */
  tickWorkerId?: string;
  tickLeaseUntil?: Date;
  /** Monotonic fire counter; also the compare-and-set token on advance. */
  fireSeq: number;
  consecutiveFailures: number;
  pause?: { reason: PauseReason; at: Date; detail: string };
  completedReason?: CompleteReason;

  createdAt: Date;
  updatedAt: Date;
}

/** Derived from Session 13 actuals: ~32 min and ~$8 per article at concurrency 1. */
export const DEFAULT_CADENCE: Cadence = {
  timezone: "Europe/Zurich",
  daysOfWeek: [1, 2, 3, 4, 5],
  timeOfDay: "07:00",
  batchSize: 1,
};

export const DEFAULT_LIMITS: ScheduleLimits = {
  /** ~1.6 h of serial worker time. */
  maxInFlight: 3,
  /** ~$80 of spend parked on one human. */
  maxAwaitingReview: 10,
  consecutiveFailureLimit: 3,
  itemMaxAttempts: 2,
};

export const DEFAULT_ESTIMATED_ARTICLE_MINUTES = 32;
