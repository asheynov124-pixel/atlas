/**
 * Plan & reasoning cache (§6.3). Stores *how to think*, never *what was concluded*.
 * Key = hash(normalized intent + workspace fingerprint). A hit is unusable until the
 * caller re-grounds it against current data; `take()` therefore returns a skeleton
 * plus a `regrounded` guard that must be flipped by the caller.
 */
import { createHash } from 'node:crypto';

export interface PlanSkeleton {
  steps: string[];
  tools: string[];
  effort_hint: string;
  created_at: string;
  hits: number;
}

export function normalizeIntent(text: string): string {
  return text.toLowerCase().replace(/\d[\d,.]*/g, '<num>').replace(/["'`]/g, '').replace(/\s+/g, ' ').trim();
}

export class PlanCache {
  private store = new Map<string, PlanSkeleton>();
  hits = 0;
  misses = 0;

  key(intent: string, workspace_fingerprint: string): string {
    return createHash('sha256').update(normalizeIntent(intent) + '|' + workspace_fingerprint).digest('hex').slice(0, 24);
  }

  put(intent: string, workspace_fingerprint: string, skeleton: Omit<PlanSkeleton, 'created_at' | 'hits'>): void {
    for (const step of skeleton.steps) {
      if (/\$\s?\d|\b\d{4}-\d{2}-\d{2}\b/.test(step)) throw new Error(`plan cache refuses conclusions in skeletons: "${step}"`);
    }
    this.store.set(this.key(intent, workspace_fingerprint), { ...skeleton, created_at: new Date().toISOString(), hits: 0 });
  }

  take(intent: string, workspace_fingerprint: string): { skeleton: PlanSkeleton; regrounded: false } | null {
    const s = this.store.get(this.key(intent, workspace_fingerprint));
    if (!s) { this.misses += 1; return null; }
    this.hits += 1;
    s.hits += 1;
    return { skeleton: s, regrounded: false };
  }
}
