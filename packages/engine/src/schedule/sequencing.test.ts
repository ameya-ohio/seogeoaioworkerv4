import { describe, expect, it } from "vitest";
import {
  compareSequence,
  computeSequence,
  findOrderViolations,
  pillarOrderOf,
  sequenceKey,
  waveOf,
  type SequenceInput,
} from "./sequencing.js";
import type { FunnelStage, PageRole, PriorityTier } from "../plan/types.js";

let row = 0;
const mk = (
  key: string,
  role: PageRole,
  priority: PriorityTier,
  opts: {
    parentKey?: string;
    pillarId?: string;
    subtopicId?: string;
    funnel?: FunnelStage;
    tier?: "A" | "B" | "C";
  } = {},
): SequenceInput => ({
  key,
  rowIndex: row++,
  role,
  priority,
  pillarId: opts.pillarId ?? "P01",
  subtopicId: opts.subtopicId ?? null,
  funnel: opts.funnel ?? "mofu",
  tier: opts.tier ?? null,
  ...(opts.parentKey ? { parentKey: opts.parentKey } : {}),
});

/** A two-pillar plan: pillar -> hubs -> articles. */
function samplePlan(): SequenceInput[] {
  row = 0;
  return [
    mk("P01", "pillar", 1),
    mk("P01-S01-H", "hub", 1, { parentKey: "P01", subtopicId: "S01" }),
    mk("P01-S01-A1", "cluster", 2, { parentKey: "P01-S01-H", subtopicId: "S01" }),
    mk("P01-S01-A2", "cluster", 3, { parentKey: "P01-S01-H", subtopicId: "S01" }),
    // A P1 BOFU article under a P2 hub — the case where the priority rule and
    // the structural rule genuinely conflict.
    mk("P01-S02-H", "hub", 2, { parentKey: "P01", subtopicId: "S02" }),
    mk("P01-S02-A1", "cluster", 1, { parentKey: "P01-S02-H", subtopicId: "S02", funnel: "bofu" }),
    mk("P02", "pillar", 1, { pillarId: "P02" }),
    mk("P02-S01-H", "hub", 2, { parentKey: "P02", pillarId: "P02", subtopicId: "S01" }),
    mk("P02-S01-A1", "cluster", 2, { parentKey: "P02-S01-H", pillarId: "P02", subtopicId: "S01" }),
  ];
}

describe("waveOf", () => {
  it("puts pillar pages and P1 hubs in the first wave", () => {
    expect(waveOf(mk("a", "pillar", 3))).toBe(0);
    expect(waveOf(mk("b", "hub", 1))).toBe(0);
  });

  it("orders P1 BOFU, then remaining P1, then remaining hubs, then P2, then P3", () => {
    expect(waveOf(mk("c", "cluster", 1, { funnel: "bofu" }))).toBe(1);
    expect(waveOf(mk("d", "cluster", 1))).toBe(2);
    expect(waveOf(mk("e", "hub", 3))).toBe(3);
    expect(waveOf(mk("f", "cluster", 2))).toBe(4);
    expect(waveOf(mk("g", "cluster", 3))).toBe(5);
  });
});

describe("compareSequence", () => {
  it("breaks ties deterministically down to sheet row", () => {
    const items = [mk("a", "cluster", 2), mk("b", "cluster", 2)];
    const po = pillarOrderOf(items);
    const so = new Map<string, number>();
    const ka = sequenceKey(items[0] as SequenceInput, po, so);
    const kb = sequenceKey(items[1] as SequenceInput, po, so);
    expect(compareSequence(ka, kb)).toBeLessThan(0);
    expect(compareSequence(kb, ka)).toBeGreaterThan(0);
    expect(compareSequence(ka, ka)).toBe(0);
  });
});

