/**
 * OWNER: god.
 * Weather powers: lightning, thunderstorm, tornado (drag a path), hypercane (a planet-scale cyclone), blizzard,
 * flash freeze, heatwave & drought, acid rain, sandstorm, wildfire, rainbow blessing.
 */
import { Quaternion, Vector3, type Matrix4 } from 'three';
import type { BuildingInstance } from '../../world/planet';
import { Biome, BuildingState, Feature, TileFlag } from '../../core/types';
import { InstState } from '../../render/materials';
import { PRESETS, fxRand } from '../../render/fx/particles';
import { ShellMode } from '../../render/fx/shells';
import { Rainbow } from '../../render/fx/sky';
import type { Tornado } from '../../render/fx/vortex';
import type { FxObject } from '../../render/fx/FxLayer';
import type { Shell } from '../../render/fx/shells';
import { Effect, type PowerCtx, type PowerSpec } from '../effect';
import type { Flyer } from '../../render/fx/flyers';
import { buildingHeight } from '../damage';
import { clamp01, envelope, launchToss, offshore, skyPoint, smooth, sortedByAngle, tangents, tilesToAngle, tossBehaviour } from './common';

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _n = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _q = new Quaternion();

// ───────────────────────────────────────────────────────────── lightning

/** One strike from the sky to a tile (shared by storms). */
export function strike(e: Effect, tile: number, o: { power?: number; fire?: number; wreck?: number; height?: number; color?: number } = {}): void {
  const fx = e.fx;
  const P = e.pos(tile, new Vector3());
  const n = e.nrm(tile, new Vector3());
  // hit the top of a building if one stands there
  const bid = e.planet.building[tile];
  const b = bid >= 0 ? e.planet.buildings.get(bid) : undefined;
  if (b) P.addScaledVector(n, Math.min(6, buildingHeight(b) * 0.9));
  const from = skyPoint(e.R, n, (o.height ?? 26) + e.rng.next() * 6, (e.rng.next() - 0.5) * 10, (e.rng.next() - 0.5) * 10, new Vector3());
  const pw = o.power ?? 1;
  fx.bolts.strike(from, P, { color: o.color ?? 0xc9bdff, width: 0.08 + 0.05 * pw, branches: 3 + Math.round(pw * 2), life: 0.5 + 0.2 * pw, strobes: 3 });
  fx.particles.emit(PRESETS.blueSpark, P, n, 18 * pw, 1.2);
  fx.particles.emit(PRESETS.plasma, P, n, 3, 0.5, 1.2 * pw);
  fx.particles.emit(PRESETS.ring, P, n, 1, 0, 0.4 * pw);
  e.god.flash(0xd8dcff, 1.6 + pw, 0.35, 0.18 * Math.min(1.5, pw));
  e.god.shake(0.18 * pw, 0.35);
  e.sfx('thunder', 0.7 + 0.3 * Math.min(1, pw), 0.9 + e.rng.next() * 0.25);
  const dmg = e.god.damage();
  if (!dmg) return;
  if (b && e.rng.next() < (o.wreck ?? 0.18) * pw) dmg.wreck([tile], { fx: 'blast', report: e.report, rand: () => e.rng.next() });
  else if (e.rng.next() < (o.fire ?? 0.75)) dmg.ignite([tile], 1, e.report, () => e.rng.next());
  if (!b && e.planet.feature[tile] === Feature.Trees && e.rng.next() < 0.5) dmg.ignite(e.planet.grid.neighbors(tile).slice(0, 2), 0.6, e.report);
}

