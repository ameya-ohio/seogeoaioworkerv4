"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { InvalidScrapeUrlError, enqueueScrapeRun } from "@blogagent/engine";
import { requireAuth } from "../auth";
import { getCompany, getDb } from "../db";

export interface ScrapeFormState {
  error?: string;
}

/**
 * Admin › Competitive (6.2): queue a competitor blog scrape. The worker's
 * scrape queue crawls it, builds the topic index, and stores the corpus;
 * the UI follows along on the detail view.
 */
export async function startScrapeRun(
  _prev: ScrapeFormState,
  formData: FormData,
): Promise<ScrapeFormState> {
  await requireAuth();
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { error: "Paste the competitor's blog index URL." };
  const maxRaw = Number.parseInt(String(formData.get("maxArticles") ?? ""), 10);
  const db = await getDb();
  let scrapeId: string | undefined;
  try {
    const scrape = await enqueueScrapeRun(db, {
      companyId: getCompany().companyId,
      url,
      options: {
        useBrowser: formData.get("useBrowser") === "on",
        withImages: formData.get("withImages") === "on",
        ...(Number.isFinite(maxRaw) && maxRaw > 0 ? { maxArticles: maxRaw } : {}),
      },
    });
    scrapeId = scrape._id?.toHexString();
  } catch (err) {
    if (err instanceof InvalidScrapeUrlError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin");
  redirect(`/admin?tab=competitive&scrape=${scrapeId}`);
}
