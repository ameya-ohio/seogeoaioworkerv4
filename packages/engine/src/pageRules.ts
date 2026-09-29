import {
  GENERIC_FORMAT_SLUG,
  faqRangeFor,
  formatBySlug,
  isRoutingRole,
  lengthBandForFormat,
  resolveFormat,
  schemaTypesForFormat,
  takeawaysFor,
  type FaqRange,
  type FormatRegistry,
  type FormatSpec,
  type Range,
} from "./formats.js";
import { PAGE_ROLES, SEARCH_INTENTS, FUNNEL_STAGES, type FunnelStage } from "./plan/types.js";
import type { ArticleFacets } from "./types.js";

/**
 * What an article's facets resolve to (D45–D50), computed once per run and
 * shared by every consumer: the page.md every phase reads, the gates, and
 * the frontmatter stamp. Keeping this in one place is what stops the outline
 * gate, the audit and the Writer from disagreeing about a page's FAQ range.
 */

export interface FunnelCta {
  label: string;
  url: string;
  /** One line on what the reader gets — for the Writer, not the page. */
  blurb?: string;
}

export type CtaSettings = Partial<Record<FunnelStage, FunnelCta>>;

/** Settings doc key for the per-funnel CTAs (D50). */
export const CTA_SETTINGS_KEY = "cta.byFunnel";

export interface PageRules {
  /** Absent until the plan, a brief, the Strategist or an operator sets them. */
  facets?: ArticleFacets;
  format: FormatSpec;
  faq: FaqRange;
  takeaways: Range;
  lengthBand: Range;
  schemaTypes: string[];
  routing: boolean;
  /** This page's closing CTA, from the funnel (D50). */
  cta?: FunnelCta;
  /** The other funnels' CTA URLs — never the close on this page. */
  otherCtaUrls: string[];
  path?: string;
  canonicalUrl?: string;
}

export function resolvePageRules(
  reg: FormatRegistry,
  facets: ArticleFacets | undefined,
  opts: { ctas?: CtaSettings; path?: string; canonicalUrl?: string } = {},
): PageRules {
  const format = formatBySlug(reg, facets?.articleType ?? GENERIC_FORMAT_SLUG);
  const role = facets?.pageRole ?? "cluster";
  const funnel = facets?.funnel ?? format.defaultFunnel;
  const ctas = opts.ctas ?? {};
  const cta = facets ? ctas[funnel] : undefined;
  const rules: PageRules = {
    format,
    faq: faqRangeFor(reg, format, role, funnel),
    takeaways: takeawaysFor(reg, format),
    lengthBand: lengthBandForFormat(reg, format, role),
    schemaTypes: schemaTypesForFormat(reg, format, role, funnel),
    routing: isRoutingRole(reg, role),
    otherCtaUrls: FUNNEL_STAGES.filter((f) => f !== funnel)
      .map((f) => ctas[f]?.url)
      .filter((u): u is string => Boolean(u) && u !== cta?.url),
  };
  if (facets) rules.facets = facets;
  if (cta) rules.cta = cta;
  if (opts.path) rules.path = opts.path;
  if (opts.canonicalUrl) rules.canonicalUrl = opts.canonicalUrl;
  return rules;
}

// ── the Strategist's ## Page Facets section (runs without a plan item) ────

