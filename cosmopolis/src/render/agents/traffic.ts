/**
 * OWNER: life.
 * RoadTraffic — hover-cars on the road network. Ten vehicle types (sedans, coupes, vans, city shuttles, cargo
 * haulers, taxis, police, ambulances, fire engines, garbage compactors) drive the lane contract of
 * render/roads/lanes.ts with right-hand traffic, smooth Bézier turns, slowing through junctions, signal phases at
 * crossroads, car-following queues, buses dwelling at shuttle stops, taxis picking up fares and emergency vehicles
 * dispatched (lights flashing) to fires and disasters. Density follows population + road count (and the sim's
 * per-tile traffic); headlights, brake lights and warm headlight pools come on at night.
 *
 * Everything is pooled: cars, routes and frames are allocated once; per-frame work is typed-array bookkeeping.
 */
import { Vector3 } from 'three';
import { RoadKind, TileFlag, zoneFamily, type Zone } from '../../core/types';
import { getItem } from '../../content/catalog';
import { game } from '../../game/instance';
import type { Planet } from '../../world/planet';
import { roadSpec } from '../roads/lanes';
import { linHex } from './batch';
import { clamp, frameFwd, hf, newFrame, smoothstep } from './common';
import type { FleetKey, LifeCtx } from './ctx';
import { Route, TURN_T } from './route';

const T_SEDAN = 0, T_COUPE = 1, T_VAN = 2, T_BUS = 3, T_TRUCK = 4, T_TAXI = 5, T_POLICE = 6, T_AMB = 7, T_FIRE = 8, T_GARBAGE = 9;
const KEYS: FleetKey[] = ['sedan', 'coupe', 'van', 'bus', 'truck', 'taxi', 'police', 'ambulance', 'fire', 'garbage'];
const LEN = [0.24, 0.25, 0.22, 0.5, 0.4, 0.24, 0.245, 0.26, 0.38, 0.32];
const WID = [0.11, 0.115, 0.115, 0.13, 0.12, 0.11, 0.112, 0.12, 0.13, 0.125];
const SPD = [1, 1.14, 0.95, 0.78, 0.84, 1.06, 1.1, 1.12, 0.98, 0.72];
/** height of head/tail lights above the hover base */
const LIGHT_Y = [0.034, 0.03, 0.036, 0.034, 0.036, 0.034, 0.034, 0.034, 0.036, 0.034];
/** roof light-bar height (0 = none) */
const BAR_Y = [0, 0, 0, 0, 0, 0, 0.088, 0.125, 0.1, 0];
const BAR_Z = [0, 0, 0, 0, 0, 0, -0.012, 0.035, 0.15, 0];

const PAINT_CAR = [0xf2f4f7, 0xf2f4f7, 0xf2f4f7, 0xb9c0c8, 0xb9c0c8, 0x6a7380, 0x6a7380, 0x2a2e35, 0x2a2e35, 0xd8343a, 0x2f6fd8, 0x18b3a8, 0xff8a2a, 0xf2c230, 0x4fae54, 0x8a5ad8, 0xe86aa8, 0xe8dcc0, 0x7ad0ff, 0x9a2a3a];
const PAINT_BUS = [0x18b3a8, 0xff8a2a, 0x2f6fd8, 0x4fae54, 0xd8343a, 0x8a5ad8];
const PAINT_BOX = [0xd84a3a, 0x3a7ad8, 0xe8b83a, 0x3ab87a, 0xe8e8e8, 0xd87a3a, 0x7a5ad8, 0x2a9ab8];
const LIN_CAR = toLin(PAINT_CAR), LIN_BUS = toLin(PAINT_BUS), LIN_BOX = toLin(PAINT_BOX);
const LIN_TAXI = toLin([0xf6c22a]), LIN_WHITE = toLin([0xf4f6f9]), LIN_FIRE = toLin([0xd8262a]), LIN_GARB = toLin([0x3aa860]);

function toLin(list: number[]): Float32Array {
  const out = new Float32Array(list.length * 3);
  list.forEach((h, i) => linHex(h, out, i * 3));
  return out;
}

export function isDrivable(kind: number): boolean {
  return kind === RoadKind.Street || kind === RoadKind.Avenue || kind === RoadKind.Highway;
}

