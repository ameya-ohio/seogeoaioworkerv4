import type { ObjectId } from "mongodb";

/**
 * Domain types for the competitive module (roadmap Phase 6). A scrape run is
 * a lease-claimed job (same queue semantics as cluster runs) that shells out
 * to the blogscraper/ CLI, builds the TF-IDF topic index, and lands corpus +
 * indexes in storage with the parsed topic index on the scrape doc itself.
 */

export const SCRAPE_STAGES = ["scrape", "index", "store"] as const;
export type ScrapeStage = (typeof SCRAPE_STAGES)[number];

export type ScrapeStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface ScrapeOptions {
  /** Playwright/Chromium discovery + extraction (JS-rendered sites). */
  useBrowser: boolean;
  /** Stop after N new articles (testing / partial crawls). */
  maxArticles?: number;
  /** Header images are dead weight for gap analysis — off by default. */
  withImages: boolean;
}

/** Counts derived from the scraper's manifest.json after the crawl. */
export interface ScrapeCounts {
  discovered: number;
  scrapedOk: number;
  scrapedPartial: number;
  scrapedFailed: number;
  imagesDownloaded: number;
}

/**
 * Parsed topic_index.json, exactly as blogscraper/tools/build_topic_index.py
 * emits it (snake_case preserved — the raw artifact is the contract; the
 * engine never re-shapes it, so the stored JSON always matches the file in
 * storage byte-for-byte in structure).
 */
export interface TopicIndexJson {
  corpus: {
    manifest: string;
    article_count: number;
    total_words: number;
    avg_words_per_article: number;
    generated_at: string;
  };
  slug_clusters: { label: string; count: number; slugs: string[] }[];
  top_topics: {
    term: string;
    df: number;
    total_count: number;
    score: number;
    sample_articles: { slug: string; title: string; count: number }[];
  }[];
  articles: {
    url: string;
    title: string;
    slug: string;
    word_count: number;
    top_keywords: string[];
    slug_cluster: string;
    text_path?: string | null;
    image_path?: string | null;
  }[];
}

export interface ScrapeStorageInfo {
  /** All files for this scrape live under this key prefix. */
  prefix: string;
  /** Number of objects uploaded. */
  files: number;
  manifestKey: string;
  topicIndexJsonKey: string;
  topicIndexMdKey: string;
}

export interface ScrapeDoc {
  _id?: ObjectId;
  companyId: string;
  /** The blog index URL handed to the scraper. */
  url: string;
  /** Domain root (www.-stripped hostname) — the competitor's identity. */
  domain: string;
  status: ScrapeStatus;
  stage: ScrapeStage | "done";
  completedStages: ScrapeStage[];
  options: ScrapeOptions;
  attempts: number;
  maxAttempts: number;
  workerId?: string;
  leaseUntil?: Date;
  eventSeq: number;
  counts?: ScrapeCounts;
  corpus?: { articleCount: number; totalWords: number; avgWordsPerArticle: number };
  topicIndex?: TopicIndexJson;
  storage?: ScrapeStorageInfo;
  /** Set when the corpus was backfilled from disk instead of a live crawl. */
  imported?: boolean;
  error?: string;
  queuedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ScrapeEventType =
  | "scrape.queued"
  | "scrape.started"
  | "scrape.succeeded"
  | "scrape.failed"
  | "scrape.retried"
  | "stage.started"
  | "stage.progress"
  | "stage.succeeded"
  | "stage.failed";

export interface ScrapeEventDoc {
  _id?: ObjectId;
  companyId: string;
  scrapeId: ObjectId;
  seq: number;
  ts: Date;
  type: ScrapeEventType;
  message: string;
  data?: Record<string, unknown>;
}
