import { beforeEach, describe, expect, it } from 'vitest';
import { act, go, switchFeed } from '../feed/actions';
import { currentFeed, feedList } from '../feed/feeds';
import { CATALOG, makeCatalog } from '../data/mock';
import { source } from '../data/source';
import { useStore } from './store';
import { useUI } from './ui';

beforeEach(() => {
  useStore.getState().reset();
  useUI.setState({ feedId: 'for-you', positions: {}, toasts: [], sheets: [] });
});

describe('mock data', () => {
  it('is the same on every run, so screenshots stay stable', () => {
    expect(makeCatalog()).toEqual(makeCatalog());
    expect(CATALOG).toHaveLength(40);
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(40);
    expect(new Set(CATALOG.map((c) => c.title)).size).toBe(40);
  });
});

describe('verbs', () => {
  it('like and pass advance, toast, and undo back to the card', () => {
    const card = CATALOG[0];
    act('like', card, { advance: true });
    expect(useStore.getState().judgments[card.id]).toBe('like');
    expect(currentFeed().index).toBe(1);
    const toast = useUI.getState().toasts.at(-1)!;
    expect(toast).toMatchObject({ text: 'Liked', tone: 'like' });
    toast.action!.run();
    expect(useStore.getState().judgments[card.id]).toBeUndefined();
    expect(currentFeed().index).toBe(0);
  });

  it('save from a swipe always saves; from the rail it toggles', () => {
    const card = CATALOG[2];
    act('save', card, { advance: false });
    expect(useStore.getState().saves.map((s) => s.id)).toEqual([card.id]);
    act('save', card, { advance: false });
    expect(useStore.getState().saves).toEqual([]);
    act('save', card, { advance: true });
    act('save', card, { advance: true });
    expect(useStore.getState().saves.map((s) => s.id)).toEqual([card.id]);
  });

  it('explore starts a feed from the first tag, and Undo returns to where you were', () => {
    go(3);
    const card = currentFeed().items[3];
    act('capture', card, { advance: false });
    const now = currentFeed();
    expect(now.spec).toMatchObject({ id: `tag:${card.tags[0]}`, tag: card.tags[0] });
    expect(now.items.every((c) => c.tags.includes(card.tags[0]))).toBe(true);
    useUI.getState().toasts.at(-1)!.action!.run();
    expect(currentFeed()).toMatchObject({ spec: { id: 'for-you' }, index: 3 });
  });
});

describe('feeds', () => {
  it('Saved appears once something is saved; switching wraps around', () => {
    expect(feedList().map((f) => f.id)).toEqual(['for-you']);
    act('save', CATALOG[5], { advance: false });
    expect(feedList().map((f) => f.id)).toEqual(['for-you', 'saved']);
    switchFeed(1);
    expect(currentFeed().spec.id).toBe('saved');
    switchFeed(1);
    expect(currentFeed().spec.id).toBe('for-you');
    switchFeed(-1);
    expect(currentFeed().spec.id).toBe('saved');
  });

  it('the end of a feed is the "all caught up" screen, never past it', () => {
    go(1000);
    expect(currentFeed().index).toBe(CATALOG.length);
    go(-1000);
    expect(currentFeed().index).toBe(0);
  });

  it('search matches titles, creators and tags, and narrows by every chosen tag', () => {
    const tag = CATALOG[0].tags[0];
    expect(source.search('', [tag]).every((c) => c.tags.includes(tag))).toBe(true);
    expect(source.search(CATALOG[0].creator.toLowerCase(), []).length).toBeGreaterThan(0);
    expect(source.search('zzzz-no-match', [])).toEqual([]);
  });
});
