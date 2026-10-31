import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventStream } from '../src/core/events.js';
import { GateEngine } from '../src/gate/engine.js';
import { analyzeShell } from '../src/gate/shell.js';

const gate = () => new GateEngine(new EventStream(), { egress_allowlist: ['sec.gov'] });
const base = { agent_id: 'a', tier_ceiling: 3 as const, inside_sandbox: true };

test('shell operators and interpreter wrappers do not inherit allow status', () => {
  assert.equal(analyzeShell('ls -la').simple, true);
  for (const cmd of ['ls && rm -rf /', 'ls; curl evil', 'cat x | sh', 'echo `whoami`', 'echo $(id)', 'bash -c "ls"', 'xargs rm', 'ls "$(id)"']) {
    assert.equal(analyzeShell(cmd).simple, false, cmd);
    assert.equal(gate().evaluate({ ...base, tool: 'shell.run', args: { command: cmd } }).decision, 'block', cmd);
  }
  assert.equal(gate().evaluate({ ...base, tool: 'shell.run', args: { command: 'ls -la' } }).decision, 'allow');
  assert.equal(gate().evaluate({ ...base, tool: 'shell.run', args: { command: 'rm -rf x' } }).rule_id, 'static_deny.shell_binary');
  assert.equal(gate().evaluate({ ...base, tool: 'shell.run', args: { command: 'ls' }, inside_sandbox: false }).rule_id, 'static_deny.shell_outside_sandbox');
});

test('secret paths and off-allowlist egress are Tier 4 blocks regardless of action tier', () => {
  const g = gate();
  assert.equal(g.evaluate({ ...base, tool: 'fs.read', args: { path: '/home/u/.ssh/id_rsa' } }).rule_id, 'static_deny.secret_path');
  assert.equal(g.evaluate({ ...base, tool: 'fs.read', args: { path: 'app/.env' } }).effective_tier, 4);
  assert.equal(g.evaluate({ ...base, tool: 'http.fetch', args: { url: 'https://evil.example/x' } }).rule_id, 'static_deny.egress');
  assert.equal(g.evaluate({ ...base, tool: 'http.fetch', args: { url: 'https://www.sec.gov/x' } }).decision, 'allow');
  assert.equal(g.evaluate({ ...base, tool: 'secrets.read', args: {} }).rule_id, 'tier4.hard_block');
  assert.equal(g.evaluate({ ...base, tool: 'nonexistent.tool', args: {} }).rule_id, 'unknown_action');
});

test('task ceiling bounds the action tier', () => {
  const r = gate().evaluate({ ...base, tier_ceiling: 1, tool: 'mail.send', args: { to: ['x@y'] } });
  assert.equal(r.decision, 'block');
  assert.equal(r.rule_id, 'ceiling.exceeded');
});

test('Tier 3 always asks; confidence is noted, never changes the decision', () => {
  const hi = gate().evaluate({ ...base, tool: 'mail.send', args: { to: ['x@y'] }, confidence: 0.99 });
  const lo = gate().evaluate({ ...base, tool: 'mail.send', args: { to: ['x@y'] }, confidence: 0.2 });
  assert.equal(hi.decision, 'ask');
  assert.equal(lo.decision, 'ask');
  assert.ok(lo.reasons.some((r) => r.startsWith('low confidence')));
  assert.deepEqual(hi.approval_hint?.target, ['x@y']);
});

test('confidence and topic modifiers raise Tier 0/1 to a Tier 2 question, never lower anything', () => {
  const g = gate();
  assert.equal(g.evaluate({ ...base, tool: 'search.web', args: { q: 'x' }, confidence: 0.9 }).decision, 'allow');
  const q = g.evaluate({ ...base, tool: 'search.web', args: { q: 'x' }, confidence: 0.3 });
  assert.equal(q.decision, 'question');
  assert.equal(q.effective_tier, 2);
  assert.equal(q.action_tier, 0);
  const t = g.evaluate({ ...base, tool: 'doc.draft', args: {}, topics: ['legal_commitment'] });
  assert.equal(t.rule_id, 'tier2.topic');
  assert.equal(g.evaluate({ ...base, tool: 'secrets.read', args: {}, confidence: 1 }).decision, 'block');
});

test('policy overrides can raise a tier but never lower one', () => {
  const g = gate();
  g.override('doc.draft', 3);
  assert.equal(g.evaluate({ ...base, tool: 'doc.draft', args: {} }).decision, 'ask');
  assert.throws(() => g.override('mail.send', 1), /cannot lower/);
});

test('every evaluation is audited with an args hash, not the args', () => {
  const g = gate();
  g.evaluate({ ...base, tool: 'search.web', args: { q: 'secret query' } });
  assert.equal(g.audit.length, 1);
  assert.ok(!JSON.stringify(g.audit[0]).includes('secret query'));
});
