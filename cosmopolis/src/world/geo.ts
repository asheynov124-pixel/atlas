/**
 * Tile ↔ world-space helpers. Planet centre is the world origin; planet axis is +Y.
 *
 * Local object space convention for everything placed on a tile (buildings, props, previews):
 *   +Y = tile normal (up), +Z = forward (toward neighbour `rot`), +X = right (up × forward)
 *   origin = tile centre at the tile's top surface.
 */
import { Matrix4, Vector3, type Ray } from 'three';
import { Planet } from './planet';

const _c = new Vector3();
const _n = new Vector3();
const _f = new Vector3();
const _r = new Vector3();
const _p = new Vector3();
const _tmp = new Vector3();

/** Unit normal (centre direction) of tile i. */
export function tileNormal(planet: Planet, i: number, out = new Vector3()): Vector3 {
  const c = planet.grid.center;
  return out.set(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
}

/** World position of tile i's top surface centre (+ extra height along the normal). */
export function tilePosition(planet: Planet, i: number, out = new Vector3(), extra = 0): Vector3 {
  tileNormal(planet, i, out);
  return out.multiplyScalar(planet.radius + planet.heightOf(i) + extra);
}

/** World position of corner k of tile i at the tile's top height. */
export function tileCorner(planet: Planet, i: number, k: number, out = new Vector3(), extra = 0): Vector3 {
  const g = planet.grid;
  const d = g.degree(i);
  const s = (g.start[i] + (((k % d) + d) % d)) * 3;
  out.set(g.corner[s], g.corner[s + 1], g.corner[s + 2]);
  return out.multiplyScalar(planet.radius + planet.heightOf(i) + extra);
}

export interface TileFrame {
  pos: Vector3;
  up: Vector3;
  fwd: Vector3;
  right: Vector3;
}

/** Orthonormal frame at tile i facing neighbour `rot`. */
export function tileFrame(planet: Planet, i: number, rot = 0, out?: TileFrame, extra = 0): TileFrame {
  const f = out ?? { pos: new Vector3(), up: new Vector3(), fwd: new Vector3(), right: new Vector3() };
  const g = planet.grid;
  tileNormal(planet, i, f.up);
  const j = g.neighbor(i, rot);
  tileNormal(planet, j, _tmp);
  // forward = component of (nbr - centre) orthogonal to up
  f.fwd.copy(_tmp).sub(f.up);
  f.fwd.addScaledVector(f.up, -f.fwd.dot(f.up)).normalize();
  f.right.crossVectors(f.up, f.fwd).normalize();
  f.pos.copy(f.up).multiplyScalar(planet.radius + planet.heightOf(i) + extra);
  return f;
}

export interface TileMatrixOpts {
  /** extra height above the tile top along the normal */
  height?: number;
  /** uniform scale (or per-axis via scaleXYZ) */
  scale?: number;
  scaleY?: number;
  /** additional yaw (radians) around the normal, applied after `rot` */
  yaw?: number;
  /** tangent-plane offset in world units: u along right, v along forward (before yaw) */
  u?: number;
  v?: number;
}

const _frame: TileFrame = { pos: new Vector3(), up: new Vector3(), fwd: new Vector3(), right: new Vector3() };

/** Object matrix for something standing on tile i, facing neighbour `rot`. */
export function tileMatrix(planet: Planet, i: number, rot: number, out = new Matrix4(), o: TileMatrixOpts = {}): Matrix4 {
  const fr = tileFrame(planet, i, rot, _frame, o.height ?? 0);
  let fx = fr.fwd.x, fy = fr.fwd.y, fz = fr.fwd.z;
  let rx = fr.right.x, ry = fr.right.y, rz = fr.right.z;
  const px = fr.pos.x + rx * (o.u ?? 0) + fx * (o.v ?? 0);
  const py = fr.pos.y + ry * (o.u ?? 0) + fy * (o.v ?? 0);
  const pz = fr.pos.z + rz * (o.u ?? 0) + fz * (o.v ?? 0);
  if (o.yaw) {
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    // rotate fwd/right around up (right-handed: positive yaw turns forward toward -right... keep consistent: fwd' = fwd*c + right*s)
    const nfx = fx * c + rx * s, nfy = fy * c + ry * s, nfz = fz * c + rz * s;
    const nrx = rx * c - fx * s, nry = ry * c - fy * s, nrz = rz * c - fz * s;
    fx = nfx; fy = nfy; fz = nfz; rx = nrx; ry = nry; rz = nrz;
  }
  const s = o.scale ?? 1;
  const sy = (o.scaleY ?? 1) * s;
  const ux = fr.up.x, uy = fr.up.y, uz = fr.up.z;
  // columns: X = right, Y = up, Z = forward
  out.set(
    rx * s, ux * sy, fx * s, px,
    ry * s, uy * sy, fy * s, py,
    rz * s, uz * sy, fz * s, pz,
    0, 0, 0, 1,
  );
  return out;
}

/** Matrix for an arbitrary unit direction + radius (e.g. FX not bound to a tile). Forward is arbitrary but stable. */
export function surfaceMatrix(dir: Vector3, radius: number, out = new Matrix4(), scale = 1): Matrix4 {
  _n.copy(dir).normalize();
  _f.set(0, 1, 0);
  if (Math.abs(_n.y) > 0.95) _f.set(1, 0, 0);
  _f.addScaledVector(_n, -_f.dot(_n)).normalize();
  _r.crossVectors(_n, _f).normalize();
  _p.copy(_n).multiplyScalar(radius);
  out.set(
    _r.x * scale, _n.x * scale, _f.x * scale, _p.x,
    _r.y * scale, _n.y * scale, _f.y * scale, _p.y,
    _r.z * scale, _n.z * scale, _f.z * scale, _p.z,
    0, 0, 0, 1,
  );
  return out;
}

// ─────────────────────────────────────────────────────────── picking

export interface PickResult {
  tile: number;
  point: Vector3;
  /** true when the ray hit the water surface above an underwater tile */
  water: boolean;
}

let _maxCacheVersion = -1;
let _maxCachePlanet: Planet | null = null;
let _maxH = 0;
function maxSurfaceHeight(planet: Planet): number {
  if (_maxCachePlanet !== planet || _maxCacheVersion !== planet.terrainVersion) {
    let m = -Infinity;
    for (let i = 0; i < planet.count; i++) if (planet.elevation[i] > m) m = planet.elevation[i];
    _maxH = Math.max(Planet.levelHeight(m), planet.spec.hasOcean ? planet.waterHeight : -Infinity);
    _maxCachePlanet = planet;
    _maxCacheVersion = planet.terrainVersion;
  }
  return _maxH;
}

function surfaceAt(planet: Planet, tile: number): number {
  const h = planet.heightOf(tile);
  return planet.spec.hasOcean ? Math.max(h, planet.waterHeight) : h;
}

/**
 * Ray-march the terrain. Returns the first tile hit (terrain top or water surface), or null.
 * Accurate to a few hundredths of a world unit; cheap enough for pointer-move.
 */
export function pickTile(planet: Planet, ray: Ray): PickResult | null {
  const R = planet.radius;
  const top = R + maxSurfaceHeight(planet) + 0.05;
  // intersect outer sphere
  const o = ray.origin, d = ray.direction;
  const b = o.dot(d);
  const c = o.lengthSq() - top * top;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t0 = -b - sq;
  const t1 = -b + sq;
  if (t1 < 0) return null;
  if (t0 < 0) t0 = 0;
  const step = 0.25;
  const g = planet.grid;
  let prevT = t0;
  for (let t = t0; t <= t1; t += step) {
    _p.copy(d).multiplyScalar(t).add(o);
    const r = _p.length();
    const tile = g.tileAt(_p.x, _p.y, _p.z);
    if (r <= R + surfaceAt(planet, tile)) {
      // bisection refine between prevT and t
      let lo = prevT, hi = t;
      let hitTile = tile;
      for (let k = 0; k < 10; k++) {
        const mid = (lo + hi) / 2;
        _p.copy(d).multiplyScalar(mid).add(o);
        const tm = g.tileAt(_p.x, _p.y, _p.z);
        if (_p.length() <= R + surfaceAt(planet, tm)) {
          hi = mid;
          hitTile = tm;
        } else lo = mid;
      }
      const point = new Vector3().copy(d).multiplyScalar(hi).add(o);
      return { tile: hitTile, point, water: planet.isWater(hitTile) };
    }
    prevT = t;
  }
  return null;
}

/** Project a world point onto the tile under it. */
export function tileUnder(planet: Planet, p: Vector3): number {
  return planet.grid.tileAt(p.x, p.y, p.z);
}

/** Great-circle distance in world units between two tiles' centres at sea level. */
export function tileDistance(planet: Planet, a: number, b: number): number {
  return planet.grid.angle(a, b) * planet.radius;
}

export { _c as __geoScratch };
