import Link from "next/link";
import type { ArticleDoc, PhaseResult, RunDoc, Stage } from "@blogagent/engine";
import { CheckCircle2, Plus, RotateCcw, Rocket, X } from "lucide-react";
import { getCompany, getDb, getFormatLabels } from "@/lib/db";
import { FacetBadges } from "@/components/facets";
import { toUiArticleSummary, toUiEvent } from "@/lib/ui-types";
import {
  Card,
  EmptyState,
  FilterChip,
  PHASE_LABEL,
  PHASE_ORDER,
  Page,
  PhaseStepper,
  SegmentedNav,
  Status,
  StatusDot,
  StatusPill,
  cls,
  phaseStates,
  stageFamily,
  stageLabel,
  tableCls,
  type StatusFamily,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { LiveRefresh } from "@/components/live-refresh";
import { ActivitySheet, ProductionRowMenu } from "@/components/production-ui";

export const dynamic = "force-dynamic";

/** Every stage an article can be in while it is in production (review included: it waits on the operator). */
const BOARD_STAGES: Stage[] = [
  "queued",
  "research",
  "interview",
  "evidence",
  "outline",
  "write",
  "hdcp",
  "edit",
  "verify",
  "schema",
  "design",
  "review",
  "failed",
];

const FILTERS = ["all", "working", "needs", "failed"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = { all: "All", working: "Working", needs: "Needs you", failed: "Failed" };

const NOTE_RX = /\[(?:VERIFY|HUMAN INPUT|NEEDS RESEARCH|NEEDS SOURCE)\b[^\]]*\]/g;

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = params.tab === "review" ? "review" : "work";
  const stageFilter = typeof params.stage === "string" ? params.stage : "all";
  const filter: Filter = FILTERS.includes(params.filter as Filter) ? (params.filter as Filter) : "all";

  const db = await getDb();
  const companyId = getCompany().companyId;
  const recentEvents = await db.events.find({ companyId }).sort({ _id: -1 }).limit(25).toArray();
  const events = recentEvents.map(toUiEvent);
  const work = tab === "work" ? await loadWork() : null;

  let subtitle: string;
  if (work) {
    const n = work.all.length;
    const needs = work.counts.needs;
    subtitle =
      n === 0
        ? "Articles appear here as the worker moves them through the phases."
        : `${n} ${n === 1 ? "article" : "articles"} in the pipeline${needs ? `, ${needs} waiting on you` : ""}. Each dot is a phase: blue is running now, orange is waiting for you.`;
  } else {
    subtitle = "Drafts the pipeline has finished, waiting for your read and sign-off.";
  }

  return (
    <Page
      crumbs={[{ label: "Production" }]}
      title="Production"
      subtitle={subtitle}
      center={
        <SegmentedNav
          label="Production view"
          size="sm"
          active={tab}
          items={[
            { key: "work", label: "Work", href: "/production" },
            { key: "review", label: "Review", href: "/production?tab=review" },
          ]}
        />
      }
      actions={
        <>
          <LiveRefresh />
          <ActivitySheet events={events} />
          <Button asChild>
            <Link href="/strategy">
              <Plus data-icon="inline-start" />
              New article
            </Link>
          </Button>
        </>
      }
    >
      {work ? <WorkTab work={work} stageFilter={stageFilter} filter={filter} /> : <ReviewTab />}
    </Page>
  );
}

// ── work ────────────────────────────────────────────────────────────────

type RowKind = "waiting" | "review" | "failed" | "working" | "idle";

interface Row {
  article: ArticleDoc;
  run?: RunDoc;
  kind: RowKind;
}

const KIND_FILTER: Record<RowKind, Filter> = {
  waiting: "needs",
  review: "needs",
  failed: "failed",
  working: "working",
  idle: "all",
};

/** Needs-you rows first, then problems, then the rest in update order. */
const KIND_ORDER: Record<RowKind, number> = { waiting: 0, review: 0, failed: 1, working: 2, idle: 3 };

