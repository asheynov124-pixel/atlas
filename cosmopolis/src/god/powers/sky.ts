/**
 * OWNER: god.
 * Sky powers: meteor (with orbital-defence interception), meteor shower, extinction asteroid (firestorm + dust
 * winter), rods from god (kinetic bombardment along a path), comet flyby (tourism!), solar flare (auroras,
 * blackout, sparks).
 */
import { Vector3 } from 'three';
import { Biome, BuildingState, Feature, TileFlag } from '../../core/types';
import { InstState } from '../../render/materials';
import type { FxObject } from '../../render/fx/FxLayer';
import { PRESETS, fxRand } from '../../render/fx/particles';
import { ShellMode, type Shell } from '../../render/fx/shells';
import { Comet, Fireball } from '../../render/fx/sky';
import { Effect, type PowerCtx, type PowerSpec } from '../effect';
import { buildingHeight } from '../damage';
import { clamp01, easeIn, envelope, skyPoint, smooth, sortedByAngle, tangents, tilesToAngle } from './common';

const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();

/** Impact consequences + FX shared by meteors. Returns destroyed count. */
export function impact(e: Effect, tile: number, size: number, o: { crater?: boolean; unstoppable?: boolean } = {}): number {
  const fx = e.fx;
  const P = e.pos(tile, new Vector3());
  const n = e.nrm(tile, new Vector3());
  const water = e.planet.isWater(tile);
  fx.blast(P, n, 1.6 * size, { debris: Math.round(10 + 14 * size) });
  if (water) {
    fx.particles.emit(PRESETS.splash, P, n, 40 * size, 2.2 * Math.sqrt(size), 1.6 * Math.sqrt(size));
    fx.particles.emit(PRESETS.steam, P, n, 14 * size, 1.5, 1.8 * Math.sqrt(size));
  }
  // dust ring racing outward
  tangents(n, _e1, _e2);
  const ringN = Math.round(fx.q(22) * Math.min(2, size));
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2;
    _a.copy(_e1).multiplyScalar(Math.cos(a)).addScaledVector(_e2, Math.sin(a));
    _b.copy(P).addScaledVector(_a, 1.2 * size).addScaledVector(n, 0.4);
    fx.particles.emitAt(water ? PRESETS.splash : PRESETS.bigDust, _b.x, _b.y, _b.z, _a.x * 14 * Math.sqrt(size) + n.x * 2, _a.y * 14 * Math.sqrt(size) + n.y * 2, _a.z * 14 * Math.sqrt(size) + n.z * 2, Math.sqrt(size), 1);
  }
  e.god.flash(0xffe2b0, 3 + 2 * size, 0.9, Math.min(0.75, 0.25 + 0.2 * size));
  e.god.shake(Math.min(2.5, 0.6 + 0.6 * size), 1 + 0.4 * size);
  e.sfx(size > 1.4 ? 'bigExplosion' : 'explosion', 1);
  e.sfx('rumble', 0.7);
  const dmg = e.god.damage();
  if (!dmg) return 0;
  const g = e.planet.grid;
  const r = Math.max(0, Math.round(size * 0.9));
  let lost = 0;
  if (o.crater !== false) dmg.crater(tile, r, 1 + Math.round(size * 1.3), water ? Biome.Ocean : Biome.Crater);
  const core = g.disk(tile, r);
  lost += dmg.wreck(core, { chance: 1, fx: 'blast', roads: 1, trees: true, report: e.report, unstoppable: o.unstoppable, rand: () => e.rng.next() }).length;
  const ring = g.ring(tile, r + 1).concat(r + 2 <= 6 ? g.ring(tile, r + 2) : []);
  lost += dmg.wreck(ring, { chance: 0.55 * Math.min(1.5, size), heightBias: 0.3, fx: 'collapse', roads: 0.4, trees: true, report: e.report, unstoppable: o.unstoppable, rand: () => e.rng.next() }).length;
  const outer = g.ring(tile, r + 3).concat(g.ring(tile, r + 2));
  dmg.ignite(outer.filter((t) => !e.planet.isWater(t)), 0.45, e.report, () => e.rng.next());
  dmg.flag(core.concat(ring).filter((t) => !e.planet.isWater(t)), TileFlag.Scorched, true);
  return lost;
}

// ───────────────────────────────────────────────────────────── meteor

