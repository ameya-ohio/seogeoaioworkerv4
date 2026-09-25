import { claimPlanEnrichment, heartbeatPlan, type PlanDoc } from "@blogagent/engine";
import { runPlanEnrichment, type PlanDeps } from "./planRunner.js";
import type { QueueController } from "./queue.js";

/**
 * Plan brief-enrichment claim loop — the fourth queue, with the same
 * lease/heartbeat semantics as runs, clusters and scrapes. One plan at a
 * time per worker; the parallelism that matters is inside the runner, across
 * that plan's items.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function processPlan(deps: PlanDeps, plan: PlanDoc): Promise<void> {
  const planId = plan._id;
  if (!planId) return;
  const beat = setInterval(() => {
    void heartbeatPlan(deps.db, planId, deps.cfg.workerId, deps.cfg.leaseMs).then((ok) => {
      if (!ok) deps.log(`lost lease on plan ${planId.toHexString()}`);
    });
  }, deps.cfg.heartbeatMs);
  try {
    await runPlanEnrichment(deps, plan);
    deps.log(`plan ${planId.toHexString()} enrichment finished`);
  } catch (err) {
    deps.log(
      `plan ${planId.toHexString()} enrichment errored: ${err instanceof Error ? err.message : err}`,
    );
  } finally {
    clearInterval(beat);
  }
}

export function startPlanQueue(deps: PlanDeps): QueueController {
  const { db, cfg } = deps;
  let stopping = false;
  let active: Promise<void> | null = null;

  const loop = (async () => {
    deps.log(`plan queue started (worker ${cfg.workerId})`);
    while (!stopping) {
      let plan: PlanDoc | null = null;
      try {
        plan = await claimPlanEnrichment(db, cfg.workerId, cfg.leaseMs);
      } catch (err) {
        deps.log(`plan claim error: ${err instanceof Error ? err.message : err}`);
      }
      if (!plan) {
        await sleep(cfg.pollIntervalMs);
        continue;
      }
      deps.log(`claimed plan ${plan._id?.toHexString()} for enrichment`);
      active = processPlan(deps, plan);
      await active;
      active = null;
    }
    if (active) await active;
  })();

  return {
    async stop() {
      stopping = true;
      await loop;
    },
  };
}
