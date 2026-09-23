"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import {
  acceptBrief,
  setBriefDismissed,
  startClusterRun,
  type BriefActionState,
  type ClusterFormState,
} from "@/lib/actions/clusters";
import { Card, buttonCls, cls, inputCls } from "./ui";

/** Research tab (4D): launch a Topic & Cluster Generator run. */
export function ClusterRunForm() {
  const [state, formAction, pending] = useActionState<ClusterFormState, FormData>(
    startClusterRun,
    {},
  );
  return (
    <Card title="Topic & Cluster Generator">
      <form action={formAction} className="space-y-3">
        <p className="text-xs leading-relaxed text-slate-500">
          Theme-driven research (D30): seed → realistic prompts → fan-out at K varied runs →
          persistent themes → hub-and-spoke architecture → prioritized spoke briefs. Sub-queries
          are diagnostic; themes are the planning unit.
        </p>
        <input
          name="seed"
          placeholder='Seed — a topic, phrase, or keyword, e.g. "preemptive identity security"'
          className={cls(inputCls, "w-full")}
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="cluster-k">
            Fan-out runs per prompt (K)
          </label>
          <input
            id="cluster-k"
            name="k"
            type="number"
            min={2}
            max={10}
            defaultValue={5}
            className={cls(inputCls, "w-20")}
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Runs on the worker&apos;s cluster queue — you land on the run page to follow along.
          </p>
          <button type="submit" disabled={pending} className={buttonCls("primary")}>
            {pending ? "Queuing…" : "Run the agent"}
          </button>
        </div>
      </form>
    </Card>
  );
}

/** Accept / accept-and-queue / dismiss controls on a spoke-brief card. */
export function BriefActions({
  clusterId,
  themeName,
  dismissed,
}: {
  clusterId: string;
  themeName: string;
  dismissed: boolean;
}) {
  const [result, setResult] = useState<BriefActionState>({});
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<BriefActionState>) =>
    startTransition(async () => setResult(await fn()));

  if (dismissed) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setBriefDismissed(clusterId, themeName, false))}
          className={buttonCls("secondary")}
        >
          Restore
        </button>
        {result.error && <p className="text-xs text-red-600">{result.error}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => acceptBrief(clusterId, themeName, false))}
        className={buttonCls("secondary")}
      >
        Accept → library
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => acceptBrief(clusterId, themeName, true))}
        className={buttonCls("primary")}
      >
        Accept &amp; queue article
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setBriefDismissed(clusterId, themeName, true))}
        className={buttonCls("ghost")}
      >
        Dismiss
      </button>
      {result.message && <p className="text-xs text-emerald-700">{result.message}</p>}
      {result.error && <p className="text-xs text-red-600">{result.error}</p>}
    </div>
  );
}