class MeteorEffect extends Effect {
  private ball: Fireball & FxObject;
  private start = new Vector3();
  private endP = new Vector3();
  private dir = new Vector3();
  private n: Vector3;
  private fall: number;
  private size = 0.8 + 0.7 * this.k;
  private phase: 'fall' | 'smoke' = 'fall';
  private interceptAt = -1;
  private hitT = 0;
  private laser: ReturnType<Effect['beam']> | null = null;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.n = this.nrm(ctx.target.tile, new Vector3());
    this.pos(ctx.target.tile, this.endP);
    tangents(this.n, _e1, _e2);
    const az = this.rng.next() * Math.PI * 2;
    _a.copy(_e1).multiplyScalar(Math.cos(az)).addScaledVector(_e2, Math.sin(az));
    this.dir.copy(this.n).multiplyScalar(-0.72).addScaledVector(_a, 0.7).normalize();
    this.start.copy(this.endP).addScaledVector(this.dir, -120);
    this.fall = 2.4 + 0.3 * this.k;
    this.ball = this.own(new Fireball(this.fx.planetGroup, 0.5 + 0.35 * this.size, 22 + 6 * this.size) as Fireball & FxObject);
    this.ball.dir.copy(this.dir);
    this.ball.position.copy(this.start);
    const def = this.god.defenses();
    if (def > 0 && this.rng.next() < Math.min(0.85, 0.35 * def)) this.interceptAt = 0.5 + this.rng.next() * 0.15;
    this.sfx('whoosh', 0.9, 0.7);
    this.sfx('alarm', 0.3);
  }
  step(dt: number): void {
    if (this.phase === 'fall') {
      const u = this.t / this.fall;
      this.progress = clamp01(u);
      const f = Math.pow(clamp01(u), 1.25);
      this.ball.position.lerpVectors(this.start, this.endP, f);
      this.ball.heat = smooth(0.05, 0.4, u);
      const p = this.ball.position;
      const back = _b.copy(this.dir).multiplyScalar(-3);
      const nn = _n.copy(p).normalize();
      this.fx.particles.emitAt(PRESETS.bigFire, p.x, p.y, p.z, back.x, back.y, back.z, 0.5 + 0.3 * this.size, 0.6);
      if (fxRand() < 0.7) this.fx.particles.emitAt(PRESETS.darkSmoke, p.x, p.y, p.z, back.x * 0.3 + nn.x, back.y * 0.3 + nn.y, back.z * 0.3 + nn.z, 0.5 + 0.2 * this.size, 1.2);
      if (fxRand() < 0.5) this.fx.particles.emit(PRESETS.ember, p, nn, 2, 1.5);
      if (this.interceptAt > 0 && u >= this.interceptAt) {
        this.intercept();
        return;
      }
      if (u >= 1) {
        this.drop(this.ball);
        impact(this, this.ctx.target.tile, this.size);
        this.phase = 'smoke';
        this.hitT = this.t;
        if (this.size > 1.6) this.god.news('Observatory', '@skywatch', '☄️', 'Update: the meteor we said would "probably miss" did not miss. We regret the word "probably".', this.ctx.target.tile);
      }
    } else {
      const s = this.t - this.hitT;
      if (this.laser && this.t > this.hitT - 3.5) {
        this.releaseBeam(this.laser);
        this.laser = null;
      }
      if (this.every('col', 0.07, dt) && s < 6 && !this.laser) this.fx.particles.emit(PRESETS.darkSmoke, this.endP, this.n, 1, 1.2, 1.2 + 0.4 * this.size);
      if (s > 7) this.done = true;
    }
  }
  /** Orbital defence shoots it down high in the sky. */
  private intercept(): void {
    const p = this.ball.position.clone();
    const nn = p.clone().normalize();
    tangents(nn, _e1, _e2);
    const sat = nn.clone().multiplyScalar(this.R * 1.6).addScaledVector(_e1, this.R * 0.35);
    const beam = this.beam().set(sat, p, 0.35, 0x7af0ff, 2.5);
    beam.u.uCore.value.setHex(0xffffff);
    this.laser = beam;
    this.drop(this.ball);
    this.fx.blast(p, nn, 2.4, { debris: 18, smoke: true });
    this.fx.particles.emit(PRESETS.spark, p, nn, 60, 2.2, 1.4);
    this.god.flash(0xbff6ff, 2.5, 0.6, 0.3);
    this.sfx('laser', 1);
    this.sfx('explosion', 0.8);
    this.god.banner('INTERCEPTED', 'Orbital defence grid destroyed the meteor', 'satellite', 0x7af0ff, 3.2);
    this.god.news('Defence Grid', '@orbitalwatch', '🛰️', 'Incoming rock neutralised at 40 km. You are welcome. Please renew our funding.', this.ctx.target.tile);
    // a few fragments still fall
    const g = this.planet.grid;
    const dmg = this.god.damage();
    const near = g.disk(this.ctx.target.tile, 3);
    if (dmg) dmg.ignite(near.filter(() => this.rng.next() < 0.12), 1, this.report);
    this.phase = 'smoke';
    this.hitT = this.t + 4;
  }
}

