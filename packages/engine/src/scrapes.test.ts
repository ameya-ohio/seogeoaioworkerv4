import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type EngineDb } from "./db.js";
import { buildCompetitorGapDigest } from "./competitors.js";
import {
  InvalidScrapeUrlError,
  claimScrapeRun,
  completeScrapeRun,
  emitScrapeEvent,
  enqueueScrapeRun,
  failScrapeRun,
  heartbeatScrape,
  latestScrapesByDomain,
  resetScrapeStages,
  saveScrapeStage,
  scrapeDomainFromUrl,
  scrapeEventsAfter,
} from "./dal/scrapes.js";
import type { ScrapeDoc, TopicIndexJson } from "./scrape/types.js";

function fakeTopicIndex(overrides?: Partial<TopicIndexJson>): TopicIndexJson {
  return {
    corpus: {
      manifest: "manifest.json",
      article_count: 42,
      total_words: 63000,
      avg_words_per_article: 1500,
      generated_at: "2026-09-21T00:00:00+00:00",
    },
    slug_clusters: [
      { label: "how-to", count: 20, slugs: ["how-to-a", "how-to-b"] },
      { label: "tools & software", count: 12, slugs: ["best-tools"] },
    ],
    top_topics: [
      {
        term: "cold email",
        df: 30,
        total_count: 400,
        score: 900,
        sample_articles: [{ slug: "cold-email-guide", title: "The Cold Email Guide", count: 40 }],
      },
      {
        term: "ai sdr",
        df: 12,
        total_count: 150,
        score: 500,
        sample_articles: [{ slug: "ai-sdr", title: "What Is an AI SDR?", count: 22 }],
      },
    ],
    articles: [],
    ...overrides,
  };
}

describe("scrapeDomainFromUrl", () => {
  it("strips www. and lowercases", () => {
    expect(scrapeDomainFromUrl("https://WWW.Artisan.co/blog")).toBe("artisan.co");
    expect(scrapeDomainFromUrl("http://saporo.io/resources/blog")).toBe("saporo.io");
  });
  it("rejects non-http and malformed URLs", () => {
    expect(() => scrapeDomainFromUrl("ftp://x.com/blog")).toThrow(InvalidScrapeUrlError);
    expect(() => scrapeDomainFromUrl("not a url")).toThrow(InvalidScrapeUrlError);
  });
});

