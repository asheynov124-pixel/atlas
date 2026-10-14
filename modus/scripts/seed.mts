/**
 * Imports data/seed/*.json. Idempotent: wipes and reloads the seed tables.
 * Every row that lacks a citation gets a review-queue item instead of an invented source.
 */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as rawSql } from 'drizzle-orm';
import * as s from '../src/db/schema.ts';

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client, { schema: s });
const read = <T,>(f: string): T => JSON.parse(readFileSync(join(process.cwd(), 'data/seed', f), 'utf8'));

type Offender = { slug: string; name: string; alias: string | null; legalStatus: 'convicted' | 'guilty_plea' | 'died_uncharged' | 'unidentified';
  courtProvenCount: number | null; attributedCount: number; firstKillingYear: number; lastKillingYear: number; caughtYear: number | null;
  states: string[]; statesNote: string | null; methods: string[]; victimology: string; howCaught: (typeof s.howCaughtEnum)['enumValues'][number];
  howCaughtText: string | null; mobility: string | null; homeBase: string | null; diedYear: number | null };
type Count = { seq: number; count: string; proceeding: string; victim: string; ageAtDeath: number; lastSeen: string | null; found: string;
  recoverySite: string; basis: 'physical' | 'led_to_remains' | 'confession'; dna: boolean; paint: boolean; ledToRemains: boolean;
  partialRemains: boolean; pleadedAsJaneDoe: string | null; identifiedYear: number | null; schematic: { x: number; y: number } | null };

const offenders = read<Offender[]>('offenders.json');
const ridgway = read<{ counts: Count[] }>('ridgway-counts.json');
const events = read<{ events: { seq: number; date: string; lane: 'investigation' | 'forensics' | 'court'; text: string }[] }>('ridgway-events.json');
const docs = read<{ documents: { id: string; kind: string; title: string; publisher: string; date: string | null; pages?: number; url: string; archiveUrl: string | null }[] }>('ridgway-documents.json');
const profile = read<Record<string, any>>('ridgway-profile.json');
const clusters = read<{ dataset: string; method: string; thresholds: unknown; totals: unknown; clusters: any[] }>('map-clusters.json');
const decade = read<{ rows: any[] }>('map-decade-clusters.json');
const summary = read<Record<string, unknown>>('map-summary.json');

// Attribution tiers known from the research notes; everything else is provisional.
const ATTR_TIER: Record<string, s.Tier> = {
  'samuel-little': 'confessed_uncharged', 'ted-bundy': 'confessed_uncharged', 'israel-keyes': 'investigator_attributed',
  'alan-wade-wilmer-sr': 'cleared_by_exception', 'gary-ridgway': 'investigator_attributed',
};

await db.execute(rawSql`TRUNCATE review_queue, map_stats, map_clusters, documents, events, claims, attributions, counts, proceedings, offenders, sources RESTART IDENTITY CASCADE`);

// Sources
const MAP_SRC = 'map-shr-1980-2014';
await db.insert(s.sources).values([
  ...docs.documents.map((d) => ({ id: d.id, kind: d.kind as any, title: d.title, publisher: d.publisher, date: d.date, pages: d.pages ?? null, url: d.url, archiveUrl: d.archiveUrl })),
  { id: MAP_SRC, kind: 'dataset', title: 'Supplementary Homicide Report 1980–2014 (MAP release)', publisher: 'Murder Accountability Project', date: '2014', url: 'https://www.murderdata.org/', archiveUrl: null, note: clusters.dataset },
  { id: 'wikipedia-gary-ridgway', kind: 'encyclopedia', title: 'Gary Ridgway', publisher: 'Wikipedia', date: null, url: 'https://en.wikipedia.org/wiki/Gary_Ridgway', archiveUrl: null },
]);

const review: (typeof s.reviewQueue.$inferInsert)[] = [];
const idBySlug = new Map<string, number>();

