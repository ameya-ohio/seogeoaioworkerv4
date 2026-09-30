import type { FunnelStage, PageRole, PriorityTier } from "../plan/types.js";

/**
 * Production order for an imported content plan.
 *
 * Two rules, layered:
 *
 *  1. The PRIORITY rule, taken from the plan's own sequencing guidance: all
 *     pillar pages and P1 hubs first, then P1 BOFU, then the rest of P1, then
 *     the remaining hubs, then P2 grouped by pillar, then P3.
 *
 *  2. The STRUCTURAL rule, which overrides it: bottom-up. A subtopic's
 *     cluster articles before its hub, a pillar's hubs before the pillar page
 *     (see ./readiness.ts for why).
 *
 * The two conflict constantly — the priority rule leads with pillar pages and
 * P1 hubs — so a parent is DEFERRED to just after its last child, and every
 * deferral is reported. Children keep their own priority order, so a P1 BOFU
 * article is never delayed to suit the structure.
 */

export interface SequenceInput {
  /** This item's own key, unique within the plan (its externalId). */
  key: string;
  /** The key of the item that must be produced first, if any. */
  parentKey?: string | null;
  /** Position in the source sheet — the stable final tiebreak. */
  rowIndex: number;
  pillarId: string;
  subtopicId?: string | null;
  role: PageRole;
  priority: PriorityTier;
  funnel?: FunnelStage;
  tier?: "A" | "B" | "C" | null;
}

export interface SequenceKey {
  wave: number;
  pillarRank: number;
  roleRank: number;
  bofuRank: number;
  tierRank: number;
  subtopicRank: number;
  rowIndex: number;
}

export interface Deferral {
  parentKey: string;
  /** The child it now follows: the last of its children to be produced. */
  childKey: string;
  /** Position the parent would have had on priority alone. */
  fromIndex: number;
  /** Position it was moved to so it follows all its children. */
  toIndex: number;
}

export interface SequenceResult {
  ordered: { key: string; sequence: number }[];
  deferrals: Deferral[];
  /** Unresolvable structure: a missing parent, or a cycle. */
  violations: string[];
}

export const WAVE_LABELS = [
  "Pillar pages and P1 hubs",
  "P1 bottom-of-funnel",
  "Remaining P1",
  "Remaining hubs",
  "P2 by pillar",
  "P3",
] as const;

const ROLE_RANK: Record<PageRole, number> = { pillar: 0, hub: 1, cluster: 2 };
const TIER_RANK: Record<string, number> = { A: 0, B: 1, C: 2 };

/** The priority rule, as a wave number. */
export function waveOf(i: SequenceInput): number {
  if (i.role === "pillar") return 0;
  if (i.role === "hub" && i.priority === 1) return 0;
  if (i.priority === 1 && i.funnel === "bofu") return 1;
  if (i.priority === 1) return 2;
  if (i.role === "hub") return 3;
  if (i.priority === 2) return 4;
  return 5;
}

/** Pillars are ranked by first appearance, so sheet order decides ties. */
export function pillarOrderOf(items: SequenceInput[]): Map<string, number> {
  const order = new Map<string, number>();
  for (const i of [...items].sort((a, b) => a.rowIndex - b.rowIndex)) {
    if (!order.has(i.pillarId)) order.set(i.pillarId, order.size);
  }
  return order;
}

function subtopicOrderOf(items: SequenceInput[]): Map<string, number> {
  const order = new Map<string, number>();
  for (const i of [...items].sort((a, b) => a.rowIndex - b.rowIndex)) {
    const key = `${i.pillarId}::${i.subtopicId ?? ""}`;
    if (!order.has(key)) order.set(key, order.size);
  }
  return order;
}

export function sequenceKey(
  i: SequenceInput,
  pillarOrder: Map<string, number>,
  subtopicOrder: Map<string, number>,
): SequenceKey {
  return {
    wave: waveOf(i),
    pillarRank: pillarOrder.get(i.pillarId) ?? Number.MAX_SAFE_INTEGER,
    roleRank: ROLE_RANK[i.role],
    bofuRank: i.funnel === "bofu" ? 0 : 1,
    tierRank: i.tier ? TIER_RANK[i.tier] ?? 3 : 3,
    subtopicRank:
      subtopicOrder.get(`${i.pillarId}::${i.subtopicId ?? ""}`) ?? Number.MAX_SAFE_INTEGER,
    rowIndex: i.rowIndex,
  };
}

