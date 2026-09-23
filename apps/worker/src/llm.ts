/**
 * Direct-call LLM clients for the cluster runner (D25): tool-less stages go
 * straight to the Messages API — the worker does all file/DB I/O — instead
 * of paying the Agent SDK's agentic overhead. Both clients are injectable
 * so tests run with fakes and zero API spend.
 */

export interface LlmRequest {
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Thinking control. Claude 5 models think ADAPTIVELY by default, and a
   * hard prompt can spend the entire max_tokens budget on thinking blocks —
   * the response then carries zero text (stop_reason max_tokens), which is
   * how the first live cluster smoke failed. Cluster stage calls are
   * mechanical single-shot JSON tasks, so the client defaults to disabled;
   * Phase 10's routing config is the place to re-enable effort-tuned
   * thinking per agent.
   */
  thinking?: Record<string, unknown>;
}

export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export class AnthropicLlmClient implements LlmClient {
  constructor(private readonly apiKey: string = process.env["ANTHROPIC_API_KEY"] ?? "") {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    if (!this.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set — required for cluster runs");
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 8192,
        thinking: req.thinking ?? { type: "disabled" },
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: "user", content: req.prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Messages API HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        output_tokens_details?: { thinking_tokens?: number };
      };
    };
    const text = (body.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n");
    if (!text.trim()) {
      const thinking = body.usage?.output_tokens_details?.thinking_tokens;
      throw new Error(
        `Messages API returned no text (stop_reason: ${body.stop_reason ?? "?"}, ` +
          `output_tokens: ${body.usage?.output_tokens ?? "?"}, thinking_tokens: ${thinking ?? "?"}) — ` +
          `likely the whole max_tokens budget went to thinking`,
      );
    }
    return {
      text,
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    };
  }
}

/**
 * Observed fan-out (spec §2.1): run a prompt through Gemini with Google
 * Search grounding and capture the webSearchQueries the engine actually
 * issued. Available when GEMINI_API_KEY is set; the runner falls back to
 * simulated generation otherwise (D30).
 */
export interface FanoutObserver {
  observe(prompt: string): Promise<string[]>;
}

export class GeminiFanoutObserver implements FanoutObserver {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash",
  ) {}

  async observe(prompt: string): Promise<string[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": this.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    const body = (await res.json()) as {
      candidates?: { groundingMetadata?: { webSearchQueries?: unknown } }[];
    };
    const queries = body.candidates?.[0]?.groundingMetadata?.webSearchQueries;
    if (!Array.isArray(queries)) return [];
    return queries.filter((q): q is string => typeof q === "string" && q.trim().length > 0);
  }
}

export function geminiObserverFromEnv(): FanoutObserver | null {
  const key = process.env["GEMINI_API_KEY"];
  return key ? new GeminiFanoutObserver(key) : null;
}
