import Link from "next/link";
import { listPlans, planCounts } from "@blogagent/engine";
import { getCompany, getDb } from "@/lib/db";
import { toUiPlanSummary } from "@/lib/ui-types";
import { Card, EmptyState, PageHeader, cls, tableCls } from "@/components/ui";
import { PlanStatusBadge } from "@/components/plan-ui";
import { PlanUploadForm } from "@/components/plan-upload";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const db = await getDb();
  const companyId = getCompany().companyId;
  const docs = await listPlans(db, companyId);
  const rows = await Promise.all(
    docs.map(async (d) => toUiPlanSummary(d, await planCounts(db, d._id!))),
  );

  return (
    <>
      <PageHeader
        title="Content Plans"
        subtitle="Import an SEO plan and produce it in dependency-correct order, on a cadence you set"
      />

      <div className="space-y-5">
        <PlanUploadForm />

        <Card title="Plans">
          {rows.length === 0 ? (
            <EmptyState
              title="No content plans yet."
              hint="Upload a spreadsheet where each row is a planned article — a pillar map, a content calendar, a keyword plan. Columns are detected automatically."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={tableCls.th}>File</th>
                    <th className={tableCls.th}>Status</th>
                    <th className={tableCls.th}>Articles</th>
                    <th className={tableCls.th}>Produced</th>
                    <th className={tableCls.th}>Briefs</th>
                    <th className={tableCls.th}>Imported</th>
                    <th className={tableCls.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className={tableCls.tr}>
                      <td className={cls(tableCls.td, "font-medium text-slate-800")}>
                        {p.filename}
                      </td>
                      <td className={tableCls.td}>
                        <PlanStatusBadge status={p.status} />
                        {p.status === "draft" && p.blocking > 0 && (
                          <span className="ml-1.5 text-xs text-amber-600">
                            {p.blocking} to resolve
                          </span>
                        )}
                      </td>
                      <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>
                        {p.itemCount}
                      </td>
                      <td className={cls(tableCls.td, "tabular-nums text-slate-600")}>
                        {p.produced}
                      </td>
                      <td className={cls(tableCls.td, "text-xs text-slate-500")}>
                        {p.byEnrichment.done ?? 0} sharpened
                        {p.byEnrichment.pending ? ` · ${p.byEnrichment.pending} pending` : ""}
                      </td>
                      <td className={cls(tableCls.td, "text-slate-500")}>
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className={tableCls.td}>
                        <Link href={`/plans/${p.id}`} className="text-accent hover:underline">
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
    </>
  );
}
