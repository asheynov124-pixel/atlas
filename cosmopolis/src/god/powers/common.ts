/**
 * OWNER: god.
 * Shared helpers for power implementations: geometry on the sphere (tangent frames, sky points, angular tile
 * lists sorted for travelling fronts), finding water / land / the city, flyer behaviours (tornado orbit,
 * ballistic toss, lift into a point, sink, spiral into an attractor, float & settle) and small timing curves.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Planet } from '../../world/planet';
import { tileNormal } from '../../world/geo';
import type { Flyer } from '../../render/fx/flyers';
import type { FxLayer } from '../../render/fx/FxLayer';
import { PRESETS } from '../../render/fx/particles';

export const TAU = Math.PI * 2;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeIn = (t: number) => Math.pow(clamp01(t), 3);
/** 0 → 1 → 0 envelope with attack / release fractions */
export const envelope = (t: number, attack: number, release: number) => clamp01(t / Math.max(1e-4, attack)) * clamp01((1 - t) / Math.max(1e-4, release));

const _a = new Vector3();
const _b = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();

/** Orthonormal tangent basis (e1, e2) around a unit normal. */
export function tangents(n: Vector3, e1: Vector3, e2: Vector3): void {
  _a.set(0, 1, 0);
  if (Math.abs(n.y) > 0.9) _a.set(1, 0, 0);
  e1.crossVectors(n, _a).normalize();
  e2.crossVectors(n, e1).normalize();
}

/** A point high above `dir` offset sideways by (u, v) in tangent units. */
export function skyPoint(R: number, dir: Vector3, alt: number, u = 0, v = 0, out = new Vector3()): Vector3 {
  const e1 = _a, e2 = _b;
  tangents(dir, e1, e2);
  return out.copy(dir).multiplyScalar(R + alt).addScaledVector(e1, u).addScaledVector(e2, v);
}

/** Tiles within `maxAngle` of `center`, sorted by angular distance (for fronts sweeping outward). */
export function sortedByAngle(p: Planet, center: number, maxAngle: number): { tiles: Int32Array; angles: Float32Array } {
  const g = p.grid;
  const c = g.center;
  const cx = c[center * 3], cy = c[center * 3 + 1], cz = c[center * 3 + 2];
  const cos = Math.cos(maxAngle);
  const idx: number[] = [];
  const ang: number[] = [];
  for (let t = 0; t < p.count; t++) {
    const d = c[t * 3] * cx + c[t * 3 + 1] * cy + c[t * 3 + 2] * cz;
    if (d < cos) continue;
    idx.push(t);
    ang.push(Math.acos(Math.max(-1, Math.min(1, d))));
  }
  const order = idx.map((_, i) => i).sort((a, b) => ang[a] - ang[b]);
  const tiles = new Int32Array(order.length);
  const angles = new Float32Array(order.length);
  order.forEach((o, i) => {
    tiles[i] = idx[o];
    angles[i] = ang[o];
  });
  return { tiles, angles };
}

/** Same, but sorted by the angle from an arbitrary unit direction. */
export function sortedByDir(p: Planet, dir: Vector3, maxAngle: number): { tiles: Int32Array; angles: Float32Array } {
  const t = p.grid.tileAt(dir.x, dir.y, dir.z);
  return sortedByAngle(p, t, maxAngle);
}

/** Nearest water tile to `tile` within `maxSteps` rings (or -1). */
export function nearestWater(p: Planet, tile: number, maxSteps = 14): number {
  if (p.isWater(tile)) return tile;
  if (!p.spec.hasOcean) return -1;
  for (let r = 1; r <= maxSteps; r++) for (const t of p.grid.ring(tile, r)) if (p.isWater(t)) return t;
  return -1;
}

/** A water tile a few steps offshore from the coast nearest `tile` (deep enough for a tsunami / kraken). */
export function offshore(p: Planet, tile: number, depthSteps = 3, maxSteps = 18): number {
  const w = nearestWater(p, tile, maxSteps);
  if (w < 0) return -1;
  // walk away from land
  let cur = w;
  for (let i = 0; i < depthSteps; i++) {
    let best = cur, bestLand = Infinity;
    for (const n of p.grid.neighbors(cur)) {
      if (!p.isWater(n)) continue;
      let land = 0;
      for (const m of p.grid.disk(n, 2)) if (!p.isWater(m)) land++;
      if (land < bestLand) {
        bestLand = land;
        best = n;
      }
    }
    cur = best;
  }
  return cur;
}

/** Nearest tile of OPEN sea (≥ 85 % water within 3 rings — not a lake) to `tile`, or -1. */
export function openSea(p: Planet, tile: number, maxSteps = 30): number {
  if (!p.spec.hasOcean) return -1;
  const g = p.grid;
  const open = (t: number) => {
    if (!p.isWater(t)) return false;
    const d = g.disk(t, 3);
    let w = 0;
    for (const x of d) if (p.isWater(x)) w++;
    return w >= d.length * 0.85;
  };
  if (open(tile)) return tile;
  for (let r = 1; r <= maxSteps; r++) for (const t of g.ring(tile, r)) if (open(t)) return t;
  return -1;
}

