import { describe, expect, it } from "vitest";
import { previewCaveat, previewSchedule, type PreviewItem, type PreviewOptions } from "./preview.js";
import { DEFAULT_LIMITS, type Cadence } from "./types.js";
import { zonedParts, zonedTimeToUtc } from "./calendar.js";

const TZ = "Europe/Zurich";
const cadence: Cadence = { timezone: TZ, daysOfWeek: [1, 2, 3, 4, 5], timeOfDay: "07:00", batchSize: 1 };

const wall = (d: Date) => {
  const p = zonedParts(d, TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.hh)}:${pad(p.mm)}`;
};

const opts = (over: Partial<PreviewOptions> = {}): PreviewOptions => ({
  cadence,
  limits: { ...DEFAULT_LIMITS, maxInFlight: 3 },
  requireApproval: false,
  estimatedArticleMinutes: 32,
  ...over,
});

let seq = 0;
const item = (key: string, over: Partial<PreviewItem> = {}): PreviewItem => ({
  key,
  sequence: seq++,
  slug: key.toLowerCase(),
  title: `Title ${key}`,
  role: "cluster",
  status: "planned",
  failureCount: 0,
  ...over,
});

/** Two articles -> hub -> pillar, in bottom-up sequence order. */
function chain(): PreviewItem[] {
  seq = 0;
  return [
    item("A1", { parentKey: "HUB" }),
    item("A2", { parentKey: "HUB" }),
    item("HUB", { role: "hub", parentKey: "P01" }),
    item("P01", { role: "pillar", parentKey: null }),
  ];
}

// Friday 08:00 local — the first fire is the following Monday.
const FROM = zonedTimeToUtc(2026, 9, 25, 8, 0, TZ);

describe("previewSchedule", () => {
  it("projects one article per weekday fire, in sequence order", () => {
    const entries = previewSchedule(chain(), FROM, 4, opts());
    expect(entries.map((e) => wall(e.fireAt))).toEqual([
      "2026-09-28 07:00",
      "2026-09-29 07:00",
      "2026-09-30 07:00",
      "2026-10-01 07:00",
    ]);
    expect(entries.flatMap((e) => e.items.map((i) => i.key))).toEqual(["A1", "A2", "HUB", "P01"]);
  });

  it("never projects a parent before its children", () => {
    const entries = previewSchedule(chain(), FROM, 4, opts());
    const order = entries.flatMap((e) => e.items.map((i) => i.key));
    expect(order.indexOf("HUB")).toBeGreaterThan(order.indexOf("A2"));
    expect(order.indexOf("P01")).toBeGreaterThan(order.indexOf("HUB"));
  });

  it("stops at the requested article count", () => {
    const entries = previewSchedule(chain(), FROM, 2, opts());
    expect(entries.flatMap((e) => e.items)).toHaveLength(2);
  });

  it("annotates a fire that could not fill its batch because of child gating", () => {
    // batchSize 3: both articles go, but the hub must wait for them.
    const entries = previewSchedule(chain(), FROM, 4, opts({ cadence: { ...cadence, batchSize: 3 } }));
    expect(entries[0]?.items.map((i) => i.key)).toEqual(["A1", "A2"]);
    expect(entries[0]?.note).toContain("waiting on the pages under them");
  });

  it("never projects a held item", () => {
    seq = 0;
    const items = [item("A", { held: true }), item("B")].map((i) => ({ ...i, parentKey: null }));
    const entries = previewSchedule(items, FROM, 1, opts());
    expect(entries[0]?.items.map((i) => i.key)).toEqual(["B"]);
  });

  it("fills a batch when siblings are independent", () => {
    seq = 0;
    const items = [item("A"), item("B"), item("C")].map((i) => ({ ...i, parentKey: null }));
    const entries = previewSchedule(items, FROM, 3, opts({ cadence: { ...cadence, batchSize: 3 } }));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.items.map((i) => i.key)).toEqual(["A", "B", "C"]);
    expect(entries[0]?.note).toBeUndefined();
  });

  it("throttles on maxInFlight and says so", () => {
    seq = 0;
    const items = [item("A"), item("B"), item("C"), item("D")].map((i) => ({ ...i, parentKey: null }));
    // Articles take a week, so none completes between daily fires.
    const entries = previewSchedule(
      items,
      FROM,
      4,
      opts({ limits: { ...DEFAULT_LIMITS, maxInFlight: 2 }, estimatedArticleMinutes: 60 * 24 * 7 }),
    );
    const throttled = entries.find((e) => e.note?.startsWith("throttled"));
    expect(throttled).toBeDefined();
    expect(throttled?.items).toEqual([]);
    expect(throttled?.note).toContain("max 2");
  });

  it("releases capacity once a projected article completes", () => {
    seq = 0;
    const items = [item("A"), item("B"), item("C")].map((i) => ({ ...i, parentKey: null }));
    // 32 minutes: every article finishes long before the next daily fire.
    const entries = previewSchedule(items, FROM, 3, opts({ limits: { ...DEFAULT_LIMITS, maxInFlight: 1 } }));
    expect(entries.filter((e) => e.items.length > 0)).toHaveLength(3);
    expect(entries.every((e) => !e.note?.startsWith("throttled"))).toBe(true);
  });

  it("treats already-produced children as satisfied", () => {
    seq = 0;
    const items = [
      item("A1", { parentKey: "HUB", status: "done", articleStage: "review" }),
      item("HUB", { role: "hub", parentKey: null }),
    ];
    const entries = previewSchedule(items, FROM, 1, opts());
    expect(entries[0]?.items.map((i) => i.key)).toEqual(["HUB"]);
  });

  it("holds a hub when requireApproval is on and its children only reached review", () => {
    seq = 0;
    const items = [
      item("A1", { parentKey: "HUB", status: "done", articleStage: "review" }),
      item("HUB", { role: "hub", parentKey: null }),
    ];
    const entries = previewSchedule(items, FROM, 1, opts({ requireApproval: true }));
    expect(entries.every((e) => e.items.length === 0)).toBe(true);
  });

  it("returns an empty projection for a zero count or an empty plan", () => {
    expect(previewSchedule(chain(), FROM, 0, opts())).toEqual([]);
    expect(previewSchedule([], FROM, 5, opts({ maxFires: 3 }))).toHaveLength(3);
  });

  it("goes quiet rather than throwing on an invalid cadence", () => {
    const bad = previewSchedule(chain(), FROM, 3, opts({ cadence: { ...cadence, daysOfWeek: [] } }));
    expect(bad).toEqual([]);
  });

  it("stops at maxFires so a fully blocked plan cannot loop", () => {
    seq = 0;
    const blocked = [item("A", { parentKey: "nonexistent-but-listed" })];
    // The parent key is absent from the plan, so the child is NOT held; cap
    // still applies for a genuinely unproducible plan.
    const entries = previewSchedule(blocked, FROM, 50, opts({ maxFires: 5 }));
    expect(entries.length).toBeLessThanOrEqual(5);
  });
});

describe("previewCaveat", () => {
  it("names the review cap it deliberately does not simulate", () => {
    expect(previewCaveat(DEFAULT_LIMITS)).toContain("10");
    expect(previewCaveat(DEFAULT_LIMITS)).toContain("skipped rather than owed");
  });
});