function sectionBody(text: string, title: string): string {
  const re = new RegExp(`^##\\s+${title}\\s*$`, "im");
  const m = re.exec(text);
  if (!m) return "";
  const rest = text.slice(m.index + m[0].length);
  const next = /^##\s+\S/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function field(body: string, name: string): string {
  const m = new RegExp(`^\\s*[-*]\\s*\\**${name}\\**\\s*:\\s*(.+)$`, "im").exec(body);
  return (m?.[1] ?? "").replace(/[`*[\]]/g, "").trim();
}

/**
 * Parse `## Page Facets` from an outline:
 *   - Page role: cluster
 *   - Article type: Comparison (Concept)
 *   - Search intent: informational
 *   - Funnel: MOFU
 */
export function parseOutlineFacets(
  outline: string,
  reg: FormatRegistry,
): { facets?: ArticleFacets; problems: string[] } {
  const body = sectionBody(outline, "Page Facets");
  if (!body.trim()) return { problems: ["Missing `## Page Facets` (page role, article type, search intent, funnel)"] };
  const problems: string[] = [];
  const role = field(body, "Page role").toLowerCase().split(/\s/)[0] ?? "";
  const typeRaw = field(body, "Article type");
  const intent = field(body, "Search intent").toLowerCase().split(/\s/)[0] ?? "";
  const funnel = field(body, "Funnel").toLowerCase().split(/\s/)[0] ?? "";
  if (!(PAGE_ROLES as readonly string[]).includes(role)) problems.push(`Page Facets: page role "${role}" is not pillar/hub/cluster`);
  const format = resolveFormat(reg, typeRaw);
  if (!format) problems.push(`Page Facets: article type "${typeRaw}" is not in standards/formats.json`);
  if (!(SEARCH_INTENTS as readonly string[]).includes(intent)) problems.push(`Page Facets: search intent "${intent}" is not informational/commercial/transactional/navigational`);
  if (!(FUNNEL_STAGES as readonly string[]).includes(funnel)) problems.push(`Page Facets: funnel "${funnel}" is not TOFU/MOFU/BOFU`);
  if (problems.length > 0 || !format) return { problems };
  return {
    facets: {
      pageRole: role as ArticleFacets["pageRole"],
      articleType: format.slug,
      searchIntent: intent as ArticleFacets["searchIntent"],
      funnel: funnel as ArticleFacets["funnel"],
      source: "strategist",
    },
    problems,
  };
}

// ── page.md: what every phase reads ───────────────────────────────────────

const SAPORO_WEIGHT: Record<FunnelStage, string> = {
  tofu: "one company section of about 100 words, after the value is delivered, linking the TOFU CTA",
  mofu: "the company can be the worked example (a case study fits here); one section, after the value is delivered",
  bofu: "the company is the subject; proof, deployment and the demo CTA carry the close",
};

function faqLine(faq: FaqRange): string {
  if (faq.max === 0) return "none — this format carries no FAQ block; omit `## Frequently Asked Questions`";
  return (
    `${faq.min}–${faq.max} questions${faq.optional ? " (or none, when nothing is left for a follow-up)" : ""}; ` +
    `each answer 40–60 words with the direct answer first; never repeat an H2; ` +
    `a question that is another page's target query gets a brief answer and a pointer there`
  );
}

/** Render page.md: the facets, the rules they resolve to, and the format's guide. */
export function renderPageSpec(rules: PageRules, formatGuide: string): string {
  const f = rules.facets;
  const lines: string[] = [`# Page spec`, ``];
  if (!f) {
    lines.push(
      `> This page has no facets yet. The Strategist must set them in the outline's`,
      `> \`## Page Facets\` section (page role, article type from standards/formats.json,`,
      `> search intent, funnel). Until then the generic format applies.`,
      ``,
    );
  } else {
    lines.push(
      `- **Page role:** ${f.pageRole}${rules.routing ? " — ROUTING page: link down to every child; the format sets only the framing and intro (D47)" : f.pageRole === "pillar" ? " — PILLAR GUIDE: a complete guide; each sub-theme answered, then linked down (D47)" : ""}`,
      `- **Article type:** ${rules.format.label} (\`${rules.format.slug}\`)`,
      `- **Search intent:** ${f.searchIntent}`,
      `- **Funnel:** ${f.funnel.toUpperCase()}`,
    );
  }
  if (rules.path) lines.push(`- **Path:** ${rules.path}`);
  if (rules.canonicalUrl) lines.push(`- **Canonical URL:** ${rules.canonicalUrl} (stamped by the worker — do not change it)`);
  lines.push(
    ``,
    `## Rules for this page`,
    ``,
    `- **Length band:** ${rules.lengthBand.min}–${rules.lengthBand.max} words`,
    `- **Key Takeaways:** ${rules.takeaways.min === rules.takeaways.max ? `exactly ${rules.takeaways.min}` : `${rules.takeaways.min}–${rules.takeaways.max}`} bullets`,
    `- **FAQ:** ${faqLine(rules.faq)}`,
    `- **Schema types:** ${rules.schemaTypes.join(", ")}`,
    `- **H2s:** declarative, never questions (D33) — the FAQ block is the only place questions are headings`,
  );
  if (f) lines.push(`- **Company presence (${f.funnel.toUpperCase()}):** ${SAPORO_WEIGHT[f.funnel]}`);
  if (rules.cta) {
    lines.push(
      `- **Closing CTA:** ${rules.cta.label} — ${rules.cta.url}${rules.cta.blurb ? ` (${rules.cta.blurb})` : ""}. The closing section must link this URL; no other funnel's CTA is the close.`,
    );
  }
  if (rules.format.competitorMode === "vendor") {
    lines.push(
      `- **Competitors:** vendor format (D51) — vendors may be named in the intro, answer block and entries; a competitor's own public docs may source claims about that competitor only; never Review/AggregateRating schema on a competitor${rules.format.signoff ? "; this page needs human sign-off before export" : ""}.`,
    );
  }
  lines.push(``, `## Format guide: ${rules.format.label}`, ``, formatGuide.trim(), ``);
  return lines.join("\n");
}

// ── frontmatter stamping ──────────────────────────────────────────────────

function yamlValue(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Set frontmatter keys in place without reformatting the rest of the block:
 * an existing `key:` line is replaced, a missing key is appended before the
 * closing `---`. A document with no frontmatter is returned unchanged.
 */
export function stampFrontmatter(markdown: string, fields: Record<string, string>): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(markdown);
  if (!m) return markdown;
  let block = m[1] ?? "";
  for (const [key, value] of Object.entries(fields)) {
    const line = `${key}: ${yamlValue(value)}`;
    const re = new RegExp(`^${key}:.*$`, "m");
    block = re.test(block) ? block.replace(re, line) : `${block}\n${line}`;
  }
  return `---\n${block}\n---${m[2] ?? "\n"}${markdown.slice(m[0].length)}`;
}

/** The frontmatter keys the worker owns (D45–D46): facets + canonical URL. */
export function facetFrontmatter(rules: PageRules): Record<string, string> {
  const out: Record<string, string> = {};
  if (rules.facets) {
    out["page_role"] = rules.facets.pageRole;
    out["search_intent"] = rules.facets.searchIntent;
    out["article_type"] = rules.facets.articleType;
    out["funnel"] = rules.facets.funnel;
  }
  if (rules.canonicalUrl) out["canonical_url"] = rules.canonicalUrl;
  return out;
}
