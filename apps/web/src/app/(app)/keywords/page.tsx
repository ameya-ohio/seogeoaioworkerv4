import Link from "next/link";
import type { Filter } from "mongodb";
import { Search, Upload } from "lucide-react";
import type { KeywordDoc } from "@blogagent/engine";
import { getCompany, getDb } from "@/lib/db";
import { toUiKeyword, type UiKeyword } from "@/lib/ui-types";
import { Page, SegmentedNav, cls, inputCls } from "@/components/kit";
import { KeywordsTable } from "@/components/keywords-table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "idea", label: "Ideas" },
  { key: "queued", label: "Queued" },
  { key: "in_production", label: "In production" },
  { key: "in_review", label: "In review" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

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
  // "All" lists everything but the archive, so its count does too.
  const active = total - (countByStatus.get("archived") ?? 0);

  const statusHref = (s: string) => {
    const qs = [s !== "all" ? `status=${s}` : "", q ? `q=${encodeURIComponent(q)}` : ""].filter(Boolean).join("&");
    return qs ? `/keywords?${qs}` : "/keywords";
  };
  const statusItems = STATUS_FILTERS.some((s) => s.key === status) ? STATUS_FILTERS : [...STATUS_FILTERS, { key: status, label: status.replace("_", " ") }];

  return (
    <Page
      crumbs={[{ label: "Keywords" }]}
      title="Keywords"
      subtitle={`${total} keyword${total === 1 ? "" : "s"} in the library. Select a few and send them to the pipeline.`}
      width="wide"
      actions={
        <Button variant="secondary" asChild>
          <Link href="/strategy?tab=upload">
            <Upload data-icon="inline-start" />
            Import CSV
          </Link>
        </Button>
      }
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedNav
          label="Filter keywords"
          active={status}
          items={statusItems.map((s) => ({
            key: s.key,
            label: s.label,
            count: s.key === "all" ? active : (countByStatus.get(s.key) ?? 0),
            href: statusHref(s.key),
          }))}
        />
        <form action="/keywords" method="get" role="search" className="relative">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-label-3" />
          <label htmlFor="keyword-search" className="sr-only">
            Search keywords
          </label>
          <input
            id="keyword-search"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search keywords"
            className={cls(inputCls, "w-64 pl-8")}
          />
        </form>
      </div>
      <KeywordsTable rows={rows} filtered={Boolean(q) || status !== "all"} />
    </Page>
  );
}
