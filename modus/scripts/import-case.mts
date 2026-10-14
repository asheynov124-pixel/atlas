/**
 * Import or update one case file (data/cases/<slug>.json). See data/cases/SCHEMA.md.
 * Idempotent per offender: replaces the offender's proceedings, counts, attributions, claims, events and documents.
 */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import * as s from '../src/db/schema.ts';

const file = process.argv[2]; if (!file) { console.error('usage: tsx scripts/import-case.mts data/cases/<slug>.json'); process.exit(2); }
const c = JSON.parse(readFileSync(file, 'utf8'));
const client = postgres(process.env.DATABASE_URL!, { max: 1 }); const db = drizzle(client, { schema: s });
const errors: string[] = []; const review: (typeof s.reviewQueue.$inferInsert)[] = [];
const o = c.offender ?? {};
const need = (cond: unknown, msg: string) => { if (!cond) errors.push(msg); };

// ---- validation ------------------------------------------------------------
need(o.slug && /^[a-z0-9-]+$/.test(o.slug), 'offender.slug must be kebab-case');
need(o.name, 'offender.name required');
need(s.legalStatusEnum.enumValues.includes(o.legalStatus), `offender.legalStatus invalid: ${o.legalStatus}`);
const srcIds = new Set<string>((c.sources ?? []).map((x: any) => x.id));
const refSrc = (id: unknown, where: string) => { if (id != null && !srcIds.has(String(id))) errors.push(`${where}: unknown sourceId ${id}`); };
for (const src of c.sources ?? []) need(s.sourceKindEnum.enumValues.includes(src.kind), `source ${src.id}: kind invalid`);
const procs: any[] = c.proceedings ?? [];
for (const p of procs) {
  need(s.outcomeEnum.enumValues.includes(p.outcome), `proceeding ${p.id}: outcome invalid`);
  need(s.TIERS.includes(p.tier), `proceeding ${p.id}: tier invalid`);
  if (['conviction', 'guilty_plea'].includes(p.outcome)) need(['convicted_at_trial', 'guilty_plea'].includes(p.tier), `proceeding ${p.id}: a court result must be tier 1 or 2`);
  else need(!['convicted_at_trial', 'guilty_plea'].includes(p.tier), `proceeding ${p.id}: tier 1–2 reserved for conviction/plea`);
  need(Number.isInteger(p.counts) && p.counts >= 0, `proceeding ${p.id}: counts must be an integer`);
  refSrc(p.sourceId, `proceeding ${p.id}`);
}
if (o.legalStatus === 'named_in_reporting') need(procs.length === 0, 'named_in_reporting offender cannot carry proceedings');
if (o.living === true && procs.length === 0) need(o.legalStatus === 'named_in_reporting', 'a living person with no proceeding may only be named_in_reporting');
const counts: any[] = c.counts ?? [];
for (const k of counts) {
  need(procs.some((p) => p.id === k.proceedingId), `count ${k.label}: unknown proceedingId ${k.proceedingId}`);
  need(s.basisEnum.enumValues.includes(k.basis), `count ${k.label}: basis invalid`);
  if (k.recoverySite && /\b\d{2,5}\s+\w+\s+(st|street|ave|avenue|rd|road|dr|drive|blvd|ln|lane|ct|way|pl)\b/i.test(k.recoverySite)) errors.push(`count ${k.label}: recoverySite looks like a street address; use a named place`);
  refSrc(k.sourceId, `count ${k.label}`);
}
for (const p of procs) { const n = counts.filter((k) => k.proceedingId === p.id).length; if (n && n !== p.counts) errors.push(`proceeding ${p.id}: ${n} count rows but counts=${p.counts}`); }
for (const a of c.attributions ?? []) { need(s.TIERS.includes(a.tier), 'attribution tier invalid'); refSrc(a.sourceId, 'attribution'); }
for (const cl of c.claims ?? []) { need(s.TIERS.includes(cl.tier), `claim ${cl.field}: tier invalid`); refSrc(cl.sourceId, `claim ${cl.field}`); }
for (const e of c.events ?? []) { need(s.laneEnum.enumValues.includes(e.lane), 'event lane invalid'); refSrc(e.sourceId, 'event'); }
for (const d of c.documents ?? []) refSrc(d, 'documents');
if (errors.length) { console.error('REFUSED:\n - ' + errors.join('\n - ')); await client.end(); process.exit(1); }

