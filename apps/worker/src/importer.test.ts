import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalStorage, connect, type EngineDb } from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";
import { importArticles } from "./importer.js";

const REAL_REPO = join(import.meta.dirname, "..", "..", "..");

let mongod: MongoMemoryServer;
let db: EngineDb;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  db = await connect(mongod.getUri(), "importer_test");
}, 180_000);

afterAll(async () => {
  await db?.close();
  await mongod?.stop();
});

describe("importArticles against the real articles/ corpus", () => {
  it("backfills the shipped folders into Mongo", async () => {
    const cfg = { repoRoot: REAL_REPO, pythonBin: "python3" } as WorkerConfig;
    const storage = new LocalStorage(mkdtempSync(join(tmpdir(), "blogagent-import-")));

    const summary = await importArticles(
      db,
      cfg,
      storage,
      "testco",
      { stage: "published", dryRun: false, update: false, runAudit: false },
      () => {},
    );

    // 14 shipped articles + the 2026-05-05 one-shot folder.
    expect(summary.imported.length).toBeGreaterThanOrEqual(14);
    expect(summary.skipped.filter((s) => s.reason.includes("article.md missing"))).toHaveLength(0);

    const docs = await db.articles.find({ companyId: "testco" }).toArray();
    expect(docs).toHaveLength(summary.imported.length);
    for (const doc of docs) {
      expect(doc.stage).toBe("published");
      expect(doc.imported).toBe(true);
      expect(doc.artifacts.article).toContain("# ");
      expect(String(doc.frontmatter?.["title"] ?? "")).not.toBe("");
      expect(doc.slug).toMatch(/^[a-z0-9-]+$/);
    }

    // Folders that shipped a header.png got it copied into storage.
    const withHeader = docs.filter((d) => d.header);
    expect(withHeader.length).toBeGreaterThanOrEqual(10);

    // Re-run without --update: everything skips, nothing duplicates.
    const second = await importArticles(
      db,
      cfg,
      storage,
      "testco",
      { stage: "published", dryRun: false, update: false, runAudit: false },
      () => {},
    );
    expect(second.imported).toHaveLength(0);
    expect(second.skipped.length).toBeGreaterThanOrEqual(summary.imported.length);
    expect(await db.articles.countDocuments({ companyId: "testco" })).toBe(docs.length);
  }, 120_000);

  it("imports only the folders named in `only`", async () => {
    const cfg = { repoRoot: REAL_REPO, pythonBin: "python3" } as WorkerConfig;
    const storage = new LocalStorage(mkdtempSync(join(tmpdir(), "blogagent-import-")));
    const only = ["2026-09-16-attack-path-analysis", "2026-04-29-how-to-build-ai-sdr"];

    const summary = await importArticles(
      db,
      cfg,
      storage,
      "onlyco",
      { stage: "review", dryRun: false, update: false, runAudit: false, only },
      () => {},
    );
    expect(summary.imported.sort()).toEqual([...only].sort());
    const docs = await db.articles.find({ companyId: "onlyco" }).toArray();
    expect(docs.map((d) => d.folder).sort()).toEqual([...only].sort());
    for (const doc of docs) expect(doc.stage).toBe("review");

    await expect(
      importArticles(
        db,
        cfg,
        storage,
        "onlyco",
        { stage: "review", dryRun: true, update: false, runAudit: false, only: ["2026-01-01-nope"] },
        () => {},
      ),
    ).rejects.toThrow(/not found/);
  }, 120_000);
});
