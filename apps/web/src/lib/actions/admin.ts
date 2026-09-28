"use server";

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { revalidatePath } from "next/cache";
import {
  deleteRepoFile,
  getRepoFile,
  listRepoFiles,
  saveRepoFile,
} from "@blogagent/engine";
import { requireAuth } from "../auth";
import { getCompany, getDb } from "../db";
import { repoRoot } from "../repo";

/**
 * Admin editors (3.9): the engine's markdown surfaces.
 *
 * Saved files live in Mongo (`repo_files`), not on this container's disk:
 * the web container is rebuilt on every deploy and the worker runs in a
 * different container, so a disk-only edit was lost on redeploy and never
 * reached the pipeline. Reads prefer the saved copy and fall back to the
 * repo file; the worker writes saved files over its repo copy before each
 * run (applyRepoFiles). Saves also update the local file when possible, so
 * terminal mode on a dev machine sees them too.
 */
const AREAS: Record<string, string> = {
  standards: "standards",
  templates: "templates",
  agents: "agents",
  context: "context",
};

/** Only context/ can gain or lose files; the other areas are code-owned sets. */
const CREATABLE_AREAS = new Set(["context"]);

const EDITABLE = /\.(md|txt|json|yaml)$/i;

function areaDir(area: string): string {
  const dir = AREAS[area];
  if (!dir) throw new Error(`Unknown admin area: ${area}`);
  return join(repoRoot(), dir);
}

function safePath(area: string, rel: string): string {
  const base = areaDir(area);
  const abs = resolve(base, rel);
  if (abs !== base && !abs.startsWith(base + sep)) {
    throw new Error("Path escapes the area directory");
  }
  return abs;
}

function repoPath(area: string, rel: string): string {
  safePath(area, rel); // containment check
  return `${AREAS[area]}/${rel.split(sep).join("/")}`;
}

export interface AdminFile {
  path: string;
  size: number;
  modifiedAt: string;
  /** "app" when the current content was saved from the Admin (Mongo), "repo" when it is the shipped file. */
  source: "app" | "repo";
}

async function diskFiles(area: string): Promise<Map<string, AdminFile>> {
  const base = areaDir(area);
  const out = new Map<string, AdminFile>();
  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const name of entries.sort()) {
      if (name.startsWith(".")) continue;
      const abs = join(dir, name);
      const s = await stat(abs);
      if (s.isDirectory()) {
        await walk(abs);
      } else if (EDITABLE.test(name)) {
        const rel = relative(base, abs).split(sep).join("/");
        out.set(rel, { path: rel, size: s.size, modifiedAt: s.mtime.toISOString(), source: "repo" });
      }
    }
  }
  await walk(base);
  return out;
}

export async function listAdminFiles(area: string): Promise<AdminFile[]> {
  await requireAuth();
  const files = await diskFiles(area);
  const db = await getDb();
  for (const doc of await listRepoFiles(db, getCompany().companyId, AREAS[area])) {
    const rel = doc.path.slice(`${AREAS[area]}/`.length);
    if (doc.deleted) {
      files.delete(rel);
    } else {
      files.set(rel, {
        path: rel,
        size: Buffer.byteLength(doc.content, "utf-8"),
        modifiedAt: doc.updatedAt.toISOString(),
        source: "app",
      });
    }
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}

async function currentContent(area: string, rel: string): Promise<string | null> {
  const db = await getDb();
  const saved = await getRepoFile(db, getCompany().companyId, repoPath(area, rel));
  if (saved) return saved.deleted ? null : saved.content;
  try {
    return await readFile(safePath(area, rel), "utf-8");
  } catch {
    return null;
  }
}

export async function readAdminFile(area: string, rel: string): Promise<string> {
  await requireAuth();
  const content = await currentContent(area, rel);
  if (content === null) throw new Error(`No such file: ${area}/${rel}`);
  return content;
}

export interface AdminSaveState {
  error?: string;
  savedAt?: string;
  /** Set by create actions: the new file's area-relative path. */
  path?: string;
}

/** Keep the local file in step when the filesystem allows it (dev machine / terminal mode). */
async function mirrorToDisk(area: string, rel: string, content: string | null): Promise<void> {
  try {
    const abs = safePath(area, rel);
    if (content === null) {
      await rm(abs, { force: true });
    } else {
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf-8");
    }
  } catch {
    /* read-only or ephemeral filesystem: Mongo is the source of truth */
  }
}

export async function saveAdminFile(area: string, rel: string, content: string): Promise<AdminSaveState> {
  await requireAuth();
  if (!EDITABLE.test(rel)) return { error: "Only md/txt/json/yaml files are editable." };
  try {
    if ((await currentContent(area, rel)) === null) return { error: `No such file: ${area}/${rel}` };
    await saveRepoFile(await getDb(), getCompany().companyId, repoPath(area, rel), content);
    await mirrorToDisk(area, rel, content);
    revalidatePath("/admin");
    return { savedAt: new Date().toISOString() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

const NEW_FILE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*\.md$/;

export async function createAdminFile(area: string, rel: string, content: string): Promise<AdminSaveState> {
  await requireAuth();
  if (!CREATABLE_AREAS.has(area)) return { error: `New files can only be added under context/.` };
  if (!NEW_FILE.test(rel)) return { error: "Use lowercase letters, digits and hyphens, ending in .md." };
  try {
    if ((await currentContent(area, rel)) !== null) return { error: `${area}/${rel} already exists.` };
    await saveRepoFile(await getDb(), getCompany().companyId, repoPath(area, rel), content);
    await mirrorToDisk(area, rel, content);
    revalidatePath("/admin");
    return { savedAt: new Date().toISOString(), path: rel };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteAdminFile(area: string, rel: string): Promise<AdminSaveState> {
  await requireAuth();
  if (!CREATABLE_AREAS.has(area)) return { error: "Only context/ files can be deleted from the Admin." };
  try {
    await deleteRepoFile(await getDb(), getCompany().companyId, repoPath(area, rel));
    await mirrorToDisk(area, rel, null);
    revalidatePath("/admin");
    return { savedAt: new Date().toISOString() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** New case study from context/case-studies/_template.md, titled and ready to fill in. */
export async function createCaseStudy(title: string): Promise<AdminSaveState> {
  await requireAuth();
  const clean = title.trim();
  const slug = slugify(clean);
  if (!slug) return { error: "Give the case study a short title." };
  const template = (await currentContent("context", "case-studies/_template.md")) ?? "# Case study: {{title}}\n";
  return createAdminFile("context", `case-studies/${slug}.md`, template.replace(/\{\{title\}\}/g, clean));
}
