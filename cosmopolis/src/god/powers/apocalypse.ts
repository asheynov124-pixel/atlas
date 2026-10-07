/**
 * OWNER: god.
 * Apocalypse powers — planet-ending, always confirmed and covered by Chrono (Rewind Time / Accept fate). Accepting
 * fate always leaves a scarred but playable world:
 *
 *   BLACK HOLE     a singularity forms beside the planet: lensing, accretion disk, tidal stretching, the city
 *                  ripped off as spiralling debris, the planet swallowed… then the hole evaporates in a burst of
 *                  Hawking radiation and what it held re-condenses (the facing hemisphere is gone to ash).
 *   SUPERNOVA      the star swells and detonates behind the planet: blinding flash, a plasma shell washes over the
 *                  world, the dayside burns, the oceans boil, the atmosphere is stripped. A pulsar remains.
 *   PLANET CRACKER an orbital weapon fires a beam into the crust; the planet splits into two halves around a
 *                  glowing molten core, drifts apart… and gravity slams it back together along a seam of lava.
 *   ROGUE PLANET   a wandering world crashes into yours. Global firestorm; from the debris, a new moon.
 *   MOON FALL      the moon spirals in, breaks up at the Roche limit and hits. Its remains become rings.
 *   VACUUM DECAY   a bubble of new physics expands at nearly light speed and rewrites everything into crystal.
 */
