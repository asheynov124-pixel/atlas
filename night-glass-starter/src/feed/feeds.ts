/** Which feeds exist, which one is showing, and where you are in it. */
import { useMemo } from 'react';
import { APP } from '../app/config';
import { source } from '../data/source';
import type { Card, FeedSpec } from '../data/types';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';

export const FOR_YOU: FeedSpec = { id: 'for-you', label: APP.feedName };
export const SAVED: FeedSpec = { id: 'saved', label: 'Saved' };

const listOf = (hasSaves: boolean, feeds: FeedSpec[]) => [FOR_YOU, ...(hasSaves ? [SAVED] : []), ...feeds];

/** Every feed you can switch to, in switcher order (outside React). */
export function feedList(): FeedSpec[] {
  const s = useStore.getState();
  return listOf(s.saves.length > 0, s.feeds);
}

export function useFeedList(): FeedSpec[] {
  const hasSaves = useStore((s) => s.saves.length > 0);
  const feeds = useStore((s) => s.feeds);
  return useMemo(() => listOf(hasSaves, feeds), [hasSaves, feeds]);
}

export interface CurrentFeed {
  spec: FeedSpec;
  items: Card[];
  /** 0…items.length; items.length is the "all caught up" screen. */
  index: number;
}

/** The feed on screen (outside React), for actions and shortcuts. */
export function currentFeed(): CurrentFeed {
  const s = useStore.getState();
  const u = useUI.getState();
  const spec = feedList().find((f) => f.id === u.feedId) ?? FOR_YOU;
  const items = source.feed(spec, s.saves.map((x) => x.id));
  return { spec, items, index: Math.min(u.positions[spec.id] ?? 0, items.length) };
}

export function useCurrentFeed(): CurrentFeed {
  const list = useFeedList();
  const feedId = useUI((s) => s.feedId);
  const spec = list.find((f) => f.id === feedId) ?? FOR_YOU;
  const saves = useStore((s) => s.saves);
  const savedIds = spec.id === 'saved' ? saves : null;
  const items = useMemo(() => source.feed(spec, (savedIds ?? []).map((x) => x.id)), [spec, savedIds]);
  const index = useUI((s) => Math.min(s.positions[spec.id] ?? 0, items.length));
  return { spec, items, index };
}
