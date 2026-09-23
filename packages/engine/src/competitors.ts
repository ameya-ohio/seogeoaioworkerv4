import type { ScrapeDoc } from "./scrape/types.js";

/**
 * Competitor topic-index → gap-analysis digest (roadmap 6.3).
 *
 * Turns the freshest scraped corpus per competitor domain into one compact
 * markdown document that research consumers can read as evidence of what
 * competitors cover: the Researcher phase gets it materialized as
 * articles/<folder>/competitor-gaps.md, and the cluster agent's gap-map
 * stage inlines it next to the own-content inventory. The future Keyword
 * Researcher agent (4B) consumes the same digest.
 */

export interface CompetitorDigestOptions {
  /** Most-recent competitors included (one per domain). */
  maxCompetitors?: number;
  /** Top TF-IDF topics listed per competitor. */
  maxTopics?: number;
  /** Slug-pattern clusters listed per competitor. */
  maxClusters?: number;
  /** Topics that get sample post titles attached. */
  maxSampledTopics?: number;
  /** Domains that are NOT competitors (the company's own blogs). */
  excludeDomains?: string[];
}

const DEFAULTS: Required<Omit<CompetitorDigestOptions, "excludeDomains">> = {
  maxCompetitors: 5,
  maxTopics: 25,
  maxClusters: 12,
  maxSampledTopics: 8,
};

/**
 * The company's own hostnames from a parsed company.yaml snapshot
 * (company.domain + blog URLs, www.-stripped) — a scrape of the company's
 * own blog must never masquerade as competitor coverage.
 */
export function ownDomainsFromConfig(config: Record<string, unknown> | undefined): string[] {
  if (!config) return [];
  const hosts = new Set<string>();
  const norm = (h: string) => h.toLowerCase().replace(/^www\./, "");
  const domain = String(
    (config["company"] as Record<string, unknown> | undefined)?.["domain"] ?? "",
  ).trim();
  if (domain) {
    const bare = domain.replace(/^https?:\/\//, "").split("/")[0];
    if (bare) hosts.add(norm(bare));
  }
  const blog = config["blog"] as Record<string, unknown> | undefined;
  for (const key of ["base_url", "canonical_pattern"]) {
    const v = String(blog?.[key] ?? "").trim();
    if (!v.startsWith("http")) continue;
    try {
      hosts.add(norm(new URL(v.replace(/\{[^}]+\}/g, "x")).hostname));
    } catch {
      /* ignore malformed */
    }
  }
  return [...hosts];
}

/**
 * Build the digest. Returns "" when no scrape carries a topic index — the
 * callers treat an empty digest as "no competitive data yet" and skip the
 * input entirely (empty context ≠ failure).
 */
export function buildCompetitorGapDigest(
  scrapes: ScrapeDoc[],
  options?: CompetitorDigestOptions,
): string {
  const opts = { ...DEFAULTS, ...options };
  const excluded = new Set(options?.excludeDomains ?? []);
  const withIndex = scrapes
    .filter((s) => !excluded.has(s.domain))
    .filter((s) => s.topicIndex && s.topicIndex.corpus.article_count > 0)
    .slice(0, opts.maxCompetitors);
  if (withIndex.length === 0) return "";

  const lines: string[] = [
    "# Competitor content coverage (scraped corpora)",
    "",
    "Machine-generated digest of competitor blogs scraped by the competitive",
    "module. Use it for gap analysis only: name concrete topics competitors",
    "cover heavily that we do not (and the inverse — whitespace they missed),",
    "and note the formats they lean on. This file is internal evidence, NOT a",
    "citable source — never reference it or the competitor posts as citations",
    "in the article.",
    "",
  ];

  for (const scrape of withIndex) {
    const idx = scrape.topicIndex as NonNullable<ScrapeDoc["topicIndex"]>;
    const scrapedAt = (scrape.endedAt ?? scrape.updatedAt).toISOString().slice(0, 10);
    lines.push(
      `## ${scrape.domain} — ${idx.corpus.article_count} posts, ~${idx.corpus.avg_words_per_article.toLocaleString("en-US")} words/post (scraped ${scrapedAt})`,
      "",
      `Source blog: ${scrape.url}`,
      "",
    );

    const clusters = idx.slug_clusters.slice(0, opts.maxClusters);
    if (clusters.length > 0) {
      lines.push(
        `Content mix by URL pattern: ${clusters.map((c) => `${c.label} (${c.count})`).join(", ")}`,
        "",
      );
    }

    const topics = idx.top_topics.slice(0, opts.maxTopics);
    if (topics.length > 0) {
      lines.push(
        `Top topics by TF-IDF weight (term · posts covering it): ${topics
          .map((t) => `${t.term} (${t.df})`)
          .join(" · ")}`,
        "",
      );
    }

    const sampled = idx.top_topics.slice(0, opts.maxSampledTopics);
    if (sampled.length > 0) {
      lines.push("Heavily-covered topics with representative posts:");
      for (const t of sampled) {
        const samples = t.sample_articles
          .slice(0, 3)
          .map((a) => `"${(a.title || a.slug).trim()}"`)
          .join(", ");
        lines.push(`- ${t.term} — in ${t.df} posts${samples ? `, e.g. ${samples}` : ""}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
