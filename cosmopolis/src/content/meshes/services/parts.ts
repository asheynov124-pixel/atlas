/**
 * services · shared geometry parts for civic buildings, schools, labs, parks and venues (OWNER: services).
 *
 * Thin helpers on top of the kit (content/kit.ts). Local space follows the kit: +Y up, +Z faces the road, origin =
 * centre of the footprint on the ground. Footprint lots:
 *   lot(b, fp, …)   plate under the whole footprint — a soft hexagon whose skirt sinks below the terrain so the
 *                   planet's curvature never shows a gap (fp 1 → flat side toward +Z like zoned lots; fp 7 / 19 →
 *                   lobes toward the six neighbour tiles).
 * Small things (benches, lamps, people, vehicles, signs) are `detail: true` so they vanish at LOD1; trees and
 * the silhouette-defining parts stay. Every helper is allocation-light and deterministic (pass ctx.rng).
 */
import { Mat, mix, pickColor, shade, type MatId, type MeshBuilder, type PartOpts } from '../../kit';
import type { MeshContext } from '../../catalog';
import type { Rng } from '../../../core/rng';

export type V2 = [number, number];
export const TAU = Math.PI * 2;
/** One storey (planet FLOOR_HEIGHT) — facade window rows align with it. */
export const FL = 0.2;
/** Top of every lot plate: things stand on this. */
export const G = 0.03;
/** Lot plate circumradius per footprint. */
export const LOT_R: Record<1 | 7 | 19, number> = { 1: 0.9, 7: 2.58, 19: 4.8 };

// ─────────────────────────────────────────────────────────── palette

export const C = {
  grass: 0x6aad48,
  grassDark: 0x4f9440,
  lawn: 0x7cc055,
  path: 0xe2d6bc,
  gravel: 0xd8d2c4,
  paving: 0xc9c6bf,
  pavingDark: 0x9c9a96,
  asphalt: 0x4a4d54,
  concrete: 0xd0ccc4,
  stone: 0xbab3a6,
  sand: 0xf0dca8,
  wood: 0x9a6a42,
  woodDark: 0x6e4a2e,
  metal: 0x8f96a3,
  steel: 0x7a8290,
  dark: 0x2c2f36,
  white: 0xf4f2ee,
  police: 0x2a4f9a,
  policeLight: 0x3f8cff,
  fire: 0xd23a2a,
  fireLight: 0xff5a2a,
  health: 0xf6f8fa,
  cross: 0xe8343a,
  healthGlow: 0x40ffb0,
  school: 0xc8643a,
  bus: 0xffc21a,
  science: 0x3ff0ff,
  lamp: 0xffe2a8,
  lampCool: 0xcff4ff,
  water: 0x3a8ad0,
  red: 0xe0453a,
  blue: 0x3a7ae0,
  yellow: 0xffcf3a,
  green: 0x4ac06a,
  purple: 0x9a5ae0,
  pink: 0xff7ab8,
  orange: 0xff9a2a,
  teal: 0x2ac0b0,
} as const;

/** Bright playful colours (playgrounds, stalls, umbrellas, seats). */
export const FUN = [0xe0453a, 0xffcf3a, 0x3a7ae0, 0x4ac06a, 0xff7ab8, 0xff9a2a, 0x9a5ae0, 0x2ac0b0];

export interface Civic {
  wall: number;
  wall2: number;
  roof: number;
  trim: number;
  accent: number;
  glass: number;
  /** style prefers curves / domes */
  curvy: boolean;
  /** style loves roof gardens */
  green: boolean;
  /** style loves neon */
  neon: boolean;
}

/** Style-driven palette for styleable civic buildings (identity colours are layered on top by each factory). */
export function civic(ctx: MeshContext, salt = 0): Civic {
  const s = ctx.style;
  const v = ctx.variant + salt;
  return {
    wall: pickColor(s.walls, v),
    wall2: pickColor(s.walls, v, 1),
    roof: pickColor(s.roofs, v),
    trim: s.trims[0],
    accent: pickColor(s.accents, v),
    glass: s.glass,
    curvy: s.curvy > 0.6,
    green: s.green > 0.5,
    neon: s.neon > 0.5,
  };
}

// ─────────────────────────────────────────────────────────── outlines

/** Regular n-gon (x, z), first vertex at angle `rot` from +Z toward +X. */
export function ngon(n: number, r: number, rot = 0, cx = 0, cz = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    out.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return out;
}

/** Hexagon with chamfered corners (12 points). `rot` 0 → corners toward ±Z. */
export function softHex(r: number, rot = 0, chamfer = 0.16): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * TAU;
    const a0 = a - (TAU / 6) * chamfer, a1 = a + (TAU / 6) * chamfer;
    const rr = r * (1 - chamfer * 0.32);
    out.push([Math.sin(a0) * rr, Math.cos(a0) * rr], [Math.sin(a1) * rr, Math.cos(a1) * rr]);
  }
  return out;
}

