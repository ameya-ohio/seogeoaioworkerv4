import { contextFileChecker, runBuildSweep, type EngineDb } from "@blogagent/engine";
import type { WorkerConfig } from "./config.js";
import type { QueueController } from "./queue.js";

/**
 * The build loop: operator-queued subtopics and pillars, produced bottom-up.
 *
 * Separate from the cadence loop because it is on by default. The cadence is
 * off unless switched on, since a scheduler that starts firing on deploy
 * spends money nobody asked for; a build is exactly what someone asked for,
 * in the Articles tab. This loop is what moves a hub into production once its
 * last cluster article reaches review, and a pillar page once its last hub
 * does, so it polls on the cadence interval.
 *
 * Like the tick, every enqueue is a compare-and-set on the plan item, so any
 * number of workers can run it.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface BuildDeps {
  db: EngineDb;
  cfg: WorkerConfig;
  companyId: string;
  log: (msg: string) => void;
}

export function startBuildQueue(deps: BuildDeps): QueueController {
  const { cfg } = deps;
  let stopping = false;

  const loop = (async () => {
    deps.log(`build queue started (worker ${cfg.workerId}, poll=${cfg.schedule.pollIntervalMs}ms)`);
    while (!stopping) {
      let built = 0;
      try {
        const outcomes = await runBuildSweep({
          db: deps.db,
          companyId: deps.companyId,
          maxRunAttempts: cfg.maxRunAttempts,
          // D51: a fact sheet saved in Admin → Context releases its item.
          contextFileExists: await contextFileChecker(deps.db, deps.companyId, cfg.repoRoot),
          log: deps.log,
        });
        built = outcomes.reduce((n, o) => n + o.enqueued.length, 0);
      } catch (err) {
        deps.log(`build sweep error: ${err instanceof Error ? err.message : err}`);
      }
      // Work queued may have left capacity; look again at once. Otherwise wait.
      if (built === 0) await sleep(cfg.schedule.pollIntervalMs);
    }
  })();

  return {
    async stop() {
      stopping = true;
      await loop;
    },
  };
}
