/**
 * landmarks · shared geometry parts for landmarks, wonders and orbital structures (OWNER: landmarks).
 *
 * Thin helpers on top of the kit (content/kit.ts). Local space follows the kit: +Y up, +Z toward the item's
 * `rot` neighbour, origin = centre of the footprint on the ground. Big landmarks are seen from every side (the
 * placement rotation of a 7 / 19 footprint is arbitrary), so plazas are radially symmetric.
 *
 *   plaza(b, fp, …)        stone plate under the whole footprint, skirt sunk below the terrain so planet curvature
 *                          never shows a gap; optional inset field and gold kerb.
 *   ringOf(n, r, fn)       call fn(x, z, angle, i) for n evenly spaced points on a circle.
 *   lamp / lampRing        night-only light posts (Mat.Light) — the plaza edge sparkles after dusk.
 *   tree / grove           low-poly trees (Mat.Foliage sways in the wind).
 *   figure                 a stylised standing person / astronaut (statues and colossi).
 *   arch / vring           half and full vertical rings (gates, arches, halos).
 *   beam                   a thin Mat.Glow light pillar into the sky (bloom does the rest at night).
 *   stairs, flag, crowd    small details (`detail: true`, dropped at LOD1).
 * Everything is deterministic: pass ctx.rng where randomness is needed.
 */
import { Mat, shade, type MatId, type MeshBuilder, type PartOpts } from '../../kit';
import type { Rng } from '../../../core/rng';

export type V2 = [number, number];
export type V3 = [number, number, number];
export const TAU = Math.PI * 2;
/** Top of the plaza plate: things stand on this. */
export const G = 0.03;
/** Plaza circumradius per footprint (reaches into the outer tiles' lobes, like other lots). */
export const LOT_R: Record<1 | 7 | 19, number> = { 1: 0.9, 7: 2.56, 19: 4.75 };

// ─────────────────────────────────────────────────────────── palette

export const P = {
  marble: 0xf2eee6,
  marbleWarm: 0xe8dcc6,
  stone: 0xc9c0b0,
  stoneDark: 0x8f877a,
  granite: 0x6f6c72,
  basalt: 0x34333a,
  paving: 0xd9d3c7,
  pavingWarm: 0xe6d6b8,
  gold: 0xffc94a,
  brass: 0xd9a441,
  bronze: 0xa8743e,
  copper: 0x3fae94,
  steel: 0x9aa3b2,
  chrome: 0xd8e0ea,
  hull: 0xe9edf2,
  hullDark: 0x59606c,
  dark: 0x23252c,
  obsidian: 0x16151c,
  grass: 0x6aad48,
  grassDark: 0x4f9440,
  water: 0x3a8ad0,
  wood: 0x8a5a3a,
  red: 0xe0453a,
  orange: 0xff8a2a,
  amber: 0xffb347,
  yellow: 0xffd84a,
  cyan: 0x3fe8ff,
  teal: 0x2ad0b8,
  blue: 0x3a7ae0,
  violet: 0x9a5aff,
  magenta: 0xff3fd0,
  pink: 0xff7ab8,
  lime: 0x9aff5a,
  white: 0xffffff,
  lamp: 0xffd9a0,
  lampCool: 0xcff4ff,
} as const;

export const GREENS = [0x5f9e3f, 0x4f8f3a, 0x6aad48, 0x79b94f, 0x3f7f3a];
export const BLOSSOMS = [0xffb0d0, 0xff8ac0, 0xffd0e6, 0xf6a0ff];

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

/** Hexagon with chamfered corners (12 points). `rot` 0 → corners toward the six neighbour tiles. */
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

/** Star polygon (alternating radii). */
export function star(n: number, r0: number, r1: number, rot = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const r = i % 2 === 0 ? r0 : r1;
    out.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  return out;
}

/** Call fn for n points evenly spaced on a circle of radius r (first at angle `rot` from +Z). */
export function ringOf(n: number, r: number, fn: (x: number, z: number, a: number, i: number) => void, rot = 0): void {
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    fn(Math.sin(a) * r, Math.cos(a) * r, a, i);
  }
}

// ─────────────────────────────────────────────────────────── ground