class LightningEffect extends Effect {
  step(): void {
    if (this.once('strike', 0)) {
      const strikes = this.k >= 1.6 ? 3 : 1;
      strike(this, this.ctx.target.tile, { power: Math.min(2, this.k), fire: 0.85 });
      for (let i = 1; i < strikes; i++) strike(this, this.randomTileNear(this.ctx.target.tile, tilesToAngle(this.planet, 2)), { power: this.k * 0.7 });
    }
    if (this.once('again', 0.45) && this.k > 1.2) strike(this, this.ctx.target.tile, { power: this.k * 0.5, fire: 0.5 });
    if (this.t > 1.2) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── thunderstorm

class StormEffect extends Effect {
  private dur = 18 + 8 * this.k;
  private radius = Math.round(5 + 3 * this.k);
  private ang = tilesToAngle(this.planet, this.radius);
  private deck: Shell & FxObject;
  private center = this.nrm(this.ctx.target.tile, new Vector3());
  private nextStrike = 0.6;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.deck = this.own(this.fx.shell(ShellMode.Veil, 24, 96));
    this.deck.setCenter(this.center).range(0, this.ang * 1.5).colors(0x5a6070, 0x23262e);
    this.deck.u.uR.value = this.R + 15;
    this.deck.u.uAngle.value = this.ang * 1.5;
    this.loop('rain', 0.7);
    this.loop('storm', 0.55);
    this.sfx('wind', 0.6);
  }
  step(dt: number): void {
    const env = envelope(this.t / this.dur, 0.12, 0.2);
    this.progress = clamp01(this.t / this.dur);
    this.god.want(this.key, { storm: env, clouds: 0.75 * env, sun: 1 - 0.35 * env, lights: 1 });
    this.deck.u.uIntensity.value = env * 0.95;
    // rain curtain over the region
    const drops = Math.round(this.fx.q(10) * env);
    for (let i = 0; i < drops; i++) {
      const t = this.randomTileNear(this.ctx.target.tile, this.ang);
      const n = this.nrm(t, _n);
      this.at(n, 14 + fxRand() * 3, _a);
      tangents(n, _e1, _e2);
      this.fx.particles.emitAt(PRESETS.rain, _a.x, _a.y, _a.z, -n.x * 16 + _e1.x * 2, -n.y * 16 + _e1.y * 2, -n.z * 16 + _e1.z * 2);
    }
    if ((this.nextStrike -= dt) <= 0 && env > 0.3) {
      this.nextStrike = 0.5 + this.rng.next() * 1.4 / Math.max(0.6, this.k);
      strike(this, this.randomTileNear(this.ctx.target.tile, this.ang), { power: 0.8 + this.rng.next() * 0.6 * this.k, height: 15 });
    }
    // gusts flood low tiles a little
    if (this.every('flood', 3, dt) && env > 0.5) {
      const dmg = this.god.damage();
      const t = this.randomTileNear(this.ctx.target.tile, this.ang);
      if (dmg && this.planet.isCoastal(t)) dmg.flag([t, ...this.planet.grid.neighbors(t)].filter((x) => !this.planet.isWater(x)), TileFlag.Flooded, true, this.report, 0.5);
    }
    if (this.t >= this.dur) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── tornado

class TornadoEffect extends Effect {
  private tor: Tornado & FxObject;
  private pts: Vector3[] = [];
  private cum: number[] = [];
  private len = 0;
  private s = 0;
  private speed = 3.3 + 0.8 * this.k;
  private lastTile = -1;
  private phase: 'grow' | 'travel' | 'die' = 'grow';
  private str = 0;
  private axX = new Vector3();
  private axZ = new Vector3();
  private wind = this.loop('wind', 0);
  constructor(ctx: PowerCtx) {
    super(ctx);
    const path = ctx.target.path && ctx.target.path.length >= 2 ? ctx.target.path : [ctx.target.tile];
    for (const t of path) this.pts.push(this.pos(t, new Vector3()));
    if (this.pts.length === 1) this.pts.push(this.pts[0].clone());
    this.cum.push(0);
    for (let i = 1; i < this.pts.length; i++) {
      this.len += this.pts[i].distanceTo(this.pts[i - 1]);
      this.cum.push(this.len);
    }
    this.tor = this.own(this.fx.tornado());
    this.tor.height = 22 + 8 * this.k;
    this.place(0);
    this.sfx('wind', 0.9);
  }

  private place(s: number): void {
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const s0 = this.cum[i - 1], s1 = this.cum[i];
    const f = s1 > s0 ? clamp01((s - s0) / (s1 - s0)) : 0;
    _a.lerpVectors(this.pts[i - 1], this.pts[i], f);
    const n = _n.copy(_a).normalize();
    // gentle meander
    tangents(n, _e1, _e2);
    _a.addScaledVector(_e1, Math.sin(this.t * 1.1) * 0.6).addScaledVector(_e2, Math.cos(this.t * 0.8) * 0.4);
    const tile = this.tileAt(_a);
    const ground = this.R + (this.planet.isWater(tile) ? this.planet.waterHeight : this.planet.heightOf(tile));
    this.tor.base.copy(n).multiplyScalar(ground);
    this.tor.up.copy(n);
  }

  step(dt: number): void {
    const k = this.k;
    if (this.phase === 'grow') {
      this.str = Math.min(1, this.str + dt / 1.8);
      if (this.str >= 1) this.phase = 'travel';
      if (this.t > 1.2) this.s += this.speed * dt * this.str;
    } else if (this.phase === 'travel') {
      this.s += this.speed * dt;
      if (this.s >= this.len) this.phase = 'die';
    } else {
      this.str = Math.max(0, this.str - dt / 2.4);
      if (this.str <= 0) this.done = true;
    }
    this.progress = this.len > 0 ? clamp01(this.s / this.len) : clamp01(this.t / 8);
    this.place(Math.min(this.s, this.len));
    this.tor.strength = this.str;
    this.wind.setVolume(0.75 * this.str);
    this.god.want(this.key, { storm: 0.55 * this.str, clouds: 0.6 * this.str, sun: 1 - 0.15 * this.str });
    // frame of the funnel for orbiting flyers
    this.axX.set(1, 0, 0).applyQuaternion(this.tor.group.quaternion);
    this.axZ.set(0, 0, 1).applyQuaternion(this.tor.group.quaternion);
    const base = this.tor.base, up = this.tor.up;
    // ground skirt & thrown rubble
    this.fx.particles.emit(PRESETS.dust, base, up, 1.6 * this.str, 1.4, 1.3);
    if (this.every('skirt', 0.06, dt)) {
      for (let i = 0; i < 2; i++) {
        const a = fxRand() * Math.PI * 2;
        _c.copy(this.axX).multiplyScalar(Math.cos(a)).addScaledVector(this.axZ, Math.sin(a));
        _b.copy(base).addScaledVector(_c, 1.2).addScaledVector(up, 0.3);
        const tan = _a.crossVectors(up, _c);
        this.fx.particles.emitAt(PRESETS.bigDust, _b.x, _b.y, _b.z, tan.x * 6 + up.x * 2 + _c.x * 2, tan.y * 6 + up.y * 2 + _c.y * 2, tan.z * 6 + up.z * 2 + _c.z * 2, 0.55 * this.str, 0.7);
      }
    }
    if (this.every('chunks', 0.18, dt) && this.str > 0.5) {
      const a = fxRand() * Math.PI * 2;
      _c.copy(this.axX).multiplyScalar(Math.cos(a)).addScaledVector(this.axZ, Math.sin(a));
      _b.copy(base).addScaledVector(up, 2 + fxRand() * 6).addScaledVector(_c, this.tor.radiusAt(4));
      const tan = _a.crossVectors(up, _c);
      this.fx.debris.spawn(_b.x, _b.y, _b.z, tan.x * 12 + _c.x * 8 + up.x * 4, tan.y * 12 + _c.y * 8 + up.y * 4, tan.z * 12 + _c.z * 8 + up.z * 4, { size: 0.25 + fxRand() * 0.3, color: 0x6d6258 });
    }
    // damage where it touches down
    const tile = this.tileAt(base);
    if (tile !== this.lastTile && this.str > 0.45) {
      this.lastTile = tile;
      const dmg = this.god.damage();
      if (dmg) {
        const ring = this.planet.grid.neighbors(tile);
        const launch = (b: BuildingInstance, m: Matrix4) => this.grab(b, m);
        const lost = dmg.wreck([tile], { chance: 0.9 * k, heightBias: 0.2, launch, roads: 0.35, trees: true, report: this.report, rand: () => this.rng.next() }).length;
        const lost2 = dmg.wreck(ring, { chance: 0.42 * k, launch, roads: 0.12, trees: true, report: this.report, rand: () => this.rng.next() }).length;
        if (lost + lost2 > 0) {
          this.god.shake(0.22, 0.5);
          this.sfx('crumble', 0.8);
        }
        const tree = ring.find((t) => this.planet.feature[t] === Feature.Rubble);
        if (tree !== undefined) this.fx.particles.emit(PRESETS.leaf, base, up, 10, 2);
      }
    }
  }

  /** A building caught by the funnel: orbit up the vortex, then fling it out. */
  private grab(b: BuildingInstance, m: Matrix4): void {
    const f = this.fx.flyers.launch(b, m, (fl, dt) => this.orbit(fl, dt), b.tiles.length > 1 ? InstState.Dark : InstState.Normal);
    if (!f) return;
    f.data[0] = fxRand() * Math.PI * 2; // angle
    f.data[1] = 0.5; // height
    f.data[2] = 1.6 + fxRand() * 2.2; // release time
    f.data[3] = 0; // released?
    f.spin.set(fxRand() - 0.5, fxRand() - 0.5, fxRand() - 0.5).normalize().multiplyScalar(2 + fxRand() * 3);
    const h = buildingHeight(b);
    if (h > 4) f.scale.multiplyScalar(0.75);
  }

  private toss = tossBehaviour(this.fx);
  private orbit(f: Flyer, dt: number): boolean {
    if (f.data[3] === 1 || this.done || this.str < 0.2) {
      if (f.data[3] !== 1) {
        f.data[3] = 1;
        launchToss(f, this.tor.up, 6, _c.copy(f.pos).sub(this.tor.base).normalize(), fxRand);
      }
      return this.toss(f, dt);
    }
    f.data[0] += dt * (3.2 - f.data[1] * 0.04);
    f.data[1] += dt * 4.5;
    const h = f.data[1];
    const r = this.tor.radiusAt(h) + 1.4;
    this.tor.axisOffset(h, _b);
    const x = Math.cos(f.data[0]) * r + _b.x, z = Math.sin(f.data[0]) * r + _b.z;
    f.pos.copy(this.tor.base).addScaledVector(this.axX, x).addScaledVector(this.tor.up, h).addScaledVector(this.axZ, z);
    _q.setFromAxisAngle(_a.copy(f.spin).normalize(), f.spin.length() * dt);
    f.quat.premultiply(_q);
    if (f.age > f.data[2]) {
      f.data[3] = 1;
      const tan = _a.crossVectors(this.tor.up, _c.copy(f.pos).sub(this.tor.base).normalize());
      f.vel.copy(tan).multiplyScalar(13).addScaledVector(_c, 7).addScaledVector(this.tor.up, 5);
    }
    return f.age < 14;
  }
}

// ───────────────────────────────────────────────────────────── hypercane

class HypercaneEffect extends Effect {
  private dur = 34 + 8 * this.k;
  private spiral: Shell & FxObject;
  private start = new Vector3();
  private endP = new Vector3();
  private eye = new Vector3();
  private radius = 0.42 + 0.12 * this.k;
  private nextStrike = 1;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const target = this.nrm(ctx.target.tile, new Vector3());
    // spin up over the ocean upwind of the target and make landfall on it
    tangents(target, _e1, _e2);
    const ocean = offshore(this.planet, ctx.target.tile, 3, 30);
    if (ocean >= 0) this.start.copy(this.nrm(ocean, new Vector3())).addScaledVector(this.start.clone().sub(target), 1.4).normalize();
    else this.start.copy(target).addScaledVector(_e1, 0.55).normalize();
    if (this.start.angleTo(target) < 0.35) this.start.copy(target).addScaledVector(_e1, 0.5).normalize();
    this.endP.copy(target).multiplyScalar(2).sub(this.start).normalize();
    this.spiral = this.own(this.fx.shell(ShellMode.Spiral, 56, 220));
    this.spiral.colors(0xf4f6fa, 0x7c8494).range(0, this.radius);
    this.spiral.u.uR.value = this.R + 9;
    this.spiral.u.uSpin.value = 1.4;
    this.loop('storm', 0.8);
    this.loop('wind', 0.6);
    this.god.frame(ctx.target.tile, this.R * 1.55, 0.25, 2.6);
    this.god.banner('HYPERCANE', 'Category ∞ — winds beyond measure', ctx.def.icon, 0x7cc4ff);
    this.sfx('wind', 1);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.12, 0.18);
    // track: slerp start → end (passing over the target at the middle)
    const travel = smooth(0.08, 0.95, u);
    this.eye.copy(this.start).lerp(this.endP, travel).normalize();
    this.spiral.setCenter(this.eye);
    this.spiral.u.uIntensity.value = env;
    this.god.want(this.key, { storm: env, clouds: 0.85 * env, sun: 1 - 0.3 * env });
    const eyeTile = this.tileAt(this.eye);
    // rain bands under the storm
    const drops = Math.round(this.fx.q(12) * env);
    for (let i = 0; i < drops; i++) {
      const t = this.randomTileNear(eyeTile, this.radius * 0.8);
      const n = this.nrm(t, _n);
      this.at(n, 10 + fxRand() * 3, _a);
      tangents(n, _e1, _e2);
      this.fx.particles.emitAt(PRESETS.rain, _a.x, _a.y, _a.z, -n.x * 15 + _e1.x * 6, -n.y * 15 + _e1.y * 6, -n.z * 15 + _e1.z * 6);
    }
    if ((this.nextStrike -= dt) <= 0 && env > 0.4) {
      this.nextStrike = 0.4 + this.rng.next() * 0.8;
      strike(this, this.randomTileNear(eyeTile, this.radius * 0.7), { power: 1.2, height: 10, fire: 0.3, wreck: 0.1 });
    }
    // wind damage under the eyewall
    if (this.every('wind', 0.5, dt) && env > 0.35) {
      const dmg = this.god.damage();
      if (dmg) {
        const tiles: number[] = [];
        for (let i = 0; i < 26; i++) tiles.push(this.randomTileNear(eyeTile, this.radius * 0.45));
        const lost = dmg.wreck(tiles, { chance: 0.16 * this.k * env, heightBias: 0.25, roads: 0.05, trees: true, report: this.report, rand: () => this.rng.next() }).length;
        if (lost) this.god.shake(0.15, 0.4);
        // storm surge on the coast
        const coast = tiles.filter((t) => this.planet.isCoastal(t) || (!this.planet.isWater(t) && this.planet.elevation[t] <= this.planet.seaOffset + 1));
        if (coast.length) dmg.flag(coast.flatMap((t) => [t, ...this.planet.grid.neighbors(t)]).filter((t) => !this.planet.isWater(t) && this.planet.elevation[t] <= this.planet.seaOffset + 2), TileFlag.Flooded, true, this.report, 0.8);
      }
    }
    if (this.t >= this.dur) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── blizzard / flash freeze

class BlizzardEffect extends Effect {
  private dur = 22 + 6 * this.k;
  private ang = tilesToAngle(this.planet, 6 + 3 * this.k);
  private order = sortedByAngle(this.planet, this.ctx.target.tile, this.ang);
  private idx = 0;
  private veil: Shell & FxObject;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.veil = this.own(this.fx.shell(ShellMode.Veil, 24, 96));
    this.veil.setCenter(this.nrm(ctx.target.tile, new Vector3())).range(0, this.ang * 1.4).colors(0xe8eef6, 0x9aa6b8);
    this.veil.u.uR.value = this.R + 12;
    this.veil.u.uAngle.value = this.ang * 1.4;
    this.loop('wind', 0.75);
    this.sfx('freeze', 0.7);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.1, 0.25);
    this.veil.u.uIntensity.value = env * 0.85;
    this.god.want(this.key, { clouds: 0.7 * env, sun: 1 - 0.25 * env });
    const flakes = Math.round(this.fx.q(14) * env);
    for (let i = 0; i < flakes; i++) {
      const t = this.randomTileNear(this.ctx.target.tile, this.ang);
      const n = this.nrm(t, _n);
      this.at(n, 6 + fxRand() * 8, _a);
      tangents(n, _e1, _e2);
      this.fx.particles.emitAt(PRESETS.snow, _a.x, _a.y, _a.z, -n.x * 2 + _e1.x * 4, -n.y * 2 + _e1.y * 4, -n.z * 2 + _e1.z * 4);
    }
    // frost creeps outward
    const reach = this.ang * smooth(0.05, 0.75, u);
    const batch: number[] = [];
    while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= reach) batch.push(this.order.tiles[this.idx++]);
    if (batch.length) {
      const dmg = this.god.damage();
      dmg?.flag(batch.filter((t) => !this.planet.isWater(t)), TileFlag.Frozen, true, this.report, 0.9, () => this.rng.next());
      // the odd roof caves in under the snow
      if (this.k > 1.3) dmg?.wreck(batch, { chance: 0.04 * this.k, maxHeight: 2.5, report: this.report, rand: () => this.rng.next() });
    }
    if (this.t >= this.dur) this.done = true;
  }
}