/** Rectangle centred at (cx, cz). */
export function rect(w: number, d: number, cx = 0, cz = 0): V2[] {
  const hw = w / 2, hd = d / 2;
  return [[cx - hw, cz + hd], [cx + hw, cz + hd], [cx + hw, cz - hd], [cx - hw, cz - hd]];
}

/** Rounded rectangle (stadium-ish when r = d/2). */
export function roundRect(w: number, d: number, r: number, seg = 3, cx = 0, cz = 0): V2[] {
  const hw = w / 2, hd = d / 2;
  r = Math.max(0.001, Math.min(r, hw - 0.001, hd - 0.001));
  const out: V2[] = [];
  const corners: [number, number, number][] = [
    [hw - r, hd - r, 0],
    [hw - r, -hd + r, Math.PI / 2],
    [-hw + r, -hd + r, Math.PI],
    [-hw + r, hd - r, Math.PI * 1.5],
  ];
  for (const [x, z, a0] of corners)
    for (let s = 0; s <= seg; s++) {
      const a = a0 + (s / seg) * (Math.PI / 2);
      out.push([cx + x + Math.sin(a) * r, cz + z + Math.cos(a) * r]);
    }
  return out;
}

/** Ellipse outline. */
export function ellipse(w: number, d: number, n = 14, cx = 0, cz = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push([cx + Math.sin(a) * w * 0.5, cz + Math.cos(a) * d * 0.5]);
  }
  return out;
}

/** L outline: w×d with the (+x, −z) corner notched out. */
export function lShape(w: number, d: number, nw: number, nd: number, cx = 0, cz = 0): V2[] {
  const hw = w / 2, hd = d / 2;
  return [[cx - hw, cz + hd], [cx + hw, cz + hd], [cx + hw, cz - hd + nd], [cx + hw - nw, cz - hd + nd], [cx + hw - nw, cz - hd], [cx - hw, cz - hd]];
}

/** Five-pointed star outline. */
export function star(r: number, inner = 0.45, points = 5): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * TAU;
    const rr = i % 2 ? r * inner : r;
    out.push([Math.sin(a) * rr, Math.cos(a) * rr]);
  }
  return out;
}

// ─────────────────────────────────────────────────────────── ground

/** Extruded plate: top at `top`, skirt sinking `sink` below 0. Never paintable. */
export function plate(b: MeshBuilder, poly: V2[], top: number, color: number, o: { sink?: number; side?: number; mat?: MatId; y?: number; detail?: boolean } = {}): void {
  const sink = o.sink ?? 0.06;
  const y0 = (o.y ?? 0) - sink;
  b.extrude(poly, top + sink, { color: o.side ?? shade(color, 0.82), top: color, y: y0, paint: false, topMat: o.mat ?? Mat.Plain, mat: Mat.Plain, detail: o.detail });
}

/** The footprint lot plate. */
export function lot(b: MeshBuilder, fp: 1 | 7 | 19, color: number, o: { side?: number; scale?: number; border?: number } = {}): void {
  const r = LOT_R[fp] * (o.scale ?? 1);
  const rot = fp === 1 ? Math.PI / 6 : 0;
  const ch = fp === 1 ? 0.12 : 0.14;
  const border = o.border ?? shade(color, 0.86);
  plate(b, softHex(r, rot, ch), G - 0.006, border, { sink: fp === 1 ? 0.07 : fp === 7 ? 0.12 : 0.26, side: o.side ?? shade(border, 0.85) });
  // inset field: a slim kerb ring frames every lot
  const inset = fp === 1 ? 0.06 : fp === 7 ? 0.1 : 0.14;
  b.extrude(softHex(r - inset, rot, ch), 0.008, { color, y: G - 0.006, paint: false });
}

/**
 * Perimeter landscaping: n trees spaced around the lot edge (radius frac·LOT_R), skipping a front gap of
 * `gap` radians around +Z and any extra blocked angle ranges. Later trees are detail (dropped at LOD1).
 */
