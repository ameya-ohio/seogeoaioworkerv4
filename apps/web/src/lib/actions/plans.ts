"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import {
  analyzePlan,
  commitPlan,
  createPlan,
  createSchedule,
  enqueuePlanItem,
  getPlan,
  getSchedule,
  listPlanItems,
  pauseSchedule,
  readWorkbook,
  remapValues,
  requestPlanEnrichment,
  resumeSchedule,
  runScheduleTick,
  SlugTakenError,
  suggestMapping,
  updatePlanMapping,
  updateSchedule,
  deletePlan as deletePlanDoc,
  type PlanItemStatus,
  type PlanMapping,
  type ParsedWorkbook,
} from "@blogagent/engine";
import { requireAuth } from "../auth";
import { getCompany, getDb } from "../db";

export interface PlanFormState {
  error?: string;
}
export interface PlanActionState {
  error?: string;
  message?: string;
}

function planPath(planId: string): string {
  return `/plans/${planId}`;
}

function revalidatePlan(planId?: string): void {
  revalidatePath("/plans");
  if (planId) revalidatePath(planPath(planId));
  revalidatePath("/production");
}

/** Rebuild the parsed workbook from what the plan already stored. */
function workbookFromPlan(sheets: ParsedWorkbook["sheets"], notes?: string): ParsedWorkbook {
  return { sheets, textSheets: notes ? { Notes: notes } : {} };
}

async function collisionContext() {
  const db = await getDb();
  const companyId = getCompany().companyId;
  const articles = await db.articles
    .find({ companyId })
    .project<{ slug: string; stage: string }>({ slug: 1, stage: 1 })
    .toArray();
  const keywords = await db.keywords
    .find({ companyId })
    .project<{ text: string; status: string }>({ text: 1, status: 1 })
    .toArray();
  return {
    takenSlugs: new Map(articles.map((a) => [a.slug, a.stage])),
    existingKeywords: new Map(keywords.map((k) => [k.text, k.status])),
  };
}

/**
 * Upload step. The file is parsed SERVER-side (the worker CLI needs the same
 * parser headlessly, and a 500-row grid should not round-trip through the
 * browser twice), so this takes the File straight off the FormData.
 */
export async function uploadPlan(
  _prev: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  await requireAuth();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an .xlsx or .csv file to upload." };
  }

  let planId: string;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = await readWorkbook(buf, file.name);
    const { mapping } = suggestMapping(wb);
    const { takenSlugs, existingKeywords } = await collisionContext();
    const company = getCompany();
    const analysis = analyzePlan({
      workbook: wb,
      mapping,
      companyName: company.companyName,
      takenSlugs,
      existingKeywords,
    });

    const db = await getDb();
    const plan = await createPlan(db, {
      companyId: company.companyId,
      filename: file.name,
      sheets: wb.sheets,
      mapping,
      taxonomy: analysis.taxonomy,
      concepts: analysis.concepts,
      ...(analysis.notes ? { notes: analysis.notes } : {}),
      report: analysis.report,
    });
    planId = plan._id?.toHexString() ?? "";
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read that file." };
  }

  revalidatePlan(planId);
  redirect(planPath(planId));
}

/** Re-analyze with an operator-adjusted mapping, without re-uploading. */
export async function updateMapping(
  planId: string,
  patch: { sheet?: string; columns?: Record<string, number | null> },
): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planId)) return { error: "bad plan id" };
  const db = await getDb();
  const id = new ObjectId(planId);
  const plan = await getPlan(db, id);
  if (!plan) return { error: "plan not found" };
  if (plan.status !== "draft") return { error: "this plan is already committed" };

  const columns: PlanMapping["columns"] = { ...plan.mapping.columns };
  for (const [field, col] of Object.entries(patch.columns ?? {})) {
    if (col === null) delete columns[field as keyof PlanMapping["columns"]];
    else columns[field as keyof PlanMapping["columns"]] = col;
  }
  let mapping: PlanMapping = { ...plan.mapping, columns };
  if (patch.sheet && patch.sheet !== plan.mapping.sheet) {
    // A different sheet means different headers: re-suggest rather than
    // carrying column indexes that pointed at another grid.
    const wb = workbookFromPlan(plan.sheets, plan.notes);
    const fresh = suggestMapping({ ...wb, sheets: wb.sheets.filter((s) => s.name === patch.sheet) });
    mapping = { ...fresh.mapping, sheet: patch.sheet };
  }
  mapping = remapValues(workbookFromPlan(plan.sheets, plan.notes), mapping);

  const { takenSlugs, existingKeywords } = await collisionContext();
  const analysis = analyzePlan({
    workbook: workbookFromPlan(plan.sheets, plan.notes),
    mapping,
    companyName: getCompany().companyName,
    takenSlugs,
    existingKeywords,
  });
  await updatePlanMapping(db, id, mapping, analysis.report);
  revalidatePlan(planId);
  return { message: `${analysis.report.mappedRows} rows mapped` };
}

