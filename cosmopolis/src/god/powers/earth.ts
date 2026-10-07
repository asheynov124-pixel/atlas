/**
 * OWNER: god.
 * Earth powers: earthquake (shake, fissures, collapses, liquefaction, aftershocks — big undersea ones raise a
 * tsunami), volcano (a mountain rises, erupts with a plume, lava bombs & dirty lightning; lava creeps downhill
 * and builds new land in the sea), sinkhole, TSUNAMI (a towering wave ring racing across the ocean onto the
 * coast), mega-flood (sea level surges, recedes later), continental rift (a lava fissure along a drawn line),
 * landslide.
 */
import { Vector3 } from 'three';
import { Biome, Feature, TileFlag } from '../../core/types';
import type { BuildingInstance } from '../../world/planet';
import type { FxObject } from '../../render/fx/FxLayer';
import { PRESETS, fxRand } from '../../render/fx/particles';
import { ShellMode, type Shell } from '../../render/fx/shells';
import { InstState } from '../../render/materials';
import { Effect, type PowerCtx, type PowerSpec } from '../effect';
import { buildingHeight } from '../damage';
import { notify } from '../../ui/store';
import { clamp01, envelope, inlandDistance, offshore, openSea, sinkBehaviour, skyPoint, smooth, sortedByAngle, tangents, tilesToAngle } from './common';

const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();

/** A wandering fissure path of tiles from `start` heading roughly along neighbour index `dir`. */
function fissurePath(e: Effect, start: number, len: number): number[] {
  const g = e.planet.grid;
  const path = [start];
  let cur = start;
  let heading = Math.floor(e.rng.next() * g.degree(start));
  for (let i = 0; i < len; i++) {
    const d = g.degree(cur);
    heading = (heading + (e.rng.next() < 0.35 ? (e.rng.next() < 0.5 ? 1 : d - 1) : 0)) % d;
    const next = g.neighbor(cur, heading);
    if (path.includes(next)) break;
    path.push(next);
    cur = next;
  }
  return path;
}

/** Draw a crack along tiles (surface points). */
function crackAlong(e: Effect, tiles: number[], width: number, glow = 0, life = 30): void {
  if (tiles.length < 2) return;
  const pts = tiles.map((t) => e.pos(t, new Vector3()));
  e.fx.cracks.add(pts, width, glow, life, 0.45, () => e.rng.next());
}

// ───────────────────────────────────────────────────────────── earthquake

