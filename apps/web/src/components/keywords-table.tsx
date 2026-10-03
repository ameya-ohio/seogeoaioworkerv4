"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Hash, ListPlus, Plus, Send, Star, X } from "lucide-react";
import {
  addKeyword,
  bulkKeywordAction,
  sendKeywordsToPipeline,
  type BulkAction,
  type SendResult,
} from "@/lib/actions/keywords";
import type { UiKeyword } from "@/lib/ui-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { EmptyState, KeywordStatusBadge, ProgressBar, cls, inputCls, tableCls } from "./kit";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Toasts for a send-to-pipeline result, shared with the Select tab. */
export function toastSendResult(res: SendResult, onView: () => void) {
  if (res.sent.length) {
    toast.success(`${plural(res.sent.length, "article")} queued`, {
      description: res.sent.length <= 3 ? res.sent.join(", ") : `${res.sent.slice(0, 3).join(", ")} and ${res.sent.length - 3} more`,
      action: { label: "View in Production", onClick: onView },
    });
  }
  if (res.errors.length) {
    toast.error(`${plural(res.errors.length, "keyword")} not sent`, {
      description: res.errors.map((e) => `${e.text}: ${e.message}`).join("\n"),
    });
  }
  if (!res.sent.length && !res.errors.length) toast("Nothing to send");
}

function Priority({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex text-label-3" title="No priority">
        <Star aria-label="No priority" className="size-[15px]" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-needs" title={`Priority ${value}`}>
      <Star aria-hidden className="size-[15px] fill-current" />
      <span className="sr-only">Priority</span>
      <span className="text-xs text-label-2 tabular-nums">{value}</span>
    </span>
  );
}

function Difficulty({ value }: { value: number | null }) {
  if (value === null) return <span className="text-label-3">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <ProgressBar value={value / 100} family="idle" className="h-1 w-12" />
      <span className="text-label-2 tabular-nums">{value}</span>
    </span>
  );
}

