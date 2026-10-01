import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ObjectId } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type EngineDb } from "./db.js";
import { createArticle } from "./dal/articles.js";
import { appendExpertMessage, appendInterviewerReply, closeInterview, openInterview } from "./dal/interviews.js";
import { deleteRepoFile, repoFileReader, saveRepoFile } from "./dal/repoFiles.js";
import { awaitInput, claimRun, enqueueRun, resumeRun } from "./dal/runs.js";
import { defaultInterviewMode, enqueueArticlePipeline, enqueueRerun } from "./pipelineOps.js";
import {
  buildInterviewContext,
  citableProofPoints,
  parseCaptured,
  renderTranscript,
  toChatMessages,
  visibleSoFar,
} from "./interview.js";

describe("interview helpers", () => {
  it("strips the captured block and keeps only known string fields", () => {
    const { text, captured } = parseCaptured(
      'Which is closest?\n\n<captured>{"angle": "C — paths cross", "thesis": "", "extra": "x"}</captured>',
    );
    expect(text).toBe("Which is closest?");
    expect(captured).toEqual({ angle: "C — paths cross" });
  });

  it("hides a malformed captured block instead of showing it", () => {
    expect(parseCaptured("Next question.\n<captured>{not json</captured>")).toEqual({ text: "Next question." });
  });

  it("never shows a captured block while it streams in", () => {
    expect(visibleSoFar("Tell me more.\n<capt")).toBe("Tell me more.\n");
    expect(visibleSoFar('Tell me more.\n<captured>{"an')).toBe("Tell me more.\n");
    expect(visibleSoFar("a < b")).toBe("a < b");
  });

  it("starts chat history on a user turn and merges consecutive same-role turns", () => {
    const at = new Date();
    const msgs = toChatMessages([
      { role: "assistant", content: "Q1", at },
      { role: "user", content: "A1", at },
      { role: "user", content: "A1b", at },
    ]);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(msgs[2]?.content).toBe("A1\n\nA1b");
  });

  it("keeps only Citable: yes proof points", () => {
    const md = [
      "| Number | Claim | Methodology | Date | Citable |",
      "|---|---|---|---|---|",
      "| 5.9M+ | attack paths | platform data | 2026 | yes |",
      "| 64% | fewer misconfigs | _(fill in)_ | | no |",
    ].join("\n");
    const out = citableProofPoints(md);
    expect(out).toContain("5.9M+");
    expect(out).not.toContain("64%");
    expect(citableProofPoints(md.replace("| yes |", "| no |"))).toBe("");
  });

  it("builds context from the wedge sections, usable case studies and citable proof only", () => {
    const ctx = buildInterviewContext({
      companyName: "Saporo",
      topic: "attack path management",
      researchNotes: "## Topic Summary\nSummary.\n\n## Content Gaps (Opportunities)\nNobody unifies human and NHI.\n\n## Statistics & Data Points\nskip me",
      outline: "# Strategy & Outline: Why the Graph Has to Be Complete\n\n## Angle\n> Unlike X.\n\n## Thesis\nThe claim.",
      context: [],
      caseStudies: [
        { path: "context/case-studies/hospital.md", content: "# Hospital\nTopics: attack paths" },
        { path: "context/case-studies/secret.md", content: "- Permission: internal only\nsecret" },
        { path: "context/case-studies/_template.md", content: "template" },
      ],
      proofPoints: "| Number | Citable |\n|---|---|\n| 5.9M+ | yes |\n| 64% | no |",
    });
    expect(ctx).toContain("Article: Why the Graph Has to Be Complete");
    expect(ctx).toContain("Nobody unifies human and NHI.");
    expect(ctx).not.toContain("skip me");
    expect(ctx).toContain("context/case-studies/hospital.md");
    expect(ctx).not.toContain("secret");
    expect(ctx).not.toContain("template");
    expect(ctx).toContain("5.9M+");
    expect(ctx).not.toContain("64%");
  });

  it("builds from research's candidate positions and page.md when there's no outline (D61)", () => {
    const ctx = buildInterviewContext({
      companyName: "Saporo",
      topic: "identity exposure examples",
      researchNotes:
        "## Topic Summary\nSummary.\n\n## Candidate Positions\n### P1: The links between directories carry the exposure\n- Supported by: Source #2\n\n## Subject Material\nMechanisms.",
      pageMd: "# Page spec\n\n- **Funnel:** TOFU\n\n## Rules for this page\n\n- **Closing CTA:** Download the overview\n\n## Format guide: Examples\n\nLONG GUIDE",
      companyPosition: "Saporo maps one graph across AD, Entra ID and AWS.",
      context: [],
      caseStudies: [],
    });
    expect(ctx).toContain("### P1: The links between directories carry the exposure");
    expect(ctx).toContain("## Subject Material");
    expect(ctx).toContain("Closing CTA:** Download the overview");
    expect(ctx).not.toContain("LONG GUIDE");
    expect(ctx).toContain("one graph across AD, Entra ID and AWS");
    expect(ctx).not.toContain("From the Strategist's outline");
  });

  it("renders the transcript with the captured checklist", () => {
    const at = new Date("2026-09-30T00:00:00Z");
    const md = renderTranscript({
      status: "complete",
      plan: "",
      messages: [
        { role: "assistant", content: "Q1", at },
        { role: "user", content: "A1", at },
      ],
      captured: { thesis: "The graph must be complete." },
      openedAt: at,
      completedAt: at,
    });
    expect(md).toContain("- Thesis: The graph must be complete.");
    expect(md).toContain("### Interviewer\n\nQ1");
    expect(md).toContain("### Expert\n\nA1");
  });
});

