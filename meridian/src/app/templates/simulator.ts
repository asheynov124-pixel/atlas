/**
 * Opposing-counsel simulator. The swarm splits into three roles for every paragraph of a
 * brief or statement of facts:
 *   opposing counsel  finds record passages that undercut the paragraph (conflicting dates or
 *                     times, denials, disputes). Every attack must cite the record; an attack
 *                     whose pointer does not resolve is dropped, so there are no straw men.
 *   skeptical judge   asks the questions a motion judge would ask at oral argument.
 *   cite-checker      runs the R. 4:46-2(a) check on the paragraph's own cites.
 * The synthesis is a vulnerability map ranked by severity, each weak spot linked to the
 * passage that undermines it, with a draft fix. Completing a run arms tripwires: when a new
 * document arrives that contradicts a relied-on paragraph, that paragraph is flagged.
 */
import type { TaskSpec } from '../../kernel/run.js';
import { evidence } from '../../kernel/run.js';
import type { OutcomeRubric, SpanPointer } from '../../core/types.js';
import { makePointer } from '../../memory/episodic.js';
import { keyFacts, numberedParagraphs, recordSentences, isWorkProduct, type TemplateContext, type WorkflowTemplate } from '../context.js';
import { checkParagraph, exhibitIndex, renderCheck, splitCites, spell, cap } from './sumf.js';

export const SIM_RUBRIC: OutcomeRubric = {
  id: 'rub_sim_v1',
  criteria: [
    { id: 'record', text: 'Every attack cites the record passage it relies on.' },
    { id: 'coverage', text: 'Every paragraph is examined by every role.' },
  ],
  min_score: 0.85,
  max_revisions: 1,
};

const DISPUTE = /\b(dispute[sd]?|denie[sd]|deny|reject(?:ed|s)?|refused|contrary|however|but|never|failed|did not|no record)\b/i;

export interface Attack { text: string; pointer: SpanPointer; cite: string; kind: 'conflict' | 'denial' | 'context' }

const NEGATED = /\b(never|not|no|without)\b[^.]{0,30}\b(dispute|denie|deny|contest|object|reject)/i;

export function findAttacks(ctx: TemplateContext, docId: string, assertion: string): Attack[] {
  const f = keyFacts(assertion);
  const out: Attack[] = [];
  // Briefs and statements are argument, not evidence: attacks come only from the record.
  const sentences = recordSentences(ctx.docs, docId).filter((s) => !isWorkProduct(ctx.docs.get(s.doc_id)?.name ?? ''));
  // Words that appear everywhere (party names, "shipment") say nothing about subject matter.
  const df = new Map<string, number>();
  for (const s of sentences) for (const w of new Set(keyFacts(s.text).words)) df.set(w, (df.get(w) ?? 0) + 1);
  const distinctive = (w: string) => (df.get(w) ?? 0) / Math.max(1, sentences.length) < 0.2;
  const scored: Array<Attack & { score: number }> = [];
  for (const s of sentences) {
    const sf = keyFacts(s.text);
    const shared = f.words.filter((w) => sf.words.includes(w) && distinctive(w));
    if (shared.length < 2) continue;
    const dateConflict = sf.dates.length && f.dates.length && !sf.dates.some((d) => f.dates.includes(d));
    const timeConflict = sf.times.length && f.times.length && !sf.times.some((t) => f.times.includes(t));
    const denial = (DISPUTE.test(s.text) && !DISPUTE.test(assertion)) || (NEGATED.test(assertion) && DISPUTE.test(s.text) && !NEGATED.test(s.text));
    if (!(dateConflict || timeConflict || denial)) continue;
    if (!ctx.kernel.l2.resolve(s.pointer)) continue; // no straw men: unresolvable attacks are dropped
    const kind: Attack['kind'] = denial ? 'denial' : 'conflict';
    const why = timeConflict ? `the record shows ${sf.times.join(', ')} for the same event` : dateConflict ? 'the record ties a different date to the same subject' : NEGATED.test(assertion) ? 'the record shows the very dispute the paragraph says never happened' : 'the record shows the other side contesting it';
    scored.push({ text: `Opposing counsel will cite “${s.text}” (${s.cite}): ${why}.`, pointer: s.pointer, cite: s.cite, kind, score: shared.length + (denial ? 1 : 0) });
  }
  out.push(...scored.sort((a, b) => b.score - a.score).map(({ score: _s, ...a }) => a));
  // Strongest first: direct conflicts on dates and times, then denials, de-duplicated.
  const seen = new Set<string>();
  return out.filter((a) => !seen.has(a.pointer) && seen.add(a.pointer)).slice(0, 2);
}

