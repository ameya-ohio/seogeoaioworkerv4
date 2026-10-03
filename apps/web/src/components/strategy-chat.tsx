"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Hash } from "lucide-react";
import { enqueueFromChat, type ChatState } from "@/lib/actions/pipeline";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Kbd } from "@/components/ui/kbd";
import { Caption, cls, inputCls } from "./kit";

const EXAMPLES = [
  "Write an article about how AI changes identity security",
  'Write an article about attack path analysis, target keyword "attack path management"',
  "Generate a blog post on non-human identity sprawl",
  "Draft a piece comparing PIEM to traditional IGA for the blog",
];

/** Spotlight-style composer: one question, one field, one button. */
export function ChatForm({ initialTopic = "" }: { initialTopic?: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ChatState, FormData>(enqueueFromChat, {});
  const [text, setText] = useState(initialTopic);
  const [skipInterview, setSkipInterview] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const lastQueued = useRef<number | null>(null);

  // Prefill from ?topic= (the ⌘K menu) when it changes.
  useEffect(() => {
    if (initialTopic) setText(initialTopic);
  }, [initialTopic]);

  useEffect(() => {
    const q = state.queued;
    if (!q || lastQueued.current === q.at) return;
    lastQueued.current = q.at;
    setText("");
    toast.success("Article queued", {
      description: `${q.topic} is starting research.`,
      action: { label: "View in Production", onClick: () => router.push("/production") },
    });
  }, [state.queued, router]);

  const fill = (example: string) => {
    setText(example);
    areaRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-8">
      <form
        ref={formRef}
        action={formAction}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!pending) formRef.current?.requestSubmit();
          }
        }}
        className="overflow-hidden rounded-2xl bg-surface shadow-pop"
      >
        <input type="hidden" name="stay" value="1" />
        <label className="flex flex-col gap-2 px-6 pt-5 pb-2">
          <span className="text-[13px] font-semibold text-label-2">What should we write about?</span>
          <textarea
            ref={areaRef}
            name="prompt"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            placeholder="How hospitals should prioritize Kerberoasting alerts"
            className="w-full resize-none border-0 bg-transparent text-[22px] leading-[30px] tracking-[-0.01em] text-label placeholder:text-label-3 focus:outline-none"
          />
        </label>
        {state.error && (
          <p role="alert" className="mx-6 mb-2 rounded-lg bg-problem-bg px-3 py-2 text-[13px] text-problem-fg">
            {state.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t-[0.5px] border-separator py-3 pr-4 pl-6">
          <div className="relative">
            <Hash aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-label-3" />
            <label htmlFor="chat-keyword" className="sr-only">
              Target keyword (optional)
            </label>
            <input id="chat-keyword" name="keyword" placeholder="Target keyword (optional)" className={cls(inputCls, "w-64 max-w-full pl-7")} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="chat-skip-interview" name="skipInterview" checked={skipInterview} onCheckedChange={setSkipInterview} />
            <Label htmlFor="chat-skip-interview" className="text-[13px] font-normal text-label-2">
              Skip the expert interview
            </Label>
          </div>
          <span className="flex-1" />
          <Button type="submit" size="lg" disabled={pending || !text.trim()}>
            {pending ? "Starting…" : "Start article"}
            <Kbd className="bg-primary-foreground/20 text-[11px] text-primary-foreground/85">⌘↵</Kbd>
          </Button>
        </div>
      </form>

      <section aria-label="Ways to ask" className="flex flex-col gap-3">
        <Caption>Ways to ask</Caption>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => fill(ex)}
              className="rounded-full px-3.5 py-1.5 text-left text-[13px] text-label-2 shadow-[inset_0_0_0_0.5px_var(--separator-strong)] transition-colors hover:bg-fill-2 hover:text-label"
            >
              {ex}
            </button>
          ))}
        </div>
        <p className="text-xs text-label-2">
          The Strategist picks a keyword when you leave it blank. A trailing <span className="font-mono">target keyword &quot;…&quot;</span> in
          the prompt is picked up too. {skipInterview ? "With the interview skipped, the run goes straight from research to the outline." : "The run stops after research for your point of view."}
        </p>
      </section>
    </div>
  );
}