export function edging(b: MeshBuilder, rng: Rng, fp: 1 | 7 | 19, n: number, kinds: TreeKind[], o: { frac?: number; gap?: number; skip?: [number, number][]; s?: number; lamps?: boolean } = {}): void {
  const r = LOT_R[fp] * (o.frac ?? 0.86) * (fp === 1 ? 0.95 : 0.93);
  const gap = o.gap ?? 0.7;
  let placed = 0;
  for (let i = 0; i < n * 3 && placed < n; i++) {
    const a = gap / 2 + ((i + 0.5) / (n * 3)) * (TAU - gap);
    if (i % 3 !== 1) continue;
    if (o.skip?.some(([a0, a1]) => a >= a0 && a <= a1)) continue;
    // hex lots are narrower between lobes — pull trees in on those angles
    const lobe = Math.abs(Math.cos(3 * (a - (fp === 1 ? Math.PI / 6 : 0))));
    const rr = r * (0.9 + 0.1 * lobe);
    tree(b, Math.sin(a) * rr, Math.cos(a) * rr, (o.s ?? 1) * rng.range(0.85, 1.12), rng.pick(kinds), rng, G, placed >= Math.ceil(n * 0.6));
    if (o.lamps && placed % 2 === 0) lamp(b, Math.sin(a + 0.12) * rr * 0.97, Math.cos(a + 0.12) * rr * 0.97);
    placed++;
  }
}

/** Flat polygon (fan) facing up at height y — ≤ n−2 triangles. Convex outlines only. */
export function flat(b: MeshBuilder, poly: V2[], y: number, color: number, mat: MatId = Mat.Plain, detail = false, paint = false): void {
  if (detail && b.lod === 1) return;
  const o: PartOpts = { color, y, paint };
  const a = poly[0];
  for (let i = 1; i < poly.length - 1; i++) {
    const p1 = poly[i], p2 = poly[i + 1];
    const ny = (p1[1] - a[1]) * (p2[0] - a[0]) - (p1[0] - a[0]) * (p2[1] - a[1]);
    if (ny >= 0) b.tri([a[0], 0, a[1]], [p1[0], 0, p1[1]], [p2[0], 0, p2[1]], o, color, mat);
    else b.tri([a[0], 0, a[1]], [p2[0], 0, p2[1]], [p1[0], 0, p1[1]], o, color, mat);
  }
}

/** Straight path strip from (x0,z0) to (x1,z1), lying on y. */
export function path(b: MeshBuilder, x0: number, z0: number, x1: number, z1: number, w: number, color: number = C.path, y = G + 0.004, mat: MatId = Mat.Plain): void {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  b.plane(w, len, { color, mat, x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, ry: Math.atan2(dx, dz), paint: false });
}

/** Circular path ring built from n straight strips. */
export function ringPath(b: MeshBuilder, r: number, w: number, color: number = C.path, n = 12, y = G + 0.004, cx = 0, cz = 0): void {
  n = b.lod ? Math.max(6, n >> 1) : n;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
    // extend slightly so joints don't gap
    const e = 0.04;
    path(b, cx + Math.sin(a0 - e) * r, cz + Math.cos(a0 - e) * r, cx + Math.sin(a1 + e) * r, cz + Math.cos(a1 + e) * r, w, color, y);
  }
}

/** Disc (cylinder slab) on the ground. */
export function disc(b: MeshBuilder, r: number, h: number, color: number, o: { x?: number; y?: number; z?: number; seg?: number; mat?: MatId; topMat?: MatId; top?: number; detail?: boolean; paint?: boolean } = {}): void {
  b.cyl(r, r, h, { color, x: o.x, y: o.y ?? 0, z: o.z, seg: o.seg ?? 14, mat: o.mat, topMat: o.topMat, top: o.top, detail: o.detail, paint: o.paint ?? false });
}

/** Rimmed pool: stone rim extrusion with a flush water surface inset. */
export function pool(b: MeshBuilder, poly: V2[], inset: V2[], h: number, rim: number = C.stone, y = G): void {
  b.extrude(poly, h, { color: rim, y, paint: false });
  b.extrude(inset, 0.006, { color: C.water, mat: Mat.Water, topMat: Mat.Water, y: y + h - 0.002, paint: false });
}

// ─────────────────────────────────────────────────────────── greenery

export type TreeKind = 'round' | 'pine' | 'snowpine' | 'palm' | 'blossom' | 'cypress' | 'topiary' | 'autumn' | 'alien' | 'birch' | 'bonsai';

const TREE_GREENS = [0x4f9a3a, 0x5aa844, 0x3f8a34, 0x66b04a];
const PINE_GREENS = [0x2f6b3c, 0x2a5f36, 0x37744a];
const BLOSSOM = [0xf6a8c8, 0xf9c2d8, 0xec92bc];
const AUTUMN = [0xe0782a, 0xd9542a, 0xf0a530];
const ALIEN = [0x7affd8, 0xff9af0, 0xc8ff4a, 0x9ac8ff];

