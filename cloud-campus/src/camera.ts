import { clamp, type Vec } from './types';

/** World <-> screen transform with follow, light look-ahead, tilt and shake. */
export class Camera {
  x = 0;
  y = -140;
  zoom = 1;
  tilt = 0;
  w = 1;
  h = 1;
  private sx = 0;
  private sy = 0;

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.zoom = clamp(Math.min(h / 700, w / 1100), 0.55, 1.6);
  }

  /** Follow a target; look-ahead comes from velocity and from where the mouse sits on screen. */
  follow(dt: number, target: Vec, vel: Vec, mouse: Vec, tilt: number, shake: number) {
    const lookX = clamp(vel.x * 14, -170, 170) + ((mouse.x - this.w / 2) / this.zoom) * 0.12;
    const lookY = clamp(vel.y * 6, -90, 120) + ((mouse.y - this.h / 2) / this.zoom) * 0.08;
    const tx = target.x + lookX;
    const ty = target.y - 25 + lookY;
    const k = 1 - Math.exp(-dt * 4.5);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.tilt = tilt;
    this.sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    this.sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  }

  snap(target: Vec) {
    this.x = target.x;
    this.y = target.y - 25;
  }

  apply(ctx: CanvasRenderingContext2D, dpr: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.w / 2 + this.sx, this.h / 2 + this.sy);
    ctx.rotate(this.tilt);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  toWorld(sx: number, sy: number): Vec {
    const dx = sx - this.w / 2;
    const dy = sy - this.h / 2;
    const c = Math.cos(-this.tilt), s = Math.sin(-this.tilt);
    return {
      x: (dx * c - dy * s) / this.zoom + this.x,
      y: (dx * s + dy * c) / this.zoom + this.y,
    };
  }

  /** World-space rectangle that is (roughly) on screen, padded for tilt. */
  view() {
    const hw = (this.w / 2) / this.zoom + 120;
    const hh = (this.h / 2) / this.zoom + 120;
    return { x0: this.x - hw, x1: this.x + hw, y0: this.y - hh, y1: this.y + hh };
  }
}