describe("computeSequence", () => {
  it("returns every item exactly once, numbered from zero", () => {
    const items = samplePlan();
    const { ordered, violations } = computeSequence(items);
    expect(violations).toEqual([]);
    expect(ordered).toHaveLength(items.length);
    expect(ordered.map((o) => o.sequence)).toEqual(items.map((_, i) => i));
    expect(new Set(ordered.map((o) => o.key)).size).toBe(items.length);
  });

  it("never orders a child before its parent", () => {
    const items = samplePlan();
    const { ordered } = computeSequence(items);
    expect(findOrderViolations(items, ordered)).toEqual([]);
  });

  it("promotes a P2 hub so its P1 BOFU child is not blocked, and reports it", () => {
    const items = samplePlan();
    const { ordered, promotions } = computeSequence(items);
    const pos = new Map(ordered.map((o) => [o.key, o.sequence]));

    // The conflict case: hub is P2 (wave 3), its child is P1 BOFU (wave 1).
    expect(pos.get("P01-S02-H")).toBeLessThan(pos.get("P01-S02-A1") as number);
    const promo = promotions.find((p) => p.parentKey === "P01-S02-H");
    expect(promo).toBeDefined();
    expect(promo?.childKey).toBe("P01-S02-A1");
    expect(promo?.toIndex).toBeLessThan(promo?.fromIndex as number);
  });

  it("leads with the pillar pages and P1 hubs", () => {
    const { ordered } = computeSequence(samplePlan());
    expect(ordered.slice(0, 3).map((o) => o.key)).toEqual(["P01", "P01-S01-H", "P02"]);
  });

  it("reports no promotion when priority and structure already agree", () => {
    row = 0;
    const items = [
      mk("P01", "pillar", 1),
      mk("H", "hub", 1, { parentKey: "P01", subtopicId: "S01" }),
      mk("A", "cluster", 3, { parentKey: "H", subtopicId: "S01" }),
    ];
    const { promotions, ordered } = computeSequence(items);
    expect(promotions).toEqual([]);
    expect(ordered.map((o) => o.key)).toEqual(["P01", "H", "A"]);
  });

  it("is stable: recomputing the same input gives the same order", () => {
    const a = computeSequence(samplePlan()).ordered;
    const b = computeSequence(samplePlan()).ordered;
    expect(b).toEqual(a);
  });

  it("is independent of input order", () => {
    const items = samplePlan();
    const forward = computeSequence(items).ordered;
    const shuffled = computeSequence([...items].reverse()).ordered;
    expect(shuffled).toEqual(forward);
  });

  it("reports a parent that is not in the plan instead of dropping the child", () => {
    row = 0;
    const items = [mk("A", "cluster", 1, { parentKey: "missing-hub" })];
    const { ordered, violations } = computeSequence(items);
    expect(violations.join(" ")).toContain('parent "missing-hub"');
    expect(ordered.map((o) => o.key)).toEqual(["A"]);
  });

  it("reports a cycle rather than hanging", () => {
    row = 0;
    const items = [
      mk("A", "cluster", 1, { parentKey: "B" }),
      mk("B", "cluster", 1, { parentKey: "A" }),
    ];
    const { ordered, violations } = computeSequence(items);
    expect(violations.join(" ")).toContain("cycle");
    expect(ordered).toHaveLength(2);
  });

  it("reports duplicate keys", () => {
    row = 0;
    const items = [mk("A", "cluster", 1), mk("A", "cluster", 2)];
    const { violations, ordered } = computeSequence(items);
    expect(violations.join(" ")).toContain("duplicate key");
    expect(ordered).toHaveLength(1);
  });

  it("holds the invariant on a large generated plan", () => {
    row = 0;
    const items: SequenceInput[] = [];
    for (let p = 0; p < 16; p++) {
      const pid = `P${p}`;
      items.push(mk(pid, "pillar", 1, { pillarId: pid }));
      for (let s = 0; s < 5; s++) {
        const hub = `${pid}-S${s}-H`;
        const hubPriority = ((s % 3) + 1) as PriorityTier;
        items.push(mk(hub, "hub", hubPriority, { parentKey: pid, pillarId: pid, subtopicId: `S${s}` }));
        for (let a = 0; a < 6; a++) {
          items.push(
            mk(`${pid}-S${s}-A${a}`, "cluster", ((a % 3) + 1) as PriorityTier, {
              parentKey: hub,
              pillarId: pid,
              subtopicId: `S${s}`,
              ...(a === 0 ? { funnel: "bofu" as FunnelStage } : {}),
            }),
          );
        }
      }
    }
    const { ordered, violations } = computeSequence(items);
    expect(violations).toEqual([]);
    expect(ordered).toHaveLength(items.length);
    expect(findOrderViolations(items, ordered)).toEqual([]);
  });
});
