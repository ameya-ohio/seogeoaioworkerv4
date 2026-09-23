"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import {
  BriefNotFoundError,
  SlugTakenError,
  acceptSpokeBrief,
  enqueueArticlePipeline,
  enqueueClusterRun,
} from "@blogagent/engine";
import { requireAuth } from "../auth";
import { getCompany, getDb } from "../db";

export interface ClusterFormState {
  error?: string;
}

/**
 * Research tab (4D): queue a Topic & Cluster Generator run. The worker's
 * cluster queue picks it up; the UI follows along on the detail page.
 * Model tiers mirror the worker's env-driven defaults (D26) until Phase 10
 * moves routing into Mongo settings.
 */
export async function startClusterRun(
  _prev: ClusterFormState,
  formData: FormData,
): Promise<ClusterFormState> {
  await requireAuth();
  const seed = String(formData.get("seed") ?? "").trim();
  if (!seed) return { error: "Give the agent a seed — a topic, phrase, or keyword." };
  const kRaw = Number.parseInt(String(formData.get("k") ?? ""), 10);
  const db = await getDb();
  const cluster = await enqueueClusterRun(db, {
    companyId: getCompany().companyId,
    seed,
    k: Number.isFinite(kRaw) && kRaw >= 2 && kRaw <= 10 ? kRaw : 5,
    models: {
      main: process.env.CLUSTER_MODEL ?? "claude-sonnet-5",
      fanout: process.env.CLUSTER_FANOUT_MODEL ?? "claude-haiku-4-5-20251001",
    },
  });
  revalidatePath("/strategy");
  redirect(`/strategy/research/${cluster._id?.toHexString()}`);
}

export interface BriefActionState {
  error?: string;
  message?: string;
}

/** Accept a spoke brief into the keyword library; optionally queue the article. */
export async function acceptBrief(
  clusterId: string,
  themeName: string,
  queueArticle: boolean,
): Promise<BriefActionState> {
  await requireAuth();
  if (!ObjectId.isValid(clusterId)) return { error: "Bad cluster id." };
  const db = await getDb();
  const companyId = getCompany().companyId;
  try {
    const { keyword, brief, theme } = await acceptSpokeBrief(db, {
      companyId,
      clusterId: new ObjectId(clusterId),
      themeName,
    });
    let message = `"${keyword.text}" is in the library (idea).`;
    if (queueArticle) {
      const { article } = await enqueueArticlePipeline(db, {
        companyId,
        topic: brief.workingTitle,
        keyword: keyword.text,
        themeId: theme._id as ObjectId,
      });
      await db.keywords.updateOne(
        { _id: keyword._id },
        { $set: { status: "in_production", articleId: article._id, updatedAt: new Date() } },
      );
      message = `Queued "${article.slug}" with the brief attached.`;
    }
    revalidatePath(`/strategy/research/${clusterId}`);
    revalidatePath("/strategy");
    revalidatePath("/keywords");
    revalidatePath("/production");
    return { message };
  } catch (err) {
    if (err instanceof SlugTakenError || err instanceof BriefNotFoundError) {
      return { error: err.message };
    }
    throw err;
  }
}

/** Reject / restore a spoke brief in review (4D accept/reject). */
export async function setBriefDismissed(
  clusterId: string,
  themeName: string,
  dismissed: boolean,
): Promise<BriefActionState> {
  await requireAuth();
  if (!ObjectId.isValid(clusterId)) return { error: "Bad cluster id." };
  const db = await getDb();
  await db.clusters.updateOne(
    { _id: new ObjectId(clusterId), companyId: getCompany().companyId },
    dismissed
      ? { $addToSet: { dismissedBriefs: themeName }, $set: { updatedAt: new Date() } }
      : { $pull: { dismissedBriefs: themeName }, $set: { updatedAt: new Date() } },
  );
  revalidatePath(`/strategy/research/${clusterId}`);
  return { message: dismissed ? "Brief dismissed." : "Brief restored." };
}
