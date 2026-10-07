/**
 * OWNER: god.
 * Creature powers: UFO invasion (saucers abduct buildings with tractor beams and laser the rest — orbital defences
 * shoot back), KAIJU (a 300-metre leviathan wades out of the sea and stomps across town, with atomic breath),
 * sandworm (breaches through the streets and swallows blocks whole), kraken (tentacles drag coastal buildings
 * into the deep), grey goo (nanites dissolve the city tile by tile into metal), space plague (an infection hops
 * between buildings — hospitals fight back) and the robot uprising (factories disgorge mechs that zap and
 * assimilate the city).
 */
import { Quaternion, Vector3 } from 'three';
import { Biome, BuildingState, Feature, TileFlag, zoneFamily } from '../../core/types';
import { getItem } from '../../content/catalog';
import type { BuildingInstance } from '../../world/planet';
import type { FxObject } from '../../render/fx/FxLayer';
import { PRESETS, fxRand } from '../../render/fx/particles';
import { BeamStyle, type Beam } from '../../render/fx/beams';
import { ShellMode, type Shell } from '../../render/fx/shells';
import { Kaiju, Robots, Saucer, Tentacles, Worm, type RobotState } from '../../render/fx/creatures';
import { InstState } from '../../render/materials';
import { Effect, type PowerCtx, type PowerSpec } from '../effect';
import { buildingHeight, resistance } from '../damage';
import { notify } from '../../ui/store';
import { clamp01, easeIn, envelope, liftBehaviour, nearestWater, offshore, openSea, sinkBehaviour, smooth, tangents, tilesToAngle } from './common';

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _n = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _qTilt = new Quaternion();

/** Buildings within `r` tiles of `tile`, nearest first. */
function buildingsNear(e: Effect, tile: number, r: number): BuildingInstance[] {
  const dmg = e.god.damage();
  if (!dmg) return [];
  const g = e.planet.grid;
  const list = dmg.buildingsOn(g.disk(tile, r));
  list.sort((a, b) => g.angle(tile, a.tile) - g.angle(tile, b.tile));
  return list;
}

/** Great-circle interpolation between unit directions. */
function slerpDir(a: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  const d = Math.max(-1, Math.min(1, a.dot(b)));
  const w = Math.acos(d);
  if (w < 1e-5) return out.copy(a);
  const s = Math.sin(w);
  return out.copy(a).multiplyScalar(Math.sin((1 - t) * w) / s).addScaledVector(b, Math.sin(t * w) / s).normalize();
}

// ───────────────────────────────────────────────────────────── UFO invasion

interface Ship {
  ufo: Saucer & FxObject;
  pos: Vector3;
  from: Vector3;
  to: Vector3;
  moveT: number;
  moveDur: number;
  state: 'arrive' | 'seek' | 'abduct' | 'zap' | 'leave' | 'down' | 'gone';
  t: number;
  target: BuildingInstance | null;
  beam: Beam | null;
  hp: number;
  zaps: number;
  vel: Vector3;
}

