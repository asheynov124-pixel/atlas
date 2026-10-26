import type { CSSProperties, ReactNode } from 'react';
import { Editable, Page, Picture } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setSlotText } from '../store/book';
import { useItems, priceLabel } from './items';
import { numberWord } from '../model/pages';
import { ItemExtras } from '../features/ItemExtras';
import type { Item, TextSlot } from '../model/types';

// The grid is sized from the item count alone, in units of the page width, so it lays
// out identically at every window size. Header rows take part of the verso.
const AREA_W = 0.84;
const AREA_H = 1.118;
const GAP = 0.026;
const CAPTION = 0.052;

export function galleryGrid(n: number) {
  const header = n > 12 ? 0.2 : 0.34;
  // A handful of options sits on the recto alone, large, with the verso as its title page.
  if (n <= 3) return { cols: Math.max(2, n), verso: 0, recto: n, header };
  for (let cols = 2; cols <= 7; cols++) {
    const cw = (AREA_W - (cols - 1) * GAP) / cols;
    const ch = cw * 1.25 + CAPTION;
    const rows = (h: number) => Math.max(0, Math.floor((h + GAP) / (ch + GAP)));
    const capV = cols * rows(AREA_H - header);
    const capR = cols * rows(AREA_H);
    if (n <= capR) return { cols, verso: 0, recto: n, header };
    if (n <= capV + capR) {
      const verso = Math.min(capV, Math.ceil((n - capR) / cols) * cols);
      return { cols, verso, recto: n - verso, header };
    }
  }
  return { cols: 7, verso: Math.floor(n / 2), recto: n - Math.floor(n / 2), header };
}

export function countWords(n: number): string {
  return n <= 20 ? numberWord(n).toLowerCase() : String(n);
}

export function ItemCard({ item, index, compact }: { item: Item; index: number; compact?: boolean }) {
  const price = priceLabel(item);
  const meta = [item.brand, price].filter(Boolean).join(' · ');
  return (
    <article className={['card', compact && 'card--compact'].filter(Boolean).join(' ')} data-item={item.id}>
      <div className="card__img">
        <Picture assetId={item.assetId} focal={item.focal} label={item.label} alt={item.name} slip={compact ? 'none' : 'bl'} />
        <span className="card__no" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>
      <h4 className="card__name">{item.name}</h4>
      {meta ? <p className="card__meta">{meta}</p> : null}
      <ItemExtras item={item} />
    </article>
  );
}

function Grid({ items, offset, cols, align, compact }: { items: Item[]; offset: number; cols: number; align: 'start' | 'end'; compact: boolean }) {
  return (
    <div className="gallery__grid" style={{ '--cols': cols, alignContent: align } as CSSProperties}>
      {items.map((item, i) => (
        <ItemCard key={item.id} item={item} index={offset + i} compact={compact} />
      ))}
    </div>
  );
}

export function Gallery() {
  const { placed, layout } = useSpread();
  const editing = useEditing();
  const { spread } = placed;
  const items = useItems(spread);
  const html = (k: string) => (spread.slots[k] as TextSlot | undefined)?.html ?? '';
  const n = items.length;

  const header: ReactNode = (
    <header className="gallery__head">
      <p className="gallery__count sc">
        {n ? `${countWords(n)} ${n === 1 ? 'option' : 'options'}` : 'No options yet'}
      </p>
      <Editable as="h3" single className="gallery__title" html={html('title')} onCommit={(h) => setSlotText(spread.id, 'title', h)} placeholder="What are we choosing?" />
      <Editable as="div" className="gallery__intro" html={html('body')} onCommit={(h) => setSlotText(spread.id, 'body', h)} placeholder="A line about the choice (optional)" />
    </header>
  );

  if (layout === 'phone') {
    const first = items.slice(0, 4);
    const rest: Item[][] = [];
    for (let i = 4; i < n; i += 6) rest.push(items.slice(i, i + 6));
    return (
      <>
        <Page side="verso">
          {header}
          <Grid items={first} offset={0} cols={2} align="start" compact={false} />
          {editing ? <ItemExtras.Add spreadId={spread.id} /> : null}
        </Page>
        {rest.map((chunk, i) => (
          <Page key={i} side="recto">
            <Grid items={chunk} offset={4 + i * 6} cols={2} align="start" compact={false} />
          </Page>
        ))}
      </>
    );
  }

  const g = galleryGrid(n);
  const compact = g.cols >= 5;
  return (
    <>
      <Page side="verso">
        <div className="gallery__page" style={{ '--head': `${(g.header / AREA_H) * 100}%` } as CSSProperties}>
          {header}
          <Grid items={items.slice(0, g.verso)} offset={0} cols={g.cols} align="end" compact={compact} />
        </div>
      </Page>
      <Page side="recto">
        <div className="gallery__page gallery__page--recto">
          <Grid items={items.slice(g.verso)} offset={g.verso} cols={g.cols} align="end" compact={compact} />
          {editing ? <ItemExtras.Add spreadId={spread.id} /> : null}
        </div>
      </Page>
    </>
  );
}
