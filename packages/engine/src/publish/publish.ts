import { cfgGet, type CompanyConfig } from "../companyConfig.js";
import type { EngineDb } from "../db.js";
import { parseArticle } from "../frontmatter.js";
import type { Storage } from "../storage.js";
import type { ArticleDoc, Stage } from "../types.js";
import { HubSpotError, type HubSpotClient, type HubSpotPost } from "./hubspot.js";
import { PublishInputError, postFieldsFromArticle } from "./render.js";

/**
 * Review → HubSpot (roadmap Phase 5). Three operator actions, each explicit:
 *
 * - sendToHubSpot: create (or update) the post as a DRAFT with the hero
 *   image uploaded as its featured image; stage review → approved.
 * - goLive: PATCH state PUBLISHED; stage → published. Refuses while any
 *   deferred sibling link (D43) doesn't resolve to a live page.
 * - refreshFromHubSpot: pull state + URL back (someone may publish or
 *   edit in HubSpot directly).
 *
 * Status lands on article.hubspot and on the keyword the article came from.
 */

export interface PublishDeps {
  db: EngineDb;
  storage: Storage;
  company: CompanyConfig;
  client: HubSpotClient;
  /** Live-link probe for deferred links; injectable for tests. */
  probe?: (url: string) => Promise<boolean>;
}

export interface PublishResult {
  postId: string;
  url?: string;
  state: string;
  warnings: string[];
}

const IDS_KEY = "hubspot.ids";

async function defaultProbe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15_000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Blog + author IDs: company.yaml first, then the Mongo cache, then the API (then cached). */
export async function resolveHubSpotIds(deps: PublishDeps): Promise<{ blogId: string; authorId: string }> {
  const { db, company, client } = deps;
  const cached = ((await db.settings.findOne({ companyId: company.companyId, key: IDS_KEY }))?.value ?? {}) as {
    blogId?: string;
    authorId?: string;
  };
  let blogId = String(cfgGet(company, "hubspot.content_group_id", "") ?? "").trim() || cached.blogId || "";
  let authorId = String(cfgGet(company, "hubspot.blog_author_id", "") ?? "").trim() || cached.authorId || "";

  if (!blogId) {
    const blogs = await client.listBlogs();
    if (blogs.length === 0) throw new HubSpotError("No blogs found on this HubSpot account.");
    if (blogs.length > 1) {
      throw new HubSpotError(
        `This HubSpot account has ${blogs.length} blogs — set hubspot.content_group_id in company.yaml to one of: ` +
          blogs.map((b) => `${b.id} (${b.name ?? "?"}, ${b.absoluteUrl ?? "?"})`).join("; "),
      );
    }
    blogId = (blogs[0] as { id: string }).id;
  }
  if (!authorId) {
    const name = String(cfgGet(company, "author.name", "") ?? "").trim();
    if (!name) throw new HubSpotError("Set author.name (or hubspot.blog_author_id) in company.yaml.");
    const target = name.toLowerCase();
    const matches = (await client.listAuthors()).filter(
      (a) => (a.displayName ?? a.fullName ?? a.name ?? "").trim().toLowerCase() === target,
    );
    if (matches.length === 0) throw new HubSpotError(`No HubSpot blog author named "${name}" — create one, or set hubspot.blog_author_id.`);
    if (matches.length > 1) {
      throw new HubSpotError(
        `${matches.length} HubSpot authors are named "${name}" — set hubspot.blog_author_id to one of: ` +
          matches.map((a) => `${a.id}${a.email ? ` (${a.email})` : ""}`).join("; "),
      );
    }
    authorId = (matches[0] as { id: string }).id;
  }
  if (blogId !== cached.blogId || authorId !== cached.authorId) {
    await db.settings.updateOne(
      { companyId: company.companyId, key: IDS_KEY },
      { $set: { value: { blogId, authorId }, updatedAt: new Date() } },
      { upsert: true },
    );
  }
  return { blogId, authorId };
}

function stateOf(post: HubSpotPost): string {
  return String(post.currentState ?? post.state ?? "UNKNOWN");
}

/** The canonical the article declares vs where HubSpot actually put it (a mismatch breaks SEO signals). */
function canonicalWarning(article: ArticleDoc, url: string | undefined): string[] {
  const canonical = String(parseArticle(article.artifacts.article ?? "").frontmatter["canonical_url"] ?? "").trim();
  if (!canonical || !url) return [];
  const path = (u: string) => {
    try {
      return new URL(u, "https://x.invalid").pathname.replace(/\/+$/, "");
    } catch {
      return u;
    }
  };
  return path(canonical) === path(url)
    ? []
    : [`HubSpot URL ${url} doesn't match the article's canonical_url ${canonical} — check the HubSpot blog's root path.`];
}

async function missingDeferredLinks(deps: PublishDeps, article: ArticleDoc): Promise<string[]> {
  const probe = deps.probe ?? defaultProbe;
  const missing: string[] = [];
  for (const url of article.deferredLinks ?? []) {
    if (!(await probe(url))) missing.push(url);
  }
  return missing;
}

