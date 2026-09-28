"use server";

import { revalidatePath } from "next/cache";
import {
  HubSpotError,
  PublishInputError,
  enqueueRerun,
  goLive,
  hubspotClientFromEnv,
  hubspotTokenEnv,
  parseArticle,
  refreshFromHubSpot,
  sendToHubSpot,
  type ArticleDoc,
  type PublishDeps,
  type PublishResult,
  type WorkStage,
  WORK_STAGES,
} from "@blogagent/engine";
import { requireAuth } from "../auth";
import { getCompany, getDb, getStorage } from "../db";

export interface SaveState {
  error?: string;
  savedAt?: string;
  /** Publish actions: things the operator should look at even though it worked. */
  warnings?: string[];
  url?: string;
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

/* ---------------- HubSpot publishing (roadmap Phase 5) ---------------- */

export async function hubspotStatus(): Promise<{ configured: boolean; tokenEnv: string }> {
  await requireAuth();
  const company = getCompany();
  return { configured: hubspotClientFromEnv(company) !== null, tokenEnv: hubspotTokenEnv(company) };
}

async function withPublishDeps(
  slug: string,
  fn: (deps: PublishDeps, article: ArticleDoc) => Promise<PublishResult>,
): Promise<SaveState> {
  await requireAuth();
  const company = getCompany();
  const client = hubspotClientFromEnv(company);
  if (!client) {
    return { error: `HubSpot isn't configured — set ${hubspotTokenEnv(company)} on the web service.` };
  }
  const db = await getDb();
  const article = await db.articles.findOne({ companyId: company.companyId, slug });
  if (!article) return { error: `No article with slug ${slug}` };
  try {
    const res = await fn({ db, storage: getStorage(), company, client }, article);
    revalidatePath("/production");
    revalidatePath("/articles");
    revalidatePath(`/production/review/${slug}`);
    return {
      savedAt: new Date().toISOString(),
      warnings: res.warnings,
      ...(res.url ? { url: res.url } : {}),
    };
  } catch (err) {
    if (err instanceof PublishInputError || err instanceof HubSpotError) return { error: err.message };
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Create the HubSpot draft, or update the existing post (live posts update live). */
export async function sendArticleToHubSpot(slug: string): Promise<SaveState> {
  return withPublishDeps(slug, sendToHubSpot);
}

export async function publishArticleLive(slug: string): Promise<SaveState> {
  return withPublishDeps(slug, goLive);
}

export async function refreshArticleFromHubSpot(slug: string): Promise<SaveState> {
  return withPublishDeps(slug, refreshFromHubSpot);
}
