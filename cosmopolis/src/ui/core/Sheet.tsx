/**
 * OWNER: ui-core.
 * Sheet — the adaptive bottom sheet used for build menus, panels and detail cards.
 *   Phone portrait : bottom sheet with a drag handle, snap points (detents) and swipe-to-dismiss.
 *   Phone landscape: side panel sliding in from the left between the top bar and the dock.
 *   Tablet/desktop : floating glass card centred above the dock (still draggable between detents).
 * Esc / back closes it (layer stack). Transform/opacity-only animations; honours reduce motion.
 */
import type { ComponentChildren, JSX, Ref } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon, IconOrEmoji } from '../icons';
import { useLayer, viewport, uiSound } from './env';
import { usePresence } from './presence';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ComponentChildren;
  /** icon name or emoji */
  icon?: string;
  subtitle?: ComponentChildren;
  /** extra header row (tabs, search…) — part of the drag area */
  toolbar?: ComponentChildren;
  /** buttons right of the title (before the close button) */
  actions?: ComponentChildren;
  footer?: ComponentChildren;
  /** detents as fractions of the available height, ascending. Default [0.52, 0.94] */
  snaps?: number[];
  /** index into snaps for the opening detent (default 0) */
  initialSnap?: number;
  /** dim + block the scene behind (default true) */
  backdrop?: boolean;
  /** hide the close button */
  noClose?: boolean;
  /** layout override: 'auto' adapts to the device (default) */
  layout?: 'auto' | 'bottom';
  /** max width in float mode (px) */
  maxWidth?: number;
  class?: string;
  label?: string;
  /** ref to the scrolling body */
  bodyRef?: Ref<HTMLDivElement>;
  /** called when the detent changes */
  onSnap?: (index: number) => void;
  children?: ComponentChildren;
  /** play open/close sounds (default true) */
  sound?: boolean;
}

type Mode = 'bottom' | 'side' | 'float';