class QuakeEffect extends Effect {
  private mag = 6.2 + 1.3 * this.k;
  private radius = Math.round(4 + 3 * this.k);
  private ring: Shell & FxObject;
  private center = this.nrm(this.ctx.target.tile, new Vector3());
  private rumble = this.loop('rumble', 0);
  private shocks = [1.2, 6.5 + this.rng.next() * 1.5, 10 + this.rng.next() * 2];
  private dur = 14;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.ring = this.own(this.fx.shell(ShellMode.Ring, 28, 192));
    this.ring.setCenter(this.center).colors(0xffe2b8, 0x8a6a48);
    this.ring.u.uR.value = this.R + this.planet.heightOf(ctx.target.tile) + 0.4;
    this.ring.u.uWidth.value = 0.03;
    this.ring.u.uIntensity.value = 0;
    this.sfx('rumble', 0.6);
    if (this.k >= 1.3) this.god.banner(`MAGNITUDE ${this.mag.toFixed(1)}`, 'Major earthquake', ctx.def.icon, 0xffb35c, 3.4);
  }
  step(dt: number): void {
    this.progress = clamp01(this.t / this.dur);
    const main = this.t >= this.shocks[0];
    const env = main ? Math.exp(-(this.t - this.shocks[0]) * 0.28) : smooth(0, 1.2, this.t) * 0.25;
    this.rumble.setVolume(0.9 * env);
    for (let i = 0; i < this.shocks.length; i++) if (this.once('shock' + i, this.shocks[i])) this.shock(i === 0 ? 1 : 0.45 - i * 0.08);
    // shock ring
    const s0 = this.t - this.shocks[0];
    if (s0 > 0) {
      const a = tilesToAngle(this.planet, this.radius * 1.6) * (1 - Math.exp(-s0 * 1.4));
      this.ring.range(Math.max(0, a - 0.12), a + 0.04);
      this.ring.u.uAngle.value = a;
      this.ring.u.uIntensity.value = 1.2 * Math.exp(-s0 * 0.8);
    }
    // swaying dust over the epicentre while shaking
    if (env > 0.2 && this.every('dust', 0.12, dt)) {
      const t = this.randomTileNear(this.ctx.target.tile, tilesToAngle(this.planet, this.radius));
      if (!this.planet.isWater(t)) this.fx.particles.emit(PRESETS.dust, this.pos(t, _a, 0.2), this.nrm(t, _n), 2 * env, 1.2);
    }
    if (this.t >= this.dur) this.done = true;
  }
  /** One shock (main or aftershock, power 0..1). */
  private shock(pw: number): void {
    const k = this.k * pw;
    this.god.shake(0.5 + 1.1 * k, 2.5 + 2.5 * pw);
    this.sfx('quake', 0.6 + 0.4 * pw);
    this.sfx('crumble', 0.5 * pw + 0.2);
    const dmg = this.god.damage();
    if (!dmg) return;
    const g = this.planet.grid;
    const tile = this.ctx.target.tile;
    // fissures radiating from the epicentre
    const n = pw >= 1 ? 4 + Math.round(2 * this.k) : 2;
    for (let i = 0; i < n; i++) {
      const path = fissurePath(this, i === 0 ? tile : this.randomTileNear(tile, tilesToAngle(this.planet, 2)), Math.round((4 + 6 * k) * (0.6 + this.rng.next() * 0.6)));
      const land = path.filter((t) => !this.planet.isWater(t));
      crackAlong(this, land, 0.25 + 0.25 * k, k > 1.6 ? 0.4 : 0);
      for (const t of land) if (this.rng.next() < 0.3) this.fx.collapse(this.pos(t, _a, 0.2), this.nrm(t, _n), 0.8);
      dmg.wreck(land, { chance: 0.55 * k, heightBias: 0.25, roads: 0.6, report: this.report, rand: () => this.rng.next() });
    }
    // shaking topples buildings, tall ones first; chance falls off with distance
    const disk = g.disk(tile, this.radius);
    const near: number[] = [], mid: number[] = [], far: number[] = [];
    const maxA = tilesToAngle(this.planet, this.radius);
    for (const t of disk) {
      const a = g.angle(tile, t) / maxA;
      (a < 0.35 ? near : a < 0.7 ? mid : far).push(t);
    }
    dmg.wreck(near, { chance: 0.28 * k, heightBias: 0.55, roads: 0.15, report: this.report, rand: () => this.rng.next() });
    dmg.wreck(mid, { chance: 0.12 * k, heightBias: 0.45, roads: 0.06, report: this.report, rand: () => this.rng.next() });
    dmg.wreck(far, { chance: 0.04 * k, heightBias: 0.35, report: this.report, rand: () => this.rng.next() });
    // the ground heaves: terraces shift by a level here and there
    if (pw >= 1) {
      const shifted = disk.filter((t) => !this.planet.isWater(t) && this.planet.building[t] < 0 && this.rng.next() < 0.12 * this.k);
      if (shifted.length) dmg.raise(shifted, shifted.map(() => (this.rng.next() < 0.5 ? -1 : 1)));
      // liquefaction on low coastal ground; broken gas mains
      const wet = disk.filter((t) => this.planet.isCoastal(t) && this.rng.next() < 0.5);
      dmg.flag(wet, TileFlag.Flooded, true, this.report, 0.8);
      dmg.ignite(disk.filter((t) => this.planet.building[t] >= 0), 0.05 * this.k, this.report, () => this.rng.next());
      // a big undersea quake raises a tsunami
      if (this.k >= 1.5 && (this.planet.isWater(tile) || this.planet.isCoastal(tile))) {
        this.god.trigger('tsunami', { tile }, { natural: true, intensity: this.k * 0.8 });
        notify({ title: 'Tsunami generated!', body: 'The quake displaced the sea floor. A wave is coming.', kind: 'bad', icon: 'tsunami', tile });
      }
    }
    this.fx.particles.emit(PRESETS.bigDust, this.pos(tile, _a, 0.3), this.nrm(tile, _n), 6 * pw, 1.4, 1.4);
  }
}

// ───────────────────────────────────────────────────────────── volcano

