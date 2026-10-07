/**
 * OWNER: god.
 * Cosmic powers — bend the physics of the world: spawn a moon (debris accretes into a new satellite, saved in
 * spec.moons), add rings (a stray moonlet is shredded into a ring system, saved in spec.rings), gravity flip
 * (the district floats up and settles back), time warp (spin the days, stop the sun, or run it backwards) and
 * the wormhole (opens above the city, swallows a few blocks and spits out… something).
 */
import { Color, Matrix4, Quaternion, Vector3, type Mesh, type ShaderMaterial } from 'three';
import { Feature, type MoonSpec, type PlanetTypeId, type RingSpec } from '../../core/types';
import { setSettings, settings, type DayNightMode } from '../../core/settings';
import type { BuildingInstance } from '../../world/planet';
import { Moons } from '../../render/space/Moons';
import { PlanetRings } from '../../render/space/Rings';
import type { FxObject } from '../../render/fx/FxLayer';
import { PRESETS, fxRand } from '../../render/fx/particles';
import { Portal } from '../../render/fx/cosmic';
import { Saucer } from '../../render/fx/creatures';
import { Fireball } from '../../render/fx/sky';
import { BeamStyle } from '../../render/fx/beams';
import { InstState } from '../../render/materials';
import { Effect, type PowerCtx, type PowerSpec } from '../effect';
import type { Flyer } from '../../render/fx/flyers';
import { buildingHeight } from '../damage';
import { notify } from '../../ui/store';
import { clamp01, easeOut, envelope, liftBehaviour, skyPoint, smooth, tangents, tilesToAngle } from './common';
import type { PlanetView } from '../../render/PlanetView';

const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _col = new Color();

/** Sun colour × intensity as the space environment feeds its moons & rings (approximation). */
function sunColor(view: PlanetView, out: Color): Color {
  try {
    const l = view.env.sunLight;
    return out.copy(l.color).multiplyScalar(Math.max(0.2, l.intensity) / Math.PI);
  } catch {
    return out.setRGB(1, 1, 1);
  }
}

/** A god-made moon drawn with the space environment's own moon renderer (lives until the view is rebuilt). */
export class MoonFx implements FxObject {
  readonly moons: Moons;
  mesh: Mesh | null = null;
  /** 0..1 growth */
  grow = 1;
  /** when set, overrides the orbital position (falling moons, accretion) */
  override: Vector3 | null = null;
  constructor(private view: PlanetView, spec: MoonSpec, parent = view.scene) {
    const cap = { add: (o: Mesh) => ((this.mesh = o), parent.add(o)) };
    this.moons = new Moons(cap, [spec], view.planet.radius, view.planet.spec.atmosphere, 48);
  }
  update(dt: number, time: number): void {
    const speed = 1; // moons drift with real time here (keeps the new moon visibly alive)
    this.moons.update(dt * speed, time, this.view.sunDir, sunColor(this.view, _col));
    if (this.mesh) {
      if (this.override) this.mesh.position.copy(this.override);
      const r = (this.mesh.userData.r0 ??= this.mesh.scale.x) as number;
      this.mesh.scale.setScalar(Math.max(1e-3, r * this.grow));
      this.mesh.visible = this.grow > 0.002;
    }
  }
  get position(): Vector3 {
    return this.mesh?.position ?? _a.set(0, 0, 0);
  }
  dispose(): void {
    this.moons.dispose();
  }
}

/** God-made rings (until the view is rebuilt from spec). */
export class RingsFx implements FxObject {
  readonly rings: PlanetRings;
  opacity = 1;
  private target: number;
  constructor(private view: PlanetView, spec: RingSpec) {
    this.rings = new PlanetRings(spec, view.planet.radius, view.planet.spec.seed ^ 0x5a5a, view.planet.spec.atmosphere.color);
    view.scene.add(this.rings.mesh);
    this.target = spec.opacity;
  }
  update(): void {
    this.rings.update(this.view.sunDir, sunColor(this.view, _col));
    const u = (this.rings.mesh.material as ShaderMaterial).uniforms;
    if (u.uOpacity) u.uOpacity.value = Math.max(0.0, this.target * this.opacity);
    this.rings.mesh.visible = this.opacity > 0.002;
  }
  dispose(): void {
    this.rings.dispose();
  }
}

