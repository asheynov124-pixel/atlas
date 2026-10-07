/**
 * OWNER: studio.
 * Geometry helpers for Architect Studio parts, built on the content kit's MeshBuilder:
 *   loft()   — extrude a convex outline upward through rings with taper / twist / custom profile, smooth (round
 *              shapes) or faceted, optional caps; window-friendly UVs (u = perimeter metres, v = height).
 *   beam()   — a square-section strut between two points (lattices, braces, legs).
 *   outline helpers: rectOutline, roundedRectOutline, regularOutline, shapeOutline(sides, w, d).
 * All positions are in the builder's current transform space; base at y = 0 unless `y` is given.
 */
import { BufferAttribute, BufferGeometry, Euler, Quaternion, Vector3 } from 'three';
import type { MatId, MeshBuilder } from '../content/kit';

export type Outline = [number, number][];

export interface LoftOpts {
  h: number;
  /** 0..1 top shrink (ignored when `profile` is given) */
  taper?: number;
  /** radians of rotation bottom → top */
  twist?: number;
  /** vertical subdivisions (auto from twist / profile when omitted) */
  rings?: number;
  /** shared normals around the outline (round shapes) */
  smooth?: boolean;
  /** scale at t ∈ [0,1] (overrides taper) */
  profile?: (t: number) => number;
  capTop?: boolean;
  capBottom?: boolean;
  color: number;
  mat: MatId;
  topColor?: number;
  topMat?: MatId;
  detail?: boolean;
  y?: number;
  paint?: boolean;
}

const _a = new Vector3();
const _b = new Vector3();
const _n = new Vector3();

/** Rectangle w × d, counter-clockwise in (x, z). */
export function rectOutline(w: number, d: number): Outline {
  const x = w / 2, z = d / 2;
  return [
    [x, z],
    [-x, z],
    [-x, -z],
    [x, -z],
  ];
}

/** Regular polygon (ellipse when rx ≠ rz). A flat side faces +Z for even counts. */
export function regularOutline(n: number, rx: number, rz: number): Outline {
  const out: Outline = [];
  const phase = Math.PI / 2 + (n % 2 === 0 ? Math.PI / n : 0);
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push([Math.cos(a) * rx, Math.sin(a) * rz]);
  }
  return out;
}

/** Rounded rectangle; `round` 0..1 = corner radius as a fraction of the shorter half-side. */
export function roundedRectOutline(w: number, d: number, round: number, cornerSeg = 4): Outline {
  const hx = w / 2, hz = d / 2;
  const r = Math.max(0.001, Math.min(hx, hz) * Math.min(1, Math.max(0, round)));
  const out: Outline = [];
  const corners: [number, number, number][] = [
    [hx - r, hz - r, 0],
    [-hx + r, hz - r, Math.PI / 2],
    [-hx + r, -hz + r, Math.PI],
    [hx - r, -hz + r, (Math.PI * 3) / 2],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let k = 0; k <= cornerSeg; k++) {
      const a = a0 + (k / cornerSeg) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  return out;
}

/** Outline for a part: 4 sides → rectangle, 3/5..8 → polygon, more → ellipse (LOD-aware segment count). */
export function shapeOutline(b: MeshBuilder, sides: number, w: number, d: number): { outline: Outline; smooth: boolean } {
  if (sides === 4) return { outline: rectOutline(w, d), smooth: false };
  if (sides <= 8) return { outline: regularOutline(sides, w / 2, d / 2), smooth: false };
  return { outline: regularOutline(b.seg(sides), w / 2, d / 2), smooth: true };
}

/** Is the shape round (smooth) for this side count? */
export function isRound(sides: number): boolean {
  return sides > 8;
}

/**
 * Loft a convex CCW outline from y to y + h. Emits through `b.geometry` (keeps the transform stack).
 * Returns the number of triangles emitted.
 */
export function loft(b: MeshBuilder, outline: Outline, o: LoftOpts): void {
  if (o.detail && b.lod === 1) return;
  const n = outline.length;
  if (n < 3 || o.h <= 0) return;
  const twist = o.twist ?? 0;
  const rings = Math.max(1, o.rings ?? (o.profile ? 6 : Math.abs(twist) > 1e-3 ? Math.min(24, Math.max(2, Math.ceil(Math.abs(twist) / 0.26))) : 1));
  const taper = Math.min(1, Math.max(0, o.taper ?? 0));
  const scaleAt = o.profile ?? ((t: number) => 1 - taper * t);
  const y0 = o.y ?? 0;
  // ring vertices
  const ringPts: number[][] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const s = Math.max(0, scaleAt(t));
    const rot = twist * t;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const pts: number[] = [];
    for (let i = 0; i < n; i++) {
      const [x, z] = outline[i];
      pts.push((x * cs - z * sn) * s, y0 + t * o.h, (x * sn + z * cs) * s);
    }
    ringPts.push(pts);
  }
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const P = (j: number, i: number) => {
    const r = ringPts[j];
    const k = ((i % n) + n) % n;
    return [r[k * 3], r[k * 3 + 1], r[k * 3 + 2]];
  };
  if (o.smooth) {
    // shared seam-duplicated grid with analytic-ish normals
    for (let j = 0; j <= rings; j++) {
      let u = 0;
      for (let i = 0; i <= n; i++) {
        const p = P(j, i);
        if (i > 0) {
          const q = P(j, i - 1);
          u += Math.hypot(p[0] - q[0], p[2] - q[2]);
        }
        const pn = P(j, i + 1), pp = P(j, i - 1);
        const ju = Math.min(rings, j + 1), jd = Math.max(0, j - 1);
        const up = P(ju, i), dn = P(jd, i);
        _a.set(pn[0] - pp[0], pn[1] - pp[1], pn[2] - pp[2]);
        _b.set(up[0] - dn[0], up[1] - dn[1], up[2] - dn[2]);
        _n.crossVectors(_b, _a);
        // outward: compare with radial direction
        if (_n.x * p[0] + _n.z * p[2] < 0) _n.negate();
        if (_n.lengthSq() < 1e-12) _n.set(p[0], 0.0001, p[2]);
        _n.normalize();
        pos.push(p[0], p[1], p[2]);
        nrm.push(_n.x, _n.y, _n.z);
        uv.push(u, p[1] - y0);
      }
    }
    const W = n + 1;
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < n; i++) {
        const a = j * W + i, bq = a + 1, c = a + W + 1, d = a + W;
        idx.push(a, c, bq, a, d, c);
      }
  } else {
    for (let j = 0; j < rings; j++) {
      let u = 0;
      for (let i = 0; i < n; i++) {
        const a = P(j, i), bq = P(j, i + 1), c = P(j + 1, i + 1), d = P(j + 1, i);
        const len = Math.hypot(bq[0] - a[0], bq[2] - a[2]);
        // face normal from the quad diagonals (robust when the top collapses)
        _a.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        _b.set(d[0] - bq[0], d[1] - bq[1], d[2] - bq[2]);
        _n.crossVectors(_b, _a);
        const mx = (a[0] + bq[0]) / 2, mz = (a[2] + bq[2]) / 2;
        if (_n.x * mx + _n.z * mz < 0) _n.negate();
        if (_n.lengthSq() < 1e-12) _n.set(mx, 0, mz);
        _n.normalize();
        const base = pos.length / 3;
        const topLen = Math.hypot(c[0] - d[0], c[2] - d[2]);
        const off = (len - topLen) / 2;
        pos.push(...a, ...bq, ...c, ...d);
        for (let k = 0; k < 4; k++) nrm.push(_n.x, _n.y, _n.z);
        uv.push(u, a[1] - y0, u + len, bq[1] - y0, u + len - off, c[1] - y0, u + off, d[1] - y0);
        idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        u += len;
      }
    }
  }
  emitGeo(b, pos, nrm, uv, idx, o.color, o.mat, o.paint, false);
  // caps
  const topScale = scaleAt(1);
  if ((o.capTop ?? true) && topScale > 1e-3) cap(b, ringPts[rings], n, true, o.topColor ?? o.color, o.topMat ?? capMat(o.mat), o.paint);
  if (o.capBottom) cap(b, ringPts[0], n, false, o.color, capMat(o.mat), o.paint);
}

