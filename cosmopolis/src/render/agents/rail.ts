/**
 * OWNER: life.
 * RailTraffic — maglev trains (locomotive, carriages, rear cab) gliding along the guideway's right-hand track and
 * dwelling at maglev stations, plus hyperloop pods racing through the tubes as glowing collars of light.
 * Trains follow the same Route / Bézier-turn machinery as cars; every carriage is placed behind the head on the
 * exact same curve (the route ring keeps the recent hops). Dead ends loop back onto the other track.
 */
import { Vector3 } from 'three';
import { RoadKind } from '../../core/types';
import { getItem } from '../../content/catalog';
import type { Planet } from '../../world/planet';
import { roadSpec } from '../roads/lanes';
import { clamp, frameFwd, newFrame, smoothstep } from './common';
import type { LifeCtx } from './ctx';
import { Route, TURN_T } from './route';

class Train {
  active = false;
  kind = RoadKind.Maglev;
  route = new Route(16);
  hi = 0;
  u = 0;
  speed = 0;
  cars = 3;
  spacing = 0.44;
  id = 0;
  dwellU = -1;
  dwellT = 0;
  lastStation = -1;
  born = -10;
  pos = new Vector3();
  dir = new Vector3();
}

const _ks: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
const _ws: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
const _p = new Vector3();
const _d = new Vector3();
const _up = new Vector3();
const _fr = newFrame();

export class RailTraffic {
  private trains: Train[] = [];
  private tiles = { [RoadKind.Maglev]: [] as number[], [RoadKind.Hyperloop]: [] as number[] };
  private stations = new Set<number>();
  private dirty = true;
  private nextId = 1;
  active = 0;
  visible = 0;

  constructor(private planet: Planet) {
    for (let i = 0; i < 28; i++) this.trains.push(new Train());
  }

  invalidate(): void {
    this.dirty = true;
  }

  private links(t: number, kind: number, out: number[]): number {
    const p = this.planet;
    const g = p.grid;
    const links = p.roadLinks[t];
    if (!links || p.road[t] !== kind) return 0;
    const d = g.degree(t);
    let n = 0;
    for (let k = 0; k < d; k++) if (links & (1 << k) && p.road[g.neighbor(t, k)] === kind) out[n++] = k;
    return n;
  }

  private rebuild(): void {
    this.dirty = false;
    const p = this.planet;
    const g = p.grid;
    const m: number[] = [], h: number[] = [];
    for (let t = 0; t < p.count; t++) {
      const k = p.road[t];
      if (k === RoadKind.Maglev && this.links(t, k, _ks)) m.push(t);
      else if (k === RoadKind.Hyperloop && this.links(t, k, _ks)) h.push(t);
    }
    this.tiles[RoadKind.Maglev] = m;
    this.tiles[RoadKind.Hyperloop] = h;
    this.stations.clear();
    if (m.length || h.length) {
      for (const b of p.buildings.values()) {
        const tags = getItem(b.defId)?.tags;
        if (!tags || !(tags.includes('maglev') || tags.includes('hyperloop') || tags.includes('station'))) continue;
        for (const t of b.tiles) for (const n of g.neighbors(t)) if (p.road[n] === RoadKind.Maglev || p.road[n] === RoadKind.Hyperloop) this.stations.add(n);
      }
    }
    for (const tr of this.trains) {
      if (!tr.active) continue;
      const hp = tr.route.hop(tr.hi);
      if (p.road[hp.a] !== tr.kind || p.road[hp.b] !== tr.kind) this.kill(tr);
    }
  }

  private kill(tr: Train): void {
    if (!tr.active) return;
    tr.active = false;
    this.active--;
  }

  private chooseNext(ctx: LifeCtx, kind: number, a: number, b: number): number {
    const g = this.planet.grid;
    const n = this.links(b, kind, _ks);
    const base = 1 - g.dot(b, a) + 1e-9;
    let tot = 0;
    for (let i = 0; i < n; i++) {
      const t = g.neighbor(b, _ks[i]);
      if (t === a) {
        _ws[i] = 0;
        continue;
      }
      const st = clamp((1 - g.dot(t, a)) / base / 4, 0, 1);
      _ws[i] = 0.25 + st * st * 4;
      tot += _ws[i];
    }
    if (tot <= 0) return n > 0 ? a : -1;
    let r = ctx.rng.next() * tot;
    for (let i = 0; i < n; i++) {
      if (_ws[i] <= 0) continue;
      r -= _ws[i];
      if (r <= 0) return g.neighbor(b, _ks[i]);
    }
    return a;
  }

