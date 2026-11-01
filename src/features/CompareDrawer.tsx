import { useEffect } from 'react';
import type { Item } from '@/book/types';
import { useIsDesktop } from '@/app/useMedia';
import { money } from '@/book/words';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import { flattenSpreads, figureNumbers } from '@/book/pagination';
import { SpreadContext } from '@/reader/SpreadContext';
import { ItemImage } from '@/reader/ItemImage';
import { Hearts } from '@/templates/gallery/Gallery';
import { CleanChips } from '@/templates/palette/Palette';
import controls from '@/editor/controls.module.css';
import styles from './features.module.css';

/** Up to three options side by side, from any gallery in the book. */
export function CompareDrawer() {
  const ids = useUiStore((s) => s.compareIds);
  const toggle = useUiStore((s) => s.toggleCompare);
  const clear = useUiStore((s) => s.clearCompare);
  const mode = useUiStore((s) => s.mode);
  const book = useBookStore((s) => s.book);
  const isDesktop = useIsDesktop();
  const open = useUiStore((s) => s.compareOpen);
  const setOpen = useUiStore((s) => s.setCompareOpen);
  const count = ids.length;
  // a desk opens the drawer when the first item arrives; a phone keeps it folded until asked
  useEffect(() => {
    if (count === 1 && isDesktop) setOpen(true);
    if (count === 0) setOpen(false);
  }, [count, isDesktop, setOpen]);
  const items = ids.map((id) => book.items[id]).filter((i): i is Item => !!i);
  if (items.length === 0) return null;
  // the drawer lives outside any spread; give the plates a minimal context
  const spreads = flattenSpreads(book);
  const ctx = { ref: spreads[0], book, figures: figureNumbers(book), editable: false, print: false };
  return (
    <SpreadContext.Provider value={ctx}>
      <section className={styles.compare} data-edit={mode === 'edit' ? 'true' : 'false'} aria-label="Compare options" data-testid="compare-drawer">
        <div className={styles.compareHead}>
          <span className="t-label">
            Comparing {items.length} of 3{!open && `: ${items.map((i) => i.name).join(' · ')}`}
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={controls.ghost} onClick={() => setOpen(!open)} aria-expanded={open} data-testid="compare-open">{open ? 'Hide' : 'Open'}</button>
            <button type="button" className={controls.ghost} onClick={clear}>Clear</button>
          </span>
        </div>
        {open && (
        <div className={styles.compareGrid} style={{ ['--n' as string]: items.length } as React.CSSProperties}>
          {items.map((it) => (
            <div className={styles.compareCol} key={it.id} data-compare-item={it.id}>
              <div className={styles.compareImage}><ItemImage item={it} size="small" sizes="(min-width: 820px) 30vw, 33vw" editable={false} /></div>
              <p className={styles.compareName}>{it.name}</p>
              <p className={[styles.compareMeta, 't-label'].join(' ')}>
                {it.brand && <span>{it.brand}</span>}
                <span>{it.price != null ? money(it.price, it.currency) : 'No price yet'}</span>
                {it.url && <a href={it.url} target="_blank" rel="noreferrer">Link</a>}
                <Hearts item={it} />
              </p>
              {it.tags.length > 0 && <p className={[styles.compareMeta, 't-label'].join(' ')}>{it.tags.join(' · ')}</p>}
              <CleanChips card={{ clean: it.clean } as never} />
              {it.notes && <p className={styles.compareNotes}>{it.notes}</p>}
              <button type="button" className={[controls.iconButton, styles.compareRemove].join(' ')} onClick={() => toggle(it.id)} aria-label={`Remove ${it.name} from the comparison`}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          ))}
        </div>
        )}
      </section>
    </SpreadContext.Provider>
  );
}