class FlashFreezeEffect extends Effect {
  private ang = tilesToAngle(this.planet, 5 + 4 * this.k);
  private order = sortedByAngle(this.planet, this.ctx.target.tile, this.ang);
  private idx = 0;
  private front: Shell & FxObject;
  private ring: Shell & FxObject;
  private center = this.nrm(this.ctx.target.tile, new Vector3());
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.front = this.own(this.fx.shell(ShellMode.Front, 40, 160));
    this.front.setCenter(this.center).colors(0xf2fbff, 0xbfe6ff);
    this.front.u.uR.value = this.R + this.planet.heightOf(ctx.target.tile) + 0.35;
    this.front.u.uWidth.value = 0.012;
    this.ring = this.own(this.fx.shell(ShellMode.Ring, 24, 160));
    this.ring.setCenter(this.center).colors(0xe8fbff, 0x6cc8ff);
    this.ring.u.uR.value = this.R + this.planet.heightOf(ctx.target.tile) + 0.6;
    this.ring.u.uWidth.value = 0.01;
    this.sfx('freeze', 1);
    this.god.flash(0xd8f2ff, 2.2, 0.6, 0.35);
    this.god.shake(0.2, 0.4);
  }
  step(dt: number): void {
    const u = clamp01(this.t / 2.4);
    this.progress = u;
    const a = this.ang * (1 - Math.pow(1 - u, 2.2));
    this.front.range(0, Math.max(0.002, a + 0.03));
    this.front.u.uAngle.value = a;
    this.front.u.uIntensity.value = 1 - smooth(3, 6, this.t) * 1;
    this.ring.range(Math.max(0, a - 0.04), a + 0.02);
    this.ring.u.uAngle.value = a;
    this.ring.u.uIntensity.value = (1 - u) * 1.4;
    const batch: number[] = [];
    while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= a) batch.push(this.order.tiles[this.idx++]);
    if (batch.length) {
      const dmg = this.god.damage();
      dmg?.flag(batch.filter((t) => !this.planet.isWater(t)), TileFlag.Frozen, true, this.report);
      for (let i = 0; i < Math.min(6, batch.length); i++) {
        const t = batch[Math.floor(fxRand() * batch.length)];
        this.fx.particles.emit(PRESETS.frost, this.pos(t, _a, 0.3), this.nrm(t, _n), 2);
      }
    }
    if (this.every('mist', 0.1, dt) && this.t < 3) this.fx.particles.emit(PRESETS.steam, this.pos(this.order.tiles[Math.floor(fxRand() * Math.max(1, this.idx))] ?? this.ctx.target.tile, _a), this.center, 2, 0.6, 1.2);
    if (this.t > 6) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── heatwave / drought

