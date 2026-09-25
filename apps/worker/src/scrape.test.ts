import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  LocalStorage,
  claimScrapeRun,
  connect,
  createArticle,
  enqueueScrapeRun,
  scrapeEventsAfter,
  type EngineDb,
} from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";
import { phaseDefs } from "./phases.js";
import {
  PythonScraperCli,
  importScrapedCorpus,
  runScrape,
  type ScrapeDeps,
  type ScraperCli,
} from "./scrapeRunner.js";
import { materializeCompetitorGaps } from "./workspace.js";

const REAL_REPO = resolve(__dirname, "..", "..", "..");

/**
 * Fake crawler, real math: the fake writes a deterministic corpus folder in
 * blogscraper's on-disk layout; the topic index is then built by the REAL
 * stdlib-only build_topic_index.py (the Phase-2 fake-agents/real-gates
 * pattern). Terms must appear in >= 5 documents to clear the indexer's
 * df floor, hence the repeated phrase below.
 */
const SLUGS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];

function corpusDoc(slug: string, withPhrase: boolean): string {
  const phrase = withPhrase
    ? "Cold email deliverability matters. Cold email deliverability drives replies. Improve cold email deliverability with warmup routines."
    : "General marketing musings without the repeated wording.";
  return [
    "---",
    `title: "Post ${slug}"`,
    `url: "https://test-competitor.com/blog/${slug}"`,
    'published: "2026-01-01T00:00:00+00:00"',
    "---",
    "",
    `# Post ${slug}`,
    "",
    phrase,
    "",
    "Outbound teams measure pipeline quality with meeting conversion benchmarks and reply tracking across sequences.",
  ].join("\n");
}

class FakeScraperCli implements ScraperCli {
  constructor(
    private readonly real: PythonScraperCli,
    public failScrape = false,
  ) {}
  scrapeCalls = 0;

  async scrape(params: Parameters<ScraperCli["scrape"]>[0]): Promise<void> {
    this.scrapeCalls++;
    if (this.failScrape) throw new Error("simulated crawl failure");
    params.onLine("=== discovery ===");
    params.onLine("discovery source=sitemap urls=6");
    const blogDir = join(params.workDir, "test-competitor.com", "blog");
    mkdirSync(join(blogDir, "blog_text"), { recursive: true });
    const articles = SLUGS.map((slug, i) => {
      writeFileSync(join(blogDir, "blog_text", `${slug}.md`), corpusDoc(slug, i < 5));
      return {
        url: `https://test-competitor.com/blog/${slug}`,
        title: `Post ${slug}`,
        text_path: `blog_text/${slug}.md`,
        image_path: null,
        image_url: null,
        published: "2026-01-01T00:00:00+00:00",
        date_scraped: "2026-09-21T00:00:00+00:00",
        status: "ok",
        error: null,
      };
    });
    writeFileSync(
      join(blogDir, "manifest.json"),
      JSON.stringify(
        {
          target: params.url,
          domain_root: "test-competitor.com",
          blog_path: "/blog",
          generated_at: "2026-09-21T00:00:00+00:00",
          articles,
        },
        null,
        2,
      ),
    );
    params.onLine("scraped (ok):         6");
  }

  async buildIndex(params: Parameters<ScraperCli["buildIndex"]>[0]): Promise<void> {
    return this.real.buildIndex(params);
  }
}

