import { AlertOctagon, ChevronRight } from "lucide-react";
import type { UiPlanReport } from "@/lib/ui-types";
import { cn } from "@/lib/utils";
import { Caption, tableCls } from "./kit";
import { Callout, humanize } from "./plan-ui";

/** Distribution + every problem the import found, server-rendered. */

function Distribution({ title, counts, upper }: { title: string; counts: Record<string, number>; upper?: boolean }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 border-b-[0.5px] border-separator px-4 py-2.5 last:border-0">
      <span className="w-20 shrink-0 text-xs font-medium text-label-2">{title}</span>
      <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {entries.map(([k, n]) => (
          <span key={k} className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-fill-2 px-2.5 text-xs text-label">
            {upper ? k.toUpperCase() : humanize(k)}
            <span className="font-semibold tabular-nums text-label-2">{n}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

function Problems({
  title,
  hint,
  rows,
  tone = "neutral",
}: {
  title: string;
  hint: string;
  rows: { key: string; text: string }[];
  tone?: "neutral" | "needs";
}) {
  if (rows.length === 0) return null;
  return (
    <details className="group border-b-[0.5px] border-separator last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[13px] font-medium text-label transition-colors hover:bg-fill-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-3.5 shrink-0 text-label-3 transition-transform group-open:rotate-90" />
        <span className="flex-1">{title}</span>
        <span className={cn("text-xs font-semibold tabular-nums", tone === "needs" ? "text-needs-fg" : "text-label-2")}>{rows.length}</span>
      </summary>
      <div className="px-4 pb-3 pl-[38px]">
        <p className="mb-2 text-xs leading-4 text-label-2 text-pretty">{hint}</p>
        <ul className="flex flex-col gap-1 text-xs text-label">
          {rows.slice(0, 50).map((r) => (
            <li key={r.key} className="font-mono break-words">
              {r.text}
            </li>
          ))}
          {rows.length > 50 && <li className="text-label-2">…and {rows.length - 50} more</li>}
        </ul>
      </div>
    </details>
  );
}

export function PlanReport({ report }: { report: UiPlanReport }) {
  const problems = [
    report.skippedRows.length,
    report.articleCollisions.length,
    report.duplicateSlugs.length,
    report.needsQueryTarget.length,
    report.keywordCollisions.length,
    report.missingHubs.length,
    report.mergedHubs.length,
    report.pathCollisions.length,
    report.facetWarnings.length,
  ].some(Boolean);

  return (
    <div className="flex flex-col gap-7">
      <p className="text-[15px] leading-[22px] text-label text-pretty">
        Reading <span className="font-semibold">{report.sheet}</span>:{" "}
        <span className="font-semibold tabular-nums">{report.mappedRows}</span> of{" "}
        <span className="tabular-nums">{report.totalRows}</span> rows mapped.
      </p>

      {report.blocking.length > 0 && (
        <Callout family="problem" icon={AlertOctagon} title="Resolve before importing">
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
            {report.blocking.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Callout>
      )}

      <section className="flex flex-col gap-1.5">
        <Caption className="px-4">Distribution</Caption>
        <div className="overflow-hidden rounded-xl bg-surface shadow-card">
          <Distribution title="Role" counts={report.byPageRole} />
          <Distribution title="Priority" counts={report.byPriority} />
          <Distribution title="Funnel" counts={report.byFunnel} upper />
          <Distribution title="Intent" counts={report.byIntent} />
          <Distribution title="Type" counts={report.byFormat} />
        </div>
      </section>

      {problems && (
        <section className="flex flex-col gap-1.5">
          <Caption className="px-4">Worth a look</Caption>
          <div className="overflow-hidden rounded-xl bg-surface shadow-card">
            <Problems
              title="Rows skipped"
              hint="These rows will not become articles."
              rows={report.skippedRows.map((s) => ({ key: `${s.row}`, text: `row ${s.row + 2}: ${s.reason}` }))}
            />
            <Problems
              tone="needs"
              title="Collides with an existing article"
              hint="Rename the row's slug, skip it, or leave it out. The existing article is never overwritten."
              rows={report.articleCollisions.map((c) => ({
                key: c.externalId,
                text: `${c.externalId}: ${c.slug} (existing article is ${c.stage})`,
              }))}
            />
            <Problems
              tone="needs"
              title="Duplicate slugs inside this file"
              hint="Two rows want the same URL. Rename one."
              rows={report.duplicateSlugs.map((d) => ({ key: d.slug, text: `${d.slug}: ${d.externalIds.join(", ")}` }))}
            />
            <Problems
              tone="needs"
              title="Needs a human keyword target"
              hint="The title could not be reduced to something a person would actually type. Set these on the Articles tab before producing them."
              rows={report.needsQueryTarget.map((id) => ({ key: id, text: id }))}
            />
            <Problems
              title="Already in the keyword library"
              hint="Not a problem. These overlap with existing ideas."
              rows={report.keywordCollisions.map((k) => ({
                key: k.externalId,
                text: `${k.externalId}: "${k.text}" (${k.status})`,
              }))}
            />
            <Problems
              title="Subtopics with no hub row"
              hint="Their articles will link up to the pillar page instead."
              rows={report.missingHubs.map((h) => ({ key: h, text: h }))}
            />
            <Problems
              title="Hubs merged into their pillar"
              hint="The subtopic is the pillar's own topic, so the pillar page answers it and its articles sit under /learn/<pillar>/ (D46)."
              rows={report.mergedHubs.map((m) => ({ key: m.externalId, text: `${m.externalId}: ${m.title}` }))}
            />
            <Problems
              title="Paths suffixed to stay unique"
              hint="Two rows wanted the same /learn/ URL; edit either path on the Articles tab after importing."
              rows={report.pathCollisions.map((c) => ({ key: c.externalId, text: `${c.externalId}: ${c.wanted} became ${c.got}` }))}
            />
            <Problems
              title="Unusual facet combinations"
              hint="The build spec calls these mis-tagged. Not blocking; check the sheet."
              rows={report.facetWarnings.map((w, i) => ({ key: `${w.externalId}-${i}`, text: `${w.externalId}: ${w.warning}` }))}
            />
          </div>
        </section>
      )}

      {report.unrecognized.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Caption className="px-4">Unrecognized values</Caption>
          <div className="overflow-x-auto rounded-xl bg-surface shadow-card">
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th scope="col" className={tableCls.th}>
                    Value
                  </th>
                  <th scope="col" className={tableCls.th}>
                    Field
                  </th>
                  <th scope="col" className={cn(tableCls.th, "text-right")}>
                    Rows
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.unrecognized.map((u) => (
                  <tr key={`${u.field}-${u.value}`} className={tableCls.tr}>
                    <td className={cn(tableCls.td, "font-mono text-xs")}>{u.value}</td>
                    <td className={cn(tableCls.td, "text-label-2")}>{u.field}</td>
                    <td className={cn(tableCls.td, "text-right text-label-2 tabular-nums")}>{u.rows.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