/** Stylised tree standing at (x, y, z), height ≈ 0.42·s. ~20–40 tris. */
export function tree(b: MeshBuilder, x: number, z: number, s: number, kind: TreeKind, rng: Rng, y = G, detail = false): void {
  if (detail && b.lod === 1) return;
  const F = Mat.Foliage;
  const trunk = (h: number, r: number, col = 0x6b4a32) => b.cyl(r * 0.7, r, h, { color: col, seg: 4, capTop: false, flat: true, x, y, z, paint: false });
  const blob = (r: number, yy: number, col: number, sy = 0.9, ox = 0, oz = 0) =>
    b.sphere(r, { color: col, mat: F, flat: true, wSeg: b.lod ? 4 : 5, hSeg: b.lod ? 2 : 3, x: x + ox, y: yy, z: z + oz, sy, paint: false });
  switch (kind) {
    case 'round': {
      trunk(0.16 * s, 0.025 * s);
      blob(0.13 * s, y + 0.25 * s, rng.pick(TREE_GREENS));
      if (b.lod === 0 && rng.chance(0.5)) blob(0.08 * s, y + 0.33 * s, shade(rng.pick(TREE_GREENS), 1.12), 0.9, 0.05 * s, -0.03 * s);
      break;
    }
    case 'autumn': {
      trunk(0.16 * s, 0.025 * s);
      blob(0.13 * s, y + 0.25 * s, rng.pick(AUTUMN));
      break;
    }
    case 'blossom': {
      trunk(0.14 * s, 0.025 * s, 0x5a3a2a);
      blob(0.12 * s, y + 0.22 * s, rng.pick(BLOSSOM), 0.75);
      break;
    }
    case 'birch': {
      trunk(0.26 * s, 0.018 * s, 0xe8e4dc);
      blob(0.09 * s, y + 0.3 * s, 0x9fd067, 1.3);
      break;
    }
    case 'pine': {
      const col = rng.pick(PINE_GREENS);
      trunk(0.08 * s, 0.022 * s);
      b.cone(0.13 * s, 0.22 * s, { color: col, mat: F, seg: 6, flat: true, x, y: y + 0.06 * s, z, paint: false });
      b.cone(0.095 * s, 0.18 * s, { color: shade(col, 1.12), mat: F, seg: 6, flat: true, x, y: y + 0.19 * s, z, paint: false });
      break;
    }
    case 'snowpine': {
      trunk(0.08 * s, 0.022 * s);
      b.cone(0.13 * s, 0.22 * s, { color: 0x2f5f44, mat: F, seg: 6, flat: true, x, y: y + 0.06 * s, z, paint: false });
      b.cone(0.09 * s, 0.17 * s, { color: 0xf2f6fc, mat: F, seg: 6, flat: true, x, y: y + 0.2 * s, z, paint: false });
      break;
    }
    case 'cypress': {
      trunk(0.05 * s, 0.018 * s);
      b.sphere(0.06 * s, { color: 0x2f6a3a, mat: F, flat: true, wSeg: 5, hSeg: 3, x, y: y + 0.24 * s, z, sy: 3.4, paint: false });
      break;
    }
    case 'topiary': {
      b.cyl(0.035 * s, 0.035 * s, 0.05 * s, { color: 0x8a5a3a, seg: 5, x, y, z, paint: false });
      blob(0.07 * s, y + 0.12 * s, 0x3f8a3a, 1);
      if (b.lod === 0) blob(0.045 * s, y + 0.22 * s, 0x4a9a42, 1);
      break;
    }
    case 'palm': {
      const lean = rng.range(-0.25, 0.25);
      b.cyl(0.014 * s, 0.024 * s, 0.34 * s, { color: 0x8a6a4a, seg: 4, capTop: false, flat: true, x, y, z, rz: lean, paint: false });
      const tx = x - Math.sin(lean) * 0.34 * s, ty = y + Math.cos(lean) * 0.34 * s;
      const n = b.lod ? 3 : 5;
      const a0 = rng.next() * TAU;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU;
        b.group({ x: tx, y: ty - 0.01 * s, z, ry: a }, () => b.box(0.035 * s, 0.008 * s, 0.17 * s, { color: rng.pick(TREE_GREENS), mat: F, z: 0.075 * s, rx: 0.38, paint: false }));
      }
      break;
    }
    case 'alien': {
      const col = rng.pick(ALIEN);
      b.cyl(0.01 * s, 0.03 * s, 0.22 * s, { color: 0x5a4a7a, seg: 4, capTop: false, flat: true, x, y, z, paint: false });
      b.sphere(0.08 * s, { color: col, mat: Mat.Glow, flat: true, wSeg: 5, hSeg: 3, x, y: y + 0.26 * s, z, paint: false });
      break;
    }
    case 'bonsai': {
      b.cyl(0.012 * s, 0.022 * s, 0.1 * s, { color: 0x5a3a2a, seg: 4, flat: true, x, y, z, rz: 0.4, paint: false });
      blob(0.06 * s, y + 0.12 * s, 0x3f7a3a, 0.5, -0.04 * s);
      blob(0.045 * s, y + 0.09 * s, 0x4a8a42, 0.5, 0.03 * s, 0.02 * s);
      break;
    }
  }
}

