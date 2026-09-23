import type { EngineDb } from "./db.js";
import type { ApiCostDoc } from "./cluster/types.js";

/**
 * DataForSEO client — the shared core from roadmap 4.1 (auth, sandbox mode,
 * rate limiting, per-call cost ledger) carrying the endpoint slice Phase 4C
 * needs: SERP Google Organic Live Advanced (SERP checks + People Also Ask,
 * spec §4–5) and the AI Optimization LLM Responses API (AI-surface checks,
 * D24). 4A extends this same client with the Labs Google families.
 *
 * Credentials: DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD. Set
 * DATAFORSEO_SANDBOX=1 to hit the sandbox host (dummy data, no billing).
 */

export interface DataForSeoConfig {
  login: string;
  password: string;
  sandbox: boolean;
  /** Minimum ms between requests — a coarse guard well under the 2,000/min cap. */
  minIntervalMs: number;
}

export interface SerpItem {
  rank: number;
  title: string;
  url: string;
  domain: string;
  description: string;
}

export interface SerpSnapshot {
  keyword: string;
  items: SerpItem[];
  peopleAlsoAsk: string[];
  aiOverviewPresent: boolean;
}

export type LlmProvider = "chat_gpt" | "claude" | "gemini" | "perplexity";

export interface LlmSurfaceSnapshot {
  provider: LlmProvider;
  prompt: string;
  answerText: string;
  citedUrls: string[];
  citedDomains: string[];
}

export class DataForSeoError extends Error {}

/** Recorded on every call so spend lands in the shared budget ledger (4.14). */
export type CostRecorder = (entry: {
  endpoint: string;
  costUsd: number;
  meta?: Record<string, unknown>;
}) => Promise<void>;

export function dataForSeoConfigFromEnv(): DataForSeoConfig | null {
  const login = process.env["DATAFORSEO_LOGIN"];
  const password = process.env["DATAFORSEO_PASSWORD"];
  if (!login || !password) return null;
  return {
    login,
    password,
    sandbox: process.env["DATAFORSEO_SANDBOX"] === "1",
    minIntervalMs: 250,
  };
}

/** Mongo-backed cost recorder writing to the api_costs collection. */
export function mongoCostRecorder(db: EngineDb, companyId: string): CostRecorder {
  return async ({ endpoint, costUsd, meta }) => {
    const doc: ApiCostDoc = {
      companyId,
      provider: "dataforseo",
      endpoint,
      costUsd,
      at: new Date(),
      ...(meta ? { meta } : {}),
    };
    await db.apiCosts.insertOne(doc);
  };
}

interface DfsTaskResponse {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: {
    status_code?: number;
    status_message?: string;
    cost?: number;
    result?: unknown[];
  }[];
}

export class DataForSeoClient {
  private lastRequestAt = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly cfg: DataForSeoConfig,
    private readonly recordCost?: CostRecorder,
  ) {}

  private get baseUrl(): string {
    return this.cfg.sandbox ? "https://sandbox.dataforseo.com" : "https://api.dataforseo.com";
  }

  /** Serialize requests with a minimum interval (coarse rate limiting). */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const wait = this.lastRequestAt + this.cfg.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRequestAt = Date.now();
      return fn();
    });
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async post(endpoint: string, task: Record<string, unknown>): Promise<unknown[]> {
    return this.enqueue(async () => {
      const auth = Buffer.from(`${this.cfg.login}:${this.cfg.password}`).toString("base64");
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([task]),
      });
      if (!res.ok) {
        throw new DataForSeoError(`${endpoint} HTTP ${res.status}: ${await res.text()}`);
      }
      const body = (await res.json()) as DfsTaskResponse;
      const taskRes = body.tasks?.[0];
      const costUsd = taskRes?.cost ?? body.cost ?? 0;
      await this.recordCost?.({ endpoint, costUsd, meta: { task } });
      if (body.status_code !== undefined && body.status_code >= 40000) {
        throw new DataForSeoError(`${endpoint}: ${body.status_code} ${body.status_message ?? ""}`);
      }
      if (!taskRes || (taskRes.status_code !== undefined && taskRes.status_code >= 40000)) {
        throw new DataForSeoError(
          `${endpoint} task error: ${taskRes?.status_code ?? "?"} ${taskRes?.status_message ?? ""}`,
        );
      }
      return taskRes.result ?? [];
    });
  }

  /** SERP Google Organic Live Advanced: top results + PAA + AI Overview flag. */
  async serpOrganicLive(params: {
    keyword: string;
    locationCode: number;
    languageCode: string;
    depth?: number;
  }): Promise<SerpSnapshot> {
    const result = await this.post("/v3/serp/google/organic/live/advanced", {
      keyword: params.keyword,
      location_code: params.locationCode,
      language_code: params.languageCode,
      depth: params.depth ?? 10,
    });
    const first = (result[0] ?? {}) as Record<string, unknown>;
    const items = Array.isArray(first["items"]) ? (first["items"] as Record<string, unknown>[]) : [];
    const organic: SerpItem[] = [];
    const paa: string[] = [];
    let aiOverviewPresent = false;
    for (const item of items) {
      const type = String(item["type"] ?? "");
      if (type === "organic") {
        organic.push({
          rank: Number(item["rank_absolute"] ?? organic.length + 1),
          title: String(item["title"] ?? ""),
          url: String(item["url"] ?? ""),
          domain: String(item["domain"] ?? ""),
          description: String(item["description"] ?? ""),
        });
      } else if (type === "people_also_ask") {
        const sub = Array.isArray(item["items"]) ? (item["items"] as Record<string, unknown>[]) : [];
        for (const q of sub) {
          const title = q["title"];
          if (typeof title === "string" && title.trim()) paa.push(title.trim());
        }
      } else if (type === "ai_overview") {
        aiOverviewPresent = true;
      }
    }
    return { keyword: params.keyword, items: organic, peopleAlsoAsk: paa, aiOverviewPresent };
  }

  /**
   * AI Optimization → LLM Responses Live (D24): one prompt against one
   * engine, web search on, returning the answer plus cited URLs/domains.
   */
  async llmResponseLive(params: {
    provider: LlmProvider;
    prompt: string;
    modelName?: string;
  }): Promise<LlmSurfaceSnapshot> {
    const task: Record<string, unknown> = {
      user_prompt: params.prompt,
      web_search: true,
    };
    if (params.modelName) task["model_name"] = params.modelName;
    const result = await this.post(
      `/v3/ai_optimization/${params.provider}/llm_responses/live`,
      task,
    );
    const urls = new Set<string>();
    let answerText = "";
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (!node || typeof node !== "object") return;
      const rec = node as Record<string, unknown>;
      for (const key of ["url", "source_url", "link"]) {
        const v = rec[key];
        if (typeof v === "string" && v.startsWith("http")) urls.add(v);
      }
      const text = rec["text"];
      if (typeof text === "string" && text.length > answerText.length) answerText = text;
      for (const v of Object.values(rec)) {
        if (v && typeof v === "object") walk(v);
      }
    };
    walk(result);
    const citedUrls = [...urls];
    const citedDomains = [
      ...new Set(
        citedUrls
          .map((u) => {
            try {
              return new URL(u).hostname.replace(/^www\./, "");
            } catch {
              return "";
            }
          })
          .filter(Boolean),
      ),
    ];
    return {
      provider: params.provider,
      prompt: params.prompt,
      answerText: answerText.slice(0, 2000),
      citedUrls,
      citedDomains,
    };
  }
}