class Car {
  active = false;
  index = 0;
  id = 0;
  type = 0;
  r = 1;
  g = 1;
  b = 1;
  route = new Route(4);
  hi = 0;
  u = 0;
  speed = 0;
  vmul = 1;
  lane = 0;
  pos = new Vector3();
  dir = new Vector3(0, 0, 1);
  born = -10;
  dying = -1;
  trip = 60;
  target = -1;
  targetRoad = -1;
  seek = 0;
  flashing = false;
  dwellU = -1;
  dwellT = 0;
  pull = 0;
  stall = 0;
  ghost = 0;
  braking = false;
  /** seconds left pulling over for an emergency vehicle behind */
  yieldT = 0;
  /** directed edge slots (current hop / next hop) */
  slot = -1;
  nslot = -1;
  /** junction info for node b of the current hop */
  jLinks = 0;
  jPresent = 0;
  kIn = 0;
  /** drawn last frame (unseen cars refresh their position only every 4th frame) */
  seen = true;
  next = -1;
}

const _up = new Vector3();
const _p = new Vector3();
const _fr = newFrame();
const _ks: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
const _ks2: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

export class RoadTraffic {
  private cars: Car[] = [];
  private free: number[] = [];
  private network: Int32Array = new Int32Array(0);
  private netCount = 0;
  private dirty = true;
  private stopTiles = new Set<number>();
  private weights = new Float32Array(10);
  private edgeHead: Int32Array;
  private touched: Int32Array;
  private touchedN = 0;
  private nextId = 1;
  private filled = false;
  private dispatchCool = 0;
  private fields = new Map<number, Map<number, number>>();
  private frame = 0;
  /** current number of active cars */
  active = 0;
  target = 0;
  visible = 0;
  get networkSize(): number {
    return this.netCount;
  }

  constructor(private planet: Planet, readonly capacity = 520) {
    for (let i = 0; i < capacity; i++) {
      const c = new Car();
      c.index = i;
      this.cars.push(c);
      this.free.push(capacity - 1 - i);
    }
    this.edgeHead = new Int32Array(planet.grid.nbr.length).fill(-1);
    this.touched = new Int32Array(capacity * 2);
  }

  /** Roads / buildings changed: rebuild the drivable network lazily. */
  invalidate(): void {
    this.dirty = true;
  }

  private rebuild(): void {
    this.dirty = false;
    this.fields.clear();
    const p = this.planet;
    const g = p.grid;
    const list: number[] = [];
    for (let t = 0; t < p.count; t++) {
      if (!isDrivable(p.road[t])) continue;
      if (this.driveLinks(t, _ks) > 0) list.push(t);
    }
    this.network = Int32Array.from(list);
    this.netCount = list.length;
    // services present → vehicle mix; shuttle stops → bus dwell tiles
    let police = 0, health = 0, fire = 0, garbage = 0, busy = 0;
    this.stopTiles.clear();
    for (const b of p.buildings.values()) {
      const def = getItem(b.defId);
      if (!def) continue;
      const tags = def.tags ?? [];
      const cov = def.coverage ?? [];
      if (tags.includes('police') || cov.some((c) => c.service === 'police')) police++;
      if (tags.includes('health') || cov.some((c) => c.service === 'health')) health++;
      if (tags.includes('fire') || cov.some((c) => c.service === 'fire')) fire++;
      if (tags.includes('garbage') || tags.includes('waste') || cov.some((c) => c.service === 'garbage')) garbage++;
      if (tags.includes('bus') || tags.includes('stop') || tags.includes('depot')) {
        busy++;
        for (const t of b.tiles) for (const n of g.neighbors(t)) if (isDrivable(p.road[n])) this.stopTiles.add(n);
      }
    }
    let com = 0, ind = 0, zoned = 0;
    for (let t = 0; t < p.count; t++) {
      const f = zoneFamily(p.zone[t] as Zone);
      if (!f) continue;
      zoned++;
      if (f === 'C') com++;
      else if (f === 'I') ind++;
    }
    const cs = zoned ? com / zoned : 0.2, is = zoned ? ind / zoned : 0.2;
    const w = this.weights;
    w[T_SEDAN] = 40;
    w[T_COUPE] = 12;
    w[T_VAN] = 11;
    w[T_BUS] = busy ? 6 : 1.6;
    w[T_TRUCK] = 5 + is * 26;
    w[T_TAXI] = 4 + cs * 16;
    w[T_POLICE] = police ? 3 : 0.7;
    w[T_AMB] = health ? 1.8 : 0.35;
    w[T_FIRE] = fire ? 1.1 : 0.2;
    w[T_GARBAGE] = garbage ? 1.8 : 0.5;
    // drop cars that now sit on removed roads
    for (const c of this.cars) {
      if (!c.active) continue;
      const h = c.route.hop(c.hi);
      if (!isDrivable(p.road[h.a]) || !isDrivable(p.road[h.b])) this.kill(c);
    }
  }

