import type { ObjectId } from "mongodb";
import type { EngineDb } from "../db.js";
import type { ArticleDoc, ArticleInterview, InterviewCaptured, RunDoc } from "../types.js";
import { mergeCaptured } from "../interview.js";
import { emitEvent } from "./events.js";
import { resumeRun } from "./runs.js";

/**
 * D59 interview state on the article doc. The worker opens it (plan +
 * opening question), the web chat appends turns, and closing it requeues
 * the run that is waiting at the interview stage.
 */

export async function openInterview(
  db: EngineDb,
  articleId: ObjectId,
  input: { runId?: ObjectId; plan: string; opening: string; captured?: InterviewCaptured; costUsd?: number; basis?: "research" },
): Promise<ArticleInterview> {
  const now = new Date();
  const interview: ArticleInterview = {
    status: "open",
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.basis ? { basis: input.basis } : {}),
    plan: input.plan,
    messages: [{ role: "assistant", content: input.opening, at: now }],
    captured: input.captured ?? {},
    openedAt: now,
    ...(input.costUsd !== undefined ? { costUsd: input.costUsd } : {}),
  };
  await db.articles.updateOne({ _id: articleId }, { $set: { interview, updatedAt: now } });
  return interview;
}

/** Record the expert's message before the reply streams, so a failed reply loses nothing. */
export async function appendExpertMessage(db: EngineDb, articleId: ObjectId, content: string): Promise<boolean> {
  const now = new Date();
  const res = await db.articles.updateOne(
    { _id: articleId, "interview.status": "open" },
    { $push: { "interview.messages": { role: "user", content, at: now } }, $set: { updatedAt: now } },
  );
  return res.modifiedCount === 1;
}

export async function appendInterviewerReply(
  db: EngineDb,
  article: ArticleDoc,
  content: string,
  captured: InterviewCaptured | undefined,
  costUsd?: number,
): Promise<void> {
  if (!article._id || !article.interview) return;
  const now = new Date();
  await db.articles.updateOne(
    { _id: article._id, "interview.status": "open" },
    {
      $push: { "interview.messages": { role: "assistant", content, at: now } },
      $set: {
        "interview.captured": mergeCaptured(article.interview.captured, captured),
        updatedAt: now,
      },
      ...(costUsd !== undefined ? { $inc: { "interview.costUsd": costUsd } } : {}),
    },
  );
}

/**
 * Finish or skip the interview and put the waiting run back in the queue;
 * it resumes at the interview stage, where the POV writer runs (or, skipped,
 * passes straight through to the Writer). Returns the requeued run.
 */
export async function closeInterview(
  db: EngineDb,
  article: ArticleDoc,
  outcome: "complete" | "skipped",
): Promise<RunDoc | null> {
  if (!article._id) throw new Error("article has no _id");
  const now = new Date();
  const res = await db.articles.updateOne(
    { _id: article._id, "interview.status": "open" },
    { $set: { "interview.status": outcome, "interview.completedAt": now, updatedAt: now } },
  );
  if (res.modifiedCount !== 1) throw new Error("This interview isn't open.");
  const waiting = await db.runs.findOne(
    { articleId: article._id, status: "awaiting_input" },
    { sort: { createdAt: -1 } },
  );
  const run = waiting?._id ? await resumeRun(db, waiting._id) : null;
  if (run?._id) {
    const turns = article.interview?.messages.filter((m) => m.role === "user").length ?? 0;
    await emitEvent(db, {
      companyId: article.companyId,
      runId: run._id,
      articleId: article._id,
      type: outcome === "complete" ? "interview.completed" : "interview.skipped",
      message:
        outcome === "complete"
          ? `Interview finished (${turns} answer${turns === 1 ? "" : "s"}) — run requeued to refine the outline`
          : "Interview skipped — run requeued at the Writer",
    });
  }
  return run;
}

/** The POV writer wrote pov.md from this interview (the gate passed). */
export async function markInterviewRefined(db: EngineDb, articleId: ObjectId): Promise<void> {
  const now = new Date();
  await db.articles.updateOne(
    { _id: articleId, "interview.status": "complete" },
    { $set: { "interview.status": "refined", "interview.refinedAt": now, updatedAt: now } },
  );
}
