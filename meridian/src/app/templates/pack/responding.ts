/**
 * Responding Statement Builder, R. 4:46-2(b). For each paragraph of the movant's statement
 * of material facts, decide admit / deny / admit in part, and support every denial with a
 * citation to the record, because a properly supported fact not specifically disputed by a
 * conforming citation is deemed admitted for the motion. It flags:
 *   - paragraphs with no record citation, or a cite that does not resolve,
 *   - legal conclusions dressed as facts,
 *   - paragraphs whose own cite contradicts them,
 *   - paragraphs that rest only on the movant's own letter (not competent proof of the
 *     fact it asserts on its own behalf),
 *   - paragraphs the rest of the record contradicts.
 * The denials become a list of additional facts in genuine dispute.
 */
import type { TaskSpec } from '../../../kernel/run.js';
import type { OutcomeRubric } from '../../../core/types.js';
import { makePointer } from '../../../memory/episodic.js';
import { keyFacts, numberedParagraphs, recordSentences, isWorkProduct, type TemplateContext, type WorkflowTemplate } from '../../context.js';
import { checkParagraph, exhibitIndex, splitCites } from '../sumf.js';
import { findAttacks } from '../simulator.js';
import { pickDoc, filerOf, writtenBy, absenceContradiction, deliveryConflict, conditionConflict, isEvidenceDoc, oneLine, count, sourced, meta, readMeta } from './common.js';
import { parsePointer } from '../../../memory/episodic.js';
import { evidence } from '../../../kernel/run.js';

const RUBRIC: OutcomeRubric = {
  id: 'rub_responding_v1',
  criteria: [
    { id: 'evidence', text: 'Every denial cites the record that supports it.' },
    { id: 'coverage', text: 'Every paragraph of the movant’s statement gets a response.' },
  ],
  min_score: 0.85,
  max_revisions: 1,
};

const LEGAL = /\b(waived?|waiver|liable|liability|barred|estopped|entitled to|as a matter of law|enforceable|unenforceable|breached|in breach|expired|untimely|timely|null and void|invalid)\b/i;

type Response = 'Admitted' | 'Denied' | 'Admitted in part, denied in part' | 'Admitted only that the document so states';