import { Group, InstancedMesh, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { Biome, Feature, TileFlag, type MoonSpec, type RingSpec } from '../../core/types';
import { Mat, MeshBuilder } from '../../content/kit';
import type { FxObject } from '../../render/fx/FxLayer';
import { PRESETS, fxRand } from '../../render/fx/particles';
import { ShellMode, type Shell } from '../../render/fx/shells';
import { BlackHole, Bubble, NovaShell, PlanetSplit } from '../../render/fx/cosmic';
import { GlowOrb } from '../../render/fx/sky';
import { kitInstanced, fxMetalMaterial } from '../../render/fx/creatures';
import { BeamStyle, type Beam } from '../../render/fx/beams';
import { InstState } from '../../render/materials';
import type { PlanetView } from '../../render/PlanetView';
import type { BuildingInstance } from '../../world/planet';
import type { Flyer } from '../../render/fx/flyers';
import { Effect, type PowerCtx, type PowerSpec } from '../effect';
import { MoonFx } from './cosmic';
import { clamp01, easeIn, easeOut, envelope, openSea, smooth, sortedByAngle, tangents, tilesToAngle } from './common';

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _n = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _m3 = new Matrix4();
const _inv = new Matrix4();
const _q = new Quaternion();

/** Camera basis in world space: right, up, forward (toward where it looks). */
function cameraBasis(view: PlanetView, right: Vector3, up: Vector3, fwd: Vector3): void {
  const m = view.camera.matrixWorld;
  right.setFromMatrixColumn(m, 0).normalize();
  up.setFromMatrixColumn(m, 1).normalize();
  fwd.setFromMatrixColumn(m, 2).normalize().negate();
}

/** Hide everything on the planet root except the FX layer (restore with the returned function). */
function hideWorld(view: PlanetView): () => void {
  const hidden: Object3D[] = [];
  for (const c of view.root.children) {
    if (c === view.fx.planetGroup || c === view.toolLayer || !c.visible) continue;
    c.visible = false;
    hidden.push(c);
  }
  return () => {
    for (const c of hidden) c.visible = true;
  };
}

/** Reset the planet root transform (black hole / swallow effects move it). */
function resetRoot(view: PlanetView): void {
  const r = view.root;
  r.matrixAutoUpdate = true;
  r.position.set(0, 0, 0);
  r.quaternion.identity();
  r.scale.set(1, 1, 1);
  r.updateMatrix();
  r.updateMatrixWorld(true);
}

/** Destroy a fraction of the buildings on the whole planet, amortised: call `tick()` each frame. */
class Ruin {
  private queue: BuildingInstance[] = [];
  constructor(private e: Effect) {}
  /** queue every building with probability `chance` (resistance ignored) */
  all(chance: number): void {
    for (const b of this.e.planet.buildings.values()) if (this.e.rng.next() < chance) this.queue.push(b);
  }
  tick(n = 30): void {
    const dmg = this.e.god.damage();
    if (!dmg || !this.queue.length) return;
    const batch = this.queue.splice(0, n).filter((b) => this.e.planet.buildings.has(b.id));
    if (batch.length) dmg.wreck(batch.map((b) => b.tile), { chance: 1, fx: 'none', roads: 0.3, trees: true, report: this.e.report, unstoppable: true });
  }
  get pending(): number {
    return this.queue.length;
  }
}

// ───────────────────────────────────────────────────────────── black hole

class BlackHoleEffect extends Effect {
  private bh: BlackHole & FxObject | null = null;
  private bhPos = new Vector3();
  private dir = new Vector3();
  private order: { tiles: Int32Array; angles: Float32Array } | null = null;
  private idx = 0;
  private sub = 0;
  private loopBH = this.loop('blackhole', 0);
  private eaten = 0;
  private stretchM = new Matrix4();
  private rootScale = 1;
  private ruin = new Ruin(this);
  private T = { aim: 2.4, birth: 6, feed: 21.5, swallow: 27.5, hold: 29.5, evap: 31, end: 36 };
  constructor(ctx: PowerCtx) {
    super(ctx);
    // pull back to orbit first; the hole appears once the planet is framed
    this.frame(this.nrm(ctx.target.tile, new Vector3()), this.R * 3.7, 0.02, 2.2);
    this.god.banner('SINGULARITY', 'Gravitational anomaly detected beside the planet', 'blackhole', 0xa77bff, 4.5);
    this.god.news('Observatory', '@skywatch', '🕳️', 'Update on the anomaly: it is a black hole. It is very close. We are going to go and look at it from further away.');
    this.sfx('blackhole', 1);
  }
  private aim(): void {
    const view = this.ctx.view;
    const R = this.R;
    cameraBasis(view, _e1, _e2, _a);
    const portrait = this.ctx.game.engine.height > this.ctx.game.engine.width;
    // above (portrait) or beside (landscape) the planet and well in front of it, overlapping its limb — so the
    // lens visibly bends the planet behind it
    this.dir.copy(portrait ? _e2 : _e1).multiplyScalar(0.6).addScaledVector(portrait ? _e1 : _e2, 0.1).addScaledVector(_a, -0.8).normalize();
    this.bhPos.copy(this.dir).multiplyScalar(R * 1.75);
    this.bh = this.own(
      new BlackHole(this.fx.worldGroup, {
        skyGroup: view.env.skyGroup,
        planetR: R,
        atmo: this.planet.spec.atmosphere.color,
        land: 0x5f8a4a,
      }) as BlackHole & FxObject,
    );
    this.bh.center.copy(this.bhPos);
    this.bh.radius = R * 0.28;
    // a nearly edge-on disk (Gargantua-style): we see a thin bright band across the hole and its lensed far side
    // arching over the top
    this.bh.diskNormal.copy(portrait ? _e2 : _e2).addScaledVector(_a, 0.32).addScaledVector(_e1, 0.12).normalize();
    this.sub = this.planet.grid.tileAt(this.dir.x, this.dir.y, this.dir.z);
    this.order = sortedByAngle(this.planet, this.sub, 1.5);
  }
  step(dt: number): void {
    const T = this.T;
    const view = this.ctx.view;
    const t = this.t;
    this.progress = clamp01(t / T.end);
    if (this.once('aim', T.aim)) this.aim();
    const bh = this.bh;
    if (!bh || !this.order) return;
    const birth = smooth(T.aim, T.birth, t);
    const evap = smooth(T.evap, T.evap + 1.2, t);
    bh.strength = birth * (1 - evap);
    this.loopBH.setVolume(0.9 * bh.strength);
    const feed = smooth(T.birth, T.feed, t) * (1 - smooth(T.hold, T.evap, t));
    this.god.want(this.key, { dread: 0.7 * birth * (1 - evap), apocalypse: 0.25 * feed, sun: 1 - 0.3 * feed });
    if (t < T.feed && this.every('shake', 0.6, dt)) this.god.shake(0.15 + 0.4 * feed, 0.8);
    // tidal stretch toward the hole: S = (1 − 0.35k)·I + 1.35k·d·dᵀ
    const k = 0.22 * feed;
    const d = this.dir;
    const a = 1 - 0.35 * k, b2 = k * 1.35;
    this.stretchM.set(
      a + b2 * d.x * d.x, b2 * d.x * d.y, b2 * d.x * d.z, 0,
      b2 * d.y * d.x, a + b2 * d.y * d.y, b2 * d.y * d.z, 0,
      b2 * d.z * d.x, b2 * d.z * d.y, a + b2 * d.z * d.z, 0,
      0, 0, 0, 1,
    );
    // …then the swallow, and after the evaporation the world re-condenses
    const sw = easeIn(smooth(T.feed + 0.5, T.swallow, t));
    const recon = easeOut(smooth(T.evap + 0.4, T.evap + 3.4, t));
    const root = view.root;
    root.matrixAutoUpdate = false;
    if (t < T.evap) {
      this.rootScale = Math.max(0.001, 1 - sw * 0.995);
      _m2.makeTranslation(this.bhPos.x * sw, this.bhPos.y * sw, this.bhPos.z * sw);
      _m3.makeScale(this.rootScale, this.rootScale, this.rootScale);
      root.matrix.copy(_m2).multiply(_m3).multiply(this.stretchM);
    } else {
      this.rootScale = Math.max(0.001, recon);
      root.matrix.makeScale(this.rootScale, this.rootScale, this.rootScale);
    }
    root.updateMatrixWorld(true);
    // the near side is torn off, building by building
    if (t > T.birth && t < T.feed) {
      const reach = 1.45 * smooth(T.birth, T.feed - 1, t);
      const batch: number[] = [];
      while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= reach && batch.length < 120) batch.push(this.order.tiles[this.idx++]);
      if (batch.length) this.tear(batch);
      // atmosphere and dust stream off the limb into the disk
      if (this.every('stream', 0.03, dt)) {
        for (let i = 0; i < 3; i++) {
          const tl = this.order.tiles[Math.floor(fxRand() * Math.max(1, this.idx))] ?? this.sub;
          const p = this.pos(tl, _a, 1 + fxRand() * 4);
          _b.subVectors(this.toPlanet(this.bhPos, _c), p).normalize().multiplyScalar(14 + fxRand() * 10);
          this.fx.particles.emitAt(i === 0 ? PRESETS.void : PRESETS.aurora, p.x, p.y, p.z, _b.x, _b.y, _b.z, 1.6, 1.4);
        }
      }
      if (!this.fx.debris.attractor) this.fx.debris.attractor = new Vector3();
      this.toPlanet(this.bhPos, this.fx.debris.attractor);
      this.fx.debris.attractorStrength = 40 * feed;
    }
    if (this.once('swallow', T.feed + 0.5)) {
      this.god.banner('EVENT HORIZON', 'Nothing escapes. Not even your city.', 'blackhole', 0x7a5aff, 3.5);
      this.sfx('blackhole', 1, 0.6);
      this.ruin.all(0.7);
    }
    if (this.once('flare', T.swallow)) {
      this.god.flash(0xe8d8ff, 4, 1.4, 0.7);
      this.god.shake(2.2, 2);
      this.sfx('bigExplosion', 0.8, 0.5);
    }
    if (this.once('evap', T.evap)) {
      this.god.flash(0xffffff, 8, 2.4, 1);
      this.sfx('supernova', 1, 1.3);
      this.god.banner('HAWKING RADIATION', 'The singularity evaporates. Something remains.', 'sparkles', 0xffffff, 4);
      this.aftermath();
    }
    this.ruin.tick();
    if (t >= T.end) this.done = true;
  }
  /** planet-space position of a world point (root may be transformed) */
  private toPlanet(w: Vector3, out: Vector3): Vector3 {
    return out.copy(w).applyMatrix4(_inv.copy(this.ctx.view.root.matrixWorld).invert());
  }
  private tear(tiles: number[]): void {
    const dmg = this.god.damage();
    if (!dmg) return;
    const hole = this.bhPos;
    dmg.wreck(tiles, {
      chance: 0.85,
      fx: 'none',
      rubble: false,
      roads: 0.7,
      trees: true,
      unstoppable: true,
      report: this.report,
      launch: (b, m) => {
        if (this.eaten++ % 2) return;
        const f = this.fx.flyers.launch(b, m, (fl: Flyer, dt: number) => this.spiral(fl, dt, hole));
        if (f) {
          f.data[0] = fxRand() * 6.28;
          f.data[1] = 0;
        }
      },
    });
    for (let i = 0; i < Math.min(4, tiles.length); i++) {
      const t = tiles[Math.floor(fxRand() * tiles.length)];
      const p = this.pos(t, _a, 0.3);
      _b.subVectors(this.toPlanet(hole, _c), p).normalize();
      this.fx.debris.spawn(p.x, p.y, p.z, _b.x * 12, _b.y * 12, _b.z * 12, { size: 0.4 + fxRand() * 0.8, color: 0x5a4e46, free: true, life: 6 });
    }
    const land = tiles.filter((t) => !this.planet.isWater(t));
    if (land.length) {
      this.ops.setBiome(land.filter(() => this.rng.next() < 0.6), Biome.Ash);
      this.ops.setFeature(land.filter((t) => this.planet.building[t] < 0 && this.rng.next() < 0.1), Feature.Crater);
    }
  }
  /** A building spiralling into the hole, spaghettified on the way. */
  private spiral(f: Flyer, dt: number, hole: Vector3): boolean {
    const target = this.toPlanet(hole, _c);
    _a.subVectors(target, f.pos);
    const dist = _a.length();
    _a.divideScalar(Math.max(1e-3, dist));
    f.data[1] += dt;
    const speed = 6 + f.data[1] * 10 + 260 / Math.max(4, dist);
    // swirl around the disk axis while falling in
    if (!this.bh) return false;
    _b.crossVectors(this.bh.diskNormal, _a).normalize();
    f.pos.addScaledVector(_a, speed * dt * 0.8).addScaledVector(_b, speed * dt * 0.6);
    _q.setFromAxisAngle(_b, dt * 2);
    f.quat.premultiply(_q);
    const s = Math.min(1, dist / (this.R * 0.9));
    f.scale.set(0.35 + 0.65 * s, 0.35 + 0.65 * s + (1 - s) * 2.5, 0.35 + 0.65 * s);
    if (dist < this.bh.radius * 1.3) {
      this.fx.particles.emit(PRESETS.plasma, f.pos, _a, 4, 1, 1.5);
      return false;
    }
    return f.age < 14;
  }
  private aftermath(): void {
    const p = this.planet;
    const near = [...(this.order?.tiles ?? [])].filter((t) => !p.isWater(t));
    this.god.damage()?.flag(near.filter(() => this.rng.next() < 0.5), TileFlag.Scorched, true, this.report);
    this.ops.setFlags(near.filter(() => this.rng.next() < 0.3), TileFlag.Irradiated, true);
    this.fx.debris.attractor = null;
    this.fx.debris.attractorStrength = 0;
  }
  protected override cleanup(): void {
    resetRoot(this.ctx.view);
    this.fx.debris.attractor = null;
    this.fx.debris.attractorStrength = 0;
  }
}

// ───────────────────────────────────────────────────────────── supernova

