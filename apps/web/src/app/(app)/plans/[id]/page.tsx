import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import {
  PLAN_FIELD_SPECS,
  assignColumns,
  getPlan,
  getSchedule,
  latestPlanEvents,
  listPlanItems,
  planCounts,
  previewCaveat,
  previewSchedule,
  type PlanItemStatus,
} from "@blogagent/engine";
import { getCompany, getDb } from "@/lib/db";
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
import { PlanItemsTable } from "@/components/plan-items";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "board", label: "Board" },
  { key: "schedule", label: "Cadence" },
  { key: "items", label: "Articles" },
];

const ITEMS_PER_PAGE = 100;

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
        ["pageRole", "funnel", "priority", "searchIntent"].includes(u.field),
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
      {tab === "items" && <ItemsTab planId={planId} sp={sp} />}
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
  // act, so compute it rather than just listing the failures.
  const subtreeSizes = new Map<string, number>();
  for (const b of blocked) {
    if (!b._id) continue;
    const direct = await db.planItems.countDocuments({ planId, parentItemId: b._id });
    let total = direct;
    if (b.pageRole === "pillar") {
      total = await db.planItems.countDocuments({ planId, pillarId: b.pillarId, _id: { $ne: b._id } });
    }
    subtreeSizes.set(b._id.toHexString(), total);
  }

  const events = await latestPlanEvents(db, planId, 25);
  const inProduction = await db.planItems
    .find({ planId, status: { $in: ["enqueued", "in_progress"] } })
    .sort({ sequence: 1 })
    .toArray();
  const awaitingReview = await db.articles.countDocuments({ companyId, stage: "review" });

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
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="In production now">
          {inProduction.length === 0 ? (
            <EmptyState
              title="Nothing in flight."
              hint="Set a cadence, or send articles by hand from the Articles tab."
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
            . A blocked page never stalls the cadence — the next ready article goes instead.
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
  sp,
}: {
  planId: ObjectId;
  sp: Record<string, string | string[] | undefined>;
}) {
  const db = await getDb();
  const page = typeof sp.page === "string" ? Math.max(1, Number.parseInt(sp.page, 10) || 1) : 1;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const pillarId = typeof sp.pillar === "string" ? sp.pillar : undefined;

  const docs = await listPlanItems(db, {
    planId,
    limit: ITEMS_PER_PAGE,
    skip: (page - 1) * ITEMS_PER_PAGE,
    ...(status ? { status: [status as PlanItemStatus] } : {}),
    ...(pillarId ? { pillarId } : {}),
  });

  const articleIds = docs.map((d) => d.articleId).filter(Boolean);
  const articles = articleIds.length
    ? await db.articles
        .find({ _id: { $in: articleIds as ObjectId[] } })
        .project<{ _id: ObjectId; slug: string }>({ slug: 1 })
        .toArray()
    : [];
  const slugById = new Map(articles.map((a) => [a._id.toHexString(), a.slug]));

  const total = await db.planItems.countDocuments({
    planId,
    ...(status ? { status: status as PlanItemStatus } : {}),
    ...(pillarId ? { pillarId } : {}),
  });
  const pages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  const pillars = await db.planItems.distinct("pillarId", { planId });
  const base = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ tab: "items" });
    const merged = { status, pillar: pillarId, page: String(page), ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={base({ status: undefined, page: "1" })} className={chip(!status)}>
          all
        </Link>
        {["planned", "in_progress", "done", "failed", "quarantined", "skipped", "slug_conflict"].map(
          (s) => (
            <Link key={s} href={base({ status: s, page: "1" })} className={chip(status === s)}>
              {s.replace(/_/g, " ")}
            </Link>
          ),
        )}
        {pillars.length > 1 && (
          <span className="ml-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400">pillar:</span>
            <Link href={base({ pillar: undefined, page: "1" })} className={chip(!pillarId)}>
              any
            </Link>
            {pillars.slice(0, 20).map((p) => (
              <Link key={String(p)} href={base({ pillar: String(p), page: "1" })} className={chip(pillarId === p)}>
                {String(p)}
              </Link>
            ))}
          </span>
        )}
      </div>

      {docs.length === 0 ? (
        <EmptyState title="No articles match this filter." />
      ) : (
        <PlanItemsTable
          rows={docs.map((d) =>
            toUiPlanItemRow(d, d.articleId ? slugById.get(d.articleId.toHexString()) : undefined),
          )}
        />
      )}

      {pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {page > 1 && (
            <Link href={base({ page: String(page - 1) })} className="text-accent hover:underline">
              ← previous
            </Link>
          )}
          <span className="text-slate-500">
            page {page} of {pages} · {total} articles
          </span>
          {page < pages && (
            <Link href={base({ page: String(page + 1) })} className="text-accent hover:underline">
              next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function chip(active: boolean): string {
  return cls(
    "rounded-full px-2.5 py-1 text-xs",
    active ? "bg-accent text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
  );
}
