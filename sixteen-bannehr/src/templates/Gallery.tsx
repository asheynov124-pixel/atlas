import type { CSSProperties, ReactNode } from 'react';
import { Editable, Page, Picture } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setSlotText } from '../store/book';
import { useItems, priceLabel, parsePrice, safeHref, hostOf } from './items';
import { InlineText } from '../edit/InlineText';
import { ImageTools } from '../edit/ImageTools';
import { updateItem } from '../store/actions';
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

export function ItemCard({ item, index, compact, spreadId }: { item: Item; index: number; compact?: boolean; spreadId?: string }) {
  const editing = useEditing();
  const price = priceLabel(item);
  const meta = [item.brand, price].filter(Boolean).join(' · ');
  const href = safeHref(item.url);
  const edit = (recipe: (it: Item) => void) => updateItem(item.id, recipe);
  return (
    <article className={['card', compact && 'card--compact'].filter(Boolean).join(' ')} data-item={item.id}>
      <div className="card__img">
        <Picture assetId={item.assetId} focal={item.focal} label={item.label} alt={item.name} slip={compact ? 'none' : 'bl'}>
          {editing ? <ImageTools target={{ kind: 'item', itemId: item.id }} compact={compact} /> : null}
        </Picture>
        <span className="card__no" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        {compact ? <ItemExtras item={item} spreadId={spreadId} compact /> : null}
      </div>
      {editing ? (
        <div className="card__fields">
          <InlineText as="h3" className="card__name" value={item.name} onCommit={(v) => edit((it) => void (it.name = v || 'Untitled'))} placeholder="Name" />
          <InlineText className="card__meta" value={item.brand} onCommit={(v) => edit((it) => void (it.brand = v))} placeholder="Maker" />
          <InlineText
            className="card__meta"
            value={item.price === null ? '' : String(item.price)}
            onCommit={(v) => edit((it) => void (it.price = parsePrice(v)))}
            placeholder="Price"
            raw
            inputMode="decimal"
          />
          {!compact ? (
            <>
              <InlineText className="card__meta card__url" value={item.url} onCommit={(v) => edit((it) => void (it.url = v))} placeholder="Link" raw inputMode="url" />
              <InlineText
                className="card__meta"
                value={item.tags.join(', ')}
                onCommit={(v) => edit((it) => void (it.tags = v.split(',').map((t) => t.trim()).filter(Boolean)))}
                placeholder="Tags, with commas"
              />
            </>
          ) : null}
        </div>
      ) : (
        <>
          <h3 className="card__name">{item.name}</h3>
          {meta ? <p className="card__meta">{meta}</p> : null}
          {!compact && href ? (
            <a className="card__meta card__link" href={href} target="_blank" rel="noopener noreferrer">
              {hostOf(href)} ↗
            </a>
          ) : null}
          {!compact && item.tags.length ? <p className="card__tags">{item.tags.join(' · ')}</p> : null}
        </>
      )}
      {compact ? null : <ItemExtras item={item} spreadId={spreadId} />}
    </article>
  );
}

function Grid({ items, offset, cols, align, compact, spreadId }: { items: Item[]; offset: number; cols: number; align: 'start' | 'end'; compact: boolean; spreadId: string }) {
  return (
    <div className="gallery__grid" style={{ '--cols': cols, alignContent: align } as CSSProperties}>
      {items.map((item, i) => (
        <ItemCard key={item.id} item={item} index={offset + i} compact={compact} spreadId={spreadId} />
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
      <Editable as="h2" single className="gallery__title" html={html('title')} onCommit={(h) => setSlotText(spread.id, 'title', h)} placeholder="What are we choosing?" />
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
          <Grid items={first} offset={0} cols={2} align="start" compact={false} spreadId={spread.id} />
          {editing ? <ItemExtras.Add spreadId={spread.id} /> : null}
        </Page>
        {rest.map((chunk, i) => (
          <Page key={i} side="recto">
            <Grid items={chunk} offset={4 + i * 6} cols={2} align="start" compact={false} spreadId={spread.id} />
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
          <Grid items={items.slice(0, g.verso)} offset={0} cols={g.cols} align="end" compact={compact} spreadId={spread.id} />
        </div>
      </Page>
      <Page side="recto">
        <div className="gallery__page gallery__page--recto">
          <Grid items={items.slice(g.verso)} offset={g.verso} cols={g.cols} align="end" compact={compact} spreadId={spread.id} />
          {editing ? <ItemExtras.Add spreadId={spread.id} /> : null}
        </div>
      </Page>
    </>
  );
}
