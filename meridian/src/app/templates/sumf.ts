/**
 * Statement of Material Facts cite-check. R. 4:46-2(a) requires each fact to be set forth
 * in a separately numbered paragraph "with a citation to the portion of the motion record
 * establishing the fact". For each paragraph this workflow:
 *   1. requires a citation,
 *   2. resolves every cite to the exact record lines (Bates page and line, or file and line),
 *   3. checks quoted words verbatim,
 *   4. compares the dates, times and numbers the paragraph asserts with the cited lines,
 *      and catches a cite that contradicts its own paragraph,
 *   5. flags weak support, such as attorney letters and internal memos (R. 1:6-6: facts on
 *      personal knowledge), and passages that support only part of the assertion,
 *   6. searches the rest of the record for a better cite.
 * Live models add a judgment of whether the passage supports the assertion; the
 * deterministic checks always run and cannot be overridden into "supported".
 */
import type { TaskSpec } from '../../kernel/run.js';
import { evidence } from '../../kernel/run.js';
import type { OutcomeRubric, SpanPointer } from '../../core/types.js';
import type { DocRecord } from '../../ingest/documents.js';
import { makePointer } from '../../memory/episodic.js';
import { cleanWithMap } from '../../research/cites.js';
import type { ModelProvider } from '../../models/provider.js';
import { keyFacts, numberedParagraphs, recordSentences, isWorkProduct, type TemplateContext, type WorkflowTemplate } from '../context.js';

export type SumfStatus = 'supported' | 'partial' | 'contradicted' | 'misquote' | 'no_cite' | 'unresolvable' | 'unverifiable';
export interface ResolvedCite { raw: string; pointer: SpanPointer | null; cite: string; text: string; pending: boolean; doc?: DocRecord; problem?: string }
export interface ParagraphCheck {
  n: number; text: string; assertion: string; pointer: SpanPointer; status: SumfStatus; cites: ResolvedCite[];
  problems: Array<{ text: string; pointer?: SpanPointer }>; warnings: string[]; fix?: { text: string; pointer?: SpanPointer; cite?: string };
  model_view?: { verdict?: string; explanation?: string };
}

export const SUMF_RUBRIC: OutcomeRubric = {
  id: 'rub_sumf_v1',
  criteria: [
    { id: 'coverage', text: 'Every numbered paragraph is checked.' },
    { id: 'evidence', text: 'Every finding cites the record line it relies on.' },
  ],
  min_score: 0.85,
  max_revisions: 1,
};

const LABEL: Record<SumfStatus, string> = { supported: 'Supported', partial: 'Partly supported', contradicted: 'Contradicted by its own cite', misquote: 'Quotation does not match', no_cite: 'No record citation', unresolvable: 'Cite does not resolve', unverifiable: 'Cannot verify yet' };
const NEG = /\b(dispute[sd]?|denie[sd]|deny|reject(?:ed|s)?|never|not|no longer|contest(?:ed|s)?|refused)\b/i;

export function findSumf(ctx: TemplateContext, goal: string): DocRecord | undefined {
  const named = ctx.docs.list().find((d) => goal.toLowerCase().includes(d.name.toLowerCase()) || goal.toLowerCase().includes(d.id));
  if (named) return named;
  return ctx.docs.list().find((d) => /sumf|material facts|statement of (undisputed )?facts/i.test(d.name) || /STATEMENT OF (UNDISPUTED )?MATERIAL FACTS/i.test(ctx.docs.text(d.id).slice(0, 400)));
}

export function splitCites(paragraph: string): { assertion: string; cites: string[] } {
  const m = /\(([^()]*(?:[A-Z][A-Z0-9]*_\d{5,8}|\.(?:txt|md|eml|pdf|html)|Ex\.\s?[A-Z])[^()]*)\)\s*\.?\s*$/.exec(paragraph);
  if (!m) return { assertion: paragraph.trim(), cites: [] };
  return { assertion: paragraph.slice(0, m.index).trim(), cites: m[1]!.split(/;\s*/).map((s) => s.trim()).filter(Boolean) };
}

