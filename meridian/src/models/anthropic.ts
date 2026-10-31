/**
 * Anthropic provider: maps Meridian tiers to the Claude fleet.
 *   frontier → claude-opus-5-5     balanced → claude-sonnet-5-5     fast → claude-haiku-5-5
 * Thinking is adaptive (always on for these models); depth is controlled with
 * output_config.effort. Opus/Sonnet requests opt into server-side refusal fallbacks.
 * Requires ANTHROPIC_API_KEY (or an `ant auth login` profile) at runtime.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ModelTier } from '../core/types.js';
import type { CompletionRequest, CompletionResult, ModelProvider } from './provider.js';
import { priceOf } from './provider.js';

export const TIER_MODELS: Record<ModelTier, string> = {
  frontier: 'claude-opus-5-5',
  balanced: 'claude-sonnet-5-5',
  fast: 'claude-haiku-5-5',
};

export class AnthropicProvider implements ModelProvider {
  private client: Anthropic;

  constructor(client?: Anthropic, private models: Record<ModelTier, string> = TIER_MODELS) {
    this.client = client ?? new Anthropic();
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const model = this.models[req.tier];
    const useFallback = req.tier !== 'fast';
    const response = await this.client.beta.messages.create({
      model,
      max_tokens: req.max_tokens ?? 16000,
      system: req.system + (req.json ? '\nRespond with a single JSON object and nothing else.' : ''),
      messages: [{ role: 'user', content: req.prompt }],
      thinking: { type: 'adaptive' },
      output_config: { effort: req.effort },
      ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    } as Parameters<Anthropic['beta']['messages']['create']>[0]);
    const msg = response as Anthropic.Beta.BetaMessage;
    if (msg.stop_reason === 'refusal') {
      throw new Error(`model refused (${(msg as { stop_details?: { category?: string } }).stop_details?.category ?? 'unspecified'})`);
    }
    const text = msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
    const tokens_in = msg.usage.input_tokens;
    const tokens_out = msg.usage.output_tokens;
    return { text, tokens_in, tokens_out, usd: priceOf(req.tier, tokens_in, tokens_out), model: msg.model };
  }
}
