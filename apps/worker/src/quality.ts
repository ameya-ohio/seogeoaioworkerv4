import {
  buildCitationReport,
  buildLinkReport,
  extractExternalUrls,
  extractInternalLinks,
  extractJson,
  parseResearchCitations,
  type CitationCheckResult,
  type CitationReport,
  type CitationSource,
  type EngineDb,
  type LinkCheckResult,
  type LinkReport,
} from "@blogagent/engine";
import type { LlmClient } from "./llm.js";

/**
 * Truth-layer code steps (roadmap 4Q.3/4Q.4, decisions D34/D35). Injectable
 * so pipeline tests run with fakes and zero network/API spend — the same
 * pattern as AgentInvoker.
 */

export interface CitationVerifier {
  /** Research gate: verify every attributed claim at its live source URL. */
  verifyResearch(researchNotes: string): Promise<CitationReport>;
  /**
   * Edit gate: every external URL cited in the body must be a source that
   * survived research-stage verification. Deterministic — no fetching.
   */
  verifyArticleBody(body: string, research: CitationReport | undefined): CitationReport;
}

export interface LinkChecker {
  check(body: string): Promise<LinkReport>;
}

/**
 * The reader-visible prose of an article.md: frontmatter, the json-ld fence,
 * and HTML comments stripped. Both body checks (D34 citations, D35 links)
 * must run on this — frontmatter carries the article's own canonical_url,
 * which is never a link and can't resolve before the article is published.
 */