/** Scatter `n` trees within radius r around (cx, cz), avoiding a centre clearing of radius r0. */
export function grove(b: MeshBuilder, rng: Rng, cx: number, cz: number, r0: number, r: number, n: number, kinds: TreeKind[], s = 1, y = G): void {
  for (let i = 0; i < n; i++) {
    const a = rng.next() * TAU;
    const d = r0 + Math.sqrt(rng.next()) * (r - r0);
    tree(b, cx + Math.sin(a) * d, cz + Math.cos(a) * d, s * rng.range(0.8, 1.15), rng.pick(kinds), rng, y, i >= Math.ceil(n * 0.6));
  }
}

/** Low bush blob. */
export function bush(b: MeshBuilder, x: number, z: number, r: number, color: number, y = G, detail = true): void {
  b.sphere(r, { color, mat: Mat.Foliage, flat: true, wSeg: 5, hSeg: 2, thetaLength: Math.PI / 2, x, y, z, sy: 0.8, detail, paint: false });
}

/** Box hedge. */
export function hedge(b: MeshBuilder, x: number, z: number, w: number, d: number, h = 0.06, color = 0x3f8a3a, y = G, ry = 0): void {
  b.box(w, h, d, { color, mat: Mat.Foliage, x, y, z, ry, paint: false });
}

/** Flower bed: low disc of soil topped with a blossom colour. */
export function flowers(b: MeshBuilder, x: number, z: number, r: number, color: number, y = G, detail = true): void {
  b.cyl(r, r * 1.05, 0.025, { color: 0x6a4a32, top: color, topMat: Mat.Foliage, seg: 6, x, y, z, detail, paint: false });
}

// ─────────────────────────────────────────────────────────── furniture

/** Street lamp (pole + night light). 20 tris. */
export function lamp(b: MeshBuilder, x: number, z: number, h = 0.26, head: number = C.lamp, y = G): void {
  b.box(0.022, h, 0.022, { color: 0x3a3d44, mat: Mat.Plain, x, y, z, detail: true, paint: false });
  b.box(0.06, 0.03, 0.06, { color: head, mat: Mat.Light, x, y: y + h, z, detail: true, paint: false });
}

/** Ring of lamps. */
export function lampRing(b: MeshBuilder, r: number, n: number, h = 0.26, head: number = C.lamp, rot = 0, cx = 0, cz = 0): void {
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    lamp(b, cx + Math.sin(a) * r, cz + Math.cos(a) * r, h, head);
  }
}

/** Park bench facing +Z rotated by ry. 20 tris. */
export function bench(b: MeshBuilder, x: number, z: number, ry = 0, color: number = C.wood, y = G): void {
  b.group({ x, y, z, ry }, () => {
    b.box(0.12, 0.025, 0.04, { color, y: 0.02, detail: true, paint: false });
    b.box(0.12, 0.05, 0.012, { color: shade(color, 0.85), y: 0.03, z: -0.022, detail: true, paint: false });
  });
}

/** Tiny person (body + skin-toned top). 10 tris. */
export function person(b: MeshBuilder, x: number, z: number, color: number, y = G, h = 0.07): void {
  b.box(0.028, h, 0.028, { color, top: 0xf0c8a0, x, y, z, detail: true, paint: false });
}

/** Scatter a small crowd. */
export function crowd(b: MeshBuilder, rng: Rng, cx: number, cz: number, r: number, n: number, y = G): void {
  for (let i = 0; i < n; i++) {
    const a = rng.next() * TAU, d = Math.sqrt(rng.next()) * r;
    person(b, cx + Math.sin(a) * d, cz + Math.cos(a) * d, rng.pick(FUN), y, rng.range(0.055, 0.075));
  }
}

/** Flag pole with a flag facing +Z. 16 tris. */
export function flag(b: MeshBuilder, x: number, z: number, h: number, color: number, y = G): void {
  b.cyl(0.008, 0.008, h, { color: 0xdedede, mat: Mat.Plain, seg: 4, x, y, z, detail: true, paint: false });
  b.panel(0.12, 0.07, { color, x: x + 0.06, y: y + h - 0.08, z, both: true, detail: true, paint: false });
}

/** Café umbrella. */
export function umbrella(b: MeshBuilder, x: number, z: number, color: number, s = 1, y = G): void {
  b.cyl(0.006, 0.006, 0.12 * s, { color: 0xeeeeee, seg: 3, x, y, z, detail: true, paint: false });
  b.cone(0.08 * s, 0.035 * s, { color, seg: 6, flat: true, x, y: y + 0.1 * s, z, detail: true, paint: false });
}

