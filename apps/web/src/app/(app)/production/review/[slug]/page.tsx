import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, getDb } from "@/lib/db";
import { toUiRun, type UiRun } from "@/lib/ui-types";
import { PageHeader, StageBadge } from "@/components/ui";
import { ReviewEditor, type ReviewArticle } from "@/components/review-editor";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const companyId = getCompany().companyId;
  const doc = await db.articles.findOne({ companyId, slug });
  if (!doc) notFound();

  const runDocs = await db.runs
    .find({ articleId: doc._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();
  const runs: UiRun[] = runDocs.map(toUiRun);
  const activeRun = runs.find((r) => r.status === "queued" || r.status === "running") ?? null;

  const article: ReviewArticle = {
    slug: doc.slug,
    folder: doc.folder,
    stage: doc.stage,
    title: String(doc.frontmatter?.["title"] ?? doc.topic),
    targetKeyword: doc.targetKeyword ?? null,
    markdown: doc.artifacts.article ?? doc.artifacts.draft ?? "",
    researchNotes: doc.artifacts.researchNotes ?? null,
    outline: doc.artifacts.outline ?? null,
    draft: doc.artifacts.draft ?? null,
    schemaJson: doc.artifacts.schema ? JSON.stringify(doc.artifacts.schema, null, 2) : null,
    audit: doc.audit?.checks ?? null,
    schemaValidation: doc.schemaValidation?.checks ?? null,
    // D34/D35 truth-layer reports, rendered with the same pass/fail list UI.
    citations: doc.citationChecks
      ? doc.citationChecks.results.map((r) => ({
          level: r.verdict === "supported" ? ("pass" as const) : ("fail" as const),
          message: `${r.claim.slice(0, 120)} — ${r.url}${r.note ? ` (${r.note})` : ""}${r.quote ? ` · quote: "${r.quote.slice(0, 120)}"` : ""}`,
        }))
      : null,
    links: doc.linkChecks
      ? doc.linkChecks.results.map((r) => ({
          level: r.status === "ok" ? ("pass" as const) : ("fail" as const),
          message: `${r.url}${r.note ? ` — ${r.note}` : ""}`,
        }))
      : null,
    hasHeader: Boolean(doc.header),
    activeRun,
    runs,
  };

  return (
    <>
      <PageHeader
        title={article.title}
        subtitle={`${slug} · ${article.targetKeyword ?? "no target keyword"}`}
        actions={
          <div className="flex items-center gap-3">
            <StageBadge stage={doc.stage} />
            <Link href="/production?tab=review" className="text-sm text-slate-500 hover:underline">
              ← back to review queue
            </Link>
          </div>
        }
      />
      <ReviewEditor key={slug} article={article} />
    </>
  );
}
