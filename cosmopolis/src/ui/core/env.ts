/**
 * OWNER: ui-core.
 * Small UI environment helpers: guarded UI sounds, layer stack (Esc / back closes the top-most layer),
 * viewport signal + media-query hook, long-press, selection helper, panel opening, reduce-motion check.
 */
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { bus } from '../../core/events';
import { settings } from '../../core/settings';
import type { Selection, SfxName } from '../../core/types';
import { game } from '../../game/instance';
import { panels } from '../registry';
import { ui } from '../store';

/** Play a UI sound through the audio system (never throws, no-op before the game exists). */
export function uiSound(name: SfxName | false | undefined, volume?: number): void {
  if (!name) return;
  try {
    const a = game?.audio;
    if (a && typeof a.sfx === 'function') a.sfx(name, volume !== undefined ? { volume } : undefined);
  } catch {
    /* audio is optional */
  }
}

/** iOS: audio must be unlocked from a user gesture. */
export function unlockAudio(): void {
  try {
    const a = game?.audio;
    if (a && !a.unlocked && typeof a.unlock === 'function') a.unlock();
  } catch {
    /* ignore */
  }
}

export function reduceMotion(): boolean {
  if (settings.value.reduceMotion) return true;
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────── layer stack (Esc closes the top-most)
interface Layer {
  id: number;
  close: () => void;
}
const layers: Layer[] = [];
let layerId = 1;

/** Register a dismissible layer; returns an unregister fn. The most recently pushed layer closes first. */
export function pushLayer(close: () => void): () => void {
  const l = { id: layerId++, close };
  layers.push(l);
  return () => {
    const i = layers.findIndex((x) => x.id === l.id);
    if (i >= 0) layers.splice(i, 1);
  };
}

/** Close the top-most layer. Returns false when there was nothing to close. */
export function closeTopLayer(): boolean {
  const l = layers[layers.length - 1];
  if (!l) return false;
  try {
    l.close();
  } catch (e) {
    console.error('[ui] layer close failed', e);
  }
  return true;
}

export function layerCount(): number {
  return layers.length;
}

/** Hook: while `active`, Esc closes this layer. */
export function useLayer(active: boolean, close: () => void): void {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!active) return;
    return pushLayer(() => ref.current());
  }, [active]);
}

// ───────────────────────────────────────────── viewport
export interface ViewportInfo {
  w: number;
  h: number;
  /** phone in portrait (narrow) */
  phone: boolean;
  /** short landscape phone */
  landscapePhone: boolean;
  /** ≥ 768 wide and ≥ 600 tall (iPad / desktop) */
  wide: boolean;
  touch: boolean;
}

function measure(): ViewportInfo {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const h = typeof window !== 'undefined' ? window.innerHeight : 768;
  let touch = false;
  try {
    touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  } catch {
    /* ignore */
  }
  const landscapePhone = w > h && h <= 520;
  return { w, h, phone: w < 600 && !landscapePhone, landscapePhone, wide: w >= 768 && h >= 600, touch };
}

/** Reactive viewport info (updates on resize / rotation). */
export const viewport = signal<ViewportInfo>(measure());
if (typeof window !== 'undefined') {
  let raf = 0;
  const on = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const v = measure();
      const p = viewport.value;
      if (v.w !== p.w || v.h !== p.h || v.touch !== p.touch) viewport.value = v;
    });
  };
  window.addEventListener('resize', on);
  window.addEventListener('orientationchange', () => setTimeout(on, 120));
}

/** Hook: true while the media query matches. */
export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => {
    try {
      return matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = matchMedia(query);
    } catch {
      return;
    }
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return m;
}

// ───────────────────────────────────────────── gestures
export interface LongPressHandlers {
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerLeave: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onClick: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
}

/**
 * Tap vs long-press on the same element. `onLong` fires after `ms`; the following click is swallowed.
 * Moving more than 10 px cancels (so scrolling a list never triggers it).
 */
export function useLongPress(onTap: (e: MouseEvent) => void, onLong: () => void, ms = 450): LongPressHandlers {
  const st = useRef({ timer: 0 as unknown as ReturnType<typeof setTimeout>, x: 0, y: 0, fired: false, down: false });
  const tapRef = useRef(onTap);
  const longRef = useRef(onLong);
  tapRef.current = onTap;
  longRef.current = onLong;
  const clear = () => {
    clearTimeout(st.current.timer);
    st.current.down = false;
  };
  useEffect(() => () => clearTimeout(st.current.timer), []);
  return {
    onPointerDown: (e) => {
      const s = st.current;
      s.fired = false;
      s.down = true;
      s.x = e.clientX;
      s.y = e.clientY;
      clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        if (!s.down) return;
        s.fired = true;
        s.down = false;
        try {
          navigator.vibrate?.(8);
        } catch {
          /* ignore */
        }
        longRef.current();
      }, ms);
    },
    onPointerMove: (e) => {
      const s = st.current;
      if (s.down && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: (e) => {
      if (st.current.fired) {
        st.current.fired = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      tapRef.current(e);
    },
    onContextMenu: (e) => {
      e.preventDefault();
      if (!st.current.fired) {
        clear();
        st.current.fired = true;
        longRef.current();
      }
    },
  };
}

// ───────────────────────────────────────────── game glue
/** Set the inspector selection (keeps renderers in sync via the bus). */
export function setSelection(sel: Selection): void {
  ui.selection.value = sel;
  bus.emit('selection:changed', { selection: sel });
}

/** Open a registered panel by id. Returns false (and does nothing) when it isn't registered. */
export function openPanel(id: string): boolean {
  if (!panels.has(id)) return false;
  if (ui.panel.value === id) return true;
  ui.panel.value = id;
  uiSound('open');
  return true;
}

export function closePanel(): void {
  if (!ui.panel.value) return;
  ui.panel.value = null;
  uiSound('close');
}

/** Next paint (two rAFs) — use before heavy synchronous work so a loading overlay can appear. */
export function nextPaint(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

/** Safe optional call: `call(game.cosmos, 'openView', 'system')`. */
export function call<T extends object>(obj: T | null | undefined, method: string, ...args: unknown[]): unknown {
  try {
    const fn = obj ? (obj as Record<string, unknown>)[method] : undefined;
    if (typeof fn === 'function') return (fn as (...a: unknown[]) => unknown).apply(obj, args);
  } catch (e) {
    console.error(`[ui] ${method} failed`, e);
  }
  return undefined;
}

/**
 * Keyboard users: move focus into a dialog when it opens and give it back when it closes (non-touch devices only,
 * so iOS never pops the keyboard or scrolls unexpectedly).
 */
export function useDialogFocus(open: boolean, ref: { current: HTMLElement | null }): void {
  useEffect(() => {
    if (!open || viewport.value.touch) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = ref.current;
      if (!el || el.contains(document.activeElement)) return;
      const first = el.querySelector<HTMLElement>('input, [autofocus]') ?? el;
      if (first === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      first.focus({ preventScroll: true });
    }, 30);
    return () => {
      clearTimeout(t);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [open]);
}
