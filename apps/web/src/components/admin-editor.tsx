"use client";

import { useState, useTransition } from "react";
import { saveAdminFile } from "@/lib/actions/admin";
import { buttonCls } from "./ui";

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
  const [content, setContent] = useState(initialContent);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = content !== initialContent;

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
