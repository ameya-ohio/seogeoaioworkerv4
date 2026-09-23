import { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import type { ArticleArtifacts, ArticleDoc, GateResult, ScriptReport, Stage, WorkStage } from "../types.js";

export interface NewArticleInput {
  companyId: string;
  slug: string;
  folder: string;
  topic: string;
  targetKeyword?: string;
  brief?: ArticleDoc["brief"];
  pendingLinks?: string[];
}

export async function createArticle(db: EngineDb, input: NewArticleInput): Promise<ArticleDoc> {
  const now = new Date();
  const doc: ArticleDoc = {
    ...input,
    stage: "queued",
    stageHistory: [{ stage: "queued", at: now }],
    artifacts: {},
    createdAt: now,
    updatedAt: now,
  };
  const res = await db.articles.insertOne(doc);
  doc._id = res.insertedId;
  return doc;
}

export async function getArticle(db: EngineDb, id: ObjectId): Promise<ArticleDoc | null> {
  return db.articles.findOne({ _id: id });
}

export async function getArticleBySlug(
  db: EngineDb,
  companyId: string,
  slug: string,
): Promise<ArticleDoc | null> {
  return db.articles.findOne({ companyId, slug });
}

export async function setStage(
  db: EngineDb,
  id: ObjectId,
  stage: Stage,
  runId?: ObjectId,
): Promise<void> {
  const now = new Date();
  await db.articles.updateOne(
    { _id: id },
    {
      $set: { stage, updatedAt: now },
      $push: { stageHistory: { stage, at: now, ...(runId ? { runId } : {}) } },
    },
  );
}

export async function saveArtifacts(
  db: EngineDb,
  id: ObjectId,
  artifacts: Partial<ArticleArtifacts>,
  extra?: {
    frontmatter?: Record<string, unknown>;
    audit?: ScriptReport;
    schemaValidation?: ScriptReport;
    header?: ArticleDoc["header"];
  },
): Promise<void> {
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(artifacts)) {
    if (v !== undefined) $set[`artifacts.${k}`] = v;
  }
  if (extra?.frontmatter !== undefined) $set["frontmatter"] = extra.frontmatter;
  if (extra?.audit !== undefined) $set["audit"] = extra.audit;
  if (extra?.schemaValidation !== undefined) $set["schemaValidation"] = extra.schemaValidation;
  if (extra?.header !== undefined) $set["header"] = extra.header;
  await db.articles.updateOne({ _id: id }, { $set });
}

export async function saveGateResult(
  db: EngineDb,
  id: ObjectId,
  phase: WorkStage,
  gate: GateResult,
): Promise<void> {
  await db.articles.updateOne(
    { _id: id },
    { $set: { [`gates.${phase}`]: gate, updatedAt: new Date() } },
  );
}

export async function markFailed(db: EngineDb, id: ObjectId, error: string): Promise<void> {
  const now = new Date();
  await db.articles.updateOne(
    { _id: id },
    {
      $set: { stage: "failed", error, updatedAt: now },
      $push: { stageHistory: { stage: "failed" as Stage, at: now } },
    },
  );
}