const DRY: Partial<Record<number, Biome>> = {
  [Biome.Grass]: Biome.Savanna,
  [Biome.Meadow]: Biome.Savanna,
  [Biome.Forest]: Biome.Savanna,
  [Biome.Jungle]: Biome.Savanna,
  [Biome.Savanna]: Biome.Desert,
  [Biome.Swamp]: Biome.Grass,
  [Biome.Tundra]: Biome.Rock,
  [Biome.Snow]: Biome.Tundra,
  [Biome.Ice]: Biome.Tundra,
};

class HeatwaveEffect extends Effect {
  private dur = 24 + 6 * this.k;
  private ang = tilesToAngle(this.planet, 8 + 4 * this.k);
  private glow: Shell & FxObject;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.glow = this.own(this.fx.shell(ShellMode.Glow, 24, 120));
    this.glow.setCenter(this.nrm(ctx.target.tile, new Vector3())).range(0, this.ang).colors(0xff7a2a, 0xffb347);
    this.glow.u.uR.value = this.R + 1.2;
    this.glow.u.uAngle.value = this.ang;
    this.sfx('fire', 0.4);
    this.loop('wind', 0.25);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.15, 0.25);
    this.glow.u.uIntensity.value = env * 0.12;
    this.god.want(this.key, { sun: 1 + 0.4 * env, apocalypse: 0.12 * env, clouds: 0 });
    if (this.every('shimmer', 0.05, dt)) {
      const t = this.randomTileNear(this.ctx.target.tile, this.ang);
      this.fx.particles.emit(PRESETS.steam, this.pos(t, _a, 0.4), this.nrm(t, _n), 0.6, 0.6, 0.6, 0.6);
    }
    if (this.every('dry', 0.4, dt) && env > 0.3) {
      const dmg = this.god.damage();
      if (dmg) {
        const tiles: number[] = [];
        for (let i = 0; i < 10; i++) tiles.push(this.randomTileNear(this.ctx.target.tile, this.ang));
        const land = tiles.filter((t) => !this.planet.isWater(t));
        dmg.flag(land, TileFlag.Scorched, true, this.report, 0.6, () => this.rng.next());
        // drought turns the land brown (permanent)
        for (const t of land) {
          const to = DRY[this.planet.biome[t]];
          if (to !== undefined && this.rng.next() < 0.35 * this.k) this.ops.setBiome([t], to);
        }
        // crops wither, forests catch fire
        const fuel = land.filter((t) => this.planet.feature[t] === Feature.Trees || this.planet.feature[t] === Feature.DenseTrees || this.planet.feature[t] === Feature.Flowers);
        if (fuel.length && this.rng.next() < 0.35 * this.k) dmg.ignite([fuel[0]], 1, this.report);
      }
    }
    if (this.t >= this.dur) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── acid rain

