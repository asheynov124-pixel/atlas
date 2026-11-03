/**
 * Citation mechanics: reporter citations, star pagination, pin cites and quote
 * verification against the stored opinion text.
 *
 * Opinion text keeps star-page markers inline as "[*540]". A position's reporter page
 * is the last marker before it (or the first page when none precedes it). Verification
 * strips the markers and normalizes whitespace and quotation marks, then maps the hit
 * back to raw offsets so the pin cite is exact.
 */

export const REPORTERS = ['N.J. Super.', 'N.J.L.', 'N.J. Eq.', 'N.J.', 'A.3d', 'A.2d', 'A.', 'U.S.', 'S. Ct.', 'L. Ed. 2d', 'F.4th', 'F.3d', 'F.2d', 'F. Supp. 3d', 'F. Supp. 2d', 'F. Supp.', 'F.'];

const REP_RX = String.raw`(N\.\s?J\.\s?Super\.|N\.\s?J\.\s?L\.|N\.\s?J\.\s?Eq\.|N\.\s?J\.|A\.\s?3d|A\.\s?2d|A\.|U\.\s?S\.|S\.\s?Ct\.|L\.\s?Ed\.\s?2d|F\.\s?4th|F\.\s?3d|F\.\s?2d|F\.\s?Supp\.\s?3d|F\.\s?Supp\.\s?2d|F\.\s?Supp\.|F\.)`;
export const CITATION = new RegExp(String.raw`\b(\d{1,4})\s+${REP_RX}\s+(\d{1,5})\b`, 'g');

export function normalizeReporter(r: string): string {
  const s = r.replace(/\s+/g, '');
  const map: Record<string, string> = { 'N.J.Super.': 'N.J. Super.', 'N.J.L.': 'N.J.L.', 'N.J.Eq.': 'N.J. Eq.', 'N.J.': 'N.J.', 'A.3d': 'A.3d', 'A.2d': 'A.2d', 'A.': 'A.', 'U.S.': 'U.S.', 'S.Ct.': 'S. Ct.', 'L.Ed.2d': 'L. Ed. 2d', 'F.4th': 'F.4th', 'F.3d': 'F.3d', 'F.2d': 'F.2d', 'F.Supp.3d': 'F. Supp. 3d', 'F.Supp.2d': 'F. Supp. 2d', 'F.Supp.': 'F. Supp.', 'F.': 'F.' };
  return map[s] ?? r.trim();
}

export function parseCitation(s: string): { volume: number; reporter: string; page: number } | null {
  CITATION.lastIndex = 0;
  const m = CITATION.exec(s);
  if (!m) return null;
  return { volume: Number(m[1]), reporter: normalizeReporter(m[2]!), page: Number(m[3]) };
}

export function extractCitations(text: string): string[] {
  const out = new Set<string>();
  CITATION.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITATION.exec(text))) out.add(`${m[1]} ${normalizeReporter(m[2]!)} ${m[3]}`);
  return [...out];
}

const STAR = /\[\*(\d{1,5})\]/g;

export function pageAt(text: string, offset: number, firstPage?: number | null): number | null {
  let page: number | null = firstPage ?? null;
  STAR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STAR.exec(text)) && m.index <= offset) page = Number(m[1]);
  return page;
}

/** "540" or "540-41" (Bluebook drops repeated leading digits). */
export function pinFor(text: string, start: number, end: number, firstPage?: number | null): string | null {
  const a = pageAt(text, start, firstPage);
  const b = pageAt(text, Math.max(start, end - 1), firstPage);
  if (a === null) return null;
  if (b === null || b === a) return String(a);
  const as = String(a), bs = String(b);
  let i = 0;
  while (i < as.length - 1 && as[i] === bs[i] && as.length === bs.length) i++;
  // Bluebook keeps at least the last two digits: 540-41, 98-102.
  return as.length === bs.length ? `${as}-${bs.slice(Math.min(i, Math.max(0, bs.length - 2)))}` : `${as}-${bs}`;
}

function normChar(c: string): string {
  if (c === '“' || c === '”' || c === '«' || c === '»') return '"';
  if (c === '‘' || c === '’') return "'";
  if (c === '–' || c === '—') return '-';
  return c;
}

