import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cleanBody, parseArticle } from "@blogagent/engine";
import { getCompany, getDb } from "@/lib/db";
import { Card, PageHeader, StageBadge, TabNav } from "@/components/ui";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "article", label: "Article" },
  { key: "research", label: "Research" },
  { key: "outline", label: "Outline" },
  { key: "schema", label: "Schema" },
  { key: "meta", label: "Meta" },
  { key: "header", label: "Header" },
];

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

  const db = await getDb();
  const companyId = getCompany().companyId;
  const doc = await db.articles.findOne({ companyId, slug });
  if (!doc) notFound();

  const markdown = doc.artifacts.article ?? doc.artifacts.draft ?? "";
  const { body } = parseArticle(markdown);
  const title = String(doc.frontmatter?.["title"] ?? doc.topic);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={`${doc.folder} · ${doc.targetKeyword ?? "no target keyword"}`}
        actions={
          <div className="flex items-center gap-3">
            <StageBadge stage={doc.stage} />
            <Link href={`/production/review/${slug}`} className="text-sm text-accent hover:underline">
              open in review →
            </Link>
          </div>
        }
      />
      <TabNav
        tabs={TABS}
        active={tab}
        hrefFor={(k) => (k === "article" ? `/articles/${slug}` : `/articles/${slug}?tab=${k}`)}
      />
      {tab === "article" && (
        <Card>
          {markdown ? (
            <div className="prose-article max-w-3xl">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanBody(body)}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No article markdown yet.</p>
          )}
        </Card>
      )}
      {tab === "research" && <MarkdownCard text={doc.artifacts.researchNotes} empty="No research notes stored." />}
      {tab === "outline" && <MarkdownCard text={doc.artifacts.outline} empty="No outline stored." />}
      {tab === "schema" && (
        <Card>
          {doc.artifacts.schema ? (
            <pre className="overflow-x-auto rounded-md bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-200">
              {JSON.stringify(doc.artifacts.schema, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-slate-400">No schema stored.</p>
          )}
        </Card>
      )}
      {tab === "meta" && (
        <Card>
          <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-slate-700">
            {JSON.stringify({ frontmatter: doc.frontmatter ?? {}, meta: doc.artifacts.meta ?? {} }, null, 2)}
          </pre>
        </Card>
      )}
      {tab === "header" && (
        <Card>
          {doc.header ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/storage/articles/${doc.folder}/header.png`}
              alt={`Header image for ${title}`}
              className="max-w-2xl rounded-md border border-slate-200"
            />
          ) : (
            <p className="text-sm text-slate-400">No header image stored.</p>
          )}
        </Card>
      )}
    </>
  );
}

function MarkdownCard({ text, empty }: { text: string | undefined; empty: string }) {
  return (
    <Card>
      {text ? (
        <div className="prose-article max-w-3xl">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-slate-400">{empty}</p>
      )}
    </Card>
  );
}