  private spawn(ctx: LifeCtx, kind: number): void {
    const list = this.tiles[kind as RoadKind.Maglev];
    if (!list.length) return;
    const tr = this.trains.find((t) => !t.active);
    if (!tr) return;
    const p = this.planet;
    const g = p.grid;
    const a = list[Math.floor(ctx.rng.next() * list.length)];
    const n = this.links(a, kind, _ks);
    if (!n) return;
    const b = g.neighbor(a, _ks[Math.floor(ctx.rng.next() * n)]);
    tr.kind = kind;
    tr.id = this.nextId++;
    tr.cars = kind === RoadKind.Maglev ? (ctx.rng.next() < 0.5 ? 3 : 4) : 1;
    tr.spacing = kind === RoadKind.Maglev ? 0.43 : 0.3;
    tr.route.reset();
    // one hop of history behind the train so the carriages have track to sit on
    const back = this.chooseNext(ctx, kind, b, a);
    if (back >= 0 && back !== b) tr.route.push(p, back, a, 0);
    if (!tr.route.push(p, a, b, 0)) return;
    tr.hi = tr.route.last;
    const nx = this.chooseNext(ctx, kind, a, b);
    if (nx < 0 || !tr.route.push(p, b, nx, 0)) return;
    tr.u = ctx.rng.next() * 0.6 + (back >= 0 ? 0 : 0.4);
    tr.speed = roadSpec(kind).speed * 0.2;
    tr.dwellU = -1;
    tr.lastStation = -1;
    tr.born = ctx.time;
    tr.active = true;
    this.active++;
  }

  update(ctx: LifeCtx, dt: number): void {
    if (this.dirty) this.rebuild();
    const m = this.tiles[RoadKind.Maglev].length, h = this.tiles[RoadKind.Hyperloop].length;
    const wantM = m >= 3 ? clamp(Math.round((m / 9) * ctx.density), 1, 10) : 0;
    const wantH = h >= 3 ? clamp(Math.round((h / 4) * ctx.density), 1, 16) : 0;
    let cm = 0, ch = 0;
    for (const t of this.trains) if (t.active) t.kind === RoadKind.Maglev ? cm++ : ch++;
    if (cm < wantM) this.spawn(ctx, RoadKind.Maglev);
    if (ch < wantH) this.spawn(ctx, RoadKind.Hyperloop);
    if (dt <= 0) return;
    const p = this.planet;
    for (const tr of this.trains) {
      if (!tr.active) continue;
      if ((tr.kind === RoadKind.Maglev && cm > wantM + 1) || (tr.kind === RoadKind.Hyperloop && ch > wantH + 1)) {
        this.kill(tr);
        tr.kind === RoadKind.Maglev ? cm-- : ch--;
        continue;
      }
      let hp = tr.route.hop(tr.hi);
      const cruise = roadSpec(tr.kind).speed * (tr.kind === RoadKind.Maglev ? 0.42 : 0.34);
      const turnK = 0.35 + 0.65 * Math.pow(hp.ease, 1.2);
      let k = 1;
      if (tr.u > 1 - TURN_T - 0.3) k = 1 + (turnK - 1) * smoothstep(1 - TURN_T - 0.3, 1 - TURN_T, tr.u);
      else if (tr.u < TURN_T && tr.hi > tr.route.first) {
        const pk = 0.35 + 0.65 * Math.pow(tr.route.hop(tr.hi - 1).ease, 1.2);
        k = pk + (1 - pk) * smoothstep(0, TURN_T, tr.u);
      }
      let want = cruise * k;
      if (tr.dwellU >= 0) {
        const room = Math.max(0, (tr.dwellU - tr.u) * hp.len);
        want = Math.min(want, room * 1.1 + 0.005);
        if (room < 0.01) {
          want = 0;
          tr.dwellT -= dt;
          if (tr.dwellT <= 0) tr.dwellU = -1;
        }
      }
      if (want > tr.speed) tr.speed = Math.min(want, tr.speed + 0.55 * dt);
      else tr.speed = Math.max(want, tr.speed - 1.6 * dt);
      tr.u += (tr.speed * dt) / hp.len;
      while (tr.u >= 1) {
        const left = (tr.u - 1) * hp.len;
        tr.hi++;
        hp = tr.route.hop(tr.hi);
        if (p.road[hp.a] !== tr.kind || p.road[hp.b] !== tr.kind) {
          this.kill(tr);
          break;
        }
        tr.u = left / hp.len;
        const nx = this.chooseNext(ctx, tr.kind, hp.a, hp.b);
        if (nx < 0 || !tr.route.push(p, hp.b, nx, 0)) {
          this.kill(tr);
          break;
        }
        if (this.stations.has(hp.b) && hp.b !== tr.lastStation) {
          tr.lastStation = hp.b;
          tr.dwellU = 0.92;
          tr.dwellT = tr.kind === RoadKind.Maglev ? 3.5 : 1.5;
        }
      }
      if (tr.active) tr.route.sample(p, tr.hi, tr.u, tr.pos, tr.dir);
    }
  }