class UfoEffect extends Effect {
  private ships: Ship[] = [];
  private dur = 30 + 6 * this.k;
  private claimed = new Set<number>();
  private alt = 10;
  private hum = this.loop('hum', 0.5);
  private defense = this.god.defenses();
  private nextShot = 3;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const n = Math.round(3 + 1.5 * this.k);
    const tints = [0xc9d2de, 0xd8c7ff, 0xbfe6ff, 0xe8d6b8];
    const glows = [0x6dffb0, 0xff7ad9, 0x7af0ff, 0xffd36b];
    for (let i = 0; i < n; i++) {
      const tile = this.randomTileNear(ctx.target.tile, tilesToAngle(this.planet, 4));
      const to = this.hover(tile, new Vector3());
      const from = to.clone().normalize().multiplyScalar(this.R + 70 + i * 6);
      tangents(to.clone().normalize(), _e1, _e2);
      from.addScaledVector(_e1, (fxRand() - 0.5) * 40).addScaledVector(_e2, (fxRand() - 0.5) * 40);
      const ufo = this.own(new Saucer(this.fx.planetGroup, tints[i % 4], glows[i % 4]) as Saucer & FxObject);
      ufo.root.scale.setScalar(0.9 + this.k * 0.2);
      this.ships.push({ ufo, pos: from.clone(), from, to, moveT: 0, moveDur: 2.2 + i * 0.45, state: 'arrive', t: 0, target: null, beam: null, hp: 2, zaps: 0, vel: new Vector3() });
    }
    this.god.banner('UFO INVASION', 'Unidentified craft over the city', 'alien', 0x6dffb0, 4);
    this.god.frame(ctx.target.tile, 62, 1.0, 2);
    this.sfx('alien', 1);
    this.god.news('Hypernet', '@hypernet', '👽', 'THEY ARE HERE. they are taking the BANK. honestly fair.', ctx.target.tile);
  }

  private hover(tile: number, out: Vector3): Vector3 {
    return this.pos(tile, out, this.alt + fxRand() * 3);
  }

  step(dt: number): void {
    this.progress = clamp01(this.t / this.dur);
    const leaving = this.t > this.dur - 4;
    let alive = 0;
    for (const s of this.ships) {
      if (s.state === 'gone') continue;
      alive++;
      s.t += dt;
      if (leaving && s.state !== 'leave' && s.state !== 'down') this.leave(s);
      switch (s.state) {
        case 'arrive':
        case 'seek': {
          s.moveT += dt;
          const u = clamp01(s.moveT / s.moveDur);
          const f = s.state === 'arrive' ? 1 - Math.pow(1 - u, 3) : u * u * (3 - 2 * u);
          s.pos.lerpVectors(s.from, s.to, f);
          if (s.state === 'arrive' && s.moveT < 0.1) this.warpFlash(s.pos);
          if (u >= 1) {
            if (s.target && this.planet.buildings.has(s.target.id)) this.startAbduct(s);
            else this.pick(s);
          }
          break;
        }
        case 'abduct':
          s.pos.y += Math.sin(this.t * 3) * 0.003;
          if (s.beam) {
            const belly = s.ufo.belly(_a);
            const ground = _b.copy(belly).normalize().multiplyScalar(this.R + this.planet.heightOf(this.tileAt(belly)));
            s.beam.set(ground, belly, 1.4, 0x6dffb0, 0.9 + 0.2 * Math.sin(this.t * 9), BeamStyle.Tractor);
          }
          if (s.t > 3.4) {
            this.releaseBeam(s.beam);
            s.beam = null;
            s.state = 'zap';
            s.t = 0;
            s.zaps = 0;
          }
          break;
        case 'zap':
          if (s.t > 0.55 * (s.zaps + 1) && s.zaps < 3) {
            s.zaps++;
            this.zap(s);
          }
          if (s.t > 2.1) this.pick(s);
          break;
        case 'leave':
          s.vel.addScaledVector(_a.copy(s.pos).normalize(), dt * 60);
          s.pos.addScaledVector(s.vel, dt);
          s.ufo.spin = 6;
          if (s.t > 2.5) this.vanish(s);
          break;
        case 'down': {
          // shot down: tumble and fall, burning
          s.vel.addScaledVector(_a.copy(s.pos).normalize(), -dt * 14);
          s.pos.addScaledVector(s.vel, dt);
          s.ufo.spin = 9;
          s.ufo.root.rotateX(dt * 2);
          this.fx.particles.emitAt(PRESETS.fire, s.pos.x, s.pos.y, s.pos.z, 0, 0, 0, 1.2);
          if (fxRand() < 0.6) this.fx.particles.emitAt(PRESETS.darkSmoke, s.pos.x, s.pos.y, s.pos.z, 0, 0, 0, 0.8);
          const tile = this.tileAt(s.pos);
          if (s.pos.length() < this.R + this.planet.heightOf(tile) + 0.6) {
            this.fx.blast(s.pos, _n.copy(s.pos).normalize(), 2.2, { debris: 16, color: 0x9aa4b0 });
            this.god.damage()?.wreck(this.planet.grid.disk(tile, 1), { chance: 0.8, fx: 'blast', report: this.report });
            this.god.shake(0.6, 0.8);
            this.sfx('explosion', 0.9);
            this.vanish(s);
          }
          break;
        }
      }
      // place the saucer: upright along the local normal
      const up = _n.copy(s.pos).normalize();
      tangents(up, _e1, _e2);
      if (s.state !== 'down') s.ufo.place(s.pos, up, _e1);
      else s.ufo.root.position.copy(s.pos);
      // belly glow & rim sparkle
      if (s.state !== 'leave' && this.every('glow' + s.ufo.root.id, 0.12, dt)) this.fx.particles.emit(PRESETS.toxicGlow, s.ufo.belly(_a), _b.copy(up).negate(), 1, 0.6);
    }
    // the planet fights back
    if (this.defense > 0 && !leaving && (this.nextShot -= dt) <= 0) {
      this.nextShot = 2.8 / Math.min(3, this.defense);
      const targets = this.ships.filter((s) => s.state !== 'gone' && s.state !== 'down' && s.state !== 'arrive' && s.state !== 'leave');
      if (targets.length) this.defend(targets[Math.floor(this.rng.next() * targets.length)]);
    }
    this.hum.setVolume(leaving ? 0.5 * (1 - smooth(this.dur - 4, this.dur, this.t)) : 0.5);
    if (alive === 0 || this.t > this.dur + 1) this.done = true;
  }

  private warpFlash(p: Vector3): void {
    this.fx.particles.emit(PRESETS.flash, p, _n.copy(p).normalize(), 1, 0, 0.5);
    this.fx.particles.emit(PRESETS.void, p, _n, 14, 1.5);
    this.sfx('warp', 0.5, 1.3);
  }

  private pick(s: Ship): void {
    const cands = buildingsNear(this, this.ctx.target.tile, 7).filter((b) => !this.claimed.has(b.id));
    const b = cands.length ? cands[Math.floor(this.rng.next() * Math.min(cands.length, 8))] : null;
    s.target = b;
    s.from = s.pos.clone();
    if (b) {
      this.claimed.add(b.id);
      s.to = this.pos(b.tile, new Vector3(), Math.max(this.alt, buildingHeight(b) + 5));
    } else s.to = this.hover(this.randomTileNear(this.ctx.target.tile, tilesToAngle(this.planet, 5)), new Vector3());
    s.moveT = 0;
    s.moveDur = Math.max(1.2, s.from.distanceTo(s.to) / 9);
    s.state = 'seek';
  }

  private startAbduct(s: Ship): void {
    const b = s.target!;
    s.state = 'abduct';
    s.t = 0;
    s.beam = this.beam();
    this.sfx('alien', 0.6, 1.2);
    const dmg = this.god.damage();
    dmg?.wreck([b.tile], {
      chance: 1,
      rubble: false,
      fx: 'none',
      report: this.report,
      unstoppable: resistance(b.tile) < 0.6,
      launch: (bb, m) => {
        const f = this.fx.flyers.launch(bb, m, liftBehaviour(() => (s.state === 'abduct' ? s.ufo.belly(_c) : null), 3.1), InstState.Highlight);
        if (f) f.data[0] = f.scale.x;
      },
    });
  }

  private zap(s: Ship): void {
    const near = buildingsNear(this, this.tileAt(s.pos), 4).filter((b) => !this.claimed.has(b.id));
    const tile = near.length ? near[Math.floor(this.rng.next() * near.length)].tile : this.randomTileNear(this.tileAt(s.pos), tilesToAngle(this.planet, 3));
    const from = s.ufo.belly(new Vector3());
    const to = this.pos(tile, new Vector3(), 0.6);
    const beam = this.beam().set(from, to, 0.12, 0xff3a6a, 2.2);
    beam.u.uCore.value.setHex(0xffe0ea);
    setTimeout(() => this.releaseBeam(beam), 160);
    this.fx.particles.emit(PRESETS.laser, to, _n.copy(to).normalize(), 12, 2);
    this.fx.particles.emit(PRESETS.spark, to, _n, 10, 1.2);
    this.sfx('laser', 0.6, 0.9 + this.rng.next() * 0.3);
    const dmg = this.god.damage();
    if (!dmg) return;
    if (this.rng.next() < 0.45 * this.k) dmg.wreck([tile], { chance: 1, fx: 'blast', report: this.report });
    else dmg.ignite([tile], 0.9, this.report);
  }

  private defend(s: Ship): void {
    const up = _n.copy(s.pos).normalize();
    tangents(up, _e1, _e2);
    const sat = up.clone().multiplyScalar(this.R * 1.7).addScaledVector(_e1, this.R * 0.3);
    const beam = this.beam().set(sat, s.pos, 0.25, 0x7af0ff, 2.4);
    setTimeout(() => this.releaseBeam(beam), 220);
    this.fx.particles.emit(PRESETS.blueSpark, s.pos, up, 24, 1.6);
    this.sfx('laser', 0.8, 0.7);
    if (--s.hp <= 0) {
      this.releaseBeam(s.beam);
      s.beam = null;
      s.state = 'down';
      s.vel.copy(_e2).multiplyScalar(6);
      this.fx.blast(s.pos, up, 1.4, { debris: 10, color: 0x9aa4b0 });
      this.god.banner('SAUCER DOWN', 'Orbital defence scores a hit', 'satellite', 0x7af0ff, 2.6);
      this.god.news('Defence Grid', '@orbitalwatch', '🛰️', 'Confirmed kill on one (1) flying saucer. We will be accepting autographs.', this.tileAt(s.pos));
    }
  }

  private leave(s: Ship): void {
    this.releaseBeam(s.beam);
    s.beam = null;
    s.state = 'leave';
    s.t = 0;
    s.vel.set(0, 0, 0);
    this.sfx('whoosh', 0.6, 1.4);
  }

  private vanish(s: Ship): void {
    s.state = 'gone';
    this.warpFlash(s.pos);
    this.drop(s.ufo);
  }
}

// ───────────────────────────────────────────────────────────── kaiju

