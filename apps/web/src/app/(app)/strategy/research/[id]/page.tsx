import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCompany, getDb } from "@/lib/db";
import {
  toUiClusterEvent,
  toUiClusterSummary,
  toUiSpokeBrief,
  toUiTheme,
  type UiSpokeBrief,
  type UiTheme,
} from "@/lib/ui-types";
import { Card, EmptyState, PageHeader, cls, tableCls } from "@/components/ui";
import {
  ClusterStageProgress,
  ClusterStatusBadge,
  GapLabel,
  TierBadge,
} from "@/components/cluster-ui";
import { BriefActions } from "@/components/strategy-research";
import { LiveRefresh } from "@/components/live-refresh";

export const dynamic = "force-dynamic";

/** Cluster run page (4D): follow a live run, then review themes + briefs. */
export default async function ClusterRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const db = await getDb();
  const companyId = getCompany().companyId;
  const clusterId = new ObjectId(id);
  const doc = await db.clusters.findOne({ _id: clusterId, companyId });
  if (!doc) notFound();

  const themeDocs = await db.themes
    .find({ clusterId })
    .sort({ "scores.total": -1, stability: -1 })
    .toArray();
  const eventDocs = await db.clusterEvents
    .find({ clusterId })
    .sort({ seq: -1 })
    .limit(30)
    .toArray();

  const cluster = toUiClusterSummary(doc, themeDocs.length);
  const themes = themeDocs.map(toUiTheme);
  const dismissed = new Set(doc.dismissedBriefs ?? []);
  const briefs = (doc.spokeBriefs ?? [])
    .map((b) => toUiSpokeBrief(b, dismissed.has(b.themeName)))
    .sort((a, b) => b.priorityScore - a.priorityScore);
  const events = eventDocs.map(toUiClusterEvent);
  const hub = doc.hub ?? null;
  const active = cluster.status === "queued" || cluster.status === "running";

  return (
    <>
      <PageHeader
        title={`Cluster: ${cluster.seed}`}
        subtitle={`${cluster.mode ?? "mode pending"} fan-out · K=${cluster.k} · attempt ${cluster.attempts}/${cluster.maxAttempts} · ${cluster.llmCalls} LLM calls · ${cluster.dataForSeoCalls} DataForSEO calls`}
        actions={
          <div className="flex items-center gap-3">
            {active && <LiveRefresh src="/api/cluster-events" />}
            <ClusterStatusBadge status={cluster.status} />
            <Link href="/strategy?tab=research" className="text-sm text-accent hover:underline">
              all runs
            </Link>
          </div>
        }
      />

      <div className="space-y-5">
        <Card title="Pipeline">
          <ClusterStageProgress
            stage={doc.stage}
            completed={doc.completedStages}
            status={cluster.status}
          />
          {cluster.error && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {cluster.error}
            </p>
          )}
        </Card>

        {themes.length > 0 && <ThemesTable themes={themes} />}

        {hub && (
          <Card title={`Hub (routing page): ${hub.title}`}>
            <ul className="space-y-2">
              {hub.themeSummaries.map((s) => (
                <li key={s.theme} className="text-sm">
                  <span className="font-medium text-slate-700">{s.theme}:</span>{" "}
                  <span className="text-slate-600">{s.summary}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {briefs.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-600">
              Spoke briefs <span className="font-normal text-slate-400">— ranked by priority</span>
            </h2>
            <div className="space-y-4">
              {briefs.map((b) => (
                <BriefCard key={b.themeName} clusterId={cluster.id} brief={b} />
              ))}
            </div>
          </section>
        )}

        {themes.length === 0 && briefs.length === 0 && active && (
          <EmptyState
            title="The agent is working."
            hint="Themes appear after clustering; briefs after the architecture stage. This page refreshes live."
          />
        )}

        <Card title="Run events">
          {events.length === 0 ? (
            <p className="text-sm text-slate-400">No events yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 text-xs">
                  <span className="shrink-0 tabular-nums text-slate-400">
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>
                  <span
                    className={cls(
                      "shrink-0 font-mono",
                      e.type.includes("failed") ? "text-red-600" : "text-slate-500",
                    )}
                  >
                    {e.type}
                  </span>
                  <span className="text-slate-600">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function ThemesTable({ themes }: { themes: UiTheme[] }) {
  return (
    <Card title={`Themes (${themes.length})`}>
      <div className="overflow-x-auto">
        <table className={tableCls.table}>
          <thead>
            <tr>
              <th className={tableCls.th}>Theme</th>
              <th className={tableCls.th}>Tier</th>
              <th className={tableCls.th}>Stability</th>
              <th className={tableCls.th}>Breadth</th>
              <th className={tableCls.th}>Gap</th>
              <th className={tableCls.th}>Score</th>
              <th className={tableCls.th}>Architecture</th>
            </tr>
          </thead>
          <tbody>
            {themes.map((t) => (
              <tr key={t.id} className={tableCls.tr}>
                <td className={cls(tableCls.td, "font-medium text-slate-800")}>
                  {t.name}
                  {t.questionMined && (
                    <span className="ml-1.5 text-xs font-normal text-slate-400" title="Added by question mining, not fan-out">
                      (question-mined)
                    </span>
                  )}
                  {t.awarenessPlay && (
                    <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-normal text-amber-700" title="Low right-to-win — never silently core">
                      awareness play
                    </span>
                  )}
                  <p className="mt-0.5 max-w-md truncate text-xs font-normal text-slate-400">
                    {t.representativeSubQueries.join(" · ") || "—"}
                  </p>
                </td>
                <td className={tableCls.td}>
                  <TierBadge tier={t.tier} />
                </td>
                <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>
                  {t.stability.toFixed(2)}
                </td>
                <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>{t.breadth}</td>
                <td className={tableCls.td}>
                  <GapLabel status={t.gapStatus} />
                  {t.nonBlogAsset && (
                    <p className="text-xs text-slate-400">non-blog: {t.nonBlogAsset}</p>
                  )}
                </td>
                <td className={cls(tableCls.td, "tabular-nums")}>
                  {t.scores ? (
                    <span className="font-semibold text-slate-700">{t.scores.total}/45</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className={cls(tableCls.td, "text-slate-600")}>
                  {t.architecture ?? "—"}
                  {t.parentSpoke && (
                    <p className="text-xs text-slate-400">in: {t.parentSpoke}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function BriefCard({ clusterId, brief }: { clusterId: string; brief: UiSpokeBrief }) {
  return (
    <div
      className={cls(
        "rounded-lg border bg-white p-4 shadow-sm",
        brief.dismissed ? "border-slate-200 opacity-60" : "border-slate-200",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{brief.workingTitle}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {brief.themeName} · {brief.persona} · {brief.buyingStage} · {brief.lengthBand.min}–
            {brief.lengthBand.max} words · {brief.schemaTypes.join(", ")}
          </p>
          {brief.primaryQueryTarget && (
            <p className="mt-0.5 text-xs text-slate-500">
              target query: <span className="font-medium text-slate-700">{brief.primaryQueryTarget}</span>
            </p>
          )}
        </div>
        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
          {brief.priorityScore}/45
        </span>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">H2 outline</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-600">
            {brief.h2Outline.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Differentiation
            </p>
            <p className="mt-1 text-xs text-slate-600">{brief.differentiationAngle}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Quotable stat candidate
            </p>
            <p className="mt-1 text-xs text-slate-600">{brief.quotableStatCandidate}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Representative sub-queries
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {brief.representativeSubQueries.join(" · ")}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <BriefActions
          clusterId={clusterId}
          themeName={brief.themeName}
          dismissed={brief.dismissed}
        />
      </div>
    </div>
  );
}
