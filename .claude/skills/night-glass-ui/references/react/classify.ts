// Reference implementation from PH Discovery (src/gestures/classify.ts).
// Its imports point at that app's stores and modules: keep the structure and class names, rewire the data.

/**
 * Pure gesture classification. The feed hook feeds it pointer geometry; it
 * decides what the gesture *means*. Kept pure so it can be unit-tested and so
 * alternative schemes (classic TikTok-style) are a table change.
 */

export type GestureMode = 'judge' | 'nav';
export type Intent = 'like' | 'dislike' | 'save' | 'capture' | 'next' | 'prev' | 'pathNext' | 'pathPrev' | 'none';
export type Axis = 'x' | 'y';
export type Scheme = 'discovery' | 'classic';

export interface GestureStart {
  x: number;
  y: number;
  width: number;
  height: number;
  pointers: number;
}

/** Edge strips (px) where a single finger navigates instead of judging. */
export const EDGE = 26;
/** Movement before we commit to an axis. */
export const AXIS_LOCK = 10;

export function startMode(s: GestureStart, edge = EDGE): GestureMode {
  if (s.pointers >= 2) return 'nav';
  if (s.x <= edge || s.x >= s.width - edge) return 'nav';
  return 'judge';
}

export function lockAxis(dx: number, dy: number): Axis | null {
  if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

export function intentFor(mode: GestureMode, axis: Axis, d: number, scheme: Scheme = 'discovery'): Intent {
  if (d === 0) return 'none';
  if (mode === 'nav') {
    if (axis === 'y') return d < 0 ? 'next' : 'prev';
    return d < 0 ? 'pathNext' : 'pathPrev';
  }
  if (axis === 'x') return d > 0 ? 'like' : 'dislike';
  if (scheme === 'classic') return d < 0 ? 'next' : 'prev';
  return d < 0 ? 'save' : 'capture';
}

/** 0..1 progress towards the commit threshold, for live visual feedback. */
export function progress(axis: Axis, d: number, width: number, height: number): number {
  const threshold = axis === 'x' ? width * 0.3 : height * 0.18;
  return Math.min(1, Math.abs(d) / threshold);
}

/**
 * Commit if past the distance threshold, or flicked fast enough in the same
 * direction. `v` is px/ms along the axis.
 */
export function shouldCommit(axis: Axis, d: number, v: number, width: number, height: number): boolean {
  if (progress(axis, d, width, height) >= 1) return true;
  return Math.abs(d) > 32 && Math.abs(v) > 0.55 && Math.sign(v) === Math.sign(d);
}

export interface TapInfo {
  dx: number;
  dy: number;
  ms: number;
}

export const isTap = (t: TapInfo) => Math.abs(t.dx) < 8 && Math.abs(t.dy) < 8 && t.ms < 280;
export const LONG_PRESS_MS = 480;
/** Max gap between the first tap's release and the second tap's press. */
export const DOUBLE_TAP_MS = 300;