export function articleProse(md: string): string {
  return md
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(/```json-ld[\s\S]*?```/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

const FETCH_TIMEOUT_MS = 15_000;
const PAGE_TEXT_CAP = 25_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; BlogAgentCitationCheck/1.0; +https://github.com/blogagent)";

/** Crude but dependency-free HTML → text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;|&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type PageFetcher = (url: string) => Promise<{ ok: boolean; text?: string; note?: string }>;

export const defaultPageFetcher: PageFetcher = async (url) => {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, note: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/|html|xml|json/.test(type)) {
      return { ok: false, note: `non-text content (${type.split(";")[0]}) — cite an HTML page that states the claim` };
    }
    const body = await res.text();
    return { ok: true, text: htmlToText(body).slice(0, PAGE_TEXT_CAP) };
  } catch (err) {
    return { ok: false, note: err instanceof Error ? err.message.slice(0, 120) : "fetch failed" };
  }
};

export class LiveCitationVerifier implements CitationVerifier {
  constructor(
    private readonly llm: LlmClient,
    private readonly model: string,
    private readonly internalHosts: string[],
    private readonly fetchPage: PageFetcher = defaultPageFetcher,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  async verifyResearch(researchNotes: string): Promise<CitationReport> {
    const parsed = parseResearchCitations(researchNotes);
    const results: CitationCheckResult[] = [];
    const claimsBySource = new Map<number, { text: string; kind: CitationCheckResult["kind"] }[]>();
    for (const c of parsed.claims) {
      const list = claimsBySource.get(c.sourceN) ?? [];
      list.push({ text: c.text, kind: c.kind });
      claimsBySource.set(c.sourceN, list);
    }

    for (const source of parsed.sources) {
      if (!source.url) continue;
      const claims = claimsBySource.get(source.n) ?? [];
      const page = await this.fetchPage(source.url);
      if (!page.ok || !page.text) {
        // Unreachable: every attributed claim is unusable (D34).
        const note = page.note ?? "fetch failed";
        if (claims.length === 0) {
          results.push({ sourceN: source.n, url: source.url, claim: "(reachability)", kind: "key_claim", verdict: "unreachable", note });
        }
        for (const claim of claims) {
          results.push({ sourceN: source.n, url: source.url, claim: claim.text, kind: claim.kind, verdict: "unreachable", note });
        }
        continue;
      }
      if (claims.length === 0) {
        results.push({ sourceN: source.n, url: source.url, claim: "(reachability)", kind: "key_claim", verdict: "supported", note: "reachable; no specific claim attributed" });
        continue;
      }
      const verdicts = await this.judgeClaims(source, page.text, claims.map((c) => c.text));
      claims.forEach((claim, i) => {
        const v = verdicts[i];
        results.push({
          sourceN: source.n,
          url: source.url,
          claim: claim.text,
          kind: claim.kind,
          verdict: v?.supported ? "supported" : "unsupported",
          ...(v?.quote ? { quote: v.quote } : {}),
          ...(v?.supported ? {} : { note: v?.note ?? "claim not found on page" }),
        });
      });
      this.log(`[citations] ${source.url}: ${verdicts.filter((v) => v?.supported).length}/${claims.length} supported`);
    }
    return buildCitationReport(parsed.sources, results);
  }

  /**
   * Hosts whose links are identity/entity PLUMBING, not evidence citations:
   * author bio (GEO requires it), social sameAs, Wikipedia/Wikidata entity
   * links. The first live 4Q edit gate flagged the author's LinkedIn bio as
   * an "unverified source" — plumbing must never need research verification.
   * Factual citations to these hosts still get caught by the Editor's
   * trace-to-research rule.
   */
  private static readonly PLUMBING_HOSTS = [
    "linkedin.com",
    "twitter.com",
    "x.com",
    "wikipedia.org",
    "wikidata.org",
    "schema.org",
  ];

  verifyArticleBody(body: string, research: CitationReport | undefined): CitationReport {
    const verified = new Set(research?.verifiedUrls ?? []);
    const normalize = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
    const verifiedNorm = new Set([...verified].map(normalize));
    const urls = extractExternalUrls(articleProse(body), this.internalHosts).filter((u) => {
      try {
        const host = new URL(u).hostname.replace(/^www\./, "");
        return !LiveCitationVerifier.PLUMBING_HOSTS.some(
          (p) => host === p || host.endsWith(`.${p}`),
        );
      } catch {
        return true;
      }
    });
    const results: CitationCheckResult[] = urls.map((url) => {
      const ok = verifiedNorm.has(normalize(url));
      return {
        sourceN: 0,
        url,
        claim: "(body citation)",
        kind: "statistic" as const,
        verdict: ok ? ("supported" as const) : ("unsupported" as const),
        ...(ok ? {} : { note: "URL is not a research-verified source — every body citation must trace to verified research (D34)" }),
      };
    });
    return {
      ranAt: new Date(),
      results,
      verifiedSourceCount: research?.verifiedSourceCount ?? 0,
      verifiedUrls: research?.verifiedUrls ?? [],
      unsupportedCount: results.filter((r) => r.verdict === "unsupported").length,
      unreachableCount: 0,
    };
  }

  /**
   * Accept the judge's verdict array in any reasonable wrapping — a bare
   * array, or the first array-valued property of an object. The first live
   * 4Q run lost two true claims to "verifier returned no verdict" because
   * this only accepted a bare array.
   */
  private static verdictList(root: unknown): unknown[] | null {
    if (Array.isArray(root)) return root;
    if (root && typeof root === "object") {
      for (const v of Object.values(root as Record<string, unknown>)) {
        if (Array.isArray(v)) return v;
      }
    }
    return null;
  }

  /** One cheap-tier call per source judging all its claims against the page. */
  private async judgeClaims(
    source: CitationSource,
    pageText: string,
    claims: string[],
  ): Promise<{ supported: boolean; quote?: string; note?: string }[]> {
    let list = await this.judgeOnce(source, pageText, claims);
    if (!list) {
      // One retry — a parse miss must not fail the researcher's claims.
      list = await this.judgeOnce(source, pageText, claims, true);
    }
    return claims.map((_, i) => {
      const entry = (list ?? []).find(
        (e) => e && typeof e === "object" && (e as Record<string, unknown>)["index"] === i,
      ) as Record<string, unknown> | undefined;
      if (!entry) return { supported: false, note: "verifier could not parse judge response after retry" };
      const quote = typeof entry["quote"] === "string" ? (entry["quote"] as string).slice(0, 300) : undefined;
      const note = typeof entry["note"] === "string" ? (entry["note"] as string).slice(0, 200) : undefined;
      return {
        supported: entry["supported"] === true,
        ...(quote ? { quote } : {}),
        ...(note ? { note } : {}),
      };
    });
  }

  private async judgeOnce(
    source: CitationSource,
    pageText: string,
    claims: string[],
    strict = false,
  ): Promise<unknown[] | null> {
    const res = await this.llm.complete({
      model: this.model,
      prompt: [
        `You are verifying citations. Below is the visible text of a web page,`,
        `followed by claims that were attributed to this page.`,
        ``,
        `PAGE (${source.url}):`,
        pageText,
        ``,
        `CLAIMS:`,
        ...claims.map((c, i) => `${i}: ${c}`),
        ``,
        `For each claim, decide whether THIS PAGE actually states or directly`,
        `supports it. Specific numbers must appear on the page (allow rounding`,
        `and formatting differences). General claims must be clearly made by the`,
        `page's text. If the page merely relates to the topic but does not state`,
        `the claim, it is NOT supported.`,
        ``,
        `Respond with JSON only — a BARE ARRAY, no wrapper object${strict ? ", no prose, no code fences" : ""}:`,
        `[{"index": 0, "supported": true, "quote": "verbatim supporting sentence"} ,`,
        ` {"index": 1, "supported": false, "note": "why not"}]`,
      ].join("\n"),
      maxTokens: 2000,
    });
    const list = LiveCitationVerifier.verdictList(extractJson(res.text));
    if (!list || list.length === 0) {
      this.log(`[citations] judge response unparseable for ${source.url} (${res.text.length} chars)${strict ? " — retry also failed" : ", retrying"}`);
      return null;
    }
    return list;
  }
}

/**
 * D35: internal links resolve against the articles collection (published
 * HubSpot URL or slug) or a live HTTP check for non-blog site pages.
 */
export class LiveLinkChecker implements LinkChecker {
  constructor(
    private readonly db: EngineDb,
    private readonly companyId: string,
    private readonly internalHosts: string[],
    private readonly fetchPage: PageFetcher = defaultPageFetcher,
  ) {}

  async check(body: string): Promise<LinkReport> {
    const urls = extractInternalLinks(articleProse(body), this.internalHosts);
    const results: LinkCheckResult[] = [];
    for (const url of urls) {
      const slug = url.split("/").filter(Boolean).pop() ?? "";
      const known = await this.db.articles.findOne({
        companyId: this.companyId,
        $or: [{ "hubspot.url": url }, { slug, stage: "published" }],
      });
      if (known) {
        results.push({ url, status: "ok", note: "resolves to a published article" });
        continue;
      }
      const draft = await this.db.articles.findOne({ companyId: this.companyId, slug });
      if (draft) {
        results.push({
          url,
          status: "missing",
          note: `article "${slug}" exists but is not published (stage: ${draft.stage}) — pending link`,
        });
        continue;
      }
      const live = await this.fetchPage(url);
      results.push(
        live.ok
          ? { url, status: "ok", note: "live page" }
          : { url, status: "missing", note: live.note ?? "not found" },
      );
    }
    return buildLinkReport(results);
  }
}