/** Rooftop AC unit. */
export function acUnit(b: MeshBuilder, x: number, y: number, z: number, s = 1): void {
  b.box(0.1 * s, 0.05 * s, 0.08 * s, { color: 0xb8bcc4, x, y, z, detail: true, paint: false });
}

/** Antenna mast with a red night beacon. */
export function antenna(b: MeshBuilder, x: number, y: number, z: number, h: number, beacon = 0xff3030): void {
  b.cyl(0.006, 0.012, h, { color: 0xb8bec8, mat: Mat.Plain, seg: 4, x, y, z, paint: false });
  b.box(0.025, 0.025, 0.025, { color: beacon, mat: Mat.Glow, x, y: y + h, z, detail: true, paint: false });
}

/** Satellite dish facing direction ry, tilted up. */
export function dish(b: MeshBuilder, x: number, y: number, z: number, r: number, ry = 0, tilt = 0.7, color = 0xeef0f4): void {
  b.group({ x, y, z, ry }, () => {
    b.cyl(r * 0.12, r * 0.18, r * 0.5, { color: C.steel, seg: 4, paint: false });
    b.group({ y: r * 0.55, rx: tilt }, () => {
      b.lathe([[0.001, 0], [r * 0.5, r * 0.05], [r, r * 0.3]], { color, seg: 10, paint: false });
      b.cyl(0.004, 0.004, r * 0.7, { color: C.steel, seg: 3, detail: true, paint: false });
    });
  });
}

/** Solar panel slab tilted toward +Z (sun-facing look). */
export function solar(b: MeshBuilder, x: number, y: number, z: number, w: number, d: number, ry = 0): void {
  b.box(w, 0.012, d, { color: 0x203a6a, mat: Mat.Solar, topMat: Mat.Solar, x, y, z, rx: -0.35, ry, detail: true, paint: false });
}

/** Flat half-ellipse in the XY plane facing +Z (closes the open side of half-lathed shells). */
export function halfDisc(b: MeshBuilder, rx: number, ry: number, n: number, o: PartOpts & { mat?: MatId }): void {
  if (o.detail && b.lod === 1) return;
  const mat = o.mat ?? Mat.Plain;
  n = b.lod ? Math.max(3, n >> 1) : n;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI;
    b.tri([0, 0, 0], [Math.cos(a0) * rx, Math.sin(a0) * ry, 0], [Math.cos(a1) * rx, Math.sin(a1) * ry, 0], o, o.color, mat);
  }
}

/** Glow sign panel (double sided) — used for emblems and lettering bars. */
export function sign(b: MeshBuilder, x: number, y: number, z: number, w: number, h: number, color: number, mat: MatId = Mat.Glow, ry = 0, detail = false): void {
  b.panel(w, h, { color, mat, x, y, z, ry, both: true, detail, paint: false });
}

/** A plus-shaped medical cross on the plane z (facing +Z), centred at (x, y). */
export function cross(b: MeshBuilder, x: number, y: number, z: number, s: number, color: number = C.cross, mat: MatId = Mat.Glow, ry = 0): void {
  b.group({ x, y, z, ry }, () => {
    b.box(s, s * 0.32, 0.02, { color, mat, y: -s * 0.16, paint: false });
    b.box(s * 0.32, s, 0.02, { color, mat, y: -s * 0.5, paint: false });
  });
}

/** Five-point star badge facing +Z (police shields, sheriff vibes). */
export function badge(b: MeshBuilder, x: number, y: number, z: number, r: number, color: number, mat: MatId = Mat.Glow, ry = 0): void {
  b.group({ x, y, z, ry, rx: Math.PI / 2 }, () => {
    b.extrude(star(r, 0.48).map(([px, pz]) => [px, -pz] as V2), 0.02, { color, mat, topMat: mat, y: -0.01, paint: false });
  });
}

/** Steps leading up to a door (n stacked slabs, front at +Z). */
export function steps(b: MeshBuilder, x: number, z: number, w: number, n: number, rise: number, run: number, color: number = C.stone, y = G): void {
  for (let i = 0; i < n; i++) b.box(w - i * 0.02, rise, run * (n - i), { color, x, y: y + i * rise, z: z - (run * i) / 2, paint: false });
}

/** Row of round columns along X at depth z. */
export function columns(b: MeshBuilder, n: number, span: number, h: number, r: number, z: number, color: number, y = G, x0 = 0): void {
  for (let i = 0; i < n; i++) {
    const x = x0 + (n === 1 ? 0 : -span / 2 + (i / (n - 1)) * span);
    b.cyl(r, r, h, { color, seg: 6, x, y, z, paint: false, capTop: false });
  }
}

