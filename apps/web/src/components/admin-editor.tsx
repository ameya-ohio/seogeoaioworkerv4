"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCaseStudy, deleteAdminFile, saveAdminFile } from "@/lib/actions/admin";
import { buttonCls, inputCls } from "./ui";

/** Admin file editor (3.9) with a save-guard: explicit confirm before writing. */
export function AdminEditor({
  area,
  file,
  initialContent,
}: {
  area: string;
  file: string;
  initialContent: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = content !== initialContent;
  const deletable = area === "context";

  const remove = () => {
    if (!window.confirm(`Delete ${area}/${file}?\n\nAgents stop reading it from the next run.`)) return;
    startTransition(async () => {
      const res = await deleteAdminFile(area, file);
      if (res.error) setMessage(res.error);
      else router.push(`/admin?tab=${area}`);
    });
  };

  const save = () => {
    if (
      !window.confirm(
        `Overwrite ${area}/${file}?\n\nThis file drives the live pipeline (web and terminal mode alike).`,
      )
    )
      return;
    startTransition(async () => {
      const res = await saveAdminFile(area, file, content);
      setMessage(res.error ? res.error : "Saved.");
    });
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {area}/{file} {dirty && <span className="text-amber-600">· unsaved</span>}
        </p>
        <button onClick={save} disabled={pending || !dirty} className={buttonCls("primary")}>
          {pending ? "Saving…" : "Save"}
        </button>
        {dirty && (
          <button
            onClick={() => {
              setContent(initialContent);
              setMessage(null);
            }}
            disabled={pending}
            className={buttonCls("ghost")}
          >
            Discard
          </button>
        )}
        {deletable && (
          <button onClick={remove} disabled={pending} className={buttonCls("ghost")}>
            Delete
          </button>
        )}
        {message && <span className="text-sm text-slate-600">{message}</span>}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        className="h-[70vh] w-full resize-y rounded-lg border border-slate-300 bg-white p-4 font-mono text-xs leading-relaxed text-slate-800 focus:border-accent focus:outline-none"
      />
    </div>
  );
}

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
      router.push(`/admin?tab=context&file=${encodeURIComponent(res.path)}`);
    });
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">New case study</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Regional health system, 14k identities"
        className={inputCls}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) create();
        }}
      />
      <button onClick={create} disabled={pending || !title.trim()} className={buttonCls("primary")}>
        {pending ? "Creating…" : "Create from template"}
      </button>
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}
