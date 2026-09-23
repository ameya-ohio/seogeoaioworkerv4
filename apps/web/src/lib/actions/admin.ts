"use server";

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { revalidatePath } from "next/cache";
import { requireAuth } from "../auth";
import { repoRoot } from "../repo";

/**
 * Admin editors (3.9): the engine's markdown surfaces, edited in place.
 * Areas map to repo dirs; every path is resolved and containment-checked.
 */
const AREAS: Record<string, string> = {
  standards: "standards",
  templates: "templates",
  agents: "agents",
  context: "context",
};

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

export interface AdminFile {
  path: string;
  size: number;
  modifiedAt: string;
}

export async function listAdminFiles(area: string): Promise<AdminFile[]> {
  await requireAuth();
  const base = areaDir(area);
  const out: AdminFile[] = [];

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
        out.push({
          path: relative(base, abs),
          size: s.size,
          modifiedAt: s.mtime.toISOString(),
        });
      }
    }
  }

  await walk(base);
  return out;
}

export async function readAdminFile(area: string, rel: string): Promise<string> {
  await requireAuth();
  return readFile(safePath(area, rel), "utf-8");
}

export interface AdminSaveState {
  error?: string;
  savedAt?: string;
}

export async function saveAdminFile(
  area: string,
  rel: string,
  content: string,
): Promise<AdminSaveState> {
  await requireAuth();
  if (!EDITABLE.test(rel)) return { error: "Only md/txt/json/yaml files are editable." };
  try {
    const abs = safePath(area, rel);
    await stat(abs); // must already exist — the editor edits, it does not create
    await writeFile(abs, content, "utf-8");
    revalidatePath("/admin");
    return { savedAt: new Date().toISOString() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
