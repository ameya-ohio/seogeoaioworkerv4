import { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import type { EventDoc, EventType } from "../types.js";

/**
 * Append an event to a run's ordered stream. `seq` is allocated by $inc on
 * the run doc, so concurrent emitters never collide (events has a unique
 * {runId, seq} index).
 */
export async function emitEvent(
  db: EngineDb,
  params: {
    companyId: string;
    runId: ObjectId;
    articleId: ObjectId;
    type: EventType;
    message: string;
    data?: Record<string, unknown>;
  },
): Promise<EventDoc | null> {
  const run = await db.runs.findOneAndUpdate(
    { _id: params.runId },
    { $inc: { eventSeq: 1 } },
    { returnDocument: "after", projection: { eventSeq: 1 } },
  );
  if (!run) return null;
  const doc: EventDoc = {
    companyId: params.companyId,
    runId: params.runId,
    articleId: params.articleId,
    seq: run.eventSeq,
    ts: new Date(),
    type: params.type,
    message: params.message,
    ...(params.data ? { data: params.data } : {}),
  };
  const res = await db.events.insertOne(doc);
  doc._id = res.insertedId;
  return doc;
}

/** Events for a run after a given seq — the polling/SSE primitive. */
export async function eventsAfter(
  db: EngineDb,
  runId: ObjectId,
  afterSeq = 0,
  limit = 200,
): Promise<EventDoc[]> {
  return db.events
    .find({ runId, seq: { $gt: afterSeq } })
    .sort({ seq: 1 })
    .limit(limit)
    .toArray();
}
