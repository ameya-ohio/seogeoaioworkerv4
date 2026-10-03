"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createCaseStudy, deleteAdminFile, saveAdminFile } from "@/lib/actions/admin";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Caption, inputCls } from "./kit";
import { IconTile, SettingsGroup, settingsCategory } from "./settings/settings-ui";

type Mode = "edit" | "preview" | "list";

/** Button-driven segmented control (the kit's SegmentedNav is link-driven). */
function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 rounded-[9px] bg-fill p-0.5">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(it.key)}
            className={cn(
              "inline-flex h-[26px] items-center rounded-[7px] px-3 text-[13px] whitespace-nowrap transition-colors",
              on
                ? "bg-raised font-semibold text-label shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]"
                : "font-medium text-label-2 hover:text-label",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * Settings file editor: one engine file (standards, templates, agents,
 * context). Edit/Preview, a dot while unsaved, and an AlertDialog before
 * anything is written, since these files drive the live pipeline.
 */
export function AdminEditor({
  area,
  file,
  initialContent,
  edited = false,
}: {
  area: string;
  file: string;
  initialContent: string;
  /** The current content was saved from the app (not the shipped repo file). */
  edited?: boolean;
}) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(initialContent);
  const [content, setContent] = useState(initialContent);
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"save" | "delete" | null>(null);
  const [running, setRunning] = useState<"save" | "delete" | null>(null);
  const dirty = content !== baseline;
  const deletable = area === "context";
  const name = baseName(file);
  const isMarkdown = /\.md$/i.test(file);
  const isPhraseList = area === "standards" && file === "banned-phrases.txt";
  const [mode, setMode] = useState<Mode>(isPhraseList ? "list" : "edit");
  const category = settingsCategory(area);

  const save = () => {
    setRunning("save");
    startTransition(async () => {
      const res = await saveAdminFile(area, file, content);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setBaseline(content);
      toast.success(`Saved ${name}`, { description: "The next article run uses it." });
    });
  };

  const remove = () => {
    setRunning("delete");
    startTransition(async () => {
      const res = await deleteAdminFile(area, file);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Deleted ${name}`);
      router.push(`/admin?tab=${area}`);
    });
  };

  const modes: { key: Mode; label: string }[] = isPhraseList
    ? [
        { key: "list", label: "List" },
        { key: "edit", label: "Text" },
      ]
    : [
        { key: "edit", label: "Edit" },
        { key: "preview", label: "Preview" },
      ];

  return (
    <div
      className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface shadow-card"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          if (dirty && !pending) setConfirm("save");
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b-[0.5px] border-separator py-2.5 pr-3 pl-4">
        <span className="min-w-0 truncate font-mono text-xs font-semibold" title={`${area}/${file}`}>
          {area}/{file}
        </span>
        {edited && !dirty && (
          <span className="rounded-full bg-fill px-[7px] py-px text-[11px] font-semibold text-label-2">Edited in app</span>
        )}
        {dirty && (
          <span className="inline-flex items-center gap-1.5 text-xs text-label-2">
            <span aria-hidden className="size-[7px] rounded-full bg-needs" />
            Unsaved
          </span>
        )}
        <span className="flex-1" />
        <Segmented items={modes} value={mode} onChange={setMode} label="Editor mode" />
        {deletable && (
          <Button variant="ghost" className="text-problem-fg hover:text-problem-fg" disabled={pending} onClick={() => setConfirm("delete")}>
            <Trash2 data-icon="inline-start" />
            {pending && running === "delete" ? "Deleting…" : "Delete"}
          </Button>
        )}
        {dirty && (
          <Button variant="ghost" disabled={pending} onClick={() => setContent(baseline)}>
            Discard
          </Button>
        )}
        <Button variant={dirty ? "default" : "secondary"} disabled={pending || !dirty} onClick={() => setConfirm("save")}>
          {pending && running === "save" ? "Saving…" : "Save"}
        </Button>
      </div>

      {mode === "list" && isPhraseList ? (
        <PhraseList content={content} baseline={baseline} onChange={setContent} />
      ) : mode === "preview" ? (
        <div className="min-h-[60vh] overflow-x-auto p-5">
          {isMarkdown ? (
            <div className="prose-article max-w-[72ch]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <PlainPreview file={file} content={content} />
          )}
        </div>
      ) : (
        <textarea
          aria-label={`${area}/${file}`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="h-[68vh] min-h-[320px] w-full resize-y bg-transparent px-4 py-3.5 font-mono text-xs leading-[19px] text-label focus:outline-none"
        />
      )}

      <p className="border-t-[0.5px] border-separator px-4 py-2.5 text-xs text-label-2">
        Saved changes reach the pipeline from the next article run.
      </p>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="size-auto bg-transparent">
              {confirm === "delete" ? (
                <span className="inline-flex size-10 items-center justify-center rounded-[10px] bg-problem-bg text-problem-fg">
                  <Trash2 className="size-5" />
                </span>
              ) : (
                <IconTile category={category} size="lg" />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>{confirm === "delete" ? `Delete ${name}?` : `Save changes to ${name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "Agents stop reading it from the next article run."
                : "Every article run from the next one uses this, in the web app and in terminal mode."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {confirm === "delete" ? (
              <AlertDialogAction variant="destructive" onClick={remove}>
                Delete
              </AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={save}>Save</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** .json, .txt and .yaml preview: preformatted (JSON pretty-printed when it parses). */
function PlainPreview({ file, content }: { file: string; content: string }) {
  let text = content;
  let problem: string | null = null;
  if (/\.json$/i.test(file)) {
    try {
      text = JSON.stringify(JSON.parse(content), null, 2);
    } catch (err) {
      problem = err instanceof Error ? err.message : "Invalid JSON";
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {problem && (
        <p className="rounded-lg bg-problem-bg px-3 py-2 text-[13px] text-problem-fg">This file is not valid JSON: {problem}</p>
      )}
      <pre className="font-mono text-xs leading-[19px] whitespace-pre-wrap text-label">{text}</pre>
    </div>
  );
}

// ── standards/banned-phrases.txt as a phrase list ────────────────────────

type Line = { index: number; kind: "phrase" | "comment" | "blank"; text: string };

function parseLines(content: string): Line[] {
  return content.split("\n").map((raw, index) => {
    const t = raw.trim();
    return { index, text: raw, kind: t === "" ? "blank" : t.startsWith("#") ? "comment" : "phrase" };
  });
}

/**
 * List view over the file's lines. Every edit removes or appends one line and
 * leaves the rest byte-for-byte, so comments, their positions, quoting and
 * trailing spaces survive a save unchanged.
 */
function PhraseList({ content, baseline, onChange }: { content: string; baseline: string; onChange: (next: string) => void }) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const lines = useMemo(() => parseLines(content), [content]);
  const known = useMemo(
    () => new Set(parseLines(baseline).filter((l) => l.kind === "phrase").map((l) => l.text.trim().toLowerCase())),
    [baseline],
  );
  const phrases = lines.filter((l) => l.kind === "phrase");

  // Sections: phrases between comments. The leading comment block is the
  // file's header (shown in Text mode); later comments label what follows.
  const sections: { note: string | null; items: Line[] }[] = [];
  let seenPhrase = false;
  for (const l of lines) {
    if (l.kind === "comment") {
      if (!seenPhrase) continue;
      sections.push({ note: l.text.trim().replace(/^#+\s*/, ""), items: [] });
    } else if (l.kind === "phrase") {
      seenPhrase = true;
      if (sections.length === 0) sections.push({ note: null, items: [] });
      sections[sections.length - 1]!.items.push(l);
    }
  }

  const removeLine = (index: number) => {
    const next = content.split("\n");
    next.splice(index, 1);
    onChange(next.join("\n"));
  };

  const add = () => {
    const p = draft.trim();
    if (!p) return;
    if (p.startsWith("#")) {
      setProblem("A phrase can't start with #; that marks a comment.");
      return;
    }
    if (phrases.some((l) => l.text.trim().toLowerCase() === p.toLowerCase())) {
      setProblem(`"${p}" is already on the list.`);
      return;
    }
    onChange(content === "" ? `${p}\n` : content.endsWith("\n") ? `${content}${p}\n` : `${content}\n${p}`);
    setDraft("");
    setProblem(null);
  };

  return (
    <div className="flex min-h-[60vh] flex-col gap-3.5 p-4">
      <p className="text-[13px] leading-[18px] text-label-2 text-pretty">
        The audit fails any article that contains one of these, matched case-insensitively on word boundaries. Judgment calls stay in{" "}
        <span className="font-mono text-xs">quality-bar.md</span>.
      </p>
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Add a phrase</span>
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setProblem(null);
              }}
              placeholder="Add a phrase"
              className={cn(inputCls, "w-full")}
            />
          </label>
          <Button type="submit" variant="secondary" disabled={!draft.trim()}>
            <Plus data-icon="inline-start" />
            Add
          </Button>
        </div>
        {problem && <p className="text-xs text-problem-fg">{problem}</p>}
      </form>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Caption>
          {phrases.length} phrase{phrases.length === 1 ? "" : "s"}
        </Caption>
        <span className="text-xs text-label-2">Company additions live in company.yaml</span>
      </div>
      {sections.map((s, si) => (
        <div key={si} className="flex flex-col gap-2">
          {s.note && <p className="text-xs text-label-2">{s.note}</p>}
          {s.items.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {s.items.map((l) => {
                const shown = l.text.trim();
                const added = !known.has(shown.toLowerCase());
                return (
                  <li
                    key={l.index}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-full pr-1 pl-[11px] text-[13px] shadow-[inset_0_0_0_0.5px_var(--separator)]",
                      added ? "bg-primary-soft text-primary" : "bg-fill-2 text-label",
                    )}
                  >
                    <span className="whitespace-pre">{shown}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${shown}`}
                      onClick={() => removeLine(l.index)}
                      className="inline-flex size-5 items-center justify-center rounded-full text-label-2 transition-colors hover:bg-fill hover:text-label"
                    >
                      <X className="size-3 stroke-[2.2]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// ── context: new case study ──────────────────────────────────────────────

/**
 * Case studies (context/case-studies/): real, anonymized engagements the
 * Strategist anchors an article on instead of an invented scenario.
 */
export function NewCaseStudy() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const create = () =>
    startTransition(async () => {
      const res = await createCaseStudy(title);
      if (res.error || !res.path) {
        setMessage(res.error ?? "Could not create the case study.");
        return;
      }
      setTitle("");
      setMessage(null);
      toast.success("Case study created", { description: "Fill in the template and save." });
      router.push(`/admin?tab=context&file=${encodeURIComponent(res.path)}`);
    });
  return (
    <SettingsGroup title="New case study" className="mt-3">
      <form
        className="flex flex-col gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) create();
        }}
      >
        <label>
          <span className="sr-only">Case study title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Regional health system, 14k identities"
            className={cn(inputCls, "w-full")}
          />
        </label>
        <Button type="submit" variant="secondary" disabled={pending || !title.trim()}>
          <Plus data-icon="inline-start" />
          {pending ? "Creating…" : "Create from template"}
        </Button>
        {message && <p className="text-xs text-problem-fg">{message}</p>}
        <p className="text-[11px] leading-[15px] text-label-2 text-pretty">
          Real, anonymized engagements the Strategist can anchor an article on.
        </p>
      </form>
    </SettingsGroup>
  );
}