  /** Drivable linked neighbours k of tile t (both ends drivable). */
  private driveLinks(t: number, out: number[]): number {
    const p = this.planet;
    const g = p.grid;
    const links = p.roadLinks[t];
    if (!links) return 0;
    const d = g.degree(t);
    let n = 0;
    for (let k = 0; k < d; k++) {
      if (!(links & (1 << k))) continue;
      if (!isDrivable(p.road[g.neighbor(t, k)])) continue;
      out[n++] = k;
    }
    return n;
  }

  private kill(c: Car): void {
    if (!c.active) return;
    c.active = false;
    this.active--;
    this.free.push(c.index);
  }

  private pickType(ctx: LifeCtx): number {
    const w = this.weights;
    let tot = 0;
    for (let i = 0; i < 10; i++) tot += w[i];
    let r = ctx.rng.next() * tot;
    for (let i = 0; i < 10; i++) {
      r -= w[i];
      if (r <= 0) return i;
    }
    return 0;
  }

  /** Shortest-path distance field (hops over the drivable network) toward a target road tile; cached. */
  private field(target: number): Map<number, number> {
    let f = this.fields.get(target);
    if (f) return f;
    f = new Map<number, number>([[target, 0]]);
    const queue = [target];
    const g = this.planet.grid;
    for (let qi = 0; qi < queue.length; qi++) {
      const t = queue[qi];
      const d = f.get(t)!;
      const n = this.driveLinks(t, _ks2);
      for (let i = 0; i < n; i++) {
        const nb = g.neighbor(t, _ks2[i]);
        if (f.has(nb)) continue;
        f.set(nb, d + 1);
        queue.push(nb);
      }
    }
    if (this.fields.size > 6) this.fields.delete(this.fields.keys().next().value!);
    this.fields.set(target, f);
    return f;
  }

