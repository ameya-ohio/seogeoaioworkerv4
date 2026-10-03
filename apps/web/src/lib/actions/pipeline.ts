"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SlugTakenError, enqueueArticlePipeline } from "@blogagent/engine";
import { requireAuth } from "../auth";
import { parseChatPrompt } from "../chat";
import { getCompany, getDb } from "../db";

export interface ChatState {
  error?: string;
  /** Set when the form asked to stay on the page (`stay`) instead of redirecting. */
  queued?: { topic: string; slug: string; at: number };
}

export async function enqueueFromChat(_prev: ChatState, formData: FormData): Promise<ChatState> {
  await requireAuth();
  const raw = String(formData.get("prompt") ?? "").trim();
  const keywordField = String(formData.get("keyword") ?? "").trim();
  if (!raw) return { error: "Describe the article you want." };

  const parsed = parseChatPrompt(raw);
  const keyword = keywordField || parsed.keyword;

  const db = await getDb();
  let slug = "";
  try {
    const { article } = await enqueueArticlePipeline(db, {
      companyId: getCompany().companyId,
      topic: parsed.topic,
      ...(keyword ? { keyword } : {}),
      // Unchecked: the company default (company.yaml pipeline.interview), which is pause.
      ...(formData.get("skipInterview") ? { interview: "skip" as const } : {}),
    });
    slug = article.slug;
  } catch (err) {
    if (err instanceof SlugTakenError) return { error: err.message };
    throw err;
  }
  revalidatePath("/production");
  // The Strategy composer stays put and confirms with a toast.
  if (formData.get("stay")) {
    revalidatePath("/strategy");
    return { queued: { topic: parsed.topic, slug, at: Date.now() } };
  }
  redirect("/production?tab=work");
}
