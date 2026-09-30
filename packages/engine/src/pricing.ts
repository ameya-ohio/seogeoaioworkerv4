/**
 * USD per million tokens. The Agent SDK reports a cost per phase; the
 * Messages API reports tokens only, and the plan budget brake sums
 * phaseResults[].usage.costUsd — so direct calls (worker phases, the web
 * interview chat) estimate it here (cache writes 1.25× input, cache reads
 * 0.1× input). Unknown models record no cost rather than a wrong one.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export function estimateCostUsd(model: string, u: TokenUsage): number | undefined {
  const p = PRICES[model];
  if (!p) return undefined;
  const inputSide =
    u.inputTokens * p.input + u.cacheCreationTokens * p.input * 1.25 + u.cacheReadTokens * p.input * 0.1;
  return (inputSide + u.outputTokens * p.output) / 1_000_000;
}
