/** Library: what you saved, liked, and saw, each as a grid, with a way to play Saved as a feed. */
import { useMemo, useState } from 'react';
import { source } from '../data/source';
import { CATALOG } from '../data/mock';
import type { Card } from '../data/types';
import { timeAgo } from '../lib/format';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { Empty, Segmented } from '../ui/common';
import { IconBookmark, IconClock, IconHeart, IconPlay } from '../ui/Icons';
import { Tile } from '../ui/Tile';
import { FOR_YOU, SAVED } from '../feed/feeds';

type Seg = 'saved' | 'liked' | 'history';

export function LibraryView() {
  const [seg, setSeg] = useState<Seg>('saved');
  const [newest, setNewest] = useState(true);
  const saves = useStore((s) => s.saves);
  const history = useStore((s) => s.history);
  const judgments = useStore((s) => s.judgments);
  const ui = useUI.getState;

  const rows = useMemo(() => {
    const at = (list: { id: string; at: number }[]) => list.map((x) => ({ card: source.get(x.id), at: x.at })).filter((x): x is { card: Card; at: number } => !!x.card);
    const list =
      seg === 'saved'
        ? at(saves)
        : seg === 'history'
          ? at(history)
          : Object.entries(judgments)
              .filter(([, v]) => v === 'like')
              .map(([id]) => ({ card: source.get(id), at: history.find((h) => h.id === id)?.at ?? 0 }))
              .filter((x): x is { card: Card; at: number } => !!x.card);
    return newest ? list : [...list].reverse();
  }, [seg, saves, history, judgments, newest]);

  const open = (id: string) => {
    const u = ui();
    if (seg === 'saved') {
      u.setFeed(SAVED.id);
      u.setPosition(SAVED.id, Math.max(0, saves.findIndex((s) => s.id === id)));
    } else {
      u.setFeed(FOR_YOU.id);
      u.setPosition(FOR_YOU.id, Math.max(0, CATALOG.findIndex((c) => c.id === id)));
    }
    u.setTab('feed');
  };

  const empty = {
    saved: { icon: <IconBookmark size={26} />, title: 'Nothing saved yet', body: 'Swipe up on a card, or tap Save, to keep it here.' },
    liked: { icon: <IconHeart size={26} />, title: 'No likes yet', body: 'Swipe right on a card you like, or double-tap it.' },
    history: { icon: <IconClock size={26} />, title: 'No history yet', body: 'Cards you’ve seen appear here, newest first.' },
  }[seg];

  return (
    <div className="page">
      <div className="page__head">
        <h1>Library</h1>
      </div>
      <Segmented
        label="Library sections"
        value={seg}
        onChange={setSeg}
        options={[
          { id: 'saved', label: 'Saved' },
          { id: 'liked', label: 'Liked' },
          { id: 'history', label: 'History' },
        ]}
      />
      {rows.length ? (
        <>
          <div className="row row--split">
            <span className="chip chip--active">
              <span className="chip__body">All {rows.length}</span>
            </span>
            <button type="button" className="link" onClick={() => setNewest((v) => !v)}>
              {newest ? 'Newest first' : 'Oldest first'}
            </button>
          </div>
          {seg === 'saved' && (
            <div className="row">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  const u = ui();
                  u.setFeed(SAVED.id);
                  u.setPosition(SAVED.id, 0);
                  u.setTab('feed');
                }}
              >
                <IconPlay size={18} /> Play as feed
              </button>
            </div>
          )}
          <div className="grid">
            {rows.map(({ card, at }) => (
              <Tile key={card.id} card={card} meta={at ? `${timeAgo(at)} · ${card.creator}` : card.creator} onOpen={() => open(card.id)} />
            ))}
          </div>
        </>
      ) : (
        <Empty
          icon={empty.icon}
          title={empty.title}
          body={empty.body}
          actions={
            <button type="button" className="btn btn--primary" onClick={() => ui().setTab('feed')}>
              Go to the feed
            </button>
          }
        />
      )}
    </div>
  );
}
