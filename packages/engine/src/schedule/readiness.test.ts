import { describe, expect, it } from "vitest";
import {
  APPROVED_STAGES,
  PRODUCED_STAGES,
  explainNotReady,
  isCandidateStatus,
  isEligible,
  isProducedStage,
  isReady,
  retryBackoffMs,
  type ReadinessItem,
  type ReadinessOptions,
} from "./readiness.js";
import type { PlanItemStatus } from "../plan/types.js";
import { STAGES } from "../types.js";

const NOW = new Date("2026-09-25T07:00:00Z");
const opts = (over: Partial<ReadinessOptions> = {}): ReadinessOptions => ({
  requireApproval: false,
  itemMaxAttempts: 2,
  now: NOW,
  ...over,
});

const item = (over: Partial<ReadinessItem> = {}): ReadinessItem => ({
  key: "child",
  status: "planned",
  failureCount: 0,
  parentKey: "parent",
  ...over,
});

const parent = (status: PlanItemStatus, over: Partial<ReadinessItem> = {}): ReadinessItem => ({
  key: "parent",
  status,
  failureCount: 0,
  ...over,
});

const none = new Set<string>();

describe("stage sets", () => {
  it("treats review as produced — decision 1 is written into this set", () => {
    expect(PRODUCED_STAGES).toContain("review");
    expect(isProducedStage("review")).toBe(true);
    expect(isProducedStage("design")).toBe(false);
    expect(isProducedStage(undefined)).toBe(false);
  });

  it("keeps the approved set strictly narrower than produced", () => {
    expect(APPROVED_STAGES).not.toContain("review");
    for (const s of APPROVED_STAGES) expect(PRODUCED_STAGES).toContain(s);
  });

  it("only references real pipeline stages", () => {
    for (const s of PRODUCED_STAGES) expect(STAGES).toContain(s);
  });
});

describe("retryBackoffMs", () => {
  it("escalates 1h, 6h, then caps at 24h", () => {
    expect(retryBackoffMs(1)).toBe(3_600_000);
    expect(retryBackoffMs(2)).toBe(21_600_000);
    expect(retryBackoffMs(3)).toBe(86_400_000);
    expect(retryBackoffMs(99)).toBe(86_400_000);
  });
});

describe("isEligible", () => {
  it("accepts planned and failed items", () => {
    expect(isCandidateStatus("planned")).toBe(true);
    expect(isCandidateStatus("failed")).toBe(true);
    expect(isCandidateStatus("done")).toBe(false);
  });

  it("rejects terminal statuses", () => {
    for (const s of ["done", "skipped", "quarantined", "in_progress", "enqueued"] as PlanItemStatus[]) {
      expect(isEligible(item({ status: s }), opts())).toEqual({ ready: false, reason: "terminal" });
    }
  });

  it("rejects an item that is out of attempts", () => {
    expect(isEligible(item({ status: "failed", failureCount: 2 }), opts())).toEqual({
      ready: false,
      reason: "attempts_exhausted",
    });
  });

  it("holds a failed item until its backoff expires, then releases it", () => {
    const soon = new Date(NOW.getTime() + 60_000);
    const past = new Date(NOW.getTime() - 60_000);
    expect(isEligible(item({ status: "failed", failureCount: 1, retryAfter: soon }), opts())).toEqual({
      ready: false,
      reason: "not_before",
    });
    expect(isEligible(item({ status: "failed", failureCount: 1, retryAfter: past }), opts())).toEqual({
      ready: true,
    });
  });
});

describe("isReady — dependencies", () => {
  it("is ready with no parent", () => {
    expect(isReady(item({ parentKey: null }), null, none, opts())).toEqual({ ready: true });
  });

  it("is ready once the parent is done", () => {
    expect(isReady(item(), parent("done"), none, opts())).toEqual({ ready: true });
  });

  it("waits while the parent is unproduced or in flight", () => {
    expect(isReady(item(), parent("planned"), none, opts())).toEqual({
      ready: false,
      reason: "parent_pending",
    });
    expect(isReady(item(), parent("enqueued"), none, opts())).toEqual({
      ready: false,
      reason: "parent_in_flight",
    });
    expect(isReady(item(), parent("in_progress"), none, opts())).toEqual({
      ready: false,
      reason: "parent_in_flight",
    });
  });

  it("treats a parent enqueued earlier in THIS tick as in flight", () => {
    // Without this, WORKER_CONCURRENCY > 1 could start the child first.
    expect(isReady(item(), parent("planned"), new Set(["parent"]), opts())).toEqual({
      ready: false,
      reason: "parent_in_flight",
    });
  });

  it("reports a blocked parent distinctly, so the operator knows to act", () => {
    for (const s of ["quarantined", "slug_conflict"] as PlanItemStatus[]) {
      expect(isReady(item(), parent(s), none, opts())).toEqual({
        ready: false,
        reason: "parent_blocked",
      });
    }
  });

  it("lets a child through when its parent was deliberately skipped", () => {
    expect(isReady(item(), parent("skipped"), none, opts())).toEqual({ ready: true });
  });

  it("honours an operator dependency override", () => {
    expect(isReady(item({ dependencyOverride: true }), parent("planned"), none, opts())).toEqual({
      ready: true,
    });
  });

  it("does not hold a child hostage to a parent missing from the plan", () => {
    expect(isReady(item(), null, none, opts())).toEqual({ ready: true });
  });

  it("checks eligibility before dependencies", () => {
    expect(isReady(item({ status: "done" }), parent("done"), none, opts())).toEqual({
      ready: false,
      reason: "terminal",
    });
  });
});

describe("isReady — requireApproval", () => {
  it("accepts a parent at review by default", () => {
    expect(isReady(item(), parent("done", { articleStage: "review" }), none, opts())).toEqual({
      ready: true,
    });
  });

  it("requires approval when the operator asked for it", () => {
    const strict = opts({ requireApproval: true });
    expect(isReady(item(), parent("done", { articleStage: "review" }), none, strict)).toEqual({
      ready: false,
      reason: "parent_unapproved",
    });
    expect(isReady(item(), parent("done", { articleStage: "approved" }), none, strict)).toEqual({
      ready: true,
    });
    expect(isReady(item(), parent("done", { articleStage: "published" }), none, strict)).toEqual({
      ready: true,
    });
  });
});

describe("explainNotReady", () => {
  it("has plain-English text for every reason", () => {
    const reasons = [
      "parent_pending", "parent_in_flight", "parent_blocked",
      "parent_unapproved", "not_before", "terminal", "attempts_exhausted",
    ] as const;
    for (const r of reasons) {
      expect(explainNotReady(r).length).toBeGreaterThan(10);
    }
  });
});
