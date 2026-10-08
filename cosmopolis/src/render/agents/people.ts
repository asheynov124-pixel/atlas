/**
 * OWNER: life.
 * Pedestrians — tiny citizens strolling the pavements (and the middle of footpaths) around what the camera looks
 * at, only when zoomed in to street level. They favour streets lined with homes, shops and parks, turn corners on
 * the same smooth curves as traffic, bob as they walk and wear the city's whole wardrobe. Cheap: spawned near the
 * focus, recycled when the camera moves on, never simulated when nobody can see them.
 */
import { Vector3 } from 'three';
import { RoadKind } from '../../core/types';
import { game } from '../../game/instance';
import type { Planet } from '../../world/planet';
import { linHex } from './batch';
import { firstFree, frameFwd, newFrame, smoothstep } from './common';
import type { LifeCtx } from './ctx';
import { Route } from './route';

const SHIRTS = [0xe8322a, 0x2a7ae8, 0xf2c22a, 0x2ab84a, 0xf4f6f8, 0x2a2e3a, 0xff8a3a, 0x8a5ad8, 0x18b3a8, 0xe86aa8, 0x9aa4b0, 0xc89a5a];
const LIN = new Float32Array(SHIRTS.length * 3);
SHIRTS.forEach((h, i) => linHex(h, LIN, i * 3));

function walkable(kind: number): boolean {
  return kind === RoadKind.Path || kind === RoadKind.Street || kind === RoadKind.Avenue;
}

class Walker {
  active = false;
  id = 0;
  route = new Route(4);
  hi = 0;
  u = 0;
  speed = 0.06;
  shirt = 0;
  born = -10;
  dying = -1;
  pos = new Vector3();
  dir = new Vector3();
}

const _ks: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
const _up = new Vector3();
const _fr = newFrame();

export class Pedestrians {
  private walkers: Walker[] = [];
  private nextId = 1;
  private focusTile = -1;
  private candidates: number[] = [];
  active = 0;
  visible = 0;

  constructor(private planet: Planet) {
    for (let i = 0; i < 160; i++) this.walkers.push(new Walker());
  }

  invalidate(): void {
    this.focusTile = -1;
  }

  private links(t: number, out: number[]): number {
    const p = this.planet;
    const g = p.grid;
    const links = p.roadLinks[t];
    if (!links || !walkable(p.road[t])) return 0;
    const d = g.degree(t);
    let n = 0;
    for (let k = 0; k < d; k++) if (links & (1 << k) && walkable(p.road[g.neighbor(t, k)])) out[n++] = k;
    return n;
  }

  /** Walkable tiles near the focus, weighted toward lively frontage (buildings / paths). */
  private scan(focus: number): void {
    const p = this.planet;
    const g = p.grid;
    this.candidates = [];
    for (const t of g.disk(focus, 6)) {
      if (!this.links(t, _ks)) continue;
      let w = p.road[t] === RoadKind.Path ? 3 : 1;
      for (const n of g.neighbors(t)) if (p.building[n] >= 0) w++;
      for (let k = 0; k < w; k++) this.candidates.push(t);
    }
  }

  private next(ctx: LifeCtx, a: number, b: number): number {
    const g = this.planet.grid;
    const n = this.links(b, _ks);
    let opts = 0;
    for (let i = 0; i < n; i++) if (g.neighbor(b, _ks[i]) !== a) opts++;
    if (!opts) return a;
    let pick = Math.floor(ctx.rng.next() * opts);
    for (let i = 0; i < n; i++) {
      const t = g.neighbor(b, _ks[i]);
      if (t === a) continue;
      if (pick-- === 0) return t;
    }
    return a;
  }

