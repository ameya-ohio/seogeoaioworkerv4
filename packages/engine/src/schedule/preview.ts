import type { Stage } from "../types.js";
import type { PageRole, PlanItemStatus } from "../plan/types.js";
import type { Cadence, ScheduleLimits } from "./types.js";
import { nextOccurrenceAfter } from "./calendar.js";
import { isReady, type ReadinessItem } from "./readiness.js";

/**
 * "The next N articles, with dates."
 *
 * This replays the REAL selection loop against a virtual clock rather than
 * listing calendar dates. A naive "every weekday at 07:00" preview is wrong
 * in exactly the case the operator cares about: parent-gating and
 * `maxInFlight` mean a fire can produce fewer articles than the batch size,
 * or none at all, and those slips compound across weeks.
 *
 * It deliberately does NOT model `maxAwaitingReview`, which depends on how
 * fast a human reviews. A projected date that silently assumes the operator
 * keeps up is worse than no date, so that limit is annotated, never simulated.
 * Label the output a projection in the UI.
 */

export interface PreviewItem {
  key: string;
  sequence: number;
  slug: string;
  title: string;
  role: PageRole;
  status: PlanItemStatus;
  parentKey?: string | null | undefined;
  failureCount: number;
  retryAfter?: Date | undefined;
  dependencyOverride?: boolean | undefined;
  articleStage?: Stage | undefined;
}

export interface PreviewEntryItem {
  key: string;
  sequence: number;
  slug: string;
  title: string;
  role: PageRole;
}

export interface PreviewEntry {
  fireAt: Date;
  items: PreviewEntryItem[];
  /** Set when the fire produced fewer articles than the batch size. */
  note?: string;
}

export interface PreviewOptions {
  cadence: Cadence;
  limits: ScheduleLimits;
  requireApproval: boolean;
  estimatedArticleMinutes: number;
  /** Items already enqueued or running right now. */
  inFlightNow?: number;
  /** Stop after this many fires even if fewer articles were projected. */
  maxFires?: number;
}

const DEFAULT_MAX_FIRES = 200;

export function previewSchedule(
  items: PreviewItem[],
  from: Date,
  articleCount: number,
  opts: PreviewOptions,
): PreviewEntry[] {
  const entries: PreviewEntry[] = [];
  if (articleCount <= 0) return entries;

  // Virtual state, seeded from the real one and advanced as the clock moves.
  const state = new Map<
    string,
    { status: PlanItemStatus; completesAt?: Date; articleStage?: Stage }
  >();
  for (const i of items) {
    const entry: { status: PlanItemStatus; articleStage?: Stage } = { status: i.status };
    if (i.articleStage !== undefined) entry.articleStage = i.articleStage;
    state.set(i.key, entry);
  }

  const byKey = new Map(items.map((i) => [i.key, i]));
  const ordered = [...items].sort((a, b) => a.sequence - b.sequence);

  const readinessOf = (i: PreviewItem): ReadinessItem => {
    const s = state.get(i.key);
    return {
      key: i.key,
      status: s?.status ?? i.status,
      failureCount: i.failureCount,
      retryAfter: i.retryAfter,
      dependencyOverride: i.dependencyOverride,
      parentKey: i.parentKey,
      articleStage: s?.articleStage,
    };
  };

  let produced = 0;
  let inFlight = opts.inFlightNow ?? 0;
  let cursor = from;
  const maxFires = opts.maxFires ?? DEFAULT_MAX_FIRES;

  for (let fireIndex = 0; fireIndex < maxFires && produced < articleCount; fireIndex++) {
    let fireAt: Date;
    try {
      fireAt = nextOccurrenceAfter(opts.cadence, cursor);
    } catch {
      // An invalid cadence is surfaced by validateCadence in the UI; a preview
      // should go quiet rather than throw.
      break;
    }
    cursor = fireAt;

    // Anything that would have finished by now is done.
    for (const s of state.values()) {
      if (s.status === "enqueued" && s.completesAt && s.completesAt <= fireAt) {
        s.status = "done";
        // Decision 1: the pipeline ends at review, so that is where a
        // projected article lands — never "approved".
        s.articleStage = "review";
        delete s.completesAt;
        inFlight = Math.max(0, inFlight - 1);
      }
    }

    const budget = Math.min(
      opts.cadence.batchSize,
      opts.limits.maxInFlight - inFlight,
      articleCount - produced,
    );
    if (budget <= 0) {
      entries.push({
        fireAt,
        items: [],
        note: `throttled: ${inFlight} already in flight (max ${opts.limits.maxInFlight})`,
      });
      continue;
    }

    const enqueuedThisTick = new Set<string>();
    const picked: PreviewEntryItem[] = [];
    for (const item of ordered) {
      if (picked.length >= budget) break;
      // A parent named but absent from the plan resolves to null, matching
      // the tick: the child is not held hostage to a row that does not exist.
      const parentItem = item.parentKey ? byKey.get(item.parentKey) : undefined;
      const r = isReady(
        readinessOf(item),
        parentItem ? readinessOf(parentItem) : null,
        enqueuedThisTick,
        {
          requireApproval: opts.requireApproval,
          itemMaxAttempts: opts.limits.itemMaxAttempts,
          now: fireAt,
        },
      );
      if (!r.ready) continue;

      const s = state.get(item.key);
      if (s) {
        s.status = "enqueued";
        s.completesAt = new Date(fireAt.getTime() + opts.estimatedArticleMinutes * 60_000);
      }
      enqueuedThisTick.add(item.key);
      inFlight++;
      produced++;
      picked.push({
        key: item.key,
        sequence: item.sequence,
        slug: item.slug,
        title: item.title,
        role: item.role,
      });
    }

    const entry: PreviewEntry = { fireAt, items: picked };
    if (picked.length === 0) entry.note = "no item is ready — every candidate is waiting on a parent";
    else if (picked.length < opts.cadence.batchSize) {
      entry.note = `${picked.length} of ${opts.cadence.batchSize} — the rest are waiting on a parent`;
    }
    entries.push(entry);
  }

  return entries;
}

/**
 * A plain-language caveat to render beside the projection, so the dates are
 * never mistaken for a commitment.
 */
export function previewCaveat(limits: ScheduleLimits): string {
  return (
    `Projection only. It assumes each article takes the estimated time and that ` +
    `nothing stalls at review — generation pauses whenever ${limits.maxAwaitingReview} ` +
    `articles are awaiting review, and those slots are skipped rather than owed.`
  );
}
