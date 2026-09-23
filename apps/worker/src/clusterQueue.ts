import {
  claimClusterRun,
  heartbeatCluster,
  type ClusterDoc,
} from "@blogagent/engine";
import { runCluster, type ClusterDeps } from "./clusterRunner.js";
import type { QueueController } from "./queue.js";

/**
 * Cluster-run claim loop: the sibling of the article-run queue in queue.ts,
 * polling the clusters collection with the same lease/heartbeat semantics.
 * Cluster runs are long (dozens of LLM calls) but cheap on local resources,
 * so one at a time per worker is plenty for v1.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function processCluster(deps: ClusterDeps, cluster: ClusterDoc): Promise<void> {
  const { db, cfg } = deps;
  const clusterId = cluster._id;
  if (!clusterId) return;
  const beat = setInterval(() => {
    void heartbeatCluster(db, clusterId, cfg.workerId, cfg.leaseMs).then((ok) => {
      if (!ok) deps.log(`lost lease on cluster ${clusterId.toHexString()}`);
    });
  }, cfg.heartbeatMs);
  try {
    await runCluster(deps, cluster);
    deps.log(`cluster ${clusterId.toHexString()} succeeded`);
  } catch (err) {
    deps.log(`cluster ${clusterId.toHexString()} errored: ${err instanceof Error ? err.message : err}`);
  } finally {
    clearInterval(beat);
  }
}

export function startClusterQueue(deps: ClusterDeps): QueueController {
  const { db, cfg } = deps;
  let stopping = false;
  let active: Promise<void> | null = null;

  const loop = (async () => {
    deps.log(`cluster queue started (worker ${cfg.workerId})`);
    while (!stopping) {
      let cluster: ClusterDoc | null = null;
      try {
        cluster = await claimClusterRun(db, cfg.workerId, cfg.leaseMs);
      } catch (err) {
        deps.log(`cluster claim error: ${err instanceof Error ? err.message : err}`);
      }
      if (!cluster) {
        await sleep(cfg.pollIntervalMs);
        continue;
      }
      deps.log(`claimed cluster ${cluster._id?.toHexString()} (seed "${cluster.seed}")`);
      active = processCluster(deps, cluster);
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