class SupernovaEffect extends Effect {
  private novaDir = new Vector3();
  private novaPos = new Vector3();
  private star: GlowOrb & FxObject | null = null;
  private corona: GlowOrb & FxObject | null = null;
  private shell: NovaShell & FxObject | null = null;
  private fire: Shell & FxObject | null = null;
  private glow: Shell & FxObject | null = null;
  private order: { tiles: Int32Array; angles: Float32Array } | null = null;
  private idx = 0;
  private hitT = -1;
  private D = 0;
  private T = { aim: 2.6, swell: 5.2, end: 34 };
  private sea0 = this.planet.seaOffset;
  private boiled = 0;
  private rumble = this.loop('rumble', 0.4);
  constructor(ctx: PowerCtx) {
    super(ctx);
    // fly out to orbit, looking at the planet against the sky
    this.frame(this.nrm(ctx.target.tile, new Vector3()), this.R * 3.3, 0.05, 2.4);
    this.god.banner('THE STAR IS DYING', 'Core collapse imminent', 'sun', 0xffd36b, 3);
    this.sfx('alarm', 0.6);
    this.god.news('Observatory', '@skywatch', '☀️', 'The sun is doing something it has never done before. We would like everyone to stay calm and also maybe look away.');
  }
  step(dt: number): void {
    const t = this.t, T = this.T;
    this.progress = clamp01(t / T.end);
    if (this.once('aim', T.aim)) this.aim();
    if (t < T.swell) {
      // the sun brightens and pulses
      const s = smooth(0, T.swell, t);
      this.god.want(this.key, { sun: 1 + 1.5 * s + Math.sin(t * 8) * 0.2 * s, dread: 0.4 * s });
      if (this.star) {
        const u = smooth(T.aim, T.swell, t);
        this.star.intensity = 0.6 + 2 * u;
        this.star.mesh.scale.setScalar(this.R * (1 + 1.6 * u));
        this.corona!.intensity = 0.3 + u;
        this.corona!.mesh.scale.setScalar(this.R * (3 + 4 * u));
      }
      return;
    }
    if (this.once('boom', T.swell)) this.detonate();
    const s = t - T.swell;
    // the shell races out from the star
    if (this.shell) {
      const r = (this.D + this.R * 2) * easeOut(clamp01(s / 7.5));
      this.shell.mesh.scale.setScalar(Math.max(0.01, r));
      this.shell.intensity = 1.6 * (1 - smooth(9, 16, s));
      if (this.hitT < 0 && r >= this.D - this.R) this.hit();
    }
    if (this.star) {
      this.star.intensity = 4 * Math.exp(-s * 0.35) + 0.4;
      this.corona!.intensity = 2.5 * Math.exp(-s * 0.25);
      this.corona!.mesh.scale.setScalar(this.R * (7 + s * 3));
    }
    const after = this.hitT >= 0 ? t - this.hitT : -1;
    const burn = after >= 0 ? envelope(after / 20, 0.02, 0.55) : 0;
    this.god.want(this.key, { sun: 1 + 3 * Math.exp(-s * 0.5), apocalypse: 0.6 * burn, dread: 0.5 * burn + 0.3 * Math.exp(-s * 0.3), clouds: 0 });
    this.rumble.setVolume(0.4 + 0.5 * burn);
    if (after >= 0 && this.order) {
      const front = Math.min(1.85, 1.85 * smooth(0, 3.5, after));
      if (this.fire) {
        this.fire.range(0, front);
        this.fire.u.uAngle.value = front;
        this.fire.u.uIntensity.value = 1.1 * burn;
      }
      if (this.glow) {
        this.glow.range(0, front);
        this.glow.u.uAngle.value = front;
        this.glow.u.uIntensity.value = 0.5 * burn;
      }
      const batch: number[] = [];
      while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= front && batch.length < 160) batch.push(this.order.tiles[this.idx++]);
      if (batch.length) this.scorch(batch, front);
      // the atmosphere is blown off the night side
      if (after < 12 && this.every('strip', 0.03, dt)) {
        tangents(this.novaDir, _e1, _e2);
        for (let i = 0; i < 2; i++) {
          const az = fxRand() * Math.PI * 2;
          _a.copy(_e1).multiplyScalar(Math.cos(az)).addScaledVector(_e2, Math.sin(az)).multiplyScalar(this.R * 1.03).addScaledVector(this.novaDir, -this.R * 0.2 * fxRand());
          _b.copy(this.novaDir).multiplyScalar(-26).addScaledVector(_a, 0.05);
          this.fx.particles.emitAt(PRESETS.aurora, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z, 3, 1.6);
          if (fxRand() < 0.5) this.fx.particles.emitAt(PRESETS.steam, _a.x, _a.y, _a.z, _b.x * 0.7, _b.y * 0.7, _b.z * 0.7, 3, 1.4);
        }
      }
      // oceans boil
      if (this.planet.spec.hasOcean && this.boiled < 2 && after > 3 + this.boiled * 3) {
        this.boiled++;
        this.ops.setSeaOffset(this.sea0 - this.boiled);
      }
    }
    if (t >= T.end) this.done = true;
  }
  private aim(): void {
    const view = this.ctx.view;
    cameraBasis(view, _e1, _e2, _a);
    const portrait = this.ctx.game.engine.height > this.ctx.game.engine.width;
    // the star sits just behind the planet's limb — an eclipse composition
    this.novaDir.copy(_a).addScaledVector(portrait ? _e2 : _e1, portrait ? 0.34 : 0.42).normalize();
    this.D = this.R * 26;
    this.novaPos.copy(this.novaDir).multiplyScalar(this.D);
    this.star = this.own(new GlowOrb(this.fx.worldGroup, this.R, 0xffe2a0, 0xffffff, 1.2, 0.6) as GlowOrb & FxObject);
    this.star.position.copy(this.novaPos);
    this.corona = this.own(new GlowOrb(this.fx.worldGroup, this.R * 3, 0xff9a4a, 0xfff0c0, 3.2, 0.3) as GlowOrb & FxObject);
    this.corona.position.copy(this.novaPos);
    this.order = sortedByAngle(this.planet, this.planet.grid.tileAt(this.novaDir.x, this.novaDir.y, this.novaDir.z), 1.9);
  }
  private detonate(): void {
    this.god.flash(0xffffff, 12, 3, 1);
    this.god.shake(0.8, 3);
    this.sfx('supernova', 1);
    this.sfx('bigExplosion', 0.7, 0.4);
    this.god.banner('SUPERNOVA', 'Brighter than a billion suns. For a while.', 'sun', 0xffffff, 4.2);
    if (!this.star) this.aim();
    this.shell = this.own(new NovaShell(this.fx.worldGroup) as NovaShell & FxObject);
    this.shell.mesh.position.copy(this.novaPos);
    this.shell.mesh.scale.setScalar(0.01);
  }
  private hit(): void {
    this.hitT = this.t;
    // swing round to watch the dayside burn
    cameraBasis(this.ctx.view, _e1, _e2, _a);
    const view = _b.copy(this.novaDir).lerp(_c.copy(_a).negate(), 0.55).normalize();
    this.frame(view, this.R * 2.9, 0.2, 3.2);
    this.god.flash(0xffe0b0, 6, 2, 0.8);
    this.god.shake(2.4, 4);
    this.sfx('bigExplosion', 1, 0.6);
    this.sfx('fire', 1);
    const c = this.novaDir;
    this.fire = this.own(this.fx.shell(ShellMode.Fire, 48, 256));
    this.fire.setCenter(c).colors(0xffd36a, 0xd42400);
    this.fire.u.uR.value = this.R + 1.2;
    this.glow = this.own(this.fx.shell(ShellMode.Glow, 32, 192));
    this.glow.setCenter(c).colors(0xff8a3a, 0xffd36a);
    this.glow.u.uR.value = this.R + 3;
    try {
      const atmo = this.planet.spec.atmosphere;
      atmo.density = Math.max(0.05, atmo.density * 0.3);
      atmo.breathable = false;
      this.ctx.view.surface.atmosphere.setDensity(atmo.density);
    } catch {
      /* optional */
    }
    this.god.news('Hypernet', '@hypernet', '🔥', 'the sky is on fire. the sea is boiling. my sunscreen says SPF 50. i do not think it is enough.');
  }
  private scorch(tiles: number[], front: number): void {
    const p = this.planet;
    const dmg = this.god.damage();
    if (!dmg) return;
    const near = front < 1.1;
    const land = tiles.filter((t) => !p.isWater(t));
    dmg.wreck(tiles, { chance: near ? 0.95 : 0.55, fx: this.rng.next() < 0.15 ? 'blast' : 'none', roads: 0.4, trees: true, report: this.report, unstoppable: true, rand: () => this.rng.next() });
    dmg.ignite(land, 0.25, this.report, () => this.rng.next());
    dmg.flag(land, TileFlag.Scorched, true);
    const ash = land.filter(() => this.rng.next() < (near ? 0.8 : 0.45));
    if (ash.length) this.ops.setBiome(ash, Biome.Ash);
    const glass = land.filter((t) => p.biome[t] === Biome.Desert || p.biome[t] === Biome.Beach);
    if (glass.length && near) this.ops.setBiome(glass, Biome.Volcanic);
    for (let i = 0; i < Math.min(5, land.length); i++) {
      const t = land[Math.floor(fxRand() * land.length)];
      this.fx.particles.emit(PRESETS.bigFire, this.pos(t, _a), this.nrm(t, _n), 1, 1.2, 1.2);
    }
  }
  protected override cleanup(): void {
    const st = this.god.state(this.planet);
    st.star = 'neutron';
    try {
      this.ctx.view.env.setStar('neutron');
    } catch {
      /* optional */
    }
    if (this.planet.seaOffset !== this.sea0 - this.boiled) this.ops.setSeaOffset(this.sea0 - this.boiled);
  }
}