class VolcanoEffect extends Effect {
  private rise = 4.5;
  private dur = 30 + 6 * this.k;
  private radius = Math.round(3 + 1.6 * this.k);
  private height = Math.round(9 + 4 * this.k);
  private cone: number[];
  private base: number[];
  private target: number[];
  private crater: number;
  private lava = new Set<number>();
  private front: number[] = [];
  private budget = Math.round(40 + 40 * this.k);
  private top = new Vector3();
  private up = new Vector3();
  private ash: Shell & FxObject;
  private rumble = this.loop('rumble', 0.6);
  private fireLoop = this.loop('fire', 0);
  private raised = 0;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const p = this.planet;
    const g = p.grid;
    this.crater = ctx.target.tile;
    this.cone = g.disk(this.crater, this.radius);
    this.base = this.cone.map((t) => p.elevation[t]);
    const peak = Math.max(...this.base) + this.height;
    const maxA = Math.max(1e-4, tilesToAngle(p, this.radius + 0.5));
    this.target = this.cone.map((t, i) => {
      const d = g.angle(this.crater, t) / maxA;
      const h = Math.round(this.base[i] + (peak - this.base[i]) * Math.pow(Math.max(0, 1 - d), 1.35));
      return t === this.crater ? h - 2 : h;
    });
    this.ash = this.own(this.fx.shell(ShellMode.Veil, 24, 120));
    this.ash.setCenter(this.nrm(this.crater, new Vector3())).colors(0x6a605a, 0x2a2624);
    this.ash.u.uR.value = this.R + this.height * 0.32 + 9;
    this.god.banner('ERUPTION', 'A new volcano is being born', ctx.def.icon, 0xff7a2a, 3.6);
    this.frame(this.crater, 82, 1.18, 2);
    this.sfx('quake', 0.8);
    // anything standing where the mountain rises is thrown down
    const dmg = this.god.damage();
    dmg?.wreck(this.cone, { chance: 1, fx: 'collapse', roads: 1, trees: true, report: this.report, unstoppable: true, rand: () => this.rng.next() });
  }
  step(dt: number): void {
    const p = this.planet;
    this.progress = clamp01(this.t / this.dur);
    // 1 · the mountain rises in steps
    if (this.t < this.rise) {
      const f = smooth(0, this.rise, this.t);
      const step = Math.floor(f * 6);
      if (step > this.raised) {
        this.raised = step;
        this.ops.setElevation(this.cone, this.cone.map((_, i) => Math.round(this.base[i] + (this.target[i] - this.base[i]) * (step / 6))));
        this.god.shake(0.5, 0.6);
        for (let i = 0; i < 6; i++) {
          const t = this.cone[Math.floor(fxRand() * this.cone.length)];
          this.fx.particles.emit(PRESETS.bigDust, this.pos(t, _a), this.nrm(t, _n), 1, 1.2);
        }
      }
      return;
    }
    if (this.once('erupt', this.rise)) this.erupt();
    const s = this.t - this.rise;
    const env = envelope((this.t - this.rise) / (this.dur - this.rise), 0.04, 0.35);
    this.pos(this.crater, this.top, 0.3);
    this.nrm(this.crater, this.up);
    this.rumble.setVolume(0.7 * env);
    this.fireLoop.setVolume(0.6 * env);
    this.god.want(this.key, { sun: 1 - 0.25 * env, apocalypse: 0.12 * env, clouds: 0.5 * env });
    this.ash.range(0, tilesToAngle(p, 6 + s * 0.5));
    this.ash.u.uAngle.value = tilesToAngle(p, 6 + s * 0.5);
    this.ash.u.uIntensity.value = 0.85 * env;
    // plume: fire fountain + a towering column of ash
    const P = this.fx.particles;
    if (this.every('plume', 0.05, dt)) {
      P.emit(PRESETS.bigFire, this.top, this.up, 1.5 * env + 0.3, 2.4, 1.1);
      P.emit(PRESETS.darkSmoke, _a.copy(this.top).addScaledVector(this.up, 2), this.up, 1.6 * env, 3.2, 1.6, 1.8);
      P.emit(PRESETS.ember, this.top, this.up, 4 * env, 3);
      tangents(this.up, _e1, _e2);
      _b.copy(this.top).addScaledVector(this.up, 10 + fxRand() * 12).addScaledVector(_e1, (fxRand() - 0.5) * 8).addScaledVector(_e2, (fxRand() - 0.5) * 8);
      P.emitAt(PRESETS.darkSmoke, _b.x, _b.y, _b.z, this.up.x * 2 + _e1.x * 2, this.up.y * 2 + _e1.y * 2, this.up.z * 2 + _e1.z * 2, 2.2 * env + 0.4, 1.8);
      // ash fall downwind
      const t = this.randomTileNear(this.crater, tilesToAngle(p, 9));
      P.emit(PRESETS.ash, this.pos(t, _a, 6 + fxRand() * 4), this.nrm(t, _n), 3 * env);
    }
    // lava bombs
    if (this.every('bombs', 0.35, dt) && env > 0.3) {
      for (let i = 0; i < 2; i++) {
        tangents(this.up, _e1, _e2);
        const az = fxRand() * Math.PI * 2;
        _b.copy(this.up).multiplyScalar(14 + fxRand() * 8).addScaledVector(_e1, Math.cos(az) * 6).addScaledVector(_e2, Math.sin(az) * 6);
        this.fx.debris.spawn(this.top.x, this.top.y, this.top.z, _b.x, _b.y, _b.z, { size: 0.5 + fxRand() * 0.6, state: InstState.Burning, color: 0x3a2a22, life: 5 });
      }
      // a bomb sets fire where it lands (approximation: random nearby tile)
      if (this.rng.next() < 0.2) this.god.damage()?.ignite([this.randomTileNear(this.crater, tilesToAngle(p, this.radius + 3))], 0.6, this.report);
    }
    // dirty thunderstorm in the ash column
    if (this.every('bolt', 1.1, dt) && env > 0.4) {
      const a = skyPoint(this.R, this.up, this.height * 0.32 + 12 + fxRand() * 6, (fxRand() - 0.5) * 8, (fxRand() - 0.5) * 8, new Vector3());
      const b = skyPoint(this.R, this.up, this.height * 0.32 + 4 + fxRand() * 6, (fxRand() - 0.5) * 10, (fxRand() - 0.5) * 10, new Vector3());
      this.fx.bolts.strike(a, b, { color: 0xffd0a0, width: 0.06, branches: 2, life: 0.4 });
      this.sfx('thunder', 0.35, 1.2);
    }
    // 2 · lava creeps downhill
    if (this.every('lava', 0.4, dt) && s < (this.dur - this.rise) * 0.8) this.flow();
    if (this.t >= this.dur) this.done = true;
  }
  private erupt(): void {
    this.god.flash(0xffa060, 3, 1.2, 0.4);
    this.god.shake(1.4, 2.5);
    this.sfx('bigExplosion', 1, 0.7);
    this.sfx('rumble', 1);
    const p = this.planet;
    const top = this.pos(this.crater, new Vector3(), 0.3);
    const up = this.nrm(this.crater, new Vector3());
    this.fx.blast(top, up, 3, { debris: 30 });
    // the summit: a lava lake in the crater, fresh basalt around it
    const rim = p.grid.disk(this.crater, 1);
    this.ops.setBiome([this.crater], Biome.Lava);
    this.ops.setBiome(rim.filter((t) => t !== this.crater), Biome.Volcanic);
    this.ops.setBiome(this.cone.filter((t) => !rim.includes(t)), Biome.Rock);
    for (const t of rim) {
      this.lava.add(t);
      this.front.push(t);
    }
    this.god.news('Volcanological Society', '@lavawatch', '🌋', `A brand-new volcano has erupted outside ${p.city.name}. Locals are calling it "Mount Why".`, this.crater);
  }
  private flow(): void {
    const p = this.planet;
    const g = p.grid;
    const dmg = this.god.damage();
    const next: number[] = [];
    for (const t of this.front) {
      const h = p.elevation[t];
      const nbrs = g.neighbors(t).filter((n) => !this.lava.has(n) && p.elevation[n] <= h);
      nbrs.sort((a, b) => p.elevation[a] - p.elevation[b]);
      for (let i = 0; i < Math.min(2, nbrs.length); i++) if (i === 0 || this.rng.next() < 0.35) next.push(nbrs[i]);
    }
    const fresh = [...new Set(next)].slice(0, Math.max(1, Math.min(this.budget, 10)));
    if (!fresh.length || this.budget <= 0) return;
    this.budget -= fresh.length;
    const land = fresh.filter((t) => !p.isWater(t));
    const sea = fresh.filter((t) => p.isWater(t));
    if (land.length) {
      dmg?.wreck(land, { chance: 1, fx: 'blast', roads: 1, trees: true, report: this.report, unstoppable: true, rand: () => this.rng.next() });
      this.ops.setBiome(land, Biome.Lava);
      this.ops.setFeature(land, Feature.None);
      dmg?.ignite(land.flatMap((t) => g.neighbors(t)).filter((t) => !this.lava.has(t) && p.building[t] >= 0), 0.25, this.report, () => this.rng.next());
    }
    // lava meets the sea: steam explosions and brand-new land
    if (sea.length) {
      this.ops.setElevation(sea, sea.map(() => p.seaOffset));
      this.ops.setBiome(sea, Biome.Volcanic);
      for (const t of sea) this.fx.particles.emit(PRESETS.steam, this.pos(t, _a), this.nrm(t, _n), 8, 2, 1.6);
      this.sfx('splash', 0.5, 0.8);
    }
    for (const t of fresh) {
      this.lava.add(t);
      if (!p.isWater(t)) this.fx.particles.emit(PRESETS.fire, this.pos(t, _a, 0.2), this.nrm(t, _n), 4, 1, 1.2);
    }
    this.front = land;
  }
  protected override cleanup(): void {
    // the flows cool into basalt; the crater keeps its lava lake
    const cooled = [...this.lava].filter((t) => t !== this.crater && this.planet.biome[t] === Biome.Lava && this.rng.next() < 0.75);
    if (cooled.length) this.ops.setBiome(cooled, Biome.Volcanic);
  }
}