// ───────────────────────────────────────────────────────────── meteor shower

interface Rock {
  ball: Fireball & FxObject;
  start: Vector3;
  end: Vector3;
  dir: Vector3;
  t0: number;
  dur: number;
  tile: number;
  size: number;
  dead: boolean;
}

class ShowerEffect extends Effect {
  private rocks: Rock[] = [];
  private count = Math.round(12 + 10 * this.k);
  private spawned = 0;
  private dur = 14 + 4 * this.k;
  private ang = tilesToAngle(this.planet, 9 + 4 * this.k);
  private az = this.rng.next() * Math.PI * 2;
  private shot = this.god.defenses() > 0;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.sfx('whoosh', 0.8, 0.6);
    this.god.banner('METEOR SHOWER', 'Debris stream crossing orbit', ctx.def.icon, 0xffe066, 3);
  }
  step(dt: number): void {
    this.progress = clamp01(this.t / this.dur);
    // spawn on a schedule
    const due = Math.floor((this.t / (this.dur * 0.8)) * this.count);
    while (this.spawned < Math.min(due, this.count)) this.spawn();
    for (const r of this.rocks) {
      if (r.dead) continue;
      const u = (this.t - r.t0) / r.dur;
      const f = Math.pow(clamp01(u), 1.2);
      r.ball.position.lerpVectors(r.start, r.end, f);
      r.ball.heat = smooth(0.05, 0.35, u);
      const p = r.ball.position;
      if (fxRand() < 0.8) this.fx.particles.emitAt(PRESETS.fire, p.x, p.y, p.z, -r.dir.x * 2, -r.dir.y * 2, -r.dir.z * 2, 0.6 + r.size * 0.4, 0.7);
      if (fxRand() < 0.3) this.fx.particles.emitAt(PRESETS.smoke, p.x, p.y, p.z, -r.dir.x, -r.dir.y, -r.dir.z, 0.5, 0.8);
      // the defence grid picks off some
      if (this.shot && u > 0.45 && u < 0.5 && this.rng.next() < 0.08) {
        const nn = p.clone().normalize();
        this.fx.blast(p, nn, 1, { debris: 6 });
        this.fx.particles.emit(PRESETS.spark, p, nn, 25, 1.5);
        r.dead = true;
        this.drop(r.ball);
        this.sfx('laser', 0.6);
        continue;
      }
      if (u >= 1) {
        r.dead = true;
        this.drop(r.ball);
        impact(this, r.tile, r.size);
      }
    }
    if (this.spawned >= this.count && this.rocks.every((r) => r.dead) && this.t > this.dur * 0.6) {
      if (this.t > this.dur) this.done = true;
    }
  }
  private spawn(): void {
    this.spawned++;
    const tile = this.randomTileNear(this.ctx.target.tile, this.ang);
    const end = this.pos(tile, new Vector3());
    const n = this.nrm(tile, new Vector3());
    tangents(n, _e1, _e2);
    const az = this.az + (this.rng.next() - 0.5) * 0.4;
    _a.copy(_e1).multiplyScalar(Math.cos(az)).addScaledVector(_e2, Math.sin(az));
    const dir = n.clone().multiplyScalar(-0.6).addScaledVector(_a, 0.8).normalize();
    const size = 0.35 + this.rng.next() * 0.5 * this.k;
    const start = end.clone().addScaledVector(dir, -90 - this.rng.next() * 40);
    const ball = this.own(new Fireball(this.fx.planetGroup, 0.25 + 0.25 * size, 12 + 8 * size) as Fireball & FxObject);
    ball.dir.copy(dir);
    ball.position.copy(start);
    this.rocks.push({ ball, start, end, dir, t0: this.t, dur: 1.6 + this.rng.next() * 0.8, tile, size, dead: false });
  }
}

// ───────────────────────────────────────────────────────────── extinction asteroid

