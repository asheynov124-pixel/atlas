/**
 * OWNER: tools.
 * InputController — one gesture recogniser for mouse, touch and pen on the canvas, routing to the camera or the
 * active tool.
 *
 *   Touch   1 finger: tap (tool / select) · drag = grab-pan with fling (or DRAW when a drawing tool is active)
 *           double-tap = zoom in · double-tap-hold-slide = one-handed zoom · long-press = pick a building up and
 *           carry it (ground: inspect & glide closer; placing: the tool's precision mode for big buildings)
 *           2 fingers: pinch zoom toward the fingers + twist rotate + pan, or a parallel vertical slide = tilt;
 *           a quick two-finger tap zooms out. A second finger landing mid-stroke (or mid-hold) cancels the stroke
 *           (rolled back) and becomes a camera gesture.
 *   Mouse   left = tool (or grab-pan when the tool doesn't draw; click-and-hold on a building picks it up) ·
 *           right / middle drag = rotate + tilt · wheel = zoom at the cursor (trackpad pinch too) · hover feeds
 *           ghost previews (picked once per frame, re-picked when the camera moves under a still cursor).
 * A long-press timer that fires late (busy main thread) is re-checked after queued input drains, so a slow frame
 * never turns a drag into a hold. `longPressMs` is adjustable (tests).
 *   Keys    see input/shortcuts.ts (continuous WASD/QE/RF/±, Space, 1–4, Ctrl+Z…), exported for the help panel.
 * The first gesture unlocks audio (iOS). A touch during the cinematic tour cancels it and is swallowed.
 * Only active while the planet surface is the active view (other views own their input).
 *
 * CONTRACT: pick(clientX, clientY) → PickResult | null, lastRay (ray of the last pick), lastPointerType, touch
 */
import { Ray, Vector2 } from 'three';
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import { pickTile, type PickResult } from '../world/geo';
import { settings } from '../core/settings';
import { ui } from '../ui/store';
import { held, installShortcuts } from './shortcuts';
import type { PointerInfo } from '../tools/Tool';

type Mode = 'idle' | 'pending' | 'pan' | 'draw' | 'hold' | 'multi' | 'orbit' | 'quickzoom' | 'swallow';

interface Ptr {
  id: number;
  type: string;
  button: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  lx: number;
  ly: number;
  t0: number;
}

const SLOP_TOUCH = 9;
const SLOP_MOUSE = 4;
const LONG_PRESS_MS = 460;
const DOUBLE_TAP_MS = 320;

export class InputController implements System {
  /** ray of the most recent pick (tools use it for orbitals) */
  readonly lastRay = new Ray();
  lastPointerType: 'mouse' | 'touch' | 'pen' = 'mouse';
  /** press-and-hold delay (ms); tests raise it to rule long-presses out on slow headless frames */
  longPressMs = LONG_PRESS_MS;
  private ptrs = new Map<number, Ptr>();
  private mode: Mode = 'idle';
  private longTimer: ReturnType<typeof setTimeout> | null = null;
  private longDeferred = false;
  private lastTap = { t: -1e9, x: 0, y: 0 };
  private dblCandidate = false;
  private quick = { ndc: new Vector2(), lastY: 0 };
  private multi = { t0: 0, moved: false, mx: 0, my: 0 };
  private hover = { x: 0, y: 0, dirty: false, inside: false };
  private drawMove = { x: 0, y: 0, dirty: false };
  private lastCam = new Float32Array(16);
  private ndcTmp = new Vector2();
  private ndcMove = new Vector2();
  private panTmp = new Vector2();
  private info: PointerInfo = { touch: false, shift: false, alt: false, ctrl: false, button: 0 };
  private offs: (() => void)[] = [];
  private audioUnlocked = false;

  constructor(private game: Game) {}

