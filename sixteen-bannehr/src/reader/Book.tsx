import { useCallback, useEffect, useMemo } from 'react';
import { useLayout } from '../store/book';
import { useNav } from '../store/nav';
import { useMode } from '../store/prefs';
import { useLayoutMode } from './useLayoutMode';
import { SpreadStage } from './SpreadStage';
import { PhoneScroll } from './PhoneScroll';
import { ReaderBar } from './ReaderBar';

export function Book() {
  const layout = useLayoutMode();
  const { placed, byId } = useLayout();
  const route = useNav((s) => s.route);
  const go = useNav((s) => s.go);
  const editing = useMode((s) => s.editing);

  const requested = route.name === 'book' ? route.spreadId : null;
  const current = useMemo(() => (requested && byId.get(requested)) || placed[0], [requested, byId, placed]);
  const index = current.index;

  const turn = useCallback(
    (delta: 1 | -1) => {
      const next = placed[index + delta];
      if (next) go(next.spread.id, delta);
    },
    [placed, index, go],
  );

  // Keyboard: arrows and page keys turn; Home and End go to the covers.
  useEffect(() => {
    if (layout !== 'spread') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') turn(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') turn(-1);
      else if (e.key === 'Home') go(placed[0].spread.id, -1);
      else if (e.key === 'End') go(placed[placed.length - 1].spread.id, 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layout, turn, go, placed]);

  return (
    <div className="book" data-layout={layout} data-mode={editing ? 'edit' : 'read'}>
      <h1 className="visually-hidden">Sixteen Bannehr</h1>
      {layout === 'spread' ? (
        <SpreadStage current={current} onTurn={turn} />
      ) : (
        <PhoneScroll current={current} />
      )}
      <ReaderBar current={current} total={placed.length} onTurn={turn} layout={layout} />
    </div>
  );
}
