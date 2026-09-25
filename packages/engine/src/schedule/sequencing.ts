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
 *  2. The STRUCTURAL rule, which overrides it: a pillar page before its hubs,
 *     a hub before its cluster articles. Without this, an article links up to
 *     a page that does not exist yet and the edit gate strips the link (D35).
 *
 * The two genuinely conflict — a P1 BOFU article can sit under a P2 hub — so
 * the parent is PROMOTED to just before its earliest child, and every
 * promotion is reported. An operator who sees their priority ordering changed
 * should be able to see exactly where and why, rather than discovering it as
 * mystery ordering weeks into a cadence.
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

export interface Promotion {
  parentKey: string;
  childKey: string;
  /** Position the parent would have had on priority alone. */
  fromIndex: number;
  /** Position it was moved to so it precedes its child. */
  toIndex: number;
}

export interface SequenceResult {
  ordered: { key: string; sequence: number }[];
  promotions: Promotion[];
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
 * Priority order is computed first, then the list is re-emitted so that every
 * item's ancestors precede it — emitting an ancestor early rather than pushing
 * the child late, because the child is the high-priority item and delaying it
 * would defeat the priority rule it earned.
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

  const sorted = [...byKey.values()].sort((a, b) =>
    compareSequence(
      keys.get(a.key) as SequenceKey,
      keys.get(b.key) as SequenceKey,
    ),
  );
  const priorityIndex = new Map(sorted.map((i, idx) => [i.key, idx]));

  const emitted = new Set<string>();
  const ordered: string[] = [];
  const promotions: Promotion[] = [];

  /** Emit every unemitted ancestor of `item`, nearest-last, then the item. */
  const emit = (item: SequenceInput, stack: string[]): void => {
    if (emitted.has(item.key)) return;
    if (stack.includes(item.key)) {
      violations.push(`dependency cycle: ${[...stack, item.key].join(" -> ")}`);
      return;
    }
    const parentKey = item.parentKey ?? null;
    if (parentKey) {
      const parent = byKey.get(parentKey);
      if (!parent) {
        violations.push(`"${item.key}" names a parent "${parentKey}" that is not in the plan`);
      } else if (!emitted.has(parentKey)) {
        emit(parent, [...stack, item.key]);
        // The parent came out before its own priority position: record it, so
        // the operator can see where structure overrode priority.
        const from = priorityIndex.get(parentKey);
        const to = ordered.indexOf(parentKey);
        if (
          from !== undefined &&
          to !== -1 &&
          from > (priorityIndex.get(item.key) ?? Number.MAX_SAFE_INTEGER)
        ) {
          promotions.push({ parentKey, childKey: item.key, fromIndex: from, toIndex: to });
        }
      }
    }
    if (emitted.has(item.key)) return;
    emitted.add(item.key);
    ordered.push(item.key);
  };

  for (const item of sorted) emit(item, []);

  return {
    ordered: ordered.map((key, idx) => ({ key, sequence: idx })),
    promotions,
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
    if (parent > mine) {
      problems.push(`"${i.key}" (#${mine}) is ordered before its parent "${i.parentKey}" (#${parent})`);
    }
  }
  return problems;
}
