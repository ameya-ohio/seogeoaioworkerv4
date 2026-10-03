"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  Check,
  CloudUpload,
  Download,
  ExternalLink,
  FileDown,
  GitCompareArrows,
  ListTree,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Rocket,
  Save,
  ShieldCheck,
} from "lucide-react";
import {
  approveArticle,
  publishArticleLive,
  refreshArticleFromHubSpot,
  rerunPhase,
  saveArticleMarkdown,
  sendArticleToHubSpot,
} from "@/lib/actions/content";
import { markArticleLive, setArticleFacets, signOffArticle } from "@/lib/actions/publishing";
import { Page, StageBadge, Status, stageLabel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CompareView, ReadView, SourceEditor, revealInTextarea } from "./document";
import { ConfirmDialog, MarkLiveDialog, RerunDialog, SignOffDialog } from "./dialogs";
import { Inspector, inspectorTabs, type InspectorTab } from "./inspector";
import { PHASES, findNotes, headerUrl, hostPath, readingBody, removeNote, type OutlineEntry, type ReviewArticle } from "./model";
import { canPublish, hubspotLive, needsSignoff, nextStep } from "./path";

export type { ReviewArticle } from "./model";

type Mode = "read" | "edit" | "split";
type Result = { error?: string; warnings?: string[]; message?: string };
type DialogKey = "signoff" | "markLive" | "goLive" | "updateLive" | "rerun" | null;