  /** Choose the tile after b when arriving from a (prefers straight on and bigger roads; seeks targets). */
  private chooseNext(ctx: LifeCtx, c: Car, a: number, b: number): number {
    const p = this.planet;
    const g = p.grid;
    const n = this.driveLinks(b, _ks);
    const tgt = c.targetRoad;
    if (tgt >= 0) {
      // follow the shortest path (distance field), never a U-turn unless it is the only way
      const f = this.field(tgt);
      let best = -1, bd = Infinity;
      for (let i = 0; i < n; i++) {
        const t = g.neighbor(b, _ks[i]);
        if (t === a && n > 1) continue;
        const d = f.get(t) ?? Infinity;
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (best >= 0) return best;
    }
    const base = 1 - g.dot(b, a) + 1e-9;
    let tot = 0;
    for (let i = 0; i < n; i++) {
      const t = g.neighbor(b, _ks[i]);
      if (t === a) {
        WS[i] = 0;
        continue;
      }
      // straightness: straight on ≈ 1, gentle turn ≈ 0.75, sharp turn ≈ 0.25
      const st = clamp((1 - g.dot(t, a)) / base / 4, 0, 1);
      const big = p.road[t] === RoadKind.Avenue ? 0.5 : p.road[t] === RoadKind.Highway ? (c.type === T_TRUCK ? 1.2 : 0.8) : 0;
      WS[i] = 0.6 + st * st * 2.6 + big;
      tot += WS[i];
    }
    if (tot <= 0) return isDrivable(p.road[a]) ? a : -1;
    let r = ctx.rng.next() * tot;
    for (let i = 0; i < n; i++) {
      if (WS[i] <= 0) continue;
      r -= WS[i];
      if (r <= 0) return g.neighbor(b, _ks[i]);
    }
    for (let i = n - 1; i >= 0; i--) if (WS[i] > 0) return g.neighbor(b, _ks[i]);
    return -1;
  }

  /** Spawn one car. Returns it (or null when the pool is full / no network). */
  spawn(ctx: LifeCtx, o: { type?: number; at?: number; target?: number; grow?: boolean } = {}): Car | null {
    if (!this.free.length || !this.netCount) return null;
    const p = this.planet;
    const g = p.grid;
    let a = o.at ?? -1;
    if (a < 0) {
      // bias toward busy tiles (sim traffic field) but keep everything populated
      for (let tries = 0; tries < 6; tries++) {
        a = this.network[Math.floor(ctx.rng.next() * this.netCount)];
        const tr = game?.sim?.trafficAt?.(a) ?? 0.4;
        if (ctx.rng.next() < 0.35 + clamp(tr, 0, 1.5) * 0.6) break;
      }
    }
    const nl = this.driveLinks(a, _ks);
    if (!nl) return null;
    const b = g.neighbor(a, _ks[Math.floor(ctx.rng.next() * nl)]);
    const idx = this.free.pop()!;
    const c = this.cars[idx];
    c.active = true;
    c.id = this.nextId++;
    c.type = o.type ?? this.pickType(ctx);
    const pal = c.type === T_BUS ? LIN_BUS : c.type === T_TRUCK ? LIN_BOX : c.type === T_TAXI ? LIN_TAXI : c.type === T_POLICE || c.type === T_AMB ? LIN_WHITE : c.type === T_FIRE ? LIN_FIRE : c.type === T_GARBAGE ? LIN_GARB : LIN_CAR;
    const pi = Math.floor(ctx.rng.next() * (pal.length / 3)) * 3;
    c.r = pal[pi];
    c.g = pal[pi + 1];
    c.b = pal[pi + 2];
    c.vmul = 0.88 + ctx.rng.next() * 0.24;
    const lanes = roadSpec(p.road[a]).lanes.length;
    c.lane = c.type === T_BUS || c.type === T_TRUCK || c.type === T_GARBAGE ? 3 : Math.floor(ctx.rng.next() * Math.max(1, lanes));
    c.target = o.target ?? -1;
    c.targetRoad = c.target >= 0 ? this.nearestRoad(c.target) : -1;
    c.seek = 0;
    c.flashing = c.target >= 0 || ((c.type === T_POLICE || c.type === T_AMB) && ctx.rng.next() < 0.25);
    c.dwellU = -1;
    c.dwellT = 0;
    c.pull = 0;
    c.yieldT = 0;
    c.stall = 0;
    c.ghost = 0;
    c.dying = -1;
    c.trip = 30 + ctx.rng.next() * 90;
    c.born = o.grow === false ? -10 : ctx.time;
    c.route.reset();
    c.route.push(p, a, b, c.lane);
    const nx = this.chooseNext(ctx, c, a, b);
    if (nx < 0 || !c.route.push(p, b, nx, c.lane)) {
      this.kill(c);
      return null;
    }
    c.hi = c.route.last - 1;
    c.u = o.grow === false ? ctx.rng.next() * 0.9 : ctx.rng.next() * 0.5;
    c.speed = roadSpec(p.road[a]).speed * 0.3;
    this.enterHop(c);
    c.route.sample(p, c.hi, c.u, c.pos, c.dir);
    this.active++;
    return c;
  }

  private nearestRoad(tile: number): number {
    const g = this.planet.grid;
    let best = -1, bd = -2;
    for (let i = 0; i < this.netCount; i++) {
      const t = this.network[i];
      const d = g.dot(t, tile);
      if (d > bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** Bookkeeping when a car starts a hop: slots, junction info, dwell decisions. */
  private enterHop(c: Car): void {
    const p = this.planet;
    const g = p.grid;
    const h = c.route.hop(c.hi);
    const nh = c.route.hop(c.hi + 1);
    c.slot = g.start[h.a] + g.neighborIndex(h.a, h.b);
    c.nslot = g.start[nh.a] + g.neighborIndex(nh.a, nh.b);
    const n = this.driveLinks(h.b, _ks);
    c.jLinks = n;
    let present = 0;
    for (let i = 0; i < n; i++) present |= 1 << (_ks[i] % 3);
    c.jPresent = present;
    c.kIn = g.neighborIndex(h.b, h.a);
    c.dwellU = -1;
    // buses stop at shuttle stops, taxis pick up fares now and then
    if (c.type === T_BUS && this.stopTiles.has(h.b) && hf(c.id, h.b) < 0.8) {
      c.dwellU = 0.62;
      c.dwellT = 2.6;
    } else if (c.type === T_TAXI && hf(c.id, h.a * 7 + h.b) < 0.05) {
      c.dwellU = 0.55;
      c.dwellT = 1.6;
    }
    // emergency arrival
    if (c.targetRoad >= 0 && (h.b === c.targetRoad || g.dot(h.b, c.target) > Math.cos(2.2 * (2 / p.radius)))) {
      c.dwellU = 0.55;
      c.dwellT = 18 + hf(c.id, 3) * 10;
      c.targetRoad = -1;
    }
  }

  /** Is the signal for the current approach green? */
  private green(c: Car, t: number): boolean {
    if (c.jLinks < 4) return true;
    const h = this.planet;
    const b = c.route.hop(c.hi).b;
    const kind = h.road[b];
    if (kind === RoadKind.Highway) return true;
    let groups = 0;
    for (let k = 0; k < 3; k++) if (c.jPresent & (1 << k)) groups++;
    if (groups < 2) return true;
    const PH = 3.6;
    const off = hf(b, 11) * PH * groups;
    const tt = t + off;
    const slot = Math.floor(tt / PH) % groups;
    const inPhase = tt - Math.floor(tt / PH) * PH;
    let j = -1, gi = -1;
    for (let k = 0; k < 3; k++) {
      if (!(c.jPresent & (1 << k))) continue;
      gi++;
      if (gi === slot) {
        j = k;
        break;
      }
    }
    return j === c.kIn % 3 && inPhase < PH - 0.7;
  }

  /** Emergency services rush to a tile (fire, disaster). */
  dispatch(ctx: LifeCtx, tile: number, types: number[]): void {
    if (this.dirty) this.rebuild();
    if (!this.netCount) return;
    const g = this.planet.grid;
    const R = this.planet.radius;
    for (const type of types) {
      // start 3–7 tiles away on the network
      let at = -1;
      for (let tries = 0; tries < 40; tries++) {
        const t = this.network[Math.floor(ctx.rng.next() * this.netCount)];
        const ang = g.angle(t, tile) * R / 2;
        if (ang >= 3 && ang <= 7) {
          at = t;
          break;
        }
      }
      if (at < 0) at = this.network[Math.floor(ctx.rng.next() * this.netCount)];
      if (!this.free.length) this.recycleOne();
      const c = this.spawn(ctx, { type, at, target: tile });
      if (c) c.flashing = true;
    }
  }

  private recycleOne(): void {
    for (const c of this.cars) {
      if (c.active && c.target < 0 && !c.flashing && c.dying < 0) {
        this.kill(c);
        return;
      }
    }
  }

  /** React to tile flags: send fire engines to new fires. */
  onFlags(ctx: LifeCtx, tiles: number[]): void {
    if (this.dispatchCool > 0) return;
    const p = this.planet;
    for (const t of tiles) {
      if (p.flags[t] & TileFlag.Burning) {
        this.dispatch(ctx, t, [T_FIRE, T_FIRE, T_POLICE]);
        this.dispatchCool = 6;
        return;
      }
    }
  }

  onDisaster(ctx: LifeCtx, tile: number | undefined): void {
    if (tile === undefined || tile < 0) return;
    this.dispatch(ctx, tile, [T_POLICE, T_POLICE, T_AMB, T_AMB, T_FIRE]);
  }

  update(ctx: LifeCtx, dt: number): void {
    if (this.dirty) this.rebuild();
    this.dispatchCool = Math.max(0, this.dispatchCool - dt);
    const p = this.planet;
    // ── density target
    const pop = game?.sim?.getMetric?.('population') ?? 0;
    const want = Math.min(this.capacity, Math.round((this.netCount * 1.15 + pop / 12) * ctx.density), Math.round(this.netCount * 2.6));
    this.target = want;
    if (!this.filled && this.netCount) {
      this.filled = true;
      for (let i = 0; i < want; i++) this.spawn(ctx, { grow: false });
    }
    if (dt <= 0) {
      for (const c of this.cars) if (c.active) c.route.sample(p, c.hi, c.u, c.pos, c.dir);
      return;
    }
    let spawnBudget = 4;
    while (this.active < want && spawnBudget-- > 0) if (!this.spawn(ctx)) break;
    if (this.active > want + 4) {
      let extra = this.active - want;
      for (const c of this.cars) {
        if (extra <= 0) break;
        if (c.active && c.trip > 0 && c.target < 0 && !c.flashing) {
          c.trip = 0;
          extra--;
        }
      }
    }
    // ── car-following lists per directed edge
    const head = this.edgeHead;
    for (let i = 0; i < this.touchedN; i++) head[this.touched[i]] = -1;
    this.touchedN = 0;
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.active || c.slot < 0) continue;
      if (head[c.slot] === -1 && this.touchedN < this.touched.length) this.touched[this.touchedN++] = c.slot;
      c.next = head[c.slot];
      head[c.slot] = i;
    }
    const t = ctx.time;
    this.frame++;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.active) continue;
      this.drive(ctx, c, i, dt, t);
    }
  }