const MOON_TYPES: PlanetTypeId[] = ['barren', 'arctic', 'volcanic', 'crystal', 'toxic', 'ocean', 'desert', 'fungal'];
const MOON_COLORS: Record<string, number> = { barren: 0xb8b2a8, arctic: 0xe8f2ff, volcanic: 0x8a5a42, crystal: 0xc8b8ff, toxic: 0xb8d878, ocean: 0x6aa8d8, desert: 0xd8b07a, fungal: 0xc88ad8 };
const MOON_NAMES = ['Selene', 'Nyx', 'Tiny', 'Pebble', 'Moony McMoonface', 'Luna Nova', 'Hope', 'Kevin', 'Orbiter', 'Dusk', 'Ember', 'Frost'];

// ───────────────────────────────────────────────────────────── spawn moon

class MoonEffect extends Effect {
  private dur = 9;
  private spec: MoonSpec;
  private fx3: MoonFx;
  private spot = new Vector3();
  constructor(ctx: PowerCtx) {
    super(ctx);
    const p = this.planet;
    const used = p.spec.moons.map((m) => m.distance);
    let dist = 3.2 + this.rng.next() * 2.4;
    for (let i = 0; i < 8 && used.some((d) => Math.abs(d - dist) < 0.7); i++) dist = 3 + this.rng.next() * 4;
    const type = (ctx.choice as PlanetTypeId) || MOON_TYPES[Math.floor(this.rng.next() * MOON_TYPES.length)];
    // place it where the camera can see it: phase toward the camera's side
    const cam = ctx.view.camera.position.clone().normalize();
    const inc = (this.rng.next() - 0.5) * 0.5;
    const phase = Math.atan2(cam.z, cam.x) + 0.35;
    this.spec = {
      name: MOON_NAMES[Math.floor(this.rng.next() * MOON_NAMES.length)] + (p.spec.moons.length ? ' ' + 'IVXLC'[p.spec.moons.length % 5] : ''),
      radius: 0.1 + 0.08 * this.k + this.rng.next() * 0.05,
      distance: dist,
      color: MOON_COLORS[type] ?? 0xb8b2a8,
      type,
      speed: 0.015 + this.rng.next() * 0.025,
      inclination: inc,
      phase,
    };
    this.fx3 = this.fx.addPersistent(new MoonFx(ctx.view, this.spec));
    this.fx3.grow = 0.001;
    this.fx3.update(0, 0);
    this.spot.copy(this.fx3.position);
    this.god.frame(this.spot.clone().normalize(), this.R * 3.4, 0.2, 2.4);
    this.god.banner('A NEW MOON', `${this.spec.name} is born`, 'moon', 0xa77bff, 3.6);
    this.sfx('magic', 1, 0.6);
    this.loop('hum', 0.4);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const pos = this.fx3.position;
    this.fx3.grow = easeOut(smooth(0.15, 0.85, u));
    // debris and glowing dust stream in from all sides and accrete
    if (u < 0.8 && this.every('accrete', 0.03, dt)) {
      const r = this.spec.radius * this.R * 6;
      for (let i = 0; i < 3; i++) {
        _a.set(fxRand() - 0.5, fxRand() - 0.5, fxRand() - 0.5).normalize();
        _b.copy(pos).addScaledVector(_a, r * (0.6 + fxRand() * 0.6));
        const v = _a.multiplyScalar(-r * 0.9);
        this.fx.particles.emitAt(PRESETS.star, _b.x, _b.y, _b.z, v.x, v.y, v.z, 2.5, 1);
        if (fxRand() < 0.3) this.fx.particles.emitAt(PRESETS.ember, _b.x, _b.y, _b.z, v.x, v.y, v.z, 4, 1);
      }
    }
    if (this.once('flash', this.dur * 0.82)) {
      this.fx.particles.emit(PRESETS.flash, pos, _n.copy(pos).normalize(), 1, 0, 6);
      this.sfx('chime', 1, 0.6);
    }
    if (this.t >= this.dur) {
      this.planet.spec.moons.push(this.spec);
      notify({ title: `${this.spec.name} is in orbit`, body: `A ${this.spec.type} moon now circles ${this.planet.spec.name}. Tides will never be the same.`, kind: 'good', icon: 'moon' });
      this.god.news('Observatory', '@skywatch', '🌙', `We have a new moon. Its name is ${this.spec.name}. Please stop sending us poems about it.`);
      this.done = true;
    }
  }
  protected override cleanup(): void {
    // interrupted before it formed: let it go
    if (!this.planet.spec.moons.includes(this.spec)) this.fx.remove(this.fx3);
  }
}

