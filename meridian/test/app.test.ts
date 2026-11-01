import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app/main.js';
import type { AddressInfo } from 'node:net';

async function withApp(fn: (base: string) => Promise<void>) {
  const { server } = await buildApp({ MERIDIAN_WORKSPACE: new URL('../workspace', import.meta.url).pathname });
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  try { await fn(base); } finally { server.close(); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const j = async (url: string, init?: RequestInit): Promise<{ status: number; body: any }> => { const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init }); return { status: r.status, body: await r.json() }; };
const until = async (pred: () => Promise<boolean>, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return; await new Promise((r) => setTimeout(r, 50)); } throw new Error('timeout'); };

test('app: state, delegate a review over the sample matter, answer from memory with pointers', async () => {
  await withApp(async (base) => {
    const state = (await j(`${base}/v1/state`)).body;
    assert.equal(state.workspace.provider, 'Mock fleet (no API key)');
    assert.ok(state.files.length >= 3, 'sample matter files listed');
    assert.ok(state.templates.some((t: { name: string }) => t.name === 'review'));

    const ask = await j(`${base}/v1/ask`, { method: 'POST', body: JSON.stringify({ text: 'Review every document in the matter and build a sourced chronology' }) });
    assert.equal(ask.status, 200);
    assert.equal(ask.body.reply.meta.intent, 'agentic');
    const run_id = ask.body.reply.run_id as string;
    await until(async () => (await j(`${base}/v1/runs/${run_id}`)).body.status === 'completed');
    const detail = (await j(`${base}/v1/runs/${run_id}`)).body;
    assert.equal(detail.ledger.accepted, detail.ledger.total, JSON.stringify(detail.ledger));
    const art = detail.artifacts[0];
    assert.ok(art.text.includes('# Chronology'));
    assert.ok(/2026-01-22/.test(art.text), 'shipment date extracted');
    assert.ok(art.provenance.length >= 10, `provenance markers: ${art.provenance.length}`);
    for (const p of art.provenance.slice(0, 5)) {
      const span = await j(`${base}/v1/memory/spans/${encodeURIComponent(p.pointer)}`);
      assert.equal(span.status, 200, p.pointer);
      assert.ok(span.body.text.length > 0);
    }

    const q = await j(`${base}/v1/ask`, { method: 'POST', body: JSON.stringify({ text: 'What is the mediation deadline?' }) });
    assert.notEqual(q.body.reply.meta.intent, 'agentic');
    assert.match(q.body.reply.text, /April 29, 2026|2026-04-29/);
    assert.ok(q.body.reply.meta.evidence_ok, `answer carries resolvable pointers: ${q.body.reply.text}`);

    const hold = await j(`${base}/v1/memory/hold`, { method: 'POST', body: JSON.stringify({ run_id, reason: 'preservation notice' }) });
    assert.equal(hold.status, 201);
    assert.equal((await j(`${base}/v1/state`)).body.memory.holds.length, 1);
    assert.equal((await j(`${base}/v1/state`)).body.conversation.length, 4);
  });
});

test('app: planning checkpoint + Tier 3 approval round-trip through the API', async () => {
  await withApp(async (base) => {
    // The diligence template is mock-only; a goal that mentions sending mail still routes to a template, so exercise the inbox directly through a run that calls mail.send.
    const run = await j(`${base}/v1/runs`, { method: 'POST', body: JSON.stringify({ goal: 'Prepare a comparative diligence memo on the 40 companies in list_7', template: 'diligence', budget: { max_usd: 60 } }) });
    assert.equal(run.status, 202);
    await until(async () => (await j(`${base}/v1/runs/${run.body.run_id}`)).body.status === 'completed', 15000);
    const tel = await j(`${base}/v1/approvals/telemetry?action=mail.send&min=1`);
    assert.equal(tel.body.items, 0);
    const trace = await j(`${base}/v1/runs/${run.body.run_id}/trace`);
    assert.ok(trace.body.ledger.length > 100 && trace.body.gate_audit.length >= 40);
    const notFound = await j(`${base}/v1/memory/spans/${encodeURIComponent('ep:nope/x/chars_0-1')}`);
    assert.equal(notFound.status, 404);
  });
});

test('app: reply workflow → planning checkpoint → Tier 3 approval → resume → completed', async () => {
  await withApp(async (base) => {
    const seed = await j(`${base}/v1/ask`, { method: 'POST', body: JSON.stringify({ text: 'Review every document in the matter and build a sourced chronology' }) });
    await until(async () => (await j(`${base}/v1/runs/${seed.body.reply.run_id}`)).body.status === 'completed');
    const ask = await j(`${base}/v1/ask`, { method: 'POST', body: JSON.stringify({ text: 'Send a reply to d.okafor@cinderfreight.example about the February 18 call' }) });
    assert.equal(ask.body.reply.meta.intent, 'agentic');
    assert.deepEqual(ask.body.reply.meta.anticipated_tier3, ['mail.send']);
    const run_id = ask.body.reply.run_id as string;
    assert.equal((await j(`${base}/v1/runs/${run_id}`)).body.status, 'awaiting_plan_approval');
    await j(`${base}/v1/runs/${run_id}/approve-plan`, { method: 'POST', body: JSON.stringify({}) });
    await until(async () => (await j(`${base}/v1/runs/${run_id}`)).body.status === 'paused');
    const pending = (await j(`${base}/v1/approvals`)).body;
    assert.equal(pending.length, 1);
    const p = pending[0];
    assert.equal(p.action, 'mail.send');
    assert.deepEqual(p.target, ['d.okafor@cinderfreight.example']);
    assert.ok(p.evidence_refs.length >= 1, 'draft cites memory');
    await j(`${base}/v1/approvals/${p.approval_id}/open`, { method: 'POST', body: JSON.stringify({}) });
    const d = await j(`${base}/v1/approvals/${p.approval_id}/decide`, { method: 'POST', body: JSON.stringify({ decision: 'edit', edited_preview: p.diff.preview.replace('Thank you', 'Thanks') }) });
    assert.equal(d.body.status, 'approved');
    assert.match(d.body.executed.text, /^sent to/);
    await until(async () => (await j(`${base}/v1/runs/${run_id}`)).body.status === 'completed');
    const detail = (await j(`${base}/v1/runs/${run_id}`)).body;
    assert.equal(detail.ledger.accepted, 1);
    assert.equal((await j(`${base}/v1/approvals`)).body.length, 0);
    const tel = (await j(`${base}/v1/approvals/telemetry?action=mail.send&min=1`)).body;
    assert.equal(tel.items, 1);
    assert.equal(tel.override_rate, 1);
  });
});