/** Assign a facet value the auto-detection could not resolve. */
export async function setValueMapping(
  planId: string,
  field: "pageRole" | "funnel" | "priority" | "searchIntent",
  rawValue: string,
  canonical: string,
): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planId)) return { error: "bad plan id" };
  const db = await getDb();
  const id = new ObjectId(planId);
  const plan = await getPlan(db, id);
  if (!plan) return { error: "plan not found" };

  const values = {
    ...plan.mapping.values,
    [field]: {
      ...plan.mapping.values[field],
      [rawValue.toLowerCase()]: field === "priority" ? Number.parseInt(canonical, 10) : canonical,
    },
  } as PlanMapping["values"];
  const mapping: PlanMapping = { ...plan.mapping, values };

  const { takenSlugs, existingKeywords } = await collisionContext();
  const analysis = analyzePlan({
    workbook: workbookFromPlan(plan.sheets, plan.notes),
    mapping,
    companyName: getCompany().companyName,
    takenSlugs,
    existingKeywords,
  });
  await updatePlanMapping(db, id, mapping, analysis.report);
  revalidatePlan(planId);
  return { message: `${analysis.report.mappedRows} rows mapped` };
}

export async function commitPlanAction(
  planId: string,
  opts: { enrich: boolean },
): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planId)) return { error: "bad plan id" };
  const db = await getDb();
  const id = new ObjectId(planId);
  const plan = await getPlan(db, id);
  if (!plan) return { error: "plan not found" };

  const { takenSlugs, existingKeywords } = await collisionContext();
  const analysis = analyzePlan({
    workbook: workbookFromPlan(plan.sheets, plan.notes),
    mapping: plan.mapping,
    companyName: getCompany().companyName,
    takenSlugs,
    existingKeywords,
  });
  if (analysis.report.blocking.length > 0) {
    return { error: analysis.report.blocking.join(" ") };
  }
  try {
    const { itemCount } = await commitPlan(db, {
      companyId: getCompany().companyId,
      planId: id,
      items: analysis.items,
      report: analysis.report,
    });
    if (opts.enrich) await requestPlanEnrichment(db, id);
    revalidatePlan(planId);
    return {
      message:
        `Committed ${itemCount} planned articles` +
        (opts.enrich ? " — brief enrichment queued." : "."),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "commit failed" };
  }
}

export async function enrichPlan(planId: string, onlyFailed: boolean): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planId)) return { error: "bad plan id" };
  const db = await getDb();
  const n = await requestPlanEnrichment(db, new ObjectId(planId), { onlyFailed });
  revalidatePlan(planId);
  return { message: `Queued ${n} brief${n === 1 ? "" : "s"} for enrichment.` };
}

export async function deletePlan(planId: string): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planId)) return { error: "bad plan id" };
  const db = await getDb();
  const ok = await deletePlanDoc(db, new ObjectId(planId));
  revalidatePlan();
  return ok
    ? { message: "Draft deleted." }
    : { error: "Only a draft plan can be deleted — this one has committed items." };
}

// ── items ─────────────────────────────────────────────────────────────────

export async function setItemQueryTarget(
  planItemId: string,
  target: string,
): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planItemId)) return { error: "bad item id" };
  const text = target.trim().toLowerCase();
  if (!text) return { error: "a keyword target cannot be empty" };
  if (text.split(/\s+/).length > 7) {
    return { error: "a keyword target should read like a real query — 7 words at most" };
  }
  const db = await getDb();
  const id = new ObjectId(planItemId);
  const item = await db.planItems.findOne({ _id: id });
  if (!item) return { error: "item not found" };
  if (item.articleId) return { error: "this item is already in production" };

  await db.planItems.updateOne(
    { _id: id },
    {
      $set: {
        primaryQueryTarget: text,
        needsQueryTarget: false,
        "brief.primaryQueryTarget": text,
        updatedAt: new Date(),
      },
    },
  );
  revalidatePlan(item.planId.toHexString());
  return { message: `Target set to "${text}".` };
}

export async function setItemStatus(
  planItemId: string,
  status: PlanItemStatus,
): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planItemId)) return { error: "bad item id" };
  const db = await getDb();
  const id = new ObjectId(planItemId);
  const item = await db.planItems.findOne({ _id: id });
  if (!item) return { error: "item not found" };

  const patch: Record<string, unknown> = { status, updatedAt: new Date() };
  // "Retry now" clears the backoff as well as the status.
  if (status === "planned") {
    patch.failureCount = 0;
    await db.planItems.updateOne({ _id: id }, { $unset: { retryAfter: "", lastError: "" } });
  }
  // A skipped parent must not leave its children pointing at a page that will
  // never exist.
  if (status === "skipped") {
    await db.planItems.updateMany({ parentItemId: id }, { $set: { parentSkipped: true } });
  }
  await db.planItems.updateOne({ _id: id }, { $set: patch });
  revalidatePlan(item.planId.toHexString());
  return { message: `Marked ${status}.` };
}