/** Extruded plate whose skirt sinks `sink` below 0 so curvature never shows a gap. */
export function plate(b: MeshBuilder, poly: V2[], top: number, color: number, o: { sink?: number; side?: number; mat?: MatId; y?: number; detail?: boolean } = {}): void {
  const sink = o.sink ?? 0.08;
  const y0 = (o.y ?? 0) - sink;
  b.extrude(poly, top - (o.y ?? 0) + sink, { color: o.side ?? shade(color, 0.8), top: color, y: y0, paint: false, topMat: o.mat ?? Mat.Plain, mat: Mat.Plain, detail: o.detail });
}

export interface PlazaOpts {
  /** inset field colour (grass, paving…); omit for a plain plate */
  field?: number;
  /** field radius fraction (default 0.9) */
  fieldR?: number;
  /** field outline: 'hex' (default) or 'round' */
  round?: boolean;
  /** kerb colour (thin raised ring between plate and field) */
  kerb?: number;
  side?: number;
  /** material of the field top (e.g. Mat.Water for a reflecting pool) */
  fieldMat?: MatId;
}

/** The footprint plaza: a soft-hex stone plate (+ optional inset field). Returns the usable top height. */
export function plaza(b: MeshBuilder, fp: 1 | 7 | 19, color: number, o: PlazaOpts = {}): number {
  const r = LOT_R[fp];
  const rot = fp === 1 ? Math.PI / 6 : 0;
  const sink = fp === 1 ? 0.08 : fp === 7 ? 0.14 : 0.3;
  plate(b, softHex(r, rot, 0.14), G - 0.006, color, { sink, side: o.side ?? shade(color, 0.78) });
  if (o.field !== undefined) {
    const fr = r * (o.fieldR ?? 0.9);
    const poly = o.round ? ngon(fp === 19 ? 28 : 20, fr * 0.96) : softHex(fr, rot, 0.14);
    // kerb: a slightly larger plate just under the field, so only its rim shows
    if (o.kerb !== undefined) b.extrude(o.round ? ngon(fp === 19 ? 28 : 20, fr * 0.96 + (fp === 19 ? 0.1 : 0.06)) : softHex(fr + (fp === 19 ? 0.1 : 0.06), rot, 0.14), 0.012, { color: o.kerb, y: G - 0.006, paint: false });
    b.extrude(poly, 0.014, { color: o.field, y: G - 0.004, paint: false, topMat: o.fieldMat ?? Mat.Plain });
  }
  return G;
}

/** Round raised platform / plinth (seg-sided), bottom at y. Returns its top height. */
export function disc(b: MeshBuilder, r: number, h: number, color: number, o: { y?: number; seg?: number; top?: number; mat?: MatId; topMat?: MatId; x?: number; z?: number; detail?: boolean } = {}): number {
  b.cyl(r, r, h, { color, top: o.top, seg: o.seg ?? 16, y: o.y ?? G, x: o.x, z: o.z, mat: o.mat, topMat: o.topMat, paint: false, detail: o.detail });
  return (o.y ?? G) + h;
}

/** Stepped plinth: n square steps shrinking upward. Returns top height. */
export function steps(b: MeshBuilder, w: number, n: number, rise: number, run: number, color: number, o: { y?: number; top?: number; round?: number } = {}): number {
  let y = o.y ?? G;
  for (let i = 0; i < n; i++) {
    const ww = w - i * run * 2;
    if (o.round) b.cyl(ww / 2, ww / 2, rise, { color: shade(color, 1 - i * 0.03), seg: o.round, y, paint: false, top: i === n - 1 ? o.top : undefined });
    else b.box(ww, rise, ww, { color: shade(color, 1 - i * 0.03), y, paint: false, top: i === n - 1 ? o.top : undefined });
    y += rise;
  }
  return y;
}

/** A flight of stairs climbing toward −Z (front at +Z), centred on x; bottom at y. */
export function stairs(b: MeshBuilder, w: number, n: number, rise: number, run: number, color: number, o: { x?: number; z?: number; y?: number; ry?: number } = {}): void {
  b.push({ x: o.x ?? 0, z: o.z ?? 0, y: o.y ?? G, ry: o.ry ?? 0 });
  for (let i = 0; i < n; i++) b.box(w, rise * (i + 1), run, { color: shade(color, 1 - (i % 2) * 0.05), z: -i * run, paint: false });
  b.pop();
}

// ─────────────────────────────────────────────────────────── lights & greenery

