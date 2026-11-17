import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventStream } from '../src/core/events.js';
import { EpisodicStore } from '../src/memory/episodic.js';
import { SemanticGraph } from '../src/memory/graph.js';
import { HybridRetriever } from '../src/memory/retrieval.js';
import { PlanCache, normalizeIntent } from '../src/fastpath/planCache.js';
import { Router, classify, cascadeCheck, BUDGET_BY_EFFORT } from '../src/fastpath/router.js';

test('intent classification maps to effort and tier', () => {
  assert.equal(classify('hi'), 'trivial');
  assert.equal(classify('what is Acme fiscal year end'), 'lookup');
  assert.equal(classify('why did Acme restate revenue and what are the implications'), 'complex');
  assert.equal(classify('Prepare a comparative diligence memo on the 40 companies in list_7 with sources for every figure'), 'agentic');
});

test('router runs prefetch before classification and sizes retrieval from predicted effort', async () => {
  const l2 = new EpisodicStore();
  const l3 = new SemanticGraph(l2, new EventStream());
  for (let i = 0; i < 30; i++) l2.append({ run_id: 'r', turn_id: `t${i}`, role: 'tool', text: `Acme note ${i}: revenue detail paragraph number ${i} with plenty of words to occupy tokens in the window.`, trusted: false });
  const router = new Router(new HybridRetriever(l2, l3), new PlanCache(), 100);
  const d = await router.route('Prepare a comparative memo on all 40 companies in the list', 'ws-fp');
  assert.equal(d.intent, 'agentic');
  assert.equal(d.effort, 'high');
  assert.equal(d.retrieval_budget_tokens, BUDGET_BY_EFFORT.high);
  assert.ok(d.prefetch.length <= d.working_set.length);
  assert.ok(d.prefetch.reduce((n, s) => n + s.text.length / 4, 0) <= 100 + 30);
  assert.equal(d.plan_cache, 'miss');
  assert.ok(d.timings_ms.prefetch >= 0 && d.timings_ms.retrieve >= 0);
});

test('plan cache stores skeletons, refuses conclusions, and demands re-grounding', () => {
  const c = new PlanCache();
  assert.equal(normalizeIntent('Memo on 40 companies'), normalizeIntent('memo on 12 companies'));
  assert.throws(() => c.put('x', 'ws', { steps: ['Acme revenue was $412M'], tools: [], effort_hint: 'high' }), /refuses conclusions/);
  c.put('Prepare a memo on 40 companies', 'ws', { steps: ['research each', 'extract', 'synthesize'], tools: ['search.web'], effort_hint: 'high' });
  const hit = c.take('prepare a memo on 7 companies', 'ws');
  assert.ok(hit && hit.regrounded === false);
  assert.equal(c.take('prepare a memo on 7 companies', 'other-ws'), null);
});

test('cascade check escalates Fast-tier answers with unsourced factual claims', () => {
  const resolves = (p: string) => p === 'ep:r/t1/chars_0-10';
  assert.deepEqual(cascadeCheck('Acme reported $412M [[ep:r/t1/chars_0-10]]. Thanks for asking.', resolves), { accept: true, unsourced: [] });
  const r = cascadeCheck('Acme reported $412M. Zeta reported $9M [[ep:r/t9/chars_0-10]].', resolves);
  assert.equal(r.accept, false);
  assert.equal(r.unsourced.length, 2);
});
