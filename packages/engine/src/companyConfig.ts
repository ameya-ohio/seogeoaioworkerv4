import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export interface CompanyConfig {
  path: string;
  /** Directory holding brand assets — `brand-assets/` next to the yaml file. */
  brandAssetsDir: string;
  raw: Record<string, unknown>;
  companyId: string;
  companyName: string;
}

/**
 * Load the company config surface. Mirrors scripts/company_config.py:
 * default path is <repoRoot>/config/company.yaml, overridable via the
 * COMPANY_CONFIG env var; brand assets resolve next to the loaded file.
 */
export function loadCompanyConfig(repoRoot: string, envPath?: string): CompanyConfig {
  const path = resolve(envPath ?? process.env.COMPANY_CONFIG ?? join(repoRoot, "config", "company.yaml"));
  const raw = parseYaml(readFileSync(path, "utf-8")) as Record<string, unknown>;
  const company = (raw["company"] ?? {}) as Record<string, unknown>;
  const companyId = String(company["id"] ?? "").trim();
  const companyName = String(company["name"] ?? "").trim();
  if (!companyId) {
    throw new Error(`company.id missing in ${path} — run /configure-company first`);
  }
  return {
    path,
    brandAssetsDir: join(dirname(path), "brand-assets"),
    raw,
    companyId,
    companyName,
  };
}

/**
 * Primary market for keyword/SERP calls (D21). company.yaml carries
 * `market: {location_code, language_code}` (the Configurator sets it, 4.2);
 * until then, default to US English — DataForSEO location 2840.
 */
export function marketFromConfig(cfg: CompanyConfig): {
  locationCode: number;
  languageCode: string;
} {
  const market = (cfg.raw["market"] ?? {}) as Record<string, unknown>;
  const loc = Number(market["location_code"]);
  const lang = String(market["language_code"] ?? "").trim();
  return {
    locationCode: Number.isFinite(loc) && loc > 0 ? loc : 2840,
    languageCode: lang || "en",
  };
}

/** Dotted-path getter over the parsed yaml (cfg_get equivalent). */
export function cfgGet<T = unknown>(cfg: CompanyConfig, dotted: string, fallback?: T): T {
  let cur: unknown = cfg.raw;
  for (const part of dotted.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return fallback as T;
    }
  }
  return (cur ?? fallback) as T;
}
