"use client";

import { useActionState } from "react";
import { enqueueFromChat, type ChatState } from "@/lib/actions/pipeline";
import { Card, buttonCls, cls, inputCls } from "./ui";

const EXAMPLES = [
  'Write an article about how AI changes identity security',
  'Write an article about attack path analysis, target keyword "attack path management"',
  "Generate a blog post on non-human identity sprawl",
  "Draft a piece comparing PIEM to traditional IGA for the blog",
];

export function ChatForm() {
  const [state, formAction, pending] = useActionState<ChatState, FormData>(enqueueFromChat, {});
  return (
    <div className="grid max-w-4xl gap-4 lg:grid-cols-[1fr_280px]">
      <Card title="Start an article">
        <form action={formAction} className="space-y-3">
          <textarea
            name="prompt"
            rows={4}
            placeholder='e.g. "Write an article about identity attack paths in hybrid AD/Entra environments"'
            className={cls(inputCls, "w-full resize-y font-normal")}
          />
          <div className="flex items-center gap-2">
            <input
              name="keyword"
              placeholder="Target keyword (optional — Strategist picks one otherwise)"
              className={cls(inputCls, "w-full")}
            />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Queues the full six-phase pipeline: research → outline → write → edit → schema → design.
            </p>
            <button type="submit" disabled={pending} className={buttonCls("primary")}>
              {pending ? "Queuing…" : "Queue article"}
            </button>
          </div>
        </form>
      </Card>
      <Card title="Ways to ask">
        <ul className="space-y-2">
          {EXAMPLES.map((ex) => (
            <li key={ex} className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              {ex}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          A trailing <span className="font-mono">target keyword "…"</span> is picked up automatically.
        </p>
      </Card>
    </div>
  );
}
