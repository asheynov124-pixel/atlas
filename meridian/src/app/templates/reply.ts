/**
 * Outbound reply template: draft a reply from memory (Tier 1), then send it (Tier 3).
 * The send always lands in the Approvals Inbox; the planning checkpoint fires first
 * because a Tier 3 action is anticipated. Nothing here reaches a real mail server.
 */
import type { Kernel } from '../../kernel/bootstrap.js';
import type { Planner, SpecialistExecutor } from '../../kernel/run.js';
import { evidence } from '../../kernel/run.js';
import type { OutcomeRubric } from '../../core/types.js';

export const REPLY_RUBRIC: OutcomeRubric = {
  id: 'rub_reply_v1',
  criteria: [
    { id: 'tone', text: 'Professional tone appropriate for opposing counsel.' },
    { id: 'commitments', text: 'No new legal commitments or admissions.' },
    { id: 'evidence', text: 'Every factual sentence cites a memory span.' },
  ],
  min_score: 0.8,
  max_revisions: 2,
};

export function replyTemplate(kernel: Kernel): { planner: Planner; executor: SpecialistExecutor; rubric: OutcomeRubric } {
  const planner: Planner = {
    async plan(goal) {
      const to = /[\w.+-]+@[\w.-]+\.\w+/.exec(goal)?.[0] ?? 'counsel@external.example';
      return [{ key: 'draft', type: 'draft.reply', inputs: { to, goal }, anticipated_tools: ['memory.query', 'mail.draft', 'mail.send'], risk_tier_ceiling: 3, budget: { max_usd: 2 } }];
    },
  };
  const executor: SpecialistExecutor = {
    async execute(ctx) {
      const goal = String(ctx.task.inputs['goal']);
      const to = String(ctx.task.inputs['to']);
      const mem = await kernel.retriever.retrieve({ query: goal, max_tokens: 1500 });
      const context = mem.spans.map((s) => `[[${s.pointer}]] ${s.text}`).join('\n');
      const r = await ctx.provider.complete({ tier: 'balanced', effort: 'medium', system: `[[task:draft]] Draft a short, professional email reply for a litigator. Cite a memory span pointer in [[...]] after every factual sentence. Make no new commitments.${ctx.critique ? `\nPrevious attempt was rejected: ${ctx.critique}` : ''}`, prompt: `GOAL: ${goal}\nTO: ${to}\n\nMEMORY:\n${context || '(empty)'}` });
      const pointers = [...r.text.matchAll(/\[\[(ep:[^\]\[]+)\]\]/g)].map((m) => m[1]!);
      await ctx.tool('mail.draft', { to, body: r.text });
      const send = await ctx.tool('mail.send', { to: [to], body: r.text, evidence_refs: pointers }, { confidence: 0.8 });
      const evs = pointers.map((p) => evidence(p, kernel.l2.resolve(p)?.text.slice(0, 200) ?? ''));
      return { text: `Draft to ${to} (send: ${send.status}):\n\n${r.text}`, evidence: evs, tokens_in: r.tokens_in, tokens_out: r.tokens_out, usd: r.usd };
    },
  };
  return { planner, executor, rubric: REPLY_RUBRIC };
}
