import Link from "next/link";
import type { Filter, ObjectId } from "mongodb";
import type { KeywordDoc } from "@blogagent/engine";
import { getCompany, getDb } from "@/lib/db";
import { toUiClusterSummary, toUiKeyword } from "@/lib/ui-types";
import { Card, EmptyState, PageHeader, TabNav, cls, tableCls } from "@/components/ui";
import { ChatForm } from "@/components/strategy-chat";
import { UploadCsv } from "@/components/strategy-upload";
import { SelectTable } from "@/components/strategy-select";
import { ClusterRunForm } from "@/components/strategy-research";
import { ClusterStatusBadge } from "@/components/cluster-ui";
import { LiveRefresh } from "@/components/live-refresh";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "chat", label: "Chat" },
  { key: "upload", label: "Upload Keywords" },
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

  return (
    <>
      <PageHeader
        title="Content Strategy"
        subtitle="Kick off article production — by prompt, CSV, agent, or from the keyword library"
      />
      <TabNav tabs={TABS} active={tab} hrefFor={(k) => (k === "chat" ? "/strategy" : `/strategy?tab=${k}`)} />
      {tab === "chat" && <ChatForm />}
      {tab === "upload" && <UploadCsv />}
      {tab === "research" && <ResearchTab />}
      {tab === "select" && <SelectTab />}
    </>
  );
}

async function ResearchTab() {
  const db = await getDb();
  const companyId = getCompany().companyId;
  const clusters = await db.clusters
    .find({ companyId })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  const counts = await db.themes
    .aggregate<{ _id: ObjectId; n: number }>([
      { $match: { companyId } },
      { $group: { _id: "$clusterId", n: { $sum: 1 } } },
    ])
    .toArray();
  const countByCluster = new Map(counts.map((c) => [c._id.toHexString(), c.n]));
  const rows = clusters.map((c) =>
    toUiClusterSummary(c, countByCluster.get(c._id?.toHexString() ?? "") ?? 0),
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <ClusterRunForm />
        <Card title="Keyword Researcher">
          <EmptyState
            title="Coming with roadmap Phase 4B."
            hint="Demand-driven sibling agent: DataForSEO volumes, difficulty, and competitor gaps → scored keywords in the library. Manual research tools (Keywords For Site, Related, Suggestions, competitor lookups) land with Phase 4A."
          />
        </Card>
      </div>

      <Card title="Cluster runs" actions={<LiveRefresh src="/api/cluster-events" />}>
        {rows.length === 0 ? (
          <EmptyState
            title="No cluster runs yet."
            hint="Seed the Topic & Cluster Generator above — the run streams its stages here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th className={tableCls.th}>Seed</th>
                  <th className={tableCls.th}>Status</th>
                  <th className={tableCls.th}>Stage</th>
                  <th className={tableCls.th}>Themes</th>
                  <th className={tableCls.th}>Briefs</th>
                  <th className={tableCls.th}>LLM calls</th>
                  <th className={tableCls.th}>Started</th>
                  <th className={tableCls.th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={tableCls.tr}>
                    <td className={cls(tableCls.td, "font-medium text-slate-800")}>{c.seed}</td>
                    <td className={tableCls.td}>
                      <ClusterStatusBadge status={c.status} />
                    </td>
                    <td className={cls(tableCls.td, "text-slate-500")}>{c.stage}</td>
                    <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>{c.themeCount}</td>
                    <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>{c.briefCount}</td>
                    <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>{c.llmCalls}</td>
                    <td className={cls(tableCls.td, "text-slate-500")}>
                      {new Date(c.queuedAt).toLocaleString()}
                    </td>
                    <td className={tableCls.td}>
                      <Link href={`/strategy/research/${c.id}`} className="text-accent hover:underline">
                        open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

async function SelectTab() {
  const db = await getDb();
  const companyId = getCompany().companyId;
  const filter: Filter<KeywordDoc> = { companyId, status: { $in: ["idea", "queued"] } };
  const docs = await db.keywords
    .find(filter)
    .sort({ priority: -1, volume: -1, updatedAt: -1 })
    .limit(500)
    .toArray();
  return <SelectTable rows={docs.map((d) => toUiKeyword(d))} />;
}
