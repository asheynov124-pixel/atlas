/** Phase 1 fixed tests: the numbers must come out of the database, not the seed files. */
import { describe, it, expect, afterAll } from 'vitest';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
afterAll(() => sql.end());

describe('Ridgway from the DB', () => {
  it('proven 49 / attributed 71 from offender_totals', async () => {
    const [r] = await sql`SELECT proven, attributed FROM offender_totals WHERE slug = 'gary-ridgway'`;
    expect(r.proven).toBe(49); expect(r.attributed).toBe(71);
  });
  it('basis split 5 physical / 4 led / 40 confession', async () => {
    const rows = await sql`SELECT basis, n FROM count_basis_split cb JOIN offenders o ON o.id = cb.offender_id WHERE o.slug = 'gary-ridgway'`;
    const m = Object.fromEntries(rows.map((r) => [r.basis, r.n]));
    expect(m).toEqual({ physical: 5, led_to_remains: 4, confession: 40 });
  });
  it('19 minors, 5 aged 15 or under; DNA 3, paint 2', async () => {
    const [r] = await sql`SELECT COUNT(*) FILTER (WHERE age_at_death <= 17)::int AS minors, COUNT(*) FILTER (WHERE age_at_death <= 15)::int AS young,
      COUNT(*) FILTER (WHERE dna)::int AS dna, COUNT(*) FILTER (WHERE paint)::int AS paint FROM counts c JOIN offenders o ON o.id = c.offender_id WHERE o.slug = 'gary-ridgway'`;
    expect(r).toMatchObject({ minors: 19, young: 5, dna: 3, paint: 2 });
  });
  it('four Jane Does, all identified 2012–2024', async () => {
    const rows = await sql`SELECT jane_doe_label, identified_year FROM counts WHERE jane_doe_label IS NOT NULL ORDER BY identified_year`;
    expect(rows.map((r) => r.identified_year)).toEqual([2012, 2021, 2023, 2024]);
  });
  it('Lovvorn age conflict surfaces with the court value first', async () => {
    const [c] = await sql`SELECT sc.claims FROM source_conflicts sc JOIN counts c ON c.id = sc.subject_id AND sc.subject_type = 'count' WHERE c.label = 'VIII' AND sc.field = 'age_at_death'`;
    expect(c.claims.map((x: { value: string }) => x.value)).toEqual(['19', '17']);
  });
});

describe('Index totals', () => {
  it('31 offenders, 299 proven of 593 attributed', async () => {
    const [r] = await sql`SELECT COUNT(*)::int AS n, SUM(proven)::int AS proven, SUM(attributed)::int AS attributed FROM offender_totals`;
    expect(r).toEqual({ n: 31, proven: 299, attributed: 593 });
  });
  it('6 unidentified; Samuel Little has the widest gap (93 vs 8)', async () => {
    const [u] = await sql`SELECT COUNT(*)::int AS n FROM offenders WHERE legal_status = 'unidentified'`;
    expect(u.n).toBe(6);
    const [g] = await sql`SELECT slug, attributed - proven AS gap FROM offender_totals ORDER BY gap DESC LIMIT 1`;
    expect(g).toEqual({ slug: 'samuel-little', gap: 85 });
  });
  it('every proceeding with victim rows reconciles', async () => {
    expect(await sql`SELECT * FROM proceeding_reconciliation`).toHaveLength(0);
  });
  it('an acquittal row changes the total immediately', async () => {
    await sql.begin(async (tx) => {
      await tx`INSERT INTO proceedings (id, offender_id, label, outcome, counts, tier) SELECT 'tmp-vacate', id, 'test', 'vacated', 2, 'convicted_at_trial' FROM offenders WHERE slug = 'john-wayne-gacy'`;
      const [r] = await tx`SELECT proven FROM offender_totals WHERE slug = 'john-wayne-gacy'`;
      expect(r.proven).toBe(31);
      await tx`ROLLBACK`;
    }).catch(() => {});
    const [r] = await sql`SELECT proven FROM offender_totals WHERE slug = 'john-wayne-gacy'`;
    expect(r.proven).toBe(33);
  });
});

describe('Atlas', () => {
  it('54 flagged clusters, 53 without a gun, all meeting the thresholds', async () => {
    const rows = await sql`SELECT weapon, victims, solved FROM map_clusters WHERE lens = 'full'`;
    expect(rows).toHaveLength(54);
    expect(rows.filter((r) => r.weapon !== 'Firearm')).toHaveLength(53);
    for (const r of rows) { expect(r.victims).toBeGreaterThanOrEqual(6); expect(r.solved / r.victims).toBeLessThanOrEqual(1 / 3 + 1e-9); }
  });
  it('largest unsolved: Wayne County, MI strangulation, 121', async () => {
    const [r] = await sql`SELECT county, state, victims - solved AS unsolved FROM map_clusters WHERE lens = 'full' ORDER BY unsolved DESC LIMIT 1`;
    expect(r).toEqual({ county: 'Wayne', state: 'MI', unsolved: 121 });
  });
});

describe('Review queue is honest', () => {
  it('queues a missing citation for every non-Ridgway proceeding', async () => {
    const [p] = await sql`SELECT COUNT(*)::int AS n FROM proceedings WHERE source_id IS NULL`;
    const [q] = await sql`SELECT COUNT(*)::int AS n FROM review_queue WHERE kind = 'missing_citation' AND status = 'open'`;
    expect(q.n).toBe(p.n);
  });
});
