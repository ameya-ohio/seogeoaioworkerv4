"use client";

import { forwardRef, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { NOTE_HREF, lineDiff, type EditorNote, type OutlineEntry } from "./model";

// ── reading view ─────────────────────────────────────────────────────────

/** A highlighted editor note with its number; clicking it offers to resolve or edit it. */
function NoteMark({
  note,
  children,
  onResolve,
  onEdit,
}: {
  note: EditorNote | undefined;
  children: React.ReactNode;
  onResolve: (n: number) => void;
  onEdit: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!note) return <mark className="note-mark">{children}</mark>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={`note-${note.n}`}
          data-note={note.n}
          aria-label={`Editor note ${note.n + 1}: ${note.kind}`}
          className="inline scroll-mt-24 rounded-[3px] bg-transparent p-0 text-left [font:inherit] text-inherit focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        >
          <mark className="note-mark text-inherit">{children}</mark>
          <sup className="ml-0.5 font-sans text-[11px] font-bold text-needs-fg tabular-nums">{note.n + 1}</sup>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3 p-3.5 font-sans">
        <p className="text-[13px] leading-[18px] text-label">
          <span className="font-semibold text-needs-fg">{note.kind}</span>
          <span className="text-label-2"> · note {note.n + 1}</span>
        </p>
        <p className="text-[13px] leading-[18px] text-label-2">{note.text || "No detail given."}</p>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setOpen(false);
              onResolve(note.n);
            }}
          >
            <Check data-icon="inline-start" />
            Mark resolved
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpen(false);
              onEdit(note.n);
            }}
          >
            <PencilLine data-icon="inline-start" />
            Edit in source
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ReadView({
  body,
  outline,
  notes,
  headerSrc,
  headerAlt,
  onResolve,
  onEdit,
}: {
  body: string;
  outline: OutlineEntry[];
  notes: EditorNote[];
  headerSrc: string | null;
  headerAlt: string;
  onResolve: (n: number) => void;
  onEdit: (n: number) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children, node: _node, ...props }) => {
        if (href?.startsWith(NOTE_HREF)) {
          const n = Number(href.slice(NOTE_HREF.length));
          return (
            <NoteMark note={notes[n]} onResolve={onResolve} onEdit={onEdit}>
              {children}
            </NoteMark>
          );
        }
        const external = href ? /^https?:\/\//.test(href) : false;
        return (
          <a href={href} {...props} {...(external ? { target: "_blank", rel: "noopener" } : {})}>
            {children}
          </a>
        );
      },
      h2: ({ node, children, ...props }) => {
        const line = node?.position?.start.line;
        const entry = outline.find((o) => o.line === line);
        return (
          <h2 {...props} id={entry?.id} data-outline-id={entry?.id} className="scroll-mt-24">
            {children}
          </h2>
        );
      },
    }),
    [notes, outline, onResolve, onEdit],
  );
  return (
    <article id="sec-top" className="prose-article prose-reading mx-auto scroll-mt-24">
      {headerSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={headerSrc} alt={headerAlt} className="mb-7 block aspect-[2/1] w-full rounded-[14px] object-cover shadow-card" />
      )}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </article>
  );
}

// ── source editor ────────────────────────────────────────────────────────

export const SourceEditor = forwardRef<
  HTMLTextAreaElement,
  { value: string; onChange: (v: string) => void; className?: string }
>(function SourceEditor({ value, onChange, className }, ref) {
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      aria-label="Article markdown"
      className={cn(
        "block w-full resize-none border-0 bg-surface px-8 py-7 font-mono text-[13px] leading-[1.6] text-label outline-none placeholder:text-label-3 focus-visible:outline-none",
        className,
      )}
    />
  );
});

