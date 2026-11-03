/**
 * Document review: one task per matter document, then a chronology. Every event cites the
 * sentence it came from; each event is also staged into the semantic graph through the
 * fact quarantine.
 */
import type { TaskSpec } from '../../kernel/run.js';
import { evidence } from '../../kernel/run.js';
import type { OutcomeRubric } from '../../core/types.js';
import { parsePointer } from '../../memory/episodic.js';
import { isWorkProduct, type TemplateContext, type WorkflowTemplate } from '../context.js';

export const REVIEW_RUBRIC: OutcomeRubric = {
  id: 'rub_review_v2',
  criteria: [
    { id: 'coverage', text: 'Every dated event in the document appears in the extraction.' },
    { id: 'dates', text: 'Every event has an ISO date.' },
    { id: 'evidence', text: 'Every event line carries a span pointer that resolves to the source sentence.' },
  ],
  min_score: 0.9,
  max_revisions: 2,
};

/** Registers fs.read for this matter: returns an ingested document with its existing L2 pointer. */
export function registerDocTools(ctx: TemplateContext): void {
  ctx.kernel.tools.register('fs.read', async (args) => {
    const rel = String(args['path'] ?? '');
    const doc = ctx.docs.byRel(rel) ?? ctx.docs.findDoc(rel);
    if (!doc) throw new Error(`no ingested document named ${rel} in this matter`);
    return { text: ctx.docs.text(doc.id), source: doc.rel, pointer: doc.pointer };
  });
}

export function reviewTemplate(ctx: TemplateContext): WorkflowTemplate {
  registerDocTools(ctx);
  return {
    label: 'Document review → chronology', category: 'review', builtin: true,
    description: 'Review every document in the matter and build a chronology; every event is pin-cited to its sentence',
    match: (g) => (/\b(review|chronolog|timeline|document|file|matter|correspondence|produc)/i.test(g) ? 2 : 1),
    default_budget_usd: 25,
    rubric: REVIEW_RUBRIC,
    planner: {
      async plan(): Promise<TaskSpec[]> {
        // Drafts and briefs are our own assertions, not record evidence; keep them out of the chronology.
        const docs = ctx.docs.list().filter((d) => !isWorkProduct(d.name));
        if (!docs.length) throw new Error('This matter has no documents yet. Upload some, or point the matter at a folder.');
        const specs: TaskSpec[] = docs.map((d) => ({ key: `review:${d.rel}`, type: 'review.document', inputs: { path: d.rel, tolerates_fast: true }, anticipated_tools: ['fs.read'], budget: { max_usd: 0.6 } }));
        specs.push({ key: 'synth:chronology', type: 'synth.chronology', depends_on: docs.map((d) => `review:${d.rel}`), budget: { max_usd: 3 } });
        return specs;
      },
    },
    executor: {
      async execute(c) {
        if (c.task.type === 'review.document') {
          const doc = await c.tool('fs.read', { path: c.task.inputs['path'] });
          if (doc.status !== 'ok') return { text: '', evidence: [], tokens_in: 0, tokens_out: 0, usd: 0 };
          const r = await c.provider.complete({
            tier: c.tier_hint === 'fast' ? 'fast' : 'balanced', effort: 'medium',
            system: `[[task:review]] You are a litigation paralegal. Extract every dated event from the document as a Markdown list, one per line: "- YYYY-MM-DD — what happened [[pointer]]". The pointer must be the document pointer given, with chars_<start>-<end> narrowed to the sentence you relied on (offsets count from the first character of the document body). Do not invent events.${c.critique ? `\nPrevious attempt was rejected: ${c.critique}` : ''}`,
            prompt: `DOCUMENT ${c.task.inputs['path']} [[${doc.pointer}]]\n\n${doc.text}`,
          });
          const events = [...r.text.matchAll(/^- (\S+) — (.+?) \[\[(ep:[^\]\[]+)\]\]/gm)].map((m) => {
            const quote = (parsePointer(m[3]!) ? ctx.kernel.l2.resolve(m[3]!)?.text ?? m[2]! : m[2]!).slice(0, 300);
            return { date: m[1]!, what: m[2]!, pointer: m[3]!, quote };
          });
          return {
            text: `## ${c.task.inputs['path']}\n${r.text}`,
            evidence: events.map((e) => evidence(e.pointer, e.quote)),
            claims: events.map((e) => ({ entity: 'Matter chronology', attribute: `${e.date} ${e.what.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 4).join('-')}`, value: e.what, confidence: 0.85, evidence: [{ pointer: e.pointer, quote: e.quote }] })),
            tokens_in: r.tokens_in, tokens_out: r.tokens_out, usd: r.usd,
          };
        }
        const lines = c.upstream.flatMap((u) => u.deliverable.text.split('\n').filter((l) => l.startsWith('- ') && l.includes('[[ep:')));
        const r = await c.provider.complete({ tier: 'frontier', effort: 'high', system: '[[task:chronology]] Merge these dated events into one chronology sorted by date. Keep every [[pointer]] exactly. Flag conflicting dates for the same event.', prompt: lines.join('\n') });
        return { text: r.text, evidence: c.upstream.flatMap((u) => u.deliverable.evidence), tokens_in: r.tokens_in, tokens_out: r.tokens_out, usd: r.usd };
      },
    },
  };
}
