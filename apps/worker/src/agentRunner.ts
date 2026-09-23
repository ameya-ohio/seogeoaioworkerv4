import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PhaseUsage } from "@blogagent/engine";

export interface AgentInvocation {
  systemPromptFile: string;
  prompt: string;
  model: string;
  cwd: string;
  allowedTools: string[];
  maxTurns: number;
  onProgress?: (text: string) => void;
}

export interface AgentRunOutcome {
  success: boolean;
  finalText: string;
  usage: PhaseUsage;
  errorSubtype?: string;
}

/** Injectable so pipeline/queue tests run without the SDK or an API key. */
export interface AgentInvoker {
  run(inv: AgentInvocation): Promise<AgentRunOutcome>;
}

/**
 * Production invoker: drives one phase with the Claude Agent SDK. The agent
 * spec markdown is the system prompt; settingSources stays empty so the
 * repo's CLAUDE.md orchestrator prompt is NOT loaded — the worker itself is
 * the orchestrator in headless mode.
 */
export class SdkAgentInvoker implements AgentInvoker {
  async run(inv: AgentInvocation): Promise<AgentRunOutcome> {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const spec = await readFile(join(inv.cwd, inv.systemPromptFile), "utf-8");

    const stream = query({
      prompt: inv.prompt,
      options: {
        cwd: inv.cwd,
        model: inv.model,
        systemPrompt: spec,
        allowedTools: inv.allowedTools,
        permissionMode: "bypassPermissions",
        maxTurns: inv.maxTurns,
        settingSources: [],
      },
    });

    let success = false;
    let finalText = "";
    let errorSubtype: string | undefined;
    const usage: PhaseUsage = { model: inv.model };

    for await (const message of stream) {
      if (message.type === "assistant") {
        const blocks = message.message?.content;
        if (Array.isArray(blocks)) {
          for (const block of blocks) {
            if (block.type === "text" && block.text?.trim()) {
              inv.onProgress?.(block.text.trim().slice(0, 500));
            }
          }
        }
      } else if (message.type === "result") {
        success = message.subtype === "success";
        if (!success) errorSubtype = message.subtype;
        if ("result" in message && typeof message.result === "string") {
          finalText = message.result;
        }
        usage.costUsd = message.total_cost_usd;
        usage.numTurns = message.num_turns;
        const u = message.usage as
          | {
              input_tokens?: number;
              output_tokens?: number;
              cache_read_input_tokens?: number;
              cache_creation_input_tokens?: number;
            }
          | undefined;
        if (u) {
          usage.inputTokens = u.input_tokens;
          usage.outputTokens = u.output_tokens;
          usage.cacheReadTokens = u.cache_read_input_tokens;
          usage.cacheCreationTokens = u.cache_creation_input_tokens;
        }
      }
    }

    const outcome: AgentRunOutcome = { success, finalText, usage };
    if (errorSubtype !== undefined) outcome.errorSubtype = errorSubtype;
    return outcome;
  }
}
