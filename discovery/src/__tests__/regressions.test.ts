// @vitest-environment jsdom
// Regression tests for the independent review's findings.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { useStore, activeData } from '../state/store';
import { mockSource } from '../data/api';
import { ensureBuffer, rebuildAhead, reasonsFor, startPath } from '../state/feed';
import { flushStorage } from '../state/storage';
import { useTaxonomy } from '../state/taxonomy';
import { diffFilters, emptyFilters, mergeFilters } from '../engine/filters';
import { DEFAULT_MOCK_CONFIG } from '../data/mock/mockSource';

const cat = mockSource.catalog;
const forYou = (pid = useStore.getState().activeProfileId) => useStore.getState().data[pid].paths.find((p) => p.id === 'for-you')!;
const settle = async () => {
  for (let i = 0; i < 200; i++) await new Promise((r) => setTimeout(r, 15));
};

beforeEach(async () => {
  await useTaxonomy.getState().load();
  mockSource.configure({ latencyMs: 40, jitterMs: 0, errorRate: 0 });
  useStore.getState().wipeEverything();
  useStore.setState({ incognito: false });
});

afterAll(() => mockSource.configure(DEFAULT_MOCK_CONFIG));

describe('profile isolation under async loads (#1)', () => {
  it('a load started in profile A never lands in profile B', async () => {
    const a = useStore.getState().activeProfileId;
    const b = useStore.getState().createProfile({ name: 'B', emoji: '🌊', color: '#38bdf8' });
    useStore.getState().switchProfile(a);
    const job = ensureBuffer('for-you');
    useStore.getState().switchProfile(b); // switch while A's load is in flight
    await job;
    expect(forYou(b).queue).toHaveLength(0);
    expect(forYou(a).queue.length).toBeGreaterThan(5);
  });

  it('"why am I seeing this" never shows another profile’s reasons', async () => {
    const a = useStore.getState().activeProfileId;
    await ensureBuffer('for-you');
    const id = forYou(a).queue[0];
    expect(reasonsFor('for-you', id).some((r) => r.label === 'Trending mix')).toBe(true);
    useStore.getState().createProfile({ name: 'B', emoji: '🌊', color: '#38bdf8' });
    expect(reasonsFor('for-you', id).some((r) => r.label === 'Trending mix')).toBe(false);
  });
});

describe('stale in-flight loads are discarded (#2)', () => {
  it('a filter applied mid-load governs the clips that arrive', async () => {
    void ensureBuffer('for-you');
    useStore.getState().setFilters({ ...emptyFilters(), quality: ['4K'] });
    rebuildAhead();
    await settle();
    const q = forYou().queue;
    expect(q.length).toBeGreaterThan(5);
    for (const id of q) expect(cat.videoById.get(id)!.quality).toBe('4K');
  });
});

describe('For You is endless (#3)', () => {
  it('keeps going past the size of the catalogue', async () => {
    mockSource.configure({ latencyMs: 0 });
    // The queue trims its oldest 200 entries past 600, so count what was delivered.
    let delivered = 0;
    for (let i = 0; i < 150 && delivered <= cat.videos.length + 60; i++) {
      const before = forYou();
      const index = Math.max(0, before.queue.length - 2);
      useStore.getState().updatePath('for-you', { index });
      await ensureBuffer('for-you');
      const after = forYou();
      delivered += after.queue.length - before.queue.length + (index - after.index);
      expect(after.exhausted).toBe(false);
    }
    expect(delivered).toBeGreaterThan(cat.videos.length);
  });
});

describe('series paths start at the chosen episode (#5)', () => {
  it('plays in order from episode 3', async () => {
    const s = cat.series.find((x) => x.episodes.length >= 5)!;
    const path = startPath({ kind: 'series', seriesId: s.id }, { startWith: [s.episodes[2]] });
    await settle();
    const p = activeData(useStore.getState()).paths.find((x) => x.id === path.id)!;
    expect(p.queue).toEqual(s.episodes);
    expect(p.index).toBe(2);
  });
});

describe('path filter overrides keep following the profile (#6)', () => {
  it('stores only what changed', () => {
    const global = { ...emptyFilters(), exploration: 0.75, preferNew: true };
    const draft = mergeFilters(global, undefined);
    draft.quality = ['4K'];
    const diff = diffFilters(global, draft);
    expect(Object.keys(diff)).toEqual(['quality']);
    const eff = mergeFilters(global, diff);
    expect(eff.exploration).toBe(0.75);
    expect(eff.preferNew).toBe(true);
    const sliderOnly = mergeFilters(global, undefined);
    sliderOnly.exploration = 0.1;
    expect(diffFilters(global, sliderOnly)).toEqual({ exploration: 0.1 });
  });
});

describe('repeated judgements do not stack (#11)', () => {
  it('keeps one judgement per clip, latest wins', () => {
    const v = cat.videos[0];
    const s = useStore.getState();
    s.addSignal('like', v.id);
    s.addSignal('like', v.id);
    s.addSignal('like', v.id);
    expect(activeData(useStore.getState()).signals.filter((x) => x.videoId === v.id)).toHaveLength(1);
    useStore.getState().addSignal('dislike', v.id);
    expect(activeData(useStore.getState()).signals.map((x) => x.kind)).toEqual(['dislike']);
  });
});

describe('incognito writes nothing to disk (#10)', () => {
  it('discards the session’s paths when incognito ends', async () => {
    await flushStorage();
    useStore.getState().setIncognito(true);
    startPath({ kind: 'tags', tagIds: ['neon'] }, { label: 'secret incognito path' });
    await flushStorage();
    expect(localStorage.getItem('ph-discovery') ?? '').not.toContain('secret incognito path');
    useStore.getState().setIncognito(false);
    await settle();
    expect(activeData(useStore.getState()).paths.some((p) => p.label === 'secret incognito path')).toBe(false);
    expect(useStore.getState().incognito).toBe(false);
  });
});
