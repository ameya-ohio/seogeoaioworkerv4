import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ObjectId } from "mongodb";
import {
  applyEnrichment,
  completePlanEnrichment,
  emitPlanEvent,
  failPlanEnrichment,
  fillPassage,
  formatBySlug,
  loadFormatRegistry,
  parsePlanEnrichment,
  researchModeFor,
  renderBriefMarkdown,
  type EngineDb,
  type EnrichmentAllowlist,
  type FormatRegistry,
  type PlanDoc,
  type PlanItemDoc,
} from "@blogagent/engine";
import { applyRepoFiles } from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";
import type { LlmClient } from "./llm.js";

/**
 * The brief-enrichment pass over a committed plan.
 *
 * The work is N INDEPENDENT calls, not a sequence of stages, so resume is a
 * query rather than a checkpoint: the loop simply asks for the next items
 * still marked pending. A crash loses at most one batch, and re-running the
 * job continues exactly where it stopped without any bookkeeping.
 *
 * Every item already has a complete deterministic brief. Enrichment is
 * therefore strictly optional: an item that fails here stays producible, and
 * the failure is recorded rather than retried forever.
 */

export interface PlanDeps {
  db: EngineDb;
  cfg: WorkerConfig;
  llm: LlmClient;
  log: (msg: string) => void;
}

const SPEC_FILE = "agents/plan-brief-enricher.md";

/**
 * D60: what this page's research mode says it is built from — so the
 * enricher's external_evidence requirements describe commands for a how-to
 * and mechanisms for an explainer, not "a dated statistic" for everything.
 */
export function researchNeedsFor(item: PlanItemDoc, formats: FormatRegistry | undefined): { mode: string; needs: string[] } | null {
  if (!formats) return null;
  const format = formatBySlug(formats, item.brief.page?.articleType ?? item.articleType);
  const mode = researchModeFor(formats, format);
  const vars = { subject: item.subtopicName ?? item.pillarName, title: item.title };
  return { mode: mode.label, needs: mode.briefEvidence.map((r) => fillPassage(r, vars)) };
}

function buildPrompt(item: PlanItemDoc, allowed: EnrichmentAllowlist, formats?: FormatRegistry): string {
  const brief = item.brief;
  const research = researchNeedsFor(item, formats);
  return [
    `Enrich the brief for this planned article. Return JSON only.`,
    ``,
    `## The row`,
    `- id: ${item.externalId}`,
    `- title: ${item.title}`,
    `- pillar: ${item.pillarName}`,
    `- subtopic: ${item.subtopicName ?? "(none — this is a pillar page)"}`,
    `- page role: ${item.pageRole}${item.pageRole !== "cluster" ? " (ROUTING PAGE)" : ""}`,
    `- format: ${item.format || "(unspecified)"}`,
    `- funnel stage: ${item.funnel}`,
    `- search intent: ${item.searchIntent}`,
    `- priority: P${item.priority}`,
    ...(item.sourcePages.length ? [`- source pages: ${item.sourcePages.join(", ")}`] : []),
    ``,
    `## Company position (the pillar's — context, not this page's angle)`,
    // Briefs synthesized before D60 carried the pillar text in differentiationAngle.
    brief.companyPosition || brief.differentiationAngle || "(none supplied)",
    ``,
    ...(research
      ? [
          `## What this kind of page is built from (research mode: ${research.mode})`,
          `Base external_evidence on these, made specific to this row. Ask for a statistic only where the`,
          `page's argument would turn on one.`,
          ...research.needs.map((n) => `- ${n}`),
          ``,
        ]
      : []),
    `## Concept list — the ONLY proprietary claims you may name`,
    ...(allowed.concepts.length
      ? allowed.concepts.map((c) => `- ${c}`)
      : ["(none — return an empty proprietary_evidence array)"]),
    ``,
    `## Link allowlist — the ONLY pages you may reference`,
    `- hub: ${allowed.hub || "(none — this page has no parent)"}`,
    ...allowed.siblings.map((s) => `- sibling: ${s}`),
    ...allowed.children.map((c) => `- child: ${c}`),
    ``,
    `## Fixed — do not change these`,
    `- length band: ${brief.lengthBand.min}-${brief.lengthBand.max} words`,
    `- schema: ${brief.schemaTypes.join(", ")}`,
    ``,
    `## The deterministic brief you are improving`,
    `- current query target: ${brief.primaryQueryTarget}${
      item.needsQueryTarget ? "  <- WEAK, derived from a fallback; propose a better one" : ""
    }`,
    `- current persona: ${brief.persona}`,
    `- current required passages:`,
    ...brief.h2Outline.map((h) => `  - ${h}`),
    ``,
    `Return the JSON object described in your spec. No prose.`,
  ].join("\n");
}

