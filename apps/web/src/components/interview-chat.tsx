"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { finishInterview, skipInterview } from "@/lib/actions/interview";
import { buttonCls, Card, cls, inputCls } from "./ui";

export interface InterviewView {
  slug: string;
  status: "open" | "complete" | "skipped" | "refined";
  messages: { role: "assistant" | "user"; content: string; at: string }[];
  checklist: { label: string; value: string | null }[];
  wedge: string;
  plannedAngle: string;
  plannedThesis: string;
  plannedAnchor: string;
  costUsd: number | null;
}

const STATUS_NOTE: Record<InterviewView["status"], string> = {
  open: "",
  complete: "Finished. The run is refining the outline from your answers, then the Writer starts.",
  skipped: "Skipped. The run went on to the Writer with the Strategist's outline.",
  refined: "Finished. The outline was rebuilt from this interview.",
};

/**
 * D59 interview chat. Each answer POSTs to /api/interview/[slug], which
 * streams the interviewer's reply; when the stream ends the page refreshes,
 * so the saved transcript and the captured checklist are the source of truth.
 */
export function InterviewChat({ view }: { view: InterviewView }) {
  const router = useRouter();
  const [messages, setMessages] = useState(view.messages);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const open = view.status === "open";
  const busy = streaming !== null || pending;
  const last = messages[messages.length - 1];
  const answered = messages.some((m) => m.role === "user");

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
    if (kind === "skip" && !window.confirm("Skip the interview? The Writer will use the Strategist's outline as is.")) return;
    startTransition(async () => {
      const res = await (kind === "finish" ? finishInterview(view.slug) : skipInterview(view.slug));
      if (res.error) setError(res.error);
      else router.push("/production");
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card
        title="Interview"
        actions={
          open ? (
            <div className="flex gap-2">
              <button className={buttonCls("ghost")} disabled={busy} onClick={() => close("skip")}>
                Skip interview
              </button>
              <button className={buttonCls("primary")} disabled={busy || !answered} onClick={() => close("finish")}>
                Finish
              </button>
            </div>
          ) : null
        }
      >
        {!open && <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{STATUS_NOTE[view.status]}</p>}
        <div className="flex max-h-[62vh] flex-col gap-3 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <Bubble key={`${i}-${m.at}`} role={m.role} content={m.content} />
          ))}
          {streaming !== null && <Bubble role="assistant" content={streaming || "…"} />}
          <div ref={bottom} />
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {open && (
          <div className="mt-4 flex flex-col gap-2">
            <textarea
              className={cls(inputCls, "min-h-24 w-full resize-y")}
              placeholder="Answer in your own words. Say “skip” to move on, or “done” when you've said enough."
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Enter to send · Shift+Enter for a new line</span>
              <div className="flex gap-2">
                {last?.role === "user" && !busy && (
                  <button className={buttonCls("secondary")} onClick={() => void turn({ retry: true })}>
                    Retry reply
                  </button>
                )}
                <button className={buttonCls("primary")} disabled={busy || !draft.trim()} onClick={send}>
                  {streaming !== null ? "Listening…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        <Card title="What we've captured">
          <ul className="flex flex-col gap-2.5 text-sm">
            {view.checklist.map((c) => (
              <li key={c.label} className="flex gap-2">
                <span className={cls("mt-0.5 shrink-0", c.value ? "text-emerald-600" : "text-slate-300")}>
                  {c.value ? "✓" : "○"}
                </span>
                <span>
                  <span className="font-medium text-slate-700">{c.label}</span>
                  {c.value && <span className="block text-slate-600">{c.value}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        {view.wedge && (
          <Card title="The open wedge (from research)">
            <Prose text={view.wedge} />
          </Card>
        )}
        <Card title="Planned before the interview">
          {view.plannedAngle && <Labeled label="Angle" text={view.plannedAngle} />}
          {view.plannedThesis && <Labeled label="Thesis" text={view.plannedThesis} />}
          {view.plannedAnchor && <Labeled label="Real-world anchor" text={view.plannedAnchor} />}
        </Card>
        {view.costUsd !== null && <p className="text-xs text-slate-400">Interview cost so far: ${view.costUsd.toFixed(3)}</p>}
      </div>
    </div>
  );
}

function Bubble({ role, content }: { role: "assistant" | "user"; content: string }) {
  return (
    <div className={cls("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cls(
          "max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm",
          role === "user" ? "bg-accent text-white" : "border border-slate-200 bg-slate-50 text-slate-800",
        )}
      >
        {role === "user" ? <p className="whitespace-pre-wrap">{content}</p> : <Prose text={content} />}
      </div>
    </div>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <div className="prose-article text-sm [&_p]:my-1.5 [&_ul]:my-1.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function Labeled({ label, text }: { label: string; text: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <Prose text={text} />
    </div>
  );
}
