import type { ObjectId } from "mongodb";
import type { EngineDb } from "./db.js";
import { createArticle, getArticleBySlug } from "./dal/articles.js";
import { enqueueRun } from "./dal/runs.js";
import { emitEvent } from "./dal/events.js";
import type { ArticleBrief, ArticleDoc, ArticleFacets, RunDoc, WorkStage } from "./types.js";
import { GENERIC_FORMAT_SLUG } from "./formats.js";

/** Mirrors scripts/new_article.py slug rules (lowercase, hyphenated, ≤ 60). */
export function slugify(raw: string): string {
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) throw new Error("Slug cannot be empty after normalization.");
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/g, "");
  return s;
}

export interface EnqueueArticleInput {
  companyId: string;
  topic: string;
  keyword?: string;
  slug?: string;
  fromStage?: WorkStage;
  maxAttempts?: number;
  /**
   * Theme whose accepted spoke brief should ride along as a first-class
   * Strategist input (4.12). The brief is resolved from the themes/clusters
   * collections and stamped onto the article doc.
   */
  themeId?: ObjectId;
  /**
   * Plan item whose brief should ride along the same way. Mutually exclusive
   * with themeId in practice; themeId wins if both are given.
   */
  /** Operator- or keyword-supplied facets; a brief's own facets win over these. */
  facets?: ArticleFacets;
  planItemId?: ObjectId;
  /** Extra provenance for the run.queued event (plan id, sequence, fire). */
  eventData?: Record<string, unknown>;
}

export class SlugTakenError extends Error {
  constructor(
    public slug: string,
    public existingStage: string,
  ) {
    super(`Article with slug "${slug}" already exists (stage: ${existingStage}).`);
  }
}

/**
 * The one shared "start an article run" operation (used by the worker CLI
 * and the web app's Chat/Select/Keywords flows): create the article doc,
 * queue a pipeline run, emit the queued event.
 */
