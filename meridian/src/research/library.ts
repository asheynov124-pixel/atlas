/**
 * Research database: cases, the quote bank, citation graph, search log.
 * Full-text search runs on SQLite FTS5 with BM25 ranking. Quotes are saved only after
 * they verify verbatim against the stored opinion, and their pin cite is computed from
 * star pagination, so a quote in the bank is always quotable.
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../store/db.js';
import { json } from '../store/db.js';
import { extractCitations, fullCite, pinFor, shortCite, verifyQuote, parseCitation, cleanWithMap } from './cites.js';
import { SEED_CASES, SEED_QUOTES } from './seed.js';

export interface CaseRow {
  id: string; name: string; short_name: string | null; citation: string | null; citations: string[]; court: string | null; court_rank: number;
  date: string | null; reporter: string | null; volume: number | null; first_page: number | null; source: string; url: string | null;
  text: string; excerpt: boolean; tags: string[]; notes: string; starred: boolean; treatment: Treatment | null; imported_by: string | null; imported_at: string; opens: number;
}
export interface Treatment { checked_at: string; method: string; signals: Array<{ by: string; by_name: string; signal: string; snippet: string }>; summary: string }
export interface QuoteRow { id: string; case_id: string; text: string; start: number; end: number; pin: string | null; tags: string[]; note: string; proposition: string; uses: number; matter_id: string | null; created_by: string | null; created_at: string; cite: string; short: string; case_name: string }

export class QuoteError extends Error { constructor(m: string) { super(m); this.name = 'QuoteError'; } }

const STOP = new Set(['the', 'and', 'for', 'that', 'with', 'what', 'when', 'which', 'this', 'from', 'are', 'was', 'were', 'does', 'how', 'can', 'under', 'into', 'about', 'there', 'their', 'have', 'has', 'not', 'any', 'all', 'case', 'cases', 'law', 'nj', 'new', 'jersey']);

export function ftsQuery(q: string, mode: 'or' | 'and' = 'or'): string {
  const phrases = [...q.matchAll(/"([^"]+)"/g)].map((m) => m[1]!.replace(/[^\w\s:.-]/g, ' ').trim()).filter(Boolean);
  const rest = q.replace(/"[^"]+"/g, ' ');
  const words = rest.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  const parts = [...phrases.map((p) => `"${p}"`), ...words.map((w) => `${w}*`)];
  return parts.join(mode === 'and' ? ' AND ' : ' OR ');
}

function rowToCase(r: Record<string, unknown>): CaseRow {
  return { ...(r as unknown as CaseRow), citations: json(r['citations'] as string, []), tags: json(r['tags'] as string, []), treatment: json(r['treatment'] as string, null), excerpt: !!r['excerpt'], starred: !!r['starred'] };
}

export class ResearchLibrary {
  constructor(readonly db: Db) {}

  seedIfEmpty(): number {
    const n = Number((this.db.prepare('SELECT COUNT(*) AS n FROM cases').get() as { n: number }).n);
    if (n > 0) return 0;
    for (const s of SEED_CASES) this.importCase({ ...s, imported_by: 'seed' });
    for (const q of SEED_QUOTES) this.saveQuote({ ...q, user: 'seed' });
    return SEED_CASES.length;
  }

  importCase(c: { id?: string; name: string; short_name?: string; citation?: string; citations?: string[]; court?: string; court_rank?: number; date?: string; reporter?: string; volume?: number; first_page?: number; source: string; url?: string; text: string; excerpt?: boolean; tags?: string[]; imported_by?: string }): CaseRow {
    const parsed = c.citation ? parseCitation(c.citation) : null;
    const id = c.id ?? `local:${randomUUID().slice(0, 8)}`;
    const row = {
      id, name: c.name.trim(), short_name: c.short_name ?? c.name.split(' v. ')[0]!.trim(), citation: c.citation ?? null,
      citations: JSON.stringify(c.citations ?? (c.citation ? [c.citation] : [])), court: c.court ?? null, court_rank: c.court_rank ?? rankCourt(c.court),
      date: c.date ?? null, reporter: c.reporter ?? parsed?.reporter ?? null, volume: c.volume ?? parsed?.volume ?? null, first_page: c.first_page ?? parsed?.page ?? null,
      source: c.source, url: c.url ?? null, text: c.text, excerpt: c.excerpt ? 1 : 0, tags: JSON.stringify(c.tags ?? []), imported_by: c.imported_by ?? null, imported_at: new Date().toISOString(),
    };
    this.db.prepare(`INSERT INTO cases (id, name, short_name, citation, citations, court, court_rank, date, reporter, volume, first_page, source, url, text, excerpt, tags, imported_by, imported_at)
      VALUES (@id, @name, @short_name, @citation, @citations, @court, @court_rank, @date, @reporter, @volume, @first_page, @source, @url, @text, @excerpt, @tags, @imported_by, @imported_at)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, short_name=excluded.short_name, citation=excluded.citation, citations=excluded.citations, court=excluded.court, court_rank=excluded.court_rank, date=excluded.date,
        reporter=excluded.reporter, volume=excluded.volume, first_page=excluded.first_page, source=excluded.source, url=excluded.url, text=excluded.text, excerpt=excluded.excerpt`).run(row);
    this.db.prepare('DELETE FROM cases_fts WHERE case_id = ?').run(id);
    this.db.prepare('INSERT INTO cases_fts (case_id, name, citation, body) VALUES (?, ?, ?, ?)').run(id, row.name, JSON.parse(row.citations).join(' '), cleanWithMap(c.text).clean);
    this.db.prepare('DELETE FROM cites_out WHERE case_id = ?').run(id);
    const own = new Set(JSON.parse(row.citations) as string[]);
    for (const cite of extractCitations(c.text)) if (!own.has(cite)) this.db.prepare('INSERT OR IGNORE INTO cites_out (case_id, cited) VALUES (?, ?)').run(id, cite);
    return this.getCase(id)!;
  }

  getCase(id: string): CaseRow | null {
    const r = this.db.prepare('SELECT * FROM cases WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? rowToCase(r) : null;
  }

  byCitation(cite: string): CaseRow | null {
    const p = parseCitation(cite);
    if (!p) return null;
    const r = this.db.prepare('SELECT * FROM cases WHERE volume = ? AND reporter = ? AND first_page = ?').get(p.volume, p.reporter, p.page) as Record<string, unknown> | undefined;
    if (r) return rowToCase(r);
    const all = this.db.prepare('SELECT * FROM cases').all() as Record<string, unknown>[];
    const key = `${p.volume} ${p.reporter} ${p.page}`;
    const hit = all.map(rowToCase).find((c) => c.citations.includes(key));
    return hit ?? null;
  }

  listCases(opts: { starred?: boolean; limit?: number } = {}): Array<Omit<CaseRow, 'text'> & { chars: number; quotes: number }> {
    const rows = this.db.prepare(`SELECT c.*, length(c.text) AS chars, (SELECT COUNT(*) FROM quotes q WHERE q.case_id = c.id) AS quotes FROM cases c ${opts.starred ? 'WHERE starred = 1' : ''} ORDER BY court_rank, date DESC LIMIT ?`).all(opts.limit ?? 500) as Record<string, unknown>[];
    return rows.map((r) => { const c = rowToCase(r); const { text: _t, ...rest } = c; return { ...rest, chars: Number(r['chars']), quotes: Number(r['quotes']) }; });
  }

  update(id: string, patch: { starred?: boolean; tags?: string[]; notes?: string; treatment?: Treatment }): CaseRow {
    if (patch.starred !== undefined) this.db.prepare('UPDATE cases SET starred = ? WHERE id = ?').run(patch.starred ? 1 : 0, id);
    if (patch.tags) this.db.prepare('UPDATE cases SET tags = ? WHERE id = ?').run(JSON.stringify(patch.tags), id);
    if (patch.notes !== undefined) this.db.prepare('UPDATE cases SET notes = ? WHERE id = ?').run(patch.notes, id);
    if (patch.treatment) this.db.prepare('UPDATE cases SET treatment = ? WHERE id = ?').run(JSON.stringify(patch.treatment), id);
    return this.getCase(id)!;
  }

  opened(id: string): void { this.db.prepare('UPDATE cases SET opens = opens + 1 WHERE id = ?').run(id); }

  /** BM25 search over opinions. Returns the best snippet with raw offsets for a pin cite. */
  searchCases(q: string, opts: { limit?: number; mode?: 'or' | 'and' } = {}): Array<{ case: Omit<CaseRow, 'text'>; score: number; snippet: string; start: number; end: number; pin: string | null }> {
    const fq = ftsQuery(q, opts.mode);
    if (!fq) return [];
    let rows: Array<{ case_id: string; score: number }> = [];
    try { rows = this.db.prepare('SELECT case_id, bm25(cases_fts, 0, 4.0, 3.0, 1.0) AS score FROM cases_fts WHERE cases_fts MATCH ? ORDER BY score LIMIT ?').all(fq, opts.limit ?? 25) as Array<{ case_id: string; score: number }>; } catch { rows = []; }
    const terms = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
    return rows.map((r) => {
      const c = this.getCase(r.case_id)!;
      const best = bestPassage(c.text, terms);
      const { text: _t, ...meta } = c;
      return { case: meta, score: -r.score, snippet: best.text, start: best.start, end: best.end, pin: pinFor(c.text, best.start, best.end, c.first_page) };
    });
  }

  saveQuote(input: { case_id: string; text: string; proposition?: string; tags?: string[]; note?: string; matter_id?: string | null; user?: string }): QuoteRow {
    const c = this.getCase(input.case_id);
    if (!c) throw new QuoteError('That case is not in the research database.');
    const check = verifyQuote(c.text, input.text);
    if (!check.ok) throw new QuoteError(`The quote does not match the opinion text (${check.reason}). Quotes are saved only when they are verbatim.`);
    const exact = c.text.slice(check.start, check.end);
    if (exact.includes('[Excerpt:')) throw new QuoteError('The quote spans omitted text in an excerpt.');
    const pin = pinFor(c.text, check.start, check.end, c.first_page);
    const id = `q_${randomUUID().slice(0, 8)}`;
    const clean = cleanWithMap(exact).clean;
    this.db.prepare('INSERT INTO quotes (id, case_id, text, start, end, pin, tags, note, proposition, matter_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, c.id, clean, check.start, check.end, pin, JSON.stringify(input.tags ?? []), input.note ?? '', input.proposition ?? '', input.matter_id ?? null, input.user ?? null, new Date().toISOString());
    this.db.prepare('INSERT INTO quotes_fts (quote_id, text, proposition, tags) VALUES (?, ?, ?, ?)').run(id, clean, input.proposition ?? '', (input.tags ?? []).join(' '));
    return this.getQuote(id)!;
  }

  getQuote(id: string): QuoteRow | null {
    const r = this.db.prepare('SELECT q.*, c.name AS case_name FROM quotes q JOIN cases c ON c.id = q.case_id WHERE q.id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? this.decorate(r) : null;
  }

  private decorate(r: Record<string, unknown>): QuoteRow {
    const c = this.getCase(String(r['case_id']))!;
    const pin = (r['pin'] as string | null) ?? null;
    return { ...(r as unknown as QuoteRow), tags: json(r['tags'] as string, []), cite: fullCite(c, pin), short: shortCite(c, pin), case_name: c.name };
  }

  listQuotes(opts: { q?: string; case_id?: string; limit?: number } = {}): QuoteRow[] {
    if (opts.q) {
      const fq = ftsQuery(opts.q);
      if (!fq) return [];
      let ids: Array<{ quote_id: string }> = [];
      try { ids = this.db.prepare('SELECT quote_id FROM quotes_fts WHERE quotes_fts MATCH ? ORDER BY bm25(quotes_fts) LIMIT ?').all(fq, opts.limit ?? 50) as Array<{ quote_id: string }>; } catch { ids = []; }
      return ids.map((x) => this.getQuote(x.quote_id)).filter((x): x is QuoteRow => !!x);
    }
    const rows = this.db.prepare(`SELECT q.*, c.name AS case_name FROM quotes q JOIN cases c ON c.id = q.case_id ${opts.case_id ? 'WHERE q.case_id = ?' : ''} ORDER BY q.uses DESC, q.created_at DESC LIMIT ?`).all(...(opts.case_id ? [opts.case_id, opts.limit ?? 200] : [opts.limit ?? 200])) as Record<string, unknown>[];
    return rows.map((r) => this.decorate(r));
  }

  useQuote(id: string): void { this.db.prepare('UPDATE quotes SET uses = uses + 1 WHERE id = ?').run(id); }

  updateQuote(id: string, patch: { proposition?: string; tags?: string[]; note?: string }): QuoteRow {
    if (patch.proposition !== undefined) this.db.prepare('UPDATE quotes SET proposition = ? WHERE id = ?').run(patch.proposition, id);
    if (patch.tags) this.db.prepare('UPDATE quotes SET tags = ? WHERE id = ?').run(JSON.stringify(patch.tags), id);
    if (patch.note !== undefined) this.db.prepare('UPDATE quotes SET note = ? WHERE id = ?').run(patch.note, id);
    const q = this.getQuote(id)!;
    this.db.prepare('DELETE FROM quotes_fts WHERE quote_id = ?').run(id);
    this.db.prepare('INSERT INTO quotes_fts (quote_id, text, proposition, tags) VALUES (?, ?, ?, ?)').run(id, q.text, q.proposition, q.tags.join(' '));
    return q;
  }

  deleteQuote(id: string): void {
    this.db.prepare('DELETE FROM quotes WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM quotes_fts WHERE quote_id = ?').run(id);
  }

  /** Cases in the library that cite `case_id` (by any of its citations). */
  citedBy(case_id: string): Array<{ id: string; name: string }> {
    const c = this.getCase(case_id);
    if (!c) return [];
    const out = new Map<string, string>();
    for (const cite of c.citations) {
      const rows = this.db.prepare('SELECT co.case_id AS id, k.name FROM cites_out co JOIN cases k ON k.id = co.case_id WHERE co.cited = ?').all(cite) as Array<{ id: string; name: string }>;
      for (const r of rows) if (r.id !== case_id) out.set(r.id, r.name);
    }
    return [...out].map(([id, name]) => ({ id, name }));
  }

  /** What this case cites, resolved against the library where possible. */
  cites(case_id: string): Array<{ cite: string; in_library: { id: string; name: string } | null }> {
    const rows = this.db.prepare('SELECT cited FROM cites_out WHERE case_id = ?').all(case_id) as Array<{ cited: string }>;
    return rows.map((r) => { const hit = this.byCitation(r.cited); return { cite: r.cited, in_library: hit ? { id: hit.id, name: hit.name } : null }; });
  }

  logSearch(user: string | null, query: string): void {
    this.db.prepare('INSERT INTO search_log (user_id, query, at) VALUES (?, ?, ?)').run(user, query, new Date().toISOString());
  }

  recentSearches(user: string | null, limit = 8): string[] {
    const rows = this.db.prepare('SELECT query, MAX(at) AS at FROM search_log WHERE user_id IS ? GROUP BY query ORDER BY at DESC LIMIT ?').all(user, limit) as Array<{ query: string }>;
    return rows.map((r) => r.query);
  }
}

export function rankCourt(court?: string | null): number {
  const c = (court ?? '').toLowerCase();
  if (/supreme court of new jersey/.test(c)) return 1;
  if (/supreme court of the united states/.test(c)) return 2;
  if (/appellate division/.test(c)) return 3;
  if (/third circuit/.test(c)) return 4;
  if (/district of new jersey/.test(c)) return 5;
  if (/law division|chancery|tax court/.test(c)) return 6;
  return 9;
}

/** The sentence window with the most query-term hits; raw offsets for pin cites. */
export function bestPassage(raw: string, terms: string[]): { text: string; start: number; end: number } {
  const sentences: Array<{ start: number; end: number }> = [];
  const rx = /[^.!?\n]+[.!?]?["”]?/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(raw))) if (m[0].trim().length > 25) sentences.push({ start: m.index, end: m.index + m[0].length });
  let best = { score: -1, i: 0 };
  sentences.forEach((s, i) => {
    const t = raw.slice(s.start, s.end).toLowerCase();
    const score = terms.reduce((n, w) => n + (t.includes(w) ? 2 : 0) + (t.includes(w.slice(0, -1)) ? 0.5 : 0), 0) - (t.includes('[excerpt:') ? 10 : 0);
    if (score > best.score) best = { score, i };
  });
  const s = sentences[best.i] ?? { start: 0, end: Math.min(raw.length, 300) };
  const e = sentences[best.i + 1] && best.score > 0 ? sentences[best.i + 1]!.end : s.end;
  const text = raw.slice(s.start, Math.min(e, s.start + 600)).replace(/\s+/g, ' ').trim();
  return { text, start: s.start, end: Math.min(e, s.start + 600) };
}
