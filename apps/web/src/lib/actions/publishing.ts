"use server";

import { revalidatePath } from "next/cache";
import { articlesWaitingOn, cfgGet, formatBySlug } from "@blogagent/engine";
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
  // D53: other articles link here as a deferred link — their packages can now carry it.
  const waiting = await articlesWaitingOn(db, article.companyId, url);
  return {
    message:
      `Live at ${url} (HTTP ${status}).` +
      (waiting.length
        ? ` ${waiting.length} article(s) link here and can now be re-downloaded with the link on: ${waiting.map((w) => w.slug).join(", ")}.`
        : ""),
  };
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

/**
 * D45: an operator changes a page's facets from the Review screen. The new
 * type only takes effect on the next run — the page has to be rebuilt for
 * its new format — so the caller is told to re-run from the outline.
 */
export async function setArticleFacets(
  slug: string,
  facets: { pageRole: string; articleType: string; searchIntent: string; funnel: string },
): Promise<PublishingState> {
  await requireAuth();
  const roles = ["pillar", "hub", "cluster"];
  const intents = ["informational", "commercial", "transactional", "navigational"];
  const funnels = ["tofu", "mofu", "bofu"];
  if (!roles.includes(facets.pageRole)) return { error: `unknown page role "${facets.pageRole}"` };
  if (!intents.includes(facets.searchIntent)) return { error: `unknown search intent "${facets.searchIntent}"` };
  if (!funnels.includes(facets.funnel)) return { error: `unknown funnel "${facets.funnel}"` };
  const reg = await getFormats();
  if (facets.articleType !== "generic" && !reg.formats.some((f) => f.slug === facets.articleType)) {
    return { error: `"${facets.articleType}" is not in formats.json` };
  }
  const { db, article } = await load(slug);
  if (!article) return { error: "article not found" };
  const next = {
    pageRole: facets.pageRole as "pillar" | "hub" | "cluster",
    articleType: facets.articleType,
    searchIntent: facets.searchIntent as "informational" | "commercial" | "transactional" | "navigational",
    funnel: facets.funnel as "tofu" | "mofu" | "bofu",
    source: "operator" as const,
  };
  await db.articles.updateOne({ _id: article._id }, { $set: { facets: next, updatedAt: new Date() } });
  revalidate(slug);
  const typeChanged = article.facets?.articleType !== next.articleType || article.facets?.pageRole !== next.pageRole;
  return {
    message: typeChanged
      ? "Facets saved. Re-run from outline so the page is rebuilt for its new format."
      : "Facets saved. The next run uses them.",
  };
}
