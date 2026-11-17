/**
 * Brief-level workflows that turn the quote checker and the record on the other side's
 * papers:
 *   misquotes    Misquote Hunter: every quotation and pin in a brief, checked against the
 *                stored opinion, with the opinion's actual words and a word diff.
 *   dissect      Opposing Brief Dissector: per POINT, what each authority actually holds,
 *                half-quoted sentences, posture mismatches, factual assertions the record
 *                contradicts, and draft reply points.
 *   unpublished  Unpublished Opinion Gatekeeper (R. 1:36-3) with published substitutes.
 *   reply_gaps   Reply Gap Finder: our points the opposition never answered, the record
 *                and authority it ignored, and new arguments the reply must meet.
 */
import type { TaskSpec } from '../../../kernel/run.js';
import { evidence } from '../../../kernel/run.js';
import type { OutcomeRubric } from '../../../core/types.js';
import { makePointer, parsePointer } from '../../../memory/episodic.js';
import { cap } from '../sumf.js';
import { pinFor, shortCite, fullCite, verifyQuote } from '../../../research/cites.js';
import type { CaseRow } from '../../../research/library.js';
import type { DocRecord } from '../../../ingest/documents.js';
import { keyFacts, recordSentences, isWorkProduct, type TemplateContext, type WorkflowTemplate } from '../../context.js';
import { findAttacks } from '../simulator.js';
import {
  pickDoc, authorOf, filerOf, docPointer, parsePoints, pointAt, briefCitations, checkCite, renderDiff, casePosture, briefPosture,
  oneLine, count, sourced, absenceContradiction, deliveryConflict, conditionConflict, isEvidenceDoc, sentencesOf, meta, readMeta, readNum, type BriefCite, type BriefPoint, type QuoteVerdict,
} from './common.js';

const RUBRIC = (id: string, extra: Array<{ id: string; text: string }> = []): OutcomeRubric => ({
  id,
  criteria: [{ id: 'evidence', text: 'Every finding cites the brief passage or opinion passage it relies on.' }, ...extra],
  min_score: 0.85,
  max_revisions: 1,
});

const ptrsIn = (text: string) => [...new Set([...text.matchAll(/\[\[(ep:[^\]\[]+)\]\]/g)].map((m) => m[1]!))];
function deliver(ctx: TemplateContext, text: string, fallback: string, usd = 0.0004) {
  const out = sourced(text, fallback);
  return { text: out, evidence: ptrsIn(out).map((p) => evidence(p, ctx.kernel.l2.resolve(p)?.text.slice(0, 200) ?? '')), tokens_in: 300, tokens_out: 300, usd };
}
const roman = (n: string) => n;
const docOf = (ctx: TemplateContext, id: unknown): DocRecord => ctx.docs.get(String(id))!;
const lawTurn = (ctx: TemplateContext, k: CaseRow) => parsePointer(ctx.lawPointer(k.id)!)!.turn_id;

const VERDICT: Record<QuoteVerdict['status'], { label: string; rank: number }> = {
  misquote: { label: 'Misquoted', rank: 0 },
  wrong_pin: { label: 'Wrong pin cite', rank: 1 },
  not_found: { label: 'Not in the opinion', rank: 0 },
  unknown_authority: { label: 'Not in your library', rank: 3 },
  excerpt_gap: { label: 'Cannot check yet (excerpt on file)', rank: 4 },
  no_quote: { label: 'Cited without a quotation', rank: 5 },
  verified: { label: 'Verbatim', rank: 6 },
};

// ================================================================== Misquote Hunter

