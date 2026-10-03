"use client";

import type { UiBuildSummary } from "@/lib/actions/plans";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** What a build would queue, confirmed before anything is queued. */
export function BuildConfirm({
  summary,
  pending,
  onCancel,
  onConfirm,
}: {
  summary: UiBuildSummary | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={summary !== null} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="sm:max-w-lg">{summary && <Body summary={summary} pending={pending} onConfirm={onConfirm} />}</AlertDialogContent>
    </AlertDialog>
  );
}

function Body({ summary, pending, onConfirm }: { summary: UiBuildSummary; pending: boolean; onConfirm: () => void }) {
  const { byRole } = summary;
  const parts = [
    byRole.cluster && `${byRole.cluster} cluster article${byRole.cluster === 1 ? "" : "s"}`,
    byRole.hub && `${byRole.hub} hub${byRole.hub === 1 ? "" : "s"}`,
    byRole.pillar && `${byRole.pillar} pillar page${byRole.pillar === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];
  const others = [
    summary.alreadyProduced && `${summary.alreadyProduced} already produced`,
    summary.inProgress && `${summary.inProgress} in production`,
    summary.alreadyQueued && `${summary.alreadyQueued} already queued`,
    summary.held && `${summary.held} held (hand send, fact sheet or not produced here)`,
  ].filter(Boolean);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts.join("");

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle className="text-xl leading-[26px] font-semibold tracking-[-0.01em]">
          {summary.toQueue ? `Build ${list}?` : "Nothing new to build"}
        </AlertDialogTitle>
        <AlertDialogDescription>Building a page builds its whole subtopic, articles first.</AlertDialogDescription>
      </AlertDialogHeader>

      {(summary.subtopics.length > 0 || summary.pillarPages.length > 0) && (
        <ul className="max-h-64 overflow-y-auto">
          {summary.subtopics.slice(0, 8).map((s) => (
            <li
              key={`${s.pillarName}/${s.subtopicName}`}
              className="flex items-baseline gap-3 border-b-[0.5px] border-separator py-2 text-[13px] leading-[18px]"
            >
              <span className="min-w-0 flex-1">
                <span className="text-label-2">{s.pillarName} › </span>
                {s.subtopicName ?? "(pillar-level articles)"}
              </span>
              <span className="shrink-0 text-label-2 tabular-nums">
                {s.clusters} article{s.clusters === 1 ? "" : "s"}
                {s.hub ? ", then the hub" : ""}
              </span>
            </li>
          ))}
          {summary.subtopics.length > 8 && (
            <li className="border-b-[0.5px] border-separator py-2 text-[13px] text-label-2">
              …and {summary.subtopics.length - 8} more subtopics
            </li>
          )}
          {summary.pillarPages.map((t) => (
            <li key={t} className="border-b-[0.5px] border-separator py-2 text-[13px] leading-[18px]">
              Then <span className="font-semibold">{t}</span>, once every hub in its pillar is built.
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && <p className="text-xs text-label-2">Also in scope: {others.join(" · ")}.</p>}
      {summary.toQueue > 0 && (
        <p className="text-[13px] leading-[18px] text-label-2 text-pretty">
          About <span className="font-semibold text-label">${summary.estimatedCostUsd.toFixed(0)}</span> at $
          {summary.costPerArticle.toFixed(2)} an article
          {summary.costFromPlan ? " (this plan’s average so far)" : " (from the acceptance run)"}. Runs up to the plan’s in-flight
          limit at a time, and stops at review: the subtopic goes live together once every page in it is approved.
        </p>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{summary.toQueue > 0 ? "Cancel" : "Close"}</AlertDialogCancel>
        {summary.toQueue > 0 && (
          <AlertDialogAction disabled={pending} onClick={onConfirm}>
            Queue build
          </AlertDialogAction>
        )}
      </AlertDialogFooter>
    </>
  );
}
