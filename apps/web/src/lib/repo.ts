import "server-only";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** Repo root: REPO_ROOT env, or walk up from cwd (next dev runs in apps/web). */
export function repoRoot(): string {
  if (process.env.REPO_ROOT) return process.env.REPO_ROOT;
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "CLAUDE.md")) && existsSync(join(dir, "agents"))) return dir;
    dir = resolve(dir, "..");
  }
  return process.cwd();
}
