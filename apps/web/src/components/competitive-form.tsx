"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";
import { startScrapeRun, type ScrapeFormState } from "@/lib/actions/competitive";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { inputCls } from "./kit";
import { SettingsGroup, SettingsRow } from "./settings/settings-ui";

/** Settings › Competitors (6.2): queue a competitor blog scrape. */
export function ScrapeRunForm() {
  const [state, formAction, pending] = useActionState<ScrapeFormState, FormData>(startScrapeRun, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <SettingsGroup
        title="Scrape a competitor blog"
        footnote="Respects robots.txt. Every post is extracted and indexed by topic; the corpus feeds gap analysis in research and the cluster agent's gap map. Runs on the worker's scrape queue, and you land on the run to follow along."
      >
        <SettingsRow label="Blog index URL" htmlFor="scrape-url" stack>
          <input
            id="scrape-url"
            name="url"
            inputMode="url"
            placeholder="https://www.competitor.com/blog"
            className={cn(inputCls, "w-full font-mono text-xs")}
          />
        </SettingsRow>
        <SettingsRow label="Browser mode" htmlFor="scrape-browser" sub="For JavaScript-rendered sites like Webflow and Framer">
          <Switch id="scrape-browser" name="useBrowser" defaultChecked />
        </SettingsRow>
        <SettingsRow label="Store header images" htmlFor="scrape-images">
          <Switch id="scrape-images" name="withImages" />
        </SettingsRow>
        <SettingsRow label="Article limit" htmlFor="scrape-max" sub="Stop after this many posts">
          <input
            id="scrape-max"
            name="maxArticles"
            type="number"
            min={1}
            placeholder="All"
            className={cn(inputCls, "w-[120px] text-right tabular-nums")}
          />
        </SettingsRow>
      </SettingsGroup>
      {state.error && (
        <p role="alert" className="rounded-xl bg-problem-bg px-3.5 py-2.5 text-[13px] text-problem-fg">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <Download data-icon="inline-start" />
          {pending ? "Queuing…" : "Scrape"}
        </Button>
      </div>
    </form>
  );
}
