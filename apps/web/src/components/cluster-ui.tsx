import { CLUSTER_STAGES } from "@blogagent/engine";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Status, StatusPill, type StatusFamily } from "./kit";

/** Presentational pieces for the cluster review UI (4D) — server-safe. */

const STATUS_FAMILY: Record<string, StatusFamily> = {
  queued: "idle",
  running: "working",
  succeeded: "done",
  failed: "problem",
  canceled: "idle",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  canceled: "Canceled",
};

export function ClusterStatusBadge({ status }: { status: string }) {
  return <Status family={STATUS_FAMILY[status] ?? "idle"}>{STATUS_LABEL[status] ?? status}</Status>;
}

const TIER_FAMILY: Record<string, StatusFamily> = {
  core: "working",
  secondary: "idle",
  noise: "idle",
};

export function TierBadge({ tier }: { tier: string }) {
  return (
    <StatusPill family={TIER_FAMILY[tier] ?? "idle"} className={cn("capitalize", tier === "noise" && "text-label-3")}>
      {tier}
    </StatusPill>
  );
}

const GAP_FAMILY: Record<string, StatusFamily> = {
  owned: "done",
  buried: "needs",
  missing: "problem",
};

export function GapLabel({ status }: { status: string | null }) {
  if (!status) return <span className="text-label-3">—</span>;
  return (
    <Status family={GAP_FAMILY[status] ?? "idle"} className="text-xs capitalize">
      {status}
    </Status>
  );
}

const STAGE_LABELS: Record<string, string> = {
  expansion: "Expansion",
  fanout: "Fan-out",
  clustering: "Clustering",
  questions: "Questions",
  validation: "Validation",
  gap_map: "Gap map",
  prioritization: "Prioritization",
  architecture: "Architecture",
  briefs: "Briefs",
};

export function clusterStageLabel(stage: string): string {
  if (stage === "done") return "Done";
  return STAGE_LABELS[stage] ?? stage;
}

/** Nine-stage horizontal stepper: done / current (pulses while running) / pending. */
export function ClusterStageProgress({
  stage,
  completed,
  status,
}: {
  stage: string;
  completed: string[];
  status: string;
}) {
  const doneCount = CLUSTER_STAGES.filter((s) => completed.includes(s) || stage === "done").length;
  return (
    <ol
      aria-label={`${doneCount} of ${CLUSTER_STAGES.length} stages done`}
      className="grid grid-cols-[repeat(auto-fit,minmax(84px,1fr))] gap-y-4"
    >
      {CLUSTER_STAGES.map((s, i) => {
        const done = completed.includes(s) || stage === "done";
        const current = !done && stage === s;
        const failed = current && status === "failed";
        const running = current && status === "running";
        const waiting = current && !failed && !running;
        const isDone = (k: number) => {
          const st = CLUSTER_STAGES[k];
          return st !== undefined && (completed.includes(st) || stage === "done");
        };
        const reached = done || current;
        return (
          <li key={s} aria-current={current ? "step" : undefined} className="relative flex flex-col items-center gap-2 text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn("absolute top-[9px] right-1/2 left-0 h-[1.5px] -translate-y-1/2", isDone(i - 1) && reached ? "bg-phase-done" : "bg-separator-strong")}
              />
            )}
            {i < CLUSTER_STAGES.length - 1 && (
              <span
                aria-hidden
                className={cn("absolute top-[9px] right-0 left-1/2 h-[1.5px] -translate-y-1/2", done && (isDone(i + 1) || stage === CLUSTER_STAGES[i + 1]) ? "bg-phase-done" : "bg-separator-strong")}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-[1] inline-flex size-[18px] items-center justify-center rounded-full",
                done && "bg-phase-done text-surface",
                running && "bg-primary pulse-dot",
                waiting && "bg-needs shadow-[0_0_0_3px_var(--needs-bg)]",
                failed && "bg-problem text-primary-foreground shadow-[0_0_0_3px_var(--problem-bg)]",
                !done && !current && "bg-surface shadow-[inset_0_0_0_1.5px_var(--separator-strong)]",
              )}
            >
              {done && <Check className="size-3 stroke-[3]" />}
              {failed && <X className="size-3 stroke-[3]" />}
              {running && <span className="size-1.5 rounded-full bg-primary-foreground" />}
            </span>
            <span
              className={cn(
                "px-1 text-xs leading-4",
                current ? "font-semibold text-label" : done ? "font-medium text-label-2" : "text-label-3",
                failed && "text-problem-fg",
              )}
            >
              {STAGE_LABELS[s] ?? s}
              <span className="sr-only">{done ? " (done)" : current ? ` (${status})` : " (pending)"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
