"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronRight, Download, ExternalLink, Globe, Package, RefreshCw } from "lucide-react";
import { markReleaseLive } from "@/lib/actions/publishing";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import { EmptyState, ProgressBar, SectionHeader, Status, StatusPill } from "./kit";
import { Callout, RELEASE_STATE, ROLE_SHORT, humanize } from "./plan-ui";

/**
 * The Releases tab: each subtopic ships as one unit (its hub plus every
 * cluster article), then each pillar page after its subtopics. A release is
 * downloadable once every page in it is approved.
 */

export interface UiReleaseMember {
  externalId: string;
  title: string;
  role: string;
  slug: string;
  path: string | null;
  stage: string | null;
  live: boolean;
  liveUrl: string | null;
  exportedAt: string | null;
  blocking: string | null;
  hasArticle: boolean;
}

export interface UiRelease {
  key: string;
  kind: "subtopic" | "pillar";
  pillarId: string;
  pillarName: string;
  subtopicName: string | null;
  title: string;
  state: string;
  members: UiReleaseMember[];
  excluded: { externalId: string; title: string; reason: string }[];
  counts: { total: number; produced: number; approved: number; live: number };
}

const STATE_ORDER = ["ready", "partly_live", "in_review", "building", "live", "planned"];
const ALL = "__all";