// ───────────────────────────────────────────────────────────── planet cracker

function crackerGeometry(): ReturnType<MeshBuilder['build']> {
  const b = new MeshBuilder(0);
  b.sphere(1, { color: 0x8a929e, mat: Mat.Metal, wSeg: 28, hSeg: 18 });
  b.torus(1.0, 0.05, { color: 0x2a2f38, mat: Mat.Metal, seg: 48, tube: 6, rx: Math.PI / 2 });
  for (let i = 0; i < 5; i++) b.torus(0.95 - i * 0.12, 0.012, { color: 0xffc46a, mat: Mat.Light, seg: 40, tube: 3, rx: Math.PI / 2, y: 0.25 + i * 0.1 });
  // the superlaser dish
  b.dome(0.32, { color: 0x3a414c, mat: Mat.Metal, wSeg: 18, hSeg: 6, rx: Math.PI / 2, z: 0.86, sy: 0.3 });
  b.sphere(0.09, { color: 0x9aff7a, mat: Mat.Glow, z: 0.93, wSeg: 10, hSeg: 6 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.cyl(0.012, 0.012, 0.25, { color: 0x9aff7a, mat: Mat.Glow, x: Math.cos(a) * 0.22, y: Math.sin(a) * 0.22, z: 0.92, rx: Math.PI / 2 - 0.5 * 1, seg: 4 });
  }
  return b.build();
}

class CrackerEffect extends Effect {
  private station: InstancedMesh;
  private stationGroup = new Group();
  private geo = crackerGeometry();
  private stPos = new Vector3();
  private hitDir = new Vector3();
  private normal = new Vector3();
  private beamA: Beam | null = null;
  private split: PlanetSplit & FxObject | null = null;
  private unhide: (() => void) | null = null;
  private ring: Shell & FxObject | null = null;
  private seam: number[] = [];
  private seamDrawn = 0;
  private aimed = false;
  private T = { aim: 2.4, charge: 5.9, split: 10.9, apart: 17.4, drift: 22.4, crash: 27.4, end: 34 };
  private ruin = new Ruin(this);
  private rumble = this.loop('rumble', 0.3);
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.station = kitInstanced(this.geo, 1, InstState.Normal, fxMetalMaterial());
    this.stationGroup.add(this.station);
    this.stationGroup.visible = false;
    this.fx.worldGroup.add(this.stationGroup);
    this.frame(this.nrm(ctx.target.tile, new Vector3()), this.R * 3.3, 0.02, 2.2);
    this.god.banner('PLANET CRACKER', 'Orbital superweapon moving into position', 'target', 0x9aff7a, 3.6);
    this.sfx('alarm', 0.7);
    this.god.news('Ministry of Peace', '@peace', '🛰️', 'The new "planetary maintenance platform" is undergoing a routine test. Please hold on to something. Anything.');
  }
  private aim(): void {
    const view = this.ctx.view;
    cameraBasis(view, _e1, _e2, _a);
    const portrait = this.ctx.game.engine.height > this.ctx.game.engine.width;
    // the station hangs beside the planet; the beam hits the limb facing it
    this.hitDir.copy(portrait ? _e2 : _e1).addScaledVector(_a, -0.35).normalize();
    this.stPos.copy(this.hitDir).multiplyScalar(this.R * (portrait ? 1.75 : 2.1)).addScaledVector(_a, -this.R * 0.5);
    // the cut plane contains the beam; tilted ~25° toward us so one molten face shows
    const n0 = _b.crossVectors(this.hitDir, _a).normalize();
    const w = _c.copy(this.hitDir).multiplyScalar(this.hitDir.dot(_a)).sub(_a).normalize();
    this.normal.copy(n0).multiplyScalar(Math.cos(0.45)).addScaledVector(w, Math.sin(0.45)).normalize();
    this.stationGroup.position.copy(this.stPos);
    this.stationGroup.scale.setScalar(this.R * 0.16);
    this.stationGroup.lookAt(0, 0, 0);
    this.stationGroup.visible = true;
    this.fx.particles.emit(PRESETS.flash, this.stPos, this.hitDir, 1, 0, 8);
    this.sfx('warp', 0.8, 0.6);
    // tiles along the great circle of the cut
    const g = this.planet.grid;
    tangents(this.normal, _e1, _e2);
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const d = _b.copy(_e1).multiplyScalar(Math.cos(a)).addScaledVector(_e2, Math.sin(a));
      const t = g.tileAt(d.x, d.y, d.z);
      if (this.seam[this.seam.length - 1] !== t) this.seam.push(t);
    }
    // start the seam at the impact point
    let best = 0, bd = -1;
    this.seam.forEach((t, i) => {
      const dd = this.nrm(t, _c).dot(this.hitDir);
      if (dd > bd) {
        bd = dd;
        best = i;
      }
    });
    this.seam = [...this.seam.slice(best), ...this.seam.slice(0, best)];
    this.aimed = true;
  }
  step(dt: number): void {
    const t = this.t, T = this.T;
    this.progress = clamp01(t / T.end);
    if (this.once('aim', T.aim)) this.aim();
    if (!this.aimed) return;
    const dish = _a.copy(this.stPos).addScaledVector(this.hitDir, -this.R * 0.16);
    const hit = _b.copy(this.hitDir).multiplyScalar(this.R + 0.5);
    // 1 · charge: energy converges on the dish
    if (t < T.charge + 0.5 && this.every('charge', 0.03, dt)) {
      _c.set(fxRand() - 0.5, fxRand() - 0.5, fxRand() - 0.5).normalize();
      const from = _n.copy(dish).addScaledVector(_c, this.R * 0.25);
      const v = _c.multiplyScalar(-this.R * 0.25 * 1.4);
      this.fx.particles.emitAt(PRESETS.toxicGlow, from.x, from.y, from.z, v.x, v.y, v.z, 4, 0.7);
    }
    // 2 · fire
    if (t >= T.charge && t < T.split) {
      if (!this.beamA) {
        this.beamA = this.beam();
        this.beamA.u.uCore.value.setHex(0xffffff);
        this.god.flash(0xc8ffb0, 3, 0.8, 0.5);
        this.sfx('laser', 1, 0.35);
        this.sfx('bigExplosion', 0.8, 0.6);
        this.ring = this.own(this.fx.shell(ShellMode.Ring, 32, 256));
        this.ring.setCenter(this.hitDir).colors(0xe8ffd8, 0x9aff7a);
        this.ring.u.uR.value = this.R + 1;
        this.ring.u.uWidth.value = 0.05;
      }
      const u = smooth(T.charge, T.charge + 0.6, t);
      this.beamA.set(dish, hit, this.R * 0.07 * (0.4 + 0.6 * u), 0x9aff7a, 2.5, BeamStyle.Spiral);
      this.fx.particles.emit(PRESETS.bigFire, hit, this.hitDir, 3, 3, 2.5);
      this.fx.particles.emit(PRESETS.toxicGlow, hit, this.hitDir, 6, 4, 2);
      this.god.shake(0.5 + u, 0.4);
      const ra = Math.PI * smooth(T.charge, T.split, t);
      this.ring!.range(Math.max(0, ra - 0.15), ra + 0.03);
      this.ring!.u.uAngle.value = ra;
      this.ring!.u.uIntensity.value = 1.5;
      // the seam glows around the globe ahead of the split
      const want = Math.floor(this.seam.length * smooth(T.charge + 0.5, T.split, t));
      if (want > this.seamDrawn + 2) {
        const pts = this.seam.slice(Math.max(0, this.seamDrawn - 1), want).map((tl) => this.pos(tl, new Vector3()));
        this.fx.cracks.add(pts, 1.4, 1, 60, 0.4);
        this.seamDrawn = want;
      }
      this.rumble.setVolume(0.9);
    }
    // 3 · split
    if (this.once('split', T.split)) this.doSplit();
    if (this.split) {
      const apart = easeOut(smooth(T.split, T.apart, t));
      const back = easeIn(smooth(T.drift, T.crash, t));
      this.split.separation = this.R * 0.06 * apart * (1 - back);
      this.split.hinge = 0.5 * apart * (1 - back);
      this.split.heat = 1 - 0.3 * smooth(T.apart, T.drift, t) + 0.3 * back;
      this.god.want(this.key, { dread: 0.6 * (1 - back * 0.5), apocalypse: 0.3 });
      if (t < T.crash && this.every('spray', 0.04, dt)) {
        // magma and seawater spray out of the cut
        const sep = this.split.separation;
        tangents(this.normal, _e1, _e2);
        const a = fxRand() * Math.PI * 2;
        const r = this.R * Math.sqrt(fxRand()) * 0.95;
        _a.copy(_e1).multiplyScalar(Math.cos(a) * r).addScaledVector(_e2, Math.sin(a) * r);
        const sgn = fxRand() < 0.5 ? 1 : -1;
        _a.addScaledVector(this.normal, sgn * sep * 0.98);
        _b.copy(this.normal).multiplyScalar(-sgn * 6).addScaledVector(_a, 0.02);
        this.fx.particles.emitAt(r > this.R * 0.85 ? PRESETS.steam : PRESETS.ember, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z, r > this.R * 0.85 ? 3 : 6, 1.5);
        if (fxRand() < 0.25) this.fx.debris.spawn(_a.x, _a.y, _a.z, _b.x * 1.5 + (fxRand() - 0.5) * 6, _b.y * 1.5 + (fxRand() - 0.5) * 6, _b.z * 1.5 + (fxRand() - 0.5) * 6, { size: 0.8 + fxRand() * 1.5, color: 0x4a3a32, free: true, state: InstState.Burning, life: 10 });
      }
    }
    if (this.once('crash', T.crash)) this.crash();
    this.ruin.tick(40);
    if (t >= T.end) this.done = true;
  }
  private doSplit(): void {
    this.releaseBeam(this.beamA);
    this.beamA = null;
    const view = this.ctx.view;
    const merged = view.surface.buildMergedGeometry();
    this.god.flash(0xffe8c0, 5, 1.5, 0.85);
    this.god.shake(2.5, 3);
    this.sfx('bigExplosion', 1, 0.45);
    this.sfx('quake', 1);
    this.god.banner('THE WORLD BREAKS', 'Two halves and a molten heart', 'explosion', 0xff7a3a, 3.6);
    this.ruin.all(0.55);
    if (!merged) return;
    this.unhide = hideWorld(view);
    this.split = this.own(new PlanetSplit(this.fx.planetGroup, merged, view.surface.terrainMaterial, this.normal, this.R) as PlanetSplit & FxObject);
    // swing open toward the camera: hinge axis ⊥ (camera direction projected into the cut plane)
    cameraBasis(view, _e1, _e2, _a);
    const toCam = _b.copy(_a).negate().addScaledVector(this.normal, _a.dot(this.normal)).normalize();
    this.split.axis.crossVectors(this.normal, toCam).normalize();
  }
  private crash(): void {
    this.god.flash(0xffd0a0, 6, 2, 0.9);
    this.god.shake(3, 4);
    this.sfx('bigExplosion', 1, 0.5);
    this.sfx('rumble', 1, 0.6);
    if (this.split) {
      this.drop(this.split);
      this.split = null;
    }
    this.unhide?.();
    this.unhide = null;
    // the seam becomes a ring of lava around the world
    const g = this.planet.grid;
    const band = new Set<number>();
    for (const t of this.seam) for (const n of g.disk(t, 1)) band.add(n);
    const list = [...band];
    const dmg = this.god.damage();
    dmg?.wreck(list, { chance: 1, fx: 'none', roads: 1, trees: true, report: this.report, unstoppable: true });
    const land = list.filter((t) => !this.planet.isWater(t));
    this.ops.setBiome(land, Biome.Lava);
    this.ops.setBiome(list.filter((t) => this.planet.isWater(t)), Biome.Volcanic);
    dmg?.ignite(g.disk(this.seam[0], 6).filter((t) => !band.has(t)), 0.3, this.report);
    this.fx.cracks.add(this.seam.map((t) => this.pos(t, new Vector3())), 1.8, 1, 90, 0.3);
    this.god.news('Hypernet', '@hypernet', '🌍', 'the planet broke in half and then un-broke. i have so many questions and nobody is answering them.');
  }
  protected override cleanup(): void {
    this.unhide?.();
    this.stationGroup.removeFromParent();
    this.station.dispose();
    this.geo.dispose();
  }
}

