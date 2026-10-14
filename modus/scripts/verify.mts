/**
 * Automated integrity pass (no agent). Re-derives what the review queue should contain and reports drift.
 * With a verdict file (data/verifications/<slug>.json, written by the verifier skill) it records the verdicts
 * and queues every mismatch. Never edits a fact.
 */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as s from '../src/db/schema.ts';

const client = postgres(process.env.DATABASE_URL!, { max: 1 }); const db = drizzle(client, { schema: s });
const problems: string[] = [];
const recon = await db.execute(sql`SELECT * FROM proceeding_reconciliation`);
if (recon.length) problems.push(`${recon.length} proceeding(s) whose count rows do not reconcile: ${recon.map((r: any) => r.proceeding_id).join(', ')}`);
const typed = await db.execute<{ slug: string; proven: number }>(sql`SELECT o.slug, t.proven FROM offenders o JOIN offender_totals t ON t.offender_id = o.id WHERE o.legal_status IN ('unidentified','named_in_reporting') AND t.proven > 0`);
for (const r of typed) problems.push(`${r.slug}: status allows no court result but proven = ${r.proven}`);
const living = await db.execute<{ slug: string }>(sql`SELECT slug FROM offenders o WHERE living = true AND legal_status <> 'named_in_reporting' AND NOT EXISTS (SELECT 1 FROM proceedings p WHERE p.offender_id = o.id)`);
for (const r of living) problems.push(`${r.slug}: living, never charged, but not marked named_in_reporting`);
const addr = await db.execute<{ id: number; recovery_site: string }>(sql`SELECT id, recovery_site FROM counts WHERE recovery_site ~* '\\m\\d{2,5}\\s+\\w+\\s+(st|street|ave|avenue|rd|road|dr|drive|blvd|ln|lane|ct|way|pl)\\M'`);
for (const r of addr) problems.push(`count ${r.id}: recovery site looks like a street address (${r.recovery_site})`);

// Expected review items vs open ones.
const want: { subjectType: string; subjectId: number | null; subjectLabel: string; kind: string; message: string }[] = [];
for (const p of await db.execute<{ id: string; label: string }>(sql`SELECT id, label FROM proceedings WHERE source_id IS NULL`)) want.push({ subjectType: 'proceeding', subjectId: null, subjectLabel: p.id, kind: 'missing_citation', message: `Cite the record for "${p.label}".` });
for (const a of await db.execute<{ id: number; name: string; total_count: number; tier: string }>(sql`SELECT o.id, o.name, a.total_count, a.tier FROM attributions a JOIN offenders o ON o.id = a.offender_id WHERE a.source_id IS NULL`)) want.push({ subjectType: 'offender', subjectId: a.id, subjectLabel: a.name, kind: 'unverified_attribution', message: `Attributed total ${a.total_count} (${a.tier}): cite it.` });
for (const cf of await db.execute<{ subject_type: string; subject_id: number; field: string }>(sql`SELECT subject_type, subject_id, field FROM source_conflicts`)) want.push({ subjectType: cf.subject_type, subjectId: cf.subject_id, subjectLabel: `${cf.subject_type} ${cf.subject_id} · ${cf.field}`, kind: 'source_conflict', message: `Sources disagree on ${cf.field.replace(/_/g, ' ')}; the higher tier is shown.` });
const open = await db.execute<{ subject_type: string; subject_id: number | null; subject_label: string | null; kind: string }>(sql`SELECT subject_type, subject_id, subject_label, kind FROM review_queue WHERE status = 'open'`);
const key = (x: { subjectType?: string; subject_type?: string; subjectId?: number | null; subject_id?: number | null; subjectLabel?: string | null; subject_label?: string | null; kind: string }) =>
  `${x.subjectType ?? x.subject_type}|${x.kind}|${x.subjectId ?? x.subject_id ?? ''}|${(x.kind === 'missing_citation' && (x.subjectType ?? x.subject_type) === 'proceeding') ? (x.subjectLabel ?? x.subject_label) : ''}`;
const have = new Set(open.map(key)); let added = 0;
for (const w of want) if (!have.has(key(w))) { await db.insert(s.reviewQueue).values(w); added++; }

// Verdict file from the verifier skill.
const file = process.argv[2]; let verdicts = 0, mismatches = 0;
if (file) {
  const v = JSON.parse(readFileSync(file, 'utf8'));
  for (const item of v.items ?? []) {
    await db.insert(s.verifications).values({ subjectType: item.subjectType, subjectId: String(item.subjectId), field: item.field ?? null, verdict: item.verdict, expected: item.expected ?? null, found: item.found ?? null, sourceId: item.sourceId ?? null, note: item.note ?? null, verifier: v.verifier ?? 'verifier' });
    verdicts++;
    if (item.verdict !== 'confirmed') { mismatches++; await db.insert(s.reviewQueue).values({ subjectType: item.subjectType, subjectId: /^\d+$/.test(String(item.subjectId)) ? Number(item.subjectId) : null, subjectLabel: item.label ?? String(item.subjectId), kind: item.verdict === 'mismatch' ? 'unverified_count' : 'unverifiable', message: `${item.field ?? 'record'}: expected ${item.expected ?? '?'}, found ${item.found ?? 'nothing'}${item.note ? ` · ${item.note}` : ''}` }); }
  }
}
const [{ n }] = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM review_queue WHERE status = 'open'`);
console.log(`integrity: ${problems.length ? problems.length + ' problem(s)' : 'clean'}; review queue: ${n} open (${added} added)${file ? `; verdicts recorded: ${verdicts}, mismatches queued: ${mismatches}` : ''}`);
for (const p of problems) console.log(' ! ' + p);
await client.end();
process.exit(problems.length ? 1 : 0);