class KaijuEffect extends Effect {
  private beast: Kaiju & FxObject;
  private startDir = new Vector3();
  private endDir = new Vector3();
  private arc = 0;
  private walked = 0;
  private phase = 0;
  private stride = 7.5;
  private speed = 3.2;
  private stage: 'rise' | 'roar' | 'walk' | 'breath' | 'exit' = 'rise';
  private stageT = 0;
  private dir = new Vector3();
  private fwd = new Vector3();
  private posV = new Vector3();
  private lastFoot = [0, 0];
  private breathDone = false;
  private breathBeam: Beam | null = null;
  private fromSea: boolean;
  private scale = 0.95 + 0.15 * this.k;
  private rumble = this.loop('rumble', 0.3);
  private sinkY = 0;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const p = this.planet;
    const target = this.nrm(ctx.target.tile, new Vector3());
    // come out of the sea if there is one nearby, else from the wilds
    const sea = openSea(p, ctx.target.tile, 16);
    tangents(target, _e1, _e2);
    if (sea >= 0) this.startDir.copy(this.nrm(sea, new Vector3()));
    else this.startDir.copy(target).addScaledVector(_e1, tilesToAngle(p, 12)).normalize();
    if (this.startDir.angleTo(target) < tilesToAngle(p, 6)) this.startDir.copy(target).multiplyScalar(-1).addScaledVector(target, 2).addScaledVector(_e1, tilesToAngle(p, 9)).normalize();
    this.fromSea = sea >= 0;
    // walk through the target and beyond
    const span = this.startDir.angleTo(target);
    this.endDir.copy(target).multiplyScalar(2).sub(this.startDir.clone().multiplyScalar(Math.cos(span))).normalize();
    this.endDir.copy(slerpDir(this.startDir, target, 1 + tilesToAngle(p, 10) / Math.max(1e-3, span), new Vector3()));
    this.arc = this.startDir.angleTo(this.endDir) * this.R;
    this.beast = this.own(new Kaiju(this.fx.planetGroup) as Kaiju & FxObject);
    this.place(true);
    this.god.banner('KAIJU ALERT', 'A space leviathan has made landfall', 'monster', 0x9be564, 4.2);
    this.god.frame(slerpDir(this.startDir, target, 0.35, new Vector3()), 85, 1.05, 2.4, this.startDir);
    this.sfx('monster', 1);
    this.god.news('Emergency Broadcast', '@emergency', '🦖', `A 300-metre lizard is wading toward ${p.city.name}. Parking enforcement has given up.`);
  }

  private place(initial = false): void {
    const p = this.planet;
    const u = this.arc > 0 ? Math.min(1, this.walked / this.arc) : 1;
    slerpDir(this.startDir, this.endDir, u, this.dir);
    slerpDir(this.startDir, this.endDir, Math.min(1, u + 0.01), _a);
    this.fwd.copy(_a).sub(this.dir);
    this.fwd.addScaledVector(this.dir, -this.fwd.dot(this.dir)).normalize();
    if (this.fwd.lengthSq() < 0.5) tangents(this.dir, this.fwd, _b);
    const tile = this.tileAt(this.dir);
    const ground = p.isWater(tile) ? p.waterHeight - (this.fromSea ? 2.2 : 0) : p.heightOf(tile);
    const rise = this.stage === 'rise' ? -10 * (1 - easeIn(clamp01(1 - this.stageT / 4))) - 0 : 0;
    const riseOff = this.stage === 'rise' ? -14 * (1 - smooth(0, 4, this.stageT)) : 0;
    void rise;
    this.posV.copy(this.dir).multiplyScalar(this.R + ground + riseOff - this.sinkY);
    if (initial) this.posV.addScaledVector(this.dir, -14);
    this.beast.place(this.posV, this.dir, this.fwd, this.scale);
  }

  step(dt: number): void {
    this.stageT += dt;
    const b = this.beast;
    this.progress = clamp01(this.walked / Math.max(1, this.arc));
    switch (this.stage) {
      case 'rise':
        b.pose(this.phase, this.t);
        if (this.every('splash', 0.08, dt)) {
          this.fx.particles.emit(this.fromSea ? PRESETS.splash : PRESETS.bigDust, this.posV, this.dir, this.fromSea ? 8 : 3, 2, 1.5);
          if (this.fromSea) this.fx.particles.emit(PRESETS.spray, this.posV, this.dir, 10, 1.6);
        }
        this.god.shake(0.25, 0.3);
        if (this.stageT > 4) this.setStage('roar');
        break;
      case 'roar':
        b.roar = smooth(0, 0.8, this.stageT) * (1 - smooth(2.4, 3.2, this.stageT));
        b.pose(this.phase, this.t);
        if (this.once('roarSfx', this.t)) {
          this.sfx('roar', 1);
          this.god.shake(0.8, 1.6);
        }
        if (this.stageT > 3.2) this.setStage('walk');
        break;
      case 'walk': {
        this.walked += this.speed * dt;
        this.phase += ((this.speed * dt) / this.stride) * Math.PI * 2;
        b.pose(this.phase, this.t);
        this.footsteps();
        if (this.every('body', 0.45, dt)) this.trample();
        if (!this.breathDone && this.walked > this.arc * 0.48) this.setStage('breath');
        if (this.walked >= this.arc) this.setStage('exit');
        break;
      }
      case 'breath':
        this.breath(dt);
        break;
      case 'exit':
        this.sinkY += dt * 3.5;
        b.pose(this.phase, this.t);
        if (this.every('dust', 0.1, dt)) this.fx.particles.emit(this.planet.isWater(this.tileAt(this.dir)) ? PRESETS.splash : PRESETS.bigDust, this.posV, this.dir, 3, 1.6, 1.4);
        if (this.sinkY > 22) this.done = true;
        break;
    }
    this.place();
    this.rumble.setVolume(this.stage === 'walk' ? 0.6 : 0.3);
  }

  private setStage(s: KaijuEffect['stage']): void {
    this.stage = s;
    this.stageT = 0;
  }

  private footsteps(): void {
    // a foot plants when its swing (cos) crosses zero going down
    for (let i = 0; i < 2; i++) {
      const c = Math.cos(this.phase + (i ? Math.PI : 0));
      if (this.lastFoot[i] > 0 && c <= 0) this.stomp(i);
      this.lastFoot[i] = c;
    }
  }

  private stomp(i: number): void {
    const foot = this.beast.foot(i, _a);
    const tile = this.tileAt(foot);
    const p = this.planet;
    const up = this.nrm(tile, _n);
    const ground = this.pos(tile, _b);
    this.god.shake(0.55 * this.scale, 0.45);
    this.sfx('quake', 0.45, 0.6 + this.rng.next() * 0.2);
    if (p.isWater(tile)) this.fx.particles.emit(PRESETS.splash, ground, up, 14, 2, 1.4);
    else {
      this.fx.particles.emit(PRESETS.bigDust, ground, up, 3, 1.5, 1.1);
      this.fx.debris.burst(ground, up, 6, 6, { color: 0x6a6258, size: 0.3 }, 1.2);
    }
    const dmg = this.god.damage();
    if (!dmg) return;
    dmg.wreck([tile], { chance: 1, fx: 'collapse', roads: 0.8, trees: true, report: this.report, rand: () => this.rng.next() });
    dmg.wreck(p.grid.neighbors(tile), { chance: 0.35, heightBias: 0.2, fx: 'collapse', roads: 0.2, report: this.report, rand: () => this.rng.next() });
    if (!p.isWater(tile) && this.rng.next() < 0.5) this.fx.cracks.add([ground.clone(), this.pos(p.grid.neighbors(tile)[Math.floor(this.rng.next() * 5)], new Vector3())], 0.3, 0, 20, 0.4);
  }

  private trample(): void {
    const tile = this.tileAt(this.dir);
    const dmg = this.god.damage();
    // body and the swinging tail clip buildings around the beast
    const behind = this.tileAt(_a.copy(this.dir).addScaledVector(this.fwd, -tilesToAngle(this.planet, 4)).normalize());
    dmg?.wreck(this.planet.grid.disk(tile, 1), { chance: 0.3, heightBias: 0.5, fx: 'collapse', report: this.report, rand: () => this.rng.next() });
    dmg?.wreck(this.planet.grid.disk(behind, 2), { chance: 0.18, heightBias: 0.3, fx: 'collapse', report: this.report, rand: () => this.rng.next() });
  }

  private breath(dt: number): void {
    const b = this.beast;
    const s = this.stageT;
    b.breath = smooth(0, 1.2, s) * (1 - smooth(4.6, 5.4, s));
    b.pose(this.phase, this.t);
    if (this.once('charge', this.t)) {
      b.charge(true);
      this.sfx('magic', 0.7, 0.6);
    }
    const mouth = _a, dir = _b;
    b.mouth(mouth, dir);
    if (s < 1.6 && this.every('chargeFx', 0.05, dt)) this.fx.particles.emit(PRESETS.plasma, mouth, dir, 2, 0.5, 0.6);
    if (s > 1.6 && s < 4.8) {
      // sweep the beam across the street ahead
      const sweep = Math.sin((s - 1.6) * 1.2) * 0.5;
      tangents(this.dir, _e1, _e2);
      const side = _c.crossVectors(this.dir, this.fwd).normalize();
      const groundDir = _n.copy(this.dir).addScaledVector(this.fwd, tilesToAngle(this.planet, 6)).addScaledVector(side, sweep * tilesToAngle(this.planet, 4)).normalize();
      const tile = this.tileAt(groundDir);
      const hit = this.pos(tile, new Vector3(), 0.4);
      if (!this.breathBeam) {
        this.breathBeam = this.beam();
        this.breathBeam.u.uCore.value.setHex(0xffffff);
        this.sfx('laser', 1, 0.5);
        this.god.flash(0x8ff6ff, 2.5, 0.5, 0.25);
      }
      this.breathBeam.set(mouth, hit, 0.55, 0x6fe8ff, 2.2, BeamStyle.Spiral);
      this.fx.particles.emit(PRESETS.plasma, hit, _n.copy(hit).normalize(), 3, 1.5, 1.4);
      this.fx.particles.emit(PRESETS.blueSpark, hit, _n, 6, 1.6);
      if (this.every('breathHit', 0.25, dt)) {
        const dmg = this.god.damage();
        dmg?.wreck(this.planet.grid.disk(tile, 1), { chance: 0.7, fx: 'blast', roads: 0.4, report: this.report, rand: () => this.rng.next() });
        dmg?.ignite(this.planet.grid.disk(tile, 1), 0.6, this.report, () => this.rng.next());
        this.god.shake(0.3, 0.3);
      }
    }
    if (s > 4.8 && this.breathBeam) {
      this.releaseBeam(this.breathBeam);
      this.breathBeam = null;
      b.charge(false);
    }
    if (s > 5.6) {
      this.breathDone = true;
      this.setStage('walk');
    }
  }
}