async function enrichOne(
  deps: PlanDeps,
  plan: PlanDoc,
  item: PlanItemDoc,
  spec: string,
  formats?: FormatRegistry,
): Promise<{ inputTokens: number; outputTokens: number; calls: number }> {
  const itemId = item._id as ObjectId;
  const allowed: EnrichmentAllowlist = {
    hub: item.brief.internalLinks.hub,
    siblings: item.brief.internalLinks.siblings,
    children: item.brief.internalLinks.children ?? [],
    concepts: item.brief.evidence.proprietary,
  };

  let inputTokens = 0;
  let outputTokens = 0;
  let calls = 0;
  let feedback = "";

  // One retry with the problems fed back, then degrade. Two attempts is the
  // same budget the pipeline's gates use.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = feedback
      ? `${buildPrompt(item, allowed, formats)}\n\n## Your previous answer was rejected\n${feedback}\n\nFix these and return JSON only.`
      : buildPrompt(item, allowed, formats);

    const res = await deps.llm.complete({
      model: deps.cfg.plan.enrichModel,
      system: spec,
      prompt,
      maxTokens: 4096,
    });
    calls++;
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;

    const parsed = parsePlanEnrichment(res.text, allowed);
    if (parsed.value) {
      const enriched = applyEnrichment(item.brief, parsed.value);
      const { markdown: _ignored, ...withoutMarkdown } = enriched;
      const brief = { ...enriched, markdown: renderBriefMarkdown(withoutMarkdown) };
      await deps.db.planItems.updateOne(
        { _id: itemId },
        {
          $set: {
            brief,
            primaryQueryTarget: brief.primaryQueryTarget,
            // The enricher proposing a real query resolves the flag the
            // deterministic derivation raised.
            needsQueryTarget: false,
            enrichment: "done",
            enrichedAt: new Date(),
            updatedAt: new Date(),
          },
          $unset: { enrichmentProblems: "" },
        },
      );
      return { inputTokens, outputTokens, calls };
    }
    feedback = parsed.problems.map((p) => `- ${p}`).join("\n");
    if (attempt === 2) {
      // Degrade, loudly but harmlessly: the deterministic brief stands and the
      // item remains fully producible.
      await deps.db.planItems.updateOne(
        { _id: itemId },
        {
          $set: {
            enrichment: "failed",
            enrichmentProblems: parsed.problems,
            updatedAt: new Date(),
          },
        },
      );
      await emitPlanEvent(deps.db, {
        companyId: plan.companyId,
        planId: plan._id as ObjectId,
        planItemId: itemId,
        type: "item.enrich.failed",
        message: `Kept the deterministic brief for "${item.title}" — ${parsed.problems[0] ?? "unparseable response"}`,
        data: { problems: parsed.problems },
      });
    }
  }
  return { inputTokens, outputTokens, calls };
}

export async function runPlanEnrichment(deps: PlanDeps, plan: PlanDoc): Promise<void> {
  const planId = plan._id as ObjectId;
  await applyRepoFiles(deps.db, plan.companyId, deps.cfg.repoRoot);
  const spec = await readFile(join(deps.cfg.repoRoot, SPEC_FILE), "utf-8");
  const concurrency = Math.max(1, deps.cfg.plan.concurrency);
  let formats: FormatRegistry | undefined;
  try {
    formats = loadFormatRegistry(deps.cfg.repoRoot);
  } catch {
    formats = undefined; // the enricher still runs, without the research-mode hints
  }

  await emitPlanEvent(deps.db, {
    companyId: plan.companyId,
    planId,
    type: "plan.enrich.started",
    message: `Enriching briefs on ${deps.cfg.plan.enrichModel}`,
  });

  const usage = { llmCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  let processed = 0;

  try {
    for (;;) {
      // Resume IS this query: whatever is still pending. D60: items queued
      // for build go first (they wait on this), then plan order.
      const batch = await deps.db.planItems
        .find({ planId, enrichment: "pending" })
        .sort({ buildQueuedAt: -1, sequence: 1 })
        .limit(concurrency)
        .toArray();
      if (batch.length === 0) break;

      const results = await Promise.allSettled(
        batch.map((item) => enrichOne(deps, plan, item, spec, formats)),
      );
      for (const [i, r] of results.entries()) {
        if (r.status === "fulfilled") {
          usage.llmCalls += r.value.calls;
          usage.inputTokens += r.value.inputTokens;
          usage.outputTokens += r.value.outputTokens;
        } else {
          // A transport failure, not a content failure: mark it failed so the
          // loop cannot spin forever on the same item.
          const item = batch[i];
          if (item?._id) {
            await deps.db.planItems.updateOne(
              { _id: item._id },
              {
                $set: {
                  enrichment: "failed",
                  enrichmentProblems: [String(r.reason)],
                  updatedAt: new Date(),
                },
              },
            );
          }
          deps.log(`plan enrichment call failed: ${String(r.reason)}`);
        }
      }
      processed += batch.length;

      if (processed % 25 < concurrency) {
        const remaining = await deps.db.planItems.countDocuments({ planId, enrichment: "pending" });
        await emitPlanEvent(deps.db, {
          companyId: plan.companyId,
          planId,
          type: "plan.enrich.progress",
          message: `${processed} enriched, ${remaining} to go`,
          data: { processed, remaining },
        });
      }
    }

    await completePlanEnrichment(deps.db, planId, usage);
    const failed = await deps.db.planItems.countDocuments({ planId, enrichment: "failed" });
    await emitPlanEvent(deps.db, {
      companyId: plan.companyId,
      planId,
      type: "plan.enrich.succeeded",
      message:
        `Enriched ${processed - failed} of ${processed} briefs` +
        (failed > 0 ? ` — ${failed} kept their deterministic brief` : ""),
      data: { processed, failed, usage },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failPlanEnrichment(deps.db, plan, message);
    await emitPlanEvent(deps.db, {
      companyId: plan.companyId,
      planId,
      type: "plan.enrich.failed",
      message,
    });
    throw err;
  }
}
