/**
 * OWNER: life.
 * Fauna — flocks over the land the camera looks at, chosen by planet type and what lies below:
 *   terran-like worlds: gulls over coasts, swallows and starlings inland · jungle: parrots · desert / savanna:
 *   circling vultures · arctic / tundra: snow geese in V formation · volcanic: ember-birds · toxic: spore bats ·
 *   fungal: lantern moths · crystal: prism moths · machine worlds: maintenance-drone swarms · airless worlds: none.
 * Three formations (swarm, thermal circle, V), three-frame wing flaps with glides, gentle wandering paths.
 * Flocks stay near the camera focus and quietly relocate when you look elsewhere.
 */
import { Vector3 } from 'three';
import { game } from '../../game/instance';
import type { PlanetTypeId } from '../../core/types';
import { firstFree, frameFwd, frameUp, newFrame, roll, smoothstep } from './common';
import type { FleetKey, LifeCtx } from './ctx';
import { linHex } from './batch';

type Formation = 'swarm' | 'circle' | 'vee';

interface Species {
  glow: boolean;
  colors: number[];
  size: number;
  flap: number;
  glide: number;
  formation: Formation;
  count: [number, number];
  alt: [number, number];
  speed: number;
}

const SP: Record<string, Species> = {
  gull: { glow: false, colors: [0xf6f7f9, 0xe0e4ea, 0xd0d6de], size: 1.15, flap: 1.6, glide: 0.55, formation: 'circle', count: [5, 9], alt: [1.4, 2.6], speed: 0.6 },
  swallow: { glow: false, colors: [0x2a2e3a, 0x3a3440, 0x5a4a3a, 0x8a5a3a], size: 0.85, flap: 3.2, glide: 0.2, formation: 'swarm', count: [8, 14], alt: [1.6, 3.2], speed: 0.9 },
  parrot: { glow: false, colors: [0xe8322a, 0x2ab84a, 0x2a7ae8, 0xf2c22a, 0x18b3a8], size: 1.0, flap: 3.4, glide: 0.1, formation: 'swarm', count: [6, 11], alt: [1.4, 2.6], speed: 0.8 },
  vulture: { glow: false, colors: [0x4a3a2e, 0x5a4636, 0x3a2e26], size: 2.1, flap: 0.8, glide: 0.8, formation: 'circle', count: [3, 6], alt: [2.6, 4.4], speed: 0.45 },
  goose: { glow: false, colors: [0xf4f6f8, 0xc8ccd2, 0x8a8e96], size: 1.4, flap: 2.0, glide: 0.15, formation: 'vee', count: [7, 11], alt: [2.6, 4.0], speed: 0.85 },
  ember: { glow: true, colors: [0xff6a1a, 0xffa02a, 0xff3a1a], size: 1.1, flap: 2.6, glide: 0.4, formation: 'swarm', count: [6, 10], alt: [1.8, 3.4], speed: 0.8 },
  sporebat: { glow: true, colors: [0x9aff3a, 0xc05aff, 0x6aff9a], size: 1.0, flap: 3.8, glide: 0.1, formation: 'swarm', count: [7, 12], alt: [1.2, 2.6], speed: 0.7 },
  lantern: { glow: true, colors: [0x3affd8, 0xff5ad8, 0xffd84a], size: 0.9, flap: 2.2, glide: 0.3, formation: 'swarm', count: [8, 14], alt: [1.0, 2.2], speed: 0.45 },
  prism: { glow: true, colors: [0x7af0ff, 0xff8af0, 0xc8a0ff], size: 1.0, flap: 2.8, glide: 0.35, formation: 'circle', count: [6, 10], alt: [1.4, 2.8], speed: 0.55 },
  drone: { glow: true, colors: [0xe8f4ff, 0x7ae8ff], size: 0.8, flap: 6.0, glide: 0, formation: 'vee', count: [5, 9], alt: [2.0, 3.6], speed: 1.1 },
};

function speciesFor(type: PlanetTypeId, overWater: boolean, rand: number): Species | null {
  switch (type) {
    case 'barren':
      return null;
    case 'desert':
      return rand < 0.7 ? SP.vulture : SP.swallow;
    case 'arctic':
    case 'tundra':
      return overWater ? SP.gull : rand < 0.6 ? SP.goose : SP.swallow;
    case 'jungle':
      return overWater ? SP.gull : rand < 0.7 ? SP.parrot : SP.swallow;
    case 'volcanic':
      return SP.ember;
    case 'toxic':
      return SP.sporebat;
    case 'fungal':
      return SP.lantern;
    case 'crystal':
      return SP.prism;
    case 'machine':
      return SP.drone;
    default:
      return overWater ? SP.gull : rand < 0.18 ? SP.goose : rand < 0.3 ? SP.vulture : SP.swallow;
  }
}

