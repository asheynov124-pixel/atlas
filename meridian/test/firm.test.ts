import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app/main.js';

type J = { status: number; body: any; headers: Headers };

class Client {
  cookie = '';
  matter = '';
  constructor(readonly base: string) {}
  async req(path: string, init: { method?: string; body?: unknown; raw?: Buffer; headers?: Record<string, string> } = {}): Promise<J> {
    const r = await fetch(this.base + path, {
      method: init.method ?? (init.body !== undefined || init.raw ? 'POST' : 'GET'),
      headers: { ...(init.raw ? { 'content-type': 'application/octet-stream' } : { 'content-type': 'application/json' }), ...(this.cookie ? { cookie: this.cookie } : {}), ...(this.matter ? { 'x-matter': this.matter } : {}), ...(init.headers ?? {}) },
      body: init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0]!;
    const ct = r.headers.get('content-type') ?? '';
    return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text(), headers: r.headers };
  }
}

const open: Array<() => Promise<void>> = [];
async function boot(dataDir: string) {
  const app = await buildApp({ MERIDIAN_DATA: dataDir, MERIDIAN_WATCH: 'off' });
  await new Promise<void>((res) => app.server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  let stopped = false;
  const stop = async () => { if (stopped) return; stopped = true; app.server.closeAllConnections(); app.server.close(); await app.firm.close(); };
  open.push(stop);
  return { ...app, base, stop };
}
test.afterEach(async () => { while (open.length) await open.pop()!().catch(() => {}); });
const until = async (pred: () => Promise<boolean>, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return; await new Promise((r) => setTimeout(r, 40)); } throw new Error('timeout'); };
async function runToEnd(c: Client, body: Record<string, unknown>): Promise<any> {
  const r = await c.req('/v1/runs', { body });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  const id = r.body.run_id as string;
  await until(async () => ['completed', 'failed', 'paused', 'awaiting_plan_approval'].includes((await c.req(`/v1/runs/${id}`)).body.status));
  return (await c.req(`/v1/runs/${id}`)).body;
}