function since(d: Date | string | undefined): string {
  if (!d) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

function duration(start: Date, end?: Date): string {
  const s = Math.max(0, Math.round(((end ?? new Date()).getTime() - start.getTime()) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function runCost(run: RunDoc | undefined): number | null {
  if (!run) return null;
  const costs = run.phaseResults.map((p) => p.usage?.costUsd).filter((c): c is number => typeof c === "number");
  return costs.length ? costs.reduce((a, b) => a + b, 0) : null;
}

function titleOf(a: ArticleDoc): string {
  return String(a.frontmatter?.["title"] ?? a.topic ?? a.slug);
}

function failedAt(run: RunDoc | undefined): string | undefined {
  return run?.currentPhase ?? run?.phaseResults[run.phaseResults.length - 1]?.phase;
}

interface Work {
  all: Row[];
  counts: Record<Filter, number>;
}

async function loadWork(): Promise<Work> {
  const db = await getDb();
  const companyId = getCompany().companyId;

  const articles = await db.articles
    .find({ companyId, stage: { $in: BOARD_STAGES } })
    .sort({ updatedAt: -1 })
    .limit(200)
    .toArray();

  const runs = await db.runs
    .find({ companyId, status: { $in: ["queued", "running", "awaiting_input"] } })
    .sort({ queuedAt: 1 })
    .toArray();
  const runByArticle = new Map(runs.map((r) => [r.articleId.toHexString(), r]));

  // A failed article has no active run; its latest run says where it stopped.
  const failedIds = articles.filter((a) => a.stage === "failed" && !runByArticle.has(a._id!.toHexString())).map((a) => a._id!);
  if (failedIds.length) {
    const lastRuns = await db.runs.find({ companyId, articleId: { $in: failedIds } }).sort({ queuedAt: -1 }).toArray();
    for (const r of lastRuns) {
      const key = r.articleId.toHexString();
      if (!runByArticle.has(key)) runByArticle.set(key, r);
    }
  }

  const all: Row[] = articles.map((article) => {
    const run = runByArticle.get(article._id!.toHexString());
    const waiting = run?.status === "awaiting_input" || (article.stage === "interview" && article.interview?.status === "open");
    const kind: RowKind = waiting
      ? "waiting"
      : article.stage === "review"
        ? "review"
        : article.stage === "failed"
          ? "failed"
          : article.stage === "queued" || article.stage === "paused"
            ? "idle"
            : "working";
    return { article, run, kind };
  });
  all.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  const counts: Record<Filter, number> = { all: all.length, working: 0, needs: 0, failed: 0 };
  for (const r of all) if (KIND_FILTER[r.kind] !== "all") counts[KIND_FILTER[r.kind]]++;
  return { all, counts };
}

function WorkTab({ work, stageFilter, filter }: { work: Work; stageFilter: string; filter: Filter }) {
  const { all, counts } = work;
  const rows = all.filter(
    (r) => (stageFilter === "all" || r.article.stage === stageFilter) && (filter === "all" || KIND_FILTER[r.kind] === filter),
  );

  if (all.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Rocket}
          title="Nothing in flight"
          hint="Queue an article from Strategy. It shows up here as the worker moves it through the phases."
          action={
            <Button variant="secondary" asChild>
              <Link href="/strategy">Start an article</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const filterHref = (f: Filter) => (f === "all" ? "/production" : `/production?filter=${f}`);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedNav
          label="Filter"
          active={stageFilter === "all" ? filter : ""}
          items={FILTERS.map((f) => ({ key: f, label: FILTER_LABEL[f], count: counts[f], href: filterHref(f) }))}
        />
        {stageFilter !== "all" && (
          <FilterChip href={filter === "all" ? "/production" : filterHref(filter)} active>
            Stage: {stageLabel(stageFilter)}
            <X aria-hidden className="size-3.5" />
            <span className="sr-only">(clear)</span>
          </FilterChip>
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title={filter === "needs" ? "Nothing needs you" : filter === "failed" ? "No failures" : "Nothing here"}
            hint="Try another filter to see the rest of the pipeline."
          />
        </Card>
      ) : (
        <Card flush>
          <ul>
            {rows.map((r) => (
              <ProductionRow key={r.article.slug} row={r} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ProductionRow({ row }: { row: Row }) {
  const { article: a, run, kind } = row;
  const title = titleOf(a);
  const at = kind === "failed" ? failedAt(run) : undefined;
  const states = phaseStates(a.stage, { waiting: kind === "waiting", failedAt: at });
  const done = states.filter((s) => s === "done").length;
  const cost = runCost(run);

  let family: StatusFamily;
  let label: string;
  let meta: string;
  let metaTitle: string | undefined;
  switch (kind) {
    case "waiting": {
      family = "needs";
      label = "Waiting for you";
      const research = run?.phaseResults.filter((p) => p.phase === "research" && p.endedAt).pop();
      meta = research?.endedAt ? `Research done ${since(research.endedAt)} ago` : "Research is done";
      break;
    }
    case "review": {
      family = "needs";
      label = "Ready to review";
      const notes = (a.artifacts?.article ?? "").match(NOTE_RX)?.length ?? 0;
      const audit = a.audit ? (a.audit.failures === 0 ? "Audit clean" : `${a.audit.failures} audit failures`) : "Not audited yet";
      meta = notes ? `${audit} · ${notes} note${notes === 1 ? "" : "s"}` : audit;
      break;
    }
    case "failed": {
      family = "problem";
      label = at ? `${PHASE_LABEL[at] ?? at} failed` : "Failed";
      const firstLine = run?.error?.split("\n")[0]?.trim();
      meta = firstLine || (run ? `Attempt ${run.attempts} of ${run.maxAttempts}` : "Re-run a phase from its review page");
      metaTitle = run?.error ?? undefined;
      break;
    }
    case "idle": {
      family = "idle";
      label = stageLabel(a.stage);
      meta = run ? "Next up" : `Updated ${since(a.updatedAt)} ago`;
      break;
    }
    default: {
      family = "working";
      label = stageLabel(a.stage);
      if (run?.status === "running" && run.startedAt) {
        meta = [
          since(run.startedAt),
          run.attempts > 1 ? `attempt ${run.attempts} of ${run.maxAttempts}` : null,
          cost != null ? money(cost) : null,
        ]
          .filter(Boolean)
          .join(" · ");
      } else if (run) {
        meta = "Waiting for a worker";
      } else {
        meta = `Updated ${since(a.updatedAt)} ago`;
      }
    }
  }

  const stepper = (
    <span className="flex flex-col gap-1.5">
      <PhaseStepper states={states} size="lg" />
      <span className="text-[11px] text-label-2 tabular-nums">{done} of 10 phases</span>
    </span>
  );

  return (
    <li className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b-[0.5px] border-separator px-5 py-4 last:border-0">
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
        <Link href={`/production/review/${a.slug}`} className="text-[15px] leading-5 font-semibold text-label text-pretty hover:underline">
          {title}
        </Link>
        <span className="truncate text-xs text-label-2">{a.targetKeyword ?? a.slug}</span>
      </div>

      {run && run.phaseResults.length > 0 ? (
        <HoverCard openDelay={150} closeDelay={80}>
          <HoverCardTrigger asChild>
            <span tabIndex={0} className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring">
              {stepper}
            </span>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="w-72 p-3.5">
            <PhaseDetails run={run} cost={cost} />
          </HoverCardContent>
        </HoverCard>
      ) : (
        stepper
      )}

      <div className="flex min-w-0 flex-[0_0_200px] flex-col gap-0.5">
        <Status family={family} colored>
          {label}
        </Status>
        <span title={metaTitle} className="truncate pl-[15px] text-xs text-label-2 tabular-nums">
          {meta}
        </span>
      </div>

      <div className="flex flex-[0_0_140px] justify-end">
        <RowAction kind={kind} slug={a.slug} title={title} />
      </div>
    </li>
  );
}

function RowAction({ kind, slug, title }: { kind: RowKind; slug: string; title: string }) {
  if (kind === "waiting") {
    return (
      <Button variant="needs" asChild>
        <Link href={`/production/interview/${slug}`}>Start interview</Link>
      </Button>
    );
  }
  if (kind === "review") {
    return (
      <Button variant="needs" asChild>
        <Link href={`/production/review/${slug}`}>Review</Link>
      </Button>
    );
  }
  if (kind === "failed") {
    return (
      <Button variant="secondary" asChild>
        <Link href={`/production/review/${slug}`}>
          <RotateCcw data-icon="inline-start" />
          Open to retry
        </Link>
      </Button>
    );
  }
  return <ProductionRowMenu slug={slug} title={title} />;
}

const RESULT_FAMILY: Record<PhaseResult["status"], StatusFamily> = {
  running: "working",
  succeeded: "done",
  failed: "problem",
};
const RESULT_LABEL: Record<PhaseResult["status"], string> = { running: "Running", succeeded: "Done", failed: "Failed" };

/** Per-phase details for the hover card: the latest result of each phase in this run. */
function PhaseDetails({ run, cost }: { run: RunDoc; cost: number | null }) {
  const latest = new Map<string, PhaseResult>();
  for (const p of run.phaseResults) latest.set(p.phase, p);
  const phases = (PHASE_ORDER as readonly string[]).filter((p) => latest.has(p));
  return (
    <div className="flex flex-col gap-2.5">
      <ul className="flex flex-col gap-1.5">
        {phases.map((p) => {
          const r = latest.get(p)!;
          return (
            <li key={p} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5">
              <span className="flex items-center gap-2 text-[13px] font-medium">
                <StatusDot family={RESULT_FAMILY[r.status]} pulse={r.status === "running"} className="size-[7px]" />
                {PHASE_LABEL[p] ?? p}
              </span>
              <StatusPill family={RESULT_FAMILY[r.status]} className="h-5 px-2 text-[11px]">
                {RESULT_LABEL[r.status]}
              </StatusPill>
              <span className="col-span-2 pl-[15px] text-xs text-label-2 tabular-nums">
                {duration(r.startedAt, r.endedAt)}
                {r.attempt > 1 && ` · attempt ${r.attempt}`}
                {r.usage?.costUsd != null && ` · ${money(r.usage.costUsd)}`}
              </span>
            </li>
          );
        })}
      </ul>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t-[0.5px] border-separator pt-2.5 text-xs">
        <dt className="text-label-2">Attempt</dt>
        <dd className="text-right tabular-nums">
          {run.attempts} of {run.maxAttempts}
        </dd>
        {cost != null && (
          <>
            <dt className="text-label-2">Cost this run</dt>
            <dd className="text-right tabular-nums">{money(cost)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// ── review ──────────────────────────────────────────────────────────────

async function ReviewTab() {
  const db = await getDb();
  const companyId = getCompany().companyId;
  const docs = await db.articles
    .find({ companyId, stage: { $in: ["review", "approved"] } })
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray();
  const labels = await getFormatLabels();
  const rows = docs.map((d) => toUiArticleSummary(d, labels));

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CheckCircle2}
          title="Nothing awaiting review"
          hint="Articles land here when the pipeline finishes its last phase, the header image."
        />
      </Card>
    );
  }
  return (
    <Card flush>
      <div className="overflow-x-auto">
        <table className={tableCls.table}>
          <thead>
            <tr>
              <th className={cls(tableCls.th, "pl-5")}>Title</th>
              <th className={tableCls.th}>Keyword</th>
              <th className={tableCls.th}>Status</th>
              <th className={tableCls.th}>Audit</th>
              <th className={tableCls.th}>Updated</th>
              <th className={cls(tableCls.th, "pr-5")}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className={cls(tableCls.tr, "[&:last-child>td]:border-0")}>
                <td className={cls(tableCls.td, "max-w-[420px] py-3 pl-5")}>
                  <Link href={`/production/review/${a.slug}`} className="font-semibold text-label text-pretty hover:underline">
                    {a.title}
                  </Link>
                  {a.facets && (
                    <div className="mt-1">
                      <FacetBadges typeLabel={a.facets.typeLabel} funnel={a.facets.funnel} />
                    </div>
                  )}
                </td>
                <td className={cls(tableCls.td, "text-label-2")}>{a.targetKeyword ?? "None"}</td>
                <td className={tableCls.td}>
                  <Status family={stageFamily(a.stage)} pulse={false}>
                    {a.stage === "review" ? "Ready to review" : stageLabel(a.stage)}
                  </Status>
                </td>
                <td className={tableCls.td}>
                  {a.auditFailures === null ? (
                    <Status family="idle" pulse={false}>
                      Not audited
                    </Status>
                  ) : a.auditFailures === 0 ? (
                    <Status family="done">Audit clean</Status>
                  ) : (
                    <Status family="problem">
                      {a.auditFailures} {a.auditFailures === 1 ? "failure" : "failures"}
                    </Status>
                  )}
                </td>
                <td className={cls(tableCls.td, "whitespace-nowrap text-label-2 tabular-nums")}>
                  {new Date(a.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </td>
                <td className={cls(tableCls.td, "pr-5 text-right")}>
                  <Button variant={a.stage === "review" ? "needs" : "secondary"} size="sm" asChild>
                    <Link href={`/production/review/${a.slug}`}>Review</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
