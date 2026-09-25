import { MongoClient, type Collection, type Db } from "mongodb";
import type {
  ArticleDoc,
  CompanyDoc,
  EventDoc,
  KeywordDoc,
  RunDoc,
  SettingDoc,
} from "./types.js";
import type { ApiCostDoc, ClusterDoc, ClusterEventDoc, ThemeDoc } from "./cluster/types.js";
import type { PlanDoc, PlanEventDoc, PlanItemDoc } from "./plan/types.js";
import type { ScheduleDoc } from "./schedule/types.js";
import type { ScrapeDoc, ScrapeEventDoc } from "./scrape/types.js";

export interface EngineDb {
  client: MongoClient;
  db: Db;
  articles: Collection<ArticleDoc>;
  runs: Collection<RunDoc>;
  events: Collection<EventDoc>;
  keywords: Collection<KeywordDoc>;
  companies: Collection<CompanyDoc>;
  settings: Collection<SettingDoc>;
  clusters: Collection<ClusterDoc>;
  themes: Collection<ThemeDoc>;
  clusterEvents: Collection<ClusterEventDoc>;
  apiCosts: Collection<ApiCostDoc>;
  scrapes: Collection<ScrapeDoc>;
  scrapeEvents: Collection<ScrapeEventDoc>;
  plans: Collection<PlanDoc>;
  planItems: Collection<PlanItemDoc>;
  planEvents: Collection<PlanEventDoc>;
  schedules: Collection<ScheduleDoc>;
  close(): Promise<void>;
}

export async function connect(uri: string, dbName: string): Promise<EngineDb> {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const handle: EngineDb = {
    client,
    db,
    articles: db.collection<ArticleDoc>("articles"),
    runs: db.collection<RunDoc>("runs"),
    events: db.collection<EventDoc>("events"),
    keywords: db.collection<KeywordDoc>("keywords"),
    companies: db.collection<CompanyDoc>("companies"),
    settings: db.collection<SettingDoc>("settings"),
    clusters: db.collection<ClusterDoc>("clusters"),
    themes: db.collection<ThemeDoc>("themes"),
    clusterEvents: db.collection<ClusterEventDoc>("cluster_events"),
    apiCosts: db.collection<ApiCostDoc>("api_costs"),
    scrapes: db.collection<ScrapeDoc>("scrapes"),
    scrapeEvents: db.collection<ScrapeEventDoc>("scrape_events"),
    plans: db.collection<PlanDoc>("plans"),
    planItems: db.collection<PlanItemDoc>("plan_items"),
    planEvents: db.collection<PlanEventDoc>("plan_events"),
    schedules: db.collection<ScheduleDoc>("schedules"),
    close: () => client.close(),
  };
  await ensureIndexes(handle);
  return handle;
}

export async function ensureIndexes(h: EngineDb): Promise<void> {
  await Promise.all([
    h.articles.createIndexes([
      { key: { companyId: 1, slug: 1 }, unique: true },
      { key: { companyId: 1, stage: 1, updatedAt: -1 } },
    ]),
    h.runs.createIndexes([
      // Claim query: queued runs, or running runs whose lease expired.
      { key: { status: 1, queuedAt: 1 } },
      { key: { status: 1, leaseUntil: 1 } },
      { key: { articleId: 1, createdAt: -1 } },
    ]),
    h.events.createIndexes([
      { key: { runId: 1, seq: 1 }, unique: true },
      { key: { articleId: 1, ts: 1 } },
      { key: { companyId: 1, ts: -1 } },
    ]),
    h.keywords.createIndexes([
      { key: { companyId: 1, text: 1 }, unique: true },
      { key: { companyId: 1, status: 1, priority: -1 } },
    ]),
    h.companies.createIndexes([{ key: { companyId: 1 }, unique: true }]),
    h.settings.createIndexes([{ key: { companyId: 1, key: 1 }, unique: true }]),
    h.clusters.createIndexes([
      { key: { status: 1, queuedAt: 1 } },
      { key: { status: 1, leaseUntil: 1 } },
      { key: { companyId: 1, createdAt: -1 } },
    ]),
    h.themes.createIndexes([
      { key: { clusterId: 1, name: 1 }, unique: true },
      { key: { companyId: 1, tier: 1 } },
    ]),
    h.clusterEvents.createIndexes([{ key: { clusterId: 1, seq: 1 }, unique: true }]),
    h.apiCosts.createIndexes([{ key: { companyId: 1, provider: 1, at: -1 } }]),
    h.scrapes.createIndexes([
      { key: { status: 1, queuedAt: 1 } },
      { key: { status: 1, leaseUntil: 1 } },
      { key: { companyId: 1, createdAt: -1 } },
      { key: { companyId: 1, domain: 1, createdAt: -1 } },
    ]),
    h.scrapeEvents.createIndexes([{ key: { scrapeId: 1, seq: 1 }, unique: true }]),
    h.plans.createIndexes([
      { key: { companyId: 1, createdAt: -1 } },
      { key: { companyId: 1, status: 1 } },
      // Enrichment-job claim, mirroring the scrape queue.
      { key: { status: 1, leaseUntil: 1 } },
    ]),
    h.planItems.createIndexes([
      { key: { planId: 1, externalId: 1 }, unique: true },
      // Forces the importer to fully disambiguate before insert, the way
      // articles.{companyId, slug} does for articles.
      { key: { planId: 1, slug: 1 }, unique: true },
      { key: { companyId: 1, slug: 1 } },
      // The scheduler tick's candidate query.
      { key: { planId: 1, status: 1, sequence: 1 } },
      { key: { planId: 1, enrichment: 1 } },
      { key: { planId: 1, parentItemId: 1 } },
      { key: { articleId: 1 } },
    ]),
    h.planEvents.createIndexes([{ key: { planId: 1, seq: 1 }, unique: true }]),
    h.schedules.createIndexes([
      // One schedule per plan.
      { key: { planId: 1 }, unique: true },
      // The tick's claim query.
      { key: { companyId: 1, status: 1, nextFireAt: 1 } },
    ]),
  ]);
}
