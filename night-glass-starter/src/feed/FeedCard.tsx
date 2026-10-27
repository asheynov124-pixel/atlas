/** One card: full-bleed media, drag stamps, the info block bottom-left and the action rail bottom-right. */
import { forwardRef, type ReactNode, type Ref } from 'react';
import { VERBS, VERB_ORDER, type Verb } from '../app/verbs';
import type { Card } from '../data/types';
import { duration } from '../lib/format';
import { Art } from '../ui/Art';
import { IconBookmark, IconChevron, IconDots, IconHeart, IconTarget, IconX } from '../ui/Icons';

export type Slot = 'prev' | 'current' | 'next';

interface Props {
  card: Card;
  slot: Slot;
  overlayHidden: boolean;
  liked?: boolean;
  saved?: boolean;
  feedbackRef?: Ref<HTMLDivElement>;
  onVerb?: (v: Verb) => void;
  onMore?: () => void;
  onStep?: (delta: 1 | -1) => void;
}

const ICON: Record<Verb, (on: boolean) => ReactNode> = {
  like: (on) => <IconHeart size={26} filled={on} />,
  pass: () => <IconX size={26} />,
  save: (on) => <IconBookmark size={25} filled={on} />,
  capture: () => <IconTarget size={26} />,
};

export const FeedCard = forwardRef<HTMLElement, Props>(function FeedCard({ card, slot, overlayHidden, liked, saved, feedbackRef, onVerb, onMore, onStep }, ref) {
  const current = slot === 'current';
  return (
    <article ref={ref} className={`card${current ? '' : ` card--${slot}`}`} aria-hidden={!current} aria-label={current ? card.title : undefined}>
      <Art card={card} />
      {current && (
        <div className="feedback" ref={feedbackRef} aria-hidden="true">
          {VERB_ORDER.map((v) => (
            <span key={v} className={`stamp stamp--${v}`} data-verb={v}>
              {VERBS[v].stamp}
            </span>
          ))}
        </div>
      )}
      <div className={`card__overlay${overlayHidden ? ' card__overlay--hidden' : ''}`}>
        <div className="card__info">
          <span className="creator-chip">
            <span className="creator-chip__dot" />
            {card.creator}
          </span>
          <h2 className="card__title">{card.title}</h2>
          <div className="card__tags">
            {card.tags.map((t) => (
              <span key={t} className="tag-chip">
                #{t}
              </span>
            ))}
            <span className="card__meta">
              {card.quality} · {duration(card.seconds)}
            </span>
          </div>
        </div>
        {current && (
          <div className="rail" data-no-gesture>
            {VERB_ORDER.map((v) => {
              const on = v === 'like' ? !!liked : v === 'save' ? !!saved : false;
              return (
                <button key={v} type="button" className={`rail-btn rail-btn--${v}${v === 'save' && on ? ' rail-btn--on' : ''}`} data-verb={v} aria-pressed={v === 'like' || v === 'save' ? on : undefined} onClick={() => onVerb?.(v)}>
                  <span className="rail-btn__icon">{ICON[v](on)}</span>
                  <span className="rail-btn__label">{VERBS[v].label}</span>
                </button>
              );
            })}
            <button type="button" className="rail-btn" onClick={onMore}>
              <span className="rail-btn__icon">
                <IconDots size={24} />
              </span>
              <span className="rail-btn__label">More</span>
            </button>
            <div className="rail__mini">
              <button type="button" aria-label="Previous card" onClick={() => onStep?.(-1)}>
                <IconChevron dir="up" size={18} />
              </button>
              <button type="button" aria-label="Next card" onClick={() => onStep?.(1)}>
                <IconChevron dir="down" size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
});
