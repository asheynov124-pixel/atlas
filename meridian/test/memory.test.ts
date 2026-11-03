import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventStream } from '../src/core/events.js';
import { EpisodicStore, makePointer, parsePointer } from '../src/memory/episodic.js';
import { WorkingWindow } from '../src/memory/working.js';
import { SemanticGraph } from '../src/memory/graph.js';
import { HybridRetriever } from '../src/memory/retrieval.js';
import { exportBundle } from '../src/memory/export.js';

test('pointers resolve in one hop; quotes verify; L2 is append-only', () => {
  const l2 = new EpisodicStore();
  const ptr = l2.append({ run_id: 'r1', turn_id: 't1', role: 'tool', text: 'Total revenues of $412.0 million for FY25.', trusted: false, source: '10-K p.47' });
  assert.deepEqual(parsePointer(ptr), { run_id: 'r1', turn_id: 't1', start: 0, end: 42 });
  assert.equal(l2.resolve(makePointer('r1', 't1', 6, 14))?.text, 'revenues');
  assert.equal(l2.resolve('ep:r1/t1/chars_0-999'), null);
  assert.equal(l2.resolve('garbage'), null);
  assert.ok(l2.verifyQuote(ptr, '$412.0 million'));
  assert.ok(!l2.verifyQuote(ptr, '$999 million'));
  assert.throws(() => l2.append({ run_id: 'r1', turn_id: 't1', role: 'tool', text: 'x', trusted: false }), /append-only/);
});

test('streaming compaction is lossless: every summary sentence carries a resolvable pointer and pinned rules survive', async () => {
  const events = new EventStream();
  const l2 = new EpisodicStore();
  const w = new WorkingWindow('r2', l2, events, undefined, 400, 0.55);
  w.pin('RULE: never send without approval.');
  for (let i = 0; i < 12; i++) await w.addTurn('assistant', `Turn ${i} concluded that item ${i} is fine. Extra detail about item ${i} follows here.`);
  assert.ok(w.compactions.length >= 1, 'compaction happened');
  const view = w.view();
  assert.equal(view[0]?.kind, 'pinned');
  const summaries = view.filter((s) => s.kind === 'summary');
  assert.ok(summaries.length >= 1);
  for (const s of summaries) {
    for (const line of s.text.split('\n')) assert.match(line, /\[\[ep:[^\]]+\]\]/);
    for (const p of s.pointers) assert.ok(l2.resolve(p), `pointer ${p} resolves`);
  }
  assert.equal(l2.forRun('r2').length, 12, 'verbatim turns all still in L2');
  assert.ok(events.history.some((e) => e.event === 'compaction.boundary'));
  assert.ok(w.utilization() < 1);
});

test('L3 quarantines claims whose evidence does not verify, detects contradictions, and honors litigation holds', () => {
  const events = new EventStream();
  const l2 = new EpisodicStore();
  const l3 = new SemanticGraph(l2, events);
  const ptr = l2.append({ run_id: 'r3', turn_id: 't1', role: 'tool', text: 'Headcount at year end was 2,100 employees.', trusted: false }, 'ws1');
  const bad = l3.stage({ entity: 'Acme', attribute: 'headcount', value: '9999', confidence: 0.9, evidence: [{ pointer: ptr, quote: '9999 employees' }], valid_from: '2026-10-01', run_id: 'r3' });
  assert.ok(bad.quarantined && !bad.promoted);
  assert.match(bad.quarantined!.reason, /quote does not match/);
  assert.ok(events.history.some((e) => e.event === 'memory.quarantined'));
  const injected = l3.stage({ entity: 'Acme', attribute: 'headcount', value: '5', confidence: 0.9, evidence: [], valid_from: '2026-10-01', run_id: 'r3' });
  assert.match(injected.quarantined!.reason, /no evidence pointer/);

  const good = l3.stage({ entity: 'Acme', attribute: 'headcount', value: '2100', confidence: 0.9, evidence: [{ pointer: ptr, quote: '2,100 employees' }], valid_from: '2020-01-01', run_id: 'r3' });
  assert.ok(good.promoted);
  const ptr2 = l2.append({ run_id: 'r3', turn_id: 't2', role: 'tool', text: 'Employees: 1,850 as of Q2.', trusted: false }, 'ws1');
  const other = l3.stage({ entity: 'Acme', attribute: 'headcount', value: '1850', confidence: 0.8, evidence: [{ pointer: ptr2, quote: '1,850' }], valid_from: '2020-01-01', run_id: 'r3' });
  assert.equal(other.promoted?.status, 'contested');
  assert.equal(l3.contested().length, 2);

  good.promoted!.utility = 0;
  other.promoted!.utility = 0;
  const hold = l2.placeHold({ workspace_id: 'ws1' }, 'Acme v. Zeta discovery', 'counsel');
  l3.reconcile(good.promoted!.id, [other.promoted!.id]);
  let f = l3.forget(30, 0.5);
  assert.deepEqual(f.demoted, []);
  assert.deepEqual(f.held, [good.promoted!.id]);
  l2.releaseHold(hold.id);
  f = l3.forget(30, 0.5);
  assert.deepEqual(f.demoted, [good.promoted!.id]);
  assert.equal(l2.forRun('r3').length, 2, 'forgetting never deletes L2');
  const bundle = exportBundle(l2, l3);
  assert.ok(bundle.includes('"kind":"quarantined"'));
});

test('hybrid retrieval returns pointers within budget and fuses graph hits', async () => {
  const l2 = new EpisodicStore();
  const l3 = new SemanticGraph(l2, new EventStream());
  const p = l2.append({ run_id: 'r4', turn_id: 't1', role: 'tool', text: 'Acme Corp total revenues of $412.0 million.', trusted: false });
  l2.append({ run_id: 'r4', turn_id: 't2', role: 'tool', text: 'Weather in Newark was mild.', trusted: false });
  l2.append({ run_id: 'r4', turn_id: 't3', role: 'assistant', text: 'Decision: normalize Acme to calendar-year basis.', trusted: true });
  l3.stage({ entity: 'Acme Corp', attribute: 'revenue', value: '412', confidence: 0.9, evidence: [{ pointer: p, quote: '$412.0 million' }], valid_from: '2026-09-01', run_id: 'r4' });
  const r = await new HybridRetriever(l2, l3).retrieve({ query: 'Acme revenue', entities: ['Acme Corp'], max_tokens: 40 });
  assert.equal(r.spans[0]?.pointer, p);
  assert.ok(r.packed_tokens <= 40);
  assert.equal(r.claims.length, 1);
  assert.ok(r.spans.every((s) => s.pointer.startsWith('ep:')));
});
