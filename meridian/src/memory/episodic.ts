/**
 * L2 Episodic Store — verbatim, append-only. Every pointer resolves here in one hop.
 * Pointer grammar: ep:<run_id>/<turn_id>/chars_<start>-<end>
 *
 * v1.1: litigation hold. A hold on a workspace or run freezes retention expiry and
 * the consolidation daemon's Forgetting job for everything it covers. Nothing under
 * hold can be demoted, exported-and-deleted, or compacted away.
 */
import type { SpanPointer } from '../core/types.js';
import { nowIso } from '../core/types.js';

export interface EpisodicRecord {
  run_id: string;
  turn_id: string;
  role: 'user' | 'assistant' | 'tool' | 'system' | 'artifact';
  text: string;
  source?: string;        // e.g. "10-K p.47", URL, tool name
  trusted: boolean;       // false for tool results and retrieved content
  created_at: string;
}

export interface LitigationHold {
  id: string;
  scope: { workspace_id?: string; run_id?: string };
  reason: string;
  placed_by: string;
  placed_at: string;
  released_at?: string;
}

const PTR = /^ep:([^/]+)\/([^/]+)\/chars_(\d+)-(\d+)$/;

export function parsePointer(p: string): { run_id: string; turn_id: string; start: number; end: number } | null {
  const m = PTR.exec(p);
  if (!m) return null;
  return { run_id: m[1]!, turn_id: m[2]!, start: Number(m[3]), end: Number(m[4]) };
}

export function makePointer(run_id: string, turn_id: string, start: number, end: number): SpanPointer {
  return `ep:${run_id}/${turn_id}/chars_${start}-${end}`;
}

export class EpisodicStore {
  private records = new Map<string, EpisodicRecord>(); // key run/turn
  private order: string[] = [];
  private holds: LitigationHold[] = [];
  private workspaceOfRun = new Map<string, string>();

  private key(run_id: string, turn_id: string): string {
    return `${run_id}/${turn_id}`;
  }

  append(rec: Omit<EpisodicRecord, 'created_at'>, workspace_id?: string): SpanPointer {
    const k = this.key(rec.run_id, rec.turn_id);
    if (this.records.has(k)) throw new Error(`L2 is append-only; ${k} already exists`);
    this.records.set(k, { ...rec, created_at: nowIso() });
    this.order.push(k);
    if (workspace_id) this.workspaceOfRun.set(rec.run_id, workspace_id);
    return makePointer(rec.run_id, rec.turn_id, 0, rec.text.length);
  }

  get(run_id: string, turn_id: string): EpisodicRecord | undefined {
    return this.records.get(this.key(run_id, turn_id));
  }

  all(): EpisodicRecord[] {
    return this.order.map((k) => this.records.get(k)!);
  }

  forRun(run_id: string): EpisodicRecord[] {
    return this.all().filter((r) => r.run_id === run_id);
  }

  /** One-hop resolution. Returns null if the pointer is malformed or dangling. */
  resolve(pointer: string): { text: string; record: EpisodicRecord } | null {
    const p = parsePointer(pointer);
    if (!p) return null;
    const rec = this.get(p.run_id, p.turn_id);
    if (!rec) return null;
    if (p.start < 0 || p.end > rec.text.length || p.start > p.end) return null;
    return { text: rec.text.slice(p.start, p.end), record: rec };
  }

  /** Verify a quoted span matches the verbatim source (whitespace-normalized). */
  verifyQuote(pointer: string, quote: string): boolean {
    const r = this.resolve(pointer);
    if (!r) return false;
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    return norm(r.text).includes(norm(quote)) || norm(quote).includes(norm(r.text));
  }

  placeHold(scope: LitigationHold['scope'], reason: string, placed_by: string): LitigationHold {
    const h: LitigationHold = { id: `hold_${this.holds.length + 1}`, scope, reason, placed_by, placed_at: nowIso() };
    this.holds.push(h);
    return h;
  }

  releaseHold(id: string): void {
    const h = this.holds.find((x) => x.id === id);
    if (h) h.released_at = nowIso();
  }

  isHeld(run_id: string): boolean {
    const ws = this.workspaceOfRun.get(run_id);
    return this.holds.some((h) => !h.released_at && ((h.scope.run_id && h.scope.run_id === run_id) || (h.scope.workspace_id && h.scope.workspace_id === ws)));
  }

  activeHolds(): LitigationHold[] {
    return this.holds.filter((h) => !h.released_at);
  }

  /** Retention is policy-driven and refuses anything under hold. L2 is otherwise never deleted. */
  retentionCandidates(olderThan: Date): EpisodicRecord[] {
    return this.all().filter((r) => Date.parse(r.created_at) < olderThan.getTime() && !this.isHeld(r.run_id));
  }
}