class Flock {
  active = false;
  species: Species = SP.swallow;
  centre = new Vector3();
  heading = new Vector3();
  alt = 2;
  turn = 0;
  n = 8;
  born = -10;
  dying = -1;
  phase = new Float32Array(16);
  offs = new Float32Array(16 * 3);
  col = new Float32Array(16 * 3);
}

const _up = new Vector3();
const _p = new Vector3();
const _d = new Vector3();
const _r = new Vector3();
const _fr = newFrame();
const KEYS_N: FleetKey[] = ['birdUp', 'birdMid', 'birdDown'];
const KEYS_G: FleetKey[] = ['glowUp', 'glowMid', 'glowDown'];

export class Fauna {
  private flocks: Flock[] = [];
  private airless = false;
  visible = 0;

  constructor(ctx: { planet: { spec: { atmosphere: { density: number }; type: PlanetTypeId } } }) {
    for (let i = 0; i < 5; i++) this.flocks.push(new Flock());
    this.airless = ctx.planet.spec.atmosphere.density < 0.12 && ctx.planet.spec.type !== 'machine';
  }

  private focus(_ctx: LifeCtx): number {
    return game?.camera?.targetTile?.() ?? -1;
  }

  private spawn(ctx: LifeCtx, f: Flock): void {
    const p = ctx.planet;
    const g = p.grid;
    const ft = this.focus(ctx);
    if (ft < 0) return;
    const ring = g.disk(ft, 9);
    const t = ring[Math.floor(ctx.rng.next() * ring.length)];
    const overWater = p.isWater(t) || p.isCoastal(t);
    const sp = speciesFor(p.spec.type, overWater, ctx.rng.next());
    if (!sp) return;
    f.species = sp;
    const c = g.center;
    f.centre.set(c[t * 3], c[t * 3 + 1], c[t * 3 + 2]);
    _r.set(ctx.rng.next() - 0.5, ctx.rng.next() - 0.5, ctx.rng.next() - 0.5);
    f.heading.copy(_r).addScaledVector(f.centre, -_r.dot(f.centre)).normalize();
    f.alt = sp.alt[0] + ctx.rng.next() * (sp.alt[1] - sp.alt[0]);
    f.turn = 0;
    f.n = Math.min(16, sp.count[0] + Math.floor(ctx.rng.next() * (sp.count[1] - sp.count[0] + 1)));
    for (let i = 0; i < f.n; i++) {
      f.phase[i] = ctx.rng.next() * Math.PI * 2;
      f.offs[i * 3] = (ctx.rng.next() - 0.5) * 2;
      f.offs[i * 3 + 1] = (ctx.rng.next() - 0.5) * 2;
      f.offs[i * 3 + 2] = (ctx.rng.next() - 0.5) * 2;
      linHex(sp.colors[Math.floor(ctx.rng.next() * sp.colors.length)], f.col, i * 3);
    }
    f.born = ctx.time;
    f.dying = -1;
    f.active = true;
  }

  update(ctx: LifeCtx, dt: number): void {
    if (this.airless) return;
    const want = ctx.cull.altitude < 50 ? (ctx.density < 0.6 ? 2 : ctx.density < 0.9 ? 3 : 4) : 0;
    let n = 0;
    for (const f of this.flocks) if (f.active) n++;
    if (n < want) {
      const f = firstFree(this.flocks);
      if (f) this.spawn(ctx, f);
    }
    const ft = this.focus(ctx);
    const g = ctx.planet.grid;
    const c = g.center;
    if (ft >= 0) _p.set(c[ft * 3], c[ft * 3 + 1], c[ft * 3 + 2]);
    const R = ctx.planet.radius;
    for (const f of this.flocks) {
      if (!f.active) continue;
      if (f.dying >= 0 && ctx.time - f.dying > 1.5) {
        f.active = false;
        continue;
      }
      // wander: smooth random turning, a gentle pull back toward the focus
      f.turn += (ctx.rng.next() - 0.5) * dt * 1.2;
      f.turn *= 1 - Math.min(1, dt * 0.5);
      _up.copy(f.centre);
      _r.crossVectors(_up, f.heading);
      if (ft >= 0) {
        const away = Math.acos(Math.max(-1, Math.min(1, f.centre.dot(_p)))) * R;
        if (away > 14) {
          _d.copy(_p).addScaledVector(_up, -_p.dot(_up)).normalize();
          f.heading.lerp(_d, Math.min(1, dt * 0.4)).normalize();
        }
        if ((away > 30 || n > want) && f.dying < 0) f.dying = ctx.time;
      }
      f.heading.addScaledVector(_r, f.turn * dt).normalize();
      const step = (f.species.speed * dt) / R;
      f.centre.addScaledVector(f.heading, step).normalize();
      f.heading.addScaledVector(f.centre, -f.heading.dot(f.centre)).normalize();
    }
  }

