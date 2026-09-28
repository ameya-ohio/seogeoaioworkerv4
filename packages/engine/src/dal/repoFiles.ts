import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import type { EngineDb } from "../db.js";
import type { RepoFileDoc } from "../types.js";

/** The repo areas the web Admin may write. Everything else stays code-owned. */
export const REPO_FILE_ROOTS = ["standards", "templates", "agents", "context"] as const;

const EDITABLE = /\.(md|txt|json|yaml)$/i;

/**
 * Normalize and validate a repo-relative path: inside one of the Admin
 * roots, no traversal, an editable extension. Throws on anything else —
 * this is the only gate between an Admin request and a file the worker
 * writes to disk.
 */
export function checkRepoPath(path: string): string {
  const p = normalize(path).split(sep).join("/");
  if (p.startsWith("/") || p.split("/").includes("..")) throw new Error(`Path escapes the repo: ${path}`);
  const root = p.split("/")[0] ?? "";
  if (!(REPO_FILE_ROOTS as readonly string[]).includes(root) || p === root) {
    throw new Error(`Not an Admin-editable area: ${path}`);
  }
  if (!EDITABLE.test(p)) throw new Error("Only md/txt/json/yaml files are editable.");
  return p;
}

export async function listRepoFiles(db: EngineDb, companyId: string, root?: string): Promise<RepoFileDoc[]> {
  const filter: Record<string, unknown> = { companyId };
  if (root) filter["path"] = { $regex: `^${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/` };
  return db.repoFiles.find(filter).sort({ path: 1 }).toArray();
}

export async function getRepoFile(db: EngineDb, companyId: string, path: string): Promise<RepoFileDoc | null> {
  return db.repoFiles.findOne({ companyId, path: checkRepoPath(path) });
}

export async function saveRepoFile(db: EngineDb, companyId: string, path: string, content: string): Promise<void> {
  const p = checkRepoPath(path);
  const now = new Date();
  await db.repoFiles.updateOne(
    { companyId, path: p },
    { $set: { content, deleted: false, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );
}

export async function deleteRepoFile(db: EngineDb, companyId: string, path: string): Promise<void> {
  const p = checkRepoPath(path);
  const now = new Date();
  await db.repoFiles.updateOne(
    { companyId, path: p },
    { $set: { content: "", deleted: true, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );
}

/**
 * Write every Admin-saved file over the local repo copy (and remove
 * tombstoned ones). The worker calls this before each run, so an Admin edit
 * reaches the next article without a redeploy.
 */
export async function applyRepoFiles(
  db: EngineDb,
  companyId: string,
  repoRoot: string,
): Promise<{ written: number; removed: number }> {
  let written = 0;
  let removed = 0;
  for (const doc of await listRepoFiles(db, companyId)) {
    const abs = join(repoRoot, checkRepoPath(doc.path));
    if (doc.deleted) {
      if (existsSync(abs)) {
        await rm(abs);
        removed += 1;
      }
      continue;
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, doc.content, "utf-8");
    written += 1;
  }
  return { written, removed };
}
