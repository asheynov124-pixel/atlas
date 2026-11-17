import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '../src/kernel/bootstrap.js';
import { MockProvider } from '../src/models/mock.js';
import { diligenceTemplate, COMPANIES, registerDemoTools } from '../src/demo/diligence.js';
import { evidence, type Planner, type SpecialistExecutor } from '../src/kernel/run.js';
import { EventBus, InitiativeEngine } from '../src/initiative/engine.js';

const rubric = { id: 'rub', criteria: [{ id: 'coverage', text: 'c' }, { id: 'consistency', text: 'c' }, { id: 'evidence', text: 'e' }], min_score: 0.9, max_revisions: 3 };

test('end-to-end diligence run: DAG, grading, one revision, fan-in, provenance, L3 claims', async () => {
  const provider = new MockProvider();
  const kernel = createKernel({ provider, concurrency: 16 });
  const companies = COMPANIES.slice(0, 12);
  const tpl = diligenceTemplate(kernel, provider, companies);
  const started = await kernel.lead.start({ workspace_id: 'ws', goal: 'Prepare a comparative diligence memo', budget: { max_tokens: 10_000_000, max_usd: 60 }, rubric, planner: tpl.planner, executor: tpl.executor });
  assert.equal(started.checkpoint_required, false, 'single Tier 0 system, no Tier 3');
  assert.equal(started.task_count, 12 * 2 + 8);
  const result = await kernel.lead.execute(started.run.run_id);
  const s = kernel.ledger.summary(started.run.run_id);
  assert.equal(result.run.status, 'completed');
  assert.equal(s.accepted, s.total, `all tasks accepted: ${JSON.stringify(s)}`);
  const revisions = kernel.events.forRun(started.run.run_id).filter((e) => e.event === 'task.progress' && e.payload['status'] === 'revising');
  assert.equal(revisions.length, 1, 'Zeta extraction revised exactly once');
  assert.ok(kernel.ledger.gradesFor(kernel.ledger.tasksForRun(started.run.run_id).find((t) => t.inputs['company'] === 'Zeta' && t.type.startsWith('extract'))!.task_id).some((g) => g.kind === 'evidence' && g.decision === 'revise'));
  assert.ok(result.provenance.length >= 12);
  assert.ok(!result.text.includes('[[ep:'), 'every pointer became a marker');
  assert.ok(result.text.includes('⟦1⟧'));
  for (const p of result.provenance) assert.ok(kernel.l2.resolve(p.pointer), `provenance ${p.marker} resolves`);
  assert.equal(kernel.l3.all().length, 24, 'two claims per company promoted');
  assert.equal(kernel.l3.quarantine.length, 0);
  assert.ok(result.run.spend.usd > 0 && result.run.spend.usd < 60);
  assert.ok(kernel.ledger.entries.some((e) => e.kind === 'checkpoint'));
});

test('Tier 3 in a proactive run pauses at the Inbox, and resumes after approval + revalidation', async () => {
  const provider = new MockProvider().on('grade', () => JSON.stringify({ scores: { coverage: 1, consistency: 1, evidence: 1 } })).on('critic', () => JSON.stringify({ severity: 0, issues: [] })).on('integrate', (r) => r.prompt);
  const kernel = createKernel({ provider });
  registerDemoTools(kernel);
  const ptr = kernel.l2.append({ run_id: 'seed', turn_id: 't', role: 'assistant', text: 'Decision: calendar-year basis.', trusted: true }, 'ws');
  const planner: Planner = { async plan() { return [{ key: 'd', type: 'draft.reply', anticipated_tools: ['mail.send'], risk_tier_ceiling: 3 }]; } };
  const executor: SpecialistExecutor = { async execute(ctx) { const s = await ctx.tool('mail.send', { to: ['c@x'], body: 'Hello [[' + ptr + ']]' }); return { text: `Draft ready; send ${s.status} [[${ptr}]].`, evidence: [evidence(ptr, 'calendar-year basis')], tokens_in: 10, tokens_out: 10, usd: 0.001 }; } };
  const bus = new EventBus();
  const engine = new InitiativeEngine(kernel.lead, bus, 'ws');
  engine.addRule((e) => e.type === 'mail.thread.stale' ? { summary: 's', rank: 0.9, goal: 'reply', anticipated_tier: 3, planner, executor, rubric, budget: { max_tokens: 1e6, max_usd: 5 } } : null);
  engine.addRule(() => ({ summary: 'low', rank: 0.1, goal: 'ignored', anticipated_tier: 0, planner, executor, rubric, budget: { max_tokens: 1, max_usd: 1 } }));
  let planApproved = false;
  kernel.events.on((e) => { if (e.event === 'plan.ready' && e.payload['checkpoint_required']) { planApproved = true; setTimeout(() => kernel.lead.approvePlan(e.run_id!, 'test'), 0); } });
  await bus.publish({ source: 'mail', type: 'mail.thread.stale', payload: { thread_id: 'thr', hours: 52 } });
  assert.ok(planApproved, 'planning checkpoint fired because mail.send is Tier 3');
  assert.equal(engine.outcomes.length, 2);
  assert.match(engine.outcomes[1]!.skipped_reason ?? '', /below threshold/);
  const out = engine.outcomes[0]!.result!;
  assert.equal(out.run.status, 'paused');
  assert.equal(out.pending_approvals.length, 1);
  const p = kernel.inbox.get(out.pending_approvals[0]!);
  assert.equal(p.action, 'mail.send');
  assert.equal(p.diff.preview.startsWith('Hello'), true);
  const owner = { id: 'o', roles: ['workspace:owner'] };
  const d = kernel.inbox.decide(p.approval_id, owner, 'approve', { currentState: p.state_snapshot });
  assert.equal(d.status, 'approved');
  const exec = await kernel.tools.executeApproved(p, d.execute_with!, 'ws');
  await kernel.lead.completeBlocked(p.task_id!, exec);
  const resumed = await kernel.lead.resume(out.run.run_id);
  assert.equal(resumed.run.status, 'completed');
  assert.ok(resumed.provenance.length >= 2);
});

test('Sentinel: run budget hard-stops the run; loops are detected', async () => {
  const provider = new MockProvider();
  const kernel = createKernel({ provider });
  const tpl = diligenceTemplate(kernel, provider, COMPANIES.slice(0, 6));
  const started = await kernel.lead.start({ workspace_id: 'ws', goal: 'memo', budget: { max_tokens: 10_000_000, max_usd: 0.02 }, rubric, planner: tpl.planner, executor: tpl.executor });
  await assert.rejects(kernel.lead.execute(started.run.run_id), /budget exceeded/);
  assert.equal(kernel.ledger.getRun(started.run.run_id).status, 'failed');
  assert.ok(kernel.sentinel.alerts.some((a) => a.kind === 'budget_hard_stop'));

  const k2 = createKernel({ provider: new MockProvider() });
  registerDemoTools(k2);
  const looper: SpecialistExecutor = { async execute(ctx) { for (let i = 0; i < 5; i++) await ctx.tool('search.web', { q: 'same thing' }); return { text: 'x', evidence: [], tokens_in: 1, tokens_out: 1, usd: 0 }; } };
  const s2 = await k2.lead.start({ workspace_id: 'ws', goal: 'loop', budget: { max_tokens: 1e6, max_usd: 5 }, rubric, planner: { async plan() { return [{ key: 'a', type: 'research.x' }]; } }, executor: looper });
  await assert.rejects(k2.lead.execute(s2.run.run_id), /loop detected/);
  assert.ok(k2.sentinel.alerts.some((a) => a.kind === 'loop'));
});