export function compareSequence(a: SequenceKey, b: SequenceKey): number {
  return (
    a.wave - b.wave ||
    a.pillarRank - b.pillarRank ||
    a.roleRank - b.roleRank ||
    a.bofuRank - b.bofuRank ||
    a.tierRank - b.tierRank ||
    a.subtopicRank - b.subtopicRank ||
    a.rowIndex - b.rowIndex
  );
}

/**
 * Order the plan.
 *
 * A topological sort with the priority order as its tiebreak: at every step,
 * emit the highest-priority item whose children are all emitted. A child is
 * never pushed back to suit its parent; a parent simply becomes available the
 * moment its last child is placed, and its wave-0 priority then puts it next.
 */
export function computeSequence(items: SequenceInput[]): SequenceResult {
  const violations: string[] = [];
  const byKey = new Map<string, SequenceInput>();
  for (const i of items) {
    if (byKey.has(i.key)) {
      violations.push(`duplicate key "${i.key}" — later rows ignored`);
      continue;
    }
    byKey.set(i.key, i);
  }

  const pillarOrder = pillarOrderOf(items);
  const subtopicOrder = subtopicOrderOf(items);
  const keys = new Map<string, SequenceKey>();
  for (const [k, i] of byKey) keys.set(k, sequenceKey(i, pillarOrder, subtopicOrder));
  const cmp = (a: SequenceInput, b: SequenceInput) =>
    compareSequence(keys.get(a.key) as SequenceKey, keys.get(b.key) as SequenceKey);

  const sorted = [...byKey.values()].sort(cmp);
  const priorityIndex = new Map(sorted.map((i, idx) => [i.key, idx]));

  // Unplaced children per parent.
  const pending = new Map<string, number>();
  for (const i of sorted) {
    const parentKey = i.parentKey ?? null;
    if (!parentKey) continue;
    if (!byKey.has(parentKey)) {
      violations.push(`"${i.key}" names a parent "${parentKey}" that is not in the plan`);
      continue;
    }
    pending.set(parentKey, (pending.get(parentKey) ?? 0) + 1);
  }

  const emitted = new Set<string>();
  const ordered: string[] = [];
  const deferrals: Deferral[] = [];
  let available = sorted.filter((i) => !pending.get(i.key));

  const place = (item: SequenceInput) => {
    emitted.add(item.key);
    ordered.push(item.key);
    const parentKey = item.parentKey ?? null;
    if (!parentKey || !byKey.has(parentKey)) return;
    const left = (pending.get(parentKey) ?? 0) - 1;
    pending.set(parentKey, left);
    if (left === 0) {
      const parent = byKey.get(parentKey) as SequenceInput;
      available.push(parent);
      available.sort(cmp);
      // Placed after this child — record when that is later than priority alone.
      const from = priorityIndex.get(parentKey) ?? 0;
      if (from < (priorityIndex.get(item.key) ?? 0)) {
        deferrals.push({ parentKey, childKey: item.key, fromIndex: from, toIndex: ordered.length });
      }
    }
  };

  while (available.length > 0) {
    const next = available.shift() as SequenceInput;
    if (emitted.has(next.key)) continue;
    place(next);
  }

  // Whatever is left sits on a cycle: report it and append in priority order
  // so every row still gets a sequence number.
  const stuck = sorted.filter((i) => !emitted.has(i.key));
  if (stuck.length > 0) {
    violations.push(`dependency cycle: ${stuck.map((i) => i.key).join(" -> ")}`);
    for (const i of stuck) {
      emitted.add(i.key);
      ordered.push(i.key);
    }
  }

  return {
    ordered: ordered.map((key, idx) => ({ key, sequence: idx })),
    deferrals,
    violations,
  };
}

/** Assert the invariant the scheduler depends on. Used by tests and the import report. */
export function findOrderViolations(
  items: SequenceInput[],
  ordered: { key: string; sequence: number }[],
): string[] {
  const pos = new Map(ordered.map((o) => [o.key, o.sequence]));
  const problems: string[] = [];
  for (const i of items) {
    if (!i.parentKey) continue;
    const mine = pos.get(i.key);
    const parent = pos.get(i.parentKey);
    if (mine === undefined || parent === undefined) continue;
    if (parent < mine) {
      problems.push(`"${i.key}" (#${mine}) is ordered after its parent "${i.parentKey}" (#${parent})`);
    }
  }
  return problems;
}
