"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import {
  SlugTakenError,
  enqueueArticlePipeline,
  type KeywordDoc,
  type KeywordSource,
} from "@blogagent/engine";
import { requireAuth } from "../auth";
import { getCompany, getDb } from "../db";

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function addKeyword(formData: FormData): Promise<void> {
  await requireAuth();
  const text = normalize(String(formData.get("text") ?? ""));
  if (!text) return;
  const priorityRaw = String(formData.get("priority") ?? "").trim();
  const priority = priorityRaw ? Number.parseInt(priorityRaw, 10) : undefined;
  const db = await getDb();
  const now = new Date();
  await db.keywords.updateOne(
    { companyId: getCompany().companyId, text },
    {
      $setOnInsert: {
        companyId: getCompany().companyId,
        text,
        source: "chat" satisfies KeywordSource,
        status: "idea",
        createdAt: now,
      },
      $set: { updatedAt: now, ...(Number.isFinite(priority) ? { priority } : {}) },
    },
    { upsert: true },
  );
  revalidatePath("/keywords");
}

export type BulkAction = "prioritize" | "deprioritize" | "archive" | "unarchive" | "queue";

export async function bulkKeywordAction(action: BulkAction, ids: string[]): Promise<void> {
  await requireAuth();
  if (ids.length === 0) return;
  const db = await getDb();
  const _ids = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const filter = { _id: { $in: _ids }, companyId: getCompany().companyId };
  const now = new Date();
  switch (action) {
    case "prioritize":
      await db.keywords.updateMany(filter, { $set: { priority: 1, updatedAt: now } });
      break;
    case "deprioritize":
      await db.keywords.updateMany(filter, { $unset: { priority: "" }, $set: { updatedAt: now } });
      break;
    case "archive":
      await db.keywords.updateMany(filter, { $set: { status: "archived", updatedAt: now } });
      break;
    case "unarchive":
      await db.keywords.updateMany(
        { ...filter, status: "archived" },
        { $set: { status: "idea", updatedAt: now } },
      );
      break;
    case "queue":
      await db.keywords.updateMany(
        { ...filter, status: "idea" },
        { $set: { status: "queued", updatedAt: now } },
      );
      break;
  }
  revalidatePath("/keywords");
  revalidatePath("/strategy");
}

export interface SendResult {
  sent: string[];
  errors: { text: string; message: string }[];
}

/** Select tab / Keywords bulk action: keyword → article + queued run. */
export async function sendKeywordsToPipeline(ids: string[]): Promise<SendResult> {
  await requireAuth();
  const db = await getDb();
  const companyId = getCompany().companyId;
  const result: SendResult = { sent: [], errors: [] };

  for (const id of ids) {
    if (!ObjectId.isValid(id)) continue;
    const kw = await db.keywords.findOne({ _id: new ObjectId(id), companyId });
    if (!kw) continue;
    if (kw.status === "in_production" || kw.status === "published") {
      result.errors.push({ text: kw.text, message: `already ${kw.status}` });
      continue;
    }
    try {
      const { article } = await enqueueArticlePipeline(db, {
        companyId,
        topic: kw.text,
        keyword: kw.text,
        // Keyword from an accepted spoke brief (4.12): the brief rides along
        // as a first-class Strategist input.
        ...(kw.themeId ? { themeId: kw.themeId } : {}),
      });
      await db.keywords.updateOne(
        { _id: kw._id },
        {
          $set: {
            status: "in_production",
            articleId: article._id,
            updatedAt: new Date(),
          },
        },
      );
      result.sent.push(kw.text);
    } catch (err) {
      result.errors.push({
        text: kw.text,
        message: err instanceof SlugTakenError ? err.message : "failed to enqueue",
      });
      if (!(err instanceof SlugTakenError)) throw err;
    }
  }
  revalidatePath("/keywords");
  revalidatePath("/strategy");
  revalidatePath("/production");
  return result;
}

export interface CsvRow {
  text: string;
  volume?: number;
  difficulty?: number;
  priority?: number;
}

export interface CsvCheckResult {
  fresh: CsvRow[];
  duplicates: string[];
}

/** Upload tab step 1: dedupe parsed rows against the library. */
export async function checkCsvRows(rows: CsvRow[]): Promise<CsvCheckResult> {
  await requireAuth();
  const db = await getDb();
  const companyId = getCompany().companyId;

  const seen = new Set<string>();
  const cleaned: CsvRow[] = [];
  for (const row of rows) {
    const text = normalize(row.text ?? "");
    if (!text || seen.has(text)) continue;
    seen.add(text);
    cleaned.push({ ...row, text });
  }

  const existing = await db.keywords
    .find({ companyId, text: { $in: cleaned.map((r) => r.text) } })
    .project<{ text: string }>({ text: 1 })
    .toArray();
  const existingSet = new Set(existing.map((e) => e.text));

  return {
    fresh: cleaned.filter((r) => !existingSet.has(r.text)),
    duplicates: cleaned.filter((r) => existingSet.has(r.text)).map((r) => r.text),
  };
}

/** Upload tab step 2: insert the confirmed rows (source=csv, status=idea). */
export async function commitCsvRows(rows: CsvRow[]): Promise<number> {
  await requireAuth();
  const db = await getDb();
  const companyId = getCompany().companyId;
  const now = new Date();
  let inserted = 0;
  for (const row of rows) {
    const text = normalize(row.text ?? "");
    if (!text) continue;
    const doc: KeywordDoc = {
      companyId,
      text,
      source: "csv",
      status: "idea",
      ...(Number.isFinite(row.volume) ? { volume: row.volume } : {}),
      ...(Number.isFinite(row.difficulty) ? { difficulty: row.difficulty } : {}),
      ...(Number.isFinite(row.priority) ? { priority: row.priority } : {}),
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.keywords.insertOne(doc);
      inserted++;
    } catch {
      // unique index — row appeared since the check; skip silently
    }
  }
  revalidatePath("/keywords");
  revalidatePath("/strategy");
  return inserted;
}
