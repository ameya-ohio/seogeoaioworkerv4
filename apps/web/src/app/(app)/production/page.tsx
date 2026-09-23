import Link from "next/link";
import type { Stage } from "@blogagent/engine";
import { getCompany, getDb } from "@/lib/db";
import {
  toUiArticleSummary,
  toUiEvent,
  toUiRun,
  type UiArticleSummary,
  type UiRun,
} from "@/lib/ui-types";
import { Card, EmptyState, PageHeader, StageBadge, TabNav, cls, tableCls } from "@/components/ui";
import { LiveRefresh } from "@/components/live-refresh";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "work", label: "Work" },
  { key: "review", label: "Review" },
];

const BOARD_STAGES: Stage[] = [
  "queued",
  "research",
  "outline",
  "write",
  "edit",
  "schema",
  "design",
  "failed",
];

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = params.tab === "review" ? "review" : "work";
  const stageFilter = typeof params.stage === "string" ? params.stage : "all";

  return (
    <>
      <PageHeader title="Production" subtitle="Everything in flight, and everything awaiting review" />
      <TabNav tabs={TABS} active={tab} hrefFor={(k) => (k === "work" ? "/production" : `/production?tab=${k}`)} />
      {tab === "work" ? <WorkTab stageFilter={stageFilter} /> : <ReviewTab />}
    </>
  );
}

async function WorkTab({ stageFilter }: { stageFilter: string }) {
  const db = await getDb();
  const companyId = getCompany().companyId;

  const articles = await db.articles
    .find({ companyId, stage: { $in: BOARD_STAGES } })
    .sort({ updatedAt: -1 })
    .limit(200)
    .toArray();

  const runs = await db.runs
    .find({ companyId, status: { $in: ["queued", "running"] } })
    .sort({ queuedAt: 1 })
    .toArray();
  const runByArticle = new Map(runs.map((r) => [r.articleId.toHexString(), toUiRun(r)]));

  const recentEvents = await db.events.find({ companyId }).sort({ _id: -1 }).limit(25).toArray();
  const events = recentEvents.map(toUiEvent);

  const uiArticles = articles.map(toUiArticleSummary);
  const grouped = new Map<string, UiArticleSummary[]>();
  for (const a of uiArticles) {
    if (stageFilter !== "all" && a.stage !== stageFilter) continue;
    const list = grouped.get(a.stage) ?? [];
    list.push(a);
    grouped.set(a.stage, list);
  }

  const countsByStage = new Map<string, number>();
  for (const a of uiArticles) countsByStage.set(a.stage, (countsByStage.get(a.stage) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <LiveRefresh />
      <div className="flex flex-wrap gap-2">
        <StageFilterChip label="all" count={uiArticles.length} active={stageFilter === "all"} />
        {BOARD_STAGES.map((s) => (
          <StageFilterChip key={s} label={s} count={countsByStage.get(s) ?? 0} active={stageFilter === s} />
        ))}
      </div>

      {uiArticles.length === 0 ? (
        <EmptyState
          title="Nothing in flight."
          hint="Queue an article from Content Strategy — it will appear here as the worker moves it through the phases."
        />
      ) : (
        BOARD_STAGES.filter((s) => grouped.has(s)).map((stage) => (
          <section key={stage}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600">
              <StageBadge stage={stage} />
              <span className="text-slate-400">{grouped.get(stage)?.length}</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {grouped.get(stage)?.map((a) => (
                <ArticleCard key={a.id} article={a} run={runByArticle.get(a.id)} />
              ))}
            </div>
          </section>
        ))
      )}

      <Card title="Recent activity">
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">No pipeline events yet.</p>
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
                <span className="truncate text-slate-600">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StageFilterChip({ label, count, active }: { label: string; count: number; active: boolean }) {
  return (
    <Link
      href={label === "all" ? "/production" : `/production?stage=${label}`}
      className={cls(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
      )}
    >
      {label} {count > 0 && <span className="opacity-60">({count})</span>}
    </Link>
  );
}

function ArticleCard({ article, run }: { article: UiArticleSummary; run?: UiRun }) {
  const lastPhase = run?.phaseResults[run.phaseResults.length - 1];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug text-slate-800">{article.title}</p>
        <StageBadge stage={article.stage} />
      </div>
      <p className="mt-1 truncate text-xs text-slate-400">
        {article.targetKeyword ?? article.slug}
      </p>
      {run && (
        <p className="mt-2 text-xs text-slate-500">
          run {run.status}
          {run.currentPhase ? ` · ${run.currentPhase}` : ""} · attempt {run.attempts}/{run.maxAttempts}
          {lastPhase?.costUsd != null && ` · $${lastPhase.costUsd.toFixed(2)}`}
        </p>
      )}
      {article.stage === "failed" && !run && (
        <p className="mt-2 text-xs text-red-600">failed — re-run a phase from its review page</p>
      )}
      <div className="mt-2 flex gap-3 text-xs">
        <Link href={`/production/review/${article.slug}`} className="text-accent hover:underline">
          open
        </Link>
        <Link href={`/articles/${article.slug}`} className="text-slate-400 hover:underline">
          artifacts
        </Link>
      </div>
    </div>
  );
}

async function ReviewTab() {
  const db = await getDb();
  const companyId = getCompany().companyId;
  const docs = await db.articles
    .find({ companyId, stage: { $in: ["review", "approved"] } })
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray();
  const rows = docs.map(toUiArticleSummary);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing awaiting review."
        hint="Articles land here when the pipeline finishes phase 6 (design)."
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className={tableCls.table}>
        <thead>
          <tr>
            <th className={tableCls.th}>Title</th>
            <th className={tableCls.th}>Keyword</th>
            <th className={tableCls.th}>Stage</th>
            <th className={tableCls.th}>Audit</th>
            <th className={tableCls.th}>Updated</th>
            <th className={tableCls.th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className={tableCls.tr}>
              <td className={cls(tableCls.td, "font-medium text-slate-800")}>{a.title}</td>
              <td className={cls(tableCls.td, "text-slate-500")}>{a.targetKeyword ?? "—"}</td>
              <td className={tableCls.td}>
                <StageBadge stage={a.stage} />
              </td>
              <td className={tableCls.td}>
                {a.auditFailures === null ? (
                  <span className="text-slate-400">—</span>
                ) : a.auditFailures === 0 ? (
                  <span className="text-emerald-700">clean</span>
                ) : (
                  <span className="text-red-600">{a.auditFailures} fail</span>
                )}
              </td>
              <td className={cls(tableCls.td, "text-slate-500")}>
                {new Date(a.updatedAt).toLocaleString()}
              </td>
              <td className={tableCls.td}>
                <Link href={`/production/review/${a.slug}`} className="text-accent hover:underline">
                  review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
