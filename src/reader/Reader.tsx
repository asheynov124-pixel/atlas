import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { flattenSpreads, findSpreadIndexById, figureNumbers } from '@/book/pagination';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import { navigate, type Route } from '@/app/router';
import { useIsDesktop, usePrefersReducedMotion } from '@/app/useMedia';
import { SpreadView } from './SpreadView';
import styles from './Reader.module.css';

const EASE = [0.2, 0.7, 0.2, 1] as const;

const pageVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '16%' : '-16%', opacity: 0, skewY: dir > 0 ? 0.5 : -0.5 }),
  center: { x: 0, opacity: 1, skewY: 0 },
  exit: (dir: number) => ({ x: dir > 0 ? '-12%' : '12%', opacity: 0, skewY: dir > 0 ? -0.5 : 0.5 }),
};

const shadeVariants = {
  enter: { opacity: 0.35 },
  center: { opacity: 0 },
  exit: { opacity: 0.4 },
};

export function Reader({ route }: { route: Extract<Route, { kind: 'spread' }> }) {
  const book = useBookStore((s) => s.book);
  const mode = useUiStore((s) => s.mode);
  const setSpreadIndex = useUiStore((s) => s.setSpreadIndex);
  const toggleChrome = useUiStore((s) => s.toggleChrome);
  const drawerOpen = useUiStore((s) => s.compareIds.length > 0 && s.compareOpen);
  const isDesktop = useIsDesktop();
  const reduced = usePrefersReducedMotion();

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

  const prevIndex = useRef(current);
  const direction = current >= prevIndex.current ? 1 : -1;
  useEffect(() => {
    prevIndex.current = current;
  }, [current]);

  useEffect(() => setSpreadIndex(current), [current, setSpreadIndex]);
  useEffect(() => {
    (window as unknown as { __sb: { spreadCount: number } }).__sb = { spreadCount: spreads.length };
  }, [spreads.length]);

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
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
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

  // desktop: horizontal swipe / trackpad
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const wheelLock = useRef(0);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!isDesktop || mode === 'edit') return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, [contenteditable="true"], [data-no-swipe]')) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(current + (dx < 0 ? 1 : -1));
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!isDesktop || mode === 'edit') return;
    if (Math.abs(e.deltaX) < 40 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    const now = Date.now();
    if (now - wheelLock.current < 900) return;
    wheelLock.current = now;
    go(current + (e.deltaX > 0 ? 1 : -1));
  };

  // phone: bring the routed spread into view, and track the spread in view
  const lastSeen = useRef<number>(-1);
  const settleUntil = useRef(0);
  useEffect(() => {
    if (isDesktop) return;
    if (lastSeen.current === current) return;
    settleUntil.current = performance.now() + 400;
    const el = document.querySelector<HTMLElement>(`[data-spread-index="${current}"]`);
    if (!el) return;
    const visible = (n: Element) => n.getClientRects().length > 0;
    const target = el.matches('[data-bleed="true"], [data-phone-single="true"]')
      ? el
      : ([...el.children].find(visible) as HTMLElement | undefined) ?? el;
    target.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
    lastSeen.current = current;
  }, [current, isDesktop]);

  const stageRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isDesktop) return;
    const root = stageRef.current;
    if (!root) return;
    const targets = root.querySelectorAll<HTMLElement>('[data-bleed="true"], [data-phone-single="true"], [data-side]');
    const io = new IntersectionObserver(
      (entries) => {
        // entries can be stale right after a programmatic scroll: re-measure before trusting one
        if (performance.now() < settleUntil.current) return;
        const rr = root.getBoundingClientRect();
        const fresh = (el: Element) => {
          const r = el.getBoundingClientRect();
          const overlap = Math.min(r.bottom, rr.bottom) - Math.max(r.top, rr.top);
          return overlap / Math.max(1, Math.min(r.height, rr.height));
        };
        let best: IntersectionObserverEntry | null = null;
        let bestRatio = 0;
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const ratio = fresh(en.target);
          if (ratio >= 0.5 && ratio > bestRatio) {
            best = en;
            bestRatio = ratio;
          }
        }
        if (!best) return;
        const holder = (best.target as HTMLElement).closest<HTMLElement>('[data-spread-index]');
        if (!holder) return;
        const idx = Number(holder.dataset.spreadIndex);
        if (Number.isNaN(idx) || idx === lastSeen.current) return;
        lastSeen.current = idx;
        navigate({ kind: 'spread', id: spreads[idx].spread.id, index: null }, true);
      },
      { root, threshold: [0.5] },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [isDesktop, spreads]);

  const onStageClick = (e: React.MouseEvent) => {
    if (isDesktop) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select, textarea, [contenteditable="true"], [data-no-tap]')) return;
    toggleChrome();
  };

  if (isDesktop) {
    const ref = spreads[current];
    const transition = reduced ? { duration: 0.18 } : { duration: 0.52, ease: EASE };
    return (
      <main
        className={styles.stage}
        aria-label="Book"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        data-mode={mode}
        style={drawerOpen ? ({ ['--chrome-bottom' as string]: mode === 'edit' ? '470px' : '356px' } as React.CSSProperties) : undefined}
      >
        <div className={styles.spreadBox}>
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={ref.spread.id}
              className={styles.turn}
              custom={direction}
              variants={reduced ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } } : pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
            >
              <SpreadView ref_={ref} book={book} figures={figures} editable={mode === 'edit'} />
              {!reduced && (
                <motion.div
                  className={styles.shade}
                  custom={direction}
                  variants={shadeVariants}
                  transition={transition}
                  aria-hidden="true"
                  style={{ background: direction > 0 ? 'linear-gradient(90deg, transparent 40%, rgba(0,0,0,0.6))' : 'linear-gradient(270deg, transparent 40%, rgba(0,0,0,0.6))' }}
                />
              )}
            </motion.div>
          </AnimatePresence>
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
    <main className={styles.stage} aria-label="Book" ref={stageRef} onClick={onStageClick} data-mode={mode}>
      {spreads.map((ref) => (
        <div className={styles.spreadBox} key={ref.spread.id}>
          <SpreadView ref_={ref} book={book} figures={figures} editable={mode === 'edit' && ref.index === current} />
        </div>
      ))}
    </main>
  );
}
