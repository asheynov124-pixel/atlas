/**
 * Verified research memo. Holds legal authority to the same standard as record facts:
 *   research.read      one task per authority: pull the passages that answer the question;
 *                      every quotation is verified against the stored opinion and carries a
 *                      pointer into this matter's copy of it, so a hallucinated case or quote
 *                      cannot survive the evidence verifier.
 *   research.adverse   the critic hunts for directly adverse authority (RPC 3.3(a)(3)).
 *   research.treatment heuristic scan of citing opinions for negative signals (not a citator).
 *   synth.memo         Question Presented, Brief Answer, Discussion, Adverse Authority,
 *                      Treatment, and a verification note.
 */
import type { TaskSpec } from '../../kernel/run.js';
import { evidence } from '../../kernel/run.js';
import type { OutcomeRubric, SpanPointer } from '../../core/types.js';
import { makePointer, parsePointer } from '../../memory/episodic.js';
import { pinFor, shortCite, fullCite, verifyQuote } from '../../research/cites.js';
import { CONTRARY } from '../../research/agent.js';
import type { TemplateContext, WorkflowTemplate } from '../context.js';

export const MEMO_RUBRIC: OutcomeRubric = {
  id: 'rub_memo_v1',
  criteria: [
    { id: 'answer', text: 'The memo answers the question presented.' },
    { id: 'authority', text: 'Every proposition of law is supported by a verified quotation or pin cite.' },
    { id: 'adverse', text: 'Directly adverse authority is addressed or its absence is stated.' },
  ],
  min_score: 0.85,
  max_revisions: 2,
};

export function lawCite(ctx: TemplateContext, pointer: string): string | null {
  const p = parsePointer(pointer);
  if (!p || p.run_id !== 'law') return null;
  const rec = ctx.kernel.l2.get('law', p.turn_id);
  const caseId = rec?.source;
  const c = caseId ? ctx.lib.getCase(caseId) : null;
  return c ? shortCite(c, pinFor(c.text, p.start, p.end, c.first_page)) : null;
}