let mongod: MongoMemoryServer;
let db: EngineDb;
let repoRoot: string;
let cfg: WorkerConfig;
let deps: ScrapeDeps;
let fake: FakeScraperCli;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  db = await connect(mongod.getUri(), "scrape_e2e_test");

  repoRoot = mkdtempSync(join(tmpdir(), "blogagent-scrape-"));
  for (const dir of ["scripts", "standards", "templates", "agents", "config", "blogscraper"]) {
    symlinkSync(join(REAL_REPO, dir), join(repoRoot, dir));
  }
  writeFileSync(join(repoRoot, "CLAUDE.md"), "# test repo\n");
  mkdirSync(join(repoRoot, "articles"));

  cfg = {
    repoRoot,
    mongoUri: mongod.getUri(),
    mongoDb: "scrape_e2e_test",
    workerId: "test-worker",
    concurrency: 1,
    pollIntervalMs: 50,
    leaseMs: 60_000,
    heartbeatMs: 60_000,
    maxRunAttempts: 2,
    maxGateAttempts: 2,
    models: { research: "m", outline: "m", write: "m", edit: "m", schema: "m", design: "m" },
    maxTurns: { research: 1, outline: 1, write: 1, edit: 1, schema: 1, design: 1 },
    verifierModel: "fake-verifier",
    plan: { enrichModel: "fake-enrich", concurrency: 2, maxAttempts: 2 },
    schedule: { enabled: false, pollIntervalMs: 60000, dryRun: false },
    cluster: {
      mainModel: "m",
      fanoutModel: "f",
      k: 5,
      maxValidations: 5,
      serpChecksPerTheme: 1,
      maxAttempts: 2,
    },
    scrape: { maxAttempts: 2, timeoutMs: 120_000 },
    pythonBin: "python3",
    headerGenPython: "python3",
    scraperPython: "python3",
  };
  fake = new FakeScraperCli(new PythonScraperCli("python3", repoRoot, 120_000));
  deps = {
    db,
    cfg,
    storage: new LocalStorage(join(repoRoot, "storage")),
    scraper: fake,
    log: () => {},
  };
}, 180_000);

afterAll(async () => {
  await db?.close();
  await mongod?.stop();
  if (repoRoot) rmSync(repoRoot, { recursive: true, force: true });
});