/** Clean text (markers removed, whitespace collapsed) with a map back to raw offsets. */
export function cleanWithMap(raw: string): { clean: string; map: number[] } {
  let clean = '';
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '[' && raw[i + 1] === '*') {
      const close = raw.indexOf(']', i);
      if (close > 0 && /^\[\*\d{1,5}\]$/.test(raw.slice(i, close + 1))) { i = close; continue; }
    }
    const c = normChar(raw[i]!);
    if (/\s/.test(c)) {
      if (lastSpace) continue;
      clean += ' '; map.push(i); lastSpace = true; continue;
    }
    clean += c; map.push(i); lastSpace = false;
  }
  return { clean, map };
}

export function normalizeQuote(q: string): string {
  return cleanWithMap(q.trim().replace(/^["'“‘]+|["'”’]+$/g, '')).clean.trim();
}

export interface QuoteCheck { ok: boolean; exact: boolean; start: number; end: number; reason?: string }

/**
 * Verify a quotation against opinion text. Ellipses split the quote into segments that
 * must appear in order. `exact` is false when only a case-insensitive match was found.
 */
export function verifyQuote(raw: string, quote: string): QuoteCheck {
  const { clean, map } = cleanWithMap(raw);
  const segments = normalizeQuote(quote).split(/\s*(?:\.\s?\.\s?\.|…)\s*/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (!segments.length) return { ok: false, exact: false, start: 0, end: 0, reason: 'empty quote' };
  let from = 0, start = -1, end = -1, exact = true;
  for (const seg of segments) {
    let idx = clean.indexOf(seg, from);
    if (idx < 0) {
      idx = clean.toLowerCase().indexOf(seg.toLowerCase(), from);
      if (idx < 0) return { ok: false, exact: false, start: 0, end: 0, reason: `not found in the opinion: "${seg.slice(0, 80)}"` };
      exact = false;
    }
    if (start < 0) start = idx;
    end = idx + seg.length;
    from = end;
  }
  return { ok: true, exact, start: map[start]!, end: (map[end - 1] ?? map[map.length - 1]!) + 1 };
}

export interface CaseCiteFields { name: string; short_name?: string | null; volume?: number | null; reporter?: string | null; first_page?: number | null; date?: string | null; court?: string | null; citation?: string | null }

export function courtParen(court: string | null | undefined, year: string): string {
  const c = (court ?? '').toLowerCase();
  if (/supreme court of new jersey|^nj$/.test(c)) return `(${year})`;
  if (/appellate division|njsuperctappdiv/.test(c)) return `(App. Div. ${year})`;
  if (/law division/.test(c)) return `(Law Div. ${year})`;
  if (/chancery/.test(c)) return `(Ch. Div. ${year})`;
  if (/supreme court of the united states|scotus/.test(c)) return `(${year})`;
  if (/third circuit|^ca3$/.test(c)) return `(3d Cir. ${year})`;
  if (/district of new jersey|^njd$/.test(c)) return `(D.N.J. ${year})`;
  return `(${year})`;
}

export function fullCite(k: CaseCiteFields, pin?: string | null): string {
  const year = (k.date ?? '').slice(0, 4);
  const base = k.volume && k.reporter && k.first_page ? `${k.volume} ${k.reporter} ${k.first_page}` : k.citation ?? '';
  return `${k.name}, ${base}${pin && String(pin) !== String(k.first_page) ? `, ${pin}` : ''} ${courtParen(k.court, year)}`.replace(/\s+/g, ' ').trim();
}

export function shortCite(k: CaseCiteFields, pin?: string | null): string {
  const name = k.short_name || k.name.split(' v. ')[0]!;
  if (k.volume && k.reporter) return `${name}, ${k.volume} ${k.reporter} at ${pin ?? k.first_page}`;
  return `${name}, ${k.citation ?? ''}${pin ? ` at ${pin}` : ''}`;
}

/** CourtListener html_with_citations → plain text with [*page] markers. */
export function opinionHtmlToText(html: string): string {
  return html
    .replace(/<span[^>]*class="star-pagination"[^>]*label="(\d+)"[^>]*>[\s\S]*?<\/span>/gi, ' [*$1] ')
    .replace(/<page-number[^>]*label="(\d+)"[^>]*>[\s\S]*?<\/page-number>/gi, '[*$1]')
    .replace(/<\/(p|blockquote|div|h\d|author)>/gi, '\u0000')
    .replace(/<br\s*\/?>/gi, '\u0000')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ?\u0000 ?/g, '\n\n')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ (\[\*\d+\]) /g, ' $1 ')
    .trim();
}
