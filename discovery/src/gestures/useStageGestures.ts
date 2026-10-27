/**
 * Pointer-level gesture engine for the feed stage. Single finger in the
 * middle judges (like/dislike/save/capture); edge strips or two fingers
 * navigate (next/prev, path switching). Also taps, double-taps, long-press,
 * and wheel. Live drag updates are batched into rAF so the stage can stay at
 * 60fps without React re-renders.
 */
import { useEffect, useRef } from 'react';
import {
  DOUBLE_TAP_MS,
  LONG_PRESS_MS,
  intentFor,
  isTap,
  lockAxis,
  progress,
  shouldCommit,
  startMode,
  type Axis,
  type GestureMode,
  type Intent,
  type Scheme,
} from './classify';

export interface DragState {
  mode: GestureMode;
  axis: Axis;
  dx: number;
  dy: number;
  intent: Intent;
  progress: number;
  width: number;
  height: number;
}

export interface StageGestureHandlers {
  enabled: () => boolean;
  scheme: () => Scheme;
  onDrag: (s: DragState) => void;
  onCommit: (s: DragState) => void;
  onCancel: (s: DragState) => void;
  onTap: (x: number, y: number) => void;
  onDoubleTap: (x: number, y: number) => void;
  onLongPress: (x: number, y: number) => void;
  onWheel: (dir: 1 | -1) => void;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

export function useStageGestures(ref: React.RefObject<HTMLElement | null>, handlers: StageGestureHandlers) {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let active = false;
    let mode: GestureMode = 'judge';
    let axis: Axis | null = null;
    let origin = { x: 0, y: 0 };
    let startAt = 0;
    let samples: Sample[] = [];
    let longTimer: ReturnType<typeof setTimeout> | null = null;
    let longFired = false;
    let lastTap: { t: number; x: number; y: number } | null = null;
    let tapTimer: ReturnType<typeof setTimeout> | null = null;
    let raf = 0;
    let latest: DragState | null = null;
    let rect = el.getBoundingClientRect();

    const centroid = () => {
      let x = 0;
      let y = 0;
      for (const p of pointers.values()) {
        x += p.x;
        y += p.y;
      }
      return { x: x / pointers.size, y: y / pointers.size };
    };

    const clearLong = () => {
      if (longTimer) clearTimeout(longTimer);
      longTimer = null;
    };

    const state = (dx: number, dy: number): DragState | null => {
      if (!axis) return null;
      const d = axis === 'x' ? dx : dy;
      const intent = intentFor(mode, axis, d, h.current.scheme());
      return { mode, axis, dx, dy, intent, progress: progress(axis, d, rect.width, rect.height), width: rect.width, height: rect.height };
    };

    const flush = () => {
      raf = 0;
      if (latest) h.current.onDrag(latest);
    };

    const onDown = (e: PointerEvent) => {
      if (!h.current.enabled()) return;
      if ((e.target as HTMLElement).closest('[data-no-gesture]')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events */
      }
      if (pointers.size === 1) {
        rect = el.getBoundingClientRect();
        active = true;
        axis = null;
        longFired = false;
        origin = { x: e.clientX, y: e.clientY };
        startAt = performance.now();
        samples = [{ t: startAt, x: e.clientX, y: e.clientY }];
        mode = startMode({ x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width, height: rect.height, pointers: 1 });
        clearLong();
        longTimer = setTimeout(() => {
          if (active && !axis && pointers.size === 1) {
            longFired = true;
            h.current.onLongPress(origin.x - rect.left, origin.y - rect.top);
          }
        }, LONG_PRESS_MS);
      } else if (!axis) {
        // Second finger before we committed to an axis: navigation gesture.
        mode = 'nav';
        clearLong();
        origin = centroid();
        samples = [{ t: performance.now(), ...origin }];
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!active || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const c = centroid();
      const dx = c.x - origin.x;
      const dy = c.y - origin.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearLong();
      if (longFired) return;
      const now = performance.now();
      samples.push({ t: now, x: c.x, y: c.y });
      while (samples.length > 2 && now - samples[0].t > 90) samples.shift();
      if (!axis) axis = lockAxis(dx, dy);
      if (!axis) return;
      latest = state(dx, dy);
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      if (!pointers.has(e.pointerId)) return;
      const c = centroid();
      pointers.delete(e.pointerId);
      if (pointers.size > 0) return;
      clearLong();
      if (!active) return;
      active = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      const dx = c.x - origin.x;
      const dy = c.y - origin.y;
      if (longFired) return;
      if (!axis) {
        const ms = performance.now() - startAt;
        if (cancelled || !isTap({ dx, dy, ms })) return;
        const x = c.x - rect.left;
        const y = c.y - rect.top;
        const now = performance.now();
        if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < 40) {
          if (tapTimer) clearTimeout(tapTimer);
          tapTimer = null;
          lastTap = null;
          h.current.onDoubleTap(x, y);
        } else {
          lastTap = { t: now, x, y };
          tapTimer = setTimeout(() => {
            tapTimer = null;
            lastTap = null;
            h.current.onTap(x, y);
          }, DOUBLE_TAP_MS);
        }
        return;
      }
      const s = state(dx, dy)!;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = Math.max(1, last.t - first.t);
      const v = axis === 'x' ? (last.x - first.x) / dt : (last.y - first.y) / dt;
      const d = axis === 'x' ? dx : dy;
      if (!cancelled && s.intent !== 'none' && shouldCommit(axis, d, v, rect.width, rect.height)) h.current.onCommit(s);
      else h.current.onCancel(s);
      axis = null;
      latest = null;
    };

    const onUp = (e: PointerEvent) => finish(e, false);
    const onCancelEv = (e: PointerEvent) => finish(e, true);

    let wheelAcc = 0;
    let wheelLock = 0;
    const onWheel = (e: WheelEvent) => {
      if (!h.current.enabled()) return;
      if ((e.target as HTMLElement).closest('[data-no-gesture]')) return;
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLock) return;
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) > 60) {
        h.current.onWheel(wheelAcc > 0 ? 1 : -1);
        wheelAcc = 0;
        wheelLock = now + 450;
      }
    };

    const noMenu = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancelEv);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', noMenu);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancelEv);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', noMenu);
      clearLong();
      if (tapTimer) clearTimeout(tapTimer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
}
