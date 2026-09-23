import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  completeScrapeRun,
  emitScrapeEvent,
  enqueueScrapeRun,
  failScrapeRun,
  resetScrapeStages,
  saveScrapeStage,
  type EngineDb,
  type ScrapeCounts,
  type ScrapeDoc,
  type ScrapeStage,
  type Storage,
  type TopicIndexJson,
} from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";

/**
 * Competitive scrape runner (roadmap 6.1): shells out to the blogscraper/
 * CLI (crawl → corpus folder), builds the TF-IDF topic index, then persists
 * the parsed index on the scrape doc and the corpus files to storage under
 * competitive/<scrapeId>/. Staged + resumable like the cluster runner; the
 * on-disk workspace under outputs/scrapes/<id> is scratch (blogscraper's own
 * manifest gives cheap same-machine resume; a fresh container re-crawls).
 */

export interface ScraperCli {
  scrape(params: {
    url: string;
    workDir: string;
    useBrowser: boolean;
    maxArticles?: number;
    withImages: boolean;
    onLine: (line: string) => void;
  }): Promise<void>;
  buildIndex(params: { manifestPath: string; onLine: (line: string) => void }): Promise<void>;
}

export class PythonScraperCli implements ScraperCli {
  constructor(
    private readonly python: string,
    private readonly repoRoot: string,
    private readonly timeoutMs: number,
  ) {}

  async scrape(params: {
    url: string;
    workDir: string;
    useBrowser: boolean;
    maxArticles?: number;
    withImages: boolean;
    onLine: (line: string) => void;
  }): Promise<void> {
    const args = [
      join(this.repoRoot, "blogscraper", "scrape_blog.py"),
      params.url,
      "--output-dir",
      params.workDir,
    ];
    if (params.useBrowser) args.push("--use-browser");
    if (params.maxArticles && params.maxArticles > 0) {
      args.push("--max-articles", String(params.maxArticles));
    }
    if (!params.withImages) args.push("--no-images");
    await runProcess(this.python, args, this.repoRoot, this.timeoutMs, params.onLine);
  }

  async buildIndex(params: {
    manifestPath: string;
    onLine: (line: string) => void;
  }): Promise<void> {
    const args = [
      join(this.repoRoot, "blogscraper", "tools", "build_topic_index.py"),
      params.manifestPath,
    ];
    await runProcess(this.python, args, this.repoRoot, this.timeoutMs, params.onLine);
  }
}

