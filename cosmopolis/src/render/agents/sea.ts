/**
 * OWNER: life.
 * SeaTraffic — life on the water near the city:
 *   • speedboats, sailboats, hovercraft and trawlers wander the coastal waters on smooth Catmull-Rom courses
 *     (rocking gently, V-shaped wakes behind them)
 *   • container ships lumber through the deeper channels when the city has harbours, shipyards or cargo hubs
 *   • ferries shuttle between each ferry terminal and a far shore, dwelling at both docks
 *   • on ocean worlds, the occasional SPACE WHALE breaches: it bursts from the deep in a plume of spray, arcs
 *     through the air with its lights glowing and crashes back in a ring of foam (&whale=1 forces it anywhere wet)
 * The navigable area is rebuilt from the coastline around buildings whenever terrain, sea level or buildings change.
 */
import { Vector3 } from 'three';
import { game } from '../../game/instance';
import { clamp, frameFwd, newFrame, pitch, roll, smoothstep } from './common';
import type { FleetKey, LifeCtx } from './ctx';
import type { Sites } from './sites';

const KINDS: FleetKey[] = ['speedboat', 'sailboat', 'hovercraft', 'trawler', 'cargoShip', 'ferry'];
const LEN = [0.26, 0.3, 0.3, 0.38, 1.7, 0.95];
const SPEED = [0.85, 0.32, 0.75, 0.28, 0.32, 0.42];
const K_SPEED = 0, K_SAIL = 1, K_HOVER = 2, K_TRAWL = 3, K_SHIP = 4, K_FERRY = 5;

const PAINT: [number, number, number][] = [
  [0.92, 0.94, 0.96], [0.85, 0.12, 0.1], [0.05, 0.3, 0.75], [0.95, 0.6, 0.05], [0.1, 0.6, 0.5], [0.12, 0.12, 0.14],
];

class Boat {
  active = false;
  id = 0;
  kind = 0;
  /** tile ring: t[0] t[1] → t[2] t[3] (travelling t[1] → t[2]) */
  t = [0, 0, 0, 0];
  u = 0;
  speed = 0.5;
  pos = new Vector3();
  dir = new Vector3(0, 0, 1);
  color = 0;
  born = -10;
  /** ferry: fixed path and direction */
  path: number[] | null = null;
  pi = 0;
  pdir = 1;
  dwell = 0;
  dying = -1;
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _p = new Vector3();
const _up = new Vector3();
const _fr = newFrame();

export class SeaTraffic {
  private boats: Boat[] = [];
  private water = new Set<number>();
  private list: number[] = [];
  private deep: number[] = [];
  private ferryPaths: number[][] = [];
  private harbours = 0;
  private dirty = true;
  private version = -1;
  private nextId = 1;
  // whale
  private whaleOK = false;
  private whaleT = 6;
  private whale = { active: false, t: 0, base: new Vector3(), dir: new Vector3(), splash0: false, splash1: false };
  active = 0;
  visible = 0;

  constructor(private sites: Sites) {
    for (let i = 0; i < 40; i++) this.boats.push(new Boat());
  }

  invalidate(): void {
    this.dirty = true;
  }

  private rebuild(ctx: LifeCtx): void {
    this.dirty = false;
    this.version = this.sites.version;
    const p = ctx.planet;
    const g = p.grid;
    this.water.clear();
    this.list = [];
    this.deep = [];
    this.ferryPaths = [];
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    this.whaleOK = p.spec.hasOcean && (p.spec.type === 'ocean' || params?.get('whale') === '1');
    if (!p.spec.hasOcean) return;
    // BFS outward from water tiles that touch built land, up to 9 rings
    const depth = new Map<number, number>();
    const queue: number[] = [];
    for (const s of this.sites.all) {
      for (const n of g.disk(s.tile, 2)) {
        if (!p.isWater(n) || depth.has(n)) continue;
        depth.set(n, 0);
        queue.push(n);
      }
    }
    for (let qi = 0; qi < queue.length; qi++) {
      const t = queue[qi];
      const d = depth.get(t)!;
      if (d >= 9) continue;
      for (const n of g.neighbors(t)) {
        if (!p.isWater(n) || depth.has(n)) continue;
        depth.set(n, d + 1);
        queue.push(n);
      }
      if (queue.length > 4000) break;
    }
    for (const t of queue) {
      this.water.add(t);
      this.list.push(t);
      let all = true;
      for (const n of g.neighbors(t)) if (!p.isWater(n)) all = false;
      if (all) this.deep.push(t);
    }
    // ferry routes: terminal → a water tile 6–12 tiles away near another shore
    this.harbours = 0;
    for (const s of this.sites.all) {
      if (s.tags.includes('harbor') || s.tags.includes('shipyard') || s.tags.includes('cargo')) this.harbours++;
      if (!s.tags.includes('ferry')) continue;
      let start = -1;
      for (const n of g.disk(s.tile, 1)) if (this.water.has(n)) start = n;
      if (start < 0) continue;
      const path = this.farShore(ctx, start);
      if (path) this.ferryPaths.push(path);
    }
  }

