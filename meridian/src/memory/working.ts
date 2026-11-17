/**
 * L0 Working Window + L1 Compaction Summaries with lossless span pointers (§7.3).
 *
 * Streaming compaction: when L0 utilization crosses the soft watermark (55%) the
 * Archivist summarizes the oldest unsummarized segment. Every sentence of the summary
 * must carry ≥ 1 pointer into L2; the window refuses a summary that does not.
 * Pinned rules and skill prefixes are never compacted.
 */
import type { SpanPointer } from '../core/types.js';
import { estimateTokens } from '../core/tokens.js';
import { EventStream } from '../core/events.js';
import { EpisodicStore, makePointer } from './episodic.js';

export interface WindowSegment {
  kind: 'pinned' | 'turn' | 'summary' | 'evidence';
  turn_id: string;
  text: string;
  pointers: SpanPointer[];
  tokens: number;
}

export interface Summarizer {
  /** Must return sentences, each with ≥1 pointer into the given segments. */
  summarize(segments: WindowSegment[]): Promise<Array<{ sentence: string; pointers: SpanPointer[] }>>;
}

/** Deterministic summarizer: first clause of each turn, pointed at its source span. */
export class ExtractiveSummarizer implements Summarizer {
  async summarize(segments: WindowSegment[]) {
    return segments.map((s) => {
      const clause = s.text.split(/(?<=[.!?])\s/)[0] ?? s.text;
      const end = Math.min(s.text.length, clause.length);
      const ptr = s.pointers[0];
      const base = ptr ? ptr.replace(/chars_\d+-\d+$/, `chars_0-${end}`) as SpanPointer : makePointer('unknown', s.turn_id, 0, end);
      return { sentence: clause.trim(), pointers: [base] };
    });
  }
}

export class WorkingWindow {
  private segments: WindowSegment[] = [];
  private turnSeq = 0;
  readonly compactions: Array<{ at: string; replaced: number; summary_tokens: number; pointer_count: number }> = [];

  constructor(
    readonly run_id: string,
    readonly l2: EpisodicStore,
    readonly events: EventStream,
    private summarizer: Summarizer = new ExtractiveSummarizer(),
    readonly capacityTokens = 1_000_000,
    readonly softWatermark = 0.55,
    private workspace_id?: string,
  ) {}

  pin(text: string): void {
    this.segments.unshift({ kind: 'pinned', turn_id: `pin_${this.segments.length}`, text, pointers: [], tokens: estimateTokens(text) });
  }

  /** Archivist tails the stream: every turn is written verbatim to L2 as it occurs. */
  async addTurn(role: 'user' | 'assistant' | 'tool', text: string, opts: { trusted?: boolean; source?: string } = {}): Promise<SpanPointer> {
    const turn_id = `turn_${++this.turnSeq}`;
    const ptr = this.l2.append({ run_id: this.run_id, turn_id, role, text, trusted: opts.trusted ?? role !== 'tool', ...(opts.source ? { source: opts.source } : {}) }, this.workspace_id);
    this.segments.push({ kind: 'turn', turn_id, text, pointers: [ptr], tokens: estimateTokens(text) });
    await this.maybeCompact();
    return ptr;
  }

  utilization(): number {
    return this.tokens() / this.capacityTokens;
  }

  tokens(): number {
    return this.segments.reduce((n, s) => n + s.tokens, 0);
  }

  view(): WindowSegment[] {
    return [...this.segments];
  }

  private async maybeCompact(): Promise<void> {
    if (this.utilization() < this.softWatermark) return;
    const compactable = this.segments.filter((s) => s.kind === 'turn');
    if (compactable.length < 2) return;
    // Oldest unsummarized half of the turns.
    const target = compactable.slice(0, Math.ceil(compactable.length / 2));
    const sentences = await this.summarizer.summarize(target);
    for (const s of sentences) {
      if (s.pointers.length === 0) throw new Error(`compaction refused: sentence without pointer: "${s.sentence}"`);
      for (const p of s.pointers) if (!this.l2.resolve(p)) throw new Error(`compaction refused: dangling pointer ${p}`);
    }
    const text = sentences.map((s) => `${s.sentence} ${s.pointers.map((p) => `[[${p}]]`).join(' ')}`).join('\n');
    const pointers = sentences.flatMap((s) => s.pointers);
    const summary: WindowSegment = { kind: 'summary', turn_id: `sum_${this.compactions.length + 1}`, text, pointers, tokens: estimateTokens(text) };
    const firstIdx = this.segments.indexOf(target[0]!);
    const ids = new Set(target.map((t) => t.turn_id));
    this.segments = this.segments.filter((s) => !ids.has(s.turn_id));
    this.segments.splice(Math.min(firstIdx, this.segments.length), 0, summary);
    this.compactions.push({ at: new Date().toISOString(), replaced: target.length, summary_tokens: summary.tokens, pointer_count: pointers.length });
    this.events.emit('compaction.boundary', { segment_range: [target[0]!.turn_id, target[target.length - 1]!.turn_id], summary_ref: summary.turn_id, pointer_count: pointers.length }, this.run_id);
  }
}