export function Sheet(p: SheetProps) {
  const { mounted, shown } = usePresence(p.open, 340);
  const vp = viewport.value;
  const mode: Mode = p.layout === 'bottom' ? (vp.wide ? 'float' : 'bottom') : vp.landscapePhone ? 'side' : vp.wide ? 'float' : 'bottom';
  const snaps = p.snaps && p.snaps.length ? p.snaps : [0.52, 0.94];
  const maxSnap = snaps[snaps.length - 1];
  const [snap, setSnap] = useState(Math.min(p.initialSnap ?? 0, snaps.length - 1));
  const [hpx, setHpx] = useState(0);
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useRef({ active: false, id: -1, y0: 0, t0: 0, base: 0, last: 0, lastT: 0, v: 0, h: 1 });

  useLayer(p.open, p.onClose);

  useEffect(() => {
    if (p.open) {
      setSnap(Math.min(p.initialSnap ?? 0, snaps.length - 1));
      if (p.sound !== false) uiSound('open');
    } else if (mounted && p.sound !== false) uiSound('close');
  }, [p.open]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const el = sheetRef.current;
    if (el) setHpx(el.offsetHeight);
  }, [mounted, vp.w, vp.h, mode]);

  // fraction of the sheet hidden below the screen edge at the current detent
  const hiddenFor = (i: number) => (mode === 'side' ? 0 : 1 - snaps[i] / maxSnap);
  const transformFor = (i: number, isShown: boolean) => {
    if (mode === 'side') return isShown ? 'translate3d(0,0,0)' : 'translate3d(calc(-100% - 24px),0,0)';
    return isShown ? `translate3d(0, ${(hiddenFor(i) * 100).toFixed(2)}%, 0)` : 'translate3d(0, calc(100% + 40px), 0)';
  };
  const hiddenFrac = hiddenFor(snap);
  const transform = transformFor(snap, shown);

  const onDown = (e: PointerEvent) => {
    if (mode === 'side') return;
    const t = e.target as HTMLElement;
    if (t.closest('button, input, select, textarea, a, [data-nodrag]')) return;
    const el = sheetRef.current;
    if (!el) return;
    const d = drag.current;
    d.active = true;
    d.id = e.pointerId;
    d.y0 = e.clientY;
    d.t0 = d.lastT = performance.now();
    d.last = e.clientY;
    d.v = 0;
    d.h = el.offsetHeight || 1;
    d.base = hiddenFrac * d.h;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    el.classList.add('is-dragging');
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d.active || e.pointerId !== d.id) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.v = 0.7 * d.v + 0.3 * ((e.clientY - d.last) / dt);
    d.last = e.clientY;
    d.lastT = now;
    let y = d.base + (e.clientY - d.y0);
    if (y < 0) y = -Math.sqrt(-y) * 3; // rubber band above the top detent
    const el = sheetRef.current;
    if (el) el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d.active || e.pointerId !== d.id) return;
    d.active = false;
    const el = sheetRef.current;
    if (el) el.classList.remove('is-dragging');
    const settle = (i: number) => {
      if (el) el.style.transform = transformFor(i, true);
    };
    const y = d.base + (e.clientY - d.y0);
    const projected = y + d.v * 160;
    const ys = snaps.map((s) => (1 - s / maxSnap) * d.h);
    const lowest = ys[0];
    if (projected > lowest + Math.min(140, (d.h - lowest) * 0.45) || (d.v > 1.1 && y > lowest - 20)) {
      if (el) el.style.transform = transformFor(snap, false);
      p.onClose();
      return;
    }
    let best = 0;
    for (let i = 1; i < ys.length; i++) if (Math.abs(ys[i] - projected) < Math.abs(ys[best] - projected)) best = i;
    if (Math.abs(e.clientY - d.y0) < 4 && performance.now() - d.t0 < 250 && snaps.length > 1) {
      // tap on the grip toggles between detents
      best = snap === snaps.length - 1 ? 0 : snaps.length - 1;
    }
    settle(best);
    if (best !== snap) {
      setSnap(best);
      p.onSnap?.(best);
    }
  };

  if (!mounted) return null;
  const backdrop = p.backdrop ?? true;
  const style: JSX.CSSProperties = { transform };
  if (mode !== 'side') {
    (style as Record<string, string>)['--sheet-max'] = String(maxSnap);
    if (p.maxWidth && mode === 'float') style.maxWidth = p.maxWidth + 'px';
  }
  return (
    <div class={'cz-sheet-root mode-' + mode + (shown ? ' is-shown' : '')}>
      {backdrop && <div class="cz-backdrop pe" onClick={p.onClose} aria-hidden="true" />}
      <section
        ref={sheetRef as Ref<HTMLElement>}
        class={'cz-sheet glass-strong pe ' + (p.class ?? '')}
        style={style}
        role="dialog"
        aria-modal={backdrop ? 'true' : undefined}
        aria-label={p.label ?? (typeof p.title === 'string' ? p.title : undefined)}
      >
        <header class="cz-sheet-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {mode !== 'side' && <div class="cz-sheet-grip" aria-hidden="true" />}
          {(p.title || p.icon || !p.noClose || p.actions) && (
            <div class="cz-sheet-titlerow">
              {p.icon && (
                <span class="cz-sheet-icon">
                  <IconOrEmoji value={p.icon} size={20} />
                </span>
              )}
              <div class="cz-sheet-titles grow">
                {p.title && <h2 class="cz-sheet-title ellipsis">{p.title}</h2>}
                {p.subtitle && <div class="cz-sheet-subtitle ellipsis">{p.subtitle}</div>}
              </div>
              {p.actions}
              {!p.noClose && (
                <button type="button" class="cz-close" aria-label="Close" onClick={p.onClose}>
                  <Icon name="close" size={18} />
                </button>
              )}
            </div>
          )}
          {p.toolbar && <div class="cz-sheet-toolbar">{p.toolbar}</div>}
        </header>
        <div class="cz-sheet-body scroll-y" ref={p.bodyRef}>
          {p.children}
          {mode !== 'side' && hiddenFrac > 0 && <div aria-hidden="true" style={{ height: Math.round(hiddenFrac * hpx) + 'px', flex: 'none' }} />}
        </div>
        {p.footer && (
          <footer class="cz-sheet-foot" style={hiddenFrac > 0 ? { transform: `translate3d(0, ${-Math.round(hiddenFrac * hpx)}px, 0)` } : undefined}>
            {p.footer}
          </footer>
        )}
      </section>
    </div>
  );
}