// ───────────────────────────────────────────────────────────── sinkhole

class SinkholeEffect extends Effect {
  private r = Math.max(1, Math.round(0.6 + 1.1 * this.k));
  private tiles = this.planet.grid.disk(this.ctx.target.tile, this.r);
  private base = this.tiles.map((t) => this.planet.elevation[t]);
  private depth = 3 + Math.round(2 * this.k);
  private stage = 0;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.sfx('crumble', 1, 0.7);
    this.sfx('rumble', 0.7);
    const ring = this.planet.grid.ring(ctx.target.tile, this.r + 1);
    const pts = [...ring, ring[0]].map((t) => this.pos(t, new Vector3()));
    this.fx.cracks.add(pts, 0.3, 0, 25, 0.3, () => this.rng.next());
    const dmg = this.god.damage();
    dmg?.wreck(this.tiles, {
      chance: 1,
      fx: 'none',
      roads: 1,
      trees: true,
      rubble: false,
      report: this.report,
      unstoppable: true,
      launch: (b: BuildingInstance, m) => {
        const f = this.fx.flyers.launch(b, m, sinkBehaviour(this.depth * 0.32 + buildingHeight(b) + 1, 2.6 + this.rng.next(), 0.5));
        if (f) f.spin.set(0, 0, 0);
      },
    });
  }
  step(dt: number): void {
    this.progress = clamp01(this.t / 6);
    const st = Math.min(this.depth, Math.floor(smooth(0.2, 2.6, this.t) * this.depth));
    if (st > this.stage) {
      this.stage = st;
      this.ops.setElevation(this.tiles, this.base.map((b, i) => b - Math.round(st * (this.tiles[i] === this.ctx.target.tile ? 1 : 0.75))));
      this.god.shake(0.35, 0.4);
    }
    if (this.every('dust', 0.08, dt) && this.t < 3.5) {
      const t = this.tiles[Math.floor(fxRand() * this.tiles.length)];
      this.fx.particles.emit(PRESETS.bigDust, this.pos(t, _a, 0.5), this.nrm(t, _n), 1, 1.2, 0.9);
      this.fx.particles.emit(PRESETS.dust, this.pos(t, _a), this.nrm(t, _n), 3, 1.5);
    }
    if (this.once('settle', 3)) {
      this.ops.setBiome(this.tiles.filter((t) => !this.planet.isWater(t)), Biome.Rock);
      this.ops.setFeature(this.tiles.filter(() => this.rng.next() < 0.4), Feature.Rubble);
    }
    if (this.t > 6) this.done = true;
  }
}

