import { runScheduleTick, type EngineDb, type TickOutcome } from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";
import type { QueueController } from "./queue.js";

/**
 * The cadence loop — the fifth queue.
 *
 * It lives in the worker rather than in a platform cron for three reasons:
 * the worker is already running and already holds the Mongo connection and
 * company config a tick needs; a cron service would be a second deployable
 * that can silently drift out of sync with this one; and a `while` loop with
 * an awaited body cannot overlap itself the way a naive interval can.
 *
 * It holds no leadership state of its own: `runScheduleTick` claims the
 * schedule document atomically, so any number of workers can run this loop
 * and exactly one will serve a given fire.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ScheduleDeps {
  db: EngineDb;
  cfg: WorkerConfig;
  companyId: string;
  log: (msg: string) => void;
}

function describe(outcome: TickOutcome): string {
  switch (outcome.status) {
    case "enqueued":
      return `queued ${outcome.enqueued.length}: ${outcome.enqueued
        .map((e) => `#${e.sequence} ${e.slug}`)
        .join(", ")}`;
    case "throttled":
      return `fire held by ${outcome.binding ?? "a limit"} — slot skipped, not owed`;
    case "nothing_ready":
      return "nothing ready — every candidate is waiting on a parent";
    case "paused":
      return `PAUSED — ${outcome.detail ?? "see the plan board"}`;
    case "completed":
      return `COMPLETED — ${outcome.detail ?? "plan finished"}`;
    default:
      return outcome.status;
  }
}

export function startScheduleQueue(deps: ScheduleDeps): QueueController {
  const { cfg } = deps;
  let stopping = false;

  const loop = (async () => {
    deps.log(
      `schedule queue started (worker ${cfg.workerId}, poll=${cfg.schedule.pollIntervalMs}ms` +
        `${cfg.schedule.dryRun ? ", DRY RUN" : ""})`,
    );
    while (!stopping) {
      try {
        const tick = runScheduleTick({
          db: deps.db,
          companyId: deps.companyId,
          workerId: cfg.workerId,
          leaseMs: cfg.leaseMs,
          heartbeatMs: cfg.heartbeatMs,
          maxRunAttempts: cfg.maxRunAttempts,
          dryRun: cfg.schedule.dryRun,
          log: deps.log,
        });
        const outcome = await tick;
        if (outcome.status !== "no_work") {
          deps.log(`schedule tick (plan ${outcome.planId}): ${describe(outcome)}`);
        }
        // A tick that did work may have freed capacity; poll again promptly
        // only when there was nothing to do.
        if (outcome.status === "no_work") await sleep(cfg.schedule.pollIntervalMs);
        continue;
      } catch (err) {
        deps.log(`schedule tick error: ${err instanceof Error ? err.message : err}`);
      }
      await sleep(cfg.schedule.pollIntervalMs);
    }
    // Every tick is awaited inside the loop, so stop() has nothing to drain
    // beyond the loop promise itself.
  })();

  return {
    async stop() {
      stopping = true;
      await loop;
    },
  };
}
