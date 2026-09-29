import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CTA_SETTINGS_KEY,
  facetFrontmatter,
  formatTemplatePath,
  loadFormatRegistry,
  renderPageSpec,
  resolvePageRules,
  stampFrontmatter,
  type ArticleDoc,
  type CtaSettings,
  type EngineDb,
  type FormatRegistry,
  type FunnelCta,
  type PageRules,
} from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";
import { articleDir } from "./workspace.js";

/**
 * page.md (D45–D50): the one file every phase reads to learn what kind of
 * page it is building. Rebuilt at the start of every run (after repo_files
 * are applied, so an Admin edit to formats.json or a format template counts)
 * and again once the Strategist has chosen facets for a page that had none.
 */

function asCta(v: unknown): FunnelCta | undefined {
  const o = v as Record<string, unknown> | undefined;
  const url = typeof o?.["url"] === "string" ? o["url"].trim() : "";
  if (!url) return undefined;
  const label = typeof o?.["label"] === "string" && o["label"].trim() ? o["label"].trim() : url;
  const blurb = typeof o?.["blurb"] === "string" && o["blurb"].trim() ? o["blurb"].trim() : undefined;
  return { label, url, ...(blurb ? { blurb } : {}) };
}

function asCtaSettings(v: unknown): CtaSettings {
  const o = (v ?? {}) as Record<string, unknown>;
  const out: CtaSettings = {};
  for (const f of ["tofu", "mofu", "bofu"] as const) {
    const cta = asCta(o[f]);
    if (cta) out[f] = cta;
  }
  return out;
}

/** D50: the Admin setting wins per funnel; company.yaml `ctas:` is the seed. */
export async function readCtaSettings(db: EngineDb, companyId: string): Promise<CtaSettings> {
  const saved = await db.settings.findOne({ companyId, key: CTA_SETTINGS_KEY });
  const company = await db.companies.findOne({ companyId });
  const seeded = asCtaSettings((company?.config as Record<string, unknown> | undefined)?.["ctas"]);
  return { ...seeded, ...asCtaSettings(saved?.value) };
}

/** D46: absolute canonical URL for a reserved path, from company.yaml `site.base_url`. */
export async function canonicalFor(db: EngineDb, article: ArticleDoc): Promise<string | undefined> {
  if (!article.path) return article.canonicalUrl;
  const company = await db.companies.findOne({ companyId: article.companyId });
  const cfg = (company?.config ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const base = String(cfg["site"]?.["base_url"] ?? cfg["company"]?.["url"] ?? "").replace(/\/+$/, "");
  if (!base) return undefined;
  return `${base}${article.path.startsWith("/") ? "" : "/"}${article.path}`;
}

/** D46: the configured root crumbs (Home › Learn) plus the page's own trail. */
export async function breadcrumbsFor(
  db: EngineDb,
  article: ArticleDoc,
): Promise<{ name: string; url: string }[] | undefined> {
  if (!article.trail?.length) return undefined;
  const company = await db.companies.findOne({ companyId: article.companyId });
  const cfg = (company?.config ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const base = String(cfg["site"]?.["base_url"] ?? cfg["company"]?.["url"] ?? "").replace(/\/+$/, "");
  if (!base) return undefined;
  const root = Array.isArray(cfg["site"]?.["breadcrumb_root"])
    ? (cfg["site"]?.["breadcrumb_root"] as { name?: unknown; url?: unknown }[])
        .filter((c) => typeof c.name === "string" && typeof c.url === "string")
        .map((c) => ({ name: String(c.name), url: String(c.url) }))
    : [{ name: "Home", url: `${base}/` }];
  return [...root, ...article.trail.map((t) => ({ name: t.name, url: `${base}${t.path}` }))];
}

export async function pageRulesFor(
  db: EngineDb,
  cfg: WorkerConfig,
  article: ArticleDoc,
  formats?: FormatRegistry,
): Promise<{ rules: PageRules; formats: FormatRegistry }> {
  const reg = formats ?? loadFormatRegistry(cfg.repoRoot);
  const canonicalUrl = await canonicalFor(db, article);
  const breadcrumbs = await breadcrumbsFor(db, article);
  const rules = resolvePageRules(reg, article.facets, {
    ctas: await readCtaSettings(db, article.companyId),
    ...(article.path ? { path: article.path } : {}),
    ...(canonicalUrl ? { canonicalUrl } : {}),
    ...(breadcrumbs ? { breadcrumbs } : {}),
  });
  return { rules, formats: reg };
}

export async function materializePageSpec(cfg: WorkerConfig, article: ArticleDoc, rules: PageRules): Promise<void> {
  const dir = articleDir(cfg, article);
  await mkdir(dir, { recursive: true });
  const templatePath = formatTemplatePath(cfg.repoRoot, rules.format.slug);
  const guide = existsSync(templatePath)
    ? await readFile(templatePath, "utf-8")
    : "_No format guide yet — follow the rules above and the Writer spec._";
  await writeFile(join(dir, "page.md"), renderPageSpec(rules, guide), "utf-8");
}

/**
 * Write the worker-owned frontmatter keys (facets + canonical_url) into
 * article.md after the Writer or Editor — the model never has to get them
 * right, and the audit reads the same values the brief was built with.
 */
export async function stampArticleFrontmatter(cfg: WorkerConfig, article: ArticleDoc, rules: PageRules): Promise<boolean> {
  const path = join(articleDir(cfg, article), "article.md");
  if (!existsSync(path)) return false;
  const fields = facetFrontmatter(rules);
  if (Object.keys(fields).length === 0) return false;
  const before = await readFile(path, "utf-8");
  const after = stampFrontmatter(before, fields);
  if (after === before) return false;
  await writeFile(path, after, "utf-8");
  return true;
}