// ───────────────────────────────────────────────────────────── tsunami

class TsunamiEffect extends Effect {
  private epi: number;
  private center = new Vector3();
  private wave: Shell & FxObject;
  private ring: Shell & FxObject;
  private maxA = 0.75 + 0.35 * this.k;
  private speed = 0.06 + 0.012 * this.k;
  private H = 4 + 2.4 * this.k;
  private order: { tiles: Int32Array; angles: Float32Array };
  private idx = 0;
  private drawn = false;
  private sea0 = this.planet.seaOffset;
  private start = 2.2;
  private loopW = this.loop('rumble', 0);
  private hits = 0;
  private inland: Map<number, number>;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.epi = ctx.target.tile;
    this.nrm(this.epi, this.center);
    this.order = sortedByAngle(this.planet, this.epi, this.maxA);
    this.inland = inlandDistance(this.planet, this.order.tiles, 8);
    this.wave = this.own(this.fx.shell(ShellMode.Wave, 40, 320));
    this.wave.setCenter(this.center).colors(0x5fc2d8, 0x0d4566).mask(this.fx.waterMask());
    this.wave.u.uR.value = this.R + this.planet.waterHeight;
    this.wave.u.uWidth.value = 0.05;
    this.wave.u.uHeight.value = 0;
    this.wave.u.uIntensity.value = 0;
    this.ring = this.own(this.fx.shell(ShellMode.Ring, 20, 192));
    this.ring.setCenter(this.center).colors(0xe8fbff, 0x7fd8ff);
    this.ring.u.uR.value = this.R + this.planet.waterHeight + 0.2;
    this.ring.u.uWidth.value = 0.02;
    this.god.banner('TSUNAMI', 'Seismic sea wave inbound — head for high ground', ctx.def.icon, 0x5fc2d8, 4);
    this.god.shake(0.6, 2);
    this.sfx('quake', 0.6);
    this.sfx('alarm', 0.5);
    // frame from the sea, looking at the coast the wave will hit
    const coast = this.order.tiles.find((t) => !this.planet.isWater(t));
    if (coast !== undefined) this.frame(coast, 62, 1.12, 2.2, this.epi);
    this.fx.particles.emit(PRESETS.splash, this.pos(this.epi, _a), this.center, 30, 2.4, 2);
  }
  resolveDraw(): void {
    // the sea draws back before the wave arrives (one level, everywhere)
    if (!this.drawn && this.planet.spec.hasOcean) {
      this.drawn = true;
      this.ops.setSeaOffset(this.sea0 - 1);
    }
  }
  step(dt: number): void {
    const s = this.t - this.start;
    if (this.t > 0.4) this.resolveDraw();
    const a = s > 0 ? this.speed * s * (1 + s * 0.02) : 0;
    this.progress = clamp01(a / this.maxA);
    const env = smooth(0, 1.2, s) * (1 - smooth(this.maxA * 0.82, this.maxA, a));
    // height grows as the wave shoals near land, decays with distance
    const H = this.H * (0.75 + 0.25 * Math.sin(Math.min(1, a / 0.3) * 1.57)) * Math.exp(-a * 0.5);
    this.wave.u.uAngle.value = a;
    this.wave.u.uHeight.value = H * env;
    this.wave.u.uIntensity.value = env;
    this.wave.range(Math.max(0, a - 0.32), a + 0.06);
    this.ring.range(Math.max(0, a - 0.05), a + 0.02);
    this.ring.u.uAngle.value = a;
    this.ring.u.uIntensity.value = env * 0.6;
    this.loopW.setVolume(env * 0.9);
    if (s > 0 && this.drawn && this.planet.seaOffset < this.sea0 && a > 0.12) this.ops.setSeaOffset(this.sea0);
    // the front reaches tiles
    const batch: number[] = [];
    while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= a) batch.push(this.order.tiles[this.idx++]);
    if (batch.length && env > 0.05) this.hit(batch, H * env, a);
    // spray along the front
    if (env > 0.1 && this.every('spray', 0.05, dt)) {
      tangents(this.center, _e1, _e2);
      for (let i = 0; i < 3; i++) {
        const az = fxRand() * Math.PI * 2;
        _n.copy(this.center).multiplyScalar(Math.cos(a)).addScaledVector(_e1, Math.sin(a) * Math.cos(az)).addScaledVector(_e2, Math.sin(a) * Math.sin(az)).normalize();
        const t = this.tileAt(_n);
        const land = !this.planet.isWater(t);
        if (!land && fxRand() < 0.6) continue;
        _b.copy(_n).multiplyScalar(this.R + this.planet.waterHeight + H * env * 0.8);
        this.fx.particles.emit(land ? PRESETS.splash : PRESETS.spray, _b, _n, land ? 3 : 2, land ? 1.6 : 1.1, land ? 1.4 : 1);
      }
    }
    if (a >= this.maxA || s > 40) this.done = true;
  }
  private hit(tiles: number[], H: number, a: number): void {
    const p = this.planet;
    const dmg = this.god.damage();
    if (!dmg) return;
    // run-up: how far inland (tiles) and how high (levels) the surge reaches, fading with distance
    const decay = Math.exp(-a * 0.9);
    const reachTiles = (1.5 + 2.2 * this.k) * decay + 0.5;
    const reachLv = p.seaOffset + Math.max(1, Math.round((1.5 + 1.5 * this.k) * decay + H * 0.15));
    const land = tiles.filter((t) => {
      if (p.isWater(t) || p.elevation[t] > reachLv) return false;
      const d = this.inland.get(t);
      return d !== undefined && d <= reachTiles;
    });
    if (!land.length) return;
    // low buildings are swept away, towers mostly stand (but flood)
    const lost = dmg.wreck(land, { chance: 0.75 * Math.min(1.4, this.k), maxHeight: 2.8 + this.k * 1.5, roads: 0.25, trees: true, report: this.report, rand: () => this.rng.next() });
    dmg.flag(land, TileFlag.Flooded, true, this.report);
    for (let i = 0; i < Math.min(4, land.length); i++) {
      const t = land[Math.floor(fxRand() * land.length)];
      this.fx.particles.emit(PRESETS.splash, this.pos(t, _a, 0.5), this.nrm(t, _n), 6, 2, 1.6);
      if (fxRand() < 0.5) this.fx.debris.burst(this.pos(t, _a, 0.6), this.nrm(t, _n), 3, 5, { color: 0x6a6a72, size: 0.25 }, 1.2);
    }
    if (lost.length && this.hits++ % 3 === 0) {
      this.sfx('splash', 0.9, 0.7);
      this.sfx('crumble', 0.6);
      this.god.shake(0.3, 0.6);
    }
    void a;
  }
  protected override cleanup(): void {
    if (this.drawn && this.planet.seaOffset !== this.sea0) this.ops.setSeaOffset(this.sea0);
  }
}

