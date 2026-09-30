import { claimRun, emitEvent, heartbeat, releaseRun, type EngineDb, type RunDoc } from "@blogagent/engine";
import { runPipeline, type PipelineDeps } from "./pipeline.js";

/**
 * Worker loop (roadmap 2.5): poll-claim runs from Mongo with a lease,
 * heartbeat while processing, respect a concurrency cap. On SIGINT/SIGTERM
 * (a Railway deploy) the pipeline queue releases its in-flight runs back to
 * the queue at their current phase, attempt refunded, and the process exits;
 * the next worker resumes them there. A worker that dies without a signal
 * leaves an expiring lease, and the reclaim also resumes at the current phase.
 */
export interface QueueController {
  stop(): Promise<void>;
  /** Stop claiming and hand in-flight runs back to the queue (shutdown). */
  release?(): Promise<void>;
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
  const inFlight = new Map<string, RunDoc>();

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
      const key = run._id?.toHexString() ?? "";
      inFlight.set(key, run);
      const p = processRun(deps, run).finally(() => {
        active.delete(p);
        inFlight.delete(key);
      });
      active.add(p);
    }
    await Promise.allSettled(active);
  })();

  return {
    async stop() {
      stopping = true;
      await loop;
    },
    async release() {
      stopping = true;
      for (const run of inFlight.values()) {
        if (!run._id) continue;
        const released = await releaseRun(db, run._id, cfg.workerId);
        if (!released) continue;
        deps.log(`released run ${run._id.toHexString()} at ${released.fromStage} (worker shutting down)`);
        await emitEvent(db, {
          companyId: released.companyId,
          runId: run._id,
          articleId: released.articleId,
          type: "run.retried",
          message: `Released on worker shutdown — resumes from ${released.fromStage}, attempt refunded`,
          data: { resumeFrom: released.fromStage },
        });
      }
    },
  };
}

export function installSignalHandlers(controller: QueueController, db: EngineDb, log: (m: string) => void): void {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    // Railway kills the container shortly after SIGTERM, so waiting for a
    // 30-minute run to finish only guarantees it dies mid-phase. Hand pipeline
    // runs back now and exit, so this process can't keep writing to a run the
    // new container has already claimed. Other queues' leases expire and are
    // reclaimed as before.
    log(`${signal} received — releasing in-flight runs and exiting`);
    try {
      await controller.release?.();
    } catch (err) {
      log(`release failed: ${err instanceof Error ? err.message : err}`);
    }
    await db.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
