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
  analyzePlan,
  commitPlan,
  createPlan,
  createSchedule,
  getPlan,
  getSchedule,
  listPlanItems,
  listPlans,
  planCounts,
  previewSchedule,
  readWorkbook,
  requestPlanEnrichment,
  resumeSchedule,
  pauseSchedule,
  runScheduleTick,
  suggestMapping,
  updateSchedule,
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
import { startPlanQueue } from "./planQueue.js";
import { startScheduleQueue } from "./scheduleQueue.js";
import type { PlanDeps } from "./planRunner.js";
import { PythonScraperCli, importScrapedCorpus, type ScrapeDeps } from "./scrapeRunner.js";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

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
  const planOnly = flags["plan-only"] === true;
  const scheduleOnly = flags["schedule-only"] === true;
  const onlyFlags = [clusterOnly, pipelineOnly, scrapeOnly, planOnly, scheduleOnly];
  if (onlyFlags.filter(Boolean).length > 1) {
    console.error(
      "Pass at most one of --cluster-only / --pipeline-only / --scrape-only / --plan-only / --schedule-only.",
    );
    process.exit(2);
  }
  const anyOnly = onlyFlags.some(Boolean);
  const { cfg, db, companyId, companyName, company } = await setup();
  const controllers: QueueController[] = [];
  if (!anyOnly || pipelineOnly) {
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
  if (!anyOnly || clusterOnly) {
    controllers.push(startClusterQueue(clusterDeps(cfg, db, company)));
  }
  if (!anyOnly || scrapeOnly) {
    controllers.push(startScrapeQueue(scrapeDeps(cfg, db)));
  }
  if (!anyOnly || planOnly) {
    const planDeps: PlanDeps = { db, cfg, llm: new AnthropicLlmClient(), log };
    controllers.push(startPlanQueue(planDeps));
  }
  // The cadence is off unless switched on deliberately: a scheduler that
  // starts firing on deploy would spend money nobody asked for.
  if (cfg.schedule.enabled || scheduleOnly) {
    controllers.push(startScheduleQueue({ db, cfg, companyId, log }));
  } else {
    log("scheduler disabled (set SCHEDULER_ENABLED=1 to run cadences)");
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
        ...(typeof flags["only"] === "string"
          ? { only: flags["only"].split(",").map((f) => f.trim()).filter(Boolean) }
          : {}),
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


// ── content plans ─────────────────────────────────────────────────────────

function planIdFlag(flags: Record<string, string | boolean>, name = "plan"): ObjectId {
  const raw = typeof flags[name] === "string" ? (flags[name] as string) : "";
  if (!ObjectId.isValid(raw)) {
    console.error(`--${name} <id> is required (24-character hex id).`);
    process.exit(2);
  }
  return new ObjectId(raw);
}

async function cmdPlanImport(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const file = typeof flags["file"] === "string" ? (flags["file"] as string) : undefined;
  if (!file) {
    console.error(
      'Usage: plan-import --file <map.xlsx|map.csv> [--sheet "Content Map"] [--commit] [--enrich]',
    );
    process.exit(2);
  }
  const { db, companyId, companyName } = await setup();
  try {
    const path = isAbsolute(file) ? file : resolve(process.cwd(), file);
    const buf = await readFile(path);
    const wb = await readWorkbook(buf, basename(path));

    const suggestion = suggestMapping(wb);
    const mapping = suggestion.mapping;
    if (typeof flags["sheet"] === "string") mapping.sheet = flags["sheet"] as string;

    // Collisions are reported against what already exists, not guessed at.
    const existingArticles = await db.articles
      .find({ companyId })
      .project<{ slug: string; stage: string }>({ slug: 1, stage: 1 })
      .toArray();
    const takenSlugs = new Map(existingArticles.map((a) => [a.slug, a.stage]));
    const existingKeywordDocs = await db.keywords
      .find({ companyId })
      .project<{ text: string; status: string }>({ text: 1, status: 1 })
      .toArray();
    const existingKeywords = new Map(existingKeywordDocs.map((k) => [k.text, k.status]));

    const analysis = analyzePlan({
      workbook: wb,
      mapping,
      companyName,
      takenSlugs,
      existingKeywords,
    });
    const r = analysis.report;

    console.log(`Workbook: ${basename(path)}`);
    console.log(`Sheets:   ${wb.sheets.map((x) => `${x.name} (${x.rows.length})`).join(", ")}`);
    console.log(`Payload:  ${r.sheet}`);
    console.log(`Rows:     ${r.mappedRows} mapped of ${r.totalRows}`);
    console.log(`Roles:    ${JSON.stringify(r.byPageRole)}`);
    console.log(`Priority: ${JSON.stringify(r.byPriority)}`);
    console.log(`Funnel:   ${JSON.stringify(r.byFunnel)}`);
    console.log(`Intent:   ${JSON.stringify(r.byIntent)}`);
    if (analysis.promotions.length > 0) {
      console.log(
        `\nStructure overrode priority for ${analysis.promotions.length} parent page(s):`,
      );
      for (const p of analysis.promotions.slice(0, 10)) {
        console.log(`  ${p.parentKey} pulled forward so ${p.childKey} is not blocked`);
      }
    }
    if (r.needsQueryTarget.length > 0) {
      console.log(`\n${r.needsQueryTarget.length} row(s) need a human keyword target:`);
      for (const id of r.needsQueryTarget.slice(0, 10)) console.log(`  ${id}`);
    }
    if (r.skippedRows.length > 0) {
      console.log(`\nSkipped ${r.skippedRows.length} row(s):`);
      for (const sk of r.skippedRows.slice(0, 10)) console.log(`  row ${sk.row}: ${sk.reason}`);
    }
    if (r.articleCollisions.length > 0) {
      console.log(`\n${r.articleCollisions.length} slug collision(s) with existing articles:`);
      for (const c of r.articleCollisions.slice(0, 10)) {
        console.log(`  ${c.externalId} -> ${c.slug} (existing stage: ${c.stage})`);
      }
    }
    if (r.missingHubs.length > 0) console.log(`\nSubtopics with no hub row: ${r.missingHubs.length}`);
    if (r.blocking.length > 0) {
      console.log(`\nBLOCKING:`);
      for (const b of r.blocking) console.log(`  - ${b}`);
    }

    if (flags["commit"] !== true) {
      console.log(`\n(dry run — pass --commit to create the plan)`);
      return;
    }
    if (r.blocking.length > 0) {
      console.error(`\nRefusing to commit while problems remain.`);
      process.exit(1);
    }

    const plan = await createPlan(db, {
      companyId,
      filename: basename(path),
      sheets: wb.sheets,
      mapping,
      taxonomy: analysis.taxonomy,
      concepts: analysis.concepts,
      ...(analysis.notes ? { notes: analysis.notes } : {}),
      report: r,
    });
    const planId = plan._id as ObjectId;
    const { itemCount } = await commitPlan(db, {
      companyId,
      planId,
      items: analysis.items,
      report: r,
    });
    console.log(`\nPlan ${planId.toHexString()} committed with ${itemCount} items.`);

    if (flags["enrich"] === true) {
      const n = await requestPlanEnrichment(db, planId);
      console.log(`Queued brief enrichment for ${n} items — run the worker to process it.`);
    } else {
      console.log(`Briefs are deterministic. Run: plan-enrich --plan ${planId.toHexString()}`);
    }
  } finally {
    await db.close();
  }
}

async function cmdPlanStatus(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const { db, companyId } = await setup();
  try {
    if (typeof flags["plan"] === "string") {
      const planId = planIdFlag(flags);
      const plan = await getPlan(db, planId);
      if (!plan) {
        console.error("plan not found");
        process.exit(1);
      }
      const counts = await planCounts(db, planId);
      console.log(`${plan.filename}  [${plan.status}]`);
      console.log(`items:      ${counts.total}`);
      console.log(`status:     ${JSON.stringify(counts.byStatus)}`);
      console.log(`enrichment: ${JSON.stringify(counts.byEnrichment)}`);
      console.log(`usage:      ${plan.usage.llmCalls} calls, $${plan.usage.costUsd.toFixed(2)}`);
      const schedule = await getSchedule(db, planId);
      if (schedule) {
        console.log(
          `schedule:   ${schedule.status} | next ${schedule.nextFireAt?.toISOString() ?? "—"} | ` +
            `${schedule.cadence.batchSize}/fire on days [${schedule.cadence.daysOfWeek.join(",")}] ` +
            `at ${schedule.cadence.timeOfDay} ${schedule.cadence.timezone}`,
        );
        if (schedule.pause) console.log(`paused:     ${schedule.pause.detail}`);
      } else {
        console.log(`schedule:   none — create one with schedule-create`);
      }
      return;
    }
    const plans = await listPlans(db, companyId);
    if (plans.length === 0) {
      console.log("No content plans yet. Import one with plan-import --file <map.xlsx>.");
      return;
    }
    for (const p of plans) {
      console.log(
        `${p._id?.toHexString()}  ${p.status.padEnd(9)}  ${String(p.itemCount ?? 0).padStart(4)} items  ${p.filename}`,
      );
    }
  } finally {
    await db.close();
  }
}

async function cmdPlanItems(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const planId = planIdFlag(flags);
  const { db } = await setup();
  try {
    const limit = typeof flags["limit"] === "string" ? Number.parseInt(flags["limit"], 10) : 40;
    const items = await listPlanItems(db, {
      planId,
      limit,
      ...(typeof flags["status"] === "string"
        ? { status: [flags["status"] as never] }
        : {}),
    });
    for (const i of items) {
      console.log(
        `#${String(i.sequence).padStart(3)}  ${i.status.padEnd(13)} ${i.enrichment.padEnd(8)} ` +
          `${i.pageRole.padEnd(7)} P${i.priority}  ${i.slug}`,
      );
      console.log(`      ${i.title}  [${i.primaryQueryTarget}]${i.needsQueryTarget ? "  <- needs a human target" : ""}`);
    }
  } finally {
    await db.close();
  }
}

async function cmdPlanEnrich(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const planId = planIdFlag(flags);
  const { db } = await setup();
  try {
    const n = await requestPlanEnrichment(db, planId, {
      onlyFailed: flags["only-failed"] === true,
    });
    console.log(`Queued ${n} item(s) for enrichment. Run the worker to process them.`);
  } finally {
    await db.close();
  }
}

async function cmdPlanEvents(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const planId = planIdFlag(flags);
  const { db } = await setup();
  try {
    const events = await db.planEvents.find({ planId }).sort({ seq: 1 }).limit(200).toArray();
    for (const e of events) {
      console.log(`${e.ts.toISOString()}  ${e.type.padEnd(24)} ${e.message}`);
    }
  } finally {
    await db.close();
  }
}

// ── schedules ─────────────────────────────────────────────────────────────

function intFlag(flags: Record<string, string | boolean>, name: string): number | undefined {
  const raw = flags[name];
  if (typeof raw !== "string") return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

async function cmdScheduleCreate(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const planId = planIdFlag(flags);
  const { db, companyId } = await setup();
  try {
    const plan = await getPlan(db, planId);
    if (!plan) {
      console.error("plan not found");
      process.exit(1);
    }
    const days =
      typeof flags["days"] === "string"
        ? (flags["days"] as string).split(",").map((d) => Number.parseInt(d.trim(), 10))
        : undefined;
    const limits: Record<string, number> = {};
    for (const [flag, key] of [
      ["max-in-flight", "maxInFlight"],
      ["max-review", "maxAwaitingReview"],
      ["max-per-week", "maxPerCalendarWeek"],
      ["max-total", "maxTotalArticles"],
      ["max-cost", "maxCostUsd"],
    ] as const) {
      const v = intFlag(flags, flag);
      if (v !== undefined) limits[key] = v;
    }
    const schedule = await createSchedule(db, {
      companyId,
      planId,
      name: typeof flags["name"] === "string" ? (flags["name"] as string) : plan.filename,
      cadence: {
        ...(days ? { daysOfWeek: days } : {}),
        ...(typeof flags["time"] === "string" ? { timeOfDay: flags["time"] as string } : {}),
        ...(typeof flags["tz"] === "string" ? { timezone: flags["tz"] as string } : {}),
        ...(intFlag(flags, "batch") !== undefined ? { batchSize: intFlag(flags, "batch") as number } : {}),
      },
      ...(Object.keys(limits).length ? { limits } : {}),
      ...(flags["require-approval"] === true ? { requireApproval: true } : {}),
    });
    console.log(
      `Schedule created for plan ${planId.toHexString()} — PAUSED.\n` +
        `  ${schedule.cadence.batchSize}/fire on days [${schedule.cadence.daysOfWeek.join(",")}] ` +
        `at ${schedule.cadence.timeOfDay} ${schedule.cadence.timezone}\n` +
        `  limits: ${JSON.stringify(schedule.limits)}\n` +
        `Start it with: schedule-resume --plan ${planId.toHexString()}`,
    );
  } finally {
    await db.close();
  }
}

async function cmdScheduleResume(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const planId = planIdFlag(flags);
  const { db } = await setup();
  try {
    const s = await resumeSchedule(db, planId);
    console.log(`Schedule active. Next fire: ${s?.nextFireAt?.toISOString() ?? "—"}`);
  } finally {
    await db.close();
  }
}

async function cmdSchedulePause(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const planId = planIdFlag(flags);
  const { db } = await setup();
  try {
    await pauseSchedule(db, planId, "operator", "paused from the CLI");
    console.log("Schedule paused.");
  } finally {
    await db.close();
  }
}

async function cmdSchedulePreview(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const planId = planIdFlag(flags);
  const { db } = await setup();
  try {
    const schedule = await getSchedule(db, planId);
    if (!schedule) {
      console.error("no schedule for this plan");
      process.exit(1);
    }
    const items = await listPlanItems(db, { planId, limit: 2000 });
    const inFlight = items.filter((i) => i.status === "enqueued" || i.status === "in_progress").length;
    const entries = previewSchedule(
      items.map((i) => ({
        key: i._id?.toHexString() ?? i.externalId,
        sequence: i.sequence,
        slug: i.slug,
        title: i.title,
        role: i.pageRole,
        status: i.status,
        parentKey: i.parentItemId?.toHexString() ?? null,
        failureCount: i.failureCount,
        retryAfter: i.retryAfter,
        dependencyOverride: i.dependencyOverride,
      })),
      new Date(),
      intFlag(flags, "count") ?? 10,
      {
        cadence: schedule.cadence,
        limits: schedule.limits,
        requireApproval: schedule.requireApproval,
        estimatedArticleMinutes: schedule.estimatedArticleMinutes,
        inFlightNow: inFlight,
      },
    );
    console.log(`Projection (not a commitment):`);
    for (const e of entries) {
      const when = e.fireAt.toISOString().replace("T", " ").slice(0, 16);
      if (e.items.length === 0) {
        console.log(`  ${when}  —  ${e.note ?? "nothing"}`);
        continue;
      }
      for (const i of e.items) console.log(`  ${when}  #${String(i.sequence).padStart(3)} ${i.slug}`);
      if (e.note) console.log(`  ${" ".repeat(16)}  (${e.note})`);
    }
  } finally {
    await db.close();
  }
}

async function cmdScheduleTick(argv: string[]): Promise<void> {
  const { flags } = parseFlags(argv);
  const { cfg, db, companyId } = await setup();
  try {
    const dryRun = flags["dry-run"] === true;
    const outcome = await runScheduleTick({
      db,
      companyId,
      workerId: `${cfg.workerId}-cli`,
      leaseMs: cfg.leaseMs,
      heartbeatMs: cfg.heartbeatMs,
      maxRunAttempts: cfg.maxRunAttempts,
      dryRun,
      log,
    });
    console.log(`${outcome.status}${dryRun ? " (dry run — nothing was written)" : ""}`);
    for (const e of outcome.enqueued) console.log(`  queued #${e.sequence} ${e.slug}`);
    if (outcome.binding) console.log(`  held by: ${outcome.binding}`);
    if (outcome.detail) console.log(`  ${outcome.detail}`);
    if (outcome.nextFireAt) console.log(`  next fire: ${outcome.nextFireAt.toISOString()}`);
  } finally {
    await db.close();
  }
}

const HELP = `blogagent-worker <command>

Commands:
  start [--pipeline-only|--cluster-only|--scrape-only|--plan-only|--schedule-only]
                                     Run the queue worker (article pipeline, cluster, scrape, plan
                                     enrichment; the cadence scheduler needs SCHEDULER_ENABLED=1)
  enqueue --topic "…"                Queue an article run
          [--keyword "…"] [--slug s] [--from-stage research|outline|write|edit|schema|design]
  import-articles [--dry-run]        Backfill articles/ folders into Mongo
          [--stage published] [--update] [--audit]
          [--only <folder>,<folder>]  (full YYYY-MM-DD-slug names)
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

  plan-import --file <map.xlsx|.csv> Analyse an SEO content plan; prints the import report
          [--sheet "Content Map"] [--commit] [--enrich]
                                     (dry run unless --commit; --enrich queues the brief pass)
  plan-status [--plan <id>]          List content plans, or show one with its schedule
  plan-items --plan <id>             List planned articles in production order
          [--status planned|done|failed|…] [--limit N]
  plan-enrich --plan <id>            Queue the brief-enrichment pass [--only-failed]
  plan-events --plan <id>            Print a plan's event stream

  schedule-create --plan <id>        Create a cadence (starts PAUSED)
          [--days 1,2,3,4,5] [--time 07:00] [--tz Europe/Zurich] [--batch 1]
          [--max-in-flight N] [--max-review N] [--max-per-week N]
          [--max-total N] [--max-cost N] [--require-approval]
  schedule-resume --plan <id>        Start (or restart) the cadence
  schedule-pause --plan <id>         Stop firing; nothing is lost
  schedule-preview --plan <id>       Project the next N articles with dates [--count 10]
  schedule-tick [--dry-run]          Run one tick now (dry run writes nothing)

Env: MONGODB_URI, MONGODB_DB, ANTHROPIC_API_KEY, WORKER_CONCURRENCY,
     PHASE_MODEL_DEFAULT / PHASE_MODEL_<PHASE>, STORAGE_DRIVER (local|s3),
     CLUSTER_MODEL, CLUSTER_FANOUT_MODEL, CLUSTER_FANOUT_K, CLUSTER_MAX_VALIDATIONS,
     GEMINI_API_KEY (observed fan-out), DATAFORSEO_LOGIN/PASSWORD (+_SANDBOX=1),
     SCRAPER_PYTHON, SCRAPE_MAX_ATTEMPTS, SCRAPE_TIMEOUT_MS,
     PLAN_ENRICH_MODEL, PLAN_ENRICH_CONCURRENCY,
     SCHEDULER_ENABLED (0|1), SCHEDULE_POLL_INTERVAL_MS, SCHEDULE_DRY_RUN (0|1),
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
    case "plan-import":
      return cmdPlanImport(rest);
    case "plan-status":
      return cmdPlanStatus(rest);
    case "plan-items":
      return cmdPlanItems(rest);
    case "plan-enrich":
      return cmdPlanEnrich(rest);
    case "plan-events":
      return cmdPlanEvents(rest);
    case "schedule-create":
      return cmdScheduleCreate(rest);
    case "schedule-resume":
      return cmdScheduleResume(rest);
    case "schedule-pause":
      return cmdSchedulePause(rest);
    case "schedule-preview":
      return cmdSchedulePreview(rest);
    case "schedule-tick":
      return cmdScheduleTick(rest);
    default:
      console.log(HELP);
      process.exit(cmd ? 2 : 0);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
