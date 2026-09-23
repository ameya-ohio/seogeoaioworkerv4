import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildCompetitorGapDigest,
  latestScrapesByDomain,
  ownDomainsFromConfig,
  parseArticle,
  saveArtifacts,
  type ArticleDoc,
  type EngineDb,
  type Storage,
  type WorkStage,
} from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";

/**
 * The article folder on disk is the agents' workspace; Mongo is the system
 * of record (D3). materializeWorkspace() rebuilds the folder from Mongo
 * artifacts (fresh scaffold for a new article, rehydration on resume — the
 * worker may not be the machine that enqueued the run); persistPhaseOutputs()
 * copies phase outputs back into Mongo as each stage completes.
 */

export function articleDir(cfg: WorkerConfig, article: ArticleDoc): string {
  return join(cfg.repoRoot, "articles", article.folder);
}

async function writeIfMissing(path: string, content: string): Promise<void> {
  if (!existsSync(path)) await writeFile(path, content, "utf-8");
}

export async function materializeWorkspace(cfg: WorkerConfig, article: ArticleDoc): Promise<void> {
  const dir = articleDir(cfg, article);
  await mkdir(dir, { recursive: true });
  const a = article.artifacts;

  // Prefer Mongo artifacts (they are canonical); scaffold stubs otherwise.
  if (a.researchNotes) {
    await writeIfMissing(join(dir, "research-notes.md"), a.researchNotes);
  } else {
    await writeIfMissing(
      join(dir, "research-notes.md"),
      `# Research Notes: ${article.slug}\n\n_(populated by Phase 1 — Researcher)_\n`,
    );
  }
  if (a.outline) {
    await writeIfMissing(join(dir, "outline.md"), a.outline);
  } else {
    await writeIfMissing(
      join(dir, "outline.md"),
      `# Strategy & Outline: ${article.slug}\n\n_(populated by Phase 2 — Strategist)_\n`,
    );
  }
  if (a.article ?? a.draft) {
    await writeIfMissing(join(dir, "article.md"), (a.article ?? a.draft) as string);
  } else {
    const templatePath = join(cfg.repoRoot, "templates", "article-template.md");
    const today = article.folder.slice(0, 10);
    let body: string;
    if (existsSync(templatePath)) {
      body = await readFile(templatePath, "utf-8");
      body = body
        .replace('slug: ""', `slug: "${article.slug}"`)
        .replace('publish_date: ""', `publish_date: "${today}"`)
        .replace('modified_date: ""', `modified_date: "${today}"`);
    } else {
      body = `---\ntitle: ""\nslug: "${article.slug}"\n---\n\n# [H1 Title]\n`;
    }
    await writeIfMissing(join(dir, "article.md"), body);
  }
  if (a.meta) {
    await writeIfMissing(join(dir, "meta.json"), JSON.stringify(a.meta, null, 2) + "\n");
  } else {
    await writeIfMissing(
      join(dir, "meta.json"),
      JSON.stringify(
        {
          title: "",
          slug: article.slug,
          meta_description: "",
          primary_keyword: article.targetKeyword ?? "",
          secondary_keywords: [],
          canonical_url: "",
          publish_date: article.folder.slice(0, 10),
          modified_date: article.folder.slice(0, 10),
        },
        null,
        2,
      ) + "\n",
    );
  }
  if (a.schema) {
    await writeIfMissing(join(dir, "schema.json"), JSON.stringify(a.schema, null, 2) + "\n");
  }
  // Spoke brief from the cluster agent (4.12): always rewrite from Mongo —
  // it is produced upstream of the pipeline and never edited by phases.
  if (article.brief) {
    await writeFile(join(dir, "brief.md"), article.brief.markdown, "utf-8");
  }
}

/**
 * Competitor coverage digest for the Researcher (roadmap 6.3): rebuilt from
 * the freshest scraped corpus per competitor domain on every run, like
 * brief.md — produced upstream, never edited by phases. No scraped corpora
 * (or none with a topic index) means no file, and the research prompt skips
 * the input entirely.
 */
export async function materializeCompetitorGaps(
  db: EngineDb,
  cfg: WorkerConfig,
  article: ArticleDoc,
): Promise<boolean> {
  const dir = articleDir(cfg, article);
  const path = join(dir, "competitor-gaps.md");
  const scrapes = await latestScrapesByDomain(db, article.companyId);
  const company = await db.companies.findOne({ companyId: article.companyId });
  const digest = buildCompetitorGapDigest(scrapes, {
    excludeDomains: ownDomainsFromConfig(company?.config),
  });
  if (!digest) {
    if (existsSync(path)) await rm(path);
    return false;
  }
  await mkdir(dir, { recursive: true });
  await writeFile(path, digest, "utf-8");
  return true;
}

async function readIfExists(path: string): Promise<string | undefined> {
  if (!existsSync(path)) return undefined;
  return readFile(path, "utf-8");
}

function parseJsonSafe(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Copy a completed phase's outputs from the folder into Mongo. */
export async function persistPhaseOutputs(
  db: EngineDb,
  cfg: WorkerConfig,
  storage: Storage,
  article: ArticleDoc,
  phase: WorkStage,
): Promise<void> {
  const dir = articleDir(cfg, article);
  const id = article._id;
  if (!id) throw new Error("article has no _id");

  switch (phase) {
    case "research": {
      const notes = await readIfExists(join(dir, "research-notes.md"));
      if (notes) await saveArtifacts(db, id, { researchNotes: notes });
      return;
    }
    case "outline": {
      const outline = await readIfExists(join(dir, "outline.md"));
      if (outline) await saveArtifacts(db, id, { outline });
      return;
    }
    case "write": {
      const md = await readIfExists(join(dir, "article.md"));
      const meta = parseJsonSafe(await readIfExists(join(dir, "meta.json")));
      if (md) {
        const { frontmatter } = parseArticle(md);
        await saveArtifacts(
          db,
          id,
          { draft: md, article: md, ...(meta ? { meta } : {}) },
          { frontmatter },
        );
      }
      return;
    }
    case "edit": {
      const md = await readIfExists(join(dir, "article.md"));
      if (md) {
        const { frontmatter } = parseArticle(md);
        await saveArtifacts(db, id, { article: md }, { frontmatter });
      }
      return;
    }
    case "schema": {
      const md = await readIfExists(join(dir, "article.md"));
      const schema = parseJsonSafe(await readIfExists(join(dir, "schema.json")));
      const artifacts: Record<string, unknown> = {};
      if (md) artifacts["article"] = md;
      if (schema) artifacts["schema"] = schema;
      await saveArtifacts(db, id, artifacts);
      return;
    }
    case "design": {
      const md = await readIfExists(join(dir, "article.md"));
      const pngPath = join(dir, "header.png");
      let header: ArticleDoc["header"] | undefined;
      if (existsSync(pngPath)) {
        const png = await readFile(pngPath);
        const stored = await storage.put(
          `articles/${article.folder}/header.png`,
          png,
          "image/png",
        );
        header = { storageKey: stored.key, contentType: "image/png", ...(stored.url ? { url: stored.url } : {}) };
        const html = await readIfExists(join(dir, "header.html"));
        if (html) {
          await storage.put(
            `articles/${article.folder}/header.html`,
            Buffer.from(html, "utf-8"),
            "text/html",
          );
        }
      }
      if (md) {
        const { frontmatter } = parseArticle(md);
        await saveArtifacts(db, id, { article: md }, { frontmatter, ...(header ? { header } : {}) });
      } else if (header) {
        await saveArtifacts(db, id, {}, { header });
      }
      return;
    }
  }
}