function capMat(m: MatId): MatId {
  // windows / glass facades get a plain roof (matches the kit's box())
  return m === 1 || m === 5 || m === 12 ? 0 : m;
}

function cap(b: MeshBuilder, ring: number[], n: number, up: boolean, color: number, mat: MatId, paint?: boolean): void {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += ring[i * 3] / n;
    cy += ring[i * 3 + 1] / n;
    cz += ring[i * 3 + 2] / n;
  }
  pos.push(cx, cy, cz);
  nrm.push(0, up ? 1 : -1, 0);
  uv.push(cx, cz);
  for (let i = 0; i < n; i++) {
    pos.push(ring[i * 3], ring[i * 3 + 1], ring[i * 3 + 2]);
    nrm.push(0, up ? 1 : -1, 0);
    uv.push(ring[i * 3], ring[i * 3 + 2]);
  }
  for (let i = 0; i < n; i++) {
    const a = 1 + i, c = 1 + ((i + 1) % n);
    if (up) idx.push(0, c, a);
    else idx.push(0, a, c);
  }
  emitGeo(b, pos, nrm, uv, idx, color, mat, paint, false);
}

/** Push raw arrays through MeshBuilder.geometry (keeps the transform stack & v-offset alignment). */
export function emitGeo(b: MeshBuilder, pos: number[], nrm: number[], uv: number[], idx: number[], color: number, mat: MatId, paint?: boolean, flat?: boolean): void {
  if (!idx.length) return;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  b.geometry(g, { color, mat, paint, flat });
  g.dispose();
}

const _q = new Quaternion();
const _e = new Euler();
const _dir = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Square-section strut from a to c (thickness t). */
export function beam(b: MeshBuilder, a: [number, number, number], c: [number, number, number], t: number, o: { color: number; mat: MatId; detail?: boolean }): void {
  if (o.detail && b.lod === 1) return;
  _dir.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = _dir.length();
  if (len < 1e-4) return;
  _dir.divideScalar(len);
  _q.setFromUnitVectors(UP, _dir);
  _e.setFromQuaternion(_q, 'XYZ');
  b.group({ x: a[0], y: a[1], z: a[2], rx: _e.x, ry: _e.y, rz: _e.z }, () => {
    b.box(t, len, t, { color: o.color, mat: o.mat, bottom: false });
  });
}

/** Tiny deterministic hash → [0,1). */
export function hash01(a: number, b = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

export const DEG = Math.PI / 180;
