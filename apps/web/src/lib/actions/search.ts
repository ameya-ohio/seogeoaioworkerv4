"use server";

import { getCompany, getDb } from "@/lib/db";

export interface SearchHit {
  kind: "article" | "keyword" | "plan";
  id: string;
  title: string;
  meta: string;
  href: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ⌘K search: articles by title/keyword, keywords by text, plans by filename. */
export async function searchEverything(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const db = await getDb();
  const companyId = getCompany().companyId;
  const rx = new RegExp(escapeRegex(q), "i");

  const [articles, keywords, plans] = await Promise.all([
    db.articles
      .find({ companyId, $or: [{ "frontmatter.title": rx }, { topic: rx }, { targetKeyword: rx }, { slug: rx }] })
      .project<{ slug: string; topic?: string; stage: string; frontmatter?: Record<string, unknown> }>({ slug: 1, topic: 1, stage: 1, "frontmatter.title": 1 })
      .sort({ updatedAt: -1 })
      .limit(8)
      .toArray(),
    db.keywords.find({ companyId, text: rx }).project<{ _id: unknown; text: string; status: string }>({ text: 1, status: 1 }).limit(5).toArray(),
    db.plans.find({ companyId, filename: rx }).project<{ _id: { toHexString(): string }; filename: string }>({ filename: 1 }).limit(4).toArray(),
  ]);

  const review = (stage: string) => stage === "review" || stage === "approved";
  return [
    ...articles.map((a) => ({
      kind: "article" as const,
      id: a.slug,
      title: String(a.frontmatter?.["title"] ?? a.topic ?? a.slug),
      meta: a.stage.replace(/_/g, " "),
      href: review(a.stage) ? `/production/review/${a.slug}` : `/articles/${a.slug}`,
    })),
    ...keywords.map((k) => ({
      kind: "keyword" as const,
      id: String(k._id),
      title: k.text,
      meta: k.status.replace(/_/g, " "),
      href: `/keywords?q=${encodeURIComponent(k.text)}`,
    })),
    ...plans.map((p) => ({
      kind: "plan" as const,
      id: p._id.toHexString(),
      title: p.filename,
      meta: "Content plan",
      href: `/plans/${p._id.toHexString()}`,
    })),
  ];
}
