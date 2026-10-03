"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { AlertCircle, ArrowUp, CheckCircle2, ChevronDown, Circle, RotateCcw, SkipForward } from "lucide-react";
import { finishInterview, skipInterview } from "@/lib/actions/interview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Caption, Page, ProgressRing, StageBadge, type Crumb } from "./kit";

export interface InterviewView {
  slug: string;
  title: string;
  stage: string;
  status: "open" | "complete" | "skipped" | "refined";
  messages: { role: "assistant" | "user"; content: string; at: string }[];
  checklist: { label: string; value: string | null }[];
  wedge: string;
  /** D61: the Researcher's Candidate Positions and Topic Summary — what the interview reacts to. */
  positions: string;
  summary: string;
  /** Interviews opened after an outline (D59) only. */
  plannedAngle: string;
  plannedThesis: string;
  plannedAnchor: string;
  costUsd: number | null;
}

const STATUS_NOTE: Record<InterviewView["status"], string> = {
  open: "",
  complete: "Finished. The run is writing your point of view up, checking any facts you raised, then planning the outline from it.",
  skipped: "Skipped. The Strategist plans the outline from the research alone.",
  refined: "Finished. The outline was planned from this interview.",
};

/** Items the expert may leave empty: they don't hold back the primary Finish. */
function isOptional(label: string): boolean {
  return /optional/i.test(label) || label === "Attribution";
}

interface QuickReply {
  letter: string;
  text: string;
}

/**
 * The interviewer offers research's Candidate Positions as A, B, C
 * (agents/interviewer.md). Reads them only when each sits on its own line,
 * in order from A; anything looser shows no chips.
 */
