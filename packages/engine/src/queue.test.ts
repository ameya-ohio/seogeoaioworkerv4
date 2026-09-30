import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type EngineDb } from "./db.js";
import { createArticle } from "./dal/articles.js";
import {
  claimRun,
  completeRun,
  enqueueRun,
  failRun,
  heartbeat,
  releaseRun,
  setRunPhase,
} from "./dal/runs.js";
import { emitEvent, eventsAfter } from "./dal/events.js";
import type { ObjectId } from "mongodb";

let mongod: MongoMemoryServer;
let db: EngineDb;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  db = await connect(mongod.getUri(), "queue_test");
}, 120_000);

afterAll(async () => {
  await db?.close();
  await mongod?.stop();
});

async function makeArticle(slug: string) {
  return createArticle(db, {
    companyId: "testco",
    slug,
    folder: `2026-09-14-${slug}`,
    topic: "Test topic",
  });
}

describe("run queue", () => {
  it("enqueue → claim → complete", async () => {
    const article = await makeArticle("q-basic");
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    expect(run.status).toBe("queued");

    const claimed = await claimRun(db, "worker-a", 60_000);
    expect(claimed?._id?.toHexString()).toBe(run._id?.toHexString());
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(1);

    // Nothing else to claim while the lease is live.
    expect(await claimRun(db, "worker-b", 60_000)).toBeNull();

    expect(await heartbeat(db, run._id as ObjectId, "worker-a", 60_000)).toBe(true);
    expect(await heartbeat(db, run._id as ObjectId, "worker-b", 60_000)).toBe(false);

    await completeRun(db, run._id as ObjectId);
    const done = await db.runs.findOne({ _id: run._id });
    expect(done?.status).toBe("succeeded");
  });

  it("expired lease is reclaimable by another worker", async () => {
    const article = await makeArticle("q-lease");
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const first = await claimRun(db, "worker-a", -1); // lease already expired
    expect(first?._id?.toHexString()).toBe(run._id?.toHexString());

    const reclaimed = await claimRun(db, "worker-b", 60_000);
    expect(reclaimed?._id?.toHexString()).toBe(run._id?.toHexString());
    expect(reclaimed?.workerId).toBe("worker-b");
    expect(reclaimed?.attempts).toBe(2);
    await completeRun(db, run._id as ObjectId);
  });

  it("a reclaimed run resumes at the phase it was in, not where it was queued from", async () => {
    const article = await makeArticle("q-reclaim-phase");
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    const first = await claimRun(db, "worker-a", -1); // worker-a dies mid-phase: lease already expired
    expect(first?.fromStage).toBe("research");
    await setRunPhase(db, run._id as ObjectId, "hdcp");

    const reclaimed = await claimRun(db, "worker-b", 60_000);
    expect(reclaimed?._id?.toHexString()).toBe(run._id?.toHexString());
    expect(reclaimed?.fromStage).toBe("hdcp");
    expect(reclaimed?.attempts).toBe(2); // a crash still counts, so a crashing phase can't loop forever
    await completeRun(db, run._id as ObjectId);
  });

  it("a fresh claim keeps fromStage even when a stale currentPhase is present", async () => {
    const article = await makeArticle("q-fresh-claim");
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId, fromStage: "outline" });
    await db.runs.updateOne({ _id: run._id }, { $set: { currentPhase: "edit" } });
    const claimed = await claimRun(db, "worker-a", 60_000);
    expect(claimed?.fromStage).toBe("outline");
    await completeRun(db, run._id as ObjectId);
  });

  it("releaseRun hands a run back at its current phase with the attempt refunded", async () => {
    const article = await makeArticle("q-release");
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    await claimRun(db, "worker-a", 60_000);
    await setRunPhase(db, run._id as ObjectId, "edit");

    expect(await releaseRun(db, run._id as ObjectId, "worker-b")).toBeNull(); // not the lease holder
    const released = await releaseRun(db, run._id as ObjectId, "worker-a");
    expect(released?.status).toBe("queued");
    expect(released?.fromStage).toBe("edit");
    expect(released?.attempts).toBe(0);
    expect(released?.workerId).toBeUndefined();
    expect(released?.leaseUntil).toBeUndefined();
    expect(await heartbeat(db, run._id as ObjectId, "worker-a", 60_000)).toBe(false);

    const next = await claimRun(db, "worker-c", 60_000);
    expect(next?._id?.toHexString()).toBe(run._id?.toHexString());
    expect(next?.fromStage).toBe("edit");
    expect(next?.attempts).toBe(1);
    await completeRun(db, run._id as ObjectId);
  });

  it("failRun requeues with resume stage until maxAttempts, then fails", async () => {
    const article = await makeArticle("q-retry");
    const run = await enqueueRun(db, {
      companyId: "testco",
      articleId: article._id as ObjectId,
      maxAttempts: 2,
    });
    await claimRun(db, "worker-a", 60_000);

    const first = await failRun(db, run._id as ObjectId, "boom", "write");
    expect(first).toBe("requeued");
    let doc = await db.runs.findOne({ _id: run._id });
    expect(doc?.status).toBe("queued");
    expect(doc?.fromStage).toBe("write");

    await claimRun(db, "worker-a", 60_000);
    const second = await failRun(db, run._id as ObjectId, "boom again", "write");
    expect(second).toBe("failed");
    doc = await db.runs.findOne({ _id: run._id });
    expect(doc?.status).toBe("failed");
  });

  it("event seq is ordered and unique per run", async () => {
    const article = await makeArticle("q-events");
    const run = await enqueueRun(db, { companyId: "testco", articleId: article._id as ObjectId });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        emitEvent(db, {
          companyId: "testco",
          runId: run._id as ObjectId,
          articleId: article._id as ObjectId,
          type: "phase.progress",
          message: `event ${i}`,
        }),
      ),
    );
    const events = await eventsAfter(db, run._id as ObjectId, 0);
    expect(events).toHaveLength(10);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const tail = await eventsAfter(db, run._id as ObjectId, 7);
    expect(tail.map((e) => e.seq)).toEqual([8, 9, 10]);
  });
});