class AsteroidEffect extends Effect {
  private ball: Fireball & FxObject;
  private start = new Vector3();
  private endP = new Vector3();
  private dir = new Vector3();
  private n: Vector3;
  private approach = 7.5;
  private hitT = -1;
  private ring: Shell & FxObject | null = null;
  private fire: Shell & FxObject | null = null;
  private veil: Shell & FxObject | null = null;
  private order: { tiles: Int32Array; angles: Float32Array };
  private idx = 0;
  private reach = 1.35;
  private shield: number;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.n = this.nrm(ctx.target.tile, new Vector3());
    this.pos(ctx.target.tile, this.endP);
    tangents(this.n, _e1, _e2);
    this.dir.copy(this.n).multiplyScalar(-0.55).addScaledVector(_e1, 0.83).normalize();
    this.start.copy(this.endP).addScaledVector(this.dir, -this.R * 3.2);
    this.ball = this.own(new Fireball(this.fx.planetGroup, 5 + 2 * this.k, 70) as Fireball & FxObject);
    this.ball.position.copy(this.start);
    this.ball.dir.copy(this.dir);
    this.order = sortedByAngle(this.planet, ctx.target.tile, this.reach);
    // a huge defence grid can at least break it up
    this.shield = Math.min(0.6, this.god.defenses() * 0.15);
    this.god.frame(this.n.clone().addScaledVector(_e1, -0.25), this.R * 2.15, 0.15, 2.8);
    this.god.banner('EXTINCTION EVENT', 'A 10-km asteroid is on a collision course', ctx.def.icon, 0xff7a3a, 5);
    this.sfx('alarm', 0.8);
    this.loop('alarm', 0.25);
    this.god.news('Global Emergency Service', '@emergency', '🚨', 'This is not a drill. Please proceed calmly to the nearest anywhere-else.');
  }
  step(dt: number): void {
    const k = this.k;
    if (this.hitT < 0) {
      const u = this.t / this.approach;
      this.progress = clamp01(u * 0.3);
      const f = easeIn(u) * 0.55 + u * 0.45;
      this.ball.position.lerpVectors(this.start, this.endP, clamp01(f));
      const alt = this.ball.position.length() - this.R;
      this.ball.heat = smooth(this.R * 0.6, 4, alt);
      this.god.want(this.key, { dread: 0.3 + 0.4 * u, apocalypse: 0.15 * u });
      const p = this.ball.position;
      if (this.ball.heat > 0.05) {
        for (let i = 0; i < 3; i++) this.fx.particles.emitAt(PRESETS.bigFire, p.x + (fxRand() - 0.5) * 4, p.y + (fxRand() - 0.5) * 4, p.z + (fxRand() - 0.5) * 4, -this.dir.x * 6, -this.dir.y * 6, -this.dir.z * 6, 2.2, 1);
        this.fx.particles.emitAt(PRESETS.darkSmoke, p.x, p.y, p.z, -this.dir.x * 2, -this.dir.y * 2, -this.dir.z * 2, 3, 2.5);
      }
      if (u >= 1) this.hit();
      return;
    }
    const s = this.t - this.hitT;
    this.progress = clamp01(0.3 + (s / 40) * 0.7);
    // shockwave & firestorm racing around the globe
    const front = this.reach * (1 - Math.exp(-s / 3.2));
    if (this.ring) {
      this.ring.range(Math.max(0, front - 0.18), front + 0.05);
      this.ring.u.uAngle.value = front;
      this.ring.u.uIntensity.value = 1.8 * (1 - smooth(4, 14, s));
    }
    if (this.fire) {
      this.fire.range(0, front);
      this.fire.u.uAngle.value = front;
      this.fire.u.uIntensity.value = 0.9 * envelope(s / 30, 0.02, 0.6);
    }
    if (this.veil) {
      const cover = Math.min(Math.PI, 0.3 + s * 0.22);
      this.veil.range(0, cover);
      this.veil.u.uAngle.value = cover;
      this.veil.u.uIntensity.value = 0.85 * envelope(s / 40, 0.15, 0.4);
    }
    // dust winter
    const winter = envelope(s / 40, 0.05, 0.45);
    this.god.want(this.key, { sun: 1 - 0.65 * winter, clouds: 0.9 * winter, storm: 0.7 * winter, apocalypse: 0.55 * winter, dread: 0.45 * winter, lights: 1 });
    // consequences as the front passes
    const dmg = this.god.damage();
    const batch: number[] = [];
    while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= front) batch.push(this.order.tiles[this.idx++]);
    if (batch.length && dmg) {
      const near = batch.filter((_, i) => this.order.angles[this.idx - batch.length + i] < 0.32);
      const far = batch.filter((_, i) => this.order.angles[this.idx - batch.length + i] >= 0.32);
      if (near.length) dmg.wreck(near, { chance: (1 - this.shield) * Math.min(1, 0.85 * k), fx: 'blast', roads: 0.8, trees: true, report: this.report, rand: () => this.rng.next() });
      if (far.length) dmg.wreck(far, { chance: (1 - this.shield) * 0.22 * k, heightBias: 0.3, roads: 0.1, trees: true, report: this.report, rand: () => this.rng.next() });
      dmg.ignite(batch.filter((t) => !this.planet.isWater(t)), 0.3 * k, this.report, () => this.rng.next());
      dmg.flag(near.filter((t) => !this.planet.isWater(t)), TileFlag.Scorched, true);
      // fire columns along the front
      for (let i = 0; i < Math.min(5, batch.length); i++) {
        const t = batch[Math.floor(fxRand() * batch.length)];
        if (this.planet.isWater(t)) continue;
        this.fx.particles.emit(PRESETS.bigFire, this.pos(t, _a), this.nrm(t, _n), 1, 1.2, 1.4);
      }
    }
    if (this.every('ejecta', 0.15, dt) && s < 8) {
      _a.copy(this.n).addScaledVector(_e1, (fxRand() - 0.5) * 1.6).addScaledVector(_e2, (fxRand() - 0.5) * 1.6).normalize();
      this.fx.debris.spawn(this.endP.x, this.endP.y, this.endP.z, _a.x * 30, _a.y * 30, _a.z * 30, { size: 0.8 + fxRand() * 1.4, state: 2, color: 0x3a302a, life: 8 });
      this.fx.particles.emit(PRESETS.bigFire, this.endP, this.n, 3, 3, 2.5);
      this.fx.particles.emit(PRESETS.darkSmoke, this.endP, this.n, 3, 3, 3);
    }
    if (s > 42) this.done = true;
  }
  private hit(): void {
    this.hitT = this.t;
    this.drop(this.ball);
    const k = this.k;
    this.god.flash(0xffffff, 10, 2.5, 1);
    this.god.shake(3.2, 6);
    this.sfx('bigExplosion', 1, 0.6);
    this.sfx('quake', 1);
    this.sfx('rumble', 1, 0.7);
    this.fx.blast(this.endP, this.n, 8, { debris: 40 });
    impact(this, this.ctx.target.tile, 3.2 * k, { unstoppable: true });
    const dmg = this.god.damage();
    dmg?.crater(this.ctx.target.tile, Math.round(3 + k), 4 + Math.round(2 * k), Biome.Crater);
    this.ring = this.own(this.fx.shell(ShellMode.Ring, 32, 256));
    this.ring.setCenter(this.n).colors(0xfff2d0, 0xff7a3a);
    this.ring.u.uR.value = this.R + 1.2;
    this.ring.u.uWidth.value = 0.05;
    this.fire = this.own(this.fx.shell(ShellMode.Fire, 48, 220));
    this.fire.setCenter(this.n).colors(0xffd36a, 0xd42400);
    this.fire.u.uR.value = this.R + 0.9;
    this.veil = this.own(this.fx.shell(ShellMode.Veil, 48, 200));
    this.veil.setCenter(this.n).colors(0x6e625c, 0x2a2420);
    this.veil.u.uR.value = this.R + 13;
    this.god.banner('IMPACT', 'Global firestorm · dust winter incoming', 'explosion', 0xff5a2a, 4);
    this.god.news('Hypernet', '@hypernet', '🦖', 'The dinosaurs would like a word. Specifically: "told you so".');
  }
}