function renderCiteCheck(ctx: TemplateContext, doc: DocRecord, c: BriefCite, v: QuoteVerdict, point: BriefPoint | undefined, who: string): string {
  const where = point ? `Point ${roman(point.num)}` : 'the brief';
  const briefPtr = docPointer(doc, c.quote?.start ?? c.start, c.quote?.end ?? c.end);
  const head = `### ${c.case ? shortCite(c.case, c.pin ?? undefined) : oneLine(c.cite, 90)} · ${VERDICT[v.status].label}`;
  const lines = [head];
  if (c.quote) lines.push(`- ${who} (${where}): “${oneLine(c.quote.text, 400)}” [[${briefPtr}]]`);
  else lines.push(`- ${who} (${where}): ${oneLine(c.context.text, 300)} [[${docPointer(doc, c.context.start, c.context.end)}]]`);
  const k = c.case;
  if (v.status === 'misquote' && v.closest && k) {
    lines.push(`- The opinion says: “${oneLine(v.closest.actual, 400)}” ${v.expected}. [[${v.lawPointer}]]`);
    lines.push(`- What changed: ${renderDiff(v.closest.diff)} [[${v.lawPointer}]]`);
    const ins = v.closest.diff.find((d) => d.op === 'ins')?.text, del = v.closest.diff.find((d) => d.op === 'del')?.text;
    if (ins && del) lines.push(`- For the reply: ${who} quotes ${k.short_name ?? k.name} as saying “${ins}.” The opinion says “${del}.” [[${v.lawPointer}]]`);
    else if (ins) lines.push(`- For the reply: the words “${ins}” are ${who}’s, not the Court’s. [[${v.lawPointer}]]`);
    else if (del) lines.push(`- For the reply: ${who} dropped “${del}” from the middle of the quotation without an ellipsis. [[${v.lawPointer}]]`);
  } else if (v.status === 'wrong_pin' && k) {
    lines.push(`- The words appear at ${v.expected}, not at ${c.pin}. [[${v.lawPointer}]]`);
    lines.push(`- For the reply: correct the pin quietly in your own citation, or note it if the error matters (it often signals the quotation was lifted from a secondary source). [[${v.lawPointer}]]`);
  } else if (v.status === 'verified' && k) {
    lines.push(`- Verbatim at ${v.expected}. [[${v.lawPointer}]]`);
  } else if (v.status === 'not_found' && k) {
    lines.push(`- These words appear nowhere in ${fullCite(k)}. Ask where they come from; a quotation that cannot be found is the strongest credibility point a reply can make. [[${v.lawPointer}]]`);
  } else if (v.status === 'excerpt_gap' && k) {
    lines.push(`- The library holds only an excerpt of ${k.short_name ?? k.name}. Import the full opinion from CourtListener, then re-run. [[${v.lawPointer}]]`);
  } else if (v.status === 'no_quote' && k) {
    lines.push(`- Cited for a proposition, not a quotation. Read the cited page to confirm it says what ${who} claims. [[${v.lawPointer}]]`);
  } else {
    lines.push(`- ${c.unpublished ? 'Unpublished opinion. Run the Unpublished Opinion Gatekeeper (R. 1:36-3).' : 'Import this case (Research → Import) to verify the quotation and pin.'} [[${docPointer(doc, c.start, c.end)}]]`);
  }
  return lines.join('\n');
}

export function misquoteTemplate(ctx: TemplateContext): WorkflowTemplate {
  return {
    label: 'Misquote Hunter', category: 'research', builtin: true,
    description: 'Check every quotation and pin cite in a brief (usually theirs) against the opinion itself, with the actual words and a word-by-word diff',
    match: (g) => (/\b(misquot\w*|quote[- ]?check|check (?:their|the) (?:quotes|quotations)|verify (?:their |the )?(?:quotes|quotations)|quotations? in (?:their|the) brief)\b/i.test(g) ? 8 : 0),
    default_budget_usd: 8, rubric: RUBRIC('rub_misquote_v1', [{ id: 'coverage', text: 'Every authority the brief cites is checked.' }]),
    planner: {
      async plan(goal): Promise<TaskSpec[]> {
        const doc = pickDoc(ctx, goal, 'brief', 'theirs') ?? pickDoc(ctx, goal, 'brief');
        if (!doc) throw new Error('No brief found. Upload the brief to check, or name it in your request.');
        const cites = briefCitations(ctx, ctx.docs.text(doc.id));
        if (!cites.length) throw new Error(`${doc.name} cites no authority Meridian can read.`);
        const specs: TaskSpec[] = cites.map((_, i) => ({ key: `mq:${i}`, type: 'mq.cite', inputs: { doc_id: doc.id, i, tolerates_fast: true }, anticipated_tools: ['research.read'], budget: { max_usd: 0.3 } }));
        specs.push({ key: 'mq:report', type: 'synth.mq_report', inputs: { doc_id: doc.id }, depends_on: specs.map((s) => s.key), budget: { max_usd: 1 } });
        return specs;
      },
    },
    executor: {
      async execute(c) {
        const doc = docOf(ctx, c.task.inputs['doc_id']);
        const text = ctx.docs.text(doc.id);
        const cites = briefCitations(ctx, text);
        const who = authorOf(ctx, doc) === 'ours' ? 'Our brief' : filerOf(ctx, doc).short;
        if (c.task.type === 'mq.cite') {
          const i = Number(c.task.inputs['i']);
          const cite = cites[i]!;
          const v = checkCite(ctx, cite);
          return deliver(ctx, `${meta({ i, s: v.status })}\n${renderCiteCheck(ctx, doc, cite, v, pointAt(parsePoints(text), cite.start), who)}`, doc.pointer);
        }
        const parts = c.upstream.map((u) => u.deliverable.text).map((t) => ({ t, i: readNum(t, 'i'), s: (readMeta(t, 's') ?? 'verified') as QuoteVerdict['status'] }));
        parts.sort((a, b) => VERDICT[a.s].rank - VERDICT[b.s].rank || a.i - b.i);
        const bad = parts.filter((p) => ['misquote', 'wrong_pin', 'not_found'].includes(p.s));
        const unknown = parts.filter((p) => p.s === 'unknown_authority' || p.s === 'excerpt_gap');
        const rows = [...parts].sort((a, b) => a.i - b.i).map((p) => `| ${p.i + 1} | ${oneLine(/### (.+?) · /.exec(p.t)?.[1] ?? '', 70)} | ${VERDICT[p.s].label} |`);
        const lead = bad.length
          ? `${cap(count(bad.length, 'citation'))} in ${who === 'Our brief' ? 'our brief' : `${who}’s brief`} ${bad.length === 1 ? 'does' : 'do'} not match the opinion. Each is shown below with the Court’s actual words.`
          : `Every quotation Meridian could check matches the opinion verbatim.`;
        const out = [`# Misquote Hunter: ${doc.name}`, `${lead}${unknown.length ? ` ${cap(count(unknown.length, 'authority', 'authorities'))} could not be checked until imported.` : ''}`, '', '| # | Authority | Finding |', '|---|---|---|', ...rows, '', ...parts.map((p) => p.t.replace(/<!--.*?-->\n?/g, ''))].join('\n');
        return deliver(ctx, out, doc.pointer, 0.0006);
      },
    },
  };
}

