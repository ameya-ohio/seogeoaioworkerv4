"use server";

import { revalidatePath } from "next/cache";
import {
  CTA_SETTINGS_KEY,
  ctaUrlProblem,
  mergeCtaSettings,
  parseCtaSettings,
  type CtaSettings,
} from "@blogagent/engine";
import { requireAuth } from "../auth";
import { getCompany, getDb } from "../db";

/**
 * Admin › CTAs (D50): the closing call to action for each funnel stage.
 * company.yaml `ctas:` is the seed; a save here stores the whole set in the
 * `settings` collection, which the worker reads at the start of every run.
 */

export interface CtaFormState {
  error?: string;
  message?: string;
}

const STAGES = ["tofu", "mofu", "bofu"] as const;

/** The effective CTAs (saved over seeded) plus which stages have a saved override. */
export async function getCtaSettings(): Promise<{ ctas: CtaSettings; saved: boolean; updatedAt?: string }> {
  await requireAuth();
  const db = await getDb();
  const company = getCompany();
  const doc = await db.settings.findOne({ companyId: company.companyId, key: CTA_SETTINGS_KEY });
  return {
    ctas: mergeCtaSettings(company.raw, doc?.value),
    saved: Boolean(doc),
    ...(doc?.updatedAt ? { updatedAt: doc.updatedAt.toISOString() } : {}),
  };
}

export async function saveCtaSettings(_prev: CtaFormState, form: FormData): Promise<CtaFormState> {
  await requireAuth();
  const value: Record<string, { label: string; url: string; blurb?: string }> = {};
  for (const stage of STAGES) {
    const url = String(form.get(`${stage}.url`) ?? "").trim();
    const label = String(form.get(`${stage}.label`) ?? "").trim();
    const blurb = String(form.get(`${stage}.blurb`) ?? "").trim();
    const problem = ctaUrlProblem(url);
    if (problem) return { error: `${stage.toUpperCase()} URL ${problem}.` };
    if (!url) return { error: `${stage.toUpperCase()} needs a URL — every page's close links its funnel's CTA.` };
    value[stage] = { label: label || url, url, ...(blurb ? { blurb } : {}) };
  }
  const db = await getDb();
  const companyId = getCompany().companyId;
  await db.settings.updateOne(
    { companyId, key: CTA_SETTINGS_KEY },
    { $set: { value: parseCtaSettings(value), updatedAt: new Date() }, $setOnInsert: { companyId, key: CTA_SETTINGS_KEY } },
    { upsert: true },
  );
  revalidatePath("/admin");
  return { message: "Saved. The next article run uses these CTAs." };
}

/** Drop the saved override so company.yaml's `ctas:` applies again. */
export async function resetCtaSettings(): Promise<CtaFormState> {
  await requireAuth();
  const db = await getDb();
  await db.settings.deleteOne({ companyId: getCompany().companyId, key: CTA_SETTINGS_KEY });
  revalidatePath("/admin");
  return { message: "Reset to the company.yaml defaults." };
}