// ───────────────────────────────────────────────────────────── add rings

const RING_LOOKS: [number, number][] = [
  [0xd8c7a6, 0.75],
  [0xdce8f4, 0.7],
  [0xc89a7a, 0.7],
  [0xb8a8e0, 0.65],
  [0xe8d8b0, 0.8],
];

class RingsEffect extends Effect {
  private dur = 12;
  private spec: RingSpec;
  private rings: RingsFx;
  private ball: Fireball & FxObject;
  private start = new Vector3();
  private shred = new Vector3();
  private hadRings: boolean;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const look = RING_LOOKS[Math.floor(this.rng.next() * RING_LOOKS.length)];
    this.spec = { inner: 1.35 + this.rng.next() * 0.25, outer: 2.1 + 0.4 * this.k + this.rng.next() * 0.3, color: look[0], opacity: look[1], tilt: 0.15 + this.rng.next() * 0.4 };
    this.hadRings = !!this.planet.spec.rings;
    if (this.hadRings) ctx.view.env.setLayerVisible('rings', false);
    this.rings = this.fx.addPersistent(new RingsFx(ctx.view, this.spec));
    this.rings.opacity = 0;
    // a moonlet falls in from deep space and is shredded at the Roche limit
    const n = this.rings.rings.normal;
    tangents(n, _e1, _e2);
    const cam = ctx.view.camera.position.clone().normalize();
    const side = _a.copy(cam).addScaledVector(n, -cam.dot(n)).normalize();
    this.shred.copy(side).multiplyScalar(this.R * (this.spec.inner + this.spec.outer) * 0.5).applyAxisAngle(n, 0.6);
    this.start.copy(this.shred).multiplyScalar(4).addScaledVector(n, this.R * 0.8);
    this.ball = this.own(new Fireball(this.fx.worldGroup, this.R * 0.05, this.R * 0.3, 0xbfd8ff, 0xffffff, 0x8a8478) as Fireball & FxObject);
    this.ball.position.copy(this.start);
    this.ball.heat = 0.2;
    this.god.frame(cam, this.R * 4.2, 0.12, 2.2);
    this.god.banner('RINGS OF DEBRIS', 'A moonlet strays too close…', 'planet', 0xd8c7a6, 3.6);
    this.sfx('whoosh', 0.7, 0.6);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const fall = clamp01(this.t / 3.2);
    if (fall < 1) {
      this.ball.position.lerpVectors(this.start, this.shred, easeOut(fall));
      this.ball.dir.subVectors(this.shred, this.start).normalize();
      this.ball.heat = 0.2 + fall * 0.8;
    } else if (this.once('shred', 3.2)) {
      this.drop(this.ball);
      this.god.flash(0xdfefff, 2.5, 1, 0.25);
      this.sfx('explosion', 0.8, 0.7);
      this.sfx('chime', 0.6, 0.5);
    }
    // the debris spreads around the ring and settles
    const spread = smooth(3.2, this.dur * 0.9, this.t);
    this.rings.opacity = spread;
    if (this.t > 3.2 && this.every('spread', 0.03, dt) && spread < 0.95) {
      const n = this.rings.rings.normal;
      for (let i = 0; i < 4; i++) {
        const a = (fxRand() - 0.5) * Math.PI * 2 * (0.15 + spread);
        const r = this.R * (this.spec.inner + (this.spec.outer - this.spec.inner) * fxRand());
        _b.copy(this.shred).normalize().applyAxisAngle(n, a).multiplyScalar(r);
        _n.crossVectors(n, _b).normalize().multiplyScalar(4);
        this.fx.particles.emitAt(PRESETS.star, _b.x, _b.y, _b.z, _n.x, _n.y, _n.z, 3, 1.4);
      }
    }
    if (this.t >= this.dur) {
      this.planet.spec.rings = this.spec;
      this.god.news('Observatory', '@skywatch', '🪐', `${this.planet.spec.name} now has rings. Property values on the night side just tripled.`);
      this.done = true;
    }
  }
  protected override cleanup(): void {
    if (this.planet.spec.rings !== this.spec) {
      this.fx.remove(this.rings);
      if (this.hadRings) this.ctx.view.env.setLayerVisible('rings', true);
    }
  }
}

