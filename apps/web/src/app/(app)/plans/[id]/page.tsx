import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import {
  PLAN_FIELD_SPECS,
  assignColumns,
  defaultInterviewMode,
  getPlan,
  getSchedule,
  articlesToReexport,
  describeWaiting,
  listReleases,
  itemKey,
  latestPlanEvents,
  listPlanItems,
  loadPlanGraph,
  planCounts,
  previewCaveat,
  previewSchedule,
} from "@blogagent/engine";
import { CheckCircle2, ChevronRight, Hourglass, MessageSquare, Rocket } from "lucide-react";
import { getCompany, getDb, getFormats } from "@/lib/db";
import { toUiPlanItemRow, toUiPlanReport, toUiPreviewEntry, toUiSchedule } from "@/lib/ui-types";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  EventLog,
  MoreLink,
  Page,
  PhaseStepper,
  ProgressBar,
  ProgressRing,
  SectionHeader,
  SegmentedNav,
  Status,
  StatusDot,
  phaseStates,
  stageLabel,
} from "@/components/kit";
import { LiveRefresh } from "@/components/live-refresh";
import {
  Callout,
  ImportSteps,
  PlanItemStatusBadge,
  PlanStatusBadge,
  ScheduleStatusBadge,
  SettingsGroup,
  StatTile,
  describeCadence,
  itemStatus,
} from "@/components/plan-ui";
import { PlanMapper, type MapperField, type UnresolvedValue } from "@/components/plan-mapper";
import { PlanReport } from "@/components/plan-report";
import { PlanSchedule } from "@/components/plan-schedule";
import { PlanInterviewToggle } from "@/components/plan-interview";
import { PlanItemsTable } from "@/components/plan-items";
import { PlanReleases, type UiRelease } from "@/components/plan-releases";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "board", label: "Board" },
  { key: "schedule", label: "Cadence" },
  { key: "items", label: "Articles" },
  { key: "releases", label: "Releases" },
];

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const planId = new ObjectId(id);
  const db = await getDb();
  const plan = await getPlan(db, planId);
  if (!plan) notFound();

  const sp = await searchParams;
  const counts = await planCounts(db, planId);

  // A draft has nothing to show but its mapping — the whole screen is the
  // import review until it is committed.
  if (plan.status === "draft") {
    const sheet = plan.sheets.find((s) => s.name === plan.mapping.sheet);
    const headers = sheet?.headers ?? [];
    const { confidence } = assignColumns(headers);
    const fields: MapperField[] = PLAN_FIELD_SPECS.map((spec) => ({
      field: spec.field,
      label: spec.label,
      required: spec.required,
      column: plan.mapping.columns[spec.field] ?? null,
      confidence: confidence[spec.field] ?? 0,
    }));
    const unresolved: UnresolvedValue[] = (plan.report?.unrecognized ?? [])
      .filter((u) => ["pageRole", "funnel", "priority", "searchIntent", "format"].includes(u.field))
      .map((u) => ({
        field: u.field as UnresolvedValue["field"],
        value: u.value,
        rows: u.rows.length,
      }));
    const blocking = plan.report?.blocking ?? [];
    const guessed = fields.some((f) => f.column !== null && f.confidence < 3);

    return (
      <Page
        crumbs={[{ label: "Content plans", href: "/plans" }, { label: plan.filename }]}
        title={plan.filename}
        subtitle="Check what was read before anything is created."
        headerActions={<PlanStatusBadge status={plan.status} />}
        width="wide"
      >
        <div className="mb-8 max-w-[560px]">
          <ImportSteps current={blocking.length > 0 || unresolved.length > 0 || guessed ? 2 : 3} />
        </div>
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <PlanMapper
            planId={id}
            sheets={plan.sheets.map((s) => ({ name: s.name, rows: s.rows.length }))}
            activeSheet={plan.mapping.sheet}
            headers={headers}
            fields={fields}
            unresolved={unresolved}
            blocking={blocking}
            formatOptions={(await getFormats()).formats.map((f) => ({ value: f.slug, label: f.label }))}
          />
          <section aria-label="What we read">
            {plan.report ? (
              <PlanReport report={toUiPlanReport(plan.report)} />
            ) : (
              <div className="rounded-xl bg-surface shadow-card">
                <EmptyState title="Nothing parsed yet" />
              </div>
            )}
          </section>
        </div>
      </Page>
    );
  }

  const tab = typeof sp.tab === "string" && TABS.some((t) => t.key === sp.tab) ? sp.tab : "board";
  const schedule = await getSchedule(db, planId);
  const uiSchedule = schedule ? toUiSchedule(schedule) : null;
  const pillarCount = plan.taxonomy?.pillars?.length ?? 0;
  const tabLabel = TABS.find((t) => t.key === tab)?.label ?? "Board";

  const subtitle = [
    `${counts.total} page${counts.total === 1 ? "" : "s"}${pillarCount ? ` across ${pillarCount} pillar${pillarCount === 1 ? "" : "s"}` : ""}`,
    `imported ${shortDate(plan.createdAt)}`,
    uiSchedule ? describeCadence(uiSchedule) : "no cadence set yet",
  ].join(" · ");

  return (
    <Page
      crumbs={[{ label: "Content plans", href: "/plans" }, { label: plan.filename, href: `/plans/${id}` }, { label: tabLabel }]}
      title={plan.filename}
      subtitle={subtitle}
      width={tab === "items" ? "wide" : "default"}
      actions={tab === "board" ? <LiveRefresh src="/api/plan-events" /> : undefined}
      headerActions={
        <>
          {uiSchedule && <ScheduleStatusBadge status={uiSchedule.status} />}
          {plan.status !== "ready" && <PlanStatusBadge status={plan.status} />}
        </>
      }
    >
      <SegmentedNav
        className="mb-8"
        label="Plan sections"
        items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/plans/${id}?tab=${t.key}` }))}
        active={tab}
      />

      {tab === "board" && <BoardTab planId={planId} id={id} counts={counts} schedule={uiSchedule} />}
      {tab === "schedule" && (
        <ScheduleTab
          planId={planId}
          id={id}
          schedule={uiSchedule}
          remaining={counts.total - (counts.byStatus.done ?? 0) - (counts.byStatus.skipped ?? 0)}
        />
      )}
      {tab === "items" && <ItemsTab planId={planId} id={id} sp={sp} schedule={uiSchedule} />}
      {tab === "releases" && <ReleasesTab planId={planId} id={id} />}
    </Page>
  );
}

// ── board ─────────────────────────────────────────────────────────────────

async function BoardTab({
  planId,
  id,
  counts,
  schedule,
}: {
  planId: ObjectId;
  id: string;
  counts: Awaited<ReturnType<typeof planCounts>>;
  schedule: ReturnType<typeof toUiSchedule> | null;
}) {
  const db = await getDb();
  const companyId = getCompany().companyId;

  const blocked = await db.planItems
    .find({ planId, status: { $in: ["quarantined", "slug_conflict", "failed"] } })
    .sort({ sequence: 1 })
    .limit(25)
    .toArray();

  // What each blocked item is holding up is the number that makes an operator
  // act. Plans build bottom-up, so a stuck page holds up the pages ABOVE it:
  // its hub and its pillar page. A quarantined page holds nothing (its parent
  // goes ahead without it).
  const subtreeSizes = new Map<string, number>();
  for (const b of blocked) {
    if (!b._id || b.status === "quarantined") continue;
    let above = 0;
    let parentId = b.parentItemId;
    while (parentId) {
      const parent = await db.planItems.findOne({ _id: parentId }, { projection: { parentItemId: 1, status: 1 } });
      if (!parent) break;
      if (parent.status === "planned" || parent.status === "failed") above++;
      parentId = parent.parentItemId;
    }
    subtreeSizes.set(b._id.toHexString(), above);
  }

  const events = await latestPlanEvents(db, planId, 25);
  const inProduction = await db.planItems
    .find({ planId, status: { $in: ["enqueued", "in_progress"] } })
    .sort({ sequence: 1 })
    .toArray();
  const awaitingReview = await db.articles.countDocuments({ companyId, stage: "review" });
  const interviews = await db.articles
    .find({ companyId, planId, "interview.status": "open" })
    .project<{ slug: string; topic?: string; frontmatter?: Record<string, unknown> }>({ slug: 1, topic: 1, frontmatter: 1 })
    .sort({ updatedAt: -1 })
    .limit(10)
    .toArray();
  const openInterviews = await db.articles.countDocuments({ companyId, planId, "interview.status": "open" });

  const plan = await db.plans.findOne({ _id: planId }, { projection: { buildHold: 1 } });
  const interviewMode = await defaultInterviewMode(db, companyId, planId);
  const building = await db.planItems.countDocuments({
    planId,
    buildQueuedAt: { $exists: true },
    status: { $in: ["planned", "failed"] },
  });

  // The article behind each page in production: its stage drives the stepper.
  const articleIds = inProduction.map((i) => i.articleId).filter(Boolean) as ObjectId[];
  const articles = articleIds.length
    ? await db.articles
        .find({ _id: { $in: articleIds } })
        .project<{ _id: ObjectId; slug: string; stage: string; interview?: { status?: string } }>({ slug: 1, stage: 1, interview: 1 })
        .toArray()
    : [];
  const articleById = new Map(articles.map((a) => [a._id.toHexString(), a]));

  // Per-pillar progress.
  const pillarRows = await db.planItems
    .aggregate<{ _id: { id: string; name: string }; total: number; done: number; inflight: number; blocked: number; skipped: number }>([
      { $match: { planId } },
      {
        $group: {
          _id: { id: "$pillarId", name: "$pillarName" },
          total: { $sum: 1 },
          done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
          inflight: { $sum: { $cond: [{ $in: ["$status", ["enqueued", "in_progress"]] }, 1, 0] } },
          blocked: { $sum: { $cond: [{ $in: ["$status", ["quarantined", "slug_conflict", "failed"]] }, 1, 0] } },
          skipped: { $sum: { $cond: [{ $eq: ["$status", "skipped"] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  pillarRows.sort((a, b) => a._id.id.localeCompare(b._id.id, undefined, { numeric: true }));

  const done = counts.byStatus.done ?? 0;
  const articleTitle = (a: { slug: string; topic?: string; frontmatter?: Record<string, unknown> }) =>
    String(a.frontmatter?.["title"] ?? a.topic ?? a.slug);
  const needsCount = blocked.length + interviews.length;

  return (
    <div className="flex flex-col gap-10">
      {plan?.buildHold && (
        <Callout icon={Hourglass} title="Builds are on hold">
          {plan.buildHold}
        </Callout>
      )}

      <div className="grid items-start gap-x-6 gap-y-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Needs you */}
        <section aria-labelledby="needs-you">
          <SectionHeader title={<span id="needs-you">Needs you</span>} count={needsCount} />
          <div className="overflow-hidden rounded-xl bg-surface shadow-card">
            {needsCount === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing needs you" hint="A blocked page never stalls the plan: the next ready article goes instead." />
            ) : (
              <ul>
                {interviews.map((a) => (
                  <li key={a.slug} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b-[0.5px] border-separator px-[18px] py-3.5 last:border-0">
                    <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                      <span className="text-sm font-semibold text-pretty">{articleTitle(a)}</span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-needs-fg">
                        <MessageSquare aria-hidden className="size-3.5" />
                        Expert interview waiting
                      </span>
                    </span>
                    <Button variant="needs" asChild>
                      <Link href={`/production/interview/${a.slug}`}>Start</Link>
                    </Button>
                  </li>
                ))}
                {blocked.map((b) => {
                  const holding = subtreeSizes.get(b._id?.toHexString() ?? "") ?? 0;
                  const st = itemStatus(b.status);
                  return (
                    <li
                      key={b._id?.toHexString()}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b-[0.5px] border-separator px-[18px] py-3.5 last:border-0"
                    >
                      <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                        <span className="flex items-baseline gap-2">
                          <span className="text-xs text-label-3 tabular-nums">#{b.sequence}</span>
                          <span className="min-w-0 text-sm font-semibold text-pretty">{b.title}</span>
                        </span>
                        <span className={st.family === "problem" ? "text-xs text-problem-fg" : "text-xs text-needs-fg"}>
                          {st.label}
                          {b.lastError ? `: ${b.lastError}` : ""}
                        </span>
                        {holding > 0 && (
                          <span className="text-xs text-label-2">
                            Holding up {holding} page{holding === 1 ? "" : "s"} above it
                          </span>
                        )}
                      </span>
                      <Button variant="secondary" asChild>
                        <Link href={`/plans/${id}?tab=items&q=${encodeURIComponent(b.externalId)}`}>Resolve</Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {blocked.length > 0 && (
            <p className="mt-2 px-1 text-xs text-label-2">
              Retry or skip these on the Articles tab. A blocked page never stalls the plan: the next ready article goes instead.
            </p>
          )}
        </section>

        {/* Cadence + interview */}
        <section className="flex flex-col gap-4">
          <SectionHeader title="Cadence" actions={<MoreLink href={`/plans/${id}?tab=schedule`}>Edit</MoreLink>} />
          <div className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-card">
            {schedule ? (
              <>
                <ScheduleStatusBadge status={schedule.status} />
                <p className="text-[17px] leading-[26px] tracking-[-0.01em] text-pretty">Build {describeCadence(schedule)}.</p>
                {schedule.pause && <p className="text-xs text-needs-fg">{schedule.pause.detail}</p>}
              </>
            ) : (
              <>
                <p className="text-[15px] leading-[22px] text-label-2 text-pretty">
                  No cadence yet. Build a subtopic from the Articles tab, or set a cadence to produce the plan unattended.
                </p>
                <Button asChild className="w-fit">
                  <Link href={`/plans/${id}?tab=schedule`}>Set a cadence</Link>
                </Button>
              </>
            )}
          </div>
          <SettingsGroup>
            <PlanInterviewToggle planId={planId.toHexString()} mode={interviewMode} />
          </SettingsGroup>
        </section>
      </div>

      {/* Progress */}
      <section>
        <SectionHeader
          title="Progress"
          actions={
            <span className="text-[13px] text-label-2 tabular-nums">
              {done} of {counts.total} produced
            </span>
          }
        />
        <div className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-card">
          <ProgressBar value={counts.total ? done / counts.total : 0} family={counts.total > 0 && done === counts.total ? "done" : "working"} />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
            <StatTile label="Produced" value={done} />
            <StatTile label="In production" value={inProduction.length} />
            <StatTile label="Planned" value={counts.byStatus.planned ?? 0} />
            <StatTile label="Blocked" value={blocked.length} family="problem" />
            <StatTile label="Skipped" value={counts.byStatus.skipped ?? 0} />
            <StatTile label="Awaiting your review" value={awaitingReview} family="needs" />
            <StatTile label="Interviews waiting" value={openInterviews} family="needs" />
            <StatTile label="Queued for build" value={building} />
          </div>
        </div>
        {pillarRows.length > 1 && (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
            {pillarRows.map((p) => {
              const scope = p.total - p.skipped;
              const sub = [
                p.inflight ? `${p.inflight} in production` : "",
                p.blocked ? `${p.blocked} blocked` : "",
                p.skipped ? `${p.skipped} skipped` : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <Link
                  key={p._id.id}
                  href={`/plans/${id}?tab=items&pillar=${encodeURIComponent(p._id.id)}`}
                  className="flex items-center gap-4 rounded-[14px] bg-surface p-4 shadow-card transition-colors hover:bg-fill-2"
                >
                  <ProgressRing value={p.done} total={scope || p.total} size={56} stroke={5} family={scope > 0 && p.done >= scope ? "done" : "working"} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold">{p._id.name}</span>
                    <span className="text-[13px] text-label-2 tabular-nums">
                      {p.done} of {scope || p.total} pages built
                    </span>
                    {sub && <span className="text-xs text-label-2">{sub}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* In production now */}
      <section>
        <SectionHeader title="In production now" count={inProduction.length} actions={<MoreLink href="/production">Open Production</MoreLink>} />
        <div className="overflow-hidden rounded-xl bg-surface shadow-card">
          {inProduction.length === 0 ? (
            <EmptyState icon={Rocket} title="Nothing in flight" hint="Build a subtopic from the Articles tab, or set a cadence." />
          ) : (
            <ul>
              {inProduction.map((i) => {
                const a = i.articleId ? articleById.get(i.articleId.toHexString()) : undefined;
                const waiting = a?.interview?.status === "open";
                const inner = (
                  <>
                    <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold">{i.title}</span>
                      <span className="truncate text-xs text-label-2">
                        {i.pillarName}
                        {i.subtopicName ? ` › ${i.subtopicName}` : ""}
                      </span>
                    </span>
                    {a ? (
                      <>
                        <PhaseStepper states={phaseStates(a.stage, { waiting })} />
                        <span className="w-[150px]">
                          <Status
                            family={a.stage === "failed" ? "problem" : waiting ? "needs" : a.stage === "queued" ? "idle" : "working"}
                            colored
                          >
                            {waiting ? "Waiting for interview" : stageLabel(a.stage)}
                          </Status>
                        </span>
                      </>
                    ) : (
                      <span className="w-[150px]">
                        <PlanItemStatusBadge status={i.status} />
                      </span>
                    )}
                    {a && <ChevronRight aria-hidden className="size-4 text-label-3" />}
                  </>
                );
                return (
                  <li key={i._id?.toHexString()} className="border-b-[0.5px] border-separator last:border-0">
                    {a ? (
                      <Link
                        href={waiting ? `/production/interview/${a.slug}` : `/production/review/${a.slug}`}
                        className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 transition-colors hover:bg-fill-2"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Activity */}
      <section>
        <SectionHeader
          title="Recent activity"
          actions={
            <span className="inline-flex items-center gap-1.5 text-xs text-label-2">
              <StatusDot family="done" className="size-1.5" />
              Updates as the worker reports
            </span>
          }
        />
        <div className="overflow-hidden rounded-xl bg-surface shadow-card">
          <EventLog
            events={[...events].reverse().map((e) => ({
              id: e._id?.toHexString() ?? `${e.seq}`,
              ts: e.ts,
              type: e.type,
              message: e.message,
            }))}
          />
        </div>
      </section>
    </div>
  );
}

// ── cadence ───────────────────────────────────────────────────────────────

async function ScheduleTab({
  planId,
  id,
  schedule,
  remaining,
}: {
  planId: ObjectId;
  id: string;
  schedule: ReturnType<typeof toUiSchedule> | null;
  remaining: number;
}) {
  const db = await getDb();
  const items = await listPlanItems(db, { planId, limit: 2000 });
  const inFlight = items.filter((i) => i.status === "enqueued" || i.status === "in_progress").length;

  const raw = schedule
    ? previewSchedule(
        items.map((i) => ({
          key: i._id?.toHexString() ?? i.externalId,
          sequence: i.sequence,
          slug: i.slug,
          title: i.title,
          role: i.pageRole,
          status: i.status,
          parentKey: i.parentItemId?.toHexString() ?? null,
          failureCount: i.failureCount,
          retryAfter: i.retryAfter,
          dependencyOverride: i.dependencyOverride,
          held: Boolean(i.held),
        })),
        new Date(),
        10,
        {
          cadence: {
            timezone: schedule.timezone,
            daysOfWeek: schedule.daysOfWeek,
            timeOfDay: schedule.timeOfDay,
            batchSize: schedule.batchSize,
          },
          limits: {
            maxInFlight: schedule.limits.maxInFlight,
            maxAwaitingReview: schedule.limits.maxAwaitingReview,
            consecutiveFailureLimit: schedule.limits.consecutiveFailureLimit,
            itemMaxAttempts: schedule.limits.itemMaxAttempts,
          },
          requireApproval: schedule.requireApproval,
          estimatedArticleMinutes: schedule.estimatedArticleMinutes,
          inFlightNow: inFlight,
        },
      )
    : [];

  return (
    <PlanSchedule
      planId={id}
      schedule={schedule}
      preview={raw.map(toUiPreviewEntry)}
      caveat={previewCaveat({
        maxInFlight: schedule?.limits.maxInFlight ?? 3,
        maxAwaitingReview: schedule?.limits.maxAwaitingReview ?? 10,
        consecutiveFailureLimit: schedule?.limits.consecutiveFailureLimit ?? 3,
        itemMaxAttempts: schedule?.limits.itemMaxAttempts ?? 2,
      })}
      remaining={remaining}
    />
  );
}

// ── articles ──────────────────────────────────────────────────────────────

async function ItemsTab({
  planId,
  id,
  sp,
  schedule,
}: {
  planId: ObjectId;
  id: string;
  sp: Record<string, string | string[] | undefined>;
  schedule: ReturnType<typeof toUiSchedule> | null;
}) {
  const db = await getDb();
  // The whole plan, once: filtering and sorting happen in the browser, so
  // every combination of column filters is instant.
  const graph = await loadPlanGraph(db, planId);
  const articleIds = graph.items.map((d) => d.articleId).filter(Boolean) as ObjectId[];
  const articles = articleIds.length
    ? await db.articles
        .find({ _id: { $in: articleIds } })
        .project<{ _id: ObjectId; slug: string }>({ slug: 1 })
        .toArray()
    : [];
  const slugById = new Map(articles.map((a) => [a._id.toHexString(), a.slug]));
  const requireApproval = schedule?.requireApproval ?? false;

  const rows = graph.items.map((d) => {
    const articleKey = d.articleId?.toHexString();
    return toUiPlanItemRow(d, articleKey ? slugById.get(articleKey) : undefined, {
      waiting: describeWaiting(graph, d, requireApproval),
      hasChildren: (graph.childrenOf.get(itemKey(d))?.length ?? 0) > 0,
      articleStage: articleKey ? (graph.stageOf.get(articleKey) ?? null) : null,
    });
  });

  // Carry the filter state through a server render (e.g. after an action).
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const one of Array.isArray(v) ? v : v ? [v] : []) query.append(k, one);
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-surface shadow-card">
        <EmptyState title="This plan has no articles" />
      </div>
    );
  }
  return <PlanItemsTable key={id} planId={id} rows={rows} initialQuery={query.toString()} />;
}

// ── releases ──────────────────────────────────────────────────────────────

async function ReleasesTab({ planId, id }: { planId: ObjectId; id: string }) {
  const db = await getDb();
  const [units, reexport] = await Promise.all([listReleases(db, planId), articlesToReexport(db, getCompany().companyId, planId)]);
  const releases: UiRelease[] = units.map((u) => ({
    key: u.key,
    kind: u.kind,
    pillarId: u.pillarId,
    pillarName: u.pillarName,
    subtopicName: u.subtopicName,
    title: u.title,
    state: u.state,
    counts: u.counts,
    excluded: u.excluded,
    members: u.members.map((m) => ({
      externalId: m.externalId,
      title: m.title,
      role: m.role,
      slug: m.slug,
      path: m.path,
      stage: m.stage,
      live: m.live,
      liveUrl: m.liveUrl,
      exportedAt: m.exportedAt ? m.exportedAt.toISOString() : null,
      blocking: m.blocking,
      hasArticle: Boolean(m.articleId),
    })),
  }));
  return <PlanReleases planId={id} releases={releases} reexport={reexport} />;
}
