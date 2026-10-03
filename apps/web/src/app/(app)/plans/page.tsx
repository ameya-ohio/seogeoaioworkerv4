import Link from "next/link";
import { listPlans, planCounts } from "@blogagent/engine";
import { ChevronRight, LayoutGrid } from "lucide-react";
import { getCompany, getDb } from "@/lib/db";
import { toUiPlanSummary } from "@/lib/ui-types";
import { EmptyState, Page, ProgressBar, SectionHeader, tableCls } from "@/components/kit";
import { PlanStatusBadge } from "@/components/plan-ui";
import { PlanUploadForm } from "@/components/plan-upload";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const db = await getDb();
  const companyId = getCompany().companyId;
  const docs = await listPlans(db, companyId);
  const rows = await Promise.all(docs.map(async (d) => toUiPlanSummary(d, await planCounts(db, d._id!))));

  return (
    <Page
      crumbs={[{ label: "Content plans" }]}
      title="Content plans"
      subtitle="Import an SEO plan and produce it in dependency-correct order, on a cadence you set."
    >
      <div className="flex flex-col gap-10">
        <section aria-label="Import a content plan">
          <PlanUploadForm />
        </section>

        <section>
          <SectionHeader title="Plans" count={rows.length} />
          <div className="overflow-hidden rounded-xl bg-surface shadow-card">
            {rows.length === 0 ? (
              <EmptyState
                icon={LayoutGrid}
                title="No content plans yet"
                hint="Upload a spreadsheet where each row is a planned article: a pillar map, a content calendar, a keyword plan. Columns are detected automatically."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className={tableCls.table}>
                  <thead>
                    <tr>
                      <th scope="col" className={tableCls.th}>
                        Plan
                      </th>
                      <th scope="col" className={tableCls.th}>
                        Status
                      </th>
                      <th scope="col" className={cn(tableCls.th, "w-[220px]")}>
                        Produced
                      </th>
                      <th scope="col" className={tableCls.th}>
                        Briefs
                      </th>
                      <th scope="col" className={tableCls.th}>
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const pct = p.itemCount > 0 ? p.produced / p.itemCount : 0;
                      return (
                        <tr key={p.id} className={cn(tableCls.tr, "relative")}>
                          <td className={tableCls.td}>
                            <Link
                              href={`/plans/${p.id}`}
                              className="flex flex-col gap-0.5 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:shadow-[inset_0_0_0_2px_var(--ring)]"
                            >
                              <span className="text-sm font-semibold text-label">{p.filename}</span>
                              <span className="text-xs text-label-2 tabular-nums">
                                {p.itemCount} article{p.itemCount === 1 ? "" : "s"} · imported{" "}
                                {new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </span>
                            </Link>
                          </td>
                          <td className={tableCls.td}>
                            <span className="flex flex-wrap items-center gap-2">
                              <PlanStatusBadge status={p.status} />
                              {p.status === "draft" && p.blocking > 0 && (
                                <span className="text-xs font-medium text-needs-fg">{p.blocking} to resolve</span>
                              )}
                            </span>
                          </td>
                          <td className={tableCls.td}>
                            <span className="flex items-center gap-3">
                              <ProgressBar value={pct} family={pct === 1 ? "done" : "working"} className="w-24" />
                              <span className="text-xs text-label-2 tabular-nums">
                                {p.produced} of {p.itemCount}
                              </span>
                            </span>
                          </td>
                          <td className={cn(tableCls.td, "text-xs text-label-2 tabular-nums")}>
                            {p.byEnrichment.done ?? 0} sharpened
                            {p.byEnrichment.pending ? ` · ${p.byEnrichment.pending} pending` : ""}
                          </td>
                          <td className={cn(tableCls.td, "w-8 text-right")}>
                            <ChevronRight aria-hidden className="inline size-4 text-label-3" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </Page>
  );
}
