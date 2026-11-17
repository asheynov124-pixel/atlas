/**
 * Outbound reply: draft from the record (Tier 1), then send (Tier 3). The plan checkpoint
 * fires first, and the send waits in the Approvals Inbox. Nothing reaches a mail server
 * in this build: mail.send prints a receipt.
 */
import { evidence } from '../../kernel/run.js';
import type { OutcomeRubric } from '../../core/types.js';
import type { TemplateContext, WorkflowTemplate } from '../context.js';

export const REPLY_RUBRIC: OutcomeRubric = {
  id: 'rub_reply_v1',
  criteria: [
    { id: 'tone', text: 'Professional tone appropriate for opposing counsel.' },
    { id: 'commitments', text: 'No new legal commitments or admissions.' },
    { id: 'evidence', text: 'Every factual sentence cites a record span.' },
  ],
  min_score: 0.8,
  max_revisions: 2,
};

export function replyTemplate(ctx: TemplateContext): WorkflowTemplate {
  return {
    label: 'Reply to opposing counsel', category: 'drafting', builtin: true,
    description: 'Draft a reply from the record and send it; the send requires a partner’s Tier 3 approval',
    match: (g) => (/\b(send|reply|respond|e-?mail)\b/i.test(g) ? 4 : 0),
    default_budget_usd: 5, risk_tier_ceiling: 3, rubric: REPLY_RUBRIC,
    planner: {
      async plan(goal) {
        const to = /[\w.+-]+@[\w.-]+\.\w+/.exec(goal)?.[0] ?? 'counsel@external.example';
        return [{ key: 'draft', type: 'draft.reply', inputs: { to, goal }, anticipated_tools: ['memory.query', 'mail.draft', 'mail.send'], risk_tier_ceiling: 3, budget: { max_usd: 2 } }];
      },
    },
    executor: {
      async execute(c) {
        const goal = String(c.task.inputs['goal']);
        const to = String(c.task.inputs['to']);
        const mem = await ctx.kernel.retriever.retrieve({ query: goal, max_tokens: 1500, run_id: 'docs' });
        const context = mem.spans.map((s) => `[[${s.pointer}]] ${s.text}`).join('\n');
        const r = await c.provider.complete({ tier: 'balanced', effort: 'medium', system: `[[task:draft]] Draft a short, professional email reply for a litigator. Cite a record pointer in [[...]] after every factual sentence. Make no new commitments.${c.critique ? `\nPrevious attempt was rejected: ${c.critique}` : ''}`, prompt: `GOAL: ${goal}\nTO: ${to}\n\nMEMORY:\n${context || '(empty)'}` });
        const pointers = [...r.text.matchAll(/\[\[(ep:[^\]\[]+)\]\]/g)].map((m) => m[1]!);
        await c.tool('mail.draft', { to, body: r.text });
        const send = await c.tool('mail.send', { to: [to], body: r.text, evidence_refs: pointers }, { confidence: 0.8 });
        return { text: `Draft to ${to} (send: ${send.status}):\n\n${r.text}`, evidence: pointers.map((p) => evidence(p, ctx.kernel.l2.resolve(p)?.text.slice(0, 200) ?? '')), tokens_in: r.tokens_in, tokens_out: r.tokens_out, usd: r.usd };
      },
    },
  };
}
