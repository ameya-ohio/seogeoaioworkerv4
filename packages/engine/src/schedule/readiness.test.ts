import { describe, expect, it } from "vitest";
import {
  APPROVED_STAGES,
  PRODUCED_STAGES,
  explainNotReady,
  isCandidateStatus,
  isEligible,
  isProducedStage,
  isReady,
  childrenOutstanding,
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

/** The item under test: a hub. */
const item = (over: Partial<ReadinessItem> = {}): ReadinessItem => ({
  key: "hub",
  status: "planned",
  failureCount: 0,
  parentKey: "pillar",
  ...over,
});

let n = 0;
/** One of the hub's cluster articles. */
const child = (status: PlanItemStatus, over: Partial<ReadinessItem> = {}): ReadinessItem => ({
  key: `child-${n++}`,
  status,
  failureCount: 0,
  parentKey: "hub",
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

describe("isReady — bottom-up dependencies", () => {
  it("is ready with no children (a cluster article)", () => {
    expect(isReady(item(), [], none, opts())).toEqual({ ready: true });
  });

  it("is ready once every child is done", () => {
    expect(isReady(item(), [child("done"), child("done")], none, opts())).toEqual({ ready: true });
  });

  it("waits while any child is unproduced or in flight", () => {
    expect(isReady(item(), [child("done"), child("planned")], none, opts())).toEqual({
      ready: false,
      reason: "children_pending",
    });
    expect(isReady(item(), [child("done"), child("failed")], none, opts())).toEqual({
      ready: false,
      reason: "children_pending",
    });
    expect(isReady(item(), [child("done"), child("enqueued")], none, opts())).toEqual({
      ready: false,
      reason: "children_in_flight",
    });
    expect(isReady(item(), [child("in_progress")], none, opts())).toEqual({
      ready: false,
      reason: "children_in_flight",
    });
  });

  it("treats a child enqueued earlier in THIS tick as in flight", () => {
    // Without this, WORKER_CONCURRENCY > 1 could start the hub before its last article.
    const last = child("planned");
    expect(isReady(item(), [child("done"), last], new Set([last.key]), opts())).toEqual({
      ready: false,
      reason: "children_in_flight",
    });
  });

  it("reports a blocked child first, so the operator knows to act", () => {
    expect(
      isReady(item(), [child("planned"), child("slug_conflict"), child("enqueued")], none, opts()),
    ).toEqual({ ready: false, reason: "children_blocked" });
  });

  it("does not wait for skipped, quarantined or held-and-unsent children", () => {
    const kids = [
      child("done"),
      child("skipped"),
      child("quarantined"),
      child("planned", { held: true }),
    ];
    expect(isReady(item(), kids, none, opts())).toEqual({ ready: true });
  });

  it("does wait for a held child an operator already sent", () => {
    expect(isReady(item(), [child("in_progress", { held: true })], none, opts())).toEqual({
      ready: false,
      reason: "children_in_flight",
    });
  });

  it("honours an operator dependency override", () => {
    expect(
      isReady(item({ dependencyOverride: true }), [child("planned")], none, opts()),
    ).toEqual({ ready: true });
  });

  it("checks eligibility before dependencies", () => {
    expect(isReady(item({ status: "done" }), [child("done")], none, opts())).toEqual({
      ready: false,
      reason: "terminal",
    });
  });
});

describe("isReady — requireApproval", () => {
  it("accepts children at review by default", () => {
    expect(isReady(item(), [child("done", { articleStage: "review" })], none, opts())).toEqual({
      ready: true,
    });
  });

  it("requires approval of every child when the operator asked for it", () => {
    const strict = opts({ requireApproval: true });
    expect(
      isReady(item(), [child("done", { articleStage: "approved" }), child("done", { articleStage: "review" })], none, strict),
    ).toEqual({ ready: false, reason: "children_unapproved" });
    expect(
      isReady(item(), [child("done", { articleStage: "approved" }), child("done", { articleStage: "published" })], none, strict),
    ).toEqual({ ready: true });
  });
});

describe("childrenOutstanding", () => {
  it("counts what still holds the parent, leaving out skipped and held children", () => {
    const kids = [
      child("done"),
      child("planned"),
      child("in_progress"),
      child("skipped"),
      child("planned", { held: true }),
    ];
    expect(childrenOutstanding(kids, { requireApproval: false })).toEqual({ waiting: 2, counted: 3 });
  });
});

describe("explainNotReady", () => {
  it("has plain-English text for every reason", () => {
    const reasons = [
      "children_pending", "children_in_flight", "children_blocked",
      "children_unapproved", "not_before", "terminal", "attempts_exhausted",
    ] as const;
    for (const r of reasons) {
      expect(explainNotReady(r).length).toBeGreaterThan(10);
    }
  });
});
