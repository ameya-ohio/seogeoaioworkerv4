import type { EngineDb } from "../db.js";
import type { CompanyDoc } from "../types.js";

/** Upsert the company.yaml snapshot (called by the worker on boot). */
export async function syncCompany(
  db: EngineDb,
  params: { companyId: string; name: string; config: Record<string, unknown>; configPath: string },
): Promise<CompanyDoc> {
  const now = new Date();
  await db.companies.updateOne(
    { companyId: params.companyId },
    {
      $set: {
        name: params.name,
        config: params.config,
        configPath: params.configPath,
        syncedAt: now,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return (await db.companies.findOne({ companyId: params.companyId })) as CompanyDoc;
}