  init(): void {
    const el = this.game.engine.canvas;
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
    (el.style as unknown as Record<string, string>).webkitUserSelect = 'none';
    (el.style as unknown as Record<string, string>).webkitTouchCallout = 'none';
    (el.style as unknown as Record<string, string>).webkitTapHighlightColor = 'transparent';
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      const h = (e: HTMLElementEventMap[K]) => {
        try {
          fn(e);
        } catch (err) {
          console.error(`[input] ${type} handler failed`, err);
        }
      };
      el.addEventListener(type, h, opts);
      this.offs.push(() => el.removeEventListener(type, h, opts));
    };
    on('pointerdown', (e) => this.onDown(e));
    on('pointermove', (e) => this.onMove(e));
    on('pointerup', (e) => this.onUp(e, false));
    on('pointercancel', (e) => this.onUp(e, true));
    on('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.ptrs.size) {
        this.hover.inside = false;
        if (this.planetActive()) this.game.tools.hover(null);
      }
    });
    on('wheel', (e) => this.onWheel(e), { passive: false });
    on('contextmenu', (e) => e.preventDefault());
    on('dblclick', (e) => e.preventDefault());
    // Safari page-zoom gestures
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', stop);
    el.addEventListener('gesturechange', stop);
    this.offs.push(() => {
      el.removeEventListener('gesturestart', stop);
      el.removeEventListener('gesturechange', stop);
    });
    const blur = () => this.reset(true);
    window.addEventListener('blur', blur);
    this.offs.push(() => window.removeEventListener('blur', blur));
    const resized = () => this.game.camera.refreshRect();
    window.addEventListener('resize', resized);
    this.offs.push(() => window.removeEventListener('resize', resized));
    this.offs.push(installShortcuts(this.game, { escape: () => this.escape() }));
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
  }

  /** True when the last input came from a finger / pen. */
  get touch(): boolean {
    return this.lastPointerType !== 'mouse';
  }

  private planetActive(): boolean {
    const g = this.game;
    return !!g.planetView && g.activeView === g.planetView && ui.screen.value === 'game';
  }

  /** Pick the planet tile under a screen point (client px). */
  pick(x: number, y: number): PickResult | null {
    const v = this.game.planetView;
    if (!v || this.game.activeView !== v) return null;
    const ndc = this.game.camera.ndc(x, y, this.ndcTmp);
    this.game.camera.rayAt(ndc, this.lastRay);
    try {
      return pickTile(v.planet, this.lastRay);
    } catch (e) {
      console.error('[input] pick failed', e);
      return null;
    }
  }

  private ndc(x: number, y: number): Vector2 {
    return this.game.camera.ndc(x, y, new Vector2());
  }

  private infoFor(e: PointerEvent | null, ptr?: Ptr): PointerInfo {
    const i = this.info;
    i.touch = (ptr?.type ?? this.lastPointerType) !== 'mouse';
    i.shift = !!e?.shiftKey;
    i.alt = !!e?.altKey;
    i.ctrl = !!(e?.ctrlKey || e?.metaKey);
    i.button = ptr?.button ?? 0;
    return i;
  }

  private unlockAudio(): void {
    if (this.audioUnlocked) return;
    try {
      const a = this.game.audio;
      if (a && typeof a.unlock === 'function') a.unlock();
      this.audioUnlocked = !!a?.unlocked;
    } catch {
      /* audio optional */
    }
  }

  private clearLong(): void {
    if (this.longTimer !== null) clearTimeout(this.longTimer);
    this.longTimer = null;
  }

  private slop(p: Ptr): number {
    return p.type === 'mouse' ? SLOP_MOUSE : SLOP_TOUCH;
  }

  private twoPtrs(): [Ptr, Ptr] | null {
    const it = this.ptrs.values();
    const a = it.next().value, b = it.next().value;
    return a && b ? [a, b] : null;
  }

  // ─────────────────────────────────────────────── pointer events

  private onDown(e: PointerEvent): void {
    this.unlockAudio();
    if (!this.planetActive()) return;
    const g = this.game;
    this.lastPointerType = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
    const el = g.engine.canvas;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const ptr: Ptr = { id: e.pointerId, type: this.lastPointerType, button: e.button, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now() };
    this.ptrs.set(e.pointerId, ptr);
    // a touch during the cinematic tour just ends it
    if (g.camera.touring) {
      g.camera.stopTour();
      this.mode = 'swallow';
      return;
    }
    if (this.mode === 'swallow' && this.ptrs.size !== 2) return;
    if (this.ptrs.size === 1) {
      g.camera.interrupt();
      g.camera.refreshRect();
      this.dblCandidate = false;
      if (ptr.type === 'mouse') {
        if (e.button === 1 || e.button === 2) {
          this.mode = 'orbit';
          e.preventDefault();
        } else if (e.button === 0 && g.tools.isDrawing) {
          this.mode = 'draw';
          g.tools.pointerDown(this.pick(ptr.x, ptr.y), this.infoFor(e, ptr));
        } else this.mode = 'pending';
        if (e.button === 0 && performance.now() - this.lastTap.t < DOUBLE_TAP_MS && Math.hypot(ptr.x - this.lastTap.x, ptr.y - this.lastTap.y) < 12) this.dblCandidate = true;
        // click-and-hold on a building picks it up (the select tool decides)
        if (this.mode === 'pending' && e.button === 0 && !this.dblCandidate) {
          this.longDeferred = false;
          this.longTimer = setTimeout(() => this.onLongPress(), this.longPressMs);
        }
        return;
      }
      this.mode = 'pending';
      const now = performance.now();
      if (!g.tools.isDrawing && now - this.lastTap.t < DOUBLE_TAP_MS && Math.hypot(ptr.x - this.lastTap.x, ptr.y - this.lastTap.y) < 42) this.dblCandidate = true;
      // press preview (ghosts appear under the finger)
      g.tools.hover(this.pick(ptr.x, ptr.y));
      if (!g.tools.isDrawing && !this.dblCandidate) {
        this.longDeferred = false;
        this.longTimer = setTimeout(() => this.onLongPress(), this.longPressMs);
      }
      return;
    }
    if (this.ptrs.size === 2) {
      // a second finger always becomes a camera gesture, whatever the first one was doing
      this.clearLong();
      if (this.mode === 'draw' || this.mode === 'hold') g.tools.cancelStroke();
      if (this.mode === 'pan') g.camera.grabEnd();
      this.drawMove.dirty = false;
      const two = this.twoPtrs()!;
      g.camera.pinchStart(two[0].x, two[0].y, two[1].x, two[1].y);
      this.mode = 'multi';
      this.multi.t0 = performance.now();
      this.multi.moved = false;
      this.multi.mx = (two[0].x + two[1].x) / 2;
      this.multi.my = (two[0].y + two[1].y) / 2;
    }
  }

  private onMove(e: PointerEvent): void {
    const ptr = this.ptrs.get(e.pointerId);
    if (e.pointerType === 'mouse') {
      this.hover.x = e.clientX;
      this.hover.y = e.clientY;
      this.hover.dirty = true;
      this.hover.inside = true;
    }
    if (!ptr) return;
    const g = this.game;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    const moved = Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy);
    const sens = settings.value.cameraSensitivity || 1;
    switch (this.mode) {
      case 'pending':
        if (moved > this.slop(ptr)) {
          this.clearLong();
          if (this.dblCandidate && ptr.type !== 'mouse') {
            this.mode = 'quickzoom';
            this.quick.ndc = this.ndc(ptr.sx, ptr.sy);
            this.quick.lastY = ptr.y;
          } else if (g.tools.isDrawing) {
            this.mode = 'draw';
            g.tools.pointerDown(this.pick(ptr.sx, ptr.sy), this.infoFor(e, ptr));
            this.drawMove = { x: ptr.x, y: ptr.y, dirty: true };
          } else {
            this.mode = 'pan';
            g.camera.grabStart(this.ndc(ptr.sx, ptr.sy));
            g.camera.grabMove(this.ndc(ptr.x, ptr.y));
          }
        }
        break;
      case 'pan':
        g.camera.grabMove(g.camera.ndc(ptr.x, ptr.y, this.ndcMove));
        break;
      case 'draw':
      case 'hold':
        this.drawMove.x = ptr.x;
        this.drawMove.y = ptr.y;
        this.drawMove.dirty = true;
        this.info.shift = e.shiftKey;
        break;
      case 'multi': {
        const two = this.twoPtrs();
        if (two) {
          g.camera.pinchMove(two[0].x, two[0].y, two[1].x, two[1].y);
          if (moved > 14) this.multi.moved = true;
        }
        break;
      }
      case 'orbit': {
        const dx = ptr.x - ptr.lx, dy = ptr.y - ptr.ly;
        const inv = settings.value.invertRotate ? -1 : 1;
        g.camera.orbitBy(-dx * 0.0062 * sens * inv, -dy * 0.0042 * sens);
        break;
      }
      case 'quickzoom': {
        const dy = ptr.y - this.quick.lastY;
        this.quick.lastY = ptr.y;
        if (dy) g.camera.zoomAt(this.quick.ndc, Math.exp(-dy * 0.0095), false);
        break;
      }
    }
    ptr.lx = ptr.x;
    ptr.ly = ptr.y;
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    const ptr = this.ptrs.get(e.pointerId);
    if (!ptr) return;
    this.ptrs.delete(e.pointerId);
    const g = this.game;
    try {
      g.engine.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const now = performance.now();
    switch (this.mode) {
      case 'pending': {
        this.clearLong();
        if (cancelled || this.ptrs.size) break;
        if (ptr.type === 'mouse' && ptr.button !== 0) break;
        const hit = this.pick(ptr.x, ptr.y);
        if (this.dblCandidate && !g.tools.placing) {
          g.camera.zoomAt(this.ndc(ptr.x, ptr.y), 0.42, true);
          this.lastTap.t = -1e9;
        } else {
          g.tools.tap(hit, this.infoFor(e, ptr));
          this.lastTap = { t: now, x: ptr.x, y: ptr.y };
        }
        break;
      }
      case 'pan':
        g.camera.grabEnd();
        break;
      case 'draw':
      case 'hold':
        if (cancelled) g.tools.cancelStroke();
        else g.tools.pointerUp(this.pick(ptr.x, ptr.y), this.infoFor(e, ptr));
        this.drawMove.dirty = false;
        break;
      case 'multi':
        if (this.ptrs.size >= 2) {
          g.camera.pinchEnd();
          const two = this.twoPtrs()!;
          g.camera.pinchStart(two[0].x, two[0].y, two[1].x, two[1].y);
          return;
        }
        g.camera.pinchEnd();
        if (!this.multi.moved && now - this.multi.t0 < 300 && !cancelled) g.camera.zoomAt(this.ndc(this.multi.mx, this.multi.my), 1.9, true);
        if (this.ptrs.size === 1) {
          // keep panning with the finger that stayed (but never start drawing mid-gesture)
          const rest = this.ptrs.values().next().value!;
          rest.sx = rest.x;
          rest.sy = rest.y;
          if (!g.tools.isDrawing) {
            this.mode = 'pan';
            g.camera.grabStart(this.ndc(rest.x, rest.y));
          } else this.mode = 'swallow';
          return;
        }
        break;
    }
    if (this.ptrs.size === 0) {
      this.mode = 'idle';
      this.dblCandidate = false;
    }
  }

  private onLongPress(): void {
    this.longTimer = null;
    if (this.mode !== 'pending' || this.ptrs.size !== 1) return;
    const ptr = this.ptrs.values().next().value!;
    // a timer that fires late means the main thread was busy: moves may still be queued behind it, so let input
    // drain first (input outranks timers) and only then decide it really was a press-and-hold
    if (!this.longDeferred && performance.now() - ptr.t0 > this.longPressMs + 120) {
      this.longDeferred = true;
      this.longTimer = setTimeout(() => this.onLongPress(), 32);
      return;
    }
    const hit = this.pick(ptr.x, ptr.y);
    const took = this.game.tools.longPress(hit, this.infoFor(null, ptr));
    if (ptr.type !== 'mouse')
      try {
        navigator.vibrate?.(10);
      } catch {
        /* no haptics on iOS Safari */
      }
    // a mouse button held still stays a click / drag when the tool has no use for the hold
    this.mode = took ? 'hold' : ptr.type === 'mouse' ? 'pending' : 'swallow';
  }

  private onWheel(e: WheelEvent): void {
    if (!this.planetActive()) return;
    e.preventDefault();
    this.unlockAudio();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= 400;
    const k = e.ctrlKey ? 0.011 : 0.0016;
    const f = Math.exp(Math.max(-0.6, Math.min(0.6, dy * k * (settings.value.cameraSensitivity || 1))));
    if (Math.abs(f - 1) < 1e-4) return;
    this.game.camera.zoomAt(this.ndc(e.clientX, e.clientY), f, true);
  }

  /** Esc: innermost first — tool in-progress state → tool → selection → tour / follow. */
  escape(): void {
    const g = this.game;
    if (g.camera.touring) {
      g.camera.stopTour();
      return;
    }
    if (g.tools.escape()) return;
    if (g.camera.following) g.camera.stopFollow();
  }

  /** Drop every gesture (window blur, view switch). */
  private reset(cancelStroke: boolean): void {
    this.clearLong();
    if ((this.mode === 'draw' || this.mode === 'hold') && cancelStroke) this.game.tools.cancelStroke();
    if (this.mode === 'pan') this.game.camera.grabEnd();
    if (this.mode === 'multi') this.game.camera.pinchEnd();
    this.ptrs.clear();
    this.mode = 'idle';
    held.clear();
  }

  // ─────────────────────────────────────────────── frame

  update(dt: number): void {
    const g = this.game;
    if (!this.planetActive()) {
      if (this.mode !== 'idle') this.reset(true);
      return;
    }
    // keyboard camera
    if (held.size) {
      const fast = held.has('ShiftLeft') || held.has('ShiftRight') ? 2.5 : 1;
      const px = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const py = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      const dh = (held.has('KeyQ') ? 1 : 0) - (held.has('KeyE') ? 1 : 0);
      const dTilt = g.tools.rotatable ? 0 - (held.has('KeyF') ? 1 : 0) : (held.has('KeyR') ? 1 : 0) - (held.has('KeyF') ? 1 : 0);
      const dz = (held.has('Minus') || held.has('NumpadSubtract') ? 1 : 0) - (held.has('Equal') || held.has('NumpadAdd') ? 1 : 0);
      this.panTmp.set(px * fast, py * fast);
      g.camera.keyMove(dt, this.panTmp, dh * fast, dTilt, dz * fast);
    }
    // camera moved under a still pointer?
    const m = g.planetView!.camera.matrixWorld.elements;
    let camMoved = false;
    for (let i = 12; i < 15; i++) if (Math.abs(m[i] - this.lastCam[i]) > 1e-5) camMoved = true;
    for (let i = 0; i < 11; i++) if (Math.abs(m[i] - this.lastCam[i]) > 1e-6) camMoved = true;
    if (camMoved) this.lastCam.set(m);
    // coalesced tool strokes: one pick per frame
    if ((this.mode === 'draw' || this.mode === 'hold') && (this.drawMove.dirty || camMoved)) {
      this.drawMove.dirty = false;
      g.tools.pointerMove(this.pick(this.drawMove.x, this.drawMove.y), this.info);
    }
    // desktop hover previews
    if (this.lastPointerType === 'mouse' && this.hover.inside && (this.mode === 'idle' || this.mode === 'orbit' || this.mode === 'pending') && (this.hover.dirty || camMoved)) {
      this.hover.dirty = false;
      g.tools.hover(this.pick(this.hover.x, this.hover.y));
    }
  }
}
