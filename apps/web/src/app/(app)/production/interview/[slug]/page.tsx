import Link from "next/link";
import { notFound } from "next/navigation";
import { CAPTURE_CHECKLIST, markdownSection } from "@blogagent/engine";
import { getCompany, getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { buttonCls, PageHeader, StageBadge } from "@/components/ui";
import { InterviewChat, type InterviewView } from "@/components/interview-chat";

export const dynamic = "force-dynamic";

/** D59: the expert interview for one article — chat on the left, what's planned and captured on the right. */
export default async function InterviewPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAuth();
  const { slug } = await params;
  const db = await getDb();
  const doc = await db.articles.findOne({ companyId: getCompany().companyId, slug });
  if (!doc) notFound();
  const iv = doc.interview;
  const outline = doc.artifacts.outline ?? "";
  const title = /^#\s+Strategy & Outline:\s*(.+)$/m.exec(outline)?.[1]?.trim() ?? doc.topic;

  const view: InterviewView | null = iv
    ? {
        slug: doc.slug,
        status: iv.status,
        messages: iv.messages.map((m) => ({ role: m.role, content: m.content, at: m.at.toISOString() })),
        checklist: [
          ...CAPTURE_CHECKLIST.map((c) => ({ label: c.label, value: iv.captured[c.key] ?? null })),
          { label: "Attribution", value: iv.captured.attribution ?? null },
        ],
        wedge: markdownSection(iv.plan, "Wedge") || markdownSection(doc.artifacts.researchNotes ?? "", "Content Gaps"),
        plannedAngle: markdownSection(outline, "Angle"),
        plannedThesis: markdownSection(outline, "Thesis"),
        plannedAnchor: markdownSection(outline, "Real-World Anchor"),
        costUsd: iv.costUsd ?? null,
      }
    : null;

  return (
    <div>
      <PageHeader
        title={`Expert interview: ${title}`}
        subtitle="Your point of view shapes the angle, the thesis, the story and where the product fits. The outline is rebuilt from your answers before the Writer starts."
        actions={
          <>
            <StageBadge stage={doc.stage} />
            <Link href={`/production/review/${doc.slug}`} className={buttonCls("secondary")}>
              Open in Review
            </Link>
          </>
        }
      />
      {view ? (
        <InterviewChat view={view} />
      ) : (
        <p className="text-sm text-slate-500">
          No interview for this article yet. It opens when the run reaches the Interview stage, right after the outline.
        </p>
      )}
    </div>
  );
}
