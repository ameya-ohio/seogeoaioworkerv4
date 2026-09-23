import { SCRAPE_STAGES } from "@blogagent/engine";
import { cls } from "./ui";

/** Presentational pieces for the competitive module (6.2) — server-safe. */

const STAGE_LABELS: Record<string, string> = {
  scrape: "Crawl blog",
  index: "Topic index",
  store: "Store corpus",
};

/** Three-stage progress strip, the ClusterStageProgress sibling. */
export function ScrapeStageProgress({
  stage,
  completed,
  status,
}: {
  stage: string;
  completed: string[];
  status: string;
}) {
  return (
    <ol className="flex flex-wrap gap-1.5">
      {SCRAPE_STAGES.map((s) => {
        const done = completed.includes(s) || stage === "done";
        const current = !done && stage === s;
        return (
          <li
            key={s}
            className={cls(
              "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
              done && "border-emerald-200 bg-emerald-50 text-emerald-700",
              current && status === "running" && "border-sky-300 bg-sky-50 text-sky-700",
              current && status !== "running" && "border-amber-300 bg-amber-50 text-amber-700",
              !done && !current && "border-slate-200 bg-white text-slate-400",
            )}
          >
            {done ? "✓" : current ? (status === "running" ? "●" : "…") : "○"} {STAGE_LABELS[s]}
          </li>
        );
      })}
    </ol>
  );
}
