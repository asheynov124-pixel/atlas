/**
 * Intent & Effort Router (§6).
 *
 * v1.1 fixes the ordering circularity in the original spec: retrieval needed a token
 * budget set by effort, and effort was predicted *after* retrieval. The router now
 * runs two phases:
 *   A. Pinned working-set prefetch at a fixed, small budget (cheap, effort-independent).
 *   B. Classify intent → predict effort → set retrieval budget → budgeted retrieval.
 *
 * It also makes the Fast-tier evidence check explicit: a Fast-tier answer streams as
 * a *provisional* answer; the deterministic check runs on the completed text and can
 * retract or escalate. TTFT applies to the provisional stream, not the verified answer.
 */
import type { Effort, ModelTier } from '../core/types.js';
import { HybridRetriever, type RetrievedSpan } from '../memory/retrieval.js';
import { PlanCache } from './planCache.js';

export type Intent = 'trivial' | 'lookup' | 'moderate' | 'complex' | 'agentic';

export interface RoutingDecision {
  intent: Intent;
  effort: Effort;
  tier: ModelTier;
  retrieval_budget_tokens: number;
  prefetch: RetrievedSpan[];
  working_set: RetrievedSpan[];
  plan_cache: 'hit' | 'miss' | 'n/a';
  cascade: boolean;
  timings_ms: { prefetch: number; classify: number; retrieve: number; cache: number };
}

const AGENTIC = /\b(prepare|produce|draft|build|compare|audit|review all|for each|every|memo|report|across|batch|deploy|migrate)\b/i;
const COMPLEX = /\b(why|prove|analy[sz]e|trade-?off|reconcile|design|strategy|implications)\b/i;
const LOOKUP = /\b(what is|who is|when|where|how many|define|lookup|look up|find)\b/i;

export const EFFORT_BY_INTENT: Record<Intent, Effort> = { trivial: 'low', lookup: 'low', moderate: 'medium', complex: 'high', agentic: 'high' };
export const TIER_BY_INTENT: Record<Intent, ModelTier> = { trivial: 'fast', lookup: 'fast', moderate: 'balanced', complex: 'frontier', agentic: 'frontier' };
export const BUDGET_BY_EFFORT: Record<Effort, number> = { low: 1500, medium: 4000, high: 12000, xhigh: 24000, max: 48000 };

export function classify(text: string): Intent {
  const words = text.trim().split(/\s+/).length;
  if (AGENTIC.test(text) && (words > 12 || /\b(all|every|each|\d{2,})\b/.test(text))) return 'agentic';
  if (COMPLEX.test(text)) return 'complex';
  if (LOOKUP.test(text)) return 'lookup';
  if (words <= 6) return 'trivial';
  return 'moderate';
}

export class Router {
  constructor(private retriever: HybridRetriever, private cache: PlanCache, private prefetchBudget = 600) {}

  async route(text: string, workspace_fingerprint: string, opts: { run_id?: string; entities?: string[]; effort_override?: Effort } = {}): Promise<RoutingDecision> {
    const t0 = performance.now();
    // Phase A: effort-independent prefetch of the pinned/recent working set.
    const pre = await this.retriever.retrieve({ query: text, max_tokens: this.prefetchBudget, ...(opts.run_id ? { run_id: opts.run_id } : {}) });
    const t1 = performance.now();
    // Phase B: classify → effort → budget → retrieval.
    const intent = classify(text);
    const effort = opts.effort_override ?? EFFORT_BY_INTENT[intent];
    const tier = TIER_BY_INTENT[intent];
    const budget = BUDGET_BY_EFFORT[effort];
    const t2 = performance.now();
    const ws = await this.retriever.retrieve({ query: text, max_tokens: budget, ...(opts.run_id ? { run_id: opts.run_id } : {}), ...(opts.entities ? { entities: opts.entities } : {}) });
    const t3 = performance.now();
    let plan: RoutingDecision['plan_cache'] = 'n/a';
    if (intent === 'agentic' || intent === 'complex') plan = this.cache.take(text, workspace_fingerprint) ? 'hit' : 'miss';
    const t4 = performance.now();
    return {
      intent, effort, tier, retrieval_budget_tokens: budget,
      prefetch: pre.spans, working_set: ws.spans, plan_cache: plan,
      cascade: tier === 'fast',
      timings_ms: { prefetch: t1 - t0, classify: t2 - t1, retrieve: t3 - t2, cache: t4 - t3 },
    };
  }
}

/**
 * Cascade acceptance (§6.4): the Fast-tier answer is provisional. Every claim must
 * carry a resolvable pointer; a bare claim forces escalation (and retraction of the
 * provisional stream on the client).
 */
export function cascadeCheck(answer: string, resolves: (pointer: string) => boolean): { accept: boolean; unsourced: string[] } {
  const sentences = answer.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const unsourced: string[] = [];
  for (const s of sentences) {
    const ptrs = [...s.matchAll(/\[\[(ep:[^\]\[]+)\]\]/g)].map((m) => m[1]!);
    const factual = /\d|\b(is|was|were|reported|restated|announced|decided)\b/i.test(s);
    if (!factual) continue;
    if (ptrs.length === 0 || !ptrs.every(resolves)) unsourced.push(s);
  }
  return { accept: unsourced.length === 0, unsourced };
}