/** Night light post (Mat.Light bulb). `detail` defaults true. */
export function lamp(b: MeshBuilder, x: number, z: number, h = 0.22, color: number = P.lamp, o: { y?: number; detail?: boolean; pole?: number } = {}): void {
  const d = o.detail ?? true;
  if (d && b.lod === 1) return;
  const y = o.y ?? G;
  b.cyl(0.012, 0.016, h, { color: o.pole ?? P.dark, seg: 4, x, y, z, paint: false, detail: d });
  b.sphere(0.03, { color, mat: Mat.Light, wSeg: 5, hSeg: 3, x, y: y + h + 0.02, z, paint: false, detail: d });
}

/** n lamps on a circle. */
export function lampRing(b: MeshBuilder, n: number, r: number, h = 0.22, color: number = P.lamp, rot = 0, y = G): void {
  ringOf(n, r, (x, z) => lamp(b, x, z, h, color, { y }), rot);
}

/** Glowing bollards / ground lights (always on, Mat.Glow) on a circle. */
export function glowRing(b: MeshBuilder, n: number, r: number, color: number, o: { y?: number; s?: number; rot?: number; detail?: boolean } = {}): void {
  const s = o.s ?? 1;
  ringOf(n, r, (x, z) => b.box(0.05 * s, 0.05 * s, 0.05 * s, { color, mat: Mat.Glow, x, z, y: o.y ?? G, paint: false, detail: o.detail ?? true }), o.rot ?? 0);
}

export type TreeKind = 'round' | 'pine' | 'blossom' | 'palm' | 'glow';

/** Low-poly tree (≈ 30–50 tris). */
export function tree(b: MeshBuilder, x: number, z: number, s: number, kind: TreeKind, rng: Rng, y = G, detail = false): void {
  if (detail && b.lod === 1) return;
  const F = Mat.Foliage;
  const trunk = (h: number, r: number, col = 0x6b4a32) => b.cyl(r * 0.7, r, h, { color: col, seg: 4, capTop: false, flat: true, x, y, z, paint: false });
  const blob = (r: number, yy: number, col: number, sy = 0.9, mat: MatId = F) =>
    b.sphere(r, { color: col, mat, flat: true, wSeg: b.lod ? 4 : 5, hSeg: b.lod ? 2 : 3, x, y: yy, z, sy, paint: false });
  switch (kind) {
    case 'round':
      trunk(0.16 * s, 0.025 * s);
      blob(0.14 * s, y + 0.25 * s, rng.pick(GREENS));
      break;
    case 'blossom':
      trunk(0.14 * s, 0.025 * s, 0x5a3a2a);
      blob(0.13 * s, y + 0.22 * s, rng.pick(BLOSSOMS), 0.75);
      break;
    case 'pine': {
      const col = rng.pick([0x2f6a44, 0x3a7a4a, 0x2a5a3a]);
      trunk(0.08 * s, 0.022 * s);
      b.cone(0.13 * s, 0.22 * s, { color: col, mat: F, seg: 6, flat: true, x, y: y + 0.06 * s, z, paint: false });
      b.cone(0.095 * s, 0.18 * s, { color: shade(col, 1.12), mat: F, seg: 6, flat: true, x, y: y + 0.19 * s, z, paint: false });
      break;
    }
    case 'palm':
      trunk(0.3 * s, 0.022 * s, 0x8a6a4a);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + rng.range(0, 0.5);
        b.box(0.04 * s, 0.012 * s, 0.2 * s, { color: 0x4f9a3f, mat: F, x: x + Math.sin(a) * 0.08 * s, y: y + 0.29 * s, z: z + Math.cos(a) * 0.08 * s, ry: a, rx: 0.35, paint: false });
      }
      break;
    case 'glow':
      trunk(0.16 * s, 0.025 * s, 0x3a2f4a);
      blob(0.13 * s, y + 0.25 * s, rng.pick([0x3fe8ff, 0x9a5aff, 0xff5ad0, 0x5affc8]), 0.9, Mat.Glow);
      break;
  }
}

/** n trees around a circle (alternate ones are detail). */
export function grove(b: MeshBuilder, rng: Rng, n: number, r: number, kinds: TreeKind[], s = 1, rot = 0, y = G): void {
  ringOf(n, r, (x, z, _a, i) => tree(b, x, z, s * rng.range(0.85, 1.15), rng.pick(kinds), rng, y, i % 2 === 1), rot);
}