// ───────────────────────────────────────────────────────────── rogue planet & moon fall

/** Big impact + global consequences shared by the rogue planet and the moon fall. */
function megaImpact(e: Effect, tile: number, size: number): { ring: Shell & FxObject; fire: Shell & FxObject; veil: Shell & FxObject } {
  const p = e.planet;
  const n = e.nrm(tile, new Vector3());
  const P = e.pos(tile, new Vector3());
  e.fx.blast(P, n, 10 * size, { debris: 40 });
  e.god.flash(0xffffff, 12, 3, 1);
  e.god.shake(3.5, 6);
  e.sfx('bigExplosion', 1, 0.45);
  e.sfx('quake', 1, 0.7);
  e.sfx('rumble', 1, 0.6);
  const dmg = e.god.damage();
  const r = Math.round(4 + 3 * size);
  dmg?.crater(tile, r, 5 + Math.round(4 * size), Biome.Crater);
  const core = p.grid.disk(tile, Math.round(r * 0.6));
  e.ops.setBiome(core.filter((t) => !p.isWater(t)), Biome.Lava);
  const ring = e.fx.shell(ShellMode.Ring, 40, 256);
  ring.setCenter(n).colors(0xfff2d0, 0xff7a3a);
  ring.u.uR.value = e.R + 1.5;
  ring.u.uWidth.value = 0.06;
  const fire = e.fx.shell(ShellMode.Fire, 48, 256);
  fire.setCenter(n).colors(0xffd36a, 0xd42400);
  fire.u.uR.value = e.R + 1.0;
  const veil = e.fx.shell(ShellMode.Veil, 48, 220);
  veil.setCenter(n).colors(0x4a3e36, 0x16110e);
  veil.u.uR.value = e.R + 14;
  return { ring: e.own(ring), fire: e.own(fire), veil: e.own(veil) };
}