// ───────────────────────────────────────────────────────────── gravity flip

class GravityEffect extends Effect {
  private dur = 11;
  private hidden: number[] = [];
  private r = Math.round(4 + 2 * this.k);
  constructor(ctx: PowerCtx) {
    super(ctx);
    const dmg = this.god.damage();
    const list = dmg ? dmg.buildingsOn(this.planet.grid.disk(ctx.target.tile, this.r)) : [];
    list.sort(() => this.rng.next() - 0.5);
    const cap = 22;
    for (const b of list.slice(0, cap)) this.lift(b);
    this.god.banner('GRAVITY FLIP', 'Local gravity: temporarily optional', 'gravity', 0xa77bff, 3);
    this.sfx('magic', 0.8, 0.5);
    this.sfx('whoosh', 0.6, 0.6);
    this.god.news('Hypernet', '@hypernet', '🙃', 'my apartment is currently 40 metres up. my cat is unbothered. i am bothered.', ctx.target.tile);
  }
  private lift(b: BuildingInstance): void {
    const dmg = this.god.damage();
    if (!dmg) return;
    const m = new Matrix4().copy(dmg.matrixOf(b));
    const home = new Vector3().setFromMatrixPosition(m);
    const up = home.clone().normalize();
    const peak = 3 + this.rng.next() * 7 * this.k + buildingHeight(b) * 0.3;
    const delay = this.rng.next() * 0.8;
    const spin = new Vector3(this.rng.next() - 0.5, this.rng.next() - 0.5, this.rng.next() - 0.5).normalize();
    const spinRate = 0.15 + this.rng.next() * 0.35;
    const q0 = new Matrix4().extractRotation(m);
    const f = this.fx.flyers.launch(
      b,
      m,
      (fl: Flyer) => {
        const t = fl.age - delay;
        if (t < 0) return true;
        // rise · float · fall with a little bounce
        const rise = easeOut(clamp01(t / 2.5));
        const fall = smooth(7.2, 8.6, t);
        const bob = Math.sin(t * 1.7) * 0.25 * (1 - fall);
        let h = peak * rise * (1 - fall) + bob;
        if (t > 8.6) h = Math.max(0, Math.sin((t - 8.6) * 9) * 0.25 * Math.exp(-(t - 8.6) * 4));
        fl.pos.copy(home).addScaledVector(up, h);
        const ang = spinRate * (rise * 2 - fall * 2) * (t < 8.6 ? Math.sin(Math.min(t, 7.2) * 0.4) : 0);
        fl.quat.setFromRotationMatrix(q0).premultiply(_qa.setFromAxisAngle(spin, ang));
        if (t > 8.6 && t < 8.7) this.fx.particles.emit(PRESETS.dust, home, up, 3, 1);
        return t < 9.8;
      },
      InstState.Normal,
      (fl) => this.ctx.view.buildings.setVisible(fl.sourceId, true),
    );
    if (f) {
      this.ctx.view.buildings.setVisible(b.id, false);
      this.hidden.push(b.id);
    }
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.05, 0.3);
    // dust, leaves and water droplets drift upward
    if (env > 0.1 && this.every('drift', 0.05, dt)) {
      const t = this.randomTileNear(this.ctx.target.tile, tilesToAngle(this.planet, this.r));
      const n = this.nrm(t, _n);
      const pos = this.pos(t, _a, 0.2);
      this.fx.particles.emitAt(PRESETS.void, pos.x, pos.y, pos.z, n.x * 2, n.y * 2, n.z * 2, 0.8, 1.5);
      if (this.planet.isWater(t)) this.fx.particles.emitAt(PRESETS.bubble, pos.x, pos.y, pos.z, n.x * 3, n.y * 3, n.z * 3, 1.2, 1.4);
      else this.fx.debris.spawn(pos.x, pos.y, pos.z, n.x * 2.5, n.y * 2.5, n.z * 2.5, { size: 0.15 + fxRand() * 0.2, color: 0x8a8378, grav: -0.05, drag: 0.6, life: 4 });
    }
    if (this.t >= this.dur) this.done = true;
  }
  protected override cleanup(): void {
    for (const id of this.hidden) this.ctx.view.buildings.setVisible(id, true);
  }
}
const _qa = new Quaternion();