export function respondingTemplate(ctx: TemplateContext): WorkflowTemplate {
  return {
    label: 'Responding Statement Builder', category: 'drafting', builtin: true,
    description: 'Answer the movant’s statement of material facts paragraph by paragraph under R. 4:46-2(b), with a record cite for every denial',
    match: (g) => (/\b(responding statement|respond(?:ing)? to (?:their|the movant’s|the movant's|cinder’s|cinder's|the) (?:statement|sumf)|counter-?statement|4:46-2\(b\)|admit or deny|answer (?:their|the) (?:sumf|statement))\b/i.test(g) ? 9 : 0),
    default_budget_usd: 10, rubric: RUBRIC,
    planner: {
      async plan(goal): Promise<TaskSpec[]> {
        const doc = pickDoc(ctx, goal, 'sumf', 'theirs');
        if (!doc) throw new Error('No statement of material facts from the other side. Upload it, or name the file in your request.');
        const paras = numberedParagraphs(ctx.docs.text(doc.id));
        if (!paras.length) throw new Error(`${doc.name} has no numbered paragraphs.`);
        const specs: TaskSpec[] = paras.map((p) => ({ key: `rs:${p.n}`, type: 'rs.paragraph', inputs: { doc_id: doc.id, n: p.n, start: p.start, end: p.end, text: p.text, tolerates_fast: true }, anticipated_tools: ['fs.read', 'memory.query'], budget: { max_usd: 0.4 } }));
        specs.push({ key: 'rs:statement', type: 'synth.responding', inputs: { doc_id: doc.id }, depends_on: specs.map((s) => s.key), budget: { max_usd: 1 } });
        return specs;
      },
    },
    executor: {
      async execute(c) {
        const doc = ctx.docs.get(String(c.task.inputs['doc_id']))!;
        const movant = filerOf(ctx, doc);
        if (c.task.type === 'rs.paragraph') {
          const n = Number(c.task.inputs['n']);
          const para = { n, text: String(c.task.inputs['text']), start: Number(c.task.inputs['start']), end: Number(c.task.inputs['end']) };
          const ptr = makePointer('docs', doc.id, para.start, para.end);
          const { assertion } = splitCites(para.text);
          const check = await checkParagraph(ctx, c.provider, doc, para, exhibitIndex(ctx.docs.text(doc.id)));
          const legal = LEGAL.exec(assertion)?.[0];
          const record = [
            ...deliveryConflict(ctx, doc.id, assertion, (ex) => recordSentences(ctx.docs, ex), keyFacts, isWorkProduct).map((h) => ({ text: h.text, pointer: h.pointer, cite: h.cite, delivery: true })),
            ...conditionConflict(ctx, doc.id, assertion, (ex) => recordSentences(ctx.docs, ex), keyFacts, isWorkProduct).map((h) => ({ text: h.text, pointer: h.pointer, cite: h.cite })),
            ...absenceContradiction(ctx, doc.id, assertion, (ex) => recordSentences(ctx.docs, ex), keyFacts, isWorkProduct).map((h) => ({ text: h.text, pointer: h.pointer, cite: h.cite })),
            ...findAttacks(ctx, doc.id, assertion).map((a) => ({ text: ctx.kernel.l2.resolve(a.pointer)?.text ?? '', pointer: a.pointer, cite: a.cite })),
          ].filter((r, i, all) => r.text && !/^(?:Subject|From|To|Date|Re):/i.test(r.text) && all.findIndex((x) => x.pointer === r.pointer) === i && isEvidenceDoc(ctx, String(parsePointer(r.pointer)?.turn_id), isWorkProduct));
          // The paragraph's own cite proves the opposite (or the record it cites contains what it says is absent).
          const selfContra = check.cites.length > 0 && record.some((r) => check.cites.some((k) => k.pointer && k.doc && r.pointer.includes(`/${k.doc.id}/`)));
          const ownDocsOnly = check.cites.length > 0 && check.cites.every((k) => writtenBy(ctx, k.doc, movant.short));
          let response: Response = 'Admitted';
          const reasons: Array<{ text: string; pointer: string; short: string }> = [];
          const support: Array<{ text: string; pointer: string; cite: string }> = [];
          if (check.status === 'no_cite') {
            response = 'Denied';
            reasons.push({ text: 'The paragraph cites no part of the motion record. R. 4:46-2(a) requires a citation to the record for every fact.', pointer: ptr, short: 'The paragraph cites no record support, as R. 4:46-2(a) requires.' });
          } else if (check.status === 'unresolvable') {
            response = 'Denied';
            reasons.push({ text: `The paragraph rests on ${check.cites.filter((k) => !k.pointer).map((k) => k.raw).join(', ')}, which is not in the motion record served on us.`, pointer: ptr, short: `It rests on ${check.cites.filter((k) => !k.pointer).map((k) => k.raw).join(', ')}, which is not in the motion record.` });
          }
          if (legal) {
            response = 'Denied';
            reasons.push({ text: `“${legal}” states a legal conclusion, not a fact. No response is required; to the extent one is, denied.`, pointer: ptr, short: `Whether anything was “${legal}” is a legal conclusion, not a fact.` });
          }
          if (selfContra || check.status === 'contradicted') {
            response = 'Denied';
            const own = record.find((r) => check.cites.some((k) => k.doc && r.pointer.includes(`/${k.doc.id}/`)));
            if (own) { record.splice(record.indexOf(own), 1); record.unshift(own); }
            reasons.push({ text: `The document ${movant.short} cites says the opposite${own ? `: “${oneLine(own.text, 200)}” (${own.cite})` : ''}.`, pointer: own?.pointer ?? ptr, short: `${movant.short}’s own cited document says otherwise${own ? `: “${oneLine(own.text, 140)}” (${own.cite})` : ''}.` });
          }
          for (const r of record) if (!support.some((s) => s.pointer === r.pointer)) support.push(r);
          const dated = record.find((r) => (r as { delivery?: boolean }).delivery);
          if (dated && response !== 'Denied') {
            response = 'Admitted in part, denied in part';
            const claimed = keyFacts(assertion).dates[0];
            reasons.push({ text: 'Dated is not delivered. The notice bears that date, but the record shows when it was mailed and received.', pointer: dated.pointer, short: `Admitted only that the notice is dated ${claimed ? prettyIso(claimed) : 'as stated'}. Denied that notice was given on that date.` });
          }
          if (response === 'Admitted' && support.length) response = ownDocsOnly ? 'Admitted only that the document so states' : 'Admitted in part, denied in part';
          else if (response === 'Admitted' && ownDocsOnly) response = 'Admitted only that the document so states';
          if (ownDocsOnly && response !== 'Denied') reasons.push({ text: `The only support is ${movant.short}’s own letter, which is not competent proof of the facts it asserts on ${movant.short}’s behalf. Facts on a motion must come from someone with personal knowledge (R. 1:6-6).`, pointer: check.cites[0]!.pointer ?? ptr, short: '' });
          if (check.status === 'misquote') { if (response === 'Admitted') response = 'Denied'; reasons.push({ text: 'The quoted words do not appear in the cited document.', pointer: check.cites[0]?.pointer ?? ptr, short: 'The quoted words are not in the cited document.' }); }
          const lines = [`### ¶${n} · ${response}`, `> ${movant.short}: ${oneLine(assertion, 320)} [[${ptr}]]`];
          for (const k of check.cites) if (k.pointer) lines.push(`- ${movant.short} cites ${k.cite}: “${oneLine(k.text, 220)}” [[${k.pointer}]]`);
          for (const r of reasons) lines.push(`- Why: ${r.text} [[${r.pointer}]]`);
          for (const s of support.slice(0, 2)) lines.push(`- Record: “${oneLine(s.text, 240)}” (${s.cite}) [[${s.pointer}]]`);
          const why = reasons.map((r) => r.short).filter(Boolean);
          const rec = support.find((x) => !why.some((w) => w.includes(oneLine(x.text, 140)))) ;
          lines.push(`- Draft response: ${draftResponse(response, rec, movant.short, why)} [[${rec?.pointer ?? support[0]?.pointer ?? ptr}]]`);
          lines.push(meta({ r: response.replace(/\s+/g, '_') }));
          const text = sourced(lines.join('\n'), ptr);
          const ptrs = [...new Set([...text.matchAll(/\[\[(ep:[^\]\[]+)\]\]/g)].map((m) => m[1]!))];
          return { text, evidence: ptrs.map((p) => evidence(p, ctx.kernel.l2.resolve(p)?.text.slice(0, 200) ?? '')), tokens_in: 400, tokens_out: 250, usd: 0.0004 };
        }
        // The responding statement itself, in filing order, then the additional facts in dispute.
        const parts = c.upstream.map((u) => u.deliverable.text).sort((a, b) => Number(/¶(\d+)/.exec(a)?.[1]) - Number(/¶(\d+)/.exec(b)?.[1]));
        const tally = new Map<string, number>();
        for (const p of parts) { const r = (readMeta(p, 'r') ?? 'Admitted').replace(/_/g, ' '); tally.set(r, (tally.get(r) ?? 0) + 1); }
        const numbered = parts.map((p) => {
          const n = /¶(\d+)/.exec(p)?.[1];
          const d = /- Draft response: (.+)$/m.exec(p)?.[1] ?? 'Admitted.';
          return `${n}. ${d}`;
        });
        const extra: string[] = [];
        const seen = new Set<string>();
        for (const p of parts) for (const m of p.matchAll(/^- Record: “(.+?)” \((.+?)\) \[\[(ep:[^\]]+)\]\]/gm)) {
          if (seen.has(m[3]!) || /^(?:Subject|From|To|Date):/i.test(m[1]!)) continue;
          seen.add(m[3]!);
          extra.push(`${extra.length + 1}. ${m[1]} (${m[2]}) [[${m[3]}]]`);
        }
        const denied = (tally.get('Denied') ?? 0) + (tally.get('Admitted in part, denied in part') ?? 0);
        const out = [
          `# Responding statement to ${doc.name} (draft)`,
          `${movant.name}’s statement has ${count(parts.length, 'paragraph')}. Meridian proposes denying ${count(denied, 'paragraph')} in whole or part, each with a record citation. Under R. 4:46-2(b), a properly supported fact that is not specifically disputed with a citation to the record is deemed admitted for the motion, so every denial below carries one.`,
          '', '| ¶ | Response |', '|---|---|',
          ...parts.map((p) => `| ¶${/¶(\d+)/.exec(p)?.[1]} | ${(readMeta(p, 'r') ?? '').replace(/_/g, ' ')} |`),
          '', '## Responses as filed', ...numbered,
          ...(extra.length ? ['', '## Additional material facts in genuine dispute', 'R. 4:46-2(b) lets the opposing party add the facts it contends are material and genuinely disputed. These come from the denials above.', ...extra] : []),
          '', '## Paragraph-by-paragraph basis', ...parts.map((p) => p.replace(/<!--.*?-->/g, '').trim()),
        ].join('\n');
        const text = sourced(out, doc.pointer);
        const ptrs = [...new Set([...text.matchAll(/\[\[(ep:[^\]\[]+)\]\]/g)].map((m) => m[1]!))];
        return { text, evidence: ptrs.map((p) => evidence(p, ctx.kernel.l2.resolve(p)?.text.slice(0, 200) ?? '')), tokens_in: 300, tokens_out: 600, usd: 0.0008 };
      },
    },
  };
}

function draftResponse(r: Response, s: { text: string; cite: string } | undefined, short: string, why: string[]): string {
  const rec = s ? ` The record shows: “${oneLine(s.text, 200)}” (${s.cite}).` : '';
  const because = why.length ? ` ${why.slice(0, 2).join(' ')}` : '';
  switch (r) {
    case 'Admitted': return 'Admitted.';
    case 'Denied': return `Denied.${because}${rec}`;
    case 'Admitted in part, denied in part': return why.length ? `${why[why.length - 1]}${rec}` : `Admitted only that the cited document so states; otherwise denied.${rec}`;
    case 'Admitted only that the document so states': return `Admitted only that ${short}’s letter so states; denied that the letter establishes the fact.${rec}`;
  }
}

function prettyIso(iso: string): string { const d = new Date(`${iso}T00:00:00Z`); return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