let mongod: MongoMemoryServer;
let db: EngineDb;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  db = await connect(mongod.getUri(), "interview_test");
}, 180_000);

afterAll(async () => {
  await db?.close();
  await mongod?.stop();
});

async function article(slug: string) {
  return createArticle(db, { companyId: "testco", slug, folder: `2026-09-30-${slug}`, topic: "Topic" });
}

/** Queue a run for the article and park it as worker w1 would (claimed, then awaiting input). */
async function parkedRun(articleId: ObjectId) {
  const run = await enqueueRun(db, { companyId: "testco", articleId });
  await db.runs.updateOne({ _id: run._id }, { $set: { status: "running", workerId: "w1", attempts: 1 } });
  expect(await awaitInput(db, run._id as ObjectId, "w1", "interview")).toBe(true);
  return run;
}

describe("run pause and resume (D59)", () => {
  it("a parked run is never claimed, and resumes at the interview with its attempt refunded", async () => {
    const a = await article("pause-resume");
    const run = await enqueueRun(db, { companyId: "testco", articleId: a._id as ObjectId });
    const claimed = await claimRun(db, "w1", 60_000);
    expect(claimed?.attempts).toBe(1);
    expect(await awaitInput(db, run._id as ObjectId, "w1", "interview")).toBe(true);

    const parked = await db.runs.findOne({ _id: run._id });
    expect(parked?.status).toBe("awaiting_input");
    expect(parked?.leaseUntil).toBeUndefined();
    expect(await claimRun(db, "w2", 60_000)).toBeNull();

    const resumed = await resumeRun(db, run._id as ObjectId);
    expect(resumed?.status).toBe("queued");
    expect(resumed?.fromStage).toBe("interview");
    expect(resumed?.attempts).toBe(0);
    expect(await resumeRun(db, run._id as ObjectId)).toBeNull();

    const reclaimed = await claimRun(db, "w2", 60_000);
    expect(reclaimed?.fromStage).toBe("interview");
  });

  it("only the lease holder can park a run", async () => {
    const a = await article("pause-lease");
    const run = await enqueueRun(db, { companyId: "testco", articleId: a._id as ObjectId });
    await db.runs.updateOne({ _id: run._id }, { $set: { status: "running", workerId: "w1" } });
    expect(await awaitInput(db, run._id as ObjectId, "other", "interview")).toBe(false);
  });

  it("a re-run cancels a run parked at the interview", async () => {
    const a = await article("pause-rerun");
    const run = await parkedRun(a._id as ObjectId);
    await enqueueRerun(db, a, "outline");
    expect((await db.runs.findOne({ _id: run._id }))?.status).toBe("canceled");
  });
});

