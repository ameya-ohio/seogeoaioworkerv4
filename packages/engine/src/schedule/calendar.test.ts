import { describe, expect, it } from "vitest";
import {
  lastOccurrenceAtOrBefore,
  nextOccurrenceAfter,
  occurrencesBetween,
  parseTimeOfDay,
  startOfLocalWeek,
  validateCadence,
  zonedParts,
  zonedTimeToUtc,
} from "./calendar.js";
import type { Cadence } from "./types.js";

const weekdays7am: Cadence = {
  timezone: "Europe/Zurich",
  daysOfWeek: [1, 2, 3, 4, 5],
  timeOfDay: "07:00",
  batchSize: 1,
};

/** What the wall clock reads in a zone, for readable assertions. */
const wall = (d: Date, tz = "Europe/Zurich") => {
  const p = zonedParts(d, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.hh)}:${pad(p.mm)}`;
};

describe("zonedParts / zonedTimeToUtc", () => {
  it("round-trips a wall-clock time through UTC", () => {
    const utc = zonedTimeToUtc(2026, 3, 10, 7, 0, "Europe/Zurich");
    expect(wall(utc)).toBe("2026-03-10 07:00");
  });

  it("reads the local weekday", () => {
    // 2026-09-25 is a Friday.
    expect(zonedParts(new Date("2026-09-25T09:00:00Z"), "Europe/Zurich").dow).toBe(5);
  });

  it("handles a zone far from UTC", () => {
    const utc = zonedTimeToUtc(2026, 6, 1, 9, 30, "Pacific/Auckland");
    expect(wall(utc, "Pacific/Auckland")).toBe("2026-06-01 09:30");
  });
});

describe("validateCadence", () => {
  it("accepts a sane cadence", () => {
    expect(validateCadence(weekdays7am)).toEqual([]);
  });

  it("rejects an unknown timezone, bad time, empty days, bad batch size", () => {
    const problems = validateCadence({
      timezone: "Mars/Olympus",
      daysOfWeek: [],
      timeOfDay: "25:00",
      batchSize: 0,
    });
    expect(problems).toHaveLength(4);
    expect(problems.join(" ")).toMatch(/timezone/);
    expect(problems.join(" ")).toMatch(/24-hour/);
    expect(problems.join(" ")).toMatch(/at least one day/);
    expect(problems.join(" ")).toMatch(/batch size/);
  });

  it("rejects out-of-range and duplicated weekdays", () => {
    expect(validateCadence({ ...weekdays7am, daysOfWeek: [1, 9] }).join(" ")).toMatch(/0-6/);
    expect(validateCadence({ ...weekdays7am, daysOfWeek: [1, 1] }).join(" ")).toMatch(/duplicates/);
  });

  it("parses times strictly", () => {
    expect(parseTimeOfDay("07:00")).toEqual({ hh: 7, mm: 0 });
    expect(parseTimeOfDay("7:05")).toEqual({ hh: 7, mm: 5 });
    expect(parseTimeOfDay("24:00")).toBeNull();
    expect(parseTimeOfDay("7am")).toBeNull();
  });
});

describe("nextOccurrenceAfter", () => {
  it("finds the next weekday fire", () => {
    // Friday 2026-09-25 08:00 local -> next is Monday 2026-09-28 07:00.
    const from = zonedTimeToUtc(2026, 9, 25, 8, 0, "Europe/Zurich");
    expect(wall(nextOccurrenceAfter(weekdays7am, from))).toBe("2026-09-28 07:00");
  });

  it("is strictly after, never equal", () => {
    const at7 = zonedTimeToUtc(2026, 9, 28, 7, 0, "Europe/Zurich");
    expect(wall(nextOccurrenceAfter(weekdays7am, at7))).toBe("2026-09-29 07:00");
  });

  it("returns the same day when the fire is still ahead", () => {
    const from = zonedTimeToUtc(2026, 9, 28, 6, 0, "Europe/Zurich");
    expect(wall(nextOccurrenceAfter(weekdays7am, from))).toBe("2026-09-28 07:00");
  });

  it("throws on an invalid cadence rather than returning a wrong date", () => {
    expect(() => nextOccurrenceAfter({ ...weekdays7am, daysOfWeek: [] }, new Date())).toThrow(
      /invalid cadence/,
    );
  });

  it("holds the wall-clock hour across a DST boundary", () => {
    // Europe/Zurich leaves DST on 2026-10-25.
    const before = zonedTimeToUtc(2026, 10, 23, 8, 0, "Europe/Zurich");
    const after = nextOccurrenceAfter(weekdays7am, before);
    expect(wall(after)).toBe("2026-10-26 07:00"); // still 07:00 local
    // ...and the UTC instant shifted by an hour, which is the point.
    expect(after.toISOString()).toBe("2026-10-26T06:00:00.000Z");
    expect(zonedTimeToUtc(2026, 10, 23, 7, 0, "Europe/Zurich").toISOString()).toBe(
      "2026-10-23T05:00:00.000Z",
    );
  });

  it("fires just after a spring-forward gap rather than skipping the day", () => {
    // Europe/Zurich springs forward 2026-03-29: 02:00 -> 03:00 local.
    const gapCadence: Cadence = { ...weekdays7am, daysOfWeek: [0], timeOfDay: "02:30" };
    const from = zonedTimeToUtc(2026, 3, 28, 12, 0, "Europe/Zurich");
    const fire = nextOccurrenceAfter(gapCadence, from);
    // 02:30 does not exist that day; the fire lands at 03:30 local, same day.
    const p = zonedParts(fire, "Europe/Zurich");
    expect(p.d).toBe(29);
    expect(p.hh).toBe(3);
  });

  it("fires once in a fall-back doubled hour", () => {
    // Europe/Zurich falls back 2026-10-25: 03:00 -> 02:00 local.
    const dupCadence: Cadence = { ...weekdays7am, daysOfWeek: [0], timeOfDay: "02:30" };
    const from = zonedTimeToUtc(2026, 10, 24, 12, 0, "Europe/Zurich");
    const first = nextOccurrenceAfter(dupCadence, from);
    expect(zonedParts(first, "Europe/Zurich").d).toBe(25);
    // The next fire is a week later, not the second 02:30 that same morning.
    const second = nextOccurrenceAfter(dupCadence, first);
    expect(zonedParts(second, "Europe/Zurich").d).toBe(1); // 2026-11-01
  });
});

describe("occurrencesBetween", () => {
  it("lists the fires in a window, oldest first", () => {
    const from = zonedTimeToUtc(2026, 9, 25, 8, 0, "Europe/Zurich"); // Fri
    const to = zonedTimeToUtc(2026, 10, 2, 8, 0, "Europe/Zurich"); // next Fri
    const hits = occurrencesBetween(weekdays7am, from, to);
    expect(hits.map((d) => wall(d))).toEqual([
      "2026-09-28 07:00",
      "2026-09-29 07:00",
      "2026-09-30 07:00",
      "2026-10-01 07:00",
      "2026-10-02 07:00",
    ]);
  });

  it("respects the cap so a long outage cannot produce an unbounded list", () => {
    const from = new Date("2020-01-01T00:00:00Z");
    const to = new Date("2026-01-01T00:00:00Z");
    expect(occurrencesBetween(weekdays7am, from, to, 10)).toHaveLength(10);
  });

  it("is empty when the window contains no fire", () => {
    const from = zonedTimeToUtc(2026, 9, 26, 8, 0, "Europe/Zurich"); // Sat
    const to = zonedTimeToUtc(2026, 9, 27, 8, 0, "Europe/Zurich"); // Sun
    expect(occurrencesBetween(weekdays7am, from, to)).toEqual([]);
  });
});

describe("lastOccurrenceAtOrBefore", () => {
  it("collapses a backlog to the most recent missed fire", () => {
    const missedFrom = zonedTimeToUtc(2026, 9, 21, 7, 0, "Europe/Zurich"); // Mon
    const now = zonedTimeToUtc(2026, 9, 25, 9, 0, "Europe/Zurich"); // Fri
    const latest = lastOccurrenceAtOrBefore(weekdays7am, now, missedFrom);
    expect(latest && wall(latest)).toBe("2026-09-25 07:00");
  });

  it("returns null when nothing has fired yet in the window", () => {
    const from = zonedTimeToUtc(2026, 9, 26, 8, 0, "Europe/Zurich"); // Sat
    const to = zonedTimeToUtc(2026, 9, 27, 8, 0, "Europe/Zurich"); // Sun
    expect(lastOccurrenceAtOrBefore(weekdays7am, to, from)).toBeNull();
  });
});

describe("startOfLocalWeek", () => {
  it("returns local Monday midnight", () => {
    const friday = zonedTimeToUtc(2026, 9, 25, 15, 0, "Europe/Zurich");
    expect(wall(startOfLocalWeek(friday, "Europe/Zurich"))).toBe("2026-09-21 00:00");
  });

  it("treats Sunday as the end of its week, not the start", () => {
    const sunday = zonedTimeToUtc(2026, 9, 27, 15, 0, "Europe/Zurich");
    expect(wall(startOfLocalWeek(sunday, "Europe/Zurich"))).toBe("2026-09-21 00:00");
  });
});