class ImpactAftermath {
  private order: { tiles: Int32Array; angles: Float32Array };
  private idx = 0;
  constructor(private e: Effect, private tile: number, private shells: ReturnType<typeof megaImpact>, private reach = Math.PI) {
    this.order = sortedByAngle(e.planet, tile, reach);
  }
  /** s = seconds since impact */
  step(s: number): void {
    const e = this.e;
    const front = this.reach * (1 - Math.exp(-s / 3.4));
    const { ring, fire, veil } = this.shells;
    ring.range(Math.max(0, front - 0.22), Math.min(Math.PI, front + 0.05));
    ring.u.uAngle.value = front;
    ring.u.uIntensity.value = 2 * (1 - smooth(5, 16, s));
    fire.range(0, front);
    fire.u.uAngle.value = front;
    fire.u.uIntensity.value = envelope(s / 30, 0.02, 0.6);
    const cover = Math.min(Math.PI, 0.4 + s * 0.25);
    veil.range(0, cover);
    veil.u.uAngle.value = cover;
    veil.u.uIntensity.value = 0.95 * envelope(s / 34, 0.12, 0.4);
    const winter = envelope(s / 34, 0.06, 0.45);
    e.god.want(e.key, { sun: 1 - 0.65 * winter, clouds: 0.2 * winter, storm: 0.85 * winter, apocalypse: 0.7 * winter, dread: 0.5 * winter, lights: 1 });
    const batch: number[] = [];
    while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= front && batch.length < 150) batch.push(this.order.tiles[this.idx++]);
    if (!batch.length) return;
    const dmg = e.god.damage();
    if (!dmg) return;
    const p = e.planet;
    const near = this.order.angles[this.idx - 1] < 0.9;
    dmg.wreck(batch, { chance: near ? 1 : 0.45, fx: e.rng.next() < 0.1 ? 'blast' : 'none', roads: near ? 0.8 : 0.2, trees: true, unstoppable: true, report: e.report, rand: () => e.rng.next() });
    const land = batch.filter((t) => !p.isWater(t));
    dmg.ignite(land, near ? 0.35 : 0.12, e.report, () => e.rng.next());
    dmg.flag(land.filter(() => e.rng.next() < (near ? 0.9 : 0.4)), TileFlag.Scorched, true);
    const ash = land.filter(() => e.rng.next() < (near ? 0.7 : 0.25));
    if (ash.length) e.ops.setBiome(ash, Biome.Ash);
    for (let i = 0; i < Math.min(4, land.length); i++) {
      const t = land[Math.floor(fxRand() * land.length)];
      e.fx.particles.emit(PRESETS.bigFire, e.pos(t, _a), e.nrm(t, _n), 1, 1.2, 1.3);
    }
    void this.tile;
  }
}

/**
 * An approach path that stays on screen: from high behind the planet, over the upper limb, down onto the upper
 * visible face. Computed from the camera basis once the framing flight has finished.
 */
class Approach {
  readonly start = new Vector3();
  readonly ctrl = new Vector3();
  readonly end = new Vector3();
  readonly impactDir = new Vector3();
  /** contactR: distance from the planet centre at impact, in world units */
  aim(view: PlanetView, R: number, contactR: number, far: number, side: number): void {
    cameraBasis(view, _e1, _e2, _a);
    this.impactDir.copy(_a).multiplyScalar(-0.8).addScaledVector(_e2, 0.5).addScaledVector(_e1, 0.15 * side).normalize();
    this.end.copy(this.impactDir).multiplyScalar(contactR);
    this.start.copy(_e1).multiplyScalar(0.5 * side * R).addScaledVector(_e2, 1.7 * R).addScaledVector(_a, 2.4 * R).multiplyScalar(far);
    this.ctrl.copy(_e1).multiplyScalar(0.48 * side * R).addScaledVector(_e2, 1.62 * R).addScaledVector(_a, 0.1 * R);
  }
  /** quadratic Bézier position at u ∈ [0,1] */
  at(u: number, out: Vector3): Vector3 {
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    return out.set(
      a * this.start.x + b * this.ctrl.x + c * this.end.x,
      a * this.start.y + b * this.ctrl.y + c * this.end.y,
      a * this.start.z + b * this.ctrl.z + c * this.end.z,
    );
  }
}

class RogueEffect extends Effect {
  private body: MoonFx | null = null;
  private spec: MoonSpec;
  private path = new Approach();
  private impactTile = -1;
  private T = { aim: 2.4, arrive: 13, end: 38 };
  private after: ImpactAftermath | null = null;
  private newMoon: MoonFx | null = null;
  private newSpec: MoonSpec;
  private rumble = this.loop('rumble', 0.2);
  constructor(ctx: PowerCtx) {
    super(ctx);
    // pull back to a wide orbit over the target; the intruder appears once the planet is framed
    this.frame(this.nrm(ctx.target.tile, _n), this.R * 4.2, 0.03, 2.3);
    this.spec = { name: 'Nemesis', radius: 0.42, distance: 9, color: 0x7a5a48, type: 'volcanic', speed: 0, inclination: 0, phase: 0 };
    this.newSpec = { name: 'Theia', radius: 0.16 + 0.04 * this.k, distance: 3.6 + this.rng.next(), color: 0x9a8a7a, type: 'barren', speed: 0.02, inclination: 0.2, phase: 0 };
    this.god.banner('ROGUE PLANET', 'A wandering world is on a collision course', 'planet', 0xff7a3a, 4.2);
    this.sfx('alarm', 0.8);
    this.god.news('Global Emergency Service', '@emergency', '🪐', 'A planet is coming. Not to visit. Please secure loose objects, such as the entire planet.');
  }
  private aim(): void {
    const side = this.ctx.game.engine.height > this.ctx.game.engine.width ? 1 : 1.8;
    this.path.aim(this.ctx.view, this.R, this.R * (1 + this.spec.radius * 0.75), 1, side);
    const d = this.path.impactDir;
    this.impactTile = this.planet.grid.tileAt(d.x, d.y, d.z);
    this.newSpec.phase = Math.atan2(d.z, d.x);
    this.body = this.own(new MoonFx(this.ctx.view, this.spec));
    this.body.override = this.path.start.clone();
    this.body.grow = 0.001;
  }
  step(dt: number): void {
    const t = this.t, T = this.T;
    this.progress = clamp01(t / T.end);
    if (this.once('aim', T.aim)) this.aim();
    const body = this.body;
    if (!body) return;
    if (t < T.arrive) {
      const u = clamp01((t - T.aim) / (T.arrive - T.aim));
      const f = easeIn(u) * 0.8 + u * 0.2;
      this.path.at(f, body.override!);
      body.grow = Math.max(0.001, easeOut(smooth(0, 0.12, u)));
      this.god.want(this.key, { dread: 0.2 + 0.6 * u, apocalypse: 0.15 * u });
      this.rumble.setVolume(0.2 + 0.7 * u);
      if (u > 0.45 && this.every('tidal', 0.7, dt)) {
        this.god.shake(0.3 + u, 0.8);
        // atmosphere and oceans are tugged toward the intruder
        const p0 = this.pos(this.randomTileNear(this.impactTile, 0.6), _b, 2);
        _c.subVectors(body.position, p0).normalize().multiplyScalar(22);
        for (let i = 0; i < 6; i++) this.fx.particles.emitAt(PRESETS.aurora, p0.x + fxRand(), p0.y + fxRand(), p0.z + fxRand(), _c.x, _c.y, _c.z, 2, 1);
      }
      // the crust glows under the approaching mass
      if (u > 0.8 && this.every('glow', 0.1, dt)) {
        const tl = this.randomTileNear(this.impactTile, 0.25);
        this.fx.particles.emit(PRESETS.ember, this.pos(tl, _a, 1), this.nrm(tl, _c), 4, 1.4, 1.2);
      }
      return;
    }
    const d = this.path.impactDir;
    if (this.once('impact', T.arrive)) {
      const shells = megaImpact(this, this.impactTile, 1.6 * this.k);
      this.after = new ImpactAftermath(this, this.impactTile, shells);
      this.god.banner('COLLISION', 'Global firestorm — the crust is molten', 'explosion', 0xff5a2a, 4);
      for (let i = 0; i < 30; i++) {
        _b.copy(d).multiplyScalar(30 + fxRand() * 30).addScaledVector(_c.set(fxRand() - 0.5, fxRand() - 0.5, fxRand() - 0.5), 40);
        const P = this.pos(this.impactTile, _a, 2);
        this.fx.debris.spawn(P.x, P.y, P.z, _b.x, _b.y, _b.z, { size: 1.2 + fxRand() * 2.5, state: InstState.Burning, color: 0x3a2a22, free: true, life: 14 });
      }
    }
    const s = t - T.arrive;
    // the intruder sinks into the crust and is gone
    body.grow = Math.max(0.001, 1 - smooth(0, 2.2, s));
    body.override!.copy(this.path.end).multiplyScalar(1 - 0.45 * smooth(0, 2.2, s));
    this.after?.step(s);
    this.rumble.setVolume(0.9 * (1 - smooth(10, 24, s)));
    // from the debris disk, a moon condenses
    if (s > 8 && !this.newMoon) {
      this.newMoon = this.fx.addPersistent(new MoonFx(this.ctx.view, this.newSpec));
      this.newMoon.grow = 0.001;
    }
    if (this.newMoon) {
      this.newMoon.grow = easeOut(smooth(8, 22, s));
      if (s < 20 && this.every('accrete', 0.05, dt)) {
        const pos = this.newMoon.position;
        _a.set(fxRand() - 0.5, fxRand() - 0.5, fxRand() - 0.5).normalize();
        _b.copy(pos).addScaledVector(_a, this.R * 0.7);
        this.fx.particles.emitAt(PRESETS.ember, _b.x, _b.y, _b.z, -_a.x * 30, -_a.y * 30, -_a.z * 30, 5, 1);
      }
    }
    if (this.once('moonborn', T.arrive + 22)) {
      this.planet.spec.moons.push(this.newSpec);
      this.god.banner('A MOON IS BORN', 'From the wreckage: Theia', 'moon', 0xc8b8ff, 3.4);
      this.god.news('Observatory', '@skywatch', '🌙', 'Silver lining: the debris has formed a moon. We are calling it Theia. It is, admittedly, a very expensive moon.');
    }
    if (t >= T.end) this.done = true;
  }
  protected override cleanup(): void {
    if (this.newMoon && !this.planet.spec.moons.includes(this.newSpec)) this.fx.remove(this.newMoon);
  }
}

