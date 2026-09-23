#!/usr/bin/env node
import { isAbsolute, resolve } from "node:path";
import { ObjectId } from "mongodb";
import {
  DataForSeoClient,
  SlugTakenError,
  acceptSpokeBrief,
  clusterEventsAfter,
  connect,
  dataForSeoConfigFromEnv,
  enqueueArticlePipeline,
  enqueueClusterRun,
  enqueueScrapeRun,
  eventsAfter,
  getThemesForCluster,
  loadCompanyConfig,
  marketFromConfig,
  mongoCostRecorder,
  scrapeEventsAfter,
  storageFromEnv,
  syncCompany,
  type CompanyConfig,
  type EngineDb,
  type Stage,
  type WorkStage,
} from "@blogagent/engine";
import { SdkAgentInvoker } from "./agentRunner.js";
import { startClusterQueue } from "./clusterQueue.js";
import type { ClusterDeps } from "./clusterRunner.js";
import { loadWorkerConfig, type WorkerConfig } from "./config.js";
import { importArticles } from "./importer.js";
import { AnthropicLlmClient, geminiObserverFromEnv } from "./llm.js";
import type { PipelineDeps } from "./pipeline.js";
import { LiveCitationVerifier, LiveLinkChecker } from "./quality.js";
import { installSignalHandlers, startQueue, type QueueController } from "./queue.js";
import { startScrapeQueue } from "./scrapeQueue.js";
import { PythonScraperCli, importScrapedCorpus, type ScrapeDeps } from "./scrapeRunner.js";

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

function parseFlags(argv: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function setup(): Promise<{
  cfg: WorkerConfig;
  db: EngineDb;
  companyId: string;
  companyName: string;
  company: CompanyConfig;
}> {
  const cfg = loadWorkerConfig();
  const company = loadCompanyConfig(cfg.repoRoot, cfg.companyConfigPath);
  const db = await connect(cfg.mongoUri, cfg.mongoDb);
  await syncCompany(db, {
    companyId: company.companyId,
    name: company.companyName,
    config: company.raw,
    configPath: company.path,
  });
  return { cfg, db, companyId: company.companyId, companyName: company.companyName, company };
}

function clusterDeps(
  cfg: WorkerConfig,
  db: EngineDb,
  company: CompanyConfig,
): ClusterDeps {
  const dfsCfg = dataForSeoConfigFromEnv();
  return {
    db,
    cfg,
    llm: new AnthropicLlmClient(),
    observer: geminiObserverFromEnv(),
    serpClient: dfsCfg ? new DataForSeoClient(dfsCfg, mongoCostRecorder(db, company.companyId)) : null,
    serpSandbox: dfsCfg?.sandbox ?? false,
    market: marketFromConfig(company),
    companyName: company.companyName,
    log,
  };
}

function scrapeDeps(cfg: WorkerConfig, db: EngineDb): ScrapeDeps {
  return {
    db,
    cfg,
    storage: storageFromEnv(cfg.repoRoot),
    scraper: new PythonScraperCli(cfg.scraperPython, cfg.repoRoot, cfg.scrape.timeoutMs),
    log,
  };
}

/** Hosts that count as "internal" for citation/link checks (D34/D35). */
function internalHosts(company: CompanyConfig): string[] {
  const hosts = new Set<string>();
  const domain = String(
    (company.raw["company"] as Record<string, unknown> | undefined)?.["domain"] ?? "",
  ).trim();
  if (domain) hosts.add(domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] as string);
  const blog = company.raw["blog"] as Record<string, unknown> | undefined;
  for (const key of ["base_url", "canonical_pattern"]) {
    const v = String(blog?.[key] ?? "").trim();
    if (!v.startsWith("http")) continue;
    try {
      hosts.add(new URL(v.replace(/\{[^}]+\}/g, "x")).hostname.replace(/^www\./, ""));
    } catch {
      /* ignore malformed */
    }
  }
  return [...hosts];
}

