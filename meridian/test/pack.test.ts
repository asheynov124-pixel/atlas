/**
 * The workflow pack, end to end against the sample matter, offline. Each assertion pins a
 * finding a litigator would care about, so a refactor cannot quietly lose it.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app/main.js';

let base = '';
let cookie = '';
let matter = '';
let stop: () => Promise<void> = async () => {};

async function req(path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const r = await fetch(base + path, { method: body !== undefined ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(matter ? { 'x-matter': matter } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0]!;
  return { status: r.status, body: await r.json().catch(() => null) };
}

/** Run a goal to completion (approving the plan if asked) and return the run with its report text. */
export async function run(goal: string, template?: string): Promise<{ template: string; status: string; text: string; ledger: any }> {
  const r = await req('/v1/runs', { goal, ...(template ? { template } : {}) });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  const id = r.body.run_id as string;
  const t0 = Date.now();
  let d: any;
  while (Date.now() - t0 < 30000) {
    d = (await req(`/v1/runs/${id}`)).body;
    if (d.status === 'awaiting_plan_approval') { await req(`/v1/runs/${id}/approve-plan`, {}); continue; }
    if (['completed', 'failed', 'paused'].includes(d.status)) break;
    await new Promise((x) => setTimeout(x, 40));
  }
  return { template: d.template, status: d.status, text: String(d.artifacts?.[0]?.text ?? ''), ledger: d.ledger };
}

const plain = (s: string) => s.replace(/\[\[ep:[^\]]+\]\]/g, '');

before(async () => {
  const app = await buildApp({ MERIDIAN_DATA: await mkdtemp(join(tmpdir(), 'meridian-pack-')), MERIDIAN_WATCH: 'off' });
  await new Promise<void>((res) => app.server.listen(0, '127.0.0.1', res));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  stop = async () => { app.server.closeAllConnections(); app.server.close(); await app.firm.close(); };
  const s = await req('/v1/setup', { email: 'pack@example.com', name: 'Pack', password: 'correct horse battery' });
  matter = s.body.matters[0].id;
});
after(async () => { await stop(); });

test('Misquote Hunter: catches the altered Brill standard with a word diff, the wrong pin, and the unpublished cite', async () => {
  const r = await run('Run the misquote hunter on Cinder’s opposition brief');
  assert.equal(r.template, 'misquotes');
  assert.equal(r.status, 'completed', JSON.stringify(r.ledger));
  const t = plain(r.text);
  assert.match(t, /Brill, 142 N\.J\. at 540 · Misquoted/);
  assert.match(t, /\*\*reasonable jury\*\* ~~rational factfinder~~/, 'shows exactly which words were changed');
  assert.match(t, /at 523 · Wrong pin cite[\s\S]*?at 540, not at 523/);
  assert.match(t, /Atlas Packaging[\s\S]*?Not in your library/);
  assert.match(t, /Judson, 17 N\.J\. at 77 · Verbatim/);
});

test('Opposing Brief Dissector: half-quoted Judson, Printing Mart posture mismatch, and record contradictions', async () => {
  const r = await run('Dissect the opposing brief');
  assert.equal(r.template, 'dissect');
  assert.equal(r.status, 'completed', JSON.stringify(r.ledger));
  const t = plain(r.text);
  assert.match(t, /Half a sentence\. The same sentence continues: “…and, on the other, not to allow harassment/);
  assert.match(t, /Wrong posture\. Printing Mart decided a motion to dismiss under R\. 4:6-2\(e\)/);
  assert.match(t, /offers no proof of when it was sent[\s\S]*?We received your letter dated January 29, 2026/, 'Cinder’s own email acknowledges the letter it says was never proven sent');
  assert.match(t, /notice received on January 8, 2026, not given on December 15, 2025/, 'dated is not delivered');
  assert.match(t, /passed inspection[\s\S]*?crushed on arrival/);
  assert.doesNotMatch(t, /03-internal-memo|01-engagement-letter/, 'attorney documents are never cited as record evidence');
  assert.match(t, /characterizes Section 11\.4 without quoting it/);
});

test('Unpublished Opinion Gatekeeper: applies R. 1:36-3 to their brief and clears ours', async () => {
  const r = await run('Check all the briefs for unpublished opinions');
  assert.equal(r.template, 'unpublished');
  assert.equal(r.status, 'completed', JSON.stringify(r.ledger));
  const t = plain(r.text);
  assert.match(t, /one unpublished opinion cited across two briefs/);
  assert.match(t, /08-harbor-moving-brief\.txt \(ours\)\n- No unpublished opinions cited/);
  assert.match(t, /Nothing in the brief says a copy was served/);
  assert.match(t, /not precedent and binds no court/);
});

test('Reply Gap Finder: our Point IV went unanswered; ignored record and the new consequential-damages argument are flagged', async () => {
  const r = await run('Find the reply gaps: what did they not respond to?');
  assert.equal(r.template, 'reply_gaps');
  assert.equal(r.status, 'completed', JSON.stringify(r.ledger));
  const t = plain(r.text);
  assert.match(t, /\| IV \| CINDER'S DELIVERY RECEIPT\. \| Unanswered \|/);
  assert.match(t, /\| I \| [^|]+ \| Answered, but ignores our evidence \|/);
  assert.match(t, /never mentions HARBOR_000403/);
  assert.match(t, /Cinder does not respond to Point IV/);
  assert.match(t, /Point IV \(HARBOR'S COUNTERCLAIM FOR CONSEQUENTIAL DAMAGES[^)]*\) answers nothing in our brief/);
});

test('Responding Statement Builder: every denial is cited; legal conclusions, missing certifications and self-contradicting cites are caught', async () => {
  const r = await run('Draft our responding statement to Cinder’s statement of material facts');
  assert.equal(r.template, 'responding');
  assert.equal(r.status, 'completed', JSON.stringify(r.ledger));
  const t = plain(r.text);
  assert.match(t, /^1\. Admitted only that the notice is dated December 15, 2025\. Denied that notice was given on that date\. The record shows: .*HARBOR_000403/m);
  assert.match(t, /^4\. Denied\. .*“waived” is a legal conclusion/m);
  assert.match(t, /^6\. Denied\. It rests on Okafor Cert\. ¶ 7, which is not in the motion record/m);
  assert.match(t, /^7\. Denied\. Cinder’s own cited document says otherwise: “We received your letter dated January 29, 2026\.”/m);
  assert.match(t, /## Additional material facts in genuine dispute[\s\S]*postmarked January 5, 2026/);
  assert.doesNotMatch(t, /03-internal-memo|01-engagement-letter/);
});

test('existing workflows still pick their own documents with the new briefs in the matter', async () => {
  const sumf = await run('Cite-check the statement of material facts');
  assert.equal(sumf.template, 'sumf');
  assert.match(plain(sumf.text), /^# Cite-check: 04-draft-sumf\.txt/m);
});
