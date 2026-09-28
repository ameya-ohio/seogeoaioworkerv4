import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type EngineDb } from "./db.js";
import {
  applyRepoFiles,
  checkRepoPath,
  deleteRepoFile,
  getRepoFile,
  listRepoFiles,
  saveRepoFile,
} from "./dal/repoFiles.js";

let mongod: MongoMemoryServer;
let db: EngineDb;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  db = await connect(mongod.getUri(), "repo_files_test");
}, 180_000);

afterAll(async () => {
  await db?.close();
  await mongod?.stop();
});

describe("checkRepoPath", () => {
  it("accepts files inside the Admin areas and normalizes them", () => {
    expect(checkRepoPath("context/case-studies/acme.md")).toBe("context/case-studies/acme.md");
    expect(checkRepoPath("standards/./quality-bar.md")).toBe("standards/quality-bar.md");
  });

  it("rejects traversal, other roots, bare roots and non-text files", () => {
    for (const bad of [
      "../etc/passwd.md",
      "context/../../x.md",
      "/context/x.md",
      "scripts/seo_audit.md",
      "config/company.yaml",
      "context",
      "context/case-studies/logo.png",
    ]) {
      expect(() => checkRepoPath(bad), bad).toThrow();
    }
  });
});

describe("repo files round trip", () => {
  it("saves, applies to disk, and tombstones deletions", async () => {
    const repo = mkdtempSync(join(tmpdir(), "repo-files-"));
    mkdirSync(join(repo, "context", "brand"), { recursive: true });
    writeFileSync(join(repo, "context", "brand", "old.md"), "old");

    await saveRepoFile(db, "co", "context/case-studies/acme.md", "# Acme\n");
    await saveRepoFile(db, "co", "context/case-studies/acme.md", "# Acme v2\n");
    await deleteRepoFile(db, "co", "context/brand/old.md");
    await saveRepoFile(db, "other-co", "context/case-studies/theirs.md", "not ours");

    expect((await getRepoFile(db, "co", "context/case-studies/acme.md"))?.content).toBe("# Acme v2\n");
    expect((await listRepoFiles(db, "co", "context")).map((d) => d.path)).toEqual([
      "context/brand/old.md",
      "context/case-studies/acme.md",
    ]);

    expect(await applyRepoFiles(db, "co", repo)).toEqual({ written: 1, removed: 1 });
    expect(readFileSync(join(repo, "context", "case-studies", "acme.md"), "utf-8")).toBe("# Acme v2\n");
    expect(existsSync(join(repo, "context", "brand", "old.md"))).toBe(false);
    expect(existsSync(join(repo, "context", "case-studies", "theirs.md"))).toBe(false);

    // A re-saved file comes back from its tombstone.
    await saveRepoFile(db, "co", "context/brand/old.md", "restored");
    await applyRepoFiles(db, "co", repo);
    expect(readFileSync(join(repo, "context", "brand", "old.md"), "utf-8")).toBe("restored");
  });
});
