import type { Cadence } from "./types.js";

/**
 * Cadence calendar math, using only `Intl` — no dependency, no cron parser.
 *
 * Cron was rejected deliberately: nobody types "0 7 * * 1,3,5" into this UI,
 * and a cron string makes both the "next N articles with dates" preview and
 * DST handling harder rather than easier.
 *
 * DST policy, stated so it is never a surprise:
 *   - spring-forward gap: the fire lands at the first instant after the gap
 *     (late, never skipped)
 *   - fall-back doubled hour: the fire happens once, on the first occurrence
 * Both fall out of the offset fixpoint in zonedTimeToUtc, and both are tested.
 */

export interface ZonedParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  /** 0 = Sunday … 6 = Saturday. */
  dow: number;
}

const DOW_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  formatterCache.set(timezone, fmt);
  return fmt;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(instant: Date, timezone: string): ZonedParts {
  const parts = formatterFor(timezone).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    y: Number.parseInt(get("year"), 10),
    m: Number.parseInt(get("month"), 10),
    d: Number.parseInt(get("day"), 10),
    hh: Number.parseInt(get("hour"), 10),
    mm: Number.parseInt(get("minute"), 10),
    dow: DOW_INDEX[get("weekday")] ?? 0,
  };
}

/** The zone's UTC offset in ms at a given instant. */
function offsetMsAt(instant: Date, timezone: string): number {
  const p = zonedParts(instant, timezone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, 0, 0);
  // Second-resolution: we only ever build times at whole minutes.
  return asUtc - Math.floor(instant.getTime() / 60000) * 60000;
}

/**
 * Local wall-clock time -> UTC instant, by offset fixpoint.
 *
 * In a spring-forward gap the requested wall time does not exist; the second
 * pass lands just after the gap, which is the behaviour we want (late, never
 * skipped). In a fall-back doubled hour both passes agree on the first
 * occurrence.
 */
export function zonedTimeToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timezone: string,
): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const off1 = offsetMsAt(new Date(guess), timezone);
  let candidate = guess - off1;
  const off2 = offsetMsAt(new Date(candidate), timezone);
  if (off2 !== off1) candidate = guess - off2;
  return new Date(candidate);
}

export function parseTimeOfDay(timeOfDay: string): { hh: number; mm: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay.trim());
  if (!m) return null;
  const hh = Number.parseInt(m[1] as string, 10);
  const mm = Number.parseInt(m[2] as string, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

/** Returns [] when the cadence is usable; otherwise one message per problem. */
export function validateCadence(c: Cadence): string[] {
  const problems: string[] = [];
  if (!isValidTimezone(c.timezone)) problems.push(`unknown timezone "${c.timezone}"`);
  if (!parseTimeOfDay(c.timeOfDay)) {
    problems.push(`timeOfDay must be "HH:MM" in 24-hour form, got "${c.timeOfDay}"`);
  }
  if (!Array.isArray(c.daysOfWeek) || c.daysOfWeek.length === 0) {
    problems.push("pick at least one day of the week");
  } else {
    const bad = c.daysOfWeek.filter((d) => !Number.isInteger(d) || d < 0 || d > 6);
    if (bad.length > 0) problems.push(`days of week must be 0-6, got ${bad.join(", ")}`);
    if (new Set(c.daysOfWeek).size !== c.daysOfWeek.length) {
      problems.push("days of week contains duplicates");
    }
  }
  if (!Number.isInteger(c.batchSize) || c.batchSize < 1) {
    problems.push("batch size must be a whole number of at least 1");
  }
  return problems;
}

/** Guard: a cadence firing on no day would loop forever looking for one. */
const MAX_SEARCH_DAYS = 400;

/**
 * The first fire strictly after `after`.
 *
 * Throws on an invalid cadence rather than returning a wrong date — a silently
 * wrong next-fire is far worse than a loud failure the operator can fix.
 */
export function nextOccurrenceAfter(c: Cadence, after: Date): Date {
  const problems = validateCadence(c);
  if (problems.length > 0) {
    throw new Error(`invalid cadence: ${problems.join("; ")}`);
  }
  const time = parseTimeOfDay(c.timeOfDay);
  if (!time) throw new Error(`invalid cadence: bad timeOfDay "${c.timeOfDay}"`);
  const days = new Set(c.daysOfWeek);

  // Walk forward from the local calendar day of `after`.
  const start = zonedParts(after, c.timezone);
  for (let i = 0; i < MAX_SEARCH_DAYS; i++) {
    // Step by UTC days, then re-read the local date, so DST shifts cannot
    // make the walk skip or repeat a local day.
    const probe = new Date(Date.UTC(start.y, start.m - 1, start.d, 12, 0, 0) + i * 86400000);
    const local = zonedParts(probe, c.timezone);
    if (!days.has(local.dow)) continue;
    const fire = zonedTimeToUtc(local.y, local.m, local.d, time.hh, time.mm, c.timezone);
    if (fire.getTime() > after.getTime()) return fire;
  }
  throw new Error("no cadence occurrence found within a year — check daysOfWeek");
}

/** Every occurrence in (from, to], oldest first. `cap` bounds the result. */
export function occurrencesBetween(c: Cadence, from: Date, to: Date, cap = 500): Date[] {
  const out: Date[] = [];
  let cursor = from;
  while (out.length < cap) {
    const next = nextOccurrenceAfter(c, cursor);
    if (next.getTime() > to.getTime()) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

/**
 * The most recent occurrence at or before `at`. Used to collapse a backlog
 * after downtime: the schedule resumes from the latest missed fire rather
 * than replaying every one of them.
 */
export function lastOccurrenceAtOrBefore(c: Cadence, at: Date, notBefore?: Date): Date | null {
  const floor = notBefore ?? new Date(at.getTime() - MAX_SEARCH_DAYS * 86400000);
  let cursor = floor;
  let latest: Date | null = null;
  for (let i = 0; i < MAX_SEARCH_DAYS; i++) {
    const next = nextOccurrenceAfter(c, cursor);
    if (next.getTime() > at.getTime()) break;
    latest = next;
    cursor = next;
  }
  return latest;
}

/** Start of the local calendar week (Monday) containing `instant`, as UTC. */
export function startOfLocalWeek(instant: Date, timezone: string): Date {
  const p = zonedParts(instant, timezone);
  const daysSinceMonday = (p.dow + 6) % 7;
  const probe = new Date(
    Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0) - daysSinceMonday * 86400000,
  );
  const local = zonedParts(probe, timezone);
  return zonedTimeToUtc(local.y, local.m, local.d, 0, 0, timezone);
}
