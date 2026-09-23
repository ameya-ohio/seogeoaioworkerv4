"use client";

import { useActionState } from "react";
import { startScrapeRun, type ScrapeFormState } from "@/lib/actions/competitive";
import { Card, buttonCls, cls, inputCls } from "./ui";

/** Admin › Competitive (6.2): queue a competitor blog scrape. */
export function ScrapeRunForm() {
  const [state, formAction, pending] = useActionState<ScrapeFormState, FormData>(
    startScrapeRun,
    {},
  );
  return (
    <Card title="Scrape a competitor blog">
      <form action={formAction} className="space-y-3">
        <p className="text-xs leading-relaxed text-slate-500">
          Crawls the blog (robots.txt-respecting), extracts every post, and builds a TF-IDF topic
          index. The corpus feeds gap analysis in the Researcher phase and the cluster agent&apos;s
          gap map (6.3).
        </p>
        <input
          name="url"
          placeholder='Blog index URL, e.g. "https://www.competitor.com/blog"'
          className={cls(inputCls, "w-full")}
        />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="useBrowser" defaultChecked className="accent-accent" />
            Browser mode (JS-rendered sites: Webflow, Framer…)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="withImages" className="accent-accent" />
            Also store header images
          </label>
          <label className="flex items-center gap-1.5">
            Max articles
            <input
              name="maxArticles"
              type="number"
              min={1}
              placeholder="all"
              className={cls(inputCls, "w-20")}
            />
          </label>
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Runs on the worker&apos;s scrape queue — you land on the run view to follow along.
          </p>
          <button type="submit" disabled={pending} className={buttonCls("primary")}>
            {pending ? "Queuing…" : "Scrape"}
          </button>
        </div>
      </form>
    </Card>
  );
}
