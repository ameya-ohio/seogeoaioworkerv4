import Link from "next/link";
import { ObjectId } from "mongodb";
import { listScrapes, type ScrapeDoc } from "@blogagent/engine";
import { AlertCircle, ChevronDown, ChevronRight, FileText, Globe } from "lucide-react";
import { getCompany, getDb } from "@/lib/db";
import { toUiScrape, toUiScrapeEvent, type UiScrape } from "@/lib/ui-types";
import { Caption, EmptyState, EventLog, ProgressBar, Status, StatusPill, cls, tableCls } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrapeStageProgress, scrapeStatus } from "@/components/scrape-ui";
import { ScrapeRunForm } from "@/components/competitive-form";
import { LiveRefresh } from "@/components/live-refresh";
import { SettingsTitle, settingsCategory } from "@/components/settings/settings-ui";

/**
 * Settings › Competitors (roadmap 6.2): run blogscraper against a competitor
 * URL, follow the crawl live, browse the corpus and topic index. The list and
 * detail views share the ?tab=competitive URL (&scrape=<id> opens one run).
 */

/** Loads the scrape named in the URL, if it exists for this company. */
export async function loadScrape(scrapeId: string | null): Promise<ScrapeDoc | null> {
  if (!scrapeId || !ObjectId.isValid(scrapeId)) return null;
  const db = await getDb();
  return db.scrapes.findOne({ _id: new ObjectId(scrapeId), companyId: getCompany().companyId });
}