  render(ctx: LifeCtx): void {
    this.visible = 0;
    if (this.airless) return;
    const cull = ctx.cull;
    if (cull.altitude > 50) return;
    const p = ctx.planet;
    const R = p.radius;
    const rt = ctx.realTime;
    const t = ctx.time;
    for (const f of this.flocks) {
      if (!f.active) continue;
      const sp = f.species;
      const tile = p.grid.tileAt(f.centre.x, f.centre.y, f.centre.z);
      const ground = p.isWater(tile) ? p.waterHeight : p.heightOf(tile);
      const base = R + ground + f.alt;
      _p.copy(f.centre).multiplyScalar(base);
      if (!cull.visible(_p.x, _p.y, _p.z, 2.5, 55)) continue;
      _up.copy(f.centre);
      frameUp(_fr, _up, f.heading);
      const rx = _fr.r.x, ry = _fr.r.y, rz = _fr.r.z, fx = _fr.f.x, fy = _fr.f.y, fz = _fr.f.z;
      let fade = smoothstep(0, 1.5, t - f.born);
      if (f.dying >= 0) fade *= 1 - smoothstep(0, 1.5, t - f.dying);
      const keys = sp.glow ? KEYS_G : KEYS_N;
      for (let i = 0; i < f.n; i++) {
        if (ctx.budget <= 0) return;
        const ph = f.phase[i];
        const ox = f.offs[i * 3], oy = f.offs[i * 3 + 1], oz = f.offs[i * 3 + 2];
        let lx: number, ly: number, lz: number, hx: number, hz: number;
        if (sp.formation === 'circle') {
          const rad = 0.9 + Math.abs(ox) * 0.7;
          const a = t * (sp.speed / rad) * 1.4 + ph;
          lx = Math.cos(a) * rad;
          lz = Math.sin(a) * rad;
          ly = oy * 0.35 + Math.sin(t * 0.7 + ph) * 0.1;
          hx = -Math.sin(a);
          hz = Math.cos(a);
        } else if (sp.formation === 'vee') {
          const k = Math.floor((i + 1) / 2);
          const side = i % 2 ? 1 : -1;
          lx = side * k * 0.16 + Math.sin(t * 1.3 + ph) * 0.02;
          lz = -k * 0.15 + Math.sin(t * 0.9 + ph) * 0.02;
          ly = Math.sin(t * 1.1 + ph) * 0.03;
          hx = 0;
          hz = 1;
        } else {
          lx = ox * 0.7 + Math.sin(t * 0.9 + ph) * 0.35;
          lz = oz * 0.7 + Math.cos(t * 0.7 + ph * 1.3) * 0.35;
          ly = oy * 0.3 + Math.sin(t * 1.3 + ph * 0.7) * 0.15;
          hx = Math.cos(t * 0.9 + ph) * 0.35 * 0.9;
          hz = 1 + -Math.sin(t * 0.7 + ph * 1.3) * 0.35 * 0.7;
        }
        _d.set(rx * hx + fx * hz, ry * hx + fy * hz, rz * hx + fz * hz).normalize();
        const bx = _p.x + rx * lx + _up.x * ly + fx * lz;
        const by = _p.y + ry * lx + _up.y * ly + fy * lz;
        const bz = _p.z + rz * lx + _up.z * ly + fz * lz;
        if (!cull.visible(bx, by, bz, 0.2, 55)) continue;
        ctx.budget--;
        this.visible++;
        const fr = frameFwd(_fr, _d, _up);
        if (sp.formation === 'circle') roll(fr, 0.35);
        const gliding = Math.sin(t * 0.4 + ph * 3) > 1 - sp.glide * 2;
        const w = gliding ? 0 : Math.sin(rt * sp.flap * Math.PI * 2 + ph);
        const key = keys[w > 0.33 ? 0 : w < -0.33 ? 2 : 1];
        const dist = Math.sqrt(cull.dist2(bx, by, bz));
        const s = sp.size * fade * (dist > 8 ? Math.min(1.8, 1 + (dist - 8) * 0.02) : 1);
        ctx.fleet(key).push(bx, by, bz, fr.r.x, fr.r.y, fr.r.z, fr.u.x, fr.u.y, fr.u.z, fr.f.x, fr.f.y, fr.f.z, s, f.col[i * 3], f.col[i * 3 + 1], f.col[i * 3 + 2]);
        if (sp.glow && cull.night > 0.05) ctx.sprites.push(bx, by, bz, 0.08 * s, f.col[i * 3] * 1.4, f.col[i * 3 + 1] * 1.4, f.col[i * 3 + 2] * 1.4, 1);
      }
    }
  }

  dispose(): void {
    this.flocks.length = 0;
  }
}
