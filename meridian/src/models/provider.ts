/**
 * Model fleet abstraction. The kernel never names a vendor model directly; it asks
 * for a tier and an effort and the provider maps it (spec §4.1 "Model Fleet").
 */
import type { Effort, ModelTier } from '../core/types.js';

export interface CompletionRequest {
  tier: ModelTier;
  effort: Effort;
  system: string;
  prompt: string;
  max_tokens?: number;
  /** When set, the provider must return parseable JSON. */
  json?: boolean;
}

export interface CompletionResult {
  text: string;
  tokens_in: number;
  tokens_out: number;
  usd: number;
  model: string;
}

export interface ModelProvider {
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

/** Approximate list prices per 1M tokens, used for budget accounting. */
export const TIER_PRICING: Record<ModelTier, { input: number; output: number }> = {
  frontier: { input: 4, output: 20 },
  balanced: { input: 2, output: 10 },
  fast: { input: 0.1, output: 0.5 },
};

export function priceOf(tier: ModelTier, tokens_in: number, tokens_out: number): number {
  const p = TIER_PRICING[tier];
  return (tokens_in * p.input + tokens_out * p.output) / 1_000_000;
}