/** Small hedge / flower box ring segment. */
export function hedge(b: MeshBuilder, x: number, z: number, w: number, d: number, ry = 0, color: number = GREENS[1], y = G): void {
  b.box(w, 0.07, d, { color, mat: Mat.Foliage, x, z, y, ry, paint: false, detail: true });
}

// ─────────────────────────────────────────────────────────── figures

export interface FigureOpts {
  x?: number;
  y?: number;
  z?: number;
  /** total height */
  h: number;
  ry?: number;
  color: number;
  mat?: MatId;
  /** 'robe' (cone skirt), 'suit' (astronaut: big helmet + backpack), 'plain' */
  kind?: 'robe' | 'suit' | 'plain';
  /** right hand target, in units of h, relative to the figure origin (default hanging) */
  right?: V3;
  /** left hand target */
  left?: V3;
  /** visor / accent colour (suit) */
  visor?: number;
  detail?: boolean;
}

/** Stylised standing figure (≈ 150–260 tris). Faces +Z. Returns hand positions in local figure space × h. */
export function figure(b: MeshBuilder, o: FigureOpts): { right: V3; left: V3 } {
  const h = o.h;
  const m = o.mat ?? Mat.Plain;
  const c = o.color;
  const kind = o.kind ?? 'plain';
  const right: V3 = o.right ?? [0.2, 0.42, 0.02];
  const left: V3 = o.left ?? [-0.2, 0.42, 0.02];
  if (o.detail && b.lod === 1) return { right, left };
  const po: PartOpts = { color: c, mat: m, paint: false };
  b.push({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0, s: h });
  if (kind === 'robe') {
    b.cyl(0.11, 0.2, 0.52, { ...po, seg: 10 });
    b.cyl(0.12, 0.11, 0.2, { ...po, seg: 10, y: 0.52 });
  } else {
    // legs
    const legR = kind === 'suit' ? 0.055 : 0.045;
    b.cyl(legR * 1.05, legR * 0.9, 0.46, { ...po, seg: 6, x: -0.06, flat: true });
    b.cyl(legR * 1.05, legR * 0.9, 0.46, { ...po, seg: 6, x: 0.06, flat: true });
    b.box(0.08, 0.04, 0.13, { ...po, x: -0.06, z: 0.02 });
    b.box(0.08, 0.04, 0.13, { ...po, x: 0.06, z: 0.02 });
    // hips + torso
    b.cyl(0.13, 0.11, 0.1, { ...po, seg: 8, y: 0.44 });
    b.cyl(0.15, 0.12, 0.2, { ...po, seg: 8, y: 0.54 });
  }
  // shoulders
  b.sphere(kind === 'suit' ? 0.16 : 0.14, { ...po, wSeg: 8, hSeg: 4, y: 0.72, sy: 0.5 });
  // head
  if (kind === 'suit') {
    b.sphere(0.1, { ...po, wSeg: 10, hSeg: 6, y: 0.86 });
    b.sphere(0.075, { color: o.visor ?? P.amber, mat: Mat.Glass, wSeg: 8, hSeg: 4, y: 0.865, z: 0.04, sz: 0.7, thetaLength: Math.PI, paint: false });
    b.box(0.2, 0.24, 0.09, { ...po, y: 0.52, z: -0.14 });
  } else {
    b.cyl(0.035, 0.04, 0.06, { ...po, seg: 6, y: 0.76 });
    b.sphere(0.075, { ...po, wSeg: 8, hSeg: 5, y: 0.87 });
  }
  // arms: shoulder → elbow → hand
  const arm = (sx: number, t: V3) => {
    const sh: V3 = [sx * 0.15, 0.72, 0];
    const el: V3 = [(sh[0] + t[0]) / 2 + sx * 0.04, (sh[1] + t[1]) / 2 - 0.02, (sh[2] + t[2]) / 2 - 0.02];
    b.tube([sh, el, t], kind === 'suit' ? 0.045 : 0.035, { ...po, seg: 5 });
    b.sphere(kind === 'suit' ? 0.05 : 0.04, { ...po, wSeg: 5, hSeg: 3, x: t[0], y: t[1], z: t[2] });
  };
  arm(1, right);
  arm(-1, left);
  b.pop();
  return { right, left };
}

