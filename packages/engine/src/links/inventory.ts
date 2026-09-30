import type { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import type { PlanItemDoc } from "../plan/types.js";
import type { ArticleDoc } from "../types.js";

/**
 * Internal-link inventory (D53).
 *
 * The Writer used to get the pages it could link to as bare TITLES labelled
 * "Hub:" and "Sibling spoke:", with an instruction to mention unpublished
 * pages in plain text. That produced "see [Full Title]" footnotes, "the hub
 * page" jargon, duplicate links, and lead-ins that promised something the
 * destination didn't deliver. The inventory gives it, per target: what the
 * page actually covers, its query, its real URL (reserved /learn/ path, so a
 * planned page can be linked from day one), whether it is live yet, and the
 * anchors other articles already use for it — so anchors vary and never
 * collide across the site.
 */

export type LinkTargetStatus = "live" | "in_production" | "planned";

export interface LinkTarget {
  url: string;
  path: string;
  title: string;
  /** The page's own search query — a phrase an anchor can vary on. */
  query: string;
  /** What the destination delivers, from its brief: the test for a lead-in. */
  covers: string;
  status: LinkTargetStatus;
  /** Anchors other articles already use for this page. */
  anchorsUsed: string[];
}

const MAX_TARGETS = 14;

function coversOf(item: PlanItemDoc): string {
  const label = item.brief.page?.articleTypeLabel ?? item.format ?? "";
  const passages = item.brief.h2Outline.slice(0, 3).join("; ");
  return `${label ? `${label}. ` : ""}${passages}`.slice(0, 320);
}

function statusOf(item: PlanItemDoc, article: Pick<ArticleDoc, "stage" | "live"> | undefined): LinkTargetStatus {
  if (item.publishedUrl || article?.live || article?.stage === "published") return "live";
  if (item.articleId) return "in_production";
  return "planned";
}

/**
 * The pages this article may link to: its parent and grandparent, its
 * siblings in the same subtopic, and (for a pillar or hub) its children.
 * Non-producible pages (an offer page marketing builds) are left out.
 */
export async function buildLinkInventory(
  db: EngineDb,
  article: Pick<ArticleDoc, "_id" | "companyId" | "planItemId">,
  siteBase: string,
): Promise<LinkTarget[]> {
  if (!article.planItemId) return [];
  const self = await db.planItems.findOne({ _id: article.planItemId });
  if (!self) return [];

  const ids = new Set<string>();
  const picked: PlanItemDoc[] = [];
  const add = (it: PlanItemDoc | null | undefined) => {
    if (!it?._id || it._id.equals(self._id as ObjectId) || ids.has(it._id.toHexString())) return;
    if (it.held?.kind === "not_producible" || !it.path) return;
    ids.add(it._id.toHexString());
    picked.push(it);
  };

  const parent = self.parentItemId ? await db.planItems.findOne({ _id: self.parentItemId }) : null;
  add(parent);
  if (parent?.parentItemId) add(await db.planItems.findOne({ _id: parent.parentItemId }));
  for (const c of await db.planItems.find({ planId: self.planId, parentItemId: self._id }).sort({ sequence: 1 }).toArray()) add(c);
  if (self.subtopicId) {
    const siblings = await db.planItems
      .find({ planId: self.planId, subtopicId: self.subtopicId, pageRole: "cluster" })
      .sort({ sequence: 1 })
      .toArray();
    for (const s of siblings) add(s);
  }

  const base = siteBase.replace(/\/+$/, "");
  const chosen = picked.slice(0, MAX_TARGETS);
  const articleIds = chosen.map((c) => c.articleId).filter((x): x is ObjectId => Boolean(x));
  const articles = articleIds.length
    ? await db.articles.find({ _id: { $in: articleIds } }).project<Pick<ArticleDoc, "_id" | "stage" | "live">>({ stage: 1, live: 1 }).toArray()
    : [];
  const byId = new Map(articles.map((a) => [a._id?.toHexString(), a]));

  const targets: LinkTarget[] = [];
  for (const it of chosen) {
    const url = `${base}${it.path}`;
    const used = await db.articles
      .find({ companyId: article.companyId, "internalLinks.url": url, ...(article._id ? { _id: { $ne: article._id } } : {}) })
      .project<Pick<ArticleDoc, "internalLinks">>({ internalLinks: 1 })
      .limit(50)
      .toArray();
    const anchorsUsed = [
      ...new Set(used.flatMap((a) => (a.internalLinks ?? []).filter((l) => l.url === url).map((l) => l.anchor))),
    ];
    targets.push({
      url,
      path: it.path as string,
      title: it.title,
      query: it.primaryQueryTarget,
      covers: coversOf(it),
      status: statusOf(it, it.articleId ? byId.get(it.articleId.toHexString()) : undefined),
      anchorsUsed,
    });
  }
  return targets;
}

/** The page.md section: the rules, then one entry per target. */
export function renderLinkInventory(targets: LinkTarget[]): string {
  if (targets.length === 0) return "";
  const lines = [
    `## Internal link inventory (D53)`,
    ``,
    `Link only to these pages, each **at most once**, at the point where the reader needs it.`,
    ``,
    `- Write the link into the sentence with a 2–7 word anchor that says what the reader gets:`,
    `  "…and [what causes identity exposure in hybrid environments](url) breaks down each one."`,
    `  Never "See [Title]", "For more, see…", or an anchor like "here", "this article", "learn more".`,
    `- Don't name the site structure ("the hub page", "pillar page", "cluster article"); describe the page.`,
    `- The sentence leading into a link must match what the page **covers** below — a mismatch fails the gate.`,
    `- Vary anchors: the page's query, a natural variant, or a partial match — not its full title. Don't reuse an`,
    `  anchor listed as already used, and never give two different pages the same anchor.`,
    `- Use the full URL exactly as listed. Planned pages are linked now; the export shows them as text until they're live.`,
    ``,
  ];
  for (const t of targets) {
    lines.push(
      `- **${t.title}** — ${t.url} (${t.status.replace("_", " ")})`,
      `  - Query: ${t.query}`,
      `  - Covers: ${t.covers}`,
      ...(t.anchorsUsed.length ? [`  - Anchors already used elsewhere: ${t.anchorsUsed.map((a) => `"${a}"`).join(", ")}`] : []),
    );
  }
  lines.push(``);
  return lines.join("\n");
}

export interface MarkdownLink {
  anchor: string;
  url: string;
  /** The sentence the link sits in (link syntax stripped). */
  sentence: string;
}

/** Every [anchor](url) in a markdown body, with the sentence around it. */
export function extractMarkdownLinks(body: string): MarkdownLink[] {
  const out: MarkdownLink[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const para of body.split(/\n\s*\n/)) {
    for (const m of para.matchAll(re)) {
      const at = m.index ?? 0;
      const start = Math.max(para.lastIndexOf(". ", at) + 1, para.lastIndexOf("\n", at) + 1, 0);
      const endDot = para.indexOf(". ", at + m[0].length);
      const end = endDot === -1 ? para.length : endDot + 1;
      const sentence = para
        .slice(start, end)
        .replace(re, "$1")
        .replace(/[*_`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      out.push({ anchor: (m[1] ?? "").trim(), url: (m[2] ?? "").trim(), sentence });
    }
  }
  return out;
}

/** Normalised anchor text for comparisons. */
export function anchorKey(anchor: string): string {
  return anchor.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * D53: the article's deferred internal links whose target still isn't live —
 * what the export must render as text. A target counts as live once it has a
 * marked-live URL or is published, matched by URL or reserved path.
 */
export async function stillDeferredLinks(
  db: EngineDb,
  article: Pick<ArticleDoc, "companyId" | "linkChecks">,
): Promise<{ url: string; anchor?: string }[]> {
  const deferred = (article.linkChecks?.results ?? []).filter((r) => r.status === "deferred");
  const out: { url: string; anchor?: string }[] = [];
  for (const d of deferred) {
    let path = "";
    try {
      path = new URL(d.url).pathname;
    } catch {
      path = "";
    }
    const paths = path ? [path.endsWith("/") ? path : `${path}/`, path.replace(/\/+$/, "")] : [];
    const live = await db.articles.findOne({
      companyId: article.companyId,
      $or: [
        { "live.url": d.url },
        ...(paths.length ? [{ path: { $in: paths }, stage: "published" as const }] : []),
      ],
    });
    if (!live) out.push({ url: d.url, ...(d.anchor ? { anchor: d.anchor } : {}) });
  }
  return out;
}

/** D53: articles whose deferred links point at this URL — they need a re-export once it's live. */
export async function articlesWaitingOn(
  db: EngineDb,
  companyId: string,
  url: string,
): Promise<{ slug: string; title: string }[]> {
  const norm = url.replace(/\/+$/, "");
  const docs = await db.articles
    .find({ companyId, "linkChecks.results": { $elemMatch: { status: "deferred", url: { $in: [norm, `${norm}/`] } } } })
    .project<Pick<ArticleDoc, "slug" | "topic" | "frontmatter">>({ slug: 1, topic: 1, frontmatter: 1 })
    .toArray();
  return docs.map((d) => ({ slug: d.slug, title: String(d.frontmatter?.["title"] ?? d.topic) }));
}