export async function overrideItemDependency(
  planItemId: string,
  override: boolean,
): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planItemId)) return { error: "bad item id" };
  const db = await getDb();
  const id = new ObjectId(planItemId);
  const item = await db.planItems.findOne({ _id: id });
  if (!item) return { error: "item not found" };
  await db.planItems.updateOne(
    { _id: id },
    { $set: { dependencyOverride: override, updatedAt: new Date() } },
  );
  revalidatePlan(item.planId.toHexString());
  return {
    message: override
      ? "This article will be produced without waiting for its parent page."
      : "Dependency restored.",
  };
}

export interface SendPlanResult {
  sent: string[];
  errors: { slug: string; message: string }[];
}

/** Manual send — the same engine operation the scheduler uses. */
export async function sendPlanItemsToPipeline(ids: string[]): Promise<SendPlanResult> {
  await requireAuth();
  const db = await getDb();
  const companyId = getCompany().companyId;
  const result: SendPlanResult = { sent: [], errors: [] };
  let planId: string | undefined;

  for (const raw of ids) {
    if (!ObjectId.isValid(raw)) continue;
    const id = new ObjectId(raw);
    const item = await db.planItems.findOne({ _id: id });
    if (!item) continue;
    planId = item.planId.toHexString();
    if (item.articleId) {
      result.errors.push({ slug: item.slug, message: "already in production" });
      continue;
    }
    try {
      await enqueuePlanItem(db, { companyId, planItemId: id });
      result.sent.push(item.slug);
    } catch (err) {
      result.errors.push({
        slug: item.slug,
        message: err instanceof SlugTakenError ? err.message : "failed to queue",
      });
      if (!(err instanceof SlugTakenError)) throw err;
    }
  }
  revalidatePlan(planId);
  return result;
}

// ── schedule ──────────────────────────────────────────────────────────────

export async function saveSchedule(
  planId: string,
  form: {
    timezone: string;
    daysOfWeek: number[];
    timeOfDay: string;
    batchSize: number;
    maxInFlight: number;
    maxAwaitingReview: number;
    maxTotalArticles?: number | null;
    maxCostUsd?: number | null;
    requireApproval: boolean;
  },
): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planId)) return { error: "bad plan id" };
  const db = await getDb();
  const id = new ObjectId(planId);
  const plan = await getPlan(db, id);
  if (!plan) return { error: "plan not found" };

  const cadence = {
    timezone: form.timezone,
    daysOfWeek: form.daysOfWeek,
    timeOfDay: form.timeOfDay,
    batchSize: form.batchSize,
  };
  const limits = {
    maxInFlight: form.maxInFlight,
    maxAwaitingReview: form.maxAwaitingReview,
    ...(form.maxTotalArticles ? { maxTotalArticles: form.maxTotalArticles } : {}),
    ...(form.maxCostUsd ? { maxCostUsd: form.maxCostUsd } : {}),
  };

  try {
    const existing = await getSchedule(db, id);
    if (existing) {
      await updateSchedule(db, id, { cadence, limits, requireApproval: form.requireApproval });
    } else {
      await createSchedule(db, {
        companyId: getCompany().companyId,
        planId: id,
        name: plan.filename,
        cadence,
        limits,
        requireApproval: form.requireApproval,
      });
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "could not save the cadence" };
  }
  revalidatePlan(planId);
  return { message: "Cadence saved." };
}

export async function startSchedule(planId: string): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planId)) return { error: "bad plan id" };
  const db = await getDb();
  try {
    const s = await resumeSchedule(db, new ObjectId(planId));
    revalidatePlan(planId);
    return { message: `Running. Next article at ${s?.nextFireAt?.toLocaleString() ?? "—"}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "could not start" };
  }
}

export async function stopSchedule(planId: string): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planId)) return { error: "bad plan id" };
  const db = await getDb();
  await pauseSchedule(db, new ObjectId(planId), "operator", "paused from the plan board");
  revalidatePlan(planId);
  return { message: "Paused. Nothing in flight is cancelled." };
}

/** "Run now" — one tick, immediately, without waiting for the next fire. */
export async function runScheduleNow(planId: string): Promise<PlanActionState> {
  await requireAuth();
  if (!ObjectId.isValid(planId)) return { error: "bad plan id" };
  const db = await getDb();
  const id = new ObjectId(planId);
  const schedule = await getSchedule(db, id);
  if (!schedule) return { error: "create a cadence first" };
  if (schedule.status !== "active") return { error: "the cadence is paused — start it first" };

  await db.schedules.updateOne({ planId: id }, { $set: { nextFireAt: new Date(Date.now() - 1000) } });
  const outcome = await runScheduleTick({
    db,
    companyId: getCompany().companyId,
    workerId: "web-run-now",
    leaseMs: 120_000,
    heartbeatMs: 300_000,
  });
  revalidatePlan(planId);
  if (outcome.status === "enqueued") {
    return { message: `Queued ${outcome.enqueued.length}: ${outcome.enqueued.map((e) => e.slug).join(", ")}` };
  }
  if (outcome.status === "throttled") {
    return { message: `Held by ${outcome.binding ?? "a limit"} — this slot is skipped, not owed.` };
  }
  return { message: outcome.detail ?? outcome.status.replace(/_/g, " ") };
}
