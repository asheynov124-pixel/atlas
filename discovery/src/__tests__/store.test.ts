// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, activeData } from '../state/store';
import { mockSource } from '../data/api';
import { beginView, endView, trackProgress, refreshAhead } from '../state/feed';
import { tasteInterests } from '../engine/paths';
import { foldSignals } from '../engine/learning';

const cat = mockSource.catalog;
const v = (i: number) => cat.videos[i];

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  useStore.getState().wipeEverything();
  useStore.setState({ incognito: false });
  useStore.getState().setSettings({ pauseLearning: false });
});

describe('profiles are full silos', () => {
  it('keeps signals, saves, and paths separate', () => {
    const s = useStore.getState();
    s.rememberContent([v(1), v(2)]);
    s.addSignal('like', v(1).id);
    s.addSave({ videoId: v(1).id });
    const main = s.activeProfileId;
    const other = s.createProfile({ name: 'Late night', emoji: '🔥', color: '#f472b6' });
    expect(useStore.getState().activeProfileId).toBe(other);
    expect(activeData(useStore.getState()).signals).toHaveLength(0);
    expect(activeData(useStore.getState()).saves).toHaveLength(0);
    useStore.getState().addSignal('dislike', v(2).id);
    useStore.getState().switchProfile(main);
    const d = activeData(useStore.getState());
    expect(d.signals.map((x) => x.kind)).toEqual(['like']);
  });

  it('does not leak a view’s implicit signal into a profile switched to mid-clip', () => {
    const s = useStore.getState();
    s.rememberContent([v(3)]);
    const other = s.createProfile({ name: 'B', emoji: '🌊', color: '#38bdf8' });
    s.switchProfile('main');
    vi.useFakeTimers({ toFake: ['Date'] });
    beginView(v(3).id);
    trackProgress(v(3).id, v(3).clipDuration, false); // watched to the end
    vi.setSystemTime(Date.now() + 30_000); // a real view, not a phantom
    useStore.getState().switchProfile(other);
    endView('leave');
    expect(useStore.getState().data[other].signals).toHaveLength(0);
    // Control: the same view without a profile switch does produce a watch signal.
    useStore.getState().switchProfile('main');
    beginView(v(3).id);
    trackProgress(v(3).id, v(3).clipDuration, false);
    vi.setSystemTime(Date.now() + 30_000);
    endView('advance');
    expect(activeData(useStore.getState()).signals.map((x) => x.kind)).toContain('watch');
  });
});

describe('privacy controls', () => {
  it('incognito records nothing', () => {
    useStore.getState().setIncognito(true);
    expect(useStore.getState().addSignal('like', v(1).id)).toBeNull();
    beginView(v(1).id);
    endView();
    expect(activeData(useStore.getState()).history).toHaveLength(0);
  });

  it('pause learning keeps history but stops signals', () => {
    useStore.getState().setSettings({ pauseLearning: true });
    expect(useStore.getState().addSignal('like', v(1).id)).toBeNull();
    useStore.getState().addHistory({ videoId: v(1).id, at: Date.now(), pathId: 'for-you', pathLabel: 'For You', pathKind: 'forYou', pathIndex: 0, watched: 3, actions: [] });
    expect(activeData(useStore.getState()).history).toHaveLength(1);
  });

  it('un-saving removes the save signal too', () => {
    const s = useStore.getState();
    s.rememberContent([v(4)]);
    s.addSave({ videoId: v(4).id });
    s.addSignal('save', v(4).id);
    useStore.getState().removeSave(v(4).id);
    expect(activeData(useStore.getState()).signals.some((x) => x.kind === 'save')).toBe(false);
  });

  it('treats sub-250ms views as phantoms (no history, no skip)', () => {
    useStore.getState().rememberContent([v(5)]);
    beginView(v(5).id);
    endView('advance');
    const d = activeData(useStore.getState());
    expect(d.history).toHaveLength(0);
    expect(d.signals).toHaveLength(0);
  });
});

describe('near-real-time refinement', () => {
  it('re-orders the buffer ahead after a like, leaving the next two alone', () => {
    const s = useStore.getState();
    const queue = cat.videos.slice(0, 30);
    s.rememberContent(queue);
    s.updatePath('for-you', { queue: queue.map((x) => x.id), index: 0 });
    const target = cat.videos.find((x, i) => i > 10 && i < 30 && x.performerIds.length === 1)!;
    const sameLead = cat.videos.filter((x) => x.performerIds[0] === target.performerIds[0] && x.id !== target.id).slice(0, 4);
    s.rememberContent(sameLead);
    for (const x of sameLead) useStore.getState().addSignal('like', x.id);
    const before = activeData(useStore.getState()).paths[0].queue.slice();
    refreshAhead('for-you');
    const after = activeData(useStore.getState()).paths[0].queue;
    expect(after.slice(0, 3)).toEqual(before.slice(0, 3));
    expect(after.indexOf(target.id)).toBeLessThan(before.indexOf(target.id));
  });
});

describe('multi-interest For You', () => {
  it('finds one interest per distinct taste cluster', () => {
    const p1 = cat.performers[0].id;
    const p2 = cat.performers[5].id;
    const liked = [
      ...cat.videos.filter((x) => x.performerIds.length === 1 && x.performerIds[0] === p1).slice(0, 5),
      ...cat.videos.filter((x) => x.performerIds.length === 1 && x.performerIds[0] === p2).slice(0, 5),
    ];
    const m = foldSignals(liked.map((x, i) => ({ id: `s${i}`, kind: 'like' as const, videoId: x.id, at: Date.now(), value: 1 })), (id) => cat.videoById.get(id));
    const interests = tasteInterests(m, (id) => cat.videoById.get(id));
    expect(interests.length).toBeGreaterThanOrEqual(2);
  });
});
