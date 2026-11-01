import { useCallback, useEffect, useMemo } from 'react';
import { flattenSpreads, findSpreadIndexById } from '@/book/pagination';
import { figureNumbers } from '@/book/pagination';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import { navigate, type Route } from '@/app/router';
import { useIsDesktop } from '@/app/useMedia';
import { SpreadView } from './SpreadView';
import styles from './Reader.module.css';

export function Reader({ route }: { route: Extract<Route, { kind: 'spread' }> }) {
  const book = useBookStore((s) => s.book);
  const mode = useUiStore((s) => s.mode);
  const setSpreadIndex = useUiStore((s) => s.setSpreadIndex);
  const isDesktop = useIsDesktop();

  const spreads = useMemo(() => flattenSpreads(book), [book]);
  const figures = useMemo(() => figureNumbers(book), [book]);

  const current = useMemo(() => {
    if (route.id) {
      const i = findSpreadIndexById(spreads, route.id);
      if (i >= 0) return i;
    }
    if (route.index != null) return Math.min(Math.max(0, route.index), spreads.length - 1);
    return 0;
  }, [route, spreads]);

  useEffect(() => setSpreadIndex(current), [current, setSpreadIndex]);

  // phone: bring the routed spread into view
  useEffect(() => {
    if (isDesktop) return;
    const el = document.querySelector<HTMLElement>(`[data-spread-index="${current}"]`);
    if (!el) return;
    const target = el.matches('[data-bleed="true"]') ? el : (el.firstElementChild as HTMLElement | null) ?? el;
    target.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
  }, [current, isDesktop]);

  const go = useCallback(
    (i: number) => {
      const clamped = Math.min(Math.max(0, i), spreads.length - 1);
      navigate({ kind: 'spread', id: spreads[clamped].spread.id, index: null });
    },
    [spreads],
  );

  // keyboard
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        go(current + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(current - 1);
      } else if (e.key === 'Home') {
        go(0);
      } else if (e.key === 'End') {
        go(spreads.length - 1);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [current, go, spreads.length]);

  if (isDesktop) {
    const ref = spreads[current];
    return (
      <main className={styles.stage} aria-label="Book">
        <div className={styles.spreadBox}>
          <SpreadView key={ref.spread.id} ref_={ref} book={book} figures={figures} editable={mode === 'edit'} />
        </div>
        <button className={styles.edgeButton} data-dir="prev" onClick={() => go(current - 1)} disabled={current === 0} aria-label="Previous spread">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button className={styles.edgeButton} data-dir="next" onClick={() => go(current + 1)} disabled={current === spreads.length - 1} aria-label="Next spread">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </main>
    );
  }

  return (
    <main className={styles.stage} aria-label="Book">
      {spreads.map((ref) => (
        <div className={styles.spreadBox} key={ref.spread.id}>
          <SpreadView ref_={ref} book={book} figures={figures} editable={mode === 'edit'} />
        </div>
      ))}
    </main>
  );
}
