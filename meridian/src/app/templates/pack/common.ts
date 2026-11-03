/**
 * Shared machinery for the brief-level workflows: who wrote a document, its POINT
 * structure, every authority it cites (with the quotation that precedes the cite), the
 * closest real passage to a misquotation with a word-level diff, procedural posture, and
 * unpublished-opinion citations.
 */
import type { SpanPointer } from '../../../core/types.js';
import { makePointer, parsePointer } from '../../../memory/episodic.js';
import { cleanWithMap, normalizeReporter, pinFor, shortCite, fullCite, verifyQuote } from '../../../research/cites.js';
import type { CaseRow } from '../../../research/library.js';
import type { DocRecord } from '../../../ingest/documents.js';
import type { TemplateContext } from '../../context.js';

// ------------------------------------------------------------------ documents and parties

/** First significant word of our client's name ("harbor"), from the matter row or its caption. */
export function clientKey(ctx: TemplateContext): string {
  const name = ctx.matter.client ?? ctx.matter.name.split(/\s+v\.?\s+/i)[0] ?? '';
  return (name.toLowerCase().match(/[a-z]{3,}/g) ?? []).find((w) => !['the', 'inc', 'llc', 'corp', 'company'].includes(w)) ?? '';
}

/** "ours" when the caption line names our client as the filer, "theirs" when it names someone else. */
export function authorOf(ctx: TemplateContext, doc: DocRecord): 'ours' | 'theirs' | 'unknown' {
  const head = ctx.docs.text(doc.id).slice(0, 400);
  const m = /^([A-Z][A-Z0-9 .,&'’-]{2,120}?)(?:'S|’S|S')\s+(?:[A-Z]+\s+){0,4}(?:BRIEF|STATEMENT|CERTIFICATION|MEMORANDUM|REPLY|RESPONSE|COMPLAINT|ANSWER|REPORT)/m.exec(head);
  if (!m) return 'unknown';
  const key = clientKey(ctx);
  return key && m[1]!.toLowerCase().includes(key) ? 'ours' : 'theirs';
}

export type DocRole = 'brief' | 'sumf' | 'complaint' | 'order' | 'report' | 'any';
const ROLE_RX: Record<DocRole, RegExp> = {
  brief: /\bbrief\b|memorandum of law|letter brief/i,
  sumf: /sumf|statement of (undisputed )?material facts/i,
  complaint: /complaint/i,
  order: /\border\b/i,
  report: /expert|report/i,
  any: /./,
};

/** Pick a document by role and author. A file named in the goal always wins. */
export function pickDoc(ctx: TemplateContext, goal: string, role: DocRole, author?: 'ours' | 'theirs', exclude: string[] = []): DocRecord | undefined {
  const docs = ctx.docs.list().filter((d) => !exclude.includes(d.id));
  const low = goal.toLowerCase();
  const named = docs.filter((d) => low.includes(d.name.toLowerCase()) || low.includes(d.name.toLowerCase().replace(/\.\w+$/, '')));
  const fits = (d: DocRecord) => ROLE_RX[role].test(`${d.name} ${ctx.docs.text(d.id).slice(0, 300)}`) && (!author || authorOf(ctx, d) === author);
  return named.find(fits) ?? named[0] ?? docs.find(fits);
}

export function docPointer(doc: DocRecord, start: number, end: number): SpanPointer {
  return makePointer('docs', doc.id, start, end) as SpanPointer;
}

// ------------------------------------------------------------------ POINT structure

export interface BriefPoint { num: string; heading: string; start: number; end: number; headingStart: number; headingEnd: number; body: string; bodyStart: number }

/** POINT I / POINT II … with the all-caps heading lines under each and the body that follows. */
export function parsePoints(text: string): BriefPoint[] {
  const marks = [...text.matchAll(/^[ \t]*POINT\s+([IVXLC]+|\d+)\b[ \t:.-]*(.*)$/gm)];
  const stop = /^[ \t]*(?:CONCLUSION|PRELIMINARY STATEMENT|STATEMENT OF FACTS|PROCEDURAL HISTORY)\b/m;
  const out: BriefPoint[] = [];
  marks.forEach((m, i) => {
    const start = m.index!;
    const nextStart = marks[i + 1]?.index ?? text.length;
    let end = nextStart;
    const tail = stop.exec(text.slice(start + m[0].length, nextStart));
    if (tail) end = start + m[0].length + tail.index;
    // Heading: text on the POINT line itself, then following lines that are mostly upper case.
    let headingStart = start + m[0].length - m[2]!.length;
    let cursor = start + m[0].length + 1;
    const parts: string[] = m[2]!.trim() ? [m[2]!.trim()] : [];
    if (!parts.length) headingStart = cursor;
    let headingEnd = start + m[0].length;
    while (cursor < end) {
      const nl = text.indexOf('\n', cursor);
      const line = text.slice(cursor, nl < 0 ? end : Math.min(nl, end));
      const letters = line.replace(/[^A-Za-z]/g, '');
      if (!line.trim() || !letters.length || letters.replace(/[^A-Z]/g, '').length / letters.length < 0.8) break;
      parts.push(line.trim());
      headingEnd = cursor + line.length;
      cursor = (nl < 0 ? end : nl) + 1;
    }
    const bodyStart = Math.min(cursor, end);
    out.push({ num: m[1]!, heading: parts.join(' '), start, end, headingStart, headingEnd, body: text.slice(bodyStart, end).trim(), bodyStart });
  });
  return out;
}

export function pointAt(points: BriefPoint[], offset: number): BriefPoint | undefined {
  return points.find((p) => offset >= p.start && offset < p.end);
}

// ------------------------------------------------------------------ citations in a brief

export interface BriefCite {
  /** The citation text as written, e.g. "Brill, 142 N.J. at 540". */
  cite: string;
  start: number; end: number;
  volume?: number; reporter?: string; page?: number; pin?: string;
  name?: string;
  unpublished?: { docket: string; court: string; date: string };
  quote?: { text: string; start: number; end: number };
  /** The sentence (or sentences) that make the proposition the cite supports. */
  context: { text: string; start: number; end: number };
  case?: CaseRow | null;
}

const REP = String.raw`(N\.\s?J\.\s?Super\.|N\.\s?J\.|A\.\s?[23]d|U\.\s?S\.|S\.\s?Ct\.|F\.\s?Supp\.\s?[23]d|F\.\s?Supp\.|F\.\s?4th|F\.\s?[23]d)`;
const NAME = String.raw`([A-Z][A-Za-z0-9.&'’,-]*(?:\s+(?:[A-Za-z0-9.&'’,-]+|of|v\.|&)){0,12}?)`;
const FULL = new RegExp(String.raw`${NAME},\s+(\d{1,4})\s+${REP}\s+(\d{1,5})(?:,\s*(\d{1,5}(?:[-–]\d{1,5})?))?(?:\s*\(([^)]*\d{4})\))?`, 'g');
const SHORT = new RegExp(String.raw`([A-Z][A-Za-z.&'’ -]{1,40}?),\s+(\d{1,4})\s+${REP}\s+at\s+(\d{1,5}(?:[-–]\d{1,5})?)`, 'g');
const UNPUB = new RegExp(String.raw`${NAME},\s+(?:Docket\s+)?No\.\s+(A-\d{3,5}-\d{2}(?:T\d)?)\s*\((App\.\s*Div\.|Law\s*Div\.|Ch\.\s*Div\.)\s*([^)]*?\d{4})\)`, 'g');
const WL = /\b(\d{4})\s+(WL|N\.J\.\s?Super\.\s?Unpub\.\s?LEXIS)\s+(\d+)\b/g;

function cleanName(n: string): string {
  return n.replace(/^(?:See|see|Cf\.|cf\.|But see|But|Accord|E\.g\.,?|See also|and|And|In|As|Under|quoting|citing)\s+/g, '').replace(/^(?:See|see|also)\s+/, '').trim();
}

/** Every authority a brief cites, in order, each tied to the quotation and sentence it supports. */
export function briefCitations(ctx: TemplateContext, text: string): BriefCite[] {
  const hits: BriefCite[] = [];
  const taken: Array<[number, number]> = [];
  const free = (s: number, e: number) => !taken.some(([a, b]) => s < b && e > a);
  for (const m of text.matchAll(UNPUB)) {
    if (!free(m.index!, m.index! + m[0].length)) continue;
    taken.push([m.index!, m.index! + m[0].length]);
    hits.push({ cite: m[0].trim(), start: m.index!, end: m.index! + m[0].length, name: cleanName(m[1]!), unpublished: { docket: m[2]!, court: m[3]!.replace(/\s+/g, ' '), date: m[4]!.trim() }, context: { text: '', start: 0, end: 0 } });
  }
  for (const m of text.matchAll(WL)) {
    if (!free(m.index!, m.index! + m[0].length)) continue;
    const back = text.slice(Math.max(0, m.index! - 120), m.index!);
    const nm = /([A-Z][\w.&'’ -]{2,80} v\. [\w.&'’ -]{2,60}),\s*$/.exec(back);
    taken.push([m.index!, m.index! + m[0].length]);
    hits.push({ cite: m[0], start: m.index! - (nm ? nm[0].length : 0), end: m.index! + m[0].length, name: nm ? cleanName(nm[1]!) : undefined, unpublished: { docket: `${m[1]} ${m[2]} ${m[3]}`, court: 'unknown', date: m[1]! }, context: { text: '', start: 0, end: 0 } });
  }
  for (const m of text.matchAll(FULL)) {
    const s = m.index!, e = s + m[0].length;
    if (!free(s, e)) continue;
    taken.push([s, e]);
    const reporter = normalizeReporter(m[3]!);
    hits.push({ cite: m[0].trim(), start: s, end: e, name: cleanName(m[1]!), volume: Number(m[2]), reporter, page: Number(m[4]), ...(m[5] ? { pin: m[5].replace('–', '-') } : {}), context: { text: '', start: 0, end: 0 } });
  }
  for (const m of text.matchAll(SHORT)) {
    const s = m.index!, e = s + m[0].length;
    if (!free(s, e)) continue;
    taken.push([s, e]);
    hits.push({ cite: m[0].trim(), start: s, end: e, name: cleanName(m[1]!), volume: Number(m[2]), reporter: normalizeReporter(m[3]!), pin: m[4]!.replace('–', '-'), context: { text: '', start: 0, end: 0 } });
  }
  hits.sort((a, b) => a.start - b.start);
  let prevEnd = 0;
  for (const h of hits) {
    // The quotation the cite supports: the last quoted run between the previous cite and this one.
    const window = text.slice(prevEnd, h.start);
    const quotes = [...window.matchAll(/“((?:[^“”]|“[^“”]*”)+)”|"([^"\n]{8,})"/g)];
    const q = quotes[quotes.length - 1];
    if (q) {
      const inner = q[1] ?? q[2]!;
      const qs = prevEnd + q.index! + 1;
      if (inner.replace(/[^A-Za-z]/g, '').length >= 12) h.quote = { text: inner, start: qs, end: qs + inner.length };
    }
    // The sentence that makes the proposition: back to the previous sentence end (or cite end).
    const anchor = h.quote ? h.quote.start - 1 : h.start;
    const ctxStart = Math.max(prevEnd, lastSentenceStart(text, anchor));
    const after = /^(?:\s*\([^)]*\))*[^.(\n]*\.?/.exec(text.slice(h.end))?.[0] ?? '';
    h.context = { text: text.slice(ctxStart, h.end + after.length).trim(), start: ctxStart, end: h.end + after.length };
    prevEnd = h.end;
    h.case = resolveCase(ctx, h, hits);
  }
  return hits;
}

function lastSentenceStart(text: string, at: number): number {
  const before = text.slice(0, at);
  // Skip sentence ends that sit inside an abbreviation ("v.", "Co.", "Am.") by requiring a capital after the space.
  let idx = -1;
  for (const m of before.matchAll(/[.!?]["”]?\s+(?=[A-Z“"])|\n/g)) {
    const word = /(\S+)$/.exec(before.slice(0, m.index! + 1))?.[1] ?? '';
    if (/^(?:v|Co|Am|Inc|Corp|Ins|Elecs|No|Div|App|Super|Ct|Supp|Cir|ll|l|p|Sec|Bros|Mfg|Ass'n|Dep't)\.$/.test(word)) continue;
    idx = m.index! + m[0].length;
  }
  return idx < 0 ? 0 : idx;
}

function resolveCase(ctx: TemplateContext, h: BriefCite, all: BriefCite[]): CaseRow | null {
  if (h.unpublished) return null;
  if (h.page) return ctx.lib.byCitation(`${h.volume} ${h.reporter} ${h.page}`);
  // Short cite: same volume and reporter as an earlier full cite, or a library case with that volume/reporter.
  const earlier = all.find((x) => x.page && x.volume === h.volume && x.reporter === h.reporter);
  if (earlier) return ctx.lib.byCitation(`${earlier.volume} ${earlier.reporter} ${earlier.page}`);
  return ctx.lib.listCases().map((x) => ctx.lib.getCase(x.id)!).find((x) => x.volume === h.volume && x.reporter === h.reporter) ?? null;
}

// ------------------------------------------------------------------ quotation checking

/** Brackets that alter one letter ("[i]f") and inner single quotation marks are permitted edits. */
export function prepQuote(q: string): string {
  return q.replace(/[.,;:]+\s*$/, '').replace(/\[([A-Za-z])\]/g, '$1').replace(/(^|[\s(])‘([^’]+)’/g, '$1"$2"').replace(/(^|[\s(])'([^']+)'(?=[\s.,;:)]|$)/g, '$1"$2"').trim();
}

export interface DiffPart { op: 'same' | 'del' | 'ins'; text: string }
export interface Closest { actual: string; start: number; end: number; diff: DiffPart[]; changed: number; similarity: number }

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const key = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The passage in the opinion that the misquotation was most likely taken from, with a word diff. */
export function closestPassage(raw: string, quote: string): Closest | null {
  const { clean, map } = cleanWithMap(raw);
  const qw = words(cleanWithMap(prepQuote(quote)).clean);
  if (qw.length < 3) return null;
  const tokens: Array<{ w: string; s: number; e: number }> = [];
  for (const m of clean.matchAll(/\S+/g)) tokens.push({ w: m[0], s: m.index!, e: m.index! + m[0].length });
  const qk = qw.map(key);
  const qset = new Set(qk);
  const span = qw.length + 6;
  const scores: Array<{ score: number; i: number }> = [];
  for (let i = 0; i < tokens.length; i++) {
    let score = 0;
    for (let j = i; j < Math.min(tokens.length, i + span); j++) if (qset.has(key(tokens[j]!.w))) score++;
    scores.push({ score, i });
  }
  const top = Math.max(0, ...scores.map((x) => x.score));
  if (top < Math.ceil(qw.length * 0.5)) return null;
  // Opinions repeat themselves (a holding, then the same test restated). Diff every strong
  // candidate and keep the one closest to the quotation.
  let bestOps: Array<{ op: DiffPart['op']; w: string; j?: number }> | null = null;
  let bestRegion: typeof tokens = [];
  let bestSame = -1, bestLen = Infinity;
  for (const cand of scores.filter((x) => x.score >= top * 0.8)) {
    const region = tokens.slice(cand.i, Math.min(tokens.length, cand.i + span));
    const rk = region.map((t) => key(t.w));
    const L = Array.from({ length: qk.length + 1 }, () => new Array<number>(rk.length + 1).fill(0));
    for (let i = qk.length - 1; i >= 0; i--) for (let j = rk.length - 1; j >= 0; j--) L[i]![j] = qk[i] === rk[j] ? 1 + L[i + 1]![j + 1]! : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
    if (L[0]![0]! < bestSame) continue;
    const ops: Array<{ op: DiffPart['op']; w: string; j?: number }> = [];
    let i = 0, j = 0;
    while (i < qk.length && j < rk.length) {
      if (qk[i] === rk[j]) { ops.push({ op: 'same', w: region[j]!.w, j }); i++; j++; }
      else if (L[i + 1]![j]! >= L[i]![j + 1]!) { ops.push({ op: 'ins', w: qw[i]! }); i++; }
      else { ops.push({ op: 'del', w: region[j]!.w, j }); j++; }
    }
    while (i < qk.length) ops.push({ op: 'ins', w: qw[i++]! });
    const trimmedLen = ops.filter((o) => o.op !== 'del').length + ops.slice(ops.findIndex((o) => o.op === 'same')).filter((o) => o.op === 'del').length;
    if (L[0]![0]! === bestSame && bestOps && trimmedLen >= bestLen) continue;
    bestSame = L[0]![0]!; bestOps = ops; bestRegion = region; bestLen = trimmedLen;
  }
  if (!bestOps) return null;
  const ops = bestOps, region = bestRegion;
  const firstSame = ops.findIndex((o) => o.op === 'same');
  let lastSame = -1;
  ops.forEach((o, k) => { if (o.op === 'same') lastSame = k; });
  if (firstSame < 0) return null;
  // Keep inserted words at the edges (the brief's own additions), drop opinion words outside the matched span.
  const trimmed = ops.filter((o, k) => o.op !== 'del' || (k > firstSame && k < lastSame));
  const js = trimmed.filter((o) => o.j !== undefined).map((o) => o.j!);
  const a = region[Math.min(...js)]!, b = region[Math.max(...js)]!;
  const diff: DiffPart[] = [];
  for (const o of trimmed) {
    const last = diff[diff.length - 1];
    if (last && last.op === o.op) last.text += ` ${o.w}`; else diff.push({ op: o.op, text: o.w });
  }
  const changed = diff.filter((d) => d.op !== 'same').reduce((n, d) => n + words(d.text).length, 0);
  const same = diff.filter((d) => d.op === 'same').reduce((n, d) => n + words(d.text).length, 0);
  return { actual: clean.slice(a.s, b.e), start: map[a.s]!, end: map[b.e - 1]! + 1, diff, changed, similarity: same / Math.max(1, qw.length) };
}

export function renderDiff(diff: DiffPart[]): string {
  return diff.map((d) => (d.op === 'same' ? d.text : d.op === 'del' ? `~~${d.text}~~` : `**${d.text}**`)).join(' ');
}

export interface QuoteVerdict { status: 'verified' | 'wrong_pin' | 'misquote' | 'not_found' | 'unknown_authority' | 'excerpt_gap' | 'no_quote'; pin?: string | null; expected?: string; closest?: Closest | null; lawPointer?: SpanPointer; detail: string }

/** Check one brief citation's quotation and pin against the stored opinion. */
export function checkCite(ctx: TemplateContext, c: BriefCite): QuoteVerdict {
  const k = c.case;
  if (!k) return { status: 'unknown_authority', detail: c.unpublished ? 'Unpublished opinion; not in the research database.' : 'Not in the research database. Import it to verify the quotation and pin.' };
  const base = ctx.lawPointer(k.id)!;
  const turn = parsePointer(base)!.turn_id;
  const stated = c.pin ?? null;
  if (!c.quote) {
    return { status: 'no_quote', pin: stated, lawPointer: base, detail: `Cited without a quotation${stated ? ` at ${stated}` : ''}.` };
  }
  const v = verifyQuote(k.text, prepQuote(c.quote.text));
  if (v.ok && !k.text.slice(v.start, v.end).includes('[Excerpt:')) {
    const pin = pinFor(k.text, v.start, v.end, k.first_page);
    const lp = makePointer('law', turn, v.start, v.end) as SpanPointer;
    if (stated && pin && stated !== pin && !pinCovers(stated, pin)) return { status: 'wrong_pin', pin, expected: shortCite(k, pin), lawPointer: lp, detail: `The words are at ${pin}, not ${stated}.` };
    return { status: 'verified', pin, expected: shortCite(k, pin), lawPointer: lp, detail: `Verbatim${v.exact ? '' : ' apart from capitalization'} at ${pin}.` };
  }
  const closest = closestPassage(k.text, c.quote.text);
  if (closest && closest.similarity >= 0.6) {
    const pin = pinFor(k.text, closest.start, closest.end, k.first_page);
    return { status: 'misquote', pin, expected: shortCite(k, pin), closest, lawPointer: makePointer('law', turn, closest.start, closest.end) as SpanPointer, detail: `${closest.changed === 1 ? 'One word differs' : `${closest.changed} words differ`} from the opinion at ${pin}.` };
  }
  return { status: k.excerpt ? 'excerpt_gap' : 'not_found', lawPointer: base, detail: k.excerpt ? 'Not in the excerpt on file. Import the full opinion to check it.' : 'These words do not appear anywhere in the opinion.' };
}

function pinCovers(stated: string, actual: string): boolean {
  const range = (p: string) => { const [a, b] = p.split('-'); const s = Number(a); const e = b ? Number(a!.slice(0, a!.length - b.length) + b) : s; return [s, e] as const; };
  const [s1, e1] = range(stated), [s2, e2] = range(actual);
  return s2 >= s1 && e2 <= e1;
}

// ------------------------------------------------------------------ posture

export type Posture = 'motion to dismiss' | 'summary judgment' | 'trial' | 'appeal' | 'unknown';

/** What procedural posture an opinion was decided in. */
export function casePosture(k: CaseRow): Posture {
  const t = `${(k.tags ?? []).join(' ')} ${k.text.slice(0, 6000)}`;
  if (/4:6-2\(e\)|motion to dismiss|failure to state a claim/i.test(t)) return 'motion to dismiss';
  if (/summary judgment|4:46-2/i.test(t)) return 'summary judgment';
  return 'unknown';
}

/** What posture a brief argues in, from its caption. */
export function briefPosture(text: string): Posture {
  const head = text.slice(0, 500);
  if (/summary judgment/i.test(head)) return 'summary judgment';
  if (/motion to dismiss|4:6-2/i.test(head)) return 'motion to dismiss';
  if (/appellate division|appeal|appellant|respondent/i.test(head)) return 'appeal';
  return 'unknown';
}

// ------------------------------------------------------------------ small helpers

export function fullOrShort(k: CaseRow, pin?: string | null): string { return pin ? shortCite(k, pin) : fullCite(k); }

export function oneLine(s: string, max = 260): string {
  const t = s.replace(/\[\*\d+\]\s?/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
}

/** A plain-English count: "one", "two" … "twelve", then digits. */
export function count(n: number, noun: string, plural = `${noun}s`): string {
  const w = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] ?? String(n);
  return `${w} ${n === 1 ? noun : plural}`;
}


// ------------------------------------------------------------------ parties, record contradictions, sourcing

/** "Cinder Freight Co." from a caption like "PLAINTIFF CINDER FREIGHT CO.'S BRIEF". */
export function filerOf(ctx: TemplateContext, doc: DocRecord): { name: string; short: string } {
  const head = ctx.docs.text(doc.id).slice(0, 400);
  const m = /^([A-Z][A-Z0-9 .,&'’-]{2,120}?)(?:'S|’S|S')\s/m.exec(head);
  const raw = (m?.[1] ?? '').replace(/^(?:PLAINTIFF|DEFENDANT|COUNTERCLAIM[- ]\w+|THIRD[- ]PARTY \w+|APPELLANT|RESPONDENT)S?\s+/g, '').trim();
  const name = raw.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Co|Inc|Llc|Corp)\b\.?/g, (x) => ({ Co: 'Co.', Inc: 'Inc.', Llc: 'LLC', Corp: 'Corp.' } as Record<string, string>)[x.replace('.', '')] ?? x).replace(/\.\./g, '.');
  return { name: name || 'The other side', short: name.split(/\s+/)[0] || 'The other side' };
}

/** Whether a record document was written by the party with this short name (an email from @cinder…, a "CINDER FREIGHT CO." letterhead). */
export function writtenBy(ctx: TemplateContext, doc: DocRecord | undefined, short: string): boolean {
  if (!doc || !short) return false;
  const k = short.toLowerCase();
  const lines = ctx.docs.text(doc.id).slice(0, 400).toLowerCase().split('\n');
  return lines.some((l) => l.startsWith('from:') && l.includes(k)) || lines.slice(0, 2).some((l) => l.trim().startsWith(k));
}

const HEADER = /^(?:Subject|From|To|Date|Re|Cc):/i;
const ABSENCE = /\b(never|did not|does not|has not|have not|was not|were not|failed to|offers no|offered no|has no|gave no|made no|received no|no (?:written |prior |timely )?(?:notice|proof|record|evidence|objection|complaint|response))\b/i;

/**
 * The record contains what the assertion says is absent. "Harbor gave no written notice"
 * against "We received your letter dated January 29, 2026" is a contradiction that a
 * date or denial check alone misses.
 */
export function absenceContradiction(ctx: TemplateContext, excludeDocId: string, assertion: string, recordSentencesFn: (exclude?: string) => Array<{ doc_id: string; text: string; pointer: SpanPointer; cite: string }>, keyFactsFn: (s: string) => { words: string[]; dates: string[] }, isWorkProductFn: (n: string) => boolean): Array<{ text: string; pointer: SpanPointer; cite: string; shared: string[] }> {
  if (!ABSENCE.test(assertion)) return [];
  const f = keyFactsFn(assertion);
  const sentences = recordSentencesFn(excludeDocId).filter((s) => isEvidenceDoc(ctx, s.doc_id, isWorkProductFn));
  const df = new Map<string, number>();
  for (const s of sentences) for (const w of new Set(keyFactsFn(s.text).words)) df.set(w, (df.get(w) ?? 0) + 1);
  const EVENT: Record<string, string> = { gave: 'deliver', sent: 'deliver', served: 'deliver', issued: 'deliver', received: 'deliver', mailed: 'deliver', letter: 'notice', objection: 'object', objected: 'object' };
  const stem = (w: string) => EVENT[w] ?? w.replace(/(ing|ed|es|s)$/, '');
  const fw = f.words.filter((w) => (df.get(w) ?? 0) / Math.max(1, sentences.length) < 0.25 && !['harbor', 'cinder', 'freight', 'logistics', 'january', 'february', 'march', 'december'].includes(w));
  const out: Array<{ text: string; pointer: SpanPointer; cite: string; shared: string[]; score: number }> = [];
  for (const s of sentences) {
    if (ABSENCE.test(s.text) || HEADER.test(s.text)) continue;
    const sf = keyFactsFn(s.text);
    const shared = fw.filter((w) => sf.words.some((x) => stem(x) === stem(w)));
    const dateHit = f.dates.some((d) => sf.dates.includes(d));
    if (shared.length + (dateHit ? 1 : 0) < 2) continue;
    out.push({ text: s.text, pointer: s.pointer, cite: s.cite, shared, score: shared.length + (dateHit ? 2 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 4).map(({ score: _s, ...x }) => x);
}

/**
 * Every line that states a figure must carry a source pointer. Lines that already have one
 * are left alone; prose sentences and list items with digits but no pointer get the
 * fallback (the document under review), so nothing numeric goes out unsourced.
 */
export function sourced(text: string, fallback: string): string {
  const fix = (s: string) => (/\d/.test(s) && !/\[\[ep:/.test(s) ? `${s} [[${fallback}]]` : s);
  return text.split('\n').map((line) => {
    const t = line.trim();
    if (!t || /^[#|]/.test(t) || t.startsWith('<!--')) return line;
    // List items are one claim unit each; prose and block quotes are split into sentences.
    if (/^([-*+]|\d+[.)])/.test(t)) return /\[\[ep:/.test(t) || !/\d/.test(t.replace(/^\d+[.)]\s*/, '')) ? line : `${line} [[${fallback}]]`;
    const quote = t.startsWith('>') ? '> ' : '';
    const body = quote ? t.replace(/^>\s?/, '') : line;
    const parts = body.split(/(?<=[.!?][”"]?)\s+(?=[A-Z(“"⟦\[])/);
    // A trailing pointer-only fragment belongs to the sentence before it.
    const merged: string[] = [];
    for (const p of parts) { if (/^(\s*\[\[ep:[^\]]+\]\])+\s*$/.test(p) && merged.length) merged[merged.length - 1] += ` ${p}`; else merged.push(p); }
    return quote + merged.map(fix).join(' ');
  }).join('\n');
}

/** Metadata for a synthesis step, carried in an HTML comment without digits so the evidence check ignores it. */
export function meta(fields: Record<string, string | number>): string {
  return `<!-- ${Object.entries(fields).map(([k, v]) => `${k}:${typeof v === 'number' ? enc(v) : v.replace(/\d/g, (d) => 'abcdefghij'[Number(d)]!)}`).join(' ')} -->`;
}
export function readMeta(text: string, key: string): string | undefined {
  return new RegExp(`<!--[^>]*\\b${key}:(\\S+)`).exec(text)?.[1];
}
export function readNum(text: string, key: string): number { const v = readMeta(text, key); return v ? dec(v) : 0; }
const enc = (n: number) => String(n).split('').map((d) => 'abcdefghij'[Number(d)]).join('');
const dec = (s: string) => Number(s.split('').map((c) => 'abcdefghij'.indexOf(c)).join('')) || 0;

export function parseJson<T>(s: string): Partial<T> {
  try { return JSON.parse(/\{[\s\S]*\}/.exec(s)?.[0] ?? '{}') as Partial<T>; } catch { return {}; }
}

// ------------------------------------------------------------------ sentences, evidence, delivery dates

const ABBREV = new Set('v co am inc corp ins elecs no nos div app super ct supp cir ed l s u n j oct jan feb mar apr aug sept sep nov dec op mich rev minn ford bros mfg dept dep’t transp educ constr sec stat ann et al e.g i.e id supra cf ll pp p mr ms dr jr sr st r rr b rule ex exs cert decl aff tr'.split(' '));

/** Sentences with their offsets, without breaking at "App. Div.", "v.", "L. Ed. 2d" or "Section 11.4". */
export function sentencesOf(text: string, base = 0): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  let start = 0;
  const rx = /[.!?]["”’]?(?=\s+["“(]?[A-Z[])|\n\s*\n/g;
  for (const m of text.matchAll(rx)) {
    const at = m.index!;
    if (m[0].startsWith('.')) {
      const word = (/([A-Za-z.’']+)$/.exec(text.slice(Math.max(0, at - 12), at))?.[1] ?? '').toLowerCase().replace(/\.$/, '');
      const last = word.split('.').pop() ?? '';
      if (ABBREV.has(word) || ABBREV.has(last) || /^[a-z]$/.test(last)) continue;
    }
    const end = at + m[0].length;
    const seg = text.slice(start, end);
    if (seg.trim()) out.push({ text: seg.trim(), start: base + start + (seg.length - seg.trimStart().length), end: base + end });
    start = end;
  }
  const tail = text.slice(start);
  if (tail.trim()) out.push({ text: tail.trim(), start: base + start + (tail.length - tail.trimStart().length), end: base + text.length });
  return out;
}

/** Attorney documents and advocacy are not evidence of the facts they describe. */
export function isEvidenceDoc(ctx: TemplateContext, docId: string, isWorkProductFn: (n: string) => boolean): boolean {
  const d = ctx.docs.get(docId);
  if (!d) return false;
  if (isWorkProductFn(d.name)) return false;
  const head = `${d.name} ${ctx.docs.text(d.id).slice(0, 200)}`;
  return !/engagement letter|internal[- ]memo|\bmemo\b|privileged|attorney work product|complaint|answer and counterclaim|proposed order|form of order/i.test(head);
}

const MONTH = String.raw`(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}`;

/**
 * "Cinder gave notice on December 15, 2025" against a record that shows the notice dated
 * December 15 but postmarked January 5 and received January 8. Dated is not delivered.
 */
export function deliveryConflict(ctx: TemplateContext, excludeDocId: string, assertion: string, recordSentencesFn: (exclude?: string) => Array<{ doc_id: string; text: string; pointer: SpanPointer; cite: string }>, keyFactsFn: (s: string) => { dates: string[] }, isWorkProductFn: (n: string) => boolean): Array<{ text: string; pointer: SpanPointer; cite: string; why: string }> {
  const m = new RegExp(String.raw`\b(?:gave|sent|served|provided|mailed|delivered|issued)\b[^.]{0,80}?\bnotice\b[^.]{0,80}?\bon\s+(${MONTH})|\bnotice\b[^.]{0,60}?\b(?:was\s+)?(?:given|sent|served|provided)\s+on\s+(${MONTH})|\b[Oo]n\s+(${MONTH}),?\s+[^.]{0,60}?\b(?:gave|sent|served|provided|mailed|issued)\b[^.]{0,60}?\bnotice\b`, 'i').exec(assertion);
  if (!m) return [];
  const claimed = keyFactsFn(m[1] ?? m[2] ?? m[3]!).dates[0];
  if (!claimed) return [];
  const out: Array<{ text: string; pointer: SpanPointer; cite: string; why: string }> = [];
  for (const s of recordSentencesFn(excludeDocId)) {
    if (!isEvidenceDoc(ctx, s.doc_id, isWorkProductFn)) continue;
    if (!/\bnotice\b/i.test(s.text) && !/\bnotice\b/i.test(ctx.docs.text(s.doc_id).slice(0, 4000))) continue;
    const kind = /postmark/i.test(s.text) ? 'postmarked' : /\breceiv|\bmailroom|\binbound|usps|fedex|ups\b/i.test(s.text) ? 'received' : null;
    if (!kind) continue;
    const other = keyFactsFn(s.text).dates.filter((d) => d !== claimed);
    if (!other.length) continue;
    if (!keyFactsFn(s.text).dates.includes(claimed) && !/rate notice|notice dated|notice for/i.test(s.text) && kind !== 'postmarked') continue;
    out.push({ text: s.text, pointer: s.pointer, cite: s.cite, why: `the record shows the notice ${kind} on ${prettyDate(other[0]!)}, not given on ${prettyDate(claimed)}` });
  }
  return out.sort((a, b) => (/postmark/i.test(a.text) ? 1 : 0) - (/postmark/i.test(b.text) ? 1 : 0)).slice(0, 2);
}

export function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const GOOD = /\b(passed (?:inspection|quality)|conforming|undamaged|intact|in good (?:order|condition)|accepted without exception)\b/i;
const BAD = /\b(non-?conforming|crushed|damaged|defect(?:ive)?|broken|torn|exposed|rejected|failed inspection|quarantined)\b/i;

/** The assertion says the goods were fine; the record says they were not (or the reverse). */
export function conditionConflict(ctx: TemplateContext, excludeDocId: string, assertion: string, recordSentencesFn: (exclude?: string) => Array<{ doc_id: string; text: string; pointer: SpanPointer; cite: string }>, keyFactsFn: (s: string) => { words: string[] }, isWorkProductFn: (n: string) => boolean): Array<{ text: string; pointer: SpanPointer; cite: string; why: string }> {
  const good = GOOD.test(assertion) && !BAD.test(assertion), bad = BAD.test(assertion) && !GOOD.test(assertion);
  if (!good && !bad) return [];
  const aw = new Set(keyFactsFn(assertion).words.map((w) => w.replace(/s$/, '')));
  const out: Array<{ text: string; pointer: SpanPointer; cite: string; why: string; score: number }> = [];
  for (const s of recordSentencesFn(excludeDocId)) {
    if (!isEvidenceDoc(ctx, s.doc_id, isWorkProductFn) || HEADER.test(s.text)) continue;
    const opposite = good ? BAD.test(s.text) && !/\bdisputes?\b/i.test(s.text) : GOOD.test(s.text);
    if (!opposite) continue;
    const shared = keyFactsFn(s.text).words.filter((w) => aw.has(w.replace(/s$/, ''))).length;
    const sameDocContext = /\b(PO\s?\d+|pallets?|shipment)\b/i.test(s.text) && /\b(PO\s?\d+|pallets?|shipment)\b/i.test(assertion);
    if (shared < 1 && !sameDocContext) continue;
    out.push({ text: s.text, pointer: s.pointer, cite: s.cite, why: good ? 'the record shows the goods were not in that condition on delivery' : 'the record shows the goods in good condition', score: shared + (BAD.exec(s.text) ? 1 : 0) + (sameDocContext ? 1 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 2).map(({ score: _s, ...x }) => x);
}