/** Fence (thin rails) along a closed or open polyline. */
export function fence(b: MeshBuilder, pts: V2[], h: number, color: number, closed = true, y = G, t = 0.012, mat: MatId = Mat.Plain): void {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    const dx = c[0] - a[0], dz = c[1] - a[1];
    const len = Math.hypot(dx, dz);
    b.box(t, h, len, { color, mat, x: (a[0] + c[0]) / 2, y, z: (a[1] + c[1]) / 2, ry: Math.atan2(dx, dz), detail: true, paint: false });
  }
}

/** Solid wall segments along a polyline (prison walls, garden walls). */
export function wall(b: MeshBuilder, pts: V2[], h: number, t: number, color: number, closed = true, y = G, top?: number): void {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    const dx = c[0] - a[0], dz = c[1] - a[1];
    const len = Math.hypot(dx, dz) + t;
    b.box(t, h, len, { color, top, x: (a[0] + c[0]) / 2, y, z: (a[1] + c[1]) / 2, ry: Math.atan2(dx, dz) });
  }
}

/** String of night lights between two points (small Light beads). */
export function stringLights(b: MeshBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, n: number, colors: readonly number[] = [C.lamp]): void {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const sag = Math.sin(t * Math.PI) * 0.05;
    b.box(0.018, 0.018, 0.018, { color: colors[i % colors.length], mat: Mat.Light, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t - sag, z: z0 + (z1 - z0) * t, detail: true, paint: false });
  }
}

// ─────────────────────────────────────────────────────────── vehicles (length along +Z)

/** Patrol car: white body, coloured doors, light bar. ~30 tris. */
export function patrolCar(b: MeshBuilder, x: number, z: number, ry: number, body: number, bar: number, y = G): void {
  b.group({ x, y, z, ry }, () => {
    b.box(0.1, 0.04, 0.22, { color: body, y: 0.012, detail: true, paint: false });
    b.box(0.088, 0.035, 0.11, { color: 0x2a3550, y: 0.052, z: -0.01, top: body, detail: true, paint: false });
    b.box(0.07, 0.012, 0.025, { color: bar, mat: Mat.Glow, y: 0.087, z: -0.01, detail: true, paint: false });
  });
}

/** Fire engine with ladder. ~40 tris. */
export function fireTruck(b: MeshBuilder, x: number, z: number, ry: number, y = G): void {
  b.group({ x, y, z, ry }, () => {
    b.box(0.12, 0.08, 0.3, { color: C.fire, y: 0.012, z: -0.03, detail: true, paint: false });
    b.box(0.12, 0.07, 0.09, { color: C.fire, top: 0xf2f2f2, y: 0.012, z: 0.15, detail: true, paint: false });
    b.box(0.1, 0.03, 0.06, { color: 0x1a2a3a, y: 0.045, z: 0.165, detail: true, paint: false });
    b.box(0.05, 0.02, 0.32, { color: 0xd8dce4, mat: Mat.Plain, y: 0.095, z: -0.03, rx: -0.06, detail: true, paint: false });
    b.box(0.08, 0.014, 0.022, { color: C.fireLight, mat: Mat.Glow, y: 0.084, z: 0.15, detail: true, paint: false });
  });
}

/** Ambulance van. ~30 tris. */
export function ambulance(b: MeshBuilder, x: number, z: number, ry: number, y = G): void {
  b.group({ x, y, z, ry }, () => {
    b.box(0.11, 0.09, 0.22, { color: 0xf6f6f2, y: 0.012, z: -0.02, detail: true, paint: false });
    b.box(0.112, 0.018, 0.222, { color: C.cross, y: 0.05, z: -0.02, detail: true, paint: false });
    b.box(0.1, 0.06, 0.06, { color: 0x24324a, top: 0xf6f6f2, y: 0.012, z: 0.12, detail: true, paint: false });
    b.box(0.07, 0.014, 0.022, { color: 0x4aa0ff, mat: Mat.Glow, y: 0.102, z: 0.07, detail: true, paint: false });
  });
}

/** Yellow school hover-bus. ~20 tris. */
export function schoolBus(b: MeshBuilder, x: number, z: number, ry: number, y = G): void {
  b.group({ x, y, z, ry }, () => {
    b.box(0.12, 0.09, 0.42, { color: C.bus, mat: Mat.WindowSmall, top: 0xf0b000, y: 0.018, detail: true, paint: false });
    b.box(0.1, 0.012, 0.36, { color: 0x222222, y: 0.006, detail: true, paint: false });
  });
}

/** Generic hover car. */
export function car(b: MeshBuilder, x: number, z: number, ry: number, color: number, y = G): void {
  b.group({ x, y, z, ry }, () => {
    b.box(0.1, 0.035, 0.2, { color, y: 0.014, detail: true, paint: false });
    b.box(0.085, 0.03, 0.1, { color: 0x26324a, y: 0.049, z: -0.01, top: color, detail: true, paint: false });
  });
}

