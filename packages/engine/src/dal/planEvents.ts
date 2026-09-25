import type { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import type { PlanEventDoc, PlanEventType } from "../plan/types.js";

/**
 * The plan/schedule event stream.
 *
 * A separate collection from `events` because EventDoc requires runId AND
 * articleId and allocates `seq` by $inc on the run doc — a scheduler tick has
 * neither. Same shape as the existing cluster_events and scrape_events
 * streams, and it keeps scheduler chatter out of the Work board's feed.
 */

export interface EmitPlanEventInput {
  companyId: string;
  planId: ObjectId;
  planItemId?: ObjectId;
  type: PlanEventType;
  message: string;
  data?: Record<string, unknown>;
}

export async function emitPlanEvent(
  db: EngineDb,
  input: EmitPlanEventInput,
): Promise<PlanEventDoc | null> {
  // The sequence lives on the plan doc, so events stay ordered per plan even
  // when several workers write at once.
  const res = await db.plans.findOneAndUpdate(
    { _id: input.planId },
    { $inc: { eventSeq: 1 } },
    { returnDocument: "after" },
  );
  if (!res) return null;
  const doc: PlanEventDoc = {
    companyId: input.companyId,
    planId: input.planId,
    ...(input.planItemId ? { planItemId: input.planItemId } : {}),
    seq: res.eventSeq,
    ts: new Date(),
    type: input.type,
    message: input.message,
    ...(input.data ? { data: input.data } : {}),
  };
  try {
    const ins = await db.planEvents.insertOne(doc);
    doc._id = ins.insertedId;
  } catch {
    // The {planId, seq} unique index lost a race. An event is telemetry, not
    // state — never fail the operation that was reporting progress.
    return null;
  }
  return doc;
}

/** Tail the stream for the SSE route. */
export async function planEventsAfter(
  db: EngineDb,
  planId: ObjectId,
  afterSeq: number,
  limit = 200,
): Promise<PlanEventDoc[]> {
  return db.planEvents
    .find({ planId, seq: { $gt: afterSeq } })
    .sort({ seq: 1 })
    .limit(limit)
    .toArray();
}

export async function latestPlanEvents(
  db: EngineDb,
  planId: ObjectId,
  limit = 50,
): Promise<PlanEventDoc[]> {
  const docs = await db.planEvents.find({ planId }).sort({ seq: -1 }).limit(limit).toArray();
  return docs.reverse();
}