test('firm: setup, sign-in, roles, ethical screens, deadlines through the approval gate, audit chain, permanence across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'meridian-'));
  let app = await boot(dir);
  const admin = new Client(app.base);
  assert.equal((await admin.req('/v1/session')).body.setup_needed, true);
  assert.equal((await admin.req('/v1/state')).status, 401, 'no session, no matter');
  const s = await admin.req('/v1/setup', { body: { email: 'adelin@example.com', name: 'Adelin', password: 'correct horse battery' } });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal((await admin.req('/v1/setup', { body: { email: 'x@example.com', name: 'X', password: 'correct horse battery' } })).status, 409);
  admin.matter = s.body.matters[0].id;

  const st = (await admin.req('/v1/state')).body;
  assert.equal(st.docs.length, 10);
  assert.ok(st.docs.find((d: any) => d.bates_first === 'HARBOR_000401'));
  const due = (t: string) => st.deadlines.find((d: any) => d.title.startsWith(t))?.due;
  assert.equal(due('Answer to complaint'), '2026-04-24');
  assert.equal(due('Serve reply on summary judgment'), '2026-06-29');
  assert.equal(due('Section 12.1'), '2026-04-29');
  const contract = st.deadlines.find((d: any) => d.title.startsWith('Section 12.1'));
  assert.ok(contract.math.steps.some((x: any) => /matches the date stated/.test(x.text)), 'contract clock cross-checked against the memo');
  assert.match(contract.trigger.cite, /HARBOR_000402/, 'trigger proven by the notice of defect itself');

  // An associate cannot approve a Tier 3 calendar entry; a partner can.
  await admin.req('/v1/users', { body: { email: 'assoc@example.com', name: 'Avery', role: 'associate', password: 'associate password' } });
  const partnerRes = await admin.req('/v1/users', { body: { email: 'partner@example.com', name: 'Pat', role: 'partner', password: 'partner password' } });
  const users = (await admin.req('/v1/users')).body as any[];
  const assocId = users.find((u) => u.email === 'assoc@example.com').id;
  await admin.req(`/v1/matters/${admin.matter}/members`, { body: { user_id: assocId } });
  await admin.req(`/v1/matters/${admin.matter}/members`, { body: { user_id: partnerRes.body.id } });
  const assoc = new Client(app.base);
  await assoc.req('/v1/login', { body: { email: 'assoc@example.com', password: 'associate password' } });
  assoc.matter = admin.matter;
  const appr = st.approvals.find((a: any) => a.action === 'calendar.add_deadline' && a.target.title.startsWith('Answer'));
  const denied = await assoc.req(`/v1/approvals/${appr.approval_id}/decide`, { body: { decision: 'approve' } });
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /partner/);
  const partner = new Client(app.base);
  await partner.req('/v1/login', { body: { email: 'partner@example.com', password: 'partner password' } });
  partner.matter = admin.matter;
  const ok = await partner.req(`/v1/approvals/${appr.approval_id}/decide`, { body: { decision: 'approve', reviewer: { id: 'spoof', roles: ['workspace:owner'] } } });
  assert.equal(ok.body.status, 'approved');
  assert.equal(ok.body.payload.decided_by, partnerRes.body.id, 'reviewer comes from the session, not the body');
  const ics = await partner.req('/v1/deadlines/calendar.ics');
  assert.match(ics.body, /DTSTART;VALUE=DATE:20260424/);

  // Ethical screen: the associate loses access, and the attempt is audited.
  await admin.req(`/v1/matters/${admin.matter}/screens`, { body: { user_id: assocId, reason: 'Former client of lateral hire' } });
  assert.equal((await assoc.req('/v1/state')).status, 403);
  assert.equal((await admin.req(`/v1/matters/${admin.matter}/members`, { body: { user_id: assocId } })).status, 409, 'cannot re-add a screened person');
  const audit = (await admin.req(`/v1/audit?matter=${admin.matter}`)).body;
  assert.ok(audit.chain.ok);
  for (const a of ['screen.placed', 'screen.blocked_access', 'approval.decided', 'deadline.proposed', 'doc.ingested']) assert.ok(audit.rows.some((r: any) => r.action === a), a);
  const decided = audit.rows.find((r: any) => r.action === 'approval.decided');
  assert.ok(JSON.parse(decided.detail).payload_as_seen.preview.includes('R. 1:3-1'), 'what the partner saw is in the audit trail');
  const csv = await admin.req(`/v1/audit?format=csv&matter=${admin.matter}`);
  assert.match(csv.body, /^seq,at,matter_id,actor,action,detail,hash/);

  // A review run, then a restart: everything comes back.
  const run = await runToEnd(admin, { goal: 'Review every document and build a chronology', template: 'review' });
  assert.equal(run.status, 'completed');
  assert.ok(run.artifacts[0].provenance.some((p: any) => /HARBOR_00040\d, p\. \d/.test(p.cite ?? '')), 'record cites in provenance');
  const claimsBefore = (await admin.req('/v1/memory/claims')).body.claims.length;
  assert.ok(claimsBefore > 5);
  const hold = await admin.req('/v1/memory/hold', { body: { reason: 'Preservation letter' } });
  assert.equal(hold.status, 201);
  await app.stop();

  app = await boot(dir);
  const again = new Client(app.base);
  again.cookie = admin.cookie; again.matter = admin.matter;
  const st2 = (await again.req('/v1/state')).body;
  assert.equal(st2.runs.length, 1);
  assert.equal(st2.runs[0].status, 'completed');
  assert.equal(st2.memory.claims, claimsBefore);
  assert.equal(st2.memory.holds.length, 1);
  assert.ok((await again.req('/v1/audit/verify')).body.ok);
  // Tampering with any audit row breaks the chain.
  app.firm.db.prepare("UPDATE audit SET detail = '{}' WHERE action = 'screen.placed'").run();
  assert.equal((await again.req('/v1/audit/verify')).body.ok, false);
  await app.stop();
  await rm(dir, { recursive: true, force: true });
});