for (const o of offenders) {
  const isRidgway = o.slug === 'gary-ridgway';
  const [row] = await db.insert(s.offenders).values({
    slug: o.slug, name: isRidgway ? profile.name : o.name, shortName: isRidgway ? o.name : null, alias: isRidgway ? profile.alias : o.alias, legalStatus: o.legalStatus,
    caption: isRidgway ? profile.caption : null, caseNumber: isRidgway ? profile.caseNumber : null, court: isRidgway ? profile.court : null,
    lede: isRidgway ? profile.lede : null,
    firstKillingYear: o.firstKillingYear, lastKillingYear: o.lastKillingYear, caughtYear: o.caughtYear, diedYear: o.diedYear,
    living: null, states: o.states, statesNote: o.statesNote, methods: o.methods, victimology: o.victimology,
    howCaught: o.howCaught, howCaughtText: o.howCaughtText, mobility: isRidgway ? 'Geographically stable' : null,
    vitals: isRidgway ? profile.vitals : [], chain: isRidgway ? profile.chain : [],
    notes: isRidgway ? { mapNote: profile.mapNote, offMapNote: profile.offMapNote, mapStat: profile.mapStat, mapLensText: profile.mapLensText, recordStatus: profile.recordStatus, caughtTitle: profile.caughtTitle, caughtDek: profile.caughtDek, caughtCallout: profile.caughtCallout, tiles: profile.tiles, basisNote: profile.basisNote, imageSlot: profile.imageSlot } : {},
  }).returning({ id: s.offenders.id });
  idBySlug.set(o.slug, row.id);

  if (isRidgway) {
    await db.insert(s.proceedings).values([
      { id: 'ridgway-2003', offenderId: row.id, label: 'Plea to 48 counts of aggravated first-degree murder', court: 'King County Superior Court', caseNumber: '01-1-10270-9 SEA', date: '2003-11-05', outcome: 'guilty_plea', counts: 48, tier: 'guilty_plea', sourceId: 'ridgway-statement-on-plea-2003', note: 'Sentenced 2003-12-18 to 48 consecutive life terms without parole (Judge Richard A. Jones).' },
      { id: 'ridgway-2011', offenderId: row.id, label: 'Plea to the murder of Rebecca Marrero', court: 'King County Superior Court', caseNumber: null, date: '2011-02-18', outcome: 'guilty_plea', counts: 1, tier: 'guilty_plea', sourceId: null, note: '49th consecutive life term (Judge Mary E. Roberts).' },
    ]);
    const narratives = profile.countNarratives as Record<string, { establishes: string[] }>;
    const inserted = await db.insert(s.counts).values(ridgway.counts.map((c) => ({
      offenderId: row.id, proceedingId: c.proceeding, seq: c.seq, label: c.count, victimName: c.victim, ageAtDeath: c.ageAtDeath,
      lastSeen: c.lastSeen, found: c.found, recoverySite: c.recoverySite, basis: c.basis, dna: c.dna, paint: c.paint,
      ledToRemains: c.ledToRemains, partialRemains: c.partialRemains, janeDoeLabel: c.pleadedAsJaneDoe, identifiedYear: c.identifiedYear,
      schematicX: c.schematic?.x ?? null, schematicY: c.schematic?.y ?? null, disposition: 'guilty' as const,
      narrative: narratives[c.count] ?? null, sourceId: 'ridgway-prosecutor-summary-2003', pinpoint: null,
    }))).returning({ id: s.counts.id, label: s.counts.label });
    review.push({ subjectType: 'offender', subjectId: row.id, subjectLabel: o.name, kind: 'missing_pinpoint', message: 'Add pinpoint page cites into the Prosecutor\'s Summary of the Evidence (138 pp.) for all 49 counts.' });
    // Source conflict recorded in the research notes: Lovvorn's age.
    const lovvorn = inserted.find((c) => c.label === 'VIII')!;
    await db.insert(s.claims).values([
      { subjectType: 'count', subjectId: lovvorn.id, field: 'age_at_death', value: '19', tier: 'guilty_plea', sourceId: 'ridgway-prosecutor-summary-2003', note: 'Prosecutor\'s Summary of the Evidence' },
      { subjectType: 'count', subjectId: lovvorn.id, field: 'age_at_death', value: '17', tier: 'named_in_reporting', sourceId: 'wikipedia-gary-ridgway', note: 'Wikipedia' },
    ]);
    await db.insert(s.events).values(events.events.map((e) => ({ offenderId: row.id, seq: e.seq, date: e.date, lane: e.lane, text: e.text, sourceId: null })));
    await db.insert(s.documents).values(docs.documents.map((d, i) => ({ offenderId: row.id, sourceId: d.id, seq: i + 1 })));
    await db.insert(s.attributions).values({ offenderId: row.id, totalCount: o.attributedCount, tier: ATTR_TIER[o.slug], sourceId: null, note: 'Highest credible attributed total from the research index; citation pending.' });
    continue;
  }

  if (o.courtProvenCount != null && o.courtProvenCount > 0) {
    const outcome = o.legalStatus === 'guilty_plea' ? 'guilty_plea' : 'conviction';
    await db.insert(s.proceedings).values({
      id: `${o.slug}-court`, offenderId: row.id, label: `${outcome === 'guilty_plea' ? 'Guilty plea' : 'Conviction'} · ${o.courtProvenCount} murder count${o.courtProvenCount === 1 ? '' : 's'}`,
      outcome, counts: o.courtProvenCount, tier: outcome === 'guilty_plea' ? 'guilty_plea' : 'convicted_at_trial', sourceId: null,
      note: 'Verified at the proceeding level in the research index; court citation pending.',
    });
  }
  if (o.attributedCount > (o.courtProvenCount ?? 0)) {
    const tier = ATTR_TIER[o.slug] ?? (o.legalStatus === 'unidentified' ? 'investigator_attributed' : 'investigator_attributed');
    await db.insert(s.attributions).values({ offenderId: row.id, totalCount: o.attributedCount, tier, sourceId: null,
      note: ATTR_TIER[o.slug] ? 'Tier from research notes; citation pending.' : 'Tier provisional; confirm with the research skill.' });
  }
}

// MAP clusters and stats
await db.insert(s.mapClusters).values([
  ...clusters.clusters.map((c) => ({ lens: 'full', decade: null, county: c.county, state: c.state, weapon: c.weapon, weaponClass: c.weaponClass, victims: c.victims, solved: c.solved, firstYear: c.firstYear, lastYear: c.lastYear, sourceId: MAP_SRC })),
  ...decade.rows.map((r) => ({ lens: 'decade', decade: r.decade, county: r.county, state: r.state, weapon: r.weapon, weaponClass: null, victims: r.victims, solved: r.solved, firstYear: r.decade, lastYear: r.decade + 9, note: r.note, sourceId: MAP_SRC })),
]);
await db.insert(s.mapStats).values([
  { key: 'method', value: { method: clusters.method, thresholds: clusters.thresholds, totals: clusters.totals }, sourceId: MAP_SRC },
  ...Object.entries(summary).map(([key, value]) => ({ key, value: value as object, sourceId: MAP_SRC })),
]);

if (review.length) await db.insert(s.reviewQueue).values(review);
const [{ n }] = await db.execute<{ n: number }>(rawSql`SELECT COUNT(*)::int AS n FROM review_queue`);
console.log(`seeded ${offenders.length} offenders, ${ridgway.counts.length} counts, ${clusters.clusters.length} clusters; ${n} seed-only review items (run case:verify to derive the rest)`);
await client.end();