export function resolveCite(ctx: TemplateContext, raw: string, exhibits: Record<string, string> = {}): ResolvedCite {
  const lineRange = (s: string) => { const m = /ll?\.\s*(\d+)(?:\s*[-–]\s*(\d+))?/.exec(s); return m ? { from: Number(m[1]), to: Number(m[2] ?? m[1]) } : null; };
  const bates = /([A-Z][A-Z0-9]*_\d{5,8})/.exec(raw);
  if (bates) {
    const lr = lineRange(raw);
    const hit = ctx.docs.pointerForBates(bates[1]!, lr?.from, lr?.to);
    if (!hit) return { raw, pointer: null, cite: raw, text: '', pending: false, problem: `${bates[1]}${lr ? ` at the cited lines` : ''} is not in the production on file.` };
    const lines = ctx.docs.linesFor(hit.pointer);
    return { raw, pointer: hit.pointer, cite: ctx.docs.citeFor(hit.pointer) ?? raw, text: ctx.kernel.l2.resolve(hit.pointer)?.text ?? '', pending: !!lines?.lines.some((l) => l.pending), doc: hit.doc };
  }
  const ex = /Ex(?:hibit|\.)\s?([A-Z])/.exec(raw);
  const fileRef = /([\w.-]+\.(?:txt|md|eml|pdf|html))/.exec(raw)?.[1] ?? (ex ? exhibits[ex[1]!] : undefined);
  if (fileRef) {
    const doc = ctx.docs.findDoc(fileRef) ?? ctx.docs.list().find((d) => d.name === fileRef);
    if (!doc) return { raw, pointer: null, cite: raw, text: '', pending: false, problem: `${fileRef} is not in the matter's documents.` };
    const lr = lineRange(raw);
    const page = /p\.\s*(\d+)/.exec(raw);
    const pointer = lr ? ctx.docs.pointerForLines(doc, doc.kind === 'pdf' && page ? Number(page[1]) : undefined, lr.from, lr.to) : doc.pointer;
    if (!pointer) return { raw, pointer: null, cite: raw, text: '', pending: false, problem: `${doc.name} has no text at the cited lines.` };
    return { raw, pointer, cite: ctx.docs.citeFor(pointer) ?? doc.name, text: ctx.kernel.l2.resolve(pointer)?.text ?? '', pending: !!ctx.docs.linesFor(pointer)?.lines.some((l) => l.pending), doc };
  }
  return { raw, pointer: null, cite: raw, text: '', pending: false, problem: 'Unrecognized citation format. Use a Bates number with page and lines, or a document name with lines.' };
}

function norm(s: string): string { return cleanWithMap(s).clean.toLowerCase(); }