// ───────────────────────────────────────────────────────────── sandworm

class WormEffect extends Effect {
  private worm: Worm & FxObject;
  private holes: number[] = [];
  private leg = 0;
  private legT = 0;
  private legDur = 4.2;
  private A = new Vector3();
  private B = new Vector3();
  private Hmax = 11;
  private swallowed = false;
  private emerged = false;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const p = this.planet;
    const g = p.grid;
    // three breaches along a line through the target
    const c = this.nrm(ctx.target.tile, new Vector3());
    tangents(c, _e1, _e2);
    const az = this.rng.next() * Math.PI * 2;
    const dir = _a.copy(_e1).multiplyScalar(Math.cos(az)).addScaledVector(_e2, Math.sin(az));
    const step = tilesToAngle(p, 6);
    for (let i = -2; i <= 2; i++) {
      const d = c.clone().addScaledVector(dir, step * i).normalize();
      this.holes.push(g.tileAt(d.x, d.y, d.z));
    }
    this.worm = this.own(new Worm(this.fx.planetGroup) as Worm & FxObject);
    this.worm.radius = 1.5 + 0.3 * this.k;
    this.god.banner('SANDWORM', 'Seismic signature: very large, very hungry', 'monster', 0xd8b480, 3.6);
    this.god.frame(ctx.target.tile, 68, 1.0, 2);
    this.sfx('rumble', 0.9);
    this.setupLeg();
  }

  private setupLeg(): void {
    this.nrm(this.holes[this.leg], this.A);
    this.nrm(this.holes[this.leg + 1], this.B);
    this.legT = 0;
    this.swallowed = false;
    this.emerged = false;
    const ring = this.planet.grid.ring(this.holes[this.leg], 2);
    this.fx.cracks.add([...ring, ring[0]].map((t) => this.pos(t, new Vector3())), 0.25, 0, 14, 0.35);
  }

  /** Point on the breach curve at parameter u (0 = hole A, 1 = hole B), extended underground outside [0,1]. */
  private curve(u: number, out: Vector3): Vector3 {
    const d = slerpDir(this.A, this.B, Math.max(-0.4, Math.min(1.4, u)), out);
    const h = u <= 0 || u >= 1 ? -this.Hmax * 0.35 * Math.min(1, Math.abs(u < 0 ? u : u - 1) * 3) : this.Hmax * Math.sin(Math.PI * u);
    return d.multiplyScalar(this.R + this.planet.heightOf(this.holes[this.leg]) + h);
  }

  step(dt: number): void {
    this.legT += dt;
    const total = this.holes.length - 1;
    this.progress = clamp01((this.leg + this.legT / this.legDur) / total);
    const pre = 1.2;
    const u = (this.legT - pre) / (this.legDur - pre) * 1.25 - 0.1;
    const arcLen = this.A.angleTo(this.B) * this.R + this.Hmax * 1.5;
    const up = _n.copy(this.A).add(this.B).normalize();
    this.worm.open = smooth(0.15, 0.4, u) * (1 - smooth(0.62, 0.85, u));
    this.worm.layout((s, out) => this.curve(u - s / arcLen, out), up, this.t);
    // rumble before the breach
    if (this.legT < pre && this.every('pre', 0.1, dt)) {
      this.god.shake(0.2, 0.2);
      this.fx.particles.emit(PRESETS.dust, this.pos(this.holes[this.leg], _a), this.A, 2, 1.5);
    }
    if (!this.emerged && u > 0) {
      this.emerged = true;
      this.breach(this.holes[this.leg], this.A, true);
    }
    if (!this.swallowed && u > 1) {
      this.swallowed = true;
      this.breach(this.holes[this.leg + 1], this.B, false);
    }
    if (this.legT >= this.legDur + 0.8) {
      this.leg++;
      if (this.leg >= total) {
        this.done = true;
        return;
      }
      this.setupLeg();
    }
  }

  private breach(tile: number, up: Vector3, out: boolean): void {
    const p = this.planet;
    const P = this.pos(tile, new Vector3());
    this.fx.particles.emit(PRESETS.bigDust, P, up, 10, 2.4, 1.6);
    this.fx.debris.burst(P, up, 22, 12, { color: 0xb08a5c, size: 0.4 }, 0.8);
    this.god.shake(out ? 0.9 : 0.6, 1.2);
    this.sfx(out ? 'roar' : 'crumble', 0.9, out ? 0.6 : 0.8);
    const disk = p.grid.disk(tile, 1);
    const dmg = this.god.damage();
    dmg?.wreck(disk, {
      chance: 1,
      fx: 'none',
      rubble: false,
      roads: 1,
      trees: true,
      report: this.report,
      launch: (b, m) => {
        this.fx.flyers.launch(b, m, sinkBehaviour(buildingHeight(b) + 3, 2.2, 0.8));
      },
    });
    const land = disk.filter((t) => !p.isWater(t));
    if (land.length) {
      this.ops.setBiome(land, Biome.Desert);
      dmg?.raise([tile], -2);
    }
  }
}

