"use client";

import { useTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { BookmarkPlus, Compass, RotateCcw, Send } from "lucide-react";
import {
  acceptBrief,
  setBriefDismissed,
  startClusterRun,
  type BriefActionState,
  type ClusterFormState,
} from "@/lib/actions/clusters";
import { Button } from "@/components/ui/button";
import { Card, cls, inputCls } from "./kit";

/** Research tab (4D): launch a Topic & Cluster Generator run. */
export function ClusterRunForm() {
  const [state, formAction, pending] = useActionState<ClusterFormState, FormData>(startClusterRun, {});
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Compass aria-hidden className="size-4 text-label-2" />
          Topic and cluster generator
        </span>
      }
    >
      <form action={formAction} className="flex flex-col gap-4">
        <p className="text-[13px] leading-[19px] text-label-2">
          Give it a seed. It writes realistic prompts, fans each out several times, finds the themes that hold up, and proposes a
          hub-and-spoke plan with a brief for every spoke.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cluster-seed" className="text-xs font-semibold text-label-2">
            Seed
          </label>
          <input
            id="cluster-seed"
            name="seed"
            placeholder='A topic, phrase or keyword, e.g. "preemptive identity security"'
            className={cls(inputCls, "h-9 w-full text-sm")}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-[13px] text-label-2" htmlFor="cluster-k">
            Fan-out runs per prompt (K)
          </label>
          <input id="cluster-k" name="k" type="number" min={2} max={10} defaultValue={5} className={cls(inputCls, "w-20 tabular-nums")} />
        </div>
        {state.error && (
          <p role="alert" className="rounded-lg bg-problem-bg px-3 py-2 text-[13px] text-problem-fg">
            {state.error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-[0.5px] border-separator pt-4">
          <p className="text-xs text-label-2">Runs on the worker&apos;s cluster queue. You land on the run page to follow along.</p>
          <Button type="submit" disabled={pending}>
            {pending ? "Starting…" : "Run research"}
          </Button>
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
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<BriefActionState>, fallback: string) =>
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.error) toast.error(res.error);
        else toast.success(res.message ?? fallback);
      } catch {
        toast.error("That didn't work. Try again.");
      }
    });

  if (dismissed) {
    return (
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => setBriefDismissed(clusterId, themeName, false), "Brief restored")}
      >
        <RotateCcw data-icon="inline-start" />
        Restore
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" disabled={pending} onClick={() => run(() => acceptBrief(clusterId, themeName, true), "Article queued")}>
        <Send data-icon="inline-start" />
        Accept and queue article
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => acceptBrief(clusterId, themeName, false), "Added to the keyword library")}
      >
        <BookmarkPlus data-icon="inline-start" />
        Accept to library
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => setBriefDismissed(clusterId, themeName, true), "Brief dismissed")}
      >
        Dismiss
      </Button>
    </div>
  );
}
