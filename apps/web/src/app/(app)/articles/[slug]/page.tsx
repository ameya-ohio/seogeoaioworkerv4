import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight, ExternalLink, FileText, ImageIcon, Pencil } from "lucide-react";
import { cleanBody, parseArticle, type ArticleDoc } from "@blogagent/engine";
import { getCompany, getDb, getFormatLabels } from "@/lib/db";
import { EmptyState, Page, SegmentedNav, StageBadge, Status, stageFamily } from "@/components/kit";
import { FacetBadges } from "@/components/facets";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** `article` is the main column; the others open in the inspector. Old `?tab=article` links still work. */
const TABS = [
  { key: "article", label: "Article" },
  { key: "research", label: "Research" },
  { key: "outline", label: "Outline" },
  { key: "schema", label: "Schema" },
  { key: "meta", label: "Meta" },
  { key: "header", label: "Header" },
];

const INSPECTOR_TABS = [
  { key: "meta", label: "Meta" },
  { key: "research", label: "Research" },
  { key: "outline", label: "Outline" },
  { key: "schema", label: "Schema" },
  { key: "header", label: "Header" },
];

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

function dateLabel(d: Date | undefined): string | null {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
}

export default async function ArticleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && TABS.some((t) => t.key === sp.tab) ? sp.tab : "article";
  const inspector = tab === "article" ? "meta" : tab;

  const db = await getDb();
  const companyId = getCompany().companyId;
  const [doc, labels] = await Promise.all([db.articles.findOne({ companyId, slug }), getFormatLabels()]);
  if (!doc) notFound();
  const typeLabel = doc.facets ? (labels[doc.facets.articleType] ?? doc.facets.articleType) : "";

  const markdown = doc.artifacts.article ?? doc.artifacts.draft ?? "";
  const { body } = parseArticle(markdown);
  const title = String(doc.frontmatter?.["title"] ?? doc.topic);
  const liveUrl = doc.live?.url ?? doc.hubspot?.url ?? null;
  const headerSrc = doc.header ? `/api/storage/articles/${doc.folder}/header.png` : null;
  const headerAlt = str(doc.frontmatter?.["hero_image_alt"]) ?? `Header image for ${title}`;

  return (
    <Page
      bleed
      crumbs={[{ label: "Articles", href: "/articles" }, { label: title }]}
      actions={
        <>
          <Button variant="secondary" asChild>
            <Link href={`/production/review/${slug}`}>
              <Pencil data-icon="inline-start" />
              Open in review
            </Link>
          </Button>
          {liveUrl && (
            <Button asChild>
              <a href={liveUrl} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" />
                View live
              </a>
            </Button>
          )}
        </>
      }
    >
      <div className="flex min-h-[calc(100dvh-52px)] flex-wrap items-stretch">
        <article className="min-w-0 flex-[999_1_560px] bg-surface px-5 pt-8 pb-20 sm:px-10 lg:px-14">
          <div className="mx-auto flex max-w-[68ch] flex-col gap-7">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-label-2">
              <StageBadge stage={doc.stage} pulse={stageFamily(doc.stage) === "working"} />
              {doc.targetKeyword && <span>{doc.targetKeyword}</span>}
              {doc.facets && <FacetBadges typeLabel={typeLabel} funnel={doc.facets.funnel} />}
            </div>
            {headerSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headerSrc} alt={headerAlt} className="aspect-[2/1] w-full rounded-xl object-cover shadow-card" />
            )}
            {markdown ? (
              <div className="prose-article prose-reading">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanBody(body)}</ReactMarkdown>
              </div>
            ) : (
              <EmptyState icon={FileText} title="No article yet" hint="The draft appears here once the Writer phase finishes." />
            )}
          </div>
        </article>

        <aside
          aria-label="Article details"
          className="min-w-0 flex-[1_1_340px] border-l-[0.5px] border-separator-strong bg-window lg:max-w-[460px]"
        >
          <div className="flex flex-col gap-4 px-5 py-5 lg:sticky lg:top-[52px] lg:max-h-[calc(100dvh-52px)] lg:overflow-y-auto">
            <SegmentedNav
              size="sm"
              label="Article details"
              active={inspector}
              items={INSPECTOR_TABS.map((t) => ({
                key: t.key,
                label: t.label,
                href: t.key === "meta" ? `/articles/${slug}` : `/articles/${slug}?tab=${t.key}`,
              }))}
            />

            {inspector === "meta" && <MetaPanel doc={doc} title={title} typeLabel={typeLabel} />}
            {inspector === "research" && <MarkdownPanel text={doc.artifacts.researchNotes} empty="No research notes stored." />}
            {inspector === "outline" && <MarkdownPanel text={doc.artifacts.outline} empty="No outline stored." />}
            {inspector === "schema" &&
              (doc.artifacts.schema ? (
                <pre className="overflow-x-auto rounded-[10px] bg-fill-2 p-3.5 font-mono text-[11px] leading-relaxed text-label shadow-[inset_0_0_0_0.5px_var(--separator)]">
                  {JSON.stringify(doc.artifacts.schema, null, 2)}
                </pre>
              ) : (
                <EmptyState title="No schema stored" className="py-8" />
              ))}
            {inspector === "header" &&
              (headerSrc ? (
                <div className="flex flex-col gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={headerSrc} alt={headerAlt} className="w-full rounded-[10px] shadow-card" />
                  <MetaRow label="Alt text" value={str(doc.frontmatter?.["hero_image_alt"])} />
                  <MetaRow label="File" value={doc.header?.storageKey ?? null} mono />
                </div>
              ) : (
                <EmptyState icon={ImageIcon} title="No header image" hint="The Header Designer phase makes one." className="py-8" />
              ))}
          </div>
        </aside>
      </div>
    </Page>
  );
}

