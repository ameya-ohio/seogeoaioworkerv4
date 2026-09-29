"use server";

import { revalidatePath } from "next/cache";
import { cfgGet, formatBySlug } from "@blogagent/engine";
import { requireAuth } from "../auth";
import { getCompany, getDb, getFormats } from "../db";

/**
 * Framer publishing (D52) and sign-off (D51). Saporo's site is on Framer, so
 * "publish" is: download the export bundle, paste it into Framer, then Mark
 * live — which checks the URL actually responds before the article counts
 * as published.
 */

export interface PublishingState {
  error?: string;
  message?: string;
}

export async function publishTarget(): Promise<"framer-export" | "hubspot"> {
  const t = String(cfgGet(getCompany(), "publish.target", "hubspot") ?? "hubspot");
  return t === "framer-export" ? "framer-export" : "hubspot";
}

async function load(slug: string) {
  const db = await getDb();
  const article = await db.articles.findOne({ companyId: getCompany().companyId, slug });
  return { db, article };
}

function revalidate(slug: string) {
  revalidatePath(`/production/review/${slug}`);
  revalidatePath("/production");
  revalidatePath("/articles");
}

/** Confirm the page is live at its URL (default: the canonical URL) and mark it published. */
export async function markArticleLive(slug: string, rawUrl?: string): Promise<PublishingState> {
  await requireAuth();
  const { db, article } = await load(slug);
  if (!article) return { error: "article not found" };
  if (!["review", "approved", "published"].includes(article.stage)) {
    return { error: `Only an article in review can be marked live (stage: ${article.stage}).` };
  }
  const url = (rawUrl ?? "").trim() || String(article.frontmatter?.["canonical_url"] ?? article.canonicalUrl ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return { error: "Enter the page's full URL (https://…)." };
  let status = 0;
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15_000) });
    status = res.status;
  } catch (err) {
    return { error: `Couldn't reach ${url}: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (status < 200 || status >= 400) return { error: `${url} answered ${status} — publish it in Framer first.` };
  const now = new Date();
  await db.articles.updateOne(
    { _id: article._id },
    {
      $set: { live: { url, verifiedAt: now, status }, updatedAt: now, ...(article.stage !== "published" ? { stage: "published" } : {}) },
      ...(article.stage !== "published" ? { $push: { stageHistory: { stage: "published" as const, at: now } } } : {}),
    },
  );
  await db.keywords.updateMany(
    { companyId: article.companyId, articleId: article._id },
    { $set: { status: "published", updatedAt: now } },
  );
  if (article.planItemId) {
    await db.planItems.updateOne({ _id: article.planItemId }, { $set: { publishedUrl: url, updatedAt: now } });
  }
  revalidate(slug);
  return { message: `Live at ${url} (HTTP ${status}).` };
}

/** D51: record the human sign-off a vendor-format page needs before export. */
export async function signOffArticle(slug: string, by: string, note?: string): Promise<PublishingState> {
  await requireAuth();
  const name = by.trim();
  if (!name) return { error: "Say who is signing off." };
  const { db, article } = await load(slug);
  if (!article) return { error: "article not found" };
  const format = formatBySlug(await getFormats(), article.facets?.articleType);
  if (!format.signoff) return { error: `${format.label} pages don't need a sign-off.` };
  await db.articles.updateOne(
    { _id: article._id },
    { $set: { signoff: { by: name, at: new Date(), ...(note?.trim() ? { note: note.trim() } : {}) }, updatedAt: new Date() } },
  );
  revalidate(slug);
  return { message: `Signed off by ${name}.` };
}