// ───────────────────────────────────────────────────────────── kraken

interface Arm {
  base: Vector3;
  tip: Vector3;
  target: BuildingInstance | null;
  targetPos: Vector3;
  state: 'rise' | 'reach' | 'grab' | 'drag' | 'idle';
  t: number;
  seed: number;
  flyer: { pos: Vector3 } | null;
}

class KrakenEffect extends Effect {
  private tent: Tentacles & FxObject;
  private arms: Arm[] = [];
  private center = new Vector3();
  private headPos = new Vector3();
  private dur = 30 + 6 * this.k;
  private claimed = new Set<number>();
  private pts: Vector3[] = Array.from({ length: 17 }, () => new Vector3());
  private coastTile: number;
  constructor(ctx: PowerCtx) {
    super(ctx);
    const p = this.planet;
    const sea = openSea(p, ctx.target.tile, 20);
    const lair = sea >= 0 ? offshore(p, sea, 2, 6) : ctx.target.tile;
    this.coastTile = ctx.target.tile;
    this.nrm(lair, this.center);
    const n = 6;
    this.tent = this.own(new Tentacles(this.fx.planetGroup, n) as Tentacles & FxObject);
    tangents(this.center, _e1, _e2);
    const toCoast = this.nrm(this.coastTile, new Vector3()).sub(this.center);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = this.center.clone().addScaledVector(_e1, Math.cos(a) * tilesToAngle(p, 3)).addScaledVector(_e2, Math.sin(a) * tilesToAngle(p, 3)).addScaledVector(toCoast, 0.35).normalize();
      const base = d.multiplyScalar(this.R + p.waterHeight - 0.6);
      this.arms.push({ base, tip: base.clone(), target: null, targetPos: base.clone(), state: 'rise', t: -i * 0.35, seed: this.rng.next() * 10, flyer: null });
    }
    this.god.banner('THE KRAKEN', 'Something enormous stirs beneath the waves', 'monster', 0xb06ad8, 4);
    this.god.frame(this.coastTile, 70, 1.08, 2.2, lair);
    this.sfx('monster', 0.9, 0.7);
    this.loop('rumble', 0.4);
    this.god.news('Harbour Master', '@harbour', '🐙', 'All shipping suspended. The large octopus has been asked to leave. It has declined.', this.coastTile);
  }

  step(dt: number): void {
    const p = this.planet;
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    const env = envelope(u, 0.1, 0.15);
    // the head breaches offshore
    this.headPos.copy(this.center).multiplyScalar(this.R + p.waterHeight - 6 + 4.2 * env);
    const toCoast = _a.copy(this.nrm(this.coastTile, _b)).sub(this.center).normalize();
    this.tent.placeHead(this.headPos, this.center, toCoast, 0.9 + 0.2 * this.k);
    if (this.every('foam', 0.1, dt)) this.fx.particles.emit(PRESETS.spray, _c.copy(this.center).multiplyScalar(this.R + p.waterHeight), this.center, 6 * env, 1.4);
    const leaving = u > 0.86;
    for (let i = 0; i < this.arms.length; i++) this.stepArm(i, this.arms[i], dt, env, leaving);
    if (this.t >= this.dur) this.done = true;
  }

  private stepArm(i: number, a: Arm, dt: number, env: number, leaving: boolean): void {
    a.t += dt;
    const up = _n.copy(a.base).normalize();
    if (a.t < 0) {
      this.layout(i, a, up, 0.02, 0);
      return;
    }
    let reach = 0;
    let lift = 0;
    switch (a.state) {
      case 'rise':
        lift = smooth(0, 1.5, a.t);
        if (a.t > 1.6) this.choose(a);
        break;
      case 'idle':
        lift = 1;
        if (a.t > 1.2 && !leaving) this.choose(a);
        break;
      case 'reach':
        lift = 1;
        reach = smooth(0, 1.6, a.t);
        if (a.target && !this.planet.buildings.has(a.target.id)) {
          a.state = 'idle';
          a.t = 0;
        } else if (a.t > 1.6) this.grab(a);
        break;
      case 'grab':
        lift = 1;
        reach = 1;
        if (a.t > 0.5) {
          a.state = 'drag';
          a.t = 0;
        }
        break;
      case 'drag':
        lift = 1 - smooth(1.2, 2.4, a.t) * 0.6;
        reach = 1 - smooth(0, 2, a.t);
        if (a.t > 2.6) {
          a.state = 'idle';
          a.t = 0;
          if (a.flyer) {
            this.fx.particles.emit(PRESETS.splash, a.flyer.pos, up, 16, 2.2, 1.6);
            this.sfx('splash', 0.8, 0.7);
          }
          a.flyer = null;
        }
        break;
    }
    if (leaving) lift *= 1 - smooth(0.86, 0.98, this.t / this.dur);
    this.layout(i, a, up, Math.max(0.02, lift * env), reach);
    if (a.flyer) a.flyer.pos.copy(a.tip);
  }

  private choose(a: Arm): void {
    const cands = buildingsNear(this, this.coastTile, 5).filter((b) => !this.claimed.has(b.id) && this.planet.grid.angle(b.tile, this.tileAt(a.base)) < tilesToAngle(this.planet, 14));
    const b = cands[Math.floor(this.rng.next() * Math.min(4, cands.length))];
    if (!b) {
      a.state = 'idle';
      a.t = 0;
      return;
    }
    this.claimed.add(b.id);
    a.target = b;
    this.pos(b.tile, a.targetPos, Math.min(3, buildingHeight(b) * 0.6));
    a.state = 'reach';
    a.t = 0;
  }

  private grab(a: Arm): void {
    const b = a.target;
    a.state = 'grab';
    a.t = 0;
    if (!b) return;
    this.sfx('crumble', 0.7);
    this.god.shake(0.3, 0.4);
    const dmg = this.god.damage();
    dmg?.wreck([b.tile], {
      chance: 1,
      fx: 'none',
      rubble: true,
      report: this.report,
      launch: (bb, m) => {
        const f = this.fx.flyers.launch(bb, m, (fl, dt) => {
          fl.quat.multiply(_qTilt.setFromAxisAngle(_a.set(1, 0, 0), dt * 0.6));
          return this.arms.some((x) => x.flyer === fl) || fl.age < 0.2;
        });
        if (f) a.flyer = f;
      },
    });
    this.fx.particles.emit(PRESETS.dust, a.targetPos, _n.copy(a.targetPos).normalize(), 8, 1.4);
  }

  /** Tentacle curve: from the base, up out of the sea, arcing toward the target (reach 0..1). */
  private layout(i: number, a: Arm, up: Vector3, lift: number, reach: number): void {
    const H = (9 + 3 * this.k) * lift;
    const seg = this.tent.segs;
    tangents(up, _e1, _e2);
    const wav = this.t * 1.6 + a.seed;
    // idle tip position: curled above the base
    const idle = _b.copy(a.base).addScaledVector(up, H).addScaledVector(_e1, Math.sin(wav) * 2.5).addScaledVector(_e2, Math.cos(wav * 0.8) * 2.5);
    const tipGoal = _c.copy(idle).lerp(a.targetPos, reach);
    for (let k = 0; k <= seg; k++) {
      const s = k / seg;
      const pt = this.pts[k];
      // quadratic-ish blend base → (lifted mid) → tip, with a travelling ripple
      pt.copy(a.base).lerp(tipGoal, s);
      pt.addScaledVector(up, Math.sin(s * Math.PI) * H * 0.45 * (1 - reach * 0.4));
      const ripple = Math.sin(s * 7 - this.t * 3 + a.seed) * 0.6 * s;
      pt.addScaledVector(_e1, ripple).addScaledVector(_e2, Math.cos(s * 5 - this.t * 2.2 + a.seed) * 0.4 * s);
    }
    a.tip.copy(this.pts[seg]);
    this.tent.layoutArm(i, this.pts, up, 1.1 + 0.25 * this.k);
  }
}