// ───────────────────────────────────────────────────────────── time warp

class TimeEffect extends Effect {
  private mode: 'spin' | 'stop' | 'reverse';
  private dur: number;
  private prevMode: DayNightMode;
  private prevLen: number;
  private frozen: number;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.mode = (ctx.choice as TimeEffect['mode']) || 'spin';
    this.dur = this.mode === 'spin' ? 22 : this.mode === 'stop' ? 40 : 22;
    this.prevMode = settings.value.dayNight;
    this.prevLen = this.planet.spec.dayLength;
    this.frozen = ctx.game.clock.timeOfDay;
    if (this.prevMode !== 'cycle') setSettings({ dayNight: 'cycle' });
    if (this.mode === 'spin') this.planet.spec.dayLength = Math.max(10, this.prevLen / (12 * this.k));
    const label = this.mode === 'spin' ? 'TIME-LAPSE' : this.mode === 'stop' ? 'THE SUN STANDS STILL' : 'TIME RUNS BACKWARDS';
    const sub = this.mode === 'spin' ? 'Days fly by in seconds' : this.mode === 'stop' ? 'Eternal noon — or eternal night' : 'Sunsets become sunrises';
    this.god.banner(label, sub, 'clock', 0xa77bff, 3.2);
    this.sfx(this.mode === 'reverse' ? 'rewind' : 'warp', 0.8, 0.8);
  }
  step(dt: number): void {
    this.progress = clamp01(this.t / this.dur);
    const clock = this.ctx.game.clock;
    if (this.mode === 'stop') clock.timeOfDay = this.frozen;
    else if (this.mode === 'reverse') clock.timeOfDay = (((clock.timeOfDay - (dt * 2 * Math.max(1, clock.speed)) / Math.max(10, this.prevLen / (6 * this.k))) % 1) + 1) % 1;
    if (this.every('streak', 0.1, dt) && this.mode !== 'stop') {
      const t = this.randomTileNear(this.ctx.target.tile, tilesToAngle(this.planet, 10));
      this.fx.particles.emit(PRESETS.star, this.pos(t, _a, 10 + fxRand() * 6), this.nrm(t, _n), 1, 0.5);
    }
    if (this.t >= this.dur) this.done = true;
  }
  protected override cleanup(): void {
    this.planet.spec.dayLength = this.prevLen;
    if (this.prevMode !== 'cycle') setSettings({ dayNight: this.prevMode });
  }
}

