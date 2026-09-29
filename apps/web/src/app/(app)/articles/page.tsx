import Link from "next/link";
import { getCompany, getDb, getFormatLabels } from "@/lib/db";
import { toUiArticleSummary } from "@/lib/ui-types";
import { FacetBadges } from "@/components/facets";
import { EmptyState, PageHeader, StageBadge, cls, tableCls } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const stage = typeof params.stage === "string" ? params.stage : "all";
  const funnel = typeof params.funnel === "string" && ["tofu", "mofu", "bofu"].includes(params.funnel) ? params.funnel : "all";

  const db = await getDb();
  const companyId = getCompany().companyId;
  const filter: Record<string, unknown> = { companyId };
  if (stage !== "all") filter.stage = stage;
  if (funnel !== "all") filter["facets.funnel"] = funnel;

  const docs = await db.articles.find(filter).sort({ updatedAt: -1 }).limit(300).toArray();
  const labels = await getFormatLabels();
  const rows = docs.map((d) => toUiArticleSummary(d, labels));
  const href = (s: string, f: string) => {
    const q = [s !== "all" ? `stage=${s}` : "", f !== "all" ? `funnel=${f}` : ""].filter(Boolean).join("&");
    return q ? `/articles?${q}` : "/articles";
  };

  const stages = ["all", "review", "approved", "published", "failed"];

  return (
    <>
      <PageHeader title="Articles" subtitle={`${rows.length} article${rows.length === 1 ? "" : "s"}`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {stages.map((s) => (
          <Link
            key={s}
            href={href(s, funnel)}
            className={cls(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              s === stage
                ? "border-accent bg-accent-soft text-accent"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
            )}
          >
            {s}
          </Link>
        ))}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        {["all", "tofu", "mofu", "bofu"].map((f) => (
          <Link
            key={f}
            href={href(stage, f)}
            className={cls(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              f === funnel
                ? "border-accent bg-accent-soft text-accent"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
            )}
          >
            {f === "all" ? "any funnel" : f.toUpperCase()}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No articles yet." hint="Everything the pipeline produces lands here." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className={tableCls.table}>
            <thead>
              <tr>
                <th className={tableCls.th}>Title</th>
                <th className={tableCls.th}>Keyword</th>
                <th className={tableCls.th}>Stage</th>
                <th className={tableCls.th}>Audit</th>
                <th className={tableCls.th}>Updated</th>
                <th className={tableCls.th}>Links</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className={tableCls.tr}>
                  <td className={cls(tableCls.td, "max-w-md")}>
                    <Link href={`/articles/${a.slug}`} className="font-medium text-slate-800 hover:text-accent">
                      {a.title}
                    </Link>
                    <p className="text-xs text-slate-400">
                      {a.path ?? a.folder}
                      {a.imported && " · imported"}
                    </p>
                    {a.facets && (
                      <div className="mt-1">
                        <FacetBadges typeLabel={a.facets.typeLabel} funnel={a.facets.funnel} intent={a.facets.searchIntent} />
                      </div>
                    )}
                  </td>
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
                  <td className={cls(tableCls.td, "whitespace-nowrap text-slate-500")}>
                    {new Date(a.updatedAt).toLocaleDateString()}
                  </td>
                  <td className={cls(tableCls.td, "whitespace-nowrap")}>
                    <span className="flex gap-2 text-xs">
                      <Link href={`/production/review/${a.slug}`} className="text-accent hover:underline">
                        review
                      </Link>
                      {a.liveUrl && (
                        <a href={a.liveUrl} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                          live ↗
                        </a>
                      )}
                      {a.hubspotUrl && (
                        <a href={a.hubspotUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:underline">
                          hubspot ↗
                        </a>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