const MODES: { key: Mode; label: string }[] = [
  { key: "read", label: "Read" },
  { key: "edit", label: "Edit" },
  { key: "split", label: "Split" },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ReviewEditor({ article }: { article: ReviewArticle }) {
  const router = useRouter();
  const [content, setContent] = useState(article.markdown);
  const [mode, setMode] = useState<Mode>("read");
  const [compare, setCompare] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("audit");
  const [dialog, setDialog] = useState<DialogKey>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ n: number; t: number } | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panesRef = useRef<HTMLDivElement>(null);
  const noteCursor = useRef(-1);

  const dirty = content !== article.markdown;
  const notes = useMemo(() => findNotes(content), [content]);
  const reading = useMemo(() => readingBody(content), [content]);
  const next = nextStep(article, notes.length);
  const hs = article.hubspot;
  const hsLive = hubspotLive(article);
  const publishable = canPublish(article);
  const signoffMissing = needsSignoff(article);
  const showsRead = !compare && mode !== "edit";

  const act = useCallback(
    (fn: () => Promise<Result>, okMsg: string, after?: () => void) =>
      startTransition(async () => {
        const res = await fn();
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success(res.message ?? okMsg);
        for (const w of res.warnings ?? []) toast.warning(w);
        after?.();
        router.refresh();
      }),
    [router],
  );

  const save = useCallback(() => {
    if (!dirty || pending) return;
    act(() => saveArticleMarkdown(article.slug, content), "Saved");
  }, [act, article.slug, content, dirty, pending]);

  // ── notes ────────────────────────────────────────────────────────────

  const revealNote = useCallback((n: number) => {
    setCompare(false);
    setMode((m) => (m === "read" ? "edit" : m));
    setReveal({ n, t: Date.now() });
  }, []);

  const resolveNote = useCallback((n: number) => {
    setContent((c) => {
      const note = findNotes(c)[n];
      return note ? removeNote(c, note) : c;
    });
    toast.success("Note resolved", { description: "Save to keep the change." });
  }, []);

  const jumpToNote = () => {
    if (notes.length === 0) return;
    if (showsRead && reading.visibleNotes.length > 0) {
      const list = reading.visibleNotes;
      const n = list.find((v) => v > noteCursor.current) ?? list[0]!;
      noteCursor.current = n;
      const el = document.getElementById(`note-${n}`);
      el?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      el?.focus({ preventScroll: true });
      return;
    }
    const n = notes.find((x) => x.n > noteCursor.current)?.n ?? 0;
    noteCursor.current = n;
    revealNote(n);
  };

  useEffect(() => {
    if (!reveal || !textareaRef.current) return;
    const note = findNotes(textareaRef.current.value)[reveal.n];
    if (note) revealInTextarea(textareaRef.current, note.start, note.end);
    setReveal(null);
  }, [reveal, mode]);

  // Sticky panes sit under the toolbar, which wraps on narrow windows: track its height.
  useEffect(() => {
    const panes = panesRef.current;
    const bar = panes?.previousElementSibling;
    if (!panes || !(bar instanceof HTMLElement)) return;
    const ro = new ResizeObserver(() => panes.style.setProperty("--bar-h", `${bar.offsetHeight}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // ── outline + scroll spy ─────────────────────────────────────────────

  const goToSection = (id: string) => {
    if (!showsRead) {
      setCompare(false);
      setMode("read");
    }
    setScrollTarget(id);
  };

  useEffect(() => {
    if (!scrollTarget || !showsRead) return;
    document.getElementById(scrollTarget)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    setActiveSection(scrollTarget);
    setScrollTarget(null);
  }, [scrollTarget, showsRead]);

  useEffect(() => {
    if (!showsRead) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-outline-id]"));
    if (els.length === 0) return;
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.outlineId!;
          if (e.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = els.find((el) => visible.has(el.dataset.outlineId!));
        if (first) setActiveSection(first.dataset.outlineId!);
      },
      { rootMargin: "-60px 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [showsRead, reading.outline]);

  // ── keyboard: ⌘S saves, ⌘E switches Read and Edit ────────────────────

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === "s") {
      e.preventDefault();
      save();
    } else if (k === "e") {
      e.preventDefault();
      setCompare(false);
      setMode((m) => (m === "read" ? "edit" : "read"));
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ── publish actions (same paths and conditions as before) ────────────

  const exportHref = `/api/export/${article.slug}`;
  const exportBlocked = dirty || signoffMissing;
  const downloadMarkdown = () => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${article.slug}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // The export marks the article exported; pick that up so the next step shows.
  const afterExport = () => window.setTimeout(() => router.refresh(), 2500);
  const sendToHubSpot = () => (hsLive ? setDialog("updateLive") : act(() => sendArticleToHubSpot(article.slug), hs ? "HubSpot post updated" : "HubSpot draft created"));

  const savedFirst = dirty ? "Save your edits first" : undefined;

  const primary = (() => {
    switch (next) {
      case "notes":
        return (
          <Button onClick={jumpToNote}>
            Resolve {plural(notes.length, "note")}
          </Button>
        );
      case "signoff":
        return (
          <span title={savedFirst}>
            <Button onClick={() => setDialog("signoff")} disabled={pending || dirty}>
              <ShieldCheck data-icon="inline-start" />
              Sign off
            </Button>
          </span>
        );
      case "download":
        return exportBlocked ? (
          <span title={savedFirst}>
            <Button disabled>
              <Download data-icon="inline-start" />
              Download Framer package
            </Button>
          </span>
        ) : (
          <Button asChild>
            <a href={exportHref} onClick={afterExport} title="Download the paste-ready Framer bundle (HTML, markdown, head tags, meta, hero)">
              <Download data-icon="inline-start" />
              Download Framer package
            </a>
          </Button>
        );
      case "markLive":
        return (
          <span title={savedFirst}>
            <Button onClick={() => setDialog("markLive")} disabled={pending || dirty}>
              <Rocket data-icon="inline-start" />
              Mark live
            </Button>
          </span>
        );
      case "send":
        return (
          <span title={savedFirst ?? (article.activeRun ? "A run is active for this article" : "Create the post in HubSpot as a draft")}>
            <Button onClick={sendToHubSpot} disabled={pending || dirty || Boolean(article.activeRun)}>
              <CloudUpload data-icon="inline-start" />
              Send to HubSpot
            </Button>
          </span>
        );
      case "goLive":
        return (
          <span title={savedFirst}>
            <Button onClick={() => setDialog("goLive")} disabled={pending || dirty}>
              <Rocket data-icon="inline-start" />
              Go live
            </Button>
          </span>
        );
      case "approve":
        return (
          <span
            title={
              savedFirst ?? `HubSpot isn't configured. Set ${article.hubspotConfig.tokenEnv} on the web service to publish from here.`
            }
          >
            <Button onClick={() => act(() => approveArticle(article.slug), "Approved for publish")} disabled={pending || dirty}>
              <Check data-icon="inline-start" />
              Approve
            </Button>
          </span>
        );
      default:
        if (article.publishTarget === "framer-export" && article.live) {
          return (
            <Button variant="secondary" asChild>
              <a href={article.live.url} target="_blank" rel="noopener">
                View live page
                <ExternalLink data-icon="inline-end" />
              </a>
            </Button>
          );
        }
        if (article.publishTarget !== "framer-export" && hsLive && hs?.url) {
          return (
            <Button variant="secondary" asChild>
              <a href={hs.url} target="_blank" rel="noopener">
                View live post
                <ExternalLink data-icon="inline-end" />
              </a>
            </Button>
          );
        }
        return null;
    }
  })();

  // ── toolbar ──────────────────────────────────────────────────────────

  const crumbs = [
    { label: "Production", href: "/production" },
    { label: "Review", href: "/production?tab=review" },
    {
      label: (
        <>
          {dirty && (
            <span
              role="img"
              aria-label="Unsaved changes"
              title="Unsaved changes"
              className="mr-1.5 inline-block size-[7px] rounded-full bg-label-2 align-middle"
            />
          )}
          {article.title}
        </>
      ),
    },
  ];

  const modeSwitch = (
    <div role="group" aria-label="Editor mode" className="inline-flex gap-0.5 rounded-[9px] bg-fill p-0.5">
      {MODES.map((m) => {
        const on = !compare && mode === m.key;
        return (
          <button
            key={m.key}
            type="button"
            aria-pressed={on}
            onClick={() => {
              setCompare(false);
              setMode(m.key);
            }}
            className={cn(
              "inline-flex h-[26px] items-center rounded-[7px] px-3 text-[13px] whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
              on
                ? "bg-raised font-semibold text-label shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]"
                : "font-medium text-label-2 hover:text-label",
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem disabled={!dirty || pending} onSelect={save}>
          <Save />
          Save changes
          <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={downloadMarkdown}>
          <FileDown />
          Download markdown
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Publish</DropdownMenuLabel>
        {article.publishTarget === "framer-export" ? (
          publishable ? (
            <>
              {signoffMissing && (
                <DropdownMenuItem disabled={pending || dirty} onSelect={() => setDialog("signoff")}>
                  <ShieldCheck />
                  Sign off…
                </DropdownMenuItem>
              )}
              <DropdownMenuItem disabled={exportBlocked} asChild>
                <a href={exportBlocked ? undefined : exportHref} onClick={afterExport}>
                  <Download />
                  {article.exportedAt ? "Download Framer package again" : "Download Framer package"}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={pending || dirty} onSelect={() => setDialog("markLive")}>
                <Rocket />
                {article.live ? "Re-check live URL…" : "Mark live…"}
              </DropdownMenuItem>
              {article.live && (
                <DropdownMenuItem asChild>
                  <a href={article.live.url} target="_blank" rel="noopener">
                    <ExternalLink />
                    Open live page
                  </a>
                </DropdownMenuItem>
              )}
            </>
          ) : (
            <DropdownMenuItem disabled>Available once the article is in review</DropdownMenuItem>
          )
        ) : article.hubspotConfig.configured ? (
          publishable ? (
            <>
              <DropdownMenuItem disabled={pending || dirty || Boolean(article.activeRun)} onSelect={sendToHubSpot}>
                <CloudUpload />
                {hs ? "Update HubSpot post" : "Send to HubSpot as draft"}
              </DropdownMenuItem>
              {hs && !hsLive && (
                <DropdownMenuItem disabled={pending || dirty} onSelect={() => setDialog("goLive")}>
                  <Rocket />
                  Go live…
                </DropdownMenuItem>
              )}
              {hs && (
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={() => act(() => refreshArticleFromHubSpot(article.slug), "Synced from HubSpot")}
                >
                  <RefreshCw />
                  Refresh from HubSpot
                </DropdownMenuItem>
              )}
              {hs?.url && (
                <DropdownMenuItem asChild>
                  <a href={hs.url} target="_blank" rel="noopener">
                    <ExternalLink />
                    {hsLive ? "Open live post" : "Open post URL"}
                  </a>
                </DropdownMenuItem>
              )}
            </>
          ) : (
            <DropdownMenuItem disabled>Available once the article is in review</DropdownMenuItem>
          )
        ) : article.stage === "review" ? (
          <DropdownMenuItem disabled={pending || dirty} onSelect={() => act(() => approveArticle(article.slug), "Approved for publish")}>
            <Check />
            Approve (HubSpot not configured)
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>Nothing to publish from here</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending || Boolean(article.activeRun)} onSelect={() => setDialog("rerun")}>
          <RotateCcw />
          Re-run from a phase…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const actions = (
    <>
      {notes.length > 0 && (
        <Button variant="needs" onClick={jumpToNote} aria-label={`${plural(notes.length, "note")} left. Jump to the next one.`}>
          {plural(notes.length, "note")} left
          <ArrowDown data-icon="inline-end" />
        </Button>
      )}
      {dirty && (
        <Button variant="secondary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      )}
      {article.draft && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Compare with first draft"
              aria-pressed={compare}
              onClick={() => setCompare((c) => !c)}
              className={cn(compare && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary")}
            >
              <GitCompareArrows />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Compare with first draft</TooltipContent>
        </Tooltip>
      )}
      {menu}
      {primary}
    </>
  );

  // ── layout ───────────────────────────────────────────────────────────

  const outlineList = <OutlineList outline={reading.outline} active={activeSection} onGo={goToSection} />;
  const docHeight = "h-[calc(100dvh-var(--bar-h,52px)-44px)] min-h-[420px]";

  const readView = (
    <ReadView
      body={reading.body}
      outline={reading.outline}
      notes={notes}
      headerSrc={article.hasHeader ? headerUrl(article) : null}
      headerAlt={`Header image for ${article.title}`}
      onResolve={resolveNote}
      onEdit={revealNote}
    />
  );

  return (
    <Page bleed crumbs={crumbs} center={modeSwitch} actions={actions}>
      <div ref={panesRef} className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
        <nav aria-label="Article outline" className="hidden w-[232px] shrink-0 border-r-[0.5px] border-separator-strong 2xl:block">
          <div className="sticky top-[var(--bar-h,52px)] flex max-h-[calc(100dvh-var(--bar-h,52px))] flex-col gap-2.5 overflow-y-auto px-3 py-6">
            <p className="px-2 text-[11px] leading-[14px] font-semibold tracking-[0.04em] text-label-2 uppercase">Contents</p>
            {outlineList}
            <p className="mt-3 px-2 text-xs leading-[17px] text-label-2 tabular-nums">
              {reading.words.toLocaleString()} words · {Math.max(1, Math.round(reading.words / 238))} min read
              {notes.length > 0 && (
                <>
                  <br />
                  <span className="text-needs-fg">{plural(notes.length, "note")} to resolve</span>
                </>
              )}
            </p>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col bg-surface">
          <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 border-b-[0.5px] border-separator px-5 py-2 text-[13px] sm:px-8">
            <StageBadge stage={article.stage} />
            <span className="min-w-0 truncate text-label-2">
              {article.formatLabel}
              {" · "}
              {article.targetKeyword ?? "No target keyword"}
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
              {article.activeRun && (
                <Status family={article.activeRun.status === "running" ? "working" : "idle"}>
                  {article.activeRun.status === "running" ? "Re-run in progress" : "Re-run queued"}
                  {article.activeRun.currentPhase ? ` · ${stageLabel(article.activeRun.currentPhase)}` : ""}
                </Status>
              )}
              {article.publishTarget === "framer-export" && article.signoff && (
                <span className="text-xs text-label-2">Signed off by {article.signoff.by}</span>
              )}
              {article.publishTarget === "framer-export" && article.live && (
                <a href={article.live.url} target="_blank" rel="noopener" className="hover:underline">
                  <Status family="done">Live · {hostPath(article.live.url)}</Status>
                </a>
              )}
              {article.publishTarget !== "framer-export" && hs && (
                <Status family={hsLive ? "done" : "needs"}>
                  HubSpot {hs.state.toLowerCase()}
                  {hs.url && (
                    <a href={hs.url} target="_blank" rel="noopener" aria-label={hsLive ? "View live post" : "Open post URL"} className="text-label-2 hover:text-label">
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </Status>
              )}
              {showsRead && reading.outline.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="2xl:hidden">
                      <ListTree data-icon="inline-start" />
                      Contents
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="max-h-[60dvh] w-72 overflow-y-auto">
                    {outlineList}
                  </PopoverContent>
                </Popover>
              )}
            </span>
          </div>

          {compare && article.draft ? (
            <div className="px-5 py-8 sm:px-8">
              <CompareView draft={article.draft} current={content} />
            </div>
          ) : mode === "read" ? (
            <div className="px-5 pt-10 pb-24 sm:px-10">{readView}</div>
          ) : mode === "edit" ? (
            <SourceEditor ref={textareaRef} value={content} onChange={setContent} className={docHeight} />
          ) : (
            <div className="grid xl:grid-cols-2">
              <SourceEditor
                ref={textareaRef}
                value={content}
                onChange={setContent}
                className={cn(docHeight, "border-b-[0.5px] border-separator xl:border-r-[0.5px] xl:border-b-0")}
              />
              <div className={cn("overflow-y-auto px-5 py-8 sm:px-8 xl:h-[calc(100dvh-var(--bar-h,52px)-44px)]")}>{readView}</div>
            </div>
          )}
        </div>

        <aside
          aria-label="Inspector"
          className="w-full shrink-0 border-t-[0.5px] border-separator-strong bg-window lg:w-[340px] lg:border-t-0 lg:border-l-[0.5px]"
        >
          <div className="lg:sticky lg:top-[var(--bar-h,52px)] lg:max-h-[calc(100dvh-var(--bar-h,52px))] lg:overflow-y-auto">
            <Inspector
              article={article}
              tab={inspectorTabs(article).find((t) => t.key === tab)?.disabled ? "audit" : tab}
              onTab={setTab}
              content={content}
              notes={notes.length}
              current={next}
              pending={pending}
              onSaveFacets={(f) => act(() => setArticleFacets(article.slug, f), "Facets saved")}
            />
          </div>
        </aside>
      </div>

      <SignOffDialog
        open={dialog === "signoff"}
        onOpenChange={(o) => setDialog(o ? "signoff" : null)}
        formatLabel={article.formatLabel}
        onSubmit={(by, note) => act(() => signOffArticle(article.slug, by, note || undefined), `Signed off by ${by}`)}
      />
      <MarkLiveDialog
        open={dialog === "markLive"}
        onOpenChange={(o) => setDialog(o ? "markLive" : null)}
        defaultUrl={article.live?.url ?? article.canonicalUrl ?? ""}
        recheck={Boolean(article.live)}
        onSubmit={(url) => act(() => markArticleLive(article.slug, url), "Marked live")}
      />
      <ConfirmDialog
        open={dialog === "goLive"}
        onOpenChange={(o) => setDialog(o ? "goLive" : null)}
        title={`Publish “${article.title}” on HubSpot?`}
        description={
          <>
            It becomes public{hs?.url ? ` at ${hs.url}` : ""}. Unpublishing afterwards has to be done in HubSpot.
          </>
        }
        action="Go live"
        onConfirm={() => act(() => publishArticleLive(article.slug), "Published on HubSpot")}
      />
      <ConfirmDialog
        open={dialog === "updateLive"}
        onOpenChange={(o) => setDialog(o ? "updateLive" : null)}
        title="Update the live post?"
        description="This post is live on HubSpot. Your current article replaces what readers see now."
        action="Update live post"
        onConfirm={() => act(() => sendArticleToHubSpot(article.slug), "HubSpot post updated")}
      />
      <RerunDialog
        open={dialog === "rerun"}
        onOpenChange={(o) => setDialog(o ? "rerun" : null)}
        dirty={dirty}
        onSubmit={(phase) =>
          act(() => rerunPhase(article.slug, phase), `Re-run queued from ${PHASES.find((p) => p.key === phase)?.label ?? phase}`)
        }
      />
    </Page>
  );
}

function OutlineList({ outline, active, onGo }: { outline: OutlineEntry[]; active: string | null; onGo: (id: string) => void }) {
  if (outline.length === 0) return <p className="px-2 text-[13px] text-label-2">No sections yet.</p>;
  return (
    <ol className="flex flex-col gap-px">
      {outline.map((o) => {
        const on = o.id === active;
        return (
          <li key={o.id}>
            <a
              href={`#${o.id}`}
              aria-current={on ? "location" : undefined}
              onClick={(e) => {
                e.preventDefault();
                onGo(o.id);
              }}
              className={cn(
                "flex items-start gap-2 rounded-[7px] px-2 py-1.5 text-[13px] leading-[17px] transition-colors",
                on ? "bg-fill font-semibold text-label" : "text-label-2 hover:bg-fill-2 hover:text-label",
              )}
            >
              <span className="min-w-0 flex-1">{o.title || "Untitled section"}</span>
              {o.notes.length > 0 && (
                <span
                  aria-label={plural(o.notes.length, "note")}
                  className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-needs-bg px-1 text-[11px] font-bold text-needs-fg tabular-nums"
                >
                  {o.notes.length}
                </span>
              )}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