// ───────────────────────────────────────────────────────────── rods from god

class RodsEffect extends Effect {
  private targets: number[];
  private fired = 0;
  private gap = 0.32;
  private streaks: { beam: ReturnType<Effect['beam']>; t0: number; tile: number; top: Vector3; bottom: Vector3; hit: boolean }[] = [];
  constructor(ctx: PowerCtx) {
    super(ctx);
    const path = ctx.target.path && ctx.target.path.length ? ctx.target.path : [ctx.target.tile];
    const n = Math.round(4 + 3 * this.k);
    this.targets = [];
    for (let i = 0; i < n; i++) this.targets.push(path[Math.min(path.length - 1, Math.round((i / Math.max(1, n - 1)) * (path.length - 1)))]);
    this.sfx('launch', 0.5, 1.4);
    this.god.news('Ministry of Peace', '@peace', '🛰️', 'Routine maintenance of our orbital "weather satellites" is under way. Please disregard the craters.');
  }
  step(dt: number): void {
    this.progress = clamp01(this.fired / this.targets.length);
    if (this.fired < this.targets.length && this.t > 0.4 + this.fired * this.gap) {
      const tile = this.targets[this.fired++];
      const bottom = this.pos(tile, new Vector3());
      const n = this.nrm(tile, new Vector3());
      const top = skyPoint(this.R, n, 160, (this.rng.next() - 0.5) * 8, (this.rng.next() - 0.5) * 8, new Vector3());
      const beam = this.beam();
      this.streaks.push({ beam, t0: this.t, tile, top, bottom, hit: false });
      this.sfx('whoosh', 0.5, 1.6);
    }
    for (const s of this.streaks) {
      const u = (this.t - s.t0) / 0.45;
      if (!s.hit) {
        const head = _a.lerpVectors(s.top, s.bottom, easeIn(clamp01(u)));
        const tail = _b.lerpVectors(s.top, s.bottom, Math.max(0, easeIn(clamp01(u)) - 0.25));
        s.beam.set(tail, head, 0.18, 0xffe9c0, 2.2);
        if (u >= 1) {
          s.hit = true;
          this.releaseBeam(s.beam);
          impact(this, s.tile, 0.9 + 0.3 * this.k);
        }
      }
    }
    if (this.fired >= this.targets.length && this.streaks.every((s) => s.hit) && this.t > this.fired * this.gap + 3) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── comet flyby

class CometEffect extends Effect {
  private comet: Comet & FxObject;
  private dur = 26;
  private p0 = new Vector3();
  private p1 = new Vector3();
  private paid = false;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const n = this.nrm(ctx.target.tile, new Vector3());
    tangents(n, _e1, _e2);
    // an arc across the city's sky, ~2.3 R from the centre
    this.p0.copy(n).addScaledVector(_e1, -1.1).addScaledVector(_e2, 0.35).normalize().multiplyScalar(this.R * 2.3);
    this.p1.copy(n).addScaledVector(_e1, 1.1).addScaledVector(_e2, -0.2).normalize().multiplyScalar(this.R * 2.3);
    this.comet = this.own(new Comet(this.fx.worldGroup, 2.2) as Comet & FxObject);
    this.comet.position.copy(this.p0);
    this.sfx('chime', 0.8, 0.8);
    this.god.banner('THE GREAT COMET', 'Visible tonight · tourists inbound', 'comet', 0x9fd8ff, 4);
  }
  step(): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    this.comet.position.lerpVectors(this.p0, this.p1, u).normalize().multiplyScalar(this.R * (2.3 + 0.25 * Math.sin(u * Math.PI)));
    this.comet.vel.subVectors(this.p1, this.p0).normalize();
    this.comet.sunDir.copy(this.ctx.view.sunDir);
    this.comet.intensity = envelope(u, 0.15, 0.2);
    if (!this.paid && u > 0.5) {
      this.paid = true;
      const g = this.ctx.game;
      let pop = 0;
      try {
        pop = g.sim.getMetric('population');
      } catch {
        pop = 0;
      }
      const bonus = Math.round((4000 + pop * 1.8) * this.k);
      g.empire.earn(bonus);
      try {
        g.sim.stats.tourism = (g.sim.stats.tourism ?? 0) + Math.round(pop * 0.4);
      } catch {
        /* stats optional */
      }
      this.god.news('Tourism Board', '@visitcity', '🔭', `Comet watchers have booked every hotel in ${this.planet.city.name}. Telescope sales up 900%.`);
      if (!g.empire.sandbox) this.ctx.game.audio?.sfx?.('money');
      this.god.banner('COMET TOURISM', g.empire.sandbox ? 'Hotels fully booked' : `+§${bonus.toLocaleString('en-US')} from stargazers`, 'money', 0xffd977, 3.4);
    }
    if (this.t >= this.dur) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── solar flare

class FlareEffect extends Effect {
  private dur = 28;
  private sparks: number[] = [];
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.god.flash(0xfff6d8, 6, 2.2, 0.55);
    this.sfx('supernova', 0.5, 1.4);
    this.sfx('alarm', 0.4);
    this.god.banner('SOLAR FLARE', 'X-class flare · coronal mass ejection inbound', 'sun', 0xffd36b, 3.6);
    // things that spark: tall and power buildings
    for (const b of this.planet.buildings.values()) if (buildingHeight(b) > 3 || (b.defId.includes('power') || b.defId.includes('plant'))) this.sparks.push(b.id);
    if (!this.sparks.length) for (const b of this.planet.buildings.values()) this.sparks.push(b.id);
    this.god.news('Hypernet', '@hypernet', '📡', 'wifi down. phones down. the sky is green. honestly? vibes.');
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const flare = Math.exp(-this.t * 1.2);
    const outage = smooth(0.08, 0.15, u) * (1 - smooth(0.55, 0.7, u));
    this.god.want(this.key, { sun: 1 + 1.4 * flare, aurora: 2 * envelope(u, 0.1, 0.3), lights: 1 - 0.92 * outage });
    if (outage > 0.2 && this.every('spark', 0.18, dt) && this.sparks.length) {
      const id = this.sparks[Math.floor(this.rng.next() * this.sparks.length)];
      const b = this.planet.buildings.get(id);
      if (b) {
        const p = this.pos(b.tile, _a, Math.min(5, buildingHeight(b)));
        const n = this.nrm(b.tile, _n);
        this.fx.particles.emit(PRESETS.blueSpark, p, n, 14, 1.2);
        if (this.rng.next() < 0.35) {
          const t2 = this.randomTileNear(b.tile, tilesToAngle(this.planet, 2));
          const q = this.pos(t2, _b, 1.5);
          this.fx.bolts.strike(p, q, { color: 0x9ae6ff, width: 0.05, branches: 1, jag: 0.25, life: 0.3 });
          this.sfx('laser', 0.25, 1.6);
        }
        if (this.rng.next() < 0.05) this.god.damage()?.ignite([b.tile], 1, this.report);
      }
    }
    if (this.once('restore', this.dur * 0.7)) this.sfx('levelUp', 0.4);
    if (this.t >= this.dur) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── gamma-ray burst

class GammaEffect extends Effect {
  private dur = 18;
  private dir = new Vector3();
  private order: { tiles: Int32Array; angles: Float32Array };
  private idx = 0;
  private glow: Shell & FxObject;
  private beamA = this.beam();
  private sick: number[] = [];
  constructor(ctx: PowerCtx) {
    super(ctx);
    // the burst arrives from deep space, centred near the city
    const c = this.nrm(ctx.target.tile, new Vector3());
    tangents(c, _e1, _e2);
    this.dir.copy(c).addScaledVector(_e1, 0.35).normalize();
    this.order = sortedByAngle(this.planet, this.tileAt(this.dir), Math.PI / 2 + 0.1);
    this.glow = this.own(this.fx.shell(ShellMode.Glow, 32, 192));
    this.glow.setCenter(this.dir).colors(0xd8a8ff, 0x6a5aff);
    this.glow.u.uR.value = this.R + 2.5;
    this.beamA.u.uCore.value.setHex(0xffffff);
    this.god.flash(0xe8d8ff, 8, 1.6, 0.9);
    this.god.shake(0.5, 1.5);
    this.sfx('supernova', 0.8, 1.6);
    this.sfx('alarm', 0.5);
    this.god.banner('GAMMA-RAY BURST', 'A dying star 1,000 light-years away just aimed at us', 'radiation', 0xc8a8ff, 4);
    this.god.news('Hypernet', '@hypernet', '☢️', 'my geiger counter just made a noise i can only describe as "operatic"');
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.03, 0.5);
    // the beam: a narrow column from deep space, fading after the first seconds
    const beamI = Math.exp(-this.t * 0.6);
    const top = _a.copy(this.dir).multiplyScalar(this.R * 12);
    const hit = _b.copy(this.dir).multiplyScalar(this.R + 1);
    this.beamA.set(top, hit, this.R * 0.18 * (0.3 + beamI), 0xb88aff, 2.2 * beamI);
    const front = (Math.PI / 2 + 0.1) * smooth(0, 3, this.t);
    this.glow.range(0, front);
    this.glow.u.uAngle.value = front;
    this.glow.u.uIntensity.value = 0.55 * env;
    this.god.want(this.key, { sun: 1 + 0.6 * env, aurora: 3 * env, apocalypse: 0.15 * env, lights: 1 - 0.6 * env });
    const batch: number[] = [];
    while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= front && batch.length < 200) batch.push(this.order.tiles[this.idx++]);
    if (batch.length) {
      const dmg = this.god.damage();
      const land = batch.filter((t) => !this.planet.isWater(t));
      dmg?.flag(land, TileFlag.Irradiated, true, this.report, 0.7, () => this.rng.next());
      // the ozone is gone: crops and forests wither, exposed residents flee
      const veg = land.filter((t) => (this.planet.feature[t] === Feature.Trees || this.planet.feature[t] === Feature.Flowers) && this.rng.next() < 0.35);
      if (veg.length) this.ops.setFeature(veg, Feature.None);
      for (const b of dmg?.buildingsOn(land) ?? []) {
        if (this.rng.next() < 0.3 * this.k) {
          this.ctx.view.buildings.forceState(b.id, InstState.Irradiated);
          this.sick.push(b.id);
          if (b.state === BuildingState.Active && this.rng.next() < 0.4) this.ops.updateBuilding(b.id, { state: BuildingState.Abandoned });
          this.report.displaced += (b.occupants ?? 0) * 0.5;
        }
      }
    }
    if (this.every('ions', 0.06, dt) && env > 0.2) {
      const t = this.randomTileNear(this.tileAt(this.dir), 1.2);
      this.fx.particles.emit(PRESETS.void, this.pos(t, _a, 3 + fxRand() * 8), this.nrm(t, _n), 2, 0.6);
    }
    if (this.t >= this.dur) this.done = true;
  }
  protected override cleanup(): void {
    for (const id of this.sick) this.ctx.view.buildings.forceState(id, null);
    this.god.cityEvent('flu', 'Radiation Sickness', '☢️', 'The gamma burst left people unwell. Clinics are overwhelmed.', 14);
  }
}

// ───────────────────────────────────────────────────────────── definitions

export const SKY: PowerSpec[] = [
  {
    id: 'meteor', name: 'Meteor', icon: 'meteor', category: 'sky', targeting: 'tile', tier: 1, danger: 3, cooldown: 25, natural: true,
    description: 'Call down a blazing rock from space. Fireball, flash, shockwave, a smoking crater and fires all around. Orbital defences may shoot it down.',
    flavor: 'Shooting stars grant wishes. This one grants craters.',
    run: (c) => new MeteorEffect(c),
  },
  {
    id: 'meteor_shower', name: 'Meteor Shower', icon: 'comet', category: 'sky', targeting: 'tile', tier: 3, danger: 3, cooldown: 70, natural: true,
    description: 'A debris stream crosses orbit: dozens of fireballs rain down across the region over several seconds.',
    flavor: 'Make a wish. Make a lot of wishes. Quickly.',
    run: (c) => new ShowerEffect(c),
  },
  {
    id: 'asteroid', name: 'Extinction Asteroid', icon: 'meteor', category: 'sky', targeting: 'tile', tier: 6, danger: 5, cooldown: 300, confirm: true, color: 0xff7a3a,
    description: 'A ten-kilometre rock. Blinding impact, a shockwave that circles the globe, a planetary firestorm and a dust winter that dims the sun.',
    flavor: 'The dinosaurs had no space programme. You have one. Did you fund it?',
    run: (c) => new AsteroidEffect(c),
  },
  {
    id: 'rods', name: 'Rods from God', icon: 'satellite', category: 'sky', targeting: 'drag', tier: 4, danger: 3, cooldown: 60, color: 0xffe9c0,
    description: 'Orbital kinetic bombardment: tungsten rods fall at Mach 10 along the line you draw.',
    flavor: 'Technically not a weapon. Technically a very heavy delivery.',
    tip: 'Drag to draw the strike line',
    run: (c) => new RodsEffect(c),
  },
  {
    id: 'comet', name: 'Comet Flyby', icon: 'comet', category: 'sky', targeting: 'global', tier: 0, danger: 0, cooldown: 240, color: 0x9fd8ff,
    description: 'A magnificent comet sweeps across the sky with glowing ion and dust tails. Stargazers flock in — tourism boom.',
    flavor: 'Once in a lifetime. Twice, if you are a god.',
    run: (c) => new CometEffect(c),
  },
  {
    id: 'gamma', name: 'Gamma-Ray Burst', icon: 'radiation', category: 'sky', targeting: 'tile', tier: 6, danger: 4, cooldown: 240, color: 0xc8a8ff, confirm: true,
    description: 'A beam from a distant hypernova sweeps the planet: a whole hemisphere is irradiated, the ozone layer is stripped and auroras blaze in daylight.',
    flavor: 'Sunscreen manufacturers would like to clarify that this is not covered.',
    run: (c) => new GammaEffect(c),
  },
  {
    id: 'solar_flare', name: 'Solar Flare', icon: 'sun', category: 'sky', targeting: 'global', tier: 2, danger: 1, cooldown: 90, natural: true, color: 0xffd36b,
    description: 'The star belches plasma: a blinding flare, auroras over the whole sky, sparking towers and a city-wide blackout.',
    flavor: 'Have you tried turning the sun off and on again?',
    run: (c) => new FlareEffect(c),
  },
];