// ---- write -------------------------------------------------------------------
await db.transaction(async (tx) => {
  for (const src of c.sources ?? []) await tx.insert(s.sources).values({ id: src.id, kind: src.kind, title: src.title, publisher: src.publisher ?? null, date: src.date ?? null, pages: src.pages ?? null, url: src.url ?? null, archiveUrl: src.archiveUrl ?? null, note: src.note ?? null })
    .onConflictDoUpdate({ target: s.sources.id, set: { kind: src.kind, title: src.title, publisher: src.publisher ?? null, date: src.date ?? null, pages: src.pages ?? null, url: src.url ?? null, archiveUrl: src.archiveUrl ?? null, note: src.note ?? null } });
  const values = { slug: o.slug, name: o.name, shortName: o.shortName ?? null, alias: o.alias ?? null, legalStatus: o.legalStatus, caption: o.caption ?? null, caseNumber: o.caseNumber ?? null, court: o.court ?? null, lede: o.lede ?? null,
    firstKillingYear: o.firstKillingYear ?? null, lastKillingYear: o.lastKillingYear ?? null, caughtYear: o.caughtYear ?? null, diedYear: o.diedYear ?? null, living: o.living ?? null,
    states: o.states ?? [], statesNote: o.statesNote ?? null, methods: o.methods ?? [], victimology: o.victimology ?? null, howCaught: o.howCaught ?? null, howCaughtText: o.howCaughtText ?? null, mobility: o.mobility ?? null,
    homeBaseCounty: o.homeBaseCounty ?? null, homeBaseState: o.homeBaseState ?? null, vitals: o.vitals ?? [], chain: o.chain ?? [], notes: o.notes ?? {}, updatedAt: new Date() };
  const [row] = await tx.insert(s.offenders).values(values).onConflictDoUpdate({ target: s.offenders.slug, set: values }).returning({ id: s.offenders.id });
  const oid = row.id;
  for (const t of [s.documents, s.events, s.attributions, s.counts, s.proceedings]) await tx.delete(t).where(eq((t as any).offenderId, oid));
  await tx.delete(s.claims).where(sql`(subject_type = 'offender' AND subject_id = ${oid}) OR (subject_type = 'count' AND subject_id IN (SELECT id FROM counts WHERE offender_id = ${oid}))`);
  await tx.delete(s.reviewQueue).where(sql`status = 'open' AND ((subject_type = 'offender' AND subject_id = ${oid}) OR (subject_type = 'proceeding' AND subject_label = ANY(${procs.map((p) => p.id)})))`);
  for (const p of procs) {
    await tx.insert(s.proceedings).values({ id: p.id, offenderId: oid, label: p.label, court: p.court ?? null, caseNumber: p.caseNumber ?? null, date: p.date ?? null, outcome: p.outcome, counts: p.counts, tier: p.tier, sourceId: p.sourceId ?? null, note: [p.note, p.pinpoint ? `Pinpoint: ${p.pinpoint}` : null].filter(Boolean).join(' · ') || null });
    if (!p.sourceId) review.push({ subjectType: 'proceeding', subjectLabel: p.id, kind: 'missing_citation', message: `Cite the record for "${p.label}".` });
  }
  const labelToId = new Map<string, number>();
  for (const [i, k] of counts.entries()) {
    const [r] = await tx.insert(s.counts).values({ offenderId: oid, proceedingId: k.proceedingId, seq: i + 1, label: String(k.label), victimName: k.victimName ?? null, ageAtDeath: k.ageAtDeath ?? null, lastSeen: k.lastSeen ?? null, found: k.found ?? null, recoverySite: k.recoverySite ?? null, basis: k.basis, dna: !!k.dna, paint: !!k.paint, ledToRemains: !!k.ledToRemains, partialRemains: !!k.partialRemains, janeDoeLabel: k.janeDoeLabel ?? null, identifiedYear: k.identifiedYear ?? null, schematicX: k.schematic?.x ?? null, schematicY: k.schematic?.y ?? null, disposition: k.disposition ?? 'guilty', narrative: k.narrative ?? null, sourceId: k.sourceId ?? null, pinpoint: k.pinpoint ?? null }).returning({ id: s.counts.id });
    labelToId.set(String(k.label), r.id);
    if (!k.sourceId) review.push({ subjectType: 'count', subjectId: r.id, subjectLabel: `Count ${k.label} · ${k.victimName ?? 'unnamed'}`, kind: 'missing_citation', message: 'Cite the charging document or judgment for this count.' });
  }
  if (counts.length && counts.some((k) => k.sourceId && !k.pinpoint)) review.push({ subjectType: 'offender', subjectId: oid, subjectLabel: o.name, kind: 'missing_pinpoint', message: `Add pinpoint cites for ${counts.filter((k) => k.sourceId && !k.pinpoint).length} counts.` });
  for (const a of c.attributions ?? []) { await tx.insert(s.attributions).values({ offenderId: oid, totalCount: a.totalCount, tier: a.tier, sourceId: a.sourceId ?? null, note: a.note ?? null }); if (!a.sourceId) review.push({ subjectType: 'offender', subjectId: oid, subjectLabel: o.name, kind: 'unverified_attribution', message: `Attributed total ${a.totalCount} (${a.tier}): cite it.` }); }
  for (const cl of c.claims ?? []) { const sid = cl.subject === 'offender' ? oid : labelToId.get(String(cl.countLabel)); if (sid == null) continue; await tx.insert(s.claims).values({ subjectType: cl.subject, subjectId: sid, field: cl.field, value: String(cl.value), tier: cl.tier, sourceId: cl.sourceId ?? null, note: cl.note ?? null }); }
  for (const [i, e] of (c.events ?? []).entries()) await tx.insert(s.events).values({ offenderId: oid, seq: i + 1, date: e.date, lane: e.lane, text: e.text, sourceId: e.sourceId ?? null });
  for (const [i, d] of (c.documents ?? []).entries()) await tx.insert(s.documents).values({ offenderId: oid, sourceId: d, seq: i + 1 });
  const conflicts = await tx.execute<{ field: string; subject_type: string; subject_id: number }>(sql`SELECT field, subject_type, subject_id FROM source_conflicts WHERE (subject_type = 'offender' AND subject_id = ${oid}) OR (subject_type = 'count' AND subject_id IN (SELECT id FROM counts WHERE offender_id = ${oid}))`);
  for (const cf of conflicts) review.push({ subjectType: cf.subject_type, subjectId: cf.subject_id, subjectLabel: `${o.name} · ${cf.field}`, kind: 'source_conflict', message: `Sources disagree on ${cf.field.replace(/_/g, ' ')}; the higher tier is shown.` });
  if (review.length) await tx.insert(s.reviewQueue).values(review);
});
const [t] = await db.execute<{ proven: number; attributed: number }>(sql`SELECT proven, attributed FROM offender_totals WHERE slug = ${o.slug}`);
console.log(`imported ${o.slug}: proven ${t.proven} / attributed ${t.attributed}; ${procs.length} proceedings, ${counts.length} counts, ${review.length} review items`);
await client.end();
