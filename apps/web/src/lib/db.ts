import "server-only";
import {
  connect,
  loadCompanyConfig,
  storageFromEnv,
  syncCompany,
  type CompanyConfig,
  type EngineDb,
  type Storage,
} from "@blogagent/engine";
import { repoRoot } from "./repo";

/**
 * Process-wide singletons (survive dev-mode HMR via globalThis). The web app
 * reads/writes the same Mongo the worker uses; company config comes from
 * config/company.yaml exactly like every other engine consumer.
 */
interface Cache {
  dbPromise?: Promise<EngineDb>;
  company?: CompanyConfig;
  storage?: Storage;
  companySynced?: boolean;
}

const g = globalThis as typeof globalThis & { __blogagentWeb?: Cache };
const cache: Cache = (g.__blogagentWeb ??= {});

export function getCompany(): CompanyConfig {
  cache.company ??= loadCompanyConfig(repoRoot());
  return cache.company;
}

export async function getDb(): Promise<EngineDb> {
  if (!cache.dbPromise) {
    const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
    const dbName = process.env.MONGODB_DB ?? "blogagent";
    cache.dbPromise = connect(uri, dbName).then(async (db) => {
      if (!cache.companySynced) {
        const company = getCompany();
        await syncCompany(db, {
          companyId: company.companyId,
          name: company.companyName,
          config: company.raw,
          configPath: company.path,
        });
        cache.companySynced = true;
      }
      return db;
    });
    cache.dbPromise.catch(() => {
      cache.dbPromise = undefined;
    });
  }
  return cache.dbPromise;
}

export function getStorage(): Storage {
  cache.storage ??= storageFromEnv(repoRoot());
  return cache.storage;
}
