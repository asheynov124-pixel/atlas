/** Renders every open sheet, bottom to top. */
import { VERBS, VERB_ORDER, type Verb } from '../app/verbs';
import { source } from '../data/source';
import { act, go } from '../feed/actions';
import { currentFeed, useFeedList } from '../feed/feeds';
import { useUI, type SheetSpec } from '../state/ui';
import { IconBan, IconBookmark, IconBranch, IconCheck, IconChevron, IconEyeOff, IconHeart, IconLayers, IconLink, IconTarget, IconX } from './Icons';
import { MenuItem, Sheet } from './Sheet';

const VERB_ICON: Record<Verb, typeof IconHeart> = { like: IconHeart, pass: IconX, save: IconBookmark, capture: IconTarget };

function ActionSheet({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const card = source.get(cardId);
  const openSheet = useUI((s) => s.openSheet);
  if (!card) return null;
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Sheet
      title={card.title}
      subtitle={`${card.creator} · ${card.tags.map((t) => `#${t}`).join(' ')}`}
      onClose={onClose}
      footer={
        <div className="menu__nav">
          <button type="button" className="btn" onClick={run(() => go(-1))}>
            <IconChevron dir="up" size={18} /> Previous
          </button>
          <button type="button" className="btn" onClick={run(() => go(1))}>
            <IconChevron dir="down" size={18} /> Next
          </button>
          <button type="button" className="btn" onClick={run(() => openSheet({ kind: 'feeds' }))}>
            <IconLayers size={18} /> Feeds
          </button>
        </div>
      }
    >
      <div className="menu__quick">
        {VERB_ORDER.map((v) => {
          const Icon = VERB_ICON[v];
          return (
            <button key={v} type="button" className={`quick quick--${v}`} data-verb={v} onClick={run(() => act(v, card, { advance: v !== 'capture' }))}>
              <Icon size={24} />
              <span>{VERBS[v].label}</span>
            </button>
          );
        })}
      </div>
      <MenuItem icon={<IconBranch />} label="More like this…" hint={`Start a feed from #${card.tags[0]}`} onClick={run(() => act('capture', card, { advance: false }))} />
      <MenuItem icon={<IconEyeOff />} label="Hide overlay" hint="Tap the card to bring it back" onClick={run(() => useUI.getState().setOverlayHidden(true))} />
      <MenuItem
        icon={<IconLink />}
        label="Copy link"
        hint="Share this card"
        onClick={run(() => {
          void navigator.clipboard?.writeText(`${location.origin}${location.pathname}#${card.id}`).then(
            () => useUI.getState().toast({ text: 'Link copied' }),
            () => useUI.getState().toast({ text: 'Couldn’t copy the link', tone: 'error' }),
          );
        })}
      />
      <div data-tone="danger">
        <MenuItem icon={<IconBan />} label="Not interested" hint="Pass, and keep going" tone="danger" onClick={run(() => act('pass', card, { advance: true }))} />
      </div>
    </Sheet>
  );
}

function FeedsSheet({ onClose }: { onClose: () => void }) {
  const list = useFeedList();
  useUI((s) => s.feedId); // re-render when the feed changes
  const current = currentFeed().spec.id;
  return (
    <Sheet title="Feeds" subtitle="Explore a card to start a new one. Swipe sideways from the edge to switch." onClose={onClose}>
      {list.map((f) => (
        <MenuItem
          key={f.id}
          icon={f.id === current ? <IconCheck /> : <IconLayers />}
          label={f.label}
          hint={f.id === 'for-you' ? 'Everything, in order' : f.id === 'saved' ? 'What you saved' : `Cards tagged #${f.tag}`}
          tone={f.id === current ? 'accent' : undefined}
          onClick={() => {
            useUI.getState().setFeed(f.id);
            onClose();
          }}
        />
      ))}
    </Sheet>
  );
}

const DIR: Record<Verb, 'right' | 'left' | 'up' | 'down'> = { like: 'right', pass: 'left', save: 'up', capture: 'down' };

function GesturesSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="How swiping works" subtitle="Every swipe has a button too, and every one can be undone." onClose={onClose}>
      <div className="gesture-list">
        {VERB_ORDER.map((v) => (
          <div key={v} className={`gesture gesture--${v}`} data-verb={v}>
            <span className="gesture__dir" aria-hidden="true">
              <IconChevron dir={DIR[v]} size={20} />
            </span>
            <span className="gesture__text">
              <span>
                {VERBS[v].swipe} · {VERBS[v].label}
              </span>
              <small>{VERBS[v].hint}</small>
            </span>
          </div>
        ))}
        <div className="gesture">
          <span className="gesture__dir" aria-hidden="true">
            <IconChevron dir="up" size={20} />
          </span>
          <span className="gesture__text">
            <span>From the edge, or with two fingers</span>
            <small>Up and down: next and previous card. Sideways: switch feed.</small>
          </span>
        </div>
        <div className="gesture">
          <span className="gesture__dir" aria-hidden="true">
            <IconHeart size={20} />
          </span>
          <span className="gesture__text">
            <span>Double-tap · long-press · tap</span>
            <small>Like in place · more actions · hide the overlay</small>
          </span>
        </div>
      </div>
      <p className="muted small">On a keyboard: → like, ← pass, S save, E explore, ↑↓ move, Space hides the overlay.</p>
    </Sheet>
  );
}

function render(s: SheetSpec, onClose: () => void) {
  if (s.kind === 'actions') return <ActionSheet cardId={s.cardId} onClose={onClose} />;
  if (s.kind === 'feeds') return <FeedsSheet onClose={onClose} />;
  return <GesturesSheet onClose={onClose} />;
}

export function SheetHost() {
  const sheets = useUI((s) => s.sheets);
  const close = useUI((s) => s.closeSheet);
  return (
    <>
      {sheets.map((s, i) => (
        <div key={`${s.kind}-${i}`}>{render(s, close)}</div>
      ))}
    </>
  );
}
