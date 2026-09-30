import { cfgGet, type CompanyConfig } from "../companyConfig.js";
import { cleanBody, parseArticle } from "../frontmatter.js";
import { buildHeadHtml, renderPostBody } from "../publish/render.js";
import { zip } from "../plan/zip.js";
import type { ArticleDoc } from "../types.js";

/**
 * Framer export (D52). Saporo's site runs on Framer, so instead of pushing
 * to a CMS the Review screen downloads a paste-ready bundle:
 *
 *   body.html   semantic HTML for the page body (no H1 — Framer renders the title)
 *   page.md     the same body as clean markdown
 *   head.html   title, description, canonical, Open Graph + the JSON-LD @graph
 *   meta.json   the fields to fill in Framer, facets and path included
 *   header.png  the 1200×600 hero, when the article has one
 *   README.md   where it goes, and the sibling links to add once they're live
 */

export class ExportRefusedError extends Error {}

export interface FramerBundle {
  filename: string;
  zip: Buffer;
  files: string[];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function framerExportProblems(article: ArticleDoc, opts: { signoffRequired: boolean }): string[] {
  const problems: string[] = [];
  if (!["review", "approved", "published"].includes(article.stage)) {
    problems.push(`Only an article in review can be exported (stage: ${article.stage}).`);
  }
  if (!article.artifacts.article) problems.push("The article has no article.md yet.");
  if (opts.signoffRequired && !article.signoff) {
    problems.push("This format needs a human sign-off before export (D51) — sign it off in Review first.");
  }
  return problems;
}

export function buildFramerBundle(
  article: ArticleDoc,
  company: CompanyConfig,
  opts: {
    headerPng?: Buffer;
    signoffRequired?: boolean;
    /** D53: internal links whose page isn't live yet — rendered as their anchor text. */
    deferredLinks?: { url: string; anchor?: string }[];
  } = {},
): FramerBundle {
  const problems = framerExportProblems(article, { signoffRequired: opts.signoffRequired === true });
  if (problems.length) throw new ExportRefusedError(problems.join(" "));
  const deferred = opts.deferredLinks ?? [];
  const deferredUrls = new Set(deferred.map((d) => d.url.replace(/\/+$/, "")));
  // A link to a page that isn't live would 404 on the site: keep the anchor
  // text in the sentence, drop the hyperlink, and list it in the README.
  const md = (article.artifacts.article as string).replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (m, anchor: string, url: string) => (deferredUrls.has(url.replace(/\/+$/, "")) ? anchor : m),
  );
  const { frontmatter, body } = parseArticle(md);
  const fm = (k: string) => String(frontmatter[k] ?? "").trim();
  const base = String(cfgGet(company, "site.base_url", cfgGet(company, "company.url", "")) ?? "").replace(/\/+$/, "");
  const canonical = fm("canonical_url") || article.canonicalUrl || (article.path && base ? `${base}${article.path}` : "");
  const title = fm("title") || article.topic;
  const description = fm("meta_description");

  const meta = {
    title,
    html_title: fm("html_title") || title,
    meta_description: description,
    slug: fm("slug") || article.slug,
    path: article.path ?? "",
    canonical_url: canonical,
    page_role: article.facets?.pageRole ?? fm("page_role"),
    article_type: article.facets?.articleType ?? fm("article_type"),
    search_intent: article.facets?.searchIntent ?? fm("search_intent"),
    funnel: article.facets?.funnel ?? fm("funnel"),
    author: fm("author"),
    publish_date: fm("publish_date"),
    modified_date: fm("modified_date"),
    hero_image: opts.headerPng ? "header.png" : "",
    hero_image_alt: fm("hero_image_alt"),
    ...(article.signoff ? { signed_off_by: article.signoff.by, signed_off_at: article.signoff.at.toISOString() } : {}),
  };

  const head = [
    `<title>${esc(meta.html_title)}</title>`,
    description ? `<meta name="description" content="${esc(description)}">` : "",
    canonical ? `<link rel="canonical" href="${esc(canonical)}">` : "",
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${esc(title)}">`,
    description ? `<meta property="og:description" content="${esc(description)}">` : "",
    canonical ? `<meta property="og:url" content="${esc(canonical)}">` : "",
    buildHeadHtml(article.artifacts.schema),
  ]
    .filter(Boolean)
    .join("\n");

  const pending = deferred.length ? [] : (article.pendingLinks ?? []);
  const readme = [
    `# ${title}`,
    ``,
    `Framer export — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `- **Publish at:** ${article.path ?? "(no reserved path)"}${canonical ? ` → ${canonical}` : ""}`,
    ...(meta.page_role
      ? [`- **Facets:** ${meta.page_role} · ${meta.article_type} · ${meta.search_intent} · ${String(meta.funnel).toUpperCase()}`]
      : []),
    ...(article.signoff ? [`- **Signed off:** ${article.signoff.by}, ${article.signoff.at.toISOString().slice(0, 10)}`] : []),
    ``,
    `## Steps`,
    ``,
    `1. Create the page in Framer at the path above (not under /blog).`,
    `2. Title, SEO title and meta description: from meta.json.`,
    `3. Body: paste body.html (or page.md into a markdown-aware component). Keep every heading, table and list as real HTML.`,
    `4. Page head / custom code: paste head.html (canonical, Open Graph, JSON-LD).`,
    `5. Hero image: header.png, alt text from meta.json.`,
    `6. Publish, then press **Mark live** in the Review screen — it checks the URL responds.`,
    ``,
    ...(deferred.length
      ? [
          `## Links to switch on when these pages go live`,
          ``,
          `They're written into the article with their anchors; the export shows them as plain text so the`,
          `live page has no 404s. When a target is live, re-download this package (or link the anchor by hand):`,
          ``,
          ...deferred.map((d) => `- "${d.anchor ?? d.url}" → ${d.url}`),
          ``,
        ]
      : []),
    ...(pending.length
      ? [
          `## Links to add once these pages are live`,
          ``,
          `This page mentions them in plain text (D35). Turn each mention into a link when its page is published:`,
          ``,
          ...pending.map((p) => `- ${p}`),
          ``,
        ]
      : []),
  ].join("\n");

  const files: { name: string; data: Buffer | string }[] = [
    { name: "body.html", data: renderPostBody(md, company, { styled: false }) + "\n" },
    { name: "page.md", data: cleanBody(body).trim() + "\n" },
    { name: "head.html", data: head + "\n" },
    { name: "meta.json", data: JSON.stringify(meta, null, 2) + "\n" },
    { name: "README.md", data: readme },
  ];
  if (opts.headerPng) files.push({ name: "header.png", data: opts.headerPng });
  return {
    filename: `${article.slug}-framer.zip`,
    zip: zip(files),
    files: files.map((f) => f.name),
  };
}