  private drive(ctx: LifeCtx, c: Car, i: number, dt: number, t: number): void {
    const p = this.planet;
    const route = c.route;
    let h = route.hop(c.hi);
    const kindHere = p.road[c.u < 0.5 ? h.a : h.b];
    let v = roadSpec(kindHere).speed * 0.5 * SPD[c.type] * c.vmul;
    if (c.flashing && c.target >= 0) v *= 1.8;
    // turns & junctions
    const nh = route.hop(c.hi + 1);
    void nh;
    const turnK = 0.3 + 0.7 * Math.pow(h.ease, 1.3);
    let k = 1;
    if (c.u > 1 - TURN_T - 0.18) {
      const target = c.jLinks >= 3 ? Math.min(turnK, 0.72) : turnK;
      k = 1 + (target - 1) * smoothstep(1 - TURN_T - 0.18, 1 - TURN_T, c.u);
    } else if (c.u < TURN_T && c.hi > route.first) {
      const prev = route.hop(c.hi - 1);
      const pk = 0.3 + 0.7 * Math.pow(prev.ease, 1.3);
      k = pk + (1 - pk) * smoothstep(0, TURN_T, c.u);
    }
    let want = v * k;
    // signals
    if (c.jLinks >= 4 && !(c.flashing && c.target >= 0)) {
      const stopU = 1 - TURN_T - 0.03;
      if (c.u < stopU && !this.green(c, t)) {
        const room = Math.max(0, (stopU - c.u) * h.len - 0.02);
        want = Math.min(want, room * 2.4);
      }
    }
    // dwell (bus stop, taxi fare, emergency on scene)
    if (c.dwellU >= 0) {
      if (c.u < c.dwellU) {
        const room = Math.max(0, (c.dwellU - c.u) * h.len);
        want = Math.min(want, room * 2.2 + 0.01);
        c.pull = Math.min(1, c.pull + dt * 1.5 * smoothstep(0.25, 0.0, room));
        if (room < 0.012) {
          want = 0;
          c.dwellT -= dt;
          if (c.dwellT <= 0) {
            c.dwellU = -1;
            if (c.target >= 0) {
              c.target = -1;
              c.flashing = ctx.rng.next() < 0.3;
              c.trip = 20 + ctx.rng.next() * 30;
            }
          }
        }
      } else {
        c.dwellU = -1;
      }
    } else if (c.pull > 0 && c.yieldT <= 0) c.pull = Math.max(0, c.pull - dt * 1.2);
    // yield: pull over and crawl while an emergency vehicle passes
    if (c.yieldT > 0) {
      c.yieldT -= dt;
      want = Math.min(want, v * 0.3);
      c.pull = Math.min(1, c.pull + dt * 2);
    }
    const responding = c.flashing && c.target >= 0;
    // car following (responders don't queue: everyone ahead pulls over instead)
    if (c.ghost > 0) c.ghost -= dt;
    else if (responding) {
      for (let j = this.edgeHead[c.slot]; j >= 0; j = this.cars[j].next) {
        const o = this.cars[j];
        if (j !== i && o.u > c.u && (o.u - c.u) * h.len < 1.6) o.yieldT = 1.2;
      }
    } else {
      const L = LEN[c.type];
      let gap = Infinity;
      for (let j = this.edgeHead[c.slot]; j >= 0; j = this.cars[j].next) {
        if (j === i) continue;
        const o = this.cars[j];
        if (o.lane !== c.lane && laneOf(p, h, o.lane) !== laneOf(p, h, c.lane)) continue;
        if (o.u <= c.u) continue;
        const gp = (o.u - c.u) * h.len - (L + LEN[o.type]) * 0.5;
        if (gp < gap) gap = gp;
      }
      if (gap === Infinity && c.u > 0.4 && c.nslot >= 0) {
        const nh2 = route.hop(c.hi + 1);
        for (let j = this.edgeHead[c.nslot]; j >= 0; j = this.cars[j].next) {
          const o = this.cars[j];
          if (o.lane !== c.lane && laneOf(p, nh2, o.lane) !== laneOf(p, nh2, c.lane)) continue;
          const gp = (1 - c.u) * h.len + o.u * nh2.len - (L + LEN[o.type]) * 0.5;
          if (gp < gap) gap = gp;
        }
      }
      if (gap < Infinity) want = Math.min(want, Math.max(0, (gap - 0.06) * 2.0));
    }
    // accelerate / brake
    c.braking = want < c.speed - 0.03;
    if (want > c.speed) c.speed = Math.min(want, c.speed + 0.7 * dt);
    else c.speed = Math.max(want, c.speed - 3.2 * dt);
    if (c.speed < 0.015 && c.dwellU < 0) {
      c.stall += dt;
      if (c.stall > 9) {
        c.ghost = 2.5;
        c.stall = 0;
      }
    } else c.stall = 0;
    // advance
    c.u += (c.speed * dt) / h.len;
    c.trip -= dt;
    if (c.dying >= 0 && t - c.dying > 0.45) {
      this.kill(c);
      return;
    }
    while (c.u >= 1) {
      const leftover = (c.u - 1) * h.len;
      c.hi++;
      h = route.hop(c.hi);
      if (!isDrivable(p.road[h.a]) || !isDrivable(p.road[h.b])) {
        this.kill(c);
        return;
      }
      c.u = leftover / h.len;
      if (c.trip <= 0 && c.dying < 0 && c.target < 0) c.dying = t;
      if (c.target >= 0 && (c.seek += 1) > 60) {
        c.target = -1;
        c.targetRoad = -1;
      }
      const nx = this.chooseNext(ctx, c, h.a, h.b);
      if (nx < 0 || !route.push(p, h.b, nx, c.lane)) {
        this.kill(c);
        return;
      }
      this.enterHop(c);
    }
    if (c.seen || ((this.frame + c.index) & 3) === 0) route.sample(p, c.hi, c.u, c.pos, c.dir);
  }

