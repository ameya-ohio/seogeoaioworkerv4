import { Marked } from "marked";
import { cfgGet, type CompanyConfig } from "../companyConfig.js";
import { cleanBody, parseArticle } from "../frontmatter.js";
import type { ArticleDoc } from "../types.js";

/**
 * article.md → HubSpot post fields (roadmap 5.1; port of blogsagent's
 * html_builder + the /tmp publish adapter). The json-ld fence and the edit
 * summary never reach the post body; the schema goes to `headHtml` as one
 * <script type="application/ld+json"> @graph.
 */

/** Kept as "ew-post" for continuity with posts already published by blogsagent. */
export const POST_CSS_CLASS = "ew-post";

const FALLBACK_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function styleBlock(company: CompanyConfig): string {
  const family = String(cfgGet(company, "brand.font.family", "") ?? "");
  const fallback = String(cfgGet(company, "brand.font.fallback_stack", FALLBACK_STACK) ?? FALLBACK_STACK);
  const font = family ? `'${family}',${fallback}` : fallback;
  const text = String(cfgGet(company, "brand.colors.body_text", "#000") ?? "#000");
  const c = POST_CSS_CLASS;
  return (
    "<style>" +
    `.${c}{font-family:${font};color:${text};line-height:1.65;font-size:17px;}` +
    `.${c} h2{font-family:inherit;color:${text};margin-top:2em;margin-bottom:0.5em;line-height:1.25;}` +
    `.${c} h3{font-family:inherit;color:${text};margin-top:1.6em;margin-bottom:0.4em;line-height:1.3;}` +
    `.${c} h4{font-family:inherit;color:${text};margin-top:1.4em;margin-bottom:0.4em;}` +
    `.${c} p{margin:0 0 1.1em 0;}` +
    `.${c} ul,.${c} ol{margin:0 0 1.1em 1.5em;padding:0;}` +
    `.${c} li{margin:0.25em 0;}` +
    `.${c} blockquote{margin:1.2em 0;padding:0.6em 1em;border-left:3px solid ${text};background:#fafafa;color:${text};}` +
    `.${c} a{color:${text};text-decoration:underline;}` +
    `.${c} table{border-collapse:collapse;margin:0 0 1.1em 0;width:100%;}` +
    `.${c} th,.${c} td{border:1px solid #e5e5e5;padding:0.45em 0.7em;text-align:left;vertical-align:top;}` +
    `.${c} code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f3f3f3;padding:0.1em 0.35em;border-radius:3px;font-size:0.92em;}` +
    `.${c} pre{background:#f6f6f6;padding:1em;border-radius:6px;overflow-x:auto;}` +
    `.${c} pre code{background:transparent;padding:0;}` +
    `.${c} img{max-width:100%;height:auto;}` +
    "</style>"
  );
}

const markdown = new Marked({ gfm: true });

/** Hosts that count as the company's own site: company.domain + the blog's host. */
function ownHosts(company: CompanyConfig): string[] {
  const hosts = new Set<string>();
  const add = (v: unknown) => {
    const raw = String(v ?? "").trim();
    if (!raw) return;
    try {
      hosts.add(new URL(raw.includes("://") ? raw.replace(/\{[^}]+\}/g, "x") : `https://${raw}`).hostname.replace(/^www\./, ""));
    } catch {
      /* ignore malformed config */
    }
  };
  add(cfgGet(company, "company.domain", ""));
  add(cfgGet(company, "blog.base_url", ""));
  add(cfgGet(company, "site.base_url", ""));
  return [...hosts];
}

function isExternal(href: string, own: string[]): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    return !own.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return true;
  }
}

/** The HubSpot template renders the title, so the article's H1 is dropped; any other H1 becomes an H2. */
export function renderPostBody(
  articleMd: string,
  company: CompanyConfig,
  opts: { styled?: boolean } = {},
): string {
  let body = cleanBody(parseArticle(articleMd).body);
  body = body.replace(/^#\s+.+$/m, ""); // first H1 only
  let html = markdown.parse(body, { async: false }) as string;
  html = html.replace(/<h1(\s[^>]*)?>/gi, (_m, attrs: string | undefined) => `<h2${attrs ?? ""}>`).replace(/<\/h1>/gi, "</h2>");
  const own = ownHosts(company);
  html = html.replace(/<a\s+([^>]*?)href="([^"]+)"([^>]*)>/gi, (m, pre: string, href: string, post: string) => {
    if (!isExternal(href, own) || /\btarget=/i.test(pre + post)) return m;
    return `<a ${pre}href="${href}"${post} target="_blank" rel="noopener">`;
  });
  // A site builder (Framer) styles the page itself: plain semantic HTML only.
  if (opts.styled === false) return html.trim();
  return `${styleBlock(company)}<div class="${POST_CSS_CLASS}">${html.trim()}</div>`;
}

/** One JSON-LD script for HubSpot's `headHtml`; `</` is escaped so the script tag can't be closed early. */
export function buildHeadHtml(schema: Record<string, unknown> | undefined): string {
  if (!schema) return "";
  const payload = JSON.stringify(schema).replace(/<\//g, "<\\/");
  return `<script type="application/ld+json">${payload}</script>`;
}

export interface PostFields {
  name: string;
  slug: string;
  metaDescription: string;
  postBody: string;
  headHtml: string;
  htmlTitle?: string;
  featuredImageAltText?: string;
}

export class PublishInputError extends Error {}

export function postFieldsFromArticle(article: ArticleDoc, company: CompanyConfig): PostFields {
  const md = article.artifacts.article;
  if (!md) throw new PublishInputError("The article has no article.md to publish.");
  const fm = parseArticle(md).frontmatter;
  const get = (k: string) => String(fm[k] ?? "").trim();
  const missing = ["title", "slug", "meta_description"].filter((k) => !get(k));
  if (missing.length) throw new PublishInputError(`Frontmatter is missing: ${missing.join(", ")}.`);
  const fields: PostFields = {
    name: get("title"),
    slug: get("slug"),
    metaDescription: get("meta_description"),
    postBody: renderPostBody(md, company),
    headHtml: buildHeadHtml(article.artifacts.schema),
  };
  if (get("html_title")) fields.htmlTitle = get("html_title");
  if (get("hero_image_alt")) fields.featuredImageAltText = get("hero_image_alt");
  return fields;
}