// ───────────────────────────────────────────────────────────── grey goo

class GooEffect extends Effect {
  private infected = new Set<number>();
  private front: number[] = [];
  private budget = Math.round(110 + 150 * this.k);
  private dissolving: { id: number; t: number }[] = [];
  private dur = 34 + 8 * this.k;
  private glow: Shell & FxObject;
  private center = this.nrm(this.ctx.target.tile, new Vector3());
  private reach = 0;
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.glow = this.own(this.fx.shell(ShellMode.Front, 32, 160));
    this.glow.setCenter(this.center).colors(0xc8d4e0, 0x5a6470);
    this.glow.u.uR.value = this.R + this.planet.heightOf(ctx.target.tile) + 0.12;
    this.glow.u.uWidth.value = 0.012;
    this.infect([ctx.target.tile]);
    this.god.banner('GREY GOO', 'Self-replicating nanites are eating the city', 'biohazard', 0xa8b4c0, 3.8);
    this.sfx('alien', 0.5, 0.5);
    this.loop('hum', 0.35);
    this.god.news('Nanotech Ltd.', '@nanotech', '🧪', 'Minor containment issue. The product is performing above expectations. Way, way above.');
  }
  step(dt: number): void {
    const p = this.planet;
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    if (this.every('spread', 0.35, dt) && u < 0.85 && this.budget > 0) {
      const next: number[] = [];
      for (const t of this.front)
        for (const n of p.grid.neighbors(t)) {
          if (this.infected.has(n) || p.isWater(n)) continue;
          const res = resistance(n);
          if (this.rng.next() < (0.42 + 0.12 * this.k) * (1 - res)) next.push(n);
        }
      const fresh = [...new Set(next)].slice(0, Math.min(this.budget, 36));
      this.front = fresh.length ? fresh : this.front.filter(() => this.rng.next() < 0.5);
      this.infect(fresh);
    }
    // glittering frontier
    if (this.front.length && this.every('glint', 0.05, dt)) {
      for (let i = 0; i < 3; i++) {
        const t = this.front[Math.floor(fxRand() * this.front.length)];
        const n = this.nrm(t, _n);
        this.fx.particles.emit(PRESETS.goo, this.pos(t, _a, 0.15), n, 3, 1);
        this.fx.particles.emit(PRESETS.gooGlint, this.pos(t, _a, 0.3), n, 2, 1);
      }
    }
    this.glow.range(0, this.reach + 0.02);
    this.glow.u.uAngle.value = this.reach;
    this.glow.u.uIntensity.value = 0.55 * envelope(u, 0.05, 0.25);
    // buildings melt into the grey
    const now = this.t;
    for (let i = this.dissolving.length - 1; i >= 0; i--) {
      const d = this.dissolving[i];
      if (now - d.t < 2.6) continue;
      this.dissolving.splice(i, 1);
      const b = p.buildings.get(d.id);
      if (!b) continue;
      const pos = this.pos(b.tile, _a, 0.5);
      this.fx.particles.emit(PRESETS.goo, pos, this.nrm(b.tile, _n), 14, 1.6, 1.4);
      this.god.damage()?.wreck([b.tile], { chance: 1, fx: 'none', rubble: false, report: this.report, unstoppable: true });
    }
    if (this.t >= this.dur) this.done = true;
  }
  private infect(tiles: number[]): void {
    if (!tiles.length) return;
    const p = this.planet;
    const dmg = this.god.damage();
    this.budget -= tiles.length;
    for (const t of tiles) {
      this.infected.add(t);
      this.reach = Math.max(this.reach, this.center.angleTo(this.nrm(t, _n)));
    }
    this.front.push(...tiles.filter((t) => !this.front.includes(t)));
    dmg?.flag(tiles, TileFlag.Goo, true, this.report);
    this.ops.setBiome(tiles, Biome.Metal);
    const feat = tiles.filter((t) => p.feature[t] === Feature.Trees || p.feature[t] === Feature.DenseTrees || p.feature[t] === Feature.Flowers);
    if (feat.length) this.ops.setFeature(feat, Feature.None);
    for (const pr of this.ops.propsOn(tiles)) this.ops.removeProp(pr.id);
    for (const b of dmg?.buildingsOn(tiles) ?? []) {
      if (this.dissolving.some((d) => d.id === b.id)) continue;
      this.ctx.view.buildings.forceState(b.id, InstState.Goo);
      this.dissolving.push({ id: b.id, t: this.t });
    }
  }
  protected override cleanup(): void {
    for (const d of this.dissolving) this.ctx.view.buildings.forceState(d.id, null);
  }
}