  private spawn(ctx: LifeCtx): void {
    if (!this.candidates.length) return;
    const w = firstFree(this.walkers);
    if (!w) return;
    const p = this.planet;
    const g = p.grid;
    const a = this.candidates[Math.floor(ctx.rng.next() * this.candidates.length)];
    const n = this.links(a, _ks);
    if (!n) return;
    const b = g.neighbor(a, _ks[Math.floor(ctx.rng.next() * n)]);
    w.route.reset();
    if (!w.route.push(p, a, b, 0, (ctx.rng.next() - 0.5) * 0.02, true)) return;
    const c = this.next(ctx, a, b);
    if (!w.route.push(p, b, c, 0, (ctx.rng.next() - 0.5) * 0.02, true)) return;
    w.hi = w.route.last - 1;
    w.u = ctx.rng.next();
    w.speed = 0.045 + ctx.rng.next() * 0.035;
    w.shirt = Math.floor(ctx.rng.next() * SHIRTS.length);
    w.id = this.nextId++;
    w.born = ctx.time;
    w.dying = -1;
    w.active = true;
    this.active++;
  }

  update(ctx: LifeCtx, dt: number): void {
    const close = ctx.cull.altitude < 14;
    const focus = close ? game?.camera?.targetTile?.() ?? -1 : -1;
    if (focus >= 0 && focus !== this.focusTile) {
      this.focusTile = focus;
      this.scan(focus);
    }
    const want = close ? Math.round(Math.min(this.walkers.length, this.candidates.length * 1.6) * ctx.density) : 0;
    let n = 0;
    for (const w of this.walkers) if (w.active && w.dying < 0) n++;
    for (let k = 0; k < 8 && n < want; k++, n++) this.spawn(ctx);
    const p = this.planet;
    const g = p.grid;
    for (const w of this.walkers) {
      if (!w.active) continue;
      if (w.dying < 0 && (!close || n > want + 4 || (focus >= 0 && g.angle(w.route.hop(w.hi).a, focus) * p.radius > 22))) {
        w.dying = ctx.time;
        n--;
      }
      if (w.dying >= 0 && ctx.time - w.dying > 0.6) {
        w.active = false;
        this.active--;
        continue;
      }
      if (dt > 0) {
        let h = w.route.hop(w.hi);
        w.u += (w.speed * dt) / h.len;
        while (w.u >= 1) {
          const left = (w.u - 1) * h.len;
          w.hi++;
          h = w.route.hop(w.hi);
          if (!walkable(p.road[h.a]) || !walkable(p.road[h.b])) {
            w.active = false;
            this.active--;
            break;
          }
          w.u = left / h.len;
          const c = this.next(ctx, h.a, h.b);
          if (!w.route.push(p, h.b, c, 0, 0, true)) {
            w.active = false;
            this.active--;
            break;
          }
        }
      }
      if (w.active) w.route.sample(p, w.hi, w.u, w.pos, w.dir);
    }
  }

  render(ctx: LifeCtx): void {
    this.visible = 0;
    const cull = ctx.cull;
    if (cull.altitude > 14) return;
    const rt = ctx.realTime;
    for (const w of this.walkers) {
      if (!w.active) continue;
      if (!cull.visible(w.pos.x, w.pos.y, w.pos.z, 0.1, 22)) continue;
      if (ctx.budget <= 0) return;
      ctx.budget--;
      this.visible++;
      _up.copy(w.pos).normalize();
      const fr = frameFwd(_fr, w.dir, _up);
      fr.u.copy(_up);
      fr.f.addScaledVector(_up, -fr.f.dot(_up)).normalize();
      fr.r.crossVectors(fr.u, fr.f).normalize();
      const step = rt * w.speed * 110 + w.id;
      const bob = Math.abs(Math.sin(step)) * 0.006;
      let s = smoothstep(0, 0.6, ctx.time - w.born);
      if (w.dying >= 0) s *= 1 - smoothstep(0, 0.6, ctx.time - w.dying);
      const px = w.pos.x + _up.x * bob, py = w.pos.y + _up.y * bob, pz = w.pos.z + _up.z * bob;
      const i = w.shirt * 3;
      ctx.fleet('pedestrian').push(px, py, pz, fr.r.x, fr.r.y, fr.r.z, fr.u.x, fr.u.y, fr.u.z, fr.f.x, fr.f.y, fr.f.z, s, LIN[i], LIN[i + 1], LIN[i + 2]);
    }
  }

  dispose(): void {
    this.walkers.length = 0;
  }
}
