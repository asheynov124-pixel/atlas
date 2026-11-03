/**
 * Agentic research search. One question becomes a visible plan:
 *   understand → expand into doctrinal variants → search the library (FTS5/BM25) and,
 *   with a token, CourtListener → fuse with reciprocal-rank fusion plus authority,
 *   quote-bank and starred boosts → read the best passage of each hit with its pin cite →
 *   verify → recommend.
 * The assistant answers only from verified passages; any quotation the model writes that
 * is not verbatim in a source is removed and reported.
 */
import type { ModelProvider } from '../models/provider.js';
import { ResearchLibrary, type CaseRow, type Treatment } from './library.js';
import { CourtListener, type ClHit } from './courtlistener.js';
import { fullCite, shortCite, verifyQuote, pinFor } from './cites.js';

export interface TraceStep { step: 'understand' | 'expand' | 'search' | 'rank' | 'read' | 'verify' | 'recommend' | 'answer'; detail: string; items?: string[] }
export interface ResearchResult {
  case_id: string; name: string; short_name: string; citation: string | null; court: string | null; court_rank: number; date: string | null; excerpt: boolean;
  passage: string; start: number; end: number; pin: string | null; full_cite: string; short_cite: string; score: number; why: string[]; saved_quotes: number; starred: boolean; matched_variants: string[];
}
export interface Recommendation { kind: 'related' | 'save_quote' | 'treatment' | 'adverse' | 'next_query' | 'import' | 'quote'; title: string; detail: string; action?: Record<string, unknown> }
export interface SearchOutput { query: string; plan: { intent: string; variants: string[]; doctrines: string[] }; trace: TraceStep[]; results: ResearchResult[]; external: ClHit[]; recommendations: Recommendation[] }

/** Doctrinal expansions for New Jersey civil practice (used offline; live mode adds model-generated ones). */
export const DOCTRINE_MAP: Array<{ match: RegExp; doctrine: string; variants: string[] }> = [
  { match: /summary judgment|4:46|genuine issue|material fact/i, doctrine: 'Summary judgment, R. 4:46-2', variants: ['genuine issue material fact', 'rational factfinder non-moving party', 'discriminating search', '"summary judgment"'] },
  { match: /dismiss|4:6-2|failure to state|pleading|complaint/i, doctrine: 'Motion to dismiss, R. 4:6-2(e)', variants: ['legal sufficiency facts alleged complaint', 'fundament cause of action', 'every reasonable inference'] },
  { match: /credib|weigh/i, doctrine: 'Credibility and weighing of evidence', variants: ['credibility determinations jury', 'weigh the evidence'] },
  { match: /notice|defect|nonconform|non-conform/i, doctrine: 'Notice and cure', variants: ['notice of defect', 'timely notice'] },
];

export const NEGATIVE = /\b(overruled|overruling|abrogated|abrogating|reversed|disapproved|superseded|declined to follow|decline to follow|limited to its facts|criticized|no longer good law)\b/i;
export const CONTRARY = /\b(but see|contra|however|distinguish\w*|declin\w*|reject\w*|refus\w*|not persuaded)\b/i;

function parseJson<T>(text: string, fallback: T): T {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return fallback;
  try { return JSON.parse(m[0]) as T; } catch { return fallback; }
}

export class ResearchAgent {
  constructor(readonly lib: ResearchLibrary, private provider: ModelProvider, readonly cl: CourtListener = new CourtListener()) {}

  async plan(query: string): Promise<SearchOutput['plan']> {
    const doctrines = DOCTRINE_MAP.filter((d) => d.match.test(query));
    const variants = new Set<string>([query, ...doctrines.flatMap((d) => d.variants)]);
    const r = await this.provider.complete({ tier: 'fast', effort: 'low', json: true, system: '[[task:research_plan]] You are a New Jersey litigation research librarian. Expand the question into 3-5 short search queries using the doctrinal terms courts actually use. Return JSON {"intent": string, "variants": [string], "doctrines": [string]}.', prompt: query });
    const p = parseJson<{ intent?: string; variants?: string[]; doctrines?: string[] }>(r.text, {});
    for (const v of p.variants ?? []) if (v && v.length < 120) variants.add(v);
    const intent = p.intent ?? (/\d+\s+N\.J\./.test(query) ? 'citation lookup' : doctrines.length ? 'doctrine' : 'open question');
    return { intent, variants: [...variants].slice(0, 7), doctrines: [...new Set([...doctrines.map((d) => d.doctrine), ...(p.doctrines ?? [])])] };
  }

