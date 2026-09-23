"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SlugTakenError, enqueueArticlePipeline } from "@blogagent/engine";
import { requireAuth } from "../auth";
import { parseChatPrompt } from "../chat";
import { getCompany, getDb } from "../db";

export interface ChatState {
  error?: string;
}

export async function enqueueFromChat(_prev: ChatState, formData: FormData): Promise<ChatState> {
  await requireAuth();
  const raw = String(formData.get("prompt") ?? "").trim();
  const keywordField = String(formData.get("keyword") ?? "").trim();
  if (!raw) return { error: "Describe the article you want." };

  const parsed = parseChatPrompt(raw);
  const keyword = keywordField || parsed.keyword;

  const db = await getDb();
  try {
    await enqueueArticlePipeline(db, {
      companyId: getCompany().companyId,
      topic: parsed.topic,
      ...(keyword ? { keyword } : {}),
    });
  } catch (err) {
    if (err instanceof SlugTakenError) return { error: err.message };
    throw err;
  }
  revalidatePath("/production");
  redirect("/production?tab=work");
}
