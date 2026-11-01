import { useMemo } from 'react';
import { flattenSpreads } from '@/book/pagination';
import { chapterLabel } from '@/book/words';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import styles from './Chrome.module.css';

/** Minimal reading chrome: where you are, night toggle, specimen link. Edit chrome arrives in Phase 2. */
export function Chrome() {
  const book = useBookStore((s) => s.book);
  const spreadIndex = useUiStore((s) => s.spreadIndex);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const spreads = useMemo(() => flattenSpreads(book), [book]);
  const ref = spreads[spreadIndex] ?? spreads[0];

  const folio = ref.folio.left != null || ref.folio.right != null ? `${ref.folio.left ?? ''}${ref.folio.left != null && ref.folio.right != null ? '–' : ''}${ref.folio.right ?? ''}` : '';

  return (
    <>
      <div className={[styles.bar, styles.top].join(' ')}>
        <div className={styles.where} aria-live="polite">
          <b>{book.title}</b>
          {!ref.chapter.hidden && <span>{chapterLabel(ref.chapter.number, ref.chapter.kicker)}</span>}
          {!ref.chapter.hidden && <span>{ref.chapter.title}</span>}
          {folio && <span>{folio}</span>}
        </div>
        <div className={styles.group}>
          <button
            className={styles.button}
            onClick={() => setTheme(theme === 'night' ? 'day' : 'night')}
            aria-pressed={theme === 'night'}
            aria-label={theme === 'night' ? 'Switch to day' : 'Switch to night'}
          >
            {theme === 'night' ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
            )}
            <span>{theme === 'night' ? 'Day' : 'Night'}</span>
          </button>
          <a className={styles.button} href="#/specimen">
            Specimen
          </a>
        </div>
      </div>
    </>
  );
}
