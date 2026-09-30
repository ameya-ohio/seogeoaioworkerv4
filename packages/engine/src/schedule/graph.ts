import type { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import type { PlanItemDoc } from "../plan/types.js";
import type { Stage } from "../types.js";
import { childrenOutstanding, type ReadinessItem } from "./readiness.js";

/**
 * A plan's items as a tree, with each produced item's article stage attached.
 *
 * Bottom-up readiness needs every item's children, and a plan is a few
 * hundred rows, so loading it once per tick beats a query per candidate.
 */
export interface PlanGraph {
  items: PlanItemDoc[];
  byKey: Map<string, PlanItemDoc>;
  /** Parent key -> its direct children. */
  childrenOf: Map<string, PlanItemDoc[]>;
  stageOf: Map<string, Stage>;
  readiness(item: PlanItemDoc): ReadinessItem;
  children(item: PlanItemDoc): ReadinessItem[];
}

export function itemKey(item: Pick<PlanItemDoc, "_id" | "externalId">): string {
  return item._id?.toHexString() ?? item.externalId;
}

export function buildPlanGraph(items: PlanItemDoc[], stageOf: Map<string, Stage>): PlanGraph {
  const byKey = new Map<string, PlanItemDoc>();
  const childrenOf = new Map<string, PlanItemDoc[]>();
  for (const i of items) byKey.set(itemKey(i), i);
  for (const i of items) {
    if (!i.parentItemId) continue;
    const key = i.parentItemId.toHexString();
    const list = childrenOf.get(key) ?? [];
    list.push(i);
    childrenOf.set(key, list);
  }
  const readiness = (item: PlanItemDoc): ReadinessItem => {
    const stage = item.articleId ? stageOf.get(item.articleId.toHexString()) : undefined;
    return {
      key: itemKey(item),
      status: item.status,
      failureCount: item.failureCount,
      retryAfter: item.retryAfter,
      dependencyOverride: item.dependencyOverride,
      parentKey: item.parentItemId?.toHexString() ?? null,
      articleStage: stage,
      held: Boolean(item.held),
      enrichment: item.enrichment,
    };
  };
  return {
    items,
    byKey,
    childrenOf,
    stageOf,
    readiness,
    children: (item) => (childrenOf.get(itemKey(item)) ?? []).map(readiness),
  };
}

export async function loadPlanGraph(db: EngineDb, planId: ObjectId): Promise<PlanGraph> {
  const items = await db.planItems.find({ planId }).sort({ sequence: 1 }).toArray();
  const articleIds = items.map((i) => i.articleId).filter((id): id is ObjectId => Boolean(id));
  const stageOf = new Map<string, Stage>();
  if (articleIds.length) {
    const rows = await db.articles
      .find({ _id: { $in: articleIds } })
      .project<{ _id: ObjectId; stage: Stage }>({ stage: 1 })
      .toArray();
    for (const r of rows) stageOf.set(r._id.toHexString(), r.stage);
  }
  return buildPlanGraph(items, stageOf);
}

const ROLE_NOUN = {
  pillar: ["pillar page", "pillar pages"],
  hub: ["hub page", "hub pages"],
  cluster: ["cluster article", "cluster articles"],
} as const;

/**
 * "waiting on 4 of 9 cluster articles" — or null when nothing holds it back.
 * Only meaningful for an item that has not started.
 */
export function describeWaiting(
  graph: PlanGraph,
  item: PlanItemDoc,
  requireApproval = false,
): string | null {
  if (item.status !== "planned" && item.status !== "failed") return null;
  if (item.dependencyOverride) return null;
  const kids = graph.childrenOf.get(itemKey(item)) ?? [];
  if (kids.length === 0) return null;
  const { waiting, counted } = childrenOutstanding(kids.map(graph.readiness), { requireApproval });
  if (waiting === 0) return null;
  const roles = new Set(kids.map((k) => k.pageRole));
  const role = roles.size === 1 ? [...roles][0] : undefined;
  const noun = role ? ROLE_NOUN[role][counted === 1 ? 0 : 1] : counted === 1 ? "page" : "pages";
  return `waiting on ${waiting} of ${counted} ${noun}`;
}
