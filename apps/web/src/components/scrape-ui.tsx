import { SCRAPE_STAGES } from "@blogagent/engine";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusFamily } from "./kit";

/** Presentational pieces for the competitive module (6.2), server-safe. */

const STAGE_LABELS: Record<string, string> = {
  scrape: "Scrape",
  index: "Index",
  store: "Store",
};

const STAGE_ACTIVE: Record<string, string> = {
  scrape: "Crawling",
  index: "Indexing",
  store: "Storing",
};

type StepState = "done" | "current" | "waiting" | "failed" | "pending";

function stepStates(stage: string, completed: string[], status: string): StepState[] {
  return SCRAPE_STAGES.map((s) => {
    if (completed.includes(s) || stage === "done") return "done";
    if (stage !== s) return "pending";
    if (status === "failed") return "failed";
    if (status === "running") return "current";
    if (status === "queued") return "waiting";
    return "pending";
  });
}

/** Scrape → Index → Store mini stepper. */
export function ScrapeStageProgress({ stage, completed, status }: { stage: string; completed: string[]; status: string }) {
  const states = stepStates(stage, completed, status);
  const done = states.filter((s) => s === "done").length;
  return (
    <span role="img" aria-label={`${done} of ${SCRAPE_STAGES.length} steps done`} className="inline-flex shrink-0 items-center gap-1.5">
      {SCRAPE_STAGES.map((s, i) => {
        const st = states[i]!;
        return (
          <span key={s} className="inline-flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className={cn("h-[1.5px] w-3.5", states[i - 1] === "done" ? "bg-phase-done" : "bg-separator-strong")} />}
            <span className={cn("inline-flex items-center gap-1.5 text-xs", st === "pending" ? "text-label-2" : "text-label")}>
              {st === "done" ? (
                <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-done text-surface">
                  <Check className="size-[11px] stroke-[2.6]" />
                </span>
              ) : st === "failed" ? (
                <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-problem text-surface">
                  <X className="size-[11px] stroke-[2.6]" />
                </span>
              ) : (
                <span
                  className={cn(
                    "m-1 inline-block size-2.5 rounded-full",
                    st === "current" && "pulse-dot bg-primary",
                    st === "waiting" && "bg-idle",
                    st === "pending" && "shadow-[inset_0_0_0_1.5px_var(--separator-strong)]",
                  )}
                />
              )}
              {STAGE_LABELS[s]}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** A scrape's status as a family + label ("Indexed", "Crawling", "Failed at Index"). */
export function scrapeStatus(s: { status: string; stage: string; imported: boolean }): { family: StatusFamily; label: string } {
  switch (s.status) {
    case "queued":
      return { family: "idle", label: "Queued" };
    case "running":
      return { family: "working", label: STAGE_ACTIVE[s.stage] ?? "Running" };
    case "succeeded":
      return { family: "done", label: s.imported ? "Imported" : "Indexed" };
    case "failed":
      return { family: "problem", label: STAGE_LABELS[s.stage] ? `Failed at ${STAGE_LABELS[s.stage]}` : "Failed" };
    case "canceled":
      return { family: "idle", label: "Canceled" };
    default:
      return { family: "idle", label: s.status };
  }
}
