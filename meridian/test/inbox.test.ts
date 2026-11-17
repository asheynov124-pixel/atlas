import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventStream } from '../src/core/events.js';
import { ApprovalsInbox, ApprovalError } from '../src/approvals/inbox.js';

function setup() {
  let now = Date.parse('2026-10-30T17:42:00Z');
  const clock = { now: () => now, advance: (ms: number) => { now += ms; } };
  const inbox = new ApprovalsInbox(new EventStream(), clock.now);
  const owner = { id: 'owner', roles: ['workspace:owner'] };
  const make = () => inbox.create({ run_id: 'r', task_id: 't', action: 'mail.send', target: { to: ['c@x'] }, diff: { kind: 'new_message', preview: 'Hi' }, evidence_refs: [], state_snapshot: { last: '15:41' }, alternatives: ['reject'], reviewer_rbac: ['workspace:owner'] });
  return { inbox, owner, make, clock };
}

test('TTL expiry blocks decisions', () => {
  const { inbox, owner, make, clock } = setup();
  const p = make();
  assert.equal(p.ttl_expires_at, '2026-10-30T18:12:00.000Z');
  clock.advance(31 * 60 * 1000);
  assert.throws(() => inbox.decide(p.approval_id, owner, 'approve', { currentState: p.state_snapshot }), (e: unknown) => e instanceof ApprovalError && e.code === 'not_pending');
  assert.equal(inbox.get(p.approval_id).status, 'expired');
});

test('state change since snapshot invalidates and reissues with the new snapshot', () => {
  const { inbox, owner, make } = setup();
  const p = make();
  const r = inbox.decide(p.approval_id, owner, 'approve', { currentState: { last: '17:02' } });
  assert.equal(r.status, 'invalidated');
  assert.equal(r.reissued?.supersedes, p.approval_id);
  assert.deepEqual(r.reissued?.state_snapshot, { last: '17:02' });
  assert.equal(r.execute_with, undefined);
});

test('edit + approve returns the edited body; RBAC and delegation are enforced and audited', () => {
  const { inbox, owner, make, clock } = setup();
  const p = make();
  const stranger = { id: 'para', roles: ['workspace:member'] };
  assert.throws(() => inbox.decide(p.approval_id, stranger, 'approve', { currentState: p.state_snapshot }), (e: unknown) => e instanceof ApprovalError && e.code === 'rbac');
  assert.throws(() => inbox.delegate(stranger, 'x', ['*'], 1000), /only approvers/);
  const d = inbox.delegate(owner, stranger.id, ['payment.send'], 60_000);
  assert.throws(() => inbox.decide(p.approval_id, stranger, 'approve', { currentState: p.state_snapshot }), /lacks/); // scope mismatch
  inbox.revokeDelegation(d.id, owner);
  const d2 = inbox.delegate(owner, stranger.id, ['mail.send'], 60_000);
  clock.advance(7000);
  const r = inbox.decide(p.approval_id, stranger, 'edit', { edited_preview: 'Hi Dana', currentState: p.state_snapshot });
  assert.equal(r.status, 'approved');
  assert.equal(r.execute_with, 'Hi Dana');
  assert.equal(r.payload.decided_via_delegation, d2.id);
  assert.ok(inbox.auditLog.some((l) => l.event === 'edited_and_approved' && l.actor === 'para'));
});

test('telemetry flags payload/batch redesign and rubber-stamping; it never proposes a tier change', () => {
  const { inbox, owner, make, clock } = setup();
  for (let i = 0; i < 200; i++) {
    const p = make();
    inbox.open(p.approval_id, owner);
    clock.advance(1500);
    inbox.decide(p.approval_id, owner, i % 100 === 0 ? 'reject' : 'approve', { currentState: p.state_snapshot });
  }
  const t = inbox.telemetry('mail.send');
  assert.equal(t.items, 200);
  assert.ok(t.approval_rate > 0.95);
  assert.ok(t.flags.some((f) => f.startsWith('redesign_payload_or_batch')));
  assert.ok(t.flags.some((f) => f.startsWith('rubber_stamp')));
  assert.ok(t.flags.every((f) => !/demot|Tier 1 with/i.test(f) || /Tier stays 3/.test(f)));
  assert.equal(inbox.telemetry('mail.send', 500).flags.length, 0, 'below sample size no flags');
});