export function PlanReleases({
  planId,
  releases,
  reexport,
}: {
  planId: string;
  releases: UiRelease[];
  reexport: { slug: string; title: string; links: number }[];
}) {
  const [state, setState] = useState<string | null>(null);
  const [pillar, setPillar] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of releases) if (!pillar || r.pillarId === pillar) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [releases, pillar]);

  const pillars = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of releases) if (!seen.has(r.pillarId)) seen.set(r.pillarId, r.pillarName);
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [releases]);

  const shown = releases.filter((r) => (!state || r.state === state) && (!pillar || r.pillarId === pillar));
  const byPillar = new Map<string, UiRelease[]>();
  for (const r of shown) {
    const list = byPillar.get(r.pillarId) ?? [];
    list.push(r);
    byPillar.set(r.pillarId, list);
  }
  const pillarOrder = [...byPillar.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const inPillar = pillar ? releases.filter((r) => r.pillarId === pillar).length : releases.length;

  const markLive = (key: string) => {
    setBusyKey(key);
    startTransition(async () => {
      const res = await markReleaseLive(planId, key);
      setBusyKey(null);
      if (res.error) toast.error(res.error, { duration: 12000 });
      else if (res.message) toast.success(res.message, { duration: 10000 });
    });
  };

  const confirming = releases.find((r) => r.key === confirmKey) ?? null;

  const segments = [
    { key: null as string | null, label: "All", count: inPillar },
    ...STATE_ORDER.filter((s) => counts[s]).map((s) => ({ key: s as string | null, label: RELEASE_STATE[s]?.label ?? humanize(s), count: counts[s] ?? 0 })),
  ];

  return (
    <div className="flex flex-col gap-8">
      {reexport.length > 0 && (
        <Callout
          icon={RefreshCw}
          title={`${reexport.length} live page${reexport.length === 1 ? " now has" : "s now have"} links to switch on`}
        >
          <p className="text-label-2">
            Pages they link to have gone live since they were exported. Re-download each one and re-paste its body in Framer.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {reexport.map((r) => (
              <li key={r.slug} className="inline-flex items-center gap-1.5">
                <a href={`/api/export/${r.slug}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  <Download aria-hidden className="size-3.5" />
                  {r.title}
                </a>
                <span className="text-xs text-label-2">
                  {r.links} link{r.links === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter releases by state" className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[9px] bg-fill p-0.5">
          {segments.map((s) => {
            const on = state === s.key;
            return (
              <button
                key={s.key ?? "all"}
                type="button"
                aria-pressed={on}
                onClick={() => setState(s.key === state ? null : s.key)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-3 text-[13px] whitespace-nowrap transition-colors",
                  on
                    ? "bg-raised font-semibold text-label shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]"
                    : "font-medium text-label-2 hover:text-label",
                )}
              >
                {s.label}
                <span className="font-medium text-label-2 tabular-nums">{s.count}</span>
              </button>
            );
          })}
        </div>
        {pillars.length > 1 && (
          <Select value={pillar ?? ALL} onValueChange={(v) => setPillar(v === ALL ? null : v)}>
            <SelectTrigger aria-label="Pillar" className="w-[260px] max-w-full border-0 bg-fill-2 text-[13px] shadow-[inset_0_0_0_0.5px_var(--separator-strong)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All pillars</SelectItem>
              {pillars.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  <span className="font-mono text-xs text-label-2">{id}</span> {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {pillarOrder.length === 0 && (
        <div className="rounded-xl bg-surface shadow-card">
          <EmptyState
            icon={Package}
            title={releases.length === 0 ? "No releases yet" : "No releases match"}
            hint={
              releases.length === 0
                ? "Each subtopic becomes a release: its hub plus every article under it."
                : "Try another state or pillar."
            }
          />
        </div>
      )}

      {pillarOrder.map((pid) => {
        const units = byPillar.get(pid) ?? [];
        return (
          <section key={pid}>
            <SectionHeader
              title={
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-xs font-medium text-label-3">{pid}</span>
                  {units[0]?.pillarName}
                </span>
              }
              count={units.length}
            />
            <div className="flex flex-col gap-4">
              {units.map((u) => (
                <ReleaseCard
                  key={u.key}
                  planId={planId}
                  unit={u}
                  busy={pending && busyKey === u.key}
                  disabled={pending}
                  onMarkLive={() => setConfirmKey(u.key)}
                />
              ))}
            </div>
          </section>
        );
      })}

      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirmKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this release live?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming ? `“${confirming.subtopicName ?? confirming.title}”: ` : ""}
              each page&apos;s URL is checked, and the ones that answer are marked live together. Publish every page in Framer
              first. A page that isn&apos;t up yet is named, and you can press this again once it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmKey) markLive(confirmKey);
                setConfirmKey(null);
              }}
            >
              Check URLs and mark live
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function releaseSubtitle(unit: UiRelease): string {
  if (unit.kind === "pillar") return `Pillar page for ${unit.pillarName}, after its subtopics`;
  const hubs = unit.members.filter((m) => m.role === "hub").length;
  const articles = unit.members.filter((m) => m.role === "cluster").length;
  const parts = [hubs ? `Hub page` : "", articles ? `${articles} article${articles === 1 ? "" : "s"}` : ""].filter(Boolean);
  const hubPath = unit.members.find((m) => m.role === "hub")?.path;
  return `${parts.join(" and ") || `${unit.members.length} pages`}${hubPath ? ` under ${hubPath}` : ""}`;
}

function ReleaseCard({
  planId,
  unit,
  busy,
  disabled,
  onMarkLive,
}: {
  planId: string;
  unit: UiRelease;
  busy: boolean;
  disabled: boolean;
  onMarkLive: () => void;
}) {
  const [open, setOpen] = useState(unit.state === "ready" || unit.state === "partly_live");
  const releasable = unit.state === "ready" || unit.state === "partly_live";
  const exported = unit.members.some((m) => !m.live && m.exportedAt);
  const { counts } = unit;
  const allApproved = counts.total > 0 && counts.approved === counts.total;
  const st = RELEASE_STATE[unit.state] ?? { family: "idle" as const, label: humanize(unit.state) };

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <article className="rounded-[14px] bg-surface shadow-card">
        <div className="flex flex-col gap-3.5 px-5 py-4 sm:px-[22px] sm:py-5">
          <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
            <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-[17px] leading-[22px] font-semibold tracking-[-0.01em] text-pretty">
                  {unit.kind === "pillar" ? unit.title : (unit.subtopicName ?? unit.title)}
                </h3>
                <StatusPill family={st.family}>{st.label}</StatusPill>
              </div>
              <p className="text-[13px] text-label-2">{releaseSubtitle(unit)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {releasable ? (
                <>
                  <Button variant={exported ? "secondary" : "default"} asChild>
                    <a href={`/api/export/release?plan=${planId}&unit=${encodeURIComponent(unit.key)}`}>
                      <Download data-icon="inline-start" />
                      {exported ? "Download again" : "Download release"}
                    </a>
                  </Button>
                  <Button
                    variant={exported ? "default" : "secondary"}
                    disabled={disabled}
                    onClick={onMarkLive}
                    title="After publishing every page in Framer: checks each URL and marks them live together"
                  >
                    <Globe data-icon="inline-start" />
                    {busy ? "Checking URLs…" : "Mark release live"}
                  </Button>
                </>
              ) : (
                <span className="text-xs text-label-2">
                  {unit.state === "live"
                    ? "All pages live"
                    : unit.state === "planned"
                      ? "Build it from the Articles tab"
                      : "Downloadable once every page is approved"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ProgressBar value={counts.total ? counts.approved / counts.total : 0} family={allApproved ? "done" : "working"} className="flex-1" />
            <span className="text-xs text-label-2 tabular-nums" title="Approved (or live) of the pages in the release">
              {counts.approved} of {counts.total} approved
              {counts.live ? ` · ${counts.live} live` : ""}
            </span>
          </div>

          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="-ml-1 inline-flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-[13px] font-medium text-label-2 transition-colors hover:text-label"
            >
              <ChevronRight aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-90")} />
              {open ? "Hide pages" : `Show ${unit.members.length} page${unit.members.length === 1 ? "" : "s"}`}
            </button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <ul className="border-t-[0.5px] border-separator px-5 sm:px-[22px]">
            {unit.members.map((m) => (
              <li key={m.externalId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-[0.5px] border-separator py-2.5 last:border-0">
                <span className="w-24 shrink-0 font-mono text-[11px] text-label-3">{m.externalId}</span>
                <span className="min-w-0 flex-[1_1_220px] text-[13px]">
                  {m.hasArticle ? (
                    <Link href={`/production/review/${m.slug}`} className="hover:text-primary hover:underline">
                      {m.title}
                    </Link>
                  ) : (
                    m.title
                  )}
                </span>
                <span className="w-16 text-xs text-label-2">{ROLE_SHORT[m.role] ?? m.role}</span>
                <span className="flex min-w-[150px] justify-end">
                  <MemberStatus m={m} />
                </span>
              </li>
            ))}
          </ul>
          {unit.excluded.length > 0 && (
            <p className="border-t-[0.5px] border-separator px-5 py-3 text-xs text-label-2 sm:px-[22px]">
              Not in this release: {unit.excluded.map((e) => `${e.title} (${e.reason})`).join(" · ")}
            </p>
          )}
        </CollapsibleContent>
      </article>
    </Collapsible>
  );
}

function MemberStatus({ m }: { m: UiReleaseMember }) {
  if (m.live) {
    return m.liveUrl ? (
      <a href={m.liveUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:underline">
        <Status family="done">Live</Status>
        <ExternalLink aria-label="Open the live page" className="size-3 text-done-fg" />
      </a>
    ) : (
      <Status family="done">Live</Status>
    );
  }
  if (m.blocking) {
    return (
      <Status family={m.blocking === "awaiting approval" ? "needs" : "idle"} pulse={false}>
        {humanize(m.blocking)}
      </Status>
    );
  }
  return <Status family="done">{m.exportedAt ? "Approved · downloaded" : "Approved"}</Status>;
}
