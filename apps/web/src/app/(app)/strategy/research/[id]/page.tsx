import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { AlertCircle, Loader2, Network } from "lucide-react";
import { getCompany, getDb } from "@/lib/db";
import {
  toUiClusterEvent,
  toUiClusterSummary,
  toUiSpokeBrief,
  toUiTheme,
  type UiSpokeBrief,
  type UiTheme,
} from "@/lib/ui-types";
import { Caption, Card, EmptyState, EventLog, Page, ProgressRing, SectionHeader, cls, tableCls, type StatusFamily } from "@/components/kit";
import { ClusterStageProgress, ClusterStatusBadge, GapLabel, TierBadge } from "@/components/cluster-ui";
import { BriefActions } from "@/components/strategy-research";
import { LiveRefresh } from "@/components/live-refresh";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Theme scores and brief priorities are out of 45 (five 0–9 dimensions). */
const SCORE_MAX = 45;

function scoreFamily(score: number): StatusFamily {
  const r = score / SCORE_MAX;
  return r >= 0.7 ? "done" : r >= 0.45 ? "working" : "idle";
}

/** Cluster run page (4D): follow a live run, then review themes + briefs. */
export default async function ClusterRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const db = await getDb();
  const companyId = getCompany().companyId;
  const clusterId = new ObjectId(id);
  const doc = await db.clusters.findOne({ _id: clusterId, companyId });
  if (!doc) notFound();

  const themeDocs = await db.themes.find({ clusterId }).sort({ "scores.total": -1, stability: -1 }).toArray();
  const eventDocs = await db.clusterEvents.find({ clusterId }).sort({ seq: -1 }).limit(30).toArray();

  const cluster = toUiClusterSummary(doc, themeDocs.length);
  const themes = themeDocs.map(toUiTheme);
  const dismissed = new Set(doc.dismissedBriefs ?? []);
  const briefs = (doc.spokeBriefs ?? [])
    .map((b) => toUiSpokeBrief(b, dismissed.has(b.themeName)))
    .sort((a, b) => b.priorityScore - a.priorityScore);
  const events = eventDocs.map(toUiClusterEvent);
  const hub = doc.hub ?? null;
  const active = cluster.status === "queued" || cluster.status === "running";

  const facts = [
    cluster.mode ? `${cluster.mode} fan-out` : "Mode pending",
    `K=${cluster.k}`,
    `Attempt ${cluster.attempts} of ${cluster.maxAttempts}`,
    `${cluster.llmCalls} LLM calls`,
    `${cluster.dataForSeoCalls} DataForSEO calls`,
  ];

  return (
    <Page
      crumbs={[{ label: "Strategy", href: "/strategy" }, { label: "Research", href: "/strategy?tab=research" }, { label: cluster.seed }]}
      title={cluster.seed}
      eyebrow="Topic cluster research"
      subtitle={facts.join(" · ")}
      actions={active ? <LiveRefresh src="/api/cluster-events" /> : undefined}
      headerActions={<ClusterStatusBadge status={cluster.status} />}
    >
      <div className="flex flex-col gap-10">
        <section className="rounded-xl bg-surface px-5 pt-5 pb-4 shadow-card">
          <ClusterStageProgress stage={doc.stage} completed={doc.completedStages} status={cluster.status} />
          {cluster.error && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-problem-bg px-3 py-2 text-[13px] text-problem-fg">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-words">{cluster.error}</span>
            </p>
          )}
        </section>

        {themes.length === 0 && briefs.length === 0 && active && (
          <div className="rounded-xl bg-surface shadow-card">
            <EmptyState
              icon={Loader2}
              title="The agent is working"
              hint="Themes appear after clustering, briefs after the architecture stage. This page updates live."
            />
          </div>
        )}

        {themes.length > 0 && <ThemesTable themes={themes} />}

        {hub && (
          <section>
            <SectionHeader title="Hub" />
            <Card
              title={
                <span className="flex items-center gap-2">
                  <Network aria-hidden className="size-4 text-label-2" />
                  {hub.title}
                </span>
              }
            >
              <ul className="flex flex-col gap-3">
                {hub.themeSummaries.map((s) => (
                  <li key={s.theme} className="text-[13px] leading-[19px]">
                    <span className="font-semibold">{s.theme}</span>
                    <span className="text-label-2"> · {s.summary}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        {briefs.length > 0 && (
          <section>
            <SectionHeader title="Spoke briefs" count={briefs.length} actions={<span className="text-xs text-label-2">Ranked by priority</span>} />
            <div className="flex flex-col gap-4">
              {briefs.map((b) => (
                <BriefCard key={b.themeName} clusterId={cluster.id} brief={b} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeader title="Run events" />
          <Card flush>
            <EventLog events={events} empty="No events yet." />
          </Card>
        </section>
      </div>
    </Page>
  );
}

function ThemesTable({ themes }: { themes: UiTheme[] }) {
  return (
    <section>
      <SectionHeader title="Themes" count={themes.length} />
      <Card flush>
        <div className="overflow-x-auto">
          <table className={tableCls.table}>
            <thead>
              <tr>
                <th scope="col" className={tableCls.th}>Theme</th>
                <th scope="col" className={tableCls.th}>Tier</th>
                <th scope="col" className={cls(tableCls.th, "text-right")}>Stability</th>
                <th scope="col" className={cls(tableCls.th, "text-right")}>Breadth</th>
                <th scope="col" className={tableCls.th}>Gap</th>
                <th scope="col" className={cls(tableCls.th, "text-right")}>Score</th>
                <th scope="col" className={tableCls.th}>Architecture</th>
              </tr>
            </thead>
            <tbody>
              {themes.map((t) => (
                <tr key={t.id} className={tableCls.tr}>
                  <td className={cls(tableCls.td, "max-w-md")}>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">{t.name}</span>
                      {t.questionMined && (
                        <span className="text-xs text-label-2" title="Added by question mining, not fan-out">
                          Question-mined
                        </span>
                      )}
                      {t.awarenessPlay && (
                        <span
                          className="inline-flex h-5 items-center rounded-full bg-needs-bg px-2 text-[11px] font-semibold text-needs-fg"
                          title="Low right-to-win, never silently core"
                        >
                          Awareness play
                        </span>
                      )}
                    </span>
                    <p className="mt-0.5 truncate text-xs text-label-2">{t.representativeSubQueries.join(" · ") || "—"}</p>
                  </td>
                  <td className={tableCls.td}>
                    <TierBadge tier={t.tier} />
                  </td>
                  <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>{t.stability.toFixed(2)}</td>
                  <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>{t.breadth}</td>
                  <td className={tableCls.td}>
                    <GapLabel status={t.gapStatus} />
                    {t.nonBlogAsset && <p className="mt-0.5 text-xs text-label-2">Non-blog: {t.nonBlogAsset}</p>}
                  </td>
                  <td className={cls(tableCls.td, "text-right tabular-nums")}>
                    {t.scores ? (
                      <span className="font-semibold">
                        {t.scores.total}
                        <span className="font-normal text-label-3">/{SCORE_MAX}</span>
                      </span>
                    ) : (
                      <span className="text-label-3">—</span>
                    )}
                  </td>
                  <td className={cls(tableCls.td, "text-label-2")}>
                    {t.architecture ?? <span className="text-label-3">—</span>}
                    {t.parentSpoke && <p className="mt-0.5 text-xs text-label-3">In: {t.parentSpoke}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function BriefField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Caption>{label}</Caption>
      <div className="text-[13px] leading-[19px] text-label">{children}</div>
    </div>
  );
}

function BriefCard({ clusterId, brief }: { clusterId: string; brief: UiSpokeBrief }) {
  const meta = [
    brief.themeName,
    brief.persona,
    brief.buyingStage,
    `${brief.lengthBand.min}–${brief.lengthBand.max} words`,
    brief.schemaTypes.join(", "),
  ].filter(Boolean);
  return (
    <article className={cn("flex flex-col gap-5 rounded-[14px] bg-surface p-5 shadow-card transition-opacity", brief.dismissed && "opacity-55")}>
      <header className="flex items-start gap-4">
        <ProgressRing value={brief.priorityScore} total={SCORE_MAX} size={44} family={scoreFamily(brief.priorityScore)} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-[17px] leading-[22px] font-semibold tracking-[-0.01em] text-pretty">{brief.workingTitle}</h3>
          <p className="text-xs text-label-2">{meta.join(" · ")}</p>
          {brief.primaryQueryTarget && (
            <p className="text-xs text-label-2">
              Target query: <span className="font-medium text-label">{brief.primaryQueryTarget}</span>
            </p>
          )}
        </div>
        {brief.dismissed && <span className="text-xs font-medium text-label-2">Dismissed</span>}
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <BriefField label="H2 outline">
          <ol className="flex list-decimal flex-col gap-1 pl-4 text-label-2 marker:text-label-3">
            {brief.h2Outline.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
        </BriefField>
        <div className="flex flex-col gap-4">
          <BriefField label="Differentiation">{brief.differentiationAngle}</BriefField>
          <BriefField label="Quotable stat candidate">{brief.quotableStatCandidate}</BriefField>
          <BriefField label="Representative sub-queries">
            <span className="text-label-2">{brief.representativeSubQueries.join(" · ")}</span>
          </BriefField>
        </div>
      </div>

      <footer className="border-t-[0.5px] border-separator pt-4">
        <BriefActions clusterId={clusterId} themeName={brief.themeName} dismissed={brief.dismissed} />
      </footer>
    </article>
  );
}
