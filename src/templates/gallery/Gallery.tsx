import type { CSSProperties } from 'react';
import { isSlotKind, stripHtml } from '@/book/slots';
import type { Item } from '@/book/types';
import { money } from '@/book/words';
import { ItemImage } from '@/reader/ItemImage';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import shared from '../shared.module.css';
import styles from './Gallery.module.css';

export function GalleryTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const title = isSlotKind(slots.title, 'text') ? slots.title.html : '';
  const itemIds = isSlotKind(slots.items, 'items') ? slots.items.itemIds : [];
  const items = itemIds.map((id) => ctx.book.items[id]).filter((i): i is Item => !!i && !i.archived);
  const n = items.length;
  const half = Math.ceil(n / 2);
  const perPage = Math.max(half, 1);
  // Layouts that fill a page without orphans: see PLAN.md §5.
  const cols = perPage <= 1 ? 1 : perPage <= 4 ? 2 : perPage <= 9 ? 3 : 4;
  const dense = cols >= 3;
  const ratio = perPage === 1 ? '3 / 2' : perPage === 2 ? '3 / 4' : cols >= 3 ? '1 / 1' : '4 / 3';
  const left = items.slice(0, half);
  const right = items.slice(half);
  const favs = items.filter((i) => i.favorites.adi || i.favorites.sonny).length;

  const gridStyle = { '--cols': cols, '--tile-ratio': ratio } as CSSProperties;

  return (
    <Spread ctx={ctx} label={`Gallery: ${stripHtml(title)}`}>
      <Page side="left">
        <header className={shared.head}>
          <div>
            <p className={[shared.headKicker, 't-label'].join(' ')}>Options</p>
            <RichText as="h2" html={title} className={[shared.headTitle, 't-display'].join(' ')} editable={ctx.editable} placeholder="Title" />
          </div>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{n} {n === 1 ? 'option' : 'options'}</p>
        </header>
        <Grid items={left} style={gridStyle} dense={dense} start={1} />
      </Page>
      <Page side="right">
        <header className={shared.head}>
          <p className="t-label">{n > half ? `${half + 1}–${n} of ${n}` : ''}</p>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{favs > 0 ? `${favs} favourited` : 'Heart what you love'}</p>
        </header>
        <Grid items={right} style={gridStyle} dense={dense} start={half + 1} />
      </Page>
    </Spread>
  );
}

function Grid({ items, style, dense, start }: { items: Item[]; style: CSSProperties; dense: boolean; start: number }) {
  if (items.length === 0 && start === 1) return <p className={styles.empty}>No options yet.</p>;
  return (
    <ul className={styles.grid} style={style} data-dense={dense ? 'true' : 'false'}>
      {items.map((item, i) => (
        <li className={styles.tile} key={item.id} data-item-id={item.id} data-wide={items.length === 3 && i === 2 ? 'true' : 'false'}>
          <div className={styles.tileImage}>
            <ItemImage item={item} size={dense ? 'tiny' : 'small'} />
            {item.status === 'chosen' && <span className={[styles.chosen, 't-label'].join(' ')}>Chosen</span>}
          </div>
          <p className={styles.name}>
            <span>
              <span className="t-label" style={{ marginRight: '0.6em' }}>{String(start + i).padStart(2, '0')}</span>
              {item.name}
            </span>
            <Hearts item={item} />
          </p>
          <p className={[styles.meta, 't-label'].join(' ')}>
            {item.brand && <span>{item.brand}</span>}
            {item.price != null && <span>{money(item.price, item.currency)}</span>}
            {!item.brand && item.price == null && item.tags.slice(0, 2).map((t) => <span key={t}>{t}</span>)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function Hearts({ item }: { item: Item }) {
  if (!item.favorites.adi && !item.favorites.sonny) return null;
  return (
    <span className={styles.hearts} aria-label={`Favourited by ${[item.favorites.adi && 'Adi', item.favorites.sonny && 'Sonny'].filter(Boolean).join(' and ')}`}>
      {item.favorites.adi && <HeartIcon className={[styles.heart, styles.heartAdi].join(' ')} />}
      {item.favorites.sonny && <HeartIcon className={[styles.heart, styles.heartSonny].join(' ')} />}
    </span>
  );
}

export function HeartIcon({ className, outline }: { className?: string; outline?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" style={outline ? { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 } : undefined}>
      <path d="M12 21s-7.5-4.6-9.5-9.2C1 8 3.5 4.5 7 4.5c2 0 3.5 1 5 3 1.5-2 3-3 5-3 3.5 0 6 3.5 4.5 7.3C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}
