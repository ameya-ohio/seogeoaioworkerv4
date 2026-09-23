import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  parseArticle,
  runSeoAudit,
  type ArticleDoc,
  type EngineDb,
  type Stage,
  type Storage,
} from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";

/**
 * Backfill pre-Mongo article folders (roadmap 2.7). Reads every
 * articles/YYYY-MM-DD-slug/ folder, builds an ArticleDoc from its files, and
 * inserts it (skipping slugs that already exist). Header PNGs go to storage.
 */
export interface ImportOptions {
  stage: Stage;
  dryRun: boolean;
  /** Re-import folders whose slug already exists (replaces artifacts). */
  update: boolean;
  runAudit: boolean;
}

export interface ImportSummary {
  imported: string[];
  updated: string[];
  skipped: { folder: string; reason: string }[];
}

const FOLDER_RE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

async function readIf(path: string): Promise<string | undefined> {
  return existsSync(path) ? readFile(path, "utf-8") : undefined;
}

function jsonSafe(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function isStub(text: string | undefined): boolean {
  return !text || text.includes("_(populated by Phase");
}

export async function importArticles(
  db: EngineDb,
  cfg: WorkerConfig,
  storage: Storage,
  companyId: string,
  opts: ImportOptions,
  log: (msg: string) => void,
): Promise<ImportSummary> {
  const articlesRoot = join(cfg.repoRoot, "articles");
  const summary: ImportSummary = { imported: [], updated: [], skipped: [] };
  const entries = (await readdir(articlesRoot)).sort();

  for (const folder of entries) {
    const dir = join(articlesRoot, folder);
    if (!(await stat(dir)).isDirectory()) continue;
    const m = FOLDER_RE.exec(folder);
    if (!m) {
      summary.skipped.push({ folder, reason: "folder name is not YYYY-MM-DD-slug" });
      continue;
    }

    const articleMd = await readIf(join(dir, "article.md"));
    if (isStub(articleMd) && !articleMd?.includes("# ")) {
      summary.skipped.push({ folder, reason: "article.md missing or stub" });
      continue;
    }
    const { frontmatter } = parseArticle(articleMd as string);
    // A scaffold from an in-flight pipeline run has template frontmatter —
    // the importer backfills shipped articles, not work in progress.
    if (String(frontmatter["title"] ?? "").trim() === "") {
      summary.skipped.push({ folder, reason: "empty title — in-progress scaffold, not a shipped article" });
      continue;
    }
    const slug = String(frontmatter["slug"] ?? m[2]);
    const topic = String(frontmatter["title"] ?? m[2]);
    const primaryKeyword = String(frontmatter["primary_keyword"] ?? "").trim();

    const existing = await db.articles.findOne({ companyId, slug });
    if (existing && !opts.update) {
      summary.skipped.push({ folder, reason: `slug already imported: ${slug}` });
      continue;
    }

    const researchNotes = await readIf(join(dir, "research-notes.md"));
    const outline = await readIf(join(dir, "outline.md"));
    const meta = jsonSafe(await readIf(join(dir, "meta.json")));
    const schema = jsonSafe(await readIf(join(dir, "schema.json")));

    const artifacts: ArticleDoc["artifacts"] = { article: articleMd as string };
    if (!isStub(researchNotes)) artifacts.researchNotes = researchNotes as string;
    if (!isStub(outline)) artifacts.outline = outline as string;
    if (meta) artifacts.meta = meta;
    if (schema) artifacts.schema = schema;

    let header: ArticleDoc["header"] | undefined;
    const pngPath = join(dir, "header.png");
    if (!opts.dryRun && existsSync(pngPath)) {
      const stored = await storage.put(
        `articles/${folder}/header.png`,
        await readFile(pngPath),
        "image/png",
      );
      header = {
        storageKey: stored.key,
        contentType: "image/png",
        ...(stored.url ? { url: stored.url } : {}),
      };
    }

    let audit: ArticleDoc["audit"] | undefined;
    if (!opts.dryRun && opts.runAudit) {
      try {
        audit = await runSeoAudit(
          {
            repoRoot: cfg.repoRoot,
            pythonBin: cfg.pythonBin,
            ...(cfg.companyConfigPath ? { companyConfigPath: cfg.companyConfigPath } : {}),
          },
          join("articles", folder),
        );
      } catch (err) {
        log(`  audit failed for ${folder}: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (opts.dryRun) {
      log(`[dry-run] would import ${folder} as slug=${slug} stage=${opts.stage}`);
      summary.imported.push(folder);
      continue;
    }

    const now = new Date();
    const doc: ArticleDoc = {
      companyId,
      slug,
      folder,
      topic,
      ...(primaryKeyword ? { targetKeyword: primaryKeyword } : {}),
      stage: opts.stage,
      stageHistory: [{ stage: opts.stage, at: now }],
      artifacts,
      frontmatter,
      ...(header ? { header } : {}),
      ...(audit ? { audit } : {}),
      imported: true,
      createdAt: now,
      updatedAt: now,
    };

    if (existing) {
      const { _id, createdAt, ...rest } = doc;
      void _id;
      void createdAt;
      await db.articles.updateOne({ _id: existing._id }, { $set: rest });
      summary.updated.push(folder);
      log(`updated ${folder} (slug=${slug})`);
    } else {
      await db.articles.insertOne(doc);
      summary.imported.push(folder);
      log(`imported ${folder} (slug=${slug})`);
    }
  }
  return summary;
}
