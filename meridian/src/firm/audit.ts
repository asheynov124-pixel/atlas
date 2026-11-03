/**
 * Append-only, hash-chained audit log. Each row stores the SHA-256 of the previous
 * row's hash plus its own content, so editing or deleting any row breaks the chain
 * from that point on. `verify()` walks the chain and reports the first break.
 */
import { createHash } from 'node:crypto';
import type { Db } from '../store/db.js';

export interface AuditRow { seq: number; at: string; matter_id: string | null; actor: string; action: string; detail: string; prev_hash: string; hash: string }

const GENESIS = '0'.repeat(64);

function digest(prev: string, at: string, matter_id: string | null, actor: string, action: string, detail: string): string {
  return createHash('sha256').update([prev, at, matter_id ?? '', actor, action, detail].join('␟')).digest('hex');
}

export class AuditLog {
  constructor(private db: Db) {}

  append(actor: string, action: string, detail: Record<string, unknown>, matter_id: string | null = null): AuditRow {
    const last = this.db.prepare('SELECT hash FROM audit ORDER BY seq DESC LIMIT 1').get() as { hash: string } | undefined;
    const prev = last?.hash ?? GENESIS;
    const at = new Date().toISOString();
    const d = JSON.stringify(detail);
    const hash = digest(prev, at, matter_id, actor, action, d);
    const r = this.db.prepare('INSERT INTO audit (at, matter_id, actor, action, detail, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?)').run(at, matter_id, actor, action, d, prev, hash);
    return { seq: Number(r.lastInsertRowid), at, matter_id, actor, action, detail: d, prev_hash: prev, hash };
  }

  rows(matter_id?: string | null, limit = 100000): AuditRow[] {
    if (matter_id) return this.db.prepare('SELECT * FROM audit WHERE matter_id = ? ORDER BY seq LIMIT ?').all(matter_id, limit) as unknown as AuditRow[];
    return this.db.prepare('SELECT * FROM audit ORDER BY seq LIMIT ?').all(limit) as unknown as AuditRow[];
  }

  verify(): { ok: boolean; rows: number; broken_at?: number } {
    let prev = GENESIS;
    const rows = this.rows();
    for (const r of rows) {
      if (r.prev_hash !== prev || digest(r.prev_hash, r.at, r.matter_id, r.actor, r.action, r.detail) !== r.hash) return { ok: false, rows: rows.length, broken_at: r.seq };
      prev = r.hash;
    }
    return { ok: true, rows: rows.length };
  }

  toCsv(rows: AuditRow[]): string {
    const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    return ['seq,at,matter_id,actor,action,detail,hash'].concat(rows.map((r) => [r.seq, r.at, r.matter_id, r.actor, r.action, r.detail, r.hash].map(q).join(','))).join('\n') + '\n';
  }
}