// ───────────────────────────────────────────────────────────── wormhole

class WormholeEffect extends Effect {
  private dur = 20;
  private portal: Portal & FxObject;
  private center = new Vector3();
  private up = new Vector3();
  private outcome: 'visitors' | 'crystals' | 'treasure';
  private radius = 6 + 2 * this.k;
  private ships: { ufo: Saucer & FxObject; vel: Vector3; t: number }[] = [];
  private rocks: { ball: Fireball & FxObject; from: Vector3; to: Vector3; tile: number; t0: number; done: boolean }[] = [];
  private swallowed = 0;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.nrm(ctx.target.tile, this.up);
    skyPoint(this.R, this.up, 20 + 3 * this.k, 0, 0, this.center);
    this.portal = this.own(new Portal(this.fx.planetGroup, this.radius, ctx.view.env.skyGroup, 0x9a6bff) as Portal & FxObject);
    this.portal.position.copy(this.center);
    this.portal.normal.copy(this.up).negate();
    const roll = this.rng.next();
    this.outcome = roll < 0.4 ? 'visitors' : roll < 0.75 ? 'crystals' : 'treasure';
    this.god.banner('WORMHOLE', 'A tunnel through spacetime opens over the city', 'warp', 0x9a6bff, 3.6);
    this.god.frame(ctx.target.tile, 58, 1.18, 2);
    this.sfx('warp', 1, 0.6);
    this.loop('blackhole', 0.4);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.12, 0.15);
    this.portal.intensity = env;
    this.portal.mesh.scale.setScalar(this.radius * (0.2 + 0.8 * smooth(0, 0.15, u)) * (1 - smooth(0.9, 1, u) * 0.95));
    this.god.want(this.key, { dread: 0.15 * env });
    // arcs crackle round the rim
    if (env > 0.3 && this.every('arc', 0.35, dt)) {
      tangents(this.up, _e1, _e2);
      const a0 = fxRand() * Math.PI * 2, a1 = a0 + 0.8 + fxRand();
      const r = this.radius * 0.95;
      const p0 = this.center.clone().addScaledVector(_e1, Math.cos(a0) * r).addScaledVector(_e2, Math.sin(a0) * r);
      const p1 = this.center.clone().addScaledVector(_e1, Math.cos(a1) * r).addScaledVector(_e2, Math.sin(a1) * r);
      this.fx.bolts.strike(p0, p1, { color: 0xc8a8ff, width: 0.06, branches: 1, jag: 0.2, life: 0.35 });
    }
    // the pull: dust and the odd building are drawn up into it
    if (u > 0.1 && u < 0.55) {
      if (this.every('pull', 0.04, dt)) {
        const t = this.randomTileNear(this.ctx.target.tile, tilesToAngle(this.planet, 5));
        const pos = this.pos(t, _a, 0.3);
        _b.subVectors(this.center, pos).normalize().multiplyScalar(9);
        this.fx.particles.emitAt(PRESETS.void, pos.x, pos.y, pos.z, _b.x, _b.y, _b.z, 1, 2);
        this.fx.particles.emitAt(PRESETS.dust, pos.x, pos.y, pos.z, _b.x * 0.6, _b.y * 0.6, _b.z * 0.6, 0.6, 1.2);
      }
      if (this.swallowed < 2 + Math.round(this.k) && this.every('swallow', 1.6, dt)) this.swallow();
    }
    if (this.once('outcome', this.dur * 0.55)) this.emerge();
    this.stepOutcome(dt);
    if (this.t >= this.dur) this.done = true;
  }
  private swallow(): void {
    const dmg = this.god.damage();
    const near = dmg ? dmg.buildingsOn(this.planet.grid.disk(this.ctx.target.tile, 3)) : [];
    const b = near[Math.floor(this.rng.next() * near.length)];
    if (!b || !dmg) return;
    this.swallowed++;
    dmg.wreck([b.tile], {
      chance: 1,
      fx: 'none',
      rubble: false,
      report: this.report,
      launch: (bb, m) => {
        const f = this.fx.flyers.launch(bb, m, liftBehaviour(() => this.center, 3.4), InstState.Highlight);
        if (f) f.data[0] = f.scale.x;
      },
    });
    const beam = this.beam().set(this.pos(b.tile, _a), this.center, 1.5, 0x9a6bff, 0.8, BeamStyle.Tractor);
    setTimeout(() => this.releaseBeam(beam), 2600);
    this.sfx('alien', 0.5, 0.6);
  }
  private emerge(): void {
    this.god.flash(0xd8c8ff, 2.5, 0.8, 0.3);
    this.sfx('warp', 1, 1.2);
    const g = this.ctx.game;
    if (this.outcome === 'visitors') {
      for (let i = 0; i < 3; i++) {
        const ufo = this.own(new Saucer(this.fx.planetGroup, 0xe8e0ff, 0xffd36b) as Saucer & FxObject);
        tangents(this.up, _e1, _e2);
        const a = (i / 3) * Math.PI * 2;
        const vel = this.up.clone().multiplyScalar(-2).addScaledVector(_e1, Math.cos(a) * 7).addScaledVector(_e2, Math.sin(a) * 7);
        ufo.place(this.center, this.up, _e1);
        this.ships.push({ ufo, vel, t: 0 });
      }
      this.god.cityEvent('aliens', 'Visitors from Beyond', '👽', 'Travellers from another universe came through the wormhole. They love the gift shops.', 12, this.ctx.target.tile);
      g.empire.earn(Math.round(6000 * this.k));
      this.god.banner('VISITORS', 'Friendly travellers from another universe', 'alien', 0xffd36b, 3);
      this.god.news('Tourism Board', '@visitcity', '👽', 'Inter-universal tourists have arrived. They tip in a currency that might be soup. We accept it.');
    } else if (this.outcome === 'crystals') {
      for (let i = 0; i < 6 + Math.round(4 * this.k); i++) {
        const tile = this.randomTileNear(this.ctx.target.tile, tilesToAngle(this.planet, 8));
        const ball = this.own(new Fireball(this.fx.planetGroup, 0.35, 6, 0xc8a8ff, 0xffffff, 0x8a7ad8) as Fireball & FxObject);
        ball.position.copy(this.center);
        this.rocks.push({ ball, from: this.center.clone(), to: this.pos(tile, new Vector3()), tile, t0: this.t + i * 0.25, done: false });
      }
      this.god.banner('EXOTIC MATTER', 'Crystal meteorites from another universe', 'sparkles', 0xc8a8ff, 3);
    } else {
      const amount = Math.round((12000 + 8000 * this.k) * (g.empire.sandbox ? 0 : 1));
      g.empire.earn(amount);
      this.god.banner('TREASURE', amount ? `A cargo of alien gold: +§${amount.toLocaleString('en-US')}` : 'A cargo of alien gold', 'coin', 0xffd36b, 3);
      for (let i = 0; i < 40; i++) {
        tangents(this.up, _e1, _e2);
        _b.copy(this.up).multiplyScalar(-4).addScaledVector(_e1, (fxRand() - 0.5) * 10).addScaledVector(_e2, (fxRand() - 0.5) * 10);
        this.fx.particles.emitAt(PRESETS.gold, this.center.x, this.center.y, this.center.z, _b.x, _b.y, _b.z, 1.4, 1.5);
      }
    }
  }
  private stepOutcome(dt: number): void {
    for (const s of this.ships) {
      s.t += dt;
      s.vel.addScaledVector(_a.copy(this.up), dt * 2);
      s.ufo.root.position.addScaledVector(s.vel, dt);
      s.ufo.place(s.ufo.root.position, _n.copy(s.ufo.root.position).normalize(), _e1);
    }
    for (const r of this.rocks) {
      if (r.done || this.t < r.t0) continue;
      const u = clamp01((this.t - r.t0) / 1.3);
      r.ball.position.lerpVectors(r.from, r.to, u * u);
      r.ball.dir.subVectors(r.to, r.from).normalize();
      r.ball.heat = 0.4 + u * 0.6;
      if (u >= 1) {
        r.done = true;
        this.drop(r.ball);
        const n = this.nrm(r.tile, _n);
        this.fx.blast(r.to, n, 0.9, { debris: 6, color: 0x8a7ad8 });
        this.fx.particles.emit(PRESETS.void, r.to, n, 16, 1.5);
        this.sfx('explosion', 0.4, 1.3);
        const dmg = this.god.damage();
        dmg?.wreck([r.tile], { chance: 0.6, fx: 'none', report: this.report });
        if (!this.planet.isWater(r.tile) && this.planet.road[r.tile] === 0 && this.planet.building[r.tile] < 0) this.ops.setFeature([r.tile], Feature.CrystalDeposit);
      }
    }
  }
}

