import Link from "next/link";
import type { Filter, ObjectId } from "mongodb";
import { ChevronRight, Compass, Telescope } from "lucide-react";
import type { KeywordDoc } from "@blogagent/engine";
import { getCompany, getDb } from "@/lib/db";
import { toUiClusterSummary, toUiKeyword } from "@/lib/ui-types";
import { Card, EmptyState, MoreLink, Page, SectionHeader, SegmentedNav, Status, cls, stageFamily, stageLabel, tableCls } from "@/components/kit";
import { ChatForm } from "@/components/strategy-chat";
import { UploadCsv } from "@/components/strategy-upload";
import { SelectTable } from "@/components/strategy-select";
import { ClusterRunForm } from "@/components/strategy-research";
import { ClusterStatusBadge, clusterStageLabel } from "@/components/cluster-ui";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "chat", label: "Chat" },
  { key: "upload", label: "Upload keywords" },
  { key: "research", label: "Research" },
  { key: "select", label: "Select" },
];

export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = typeof params.tab === "string" && TABS.some((t) => t.key === params.tab) ? params.tab : "chat";
  const topic = typeof params.topic === "string" ? params.topic : "";

  return (
    <Page
      crumbs={[{ label: "Strategy" }]}
      width={tab === "chat" ? "narrow" : "default"}
      actions={
        tab !== "research" ? (
          <Button variant="secondary" asChild>
            <Link href="/strategy?tab=research">
              <Compass data-icon="inline-start" />
              Cluster research
            </Link>
          </Button>
        ) : undefined
      }
    >
      <div className="mb-8 flex justify-center">
        <SegmentedNav
          label="Strategy mode"
          active={tab}
          items={TABS.map((t) => ({ key: t.key, label: t.label, href: t.key === "chat" ? "/strategy" : `/strategy?tab=${t.key}` }))}
        />
      </div>
      {tab === "chat" && (
        <div className="flex flex-col gap-10">
          <ChatForm initialTopic={topic} />
          <RecentlyStarted />
        </div>
      )}
      {tab === "upload" && <UploadCsv />}
      {tab === "research" && <ResearchTab />}
      {tab === "select" && <SelectTab />}
    </Page>
  );
}

async function RecentlyStarted() {
  const db = await getDb();
  const companyId = getCompany().companyId;
  const docs = await db.articles
    .find({ companyId, imported: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(5)
    .project<{ slug: string; topic: string; stage: string; frontmatter?: Record<string, unknown>; interview?: { status?: string } }>({
      slug: 1,
      topic: 1,
      stage: 1,
      frontmatter: 1,
      "interview.status": 1,
    })
    .toArray();
  if (docs.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Recently started" actions={<MoreLink href="/production">Open Production</MoreLink>} />
      <ul className="overflow-hidden rounded-xl bg-surface shadow-card">
        {docs.map((a) => {
          const waiting = a.interview?.status === "open";
          const href = waiting ? `/production/interview/${a.slug}` : `/production/review/${a.slug}`;
          return (
            <li key={a.slug} className="border-b-[0.5px] border-separator last:border-0">
              <Link href={href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-fill-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{String(a.frontmatter?.["title"] ?? a.topic)}</span>
                {waiting ? <Status family="needs">Waiting for you</Status> : <Status family={stageFamily(a.stage)}>{stageLabel(a.stage)}</Status>}
                <ChevronRight aria-hidden className="size-4 text-label-3" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function ResearchTab() {
  const db = await getDb();
  const companyId = getCompany().companyId;
  const clusters = await db.clusters.find({ companyId }).sort({ createdAt: -1 }).limit(50).toArray();
  const counts = await db.themes
    .aggregate<{ _id: ObjectId; n: number }>([{ $match: { companyId } }, { $group: { _id: "$clusterId", n: { $sum: 1 } } }])
    .toArray();
  const countByCluster = new Map(counts.map((c) => [c._id.toHexString(), c.n]));
  const rows = clusters.map((c) => toUiClusterSummary(c, countByCluster.get(c._id?.toHexString() ?? "") ?? 0));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <ClusterRunForm />
        <Card
          title={
            <span className="flex items-center gap-2">
              <Telescope aria-hidden className="size-4 text-label-2" />
              Keyword researcher
            </span>
          }
        >
          <EmptyState
            icon={Telescope}
            title="Coming later"
            hint="A demand-driven sibling agent: search volumes, difficulty and competitor gaps, scored into the keyword library. Manual research tools arrive first."
            className="py-8"
          />
        </Card>
      </div>

      <section>
        <SectionHeader title="Research runs" count={rows.length} actions={<LiveRefresh src="/api/cluster-events" />} />
        {rows.length === 0 ? (
          <div className="rounded-xl bg-surface shadow-card">
            <EmptyState icon={Compass} title="No research runs yet" hint="Give the topic and cluster generator a seed. Its stages stream in here." />
          </div>
        ) : (
          <Card flush>
            <div className="overflow-x-auto">
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th scope="col" className={tableCls.th}>Seed</th>
                    <th scope="col" className={tableCls.th}>Status</th>
                    <th scope="col" className={tableCls.th}>Stage</th>
                    <th scope="col" className={cls(tableCls.th, "text-right")}>Themes</th>
                    <th scope="col" className={cls(tableCls.th, "text-right")}>Briefs</th>
                    <th scope="col" className={cls(tableCls.th, "text-right")}>LLM calls</th>
                    <th scope="col" className={tableCls.th}>Started</th>
                    <th scope="col" className={tableCls.th}>
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className={tableCls.tr}>
                      <td className={cls(tableCls.td, "font-semibold")}>
                        <Link href={`/strategy/research/${c.id}`} className="hover:text-primary">
                          {c.seed}
                        </Link>
                      </td>
                      <td className={tableCls.td}>
                        <ClusterStatusBadge status={c.status} />
                      </td>
                      <td className={cls(tableCls.td, "text-label-2")}>{clusterStageLabel(c.stage)}</td>
                      <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>{c.themeCount}</td>
                      <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>{c.briefCount}</td>
                      <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>{c.llmCalls}</td>
                      <td className={cls(tableCls.td, "whitespace-nowrap text-label-2 tabular-nums")}>
                        {new Date(c.queuedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </td>
                      <td className={cls(tableCls.td, "text-right")}>
                        <Button variant="ghost" size="icon-sm" asChild>
                          <Link href={`/strategy/research/${c.id}`} aria-label={`Open research run for ${c.seed}`}>
                            <ChevronRight />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

async function SelectTab() {
  const db = await getDb();
  const companyId = getCompany().companyId;
  const filter: Filter<KeywordDoc> = { companyId, status: { $in: ["idea", "queued"] } };
  const docs = await db.keywords.find(filter).sort({ priority: -1, volume: -1, updatedAt: -1 }).limit(500).toArray();
  return <SelectTable rows={docs.map((d) => toUiKeyword(d))} />;
}
