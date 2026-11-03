import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pinFor, verifyQuote, opinionHtmlToText, fullCite, shortCite, extractCitations } from '../src/research/cites.js';
import { RULES, ruleById, compute, computeContract, njCourtHolidays } from '../src/deadlines/rules.js';
import { findTriggers } from '../src/deadlines/triggers.js';
import { toIcs } from '../src/deadlines/ics.js';
import { EpisodicStore } from '../src/memory/episodic.js';
import { DocumentIndex } from '../src/ingest/documents.js';
import { EventStream } from '../src/core/events.js';
import { TaskLedger } from '../src/ledger/ledger.js';
import { stripCitationNoise } from '../src/kernel/grader.js';

const PDF = new URL('../workspace/sample-matter/05-harbor-production.pdf', import.meta.url).pathname;

test('pin cites follow star pagination and Bluebook ranges; quotes verify with ellipses and fail when altered', () => {
  const t = '[*539] Consistent with this trend, trial [*540] courts are required to sift. The trial court should not hesitate to grant summary judgment. immedi[*541]ate relief by a long and worthless trial.';
  const i = t.indexOf('courts are');
  assert.equal(pinFor(t, i, i + 10, 520), '540');
  const j = t.indexOf('immedi');
  assert.equal(pinFor(t, j, t.length, 520), '540-41');
  assert.equal(pinFor('[*98] a [*102] b', 0, 15, 98), '98-102');
  const v = verifyQuote(t, 'immediate relief by a long and worthless trial');
  assert.ok(v.ok && v.exact, 'star markers inside a word are transparent to verification');
  assert.equal(pinFor(t, v.start, v.end, 520), '540-41', 'the quotation begins on 540 and ends on 541');
  assert.ok(verifyQuote(t, '“courts are required … should not hesitate to grant”').ok, 'ellipsis segments in order');
  assert.ok(!verifyQuote(t, 'courts are permitted to sift').ok);
  assert.ok(!verifyQuote(t, 'should not hesitate … courts are required').ok, 'segments out of order fail');
});

test('CourtListener HTML keeps star pages; citations format for New Jersey courts', () => {
  const html = '<p id="b1">grant summary judgment when “the pleadings, depositions, answers to interrogatories\n  <span citation-index="1" class="star-pagination" label="529"> \n   *529\n   </span>\n  and admissions on file”</p><p>pro<page-number citation-index="1" label="74">*74</page-number>cedural</p>';
  const text = opinionHtmlToText(html);
  assert.match(text, /interrogatories \[\*529\] and admissions/);
  assert.match(text, /pro\[\*74\]cedural/);
  const k = { name: 'Brill v. Guardian Life Ins. Co. of Am.', short_name: 'Brill', volume: 142, reporter: 'N.J.', first_page: 520, date: '1995-10-24', court: 'Supreme Court of New Jersey' };
  assert.equal(fullCite(k, '540'), 'Brill v. Guardian Life Ins. Co. of Am., 142 N.J. 520, 540 (1995)');
  assert.equal(shortCite(k, '540'), 'Brill, 142 N.J. at 540');
  assert.equal(fullCite({ ...k, name: 'X v. Y', volume: 370, reporter: 'N.J. Super.', first_page: 429, date: '2004-06-30', court: 'Appellate Division' }), 'X v. Y, 370 N.J. Super. 429 (App. Div. 2004)');
  assert.deepEqual(extractCitations('see 17 N.J. 67, 75, 110 A.2d 24 and 275 N.J.Super. 298').sort(), ['110 A.2d 24', '17 N.J. 67', '275 N.J. Super. 298']);
});

test('R. 1:3-1: holidays roll forward; short periods skip closed days; backward deadlines move earlier; contract math is plain', () => {
  const h = njCourtHolidays(2026);
  assert.equal(h.get('2026-04-03'), 'Good Friday');
  assert.equal(h.get('2026-07-03'), 'Independence Day');
  assert.equal(h.get('2026-11-03'), 'General Election Day');
  const answer = compute(ruleById('answer')!, '2026-02-27');
  assert.equal(answer.due, '2026-04-06', 'Apr 3 is Good Friday, Apr 4-5 the weekend');
  assert.ok(answer.steps.some((s) => /Good Friday/.test(s.text)));
  assert.equal(compute(ruleById('answer')!, '2026-03-20').due, '2026-04-24');
  assert.equal(compute(ruleById('answer')!, '2026-03-20', { mail_service: true }).due, '2026-04-27', '38 days lands Monday Apr 27');
  const reply = compute(ruleById('sj_reply')!, '2026-07-06');
  assert.equal(reply.due, '2026-06-29', 'four court days back, skipping the July 3 holiday and the weekend');
  assert.equal(compute(ruleById('sj_opposition')!, '2026-07-06').due, '2026-06-26');
  assert.equal(compute(ruleById('sj_motion')!, '2026-07-06').due, '2026-06-08');
  const back = compute(ruleById('sj_opposition')!, '2026-07-13');
  assert.equal(back.due, '2026-07-02', 'July 3 is closed, so the backward deadline moves to July 2');
  assert.ok(back.warnings.length > 0);
  assert.equal(computeContract('Mediation', 90, '2026-01-29').due, '2026-04-29');
  assert.ok(RULES.every((r) => r.cite.startsWith('R. ')));
  const ics = toIcs([{ uid: 'a', date: '2026-04-24', title: 'Answer due, R. 4:6-1(a)', description: 'line one\nline two' }], 'Matter');
  assert.match(ics, /DTSTART;VALUE=DATE:20260424/);
  assert.match(ics, /SUMMARY:Answer due\\, R\. 4:6-1\(a\)/);
});