describe("scrape runner E2E (6.1, fake crawler + real indexer)", () => {
  it("runs crawl → index → store and persists corpus + topic index", async () => {
    await enqueueScrapeRun(db, {
      companyId: "co",
      url: "https://www.test-competitor.com/blog",
      options: { useBrowser: false },
    });
    const claimed = await claimScrapeRun(db, cfg.workerId, cfg.leaseMs);
    expect(claimed).toBeTruthy();
    await runScrape(deps, claimed as never);

    const done = await db.scrapes.findOne({ domain: "test-competitor.com", status: "succeeded" });
    expect(done).toBeTruthy();
    expect(done?.stage).toBe("done");
    expect(done?.counts).toMatchObject({ discovered: 6, scrapedOk: 6, scrapedFailed: 0 });
    expect(done?.corpus?.articleCount).toBe(6);
    // The real TF-IDF indexer found the repeated phrase.
    const terms = done?.topicIndex?.top_topics.map((t) => t.term) ?? [];
    expect(terms.some((t) => t.includes("cold email") || t.includes("deliverability"))).toBe(true);

    // Storage holds manifest + both index files + the 6 text files.
    const prefix = done?.storage?.prefix as string;
    expect(prefix).toMatch(/^competitive\//);
    const stored = await deps.storage.get(`${prefix}/topic_index.md`);
    expect(stored.toString("utf-8")).toContain("Topic & keyword index");
    const manifest = JSON.parse((await deps.storage.get(`${prefix}/manifest.json`)).toString("utf-8"));
    expect(manifest.articles).toHaveLength(6);
    const alpha = await deps.storage.get(`${prefix}/blog_text/alpha.md`);
    expect(alpha.toString("utf-8")).toContain("Post alpha");
    expect(done?.storage?.files).toBe(3 + 6); // manifest + 2 indexes + 6 texts (no images, no log)

    const events = await scrapeEventsAfter(db, done?._id as never);
    const types = events.map((e) => e.type);
    expect(types).toContain("scrape.started");
    expect(types).toContain("stage.succeeded");
    expect(types).toContain("scrape.succeeded");
  }, 120_000);

  it("materializes competitor-gaps.md for the Researcher and gates the prompt line (6.3)", async () => {
    const article = await createArticle(db, {
      companyId: "co",
      topic: "outbound benchmarks",
      slug: "outbound-benchmarks",
      folder: "2026-09-21-outbound-benchmarks",
    });
    const wrote = await materializeCompetitorGaps(db, cfg, article);
    expect(wrote).toBe(true);
    const digest = await readFile(
      join(repoRoot, "articles", article.folder, "competitor-gaps.md"),
      "utf-8",
    );
    expect(digest).toContain("## test-competitor.com — 6 posts");

    const defs = phaseDefs(cfg);
    const withGaps = defs.research.buildPrompt({
      article,
      cfg,
      companyName: "Co",
      hasCompetitorGaps: true,
    });
    expect(withGaps).toContain("competitor-gaps.md");
    expect(withGaps).toContain("never a citable source");
    const without = defs.research.buildPrompt({ article, cfg, companyName: "Co" });
    expect(without).not.toContain("competitor-gaps.md");

    // No corpora for an unknown company → file removed, flag false.
    const other = await createArticle(db, {
      companyId: "other-co",
      topic: "x",
      slug: "x",
      folder: "2026-09-21-x",
    });
    mkdirSync(join(repoRoot, "articles", other.folder), { recursive: true });
    await writeFile(join(repoRoot, "articles", other.folder, "competitor-gaps.md"), "stale");
    expect(await materializeCompetitorGaps(db, cfg, other)).toBe(false);
    expect(existsSync(join(repoRoot, "articles", other.folder, "competitor-gaps.md"))).toBe(false);
  }, 60_000);

  it("failed crawl requeues once, then fails permanently", async () => {
    const failing = new FakeScraperCli(new PythonScraperCli("python3", repoRoot, 120_000), true);
    const failDeps: ScrapeDeps = { ...deps, scraper: failing };
    const doc = await enqueueScrapeRun(db, {
      companyId: "co",
      url: "https://broken.example.com/blog",
      maxAttempts: 2,
    });
    const first = await claimScrapeRun(db, cfg.workerId, cfg.leaseMs);
    await expect(runScrape(failDeps, first as never)).rejects.toThrow("simulated crawl failure");
    let fresh = await db.scrapes.findOne({ _id: doc._id });
    expect(fresh?.status).toBe("queued");

    const second = await claimScrapeRun(db, cfg.workerId, cfg.leaseMs);
    await expect(runScrape(failDeps, second as never)).rejects.toThrow("simulated crawl failure");
    fresh = await db.scrapes.findOne({ _id: doc._id });
    expect(fresh?.status).toBe("failed");
    const events = await scrapeEventsAfter(db, doc._id as never);
    expect(events.map((e) => e.type)).toContain("scrape.retried");
    expect(events.map((e) => e.type)).toContain("scrape.failed");
  }, 60_000);

  it("importScrapedCorpus backfills an existing folder without crawling", async () => {
    // Reuse the corpus the first test's fake crawl left on disk.
    const scrapeDoc = await db.scrapes.findOne({ domain: "test-competitor.com", status: "succeeded" });
    const dir = join(
      repoRoot,
      "outputs",
      "scrapes",
      (scrapeDoc?._id as { toHexString(): string }).toHexString(),
      "test-competitor.com",
      "blog",
    );
    const before = fake.scrapeCalls;
    const imported = await importScrapedCorpus(deps, {
      dir,
      url: "https://www.test-competitor.com/blog",
      companyId: "import-co",
    });
    expect(fake.scrapeCalls).toBe(before);
    expect(imported.status).toBe("succeeded");
    expect(imported.imported).toBe(true);
    expect(imported.corpus?.articleCount).toBe(6);
    expect(imported.storage?.prefix).toMatch(/^competitive\//);
  }, 120_000);
});
