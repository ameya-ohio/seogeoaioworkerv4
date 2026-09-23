#!/usr/bin/env node
/**
 * Local dev MongoDB (decision D15): no mongod/Docker on this machine, so dev
 * runs mongodb-memory-server with a PERSISTENT dbPath — data survives
 * restarts. The web app and worker default to mongodb://localhost:27017,
 * which is exactly where this listens.
 *
 *   node scripts/dev_mongo.mjs        # port 27017, data in outputs/dev-mongo/
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dbPath = join(repoRoot, "outputs", "dev-mongo");
mkdirSync(dbPath, { recursive: true });

const port = Number.parseInt(process.env.DEV_MONGO_PORT ?? "27017", 10);
const mongod = await MongoMemoryServer.create({
  instance: { port, dbPath, storageEngine: "wiredTiger" },
});

console.log(`dev Mongo listening at ${mongod.getUri()}`);
console.log(`data dir: ${dbPath} (persists across restarts)`);
console.log("Ctrl-C to stop.");

async function shutdown() {
  await mongod.stop({ doCleanup: false });
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
