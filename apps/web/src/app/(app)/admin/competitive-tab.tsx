import Link from "next/link";
import { ObjectId } from "mongodb";
import { listScrapes, type ScrapeDoc } from "@blogagent/engine";
import { getCompany, getDb } from "@/lib/db";
import { toUiScrape, toUiScrapeEvent, type UiScrape } from "@/lib/ui-types";
import { Card, EmptyState, cls, tableCls } from "@/components/ui";
import { ClusterStatusBadge } from "@/components/cluster-ui";
import { ScrapeStageProgress } from "@/components/scrape-ui";
import { ScrapeRunForm } from "@/components/competitive-form";
import { LiveRefresh } from "@/components/live-refresh";

/**
 * Admin › Competitive (roadmap 6.2): run blogscraper against a competitor
 * URL, follow the crawl live, browse the corpus + topic index. The list and
 * detail views share the ?tab=competitive URL (&scrape=<id> opens one run).
 */
export async function CompetitiveTab({ scrapeId }: { scrapeId: string | null }) {
  const db = await getDb();
  const companyId = getCompany().companyId;

  if (scrapeId && ObjectId.isValid(scrapeId)) {
    const doc = await db.scrapes.findOne({ _id: new ObjectId(scrapeId), companyId });
    if (doc) return <ScrapeDetail doc={doc} />;
  }

  const scrapes = (await listScrapes(db, companyId)).map(toUiScrape);
  const anyActive = scrapes.some((s) => s.status === "queued" || s.status === "running");

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <ScrapeRunForm />
      </div>
      <Card
        title={`Scraped corpora (${scrapes.length})`}
        actions={anyActive ? <LiveRefresh src="/api/scrape-events" /> : undefined}
      >
        {scrapes.length === 0 ? (
          <EmptyState
            title="No competitor blogs scraped yet."
            hint="Queue one above, or backfill an existing corpus with the worker's scrape-import command."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th className={tableCls.th}>Competitor</th>
                  <th className={tableCls.th}>Status</th>
                  <th className={tableCls.th}>Stage</th>
                  <th className={tableCls.th}>Posts</th>
                  <th className={tableCls.th}>Avg words</th>
                  <th className={tableCls.th}>Topics</th>
                  <th className={tableCls.th}>Queued</th>
                  <th className={tableCls.th}></th>
                </tr>
              </thead>
              <tbody>
                {scrapes.map((s) => (
                  <ScrapeRow key={s.id} s={s} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ScrapeRow({ s }: { s: UiScrape }) {
  return (
    <tr className={tableCls.tr}>
      <td className={cls(tableCls.td, "font-medium text-slate-800")}>
        {s.domain}
        {s.imported && <span className="ml-1.5 text-xs font-normal text-slate-400">(imported)</span>}
        <div className="max-w-[26rem] truncate text-xs font-normal text-slate-400" title={s.url}>
          {s.url}
        </div>
      </td>
      <td className={tableCls.td}>
        <ClusterStatusBadge status={s.status} />
      </td>
      <td className={cls(tableCls.td, "font-mono text-xs")}>{s.stage}</td>
      <td className={cls(tableCls.td, "tabular-nums")}>{s.articleCount ?? "—"}</td>
      <td className={cls(tableCls.td, "tabular-nums")}>
        {s.avgWordsPerArticle ? s.avgWordsPerArticle.toLocaleString("en-US") : "—"}
      </td>
      <td className={cls(tableCls.td, "tabular-nums")}>{s.topicCount ?? "—"}</td>
      <td className={cls(tableCls.td, "text-xs text-slate-500")}>
        {new Date(s.queuedAt).toLocaleString()}
      </td>
      <td className={tableCls.td}>
        <Link
          href={`/admin?tab=competitive&scrape=${s.id}`}
          className="text-sm text-accent hover:underline"
        >
          open
        </Link>
      </td>
    </tr>
  );
}

async function ScrapeDetail({ doc }: { doc: ScrapeDoc }) {
  const db = await getDb();
  const s = toUiScrape(doc);
  const events = (
    await db.scrapeEvents.find({ scrapeId: doc._id }).sort({ seq: -1 }).limit(30).toArray()
  ).map(toUiScrapeEvent);
  const active = s.status === "queued" || s.status === "running";
  const idx = doc.topicIndex ?? null;
  const fileHref = (name: string) => `/api/storage/${s.storagePrefix}/${name}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">
            {s.domain}
            {s.imported && <span className="ml-2 text-xs font-normal text-slate-400">(imported corpus)</span>}
          </h2>
          <p className="text-xs text-slate-500">
            <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
              {s.url}
            </a>
            {" · "}attempt {s.attempts}/{s.maxAttempts}
            {s.useBrowser ? " · browser mode" : ""}
            {s.maxArticles ? ` · capped at ${s.maxArticles} articles` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {active && <LiveRefresh src="/api/scrape-events" />}
          <ClusterStatusBadge status={s.status} />
          <Link href="/admin?tab=competitive" className="text-sm text-accent hover:underline">
            all scrapes
          </Link>
        </div>
      </div>

      <Card title="Pipeline">
        <ScrapeStageProgress stage={s.stage} completed={s.completedStages} status={s.status} />
        {s.error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{s.error}</p>
        )}
      </Card>

      {s.articleCount !== null && (
        <Card title="Corpus">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-700">
            <span>
              <span className="font-semibold tabular-nums">{s.articleCount}</span> posts
            </span>
            <span>
              <span className="font-semibold tabular-nums">{(s.totalWords ?? 0).toLocaleString("en-US")}</span>{" "}
              words total
            </span>
            <span>
              <span className="font-semibold tabular-nums">
                {(s.avgWordsPerArticle ?? 0).toLocaleString("en-US")}
              </span>{" "}
              words/post
            </span>
            {doc.counts && (
              <span className="text-xs text-slate-500">
                crawl: {doc.counts.scrapedOk} ok · {doc.counts.scrapedPartial} partial ·{" "}
                {doc.counts.scrapedFailed} failed
              </span>
            )}
          </div>
          {s.storagePrefix && (
            <p className="mt-3 text-xs text-slate-500">
              Raw files:{" "}
              <a className="text-accent hover:underline" href={fileHref("topic_index.md")} target="_blank" rel="noreferrer">
                topic_index.md
              </a>
              {" · "}
              <a className="text-accent hover:underline" href={fileHref("topic_index.json")} target="_blank" rel="noreferrer">
                topic_index.json
              </a>
              {" · "}
              <a className="text-accent hover:underline" href={fileHref("manifest.json")} target="_blank" rel="noreferrer">
                manifest.json
              </a>
              {" — "}
              {s.storedFiles ?? 0} files stored
            </p>
          )}
        </Card>
      )}

      {idx && idx.slug_clusters.length > 0 && (
        <Card title="Content mix (URL pattern taxonomy)">
          <div className="flex flex-wrap gap-2">
            {idx.slug_clusters.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
              >
                {c.label} <span className="font-semibold tabular-nums text-slate-800">{c.count}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {idx && idx.top_topics.length > 0 && (
        <Card title={`Top topics (TF-IDF, showing ${Math.min(30, idx.top_topics.length)} of ${idx.top_topics.length})`}>
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th className={tableCls.th}>#</th>
                  <th className={tableCls.th}>Term</th>
                  <th className={tableCls.th}>Posts</th>
                  <th className={tableCls.th}>Mentions</th>
                  <th className={tableCls.th}>Sample posts</th>
                </tr>
              </thead>
              <tbody>
                {idx.top_topics.slice(0, 30).map((t, i) => (
                  <tr key={t.term} className={tableCls.tr}>
                    <td className={cls(tableCls.td, "tabular-nums text-slate-400")}>{i + 1}</td>
                    <td className={cls(tableCls.td, "font-medium text-slate-800")}>{t.term}</td>
                    <td className={cls(tableCls.td, "tabular-nums")}>{t.df}</td>
                    <td className={cls(tableCls.td, "tabular-nums")}>{t.total_count}</td>
                    <td className={cls(tableCls.td, "max-w-[30rem] truncate text-xs text-slate-500")}>
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
        </Card>
      )}

      {idx && idx.articles.length > 0 && (
        <Card title={`Posts (showing ${Math.min(60, idx.articles.length)} of ${idx.articles.length})`}>
          <div className="overflow-x-auto">
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th className={tableCls.th}>Title</th>
                  <th className={tableCls.th}>Words</th>
                  <th className={tableCls.th}>Cluster</th>
                  <th className={tableCls.th}>Top keywords</th>
                </tr>
              </thead>
              <tbody>
                {idx.articles.slice(0, 60).map((a) => (
                  <tr key={a.slug} className={tableCls.tr}>
                    <td className={cls(tableCls.td, "max-w-[24rem] font-medium text-slate-800")}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate hover:underline"
                        title={a.title || a.slug}
                      >
                        {a.title || a.slug}
                      </a>
                    </td>
                    <td className={cls(tableCls.td, "tabular-nums")}>{a.word_count.toLocaleString("en-US")}</td>
                    <td className={cls(tableCls.td, "text-xs text-slate-500")}>{a.slug_cluster}</td>
                    <td className={cls(tableCls.td, "max-w-[26rem] truncate text-xs text-slate-500")}>
                      {a.top_keywords.slice(0, 5).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!idx && active && (
        <EmptyState
          title="The scraper is working."
          hint="The topic index appears after the crawl finishes. This page refreshes live."
        />
      )}

      <Card title="Run events">
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">No events yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 text-xs">
                <span className="shrink-0 tabular-nums text-slate-400">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                <span
                  className={cls(
                    "shrink-0 font-mono",
                    e.type.includes("failed") ? "text-red-600" : "text-slate-500",
                  )}
                >
                  {e.type}
                </span>
                <span className="text-slate-600">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
