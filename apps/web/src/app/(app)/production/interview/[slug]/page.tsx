import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { CAPTURE_CHECKLIST, markdownSection } from "@blogagent/engine";
import { getCompany, getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { Card, EmptyState, Page } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { InterviewChat, type InterviewView } from "@/components/interview-chat";

export const dynamic = "force-dynamic";

/** D59: the expert interview for one article: the conversation in the middle, what's captured and the research beside it. */
export default async function InterviewPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAuth();
  const { slug } = await params;
  const db = await getDb();
  const doc = await db.articles.findOne({ companyId: getCompany().companyId, slug });
  if (!doc) notFound();
  const iv = doc.interview;
  const outline = doc.artifacts.outline ?? "";
  const title = /^#\s+Strategy & Outline:\s*(.+)$/m.exec(outline)?.[1]?.trim() ?? doc.topic;

  const crumbs = [
    { label: "Production", href: "/production" },
    { label: title, href: `/production/review/${doc.slug}` },
    { label: "Interview" },
  ];

  const view: InterviewView | null = iv
    ? {
        slug: doc.slug,
        title,
        stage: doc.stage,
        status: iv.status,
        messages: iv.messages.map((m) => ({ role: m.role, content: m.content, at: m.at.toISOString() })),
        checklist: [
          ...CAPTURE_CHECKLIST.map((c) => ({ label: c.label, value: iv.captured[c.key] ?? null })),
          { label: "Attribution", value: iv.captured.attribution ?? null },
        ],
        wedge: markdownSection(iv.plan, "Wedge") || markdownSection(doc.artifacts.researchNotes ?? "", "Content Gaps"),
        // D61: the interview reacts to research; interviews opened after an outline (D59) show that plan.
        positions: markdownSection(doc.artifacts.researchNotes ?? "", "Candidate Positions"),
        summary: markdownSection(doc.artifacts.researchNotes ?? "", "Topic Summary"),
        plannedAngle: iv.basis === "research" ? "" : markdownSection(outline, "Angle"),
        plannedThesis: iv.basis === "research" ? "" : markdownSection(outline, "Thesis"),
        plannedAnchor: iv.basis === "research" ? "" : markdownSection(outline, "Real-World Anchor"),
        costUsd: iv.costUsd ?? null,
      }
    : null;

  if (view) return <InterviewChat view={view} crumbs={crumbs} />;

  return (
    <Page
      crumbs={crumbs}
      title={title}
      eyebrow="Expert interview"
      width="narrow"
      actions={
        <Button variant="secondary" asChild>
          <Link href={`/production/review/${doc.slug}`}>Open review</Link>
        </Button>
      }
    >
      <Card>
        <EmptyState
          icon={MessageSquare}
          title="No interview yet"
          hint="It opens when the run reaches the Interview stage, right after research."
          action={
            <Button variant="secondary" asChild>
              <Link href="/production">Back to Production</Link>
            </Button>
          }
        />
      </Card>
    </Page>
  );
}
