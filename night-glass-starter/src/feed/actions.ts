/**
 * What the four verbs do. Swipes, the rail, the action sheet and the keyboard all come
 * here, so every way of acting gives the same result, the same toast, and the same Undo.
 */
import { VERBS, type Verb } from '../app/verbs';
import type { Card } from '../data/types';
import { clamp } from '../lib/format';
import { haptic } from '../lib/haptics';
import { isSaved, useStore } from '../state/store';
import { useUI } from '../state/ui';
import { currentFeed, feedList } from './feeds';

/** Move through the current feed; past the last card is the "all caught up" screen. */
export function go(delta: number) {
  const { spec, items, index } = currentFeed();
  useUI.getState().setPosition(spec.id, clamp(index + delta, 0, items.length));
}

export function switchFeed(delta: number) {
  const list = feedList();
  const u = useUI.getState();
  const at = Math.max(0, list.findIndex((f) => f.id === u.feedId));
  u.setFeed(list[(at + delta + list.length) % list.length].id);
}

/** `advance` moves to the next card (swipes do; the rail's Save toggle doesn't). */
export function act(verb: Verb, card: Card, opts: { advance: boolean }) {
  const ui = useUI.getState();
  const store = useStore.getState();
  const { spec, items, index } = currentFeed();
  // Undo puts you back on the card you acted on, in the feed you were in.
  const back = () => {
    const u = useUI.getState();
    u.setFeed(spec.id);
    u.setPosition(spec.id, index);
  };
  const advance = () => {
    if (opts.advance) ui.setPosition(spec.id, Math.min(index + 1, items.length));
  };

  if (verb === 'like' || verb === 'pass') {
    const undo = store.judge(card.id, verb);
    advance();
    ui.toast({ text: VERBS[verb].done, tone: verb, action: { label: 'Undo', run: () => (undo(), back()) } });
    haptic(verb === 'like' ? 'success' : 'light');
    return;
  }
  if (verb === 'save') {
    const on = opts.advance || !isSaved(store, card.id);
    const undo = store.setSaved(card.id, on);
    advance();
    ui.toast({ text: on ? VERBS.save.done : 'Removed from saved', tone: 'save', action: { label: 'Undo', run: () => (undo(), back()) } });
    haptic('light');
    return;
  }
  // capture → Explore: a new feed from the card's first tag.
  const tag = card.tags[0];
  const id = `tag:${tag}`;
  store.addFeed({ id, label: `#${tag}`, tag });
  ui.setFeed(id);
  ui.toast({ text: `${VERBS.capture.done} #${tag}`, tone: 'capture', action: { label: 'Undo', run: back } });
  haptic('light');
}
