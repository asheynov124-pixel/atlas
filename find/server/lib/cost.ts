// Spend accounting. Prices are per 1M tokens (USD) unless noted, checked on the date below.
// Re-check before trusting a budget: these move. Unknown models cost NaN so a stale table
// shows up as a visible gap in the report instead of a silent $0.

export const PRICES_CHECKED = "2026-10-27";

interface TokenPrice {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export const CLAUDE_PRICES: Record<string, TokenPrice> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

// Gemini bills tokens plus grounding. Grounding is either per grounded prompt or per search
// query depending on the model generation, with a free allowance first.
export interface GeminiPrice extends TokenPrice {
  grounding: { unit: "prompt" | "search_query"; perThousand: number; free: string };
}

// gemini-3.8-flash token prices are an introductory rate through 2026-12-31 ($0.75 / $3.75),
// rising to $1.50 / $7.50 from 2027-01-01. Grounding on Gemini 3+ is billed per search query the
// model runs (one prompt can run several), after 5,000 free per month shared across Gemini 3+.
export const GEMINI_PRICES: Record<string, GeminiPrice> = {
  "gemini-3.8-flash": {
    input: Date.now() < Date.parse("2027-01-01T00:00:00Z") ? 0.75 : 1.5,
    output: Date.now() < Date.parse("2027-01-01T00:00:00Z") ? 3.75 : 7.5,
    grounding: { unit: "search_query", perThousand: 14, free: "5,000 search queries/month shared across Gemini 3+ (paid tier)" },
  },
  "gemini-2.5-flash": {
    input: 0.3,
    output: 2.5,
    grounding: { unit: "prompt", perThousand: 35, free: "1,500 grounded prompts/day (shared with Flash-Lite)" },
  },
};

export function claudeCost(model: string, u: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }): number {
  const p = CLAUDE_PRICES[model] ?? CLAUDE_PRICES[model.replace(/-\d{8}$/, "")];
  if (!p) return Number.NaN;
  return (
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      (u.cacheReadTokens ?? 0) * (p.cacheRead ?? p.input) +
      (u.cacheWriteTokens ?? 0) * (p.cacheWrite ?? p.input)) /
    1_000_000
  );
}

// Cost of one grounded call *after* the free allowance is used up (the worst case we budget for).
export function geminiCost(
  model: string,
  u: { promptTokens: number; outputTokens: number; thoughtsTokens: number; toolUsePromptTokens: number },
  searchQueries: number,
): number {
  const p = GEMINI_PRICES[model];
  if (!p) return Number.NaN;
  const tokens = ((u.promptTokens + u.toolUsePromptTokens) * p.input + (u.outputTokens + u.thoughtsTokens) * p.output) / 1_000_000;
  const groundingUnits = p.grounding.unit === "prompt" ? 1 : Math.max(1, searchQueries);
  return tokens + (groundingUnits * p.grounding.perThousand) / 1000;
}

export function usd(n: number): string {
  if (!Number.isFinite(n)) return "unknown (model not in price table)";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}
