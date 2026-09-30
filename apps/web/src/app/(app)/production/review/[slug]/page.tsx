import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, getDb } from "@/lib/db";
import { toUiRun, type UiRun } from "@/lib/ui-types";
import { PageHeader, StageBadge } from "@/components/ui";
import { ReviewEditor, type ReviewArticle } from "@/components/review-editor";
import { hubspotStatus } from "@/lib/actions/content";
import { publishTarget } from "@/lib/actions/publishing";
import { getFormats } from "@/lib/db";
import { CTA_SETTINGS_KEY, formatBySlug, mergeCtaSettings, resolvePageRules } from "@blogagent/engine";

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

  const formats = await getFormats();
  const format = formatBySlug(formats, doc.facets?.articleType);
  const ctas = mergeCtaSettings(getCompany().raw, (await db.settings.findOne({ companyId, key: CTA_SETTINGS_KEY }))?.value);
  const rules = resolvePageRules(formats, doc.facets, { ctas });
  const range = (r: { min: number; max: number }) => (r.min === r.max ? `exactly ${r.min}` : `${r.min}–${r.max}`);
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
          level: r.status === "ok" ? ("pass" as const) : r.status === "deferred" ? ("warn" as const) : ("fail" as const),
          message: `${r.anchor ? `"${r.anchor}" → ` : ""}${r.url}${r.status !== "ok" ? ` [${r.status}]` : ""}${r.note ? ` — ${r.note}` : ""}`,
        }))
      : null,
    technicalReview: doc.technicalReview
      ? {
          ranAt: new Date(doc.technicalReview.ranAt).toISOString(),
          model: doc.technicalReview.model,
          issues: doc.technicalReview.issues,
          droppedUnquoted: doc.technicalReview.droppedUnquoted,
          skipped: doc.technicalReview.skipped ?? null,
          costUsd: doc.technicalReview.costUsd ?? null,
        }
      : null,
    editPreAudit: doc.editPreAudit?.items ?? null,
    hdcp: doc.hdcp
      ? {
          ranAt: new Date(doc.hdcp.ranAt).toISOString(),
          model: doc.hdcp.model,
          summary: doc.hdcp.summary,
          findings: doc.hdcp.findings,
          cuts: doc.hdcp.cuts,
          flags: doc.hdcp.flags,
          verification: doc.hdcp.verification,
          editorNotes: doc.hdcp.editorNotes,
        }
      : null,
    hubspot: doc.hubspot?.postId
      ? {
          postId: doc.hubspot.postId,
          url: doc.hubspot.url ?? null,
          state: doc.hubspot.state ?? "UNKNOWN",
          syncedAt: doc.hubspot.syncedAt ? new Date(doc.hubspot.syncedAt).toISOString() : null,
        }
      : null,
    hubspotConfig: await hubspotStatus(),
    publishTarget: await publishTarget(),
    live: doc.live ? { url: doc.live.url, verifiedAt: new Date(doc.live.verifiedAt).toISOString(), status: doc.live.status } : null,
    signoffRequired: format.signoff,
    signoff: doc.signoff ? { by: doc.signoff.by, at: new Date(doc.signoff.at).toISOString(), note: doc.signoff.note ?? null } : null,
    facets: doc.facets ? { ...doc.facets } : null,
    formatLabel: format.label,
    formatOptions: [
      { value: "generic", label: "Generic article" },
      ...formats.formats.filter((f) => f.producible).map((f) => ({ value: f.slug, label: f.label })),
    ],
    rules: {
      lengthBand: `${rules.lengthBand.min}–${rules.lengthBand.max} words`,
      takeaways: range(rules.takeaways),
      faq: rules.faq.max === 0 ? "none" : `${range(rules.faq)}${rules.faq.optional ? " (or none)" : ""}`,
      cta: rules.cta
        ? `${rules.cta.label} — ${rules.cta.url}`
        : doc.facets
          ? "not configured for this funnel (Admin → CTAs)"
          : "set by the funnel once the page has facets",
      schema: rules.schemaTypes,
    },
    path: doc.path ?? null,
    canonicalUrl: String(doc.frontmatter?.["canonical_url"] ?? doc.canonicalUrl ?? "") || null,
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