// ───────────────────────────────────────────────────────────── mega-flood

class FloodEffect extends Effect {
  private sea0 = this.planet.seaOffset;
  private rise = 2 + Math.round(1.5 * this.k);
  private dur = 34 + 6 * this.k;
  private level = 0;
  private deck: Shell & FxObject;
  private center = this.nrm(this.ctx.target.tile, new Vector3());
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.deck = this.own(this.fx.shell(ShellMode.Veil, 32, 140));
    this.deck.setCenter(this.center).range(0, 1.2).colors(0x5a6270, 0x262a32);
    this.deck.u.uR.value = this.R + 16;
    this.deck.u.uAngle.value = 1.2;
    this.frame(ctx.target.tile, 120, 0.95, 2.4);
    this.loop('rain', 0.8);
    this.loop('storm', 0.4);
    this.god.banner('THE DELUGE', 'Sea levels surging worldwide', ctx.def.icon, 0x4aa8ff, 4);
    this.god.news('Weather Service', '@weather', '🌊', 'Forecast: rain, then more rain, then the sea comes to visit. Bring snorkels.');
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.08, 0.15);
    this.deck.u.uIntensity.value = 0.5 * env;
    this.god.want(this.key, { storm: 0.8 * env, clouds: 0.6 * env, sun: 1 - 0.3 * env });
    const drops = Math.round(this.fx.q(12) * env);
    for (let i = 0; i < drops; i++) {
      const t = this.randomTileNear(this.ctx.target.tile, 0.9);
      const n = this.nrm(t, _n);
      this.at(n, 13 + fxRand() * 3, _a);
      this.fx.particles.emitAt(PRESETS.rain, _a.x, _a.y, _a.z, -n.x * 16, -n.y * 16, -n.z * 16);
    }
    // rise, hold, recede
    const want = u < 0.12 ? 0 : u < 0.45 ? Math.ceil(this.rise * smooth(0.12, 0.45, u)) : u < 0.7 ? this.rise : Math.round(this.rise * (1 - smooth(0.7, 0.95, u)));
    if (want !== this.level) {
      const up = want > this.level;
      this.level = want;
      this.ops.setSeaOffset(this.sea0 + want);
      if (up) this.drown();
      else this.recede();
      this.sfx('water', 0.6);
    }
    if (this.t >= this.dur) this.done = true;
  }
  private drown(): void {
    const p = this.planet;
    const dmg = this.god.damage();
    if (!dmg) return;
    const under: number[] = [];
    for (const b of p.buildings.values()) if (p.isWater(b.tile)) under.push(b.tile);
    dmg.wreck(under, { chance: 0.35 * this.k, maxHeight: 3.5, report: this.report, rand: () => this.rng.next() });
    for (let i = 0; i < Math.min(12, under.length); i++) {
      const t = under[Math.floor(fxRand() * under.length)];
      this.fx.particles.emit(PRESETS.bubble, this.pos(t, _a), this.nrm(t, _n), 4, 1);
    }
  }
  private recede(): void {
    const p = this.planet;
    const dmg = this.god.damage();
    // land that just surfaced is soaked
    const wet: number[] = [];
    const top = p.seaOffset + 1 + (this.rise - this.level);
    for (let t = 0; t < p.count; t++) if (!p.isWater(t) && p.elevation[t] < top && p.elevation[t] >= p.seaOffset) wet.push(t);
    dmg?.flag(wet, TileFlag.Flooded, true, this.report, 0.85);
  }
  protected override cleanup(): void {
    if (this.planet.seaOffset !== this.sea0) this.ops.setSeaOffset(this.sea0);
  }
}

