import { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import type {
  ScrapeDoc,
  ScrapeEventDoc,
  ScrapeEventType,
  ScrapeOptions,
  ScrapeStage,
} from "../scrape/types.js";

/**
 * DAL + job-queue operations for competitive scrape runs (roadmap 6.1).
 * Mirrors dal/clusters.ts: lease-claim via findOneAndUpdate, heartbeat,
 * retry with resume-from-failed-stage, append-only event stream with
 * per-scrape seq.
 */

export interface EnqueueScrapeInput {
  companyId: string;
  url: string;
  options?: Partial<ScrapeOptions>;
  maxAttempts?: number;
}

export class InvalidScrapeUrlError extends Error {}

/** www.-stripped hostname — the competitor's identity across scrapes. */
export function scrapeDomainFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidScrapeUrlError(`Not a valid absolute URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidScrapeUrlError(`Blog URL must be http(s): ${url}`);
  }
  return parsed.hostname.toLowerCase().replace(/^www\./, "");
}

export async function enqueueScrapeRun(
  db: EngineDb,
  input: EnqueueScrapeInput,
): Promise<ScrapeDoc> {
  const url = input.url.trim();
  const domain = scrapeDomainFromUrl(url);
  const now = new Date();
  const doc: ScrapeDoc = {
    companyId: input.companyId,
    url,
    domain,
    status: "queued",
    stage: "scrape",
    completedStages: [],
    options: {
      useBrowser: input.options?.useBrowser ?? false,
      withImages: input.options?.withImages ?? false,
      ...(input.options?.maxArticles ? { maxArticles: input.options.maxArticles } : {}),
    },
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 2,
    eventSeq: 0,
    queuedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const res = await db.scrapes.insertOne(doc);
  doc._id = res.insertedId;
  await emitScrapeEvent(db, {
    companyId: doc.companyId,
    scrapeId: res.insertedId,
    type: "scrape.queued",
    message: `Scrape queued for ${url}`,
  });
  return doc;
}

export async function claimScrapeRun(
  db: EngineDb,
  workerId: string,
  leaseMs: number,
): Promise<ScrapeDoc | null> {
  const now = new Date();
  const res = await db.scrapes.findOneAndUpdate(
    {
      $or: [
        { status: "queued" },
        { status: "running", leaseUntil: { $lt: now } },
      ],
    },
    {
      $set: {
        status: "running",
        workerId,
        leaseUntil: new Date(now.getTime() + leaseMs),
        startedAt: now,
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { queuedAt: 1 }, returnDocument: "after" },
  );
  return res ?? null;
}

export async function heartbeatScrape(
  db: EngineDb,
  scrapeId: ObjectId,
  workerId: string,
  leaseMs: number,
): Promise<boolean> {
  const now = new Date();
  const res = await db.scrapes.updateOne(
    { _id: scrapeId, status: "running", workerId },
    { $set: { leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now } },
  );
  return res.matchedCount === 1;
}

export async function getScrape(db: EngineDb, id: ObjectId): Promise<ScrapeDoc | null> {
  return db.scrapes.findOne({ _id: id });
}

export async function listScrapes(
  db: EngineDb,
  companyId: string,
  limit = 50,
): Promise<ScrapeDoc[]> {
  return db.scrapes.find({ companyId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

/**
 * The freshest successfully-scraped corpus per competitor domain — the input
 * set for gap-analysis digests (6.3). Sorted newest-first across domains.
 */
export async function latestScrapesByDomain(
  db: EngineDb,
  companyId: string,
): Promise<ScrapeDoc[]> {
  const docs = await db.scrapes
    .find({ companyId, status: "succeeded" })
    .sort({ createdAt: -1 })
    .toArray();
  const byDomain = new Map<string, ScrapeDoc>();
  for (const doc of docs) {
    if (!byDomain.has(doc.domain)) byDomain.set(doc.domain, doc);
  }
  return [...byDomain.values()];
}

/** Persist stage output fields and advance the stage pointer. */
export async function saveScrapeStage(
  db: EngineDb,
  scrapeId: ObjectId,
  completedStage: ScrapeStage,
  nextStage: ScrapeStage | "done",
  fields: Partial<ScrapeDoc>,
): Promise<void> {
  const $set: Record<string, unknown> = { stage: nextStage, updatedAt: new Date() };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) $set[k] = v;
  }
  await db.scrapes.updateOne(
    { _id: scrapeId },
    { $set, $addToSet: { completedStages: completedStage } },
  );
}

/** A crash between attempts can lose the on-disk workspace — start over. */
export async function resetScrapeStages(db: EngineDb, scrapeId: ObjectId): Promise<void> {
  await db.scrapes.updateOne(
    { _id: scrapeId },
    { $set: { stage: "scrape", completedStages: [], updatedAt: new Date() } },
  );
}

export async function completeScrapeRun(db: EngineDb, scrapeId: ObjectId): Promise<void> {
  const now = new Date();
  await db.scrapes.updateOne(
    { _id: scrapeId },
    {
      $set: { status: "succeeded", stage: "done", endedAt: now, updatedAt: now },
      $unset: { leaseUntil: "", workerId: "", error: "" },
    },
  );
}

/**
 * Fail a scrape run. Below maxAttempts it requeues; completed stages are
 * kept so the retry resumes at the failing stage (the runner re-verifies the
 * on-disk workspace and falls back to a full re-crawl when it is gone).
 */
export async function failScrapeRun(
  db: EngineDb,
  scrapeId: ObjectId,
  error: string,
): Promise<"requeued" | "failed"> {
  const now = new Date();
  const scrape = await db.scrapes.findOne({ _id: scrapeId });
  if (!scrape) return "failed";
  if (scrape.attempts < scrape.maxAttempts) {
    await db.scrapes.updateOne(
      { _id: scrapeId },
      {
        $set: { status: "queued", error, queuedAt: now, updatedAt: now },
        $unset: { leaseUntil: "", workerId: "" },
      },
    );
    return "requeued";
  }
  await db.scrapes.updateOne(
    { _id: scrapeId },
    {
      $set: { status: "failed", error, endedAt: now, updatedAt: now },
      $unset: { leaseUntil: "", workerId: "" },
    },
  );
  return "failed";
}

export async function emitScrapeEvent(
  db: EngineDb,
  params: {
    companyId: string;
    scrapeId: ObjectId;
    type: ScrapeEventType;
    message: string;
    data?: Record<string, unknown>;
  },
): Promise<ScrapeEventDoc | null> {
  const scrape = await db.scrapes.findOneAndUpdate(
    { _id: params.scrapeId },
    { $inc: { eventSeq: 1 } },
    { returnDocument: "after", projection: { eventSeq: 1 } },
  );
  if (!scrape) return null;
  const doc: ScrapeEventDoc = {
    companyId: params.companyId,
    scrapeId: params.scrapeId,
    seq: scrape.eventSeq,
    ts: new Date(),
    type: params.type,
    message: params.message,
    ...(params.data ? { data: params.data } : {}),
  };
  const res = await db.scrapeEvents.insertOne(doc);
  doc._id = res.insertedId;
  return doc;
}

export async function scrapeEventsAfter(
  db: EngineDb,
  scrapeId: ObjectId,
  afterSeq = 0,
  limit = 200,
): Promise<ScrapeEventDoc[]> {
  return db.scrapeEvents
    .find({ scrapeId, seq: { $gt: afterSeq } })
    .sort({ seq: 1 })
    .limit(limit)
    .toArray();
}
