/**
 * Deterministic mock provider so the kernel, demos and tests run without network.
 * Handlers are keyed by a tag embedded in the system prompt ("[[task:research]]").
 */
import type { CompletionRequest, CompletionResult, ModelProvider } from './provider.js';
import { priceOf } from './provider.js';
import { estimateTokens } from '../core/tokens.js';

export type MockHandler = (req: CompletionRequest) => string;

export class MockProvider implements ModelProvider {
  private handlers = new Map<string, MockHandler>();
  calls: CompletionRequest[] = [];
  latencyMs = 0;

  on(tag: string, handler: MockHandler): this {
    this.handlers.set(tag, handler);
    return this;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push(req);
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    const tag = /\[\[task:([a-z_.-]+)\]\]/.exec(req.system)?.[1];
    const handler = tag ? this.handlers.get(tag) : undefined;
    const text = handler ? handler(req) : `mock(${req.tier}/${req.effort}): ${req.prompt.slice(0, 80)}`;
    const tokens_in = estimateTokens(req.system + req.prompt);
    const tokens_out = estimateTokens(text);
    return { text, tokens_in, tokens_out, usd: priceOf(req.tier, tokens_in, tokens_out), model: `mock-${req.tier}` };
  }
}