class MoonFallEffect extends Effect {
  private moonIdx: number;
  private spec: MoonSpec;
  private body: MoonFx | null = null;
  private others: MoonFx[] = [];
  private path = new Approach();
  private impactTile = -1;
  private T = { aim: 2.4, fall: 15.5, end: 38 };
  private after: ImpactAftermath | null = null;
  private sea0 = this.planet.seaOffset;
  private tide = 0;
  private hiddenMoons = false;
  private ringSpec: RingSpec | null = null;
  private rumble = this.loop('rumble', 0.2);
  constructor(ctx: PowerCtx) {
    super(ctx);
    const moons = this.planet.spec.moons;
    this.moonIdx = moons.length ? 0 : -1;
    this.spec = moons[0] ?? { name: 'Wanderer', radius: 0.2, distance: 6, color: 0xb8b2a8, type: 'barren', speed: 0.03, inclination: 0.2, phase: 0 };
    this.frame(this.nrm(ctx.target.tile, _n), this.R * 4.2, 0.03, 2.3);
    this.god.banner('MOON FALL', `${this.spec.name} has left its orbit`, 'moon', 0xd8d0c0, 4.2);
    this.sfx('alarm', 0.7);
    this.god.news('Observatory', '@skywatch', '🌕', `${this.spec.name} appears to be getting bigger. We have checked the telescope. It is not the telescope.`);
  }
  private aim(): void {
    const view = this.ctx.view;
    const side = this.ctx.game.engine.height > this.ctx.game.engine.width ? -1 : -1.8;
    this.path.aim(view, this.R, this.R * (1 + this.spec.radius * 0.8), 1.15, side);
    const d = this.path.impactDir;
    this.impactTile = this.planet.grid.tileAt(d.x, d.y, d.z);
    const moons = this.planet.spec.moons;
    if (moons.length) {
      view.env.setLayerVisible('moons', false);
      this.hiddenMoons = true;
      for (const m of moons.slice(1)) this.others.push(this.fx.addPersistent(new MoonFx(view, m)));
    }
    this.body = this.own(new MoonFx(view, this.spec));
    this.body.override = this.path.start.clone();
  }
  step(dt: number): void {
    const t = this.t, T = this.T;
    this.progress = clamp01(t / T.end);
    if (this.once('aim', T.aim)) this.aim();
    const body = this.body;
    if (!body) return;
    if (t < T.fall) {
      const u = clamp01((t - T.aim) / (T.fall - T.aim));
      // a decaying spiral onto the impact point
      const f = easeIn(u);
      this.path.at(f, _b);
      tangents(_c.copy(_b).normalize(), _e1, _e2);
      _b.addScaledVector(_e1, Math.sin(u * Math.PI * 1.5) * this.R * 0.35 * (1 - f));
      body.override!.copy(_b);
      const roche = smooth(0.62, 0.95, u);
      body.grow = 1 - 0.25 * roche;
      this.god.want(this.key, { dread: 0.2 + 0.6 * u });
      this.rumble.setVolume(0.2 + 0.7 * u);
      // breaking up at the Roche limit: a stream of fragments
      if (roche > 0 && this.every('break', 0.04, dt)) {
        const P = body.position;
        for (let i = 0; i < 2; i++) {
          _c.set(fxRand() - 0.5, fxRand() - 0.5, fxRand() - 0.5).normalize().multiplyScalar(this.R * this.spec.radius);
          const q = _n.copy(P).add(_c);
          this.fx.particles.emitAt(PRESETS.ember, q.x, q.y, q.z, _c.x * 0.4, _c.y * 0.4, _c.z * 0.4, 6, 1.4);
        }
        if (fxRand() < 0.3) this.fx.debris.spawn(P.x, P.y, P.z, (fxRand() - 0.5) * 12, (fxRand() - 0.5) * 12, (fxRand() - 0.5) * 12, { size: 1 + fxRand() * 2, color: 0x8a8478, free: true, life: 12 });
      }
      // the tide rises toward the moon
      if (this.planet.spec.hasOcean && u > 0.45 && this.tide < 2 && u > 0.45 + this.tide * 0.2) {
        this.tide++;
        this.ops.setSeaOffset(this.sea0 + this.tide);
        this.god.shake(0.6, 1.2);
      }
      return;
    }
    if (this.once('impact', T.fall)) {
      this.drop(body);
      if (this.tide) this.ops.setSeaOffset(this.sea0);
      const shells = megaImpact(this, this.impactTile, 1.3 * this.k);
      this.after = new ImpactAftermath(this, this.impactTile, shells);
      this.god.banner('IMPACT', `${this.spec.name} is gone. So is the coast.`, 'explosion', 0xff7a3a, 4);
      const sea = openSea(this.planet, this.impactTile, 20);
      if (sea >= 0) this.god.trigger('tsunami', { tile: sea }, { natural: true, intensity: 2.2, camera: false });
      // the remains: a ring of debris (if the world had none)
      if (!this.planet.spec.rings) this.ringSpec = { inner: 1.4, outer: 2.3, color: 0xb8b0a4, opacity: 0.7, tilt: 0.25 + this.rng.next() * 0.3 };
    }
    this.after?.step(t - T.fall);
    this.rumble.setVolume(0.9 * (1 - smooth(10, 24, t - T.fall)));
    if (t >= T.end) this.done = true;
  }
  protected override cleanup(): void {
    if (this.tide && this.planet.seaOffset !== this.sea0) this.ops.setSeaOffset(this.sea0);
    if (this.t >= this.T.fall) {
      // the moon is gone for good; rings from its remains; rebuild the sky from the new spec
      if (this.moonIdx >= 0) this.planet.spec.moons.splice(this.moonIdx, 1);
      if (this.ringSpec) this.planet.spec.rings = this.ringSpec;
      const god = this.god;
      setTimeout(() => {
        try {
          god.chrono.refresh();
        } catch (e) {
          console.error('[god] moon fall refresh failed', e);
        }
      }, 30);
    } else {
      for (const o of this.others) this.fx.remove(o);
      if (this.hiddenMoons) this.ctx.view.env.setLayerVisible('moons', true);
    }
  }
}

// ───────────────────────────────────────────────────────────── vacuum decay