function parseQuickReplies(text: string): QuickReply[] {
  const out: QuickReply[] = [];
  for (const raw of text.split("\n")) {
    const line = raw
      .replace(/^\s*(?:[-*+]\s+|>\s*)/, "")
      .replace(/\*\*|__/g, "")
      .trim();
    const m = /^(?:(?:Option|Position)\s+)?\(?([A-E])(?:\)|\.|:|\s+[—–-])\s*(.+)$/.exec(line);
    if (!m) continue;
    const letter = m[1]!;
    const body = m[2]!.replace(/[*_`]/g, "").trim();
    if (letter === "A") out.length = 0;
    if (letter !== String.fromCharCode(65 + out.length) || !body) continue;
    out.push({ letter, text: body });
  }
  return out.length >= 2 ? out : [];
}

/**
 * D59 interview chat. Each answer POSTs to /api/interview/[slug], which
 * streams the interviewer's reply; when the stream ends the page refreshes,
 * so the saved transcript and the captured checklist are the source of truth.
 */
export function InterviewChat({ view, crumbs }: { view: InterviewView; crumbs: Crumb[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState(view.messages);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const open = view.status === "open";
  const busy = streaming !== null || pending;
  const last = messages[messages.length - 1];
  const answered = messages.some((m) => m.role === "user");

  const captured = view.checklist.filter((c) => c.value).length;
  const total = view.checklist.length;
  const required = view.checklist.filter((c) => !isOptional(c.label));
  const allCaptured = required.length > 0 && required.every((c) => c.value);
  const remaining = required.filter((c) => !c.value).length;

  const replies = useMemo(
    () => (open && last?.role === "assistant" ? parseQuickReplies(last.content) : []),
    [open, last],
  );
  const picked = /^([A-E])\b/.exec(draft)?.[1] ?? null;

  useEffect(() => {
    setMessages(view.messages);
  }, [view.messages]);
  // Block body: scrollIntoView returns a Promise in recent browsers, and an effect may only return a cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  async function turn(body: { message: string } | { retry: true }) {
    setError(null);
    setStreaming("");
    try {
      const res = await fetch(`/api/interview/${view.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        setError((await res.text()) || `Request failed (${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setStreaming(text);
      }
      // The route ends a failed turn with a bracketed notice and saves nothing,
      // so keep the reason on screen after the refresh drops the streamed text.
      const notice = /\[((?:Reply failed|The interviewer couldn't)[^\]]*)\]\s*$/.exec(text);
      if (notice) setError(notice[1] ?? "Reply failed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(null);
      router.refresh();
    }
  }

  function send() {
    const message = draft.trim();
    if (!message || busy) return;
    setDraft("");
    setMessages((m) => [...m, { role: "user", content: message, at: new Date().toISOString() }]);
    void turn({ message });
  }

  function close(kind: "finish" | "skip") {
    startTransition(async () => {
      const res = await (kind === "finish" ? finishInterview(view.slug) : skipInterview(view.slug));
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(kind === "finish" ? "Interview finished. The run picks up from your answers." : "Interview skipped. The run continues from the research.");
      router.push("/production");
    });
  }

  function pick(letter: string) {
    setDraft((d) => (/^[A-E]\b/.test(d) ? letter + d.slice(1) : d ? `${letter}. ${d}` : `${letter}. `));
    requestAnimationFrame(() => {
      const el = field.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  const actions = (
    <>
      <span className="inline-flex items-center gap-2 text-xs font-medium text-label-2 tabular-nums">
        <ProgressRing value={captured} total={total} size={22} stroke={3} family="done" label={false} />
        {captured} of {total} captured
      </span>
      {open ? (
        <>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" disabled={busy}>
                Skip interview
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Skip the interview?</AlertDialogTitle>
                <AlertDialogDescription>
                  The Strategist will plan the outline from the research alone. What you've answered so far isn't used.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep talking</AlertDialogCancel>
                <AlertDialogAction onClick={() => close("skip")}>Skip interview</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant={allCaptured ? "default" : "secondary"}
            disabled={busy || !answered}
            title={answered ? undefined : "Answer at least one question first"}
            onClick={() => close("finish")}
          >
            Finish
          </Button>
        </>
      ) : (
        <Button variant="secondary" asChild>
          <Link href={`/production/review/${view.slug}`}>Open review</Link>
        </Button>
      )}
    </>
  );

  return (
    <Page bleed crumbs={crumbs} actions={actions}>
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* conversation */}
        <div className="flex min-w-0 flex-1 justify-center px-4 pt-8 sm:px-8">
          <div className="flex w-full max-w-[700px] flex-col">
            <header className="flex flex-col items-center gap-1.5 pb-6 text-center">
              <Caption>Expert interview</Caption>
              <h1 className="text-2xl leading-[30px] font-bold tracking-[-0.02em] text-balance">{view.title}</h1>
              <p className="max-w-[460px] text-sm text-label-2 text-pretty">
                Your point of view shapes the angle, the thesis, the story and where the product fits. Any facts you raise are checked before the
                outline is planned.
              </p>
            </header>

            {!open && (
              <p className="mb-5 flex items-start justify-center gap-2 self-center rounded-xl bg-fill-2 px-4 py-2.5 text-[13px] leading-[18px] text-label-2">
                {view.status === "skipped" ? (
                  <SkipForward aria-hidden className="mt-px size-4 shrink-0" />
                ) : (
                  <CheckCircle2 aria-hidden className="mt-px size-4 shrink-0 text-done" />
                )}
                <span className="text-pretty">{STATUS_NOTE[view.status]}</span>
              </p>
            )}

            <div className="flex flex-col gap-3">
              {messages.map((m, i) => (
                <Bubble key={`${i}-${m.at}`} role={m.role} content={m.content} />
              ))}
              {streaming !== null &&
                (streaming ? (
                  <Bubble role="assistant" content={streaming} />
                ) : (
                  <div
                    role="status"
                    aria-label="The interviewer is typing"
                    className="typing-dots inline-flex gap-[5px] self-start rounded-[18px] rounded-bl-[6px] bg-surface px-4 py-3.5 shadow-card"
                  >
                    <span className="size-[7px] rounded-full bg-label-2" />
                    <span className="size-[7px] rounded-full bg-label-2" />
                    <span className="size-[7px] rounded-full bg-label-2" />
                  </div>
                ))}

              {replies.length > 0 && !busy && (
                <div className="flex flex-wrap gap-2 pl-1" aria-label="Quick replies">
                  {replies.map((r) => (
                    <button
                      key={r.letter}
                      type="button"
                      onClick={() => pick(r.letter)}
                      title={r.text}
                      className={cn(
                        "inline-flex min-h-[34px] max-w-full items-center gap-2 rounded-[17px] px-3.5 py-1.5 text-left text-[13px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring",
                        picked === r.letter
                          ? "bg-primary text-primary-foreground"
                          : picked
                            ? "text-label-3 shadow-[inset_0_0_0_1px_var(--separator-strong)] hover:text-label-2"
                            : "bg-surface text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_40%,transparent)] hover:bg-primary-soft",
                      )}
                    >
                      <span className="font-bold">{r.letter}</span>
                      <span className="truncate sm:max-w-[34ch]">{r.text}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => field.current?.focus()}
                    className="inline-flex min-h-[34px] items-center rounded-[17px] px-3.5 py-1.5 text-[13px] font-medium text-label-2 shadow-[inset_0_0_0_1px_var(--separator-strong)] transition-colors outline-none hover:text-label focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    Something else
                  </button>
                </div>
              )}
            </div>

            {error ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-problem-bg px-4 py-2.5">
                <p className="flex min-w-0 items-start gap-2 text-[13px] leading-[18px] text-problem-fg">
                  <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
                  <span className="text-pretty">{error}</span>
                </p>
                {open && last?.role === "user" && !busy && <RetryButton onClick={() => void turn({ retry: true })} />}
              </div>
            ) : (
              open &&
              last?.role === "user" &&
              !busy && (
                <div className="mt-3 flex items-center justify-center gap-3 text-xs text-label-2">
                  No reply yet.
                  <RetryButton onClick={() => void turn({ retry: true })} />
                </div>
              )
            )}

            <div ref={bottom} className="scroll-mb-44" />

            {open ? (
              <div className="sticky bottom-0 mt-auto bg-linear-to-t from-window from-70% to-transparent pt-6 pb-5">
                <label className="flex items-end gap-2.5 rounded-[22px] bg-surface py-2 pr-2 pl-4 shadow-card transition-shadow focus-within:shadow-[0_0_0_3px_var(--ring)]">
                  <span className="sr-only">Your reply</span>
                  <textarea
                    ref={field}
                    rows={1}
                    className="field-sizing-content max-h-48 min-h-[30px] min-w-0 flex-1 resize-none border-0 bg-transparent py-1 text-[15px] leading-[22px] text-label outline-none placeholder:text-label-3 disabled:opacity-60"
                    placeholder="Answer in your own words. Say “skip” to move on, or “done” when you've said enough."
                    value={draft}
                    disabled={busy}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Send"
                    disabled={busy || !draft.trim()}
                    onClick={send}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[filter,opacity] outline-none hover:brightness-110 focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-35"
                  >
                    <ArrowUp aria-hidden className="size-[17px] stroke-[2.4]" />
                  </button>
                </label>
                <p className="mt-2 flex items-center justify-center gap-1 text-xs text-label-2">
                  <Kbd>↵</Kbd> to send ·<Kbd>⇧</Kbd>
                  <Kbd>↵</Kbd> for a new line
                </p>
              </div>
            ) : (
              <div className="h-10" />
            )}
          </div>
        </div>

        {/* inspector */}
        <aside
          aria-label="Interview context"
          className="shrink-0 border-t-[0.5px] border-separator-strong bg-sidebar lg:sticky lg:top-[52px] lg:h-[calc(100dvh-52px)] lg:w-[340px] lg:overflow-y-auto lg:border-t-0 lg:border-l-[0.5px]"
        >
          <div className="flex flex-col gap-5 px-5 py-6 lg:px-6 lg:py-7">
            <div className="flex items-center gap-3.5">
              <ProgressRing value={captured} total={total} size={44} family="done" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold">Captured so far</h2>
                <p className="text-xs text-label-2">
                  {allCaptured ? "Everything the outline needs is here." : `${remaining} more and the outline can be planned`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                aria-expanded={contextOpen}
                aria-controls="interview-context"
                onClick={() => setContextOpen((o) => !o)}
              >
                {contextOpen ? "Hide" : "Show"}
                <ChevronDown data-icon="inline-end" className={cn("transition-transform", contextOpen && "rotate-180")} />
              </Button>
            </div>

            <div id="interview-context" className={cn("flex-col gap-7", contextOpen ? "flex" : "hidden", "lg:flex")}>
              <ul className="flex flex-col">
                {view.checklist.map((c) => (
                  <li key={c.label} className="flex gap-2.5 py-[5px]">
                    {c.value ? (
                      <CheckCircle2 aria-label="Captured" className="mt-px size-[18px] shrink-0 stroke-[1.8] text-done" />
                    ) : (
                      <Circle aria-label="Not yet" className="mt-px size-[18px] shrink-0 stroke-[1.5] text-label-3" />
                    )}
                    <span className="min-w-0">
                      <span className={cn("block text-[13px] leading-5", c.value ? "font-medium text-label" : "text-label-2")}>{c.label}</span>
                      {c.value && <span className="block text-xs leading-4 text-label-2 text-pretty">{c.value}</span>}
                    </span>
                  </li>
                ))}
              </ul>

              {view.wedge && (
                <section className="flex flex-col gap-2">
                  <Caption>The open wedge</Caption>
                  <Prose text={view.wedge} />
                </section>
              )}

              {(view.positions || view.summary) && (
                <section className="flex flex-col gap-4">
                  {view.positions && (
                    <div className="flex flex-col gap-2">
                      <Caption>Positions research proposed</Caption>
                      <Prose text={view.positions} />
                    </div>
                  )}
                  {view.summary && (
                    <div className="flex flex-col gap-2">
                      <Caption>Topic summary</Caption>
                      <Prose text={view.summary} />
                    </div>
                  )}
                </section>
              )}

              {(view.plannedAngle || view.plannedThesis || view.plannedAnchor) && (
                <section className="flex flex-col gap-2">
                  <Caption>Planned before the interview</Caption>
                  {view.plannedAngle && <Labeled label="Angle" text={view.plannedAngle} />}
                  {view.plannedThesis && <Labeled label="Thesis" text={view.plannedThesis} />}
                  {view.plannedAnchor && <Labeled label="Real-world anchor" text={view.plannedAnchor} />}
                </section>
              )}

              <footer className="flex flex-wrap items-center justify-between gap-2 border-t-[0.5px] border-separator pt-4 text-xs text-label-2">
                <StageBadge stage={view.stage} />
                {view.costUsd !== null && <span className="tabular-nums">Cost so far ${view.costUsd.toFixed(view.costUsd < 1 ? 3 : 2)}</span>}
              </footer>
            </div>
          </div>
        </aside>
      </div>
    </Page>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      <RotateCcw data-icon="inline-start" />
      Retry reply
    </Button>
  );
}

function Bubble({ role, content }: { role: "assistant" | "user"; content: string }) {
  if (role === "user") {
    return (
      <div className="max-w-[82%] self-end rounded-[18px] rounded-br-[6px] bg-primary px-4 py-[11px] text-[15px] leading-[22px] text-primary-foreground">
        <p className="whitespace-pre-wrap text-pretty">{content}</p>
      </div>
    );
  }
  return (
    <div className="max-w-[82%] self-start rounded-[18px] rounded-bl-[6px] bg-surface px-4 py-[11px] shadow-card">
      <div className="prose-article text-[15px]! leading-[22px]! [&_ol]:my-2! [&_p]:my-2! [&_ul]:my-2! [&>:first-child]:mt-0! [&>:last-child]:mb-0!">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <div className="prose-article text-[13px]! leading-[19px]! [&_h3]:text-[13px]! [&_li]:my-1! [&_ol]:my-1.5! [&_p]:my-1.5! [&_ul]:my-1.5! [&>:first-child]:mt-0! [&>:last-child]:mb-0!">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function Labeled({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-label-2">{label}</p>
      <Prose text={text} />
    </div>
  );
}