  render(ctx: LifeCtx): void {
    this.visible = 0;
    const cull = ctx.cull;
    if (cull.altitude > 90) return;
    const p = this.planet;
    const night = cull.night;
    for (const tr of this.trains) {
      if (!tr.active) continue;
      if (!cull.visible(tr.pos.x, tr.pos.y, tr.pos.z, tr.cars * tr.spacing + 0.3, 90)) continue;
      const grow = smoothstep(0, 0.6, ctx.time - tr.born);
      for (let i = 0; i < tr.cars; i++) {
        if (ctx.budget <= 0) return;
        // walk back along the route
        let h = tr.hi;
        let rem = tr.u * tr.route.hop(h).len - i * tr.spacing;
        while (rem < 0 && h > tr.route.first) {
          h--;
          rem += tr.route.hop(h).len;
        }
        if (rem < 0) rem = 0;
        tr.route.sample(p, h, rem / tr.route.hop(h).len, _p, _d);
        if (!cull.visible(_p.x, _p.y, _p.z, 0.3, 90)) continue;
        ctx.budget--;
        this.visible++;
        _up.copy(_p).normalize();
        const fr = frameFwd(_fr, _d, _up);
        if (tr.kind === RoadKind.Maglev) {
          const head = i === 0, tail = i === tr.cars - 1;
          const key = head || tail ? 'maglevHead' : 'maglevCar';
          const sgn = tail && !head ? -1 : 1;
          ctx.fleet(key).push(_p.x, _p.y, _p.z, fr.r.x * sgn, fr.r.y * sgn, fr.r.z * sgn, fr.u.x, fr.u.y, fr.u.z, fr.f.x * sgn, fr.f.y * sgn, fr.f.z * sgn, grow, 1, 1, 1);
          if (head && night > 0.02) {
            _p.addScaledVector(fr.f, 0.2).addScaledVector(fr.u, 0.04);
            ctx.sprites.push(_p.x, _p.y, _p.z, 0.07, 1.6, 1.5, 1.2, 1);
          }
        } else {
          ctx.fleet('hyperPod').push(_p.x, _p.y, _p.z, fr.r.x, fr.r.y, fr.r.z, fr.u.x, fr.u.y, fr.u.z, fr.f.x, fr.f.y, fr.f.z, grow, 1, 1, 1);
          ctx.sprites.push(_p.x, _p.y, _p.z, 0.16, 0.7, 0.45, 1.8, 0.25);
        }
      }
    }
  }

  /** Live position getter for a random train (maglev preferred) — null when none. */
  tracker(rng: () => number): (() => Vector3 | null) | null {
    const list = this.trains.filter((t) => t.active);
    if (!list.length) return null;
    const m = list.filter((t) => t.kind === RoadKind.Maglev);
    const tr = (m.length ? m : list)[Math.floor(rng() * (m.length ? m : list).length)];
    const id = tr.id;
    return () => (tr.active && tr.id === id ? tr.pos : null);
  }

  dispose(): void {
    this.trains.length = 0;
  }
}
