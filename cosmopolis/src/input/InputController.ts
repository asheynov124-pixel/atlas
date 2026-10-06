/**
 * OWNER: camera & tools agent.
 * InputController — unified mouse / touch / keyboard handling on the canvas.
 *   Touch: 1 finger drag = rotate (or paint when a drawing tool is active), pinch = zoom, 2-finger drag = tilt/heading,
 *          tap = select / place, long-press = context info. Mouse: left = tool, right/middle drag = rotate, wheel = zoom.
 *   Keyboard: WASD/arrows pan, Q/E heading, R/F tilt, +/- zoom, space pause, 1-4 speed, Esc cancel, Ctrl-Z undo…
 * Routes picks (world/geo pickTile) to the ToolManager. Unlocks audio on first gesture.
 * (Foundation stub: drag rotate, wheel/pinch zoom, tap → tools.tap.)
 */
import { Raycaster, Vector2 } from 'three';
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import { pickTile, type PickResult } from '../world/geo';

export class InputController implements System {
  private ray = new Raycaster();
  private ndc = new Vector2();
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinchDist = 0;

  constructor(private game: Game) {}

  init(): void {
    const el = this.game.engine.canvas;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      this.game.audio.unlock();
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) {
        const hit = this.pick(e.clientX, e.clientY);
        this.game.tools.hover(hit);
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) this.game.camera.rotateBy(dx, dy);
      else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this.game.camera.zoomBy(this.pinchDist / Math.max(1, d));
        this.pinchDist = d;
      }
    });
    const up = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (p && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8 && performance.now() - p.t < 400) {
        this.game.tools.tap(this.pick(e.clientX, e.clientY));
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.game.camera.zoomBy(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
  }

  /** Pick the planet tile under a screen point (client px). */
  pick(x: number, y: number): PickResult | null {
    const v = this.game.planetView;
    if (!v || this.game.activeView !== v) return null;
    const r = this.game.engine.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, v.camera);
    return pickTile(v.planet, this.ray.ray);
  }
}
