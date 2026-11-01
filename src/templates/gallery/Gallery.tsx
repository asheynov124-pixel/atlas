import { useState, type CSSProperties } from 'react';
import { isSlotKind, stripHtml } from '@/book/slots';
import type { Item } from '@/book/types';
import { money } from '@/book/words';
import { ItemImage } from '@/reader/ItemImage';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import { addItemToSlot, removeItemFromSlot, toggleFavorite } from '@/state/actions';
import { useUiStore } from '@/state/uiStore';
import { ItemPicker } from '@/features/ItemPicker';
import { ItemSheet } from '@/features/ItemSheet';
import controls from '@/editor/controls.module.css';
import features from '@/features/features.module.css';
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
  const [picker, setPicker] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);

  const gridStyle = { '--cols': cols, '--tile-ratio': ratio } as CSSProperties;

  return (
    <Spread ctx={ctx} label={`Gallery: ${stripHtml(title)}`}>
      <Page side="left">
        <header className={shared.head}>
          <div>
            <p className={[shared.headKicker, 't-label'].join(' ')}>Options</p>
            <RichText as="h2" html={title} className={[shared.headTitle, 't-display'].join(' ')} slotKey="title" placeholder="Title" />
          </div>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{n} {n === 1 ? 'option' : 'options'}</p>
        </header>
        <Grid items={left} style={gridStyle} dense={dense} start={1} ctx={ctx} onEdit={setSheet} onAdd={right.length === 0 ? () => setPicker(true) : undefined} />
      </Page>
      <Page side="right">
        <header className={shared.head}>
          <p className="t-label">{n > half ? `${half + 1}–${n} of ${n}` : ''}</p>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{favs > 0 ? `${favs} favourited` : 'Heart what you love'}</p>
        </header>
        <Grid items={right} style={gridStyle} dense={dense} start={half + 1} ctx={ctx} onEdit={setSheet} onAdd={right.length > 0 || left.length === 0 ? () => setPicker(true) : undefined} />
      </Page>
      {picker && (
        <ItemPicker
          title="Add an option"
          exclude={itemIds}
          newPlaceholder={ctx.ref.chapter.title.toUpperCase()}
          onPick={(id) => addItemToSlot(ctx.ref.spread.id, 'items', id)}
          onClose={() => setPicker(false)}
        />
      )}
      {sheet && <ItemSheet itemId={sheet} onClose={() => setSheet(null)} />}
    </Spread>
  );
}

interface GridProps {
  items: Item[];
  style: CSSProperties;
  dense: boolean;
  start: number;
  ctx: SpreadCtx;
  onEdit: (id: string) => void;
  onAdd?: () => void;
}

function Grid({ items, style, dense, start, ctx, onEdit, onAdd }: GridProps) {
  const compareIds = useUiStore((s) => s.compareIds);
  const toggleCompare = useUiStore((s) => s.toggleCompare);
  if (items.length === 0 && start === 1 && !ctx.editable) return <p className={styles.empty}>No options yet.</p>;
  return (
    <ul className={styles.grid} style={style} data-dense={dense ? 'true' : 'false'}>
      {items.map((item, i) => (
        <li
          className={styles.tile}
          key={item.id}
          data-item-id={item.id}
          data-wide={items.length === 3 && i === 2 ? 'true' : 'false'}
          data-active={item.favorites.adi || item.favorites.sonny || compareIds.includes(item.id) ? 'true' : 'false'}
        >
          <div className={styles.tileImage}>
            <ItemImage item={item} size={dense ? 'tiny' : 'small'} />
            {item.status === 'chosen' && <span className={[styles.chosen, 't-label'].join(' ')}>Chosen</span>}
            {ctx.editable && (
              <span className={features.tileEdit}>
                <button type="button" className={controls.iconButton} onClick={() => onEdit(item.id)} aria-label={`Edit ${item.name}`} title="Edit option" data-testid="item-edit">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M13.5 6.5l3 3" /></svg>
                </button>
                <button type="button" className={controls.iconButton} onClick={() => removeItemFromSlot(ctx.ref.spread.id, 'items', item.id)} aria-label={`Remove ${item.name} from this gallery`} title="Remove from gallery">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </span>
            )}
          </div>
          <p className={styles.name}>
            <span>
              <span className="t-label" style={{ marginRight: '0.6em' }}>{String(start + i).padStart(2, '0')}</span>
              {item.name}
            </span>
            <span className={features.tileActions}>
              <HeartButton item={item} />
              <button
                type="button"
                className={[controls.iconButton, features.compareButton].join(' ')}
                aria-pressed={compareIds.includes(item.id)}
                onClick={() => toggleCompare(item.id)}
                aria-label={compareIds.includes(item.id) ? `Stop comparing ${item.name}` : `Compare ${item.name}`}
                title={compareIds.length >= 3 && !compareIds.includes(item.id) ? 'Three at a time' : 'Compare'}
                data-testid="compare-toggle"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="7" height="14" /><rect x="14" y="5" width="7" height="14" /></svg>
              </button>
            </span>
          </p>
          <p className={[styles.meta, 't-label'].join(' ')}>
            {item.brand && <span>{item.brand}</span>}
            {item.price != null && <span>{money(item.price, item.currency)}</span>}
            {!item.brand && item.price == null && item.tags.slice(0, 2).map((t) => <span key={t}>{t}</span>)}
          </p>
        </li>
      ))}
      {ctx.editable && onAdd && (
        <li className={styles.tile}>
          <button type="button" className={features.addTile} onClick={onAdd} data-testid="gallery-add">
            <span className={controls.ghost}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Add an option
            </span>
          </button>
        </li>
      )}
    </ul>
  );
}

/** Heart for the person editing; shows both people's hearts. Asks who is editing if nobody has said. */
export function HeartButton({ item }: { item: Item }) {
  const author = useUiStore((s) => s.author);
  const openAuthorPrompt = useUiStore((s) => s.openAuthorPrompt);
  const mine = author ? item.favorites[author] : false;
  const label = `${mine ? 'Unfavourite' : 'Favourite'} ${item.name}${item.favorites.adi ? ' (Adi loves it)' : ''}${item.favorites.sonny ? ' (Sonny loves it)' : ''}`;
  return (
    <button
      type="button"
      className={[controls.iconButton, features.heartButton].join(' ')}
      data-adi={item.favorites.adi ? 'true' : 'false'}
      data-sonny={item.favorites.sonny ? 'true' : 'false'}
      aria-pressed={mine}
      aria-label={label}
      title={label}
      onClick={() => (author ? toggleFavorite(item.id, author) : openAuthorPrompt('sign'))}
      data-testid="heart"
    >
      <HeartIcon outline={!item.favorites.adi && !item.favorites.sonny} />
    </button>
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
      <defs>
        <linearGradient id="heart-two" x1="0" x2="1">
          <stop offset="0.5" stopColor="var(--olive)" />
          <stop offset="0.5" stopColor="var(--clay)" />
        </linearGradient>
      </defs>
      <path d="M12 21s-7.5-4.6-9.5-9.2C1 8 3.5 4.5 7 4.5c2 0 3.5 1 5 3 1.5-2 3-3 5-3 3.5 0 6 3.5 4.5 7.3C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}