// ───────────────────────────────────────────────────────────── continental rift

class RiftEffect extends Effect {
  private path: number[];
  private i = 0;
  private gap = 0.16;
  private lavaTiles: number[] = [];
  private rumble = this.loop('rumble', 0.8);
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.path = ctx.target.path && ctx.target.path.length > 1 ? ctx.target.path : [ctx.target.tile];
    this.god.banner('CONTINENTAL RIFT', 'The crust is tearing open', ctx.def.icon, 0xff6a2a, 3.4);
    this.sfx('quake', 1);
    this.god.shake(0.8, 2);
  }
  step(dt: number): void {
    const n = this.path.length;
    this.progress = clamp01(this.i / n);
    const due = Math.min(n, Math.floor(this.t / this.gap));
    while (this.i < due) this.open(this.i++);
    // lava fountains along the open fissure
    if (this.lavaTiles.length && this.every('fount', 0.06, dt)) {
      const t = this.lavaTiles[Math.floor(fxRand() * this.lavaTiles.length)];
      const up = this.nrm(t, _n);
      this.fx.particles.emit(PRESETS.fire, this.pos(t, _a, 0.1), up, 3, 2.2, 1.1);
      if (fxRand() < 0.5) this.fx.particles.emit(PRESETS.ember, this.pos(t, _a, 0.3), up, 4, 3);
      if (fxRand() < 0.2) this.fx.particles.emit(PRESETS.smoke, this.pos(t, _a, 1), up, 1, 1.2, 1.2);
    }
    const endT = n * this.gap + 10;
    this.rumble.setVolume(this.t < n * this.gap ? 0.9 : 0.9 * (1 - smooth(n * this.gap, endT, this.t)));
    if (this.t > endT) this.done = true;
  }
  private open(k: number): void {
    const p = this.planet;
    const t = this.path[k];
    const dmg = this.god.damage();
    const side = p.grid.neighbors(t);
    if (k > 0) crackAlong(this, [this.path[k - 1], t], 0.9 + 0.3 * this.k, 1, 40);
    if (!p.isWater(t)) {
      dmg?.wreck([t], { chance: 1, fx: 'blast', roads: 1, trees: true, report: this.report, unstoppable: true });
      dmg?.wreck(side, { chance: 0.6 * this.k, fx: 'collapse', roads: 0.6, trees: true, report: this.report, rand: () => this.rng.next() });
      dmg?.raise([t], -2 - Math.round(this.k));
      this.ops.setBiome([t], Biome.Lava);
      this.ops.setBiome(side.filter((s) => !p.isWater(s) && p.biome[s] !== Biome.Lava), Biome.Volcanic);
      dmg?.ignite(side, 0.4, this.report, () => this.rng.next());
      this.lavaTiles.push(t);
      this.fx.blast(this.pos(t, _a, 0.2), this.nrm(t, _n), 1.1, { debris: 6 });
    } else {
      this.fx.particles.emit(PRESETS.steam, this.pos(t, _a), this.nrm(t, _n), 10, 2, 1.5);
    }
    if (k % 3 === 0) {
      this.god.shake(0.55, 0.7);
      this.sfx('crumble', 0.6, 0.8);
    }
  }
}

// ───────────────────────────────────────────────────────────── landslide

class LandslideEffect extends Effect {
  private path: number[] = [];
  private i = 0;
  private dur = 8;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const p = this.planet;
    const g = p.grid;
    // start at the highest ground nearby and run down the steepest descent
    let src = ctx.target.tile;
    for (const t of g.disk(ctx.target.tile, 3)) if (!p.isWater(t) && p.elevation[t] > p.elevation[src]) src = t;
    let cur = src;
    this.path.push(cur);
    let heading = -1;
    for (let i = 0; i < 9 + Math.round(3 * this.k); i++) {
      const nb = g.neighbors(cur).filter((n) => !this.path.includes(n));
      if (!nb.length) break;
      nb.sort((a, b) => p.elevation[a] - p.elevation[b]);
      let next = nb[0];
      if (p.elevation[next] >= p.elevation[cur]) {
        // flat ground: keep sliding the same way
        if (heading < 0) heading = Math.floor(this.rng.next() * g.degree(cur));
        next = g.neighbor(cur, heading % g.degree(cur));
        if (this.path.includes(next)) break;
      }
      this.path.push(next);
      cur = next;
    }
    this.sfx('crumble', 1, 0.6);
    this.sfx('rumble', 0.8);
    this.god.shake(0.4, 1.5);
  }
  step(dt: number): void {
    this.progress = clamp01(this.t / this.dur);
    const due = Math.min(this.path.length, Math.floor(this.t / 0.35) + 1);
    while (this.i < due) this.slide(this.i++);
    if (this.every('roll', 0.05, dt) && this.i < this.path.length + 2) {
      const t = this.path[Math.min(this.path.length - 1, this.i)];
      const up = this.nrm(t, _n);
      this.fx.particles.emit(PRESETS.bigDust, this.pos(t, _a, 0.4), up, 0.8, 1.2, 1.1);
      tangents(up, _e1, _e2);
      _b.copy(up).multiplyScalar(3).addScaledVector(_e1, (fxRand() - 0.5) * 6).addScaledVector(_e2, (fxRand() - 0.5) * 6);
      const P = this.pos(t, _a, 0.8);
      this.fx.debris.spawn(P.x, P.y, P.z, _b.x, _b.y, _b.z, { size: 0.35 + fxRand() * 0.4, color: 0x6a5c4c });
    }
    if (this.t > this.dur) this.done = true;
  }
  private slide(k: number): void {
    const p = this.planet;
    const t = this.path[k];
    const dmg = this.god.damage();
    const strip = [t, ...p.grid.neighbors(t).filter(() => this.rng.next() < 0.4 * this.k)];
    dmg?.wreck(strip, { chance: 0.85 * this.k, fx: 'collapse', roads: 0.8, trees: true, report: this.report, rand: () => this.rng.next() });
    if (p.isWater(t)) return;
    if (k < this.path.length * 0.6) dmg?.raise([t], -1);
    else dmg?.raise([t], 1);
    this.ops.setBiome([t], Biome.Rock);
    if (this.rng.next() < 0.5) this.ops.setFeature([t], Feature.Rocks);
  }
}

