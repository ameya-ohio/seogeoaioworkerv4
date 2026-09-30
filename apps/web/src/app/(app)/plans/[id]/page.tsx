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
import { getCompany, getDb, getFormats } from "@/lib/db";
import {
  toUiPlanItemRow,
  toUiPlanReport,
  toUiPreviewEntry,
  toUiSchedule,
} from "@/lib/ui-types";
import { Card, EmptyState, PageHeader, TabNav, cls } from "@/components/ui";
import { LiveRefresh } from "@/components/live-refresh";
import { PlanItemStatusBadge, PlanStatusBadge, ScheduleStatusBadge, describeCadence } from "@/components/plan-ui";
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
      .filter((u) =>
        ["pageRole", "funnel", "priority", "searchIntent", "format"].includes(u.field),
      )
      .map((u) => ({
        field: u.field as UnresolvedValue["field"],
        value: u.value,
        rows: u.rows.length,
      }));

    return (
      <>
        <PageHeader
          title={plan.filename}
          subtitle="Check what was read before anything is created"
          actions={<PlanStatusBadge status={plan.status} />}
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <PlanMapper
            planId={id}
            sheets={plan.sheets.map((s) => ({ name: s.name, rows: s.rows.length }))}
            activeSheet={plan.mapping.sheet}
            headers={headers}
            fields={fields}
            unresolved={unresolved}
            blocking={plan.report?.blocking ?? []}
            formatOptions={(await getFormats()).formats.map((f) => ({ value: f.slug, label: f.label }))}
          />
          <Card title="What we read">
            {plan.report ? (
              <PlanReport report={toUiPlanReport(plan.report)} />
            ) : (
              <EmptyState title="Nothing parsed yet." />
            )}
          </Card>
        </div>
      </>
    );
  }

  const tab =
    typeof sp.tab === "string" && TABS.some((t) => t.key === sp.tab) ? sp.tab : "board";
  const schedule = await getSchedule(db, planId);
  const uiSchedule = schedule ? toUiSchedule(schedule) : null;

  return (
    <>
      <PageHeader
        title={plan.filename}
        subtitle={
          uiSchedule
            ? describeCadence(uiSchedule)
            : `${counts.total} planned articles — no cadence set yet`
        }
        actions={
          <div className="flex items-center gap-2">
            {uiSchedule && <ScheduleStatusBadge status={uiSchedule.status} />}
            <PlanStatusBadge status={plan.status} />
          </div>
        }
      />
      <TabNav tabs={TABS} active={tab} hrefFor={(k) => `/plans/${id}?tab=${k}`} />

      {tab === "board" && <BoardTab planId={planId} id={id} counts={counts} />}
      {tab === "schedule" && (
        <ScheduleTab planId={planId} id={id} schedule={uiSchedule} remaining={
          counts.total - (counts.byStatus.done ?? 0) - (counts.byStatus.skipped ?? 0)
        } />
      )}
      {tab === "items" && <ItemsTab planId={planId} id={id} sp={sp} schedule={uiSchedule} />}
      {tab === "releases" && <ReleasesTab planId={planId} id={id} />}
    </>
  );
}

// ── board ─────────────────────────────────────────────────────────────────

async function BoardTab({
  planId,
  id,
  counts,
}: {
  planId: ObjectId;
  id: string;
  counts: Awaited<ReturnType<typeof planCounts>>;
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
      const parent = await db.planItems.findOne(
        { _id: parentId },
        { projection: { parentItemId: 1, status: 1 } },
      );
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
  const openInterviews = await db.articles.countDocuments({ companyId, planId, "interview.status": "open" });

  const plan = await db.plans.findOne({ _id: planId }, { projection: { buildHold: 1 } });
  const interviewMode = await defaultInterviewMode(db, companyId, planId);
  const building = await db.planItems.countDocuments({
    planId,
    buildQueuedAt: { $exists: true },
    status: { $in: ["planned", "failed"] },
  });

  const done = counts.byStatus.done ?? 0;
  const pct = counts.total > 0 ? Math.round((done / counts.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <Card title="Progress" actions={<LiveRefresh src="/api/plan-events" />}>
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Stat label="Produced" value={done} />
          <Stat label="In production" value={inProduction.length} />
          <Stat label="Planned" value={counts.byStatus.planned ?? 0} />
          <Stat label="Blocked" value={blocked.length} tone={blocked.length ? "warn" : undefined} />
          <Stat label="Skipped" value={counts.byStatus.skipped ?? 0} />
          <Stat label="Awaiting your review" value={awaitingReview} />
          <Stat label="Interviews waiting" value={openInterviews} tone={openInterviews ? "warn" : undefined} />
          <Stat label="Queued for build" value={building} />
        </div>
        {plan?.buildHold && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{plan.buildHold}</p>
        )}
        <PlanInterviewToggle planId={planId.toHexString()} mode={interviewMode} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="In production now">
          {inProduction.length === 0 ? (
            <EmptyState
              title="Nothing in flight."
              hint="Build a subtopic from the Articles tab, or set a cadence."
            />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {inProduction.map((i) => (
                <li key={i._id?.toHexString()} className="flex items-baseline gap-2">
                  <span className="tabular-nums text-slate-400">#{i.sequence}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{i.title}</span>
                  <PlanItemStatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Needs you">
          {blocked.length === 0 ? (
            <EmptyState title="Nothing blocked." />
          ) : (
            <ul className="space-y-2 text-sm">
              {blocked.map((b) => {
                const holding = subtreeSizes.get(b._id?.toHexString() ?? "") ?? 0;
                return (
                  <li key={b._id?.toHexString()} className="border-b border-slate-100 pb-2 last:border-0">
                    <div className="flex items-baseline gap-2">
                      <span className="tabular-nums text-slate-400">#{b.sequence}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                        {b.title}
                      </span>
                      <PlanItemStatusBadge status={b.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {b.lastError ?? "blocked"}
                      {holding > 0 && (
                        <span className="ml-1 font-medium text-amber-700">
                          — holding up {holding} article{holding === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Retry or skip these on the{" "}
            <Link href={`/plans/${id}?tab=items`} className="text-accent hover:underline">
              Articles tab
            </Link>
            . A blocked page never stalls the plan — the next ready article goes instead.
          </p>
        </Card>
      </div>

      <Card title="Recent activity">
        {events.length === 0 ? (
          <EmptyState title="No activity yet." />
        ) : (
          <ul className="space-y-1 font-mono text-xs text-slate-600">
            {events.map((e) => (
              <li key={e._id?.toHexString()}>
                <span className="text-slate-400">
                  {new Date(e.ts).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </span>{" "}
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div>
      <div
        className={cls(
          "text-xl font-semibold tabular-nums",
          tone === "warn" ? "text-amber-600" : "text-slate-800",
        )}
      >
        {value}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
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
      articleStage: articleKey ? graph.stageOf.get(articleKey) ?? null : null,
    });
  });

  // Carry the filter state through a server render (e.g. after an action).
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const one of Array.isArray(v) ? v : v ? [v] : []) query.append(k, one);
  }

  if (rows.length === 0) return <EmptyState title="This plan has no articles." />;
  return <PlanItemsTable planId={id} rows={rows} initialQuery={query.toString()} />;
}

// ── releases ──────────────────────────────────────────────────────────────

async function ReleasesTab({ planId, id }: { planId: ObjectId; id: string }) {
  const db = await getDb();
  const [units, reexport] = await Promise.all([
    listReleases(db, planId),
    articlesToReexport(db, getCompany().companyId, planId),
  ]);
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