  render(ctx: LifeCtx): void {
    const cull = ctx.cull;
    const night = cull.night;
    const close = cull.altitude < 60;
    this.visible = 0;
    if (!close) {
      for (const c of this.cars) c.seen = false;
      return;
    }
    const sprites = ctx.sprites;
    const beams = ctx.beams;
    const rt = ctx.realTime;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (!c.active) continue;
      const P = c.pos;
      c.seen = false;
      if (!cull.visible(P.x, P.y, P.z, 0.6, 72)) continue;
      c.seen = true;
      if (ctx.budget <= 0) return;
      ctx.budget--;
      this.visible++;
      _up.copy(P).normalize();
      const fr = frameFwd(_fr, c.dir, _up);
      // pull over to the kerb while dwelling
      let px = P.x, py = P.y, pz = P.z;
      if (c.pull > 0) {
        const s = smoothstep(0, 1, c.pull) * 0.05;
        px += fr.r.x * s;
        py += fr.r.y * s;
        pz += fr.r.z * s;
      }
      const bob = Math.sin(rt * 2.7 + c.id * 1.7) * 0.0022;
      px += _up.x * bob;
      py += _up.y * bob;
      pz += _up.z * bob;
      // gently enlarge distant vehicles so they stay readable when zoomed out
      const dz = Math.sqrt(cull.dist2(P.x, P.y, P.z));
      let s = dz > 9 ? Math.min(1.35, 1 + (dz - 9) * 0.012) : 1;
      const age = ctx.time - c.born;
      if (age < 0.45) s *= smoothstep(0, 0.45, age);
      if (c.dying >= 0) s *= 1 - smoothstep(0, 0.45, ctx.time - c.dying);
      if (s <= 0.01) continue;
      ctx.fleet(KEYS[c.type]).push(px, py, pz, fr.r.x, fr.r.y, fr.r.z, fr.u.x, fr.u.y, fr.u.z, fr.f.x, fr.f.y, fr.f.z, s, c.r, c.g, c.b);
      const L = LEN[c.type] * s, W = WID[c.type] * s;
      const d2 = dz * dz;
      // head & tail lights (night only — the shader fades them by local night)
      if (night > 0.02 && d2 < 50 * 50) {
        const ly = LIGHT_Y[c.type] * s;
        const two = d2 < 22 * 22;
        const hx = W * 0.32;
        for (let k = two ? -1 : 0; k <= (two ? 1 : 0); k += 2) {
          const ox = two ? k * hx : 0;
          _p.set(px, py, pz).addScaledVector(fr.f, L * 0.5 + 0.008).addScaledVector(fr.u, ly).addScaledVector(fr.r, ox);
          sprites.push(_p.x, _p.y, _p.z, two ? 0.032 : 0.05, 1.5, 1.25, 0.9, 1);
          _p.set(px, py, pz).addScaledVector(fr.f, -L * 0.5 - 0.008).addScaledVector(fr.u, ly - 0.004).addScaledVector(fr.r, ox);
          const br = c.braking || c.speed < 0.02 ? 2.2 : 0.9;
          sprites.push(_p.x, _p.y, _p.z, two ? 0.024 : 0.036, 1.4 * br, 0.08 * br, 0.05 * br, 1);
        }
        if (d2 < 32 * 32 && c.speed > 0.01) {
          _p.set(px, py, pz).addScaledVector(fr.f, L * 0.5 + 0.2).addScaledVector(_up, 0.004);
          beams.push(_p.x, _p.y, _p.z, fr.r.x, fr.r.y, fr.r.z, _up.x, _up.y, _up.z, fr.f.x, fr.f.y, fr.f.z, 0.1, 0.22, 0.45, 0.38, 0.27);
        }
      }
      // light bars
      if (c.flashing && BAR_Y[c.type] > 0 && d2 < 55 * 55) {
        const by = BAR_Y[c.type] * s, bz = BAR_Z[c.type] * s;
        const ph = (c.id * 0.137) % 1;
        const red = c.type === T_FIRE ? STROBE_ORANGE : STROBE_RED;
        const other = c.type === T_POLICE ? STROBE_BLUE : c.type === T_AMB ? STROBE_WHITE : STROBE_AMBER;
        for (let side = -1; side <= 1; side += 2) {
          _p.set(px, py, pz).addScaledVector(fr.u, by).addScaledVector(fr.f, bz).addScaledVector(fr.r, side * 0.022 * s);
          const col = side < 0 ? other : red;
          sprites.push(_p.x, _p.y, _p.z, 0.05, col[0], col[1], col[2], 0, 2.4, side < 0 ? ph : (ph + 0.5) % 1, 0.42);
        }
      }
    }
  }

  /**
   * Live position getter for a random car currently on screen (null when none). kind: 'car' (any), 'bus',
   * 'emergency' (responding / flashing). The getter returns null once that car leaves the road.
   */
  tracker(kind: string, rng: () => number): (() => Vector3 | null) | null {
    const pool: Car[] = [];
    for (const c of this.cars) {
      if (!c.active || c.dying >= 0) continue;
      if (kind === 'bus' && c.type !== T_BUS) continue;
      if (kind === 'emergency' && !c.flashing) continue;
      pool.push(c);
    }
    const seen = pool.filter((c) => c.seen);
    const list = seen.length ? seen : pool;
    if (!list.length) return null;
    const c = list[Math.floor(rng() * list.length)];
    const id = c.id;
    return () => (c.active && c.id === id ? c.pos : null);
  }

  dispose(): void {
    this.cars.length = 0;
    this.free.length = 0;
  }
}

const WS: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
const STROBE_RED = [2.4, 0.12, 0.15], STROBE_ORANGE = [2.2, 0.35, 0.05], STROBE_BLUE = [0.25, 0.5, 2.6], STROBE_WHITE = [1.8, 1.8, 2.0], STROBE_AMBER = [2.4, 0.9, 0.1];

/** Effective lane offset of lane index `lane` on hop h (lanes clamp on narrower roads). */
function laneOf(p: Planet, h: { a: number }, lane: number): number {
  const l = roadSpec(p.road[h.a]).lanes;
  return l[Math.min(l.length - 1, lane)];
}