class AcidRainEffect extends Effect {
  private dur = 20 + 6 * this.k;
  private ang = tilesToAngle(this.planet, 6 + 3 * this.k);
  private deck: Shell & FxObject;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.deck = this.own(this.fx.shell(ShellMode.Veil, 24, 96));
    this.deck.setCenter(this.nrm(ctx.target.tile, new Vector3())).range(0, this.ang * 1.4).colors(0xc8d46a, 0x5c6a2a);
    this.deck.u.uR.value = this.R + 14;
    this.deck.u.uAngle.value = this.ang * 1.4;
    this.loop('rain', 0.7);
    this.sfx('alien', 0.3, 0.6);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.12, 0.2);
    this.deck.u.uIntensity.value = env;
    this.god.want(this.key, { storm: 0.6 * env, clouds: 0.7 * env, sun: 1 - 0.3 * env });
    const drops = Math.round(this.fx.q(11) * env);
    for (let i = 0; i < drops; i++) {
      const t = this.randomTileNear(this.ctx.target.tile, this.ang);
      const n = this.nrm(t, _n);
      this.at(n, 13 + fxRand() * 3, _a);
      this.fx.particles.emitAt(PRESETS.acidRain, _a.x, _a.y, _a.z, -n.x * 15, -n.y * 15, -n.z * 15);
    }
    if (this.every('hiss', 0.08, dt)) {
      const t = this.randomTileNear(this.ctx.target.tile, this.ang);
      this.fx.particles.emit(PRESETS.miasma, this.pos(t, _a, 0.2), this.nrm(t, _n), 0.5, 0.4, 0.5);
    }
    if (this.every('corrode', 0.5, dt) && env > 0.4) {
      const dmg = this.god.damage();
      if (dmg) {
        const tiles: number[] = [];
        for (let i = 0; i < 12; i++) tiles.push(this.randomTileNear(this.ctx.target.tile, this.ang));
        dmg.flag(tiles.filter((t) => !this.planet.isWater(t)), TileFlag.Scorched, true, this.report, 0.7);
        // vegetation dies, statues dissolve
        const veg = tiles.filter((t) => this.planet.feature[t] === Feature.Trees || this.planet.feature[t] === Feature.Flowers || this.planet.feature[t] === Feature.DenseTrees);
        if (veg.length) this.ops.setFeature(veg, Feature.None);
        for (const pr of this.ops.propsOn(tiles)) if (this.rng.next() < 0.5) this.ops.removeProp(pr.id);
        // residents of corroding homes move out
        for (const b of dmg.buildingsOn(tiles)) if (b.state === BuildingState.Active && this.rng.next() < 0.18 * this.k) this.ops.updateBuilding(b.id, { state: BuildingState.Abandoned });
        if (this.k > 1.4) dmg.wreck(tiles, { chance: 0.05, maxHeight: 2.5, report: this.report });
      }
    }
    if (this.t >= this.dur) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── sandstorm

