"use client";

import { useState, useTransition } from "react";
import { setPlanInterview } from "@/lib/actions/interview";
import { cls } from "./ui";

/**
 * D59: whether this plan's articles stop for the expert interview after the
 * outline. Unattended cadences usually skip it; applies to articles queued
 * from now on.
 */
export function PlanInterviewToggle({ planId, mode }: { planId: string; mode: "pause" | "skip" }) {
  const [current, setCurrent] = useState(mode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const choose = (next: "pause" | "skip") =>
    startTransition(async () => {
      const res = await setPlanInterview(planId, next);
      if (res.error) setError(res.error);
      else setCurrent(next);
    });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
      <span>Expert interview for this plan's articles:</span>
      {(["pause", "skip"] as const).map((m) => (
        <button
          key={m}
          disabled={pending}
          onClick={() => choose(m)}
          className={cls(
            "rounded-full border px-3 py-0.5 text-xs font-medium",
            current === m ? "border-accent bg-accent-soft text-accent" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
          )}
        >
          {m === "pause" ? "Stop for it" : "Skip it"}
        </button>
      ))}
      <span className="text-xs text-slate-400">Applies to articles queued from now on.</span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