test('workflows: SUMF cite-check findings, simulator tripwires on a new production, research memo, drafts, quote bank, workflow creator', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'meridian-'));
  const app = await boot(dir);
  const c = new Client(app.base);
  const s = await c.req('/v1/setup', { body: { email: 'a@example.com', name: 'A', password: 'correct horse battery' } });
  c.matter = s.body.matters[0].id;

  const sumf = await runToEnd(c, { goal: 'Cite-check the statement of material facts' });
  assert.equal(sumf.template, 'sumf');
  assert.equal(sumf.status, 'completed', JSON.stringify(sumf.ledger));
  const t = sumf.artifacts[0].text as string;
  assert.match(t, /¶5 · Contradicted by its own cite/);
  assert.match(t, /¶6 · Contradicted by its own cite[\s\S]*?postmarked January 5, 2026[\s\S]*?different event/);
  assert.match(t, /¶7 · No record citation/);
  assert.match(t, /¶8 · Cannot verify yet/);
  assert.match(t, /¶2 · Partly supported[\s\S]*?Widen the cite to HARBOR_000401, p\. 1, ll\. 2–3/);
  assert.match(t, /¶1 · Supported[\s\S]*?attorney document/);

  const sim = await runToEnd(c, { goal: 'Run the opposing counsel simulator on 04-draft-sumf.txt' });
  assert.equal(sim.template, 'simulate');
  assert.equal(sim.status, 'completed');
  assert.match(sim.artifacts[0].text, /# Vulnerability map/);
  assert.match(sim.artifacts[0].text, /mailroom log shows receipt on January 8, 2026/);
  const contradicting = Buffer.from('From: d.okafor@cinderfreight.example\nDate: April 2, 2026\nSubject: Section 9.2\n\nCinder did not receive Harbor\'s written notice of the defect until February 3, 2026, outside the window required by Section 9.2.\n');
  const up = await c.req('/v1/docs/upload?name=08-cinder-april-letter.eml', { raw: contradicting });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.ok(up.body.tripwires.some((x: any) => x.paragraph === 4), `tripwire on ¶4: ${JSON.stringify(up.body.tripwires)}`);

  const memo = await runToEnd(c, { goal: 'What is the standard for summary judgment in New Jersey? Write a research memo', template: 'research' });
  assert.equal(memo.status, 'completed', JSON.stringify(memo.tasks.filter((x: any) => x.status !== 'accepted')));
  assert.match(memo.artifacts[0].text, /Brill, 142 N\.J\. at 540/);
  assert.match(memo.artifacts[0].text, /## Adverse authority/);
  assert.ok(memo.artifacts[0].provenance.some((p: any) => p.cite === 'Brill, 142 N.J. at 540'));

  // Research database and quote bank.
  const search = (await c.req('/v1/research/search', { body: { query: 'motion to dismiss failure to state a claim' } })).body;
  assert.equal(search.results[0].short_name, 'Printing Mart');
  assert.ok(search.trace.length >= 5);
  const bad = await c.req('/v1/research/quotes', { body: { case_id: 'cl:2381317', text: 'the motion judge must weigh credibility' } });
  assert.equal(bad.status, 422);
  const good = await c.req('/v1/research/quotes', { body: { case_id: 'cl:2381317', text: 'Credibility determinations will continue to be made by a jury and not the judge', proposition: 'Credibility is for the jury' } });
  assert.equal(good.body.short, 'Brill, 142 N.J. at 540');

  // Drafts: a wrong pin and a fabricated quote are caught.
  const d = (await c.req('/v1/drafts', { body: { title: 'Opposition brief', body: `<p><span class="cite law" data-case="cl:2381317" data-pin="523">“Credibility determinations will continue to be made by a jury and not the judge” Brill, 142 N.J. at 523.</span> And “the court must accept every inference” Printing Mart, 116 N.J. at 746.</p>` } })).body;
  const v = (await c.req(`/v1/drafts/${d.id}/verify`, { body: {} })).body;
  assert.equal(v.checks.find((x: any) => x.kind === 'law').status, 'wrong_pin');
  assert.equal(v.checks.find((x: any) => x.kind === 'law').expected, 'Brill, 142 N.J. at 540');
  assert.equal(v.checks.find((x: any) => x.kind === 'typed').status, 'not_verbatim');
  const doc = await c.req(`/v1/drafts/${d.id}/export.doc`);
  assert.match(doc.headers.get('content-type') ?? '', /msword/);

  // Workflow creator: design from a description, save, run.
  const lib = (await c.req('/v1/workflows')).body;
  assert.ok(lib.examples.length >= 8 && lib.community.length >= 2 && lib.builtins.length >= 10);
  assert.ok(lib.recommendations.some((r: any) => /material facts/i.test(r.name)));
  const designed = (await c.req('/v1/workflows/design', { body: { description: 'For each document, list every date the shipment was handled with a cite, then build a table of the handling timeline.' } })).body;
  assert.equal(designed.def.steps[0].kind, 'per_document');
  assert.equal(designed.def.steps.at(-1).output, 'table');
  const invalid = await c.req('/v1/workflows', { body: { ...designed.def, steps: [{ ...designed.def.steps[0], tools: ['shell.run'] }] } });
  assert.equal(invalid.status, 422);
  const saved = (await c.req('/v1/workflows', { body: designed.def })).body;
  assert.ok(saved.workflow.id);
  const custom = await runToEnd(c, { goal: 'Build the handling timeline', template: saved.workflow.id });
  assert.equal(custom.status, 'completed', JSON.stringify(custom.tasks.filter((x: any) => x.status !== 'accepted').map((x: any) => x.critique)));
  await app.stop();
  await rm(dir, { recursive: true, force: true });
});
