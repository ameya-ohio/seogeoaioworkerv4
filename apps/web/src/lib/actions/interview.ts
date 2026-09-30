"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { closeInterview } from "@blogagent/engine";
import { requireAuth } from "../auth";
import { getCompany, getDb } from "../db";

export interface InterviewActionState {
  error?: string;
  done?: boolean;
}

/**
 * D59: finish or skip the expert interview. Either way the waiting run goes
 * back in the queue: finished, it resumes by refining the outline from the
 * answers; skipped, it goes straight to the Writer.
 */
async function close(slug: string, outcome: "complete" | "skipped"): Promise<InterviewActionState> {
  await requireAuth();
  const db = await getDb();
  const article = await db.articles.findOne({ companyId: getCompany().companyId, slug });
  if (!article) return { error: `No article with slug ${slug}` };
  if (outcome === "complete" && !article.interview?.messages.some((m) => m.role === "user")) {
    return { error: "Answer at least one question before finishing — or skip the interview." };
  }
  try {
    const run = await closeInterview(db, article, outcome);
    if (!run) return { error: "The interview closed, but no run was waiting on it. Re-run from Interview in Review." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath("/production");
  revalidatePath(`/production/interview/${slug}`);
  revalidatePath(`/production/review/${slug}`);
  return { done: true };
}

export async function finishInterview(slug: string): Promise<InterviewActionState> {
  return close(slug, "complete");
}

export async function skipInterview(slug: string): Promise<InterviewActionState> {
  return close(slug, "skipped");
}

/** D59: whether a plan's articles stop for the interview (applies to articles queued from now on). */
export async function setPlanInterview(planId: string, mode: "pause" | "skip"): Promise<InterviewActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planId) || (mode !== "pause" && mode !== "skip")) return { error: "Bad request" };
  const db = await getDb();
  await db.plans.updateOne(
    { _id: new ObjectId(planId), companyId: getCompany().companyId },
    { $set: { interview: mode, updatedAt: new Date() } },
  );
  revalidatePath(`/plans/${planId}`);
  return { done: true };
}