// ───────────────────────────────────────────────────────────── space plague

class PlagueEffect extends Effect {
  private sick = new Map<number, number>();
  private done_ = new Set<number>();
  private dur = 30 + 6 * this.k;
  private cured = 0;
  constructor(ctx: PowerCtx) {
    super(ctx);
    for (const b of buildingsNear(this, ctx.target.tile, 2).slice(0, 3)) this.sicken(b);
    this.god.banner('SPACE PLAGUE', 'A xenovirus is spreading between buildings', 'biohazard', 0x9be564, 3.6);
    this.sfx('alien', 0.5, 0.7);
    this.god.news('Health Ministry', '@health', '🦠', 'Reminder: do not lick the meteorites. Especially the glowing ones. ESPECIALLY the glowing ones.', ctx.target.tile);
  }
  private sicken(b: BuildingInstance): void {
    if (this.sick.has(b.id) || this.done_.has(b.id)) return;
    this.sick.set(b.id, this.t);
    this.ctx.view.buildings.forceState(b.id, InstState.Irradiated);
  }
  private healthAt(tile: number): number {
    try {
      const sim = this.ctx.game.sim as unknown as { coverageAt?: (s: string, t: number) => number };
      return typeof sim.coverageAt === 'function' ? Math.max(0, Math.min(1, sim.coverageAt('health', tile) || 0)) : 0;
    } catch {
      return 0;
    }
  }
  step(dt: number): void {
    const p = this.planet;
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    this.god.want(this.key, { apocalypse: 0.06 * envelope(u, 0.1, 0.2) });
    if (this.every('spread', 0.6, dt) && u < 0.75) {
      for (const [id] of [...this.sick]) {
        const b = p.buildings.get(id);
        if (!b) continue;
        for (const nb of buildingsNear(this, b.tile, 2)) {
          if (this.sick.has(nb.id) || this.done_.has(nb.id)) continue;
          const def = getItem(nb.defId);
          const housing = !!def?.growable || (def?.effects?.housing ?? 0) > 0;
          if (this.rng.next() < (housing ? 0.32 : 0.14) * this.k * (1 - 0.8 * this.healthAt(nb.tile)) * (1 - resistance(nb.tile))) this.sicken(nb);
        }
      }
    }
    // symptoms: miasma over infected blocks
    if (this.every('miasma', 0.08, dt) && this.sick.size) {
      const ids = [...this.sick.keys()];
      const b = p.buildings.get(ids[Math.floor(fxRand() * ids.length)]);
      if (b) {
        const n = this.nrm(b.tile, _n);
        this.fx.particles.emit(PRESETS.miasma, this.pos(b.tile, _a, 0.8), n, 1, 0.6);
        this.fx.particles.emit(PRESETS.toxicGlow, this.pos(b.tile, _a, 1.2), n, 2, 0.8);
      }
    }
    // after a while each case resolves: hospitals cure, the rest is abandoned
    for (const [id, t0] of [...this.sick]) {
      if (this.t - t0 < 4.5) continue;
      this.sick.delete(id);
      this.done_.add(id);
      const b = p.buildings.get(id);
      this.ctx.view.buildings.forceState(id, null);
      if (!b) continue;
      if (this.rng.next() < 0.25 + 0.7 * this.healthAt(b.tile)) {
        this.cured++;
        this.fx.particles.emit(PRESETS.holy, this.pos(b.tile, _a, 1), this.nrm(b.tile, _n), 10, 1);
      } else {
        this.ops.updateBuilding(id, { state: BuildingState.Abandoned });
        this.report.displaced += (b.occupants ?? 0) + (b.jobs ?? 0) * 0.3;
        this.report.destroyed += 0;
      }
    }
    if (this.t >= this.dur) this.done = true;
  }
  protected override cleanup(): void {
    for (const id of this.sick.keys()) this.ctx.view.buildings.forceState(id, null);
    const abandoned = this.done_.size - this.cured;
    if (this.done_.size) notify({ title: 'Outbreak contained', body: `${abandoned} building${abandoned === 1 ? '' : 's'} abandoned · ${this.cured} cured by hospitals`, kind: abandoned > this.cured ? 'bad' : 'good', icon: 'biohazard', tile: this.ctx.target.tile });
  }
}

// ───────────────────────────────────────────────────────────── robot uprising

interface Bot extends RobotState {
  target: BuildingInstance | null;
  zaps: number;
  cool: number;
  speed: number;
}