export function judgeQuestions(assertion: string, hasCite: boolean): string[] {
  const q: string[] = [];
  if (!hasCite) q.push('Counsel, where in the motion record is this? I cannot consider a fact the statement does not tie to the record.');
  if (/\b(undisputed|clearly|plainly|obviously|admit(?:s|ted)?|never|always)\b/i.test(assertion)) q.push('Is that characterization in the record, or is it argument? Absolute words invite a single counterexample.');
  if (/\bwithin\b.*\bdays?\b|\bwindow\b/i.test(assertion)) q.push('Measured from which event, and counted how? Does the agreement count calendar days or business days?');
  if (/\breceived|notice|served|mailed|postmark/i.test(assertion)) q.push('Dated, mailed, postmarked or received: which one controls the clock, and what proves it?');
  if (/\btime|\d{1,2}:\d{2}\b|arriv/i.test(assertion)) q.push('Do both sides’ records agree on the time? A discrepancy between logs is a credibility question the court will not resolve on the papers.');
  if (/\bagreement|contract|section\b/i.test(assertion)) q.push('Is the agreement itself in the motion record, authenticated by someone with personal knowledge?');
  return q.slice(0, 3);
}

export function simulatorTemplate(ctx: TemplateContext): WorkflowTemplate {
  return {
    label: 'Opposing-counsel simulator', category: 'drafting', builtin: true,
    description: 'Stress-test a brief or statement of facts with opposing counsel, a skeptical judge and a cite-checker; get a vulnerability map',
    match: (g) => (/\b(simulat|opposing counsel|stress[- ]test|red[- ]team|vulnerab|attack my|weak spots?)\b/i.test(g) ? 7 : 0),
    default_budget_usd: 15, rubric: SIM_RUBRIC,
    planner: {
      async plan(goal): Promise<TaskSpec[]> {
        const named = ctx.docs.list().find((d) => goal.toLowerCase().includes(d.name.toLowerCase()));
        const doc = named ?? ctx.docs.list().find((d) => /brief|sumf|material facts|statement/i.test(d.name));
        if (!doc) throw new Error('Name the brief or statement of facts to stress-test, or upload it to the matter.');
        const paras = numberedParagraphs(ctx.docs.text(doc.id));
        if (!paras.length) throw new Error(`${doc.name} has no numbered paragraphs to test.`);
        const specs: TaskSpec[] = [];
        for (const p of paras) {
          const base = { doc_id: doc.id, n: p.n, start: p.start, end: p.end, text: p.text, tolerates_fast: true };
          specs.push({ key: `opp:${p.n}`, type: 'sim.opposing', inputs: base, budget: { max_usd: 0.4 } });
          specs.push({ key: `judge:${p.n}`, type: 'sim.judge', inputs: base, budget: { max_usd: 0.3 } });
          specs.push({ key: `cite:${p.n}`, type: 'sim.citecheck', inputs: base, budget: { max_usd: 0.3 } });
        }
        specs.push({ key: 'sim:map', type: 'synth.vulnerability_map', inputs: { doc_id: doc.id }, depends_on: specs.map((s) => s.key), budget: { max_usd: 2 } });
        return specs;
      },
    },
    executor: {
      async execute(c) {
        const doc = ctx.docs.get(String(c.task.inputs['doc_id']))!;
        const n = Number(c.task.inputs['n']);
        const ptr = makePointer('docs', doc.id, Number(c.task.inputs['start'] ?? 0), Number(c.task.inputs['end'] ?? 0));
        const { assertion, cites } = splitCites(String(c.task.inputs['text'] ?? ''));
        if (c.task.type === 'sim.opposing') {
          let attacks = findAttacks(ctx, doc.id, assertion);
          const live = await c.provider.complete({ tier: 'balanced', effort: 'medium', json: true, system: '[[task:sim_opposing]] You are opposing counsel. Given a paragraph and candidate record passages, return JSON {"attacks":[{"source":number,"argument":string}]} using only the numbered sources.', prompt: `PARAGRAPH: ${assertion}\n\nSOURCES:\n${attacks.map((a, i) => `[${i + 1}] ${a.text}`).join('\n')}` });
          const parsed = (() => { try { return JSON.parse(/\{[\s\S]*\}/.exec(live.text)?.[0] ?? '{}') as { attacks?: Array<{ source: number; argument: string }> }; } catch { return {}; } })();
          if (parsed.attacks?.length) attacks = parsed.attacks.map((a) => { const src = attacks[a.source - 1]; return src ? { ...src, text: `${a.argument} (${src.cite})` } : null; }).filter((x): x is Attack => !!x);
          const text = [`### ¶${n} · Opposing counsel`, ...(attacks.length ? attacks.map((a) => `- ${a.text} [[${a.pointer}]]`) : [`- No record passage undercuts this paragraph. [[${ptr}]]`])].join('\n');
          return { text, evidence: [...attacks.map((a) => evidence(a.pointer, ctx.kernel.l2.resolve(a.pointer)?.text ?? '')), evidence(ptr, ctx.kernel.l2.resolve(ptr)?.text ?? '')], tokens_in: live.tokens_in, tokens_out: live.tokens_out, usd: live.usd };
        }
        if (c.task.type === 'sim.judge') {
          const qs = judgeQuestions(assertion, cites.length > 0);
          const text = [`### ¶${n} · The bench`, ...(qs.length ? qs.map((q) => `- ${q} [[${ptr}]]`) : [`- No questions from the bench on this paragraph. [[${ptr}]]`])].join('\n');
          return { text, evidence: [evidence(ptr, ctx.kernel.l2.resolve(ptr)?.text ?? '')], tokens_in: 100, tokens_out: 80, usd: 0.0001 };
        }
        if (c.task.type === 'sim.citecheck') {
          const res = await checkParagraph(ctx, c.provider, doc, { n, text: String(c.task.inputs['text']), start: Number(c.task.inputs['start']), end: Number(c.task.inputs['end']) }, exhibitIndex(ctx.docs.text(doc.id)));
          const text = renderCheck(res).replace(/^### ¶(\d+) · /, '### ¶$1 · Cite-check: ');
          const ptrs = [...new Set([...text.matchAll(/\[\[(ep:[^\]\[]+)\]\]/g)].map((m) => m[1]!))];
          return { text, evidence: ptrs.map((p) => evidence(p, ctx.kernel.l2.resolve(p)?.text.slice(0, 200) ?? '')), tokens_in: 300, tokens_out: 150, usd: 0.0003 };
        }
        // Vulnerability map.
        const paras = numberedParagraphs(ctx.docs.text(doc.id));
        const byPara = new Map<number, string[]>();
        for (const u of c.upstream) { const m = /### ¶(\d+)/.exec(u.deliverable.text); if (m) byPara.set(Number(m[1]), [...(byPara.get(Number(m[1])) ?? []), u.deliverable.text]); }
        const scored = paras.map((p) => {
          const parts = byPara.get(p.n) ?? [];
          const all = parts.join('\n');
          const attacks = (all.match(/Opposing counsel will cite|^- (?!No record).*\(\w/gm) ?? []).length;
          const attackLines = parts.find((x) => x.includes('Opposing counsel')) ?? '';
          const real = attackLines.split('\n').filter((l) => l.startsWith('- ') && !l.includes('No record passage')).length;
          const citeIssue = /Cite-check: (?!Supported)/.test(all);
          const contradicted = /Contradicted|does not match|No record citation|does not resolve/.test(all);
          const questions = (parts.find((x) => x.includes('The bench')) ?? '').split('\n').filter((l) => l.startsWith('- ') && !l.includes('No questions')).length;
          const severity = real * 3 + (contradicted ? 4 : citeIssue ? 2 : 0) + questions;
          return { p, parts, severity, real, contradicted, attacks };
        }).sort((a, b) => b.severity - a.severity);
        const level = (s: number) => (s >= 7 ? 'High' : s >= 4 ? 'Medium' : s > 0 ? 'Low' : 'None');
        const rows = scored.map((s) => `| ¶${s.p.n} | ${level(s.severity)} | ${s.real ? `${spell(s.real)} record attack${s.real === 1 ? '' : 's'}` : 'no record attacks'}${s.contradicted ? ', cite problem' : ''} |`);
        const sections = scored.filter((s) => s.severity > 0).map((s) => {
          const pptr = makePointer('docs', doc.id, s.p.start, s.p.end);
          const fix = s.contradicted ? 'Conform the paragraph to the record, or replace the cite with one that establishes it.' : s.real ? 'Meet the strongest attack head-on: acknowledge the conflicting passage and explain why it does not create a genuine issue under Brill.' : 'Tighten the language to what the record shows.';
          return [`## ¶${s.p.n} · ${level(s.severity)} risk`, `> ${splitCites(s.p.text).assertion} [[${pptr}]]`, ...s.parts.map((x) => x.replace(/^### /gm, '#### ')), `- Draft fix: ${fix} [[${pptr}]]`].join('\n');
        });
        ctx.armTripwires?.(doc.id, paras.map((p) => ({ n: p.n, text: splitCites(p.text).assertion })));
        const high = scored.filter((s) => level(s.severity) === 'High').length;
        const text = [`# Vulnerability map: ${doc.name}`, `Opposing counsel, a skeptical judge and a cite-checker examined every paragraph. ${high ? `${cap(spell(high))} paragraph${high === 1 ? ' is' : 's are'} high risk.` : 'No paragraph is high risk.'} Every attack below cites the record passage it relies on. Tripwires are now armed: a new document that contradicts one of these paragraphs will flag it.`, '', '| ¶ | Risk | Why |', '|---|---|---|', ...rows, '', ...sections].join('\n');
        return { text, evidence: c.upstream.flatMap((u) => u.deliverable.evidence), tokens_in: 400, tokens_out: 800, usd: 0.001 };
      },
    },
  };
}