export async function checkParagraph(ctx: TemplateContext, provider: ModelProvider, sumf: DocRecord, para: { n: number; text: string; start: number; end: number }, exhibits: Record<string, string> = {}): Promise<ParagraphCheck> {
  const { assertion, cites: rawCites } = splitCites(para.text);
  const pointer = makePointer('docs', sumf.id, para.start, para.end);
  const out: ParagraphCheck = { n: para.n, text: para.text, assertion, pointer, status: 'supported', cites: [], problems: [], warnings: [] };
  const sentences = recordSentences(ctx.docs, sumf.id).filter((s) => !isWorkProduct(ctx.docs.get(s.doc_id)?.name ?? ''));
  const facts = keyFacts(assertion);

  const suggest = (): ParagraphCheck['fix'] | undefined => {
    const want = [...facts.dates, ...facts.times, ...facts.numbers];
    // First choice: widen the existing cite to the adjacent lines that hold the missing facts.
    for (const c of out.cites) {
      if (!c.doc || !c.pointer) continue;
      const hit = ctx.docs.linesFor(c.pointer);
      if (!hit || !hit.lines.length) continue;
      const first = hit.lines[0]!, last = hit.lines[hit.lines.length - 1]!;
      const near = c.doc.lines.filter((l) => l.page === first.page && l.line >= first.line - 3 && l.line <= last.line + 3);
      const text = ctx.docs.text(c.doc.id);
      const missing = want.filter((w) => !keyFacts(c.text).dates.concat(keyFacts(c.text).times, keyFacts(c.text).numbers).includes(w));
      if (!missing.length) continue;
      const holders = near.filter((l) => { const f = keyFacts(text.slice(l.start, l.end)); return missing.some((w) => f.dates.includes(w) || f.times.includes(w) || f.numbers.includes(w)); });
      if (!holders.length) continue;
      const span = [...hit.lines, ...holders].sort((a, b) => a.start - b.start);
      const ptr = makePointer('docs', c.doc.id, span[0]!.start, span[span.length - 1]!.end);
      const cite = ctx.docs.citeFor(ptr) ?? c.cite;
      return { text: `Widen the cite to ${cite}, which includes ${missing.map(pretty).join(', ')}.`, pointer: ptr, cite };
    }
    const scored = sentences.map((s) => {
      const f = keyFacts(s.text);
      const hits = want.filter((w) => f.dates.includes(w) || f.times.includes(w) || f.numbers.includes(w)).length;
      const overlap = facts.words.filter((w) => f.words.includes(w)).length;
      return { s, score: hits * 3 + overlap };
    }).filter((x) => x.score >= 4).sort((a, b) => b.score - a.score);
    const best = scored[0]?.s;
    if (!best) return undefined;
    const weak = /engagement|memo/i.test(ctx.docs.get(best.doc_id)?.name ?? '') ? ' That is an attorney document; cite the underlying record or a certification on personal knowledge instead.' : '';
    return { text: `Better support: “${best.text}” (${best.cite}).${weak}`, pointer: best.pointer, cite: best.cite };
  };

  if (!rawCites.length) {
    out.status = 'no_cite';
    out.problems.push({ text: 'No citation to the motion record. R. 4:46-2(a) requires one for every fact, and an uncited fact may be disregarded.', pointer });
    out.fix = suggest();
    return out;
  }
  out.cites = rawCites.map((c) => resolveCite(ctx, c, exhibits));
  const bad = out.cites.filter((c) => !c.pointer);
  if (bad.length) {
    out.status = 'unresolvable';
    for (const b of bad) out.problems.push({ text: `${b.raw}: ${b.problem}`, pointer });
    out.fix = suggest();
    return out;
  }
  if (out.cites.every((c) => c.pending)) {
    out.status = 'unverifiable';
    out.problems.push({ text: 'The cited page is a scan with no text layer. Turn on live models to OCR it, then re-run the check.', pointer: out.cites[0]!.pointer! });
    return out;
  }
  const passage = out.cites.map((c) => c.text).join('\n');
  const pf = keyFacts(passage);
  const firstPtr = out.cites[0]!.pointer!;

  // Quotations must be verbatim.
  for (const q of [...assertion.matchAll(/["“]([^"”]{6,})["”]/g)].map((m) => m[1]!)) {
    if (!norm(passage).includes(norm(q))) { out.status = 'misquote'; out.problems.push({ text: `The quoted words “${q}” are not in the cited lines.`, pointer: firstPtr }); }
  }
  // Dates, times and numbers the paragraph asserts.
  const missingDates = facts.dates.filter((d) => !pf.dates.includes(d));
  const missingTimes = facts.times.filter((t) => !pf.times.includes(t));
  const missingNums = facts.numbers.filter((n) => !pf.numbers.includes(n) && !rawCites.join(' ').includes(n));
  if (missingDates.length && pf.dates.length) {
    out.status = 'contradicted';
    out.problems.push({ text: `The paragraph says ${missingDates.map(pretty).join(', ')}; the cited lines say ${pf.dates.map(pretty).join(', ')}.`, pointer: firstPtr });
  } else if (missingDates.length) {
    if (out.status === 'supported') out.status = 'partial';
    out.problems.push({ text: `The cited lines do not mention ${missingDates.map(pretty).join(', ')}.`, pointer: firstPtr });
  }
  if (missingTimes.length) { if (out.status === 'supported') out.status = pf.times.length ? 'contradicted' : 'partial'; out.problems.push({ text: `The cited lines do not show the time ${missingTimes.join(', ')}${pf.times.length ? `; they show ${pf.times.join(', ')}` : ''}.`, pointer: firstPtr }); }
  if (missingNums.length) { if (out.status === 'supported') out.status = 'partial'; out.problems.push({ text: `Not in the cited lines: ${missingNums.join(', ')}.`, pointer: firstPtr }); }
  // Negation conflict: "never disputed" against "disputes".
  const aNeg = NEG.exec(assertion)?.[0]?.toLowerCase();
  const pNeg = NEG.exec(passage)?.[0]?.toLowerCase();
  if (aNeg && pNeg && /never|not|no longer/.test(aNeg) !== /never|not|no longer/.test(pNeg)) {
    out.status = 'contradicted';
    out.problems.push({ text: `The paragraph says “${aNeg}”; the cited lines say “${pNeg}”. The cite proves the opposite.`, pointer: firstPtr });
  }
  // Content overlap: a cite that shares little with the assertion supports only part of it.
  const overlap = facts.words.filter((w) => pf.words.includes(w)).length / Math.max(1, facts.words.length);
  if (out.status === 'supported' && overlap < 0.35) { out.status = 'partial'; out.problems.push({ text: 'The cited lines cover only part of what the paragraph asserts.', pointer: firstPtr }); }
  // Competence of the evidence.
  for (const c of out.cites) {
    if (c.doc && /engagement|internal[- ]memo|memo\b|letter to client/i.test(`${c.doc.name} ${ctx.docs.text(c.doc.id).slice(0, 200)}`)) out.warnings.push(`${c.doc.name} is an attorney document, not competent evidence of the fact. Cite the underlying document or a certification on personal knowledge (R. 1:6-6).`);
  }

  // Live models: an additional judgment, which can downgrade but never upgrade a deterministic finding.
  const v = await provider.complete({ tier: 'balanced', effort: 'medium', json: true, system: '[[task:sumf_support]] You check a statement of material facts for a New Jersey summary judgment motion. Does the PASSAGE establish the ASSERTION? Return JSON {"verdict":"supported"|"partial"|"unsupported","missing":[string],"explanation":string}.', prompt: `ASSERTION: ${assertion}\n\nPASSAGE:\n${passage}` });
  const mv = (() => { try { return JSON.parse(/\{[\s\S]*\}/.exec(v.text)?.[0] ?? '{}') as { verdict?: string; explanation?: string; missing?: string[] }; } catch { return {}; } })();
  if (mv.verdict) {
    out.model_view = { verdict: mv.verdict, ...(mv.explanation ? { explanation: mv.explanation } : {}) };
    if (out.status === 'supported' && mv.verdict !== 'supported') { out.status = 'partial'; out.problems.push({ text: `Model review: ${mv.explanation ?? 'the passage does not establish every element'}.`, pointer: firstPtr }); }
  }
  if (out.status === 'contradicted') {
    // Never widen a cite to cover a contradiction: show where the paragraph's date actually comes from.
    const other = missingDates.length ? sentences.find((s) => keyFacts(s.text).dates.some((d) => missingDates.includes(d)) && facts.words.filter((w) => keyFacts(s.text).words.includes(w)).length >= 2) : undefined;
    out.fix = other
      ? { text: `Conform the paragraph to the record. The cited lines say ${pf.dates.map(pretty).join(', ')}. ${missingDates.map(pretty).join(', ')} comes from “${other.text}” (${other.cite}), which describes a different event.`, pointer: other.pointer, cite: other.cite }
      : { text: 'Conform the paragraph to what the cited lines say, or cite the document that supports the paragraph as written.', pointer: firstPtr };
  } else if (out.status !== 'supported') out.fix = suggest();
  return out;
}

function pretty(iso: string): string { const d = new Date(`${iso}T00:00:00Z`); return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }

export function renderCheck(c: ParagraphCheck): string {
  const lines = [`### ¶${c.n} · ${LABEL[c.status]}`, `> ${c.assertion} [[${c.pointer}]]`];
  for (const k of c.cites) if (k.pointer) lines.push(`- Cited: ${k.cite}: “${k.text.replace(/\s+/g, ' ').slice(0, 220)}” [[${k.pointer}]]`);
  for (const p of c.problems) lines.push(`- Problem: ${p.text}${p.pointer ? ` [[${p.pointer}]]` : ''}`);
  for (const w of c.warnings) lines.push(`- Weak evidence: ${w} [[${c.pointer}]]`);
  if (c.fix) lines.push(`- Fix: ${c.fix.text}${c.fix.pointer ? ` [[${c.fix.pointer}]]` : ''}`);
  return lines.join('\n');
}

export function exhibitIndex(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/^(?:Ex\.|Exhibit)\s+([A-Z])\s*[:=-]\s*(\S+)/gm)) out[m[1]!] = m[2]!;
  return out;
}

