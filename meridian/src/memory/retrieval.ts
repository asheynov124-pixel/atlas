/**
 * Hybrid retrieval (§7.4): lexical BM25 over L2 + optional dense scorer + graph walk
 * over L3 + temporal filter → reciprocal rank fusion → budget-aware packer.
 * Packed spans keep their pointers.
 */
import type { SpanPointer } from '../core/types.js';
import { estimateTokens } from '../core/tokens.js';
import { EpisodicStore, makePointer } from './episodic.js';
import { SemanticGraph } from './graph.js';

export interface RetrievedSpan {
  pointer: SpanPointer;
  text: string;
  score: number;
  source?: string;
  trusted: boolean;
  claims: string[];
}

export interface DenseScorer {
  score(query: string, texts: string[]): Promise<number[]>;
}

export interface RetrievalQuery {
  query: string;
  entities?: string[];
  after?: string;
  before?: string;
  run_id?: string;
  max_tokens: number;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9$%.]+/).filter((t) => t.length > 1);
}

export class HybridRetriever {
  constructor(readonly l2: EpisodicStore, readonly l3: SemanticGraph, private dense?: DenseScorer) {}

  private bm25(query: string, docs: string[]): number[] {
    const q = tokenize(query);
    const toks = docs.map(tokenize);
    const N = docs.length || 1;
    const avgdl = toks.reduce((n, d) => n + d.length, 0) / N || 1;
    const df = new Map<string, number>();
    for (const d of toks) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
    const k1 = 1.2, b = 0.75;
    return toks.map((d) => {
      let s = 0;
      for (const term of q) {
        const tf = d.filter((t) => t === term).length;
        if (!tf) continue;
        const idf = Math.log(1 + (N - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
        s += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avgdl));
      }
      return s;
    });
  }

  async retrieve(q: RetrievalQuery): Promise<{ spans: RetrievedSpan[]; claims: ReturnType<SemanticGraph['query']>; packed_tokens: number; budget: number }> {
    let records = q.run_id ? this.l2.forRun(q.run_id) : this.l2.all();
    if (q.after) records = records.filter((r) => r.created_at >= q.after!);
    if (q.before) records = records.filter((r) => r.created_at <= q.before!);
    const docs = records.map((r) => r.text);

    const lex = this.bm25(q.query, docs);
    const den = this.dense ? await this.dense.score(q.query, docs) : null;
    const graphHits = new Set<number>();
    const claims = (q.entities ?? []).flatMap((e) => this.l3.query(e));
    for (const c of claims) for (const ev of c.evidence) records.forEach((r, i) => { if (ev.pointer.startsWith(`ep:${r.run_id}/${r.turn_id}/`)) graphHits.add(i); });

    const rankOf = (scores: number[]) => scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
    const fused = new Map<number, number>();
    const k = 60;
    const addRanks = (ranked: number[], weight = 1) => ranked.forEach((i, r) => fused.set(i, (fused.get(i) ?? 0) + weight / (k + r)));
    addRanks(rankOf(lex).filter((i) => lex[i]! > 0));
    if (den) addRanks(rankOf(den));
    addRanks([...graphHits], 1.5);
    // Recency gets a small vote so ties break toward newer evidence.
    addRanks(records.map((_, i) => i).reverse(), 0.3);

    const ranked = [...fused.entries()].sort((a, b) => b[1] - a[1]);
    const spans: RetrievedSpan[] = [];
    let used = 0;
    const seen = new Set<string>();
    for (const [i, score] of ranked) {
      const r = records[i]!;
      if (seen.has(r.text)) continue;
      const t = estimateTokens(r.text);
      if (used + t > q.max_tokens) continue;
      seen.add(r.text);
      used += t;
      const ptr = makePointer(r.run_id, r.turn_id, 0, r.text.length);
      spans.push({ pointer: ptr, text: r.text, score, trusted: r.trusted, claims: claims.filter((c) => c.evidence.some((e) => e.pointer.startsWith(`ep:${r.run_id}/${r.turn_id}/`))).map((c) => c.id), ...(r.source ? { source: r.source } : {}) });
    }
    return { spans, claims, packed_tokens: used, budget: q.max_tokens };
  }
}