export async function CompetitiveTab({ doc }: { doc: ScrapeDoc | null }) {
  if (doc) return <ScrapeDetail doc={doc} />;

  const db = await getDb();
  const companyId = getCompany().companyId;
  const scrapes = (await listScrapes(db, companyId)).map(toUiScrape);
  const anyActive = scrapes.some((s) => s.status === "queued" || s.status === "running");

  return (
    <div className="flex max-w-[780px] flex-col gap-[26px]">
      <SettingsTitle category={settingsCategory("competitive")} />
      <ScrapeRunForm />
      <section className="flex flex-col gap-1.5">
        <div className="flex min-h-6 items-center justify-between gap-3 px-4">
          <Caption>
            Corpora <span className="tabular-nums">{scrapes.length > 0 ? `· ${scrapes.length}` : ""}</span>
          </Caption>
          {anyActive && <LiveRefresh src="/api/scrape-events" />}
        </div>
        <div className="overflow-hidden rounded-xl bg-surface shadow-card">
          {scrapes.length === 0 ? (
            <EmptyState
              icon={Globe}
              title="No competitor blogs scraped yet"
              hint="Queue one above, or backfill an existing corpus with the worker's scrape-import command."
            />
          ) : (
            <ul>
              {scrapes.map((s) => (
                <ScrapeRow key={s.id} s={s} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function rowMeta(s: UiScrape): string {
  if (s.status === "succeeded") {
    const parts = [
      s.articleCount !== null ? `${s.articleCount.toLocaleString("en-US")} posts` : null,
      s.topicCount !== null ? `${s.topicCount} topics` : null,
      shortDate(s.endedAt ?? s.queuedAt),
    ];
    return parts.filter(Boolean).join(" · ");
  }
  if (s.status === "failed") return `Attempt ${s.attempts} of ${s.maxAttempts}`;
  if (s.status === "running") return s.attempts > 1 ? `Attempt ${s.attempts} of ${s.maxAttempts}` : `Started ${shortDate(s.queuedAt)}`;
  return `Queued ${shortDate(s.queuedAt)}`;
}

function ScrapeRow({ s }: { s: UiScrape }) {
  const st = scrapeStatus(s);
  return (
    <li className="border-b-[0.5px] border-separator last:border-0">
      <Link
        href={`/admin?tab=competitive&scrape=${s.id}`}
        className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3.5 transition-colors hover:bg-fill-2"
      >
        <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{s.domain}</span>
            {s.imported && <span className="text-[11px] font-medium text-label-2">Imported</span>}
          </span>
          <span className="truncate font-mono text-[11px] text-label-2" title={s.url}>
            {s.url}
          </span>
        </span>
        <ScrapeStageProgress stage={s.stage} completed={s.completedStages} status={s.status} />
        <span className="flex w-[190px] flex-col gap-0.5">
          <Status family={st.family} colored>
            {st.label}
          </Status>
          <span className="truncate pl-[15px] text-xs text-label-2 tabular-nums">{rowMeta(s)}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 text-label-3" />
      </Link>
    </li>
  );
}

function compact(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 1000).toLocaleString("en-US")}k` : n.toLocaleString("en-US");
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-[1_1_120px] rounded-xl bg-surface px-4 py-3.5 shadow-card">
      <div className="text-2xl leading-7 font-bold tabular-nums">{value}</div>
      <div className="text-xs text-label-2">{label}</div>
    </div>
  );
}

async function ScrapeDetail({ doc }: { doc: ScrapeDoc }) {
  const db = await getDb();
  const s = toUiScrape(doc);
  const events = (await db.scrapeEvents.find({ scrapeId: doc._id }).sort({ seq: -1 }).limit(30).toArray()).map(toUiScrapeEvent);
  const active = s.status === "queued" || s.status === "running";
  const idx = doc.topicIndex ?? null;
  const fileHref = (name: string) => `/api/storage/${s.storagePrefix}/${name}`;
  const st = scrapeStatus(s);
  const topics = idx ? idx.top_topics.slice(0, 30) : [];
  const posts = idx ? idx.articles.slice(0, 60) : [];
  const corpusSize = s.articleCount ?? idx?.corpus.article_count ?? 0;

  const facts = [
    s.useBrowser ? "Browser mode" : null,
    s.maxArticles ? `Capped at ${s.maxArticles} articles` : null,
    `Attempt ${s.attempts} of ${s.maxAttempts}`,
    s.endedAt ? `Finished ${shortDate(s.endedAt)}` : `Queued ${shortDate(s.queuedAt)}`,
  ].filter(Boolean);

  return (
    <div className="flex max-w-[860px] flex-col gap-[26px]">
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="min-w-0 flex-[1_1_300px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] leading-7 font-bold tracking-[-0.01em]">{s.domain}</h1>
            {s.imported && <StatusPill family="idle">Imported corpus</StatusPill>}
          </div>
          <p className="text-[13px] text-label-2 text-pretty">
            <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-label hover:underline">
              {s.url.replace(/^https?:\/\//, "")}
            </a>
            {facts.map((f) => ` · ${f}`)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <ScrapeStageProgress stage={s.stage} completed={s.completedStages} status={s.status} />
          <Status family={st.family} colored>
            {st.label}
          </Status>
        </div>
      </div>

      {s.error && (
        <div role="alert" className="flex gap-2.5 rounded-xl bg-problem-bg px-4 py-3 text-[13px] text-problem-fg">
          <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
          <p className="min-w-0 break-words whitespace-pre-wrap">{s.error}</p>
        </div>
      )}

      {s.articleCount !== null && (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-3">
            <StatTile value={s.articleCount.toLocaleString("en-US")} label="Posts" />
            <StatTile value={compact(s.totalWords ?? 0)} label="Words" />
            <StatTile value={(s.avgWordsPerArticle ?? 0).toLocaleString("en-US")} label="Words a post" />
            <StatTile value={s.topicCount !== null ? String(s.topicCount) : "–"} label="Topics" />
          </div>
          {doc.counts && (
            <p className="px-1 text-xs text-label-2 tabular-nums">
              Crawl: {doc.counts.scrapedOk} ok, {doc.counts.scrapedPartial} partial, {doc.counts.scrapedFailed} failed
            </p>
          )}
        </section>
      )}

      {idx && idx.slug_clusters.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <Caption className="px-1">Content mix by URL pattern</Caption>
          <ul className="flex flex-wrap gap-2">
            {idx.slug_clusters.map((c) => (
              <li key={c.label} className="inline-flex h-7 items-center gap-2 rounded-full bg-fill-2 px-3 text-xs">
                {c.label}
                <span className="font-semibold tabular-nums">{c.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {topics.length > 0 && idx && (
        <section className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
            <Caption>Top topics</Caption>
            <span className="text-xs text-label-2">
              {topics.length} of {idx.top_topics.length} · ranked by TF-IDF
            </span>
          </div>
          <div className="overflow-hidden rounded-xl bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={cls(tableCls.th, "w-8")}>#</th>
                    <th className={tableCls.th}>Term</th>
                    <th className={cls(tableCls.th, "w-[34%]")}>Posts using it</th>
                    <th className={cls(tableCls.th, "text-right")}>Mentions</th>
                    <th className={tableCls.th}>Sample posts</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map((t, i) => (
                    <tr key={t.term} className={tableCls.tr}>
                      <td className={cls(tableCls.td, "text-label-2 tabular-nums")}>{i + 1}</td>
                      <td className={cls(tableCls.td, "font-semibold whitespace-nowrap")}>{t.term}</td>
                      <td className={tableCls.td}>
                        <span className="flex items-center gap-2.5">
                          <ProgressBar value={corpusSize > 0 ? t.df / corpusSize : 0} className="h-[5px] flex-1" />
                          <span className="w-8 text-label-2 tabular-nums">{t.df}</span>
                        </span>
                      </td>
                      <td className={cls(tableCls.td, "text-right text-label-2 tabular-nums")}>{t.total_count}</td>
                      <td className={cls(tableCls.td, "max-w-[18rem] truncate text-xs text-label-2")}>
                        {t.sample_articles
                          .slice(0, 3)
                          .map((a) => a.title || a.slug)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {(s.storagePrefix || posts.length > 0) && (
        <Collapsible className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {s.storagePrefix && (
              <>
                <span className="text-xs text-label-2">Raw files</span>
                {["topic_index.md", "topic_index.json", "manifest.json"].map((f) => (
                  <a
                    key={f}
                    href={fileHref(f)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-xs text-primary hover:underline"
                  >
                    <FileText aria-hidden className="size-3.5" />
                    {f}
                  </a>
                ))}
                <span className="text-xs text-label-2 tabular-nums">{s.storedFiles ?? 0} files stored</span>
              </>
            )}
            <span className="flex-1" />
            {posts.length > 0 && idx && (
              <CollapsibleTrigger asChild>
                <Button variant="secondary" className="group">
                  Browse {idx.articles.length.toLocaleString("en-US")} posts
                  <ChevronDown data-icon="inline-end" className="transition-transform group-data-[state=open]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
          {posts.length > 0 && idx && (
            <CollapsibleContent>
              <div className="overflow-hidden rounded-xl bg-surface shadow-card">
                <div className="overflow-x-auto">
                  <table className={tableCls.table}>
                    <thead>
                      <tr>
                        <th className={tableCls.th}>Title</th>
                        <th className={cls(tableCls.th, "text-right")}>Words</th>
                        <th className={tableCls.th}>Cluster</th>
                        <th className={tableCls.th}>Top keywords</th>
                      </tr>
                    </thead>
                    <tbody>
                      {posts.map((a) => (
                        <tr key={a.slug} className={tableCls.tr}>
                          <td className={cls(tableCls.td, "max-w-[22rem] font-medium")}>
                            <a href={a.url} target="_blank" rel="noreferrer" className="block truncate hover:underline" title={a.title || a.slug}>
                              {a.title || a.slug}
                            </a>
                          </td>
                          <td className={cls(tableCls.td, "text-right tabular-nums")}>{a.word_count.toLocaleString("en-US")}</td>
                          <td className={cls(tableCls.td, "text-xs text-label-2")}>{a.slug_cluster}</td>
                          <td className={cls(tableCls.td, "max-w-[20rem] truncate text-xs text-label-2")}>{a.top_keywords.slice(0, 5).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {idx.articles.length > posts.length && (
                  <p className="border-t-[0.5px] border-separator px-3.5 py-2.5 text-xs text-label-2">
                    Showing {posts.length} of {idx.articles.length.toLocaleString("en-US")}.
                  </p>
                )}
              </div>
            </CollapsibleContent>
          )}
        </Collapsible>
      )}

      {!idx && active && (
        <div className="rounded-xl bg-surface shadow-card">
          <EmptyState
            icon={Globe}
            title="The scraper is working"
            hint="The topic index appears after the crawl finishes. This page updates live."
          />
        </div>
      )}

      <section className="flex flex-col gap-1.5">
        <Caption className="px-1">Run events</Caption>
        <div className="overflow-hidden rounded-xl bg-surface shadow-card">
          <EventLog events={events} empty="No events yet." />
        </div>
      </section>
    </div>
  );
}