async function cmdStart(argv: string[]): Promise<void> {
  // A transient Mongo blip (laptop sleep, network hiccup) must not kill the
  // worker: the driver retries and leases self-heal. Log and keep running.
  process.on("unhandledRejection", (err) => {
    log(`unhandledRejection (worker continues): ${err instanceof Error ? err.message : err}`);
  });
  process.on("uncaughtException", (err) => {
    log(`uncaughtException (worker continues): ${err.message}`);
  });
  const { flags } = parseFlags(argv);
  const clusterOnly = flags["cluster-only"] === true;
  const pipelineOnly = flags["pipeline-only"] === true;
  const scrapeOnly = flags["scrape-only"] === true;
  if ([clusterOnly, pipelineOnly, scrapeOnly].filter(Boolean).length > 1) {
    console.error("Pass at most one of --cluster-only / --pipeline-only / --scrape-only.");
    process.exit(2);
  }
  const { cfg, db, companyId, companyName, company } = await setup();
  const controllers: QueueController[] = [];
  if (!clusterOnly && !scrapeOnly) {
    const hosts = internalHosts(company);
    const deps: PipelineDeps = {
      db,
      cfg,
      storage: storageFromEnv(cfg.repoRoot),
      invoker: new SdkAgentInvoker(),
      citationVerifier: new LiveCitationVerifier(
        new AnthropicLlmClient(),
        cfg.verifierModel,
        hosts,
        undefined,
        log,
      ),
      linkChecker: new LiveLinkChecker(db, companyId, hosts),
      companyName,
      log,
    };
    controllers.push(startQueue(deps));
  }
  if (!pipelineOnly && !scrapeOnly) {
    controllers.push(startClusterQueue(clusterDeps(cfg, db, company)));
  }
  if (!clusterOnly && !pipelineOnly) {
    controllers.push(startScrapeQueue(scrapeDeps(cfg, db)));
  }
  const controller: QueueController = {
    async stop() {
      await Promise.all(controllers.map((c) => c.stop()));
    },
  };
  installSignalHandlers(controller, db, log);
}

