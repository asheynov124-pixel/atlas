import { useMemo, useState } from 'react';
import type { Item } from '@/book/types';
import { addItem } from '@/state/actions';
import { useBookStore } from '@/state/bookStore';
import { Sheet, sheetStyles } from '@/editor/Sheet';
import controls from '@/editor/controls.module.css';
import { ItemImage } from '@/reader/ItemImage';
import styles from './features.module.css';

interface Props {
  title: string;
  exclude: string[];
  onPick: (itemId: string) => void;
  onClose: () => void;
  /** Placeholder label for a brand-new option. */
  newPlaceholder: string;
}

/** Choose options from the book's library, or make a new one. */
export function ItemPicker({ title, exclude, onPick, onClose, newPlaceholder }: Props) {
  const items = useBookStore((s) => s.book.items);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const all = Object.values(items).filter((i) => !i.archived && !exclude.includes(i.id));
    const needle = q.trim().toLowerCase();
    return (needle ? all.filter((i) => `${i.name} ${i.brand} ${i.tags.join(' ')}`.toLowerCase().includes(needle)) : all).slice(0, 60);
  }, [items, exclude, q]);
  const [name, setName] = useState('');

  const create = () => {
    const n = name.trim() || 'New option';
    const id = addItem(n, `${newPlaceholder} — ${n.toUpperCase()}`);
    onPick(id);
    setName('');
  };

  return (
    <Sheet title={title} onClose={onClose} testId="item-picker">
      <form
        className={sheetStyles.row}
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <input className={sheetStyles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="A new option, by name" aria-label="New option name" data-testid="new-item-name" />
        <button type="submit" className={sheetStyles.button} data-primary="true" data-testid="new-item-add">Add</button>
      </form>
      <input className={sheetStyles.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Or search the book's options…" aria-label="Search options" />
      <ul className={styles.pickList}>
        {list.map((it: Item) => (
          <li key={it.id}>
            <button type="button" className={styles.pickRow} onClick={() => onPick(it.id)} data-pick-item={it.id}>
              <span className={styles.pickThumb}><ItemImage item={it} size="tiny" editable={false} /></span>
              <span>
                <span className={styles.pickName}>{it.name}</span>
                <span className={['t-label', controls.small].join(' ')} style={{ display: 'block', color: 'var(--muted)' }}>{[it.brand, ...it.tags.slice(0, 2)].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className={sheetStyles.hint}>Nothing matches.</li>}
      </ul>
    </Sheet>
  );
}