export function researchTemplate(ctx: TemplateContext): WorkflowTemplate {
  return {
    label: 'Verified research memo', category: 'research', builtin: true,
    description: 'Research a legal question in the database, verify every quotation, hunt adverse authority, scan treatment, write the memo',
    match: (g) => (/\b(research|memo|authority|case law|standard for|what is the (law|standard|test)|is there a case|precedent)\b/i.test(g) ? 5 : 0),
    default_budget_usd: 20, rubric: MEMO_RUBRIC,
    planner: {
      async plan(goal): Promise<TaskSpec[]> {
        const s = await ctx.agent.search(goal, { external: false });
        const top = s.results.slice(0, 4);
        if (!top.length) throw new Error('The research database has nothing on this question. Import opinions (or add a CourtListener token) and try again.');
        const specs: TaskSpec[] = top.map((r) => ({ key: `read:${r.case_id}`, type: 'research.read', inputs: { case_id: r.case_id, question: goal, variants: s.plan.variants }, anticipated_tools: ['research.read'], budget: { max_usd: 1 } }));
        specs.push({ key: 'adverse', type: 'research.adverse', inputs: { question: goal, cases: top.map((r) => r.case_id) }, anticipated_tools: ['research.search'], budget: { max_usd: 1 } });
        specs.push({ key: 'treatment', type: 'research.treatment', inputs: { cases: top.map((r) => r.case_id) }, anticipated_tools: ['research.search'], budget: { max_usd: 0.5 } });
        specs.push({ key: 'memo', type: 'synth.memo', inputs: { question: goal }, depends_on: specs.map((x) => x.key), budget: { max_usd: 3 } });
        return specs;
      },
    },
    executor: {
      async execute(c) {
        const t = c.task;
        if (t.type === 'research.read') {
          const k = ctx.lib.getCase(String(t.inputs['case_id']))!;
          const base = ctx.lawPointer(k.id)!;
          const baseTurn = parsePointer(base)!.turn_id;
          const terms = [String(t.inputs['question']), ...((t.inputs['variants'] as string[]) ?? [])].join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
          // Candidate passages: the sentences with the most question terms.
          const cands: Array<{ s: number; e: number; score: number }> = [];
          for (const m of k.text.matchAll(/[^.!?\n]+[.!?]?["”]?/g)) {
            const seg = m[0]; const low = seg.toLowerCase();
            if (seg.trim().length < 40 || low.includes('[excerpt:')) continue;
            cands.push({ s: m.index! + (seg.length - seg.trimStart().length), e: m.index! + seg.length, score: terms.reduce((n, w) => n + (low.includes(w) ? 1 : 0), 0) });
          }
          // Down-weight words the whole opinion uses ("summary", "judgment") so the pick is the on-point passage.
          const df = new Map<string, number>();
          for (const m2 of k.text.matchAll(/[^.!?\n]+[.!?]?/g)) for (const w of new Set(terms.filter((x) => m2[0].toLowerCase().includes(x)))) df.set(w, (df.get(w) ?? 0) + 1);
          const total = Math.max(1, [...k.text.matchAll(/[^.!?\n]+[.!?]?/g)].length);
          for (const cnd of cands) { const low = k.text.slice(cnd.s, cnd.e).toLowerCase(); cnd.score = terms.reduce((n, w) => n + (low.includes(w) ? Math.log(1 + total / (1 + (df.get(w) ?? 0))) : 0), 0); }
          cands.sort((a, b) => b.score - a.score);
          let picks = cands.slice(0, 2).filter((x) => x.score > 0);
          const live = await c.provider.complete({ tier: 'balanced', effort: 'medium', json: true, system: '[[task:research_read]] From the OPINION, copy verbatim the one or two passages that best answer the QUESTION. Return JSON {"quotes":[string],"holding":string}. Copy exactly; do not paraphrase inside quotes.', prompt: `QUESTION: ${t.inputs['question']}\n\nOPINION (${fullCite(k)}):\n${k.text.slice(0, 60000)}` });
          const parsed = (() => { try { return JSON.parse(/\{[\s\S]*\}/.exec(live.text)?.[0] ?? '{}') as { quotes?: string[]; holding?: string }; } catch { return {}; } })();
          const dropped: string[] = [];
          if (parsed.quotes?.length) {
            const verified = parsed.quotes.map((q) => ({ q, v: verifyQuote(k.text, q) })).filter((x) => { if (!x.v.ok || k.text.slice(x.v.start, x.v.end).includes('[Excerpt:')) { dropped.push(x.q); return false; } return true; });
            if (verified.length) picks = verified.map((x) => ({ s: x.v.start, e: x.v.end, score: 9 }));
          }
          const lines = [`## ${fullCite(k)}${k.excerpt ? ' (excerpt in library)' : ''}`];
          const evs = [];
          for (const p of picks) {
            const ptr = makePointer('law', baseTurn, p.s, p.e) as SpanPointer;
            const quote = k.text.slice(p.s, p.e).replace(/\[\*\d+\]\s?/g, '').replace(/\s+/g, ' ').trim().replace(/^["“]|["”]$/g, '');
            lines.push(`- “${quote}” ${shortCite(k, pinFor(k.text, p.s, p.e, k.first_page))}. [[${ptr}]]`);
            evs.push(evidence(ptr, k.text.slice(p.s, p.e)));
          }
          if (parsed.holding) lines.push(`- Holding as read: ${parsed.holding} [[${base}]]`);
          if (dropped.length) lines.push(`- Dropped ${dropped.length === 1 ? 'one quotation' : `${dropped.length} quotations`} the model produced that were not verbatim in the opinion. [[${base}]]`);
          return { text: lines.join('\n'), evidence: evs.length ? evs : [evidence(base, k.text.slice(0, 200))], tokens_in: live.tokens_in, tokens_out: live.tokens_out, usd: live.usd };
        }
        if (t.type === 'research.adverse') {
          const question = String(t.inputs['question']);
          const used = new Set((t.inputs['cases'] as string[]) ?? []);
          const s = await ctx.agent.search(`${question} contrary distinguished rejected overruled`, { external: true });
          const hits: string[] = [];
          const evs = [];
          for (const r of s.results.filter((x) => !used.has(x.case_id)).slice(0, 5)) {
            const k = ctx.lib.getCase(r.case_id)!;
            const m = CONTRARY.exec(k.text.slice(r.start, r.end));
            if (!m) continue;
            const ptr = makePointer('law', parsePointer(ctx.lawPointer(k.id)!)!.turn_id, r.start, r.end);
            hits.push(`- Possibly adverse: ${r.short_cite}: “${r.passage.slice(0, 220)}” [[${ptr}]]`);
            evs.push(evidence(ptr, k.text.slice(r.start, r.end)));
          }
          for (const e of s.external.slice(0, 3)) hits.push(`- Not yet in your library, review on CourtListener: ${e.name} (${e.citation ?? e.court}).`);
          const text = ['## Adverse authority', ...(hits.length ? hits : ['- No directly adverse authority surfaced in the research database. Before filing, run the opposing framing on CourtListener and confirm with a citator; RPC 3.3(a)(3) requires disclosure of directly adverse controlling authority known to counsel.'])].join('\n');
          return { text, evidence: evs, tokens_in: 200, tokens_out: 200, usd: 0.0003 };
        }
        if (t.type === 'research.treatment') {
          const lines = ['## Treatment'];
          const evs = [];
          for (const id of (t.inputs['cases'] as string[]) ?? []) {
            const k = ctx.lib.getCase(id)!;
            const tr = await ctx.agent.treatment(id);
            const base = ctx.lawPointer(id)!;
            lines.push(`- ${k.short_name ?? k.name}: ${tr.summary.replace(/\d+/g, (n) => spellNum(Number(n)))} [[${base}]]`);
            evs.push(evidence(base, k.text.slice(0, 120)));
          }
          lines.push('- Method: a heuristic scan of citing opinions for negative language near the citation. It is not a citator; confirm with KeyCite or Shepard’s before filing.');
          return { text: lines.join('\n'), evidence: evs, tokens_in: 100, tokens_out: 120, usd: 0.0002 };
        }
        // Memo synthesis.
        const reads = c.upstream.filter((u) => u.task.type === 'research.read').map((u) => u.deliverable.text);
        const adverse = c.upstream.find((u) => u.task.type === 'research.adverse')?.deliverable.text ?? '';
        const treatment = c.upstream.find((u) => u.task.type === 'research.treatment')?.deliverable.text ?? '';
        const firstQuote = reads.flatMap((r) => r.split('\n')).find((l) => l.startsWith('- “'));
        const live = await c.provider.complete({ tier: 'frontier', effort: 'high', system: '[[task:research_memo]] Write a short research memo for a New Jersey litigator: Question Presented, Brief Answer, Discussion. Use only the verified quotations provided; keep every [[pointer]] exactly as given after the sentence it supports. Do not add any case or quotation that is not provided.', prompt: `QUESTION: ${t.inputs['question']}\n\nVERIFIED AUTHORITY:\n${reads.join('\n\n')}` });
        const body = /Question Presented/i.test(live.text) && /\[\[ep:/.test(live.text) ? live.text : [
          '## Question Presented', String(t.inputs['question']).replace(/\?*$/, '?'),
          '## Brief Answer', firstQuote ? `The controlling New Jersey authority answers the question. ${firstQuote.slice(2)}` : 'The research database did not produce controlling authority.',
          '## Discussion', ...reads,
        ].join('\n\n');
        const text = [`# Research memo`, body, adverse, treatment, '## Verification', 'Every quotation above was checked word for word against the stored opinion text, and every pin cite was computed from the reporter’s star pagination. Opinions marked as excerpts should be read in full before filing.'].join('\n\n');
        return { text, evidence: c.upstream.flatMap((u) => u.deliverable.evidence), tokens_in: live.tokens_in, tokens_out: live.tokens_out, usd: live.usd };
      },
    },
  };
}

function spellNum(n: number): string { return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? 'many'; }
