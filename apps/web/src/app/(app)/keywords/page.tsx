import Link from "next/link";
import type { Filter } from "mongodb";
import type { KeywordDoc } from "@blogagent/engine";
import { getCompany, getDb } from "@/lib/db";
import { toUiKeyword, type UiKeyword } from "@/lib/ui-types";
import { PageHeader, cls } from "@/components/ui";
import { KeywordsTable } from "@/components/keywords-table";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["all", "idea", "queued", "in_production", "in_review", "published", "archived"];

export default async function KeywordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "all";
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";

  const db = await getDb();
  const companyId = getCompany().companyId;

  const filter: Filter<KeywordDoc> = { companyId };
  if (status !== "all") filter.status = status as KeywordDoc["status"];
  else filter.status = { $ne: "archived" };
  if (q) filter.text = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

  const docs = await db.keywords
    .find(filter)
    .sort({ priority: -1, volume: -1, updatedAt: -1 })
    .limit(500)
    .toArray();

  // Resolve linked article slugs for in-production/published keywords.
  const articleIds = docs.map((d) => d.articleId).filter((id): id is NonNullable<typeof id> => Boolean(id));
  const articles = articleIds.length
    ? await db.articles
        .find({ _id: { $in: articleIds } })
        .project<{ _id: (typeof articleIds)[number]; slug: string }>({ slug: 1 })
        .toArray()
    : [];
  const slugById = new Map(articles.map((a) => [a._id.toHexString(), a.slug]));

  const rows: UiKeyword[] = docs.map((d) =>
    toUiKeyword(d, d.articleId ? (slugById.get(d.articleId.toHexString()) ?? null) : null),
  );

  const counts = await db.keywords
    .aggregate<{ _id: string; n: number }>([
      { $match: { companyId } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ])
    .toArray();
  const countByStatus = new Map(counts.map((c) => [c._id, c.n]));
  const total = counts.reduce((s, c) => s + c.n, 0);

  return (
    <>
      <PageHeader
        title="Target Keywords"
        subtitle={`${total} keyword${total === 1 ? "" : "s"} in the library`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => {
          const n = s === "all" ? total : (countByStatus.get(s) ?? 0);
          return (
            <Link
              key={s}
              href={s === "all" ? "/keywords" : `/keywords?status=${s}`}
              className={cls(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                s === status
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
              )}
            >
              {s.replace("_", " ")} {n > 0 && <span className="opacity-60">({n})</span>}
            </Link>
          );
        })}
        <form className="ml-auto" action="/keywords" method="get">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search keywords…"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-accent focus:outline-none"
          />
        </form>
      </div>
      <KeywordsTable rows={rows} />
    </>
  );
}