describe("interview state (D59)", () => {
  it("open → expert message → reply → finish requeues the waiting run", async () => {
    const a = await article("interview-flow");
    const id = a._id as ObjectId;
    await parkedRun(id);

    await openInterview(db, id, { plan: "plan", opening: "Which is closest?", captured: { angle: "C" } });
    expect(await appendExpertMessage(db, id, "C, but sharper")).toBe(true);
    const fresh = await db.articles.findOne({ _id: id });
    await appendInterviewerReply(db, fresh!, "Finish this sentence…", { thesis: "T" }, 0.01);

    const open = await db.articles.findOne({ _id: id });
    expect(open?.interview?.messages.map((m) => m.role)).toEqual(["assistant", "user", "assistant"]);
    expect(open?.interview?.captured).toEqual({ angle: "C", thesis: "T" });
    expect(open?.interview?.costUsd).toBeCloseTo(0.01);

    const requeued = await closeInterview(db, open!, "complete");
    expect(requeued?.status).toBe("queued");
    const closed = await db.articles.findOne({ _id: id });
    expect(closed?.interview?.status).toBe("complete");
    expect(await appendExpertMessage(db, id, "late")).toBe(false);
    await expect(closeInterview(db, closed!, "skipped")).rejects.toThrow(/isn't open/);
    const events = await db.events.find({ articleId: id, type: "interview.completed" }).toArray();
    expect(events).toHaveLength(1);
  });

  it("interview mode: explicit, then plan, then company.yaml, then pause", async () => {
    expect(await defaultInterviewMode(db, "nobody")).toBe("pause");
    await db.companies.insertOne({
      companyId: "skipco",
      name: "Skip Co",
      config: { pipeline: { interview: "skip" } },
      configPath: "x",
      syncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await defaultInterviewMode(db, "skipco")).toBe("skip");
    const { article: made } = await enqueueArticlePipeline(db, { companyId: "skipco", topic: "Mode topic" });
    expect(made.interviewMode).toBe("skip");
    const { article: forced } = await enqueueArticlePipeline(db, {
      companyId: "skipco",
      topic: "Forced topic",
      interview: "pause",
    });
    expect(forced.interviewMode).toBe("pause");
  });
});

describe("repoFileReader (D59)", () => {
  it("saved files win over disk, tombstones hide disk, listings union both", async () => {
    const root = mkdtempSync(join(tmpdir(), "reader-"));
    mkdirSync(join(root, "context", "case-studies"), { recursive: true });
    writeFileSync(join(root, "context", "case-studies", "disk.md"), "disk copy");
    writeFileSync(join(root, "context", "case-studies", "gone.md"), "deleted in Admin");
    writeFileSync(join(root, "context", "case-studies", "both.md"), "stale disk");
    await saveRepoFile(db, "readerco", "context/case-studies/both.md", "admin copy");
    await saveRepoFile(db, "readerco", "context/case-studies/admin-only.md", "admin only");
    await deleteRepoFile(db, "readerco", "context/case-studies/gone.md");

    const reader = await repoFileReader(db, "readerco", root);
    expect(await reader.read("context/case-studies/both.md")).toBe("admin copy");
    expect(await reader.read("context/case-studies/gone.md")).toBeUndefined();
    expect(await reader.read("context/case-studies/disk.md")).toBe("disk copy");
    const listed = await reader.list("context/case-studies");
    expect(listed.map((f) => f.path)).toEqual([
      "context/case-studies/admin-only.md",
      "context/case-studies/both.md",
      "context/case-studies/disk.md",
    ]);
  });
});
