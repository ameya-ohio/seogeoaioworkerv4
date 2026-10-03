"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertOctagon, ChevronDown, ChevronUp, ExternalLink, Lock, X } from "lucide-react";
import type { UiPlanItemRow } from "@/lib/ui-types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { inputCls, stageLabel, Status, StatusDot } from "../kit";
import { Callout, FUNNEL_LABEL, HOLD_LABEL, ROLE_SHORT, SettingsGroup, SettingsRow, humanize, itemStatus } from "../plan-ui";

export interface ItemActions {
  pending: boolean;
  setTarget: (id: string, target: string) => void;
  setPath: (id: string, path: string) => void;
  setStatus: (id: string, status: "planned" | "skipped") => void;
  unblock: (id: string) => void;
  produceOnly: (id: string) => void;
}

/** "Page details": everything about one plan row, and the edits it allows. */
export function ItemSheet({
  row,
  index,
  total,
  onClose,
  onStep,
  actions,
}: {
  row: UiPlanItemRow | null;
  index: number;
  total: number;
  onClose: () => void;
  onStep: (delta: -1 | 1) => void;
  actions: ItemActions;
}) {
  return (
    <Sheet open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent showCloseButton={false} className="w-full gap-0 bg-window p-0 sm:max-w-[440px]">
        {row && <Body key={`${row.id}:${row.primaryQueryTarget}:${row.path ?? ""}`} row={row} index={index} total={total} onStep={onStep} actions={actions} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  row: r,
  index,
  total,
  onStep,
  actions,
}: {
  row: UiPlanItemRow;
  index: number;
  total: number;
  onStep: (delta: -1 | 1) => void;
  actions: ItemActions;
}) {
  const [target, setTarget] = useState(r.primaryQueryTarget);
  const [path, setPath] = useState(r.path ?? "");
  const locked = Boolean(r.articleSlug);
  const { pending } = actions;
  const st = itemStatus(r.status);
  const open = r.status === "planned" || r.status === "failed";

  const targetDirty = target.trim().toLowerCase() !== r.primaryQueryTarget;
  const pathDirty = path.trim() !== (r.path ?? "");

  return (
    <>
      <header className="flex items-start gap-2 border-b-[0.5px] border-separator px-5 pt-4 pb-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-mono text-[11px] text-label-2">
            {r.externalId} · #{r.sequence}
          </span>
          <SheetTitle className="text-[19px] leading-6 font-semibold tracking-[-0.01em] text-pretty">{r.title}</SheetTitle>
          <SheetDescription className="text-xs text-label-2">
            {r.pillarName}
            {r.subtopicName ? ` › ${r.subtopicName}` : ""} · {ROLE_SHORT[r.pageRole] ?? r.pageRole}
          </SheetDescription>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={index <= 0} onClick={() => onStep(-1)}>
          <ChevronUp />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={index >= total - 1} onClick={() => onStep(1)}>
          <ChevronDown />
        </Button>
        <SheetClose asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Close details">
            <X />
          </Button>
        </SheetClose>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pt-5 pb-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Status family={st.family}>{st.label}</Status>
            {r.buildQueued && open && <BuildTag next={!r.waiting} />}
            {open && r.waiting && <span className="text-xs text-label-2">{humanize(r.waiting)}.</span>}
          </div>
          {r.held && (
            <Callout icon={Lock} title={`Held: ${(HOLD_LABEL[r.held.kind] ?? r.held.kind).toLowerCase()}`}>
              {r.held.reason}
            </Callout>
          )}
          {r.lastError && (
            <Callout family="problem" icon={AlertOctagon} title={r.failureCount > 1 ? `Failed ${r.failureCount} times` : "Last error"}>
              <span className="break-words">{r.lastError}</span>
            </Callout>
          )}
        </div>

        <SettingsGroup title="Publishing">
          <SettingsRow
            stack
            htmlFor="item-target"
            label={
              <span className="flex items-center justify-between gap-2">
                Keyword target
                {r.needsQueryTarget && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-needs-fg">
                    <StatusDot family="needs" className="size-1.5" />
                    Needs a keyword
                  </span>
                )}
              </span>
            }
            hint={locked ? "Locked: this page is in production." : "A query a person would actually type. Seven words at most."}
          >
            <form
              className="flex w-full items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (targetDirty) actions.setTarget(r.id, target);
              }}
            >
              <input
                id="item-target"
                className={cn(
                  inputCls,
                  "min-w-0 flex-1",
                  r.needsQueryTarget && !targetDirty && "shadow-[inset_0_0_0_1.5px_var(--needs)]",
                )}
                value={target}
                placeholder="e.g. ntlm relay attack"
                disabled={pending || locked}
                onChange={(e) => setTarget(e.target.value)}
              />
              {targetDirty && !locked && (
                <Button type="submit" size="sm" disabled={pending}>
                  Save
                </Button>
              )}
            </form>
          </SettingsRow>
          <SettingsRow
            stack
            htmlFor="item-path"
            label="URL path"
            hint={r.path ? (locked ? "In production: the URL is fixed." : "Reserved for this page. Locked once production starts.") : "No path reserved for this page."}
          >
            {r.path && (
              <form
                className="flex w-full items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pathDirty) actions.setPath(r.id, path);
                }}
              >
                <input
                  id="item-path"
                  className={cn(inputCls, "min-w-0 flex-1 font-mono text-xs")}
                  value={path}
                  disabled={pending || locked}
                  onChange={(e) => setPath(e.target.value)}
                />
                {pathDirty && !locked && (
                  <Button type="submit" size="sm" disabled={pending}>
                    Save
                  </Button>
                )}
              </form>
            )}
          </SettingsRow>
          {r.publishedUrl && (
            <SettingsRow label="Live page">
              <a href={r.publishedUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
                Open
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            </SettingsRow>
          )}
        </SettingsGroup>

        <SettingsGroup title="Page">
          <Fact label="Format" value={r.articleTypeLabel} />
          <Fact label="Search intent" value={humanize(r.searchIntent)} />
          <Fact label="Funnel" value={FUNNEL_LABEL[r.funnel] ?? r.funnel.toUpperCase()} />
          <Fact label="Priority" value={`P${r.priority}`} />
          <Fact label="Slug" value={<span className="font-mono text-xs">{r.slug}</span>} />
        </SettingsGroup>

        <SettingsGroup title="Build">
          <Fact
            label="Build queue"
            value={r.buildQueued ? (open ? (r.waiting ? "Queued, waiting" : "Queued, next") : "Queued") : "Not queued"}
          />
          {r.waiting && open && <Fact label="Waiting on" value={r.waiting.replace(/^waiting on /i, "")} />}
          {r.hasChildren && <Fact label="Pages under it" value="Built first, bottom-up" />}
          {r.articleStage && r.status !== "planned" && <Fact label="Article" value={stageLabel(r.articleStage)} />}
          <Fact label="Brief" value={r.enrichment === "done" ? "Sharpened" : r.enrichment === "pending" ? "Sharpening pending" : "Deterministic"} />
        </SettingsGroup>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t-[0.5px] border-separator bg-bar px-5 py-3.5 backdrop-blur-xl">
        {r.status === "planned" && (
          <Button variant="ghost" disabled={pending} onClick={() => actions.setStatus(r.id, "skipped")}>
            Skip
          </Button>
        )}
        {r.status === "skipped" && (
          <Button variant="secondary" disabled={pending} onClick={() => actions.setStatus(r.id, "planned")}>
            Restore
          </Button>
        )}
        <span className="flex-1" />
        {r.status === "planned" && r.hasChildren && r.waiting && (
          <Button variant="ghost" disabled={pending} title="Produce this without waiting for the pages under it" onClick={() => actions.unblock(r.id)}>
            Unblock
          </Button>
        )}
        {r.status === "planned" && (
          <Button
            variant="secondary"
            disabled={pending}
            title="Queue exactly this page now: no subtopic expansion, no bottom-up order"
            onClick={() => actions.produceOnly(r.id)}
          >
            Produce only this
          </Button>
        )}
        {(r.status === "failed" || r.status === "quarantined") && (
          <Button variant={r.articleSlug ? "secondary" : "default"} disabled={pending} onClick={() => actions.setStatus(r.id, "planned")}>
            Retry
          </Button>
        )}
        {r.articleSlug && (
          <Button asChild>
            <Link href={`/production/review/${r.articleSlug}`}>Open in review</Link>
          </Button>
        )}
      </footer>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <SettingsRow label={<span className="font-normal text-label-2">{label}</span>} className="min-h-10 py-2">
      <span className="text-right text-[13px] text-label">{value}</span>
    </SettingsRow>
  );
}

export function BuildTag({ next }: { next: boolean }) {
  return (
    <span
      title="Queued for build: it starts as soon as the pages under it are produced"
      className="inline-flex h-[18px] items-center rounded-full bg-primary-soft px-[7px] text-[11px] font-semibold whitespace-nowrap text-primary"
    >
      {next ? "In build · next" : "In build"}
    </span>
  );
}

