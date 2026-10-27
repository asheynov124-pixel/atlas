import { describe, expect, it } from 'vitest';
import { MockDataSource } from '../data/mock/mockSource';
import { interpretQuery, toSearch, withoutChip, visualTarget } from '../ai/interpret';
import { interpretAspect } from '../ai/aspect';
import { kmeans } from '../ai/cluster';
import { suggestPaths, suggestQueries } from '../ai/suggest';
import { foldSignals } from '../engine/learning';
import type { Signal } from '../engine/types';
import { COMP } from '../data/mock/taxonomy';
import { FACET_DIM, FACETS } from '../data/types';

const ds = new MockDataSource(undefined, { latencyMs: 0, jitterMs: 0 });
const cat = ds.catalog;
const tx = { tags: cat.tags, performers: cat.performers, studios: cat.studios, series: cat.series };

describe('interpretQuery', () => {
  it('understands tags, attributes, durations, quality, and negation', () => {
    const i = interpretQuery('blonde petite romantic massage in 4K under 10 min without outdoor', tx);
    expect(i.attrs.hair).toEqual(['blonde']);
    expect(i.attrs.bodyType).toEqual(['petite']);
    expect(i.tagIds).toEqual(expect.arrayContaining(['romantic', 'massage']));
    expect(i.quality).toEqual(['4K']);
    expect(i.duration.max).toBe(10);
    expect(i.excludeTagIds).toEqual(['outdoor']);
    expect(i.natural).toBe(true);
    expect(i.confidence).toBeGreaterThan(0.8);
  });

  it('keeps negation across stop words', () => {
    expect(interpretQuery('dance without any handheld', tx).excludeTagIds).toEqual(['handheld']);
  });

  it('recognises performers, fuzzy names, and lookalikes', () => {
    const p = cat.performers[2];
    expect(interpretQuery(p.name, tx).performerIds).toContain(p.id);
    const typo = p.name.replace(/(\w)(\w)$/, '$2$1');
    if (p.name.split(' ')[1].length >= 5) expect(interpretQuery(typo, tx).performerIds).toContain(p.id);
    const look = interpretQuery(`looks like ${p.name}`, tx);
    expect(look.lookalikeIds).toEqual([p.id]);
    expect(look.performerIds).toEqual([]);
    const target = visualTarget(look, tx)!;
    expect(target.mask.slice(0, FACET_DIM).every((m) => m > 0)).toBe(true);
  });

  it('maps visual words to composition dims', () => {
    const i = interpretQuery('warm dark grainy', tx);
    const t = visualTarget(i, tx)!;
    const off = FACETS.indexOf('composition') * FACET_DIM;
    expect(t.vector[off + COMP.warmth]).toBeGreaterThan(0.5);
    expect(t.vector[off + COMP.bright]).toBeLessThan(-0.5);
    expect(t.mask[off + COMP.grain]).toBe(1);
  });

  it('removing a chip removes its constraint', () => {
    const i = interpretQuery('neon dance no outdoor', tx);
    const j = withoutChip(i, 'exclude:outdoor');
    expect(j.excludeTagIds).toEqual([]);
    expect(j.tagIds).toEqual(i.tagIds);
  });

  it('produces a contract query that finds matching videos', async () => {
    const { query, filters } = toSearch(interpretQuery('romantic bedroom 4k', tx), tx);
    const r = await ds.search(query, filters, { limit: 20 });
    expect(r.items.length).toBeGreaterThan(0);
    for (const it of r.items) expect(it.video.quality).toBe('4K');
    expect(r.items[0].video.tags).toEqual(expect.arrayContaining(['romantic', 'bedroom']));
  });
});

describe('interpretAspect', () => {
  it('weights facets from the region and words', () => {
    const v = cat.videos[10];
    const a = interpretAspect({ video: v, hit: { face: 0.8, composition: 0.2 }, text: 'the warm lighting' }, tx);
    expect(Object.keys(a.facets)).toEqual(expect.arrayContaining(['face', 'composition']));
    expect(a.steps.length).toBeGreaterThanOrEqual(3);
    expect(a.label).toMatch(/like this/);
  });
});

describe('clustering + suggestions', () => {
  it('k-means separates obvious groups', () => {
    const a = Array.from({ length: 10 }, (_, i) => [1, 0.1 * (i % 3), 0, 0]);
    const b = Array.from({ length: 10 }, (_, i) => [0, 0, 1, 0.1 * (i % 3)]);
    const clusters = kmeans([...a, ...b], 2);
    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.members.length).sort()).toEqual([10, 10]);
  });

  it('suggests a path once a performer has been liked repeatedly', () => {
    const p = cat.performers[0];
    const liked = cat.videos.filter((v) => v.performerIds[0] === p.id).slice(0, 8);
    const now = Date.now();
    const signals: Signal[] = liked.map((v, i) => ({ id: `s${i}`, kind: 'like', videoId: v.id, at: now - i * 1000, value: 1 }));
    const model = foldSignals(signals, (id) => cat.videoById.get(id));
    const sugg = suggestPaths(model, (id) => cat.videoById.get(id), [], tx);
    expect(sugg.length).toBeGreaterThan(0);
    expect(sugg[0].seed.kind).toBe('cluster');
    expect(suggestQueries(model, tx).length).toBeGreaterThan(2);
  });
});