async function setStage(db: EngineDb, article: ArticleDoc, stage: Stage, extra: Record<string, unknown>): Promise<void> {
  const now = new Date();
  await db.articles.updateOne(
    { _id: article._id },
    {
      $set: { ...extra, updatedAt: now, ...(article.stage !== stage ? { stage } : {}) },
      ...(article.stage !== stage ? { $push: { stageHistory: { stage, at: now } } } : {}),
    },
  );
}

async function syncKeyword(db: EngineDb, article: ArticleDoc, status: "in_review" | "published"): Promise<void> {
  if (!article._id) return;
  await db.keywords.updateMany({ companyId: article.companyId, articleId: article._id }, { $set: { status, updatedAt: new Date() } });
}

/** Create the HubSpot draft (or update the existing post) from the article as it stands in Review. */
export async function sendToHubSpot(deps: PublishDeps, article: ArticleDoc): Promise<PublishResult> {
  if (!["review", "approved", "published"].includes(article.stage)) {
    throw new PublishInputError(`Only articles in review can be sent to HubSpot (stage: ${article.stage}).`);
  }
  const fields = postFieldsFromArticle(article, deps.company);
  const { blogId, authorId } = await resolveHubSpotIds(deps);
  const warnings: string[] = [];

  let featuredImage: string | undefined;
  if (article.header?.storageKey) {
    const png = await deps.storage.get(article.header.storageKey);
    featuredImage = (await deps.client.uploadFile(png, `${fields.slug}.png`, "/blog-headers", article.header.contentType ?? "image/png")).url;
  } else {
    warnings.push("No header image on the article — the post has no featured image.");
  }

  const body: Record<string, unknown> = {
    ...fields,
    contentGroupId: blogId,
    blogAuthorId: authorId,
    ...(featuredImage ? { featuredImage, useFeaturedImage: true } : { useFeaturedImage: false }),
  };
  const existing = article.hubspot?.postId;
  const post = existing ? await deps.client.updatePost(existing, body) : await deps.client.createPost({ ...body, state: "DRAFT" });
  const state = stateOf(post);
  warnings.push(...canonicalWarning(article, post.url));

  const missing = await missingDeferredLinks(deps, article);
  if (missing.length) warnings.push(`Deferred links not live yet (go-live will refuse until they are): ${missing.join(", ")}`);

  await setStage(deps.db, article, state === "PUBLISHED" ? "published" : "approved", {
    hubspot: {
      postId: String(post.id),
      ...(post.url ? { url: post.url } : {}),
      state,
      ...(featuredImage ? { featuredImageUrl: featuredImage } : {}),
      syncedAt: new Date(),
    },
  });
  await syncKeyword(deps.db, article, state === "PUBLISHED" ? "published" : "in_review");
  return { postId: String(post.id), ...(post.url ? { url: post.url } : {}), state, warnings };
}

/** Publish the HubSpot post. Refuses while deferred sibling links don't resolve (D43). */
export async function goLive(deps: PublishDeps, article: ArticleDoc): Promise<PublishResult> {
  const postId = article.hubspot?.postId;
  if (!postId) throw new PublishInputError("Send the article to HubSpot as a draft first.");
  const missing = await missingDeferredLinks(deps, article);
  if (missing.length) {
    throw new PublishInputError(`These internal links don't resolve to a live page yet: ${missing.join(", ")} — publish those articles first.`);
  }
  const post = await deps.client.updatePost(postId, { state: "PUBLISHED" });
  const state = stateOf(post);
  await setStage(deps.db, article, state === "PUBLISHED" ? "published" : article.stage, {
    hubspot: { ...article.hubspot, postId, ...(post.url ? { url: post.url } : {}), state, publishedAt: new Date(), syncedAt: new Date() },
  });
  if (state === "PUBLISHED") await syncKeyword(deps.db, article, "published");
  return { postId, ...(post.url ? { url: post.url } : {}), state, warnings: canonicalWarning(article, post.url) };
}

/** Pull state + URL back from HubSpot (5.4). */
export async function refreshFromHubSpot(deps: PublishDeps, article: ArticleDoc): Promise<PublishResult> {
  const postId = article.hubspot?.postId;
  if (!postId) throw new PublishInputError("This article hasn't been sent to HubSpot.");
  const post = await deps.client.getPost(postId);
  const state = stateOf(post);
  const stage: Stage = state === "PUBLISHED" ? "published" : article.stage === "published" ? "approved" : article.stage;
  await setStage(deps.db, article, stage, {
    hubspot: { ...article.hubspot, postId, ...(post.url ? { url: post.url } : {}), state, syncedAt: new Date() },
  });
  await syncKeyword(deps.db, article, state === "PUBLISHED" ? "published" : "in_review");
  return { postId, ...(post.url ? { url: post.url } : {}), state, warnings: [] };
}
