/**
 * §9.4: stale mail thread → hypothesis → draft (Tier 1) → mail.send hits the Gate →
 * Tier 3 approval in the Inbox → reviewer edits one sentence → revalidation → send.
 * Also shows the invalidation path when the thread changed under the approval.
 */
import { createKernel } from '../kernel/bootstrap.js';
import { MockProvider } from '../models/mock.js';
import { EventBus, InitiativeEngine } from '../initiative/engine.js';
import { registerDemoTools } from './diligence.js';
import type { Planner, SpecialistExecutor } from '../kernel/run.js';
import { evidence } from '../kernel/run.js';

export async function runInitiativeDemo(): Promise<void> {
  const provider = new MockProvider()
    .on('grade', () => JSON.stringify({ scores: { tone: 1, commitments: 1 }, justifications: {} }))
    .on('critic', () => JSON.stringify({ severity: 0, issues: [] }))
    .on('draft', (req) => `Hi Dana, attached is v3 of the memo ${/\[\[ep:[^\]]+\]\]/.exec(req.prompt)?.[0] ?? ''}. Figures were normalized to calendar year per our Sep 14 decision ${/\[\[ep:[^\]]+\]\]/.exec(req.prompt)?.[0] ?? ''}.`)
    .on('integrate', (req) => req.prompt.split('SECTIONS:\n')[1] ?? '');
  const kernel = createKernel({ provider });
  registerDemoTools(kernel);
  // Seed memory with the decision the draft will cite.
  const decisionPtr = kernel.l2.append({ run_id: 'run_1a77', turn_id: 'turn_18', role: 'assistant', text: 'Decision: normalize Acme to calendar-year basis; note FY ends March.', trusted: true }, 'ws_diligence_q4');

  const planner: Planner = { async plan() { return [{ key: 'draft', type: 'draft.reply', inputs: { thread_id: 'thr_51' }, anticipated_tools: ['mail.draft', 'mail.send'], risk_tier_ceiling: 3 }]; } };
  const executor: SpecialistExecutor = {
    async execute(ctx) {
      const r = await ctx.provider.complete({ tier: 'balanced', effort: 'medium', system: '[[task:draft]] Draft a reply.', prompt: `Thread thr_51 awaiting reply. Cite [[${decisionPtr}]].` });
      await ctx.tool('mail.draft', { to: 'counsel@external.example', body: r.text });
      const send = await ctx.tool('mail.send', { to: ['counsel@external.example'], thread_id: 'thr_51', body: r.text, evidence_refs: [decisionPtr] }, { confidence: 0.81 });
      return { text: `Reply drafted; send is ${send.status}. ${r.text}`, evidence: [evidence(decisionPtr, 'normalize Acme to calendar-year basis')], tokens_in: r.tokens_in, tokens_out: r.tokens_out, usd: r.usd };
    },
  };

  const bus = new EventBus();
  const engine = new InitiativeEngine(kernel.lead, bus, 'ws_diligence_q4');
  engine.addRule((e) => e.type === 'mail.thread.stale' && Number(e.payload['hours']) > 48
    ? { summary: 'reply owed on stale thread', rank: 0.81, goal: `Draft and send a reply on thread ${e.payload['thread_id']}`, anticipated_tier: 3, planner, executor, rubric: { id: 'rub_reply', criteria: [{ id: 'tone', text: 'Professional tone' }, { id: 'commitments', text: 'No new legal commitments' }], min_score: 0.8, max_revisions: 2 }, budget: { max_tokens: 200_000, max_usd: 2 } }
    : null);

  // The planning checkpoint will hold the run because mail.send is Tier 3. Approve the *plan* (scope only) when it fires.
  kernel.events.on((e) => { if (e.event === 'plan.ready' && e.payload['checkpoint_required']) setTimeout(() => kernel.lead.approvePlan(e.run_id!, 'user:adelin'), 0); });

  await bus.publish({ source: 'mail', type: 'mail.thread.stale', payload: { thread_id: 'thr_51', hours: 52 } });
  const outcome = engine.outcomes[0]!;
  console.log(`hypothesis ${outcome.hypothesis.id} rank ${outcome.hypothesis.rank}: ${outcome.hypothesis.summary}`);
  console.log(`run status: ${outcome.result?.run.status}; pending approvals: ${outcome.result?.pending_approvals.join(', ')}`);

  const pending = kernel.inbox.pending()[0]!;
  console.log(`\nAPPROVAL ${pending.approval_id} (Tier ${pending.tier}) ${pending.action} → ${JSON.stringify(pending.target)}\n  preview: "${pending.diff.preview.slice(0, 90)}…"\n  evidence: ${pending.evidence_refs.join(', ')}\n  snapshot: ${JSON.stringify(pending.state_snapshot)}\n  alternatives: ${pending.alternatives.join(' | ')}\n  expires: ${pending.ttl_expires_at}`);

  // Path A: thread changed since snapshot → invalidated and reissued.
  const reviewer = { id: 'user:adelin', roles: ['workspace:owner'] };
  kernel.inbox.open(pending.approval_id, reviewer);
  const a = kernel.inbox.decide(pending.approval_id, reviewer, 'approve', { currentState: { ...pending.state_snapshot, thread_last_message_at: '2026-10-30T17:02:00Z' } });
  console.log(`\nPath A (thread changed): ${a.status}; reissued as ${a.reissued?.approval_id} with note "${a.reissued?.uncertainty_notes.at(-1)}"`);

  // Path B: reviewer edits one sentence and approves on the reissued item; state unchanged → executes.
  const re = a.reissued!;
  kernel.inbox.open(re.approval_id, reviewer);
  const b = kernel.inbox.decide(re.approval_id, reviewer, 'edit', { edited_preview: re.diff.preview.replace('attached is v3', 'attached is the final v3'), currentState: re.state_snapshot });
  console.log(`Path B (edit + approve): ${b.status}; executing with edited body…`);
  const exec = await kernel.tools.executeApproved(b.payload, b.execute_with!, 'ws_diligence_q4');
  console.log(`  → ${exec.text}\n  → L2 pointer ${exec.pointer}`);
  await kernel.lead.completeBlocked(b.payload.task_id!, exec);
  for (const g of kernel.ledger.gradesFor(b.payload.task_id!)) if (g.decision !== 'accept') console.log(`  grade ${g.kind}: ${g.decision} — ${g.critique}`);
  const resumed = await kernel.lead.resume(re.run_id);
  console.log(`  → run ${re.run_id} ${resumed.run.status}; artifact ${resumed.artifact_id}; ${resumed.provenance.length} provenance markers`);

  // Path C: a delegate without the role, then with a scoped delegation.
  const paralegal = { id: 'user:paralegal', roles: ['workspace:member'] };
  const third = kernel.inbox.create({ run_id: re.run_id, action: 'mail.send', target: { to: ['counsel@external.example'] }, diff: { kind: 'new_message', preview: 'Follow-up.' }, evidence_refs: [], state_snapshot: {}, alternatives: ['reject'], reviewer_rbac: ['workspace:owner', 'role:approver'] });
  try { kernel.inbox.decide(third.approval_id, paralegal, 'approve', { currentState: {} }); } catch (e) { console.log(`\nPath C (no authority): ${(e as Error).message}`); }
  kernel.inbox.delegate(reviewer, paralegal.id, ['mail.send'], 60 * 60 * 1000);
  const c = kernel.inbox.decide(third.approval_id, paralegal, 'approve', { currentState: {} });
  console.log(`Path C (scoped delegation): ${c.status} via ${c.payload.decided_via_delegation}`);
  console.log(`\naudit trail:\n${kernel.inbox.auditLog.map((l) => `  ${l.at} ${l.approval_id} ${l.actor} ${l.event}`).join('\n')}`);
}

if (process.argv[1]?.endsWith('initiative.ts') || process.argv[1]?.endsWith('initiative.js')) {
  await runInitiativeDemo();
}