/** Car park rows (n cars) along X at depth z. */
export function carRow(b: MeshBuilder, rng: Rng, x0: number, x1: number, z: number, n: number, ry = 0, y = G): void {
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1);
    if (rng.chance(0.82)) car(b, x, z, ry, rng.pick([0xe8e8ea, 0x2a2c32, 0xc0302a, 0x3a6ad0, 0x8a9098, 0xf0c040, 0x2a8a5a]), y);
  }
}

/** Helipad disc with an "H" and corner night lights. ~70 tris. */
export function helipad(b: MeshBuilder, x: number, y: number, z: number, r: number, color = 0x3a3e46, mark = 0xf4f4f4): void {
  b.cyl(r, r, 0.02, { color, seg: 12, x, y, z, paint: false });
  const s = r * 0.5;
  b.box(s * 0.22, 0.004, s * 1.1, { color: mark, x: x - s * 0.36, y: y + 0.02, z, paint: false });
  b.box(s * 0.22, 0.004, s * 1.1, { color: mark, x: x + s * 0.36, y: y + 0.02, z, paint: false });
  b.box(s * 0.72, 0.004, s * 0.2, { color: mark, x, y: y + 0.02, z, paint: false });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * TAU;
    b.box(0.025, 0.012, 0.025, { color: 0x7affa0, mat: Mat.Light, x: x + Math.sin(a) * r * 0.9, y: y + 0.02, z: z + Math.cos(a) * r * 0.9, detail: true, paint: false });
  }
}

/** Small hover drone (glowing core + rotor plate) floating at y. */
export function drone(b: MeshBuilder, x: number, y: number, z: number, glow: number, s = 1): void {
  b.box(0.07 * s, 0.012 * s, 0.07 * s, { color: 0x2a2e36, x, y, z, ry: Math.PI / 4, detail: true, paint: false, bottom: true });
  b.box(0.026 * s, 0.022 * s, 0.026 * s, { color: glow, mat: Mat.Glow, x, y: y - 0.016 * s, z, detail: true, paint: false });
}

/** Rooftop garden slab with a couple of bushes (for green styles). */
export function roofGarden(b: MeshBuilder, x: number, y: number, z: number, w: number, d: number, rng: Rng): void {
  b.box(w, 0.02, d, { color: 0x6a4a32, top: C.grass, topMat: Mat.Foliage, x, y, z, paint: false });
  bush(b, x - w * 0.25, z + d * 0.15, Math.min(w, d) * 0.22, rng.pick(TREE_GREENS), y + 0.02);
  bush(b, x + w * 0.22, z - d * 0.2, Math.min(w, d) * 0.18, rng.pick(TREE_GREENS), y + 0.02);
}

/** Neon trim strip along the top of a facade (front face at z). */
export function neonStrip(b: MeshBuilder, x: number, y: number, z: number, w: number, color: number): void {
  b.box(w, 0.014, 0.012, { color, mat: Mat.Glow, x, y, z, paint: false });
}

// ─────────────────────────────────────────────────────────── buildings

/** Window block with a roof slab overhang. Returns the roof height. */
export function block(b: MeshBuilder, w: number, h: number, d: number, o: { color: number; roof?: number; x?: number; y?: number; z?: number; ry?: number; mat?: MatId; cap?: number; capColor?: number }): number {
  const y = o.y ?? G;
  b.box(w, h, d, { color: o.color, mat: o.mat ?? Mat.Window, top: o.roof ?? shade(o.color, 0.8), x: o.x, y, z: o.z, ry: o.ry });
  const cap = o.cap ?? 0.02;
  if (cap > 0) b.box(w + 0.03, cap, d + 0.03, { color: o.capColor ?? shade(o.color, 0.72), top: o.roof ?? shade(o.color, 0.8), x: o.x, y: y + h, z: o.z, ry: o.ry });
  return y + h + cap;
}

/** Dark door / garage opening on a facade plane facing +Z at z. */
export function door(b: MeshBuilder, x: number, z: number, w: number, h: number, color = 0x2a2c32, y = G, mat: MatId = Mat.Plain): void {
  b.box(w, h, 0.012, { color, mat, x, y, z, paint: false });
}

/** Glowing canopy over an entrance (facing +Z). */
export function canopy(b: MeshBuilder, x: number, y: number, z: number, w: number, d: number, color: number, glow?: number): void {
  b.box(w, 0.02, d, { color, x, y, z: z + d / 2, bottom: true });
  if (glow !== undefined) b.box(w, 0.008, 0.01, { color: glow, mat: Mat.Glow, x, y: y + 0.006, z: z + d + 0.002, paint: false });
}

/** Mix helper re-exported for factories. */
export { mix, shade, pickColor, Mat };
export type { MatId, MeshBuilder };
