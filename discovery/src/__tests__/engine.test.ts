import { describe, expect, it } from 'vitest';
import { MockDataSource } from '../data/mock/mockSource';
import { foldSignals, implicitSignal, emptyOverrides } from '../engine/learning';
import { emptyFilters, matchesFilters, mergeFilters, countActive } from '../engine/filters';
import { emptyBlocks, isBlocked, rank, profileScore } from '../engine/ranking';
import { createPath, extendPath, type PathContext } from '../engine/paths';
import type { Signal } from '../engine/types';

const ds = new MockDataSource(undefined, { latencyMs: 0, jitterMs: 0 });
const cat = ds.catalog;
const lookup = (id: string) => cat.videoById.get(id);
const performer = (id: string) => cat.performerById.get(id);
const names = {
  tag: (id: string) => cat.tagById.get(id)?.label ?? id,
  performer: (id: string) => cat.performerById.get(id)?.name ?? id,
  studio: (id: string) => cat.studioById.get(id)?.name ?? id,
};

function sig(kind: Signal['kind'], videoId: string, value: number, at = Date.now()): Signal {
  return { id: `${kind}-${videoId}-${at}`, kind, videoId, value, at };
}

describe('learning', () => {
  const v = cat.videos.find((x) => x.tags.includes('neon'))!;

  it('likes raise and dislikes lower tag weights', () => {
    expect(foldSignals([sig('like', v.id, 1)], lookup).tagW.neon).toBeGreaterThan(0);
    expect(foldSignals([sig('dislike', v.id, -1)], lookup).tagW.neon).toBeLessThan(0);
  });

  it('is exactly reversible: removing a signal removes its effect', () => {
    const a = sig('like', v.id, 1);
    const b = sig('like', cat.videos[50].id, 1);
    const both = foldSignals([a, b], lookup);
    const onlyB = foldSignals([b], lookup);
    const removed = foldSignals([b], lookup);
    expect(removed.tagW).toEqual(onlyB.tagW);
    expect(both.likeMass).toBeGreaterThan(onlyB.likeMass);
  });

  it('decays old signals', () => {
    const fresh = foldSignals([sig('like', v.id, 1)], lookup).tagW.neon;
    const old = foldSignals([sig('like', v.id, 1, Date.now() - 90 * 86400000)], lookup).tagW.neon;
    expect(old).toBeCloseTo(fresh / 4, 2);
  });

  it('overrides replace learned weights but keep the learned value visible', () => {
    const m = foldSignals([sig('like', v.id, 1)], lookup, { ...emptyOverrides(), tags: { neon: -2 } });
    expect(m.tagW.neon).toBe(-2);
    expect(m.learned.tagW.neon).toBeGreaterThan(0);
  });

  it('classifies implicit watch behaviour', () => {
    expect(implicitSignal(1, 20, 0, false)?.kind).toBe('skip');
    expect(implicitSignal(18, 20, 0, false)?.kind).toBe('watch');
    expect(implicitSignal(30, 20, 2, true)?.kind).toBe('rewatch');
    expect(implicitSignal(1, 20, 0, true)).toBeNull();
  });

  it('taste similarity lifts lookalikes of liked clips', () => {
    const liked = cat.videos.filter((x) => x.performerIds[0] === cat.performers[1].id).slice(0, 5);
    const m = foldSignals(liked.map((x, i) => sig('like', x.id, 1, Date.now() - i)), lookup);
    const sameLead = cat.videos.find((x) => x.performerIds[0] === cat.performers[1].id && !liked.includes(x))!;
    const other = cat.videos.find((x) => !x.performerIds.includes(cat.performers[1].id))!;
    expect(profileScore(sameLead, m).score).toBeGreaterThan(profileScore(other, m).score);
  });
});

describe('filters', () => {
  it('evaluates tag logic and attributes', () => {
    const f = emptyFilters();
    f.tags.all = ['neon'];
    f.tags.none = ['outdoor'];
    const v = cat.videos.find((x) => x.tags.includes('neon') && !x.tags.includes('outdoor'))!;
    expect(matchesFilters(v, f, performer)).toBe(true);
    f.performers.attrs.hair = ['colored', 'red', 'black', 'blonde', 'brown'];
    expect(matchesFilters(v, f, performer)).toBe(true);
    f.duration.max = 0;
    expect(matchesFilters(v, f, performer)).toBe(false);
  });

  it('merges global and path filters (exclusions union, positives override)', () => {
    const g = emptyFilters();
    g.tags.none = ['car'];
    g.quality = ['HD'];
    const l = { ...emptyFilters(), quality: ['4K' as const], tags: { all: [], any: [], none: ['pool'], weights: {} } };
    const m = mergeFilters(g, l);
    expect(m.tags.none.sort()).toEqual(['car', 'pool']);
    expect(m.quality).toEqual(['4K']);
    expect(countActive(m)).toBe(3);
  });
});

describe('ranking', () => {
  it('blocks are absolute', async () => {
    const r = await ds.explore({ limit: 100 });
    const p = r.items[0].video.performerIds[0];
    const blocks = { ...emptyBlocks(), performers: [p] };
    const ranked = rank(r.items, {
      model: foldSignals([], lookup),
      filters: emptyFilters(),
      blocks,
      performer,
      pathWeight: 1,
      profileWeight: 1,
      exclude: new Set(),
    });
    expect(ranked.some((x) => x.video.performerIds.includes(p))).toBe(false);
    expect(isBlocked(r.items[0].video, blocks)).toBe(true);
  });
});

describe('paths', () => {
  const ctx = (): PathContext => ({
    ds,
    model: foldSignals([], lookup),
    globalFilters: emptyFilters(),
    blocks: emptyBlocks(),
    performer,
    names,
    recent: new Set(),
  });

  it('performer paths only contain that performer', async () => {
    const p = cat.performers[0];
    const path = createPath({ kind: 'performer', performerId: p.id }, p.name);
    const ext = await extendPath(path, ctx());
    expect(ext.append.length).toBeGreaterThan(3);
    for (const id of ext.append) expect(lookup(id)!.performerIds).toContain(p.id);
  });

  it('extensions never repeat queued items and eventually exhaust', async () => {
    const s = cat.series[0];
    let path = createPath({ kind: 'series', seriesId: s.id }, s.title);
    const ext = await extendPath(path, ctx());
    expect(ext.append).toEqual(s.episodes);
    expect(ext.exhausted).toBe(true);
    path = { ...path, queue: ext.append, cursor: ext.cursor, exhausted: ext.exhausted };
    expect((await extendPath(path, ctx())).append).toEqual([]);
  });

  it('for-you keeps producing unique items across extensions', async () => {
    let path = createPath({ kind: 'forYou' }, 'For You');
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const ext = await extendPath(path, ctx());
      for (const id of ext.append) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      path = { ...path, queue: [...path.queue, ...ext.append], cursor: ext.cursor, exhausted: ext.exhausted };
    }
    expect(seen.size).toBeGreaterThan(40);
  });

  it('respects global filters', async () => {
    const f = emptyFilters();
    f.quality = ['4K'];
    const path = createPath({ kind: 'forYou' }, 'For You');
    const ext = await extendPath(path, { ...ctx(), globalFilters: f });
    for (const id of ext.append) expect(lookup(id)!.quality).toBe('4K');
  });
});