export function KeywordsTable({ rows, filtered = false }: { rows: UiKeyword[]; filtered?: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const addRef = useRef<HTMLFormElement>(null);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = !allSelected && rows.some((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clear = () => setSelected(new Set());

  // Esc clears the selection, like Finder and Photos.
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size]);

  const chosen = rows.filter((r) => selected.has(r.id));
  const hasArchived = chosen.some((r) => r.status === "archived");

  const runBulk = (action: BulkAction) => {
    const ids = [...selected];
    // Undo only when it restores the exact prior state (unarchive sets status back to idea).
    const undoable = action === "archive" && chosen.every((r) => r.status === "idea");
    startTransition(async () => {
      try {
        await bulkKeywordAction(action, ids);
        clear();
        const n = ids.length;
        if (action === "archive") {
          toast.success(`Archived ${plural(n, "keyword")}`, {
            ...(undoable
              ? {
                  action: {
                    label: "Undo",
                    onClick: () => {
                      void bulkKeywordAction("unarchive", ids).then(() => toast.success("Restored"));
                    },
                  },
                }
              : {}),
          });
        } else if (action === "unarchive") toast.success(`Restored ${plural(n, "keyword")}`);
        else if (action === "prioritize") toast.success(`Prioritized ${plural(n, "keyword")}`);
        else if (action === "queue") toast.success(`Marked ideas as queued`);
        else toast.success("Done");
      } catch {
        toast.error("That didn't work. Try again.");
      }
    });
  };

  const runSend = () =>
    startTransition(async () => {
      try {
        const res = await sendKeywordsToPipeline([...selected]);
        clear();
        toastSendResult(res, () => router.push("/production"));
      } catch {
        toast.error("Couldn't send to the pipeline. Try again.");
      }
    });

  return (
    <div className={cn("flex flex-col gap-4", selected.size > 0 && "pb-24")}>
      <form
        ref={addRef}
        action={(fd) =>
          startTransition(async () => {
            const text = String(fd.get("text") ?? "").trim();
            if (!text) return;
            try {
              await addKeyword(fd);
              addRef.current?.reset();
              toast.success(`Added "${text}"`);
            } catch {
              toast.error("Couldn't add that keyword.");
            }
          })
        }
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor="add-keyword" className="sr-only">
          New keyword
        </label>
        <input id="add-keyword" name="text" placeholder="Add a keyword or topic idea" className={cls(inputCls, "w-80 max-w-full")} />
        <label htmlFor="add-priority" className="sr-only">
          Priority (0 to 9)
        </label>
        <input id="add-priority" name="priority" placeholder="Priority" type="number" min={0} max={9} className={cls(inputCls, "w-24")} />
        <Button type="submit" variant="secondary" disabled={pending}>
          <Plus data-icon="inline-start" />
          Add
        </Button>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-surface shadow-card">
          <EmptyState
            icon={Hash}
            title={filtered ? "No keywords match" : "No keywords yet"}
            hint={
              filtered
                ? "Try another filter or search."
                : "Add ideas above, upload a CSV in Strategy, or run the topic research agent."
            }
            action={
              filtered ? undefined : (
                <Button variant="secondary" asChild>
                  <Link href="/strategy?tab=upload">Import CSV</Link>
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th scope="col" className={cls(tableCls.th, "w-10")}>
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th scope="col" className={tableCls.th}>Keyword</th>
                  <th scope="col" className={tableCls.th}>Source</th>
                  <th scope="col" className={cls(tableCls.th, "text-right")}>Volume</th>
                  <th scope="col" className={tableCls.th}>Difficulty</th>
                  <th scope="col" className={tableCls.th}>Priority</th>
                  <th scope="col" className={tableCls.th}>Status</th>
                  <th scope="col" className={tableCls.th}>Article</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const on = selected.has(row.id);
                  return (
                    <tr key={row.id} aria-selected={on} className={cn(tableCls.tr, on && "bg-primary-soft hover:bg-primary-soft")}>
                      <td className={tableCls.td}>
                        <Checkbox checked={on} onCheckedChange={() => toggle(row.id)} aria-label={`Select ${row.text}`} />
                      </td>
                      <td className={cls(tableCls.td, "font-semibold text-label")}>{row.text}</td>
                      <td className={cls(tableCls.td, "text-label-2 capitalize")}>{row.source}</td>
                      <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>
                        {row.volume !== null ? row.volume.toLocaleString() : <span className="text-label-3">—</span>}
                      </td>
                      <td className={tableCls.td}>
                        <Difficulty value={row.difficulty} />
                      </td>
                      <td className={tableCls.td}>
                        <Priority value={row.priority} />
                      </td>
                      <td className={tableCls.td}>
                        <KeywordStatusBadge status={row.status} />
                      </td>
                      <td className={cls(tableCls.td, "max-w-[220px] truncate")}>
                        {row.articleSlug ? (
                          <Link href={`/articles/${row.articleSlug}`} className="text-primary hover:underline">
                            {row.articleSlug}
                          </Link>
                        ) : (
                          <span className="text-label-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div
          role="toolbar"
          aria-label="Selection actions"
          className="fixed bottom-6 left-1/2 z-30 flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-2xl bg-raised py-1.5 pr-1.5 pl-4 shadow-pop animate-in fade-in-0 slide-in-from-bottom-4 duration-200"
        >
          <span className="mr-2 text-[13px] font-semibold whitespace-nowrap tabular-nums" aria-live="polite">
            {selected.size} selected
          </span>
          <Button onClick={runSend} disabled={pending}>
            <Send data-icon="inline-start" />
            {pending ? "Working…" : "Send to pipeline"}
          </Button>
          <Button variant="secondary" onClick={() => runBulk("prioritize")} disabled={pending}>
            <Star data-icon="inline-start" />
            Prioritize
          </Button>
          <Button variant="secondary" onClick={() => runBulk("queue")} disabled={pending}>
            <ListPlus data-icon="inline-start" />
            Mark queued
          </Button>
          <Button variant="secondary" onClick={() => runBulk("archive")} disabled={pending}>
            <Archive data-icon="inline-start" />
            Archive
          </Button>
          {hasArchived && (
            <Button variant="secondary" onClick={() => runBulk("unarchive")} disabled={pending}>
              <ArchiveRestore data-icon="inline-start" />
              Unarchive
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={clear} aria-label="Clear selection">
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}