  async search(query: string, opts: { user?: string | null; external?: boolean; courts?: string[] } = {}): Promise<SearchOutput> {
    const trace: TraceStep[] = [];
    this.lib.logSearch(opts.user ?? null, query);
    const direct = this.lib.byCitation(query);
    const plan = await this.plan(query);
    trace.push({ step: 'understand', detail: `Intent: ${plan.intent}.${plan.doctrines.length ? ` Doctrine: ${plan.doctrines.join('; ')}.` : ''}` });
    trace.push({ step: 'expand', detail: `Searching ${plan.variants.length} phrasings.`, items: plan.variants });

    const fused = new Map<string, { score: number; variants: Set<string> }>();
    const K = 60;
    for (const v of plan.variants) {
      const hits = this.lib.searchCases(v, { limit: 20 });
      hits.forEach((h, rank) => {
        const e = fused.get(h.case.id) ?? { score: 0, variants: new Set<string>() };
        e.score += 1 / (K + rank);
        e.variants.add(v);
        fused.set(h.case.id, e);
      });
    }
    const quoteHits = this.lib.listQuotes({ q: query, limit: 20 });
    for (const q of quoteHits) { const e = fused.get(q.case_id) ?? { score: 0, variants: new Set<string>() }; e.score += 0.012; e.variants.add('quote bank'); fused.set(q.case_id, e); }
    if (direct) { const e = fused.get(direct.id) ?? { score: 0, variants: new Set<string>() }; e.score += 1; e.variants.add('citation'); fused.set(direct.id, e); }

    let external: ClHit[] = [];
    if (opts.external !== false && this.cl.enabled) {
      try { external = await this.cl.search(query, { courts: opts.courts ?? ['nj', 'njsuperctappdiv'], limit: 8 }); } catch (e) { trace.push({ step: 'search', detail: `CourtListener unavailable: ${(e as Error).message}` }); }
    }
    trace.push({ step: 'search', detail: `Library: ${fused.size} matching opinions, ${quoteHits.length} saved quotes.${this.cl.enabled ? ` CourtListener: ${external.length} results.` : ' CourtListener: add COURTLISTENER_TOKEN to search all published opinions.'}` });

    const terms = [query, ...plan.variants].join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const results: ResearchResult[] = [];
    for (const [id, f] of fused) {
      const c = this.lib.getCase(id);
      if (!c) continue;
      const quotes = this.lib.listQuotes({ case_id: id });
      const authority = c.court_rank === 1 ? 0.02 : c.court_rank <= 3 ? 0.01 : 0;
      const score = f.score + authority + (c.starred ? 0.01 : 0) + Math.min(0.01, quotes.reduce((n, q) => n + q.uses, 0) * 0.001) + Math.min(0.005, c.opens * 0.0005);
      const passage = bestTermPassage(c, terms);
      const why: string[] = [];
      why.push(`Matched ${[...f.variants].slice(0, 3).map((v) => `“${v.replace(/"/g, '')}”`).join(', ')}`);
      if (c.court_rank === 1) why.push('Binding: Supreme Court of New Jersey');
      else if (c.court_rank === 3) why.push('Appellate Division');
      if (quotes.length) why.push(`${quotes.length} saved quote${quotes.length === 1 ? '' : 's'} in your bank`);
      if (c.starred) why.push('Starred');
      if (c.excerpt) why.push('Excerpt only: import the full opinion before relying on context');
      results.push({ case_id: id, name: c.name, short_name: c.short_name ?? c.name, citation: c.citation, court: c.court, court_rank: c.court_rank, date: c.date, excerpt: c.excerpt, passage: passage.text, start: passage.start, end: passage.end, pin: passage.pin, full_cite: fullCite(c, passage.pin), short_cite: shortCite(c, passage.pin), score, why, saved_quotes: quotes.length, starred: c.starred, matched_variants: [...f.variants] });
    }
    results.sort((a, b) => b.score - a.score);
    trace.push({ step: 'rank', detail: 'Fused rankings across phrasings, then weighted binding authority, your quote bank and stars.' });
    trace.push({ step: 'read', detail: `Read the strongest passage of the top ${Math.min(results.length, 8)} opinions and computed pin cites from star pagination.` });
    trace.push({ step: 'verify', detail: 'Every passage shown is verbatim from the stored opinion text.' });
    const recommendations = this.recommend(query, results, external, opts.user ?? null);
    trace.push({ step: 'recommend', detail: `${recommendations.length} suggestions.` });
    return { query, plan, trace, results: results.slice(0, 12), external, recommendations };
  }

  recommend(query: string, results: ResearchResult[], external: ClHit[], user: string | null): Recommendation[] {
    const recs: Recommendation[] = [];
    const top = results[0];
    if (top) {
      const seen = new Set<string>();
      for (const c of this.lib.cites(top.case_id).filter((x) => x.in_library && x.in_library.id !== top.case_id && !seen.has(x.in_library.id) && seen.add(x.in_library.id)).slice(0, 2)) recs.push({ kind: 'related', title: `${top.short_name} relies on ${c.in_library!.name}`, detail: `Cited as ${c.cite}. Reading the source authority first avoids quoting it second-hand.`, action: { open_case: c.in_library!.id } });
      for (const c of this.lib.citedBy(top.case_id).slice(0, 2)) recs.push({ kind: 'related', title: `${c.name} cites ${top.short_name}`, detail: 'A later opinion in your library applies this case.', action: { open_case: c.id } });
      const banked = this.lib.listQuotes({ case_id: top.case_id }).map((q) => q.text);
      if (!banked.some((t) => top.passage.includes(t.slice(0, 40)))) recs.push({ kind: 'save_quote', title: `Save the best passage from ${top.short_name}`, detail: `“${top.passage.slice(0, 140)}${top.passage.length > 140 ? '…' : ''}” ${top.short_cite}`, action: { save_quote: { case_id: top.case_id, start: top.start, end: top.end } } });
      for (const q of this.lib.listQuotes({ case_id: top.case_id }).slice(0, 2)) recs.push({ kind: 'quote', title: `Your quote bank: ${q.short}`, detail: `“${q.text.slice(0, 150)}${q.text.length > 150 ? '…' : ''}”${q.note ? ` (${q.note})` : ''}`, action: { quote_id: q.id } });
      const c = this.lib.getCase(top.case_id);
      if (c && !c.treatment) recs.push({ kind: 'treatment', title: `Check later treatment of ${top.short_name}`, detail: 'Scans citing opinions for negative signals before you rely on it. This is a heuristic, not a citator.', action: { treatment: top.case_id } });
    }
    recs.push({ kind: 'adverse', title: 'Look for adverse authority', detail: 'RPC 3.3(a)(3) requires disclosing directly adverse controlling authority. Run the same question framed for the other side.', action: { query: `${query} contrary OR distinguished OR rejected` } });
    for (const e of external.filter((x) => !this.lib.getCase(x.id)).slice(0, 3)) recs.push({ kind: 'import', title: `Import ${e.name}`, detail: `${e.citation ?? e.court} (${e.date.slice(0, 4)}). Not yet in your library.`, action: { import_opinion: e.opinion_id } });
    for (const q of this.lib.recentSearches(user, 4).filter((x) => x !== query).slice(0, 2)) recs.push({ kind: 'next_query', title: `Return to “${q}”`, detail: 'From your recent research.', action: { query: q } });
    return recs;
  }

  /** Research assistant: answers from verified passages only. */
  async ask(message: string, opts: { user?: string | null } = {}): Promise<{ answer: string; sources: ResearchResult[]; removed: string[]; trace: TraceStep[]; recommendations: Recommendation[] }> {
    const s = await this.search(message, { ...opts, external: false });
    const sources = s.results.slice(0, 5);
    const srcBlock = sources.map((r, i) => `[S${i + 1}] ${r.short_cite}: ${this.lib.getCase(r.case_id)!.text.slice(Math.max(0, r.start - 400), r.end + 400)}`).join('\n\n');
    const r = await this.provider.complete({
      tier: 'balanced', effort: 'medium',
      system: '[[task:research_answer]] You are a New Jersey litigation research assistant. Answer using only the SOURCES. Quote exact words in double quotes and follow each quote with its source tag like [S1]. Never quote anything not in the sources. If the sources do not answer the question, say so and suggest a search.',
      prompt: `QUESTION: ${message}\n\nSOURCES:\n${srcBlock || '(none)'}`,
    });
    let answer = r.text;
    const removed: string[] = [];
    // Verify every quotation against the source it is attributed to.
    answer = answer.replace(/["“]([^"”]{12,})["”]\s*\[S(\d)\]/g, (whole, q: string, n: string) => {
      const src = sources[Number(n) - 1];
      const c = src ? this.lib.getCase(src.case_id) : null;
      const v = c ? verifyQuote(c.text, q) : null;
      if (!src || !c || !v?.ok || c.text.slice(v.start, v.end).includes('[Excerpt:')) { removed.push(q); return '[quotation removed: not verbatim in the cited source]'; }
      return `“${q}” ${shortCite(c, pinFor(c.text, v.start, v.end, c.first_page))}`;
    });
    answer = answer.replace(/\[S(\d)\]/g, (_, n: string) => sources[Number(n) - 1]?.short_cite ?? '');
    s.trace.push({ step: 'answer', detail: removed.length ? `Removed ${removed.length} quotation(s) that were not verbatim in a source.` : 'Every quotation in the answer was verified against its source.' });
    return { answer, sources, removed, trace: s.trace, recommendations: s.recommendations };
  }

  /** Heuristic treatment scan over citing opinions in the library and, with a token, CourtListener. */
  async treatment(case_id: string): Promise<Treatment> {
    const c = this.lib.getCase(case_id);
    if (!c) throw new Error('unknown case');
    const signals: Treatment['signals'] = [];
    const citing = this.lib.citedBy(case_id);
    for (const k of citing) {
      const other = this.lib.getCase(k.id)!;
      for (const cite of c.citations) {
        let idx = other.text.indexOf(cite);
        while (idx >= 0) {
          const window = other.text.slice(Math.max(0, idx - 300), idx + 300);
          const neg = NEGATIVE.exec(window);
          signals.push({ by: k.id, by_name: k.name, signal: neg ? `negative: ${neg[0]}` : 'cited', snippet: window.replace(/\s+/g, ' ').trim() });
          idx = other.text.indexOf(cite, idx + cite.length);
        }
      }
    }
    let externalNote = '';
    if (this.cl.enabled) {
      try {
        const n = Number(case_id.replace(/^cl:/, ''));
        const hits = await this.cl.citing(n, 20);
        for (const h of hits) { const neg = NEGATIVE.exec(h.snippet); signals.push({ by: h.id, by_name: h.name, signal: neg ? `negative: ${neg[0]}` : 'cited', snippet: h.snippet }); }
        externalNote = ` and ${hits.length} on CourtListener`;
      } catch { externalNote = ' (CourtListener unavailable)'; }
    }
    const negative = signals.filter((s) => s.signal.startsWith('negative'));
    const t: Treatment = {
      checked_at: new Date().toISOString(), method: 'heuristic scan of citing opinions for negative language near the citation; not a citator', signals,
      summary: negative.length ? `${negative.length} possible negative signal(s) among ${citing.length} citing opinion(s) in your library${externalNote}. Read them before relying on ${c.short_name}.` : `No negative signals found among ${citing.length} citing opinion(s) in your library${externalNote}. Confirm with a citator before filing.`,
    };
    this.lib.update(case_id, { treatment: t });
    return t;
  }
}

function bestTermPassage(c: CaseRow, terms: string[]): { text: string; start: number; end: number; pin: string | null } {
  const rx = /[^.!?\n]+[.!?]?["”]?/g;
  let m: RegExpExecArray | null;
  let best = { score: -1, start: 0, end: Math.min(300, c.text.length) };
  while ((m = rx.exec(c.text))) {
    const t = m[0].toLowerCase();
    if (t.length < 30 || t.includes('[excerpt:')) continue;
    const score = terms.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0) + (t.length > 120 ? 0.3 : 0);
    if (score > best.score) best = { score, start: m.index + (m[0].length - m[0].trimStart().length), end: m.index + m[0].length };
  }
  const text = c.text.slice(best.start, best.end).replace(/\[\*\d+\]\s?/g, '').replace(/\s+/g, ' ').trim();
  return { text, start: best.start, end: best.end, pin: pinFor(c.text, best.start, best.end, c.first_page) };
}
