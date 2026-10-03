import Link from "next/link";
import { listReleases } from "@blogagent/engine";
import { CheckCircle2, ChevronRight, Eye, ImageIcon, MessageSquare, Plus, Upload, type LucideIcon } from "lucide-react";
import { getCompany, getDb } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  MoreLink,
  Page,
  PhaseStepper,
  SectionHeader,
  Status,
  StatusDot,
  phaseStates,
  stageLabel,
} from "@/components/kit";
import { LiveRefresh } from "@/components/live-refresh";

export const dynamic = "force-dynamic";

const WORK = ["research", "interview", "evidence", "outline", "write", "hdcp", "edit", "verify", "schema", "design"] as const;
const NOTE_RX = /\[(?:VERIFY|HUMAN INPUT|NEEDS RESEARCH|NEEDS SOURCE)\b[^\]]*\]/g;

interface NeedItem {
  key: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  meta: string;
  action: string;
  href: string;
}

function minutesSince(d: Date | undefined): string {
  if (!d) return "";
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default async function TodayPage() {
  const db = await getDb();
  const companyId = getCompany().companyId;

  const [interviews, reviews, flight, shipped, plans] = await Promise.all([
    db.articles.find({ companyId, "interview.status": "open" }).sort({ updatedAt: -1 }).limit(12).toArray(),
    db.articles.find({ companyId, stage: "review" }).sort({ updatedAt: -1 }).limit(12).toArray(),
    db.articles
      .find({ companyId, stage: { $in: ["queued", ...WORK] }, "interview.status": { $ne: "open" } })
      .sort({ updatedAt: -1 })
      .limit(8)
      .toArray(),
    db.articles
      .find({ companyId, stage: { $in: ["published", "approved"] } })
      .sort({ updatedAt: -1 })
      .limit(3)
      .toArray(),
    db.plans.find({ companyId, status: "ready" }).project<{ _id: import("mongodb").ObjectId; filename: string }>({ filename: 1 }).toArray(),
  ]);

  const runs = await db.runs
    .find({ companyId, articleId: { $in: flight.map((a) => a._id!) }, status: { $in: ["queued", "running"] } })
    .toArray();
  const runByArticle = new Map(runs.map((r) => [r.articleId.toHexString(), r]));

  const releaseLists = await Promise.all(plans.map(async (p) => ({ plan: p, units: await listReleases(db, p._id) })));
  const readyReleases = releaseLists.flatMap(({ plan, units }) =>
    units.filter((u) => u.state === "ready").map((u) => ({ plan, unit: u })),
  );

  const title = (a: { frontmatter?: Record<string, unknown>; topic?: string; slug: string }) =>
    String(a.frontmatter?.["title"] ?? a.topic ?? a.slug);

  const needs: NeedItem[] = [
    ...interviews.map((a) => ({
      key: `i-${a.slug}`,
      icon: MessageSquare,
      eyebrow: "Expert interview",
      title: title(a),
      meta: "Research is done. Your answers set the thesis and the argument.",
      action: "Start interview",
      href: `/production/interview/${a.slug}`,
    })),
    ...reviews.map((a) => {
      const notes = (a.artifacts?.article ?? "").match(NOTE_RX)?.length ?? 0;
      const audit = a.audit ? (a.audit.failures === 0 ? "Audit clean" : `${a.audit.failures} audit failures`) : "Not audited yet";
      return {
        key: `r-${a.slug}`,
        icon: Eye,
        eyebrow: "Ready to review",
        title: title(a),
        meta: `${audit}${notes ? `. ${notes} note${notes === 1 ? "" : "s"} to resolve.` : "."}`,
        action: "Review",
        href: `/production/review/${a.slug}`,
      };
    }),
    ...readyReleases.map(({ plan, unit }) => ({
      key: `rel-${plan._id.toHexString()}-${unit.key}`,
      icon: Upload,
      eyebrow: "Release ready",
      title: unit.title,
      meta: `${unit.counts.total} page${unit.counts.total === 1 ? "" : "s"}, all approved. Ships as one release.`,
      action: "Ship release",
      href: `/plans/${plan._id.toHexString()}?tab=releases`,
    })),
  ];

  const subtitle =
    needs.length === 0
      ? "Nothing needs you right now."
      : `${needs.length === 1 ? "One thing needs" : `${needs.length} things need`} you. Everything else is moving on its own.`;

  return (
    <Page
      crumbs={[{ label: "Today" }]}
      title="Today"
      eyebrow={todayLabel()}
      subtitle={subtitle}
      actions={
        <>
          <LiveRefresh />
          <Button asChild>
            <Link href="/strategy">
              <Plus data-icon="inline-start" />
              New article
            </Link>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-10">
        <section aria-labelledby="needs-you">
          <SectionHeader title={<span id="needs-you">Needs you</span>} count={needs.length} />
          {needs.length === 0 ? (
            <div className="rounded-xl bg-surface shadow-card">
              <EmptyState
                icon={CheckCircle2}
                title="You're all caught up"
                hint="Interviews, drafts to review and releases to ship land here as the pipeline reaches them."
                action={
                  <Button variant="secondary" asChild>
                    <Link href="/strategy">Start an article</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-4">
              {needs.map((n) => (
                <article key={n.key} className="flex flex-col gap-4 rounded-[14px] bg-surface p-5 shadow-card">
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-needs-fg">
                      <StatusDot family="needs" className="size-[7px]" />
                      {n.eyebrow}
                    </span>
                    <span className="inline-flex size-8 items-center justify-center rounded-[9px] bg-fill-2 text-label-2">
                      <n.icon aria-hidden className="size-[17px] stroke-[1.7]" />
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-[17px] leading-[22px] font-semibold tracking-[-0.01em] text-pretty">{n.title}</h3>
                    <p className="text-[13px] leading-[18px] text-label-2 text-pretty">{n.meta}</p>
                  </div>
                  <div className="mt-auto">
                    <Button asChild>
                      <Link href={n.href}>{n.action}</Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader title="In flight" count={flight.length} actions={<MoreLink href="/production">Open Production</MoreLink>} />
          {flight.length === 0 ? (
            <div className="rounded-xl bg-surface shadow-card">
              <EmptyState title="Nothing in flight" hint="Queue an article from Strategy or build part of a content plan." />
            </div>
          ) : (
            <ul className="overflow-hidden rounded-xl bg-surface shadow-card">
              {flight.map((a) => {
                const run = runByArticle.get(a._id!.toHexString());
                const failed = a.stage === "failed";
                return (
                  <li key={a.slug} className="border-b-[0.5px] border-separator last:border-0">
                    <Link
                      href={`/production/review/${a.slug}`}
                      className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 transition-colors hover:bg-fill-2"
                    >
                      <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
                        <span className="truncate text-sm font-semibold">{title(a)}</span>
                        <span className="truncate text-xs text-label-2">{a.targetKeyword ?? a.slug}</span>
                      </span>
                      <PhaseStepper states={phaseStates(a.stage)} />
                      <span className="flex w-[150px] flex-col gap-0.5">
                        <Status family={failed ? "problem" : a.stage === "queued" ? "idle" : "working"} colored>
                          {stageLabel(a.stage)}
                        </Status>
                        <span className="pl-[15px] text-xs text-label-2 tabular-nums">
                          {run?.startedAt ? minutesSince(run.startedAt) : run ? "Waiting for a worker" : minutesSince(a.updatedAt) + " ago"}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="size-4 text-label-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {shipped.length > 0 && (
          <section>
            <SectionHeader title="Recently shipped" actions={<MoreLink href="/articles">All articles</MoreLink>} />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-6">
              {shipped.map((a) => (
                <Link key={a.slug} href={`/articles/${a.slug}`} className="group flex flex-col gap-2.5">
                  {a.header ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/storage/articles/${a.folder}/header.png`}
                      alt=""
                      className="aspect-[2/1] w-full rounded-xl object-cover shadow-card transition-transform duration-300 group-hover:scale-[1.01]"
                    />
                  ) : (
                    <span className="flex aspect-[2/1] w-full items-center justify-center rounded-xl bg-fill-2 text-label-3">
                      <ImageIcon className="size-7 stroke-[1.3]" />
                    </span>
                  )}
                  <span className="flex flex-col gap-1 px-0.5">
                    <span className="text-sm leading-[19px] font-semibold text-pretty">{title(a)}</span>
                    <Status family="done" className="text-xs">
                      {a.live ? "Live" : stageLabel(a.stage)} · {a.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </Status>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </Page>
  );
}