/** Scroll a textarea so the character at `index` sits in its upper third, and select [start, end]. */
export function revealInTextarea(ta: HTMLTextAreaElement, start: number, end: number) {
  const style = getComputedStyle(ta);
  const mirror = document.createElement("div");
  for (const p of [
    "font-family",
    "font-size",
    "line-height",
    "letter-spacing",
    "padding-top",
    "padding-left",
    "padding-right",
    "box-sizing",
    "tab-size",
  ]) {
    mirror.style.setProperty(p, style.getPropertyValue(p));
  }
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.width = `${ta.clientWidth}px`;
  mirror.textContent = ta.value.slice(0, start);
  document.body.appendChild(mirror);
  const y = mirror.scrollHeight;
  mirror.remove();
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(start, end);
  ta.scrollTop = Math.max(0, y - ta.clientHeight / 3);
  ta.scrollIntoView({ block: "nearest" });
}

// ── compare with first draft ─────────────────────────────────────────────

export function CompareView({ draft, current }: { draft: string; current: string }) {
  const [changesOnly, setChangesOnly] = useState(true);
  const diff = useMemo(() => lineDiff(draft, current), [draft, current]);
  if (!diff) {
    return (
      <div className="mx-auto max-w-[80ch]">
        <p className="mb-4 text-[13px] text-label-2">The texts are too long to compare line by line. This is the first draft as written.</p>
        <pre className="font-mono text-[12.5px] leading-[1.6] whitespace-pre-wrap text-label">{draft}</pre>
      </div>
    );
  }
  const added = diff.filter((d) => d.kind === "add").length;
  const removed = diff.filter((d) => d.kind === "del").length;

  // Collapse long unchanged runs when showing changes only.
  const rows: ({ type: "line"; i: number } | { type: "gap"; count: number; key: number })[] = [];
  const CONTEXT = 2;
  for (let i = 0; i < diff.length; ) {
    if (diff[i]!.kind !== "same" || !changesOnly) {
      rows.push({ type: "line", i });
      i++;
      continue;
    }
    let j = i;
    while (j < diff.length && diff[j]!.kind === "same") j++;
    const run = j - i;
    const head = i === 0 ? 0 : CONTEXT;
    const tail = j === diff.length ? 0 : CONTEXT;
    if (run > head + tail + 1) {
      for (let k = i; k < i + head; k++) rows.push({ type: "line", i: k });
      rows.push({ type: "gap", count: run - head - tail, key: i });
      for (let k = j - tail; k < j; k++) rows.push({ type: "line", i: k });
    } else {
      for (let k = i; k < j; k++) rows.push({ type: "line", i: k });
    }
    i = j;
  }

  return (
    <div className="mx-auto max-w-[90ch]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">Changes since the first draft</h2>
          <p className="text-[13px] text-label-2 tabular-nums">
            <span className="text-done-fg">{added} lines added</span> · <span className="text-problem-fg">{removed} removed</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="changes-only" checked={changesOnly} onCheckedChange={setChangesOnly} />
          <Label htmlFor="changes-only" className="text-[13px] font-normal text-label-2">
            Changes only
          </Label>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl font-mono text-[12.5px] leading-[1.6] shadow-[inset_0_0_0_0.5px_var(--separator-strong)]">
        {rows.map((r) => {
          if (r.type === "gap") {
            return (
              <div key={`g${r.key}`} className="bg-fill-2 px-4 py-1 font-sans text-xs text-label-2">
                {r.count} unchanged lines
              </div>
            );
          }
          const d = diff[r.i]!;
          return (
            <div
              key={r.i}
              className={cn(
                "grid grid-cols-[1.5rem_1fr] px-2 whitespace-pre-wrap",
                d.kind === "add" && "bg-done-bg",
                d.kind === "del" && "bg-problem-bg text-label-2",
              )}
            >
              <span aria-hidden className={cn("select-none", d.kind === "add" ? "text-done-fg" : d.kind === "del" ? "text-problem-fg" : "text-label-3")}>
                {d.kind === "add" ? "+" : d.kind === "del" ? "−" : ""}
              </span>
              <span className={cn("min-w-0 break-words", d.kind === "del" && "line-through decoration-problem-fg/40")}>
                <span className="sr-only">{d.kind === "add" ? "Added: " : d.kind === "del" ? "Removed: " : ""}</span>
                {d.text || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