// ───────────────────────────────────────────────────────────── definitions

export const EARTH: PowerSpec[] = [
  {
    id: 'earthquake', name: 'Earthquake', icon: 'quake', category: 'earth', targeting: 'tile', tier: 1, danger: 3, cooldown: 40, natural: true,
    description: 'The ground convulses: fissures tear open, towers topple, roads buckle and gas mains ignite. Aftershocks follow.',
    flavor: 'Seismologists rate it "a lot". On a scale of "some" to "a lot".',
    run: (c) => new QuakeEffect(c),
  },
  {
    id: 'volcano', name: 'Volcano', icon: 'volcano', category: 'earth', targeting: 'tile', tier: 3, danger: 4, cooldown: 120, natural: true, color: 0xff6a2a,
    description: 'A mountain bursts from the ground and erupts: ash plume, lava bombs, dirty lightning, and lava rivers that creep downhill — building new land where they reach the sea.',
    flavor: 'Real estate agents are calling it "a feature".',
    run: (c) => new VolcanoEffect(c),
  },
  {
    id: 'sinkhole', name: 'Sinkhole', icon: 'target', category: 'earth', targeting: 'tile', tier: 0, danger: 2, cooldown: 15, natural: true,
    description: 'The ground simply… lets go. Everything on top slides into a deep pit.',
    flavor: 'Structural engineers recommend ground. Preferably the kind that stays.',
    run: (c) => new SinkholeEffect(c),
  },
  {
    id: 'tsunami', name: 'Tsunami', icon: 'tsunami', category: 'earth', targeting: 'tile', tier: 3, danger: 4, cooldown: 120, natural: true, color: 0x4fc4e8,
    description: 'An undersea quake sends a towering wall of water racing out across the ocean. The sea draws back… then the wave hits the coast, sweeping away anything low.',
    flavor: 'When the ocean takes a step back, you take ten.',
    tip: 'Tap the sea (or near a coast)',
    resolve: (c) => {
      const p = c.planet;
      if (!p.spec.hasOcean) {
        notify({ title: 'No ocean to stir', body: 'This world has no sea for a tsunami.', kind: 'info', icon: 'tsunami' });
        return false;
      }
      const sea = openSea(p, c.target.tile, 36);
      const off = sea >= 0 ? offshore(p, sea, 3, 8) : -1;
      if (off < 0) {
        notify({ title: 'Too far from the open sea', body: 'Aim at the ocean or a coastline.', kind: 'info', icon: 'tsunami' });
        return false;
      }
      c.target.tile = off;
      return true;
    },
    run: (c) => new TsunamiEffect(c),
  },
  {
    id: 'megaflood', name: 'Mega-Flood', icon: 'wave', category: 'earth', targeting: 'global', tier: 4, danger: 4, cooldown: 180, natural: true, color: 0x4aa8ff, confirm: true,
    description: 'Biblical rain and a surging sea: sea levels rise worldwide, drowning the lowlands — then, slowly, the waters recede and leave everything soaked.',
    flavor: 'Somebody start building a boat. A big one. Two of everything.',
    resolve: (c) => {
      if (!c.planet.spec.hasOcean) {
        notify({ title: 'No sea to raise', body: 'This world has no ocean to flood with.', kind: 'info', icon: 'wave' });
        return false;
      }
      return true;
    },
    run: (c) => new FloodEffect(c),
  },
  {
    id: 'rift', name: 'Continental Rift', icon: 'volcano', category: 'earth', targeting: 'drag', tier: 5, danger: 4, cooldown: 150, natural: true, color: 0xff5a2a,
    description: 'Draw a line and the crust tears apart along it: a glowing lava fissure, fountains of magma, and everything nearby falling in.',
    flavor: 'Plate tectonics, but in a hurry.',
    tip: 'Drag to draw the fault line',
    run: (c) => new RiftEffect(c),
  },
  {
    id: 'landslide', name: 'Landslide', icon: 'raise', category: 'earth', targeting: 'tile', tier: 1, danger: 2, cooldown: 25, natural: true,
    description: 'A hillside gives way and pours downhill in a roaring river of rock and mud.',
    flavor: 'Gravity always wins. It just likes to make an entrance.',
    run: (c) => new LandslideEffect(c),
  },
];