/** Land tiles within `maxSteps` of the sea → steps from the nearest water (multi-source BFS over `tiles`). */
export function inlandDistance(p: Planet, tiles: ArrayLike<number>, maxSteps = 8): Map<number, number> {
  const g = p.grid;
  const inSet = new Set<number>();
  for (let i = 0; i < tiles.length; i++) inSet.add(tiles[i]);
  const dist = new Map<number, number>();
  let frontier: number[] = [];
  for (const t of inSet) {
    if (p.isWater(t)) continue;
    for (const n of g.neighbors(t))
      if (p.isWater(n)) {
        dist.set(t, 1);
        frontier.push(t);
        break;
      }
  }
  for (let d = 2; d <= maxSteps && frontier.length; d++) {
    const next: number[] = [];
    for (const t of frontier)
      for (const n of g.neighbors(t)) {
        if (!inSet.has(n) || p.isWater(n) || dist.has(n)) continue;
        dist.set(n, d);
        next.push(n);
      }
    frontier = next;
  }
  return dist;
}

/** Centre of mass of the city (tile), or `fallback`. */
export function cityCenter(p: Planet, fallback = 0): number {
  _a.set(0, 0, 0);
  let n = 0;
  for (const b of p.buildings.values()) {
    _a.add(tileNormal(p, b.tile, _b));
    n++;
  }
  if (!n || _a.lengthSq() < 1e-8) return fallback;
  return p.grid.tileAt(_a.x, _a.y, _a.z);
}

/** Angular radius (radians) of `tiles` tile-steps on this planet. */
export function tilesToAngle(p: Planet, tiles: number): number {
  return (tiles * 2) / p.radius;
}

// ─────────────────────────────────────────────── flyer behaviours

/** Ballistic toss with tumbling; on landing → dust + debris and the flyer ends. */
export function tossBehaviour(fx: FxLayer, gravity = 14): Flyer['behave'] {
  return (f, dt) => {
    const r = f.pos.length();
    _a.copy(f.pos).divideScalar(r);
    f.vel.addScaledVector(_a, -gravity * dt);
    f.pos.addScaledVector(f.vel, dt);
    _q.setFromAxisAngle(_b.copy(f.spin).normalize(), f.spin.length() * dt);
    f.quat.premultiply(_q);
    const p = fx.planet;
    const tile = p.grid.tileAt(f.pos.x, f.pos.y, f.pos.z);
    const ground = p.radius + (p.isWater(tile) ? p.waterHeight : p.heightOf(tile));
    if (f.pos.length() < ground + 0.2 && f.age > 0.3) {
      if (p.isWater(tile)) fx.particles.emit(PRESETS.splash, f.pos, _a, 10, 1.2, 1.2);
      else fx.collapse(f.pos, _a, 1.4);
      return false;
    }
    return f.age < 12;
  };
}

/** Start a toss from the flyer's current state. */
export function launchToss(f: Flyer, up: Vector3, speed: number, sideways: Vector3 | null, rand: () => number): void {
  f.vel.copy(up).multiplyScalar(speed * (0.7 + rand() * 0.6));
  if (sideways) f.vel.addScaledVector(sideways, speed * (0.4 + rand() * 0.8));
  f.spin.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(1.5 + rand() * 4);
}

/** Rise toward a moving point (UFO), shrinking, then end. `getTarget` returns the point or null. */
export function liftBehaviour(getTarget: () => Vector3 | null, duration = 3.2): Flyer['behave'] {
  return (f, dt) => {
    const tgt = getTarget();
    if (!tgt) return false;
    const t = Math.min(1, f.age / duration);
    const k = 1 - Math.exp(-dt * (0.6 + t * 3));
    f.pos.lerp(tgt, k * (0.25 + t));
    _q.setFromAxisAngle(_a.copy(f.pos).normalize(), dt * (0.6 + t * 4));
    f.quat.premultiply(_q);
    const s = Math.max(0.02, 1 - easeIn(t) * 0.98);
    f.scale.setScalar(s * (f.data[0] ?? 1));
    return t < 1 && f.pos.distanceTo(tgt) > 0.15;
  };
}

/** Sink along the local down direction (sinkholes, kraken drag, sandworm) and end. */
export function sinkBehaviour(depth: number, duration: number, wobble = 0.3): Flyer['behave'] {
  return (f, dt) => {
    const t = f.age / duration;
    _a.copy(f.pos).normalize();
    f.pos.addScaledVector(_a, -(depth / duration) * dt);
    _q.setFromAxisAngle(_b.set(1, 0, 0).applyQuaternion(f.quat), Math.sin(f.age * 9) * wobble * dt);
    f.quat.premultiply(_q);
    return t < 1;
  };
}

/** Matrix copy helper (Damage hands out a shared scratch matrix). */
export function copyMatrix(m: Matrix4): Matrix4 {
  return _m.copy(m).clone();
}
