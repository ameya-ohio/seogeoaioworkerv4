"use server";

import { revalidatePath } from "next/cache";
import {
  enqueueRerun,
  parseArticle,
  type WorkStage,
  WORK_STAGES,
} from "@blogagent/engine";
import { requireAuth } from "../auth";
import { getCompany, getDb } from "../db";

export interface SaveState {
  error?: string;
  savedAt?: string;
}

/** Review tab: save the edited markdown (D7 — source-faithful, exact bytes). */
export async function saveArticleMarkdown(slug: string, content: string): Promise<SaveState> {
  await requireAuth();
  const db = await getDb();
  const companyId = getCompany().companyId;
  const article = await db.articles.findOne({ companyId, slug });
  if (!article) return { error: `No article with slug ${slug}` };
  const { frontmatter } = parseArticle(content);
  await db.articles.updateOne(
    { _id: article._id },
    { $set: { "artifacts.article": content, frontmatter, updatedAt: new Date() } },
  );
  revalidatePath(`/production/review/${slug}`);
  revalidatePath("/articles");
  return { savedAt: new Date().toISOString() };
}

export async function approveArticle(slug: string): Promise<SaveState> {
  await requireAuth();
  const db = await getDb();
  const companyId = getCompany().companyId;
  const article = await db.articles.findOne({ companyId, slug });
  if (!article) return { error: `No article with slug ${slug}` };
  if (article.stage !== "review") {
    return { error: `Only articles in review can be approved (stage: ${article.stage}).` };
  }
  const now = new Date();
  await db.articles.updateOne(
    { _id: article._id },
    {
      $set: { stage: "approved", updatedAt: now },
      $push: { stageHistory: { stage: "approved" as const, at: now } },
    },
  );
  revalidatePath("/production");
  revalidatePath(`/production/review/${slug}`);
  return { savedAt: now.toISOString() };
}

export async function rerunPhase(slug: string, phase: string): Promise<SaveState> {
  await requireAuth();
  if (!(WORK_STAGES as readonly string[]).includes(phase)) {
    return { error: `Unknown phase: ${phase}` };
  }
  const db = await getDb();
  const companyId = getCompany().companyId;
  const article = await db.articles.findOne({ companyId, slug });
  if (!article) return { error: `No article with slug ${slug}` };
  try {
    await enqueueRerun(db, article, phase as WorkStage);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath("/production");
  revalidatePath(`/production/review/${slug}`);
  return { savedAt: new Date().toISOString() };
}
