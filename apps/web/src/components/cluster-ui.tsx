import { CLUSTER_STAGES } from "@blogagent/engine";
import { cls } from "./ui";

/** Presentational pieces for the cluster review UI (4D) — server-safe. */

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-600",
  running: "bg-sky-100 text-sky-700",
  succeeded: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
  canceled: "bg-zinc-100 text-zinc-600",
};

export function ClusterStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cls(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600",
      )}
    >
      {status}
    </span>
  );
}

const TIER_STYLE: Record<string, string> = {
  core: "bg-indigo-100 text-indigo-700",
  secondary: "bg-cyan-100 text-cyan-700",
  noise: "bg-zinc-100 text-zinc-500",
};

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={cls(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        TIER_STYLE[tier] ?? "bg-slate-100 text-slate-600",
      )}
    >
      {tier}
    </span>
  );
}

const GAP_STYLE: Record<string, string> = {
  owned: "text-emerald-700",
  buried: "text-amber-700",
  missing: "text-red-600",
};

export function GapLabel({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return <span className={cls("text-xs font-medium", GAP_STYLE[status])}>{status}</span>;
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

/** Nine-stage progress strip: done / current / pending. */
export function ClusterStageProgress({
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
      {CLUSTER_STAGES.map((s) => {
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
