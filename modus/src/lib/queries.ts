import { sql, eq, asc } from 'drizzle-orm';
import { db, raw, schema as s } from '@/db';

export type Totals = { proven: number; attributed: number };
export type OffenderRow = typeof s.offenders.$inferSelect & Totals;
export type CountRow = typeof s.counts.$inferSelect;
export type SourceRow = typeof s.sources.$inferSelect;

export async function listOffenders(): Promise<OffenderRow[]> {
  const rows = await raw<OffenderRow>(sql`
    SELECT o.*, t.proven, t.attributed FROM offenders o JOIN offender_totals t ON t.offender_id = o.id ORDER BY o.first_killing_year, o.name`);
  return rows.map(camel) as OffenderRow[];
}

export type Dossier = {
  offender: OffenderRow;
  proceedings: (typeof s.proceedings.$inferSelect & { source: SourceRow | null })[];
  attributions: (typeof s.attributions.$inferSelect & { source: SourceRow | null })[];
  counts: CountRow[];
  basis: Record<string, number>;
  events: (typeof s.events.$inferSelect)[];
  documents: SourceRow[];
  conflicts: { subjectType: string; subjectId: number; field: string; claims: { value: string; tier: string; source_id: string | null; note: string | null }[] }[];
  reviewOpen: number;
};

export async function getDossier(slug: string): Promise<Dossier | null> {
  const [o] = (await raw<OffenderRow>(sql`SELECT o.*, t.proven, t.attributed FROM offenders o JOIN offender_totals t ON t.offender_id = o.id WHERE o.slug = ${slug}`)).map(camel) as OffenderRow[];
  if (!o) return null;
  const [proceedings, attributions, counts, basis, events, documents, conflicts, review] = await Promise.all([
    db.select().from(s.proceedings).leftJoin(s.sources, eq(s.proceedings.sourceId, s.sources.id)).where(eq(s.proceedings.offenderId, o.id)).orderBy(asc(s.proceedings.date)),
    db.select().from(s.attributions).leftJoin(s.sources, eq(s.attributions.sourceId, s.sources.id)).where(eq(s.attributions.offenderId, o.id)),
    db.select().from(s.counts).where(eq(s.counts.offenderId, o.id)).orderBy(asc(s.counts.seq)),
    raw<{ basis: string; n: number }>(sql`SELECT basis, n FROM count_basis_split WHERE offender_id = ${o.id}`),
    db.select().from(s.events).where(eq(s.events.offenderId, o.id)).orderBy(asc(s.events.seq)),
    db.select({ src: s.sources }).from(s.documents).innerJoin(s.sources, eq(s.documents.sourceId, s.sources.id)).where(eq(s.documents.offenderId, o.id)).orderBy(asc(s.documents.seq)),
    raw<{ subject_type: string; subject_id: number; field: string; claims: Dossier['conflicts'][number]['claims'] }>(sql`
      SELECT sc.subject_type, sc.subject_id, sc.field, sc.claims FROM source_conflicts sc
      WHERE (sc.subject_type = 'offender' AND sc.subject_id = ${o.id})
         OR (sc.subject_type = 'count' AND sc.subject_id IN (SELECT id FROM counts WHERE offender_id = ${o.id}))`),
    raw<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM review_queue WHERE status = 'open' AND ((subject_type = 'offender' AND subject_id = ${o.id}) OR (subject_type = 'count' AND subject_id IN (SELECT id FROM counts WHERE offender_id = ${o.id})))`),
  ]);
  return {
    offender: o,
    proceedings: proceedings.map((r) => ({ ...r.proceedings, source: r.sources })),
    attributions: attributions.map((r) => ({ ...r.attributions, source: r.sources })),
    counts,
    basis: Object.fromEntries(basis.map((b) => [b.basis, b.n])),
    events,
    documents: documents.map((d) => d.src),
    conflicts: conflicts.map((c) => ({ subjectType: c.subject_type, subjectId: c.subject_id, field: c.field, claims: c.claims })),
    reviewOpen: review[0]?.n ?? 0,
  };
}

export type Cluster = typeof s.mapClusters.$inferSelect;
export async function getAtlas() {
  const [clusters, stats] = await Promise.all([
    db.select().from(s.mapClusters).orderBy(sql`victims - solved DESC`),
    db.select().from(s.mapStats),
  ]);
  const st = Object.fromEntries(stats.map((r) => [r.key, r.value])) as Record<string, any>;
  return { full: clusters.filter((c) => c.lens === 'full'), decade: clusters.filter((c) => c.lens === 'decade'), stats: st };
}

export async function listSources(): Promise<(SourceRow & { offenders: { slug: string; name: string }[] })[]> {
  const rows = await raw<any>(sql`
    SELECT s.*, COALESCE(json_agg(json_build_object('slug', o.slug, 'name', o.name)) FILTER (WHERE o.id IS NOT NULL), '[]') AS offenders
    FROM sources s LEFT JOIN documents d ON d.source_id = s.id LEFT JOIN offenders o ON o.id = d.offender_id
    GROUP BY s.id ORDER BY s.kind, s.date NULLS LAST, s.title`);
  return rows.map(camel) as (SourceRow & { offenders: { slug: string; name: string }[] })[];
}

export async function listReview() {
  return db.select().from(s.reviewQueue).orderBy(asc(s.reviewQueue.status), asc(s.reviewQueue.id));
}

/** snake_case → camelCase for raw rows. */
function camel<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  return out;
}