  /** BFS path over water from start to a coastal water tile 6–12 steps away (prefers the farthest shore). */
  private farShore(ctx: LifeCtx, start: number): number[] | null {
    const p = ctx.planet;
    const g = p.grid;
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    const dist = new Map<number, number>([[start, 0]]);
    let best = -1, bestD = 0;
    for (let qi = 0; qi < queue.length && queue.length < 3000; qi++) {
      const t = queue[qi];
      const d = dist.get(t)!;
      if (d >= 6 && d <= 12) {
        let coastal = false;
        for (const n of g.neighbors(t)) if (!p.isWater(n)) coastal = true;
        if (coastal && d > bestD) {
          best = t;
          bestD = d;
        }
      }
      if (d >= 12) continue;
      for (const n of g.neighbors(t)) {
        if (!p.isWater(n) || prev.has(n)) continue;
        prev.set(n, t);
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
    if (best < 0) return null;
    const path: number[] = [];
    for (let t = best; t >= 0; t = prev.get(t)!) path.push(t);
    path.reverse();
    void ctx;
    return path.length >= 4 ? path : null;
  }

  private nextTile(ctx: LifeCtx, b: Boat): number {
    const g = ctx.planet.grid;
    const from = b.t[2], prev = b.t[1];
    let best = -1, bw = -1;
    for (const n of g.neighbors(from)) {
      if (n === prev || !this.water.has(n)) continue;
      if (b.kind === K_SHIP && this.deep.length > 8 && !this.isDeep(ctx, n)) continue;
      const straight = 1 - g.dot(n, prev);
      const w = straight * (0.6 + ctx.rng.next());
      if (w > bw) {
        bw = w;
        best = n;
      }
    }
    return best >= 0 ? best : prev;
  }

  private isDeep(ctx: LifeCtx, t: number): boolean {
    const p = ctx.planet;
    for (const n of p.grid.neighbors(t)) if (!p.isWater(n)) return false;
    return true;
  }

  private spawn(ctx: LifeCtx, ferryPath?: number[]): void {
    const b = this.boats.find((x) => !x.active);
    if (!b) return;
    const g = ctx.planet.grid;
    b.id = this.nextId++;
    b.dying = -1;
    b.born = ctx.time;
    b.color = Math.floor(ctx.rng.next() * PAINT.length);
    if (ferryPath) {
      b.kind = K_FERRY;
      b.path = ferryPath;
      b.pi = 0;
      b.pdir = 1;
      b.u = 0;
      b.dwell = 2 + ctx.rng.next() * 3;
      b.speed = SPEED[K_FERRY];
      b.active = true;
      this.active++;
      return;
    }
    const r = ctx.rng.next();
    b.kind = this.harbours && r < 0.12 && this.deep.length > 12 ? K_SHIP : r < 0.42 ? K_SPEED : r < 0.68 ? K_SAIL : r < 0.84 ? K_HOVER : K_TRAWL;
    const src = b.kind === K_SHIP ? this.deep : this.list;
    const t0 = src[Math.floor(ctx.rng.next() * src.length)];
    const nb = g.neighbors(t0).filter((n) => this.water.has(n));
    if (!nb.length) return;
    b.path = null;
    b.t[1] = t0;
    b.t[0] = t0;
    b.t[2] = nb[Math.floor(ctx.rng.next() * nb.length)];
    b.t[3] = this.nextTile(ctx, b);
    b.t[0] = b.t[1];
    b.u = ctx.rng.next();
    b.speed = SPEED[b.kind] * (0.85 + ctx.rng.next() * 0.3);
    b.active = true;
    this.active++;
  }

  private centre(ctx: LifeCtx, t: number, out: Vector3): Vector3 {
    const c = ctx.planet.grid.center;
    return out.set(c[t * 3], c[t * 3 + 1], c[t * 3 + 2]).multiplyScalar(ctx.planet.radius + ctx.planet.waterHeight);
  }

  /** Catmull-Rom through tile centres t0..t3 at u ∈ [0,1] between t1 and t2. */
  private course(ctx: LifeCtx, t0: number, t1: number, t2: number, t3: number, u: number, out: Vector3, dir: Vector3): void {
    const p0 = this.centre(ctx, t0, _a), p1 = this.centre(ctx, t1, _b), p2 = this.centre(ctx, t2, _c), p3 = this.centre(ctx, t3, _d);
    const t = u, t2_ = t * t, t3_ = t2_ * t;
    const a = -0.5 * t3_ + t2_ - 0.5 * t, b = 1.5 * t3_ - 2.5 * t2_ + 1, c = -1.5 * t3_ + 2 * t2_ + 0.5 * t, d = 0.5 * t3_ - 0.5 * t2_;
    out.set(p0.x * a + p1.x * b + p2.x * c + p3.x * d, p0.y * a + p1.y * b + p2.y * c + p3.y * d, p0.z * a + p1.z * b + p2.z * c + p3.z * d);
    const da = -1.5 * t2_ + 2 * t - 0.5, db = 4.5 * t2_ - 5 * t, dc = -4.5 * t2_ + 4 * t + 0.5, dd = 1.5 * t2_ - t;
    dir.set(p0.x * da + p1.x * db + p2.x * dc + p3.x * dd, p0.y * da + p1.y * db + p2.y * dc + p3.y * dd, p0.z * da + p1.z * db + p2.z * dc + p3.z * dd);
    out.multiplyScalar((ctx.planet.radius + ctx.planet.waterHeight) / (out.length() || 1));
    dir.normalize();
  }

  update(ctx: LifeCtx, dt: number): void {
    this.sites.refresh();
    if (this.dirty || this.version !== this.sites.version) this.rebuild(ctx);
    const want = this.list.length > 12 ? Math.min(30, Math.round(clamp(this.list.length / 16 + this.harbours * 2.5, 3, 26) * ctx.density)) : 0;
    let n = 0, nf = 0;
    for (const b of this.boats) if (b.active) b.kind === K_FERRY ? nf++ : n++;
    if (n < want) this.spawn(ctx);
    if (nf < this.ferryPaths.length) this.spawn(ctx, this.ferryPaths[nf]);
    const g = ctx.planet.grid;
    for (const b of this.boats) {
      if (!b.active) continue;
      if (b.kind !== K_FERRY && n > want + 1 && b.dying < 0) {
        b.dying = ctx.time;
        n--;
      }
      if (b.dying >= 0 && ctx.time - b.dying > 1) {
        b.active = false;
        this.active--;
        continue;
      }
      if (b.path) {
        // ferry: shuttle along the path, dwell at both ends
        const P = b.path;
        if (b.dwell > 0) b.dwell -= dt;
        else {
          const segLen = 2;
          const ease = smoothstep(0, 1.5, Math.min(b.pi + b.u, P.length - 1 - (b.pi + b.u))) * 0.8 + 0.2;
          b.u += (b.speed * ease * dt) / segLen;
          while (b.u >= 1) {
            b.u -= 1;
            b.pi += 1;
            if (b.pi >= P.length - 1) {
              P.reverse();
              b.pi = 0;
              b.u = 0;
              b.dwell = 4 + ctx.rng.next() * 3;
            }
          }
        }
        const i = b.pi, last = P.length - 1;
        this.course(ctx, P[Math.max(0, i - 1)], P[Math.min(last, i)], P[Math.min(last, i + 1)], P[Math.min(last, i + 2)], b.u, b.pos, b.dir);
        continue;
      }
      if (dt > 0) {
        b.u += (b.speed * dt) / 2;
        while (b.u >= 1) {
          b.u -= 1;
          b.t[0] = b.t[1];
          b.t[1] = b.t[2];
          b.t[2] = b.t[3];
          b.t[3] = this.nextTile(ctx, b);
          if (!this.water.has(b.t[2])) {
            b.active = false;
            this.active--;
            break;
          }
        }
      }
      if (b.active) this.course(ctx, b.t[0], b.t[1], b.t[2], b.t[3], b.u, b.pos, b.dir);
    }
    void g;
    this.updateWhale(ctx, dt);
  }

  // ───────────────────────────────────────────── space whale

  private updateWhale(ctx: LifeCtx, dt: number): void {
    if (!this.whaleOK) return;
    const w = this.whale;
    if (w.active) {
      w.t += dt / 6.5;
      if (w.t >= 1) w.active = false;
      return;
    }
    this.whaleT -= dt;
    if (this.whaleT > 0 || ctx.cull.altitude > 70) return;
    this.whaleT = 16 + ctx.rng.next() * 22;
    // a deep-water tile near what the camera looks at
    const cam = game?.camera;
    const p = ctx.planet;
    const g = p.grid;
    const centre = cam?.targetTile?.() ?? -1;
    if (centre < 0) return;
    const ring = g.disk(centre, 7);
    for (let tries = 0; tries < 30; tries++) {
      const t = ring[Math.floor(ctx.rng.next() * ring.length)];
      if (!p.isWater(t) || !this.isDeep(ctx, t)) continue;
      let ok = true;
      for (const n of g.neighbors(t)) if (!this.isDeep(ctx, n)) ok = false;
      if (!ok) continue;
      this.centre(ctx, t, w.base);
      _up.copy(w.base).normalize();
      w.dir.set(ctx.rng.next() - 0.5, ctx.rng.next() - 0.5, ctx.rng.next() - 0.5);
      w.dir.addScaledVector(_up, -w.dir.dot(_up)).normalize();
      w.t = 0;
      w.splash0 = w.splash1 = false;
      w.active = true;
      return;
    }
  }

  private renderWhale(ctx: LifeCtx): void {
    const w = this.whale;
    if (!w.active) return;
    const t = w.t;
    _up.copy(w.base).normalize();
    // ballistic arc: from 1.6 under water, apex 2.1 above, back under; travels 4.5 units forward
    const H = -1.6 + 3.7 * Math.sin(Math.PI * t);
    const dH = 3.7 * Math.PI * Math.cos(Math.PI * t);
    const X = -1.0 + 4.5 * t;
    _p.copy(w.base).addScaledVector(w.dir, X).addScaledVector(_up, H);
    if (!ctx.cull.visible(_p.x, _p.y, _p.z, 3, 150)) return;
    _d.copy(w.dir).multiplyScalar(4.5).addScaledVector(_up, dH).normalize();
    const fr = frameFwd(_fr, _d, _up);
    roll(fr, 0.5 * Math.sin(Math.PI * t));
    ctx.fleet('whale').push(_p.x, _p.y, _p.z, fr.r.x, fr.r.y, fr.r.z, fr.u.x, fr.u.y, fr.u.z, fr.f.x, fr.f.y, fr.f.z, 1, 1, 1, 1);
    ctx.budget--;
    // spray at the surface crossings
    const crossing = (H > -0.6 && H < 0.4);
    const r = ctx.rng;
    if (crossing) {
      _c.copy(_p).addScaledVector(_up, -H);
      for (let k = 0; k < 6; k++) {
        const vx = (r.next() - 0.5) * 1.6, vz = (r.next() - 0.5) * 1.6;
        _a.copy(w.dir).multiplyScalar(vx).addScaledVector(fr.r, vz).addScaledVector(_up, 1.2 + r.next() * 1.6);
        ctx.smoke.emit(_c.x, _c.y, _c.z, _a.x, _a.y, _a.z, 1.6 + r.next(), 0.15, 0.6, 0.95, 0.98, 1, 0.75, 0.6, -1.2);
      }
    }
    // foam rings where it left / re-entered the water
    this.foam(ctx, t, 0.13, fr.r);
    this.foam(ctx, t, 0.87, fr.r);
  }

  private foam(ctx: LifeCtx, t: number, t0: number, right: Vector3): void {
    if (t < t0) return;
    const age = (t - t0) * 6.5;
    if (age > 3) return;
    const w = this.whale;
    _up.copy(w.base).normalize();
    _c.copy(w.base).addScaledVector(w.dir, -1.0 + 4.5 * t0).multiplyScalar(1.0005);
    const rad = 0.6 + age * 0.9;
    const s = 1 - age / 3;
    _a.copy(right).addScaledVector(_up, -right.dot(_up)).normalize();
    _b.crossVectors(_a, _up).normalize();
    ctx.rings.push(_c.x, _c.y, _c.z, _a.x, _a.y, _a.z, _up.x, _up.y, _up.z, _b.x, _b.y, _b.z, rad, rad, 0.85 * s, 0, 0);
  }

  render(ctx: LifeCtx): void {
    this.visible = 0;
    const cull = ctx.cull;
    if (cull.altitude > 70) return;
    for (const b of this.boats) {
      if (!b.active) continue;
      const L = LEN[b.kind];
      if (!cull.visible(b.pos.x, b.pos.y, b.pos.z, L, 80)) continue;
      if (ctx.budget <= 0) break;
      ctx.budget--;
      this.visible++;
      _up.copy(b.pos).normalize();
      const fr = frameFwd(_fr, b.dir, _up);
      const rt = ctx.realTime + b.id * 1.7;
      const rock = b.kind === K_SHIP || b.kind === K_FERRY ? 0.3 : 1;
      roll(fr, Math.sin(rt * 1.3) * 0.05 * rock + (b.kind === K_SAIL ? 0.12 : 0));
      pitch(fr, Math.sin(rt * 1.7 + 1) * 0.035 * rock + (b.kind === K_SPEED ? 0.06 : 0));
      let s = smoothstep(0, 1, ctx.time - b.born);
      if (b.dying >= 0) s *= 1 - smoothstep(0, 1, ctx.time - b.dying);
      const d = Math.sqrt(cull.dist2(b.pos.x, b.pos.y, b.pos.z));
      s *= (b.kind === K_SHIP || b.kind === K_FERRY ? 1 : 1.45) * (d > 12 ? Math.min(1.35, 1 + (d - 12) * 0.01) : 1);
      const c = b.kind === K_SPEED || b.kind === K_HOVER ? PAINT[b.color] : PAINT[0];
      const lift = b.kind === K_HOVER ? 0.02 : 0;
      ctx.fleet(KINDS[b.kind]).push(b.pos.x + _up.x * lift, b.pos.y + _up.y * lift, b.pos.z + _up.z * lift, fr.r.x, fr.r.y, fr.r.z, fr.u.x, fr.u.y, fr.u.z, fr.f.x, fr.f.y, fr.f.z, s, c[0], c[1], c[2]);
      // wake
      const moving = !(b.path && b.dwell > 0);
      if (moving && d < 60) {
        const wl = L * (b.kind === K_SPEED || b.kind === K_HOVER ? 3.6 : 2.4) * s;
        _p.copy(b.pos).addScaledVector(fr.f, -(L * 0.4 * s + wl * 0.5)).addScaledVector(_up, 0.012);
        _a.copy(fr.f).addScaledVector(_up, -fr.f.dot(_up)).normalize();
        _b.crossVectors(_up, _a).normalize();
        ctx.wakes.push(_p.x, _p.y, _p.z, _b.x, _b.y, _b.z, _up.x, _up.y, _up.z, _a.x, _a.y, _a.z, L * 1.1 * s, wl * 0.5, 1, 0, 0);
      }
      if (cull.night > 0.02) {
        _p.copy(b.pos).addScaledVector(_up, L * 0.25 + 0.04);
        ctx.sprites.push(_p.x, _p.y, _p.z, 0.05 + L * 0.03, 1.6, 1.5, 1.2, 1, 0, 0, 0.5);
      }
    }
    this.renderWhale(ctx);
  }

  /** Live position getter for a random boat (ferries and ships included) — null when none. */
  tracker(rng: () => number): (() => Vector3 | null) | null {
    const list = this.boats.filter((b) => b.active && b.dying < 0);
    if (!list.length) return null;
    const b = list[Math.floor(rng() * list.length)];
    const id = b.id;
    return () => (b.active && b.id === id ? b.pos : null);
  }

  dispose(): void {
    this.boats.length = 0;
    this.water.clear();
  }
}