describe("buildCompetitorGapDigest (6.3)", () => {
  const base = (over?: Partial<ScrapeDoc>): ScrapeDoc => ({
    companyId: "co",
    url: "https://www.artisan.co/blog",
    domain: "artisan.co",
    status: "succeeded",
    stage: "done",
    completedStages: ["scrape", "index", "store"],
    options: { useBrowser: true, withImages: false },
    attempts: 1,
    maxAttempts: 2,
    eventSeq: 0,
    topicIndex: fakeTopicIndex(),
    queuedAt: new Date(),
    endedAt: new Date("2026-09-21T10:00:00Z"),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  it("returns empty when no scrape has a topic index", () => {
    expect(buildCompetitorGapDigest([])).toBe("");
    expect(buildCompetitorGapDigest([base({ topicIndex: undefined as never })])).toBe("");
  });

  it("renders per-competitor coverage with topics, mix, and samples", () => {
    const digest = buildCompetitorGapDigest([base()]);
    expect(digest).toContain("## artisan.co — 42 posts");
    expect(digest).toContain("Source blog: https://www.artisan.co/blog");
    expect(digest).toContain("how-to (20)");
    expect(digest).toContain("cold email (30)");
    expect(digest).toContain('"The Cold Email Guide"');
    expect(digest).toContain("NOT a");
  });

  it("honors trimming options (no samples, capped topics)", () => {
    const digest = buildCompetitorGapDigest([base()], { maxTopics: 1, maxSampledTopics: 0 });
    expect(digest).toContain("cold email (30)");
    expect(digest).not.toContain("ai sdr");
    expect(digest).not.toContain("representative posts");
  });

  it("excludes the company's own domains", () => {
    const own = base({ domain: "saporo.io", url: "https://www.saporo.io/resources/blog" });
    expect(buildCompetitorGapDigest([own, base()], { excludeDomains: ["saporo.io"] })).not.toContain(
      "saporo.io",
    );
    expect(buildCompetitorGapDigest([own], { excludeDomains: ["saporo.io"] })).toBe("");
  });
});

describe("ownDomainsFromConfig", () => {
  it("extracts company domain + blog hosts, www-stripped", async () => {
    const { ownDomainsFromConfig } = await import("./competitors.js");
    const domains = ownDomainsFromConfig({
      company: { domain: "https://www.saporo.io" },
      blog: {
        base_url: "https://www.saporo.io/resources/blog",
        canonical_pattern: "https://saporo.io/resources/blog/{slug}",
      },
    });
    expect(domains).toEqual(["saporo.io"]);
    expect(ownDomainsFromConfig(undefined)).toEqual([]);
  });
});

describe("scrape queue DAL (6.1)", () => {
  let mongod: MongoMemoryServer;
  let db: EngineDb;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    db = await connect(mongod.getUri(), "scrape_queue_test");
  }, 120_000);

  afterAll(async () => {
    await db?.close();
    await mongod?.stop();
  });

  it("enqueue → claim → heartbeat → stages → complete", async () => {
    const doc = await enqueueScrapeRun(db, {
      companyId: "co",
      url: "https://www.example.com/blog",
      options: { useBrowser: true, maxArticles: 5 },
    });
    expect(doc.domain).toBe("example.com");
    expect(doc.options).toEqual({ useBrowser: true, withImages: false, maxArticles: 5 });

    const claimed = await claimScrapeRun(db, "w1", 60_000);
    expect(claimed?._id?.toHexString()).toBe(doc._id?.toHexString());
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(1);

    expect(await heartbeatScrape(db, doc._id as never, "w1", 60_000)).toBe(true);
    expect(await heartbeatScrape(db, doc._id as never, "other-worker", 60_000)).toBe(false);

    await saveScrapeStage(db, doc._id as never, "scrape", "index", {});
    await saveScrapeStage(db, doc._id as never, "index", "store", {
      topicIndex: fakeTopicIndex(),
      corpus: { articleCount: 42, totalWords: 63000, avgWordsPerArticle: 1500 },
    });
    await completeScrapeRun(db, doc._id as never);

    const done = await db.scrapes.findOne({ _id: doc._id });
    expect(done?.status).toBe("succeeded");
    expect(done?.stage).toBe("done");
    expect(done?.completedStages).toEqual(["scrape", "index"]);
    expect(done?.corpus?.articleCount).toBe(42);
    expect(done?.leaseUntil).toBeUndefined();

    // Nothing left to claim.
    expect(await claimScrapeRun(db, "w1", 60_000)).toBeNull();
  });

  it("fail below maxAttempts requeues and keeps completed stages; reset clears them", async () => {
    const doc = await enqueueScrapeRun(db, {
      companyId: "co",
      url: "https://blog.retry.dev/posts",
      maxAttempts: 2,
    });
    await claimScrapeRun(db, "w1", 60_000);
    await saveScrapeStage(db, doc._id as never, "scrape", "index", {});

    expect(await failScrapeRun(db, doc._id as never, "boom")).toBe("requeued");
    let fresh = await db.scrapes.findOne({ _id: doc._id });
    expect(fresh?.status).toBe("queued");
    expect(fresh?.completedStages).toEqual(["scrape"]);
    expect(fresh?.error).toBe("boom");

    await resetScrapeStages(db, doc._id as never);
    fresh = await db.scrapes.findOne({ _id: doc._id });
    expect(fresh?.completedStages).toEqual([]);
    expect(fresh?.stage).toBe("scrape");

    await claimScrapeRun(db, "w1", 60_000);
    expect(await failScrapeRun(db, doc._id as never, "boom again")).toBe("failed");
    fresh = await db.scrapes.findOne({ _id: doc._id });
    expect(fresh?.status).toBe("failed");
  });

  it("event stream is per-scrape with monotonic seq", async () => {
    const doc = await enqueueScrapeRun(db, { companyId: "co", url: "https://ev.example.com/blog" });
    await emitScrapeEvent(db, {
      companyId: "co",
      scrapeId: doc._id as never,
      type: "stage.progress",
      message: "hello",
    });
    const events = await scrapeEventsAfter(db, doc._id as never);
    expect(events.map((e) => e.seq)).toEqual([1, 2]); // queued + progress
    expect(events[1]?.message).toBe("hello");
    const later = await scrapeEventsAfter(db, doc._id as never, 1);
    expect(later).toHaveLength(1);
  });

  it("latestScrapesByDomain returns the freshest succeeded scrape per domain", async () => {
    const mk = async (url: string, createdAt: Date, status: "succeeded" | "failed") => {
      const doc = await enqueueScrapeRun(db, { companyId: "co2", url });
      await db.scrapes.updateOne(
        { _id: doc._id },
        { $set: { status, createdAt, topicIndex: fakeTopicIndex() } },
      );
      return doc;
    };
    await mk("https://a.com/blog", new Date("2026-01-01"), "succeeded");
    const newerA = await mk("https://www.a.com/blog", new Date("2026-06-01"), "succeeded");
    await mk("https://a.com/blog", new Date("2026-08-01"), "failed");
    await mk("https://b.com/blog", new Date("2026-03-01"), "succeeded");

    const latest = await latestScrapesByDomain(db, "co2");
    expect(latest).toHaveLength(2);
    const a = latest.find((s) => s.domain === "a.com");
    expect(a?._id?.toHexString()).toBe(newerA._id?.toHexString());
    expect(latest.some((s) => s.domain === "b.com")).toBe(true);
  });
});