class VacuumEffect extends Effect {
  private bubble: Bubble & FxObject;
  private center = new Vector3();
  private up = new Vector3();
  private front: Shell & FxObject;
  private order: { tiles: Int32Array; angles: Float32Array };
  private idx = 0;
  private dur = 26;
  private grow = 21;
  private hum = this.loop('hum', 0.5);
  private complete = false;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.nrm(ctx.target.tile, this.up);
    this.pos(ctx.target.tile, this.center);
    this.bubble = this.own(new Bubble(this.fx.planetGroup) as Bubble & FxObject);
    this.bubble.mesh.position.copy(this.center);
    this.bubble.mesh.scale.setScalar(0.01);
    this.front = this.own(this.fx.shell(ShellMode.Front, 40, 256));
    this.front.setCenter(this.up).colors(0xe8fbff, 0x8a6aff);
    this.front.u.uR.value = this.R + 0.6;
    this.front.u.uWidth.value = 0.03;
    this.order = sortedByAngle(this.planet, ctx.target.tile, Math.PI + 0.01);
    this.frame(ctx.target.tile, 70, 0.9, 1.5);
    this.god.banner('VACUUM DECAY', 'The laws of physics are being rewritten', 'sparkles', 0xc8b8ff, 4.4);
    this.sfx('blackhole', 0.8, 1.6);
    this.god.news('Institute of Physics', '@physics', '⚛️', 'The fine-structure constant has changed. Please update your textbooks. And your atoms.');
  }
  step(dt: number): void {
    const t = this.t;
    this.progress = clamp01(t / this.dur);
    // grows slowly, then terrifyingly fast
    const r = this.R * 2.8 * Math.pow(clamp01(t / this.grow), 2.2);
    this.bubble.mesh.scale.setScalar(Math.max(0.01, r));
    this.bubble.intensity = 1 - smooth(this.dur - 3, this.dur, t);
    if (t > 6 && t < 7) this.frame(this.up, this.R * 3.6, 0.15, 3);
    // angular reach on the surface of a sphere of radius r centred on the surface point
    const theta = r >= 2 * this.R ? Math.PI + 0.01 : 2 * Math.asin(Math.min(1, r / (2 * this.R)));
    this.front.range(Math.max(0, theta - 0.06), Math.min(Math.PI, theta + 0.02));
    this.front.u.uAngle.value = theta;
    this.front.u.uIntensity.value = theta < Math.PI ? 1.2 : 0;
    this.hum.setVolume(0.5 + 0.4 * smooth(0, this.grow, t));
    this.god.want(this.key, { dread: 0.5 * smooth(0, this.grow, t), lights: 1 - 0.5 * smooth(this.grow * 0.6, this.grow, t) });
    const batch: number[] = [];
    while (this.idx < this.order.tiles.length && this.order.angles[this.idx] <= theta && batch.length < 400) batch.push(this.order.tiles[this.idx++]);
    if (batch.length) this.rewrite(batch);
    if (this.every('shimmer', 0.05, dt) && theta < Math.PI) {
      const t2 = this.order.tiles[Math.max(0, this.idx - 1 - Math.floor(fxRand() * 30))] ?? this.ctx.target.tile;
      this.fx.particles.emit(PRESETS.void, this.pos(t2, _a, 0.3), this.nrm(t2, _n), 4, 1.4);
      this.fx.particles.emit(PRESETS.star, this.pos(t2, _a, 0.8), _n, 2, 1);
    }
    if (this.once('engulf', this.grow)) {
      this.god.flash(0xf0e8ff, 6, 2.2, 0.9);
      this.sfx('supernova', 0.8, 1.5);
      this.god.banner('NEW PHYSICS', 'Everything is crystal now. Everything.', 'sparkles', 0xe8d8ff, 4);
    }
    if (t >= this.dur) {
      this.complete = true;
      this.done = true;
    }
  }
  private rewrite(tiles: number[]): void {
    const p = this.planet;
    const dmg = this.god.damage();
    dmg?.wreck(tiles, { chance: 1, fx: 'none', rubble: false, roads: 1, trees: true, unstoppable: true, report: this.report });
    const land = tiles.filter((t) => !p.isWater(t));
    if (land.length) {
      // crystalline terraces
      this.ops.setElevation(land, land.map((t) => Math.round(p.elevation[t] / 3) * 3 + (p.elevation[t] % 3 === 2 ? 3 : 0)));
      this.ops.setBiome(land, Biome.Crystal);
      const deposits = land.filter(() => this.rng.next() < 0.06);
      this.ops.setFeature(land.filter((t) => !deposits.includes(t) && p.feature[t] !== Feature.None), Feature.None);
      if (deposits.length) this.ops.setFeature(deposits, Feature.CrystalDeposit);
    }
    const sea = tiles.filter((t) => p.isWater(t));
    if (sea.length) this.ops.setBiome(sea, Biome.Crystal);
    this.ops.setFlags(tiles, TileFlag.Burning | TileFlag.Flooded | TileFlag.Scorched | TileFlag.Goo | TileFlag.Frozen, false);
  }
  protected override cleanup(): void {
    if (!this.complete) return;
    const spec = this.planet.spec;
    spec.atmosphere = { ...spec.atmosphere, color: 0xc8a8ff };
    spec.palette = { ...(spec.palette ?? {}), land: 0xb8a8f0, lowland: 0xd8c8ff, highland: 0x8a7ad8 };
    const god = this.god;
    setTimeout(() => {
      try {
        god.chrono.refresh();
      } catch (e) {
        console.error('[god] vacuum refresh failed', e);
      }
    }, 30);
  }
}

// ───────────────────────────────────────────────────────────── definitions

export const APOCALYPSE: PowerSpec[] = [
  {
    id: 'blackhole', name: 'Black Hole', icon: 'blackhole', category: 'apocalypse', targeting: 'global', tier: 8, danger: 5, planetEnding: true, cooldown: 600, color: 0xa77bff,
    description: 'A singularity forms beside your world. Light bends, the planet stretches, the city spirals into the accretion disk… and then the whole world goes in.',
    flavor: 'Spaghettification is not a pasta dish.',
    run: (c) => new BlackHoleEffect(c),
  },
  {
    id: 'supernova', name: 'Supernova', icon: 'sun', category: 'apocalypse', targeting: 'global', tier: 8, danger: 5, planetEnding: true, cooldown: 600, color: 0xffe08a,
    description: 'The star explodes. A blinding flash, a plasma shockwave washing over the world, a burning dayside, boiling oceans and a stripped sky. A pulsar remains.',
    flavor: 'The sun has left the chat. Violently.',
    run: (c) => new SupernovaEffect(c),
  },
  {
    id: 'cracker', name: 'Planet Cracker', icon: 'target', category: 'apocalypse', targeting: 'global', tier: 8, danger: 5, planetEnding: true, cooldown: 600, color: 0x9aff7a,
    description: 'An orbital superweapon drives a beam into the crust and splits the planet in two around its molten core. Gravity, eventually, puts it back together.',
    flavor: 'That’s no moon. It’s a very rude moon.',
    run: (c) => new CrackerEffect(c),
  },
  {
    id: 'rogue', name: 'Rogue Planet', icon: 'planet', category: 'apocalypse', targeting: 'global', tier: 8, danger: 5, planetEnding: true, cooldown: 600, color: 0xff7a3a,
    description: 'A wandering world slams into yours: a global firestorm, a molten crater the size of a continent — and, from the debris, a brand-new moon.',
    flavor: 'Two planets enter. One planet and a moon leave.',
    run: (c) => new RogueEffect(c),
  },
  {
    id: 'moonfall', name: 'Moon Fall', icon: 'moon', category: 'apocalypse', targeting: 'global', tier: 7, danger: 5, planetEnding: true, cooldown: 600, color: 0xd8d0c0,
    description: 'The moon leaves its orbit and spirals in, breaking apart at the Roche limit before it hits. Its remains become a ring around the world.',
    flavor: 'Over the moon? Under it, mostly.',
    run: (c) => new MoonFallEffect(c),
  },
  {
    id: 'vacuum', name: 'Vacuum Decay', icon: 'sparkles', category: 'apocalypse', targeting: 'tile', tier: 8, danger: 5, planetEnding: true, cooldown: 600, color: 0xc8b8ff,
    description: 'Tip the universe out of its false vacuum. A shimmering bubble of new physics expands from your touch and rewrites everything it reaches into crystal.',
    flavor: 'Technically, this was always going to happen. You just moved it up a few trillion years.',
    tip: 'Tap where reality should break',
    run: (c) => new VacuumEffect(c),
  },
];