test('trigger extraction finds service, return dates and contract clocks with the sentence that proves them', () => {
  const t = findTriggers('I served a copy of the Summons and Complaint upon Harbor Logistics, Inc., by personal delivery, on March 20, 2026.\nNOTICE OF MOTION FOR SUMMARY JUDGMENT\nThe motion is returnable Monday, July 6, 2026, at 9:00 a.m.\n- Calendar the deadline: Section 12.1 requires mediation within ninety days of notice, i.e., by April 29, 2026.');
  const kinds = t.map((x) => `${x.kind}:${x.date}`);
  assert.ok(kinds.includes('complaint_served:2026-03-20'));
  assert.ok(kinds.includes('sj_return_date:2026-07-06'));
  const c = t.find((x) => x.kind === 'contract_event')!;
  assert.equal(c.days, 90);
  assert.match(c.label, /Section 12\.1/);
});

test('PDF ingestion: Bates per page, line cites, scanned page detected, OCR marked in the cite; docket numbers are not Bates', async () => {
  const idx = new DocumentIndex(new EpisodicStore(), 'ws', async (_b64, page) => (page === 4 ? 'CINDER FREIGHT CO.\nDELIVERY RECEIPT No. 88213\nDelivered: 01/22/2026 08:15' : ''));
  const { doc } = await idx.ingest(PDF, 'production.pdf');
  assert.equal(doc.pages, 4);
  assert.equal(doc.bates_first, 'HARBOR_000401');
  assert.equal(doc.bates_last, 'HARBOR_000404');
  assert.deepEqual(doc.scanned_pages, [4]);
  assert.deepEqual(doc.ocr_pages, [4]);
  const hit = idx.pointerForBates('HARBOR_000402', 2, 7)!;
  assert.equal(idx.citeFor(hit.pointer), 'HARBOR_000402, p. 2, ll. 2–7');
  const ocr = idx.pointerForBates('HARBOR_000404', 3, 3)!;
  assert.equal(idx.citeFor(ocr.pointer), 'HARBOR_000404, p. 4, l. 3 (OCR)');
  assert.match(idx.l2.resolve(ocr.pointer)!.text, /08:15/);
  const again = await idx.ingest(PDF, 'production.pdf');
  assert.equal(again.created, false, 'identical bytes are not re-ingested');
  const idx2 = new DocumentIndex(new EpisodicStore(), 'ws');
  const { doc: motion } = await idx2.ingest(new URL('../workspace/sample-matter/06-notice-of-motion.txt', import.meta.url).pathname, 'motion.txt');
  assert.equal(motion.bates_first, undefined, 'MID-L-002417-26 is a docket number');
  assert.ok((await readFile(PDF)).length > 1000);
});

test('ledger restore marks in-flight work as interrupted and pauses its run', () => {
  const l = new TaskLedger(new EventStream());
  const run = l.createRun({ workspace_id: 'w', goal: 'g', budget: { max_tokens: 1000, max_usd: 1 } });
  l.setRunStatus(run.run_id, 'running');
  const t = l.addTask({ run_id: run.run_id, type: 'x', budget: { max_tokens: 100, max_usd: 1 } });
  l.claim(t.task_id, 'agent');
  const restored = new TaskLedger(new EventStream());
  const r = restored.restore(JSON.parse(JSON.stringify(l.serialize())));
  assert.deepEqual(r.interrupted, [t.task_id]);
  assert.equal(restored.getTask(t.task_id).status, 'blocked');
  assert.equal(restored.getRun(run.run_id).status, 'paused');
});

test('evidence verifier ignores rule numbers and case cites but still demands pointers for record figures', () => {
  assert.doesNotMatch(stripCitationNoise('R. 4:46-2(a) requires it; see Brill, 142 N.J. at 540; RPC 3.3(a)(3); ¶6.'), /\d/);
  assert.match(stripCitationNoise('Harbor received the notice on January 8, 2026.'), /\d/);
});