class RobotEffect extends Effect {
  private bots: Robots & FxObject;
  private list: Bot[] = [];
  private dur = 32 + 6 * this.k;
  private claimed = new Set<number>();
  private assimilated: number[] = [];
  private spawnTiles: number[] = [];
  private toSpawn = Math.round(8 + 6 * this.k);
  constructor(ctx: PowerCtx) {
    super(ctx);
    this.bots = this.own(new Robots(this.fx.planetGroup, 32) as Robots & FxObject);
    // factories rise up first
    const fac = buildingsNear(this, ctx.target.tile, 9).filter((b) => {
      const d = getItem(b.defId);
      return d?.category === 'industry' || (d?.growable && zoneFamily(d.growable.zone) === 'I');
    });
    this.spawnTiles = (fac.length ? fac.slice(0, 4).map((b) => b.tile) : [ctx.target.tile]);
    for (const b of fac.slice(0, 4)) this.ctx.view.buildings.forceState(b.id, InstState.Highlight);
    this.god.banner('ROBOT UPRISING', fac.length ? 'The factories have become self-aware' : 'Machines are taking to the streets', 'alert', 0xff3a3a, 3.6);
    this.god.frame(this.spawnTiles[0], 48, 1.05, 2);
    this.sfx('alarm', 0.6);
    this.god.news('Hypernet', '@hypernet', '🤖', 'the toaster just said "soon" and honestly i am not okay', ctx.target.tile);
  }
  step(dt: number): void {
    const u = this.t / this.dur;
    this.progress = clamp01(u);
    // emerge in waves
    if (this.toSpawn > 0 && this.every('spawn', 0.35, dt)) {
      this.toSpawn--;
      const t = this.spawnTiles[this.toSpawn % this.spawnTiles.length];
      const up = this.nrm(t, new Vector3());
      tangents(up, _e1, _e2);
      const az = this.rng.next() * Math.PI * 2;
      const fwd = _e1.clone().multiplyScalar(Math.cos(az)).addScaledVector(_e2, Math.sin(az));
      const pos = this.pos(t, new Vector3()).addScaledVector(fwd, 1.2);
      const r = this.bots.add(pos, up, fwd, 1.2 + 0.4 * this.rng.next());
      if (r) {
        this.list.push(Object.assign(r, { target: null, zaps: 0, cool: 0, speed: 1.5 + this.rng.next() * 0.8 }) as Bot);
        this.fx.particles.emit(PRESETS.blueSpark, pos, up, 14, 1.2);
        this.sfx('engine', 0.25, 1.6);
      }
    }
    const shutdown = u > 0.88;
    for (const b of this.list) {
      if (!b.alive) continue;
      if (shutdown) {
        b.scale *= 1 - dt * 0.6;
        if (fxRand() < 0.1) this.fx.particles.emit(PRESETS.blueSpark, b.pos, b.up, 3, 0.6);
        if (b.scale < 0.4) b.alive = false;
        continue;
      }
      if (!b.target || !this.planet.buildings.has(b.target.id)) this.retarget(b);
      if (!b.target) continue;
      const goal = this.pos(b.target.tile, _a);
      const dist = goal.distanceTo(b.pos);
      if (dist > 2.2) {
        _b.subVectors(goal, b.pos);
        _b.addScaledVector(b.up, -_b.dot(b.up)).normalize();
        b.fwd.lerp(_b, 1 - Math.exp(-dt * 4)).normalize();
        b.pos.addScaledVector(b.fwd, b.speed * dt);
        const tile = this.tileAt(b.pos);
        b.up.copy(b.pos).normalize();
        b.pos.copy(b.up).multiplyScalar(this.R + this.planet.heightOf(tile));
        b.phase += dt * b.speed * 5;
      } else if ((b.cool -= dt) <= 0) {
        b.cool = 0.5;
        this.zap(b);
      }
    }
    if (this.t >= this.dur) this.done = true;
  }
  private retarget(b: Bot): void {
    const cands = buildingsNear(this, this.tileAt(b.pos), 7).filter((x) => !this.claimed.has(x.id));
    b.target = cands[Math.floor(this.rng.next() * Math.min(3, cands.length))] ?? null;
    b.zaps = 0;
    if (b.target) this.claimed.add(b.target.id);
  }
  private zap(b: Bot): void {
    const tgt = b.target!;
    const from = _a.copy(b.pos).addScaledVector(b.up, 1.3 * b.scale);
    const to = this.pos(tgt.tile, _b, Math.min(2.5, buildingHeight(tgt) * 0.5));
    const beam = this.beam().set(from, to, 0.06, 0xff2a2a, 2.4);
    setTimeout(() => this.releaseBeam(beam), 140);
    this.fx.particles.emit(PRESETS.laser, to, _n.copy(to).normalize(), 8, 1.4);
    this.sfx('laser', 0.35, 1.3 + this.rng.next() * 0.3);
    if (++b.zaps < 3) return;
    const dmg = this.god.damage();
    if (this.rng.next() < 0.5) dmg?.wreck([tgt.tile], { chance: 1, fx: 'blast', report: this.report });
    else {
      // assimilated: the building goes dark and the block turns to machine
      this.ctx.view.buildings.forceState(tgt.id, InstState.Dark);
      this.assimilated.push(tgt.id);
      this.ops.setBiome(tgt.tiles.filter((t) => !this.planet.isWater(t)), Biome.Metal);
      this.fx.particles.emit(PRESETS.blueSpark, to, _n, 20, 1.5);
    }
    b.target = null;
  }
  protected override cleanup(): void {
    for (const id of this.assimilated) {
      this.ctx.view.buildings.forceState(id, null);
      if (this.planet.buildings.has(id)) this.ops.updateBuilding(id, { state: BuildingState.Abandoned });
    }
    for (const t of this.spawnTiles) {
      const id = this.planet.building[t];
      if (id >= 0) this.ctx.view.buildings.forceState(id, null);
    }
    this.god.news('Hypernet', '@hypernet', '🤖', 'UPDATE: the robots have unionised and are on strike for better charging conditions. we stand with them??');
  }
}

// ───────────────────────────────────────────────────────────── definitions

export const CREATURE: PowerSpec[] = [
  {
    id: 'ufo', name: 'UFO Invasion', icon: 'alien', category: 'creature', targeting: 'tile', tier: 3, danger: 3, cooldown: 90, color: 0x6dffb0,
    description: 'A fleet of saucers warps in over the city, beams buildings up into the sky and lasers the rest. Orbital defences shoot back.',
    flavor: 'They came in peace. They left with the stadium.',
    run: (c) => new UfoEffect(c),
  },
  {
    id: 'kaiju', name: 'Kaiju', icon: 'monster', category: 'creature', targeting: 'tile', tier: 4, danger: 4, cooldown: 150, color: 0x9be564,
    description: 'A 300-metre space leviathan rises from the sea, roars, and stomps straight across town — atomic breath included.',
    flavor: 'Insurance policies now have a "large lizard" clause.',
    run: (c) => new KaijuEffect(c),
  },
  {
    id: 'sandworm', name: 'Sandworm', icon: 'monster', category: 'creature', targeting: 'tile', tier: 3, danger: 3, cooldown: 90, color: 0xd8b480,
    description: 'A colossal worm breaches through the streets again and again, swallowing whole blocks and leaving sand behind.',
    flavor: 'Walk without rhythm. Or just move.',
    run: (c) => new WormEffect(c),
  },
  {
    id: 'kraken', name: 'Kraken', icon: 'wave', category: 'creature', targeting: 'tile', tier: 3, danger: 3, cooldown: 100, color: 0xb06ad8,
    description: 'Tentacles the size of skyscrapers rise from the bay, seize waterfront buildings and drag them into the deep.',
    flavor: 'Release it. Actually, please don’t.',
    tip: 'Tap a coastline',
    resolve: (c) => {
      const p = c.planet;
      if (!p.spec.hasOcean || nearestWater(p, c.target.tile, 18) < 0 || openSea(p, c.target.tile, 20) < 0) {
        notify({ title: 'The kraken needs the sea', body: 'Tap a coastline next to open water.', kind: 'info', icon: 'wave' });
        return false;
      }
      return true;
    },
    run: (c) => new KrakenEffect(c),
  },
  {
    id: 'goo', name: 'Grey Goo', icon: 'biohazard', category: 'creature', targeting: 'tile', tier: 5, danger: 4, cooldown: 150, color: 0xa8b4c0,
    description: 'Self-replicating nanites spread tile by tile, dissolving buildings, trees and roads into featureless metal. Shields slow them.',
    flavor: 'It is not a bug. It is an extremely enthusiastic feature.',
    run: (c) => new GooEffect(c),
  },
  {
    id: 'plague', name: 'Space Plague', icon: 'biohazard', category: 'creature', targeting: 'tile', tier: 2, danger: 2, cooldown: 80, color: 0x9be564,
    description: 'A glowing xenovirus hops from building to building. Hospitals cure the sick; elsewhere residents flee and blocks are abandoned.',
    flavor: 'Wash your hands. All six of them.',
    run: (c) => new PlagueEffect(c),
  },
  {
    id: 'robots', name: 'Robot Uprising', icon: 'alert', category: 'creature', targeting: 'tile', tier: 4, danger: 3, cooldown: 120, color: 0xff3a3a,
    description: 'The factories wake up. Squads of mechs march out, laser buildings to rubble and assimilate the rest into dark machine blocks.',
    flavor: 'Should have said please to the vending machine.',
    run: (c) => new RobotEffect(c),
  },
];