export async function enqueueArticlePipeline(
  db: EngineDb,
  input: EnqueueArticleInput,
): Promise<{ article: ArticleDoc; run: RunDoc }> {
  const slug = slugify(input.slug ?? input.keyword ?? input.topic);
  const existing = await getArticleBySlug(db, input.companyId, slug);
  if (existing) throw new SlugTakenError(slug, existing.stage);

  let brief: ArticleBrief | undefined;
  let pendingLinks: string[] | undefined;
  let planId: ObjectId | undefined;
  let facets: ArticleFacets | undefined = input.facets;
  let path: string | undefined;
  let trail: { name: string; path: string }[] | undefined;
  if (input.themeId) {
    const theme = await db.themes.findOne({ _id: input.themeId });
    const cluster = theme ? await db.clusters.findOne({ _id: theme.clusterId }) : null;
    const spokeBrief = cluster?.spokeBriefs?.find((b) => b.themeName === theme?.name);
    if (theme?._id && cluster?._id && spokeBrief) {
      brief = {
        source: "cluster",
        clusterId: cluster._id,
        themeId: theme._id,
        themeName: theme.name,
        markdown: spokeBrief.markdown,
        lengthBand: spokeBrief.lengthBand,
        // Carry the structured brief so h2Outline / evidence / internalLinks
        // are queryable per article, not just embedded in the markdown.
        spec: spokeBrief,
      };
      if (spokeBrief.page) {
        facets = {
          pageRole: spokeBrief.page.pageRole,
          searchIntent: spokeBrief.page.searchIntent as ArticleFacets["searchIntent"],
          articleType: spokeBrief.page.articleType,
          funnel: spokeBrief.page.funnel as ArticleFacets["funnel"],
          source: "cluster",
        };
        brief.facets = facets;
      }
      // D35: hub + sibling spokes are PLANNED pages — plain mentions until
      // they publish; Phase 5 backfills the links.
      pendingLinks = [spokeBrief.internalLinks.hub, ...spokeBrief.internalLinks.siblings].filter(
        Boolean,
      );
    }
  } else if (input.planItemId) {
    const item = await db.planItems.findOne({ _id: input.planItemId });
    if (item) {
      planId = item.planId;
      brief = {
        source: "plan",
        externalId: item.externalId,
        themeName: item.subtopicName ?? item.pillarName,
        markdown: item.brief.markdown,
        lengthBand: item.brief.lengthBand,
        spec: item.brief,
        pageRole: item.pageRole,
      };
      facets = {
        pageRole: item.pageRole,
        searchIntent: item.searchIntent,
        articleType: item.articleType ?? item.brief.page?.articleType ?? GENERIC_FORMAT_SLUG,
        funnel: item.funnel,
        source: "plan",
      };
      brief.facets = facets;
      path = item.path ?? item.brief.page?.path;
      // Breadcrumb trail (D46): walk up the plan to the pillar.
      if (path) {
        const chain: { name: string; path: string }[] = [{ name: item.title, path }];
        let parentId = item.parentItemId;
        for (let depth = 0; parentId && depth < 3; depth++) {
          const parent = await db.planItems.findOne({ _id: parentId });
          if (!parent?.path) break;
          chain.unshift({
            name: parent.pageRole === "pillar" ? parent.pillarName : (parent.subtopicName ?? parent.title),
            path: parent.path,
          });
          parentId = parent.parentItemId;
        }
        trail = chain;
      }
      // A routing page also links DOWN to its children; all of them are
      // planned pages, so they are plain mentions until they exist (D35).
      pendingLinks = [
        item.brief.internalLinks.hub,
        ...item.brief.internalLinks.siblings,
        ...(item.brief.internalLinks.children ?? []),
      ].filter(Boolean);
      // A parent deliberately skipped by the operator may never exist, so do
      // not ask the writer to mention it.
      if (item.parentSkipped) {
        pendingLinks = pendingLinks.filter((l) => l !== item.brief.internalLinks.hub);
      }
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const article = await createArticle(db, {
    companyId: input.companyId,
    slug,
    folder: `${date}-${slug}`,
    topic: input.topic,
    ...(input.keyword ? { targetKeyword: input.keyword } : {}),
    ...(brief ? { brief } : {}),
    ...(pendingLinks?.length ? { pendingLinks } : {}),
    ...(facets ? { facets } : {}),
    ...(path ? { path } : {}),
    ...(trail ? { trail } : {}),
    ...(planId ? { planId } : {}),
    ...(input.planItemId ? { planItemId: input.planItemId } : {}),
  });
  const run = await enqueueRun(db, {
    companyId: input.companyId,
    articleId: article._id as ObjectId,
    fromStage: input.fromStage ?? "research",
    ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
  });
  await emitEvent(db, {
    companyId: input.companyId,
    runId: run._id as ObjectId,
    articleId: article._id as ObjectId,
    type: "run.queued",
    message: `Queued: "${input.topic}"${input.keyword ? ` (keyword: ${input.keyword})` : ""}`,
    ...(input.eventData ? { data: input.eventData } : {}),
  });
  return { article, run };
}

/** Queue a re-run of an existing article from a given phase (Review tab). */
export async function enqueueRerun(
  db: EngineDb,
  article: ArticleDoc,
  fromStage: WorkStage,
  maxAttempts?: number,
): Promise<RunDoc> {
  const articleId = article._id;
  if (!articleId) throw new Error("article has no _id");
  const active = await db.runs.findOne({
    articleId,
    status: { $in: ["queued", "running"] },
  });
  if (active) {
    throw new Error(`Article already has an active run (${active.status}).`);
  }
  const run = await enqueueRun(db, {
    companyId: article.companyId,
    articleId,
    fromStage,
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
  });
  await emitEvent(db, {
    companyId: article.companyId,
    runId: run._id as ObjectId,
    articleId,
    type: "run.queued",
    message: `Re-run queued from ${fromStage}`,
  });
  return run;
}