class SandstormEffect extends Effect {
  private dur = 18 + 6 * this.k;
  private ang = tilesToAngle(this.planet, 9 + 4 * this.k);
  private front: Shell & FxObject;
  private center = this.nrm(this.ctx.target.tile, new Vector3());
  private origin = new Vector3();
  private order: { tiles: Int32Array; angles: Float32Array };
  private idx = 0;
  constructor(ctx: PowerCtx) {
    super(ctx);
    // the dust wall rolls in from one side: centre the front on a point upwind and sweep across
    tangents(this.center, _e1, _e2);
    this.origin.copy(this.center).addScaledVector(_e1, -this.ang * 1.1).normalize();
    const originTile = this.tileAt(this.origin);
    this.order = sortedByAngle(this.planet, originTile, this.ang * 2.4);
    this.front = this.own(this.fx.shell(ShellMode.Front, 40, 200));
    this.front.setCenter(this.origin).colors(0xd8b480, 0x9a7a52);
    this.front.u.uR.value = this.R + 1.5;
    this.front.u.uWidth.value = 0.03;
    this.loop('wind', 0.8);
    this.sfx('wind', 0.9);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const a = this.ang * 2.3 * smooth(0, 0.85, u);
    const env = envelope(u, 0.08, 0.15);
    this.front.range(Math.max(0, a - 0.25), a + 0.06);
    this.front.u.uAngle.value = a;
    this.front.u.uIntensity.value = env * 0.9;
    this.god.want(this.key, { sun: 1 - 0.35 * env, apocalypse: 0.08 * env });
    // billowing wall of dust along the front
    if (this.every('wall', 0.04, dt)) {
      for (let i = 0; i < 3; i++) {
        const az = fxRand() * Math.PI * 2;
        tangents(this.origin, _e1, _e2);
        _a.copy(this.origin).multiplyScalar(Math.cos(a)).addScaledVector(_e1, Math.sin(a) * Math.cos(az)).addScaledVector(_e2, Math.sin(a) * Math.sin(az)).normalize();
        if (_a.angleTo(this.center) > this.ang * 1.3) continue;
        const t = this.tileAt(_a);
        this.fx.particles.emit(PRESETS.bigDust, this.pos(t, _b, 0.5), _a, 1, 1.4, 1.6, 1.4);
      }
    }
    const batch: number[] = [];
    while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= a) {
      const t = this.order.tiles[this.idx++];
      if (this.nrm(t, _c).angleTo(this.center) < this.ang * 1.2) batch.push(t);
    }
    if (batch.length) {
      const dmg = this.god.damage();
      const land = batch.filter((t) => !this.planet.isWater(t));
      if (dmg && land.length) {
        for (const pr of this.ops.propsOn(land)) if (this.rng.next() < 0.4) this.ops.removeProp(pr.id);
        const green = land.filter((t) => (this.planet.biome[t] === Biome.Grass || this.planet.biome[t] === Biome.Savanna || this.planet.biome[t] === Biome.Meadow) && this.rng.next() < 0.3 * this.k);
        if (green.length) this.ops.setBiome(green, Biome.Desert);
        const buried = land.filter((t) => this.planet.road[t] !== 0 && this.rng.next() < 0.06 * this.k);
        if (buried.length) this.ops.removeRoad(buried);
        dmg.wreck(land, { chance: 0.03 * this.k, maxHeight: 2.2, report: this.report, rand: () => this.rng.next() });
      }
    }
    if (this.t >= this.dur) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── wildfire

class WildfireEffect extends Effect {
  private dur = 16 + 6 * this.k;
  private ang = tilesToAngle(this.planet, 5 + 3 * this.k);
  private burning = new Set<number>();
  constructor(ctx: PowerCtx) {
    super(ctx);
    const dmg = this.god.damage();
    const seeds = this.planet.grid.disk(ctx.target.tile, 1).filter((t) => !this.planet.isWater(t));
    dmg?.ignite(seeds, 1, this.report);
    for (const t of seeds) this.burning.add(t);
    this.loop('fire', 0.7);
    this.sfx('fire', 0.9);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    this.god.want(this.key, { apocalypse: 0.1 * envelope(u, 0.1, 0.3) });
    // flames & smoke over burning tiles
    if (this.every('flames', 0.05, dt) && this.burning.size) {
      const arr = [...this.burning];
      for (let i = 0; i < 3; i++) {
        const t = arr[Math.floor(fxRand() * arr.length)];
        if (!(this.planet.flags[t] & TileFlag.Burning)) {
          this.burning.delete(t);
          continue;
        }
        const n = this.nrm(t, _n);
        this.fx.particles.emit(PRESETS.fire, this.pos(t, _a, 0.2), n, 2);
        if (fxRand() < 0.4) this.fx.particles.emit(PRESETS.darkSmoke, this.pos(t, _a, 1), n, 1, 0.8, 0.8);
        if (fxRand() < 0.3) this.fx.particles.emit(PRESETS.ember, this.pos(t, _a, 0.5), n, 3);
      }
    }
    // the front advances through fuel (faster than the sim's daily spread)
    if (this.every('spread', 0.45, dt) && u < 0.85) {
      const dmg = this.god.damage();
      const next: number[] = [];
      const center = this.nrm(this.ctx.target.tile, _c);
      for (const t of this.burning) {
        for (const n of this.planet.grid.neighbors(t)) {
          if (this.burning.has(n) || this.planet.isWater(n)) continue;
          if (this.nrm(n, _a).angleTo(center) > this.ang) continue;
          const f = this.planet.feature[n];
          const fuel = f === Feature.DenseTrees ? 0.6 : f === Feature.Trees || f === Feature.AlienFlora ? 0.45 : f === Feature.Flowers ? 0.3 : this.planet.building[n] >= 0 ? 0.12 : this.planet.biome[n] === Biome.Grass || this.planet.biome[n] === Biome.Savanna || this.planet.biome[n] === Biome.Meadow ? 0.12 : 0;
          if (fuel && this.rng.next() < fuel * this.k) next.push(n);
        }
      }
      if (next.length && dmg) {
        dmg.ignite(next, 1, this.report, () => this.rng.next());
        for (const t of next) this.burning.add(t);
        // scorched earth where the fire passed
        const old = [...this.burning].filter(() => this.rng.next() < 0.15);
        dmg.flag(old, TileFlag.Scorched, true);
        const trees = old.filter((t) => this.planet.feature[t] === Feature.Trees || this.planet.feature[t] === Feature.DenseTrees);
        if (trees.length) this.ops.setFeature(trees, Feature.None);
      }
    }
    if (this.t >= this.dur) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── rainbow blessing

class RainbowEffect extends Effect {
  private arc: Rainbow & FxObject;
  private dur = 14;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const c = this.pos(ctx.target.tile, new Vector3());
    const n = this.nrm(ctx.target.tile, new Vector3());
    const cam = ctx.view.camera.position.clone().sub(c);
    const facing = cam.addScaledVector(n, -cam.dot(n)).normalize();
    if (facing.lengthSq() < 0.5) tangents(n, facing, _b);
    this.arc = this.own(new Rainbow(this.fx.planetGroup, c, n, 7 + 3 * this.k, facing) as Rainbow & FxObject);
    const dmg = this.god.damage();
    const tiles = this.planet.grid.disk(ctx.target.tile, Math.round(3 + 2 * this.k));
    dmg?.flag(tiles, TileFlag.Blessed, true);
    // a rainbow washes away lingering misery
    this.ops.setFlags(tiles, TileFlag.Scorched | TileFlag.Irradiated, false);
    this.sfx('chime', 0.9);
    this.sfx('magic', 0.6);
    this.god.news('Hypernet', '@hypernet', '🌈', 'Double rainbow over the city!! What does it MEAN?! (Property values. It means property values.)', ctx.target.tile);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    this.arc.intensity = envelope(u, 0.15, 0.35);
    if (this.every('sparkle', 0.08, dt)) {
      const t = this.randomTileNear(this.ctx.target.tile, tilesToAngle(this.planet, 4));
      this.fx.particles.emit(PRESETS.magic, this.pos(t, _a, 0.5), this.nrm(t, _n), 2);
    }
    if (this.t >= this.dur) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── definitions

export const WEATHER: PowerSpec[] = [
  {
    id: 'lightning', name: 'Lightning Strike', icon: 'lightning', category: 'weather', targeting: 'tile', tier: 0, danger: 1, cooldown: 4, natural: true,
    description: 'Hurl a forked bolt at anything that annoys you. Sets roofs and forests alight.',
    flavor: 'Zeus called. He wants his hobby back.',
    run: (c) => new LightningEffect(c),
  },
  {
    id: 'thunderstorm', name: 'Supercell', icon: 'cloud', category: 'weather', targeting: 'tile', tier: 1, danger: 2, cooldown: 30, natural: true,
    description: 'A towering storm cell parks over the city: sheets of rain, flash floods and a lightning barrage.',
    flavor: 'Bring an umbrella. Bring a lightning rod. Bring a better umbrella.',
    run: (c) => new StormEffect(c),
  },
  {
    id: 'tornado', name: 'Tornado', icon: 'tornado', category: 'weather', targeting: 'drag', tier: 2, danger: 3, cooldown: 45, natural: true,
    description: 'Draw its path. A roaring funnel rips buildings from their foundations and hurls them across town.',
    flavor: 'Not in Kansas. Not anywhere, after this.',
    tip: 'Drag across the city to draw the path',
    run: (c) => new TornadoEffect(c),
  },
  {
    id: 'hypercane', name: 'Hypercane', icon: 'tornado', category: 'weather', targeting: 'tile', tier: 5, danger: 4, cooldown: 180, natural: true, color: 0x9fd4ff,
    description: 'A cyclone the size of a continent spins up offshore and makes landfall on your target. Eyewall winds, storm surge, endless lightning.',
    flavor: 'Meteorologists have run out of categories and started using adjectives.',
    run: (c) => new HypercaneEffect(c),
  },
  {
    id: 'blizzard', name: 'Blizzard', icon: 'snowflake', category: 'weather', targeting: 'tile', tier: 1, danger: 2, cooldown: 40, natural: true,
    description: 'A whiteout buries the district in snow. Frost creeps across streets and roofs; the cold lingers for days.',
    flavor: 'Schools are closed. Children rejoice. Plumbers rejoice harder.',
    run: (c) => new BlizzardEffect(c),
  },
  {
    id: 'flash_freeze', name: 'Flash Freeze', icon: 'snowflake', category: 'weather', targeting: 'tile', tier: 3, danger: 2, cooldown: 40, natural: true, color: 0xbfe6ff,
    description: 'A shockwave of absolute cold races outward and freezes everything solid in a heartbeat.',
    flavor: 'The pigeons are fine. They are, technically, sculptures now.',
    run: (c) => new FlashFreezeEffect(c),
  },
  {
    id: 'heatwave', name: 'Heat Dome', icon: 'sun', category: 'weather', targeting: 'tile', tier: 1, danger: 2, cooldown: 40, natural: true, color: 0xffa04a,
    description: 'The sun leans in. Drought browns the land for good, forests ignite, and the asphalt goes soft.',
    flavor: 'You can fry an egg on the sidewalk. Please stop frying eggs on the sidewalk.',
    run: (c) => new HeatwaveEffect(c),
  },
  {
    id: 'acid_rain', name: 'Acid Rain', icon: 'rain', category: 'weather', targeting: 'tile', tier: 2, danger: 2, cooldown: 40, natural: true, color: 0xb6e04a,
    description: 'Sickly green clouds weep corrosive rain: trees die, statues melt, residents flee corroding homes.',
    flavor: 'pH 1.5. Do not taste the weather.',
    run: (c) => new AcidRainEffect(c),
  },
  {
    id: 'sandstorm', name: 'Haboob', icon: 'wind', category: 'weather', targeting: 'tile', tier: 1, danger: 2, cooldown: 40, natural: true, color: 0xd8b480,
    description: 'A kilometre-high wall of dust rolls across the city, burying roads and turning fields to desert.',
    flavor: 'Sand gets everywhere. EVERYWHERE.',
    run: (c) => new SandstormEffect(c),
  },
  {
    id: 'wildfire', name: 'Wildfire', icon: 'fire', category: 'weather', targeting: 'tile', tier: 1, danger: 2, cooldown: 35, natural: true, color: 0xff7a2a,
    description: 'Spark a blaze that races through forests and grassland toward anything flammable. Fire stations matter now.',
    flavor: 'Only you can prevent forest fires. You chose not to.',
    run: (c) => new WildfireEffect(c),
  },
  {
    id: 'rainbow', name: 'Rainbow Blessing', icon: 'sparkles', category: 'weather', targeting: 'tile', tier: 0, danger: 0, cooldown: 30, color: 0xff9ad8,
    description: 'A radiant double rainbow blesses the district: lingering damage fades, happiness and resilience rise.',
    flavor: 'Scientifically, it is just refraction. Emotionally, it is a lot more.',
    run: (c) => new RainbowEffect(c),
  },
];