// ───────────────────────────────────────────────────────────── definitions

export const COSMIC: PowerSpec[] = [
  {
    id: 'moon', name: 'Spawn Moon', icon: 'moon', category: 'cosmic', targeting: 'global', tier: 5, danger: 0, cooldown: 300, color: 0xc8b8ff, rewindable: true,
    description: 'Gather a cloud of rubble into a brand-new moon. It joins the sky for good — tides, eclipses and all.',
    flavor: 'Every planet deserves a nightlight.',
    choices: [
      { id: 'barren', label: 'Rocky', icon: 'moon' },
      { id: 'arctic', label: 'Icy', icon: 'snowflake' },
      { id: 'volcanic', label: 'Molten', icon: 'volcano' },
      { id: 'crystal', label: 'Crystal', icon: 'sparkles' },
      { id: 'ocean', label: 'Water', icon: 'wave' },
      { id: 'fungal', label: 'Fungal', icon: 'flower' },
    ],
    run: (c) => new MoonEffect(c),
  },
  {
    id: 'rings', name: 'Add Rings', icon: 'planet', category: 'cosmic', targeting: 'global', tier: 4, danger: 0, cooldown: 300, color: 0xd8c7a6, rewindable: true,
    description: 'Lure a moonlet past the Roche limit: it shatters into a gleaming ring system that circles the planet forever.',
    flavor: 'If you liked it, you should have put a ring on it. So you did.',
    run: (c) => new RingsEffect(c),
  },
  {
    id: 'gravity', name: 'Gravity Flip', icon: 'gravity', category: 'cosmic', targeting: 'tile', tier: 2, danger: 0, cooldown: 30, color: 0xa77bff,
    description: 'Switch off gravity for a district: buildings drift up and tumble lazily in the air, then settle gently back down.',
    flavor: 'Newton would like to file a complaint.',
    run: (c) => new GravityEffect(c),
  },
  {
    id: 'time', name: 'Time Warp', icon: 'clock', category: 'cosmic', targeting: 'global', tier: 1, danger: 0, cooldown: 30, color: 0x8ab4ff,
    description: 'Bend the day itself: spin days past in a time-lapse, hold the sun still in the sky, or run the sunset backwards.',
    flavor: 'Daylight saving, but for gods.',
    choices: [
      { id: 'spin', label: 'Time-lapse', icon: 'fastForward' },
      { id: 'stop', label: 'Stop the Sun', icon: 'pause' },
      { id: 'reverse', label: 'Reverse', icon: 'rewind' },
    ],
    run: (c) => new TimeEffect(c),
  },
  {
    id: 'wormhole', name: 'Wormhole', icon: 'warp', category: 'cosmic', targeting: 'tile', tier: 5, danger: 2, cooldown: 120, color: 0x9a6bff,
    description: 'Tear a tunnel through spacetime above the city. It swallows a few blocks… and something comes back out: visitors, exotic crystals or alien treasure.',
    flavor: 'Results may vary. Results may also have tentacles.',
    run: (c) => new WormholeEffect(c),
  },
];
