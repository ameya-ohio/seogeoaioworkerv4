import Link from "next/link";
import { ExternalLink, FileText, Globe, ImageIcon, LayoutGrid, List, Pencil, Plus } from "lucide-react";
import { getCompany, getDb, getFormatLabels } from "@/lib/db";
import { toUiArticleSummary, type UiArticleSummary } from "@/lib/ui-types";
import { FUNNEL_LONG, FacetBadges } from "@/components/facets";
import { Card, EmptyState, FilterChip, Page, SegmentedNav, Status, StageBadge, cls, stageFamily, stageLabel, tableCls } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";

/** Stages still moving through the pipeline: the "In production" filter. */
const PRODUCTION_STAGES = ["queued", "research", "interview", "evidence", "outline", "write", "hdcp", "edit", "verify", "schema", "design", "publishing", "paused"];

const STAGE_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "production", label: "In production" },
  { key: "review", label: "In review" },
  { key: "approved", label: "Approved" },
  { key: "published", label: "Published" },
  { key: "failed", label: "Failed" },
];

const FUNNELS = ["tofu", "mofu", "bofu"] as const;

function stageMatch(stage: string): unknown {
  return stage === "production" ? { $in: PRODUCTION_STAGES } : stage;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Where a card opens: drafts that need a decision go to review, the rest to the reader. */
function cardHref(a: UiArticleSummary): string {
  return a.stage === "review" || a.stage === "approved" ? `/production/review/${a.slug}` : `/articles/${a.slug}`;
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const stage = typeof params.stage === "string" ? params.stage : "all";
  const funnel = typeof params.funnel === "string" && (FUNNELS as readonly string[]).includes(params.funnel) ? params.funnel : "all";
  const view = params.view === "list" ? "list" : "grid";

  const db = await getDb();
  const companyId = getCompany().companyId;
  const filter: Record<string, unknown> = { companyId };
  if (stage !== "all") filter.stage = stageMatch(stage);
  if (funnel !== "all") filter["facets.funnel"] = funnel;

  const [docs, labels, stageCounts, funnelCounts] = await Promise.all([
    db.articles.find(filter).sort({ updatedAt: -1 }).limit(300).toArray(),
    getFormatLabels(),
    db.articles
      .aggregate<{ _id: string; n: number }>([
        { $match: { companyId, ...(funnel !== "all" ? { "facets.funnel": funnel } : {}) } },
        { $group: { _id: "$stage", n: { $sum: 1 } } },
      ])
      .toArray(),
    db.articles
      .aggregate<{ _id: string | null; n: number }>([
        { $match: { companyId, ...(stage !== "all" ? { stage: stageMatch(stage) } : {}) } },
        { $group: { _id: "$facets.funnel", n: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const rows = docs.map((d) => toUiArticleSummary(d, labels));

  const byStage = new Map(stageCounts.map((c) => [c._id, c.n]));
  const stageCount = (key: string) =>
    key === "all"
      ? stageCounts.reduce((s, c) => s + c.n, 0)
      : key === "production"
        ? PRODUCTION_STAGES.reduce((s, k) => s + (byStage.get(k) ?? 0), 0)
        : (byStage.get(key) ?? 0);
  const byFunnel = new Map(funnelCounts.map((c) => [c._id ?? "", c.n]));
  const funnelTotal = funnelCounts.reduce((s, c) => s + c.n, 0);

  const href = (s: string, f: string, v: string = view) => {
    const q = [s !== "all" ? `stage=${s}` : "", f !== "all" ? `funnel=${f}` : "", v !== "grid" ? `view=${v}` : ""].filter(Boolean).join("&");
    return q ? `/articles?${q}` : "/articles";
  };

  // An unknown stage from an old link still filters; show it as its own segment.
  const stageItems = STAGE_FILTERS.some((s) => s.key === stage) ? STAGE_FILTERS : [...STAGE_FILTERS, { key: stage, label: stageLabel(stage) }];
  const filtered = stage !== "all" || funnel !== "all";

  return (
    <Page
      crumbs={[{ label: "Articles" }]}
      title="Articles"
      subtitle="Everything the engine has written, newest first."
      width="wide"
      actions={
        <Button asChild>
          <Link href="/strategy">
            <Plus data-icon="inline-start" />
            New article
          </Link>
        </Button>
      }
    >
      <div className="mb-7 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedNav
            label="Filter by stage"
            active={stage}
            items={stageItems.map((s) => ({ key: s.key, label: s.label, count: stageCount(s.key), href: href(s.key, funnel) }))}
          />
          <SegmentedNav
            label="Layout"
            size="sm"
            active={view}
            items={[
              {
                key: "grid",
                href: href(stage, funnel, "grid"),
                label: (
                  <>
                    <LayoutGrid aria-hidden className="size-4" />
                    <span className="sr-only">Gallery</span>
                  </>
                ),
              },
              {
                key: "list",
                href: href(stage, funnel, "list"),
                label: (
                  <>
                    <List aria-hidden className="size-4" />
                    <span className="sr-only">List</span>
                  </>
                ),
              },
            ]}
          />
        </div>
        <nav aria-label="Filter by funnel" className="flex flex-wrap items-center gap-2">
          <FilterChip href={href(stage, "all")} active={funnel === "all"} count={funnelTotal}>
            Any funnel
          </FilterChip>
          {FUNNELS.map((f) => (
            <FilterChip key={f} href={href(stage, f)} active={funnel === f} count={byFunnel.get(f) ?? 0}>
              {FUNNEL_LONG[f]}
            </FilterChip>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-surface shadow-card">
          <EmptyState
            icon={FileText}
            title={filtered ? "No articles match" : "No articles yet"}
            hint={filtered ? "Try another stage or funnel." : "Everything the pipeline produces lands here."}
            action={
              filtered ? (
                <Button variant="secondary" asChild>
                  <Link href={href("all", "all")}>Clear filters</Link>
                </Button>
              ) : (
                <Button variant="secondary" asChild>
                  <Link href="/strategy">Start an article</Link>
                </Button>
              )
            }
          />
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-x-6 gap-y-9">
          {rows.map((a) => (
            <GalleryCard key={a.id} a={a} />
          ))}
        </div>
      ) : (
        <ArticleTable rows={rows} />
      )}
    </Page>
  );
}

function GalleryCard({ a }: { a: UiArticleSummary }) {
  const family = a.liveUrl ? "done" : stageFamily(a.stage);
  return (
    <Link href={cardHref(a)} className="group flex flex-col gap-3 rounded-xl focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none">
      {a.hasHeader ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/storage/articles/${a.folder}/header.png`}
          alt=""
          loading="lazy"
          className="aspect-[2/1] w-full rounded-xl object-cover shadow-card transition-transform duration-300 group-hover:scale-[1.01]"
        />
      ) : (
        <span aria-hidden className="flex aspect-[2/1] w-full items-center justify-center rounded-xl bg-fill-2 text-label-3 shadow-[inset_0_0_0_0.5px_var(--separator)]">
          <ImageIcon className="size-7 stroke-[1.3]" />
        </span>
      )}
      <span className="flex flex-col gap-1.5 px-0.5">
        <span className="text-[15px] leading-5 font-semibold text-pretty group-hover:text-primary">{a.title}</span>
        <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <Status family={family} colored>
            {a.liveUrl ? "Live" : stageLabel(a.stage)}
          </Status>
          <span className="text-xs text-label-2">
            {a.facets ? `${FUNNEL_LONG[a.facets.funnel] ?? a.facets.funnel.toUpperCase()} · ` : ""}
            {shortDate(a.updatedAt)}
          </span>
        </span>
      </span>
    </Link>
  );
}

function IconLink({ href, label, external, children }: { href: string; label: string; external?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" asChild>
          {external ? (
            <a href={href} target="_blank" rel="noreferrer" aria-label={label}>
              {children}
            </a>
          ) : (
            <Link href={href} aria-label={label}>
              {children}
            </Link>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ArticleTable({ rows }: { rows: UiArticleSummary[] }) {
  return (
    <Card flush>
      <div className="overflow-x-auto">
        <table className={tableCls.table}>
          <thead>
            <tr>
              <th scope="col" className={tableCls.th}>Title</th>
              <th scope="col" className={tableCls.th}>Keyword</th>
              <th scope="col" className={tableCls.th}>Stage</th>
              <th scope="col" className={tableCls.th}>Audit</th>
              <th scope="col" className={tableCls.th}>Updated</th>
              <th scope="col" className={tableCls.th}>
                <span className="sr-only">Links</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className={tableCls.tr}>
                <td className={cls(tableCls.td, "max-w-md")}>
                  <Link href={`/articles/${a.slug}`} className="font-semibold text-label hover:text-primary">
                    {a.title}
                  </Link>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-label-3">
                    {a.path ?? a.folder}
                    {a.imported && <span className="font-sans"> · Imported</span>}
                  </p>
                  {a.facets && (
                    <div className="mt-1.5">
                      <FacetBadges typeLabel={a.facets.typeLabel} funnel={a.facets.funnel} intent={a.facets.searchIntent} />
                    </div>
                  )}
                </td>
                <td className={cls(tableCls.td, "text-label-2")}>{a.targetKeyword ?? <span className="text-label-3">—</span>}</td>
                <td className={tableCls.td}>
                  <StageBadge stage={a.stage} pulse={stageFamily(a.stage) === "working"} />
                </td>
                <td className={tableCls.td}>
                  {a.auditFailures === null ? (
                    <span className="text-label-3">—</span>
                  ) : a.auditFailures === 0 ? (
                    <Status family="done">Clean</Status>
                  ) : (
                    <Status family="problem">{a.auditFailures} failing</Status>
                  )}
                </td>
                <td className={cls(tableCls.td, "whitespace-nowrap text-label-2 tabular-nums")}>{shortDate(a.updatedAt)}</td>
                <td className={cls(tableCls.td, "whitespace-nowrap")}>
                  <span className="flex items-center justify-end gap-0.5">
                    <IconLink href={`/production/review/${a.slug}`} label="Open in review">
                      <Pencil />
                    </IconLink>
                    {a.liveUrl && (
                      <IconLink href={a.liveUrl} label="View live page" external>
                        <Globe />
                      </IconLink>
                    )}
                    {a.hubspotUrl && (
                      <IconLink href={a.hubspotUrl} label="Open in HubSpot" external>
                        <ExternalLink />
                      </IconLink>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