function LengthNote({ length, min, max }: { length: number; min: number; max: number }) {
  const ok = length >= min && length <= max;
  return (
    <Status family={ok ? "done" : "needs"} className="text-xs" colored>
      {length} chars · {min}–{max}
    </Status>
  );
}

function MetaRow({
  label,
  value,
  note,
  mono,
  children,
}: {
  label: string;
  value?: string | null;
  note?: React.ReactNode;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b-[0.5px] border-separator py-3 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-label-2">{label}</span>
        {note}
      </div>
      {children ??
        (value ? (
          <span className={cn("text-[13px] leading-[19px] break-words", mono && "font-mono text-xs")}>{value}</span>
        ) : (
          <span className="text-[13px] text-label-3">Not set</span>
        ))}
    </div>
  );
}

function MetaPanel({ doc, title, typeLabel }: { doc: ArticleDoc; title: string; typeLabel: string }) {
  const fm = doc.frontmatter ?? {};
  const meta = doc.artifacts.meta ?? {};
  const fmTitle = str(fm["title"]) ?? str(meta["title"]);
  const description = str(fm["meta_description"]) ?? str(meta["meta_description"]);
  const keyword = str(fm["primary_keyword"]) ?? doc.targetKeyword ?? null;
  const url = doc.live?.url ?? doc.canonicalUrl ?? str(fm["canonical"]) ?? str(meta["canonical"]) ?? doc.path ?? null;
  const schemaTypes = (() => {
    const graph = (doc.artifacts.schema as { "@graph"?: { "@type"?: unknown }[] } | undefined)?.["@graph"];
    if (!Array.isArray(graph)) return null;
    const types = graph.flatMap((n) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]])).filter((t): t is string => typeof t === "string");
    return types.length ? [...new Set(types)].join(", ") : null;
  })();

  return (
    <div className="flex flex-col">
      <div className="rounded-xl bg-surface px-4 shadow-card">
        <MetaRow label="Title" value={fmTitle ?? title} note={fmTitle ? <LengthNote length={fmTitle.length} min={50} max={60} /> : undefined} />
        <MetaRow
          label="Meta description"
          value={description}
          note={description ? <LengthNote length={description.length} min={140} max={160} /> : undefined}
        />
        <MetaRow label="Primary keyword" value={keyword} />
        <MetaRow label="URL" value={url} mono />
        {doc.facets && (
          <MetaRow label="Facets">
            <span className="flex flex-col gap-1 text-[13px]">
              <span className="capitalize">
                {doc.facets.pageRole} · {doc.facets.searchIntent}
              </span>
              <FacetBadges typeLabel={typeLabel} funnel={doc.facets.funnel} />
            </span>
          </MetaRow>
        )}
        <MetaRow
          label="Structured data"
          value={schemaTypes}
          note={
            doc.schemaValidation ? (
              <Status family={doc.schemaValidation.failures === 0 ? "done" : "problem"} className="text-xs">
                {doc.schemaValidation.failures === 0 ? "Valid" : `${doc.schemaValidation.failures} failing`}
              </Status>
            ) : undefined
          }
        />
        <MetaRow
          label="Audit"
          value={
            doc.audit
              ? `${doc.audit.passes} pass · ${doc.audit.warnings} warn · ${doc.audit.failures} fail`
              : null
          }
          note={
            doc.audit ? (
              <Status family={doc.audit.failures === 0 ? "done" : "problem"} className="text-xs">
                {doc.audit.failures === 0 ? "Clean" : "Failing"}
              </Status>
            ) : undefined
          }
        />
        {doc.live && <MetaRow label="Live" value={`${doc.live.url} · verified ${dateLabel(doc.live.verifiedAt)}`} mono />}
        {doc.hubspot?.url && (
          <MetaRow
            label="HubSpot"
            value={[doc.hubspot.state, doc.hubspot.publishedAt ? `published ${dateLabel(doc.hubspot.publishedAt)}` : null].filter(Boolean).join(" · ") || doc.hubspot.url}
          />
        )}
        {doc.signoff && <MetaRow label="Signed off" value={`${doc.signoff.by} · ${dateLabel(doc.signoff.at)}${doc.signoff.note ? ` · ${doc.signoff.note}` : ""}`} />}
        <MetaRow label="Folder" value={doc.folder} mono />
        <MetaRow label="Updated" value={dateLabel(doc.updatedAt)} />
      </div>

      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-label-2 hover:text-label [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
          Raw frontmatter and meta
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-[10px] bg-fill-2 p-3.5 font-mono text-[11px] leading-relaxed text-label shadow-[inset_0_0_0_0.5px_var(--separator)]">
          {JSON.stringify({ frontmatter: doc.frontmatter ?? {}, meta: doc.artifacts.meta ?? {} }, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function MarkdownPanel({ text, empty }: { text: string | undefined; empty: string }) {
  return text ? (
    <div className="prose-article rounded-xl bg-surface p-4 text-[13px] shadow-card">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  ) : (
    <EmptyState title={empty} className="py-8" />
  );
}
