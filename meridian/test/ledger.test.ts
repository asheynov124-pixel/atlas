import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventStream } from '../src/core/events.js';
import { TaskLedger, LedgerInvariantError } from '../src/ledger/ledger.js';

function setup() {
  const ledger = new TaskLedger(new EventStream());
  const run = ledger.createRun({ workspace_id: 'ws', goal: 'g', budget: { max_tokens: 1000, max_usd: 1 }, risk_tier_ceiling: 1 });
  return { ledger, run };
}

test('accepted requires a grader record', () => {
  const { ledger, run } = setup();
  const t = ledger.addTask({ run_id: run.run_id, type: 'x', budget: { max_tokens: 100, max_usd: 1 } });
  ledger.claim(t.task_id, 'a1');
  ledger.transition(t.task_id, 'awaiting_grade');
  assert.throws(() => ledger.transition(t.task_id, 'accepted'), (e: unknown) => e instanceof LedgerInvariantError && e.rule === 'accepted_requires_grade');
  ledger.recordGrade({ id: 'g1', task_id: t.task_id, kind: 'rubric', scores: {}, score: 1, confidence: 1, decision: 'accept', critique: '', created_at: '' });
  ledger.transition(t.task_id, 'accepted');
  assert.equal(ledger.getTask(t.task_id).status, 'accepted');
});

test('readiness is derived from accepted dependencies and ownership changes are logged', () => {
  const { ledger, run } = setup();
  const a = ledger.addTask({ run_id: run.run_id, type: 'a', budget: { max_tokens: 100, max_usd: 1 } });
  const b = ledger.addTask({ run_id: run.run_id, type: 'b', depends_on: [a.task_id], budget: { max_tokens: 100, max_usd: 1 } });
  assert.equal(ledger.getTask(a.task_id).status, 'ready');
  assert.equal(ledger.getTask(b.task_id).status, 'pending');
  ledger.claim(a.task_id, 'agent-1');
  assert.throws(() => ledger.claim(a.task_id, 'agent-2'), /cannot claim task in status running/);
  ledger.transition(a.task_id, 'awaiting_grade');
  ledger.recordGrade({ id: 'g', task_id: a.task_id, kind: 'rubric', scores: {}, score: 1, confidence: 1, decision: 'accept', critique: '', created_at: '' });
  ledger.transition(a.task_id, 'accepted');
  assert.equal(ledger.getTask(b.task_id).status, 'ready');
  assert.ok(ledger.entries.some((e) => e.kind === 'ownership' && e.detail['to'] === 'agent-1'));
});

test('task ceiling cannot exceed run ceiling; budgets are hard', () => {
  const { ledger, run } = setup();
  assert.throws(() => ledger.addTask({ run_id: run.run_id, type: 'x', budget: { max_tokens: 1, max_usd: 1 }, risk_tier_ceiling: 3 }), /exceeds run ceiling/);
  const t = ledger.addTask({ run_id: run.run_id, type: 'x', budget: { max_tokens: 100, max_usd: 0.01 } });
  ledger.claim(t.task_id, 'a');
  const r = ledger.addSpend(t.task_id, 10, 0.02);
  assert.ok(r.task_fraction > 1);
  assert.equal(ledger.getTask(t.task_id).status, 'failed');
});

test('illegal transitions are rejected', () => {
  const { ledger, run } = setup();
  const t = ledger.addTask({ run_id: run.run_id, type: 'x', budget: { max_tokens: 100, max_usd: 1 } });
  assert.throws(() => ledger.transition(t.task_id, 'accepted'), /illegal transition ready → accepted/);
});