export function sumfTemplate(ctx: TemplateContext): WorkflowTemplate {
  return {
    label: 'Cite-check a Statement of Material Facts', category: 'drafting', builtin: true,
    description: 'Check every paragraph of a R. 4:46-2(a) statement against the record it cites, and find better cites',
    match: (g) => (/\b(sumf|statement of (undisputed )?material facts|cite[- ]?check|material facts)\b/i.test(g) ? 6 : 0),
    default_budget_usd: 10, rubric: SUMF_RUBRIC,
    planner: {
      async plan(goal): Promise<TaskSpec[]> {
        const doc = findSumf(ctx, goal);
        if (!doc) throw new Error('No statement of material facts found. Upload it, or name the file in your request.');
        const paras = numberedParagraphs(ctx.docs.text(doc.id));
        if (!paras.length) throw new Error(`${doc.name} has no numbered paragraphs.`);
        const specs: TaskSpec[] = paras.map((p) => ({ key: `sumf:${p.n}`, type: 'sumf.paragraph', inputs: { doc_id: doc.id, n: p.n, start: p.start, end: p.end, text: p.text, tolerates_fast: true }, anticipated_tools: ['fs.read'], budget: { max_usd: 0.5 } }));
        specs.push({ key: 'sumf:report', type: 'synth.sumf_report', inputs: { doc_id: doc.id }, depends_on: paras.map((p) => `sumf:${p.n}`), budget: { max_usd: 1 } });
        return specs;
      },
    },
    executor: {
      async execute(c) {
        const doc = ctx.docs.get(String(c.task.inputs['doc_id']))!;
        if (c.task.type === 'sumf.paragraph') {
          const ex = exhibitIndex(ctx.docs.text(doc.id));
          const res = await checkParagraph(ctx, c.provider, doc, { n: Number(c.task.inputs['n']), text: String(c.task.inputs['text']), start: Number(c.task.inputs['start']), end: Number(c.task.inputs['end']) }, ex);
          const text = renderCheck(res);
          const ptrs = [...text.matchAll(/\[\[(ep:[^\]\[]+)\]\]/g)].map((m) => m[1]!);
          return { text, evidence: [...new Set(ptrs)].map((p) => evidence(p, ctx.kernel.l2.resolve(p)?.text.slice(0, 200) ?? '')), tokens_in: 400, tokens_out: 200, usd: 0.0004 };
        }
        const sections = c.upstream.map((u) => u.deliverable.text).sort((a, b) => Number(/¶(\d+)/.exec(a)?.[1]) - Number(/¶(\d+)/.exec(b)?.[1]));
        const rows = sections.map((s) => { const m = /### ¶(\d+) · (.+)/.exec(s); return m ? `| ¶${m[1]} | ${m[2]} |` : ''; }).filter(Boolean);
        const flagged = rows.filter((r) => !/\| Supported \|$/.test(r)).length;
        const text = [`# Cite-check: ${doc.name}`, `${flagged ? `${cap(spell(flagged))} of ${spell(rows.length)} paragraphs need attention before filing.` : `All ${spell(rows.length)} paragraphs are supported by the record they cite.`} Under R. 4:46-2(a), a fact without a record citation that establishes it may be disregarded.`, '', '| ¶ | Finding |', '|---|---|', ...rows, '', ...sections].join('\n');
        return { text, evidence: c.upstream.flatMap((u) => u.deliverable.evidence), tokens_in: 200, tokens_out: 400, usd: 0.0005 };
      },
    },
  };
}

export function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

export function spell(n: number): string { return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] ?? 'many'; }