function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const tail: string[] = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const feed = (() => {
      const buffers: Record<string, string> = { out: "", err: "" };
      return (which: "out" | "err", chunk: Buffer) => {
        buffers[which] += chunk.toString("utf-8");
        let idx: number;
        while ((idx = (buffers[which] as string).indexOf("\n")) >= 0) {
          const line = (buffers[which] as string).slice(0, idx).trimEnd();
          buffers[which] = (buffers[which] as string).slice(idx + 1);
          if (!line) continue;
          tail.push(line);
          if (tail.length > 30) tail.shift();
          onLine(line);
        }
      };
    })();

    child.stdout.on("data", (c: Buffer) => feed("out", c));
    child.stderr.on("data", (c: Buffer) => feed("err", c));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${basename(cmd)} failed to start: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${basename(args[0] ?? cmd)} timed out after ${timeoutMs}ms`));
      } else if (code !== 0) {
        reject(
          new Error(
            `${basename(args[0] ?? cmd)} exited ${code}. Last output:\n${tail.slice(-12).join("\n")}`,
          ),
        );
      } else {
        resolvePromise();
      }
    });
  });
}

export interface ScrapeDeps {
  db: EngineDb;
  cfg: WorkerConfig;
  storage: Storage;
  scraper: ScraperCli;
  log: (msg: string) => void;
}

export function scrapeWorkDir(cfg: WorkerConfig, scrape: ScrapeDoc): string {
  return join(cfg.repoRoot, "outputs", "scrapes", scrape._id?.toHexString() ?? "unknown");
}

/** Shallowest manifest.json under root (the scraper nests domain/blog-path). */
export function findManifest(root: string): string | null {
  if (!existsSync(root)) return null;
  const entries = readdirSync(root, { recursive: true, encoding: "utf-8" });
  const hits = entries
    .filter((p) => basename(p) === "manifest.json")
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  return hits[0] ? join(root, hits[0]) : null;
}

interface ManifestEntry {
  url?: string;
  title?: string;
  text_path?: string | null;
  image_path?: string | null;
  status?: string;
}

function countsFromManifest(entries: ManifestEntry[]): ScrapeCounts {
  const by = (status: string) => entries.filter((e) => e.status === status).length;
  return {
    discovered: entries.length,
    scrapedOk: by("ok"),
    scrapedPartial: by("partial"),
    scrapedFailed: by("failed"),
    imagesDownloaded: entries.filter((e) => e.image_path).length,
  };
}

/** Keep the on-doc copy of a huge index sane; storage holds the full file. */
const MAX_DOC_INDEX_BYTES = 4 * 1024 * 1024;
function trimTopicIndexForDoc(idx: TopicIndexJson): TopicIndexJson {
  if (JSON.stringify(idx).length <= MAX_DOC_INDEX_BYTES) return idx;
  return { ...idx, articles: idx.articles.slice(0, 1000) };
}

const CONTENT_TYPES: Record<string, string> = {
  json: "application/json",
  md: "text/markdown; charset=utf-8",
  log: "text/plain; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
};

function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

async function emit(
  deps: ScrapeDeps,
  scrape: ScrapeDoc,
  type: Parameters<typeof emitScrapeEvent>[1]["type"],
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const scrapeId = scrape._id;
  if (!scrapeId) return;
  await emitScrapeEvent(deps.db, {
    companyId: scrape.companyId,
    scrapeId,
    type,
    message,
    ...(data ? { data } : {}),
  });
}

/** Scraper log lines worth surfacing in the UI event feed (the rest go to the worker log). */
const PROGRESS_LINE = /(=== |discovery source|discovered URLs|scraped \(|images downloaded|skipped \(in manifest\)|corpus: |topics: )/;

function lineHandler(deps: ScrapeDeps, scrape: ScrapeDoc): (line: string) => void {
  return (line: string) => {
    deps.log(`[scrape ${scrape.domain}] ${line.slice(0, 300)}`);
    if (PROGRESS_LINE.test(line)) {
      void emit(deps, scrape, "stage.progress", line.slice(0, 500));
    }
  };
}

async function stageScrape(deps: ScrapeDeps, scrape: ScrapeDoc, workDir: string): Promise<string> {
  await mkdir(workDir, { recursive: true });
  await deps.scraper.scrape({
    url: scrape.url,
    workDir,
    useBrowser: scrape.options.useBrowser,
    ...(scrape.options.maxArticles ? { maxArticles: scrape.options.maxArticles } : {}),
    withImages: scrape.options.withImages,
    onLine: lineHandler(deps, scrape),
  });
  const manifestPath = findManifest(workDir);
  if (!manifestPath) {
    throw new Error("scraper finished but wrote no manifest.json — nothing was discovered");
  }
  const entries = (
    JSON.parse(await readFile(manifestPath, "utf-8")) as { articles?: ManifestEntry[] }
  ).articles ?? [];
  const counts = countsFromManifest(entries);
  if (counts.scrapedOk + counts.scrapedPartial === 0) {
    throw new Error(
      `scraper saved no article text (${counts.discovered} discovered, all failed) — ` +
        `try ${scrape.options.useBrowser ? "checking the URL" : "the browser option (JS-rendered site?)"}`,
    );
  }
  return manifestPath;
}

async function stageIndex(
  deps: ScrapeDeps,
  scrape: ScrapeDoc,
  manifestPath: string,
): Promise<void> {
  const dir = dirname(manifestPath);
  await deps.scraper.buildIndex({ manifestPath, onLine: lineHandler(deps, scrape) });
  const idx = JSON.parse(await readFile(join(dir, "topic_index.json"), "utf-8")) as TopicIndexJson;
  const entries = (
    JSON.parse(await readFile(manifestPath, "utf-8")) as { articles?: ManifestEntry[] }
  ).articles ?? [];
  const scrapeId = scrape._id;
  if (!scrapeId) throw new Error("scrape has no _id");
  await saveScrapeStage(deps.db, scrapeId, "index", "store", {
    counts: countsFromManifest(entries),
    corpus: {
      articleCount: idx.corpus.article_count,
      totalWords: idx.corpus.total_words,
      avgWordsPerArticle: idx.corpus.avg_words_per_article,
    },
    topicIndex: trimTopicIndexForDoc(idx),
  });
}

async function stageStore(
  deps: ScrapeDeps,
  scrape: ScrapeDoc,
  manifestPath: string,
): Promise<void> {
  const scrapeId = scrape._id;
  if (!scrapeId) throw new Error("scrape has no _id");
  const dir = dirname(manifestPath);
  const prefix = `competitive/${scrapeId.toHexString()}`;
  const put = async (localPath: string, key: string) => {
    const body = await readFile(localPath);
    await deps.storage.put(key, body, contentTypeFor(key));
  };

  let files = 0;
  await put(manifestPath, `${prefix}/manifest.json`);
  files++;
  await put(join(dir, "topic_index.json"), `${prefix}/topic_index.json`);
  files++;
  await put(join(dir, "topic_index.md"), `${prefix}/topic_index.md`);
  files++;

  const entries = (
    JSON.parse(await readFile(manifestPath, "utf-8")) as { articles?: ManifestEntry[] }
  ).articles ?? [];
  for (const entry of entries) {
    if (entry.text_path && existsSync(join(dir, entry.text_path))) {
      await put(join(dir, entry.text_path), `${prefix}/blog_text/${basename(entry.text_path)}`);
      files++;
    }
    if (scrape.options.withImages && entry.image_path && existsSync(join(dir, entry.image_path))) {
      await put(join(dir, entry.image_path), `${prefix}/blog_images/${basename(entry.image_path)}`);
      files++;
    }
  }
  // The scraper's own log lives at the domain root — up to two levels above
  // the blog folder when the blog path is nested (e.g. /resources/blog).
  for (const logPath of [
    join(dir, "scrape.log"),
    join(dirname(dir), "scrape.log"),
    join(dirname(dirname(dir)), "scrape.log"),
  ]) {
    if (existsSync(logPath)) {
      await put(logPath, `${prefix}/scrape.log`);
      files++;
      break;
    }
  }

  await saveScrapeStage(deps.db, scrapeId, "store", "done", {
    storage: {
      prefix,
      files,
      manifestKey: `${prefix}/manifest.json`,
      topicIndexJsonKey: `${prefix}/topic_index.json`,
      topicIndexMdKey: `${prefix}/topic_index.md`,
    },
  });
  await emit(deps, scrape, "stage.progress", `Stored ${files} files under ${prefix}/`);
}

const STAGE_TITLES: Record<ScrapeStage, string> = {
  scrape: "Crawl blog",
  index: "Build topic index",
  store: "Store corpus",
};

export async function runScrape(deps: ScrapeDeps, scrape: ScrapeDoc): Promise<void> {
  const { db } = deps;
  const scrapeId = scrape._id;
  if (!scrapeId) throw new Error("scrape has no _id");
  const workDir = scrapeWorkDir(deps.cfg, scrape);

  await emit(deps, scrape, "scrape.started", `Scrape started (attempt ${scrape.attempts}/${scrape.maxAttempts})`);

  // Resume sanity: completed stages assume the on-disk workspace survived.
  // A fresh container (or cleaned outputs/) means a full re-crawl.
  let completed = new Set<ScrapeStage>(scrape.completedStages);
  let manifestPath = findManifest(workDir);
  if (completed.size > 0 && !manifestPath) {
    await resetScrapeStages(db, scrapeId);
    completed = new Set();
    await emit(deps, scrape, "stage.progress", "Workspace missing on this machine — restarting from the crawl");
  }

  try {
    for (const stage of ["scrape", "index", "store"] as ScrapeStage[]) {
      if (completed.has(stage)) continue;
      await emit(deps, scrape, "stage.started", `Stage ${STAGE_TITLES[stage]} started`, { stage });
      if (stage === "scrape") {
        manifestPath = await stageScrape(deps, scrape, workDir);
        await saveScrapeStage(db, scrapeId, "scrape", "index", {});
      } else {
        if (!manifestPath) throw new Error("no manifest.json in the scrape workspace");
        if (stage === "index") await stageIndex(deps, scrape, manifestPath);
        else await stageStore(deps, scrape, manifestPath);
      }
      await emit(deps, scrape, "stage.succeeded", `Stage ${STAGE_TITLES[stage]} complete`, { stage });
    }
    await completeScrapeRun(db, scrapeId);
    await emit(deps, scrape, "scrape.succeeded", `Scrape of ${scrape.domain} complete`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await emit(deps, scrape, "stage.failed", message.slice(0, 1500), { stage: scrape.stage });
    const disposition = await failScrapeRun(db, scrapeId, message);
    await emit(
      deps,
      scrape,
      disposition === "requeued" ? "scrape.retried" : "scrape.failed",
      disposition === "requeued"
        ? `Scrape requeued after error: ${message.slice(0, 300)}`
        : `Scrape failed permanently: ${message.slice(0, 300)}`,
    );
    throw err;
  }
}

/**
 * Backfill an existing scraped corpus folder (e.g. blogscraper/artisan.co/blog)
 * into Mongo + storage without re-crawling: builds the topic index if the
 * folder lacks one, then runs the normal index/store stages against it.
 */
export async function importScrapedCorpus(
  deps: ScrapeDeps,
  params: { dir: string; url: string; companyId: string },
): Promise<ScrapeDoc> {
  const manifestPath = join(params.dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`no manifest.json in ${params.dir} — not a blogscraper corpus folder`);
  }
  const scrape = await enqueueScrapeRun(deps.db, {
    companyId: params.companyId,
    url: params.url,
    maxAttempts: 1,
  });
  const scrapeId = scrape._id;
  if (!scrapeId) throw new Error("scrape has no _id");
  const now = new Date();
  await deps.db.scrapes.updateOne(
    { _id: scrapeId },
    { $set: { status: "running", workerId: deps.cfg.workerId, attempts: 1, startedAt: now, updatedAt: now } },
  );
  try {
    await saveScrapeStage(deps.db, scrapeId, "scrape", "index", { imported: true });
    await emit(deps, scrape, "stage.progress", `Importing existing corpus from ${params.dir}`);
    await stageIndex(deps, scrape, manifestPath);
    await stageStore(deps, scrape, manifestPath);
    await completeScrapeRun(deps.db, scrapeId);
    await emit(deps, scrape, "scrape.succeeded", `Imported corpus for ${scrape.domain}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failScrapeRun(deps.db, scrapeId, message);
    await emit(deps, scrape, "scrape.failed", `Import failed: ${message.slice(0, 300)}`);
    throw err;
  }
  const fresh = await deps.db.scrapes.findOne({ _id: scrapeId });
  return fresh ?? scrape;
}
