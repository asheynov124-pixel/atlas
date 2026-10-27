import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Spread } from './Spread';
import { useLayout } from '../store/book';
import { useNav } from '../store/nav';
import type { Placed } from '../model/pages';

/**
 * Phone reading: every page in one vertical scroll, snapping a page at a time. The spread
 * in view is written back to the URL; a jump from Contents scrolls to its spread.
 */
export function PhoneScroll({ current }: { current: Placed }) {
  const { placed } = useLayout();
  const go = useNav((s) => s.go);
  const scroller = useRef<HTMLElement>(null);
  const visible = useRef<string>(current.spread.id);
  const [activeId, setActiveId] = useState(current.spread.id);

  // Arriving at a spread from elsewhere (contents, reload): scroll to it.
  useLayoutEffect(() => {
    if (visible.current === current.spread.id && scroller.current?.scrollTop) return;
    const el = document.getElementById(`spread-${current.spread.id}`);
    if (el) el.scrollIntoView({ block: 'start' });
    visible.current = current.spread.id;
    setActiveId(current.spread.id);
  }, [current.spread.id]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset.spread;
          if (id && id !== visible.current) {
            visible.current = id;
            setActiveId(id);
            go(id, 0);
          }
        }
      },
      { root, rootMargin: '-45% 0px -45% 0px' },
    );
    root.querySelectorAll<HTMLElement>('.spread[data-spread]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [placed, go]);

  return (
    <main className="stage" ref={scroller} aria-label="The book" aria-roledescription="book" tabIndex={-1}>
      <div className="sheet">
        {placed.map((p) => (
          <Spread key={p.spread.id} placed={p} layout="phone" active={p.spread.id === activeId} />
        ))}
      </div>
    </main>
  );
}
