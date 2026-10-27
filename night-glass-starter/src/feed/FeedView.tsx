/**
 * The feed stage. Live drags write straight to the DOM (no React renders mid-gesture);
 * a commit animates the card away, then the verb runs and React shows the next card.
 * Three slots (previous, current, next) are keyed by slot, so a card that flew off
 * never comes back with stale inline styles.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Verb } from '../app/verbs';
import type { Card } from '../data/types';
import { plural } from '../lib/format';
import { isSaved, useStore } from '../state/store';
import { useUI } from '../state/ui';
import { Empty } from '../ui/common';
import { IconCheck, IconHeart } from '../ui/Icons';
import { act, go, switchFeed } from './actions';
import { FeedCard } from './FeedCard';
import { useCurrentFeed } from './feeds';
import { TopBar } from './TopBar';
import { useStageGestures } from './useStageGestures';

const FLY_MS = 220;
const SLIDE_MS = 260;

function FeedEnd({ label, count, slot }: { label: string; count: number; slot: 'current' | 'next' }) {
  const setTab = useUI((s) => s.setTab);
  return (
    <div className={`card${slot === 'next' ? ' card--next' : ''}`} aria-hidden={slot !== 'current'}>
      <div className="feed-end" data-no-gesture>
        {count ? (
          <Empty
            icon={<IconCheck size={26} />}
            title="You’re all caught up"
            body={`That’s all ${plural(count, 'card')} in ${label}.`}
            actions={
              <>
                <button type="button" className="btn btn--primary" onClick={() => go(-count)}>
                  Start over
                </button>
                <button type="button" className="btn" onClick={() => setTab('search')}>
                  Search
                </button>
              </>
            }
          />
        ) : (
          <Empty icon={<IconCheck size={26} />} title={`Nothing in ${label} yet`} body="Cards you save show up here." />
        )}
      </div>
    </div>
  );
}

export function FeedView() {
  const { spec, items, index } = useCurrentFeed();
  const card: Card | undefined = items[index];
  const prev = index > 0 ? items[index - 1] : undefined;
  const next = items[index + 1];
  const overlayHidden = useUI((s) => s.overlayHidden);
  const onFeed = useUI((s) => s.tab === 'feed');
  const liked = useStore((s) => !!card && s.judgments[card.id] === 'like');
  const saved = useStore((s) => !!card && isSaved(s, card.id));

  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [heart, setHeart] = useState<{ x: number; y: number; key: number } | null>(null);

  /** While a card is dragged sideways, the next one waits underneath it. */
  const peek = (on: boolean) => {
    const n = layerRef.current?.querySelector<HTMLElement>('.card--next');
    if (n) n.style.transform = on ? 'none' : '';
  };

  const reset = (animate: boolean) => {
    peek(false);
    for (const el of [layerRef.current, cardRef.current]) {
      if (!el) continue;
      el.style.transition = animate ? 'transform 0.28s var(--ease)' : 'none';
      el.style.transform = '';
    }
    feedbackRef.current?.removeAttribute('data-intent');
    feedbackRef.current?.style.setProperty('--p', '0');
  };

  // A new card on screen starts from rest.
  useLayoutEffect(() => {
    reset(false);
    busy.current = false;
  }, [spec.id, card?.id]);

  useEffect(() => {
    if (card && onFeed) useStore.getState().seen(card.id);
  }, [card, onFeed]);

  const later = (ms: number, fn: () => void) => {
    busy.current = true;
    setTimeout(() => {
      fn();
      busy.current = false;
    }, ms);
  };

  /** Send the card off in the verb's direction, then act. */
  const fly = (verb: Verb, dy = 0) => {
    const el = cardRef.current;
    if (!el || !card || busy.current) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (verb !== 'capture') peek(true);
    el.style.transition = `transform ${FLY_MS + 40}ms var(--ease)`;
    el.style.transform =
      verb === 'like' ? `translate(${w * 1.2}px, ${dy}px) rotate(18deg)` : verb === 'pass' ? `translate(${-w * 1.2}px, ${dy}px) rotate(-18deg)` : verb === 'save' ? `translateY(${-h}px)` : `translateY(${h}px)`;
    const target = card;
    later(FLY_MS, () => act(verb, target, { advance: verb !== 'capture' }));
  };

  /** Move one card down (1) or up (-1) the feed. */
  const slide = (dir: 1 | -1) => {
    const layer = layerRef.current;
    if (!layer || busy.current || (dir < 0 && index === 0) || (dir > 0 && !card)) return reset(true);
    layer.style.transition = `transform ${SLIDE_MS}ms var(--ease)`;
    layer.style.transform = `translateY(${dir > 0 ? -100 : 100}%)`;
    later(SLIDE_MS, () => go(dir));
  };

  const onVerb = (v: Verb) => {
    if (!card) return;
    // Save on the rail toggles in place; the others act and move on, like a swipe.
    if (v === 'save') act('save', card, { advance: false });
    else fly(v);
  };

  useStageGestures(stageRef, {
    enabled: () => onFeed && !busy.current && useUI.getState().sheets.length === 0 && useStore.getState().onboarded,
    scheme: () => (useStore.getState().settings.classic ? 'classic' : 'discovery'),
    onDrag: (s) => {
      const layer = layerRef.current;
      if (s.intent === 'next' || s.intent === 'prev') {
        if (!layer) return;
        const edge = (s.intent === 'prev' && index === 0) || (s.intent === 'next' && !card);
        layer.style.transition = 'none';
        layer.style.transform = `translateY(${edge ? s.dy * 0.25 : s.dy}px)`;
        return;
      }
      if (s.intent === 'pathNext' || s.intent === 'pathPrev') {
        if (!layer) return;
        layer.style.transition = 'none';
        layer.style.transform = `translateX(${s.dx * 0.35}px)`;
        return;
      }
      const el = cardRef.current;
      if (!el || !card) return;
      peek(true);
      el.style.transition = 'none';
      el.style.transform = s.axis === 'x' ? `translate(${s.dx}px, ${s.dy * 0.15}px) rotate(${(s.dx / s.width) * 12}deg)` : `translateY(${s.dy}px)`;
      const fb = feedbackRef.current;
      if (fb) {
        fb.dataset.intent = s.intent;
        fb.style.setProperty('--p', String(s.progress));
      }
    },
    onCommit: (s) => {
      if (s.intent === 'like' || s.intent === 'pass' || s.intent === 'save' || s.intent === 'capture') return card ? fly(s.intent, s.axis === 'x' ? s.dy * 0.15 : 0) : reset(true);
      if (s.intent === 'next') return slide(1);
      if (s.intent === 'prev') return slide(-1);
      reset(true);
      if (s.intent === 'pathNext' || s.intent === 'pathPrev') switchFeed(s.intent === 'pathNext' ? 1 : -1);
    },
    onCancel: () => reset(true),
    onTap: () => useUI.getState().setOverlayHidden(!useUI.getState().overlayHidden),
    onDoubleTap: (x, y) => {
      if (!card) return;
      setHeart({ x, y, key: Date.now() });
      act('like', card, { advance: false });
    },
    onLongPress: () => card && useUI.getState().openSheet({ kind: 'actions', cardId: card.id }),
    onWheel: (dir) => slide(dir),
  });

  // Desktop: → like, ← pass, S save, E explore, ↓/J next, ↑/K previous, Space hides the overlay.
  useEffect(() => {
    if (!onFeed) return;
    const onKey = (e: KeyboardEvent) => {
      if (useUI.getState().sheets.length || !useStore.getState().onboarded || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, button')) return;
      const verb = ({ ArrowRight: 'like', ArrowLeft: 'pass', s: 'save', e: 'capture' } as Record<string, Verb>)[e.key];
      if (verb) {
        e.preventDefault();
        fly(verb);
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        slide(1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        slide(-1);
      } else if (e.key === ' ') {
        e.preventDefault();
        useUI.getState().setOverlayHidden(!useUI.getState().overlayHidden);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!heart) return;
    const t = setTimeout(() => setHeart(null), 800);
    return () => clearTimeout(t);
  }, [heart]);

  const position = items.length ? `${Math.min(index + 1, items.length)}/${items.length}` : '0/0';
  return (
    <div className="feed">
      <div className="stage" ref={stageRef}>
        <div className="stage__layer" ref={layerRef}>
          {prev && <FeedCard key={`prev:${prev.id}`} card={prev} slot="prev" overlayHidden={overlayHidden} />}
          {card ? (
            <FeedCard
              key={`current:${card.id}`}
              ref={cardRef}
              card={card}
              slot="current"
              overlayHidden={overlayHidden}
              liked={liked}
              saved={saved}
              feedbackRef={feedbackRef}
              onVerb={onVerb}
              onMore={() => useUI.getState().openSheet({ kind: 'actions', cardId: card.id })}
              onStep={slide}
            />
          ) : (
            <FeedEnd key="current:end" label={spec.label} count={items.length} slot="current" />
          )}
          {next ? <FeedCard key={`next:${next.id}`} card={next} slot="next" overlayHidden={overlayHidden} /> : card && <FeedEnd key="next:end" label={spec.label} count={items.length} slot="next" />}
        </div>
        {heart && <IconHeart key={heart.key} className="tap-heart" size={96} filled style={{ left: heart.x, top: heart.y }} />}
      </div>
      <TopBar label={spec.label} position={position} hidden={overlayHidden} onFeed={switchFeed} />
    </div>
  );
}