async function cmdEnqueue(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const topic = typeof flags["topic"] === "string" ? (flags["topic"] as string) : undefined;
  if (!topic) {
    console.error('Usage: enqueue --topic "…" [--keyword "…"] [--slug s] [--from-stage research]');
    process.exit(2);
  }
  const { cfg, db, companyId } = await setup();
  try {
    const keyword = typeof flags["keyword"] === "string" ? (flags["keyword"] as string) : undefined;
    const fromStage = (flags["from-stage"] as WorkStage | undefined) ?? "research";
    const { article, run } = await enqueueArticlePipeline(db, {
      companyId,
      topic,
      ...(keyword ? { keyword } : {}),
      ...(typeof flags["slug"] === "string" ? { slug: flags["slug"] as string } : {}),
      fromStage,
      maxAttempts: cfg.maxRunAttempts,
    });
    console.log(
      JSON.stringify(
        {
          articleId: article._id?.toHexString(),
          runId: run._id?.toHexString(),
          slug: article.slug,
          folder: article.folder,
          fromStage,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    if (err instanceof SlugTakenError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  } finally {
    await db.close();
  }
}

async function cmdImport(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const { cfg, db, companyId } = await setup();
  try {
    const summary = await importArticles(
      db,
      cfg,
      storageFromEnv(cfg.repoRoot),
      companyId,
      {
        stage: (flags["stage"] as Stage | undefined) ?? "published",
        dryRun: flags["dry-run"] === true,
        update: flags["update"] === true,
        runAudit: flags["audit"] === true,
      },
      log,
    );
    console.log(
      `\nImported ${summary.imported.length}, updated ${summary.updated.length}, skipped ${summary.skipped.length}.`,
    );
    for (const s of summary.skipped) console.log(`  skipped ${s.folder}: ${s.reason}`);
    process.exitCode = 0;
  } finally {
    await db.close();
  }
}

async function cmdStatus(): Promise<void> {
  const { db } = await setup();
  try {
    const byStage = await db.articles
      .aggregate([{ $group: { _id: "$stage", n: { $sum: 1 } } }, { $sort: { n: -1 } }])
      .toArray();
    const runs = await db.runs
      .find({ status: { $in: ["queued", "running"] } })
      .sort({ queuedAt: 1 })
      .toArray();
    console.log("Articles by stage:");
    for (const s of byStage) console.log(`  ${s["_id"]}: ${s["n"]}`);
    console.log(`\nActive runs: ${runs.length}`);
    for (const r of runs) {
      console.log(
        `  ${r._id?.toHexString()} article=${r.articleId.toHexString()} status=${r.status} phase=${r.currentPhase ?? "-"} attempt=${r.attempts}/${r.maxAttempts}`,
      );
    }
  } finally {
    await db.close();
  }
}

async function cmdEvents(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const runId = typeof flags["run"] === "string" ? (flags["run"] as string) : undefined;
  if (!runId) {
    console.error("Usage: events --run <runId> [--after <seq>] [--follow]");
    process.exit(2);
  }
  const { db } = await setup();
  try {
    let after = typeof flags["after"] === "string" ? Number.parseInt(flags["after"] as string, 10) : 0;
    const follow = flags["follow"] === true;
    for (;;) {
      const events = await eventsAfter(db, new ObjectId(runId), after);
      for (const e of events) {
        console.log(`${e.seq.toString().padStart(4)} ${e.ts.toISOString()} ${e.type} ${e.message}`);
        after = e.seq;
      }
      if (!follow) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await db.close();
  }
}

async function cmdClusterEnqueue(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const seed = typeof flags["seed"] === "string" ? (flags["seed"] as string) : undefined;
  if (!seed) {
    console.error('Usage: cluster-enqueue --seed "…" [--k 5]');
    process.exit(2);
  }
  const { cfg, db, companyId } = await setup();
  try {
    const k = typeof flags["k"] === "string" ? Number.parseInt(flags["k"] as string, 10) : cfg.cluster.k;
    const cluster = await enqueueClusterRun(db, {
      companyId,
      seed,
      k: Number.isFinite(k) && k > 0 ? k : cfg.cluster.k,
      models: { main: cfg.cluster.mainModel, fanout: cfg.cluster.fanoutModel },
      maxAttempts: cfg.cluster.maxAttempts,
    });
    console.log(
      JSON.stringify(
        { clusterId: cluster._id?.toHexString(), seed: cluster.seed, k: cluster.k, models: cluster.models },
        null,
        2,
      ),
    );
  } finally {
    await db.close();
  }
}

async function cmdClusterStatus(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const { db } = await setup();
  try {
    const id = typeof flags["id"] === "string" ? new ObjectId(flags["id"] as string) : undefined;
    if (!id) {
      const clusters = await db.clusters.find({}).sort({ createdAt: -1 }).limit(20).toArray();
      for (const c of clusters) {
        console.log(
          `${c._id?.toHexString()} "${c.seed}" status=${c.status} stage=${c.stage} attempt=${c.attempts}/${c.maxAttempts}` +
            ` themes=${await db.themes.countDocuments({ clusterId: c._id })} briefs=${c.spokeBriefs?.length ?? 0}`,
        );
      }
      return;
    }
    const cluster = await db.clusters.findOne({ _id: id });
    if (!cluster) {
      console.error("cluster not found");
      process.exit(1);
    }
    console.log(
      `"${cluster.seed}" status=${cluster.status} stage=${cluster.stage} mode=${cluster.mode ?? "-"}` +
        ` llmCalls=${cluster.usage.llmCalls} dfsCalls=${cluster.usage.dataForSeoCalls}` +
        `${cluster.error ? ` error=${cluster.error}` : ""}`,
    );
    const themes = await getThemesForCluster(db, id);
    for (const t of themes) {
      console.log(
        `  [${t.tier}] "${t.name}" stability=${t.stability.toFixed(2)} breadth=${t.breadth}` +
          ` gap=${t.gapStatus ?? "-"} score=${t.scores?.total ?? "-"} arch=${t.architecture ?? "-"}` +
          `${t.awarenessPlay ? " (awareness play)" : ""}`,
      );
    }
  } finally {
    await db.close();
  }
}

async function cmdClusterShow(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const id = typeof flags["id"] === "string" ? (flags["id"] as string) : undefined;
  if (!id) {
    console.error("Usage: cluster-show --id <clusterId>");
    process.exit(2);
  }
  const { db } = await setup();
  try {
    const cluster = await db.clusters.findOne({ _id: new ObjectId(id) });
    if (!cluster?.output) {
      console.error(cluster ? "cluster has no output yet" : "cluster not found");
      process.exit(1);
    }
    console.log(JSON.stringify(cluster.output, null, 2));
  } finally {
    await db.close();
  }
}

async function cmdClusterEvents(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const id = typeof flags["cluster"] === "string" ? (flags["cluster"] as string) : undefined;
  if (!id) {
    console.error("Usage: cluster-events --cluster <id> [--after <seq>] [--follow]");
    process.exit(2);
  }
  const { db } = await setup();
  try {
    let after = typeof flags["after"] === "string" ? Number.parseInt(flags["after"] as string, 10) : 0;
    const follow = flags["follow"] === true;
    for (;;) {
      const events = await clusterEventsAfter(db, new ObjectId(id), after);
      for (const e of events) {
        console.log(`${e.seq.toString().padStart(4)} ${e.ts.toISOString()} ${e.type} ${e.message}`);
        after = e.seq;
      }
      if (!follow) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await db.close();
  }
}

async function cmdClusterAccept(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const clusterId = typeof flags["cluster"] === "string" ? (flags["cluster"] as string) : undefined;
  const themeName = typeof flags["theme"] === "string" ? (flags["theme"] as string) : undefined;
  if (!clusterId || !themeName) {
    console.error('Usage: cluster-accept --cluster <id> --theme "<theme name>" [--enqueue]');
    process.exit(2);
  }
  const { cfg, db, companyId } = await setup();
  try {
    const { keyword, brief, theme } = await acceptSpokeBrief(db, {
      companyId,
      clusterId: new ObjectId(clusterId),
      themeName,
    });
    console.log(`Accepted "${brief.workingTitle}" → library keyword "${keyword.text}" (status: ${keyword.status})`);
    if (flags["enqueue"] === true) {
      const { article, run } = await enqueueArticlePipeline(db, {
        companyId,
        topic: brief.workingTitle,
        keyword: keyword.text,
        themeId: theme._id as ObjectId,
        maxAttempts: cfg.maxRunAttempts,
      });
      console.log(
        `Queued article run: slug=${article.slug} runId=${run._id?.toHexString()} (brief attached: ${Boolean(article.brief)})`,
      );
    }
  } catch (err) {
    if (err instanceof SlugTakenError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  } finally {
    await db.close();
  }
}

async function cmdScrapeEnqueue(argv: string[]): Promise<void> {
  const { flags, positional } = parseFlags(argv);
  const url = typeof flags["url"] === "string" ? (flags["url"] as string) : positional[0];
  if (!url) {
    console.error("Usage: scrape-enqueue <blog index url> [--browser] [--max-articles N] [--images]");
    process.exit(2);
  }
  const { cfg, db, companyId } = await setup();
  try {
    const maxArticles =
      typeof flags["max-articles"] === "string"
        ? Number.parseInt(flags["max-articles"] as string, 10)
        : undefined;
    const scrape = await enqueueScrapeRun(db, {
      companyId,
      url,
      options: {
        useBrowser: flags["browser"] === true || flags["use-browser"] === true,
        withImages: flags["images"] === true,
        ...(maxArticles && Number.isFinite(maxArticles) ? { maxArticles } : {}),
      },
      maxAttempts: cfg.scrape.maxAttempts,
    });
    console.log(
      JSON.stringify(
        { scrapeId: scrape._id?.toHexString(), url: scrape.url, domain: scrape.domain, options: scrape.options },
        null,
        2,
      ),
    );
  } finally {
    await db.close();
  }
}

async function cmdScrapeStatus(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const { db } = await setup();
  try {
    const id = typeof flags["id"] === "string" ? new ObjectId(flags["id"] as string) : undefined;
    const scrapes = id
      ? await db.scrapes.find({ _id: id }).toArray()
      : await db.scrapes.find({}).sort({ createdAt: -1 }).limit(20).toArray();
    if (scrapes.length === 0) {
      console.log(id ? "scrape not found" : "no scrapes yet");
      return;
    }
    for (const s of scrapes) {
      const corpus = s.corpus ? ` articles=${s.corpus.articleCount} words=${s.corpus.totalWords}` : "";
      console.log(
        `${s._id?.toHexString()} ${s.domain} status=${s.status} stage=${s.stage} attempt=${s.attempts}/${s.maxAttempts}` +
          `${corpus}${s.storage ? ` files=${s.storage.files}` : ""}${s.error ? ` error=${s.error.slice(0, 120)}` : ""}`,
      );
    }
  } finally {
    await db.close();
  }
}

async function cmdScrapeEvents(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const id = typeof flags["scrape"] === "string" ? (flags["scrape"] as string) : undefined;
  if (!id) {
    console.error("Usage: scrape-events --scrape <id> [--after <seq>] [--follow]");
    process.exit(2);
  }
  const { db } = await setup();
  try {
    let after = typeof flags["after"] === "string" ? Number.parseInt(flags["after"] as string, 10) : 0;
    const follow = flags["follow"] === true;
    for (;;) {
      const events = await scrapeEventsAfter(db, new ObjectId(id), after);
      for (const e of events) {
        console.log(`${e.seq.toString().padStart(4)} ${e.ts.toISOString()} ${e.type} ${e.message}`);
        after = e.seq;
      }
      if (!follow) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await db.close();
  }
}

async function cmdScrapeImport(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const dir = typeof flags["dir"] === "string" ? (flags["dir"] as string) : undefined;
  const url = typeof flags["url"] === "string" ? (flags["url"] as string) : undefined;
  if (!dir || !url) {
    console.error(
      'Usage: scrape-import --dir blogscraper/<domain>/<blog> --url "https://<domain>/<blog>"',
    );
    process.exit(2);
  }
  const { cfg, db, companyId } = await setup();
  try {
    // Relative --dir is repo-root-relative regardless of the npm cwd.
    const absDir = isAbsolute(dir) ? dir : resolve(cfg.repoRoot, dir);
    const scrape = await importScrapedCorpus(scrapeDeps(cfg, db), { dir: absDir, url, companyId });
    console.log(
      `Imported ${scrape.domain}: ${scrape.corpus?.articleCount ?? 0} articles, ` +
        `${scrape.storage?.files ?? 0} files stored under ${scrape.storage?.prefix ?? "-"} ` +
        `(scrapeId ${scrape._id?.toHexString()})`,
    );
  } finally {
    await db.close();
  }
}

const HELP = `blogagent-worker <command>

Commands:
  start [--cluster-only|--pipeline-only|--scrape-only]
                                     Run the queue worker (article pipeline + cluster + scrape runs)
  enqueue --topic "…"                Queue an article run
          [--keyword "…"] [--slug s] [--from-stage research|outline|write|edit|schema|design]
  import-articles [--dry-run]        Backfill articles/ folders into Mongo
          [--stage published] [--update] [--audit]
  status                             Articles by stage + active runs
  events --run <id> [--follow]       Print a run's event stream
  cluster-enqueue --seed "…" [--k 5] Queue a Topic & Cluster Generator run
  cluster-status [--id <id>]         List cluster runs, or themes for one
  cluster-show --id <id>             Dump a finished cluster's output JSON
  cluster-events --cluster <id>      Print a cluster's event stream [--follow]
  cluster-accept --cluster <id> --theme "…" [--enqueue]
                                     Accept a spoke brief into the keyword library
                                     (--enqueue also queues the article with the brief)
  scrape-enqueue <url> [--browser] [--max-articles N] [--images]
                                     Queue a competitive blog scrape (Phase 6)
  scrape-status [--id <id>]          List scrape runs (or one)
  scrape-events --scrape <id>        Print a scrape's event stream [--follow]
  scrape-import --dir <corpus dir> --url <blog url>
                                     Backfill an existing blogscraper corpus folder

Env: MONGODB_URI, MONGODB_DB, ANTHROPIC_API_KEY, WORKER_CONCURRENCY,
     PHASE_MODEL_DEFAULT / PHASE_MODEL_<PHASE>, STORAGE_DRIVER (local|s3),
     CLUSTER_MODEL, CLUSTER_FANOUT_MODEL, CLUSTER_FANOUT_K, CLUSTER_MAX_VALIDATIONS,
     GEMINI_API_KEY (observed fan-out), DATAFORSEO_LOGIN/PASSWORD (+_SANDBOX=1),
     SCRAPER_PYTHON, SCRAPE_MAX_ATTEMPTS, SCRAPE_TIMEOUT_MS,
     COMPANY_CONFIG, REPO_ROOT. See apps/worker/README.md.`;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "start":
      return cmdStart(rest);
    case "enqueue":
      return cmdEnqueue(rest);
    case "import-articles":
      return cmdImport(rest);
    case "status":
      return cmdStatus();
    case "events":
      return cmdEvents(rest);
    case "cluster-enqueue":
      return cmdClusterEnqueue(rest);
    case "cluster-status":
      return cmdClusterStatus(rest);
    case "cluster-show":
      return cmdClusterShow(rest);
    case "cluster-events":
      return cmdClusterEvents(rest);
    case "cluster-accept":
      return cmdClusterAccept(rest);
    case "scrape-enqueue":
      return cmdScrapeEnqueue(rest);
    case "scrape-status":
      return cmdScrapeStatus(rest);
    case "scrape-events":
      return cmdScrapeEvents(rest);
    case "scrape-import":
      return cmdScrapeImport(rest);
    default:
      console.log(HELP);
      process.exit(cmd ? 2 : 0);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