/** A few tiny people on the plaza (detail). */
export function crowd(b: MeshBuilder, rng: Rng, n: number, rMin: number, rMax: number, y = G): void {
  if (b.lod === 1) return;
  const cols = [0xe0453a, 0x3a7ae0, 0xffcf3a, 0x4ac06a, 0xf4f2ee, 0x9a5ae0, 0xff9a2a];
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), r = rng.range(rMin, rMax);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    b.box(0.035, 0.06, 0.025, { color: rng.pick(cols), x, z, y, paint: false, detail: true });
    b.box(0.022, 0.022, 0.022, { color: 0xe6b894, x, z, y: y + 0.06, paint: false, detail: true });
  }
}

// ─────────────────────────────────────────────────────────── rings, arches, beams

/** Upper half ring standing in the XY plane (facing ±Z), springing from y. */
export function arch(b: MeshBuilder, R: number, r: number, o: PartOpts & { seg?: number; tube?: number }): void {
  b.torus(R, r, { ...o, arc: Math.PI, rx: Math.PI / 2, ry: Math.PI / 2, seg: o.seg ?? 16, tube: o.tube ?? 6 });
}

/** Full ring standing in the XY plane (facing ±Z), centred at (x, y, z). Add `ry` to turn it. */
export function vring(b: MeshBuilder, R: number, r: number, o: PartOpts & { seg?: number; tube?: number; arc?: number }): void {
  b.push({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0, rz: o.rz ?? 0 });
  b.torus(R, r, { ...o, x: 0, y: 0, z: 0, ry: 0, rz: 0, rx: Math.PI / 2, seg: o.seg ?? 24, tube: o.tube ?? 6 });
  b.pop();
}

/** Thin disc standing in the XY plane (event horizons, clock faces, rose windows), centred at (x, y, z). */
export function vdisc(b: MeshBuilder, r: number, t: number, o: PartOpts & { seg?: number }): void {
  b.push({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0 });
  b.cyl(r, r, t, { ...o, x: 0, y: 0, z: -t / 2, ry: 0, rx: Math.PI / 2, seg: o.seg ?? 16, capBottom: true });
  b.pop();
}

/** Vertical light pillar (always glowing). Bottom at y. */
export function beam(b: MeshBuilder, h: number, r: number, color: number, o: { x?: number; y?: number; z?: number; seg?: number; mat?: MatId } = {}): void {
  b.cyl(r * 0.35, r, h, { color, mat: o.mat ?? Mat.Glow, seg: o.seg ?? 6, x: o.x, y: o.y ?? 0, z: o.z, capTop: false, paint: false });
}

/** Beacon: small glowing sphere (aviation light / tip). */
export function beacon(b: MeshBuilder, x: number, y: number, z: number, r = 0.06, color: number = P.red, mat: MatId = Mat.Glow, detail = false): void {
  b.sphere(r, { color, mat, wSeg: 6, hSeg: 4, x, y, z, paint: false, detail });
}

/** Flag on a pole, banner facing +Z rotated by ry. */
export function flag(b: MeshBuilder, x: number, z: number, h: number, color: number, o: { y?: number; ry?: number; pole?: number } = {}): void {
  if (b.lod === 1) return;
  const y = o.y ?? G;
  b.cyl(0.01, 0.014, h, { color: o.pole ?? P.chrome, seg: 4, x, y, z, paint: false, detail: true });
  b.push({ x, y: y + h * 0.72, z, ry: o.ry ?? 0 });
  b.panel(h * 0.4, h * 0.24, { color, x: h * 0.2, paint: false, both: true, detail: true });
  b.pop();
}

/** Ring of n flags. */
export function flagRing(b: MeshBuilder, n: number, r: number, h: number, colors: readonly number[], rot = 0, y = G): void {
  ringOf(n, r, (x, z, a, i) => flag(b, x, z, h, colors[i % colors.length], { y, ry: a + Math.PI / 2 }), rot);
}

/** Water pool: rim + animated water surface. */
export function pool(b: MeshBuilder, r: number, o: { x?: number; z?: number; y?: number; seg?: number; rim?: number; h?: number } = {}): void {
  const y = o.y ?? G;
  const seg = o.seg ?? 16;
  b.cyl(r, r, o.h ?? 0.06, { color: o.rim ?? P.stone, seg, x: o.x, z: o.z, y, paint: false });
  b.cyl(r * 0.9, r * 0.9, 0.012, { color: P.water, mat: Mat.Water, seg, x: o.x, z: o.z, y: y + (o.h ?? 0.06), paint: false });
}

