import {
  claimScrapeRun,
  heartbeatScrape,
  type ScrapeDoc,
} from "@blogagent/engine";
import { runScrape, type ScrapeDeps } from "./scrapeRunner.js";
import type { QueueController } from "./queue.js";

/**
 * Competitive-scrape claim loop (roadmap 6.1): the third queue beside the
 * article pipeline and cluster runs, with the same lease/heartbeat
 * semantics. Scrapes are network-bound and politeness-throttled, so one at
 * a time per worker.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function processScrape(deps: ScrapeDeps, scrape: ScrapeDoc): Promise<void> {
  const { db, cfg } = deps;
  const scrapeId = scrape._id;
  if (!scrapeId) return;
  const beat = setInterval(() => {
    void heartbeatScrape(db, scrapeId, cfg.workerId, cfg.leaseMs).then((ok) => {
      if (!ok) deps.log(`lost lease on scrape ${scrapeId.toHexString()}`);
    });
  }, cfg.heartbeatMs);
  try {
    await runScrape(deps, scrape);
    deps.log(`scrape ${scrapeId.toHexString()} succeeded`);
  } catch (err) {
    deps.log(`scrape ${scrapeId.toHexString()} errored: ${err instanceof Error ? err.message : err}`);
  } finally {
    clearInterval(beat);
  }
}

export function startScrapeQueue(deps: ScrapeDeps): QueueController {
  const { db, cfg } = deps;
  let stopping = false;
  let active: Promise<void> | null = null;

  const loop = (async () => {
    deps.log(`scrape queue started (worker ${cfg.workerId})`);
    while (!stopping) {
      let scrape: ScrapeDoc | null = null;
      try {
        scrape = await claimScrapeRun(db, cfg.workerId, cfg.leaseMs);
      } catch (err) {
        deps.log(`scrape claim error: ${err instanceof Error ? err.message : err}`);
      }
      if (!scrape) {
        await sleep(cfg.pollIntervalMs);
        continue;
      }
      deps.log(`claimed scrape ${scrape._id?.toHexString()} (${scrape.url})`);
      active = processScrape(deps, scrape);
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