// ================================================================== Opposing Brief Dissector

const LIMIT = /\b(however|but|at the same time|we stress|on the other\b|only (?:where|when|if)|not merely|cannot|must not|unless|provided that|should not hesitate)\b/i;

/** The rest of the sentence a quotation was taken from, when it turns the other way. */
function halfQuoted(k: CaseRow, start: number, end: number): { rest: string; s: number; e: number } | null {
  if (/[.!?]["”]?\s*$/.test(k.text.slice(Math.max(start, end - 3), end))) return null;
  const sentEnd = k.text.slice(end).search(/[.!?]["”]?(\s|$)/);
  if (sentEnd < 0) return null;
  const restRaw = k.text.slice(end, end + sentEnd + 1);
  const rest = oneLine(restRaw.replace(/\[\*\d+\]/g, ''), 400);
  if (rest.replace(/[^A-Za-z]/g, '').length < 20 || !LIMIT.test(rest)) return null;
  return { rest, s: end, e: end + sentEnd + 1 };
}

/** A passage elsewhere in the opinion that limits the proposition the brief takes from it. */
function limitingPassage(k: CaseRow, proposition: string, avoid: [number, number]): { text: string; s: number; e: number } | null {
  const terms = keyFacts(proposition).words.filter((w) => w.length > 4);
  let best: { text: string; s: number; e: number; score: number } | null = null;
  for (const para of k.text.split(/\n+/).reduce<Array<{ t: string; o: number }>>((acc, t) => { const o = acc.length ? acc[acc.length - 1]!.o + acc[acc.length - 1]!.t.length + 1 : 0; acc.push({ t, o: k.text.indexOf(t, o) }); return acc; }, [])) {
    for (const sn of sentencesOf(para.t, para.o)) {
      if (sn.start < avoid[1] && sn.end > avoid[0]) continue;
      if (!LIMIT.test(sn.text) || sn.text.includes('[Excerpt:') || !/^["“]?[A-Z]/.test(sn.text.replace(/^\[\*\d+\]\s*/, ''))) continue;
      const low = sn.text.toLowerCase();
      const score = terms.filter((w) => low.includes(w)).length;
      if (score >= 2 && (!best || score > best.score)) best = { text: oneLine(sn.text, 360), s: sn.start, e: sn.end, score };
    }
  }
  return best;
}

export function dissectorTemplate(ctx: TemplateContext): WorkflowTemplate {
  return {
    label: 'Opposing Brief Dissector', category: 'research', builtin: true,
    description: 'Read every case behind their brief: what it actually holds, half-quoted sentences, posture mismatches, facts the record contradicts, and draft reply points',
    match: (g) => (/\b(dissect\w*|break down (?:their|the opposing|the opposition)|analy[sz]e (?:their|the opposing|the opposition|opposing)|tear (?:apart|down))\b/i.test(g) || /\b(opposing|opposition|their) brief\b/i.test(g) && !/misquot|unpublished|reply gap|unanswered/i.test(g) ? 7 : 0),
    default_budget_usd: 15, rubric: RUBRIC('rub_dissect_v1', [{ id: 'reply', text: 'Each point ends with usable reply points.' }]),
    planner: {
      async plan(goal): Promise<TaskSpec[]> {
        const doc = pickDoc(ctx, goal, 'brief', 'theirs');
        if (!doc) throw new Error('No opposing brief found. Upload their brief, or name the file in your request.');
        const points = parsePoints(ctx.docs.text(doc.id));
        if (!points.length) throw new Error(`${doc.name} has no POINT headings to work through.`);
        const specs: TaskSpec[] = points.map((p) => ({ key: `dx:${p.num}`, type: 'dx.point', inputs: { doc_id: doc.id, num: p.num }, anticipated_tools: ['research.read', 'memory.query'], budget: { max_usd: 1 } }));
        specs.push({ key: 'dx:report', type: 'synth.dissection', inputs: { doc_id: doc.id }, depends_on: specs.map((s) => s.key), budget: { max_usd: 2 } });
        return specs;
      },
    },
    executor: {
      async execute(c) {
        const doc = docOf(ctx, c.task.inputs['doc_id']);
        const text = ctx.docs.text(doc.id);
        const who = filerOf(ctx, doc).short;
        const posture = briefPosture(text);
        if (c.task.type === 'dx.point') {
          const point = parsePoints(text).find((p) => p.num === c.task.inputs['num'])!;
          const cites = briefCitations(ctx, text).filter((x) => x.start >= point.start && x.start < point.end);
          const lines = [`## Point ${point.num}: ${oneLine(point.heading, 160)}`, `- ${who}’s argument: ${oneLine(sentencesOf(point.body)[0]?.text ?? point.body, 240)} [[${docPointer(doc, point.bodyStart, point.end)}]]`];
          const reply: Array<{ text: string; weight: number }> = [];
          for (const cite of cites) {
            const v = checkCite(ctx, cite);
            const k = cite.case;
            const label = k ? shortCite(k, v.pin ?? cite.pin ?? undefined) : oneLine(cite.cite, 90);
            lines.push(`### ${label}`);
            lines.push(`- ${who} uses it for: ${oneLine(cite.context.text, 280)} [[${docPointer(doc, cite.context.start, cite.context.end)}]]`);
            if (!k) {
              lines.push(`- ${cite.unpublished ? 'Unpublished opinion, not precedent under R. 1:36-3. Run the Unpublished Opinion Gatekeeper.' : 'Not in your library. Import it before relying on this analysis.'} [[${docPointer(doc, cite.start, cite.end)}]]`);
              if (cite.unpublished) reply.push({ text: `${who} relies on an unpublished opinion for Point ${point.num}. Under R. 1:36-3 it is not precedent and binds no court.`, weight: 3 });
              continue;
            }
            if (v.status === 'misquote' && v.closest) {
              lines.push(`- Misquoted. The opinion says: “${oneLine(v.closest.actual, 300)}” ${v.expected}. [[${v.lawPointer}]]`);
              lines.push(`- Changed words: ${renderDiff(v.closest.diff)} [[${v.lawPointer}]]`);
              reply.push({ text: `${who} misquotes ${k.short_name}: the opinion says “${v.closest.diff.find((d) => d.op === 'del')?.text ?? oneLine(v.closest.actual, 60)},” not “${v.closest.diff.find((d) => d.op === 'ins')?.text ?? ''}” (${v.expected}).`, weight: 5 });
            } else if (v.status === 'wrong_pin') {
              lines.push(`- The quotation is real but sits at ${v.expected}, not ${cite.pin}. [[${v.lawPointer}]]`);
              reply.push({ text: `The passage ${who} quotes from ${k.short_name} at ${cite.pin} appears at ${v.pin}.`, weight: 1 });
            } else if (v.status === 'verified') {
              lines.push(`- Quoted accurately (${v.expected}). [[${v.lawPointer}]]`);
            }
            // Half a sentence: the part that was left out turns the other way.
            const quoted = v.lawPointer ? parsePointer(v.lawPointer) : null;
            const hq = quoted && v.status !== 'no_quote' ? halfQuoted(k, quoted.start, quoted.end) : null;
            if (hq) {
              const p2 = makePointer('law', lawTurn(ctx, k), hq.s, hq.e);
              lines.push(`- Half a sentence. The same sentence continues: “…${hq.rest}” ${shortCite(k, pinFor(k.text, hq.s, hq.e, k.first_page))}. [[${p2}]]`);
              reply.push({ text: `${who} quotes only half of ${k.short_name}’s sentence; the rest says “${oneLine(hq.rest, 140)}” (${shortCite(k, pinFor(k.text, hq.s, hq.e, k.first_page))}).`, weight: 4 });
            }
            // Posture: a pleading-stage case cited on summary judgment.
            const kp = casePosture(k);
            if (posture === 'summary judgment' && kp === 'motion to dismiss') {
              const brill = ctx.lib.byCitation('142 N.J. 520');
              const std = brill ? verifyQuote(brill.text, 'the competent evidential materials presented, when viewed in the light most favorable to the non-moving party, are sufficient to permit a rational factfinder') : null;
              const bp = brill && std?.ok ? makePointer('law', lawTurn(ctx, brill), std.start, std.end) : ctx.lawPointer(k.id)!;
              lines.push(`- Wrong posture. ${k.short_name ?? k.name} decided a motion to dismiss under R. 4:6-2(e), where the court takes the complaint’s allegations as true. On summary judgment the question is what the competent evidence shows${brill ? ` (${shortCite(brill, '540')})` : ''}. [[${bp}]]`);
              reply.push({ text: `${who} borrows the pleading standard from ${k.short_name}, a R. 4:6-2(e) case. This is summary judgment: the question is whether the competent evidence would permit a rational factfinder to rule for ${who}${brill ? ` (${shortCite(brill, '540')})` : ''}.`, weight: 5 });
            }
            // Elsewhere in the opinion: language that limits the proposition.
            const lim = limitingPassage(k, cite.context.text, quoted ? [quoted.start - 400, quoted.end + 400] : [0, 0]);
            if (lim && !hq) {
              const p3 = makePointer('law', lawTurn(ctx, k), lim.s, lim.e);
              lines.push(`- The same opinion also says: “${lim.text}” ${shortCite(k, pinFor(k.text, lim.s, lim.e, k.first_page))}. [[${p3}]]`);
            }
          }
          // Factual assertions in the point that the record contradicts.
          for (const sn of sentencesOf(text.slice(point.bodyStart, point.end), point.bodyStart)) {
            const sentence = sn.text;
            if (sentence.length < 25 || /\bv\.|No\. A-|N\.J\.|slip op|[“”"]/.test(sentence)) continue;
            const sp = docPointer(doc, sn.start, sn.end);
            const hits = [
              ...deliveryConflict(ctx, doc.id, sentence, (ex) => recordSentences(ctx.docs, ex), keyFacts, isWorkProduct),
              ...conditionConflict(ctx, doc.id, sentence, (ex) => recordSentences(ctx.docs, ex), keyFacts, isWorkProduct),
              ...absenceContradiction(ctx, doc.id, sentence, (ex) => recordSentences(ctx.docs, ex), keyFacts, isWorkProduct).map((h) => ({ ...h, why: '' })),
              ...findAttacks(ctx, doc.id, sentence).map((a) => ({ text: ctx.kernel.l2.resolve(a.pointer)?.text ?? '', pointer: a.pointer, cite: a.cite, why: '' })),
            ].filter((h) => !/^(?:Subject|From|To|Date|Re):/i.test(h.text) && isEvidenceDoc(ctx, String(parsePointer(h.pointer)?.turn_id), isWorkProduct));
            const hit = hits[0];
            if (!hit) continue;
            lines.push(`- The record contradicts “${oneLine(sentence, 200)}” [[${sp}]]${hit.why ? ` (${hit.why})` : ''}: “${oneLine(hit.text, 220)}” (${hit.cite}). [[${hit.pointer}]]`);
            reply.push({ text: `${who} says “${oneLine(sentence, 120)}” The record says otherwise${hit.why ? `; ${hit.why}` : ''}: “${oneLine(hit.text, 140)}” (${hit.cite}).`, weight: 5 });
          }
          if (!cites.length) {
            const pp = docPointer(doc, point.start, point.end);
            const clause = /\bSection\s+\d+(?:\.\d+)*/.exec(point.body)?.[0];
            const quotesClause = clause && /[“"]/.test(point.body);
            const recordCite = /\b[A-Z][A-Z0-9]*_\d{5,8}\b|\.(?:eml|txt|pdf)\b|Cert\.|Ex\.\s?[A-Z]/.test(point.body);
            lines.push(`- No authority cited for this point${recordCite ? '' : ', and no record citation'}. [[${pp}]]`);
            if (clause && !quotesClause) reply.push({ text: `Point ${point.num} characterizes ${clause} without quoting it. Hold ${who} to the clause’s actual words, and check whether its exclusion reaches the damages at issue.`, weight: 3 });
            if (!recordCite) reply.push({ text: `Point ${point.num} cites nothing in the record. An argument that depends on facts needs record support.`, weight: 2 });
          }
          lines.push('#### Reply points');
          const ranked = reply.sort((a, b) => b.weight - a.weight);
          lines.push(...(ranked.length ? ranked.map((r) => `- ${r.text} [[${docPointer(doc, point.start, point.end)}]]`) : [`- Nothing in this point is vulnerable on its authority or record; answer it on the merits. [[${docPointer(doc, point.start, point.end)}]]`]));
          return deliver(ctx, lines.join('\n'), docPointer(doc, point.start, point.end));
        }
        // Synthesis: the strongest reply points across the whole brief first.
        const parts = c.upstream.map((u) => u.deliverable.text);
        const all = parts.flatMap((p) => { const pt = /## Point ([IVXLC\d]+)/.exec(p)?.[1]; return p.split('#### Reply points')[1]?.split('\n').filter((l) => l.startsWith('- ') && !l.includes('Nothing in this point')).map((l) => ({ l, pt })) ?? []; });
        const weightOf = (l: string) => (/misquot|posture|pleading standard|record says otherwise/i.test(l) ? 3 : /half of/i.test(l) ? 2 : 1);
        const top = all.sort((a, b) => weightOf(b.l) - weightOf(a.l)).slice(0, 5);
        const order = parts.sort((a, b) => (/## Point ([IVXLC\d]+)/.exec(a)?.[1] ?? '').localeCompare(/## Point ([IVXLC\d]+)/.exec(b)?.[1] ?? '', undefined, { numeric: true }));
        const out = [`# Dissection: ${doc.name}`, `Meridian read every authority behind ${who}’s brief against the opinion itself and checked each factual assertion against the record. The strongest reply points come first.`, '', '## Strongest reply points', ...top.map((t) => `- Point ${t.pt}: ${t.l.slice(2)}`), '', ...order.map((p) => p.replace(/<!--.*?-->/g, '').trim())].join('\n');
        return deliver(ctx, out, doc.pointer, 0.001);
      },
    },
  };
}

// ================================================================== Unpublished Opinion Gatekeeper

export function unpublishedTemplate(ctx: TemplateContext): WorkflowTemplate {
  return {
    label: 'Unpublished Opinion Gatekeeper', category: 'research', builtin: true,
    description: 'Find unpublished opinions cited in any brief, apply R. 1:36-3 (service and contrary-opinion duties), and look for a published substitute',
    match: (g) => (/\b(unpublished|non-?precedential|1:36-3|slip op)\b/i.test(g) ? 9 : 0),
    default_budget_usd: 6, rubric: RUBRIC('rub_unpub_v1'),
    planner: {
      async plan(goal): Promise<TaskSpec[]> {
        const named = pickDoc(ctx, goal, 'brief');
        const briefs = /\b(all|every|each|both)\b/i.test(goal) || !named || !goal.toLowerCase().includes(named.name.toLowerCase().replace(/\.\w+$/, '')) ? ctx.docs.list().filter((d) => /\bbrief\b|memorandum of law/i.test(`${d.name} ${ctx.docs.text(d.id).slice(0, 200)}`)) : [named];
        if (!briefs.length) throw new Error('No briefs in this matter. Upload one, or name it in your request.');
        const specs: TaskSpec[] = briefs.map((d) => ({ key: `up:${d.id}`, type: 'up.brief', inputs: { doc_id: d.id }, anticipated_tools: ['research.search'], budget: { max_usd: 0.6 } }));
        specs.push({ key: 'up:report', type: 'synth.unpublished', inputs: {}, depends_on: specs.map((s) => s.key), budget: { max_usd: 0.5 } });
        return specs;
      },
    },
    executor: {
      async execute(c) {
        if (c.task.type === 'up.brief') {
          const doc = docOf(ctx, c.task.inputs['doc_id']);
          const text = ctx.docs.text(doc.id);
          const ours = authorOf(ctx, doc) === 'ours';
          const who = ours ? 'Our brief' : filerOf(ctx, doc).short;
          const ups = briefCitations(ctx, text).filter((x) => x.unpublished);
          const lines = [`## ${doc.name} (${ours ? 'ours' : `${who}’s`})`];
          if (!ups.length) { lines.push(`- No unpublished opinions cited. [[${doc.pointer}]]`, meta({ n: 0 })); return deliver(ctx, lines.join('\n'), doc.pointer); }
          for (const u of ups) {
            const cp = docPointer(doc, u.start, u.end);
            const near = text.slice(Math.max(0, u.start - 400), u.end + 400);
            const served = /\bcop(?:y|ies)\b[^.]{0,80}\b(?:attached|served|appendix|annexed)|R\. 1:36-3|\b[DP]a\d+/i.test(near) || /\bunpublished opinions?\b[^.]{0,120}\b(?:attached|appendix)/i.test(text);
            lines.push(`### ${u.name ?? 'Unpublished opinion'}, ${u.unpublished!.docket} (${u.unpublished!.court} ${u.unpublished!.date})`);
            lines.push(`- Used for: ${oneLine(u.context.text, 260)} [[${docPointer(doc, u.context.start, u.context.end)}]]`);
            lines.push(`- R. 1:36-3: an unpublished opinion is not precedent and binds no court. Counsel may cite one only after serving a copy on the court and every party, together with every contrary unpublished opinion counsel knows of. [[${cp}]]`);
            if (ours) lines.push(`- Before filing: attach the opinion to the appendix, serve it, and serve any contrary unpublished opinions you know of. Better still, replace it with published authority. [[${cp}]]`);
            else lines.push(served ? `- The brief indicates a copy was provided. Check that contrary unpublished opinions were served too. [[${cp}]]` : `- Nothing in the brief says a copy was served. Ask for it, and say in the reply that the opinion is non-precedential and was not served as R. 1:36-3 requires. [[${cp}]]`);
            // A published substitute from the research database.
            const prop = u.context.text.replace(u.cite, '').replace(/\(([^)]*)\)\s*\.?$/, '$1');
            const s = await ctx.agent.search(prop, { external: false });
            const sub = s.results.find((r) => { const k = ctx.lib.getCase(r.case_id); return k && !/unpub/i.test(k.court ?? '') && keyFacts(r.passage).words.filter((w) => keyFacts(prop).words.includes(w)).length >= 3; });
            if (sub) {
              const k = ctx.lib.getCase(sub.case_id)!;
              lines.push(`- Published authority on the same point: “${oneLine(sub.passage, 240)}” ${sub.short_cite}. Read it to confirm it fits before relying on it. [[${makePointer('law', lawTurn(ctx, k), sub.start, sub.end)}]]`);
            } else {
              lines.push(`- No published authority in your research database supports this proposition. Search CourtListener for a published decision; if none exists, ${ours ? 'the proposition rests on non-precedential authority and should be argued from the contract and the rule itself' : `${who}’s point rests on non-precedential authority alone, and the reply should say so`}. [[${cp}]]`);
            }
          }
          lines.push(meta({ n: ups.length }));
          return deliver(ctx, lines.join('\n'), doc.pointer);
        }
        const parts = c.upstream.map((u) => u.deliverable.text);
        const n = parts.reduce((k, p) => k + readNum(p, 'n'), 0);
        const out = [`# Unpublished opinions (R. 1:36-3)`, n ? `Meridian found ${count(n, 'unpublished opinion')} cited across ${count(parts.length, 'brief')}.` : `None of the ${count(parts.length, 'brief')} cites an unpublished opinion.`, '', ...parts.map((p) => p.replace(/<!--.*?-->/g, '').trim())].join('\n');
        return deliver(ctx, out, ctx.docs.list()[0]!.pointer);
      },
    },
  };
}

// ================================================================== Reply Gap Finder

interface PointKeys { refs: string[]; authorities: string[]; sections: string[]; words: string[] }

function keysOf(ctx: TemplateContext, text: string, p: BriefPoint): PointKeys {
  const body = text.slice(p.start, p.end);
  const refs = [...new Set([...body.matchAll(/\b[A-Z][A-Z0-9]*_\d{5,8}\b|\b[\w-]+\.(?:eml|txt|pdf|md)\b/g)].map((m) => m[0]))];
  const authorities = [...new Set(briefCitations(ctx, body).map((c) => c.case?.short_name ?? c.name ?? '').filter(Boolean))];
  const sections = [...new Set([...body.matchAll(/Section\s+(\d+(?:\.\d+)*)|N\.J\.R\.E\.\s?\d+(?:\([a-z0-9]+\))*|R\.\s?\d+:\d+(?:-\d+)?/gi)].map((m) => m[0].replace(/^section/i, 'Section').replace(/[.]$/, '')))];
  return { refs, authorities, sections, words: keyFacts(`${p.heading} ${p.body}`).words };
}

export function replyGapTemplate(ctx: TemplateContext): WorkflowTemplate {
  return {
    label: 'Reply Gap Finder', category: 'drafting', builtin: true,
    description: 'Compare our moving brief with their opposition: arguments they never answered, record and authority they ignored, and new arguments the reply must meet',
    match: (g) => (/\b(reply gaps?|gap finder|unanswered|did(?:n’t|n't| not) (?:respond|answer|address)|unrebutted|what (?:did|do) they (?:ignore|miss)|reply brief)\b/i.test(g) ? 8 : 0),
    default_budget_usd: 8, rubric: RUBRIC('rub_gaps_v1', [{ id: 'coverage', text: 'Every point of our brief is matched or marked unanswered.' }]),
    planner: {
      async plan(goal): Promise<TaskSpec[]> {
        const ours = pickDoc(ctx, goal, 'brief', 'ours');
        const theirs = pickDoc(ctx, goal, 'brief', 'theirs', ours ? [ours.id] : []);
        if (!ours || !theirs) throw new Error('Reply Gap Finder needs our moving brief and their opposition in the matter.');
        const pts = parsePoints(ctx.docs.text(ours.id));
        if (!pts.length) throw new Error(`${ours.name} has no POINT headings.`);
        const specs: TaskSpec[] = pts.map((p) => ({ key: `gap:${p.num}`, type: 'gap.point', inputs: { ours: ours.id, theirs: theirs.id, num: p.num, tolerates_fast: true }, budget: { max_usd: 0.4 } }));
        specs.push({ key: 'gap:new', type: 'gap.new', inputs: { ours: ours.id, theirs: theirs.id }, budget: { max_usd: 0.4 } });
        specs.push({ key: 'gap:report', type: 'synth.gaps', inputs: { ours: ours.id, theirs: theirs.id }, depends_on: specs.map((s) => s.key), budget: { max_usd: 1 } });
        return specs;
      },
    },
    executor: {
      async execute(c) {
        const ours = docOf(ctx, c.task.inputs['ours']);
        const theirs = docOf(ctx, c.task.inputs['theirs']);
        const ot = ctx.docs.text(ours.id), tt = ctx.docs.text(theirs.id);
        const opts = parsePoints(ot), tpts = parsePoints(tt);
        const who = filerOf(ctx, theirs).short;
        // Words every point uses (party names, "summary judgment") say nothing about subject matter.
        const df = new Map<string, number>();
        for (const p of [...opts, ...tpts]) for (const w of new Set(keyFacts(`${p.heading} ${p.body}`).words)) df.set(w, (df.get(w) ?? 0) + 1);
        const total = opts.length + tpts.length;
        const sim = (a: PointKeys, b: PointKeys) => {
          const w = a.words.filter((x) => b.words.includes(x) && (df.get(x) ?? 0) / total <= 0.5).reduce((n, x) => n + Math.log(1 + total / (df.get(x) ?? 1)), 0);
          return w + 2 * a.sections.filter((s) => b.sections.includes(s)).length + 2 * a.refs.filter((r) => b.refs.includes(r)).length;
        };
        if (c.task.type === 'gap.point') {
          const p = opts.find((x) => x.num === c.task.inputs['num'])!;
          const pk = keysOf(ctx, ot, p);
          const scored = tpts.map((q) => ({ q, k: keysOf(ctx, tt, q), s: sim(pk, keysOf(ctx, tt, q)) })).sort((a, b) => b.s - a.s);
          const best = scored[0];
          const pp = docPointer(ours, p.start, p.end);
          const firstSentence = sentencesOf(p.body)[0]?.text ?? oneLine(p.body, 200);
          const lines = [`### Our Point ${p.num}: ${oneLine(p.heading, 150)}`];
          // Answered means engaging the subject, not sharing vocabulary: when every record cite,
          // authority and provision the point relies on goes unmentioned and the heading's
          // key phrases never appear, the point went unanswered.
          const items = [...pk.refs, ...pk.authorities, ...pk.sections];
          const allIgnored = items.length > 0 && items.every((x) => !tt.toLowerCase().includes(x.toLowerCase()));
          const hw = keyFacts(p.heading).words.filter((w) => w.length > 3 && !(df.get(w) && (df.get(w) ?? 0) / total > 0.5));
          const bigrams = hw.slice(1).map((w, i) => `${hw[i]} ${w}`);
          const lowT = tt.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ');
          const presence = bigrams.length ? bigrams.filter((b) => lowT.includes(b)).length / bigrams.length : 1;
          if (!best || best.s < 3 || (allIgnored && presence < 0.34)) {
            lines.push(`- Unanswered. Nothing in ${who}’s opposition responds to this point. [[${pp}]]`);
            lines.push(`- Draft reply: “${who} does not respond to Point ${p.num}. It leaves unrebutted that ${oneLine(firstSentence.replace(/^[A-Z]/, (ch) => ch.toLowerCase()), 260)}” [[${pp}]]`);
            lines.push(`- Careful: silence is not a concession of law. Say the point stands unrebutted, and tie it to the statement of material facts, where an undisputed, properly supported fact is deemed admitted for the motion (R. 4:46-2(b)). [[${pp}]]`);
            lines.push(meta({ status: 'unanswered' }));
            return deliver(ctx, lines.join('\n'), pp);
          }
          const tp = docPointer(theirs, best.q.start, best.q.end);
          const ignored = [
            ...pk.refs.filter((r) => !best.k.refs.includes(r) && !tt.includes(r)).map((r) => ({ kind: 'record', v: r })),
            ...pk.authorities.filter((a) => !tt.includes(a)).map((a) => ({ kind: 'authority', v: a })),
            ...pk.sections.filter((s) => !best.k.sections.includes(s) && !tt.toLowerCase().includes(s.toLowerCase())).map((s) => ({ kind: 'provision', v: s })),
          ];
          lines.push(`- Answered by ${who}’s Point ${best.q.num}: ${oneLine(best.q.heading, 140)} [[${tp}]]`);
          for (const g of ignored) {
            const at = ot.indexOf(g.v, p.start);
            const sn = sentencesOf(ot.slice(p.bodyStart, p.end), p.bodyStart).find((x) => x.start <= at && x.end > at) ?? { text: oneLine(p.body, 200), start: p.bodyStart, end: p.end };
            lines.push(`- Ignored ${g.kind}: ${who} never mentions ${g.v}, which our brief relies on: “${oneLine(sn.text, 220)}” [[${docPointer(ours, sn.start, sn.end)}]]`);
          }
          if (ignored.length) lines.push(`- Draft reply: “${who}’s opposition to Point ${p.num} does not address ${ignored.map((g) => g.v).join(' or ')}. That evidence is uncontradicted.” [[${pp}]]`);
          lines.push(meta({ status: ignored.length ? 'partial' : 'answered' }));
          return deliver(ctx, lines.join('\n'), pp);
        }
        if (c.task.type === 'gap.new') {
          const lines = ['### New arguments in the opposition'];
          for (const q of tpts) {
            const qk = keysOf(ctx, tt, q);
            const best = Math.max(0, ...opts.map((p) => sim(qk, keysOf(ctx, ot, p))));
            if (best >= 3) continue;
            const qp = docPointer(theirs, q.start, q.end);
            lines.push(`- ${who}’s Point ${q.num} (${oneLine(q.heading, 140)}) answers nothing in our brief. The reply must meet it, and should note if it raises a claim or defense not properly before the Court on this motion. [[${qp}]]`);
          }
          if (lines.length === 1) lines.push(`- None. Every point in the opposition responds to one of ours. [[${theirs.pointer}]]`);
          return deliver(ctx, lines.join('\n'), theirs.pointer);
        }
        const parts = c.upstream.map((u) => u.deliverable.text);
        const status = (s: string) => parts.filter((p) => readMeta(p, 'status') === s).length;
        const un = status('unanswered'), partial = status('partial');
        const pointParts = parts.filter((p) => p.startsWith('### Our Point')).sort((a, b) => (/Point ([IVXLC\d]+)/.exec(a)?.[1] ?? '').localeCompare(/Point ([IVXLC\d]+)/.exec(b)?.[1] ?? ''));
        const rows = pointParts.map((p) => { const m = /### Our Point ([IVXLC\d]+): (.+)/.exec(p); const s = readMeta(p, 'status'); return `| ${m?.[1]} | ${oneLine(m?.[2] ?? '', 70)} | ${s === 'unanswered' ? 'Unanswered' : s === 'partial' ? 'Answered, but ignores our evidence' : 'Answered'} |`; });
        const out = [`# Reply gaps: ${ours.name} against ${theirs.name}`, `${un ? `${cap(count(un, 'point'))} of our brief went unanswered` : 'Every point of our brief drew a response'}${partial ? `, and ${count(partial, 'response')} ignore${partial === 1 ? 's' : ''} evidence we rely on` : ''}.`, '', '| Our point | Heading | In the opposition |', '|---|---|---|', ...rows, '', ...pointParts.map((p) => p.replace(/<!--.*?-->/g, '').trim()), '', ...(parts.find((p) => p.startsWith('### New arguments')) ?? '').split('\n')].join('\n');
        return deliver(ctx, out, ours.pointer, 0.0006);
      },
    },
  };
}