/** Rectangular reflecting pool. */
export function pond(b: MeshBuilder, w: number, d: number, o: { x?: number; z?: number; y?: number; ry?: number; rim?: number } = {}): void {
  const y = o.y ?? G;
  b.box(w, 0.04, d, { color: o.rim ?? P.stone, x: o.x, z: o.z, y, ry: o.ry, paint: false });
  b.box(w - 0.08, 0.012, d - 0.08, { color: P.water, mat: Mat.Water, topMat: Mat.Water, x: o.x, z: o.z, y: y + 0.04, ry: o.ry, paint: false });
}

/** Faceted crystal shard: hexagonal prism with a pointed cap, tilted. Bottom at origin. */
export function shard(b: MeshBuilder, r: number, h: number, color: number, o: { x?: number; y?: number; z?: number; rx?: number; rz?: number; ry?: number; mat?: MatId; tip?: number; detail?: boolean; sides?: number } = {}): void {
  const tip = o.tip ?? r * 2.2;
  b.push({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, rx: o.rx ?? 0, ry: o.ry ?? 0, rz: o.rz ?? 0 });
  b.cyl(r, r * 0.8, h, { color, mat: o.mat ?? Mat.Plain, seg: o.sides ?? 6, flat: true, capTop: false, paint: false, detail: o.detail });
  b.cyl(0, r, tip, { color: shade(color, 1.15), mat: o.mat ?? Mat.Plain, seg: o.sides ?? 6, flat: true, y: h, capTop: false, paint: false, detail: o.detail });
  b.pop();
}

/**
 * Frustum strut from point a (radius ra) to point c (radius rc). Cheaper than tube() for single segments and can
 * taper. Uses an XYZ Euler that maps +Y onto the a→c direction.
 */
export function strut(b: MeshBuilder, a: V3, c: V3, ra: number, rc: number, o: PartOpts & { seg?: number; caps?: boolean }): void {
  if (o.detail && b.lod === 1) return;
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-5) return;
  const nx = dx / len, ny = dy / len, nz = dz / len;
  b.push({ x: a[0], y: a[1], z: a[2], rx: Math.atan2(nz, ny), rz: -Math.asin(Math.max(-1, Math.min(1, nx))) });
  b.cyl(rc, ra, len, { ...o, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, seg: o.seg ?? 6, capTop: o.caps ?? false, capBottom: false });
  b.pop();
}

/** Tapered polyline (radius lerps from r0 at the first point to r1 at the last). */
export function taper(b: MeshBuilder, pts: V3[], r0: number, r1: number, o: PartOpts & { seg?: number }): void {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) strut(b, pts[i], pts[i + 1], r0 + ((r1 - r0) * i) / n, r0 + ((r1 - r0) * (i + 1)) / n, { ...o, caps: i === n - 1 });
}

/** Spiral path points (helix) — for tube(). */
export function helix(r: number, y0: number, y1: number, turns: number, n: number, phase = 0): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = phase + t * turns * TAU;
    out.push([Math.sin(a) * r, y0 + (y1 - y0) * t, Math.cos(a) * r]);
  }
  return out;
}

/** Truss: four longerons + cross braces between two points along Y (bottom at y0). */
export function truss(b: MeshBuilder, w: number, y0: number, y1: number, color: number, o: { x?: number; z?: number; bays?: number; r?: number; detail?: boolean } = {}): void {
  const x = o.x ?? 0, z = o.z ?? 0, r = o.r ?? 0.02;
  const hw = w / 2;
  const corners: V2[] = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
  for (const [cx, cz] of corners) b.cyl(r, r, y1 - y0, { color, seg: 4, x: x + cx, z: z + cz, y: y0, paint: false });
  const bays = o.bays ?? Math.max(1, Math.round((y1 - y0) / (w * 1.2)));
  if (o.detail && b.lod === 1) return;
  for (let i = 0; i < bays; i++) {
    const ya = y0 + ((y1 - y0) * i) / bays, yb = y0 + ((y1 - y0) * (i + 1)) / bays;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      const up = (i + k) % 2 === 0;
      b.tube([[x + ax, up ? ya : yb, z + az], [x + bx, up ? yb : ya, z + bz]], r * 0.7, { color, seg: 3, paint: false, detail: true });
    }
  }
}
