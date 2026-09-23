import { claimRun, heartbeat, type EngineDb, type RunDoc } from "@blogagent/engine";
import { runPipeline, type PipelineDeps } from "./pipeline.js";

/**
 * Worker loop (roadmap 2.5): poll-claim runs from Mongo with a lease,
 * heartbeat while processing, respect a concurrency cap, and stop cleanly
 * on SIGINT/SIGTERM (in-flight runs finish; unfinished leases expire and
 * get reclaimed elsewhere).
 */
export interface QueueController {
  stop(): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function processRun(deps: PipelineDeps, run: RunDoc): Promise<void> {
  const { db, cfg } = deps;
  const runId = run._id;
  if (!runId) return;
  const beat = setInterval(() => {
    void heartbeat(db, runId, cfg.workerId, cfg.leaseMs).then((ok) => {
      if (!ok) deps.log(`lost lease on run ${runId.toHexString()}`);
    });
  }, cfg.heartbeatMs);
  try {
    await runPipeline(deps, run);
    deps.log(`run ${runId.toHexString()} succeeded`);
  } catch (err) {
    deps.log(`run ${runId.toHexString()} errored: ${err instanceof Error ? err.message : err}`);
  } finally {
    clearInterval(beat);
  }
}

export function startQueue(deps: PipelineDeps): QueueController {
  const { db, cfg } = deps;
  let stopping = false;
  const active = new Set<Promise<void>>();

  const loop = (async () => {
    deps.log(
      `worker ${cfg.workerId} started (concurrency=${cfg.concurrency}, poll=${cfg.pollIntervalMs}ms)`,
    );
    while (!stopping) {
      if (active.size >= cfg.concurrency) {
        await Promise.race(active);
        continue;
      }
      let run: RunDoc | null = null;
      try {
        run = await claimRun(db, cfg.workerId, cfg.leaseMs);
      } catch (err) {
        deps.log(`claim error: ${err instanceof Error ? err.message : err}`);
      }
      if (!run) {
        await sleep(cfg.pollIntervalMs);
        continue;
      }
      deps.log(`claimed run ${run._id?.toHexString()} (article ${run.articleId.toHexString()})`);
      const p = processRun(deps, run).finally(() => active.delete(p));
      active.add(p);
    }
    await Promise.allSettled(active);
  })();

  return {
    async stop() {
      stopping = true;
      await loop;
    },
  };
}

export function installSignalHandlers(controller: QueueController, db: EngineDb, log: (m: string) => void): void {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} received — finishing in-flight runs…`);
    await controller.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
