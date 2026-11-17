/**
 * Drafts. The editor stores HTML; inserted authorities are cite tokens:
 *   <span class="cite law" data-case="cl:2381317" data-quote="q_ab12">“…” Brill, 142 N.J. at 540.</span>
 *   <span class="cite record" data-pointer="ep:docs/…/chars_10-80">… (HARBOR_000401, p. 1, l. 2)</span>
 * Verification re-checks every token and every free-typed quotation that is followed by a
 * recognizable citation, and reports the correct pin when the draft's pin is wrong.
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../store/db.js';
import { ResearchLibrary } from './library.js';
import { CITATION, normalizeReporter, pinFor, shortCite, fullCite, verifyQuote, cleanWithMap } from './cites.js';

export interface DraftRow { id: string; matter_id: string; title: string; body: string; owner: string | null; created_at: string; updated_at: string }
export interface DraftCheck { kind: 'law' | 'record' | 'typed'; status: 'verified' | 'wrong_pin' | 'not_verbatim' | 'unknown_authority' | 'dangling'; quote: string; cite: string; expected?: string; detail: string; index: number }

export class Drafts {
  constructor(private db: Db) {}

  create(matter_id: string, title: string, owner: string, body = ''): DraftRow {
    const now = new Date().toISOString();
    const d: DraftRow = { id: `drf_${randomUUID().slice(0, 8)}`, matter_id, title: title || 'Untitled draft', body, owner, created_at: now, updated_at: now };
    this.db.prepare('INSERT INTO drafts (id, matter_id, title, body, owner, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(d.id, d.matter_id, d.title, d.body, d.owner, d.created_at, d.updated_at);
    return d;
  }
  list(matter_id: string): Array<Omit<DraftRow, 'body'> & { chars: number }> {
    return (this.db.prepare('SELECT id, matter_id, title, owner, created_at, updated_at, length(body) AS chars FROM drafts WHERE matter_id = ? ORDER BY updated_at DESC').all(matter_id) as unknown as Array<Omit<DraftRow, 'body'> & { chars: number }>);
  }
  get(id: string, matter_id: string): DraftRow | null {
    return (this.db.prepare('SELECT * FROM drafts WHERE id = ? AND matter_id = ?').get(id, matter_id) as unknown as DraftRow | undefined) ?? null;
  }
  save(id: string, matter_id: string, patch: { title?: string; body?: string }): DraftRow {
    const d = this.get(id, matter_id);
    if (!d) throw new Error('draft not found');
    this.db.prepare('UPDATE drafts SET title = ?, body = ?, updated_at = ? WHERE id = ?').run(patch.title ?? d.title, patch.body ?? d.body, new Date().toISOString(), id);
    return this.get(id, matter_id)!;
  }
  remove(id: string, matter_id: string): void { this.db.prepare('DELETE FROM drafts WHERE id = ? AND matter_id = ?').run(id, matter_id); }
}

function stripTags(s: string): string { return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }

export function verifyDraft(html: string, lib: ResearchLibrary, record: { resolve: (p: string) => { text: string } | null; citeFor: (p: string) => string | null }): { checks: DraftCheck[]; authorities: Array<{ case_id: string; cite: string; uses: number }>; summary: string } {
  const checks: DraftCheck[] = [];
  const toa = new Map<string, { cite: string; uses: number }>();
  let index = 0;
  const tokenRx = /<span[^>]*class="[^"]*\bcite\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi;
  for (const m of html.matchAll(tokenRx)) {
    index++;
    const tag = m[0];
    const attr = (n: string) => new RegExp(`data-${n}="([^"]*)"`).exec(tag)?.[1];
    const inner = stripTags(tag);
    const quote = /[“"]([^”"]+)[”"]/.exec(inner)?.[1] ?? '';
    if (/\brecord\b/.test(tag)) {
      const pointer = attr('pointer') ?? '';
      const r = record.resolve(pointer);
      const cite = record.citeFor(pointer) ?? pointer;
      if (!r) { checks.push({ kind: 'record', status: 'dangling', quote, cite, detail: 'The record pointer no longer resolves.', index }); continue; }
      const ok = !quote || cleanWithMap(r.text).clean.toLowerCase().includes(cleanWithMap(quote).clean.toLowerCase());
      checks.push({ kind: 'record', status: ok ? 'verified' : 'not_verbatim', quote, cite, detail: ok ? 'Matches the record verbatim.' : 'The quoted words are not in the cited record passage.', index });
      continue;
    }
    const caseId = attr('case') ?? '';
    const c = lib.getCase(caseId);
    if (!c) { checks.push({ kind: 'law', status: 'unknown_authority', quote, cite: inner.slice(-80), detail: 'This authority is not in the research database.', index }); continue; }
    toa.set(c.id, { cite: fullCite(c), uses: (toa.get(c.id)?.uses ?? 0) + 1 });
    if (!quote) { checks.push({ kind: 'law', status: 'verified', quote: '', cite: shortCite(c), detail: 'Citation without quotation.', index }); continue; }
    const v = verifyQuote(c.text, quote);
    if (!v.ok) { checks.push({ kind: 'law', status: 'not_verbatim', quote, cite: shortCite(c), detail: v.reason ?? 'Not found.', index }); continue; }
    const pin = pinFor(c.text, v.start, v.end, c.first_page);
    const stated = attr('pin') ?? /at (\d+(?:-\d+)?)/.exec(inner)?.[1];
    checks.push({ kind: 'law', status: stated && pin && stated !== pin ? 'wrong_pin' : 'verified', quote, cite: shortCite(c, stated ?? pin), expected: shortCite(c, pin), detail: stated && pin && stated !== pin ? `The quotation appears at ${pin}, not ${stated}.` : `Verbatim${v.exact ? '' : ' (capitalization differs)'} at ${pin}.`, index });
  }
  // Free-typed quotations followed by a citation.
  const plain = stripTags(html.replace(tokenRx, ' '));
  const typedRx = /[“"]([^”"]{15,})[”"][^“"]{0,160}?(?:(\d{1,4})\s+(N\.\s?J\.(?:\s?Super\.)?|A\.\s?[23]d|U\.\s?S\.)\s+(\d{1,5})(?:,\s*(\d{1,5}(?:-\d+)?))?|([A-Z][A-Za-z.' -]{2,40}),\s+(\d{1,4})\s+(N\.\s?J\.(?:\s?Super\.)?|A\.\s?[23]d)\s+at\s+(\d{1,5}(?:-\d+)?))/g;
  for (const m of plain.matchAll(typedRx)) {
    index++;
    const quote = m[1]!;
    const vol = m[2] ?? m[7], rep = m[3] ?? m[8], page = m[4], statedPin = m[5] ?? m[9];
    const c = page ? lib.byCitation(`${vol} ${normalizeReporter(rep!)} ${page}`) : lib.listCases().map((x) => lib.getCase(x.id)!).find((x) => x.volume === Number(vol) && x.reporter === normalizeReporter(rep!));
    const citeText = m[0].slice(m[0].lastIndexOf(m[1]!) + m[1]!.length).replace(/^[”"\s,]+/, '').trim();
    if (!c) { checks.push({ kind: 'typed', status: 'unknown_authority', quote, cite: citeText, detail: 'Import this case to verify the quotation.', index }); continue; }
    toa.set(c.id, { cite: fullCite(c), uses: (toa.get(c.id)?.uses ?? 0) + 1 });
    const v = verifyQuote(c.text, quote);
    if (!v.ok) { checks.push({ kind: 'typed', status: 'not_verbatim', quote, cite: citeText, detail: v.reason ?? 'Not found.', index }); continue; }
    const pin = pinFor(c.text, v.start, v.end, c.first_page);
    checks.push({ kind: 'typed', status: statedPin && pin && statedPin !== pin ? 'wrong_pin' : 'verified', quote, cite: citeText, expected: shortCite(c, pin), detail: statedPin && pin && statedPin !== pin ? `The quotation appears at ${pin}, not ${statedPin}.` : `Verbatim at ${pin}.`, index });
  }
  const bad = checks.filter((c) => c.status !== 'verified').length;
  const authorities = [...toa].map(([case_id, v]) => ({ case_id, ...v })).sort((a, b) => a.cite.localeCompare(b.cite));
  return { checks, authorities, summary: checks.length ? (bad ? `${bad} of ${checks.length} citations need attention.` : `All ${checks.length} citations verified.`) : 'No citations found yet. Drag quotes from the bank or record cites into the draft.' };
}

/** Self-check for the typed-citation pattern so a refactor cannot silently break it. */
export const _citationPattern = CITATION;
