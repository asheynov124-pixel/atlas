/**
 * OWNER: studio.
 * Part library — 43 building blocks for the Architect Studio, each with a gameplay-free description:
 *   label · family · blurb · SVG glyph · editable parameters (with ranges & units) · smart defaults for a new part
 *   on the current design · stack height · habitable fraction (drives housing / jobs) · kit mesh builder.
 * Builders draw in part space (origin = part base centre, +Y up, +Z front) through the kit's MeshBuilder; anything
 * decorative is flagged `detail` so LOD1 drops it. Deterministic: randomness comes from hash01(part index, k).
 */
import { Mat, shade, mix, type MatId, type MeshBuilder } from '../content/kit';
import { DEG, beam, hash01, isRound, loft, regularOutline, roundedRectOutline, shapeOutline, type Outline } from './geom';
import { MAT_IDS, type Footprint, type MatName, type NumKey, type PartSpec, type PartType, normalizePart } from './model';

export type Family = 'structure' | 'tops' | 'details' | 'energy' | 'nature';

export const FAMILIES: { id: Family; label: string; icon: string }[] = [
  { id: 'structure', label: 'Structure', icon: 'building' },
  { id: 'tops', label: 'Roofs & tops', icon: 'landmarks' },
  { id: 'details', label: 'Details', icon: 'sparkles' },
  { id: 'energy', label: 'Energy & tech', icon: 'power' },
  { id: 'nature', label: 'Nature & water', icon: 'nature' },
];

export type ParamUnit = 'm' | 'deg' | 'pct' | 'int' | 'sides';

export interface ParamDef {
  key: NumKey;
  label: string;
  min: number | ((fpR: number) => number);
  max: number | ((fpR: number) => number);
  step: number;
  unit: ParamUnit;
  /** discrete choices (rendered as a segmented stepper) */
  choices?: { value: number; label: string }[];
  /** quadratic slider response (fine control near the minimum) */
  curve?: boolean;
}

export interface HostInfo {
  t: PartType;
  w: number;
  d: number;
  h: number;
  seg: number;
  taper: number;
  base: number;
  top: number;
  topW: number;
  topD: number;
  x: number;
  z: number;
}

export interface AddCtx {
  fp: Footprint;
  fpR: number;
  /** current stack top */
  top: number;
  /** last stacked structural part (or null on an empty lot) */
  host: HostInfo | null;
  /** tallest point of the design */
  height: number;
}

export interface PartCtx {
  fpR: number;
  /** part index (seed for deterministic jitter) */
  index: number;
  /** absolute base height of this part (posts down to the ground…) */
  base: number;
  M: MatId;
}

export interface PartDef {
  t: PartType;
  label: string;
  family: Family;
  blurb: string;
  glyph: string;
  params: ParamDef[];
  /** label for the accent colour (omit when unused) */
  accent?: string;
  /** contribution to the stack */
  height(p: PartSpec): number;
  /** width of the part's top (for parts stacked on it) */
  topScale?(p: PartSpec): number;
  /** fraction of the bounding volume that is usable floor space (0 = decoration) */
  habitable: number;
  create(ctx: AddCtx): Partial<PartSpec>;
  build(b: MeshBuilder, p: PartSpec, c: PartCtx): void;
}

// ───────────────────────────────────────────── parameter presets
const W = (fpR: number) => Math.max(1.2, fpR * 2.3);
const pW = (label = 'Width'): ParamDef => ({ key: 'w', label, min: 0.05, max: W, step: 0.01, unit: 'm', curve: true });
const pD = (label = 'Depth'): ParamDef => ({ key: 'd', label, min: 0.05, max: W, step: 0.01, unit: 'm', curve: true });
const pH = (label = 'Height', max = 30, min = 0.05): ParamDef => ({ key: 'h', label, min, max, step: 0.01, unit: 'm', curve: true });
const pTaper = (label = 'Taper', max = 1): ParamDef => ({ key: 'taper', label, min: 0, max, step: 0.01, unit: 'pct' });
const pTwist = (max = 180): ParamDef => ({ key: 'twist', label: 'Twist', min: -max, max, step: 1, unit: 'deg' });
const pN = (label: string, min: number, max: number): ParamDef => ({ key: 'n', label, min, max, step: 1, unit: 'int' });
const pTilt = (label = 'Tilt', min = 0, max = 60): ParamDef => ({ key: 'tilt', label, min, max, step: 1, unit: 'deg' });
const SIDES = (list: number[]): ParamDef => ({
  key: 'seg',
  label: 'Shape',
  min: list[0],
  max: list[list.length - 1],
  step: 1,
  unit: 'sides',
  choices: list.map((v) => ({ value: v, label: v === 3 ? 'Tri' : v === 4 ? 'Square' : v === 5 ? 'Penta' : v === 6 ? 'Hex' : v === 8 ? 'Octa' : v <= 12 ? '12-gon' : 'Round' })),
});
const SMOOTH = (min = 6, max = 48): ParamDef => ({ key: 'seg', label: 'Smoothness', min, max, step: 1, unit: 'int' });

const SHAPES_ALL = [3, 4, 5, 6, 8, 12, 24];
const SHAPES_ROUND = [4, 6, 8, 24];

// ───────────────────────────────────────────── shared builders

/** Solid of `sides` (4 = rectangle, ≤8 polygon, more = round). */
function solid(
  b: MeshBuilder,
  sides: number,
  w: number,
  d: number,
  h: number,
  o: { y?: number; taper?: number; twist?: number; color: number; mat: MatId; topColor?: number; topMat?: MatId; capBottom?: boolean; detail?: boolean; profile?: (t: number) => number; rings?: number; capTop?: boolean },
): void {
  const { outline, smooth } = shapeOutline(b, sides, w, d);
  loft(b, outline, { h, smooth, ...o });
}

/** Evenly spaced points (+ outward normals) along the perimeter of a shape. */
function perimeter(sides: number, w: number, d: number, n: number): { x: number; z: number; nx: number; nz: number }[] {
  const out: { x: number; z: number; nx: number; nz: number }[] = [];
  if (isRound(sides) || sides !== 4) {
    const poly: Outline = isRound(sides) ? regularOutline(64, w / 2, d / 2) : regularOutline(sides, w / 2, d / 2);
    walk(poly, n, out);
    return out;
  }
  walk(
    [
      [w / 2, d / 2],
      [-w / 2, d / 2],
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
    ],
    n,
    out,
  );
  return out;
}

function walk(poly: Outline, n: number, out: { x: number; z: number; nx: number; nz: number }[]): void {
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    segs.push(l);
    total += l;
  }
  for (let k = 0; k < n; k++) {
    let t = ((k + 0.5) / n) * total;
    let i = 0;
    while (i < segs.length - 1 && t > segs[i]) t -= segs[i++];
    const a = poly[i], c = poly[(i + 1) % poly.length];
    const f = segs[i] > 0 ? t / segs[i] : 0;
    const x = a[0] + (c[0] - a[0]) * f, z = a[1] + (c[1] - a[1]) * f;
    // outward normal of a CCW edge: (dz, -dx)
    let nx = c[1] - a[1], nz = -(c[0] - a[0]);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if (nx * x + nz * z < 0) {
      nx = -nx;
      nz = -nz;
    }
    out.push({ x, z, nx, nz });
  }
}

// ───────────────────────────────────────────── the library

const DEFS: PartDef[] = [
  // ═══════════════════════════════ STRUCTURE
  {
    t: 'plinth',
    label: 'Plinth',
    family: 'structure',
    blurb: 'A stepped base that grounds everything above it.',
    glyph: '<path d="M3 17h18v3H3zM5 13.5h14V17H5z"/>',
    params: [pW(), pD(), pH('Height', 1.5, 0.02), SIDES([4, 6, 8, 12, 24])],
    accent: 'Light strip',
    habitable: 0,
    height: (p) => p.h,
    create: (c) => ({ w: c.fpR * 1.96, d: c.fpR * 1.96, h: 0.12, seg: c.fp === 1 ? 4 : 6, c: 0xc9ccd3, c2: 0xffd9a0, m: 'plain' }),
    build(b, p, c) {
      solid(b, p.seg, p.w, p.d, p.h * 0.68, { color: p.c, mat: c.M, topColor: shade(p.c, 0.93) });
      solid(b, p.seg, p.w * 0.9, p.d * 0.9, p.h * 0.32, { y: p.h * 0.68, color: shade(p.c, 1.05), mat: c.M });
      const { outline } = shapeOutline(b, p.seg, p.w * 1.004, p.d * 1.004);
      loft(b, outline, { y: p.h * 0.5, h: Math.min(0.02, p.h * 0.12), color: p.c2, mat: Mat.Light, capTop: false, detail: true, smooth: isRound(p.seg) });
    },
  },
  {
    t: 'podium',
    label: 'Podium',
    family: 'structure',
    blurb: 'Low, wide base floors with a lit entrance canopy.',
    glyph: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M7 12h2M11 12h2M15 12h2M7 15h2M15 15h2M10 20v-3h4v3"/>',
    params: [pW(), pD(), pH('Height', 6, 0.1), SIDES(SHAPES_ALL)],
    accent: 'Canopy',
    habitable: 0.95,
    height: (p) => p.h,
    create: (c) => {
      const w = c.host ? Math.min(c.host.topW, c.fpR * 1.6) : c.fpR * 1.6;
      return { w, d: c.host ? Math.min(c.host.topD, c.fpR * 1.6) : w, h: 0.6, seg: 4, c: 0xe8e4dc, c2: 0x8a909c, m: 'windows' };
    },
    build(b, p, c) {
      solid(b, p.seg, p.w, p.d, p.h, { color: p.c, mat: c.M, topColor: shade(p.c, 0.84) });
      const cy = Math.min(0.24, p.h * 0.45);
      b.box(Math.min(p.w * 0.5, 1.2), 0.025, 0.16, { y: cy, z: p.d / 2 + 0.08, color: p.c2, mat: Mat.Metal, bottom: true, detail: true });
      b.box(Math.min(p.w * 0.3, 0.7), Math.min(0.19, cy - 0.02), 0.012, { z: p.d / 2 + 0.004, color: 0xffe0a8, mat: Mat.Light, detail: true });
    },
  },
  {
    t: 'block',
    label: 'Box block',
    family: 'structure',
    blurb: 'The classic slab — taper it, twist it, glaze it.',
    glyph: '<rect x="7" y="3" width="10" height="18" rx="1"/><path d="M9.5 6h1.5M13 6h1.5M9.5 9h1.5M13 9h1.5M9.5 12h1.5M13 12h1.5M9.5 15h1.5M13 15h1.5"/>',
    params: [pW(), pD(), pH(), pTaper(), pTwist()],
    habitable: 1,
    height: (p) => p.h,
    topScale: (p) => 1 - p.taper,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.86 : c.fpR * 1.2;
      return { w, d: c.host ? c.host.topD * 0.86 : w, h: 2.4, c: 0xd8dce4, c2: 0x3b404b, m: 'windows', seg: 4 };
    },
    build(b, p, c) {
      solid(b, 4, p.w, p.d, p.h, { taper: p.taper, twist: p.twist * DEG, color: p.c, mat: c.M, topColor: shade(p.c, 0.8) });
    },
  },
  {
    t: 'rounded',
    label: 'Rounded block',
    family: 'structure',
    blurb: 'Soft corners for a friendlier skyline.',
    glyph: '<rect x="6" y="3" width="12" height="18" rx="4.5"/><path d="M9 7v12M12 7v12M15 7v12" opacity=".5"/>',
    params: [pW(), pD(), pH(), { key: 's', label: 'Roundness', min: 0.05, max: 1, step: 0.01, unit: 'pct' }, pTaper(), pTwist()],
    habitable: 1,
    height: (p) => p.h,
    topScale: (p) => 1 - p.taper,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.86 : c.fpR * 1.25;
      return { w, d: c.host ? c.host.topD * 0.86 : w * 0.8, h: 2.2, s: 0.55, c: 0x9fb8d8, c2: 0x3b404b, m: 'glass' };
    },
    build(b, p, c) {
      loft(b, roundedRectOutline(p.w, p.d, p.s, b.lod === 1 ? 2 : 4), { h: p.h, smooth: true, taper: p.taper, twist: p.twist * DEG, color: p.c, mat: c.M, topColor: shade(p.c, 0.8) });
    },
  },
  {
    t: 'cylinder',
    label: 'Cylinder tower',
    family: 'structure',
    blurb: 'A clean drum — elliptical if you like.',
    glyph: '<ellipse cx="12" cy="5" rx="6" ry="2"/><path d="M6 5v14c0 1.1 2.7 2 6 2s6-.9 6-2V5"/>',
    params: [pW('Diameter'), pD('Depth'), pH(), pTaper(), SMOOTH(8, 48)],
    habitable: 0.8,
    height: (p) => p.h,
    topScale: (p) => 1 - p.taper,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.8 : c.fpR * 1.1;
      return { w, d: w, h: 2, seg: 24, c: 0x8fb4d9, c2: 0x3b404b, m: 'glass' };
    },
    build(b, p, c) {
      solid(b, Math.max(9, p.seg), p.w, p.d, p.h, { taper: p.taper, color: p.c, mat: c.M, topColor: shade(p.c, 0.8) });
    },
  },
  {
    t: 'tapered',
    label: 'Tapered tower',
    family: 'structure',
    blurb: 'Narrows as it climbs — sleek and aerodynamic.',
    glyph: '<path d="M8 21 9.5 3h5L16 21z"/><path d="M9 9h6M8.6 15h6.8" opacity=".55"/>',
    params: [pW(), pD(), pH(), pTaper(), pTwist(), SIDES(SHAPES_ALL)],
    habitable: 0.8,
    height: (p) => p.h,
    topScale: (p) => 1 - p.taper,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.9 : c.fpR * 1.3;
      return { w, d: c.host ? c.host.topD * 0.9 : w, h: 3, taper: 0.45, seg: 6, c: 0x6fa8dc, c2: 0x1f3f7a, m: 'glass' };
    },
    build(b, p, c) {
      solid(b, p.seg, p.w, p.d, p.h, { taper: p.taper, twist: p.twist * DEG, color: p.c, mat: c.M, topColor: shade(p.c, 0.8) });
    },
  },
  {
    t: 'twisted',
    label: 'Twisted tower',
    family: 'structure',
    blurb: 'Stacked slabs turning around a glass core.',
    glyph: '<path d="M7 20h10l-1-3H8zM8.5 16l8-2.5-1.2-2.5-8 2.5zM7.5 10l8.5 1-.3-3-8.5-1z"/><path d="M8 5.5 16 4"/>',
    params: [pW(), pD(), pH(), pN('Slabs', 3, 40), pTwist(360), pTaper('Taper', 0.8), SIDES([3, 4, 5, 6, 8])],
    accent: 'Core',
    habitable: 0.85,
    height: (p) => p.h,
    topScale: (p) => 1 - p.taper,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.85 : c.fpR * 1.2;
      return { w, d: c.host ? c.host.topD * 0.85 : w, h: 4, n: 16, twist: 90, seg: 4, c: 0xa9c6e8, c2: 0x1f3f7a, m: 'glass' };
    },
    build(b, p, c) {
      const n = Math.max(1, p.n);
      const slab = p.h / n;
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0;
        const s = 1 - p.taper * t;
        b.group({ y: i * slab, ry: p.twist * DEG * t }, () => solid(b, p.seg, p.w * s, p.d * s, slab * 0.84, { color: p.c, mat: c.M, topColor: shade(p.c, 0.85) }));
      }
      const core = Math.min(p.w, p.d) * 0.42;
      solid(b, 16, core, core, p.h, { taper: p.taper * 0.5, color: p.c2, mat: Mat.Glass });
    },
  },
  {
    t: 'setback',
    label: 'Stepped setback',
    family: 'structure',
    blurb: 'Art-deco tiers that step back as they rise.',
    glyph: '<path d="M5 21V13h3V8h2.5V4h3v4H16v5h3v8z"/>',
    params: [pW(), pD(), pH(), pN('Tiers', 2, 10), pTaper('Setback', 0.85), SIDES(SHAPES_ALL)],
    accent: 'Cornices',
    habitable: 0.85,
    height: (p) => p.h,
    topScale: (p) => 1 - p.taper,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.9 : c.fpR * 1.4;
      return { w, d: c.host ? c.host.topD * 0.9 : w, h: 3.6, n: 4, taper: 0.45, seg: 4, c: 0xd9c29a, c2: 0xf4f1ea, m: 'windows' };
    },
    build(b, p, c) {
      const n = Math.max(1, p.n);
      const th = p.h / n;
      for (let i = 0; i < n; i++) {
        const s = 1 - p.taper * (n > 1 ? i / (n - 1) : 0);
        solid(b, p.seg, p.w * s, p.d * s, th, { y: i * th, color: p.c, mat: c.M, topColor: shade(p.c, 0.82) });
        solid(b, p.seg, p.w * s + 0.05, p.d * s + 0.05, 0.035, { y: i * th + th - 0.02, color: p.c2, mat: Mat.Plain, detail: true });
      }
    },
  },
  {
    t: 'torus',
    label: 'Torus ring',
    family: 'structure',
    blurb: 'A habitable donut with spokes to its hub.',
    glyph: '<ellipse cx="12" cy="12" rx="9" ry="4.5"/><ellipse cx="12" cy="11.5" rx="4" ry="1.6"/>',
    params: [pW('Diameter'), pH('Thickness', 4, 0.05), SMOOTH(12, 48)],
    accent: 'Hub & spokes',
    habitable: 0.75,
    height: (p) => p.h,
    topScale: () => 0.3,
    create: (c) => ({ w: c.fpR * 1.8, h: 0.4, seg: 32, c: 0xe8e4dc, c2: 0x8a909c, m: 'windows' }),
    build(b, p, c) {
      const r = Math.max(0.01, Math.min(p.h / 2, (p.w / 2) * 0.45));
      const R = Math.max(r * 1.05, p.w / 2 - r);
      b.torus(R, r, { y: r, seg: p.seg, tube: Math.max(6, Math.round(p.seg / 3)), color: p.c, mat: c.M });
      if (R > 0.35) {
        const hubR = Math.min(R * 0.25, 0.4);
        solid(b, 12, hubR * 2, hubR * 2, r * 2, { color: p.c2, mat: Mat.Metal, detail: false });
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          beam(b, [Math.cos(a) * hubR, r, Math.sin(a) * hubR], [Math.cos(a) * (R - r * 0.8), r, Math.sin(a) * (R - r * 0.8)], Math.max(0.03, r * 0.35), { color: p.c2, mat: Mat.Metal, detail: true });
        }
      }
    },
  },
  {
    t: 'sphere',
    label: 'Sphere',
    family: 'structure',
    blurb: 'A perfect orb — or squash it into an ellipsoid.',
    glyph: '<circle cx="12" cy="11" r="7"/><path d="M5 11c2 2 12 2 14 0M12 4c-2.5 2-2.5 12 0 14" opacity=".55"/><path d="M8 21h8"/>',
    params: [pW('Diameter'), pH('Height', 12), SMOOTH(6, 40)],
    habitable: 0.6,
    height: (p) => p.h,
    topScale: () => 0.2,
    create: (c) => {
      const w = c.host ? Math.min(c.host.topW, c.fpR * 1.2) : c.fpR * 1.2;
      return { w, h: w, seg: 20, c: 0x9fd6ff, c2: 0x3b404b, m: 'glass' };
    },
    build(b, p, c) {
      const r = p.w / 2;
      b.sphere(r, { y: p.h / 2, sy: p.h / Math.max(0.01, p.w), wSeg: p.seg, hSeg: Math.max(4, Math.round(p.seg * 0.6)), color: p.c, mat: c.M });
    },
  },
  {
    t: 'pods',
    label: 'Pod cluster',
    family: 'structure',
    blurb: 'Capsule homes spiralling around a service core.',
    glyph: '<circle cx="8" cy="7" r="2.6"/><circle cx="16" cy="10" r="2.6"/><circle cx="9" cy="15" r="2.6"/><path d="M12 3v18" opacity=".6"/>',
    params: [pW('Spread'), pH(), { key: 'd', label: 'Pod size', min: 0.08, max: 1.6, step: 0.01, unit: 'm' }, pN('Pods', 2, 32)],
    accent: 'Core',
    habitable: 0.4,
    height: (p) => p.h,
    topScale: () => 0.3,
    create: (c) => ({ w: c.fpR * 1.4, h: 2, d: 0.3 * Math.max(1, c.fpR / 1.5), n: 9, c: 0xf4f1ea, c2: 0x8a909c, m: 'glass' }),
    build(b, p, c) {
      const podR = p.d / 2;
      const ring = Math.max(podR * 0.7, p.w / 2 - podR);
      const core = Math.max(0.06, ring * 0.45);
      solid(b, 12, core, core, p.h, { color: p.c2, mat: Mat.Metal });
      const n = Math.max(1, p.n);
      const span = Math.max(0, p.h - podR * 2);
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996 + c.index;
        const y = podR + (n > 1 ? i / (n - 1) : 0.5) * span;
        const x = Math.cos(a) * ring, z = Math.sin(a) * ring;
        b.sphere(podR, { x, y, z, wSeg: 8, hSeg: 6, color: i % 3 === 2 ? shade(p.c, 0.9) : p.c, mat: c.M });
        beam(b, [x * 0.2, y, z * 0.2], [x * 0.75, y, z * 0.75], Math.max(0.025, podR * 0.3), { color: p.c2, mat: Mat.Metal, detail: true });
      }
    },
  },
  {
    t: 'colonnade',
    label: 'Colonnade',
    family: 'structure',
    blurb: 'Columns and a cornice — instant civic gravitas.',
    glyph: '<path d="M3 7h18L12 3zM4 7h16M5.5 7v11M9.5 7v11M14.5 7v11M18.5 7v11M3 18h18v3H3z"/>',
    params: [pW(), pD(), pH('Height', 6, 0.2), pN('Columns', 4, 32), SIDES(SHAPES_ROUND)],
    accent: 'Inner hall',
    habitable: 0.45,
    height: (p) => p.h,
    create: (c) => {
      const w = c.host ? c.host.topW : c.fpR * 1.5;
      return { w, d: c.host ? c.host.topD : w, h: 0.7, n: 12, seg: 4, c: 0xf4f1ea, c2: 0xd9c29a, m: 'plain' };
    },
    build(b, p, c) {
      const base = 0.05, ent = Math.min(0.08, p.h * 0.15);
      solid(b, p.seg, p.w * 1.05, p.d * 1.05, base, { color: shade(p.c, 0.92), mat: Mat.Plain });
      const colH = Math.max(0.05, p.h - base - ent);
      const colR = Math.min(0.09, Math.max(0.018, Math.min(p.w, p.d) * 0.035));
      for (const q of perimeter(p.seg, p.w * 0.94, p.d * 0.94, Math.max(3, p.n))) b.cyl(colR, colR * 1.12, colH, { x: q.x, y: base, z: q.z, seg: 8, color: p.c, mat: Mat.Plain });
      solid(b, p.seg, p.w * 1.02, p.d * 1.02, ent, { y: p.h - ent, color: p.c, mat: Mat.Plain, topColor: shade(p.c, 0.85), capBottom: true });
      solid(b, p.seg, p.w * 0.62, p.d * 0.62, colH, { y: base, color: p.c2, mat: c.M });
    },
  },
  {
    t: 'vault',
    label: 'Barrel vault',
    family: 'structure',
    blurb: 'A half-cylinder tunnel: hangars, habs, greenhouses.',
    glyph: '<path d="M3 19v-4a9 9 0 0 1 18 0v4z"/><path d="M8 19v-3.5M12 19v-5M16 19v-3.5" opacity=".55"/>',
    params: [pW('Length'), pD('Diameter'), SMOOTH(6, 32)],
    habitable: 0.8,
    height: (p) => p.d / 2,
    topScale: () => 0.3,
    create: (c) => ({ w: c.fpR * 1.4, d: 0.5 * Math.max(1, c.fpR / 1.6), seg: 16, c: 0xe0e0e0, c2: 0x8a909c, m: 'smallWindows' }),
    build(b, p, c) {
      const r = p.d / 2;
      b.group({ x: p.w / 2, rz: Math.PI / 2 }, () => b.cyl(r, r, p.w, { seg: p.seg, arc: Math.PI, capTop: true, capBottom: true, color: p.c, mat: c.M }));
      // entrance on the +X end
      b.box(Math.min(0.02, p.w * 0.1), Math.min(r * 0.7, 0.2), Math.min(r * 0.8, 0.22), { x: p.w / 2 + 0.005, color: 0xffe0a8, mat: Mat.Light, detail: true });
    },
  },
  {
    t: 'arch',
    label: 'Arch',
    family: 'structure',
    blurb: 'A triumphant gateway. Walk-through not included.',
    glyph: '<path d="M4 21V11a8 8 0 0 1 16 0v10h-3V11a5 5 0 0 0-10 0v10z"/>',
    params: [pW('Span'), pH(), pD('Thickness'), SMOOTH(4, 20)],
    habitable: 0,
    height: (p) => p.h,
    create: (c) => ({ w: c.fpR * 1.3, h: 1.1, d: 0.16, seg: 10, c: 0xe8e4dc, c2: 0xffd36b, m: 'plain' }),
    build(b, p, c) {
      const pw = Math.max(0.05, p.w * 0.14);
      const R = Math.max(0.05, Math.min(p.w / 2 - pw / 2, p.h * 0.8));
      const hp = Math.max(0.02, p.h - R - pw / 2);
      b.box(pw, hp, p.d, { x: -R, color: p.c, mat: c.M });
      b.box(pw, hp, p.d, { x: R, color: p.c, mat: c.M });
      const k = Math.max(3, b.seg(p.seg));
      for (let j = 0; j < k; j++) {
        const a0 = (j / k) * Math.PI, a1 = ((j + 1) / k) * Math.PI;
        const x0 = Math.cos(a0) * R, y0 = hp + Math.sin(a0) * R, x1 = Math.cos(a1) * R, y1 = hp + Math.sin(a1) * R;
        const L = Math.hypot(x1 - x0, y1 - y0) * 1.06;
        b.group({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, rz: Math.atan2(y1 - y0, x1 - x0) }, () => b.box(L, pw, p.d, { y: -pw / 2, color: p.c, mat: c.M, bottom: true }));
      }
      b.box(pw * 0.8, pw * 0.5, p.d * 1.1, { y: hp + R + pw * 0.3, color: p.c2, mat: Mat.Metal, detail: true });
    },
  },
  {
    t: 'skybridge',
    label: 'Skybridge',
    family: 'structure',
    blurb: 'A glazed walkway hanging in mid-air.',
    glyph: '<path d="M3 21V5h4v16M17 21V5h4v16M7 10h10v4H7z"/>',
    params: [pW('Length'), pD('Width'), pH('Height', 3, 0.05)],
    accent: 'Frame',
    habitable: 0.6,
    height: () => 0,
    create: (c) => ({ w: c.fpR * 1.5, d: 0.22, h: 0.18, y: Math.max(0.6, c.top * 0.6), stack: false, c: 0xbfd6ef, c2: 0x8a909c, m: 'glass' }),
    build(b, p, c) {
      b.box(p.w, p.h, p.d, { color: p.c, mat: c.M, bottom: true });
      b.box(p.w + 0.01, 0.018, p.d + 0.02, { y: -0.004, color: p.c2, mat: Mat.Metal, detail: true, bottom: true });
      b.box(p.w + 0.01, 0.018, p.d + 0.02, { y: p.h - 0.012, color: p.c2, mat: Mat.Metal, detail: true });
    },
  },
  {
    t: 'obelisk',
    label: 'Obelisk',
    family: 'structure',
    blurb: 'A tapering monolith with a gilded pyramidion.',
    glyph: '<path d="M9.5 20 10.5 6 12 3l1.5 3 1 14zM7 21h10"/>',
    params: [pW(), pD(), pH()],
    accent: 'Pyramidion',
    habitable: 0,
    height: (p) => p.h,
    topScale: () => 0.05,
    create: (c) => ({ w: c.fpR * 0.35, d: c.fpR * 0.35, h: 2.4, c: 0xc9ccd3, c2: 0xffd36b, m: 'plain' }),
    build(b, p, c) {
      const sh = p.h * 0.9;
      solid(b, 4, p.w, p.d, sh, { taper: 0.28, color: p.c, mat: c.M });
      b.pyramid(p.w * 0.72, p.h * 0.1, p.d * 0.72, { y: sh, color: p.c2, mat: Mat.Metal });
    },
  },
  {
    t: 'wedge',
    label: 'Wedge',
    family: 'structure',
    blurb: 'A ramp or a slanted roof. Front edge touches down.',
    glyph: '<path d="M3 19h18L3 7z"/>',
    params: [pW(), pD(), pH('Height', 12)],
    habitable: 0.4,
    height: (p) => p.h,
    topScale: () => 0.2,
    create: (c) => {
      const w = c.host ? c.host.topW : c.fpR;
      return { w, d: c.host ? c.host.topD : w, h: 0.5, c: 0x8a909c, c2: 0x3b404b, m: 'plain' };
    },
    build(b, p, c) {
      b.wedge(p.w, p.h, p.d, { color: p.c, mat: c.M });
    },
  },

  // ═══════════════════════════════ ROOFS & TOPS
  {
    t: 'dome',
    label: 'Dome',
    family: 'tops',
    blurb: 'Glass, gold or concrete — every capital needs one.',
    glyph: '<path d="M3 18a9 9 0 0 1 18 0zM2.5 18h19M12 9V6.5"/>',
    params: [pW('Diameter'), pD('Depth'), pH('Height', 16), SMOOTH(6, 40)],
    accent: 'Rim & finial',
    habitable: 0.6,
    height: (p) => p.h,
    topScale: () => 0.1,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.95 : c.fpR * 1.6;
      return { w, d: c.host ? c.host.topD * 0.95 : w, h: w * 0.5, seg: 24, c: 0xbfe3ff, c2: 0xc9ccd3, m: 'glass' };
    },
    build(b, p, c) {
      const sz = p.d / Math.max(0.01, p.w);
      b.dome(p.w / 2, { h: p.h, wSeg: p.seg, hSeg: Math.max(3, Math.round(p.seg / 3)), sz, color: p.c, mat: c.M });
      b.torus(p.w / 2, 0.015 + p.w * 0.01, { y: 0.01, sz, seg: p.seg, tube: 4, color: p.c2, mat: Mat.Metal, detail: true });
      b.cone(0.02 + p.w * 0.02, p.h * 0.16, { y: p.h - 0.01, seg: 6, color: p.c2, mat: Mat.Metal, detail: true });
    },
  },
  {
    t: 'onion',
    label: 'Onion dome',
    family: 'tops',
    blurb: 'A bulbous, swirling crown with a golden spike.',
    glyph: '<path d="M12 3c0 3-6 6-6 10a6 6 0 0 0 12 0c0-4-6-7-6-10zM8 19h8"/>',
    params: [pW('Diameter'), pD('Depth'), pH('Height', 12), SMOOTH(6, 32)],
    accent: 'Finial',
    habitable: 0.2,
    height: (p) => p.h,
    topScale: () => 0.05,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.8 : c.fpR * 0.9;
      return { w, d: w, h: w * 1.25, seg: 16, c: 0x3fb59a, c2: 0xffd36b, m: 'plain' };
    },
    build(b, p, c) {
      const R = p.w / 2, H = p.h * 0.86;
      const prof: [number, number][] = [
        [0.5, 0],
        [0.66, 0.08],
        [0.9, 0.25],
        [0.98, 0.4],
        [0.88, 0.56],
        [0.62, 0.72],
        [0.3, 0.86],
        [0.1, 0.95],
        [0.0, 1],
      ];
      b.lathe(
        prof.map(([r, y]) => [r * R, y * H]),
        { seg: p.seg, sz: p.d / Math.max(0.01, p.w), color: p.c, mat: c.M },
      );
      b.cone(R * 0.08 + 0.01, p.h * 0.16, { y: H - 0.01, seg: 6, color: p.c2, mat: Mat.Metal });
      b.sphere(R * 0.06 + 0.012, { y: H + p.h * 0.05, wSeg: 6, hSeg: 4, color: p.c2, mat: Mat.Metal, detail: true });
    },
  },
  {
    t: 'spire',
    label: 'Spire',
    family: 'tops',
    blurb: 'Pierce the clouds. Red beacon for passing shuttles.',
    glyph: '<path d="M12 2 9 19h6zM7 19h10v2H7z"/>',
    params: [pW('Base'), pH(), SMOOTH(3, 24)],
    accent: 'Collar',
    habitable: 0,
    height: (p) => p.h + 0.05,
    topScale: () => 0.02,
    create: (c) => ({ w: c.host ? Math.max(0.05, c.host.topW * 0.3) : c.fpR * 0.25, h: 1.6, seg: 8, c: 0xc9ccd3, c2: 0x8a909c, m: 'metal' }),
    build(b, p, c) {
      b.cyl(p.w * 0.62, p.w * 0.62, 0.05, { seg: Math.max(6, p.seg), color: p.c2, mat: Mat.Metal });
      b.cone(p.w / 2, p.h, { y: 0.05, seg: p.seg, color: p.c, mat: c.M });
      b.sphere(0.02 + p.w * 0.04, { y: p.h + 0.05, wSeg: 6, hSeg: 4, color: 0xff3b30, mat: Mat.Light, detail: true });
    },
  },
  {
    t: 'pyramid',
    label: 'Pyramid',
    family: 'tops',
    blurb: 'Ancient geometry with a gilded capstone.',
    glyph: '<path d="M12 4 3 19h18z"/><path d="M12 4 15 19" opacity=".55"/>',
    params: [pW(), pD(), pH('Height', 20), SIDES([3, 4, 5, 6, 8])],
    accent: 'Capstone',
    habitable: 0.33,
    height: (p) => p.h,
    topScale: () => 0.05,
    create: (c) => {
      const w = c.host ? c.host.topW : c.fpR * 1.6;
      return { w, d: c.host ? c.host.topD : w, h: w * 0.65, seg: 4, c: 0xd9c29a, c2: 0xffd36b, m: 'plain' };
    },
    build(b, p, c) {
      solid(b, p.seg, p.w, p.d, p.h * 0.915, { taper: 0.915, color: p.c, mat: c.M, topColor: shade(p.c, 0.9) });
      solid(b, p.seg, p.w * 0.085, p.d * 0.085, p.h * 0.085, { y: p.h * 0.915, taper: 1, color: p.c2, mat: Mat.Metal });
    },
  },
  {
    t: 'gable',
    label: 'Gable roof',
    family: 'tops',
    blurb: 'A pitched roof — cosy, rain-proof, timeless.',
    glyph: '<path d="M3 12 12 5l9 7M5 11v9h14v-9"/>',
    params: [pW(), pD(), pH('Height', 6)],
    habitable: 0.2,
    height: (p) => p.h,
    topScale: () => 0.1,
    create: (c) => {
      const w = c.host ? c.host.topW : c.fpR * 1.2;
      return { w, d: c.host ? c.host.topD : w, h: 0.35, c: 0xc4573a, c2: 0x3b404b, m: 'plain' };
    },
    build(b, p, c) {
      b.gable(p.w, p.h, p.d, { color: p.c, mat: c.M });
    },
  },
  {
    t: 'pagoda',
    label: 'Pagoda roof',
    family: 'tops',
    blurb: 'Sweeping concave eaves, stack them for a temple.',
    glyph: '<path d="M2.5 15c3 0 6.5-2.5 9.5-8 3 5.5 6.5 8 9.5 8zM12 7V3M6 15v5h12v-5"/>',
    params: [pW('Eaves'), pD('Depth'), pH('Height', 6), SIDES([4, 6, 8])],
    accent: 'Finial',
    habitable: 0.1,
    height: (p) => p.h * 0.85,
    topScale: () => 0.12,
    create: (c) => {
      const w = c.host ? c.host.topW * 1.35 : c.fpR * 1.5;
      return { w, d: c.host ? c.host.topD * 1.35 : w, h: 0.45, seg: 4, c: 0x2e8b6f, c2: 0xffd36b, m: 'plain' };
    },
    build(b, p, c) {
      const H = p.h * 0.85;
      const prof = (t: number) => 0.1 + 0.9 * Math.pow(1 - t, 2.4);
      solid(b, p.seg, p.w, p.d, H, { profile: prof, rings: b.lod === 1 ? 3 : 5, color: p.c, mat: c.M, capBottom: true, topColor: shade(p.c, 0.9) });
      const { outline } = shapeOutline(b, p.seg, p.w * 1.01, p.d * 1.01);
      loft(b, outline, { h: 0.025, color: p.c2, mat: Mat.Metal, capTop: false, detail: true });
      b.cone(p.w * 0.04 + 0.01, p.h * 0.35, { y: H * 0.94, seg: 6, color: p.c2, mat: Mat.Metal });
    },
  },
  {
    t: 'cone',
    label: 'Cone',
    family: 'tops',
    blurb: 'A witch-hat turret. Simple, pointy, perfect.',
    glyph: '<path d="M12 3 5 19c0 1.2 3 2 7 2s7-.8 7-2z"/>',
    params: [pW('Diameter'), pD('Depth'), pH('Height', 20), SMOOTH(3, 40)],
    habitable: 0.2,
    height: (p) => p.h,
    topScale: () => 0.02,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.92 : c.fpR;
      return { w, d: w, h: w * 1.2, seg: 16, c: 0x8e2f2a, c2: 0x3b404b, m: 'plain' };
    },
    build(b, p, c) {
      b.cone(p.w / 2, p.h, { seg: p.seg, sz: p.d / Math.max(0.01, p.w), color: p.c, mat: c.M, capBottom: true });
    },
  },
  {
    t: 'crown',
    label: 'Crown',
    family: 'tops',
    blurb: 'A ring of spikes for the building that has everything.',
    glyph: '<path d="M4 18 3 7l5 5 4-8 4 8 5-5-1 11z"/><path d="M4 21h16"/>',
    params: [pW('Diameter'), pH('Spike height', 8), pN('Spikes', 3, 32)],
    accent: 'Band',
    habitable: 0,
    height: (p) => p.h,
    topScale: () => 0.6,
    create: (c) => ({ w: c.host ? c.host.topW * 0.95 : c.fpR, h: 0.35, n: 8, c: 0xffd36b, c2: 0xc9ccd3, m: 'metal' }),
    build(b, p, c) {
      const R = p.w / 2;
      const band = Math.min(0.12, p.h * 0.25);
      b.cyl(R, R, band, { seg: 24, capTop: false, color: p.c2, mat: Mat.Metal });
      const n = Math.max(3, p.n);
      const sr = Math.min(0.1, (R * Math.PI) / n * 0.42) + 0.008;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.sin(a) * R * 0.92, z = Math.cos(a) * R * 0.92;
        b.cone(sr, p.h * (i % 2 ? 0.72 : 1), { x, z, seg: 6, color: p.c, mat: c.M });
        b.sphere(sr * 0.55, { x, y: p.h * (i % 2 ? 0.72 : 1), z, wSeg: 5, hSeg: 3, color: p.c2, mat: Mat.Light, detail: true });
      }
    },
  },
  {
    t: 'shell',
    label: 'Sail shells',
    family: 'tops',
    blurb: 'Opera-house sails, nested and leaning into the wind.',
    glyph: '<path d="M3 19c1-8 6-14 12-14-2 4-2 10 0 14zM13 19c1-5 4-9 8-9-1 3-1 6 0 9z"/>',
    params: [pW('Span'), pH('Height', 10), pD('Spacing'), pN('Shells', 1, 6), pTilt('Lean', 0, 45)],
    habitable: 0.3,
    height: (p) => p.h,
    topScale: () => 0.2,
    create: (c) => ({ w: c.fpR * 1.3, h: c.fpR * 0.9, d: c.fpR * 0.55, n: 3, tilt: 12, c: 0xf4f1ea, c2: 0xc9ccd3, m: 'plain' }),
    build(b, p, c) {
      const prof: [number, number][] = [];
      const steps = b.lod === 1 ? 4 : 7;
      for (let k = 0; k <= steps; k++) {
        const th = (k / steps) * (Math.PI / 2);
        prof.push([Math.cos(th), Math.sin(th)]);
      }
      const n = Math.max(1, p.n);
      for (let i = 0; i < n; i++) {
        const s = 1 - i * (0.5 / n);
        const z = (i - (n - 1) / 2) * -p.d;
        b.group({ z, ry: Math.PI / 2, rx: -p.tilt * DEG }, () => {
          b.lathe(
            prof.map(([r, y]) => [r * (p.w / 2) * s, y * p.h * s]),
            { seg: 10, arc: Math.PI, color: p.c, mat: c.M },
          );
          b.lathe(
            prof
              .slice()
              .reverse()
              .map(([r, y]) => [r * (p.w / 2) * s * 0.965, y * p.h * s * 0.965]),
            { seg: 10, arc: Math.PI, color: shade(p.c, 0.78), mat: Mat.Plain },
          );
        });
      }
    },
  },

  // ═══════════════════════════════ DETAILS
  {
    t: 'antenna',
    label: 'Antenna mast',
    family: 'details',
    blurb: 'Crossbars, a blinking beacon, perfect reception.',
    glyph: '<path d="M12 4v17M8 21h8M9 9h6M10 14h4"/><circle cx="12" cy="3" r="1.4"/>',
    params: [pH('Height', 12), { key: 'w', label: 'Thickness', min: 0.01, max: 0.15, step: 0.005, unit: 'm' }, pN('Crossbars', 1, 8)],
    accent: 'Beacon',
    habitable: 0,
    height: (p) => p.h,
    topScale: () => 0.02,
    create: () => ({ w: 0.03, h: 1.2, n: 3, c: 0xc9ccd3, c2: 0xff3b30, m: 'metal' }),
    build(b, p, c) {
      const t = Math.max(0.012, p.w);
      b.box(t * 3.2, 0.04, t * 3.2, { color: shade(p.c, 0.6), mat: Mat.Metal });
      b.cyl(t * 0.5, t * 0.75, p.h, { seg: 6, color: p.c, mat: c.M });
      const n = Math.max(1, p.n);
      for (let j = 0; j < n; j++) {
        const y = p.h * (0.3 + (0.55 * j) / Math.max(1, n));
        b.box(t * 7 * (1 - j / (n + 1)), t * 0.6, t * 0.6, { y, color: p.c, mat: c.M, detail: true });
      }
      b.sphere(t * 1.1 + 0.012, { y: p.h, wSeg: 6, hSeg: 4, color: p.c2, mat: Mat.Light });
    },
  },
  {
    t: 'halo',
    label: 'Halo ring',
    family: 'details',
    blurb: 'A floating ring of light. Angels sold separately.',
    glyph: '<ellipse cx="12" cy="9" rx="9" ry="3"/><path d="M8 21V12h8v9" opacity=".55"/>',
    params: [pW('Diameter'), { key: 'd', label: 'Thickness', min: 0.01, max: 0.6, step: 0.005, unit: 'm' }, pTilt('Tilt', -60, 60), SMOOTH(12, 48)],
    habitable: 0,
    height: () => 0,
    create: (c) => ({
      w: c.host ? Math.max(c.host.w, c.host.topW) * 1.5 : c.fpR * 1.6,
      d: 0.05,
      y: c.host ? c.host.base + (c.host.top - c.host.base) * 0.82 : Math.max(0.5, c.top * 0.85),
      seg: 36,
      stack: false,
      c: 0x5ef0ff,
      c2: 0xffffff,
      m: 'glow',
    }),
    build(b, p, c) {
      const r = Math.max(0.006, p.d / 2);
      const R = Math.max(r * 2, p.w / 2);
      b.torus(R, r, { rx: p.tilt * DEG, seg: p.seg, tube: 6, color: p.c, mat: c.M });
    },
  },
  {
    t: 'neon',
    label: 'Neon band',
    family: 'details',
    blurb: 'Wrap a facade in light. Several bands if you dare.',
    glyph: '<rect x="7" y="3" width="10" height="18" rx="1" opacity=".5"/><path d="M5 9h14M5 14h14" stroke-width="2.4"/>',
    params: [pW(), pD(), { key: 'h', label: 'Thickness', min: 0.01, max: 0.3, step: 0.005, unit: 'm' }, pN('Bands', 1, 16), { key: 's', label: 'Spacing', min: 0.05, max: 3, step: 0.01, unit: 'm', curve: true }, SIDES(SHAPES_ALL)],
    habitable: 0,
    height: () => 0,
    create: (c) => {
      const h = c.host;
      if (!h) return { w: c.fpR, d: c.fpR, y: Math.max(0.3, c.top * 0.9), h: 0.03, n: 1, s: 0.4, seg: 4, stack: false, c: 0xff6fb5, c2: 0xffffff, m: 'glow' };
      const t = 0.92;
      const sc = 1 - h.taper * t;
      return { w: h.w * sc + 0.03, d: h.d * sc + 0.03, x: h.x, z: h.z, seg: h.seg, y: h.base + (h.top - h.base) * t, h: 0.03, n: 1, s: 0.4, stack: false, c: 0xff6fb5, c2: 0xffffff, m: 'glow' };
    },
    build(b, p, c) {
      const { outline, smooth } = shapeOutline(b, p.seg, p.w, p.d);
      for (let k = 0; k < Math.max(1, p.n); k++) loft(b, outline, { y: k * p.s, h: p.h, smooth, color: p.c, mat: c.M, capTop: false });
    },
  },
  {
    t: 'balcony',
    label: 'Balconies',
    family: 'details',
    blurb: 'Wrap-around terraces with railings, every floor.',
    glyph: '<rect x="8" y="3" width="8" height="18" rx="1" opacity=".5"/><path d="M5 7h14M5 11h14M5 15h14M5 19h14"/>',
    params: [pW(), pD(), pN('Floors', 1, 40), { key: 's', label: 'Spacing', min: 0.1, max: 2, step: 0.01, unit: 'm' }, SIDES(SHAPES_ALL)],
    accent: 'Railings',
    habitable: 0,
    height: () => 0,
    create: (c) => {
      const h = c.host;
      if (!h) return { w: c.fpR * 1.2, d: c.fpR * 1.2, n: 4, s: 0.4, y: 0.4, seg: 4, stack: false, c: 0xf4f1ea, c2: 0xc9ccd3, m: 'plain' };
      return {
        w: h.w + 0.14,
        d: h.d + 0.14,
        x: h.x,
        z: h.z,
        seg: h.seg,
        y: h.base + 0.4,
        n: Math.max(1, Math.min(40, Math.floor((h.top - h.base - 0.5) / 0.4))),
        s: 0.4,
        stack: false,
        c: 0xf4f1ea,
        c2: 0xc9ccd3,
        m: 'plain',
      };
    },
    build(b, p, c) {
      const { outline, smooth } = shapeOutline(b, p.seg, p.w, p.d);
      for (let k = 0; k < Math.max(1, p.n); k++) {
        const y = k * p.s;
        loft(b, outline, { y, h: 0.025, smooth, color: p.c, mat: c.M, capBottom: true });
        loft(b, outline, { y: y + 0.025, h: 0.05, smooth, color: p.c2, mat: Mat.Metal, capTop: false, detail: true });
      }
    },
  },
  {
    t: 'fins',
    label: 'Facade fins',
    family: 'details',
    blurb: 'Vertical blades for shade and drama.',
    glyph: '<rect x="8" y="3" width="8" height="18" rx="1" opacity=".5"/><path d="M5 4v16M19 4v16M8 3v18M12 3v18M16 3v18"/>',
    params: [pW(), pD(), pH(), pN('Fins', 3, 48), { key: 's', label: 'Fin depth', min: 0.02, max: 0.6, step: 0.005, unit: 'm' }, SIDES(SHAPES_ALL)],
    habitable: 0,
    height: () => 0,
    create: (c) => {
      const h = c.host;
      if (!h) return { w: c.fpR * 1.2, d: c.fpR * 1.2, h: 2, n: 16, s: 0.1, seg: 4, stack: false, c: 0xf4f1ea, c2: 0xc9ccd3, m: 'plain' };
      return { w: h.w + 0.02, d: h.d + 0.02, h: h.top - h.base, x: h.x, z: h.z, y: h.base, n: 16, s: 0.1, seg: h.seg, stack: false, c: 0xf4f1ea, c2: 0xc9ccd3, m: 'plain' };
    },
    build(b, p, c) {
      for (const q of perimeter(p.seg, p.w, p.d, Math.max(3, p.n))) {
        b.group({ x: q.x, z: q.z, ry: Math.atan2(q.nx, q.nz) }, () => b.box(0.025, p.h, p.s, { z: p.s / 2 - 0.01, color: p.c, mat: c.M }));
      }
    },
  },
  {
    t: 'billboard',
    label: 'Billboard',
    family: 'details',
    blurb: 'Animated ads. The future is loud and bright.',
    glyph: '<rect x="3" y="4" width="18" height="11" rx="1.5"/><path d="M7 15v6M17 15v6M7 8l3 3 3-2 4 3"/>',
    params: [pW(), pH('Height', 6, 0.05)],
    accent: 'Frame',
    habitable: 0,
    height: () => 0,
    create: (c) => {
      const h = c.host;
      const w = h ? Math.min(h.w * 0.7, 1.4) : c.fpR * 0.8;
      return { w, h: w * 0.56, y: h ? h.base + (h.top - h.base) * 0.55 : 0.5, z: h ? h.z + h.d / 2 + 0.04 : 0, x: h ? h.x : 0, stack: false, c: 0xffffff, c2: 0x3b404b, m: 'screen' };
    },
    build(b, p, c) {
      b.box(p.w + 0.05, p.h + 0.05, 0.035, { y: -0.025, z: -0.02, color: p.c2, mat: Mat.Metal, bottom: true });
      b.panel(p.w, p.h, { z: 0.001, color: p.c, mat: c.M });
      if (c.base > 0.05 && c.base < 1.2) {
        for (const sx of [-1, 1]) b.box(0.03, c.base, 0.03, { x: sx * p.w * 0.35, y: -c.base, z: -0.03, color: p.c2, mat: Mat.Metal });
      }
    },
  },
  {
    t: 'hologram',
    label: 'Hologram',
    family: 'details',
    blurb: 'A hovering light-sculpture beamed from a projector.',
    glyph: '<path d="M8 20h8M10 20l-3-7h10l-3 7"/><path d="M12 3 16 7l-4 4-4-4z"/>',
    params: [pW('Size'), pH('Hover', 6, 0.05), { key: 'seg', label: 'Facets', min: 4, max: 12, step: 1, unit: 'int' }],
    accent: 'Projector',
    habitable: 0,
    height: (p) => p.h + p.w + 0.06,
    topScale: () => 0.2,
    create: (c) => ({ w: Math.min(0.9, 0.36 * Math.max(1, c.fpR)), h: 0.3, seg: 6, c: 0x5ef0ff, c2: 0x8a909c, m: 'holo' }),
    build(b, p, c) {
      const R = p.w / 2;
      b.cyl(R * 0.45, R * 0.55, 0.05, { seg: 12, color: p.c2, mat: Mat.Metal });
      b.cyl(R * 0.42, R * 0.42, 0.01, { y: 0.05, seg: 12, color: p.c, mat: Mat.Glow, detail: true });
      b.cyl(R * 0.75, R * 0.06, p.h, { y: 0.06, seg: 10, capTop: false, color: p.c, mat: c.M, detail: true });
      const cy = 0.06 + p.h + R;
      b.sphere(R, { y: cy, wSeg: p.seg, hSeg: Math.max(3, Math.round(p.seg / 2)), flat: true, color: p.c, mat: c.M });
      b.torus(R * 1.35, 0.012, { y: cy, rx: 0.5, seg: 20, tube: 4, color: p.c, mat: c.M, detail: true });
    },
  },
  {
    t: 'flag',
    label: 'Flag',
    family: 'details',
    blurb: 'Plant your colours. Wind provided by the planet.',
    glyph: '<path d="M6 21V3M6 4h11l-2.5 3.5L17 11H6"/>',
    params: [pH('Pole height', 8), { key: 'w', label: 'Flag size', min: 0.05, max: 2, step: 0.01, unit: 'm' }],
    accent: 'Pole',
    habitable: 0,
    height: (p) => p.h,
    topScale: () => 0.02,
    create: () => ({ h: 0.8, w: 0.3, c: 0x5ef0ff, c2: 0xc9ccd3, m: 'plain' }),
    build(b, p, c) {
      b.cyl(0.012, 0.016, p.h, { seg: 6, color: p.c2, mat: Mat.Metal });
      b.sphere(0.022, { y: p.h, wSeg: 6, hSeg: 4, color: 0xffd36b, mat: Mat.Metal, detail: true });
      const fw = p.w, fh = p.w * 0.62;
      const parts = b.lod === 1 ? 1 : 3;
      for (let k = 0; k < parts; k++) {
        const x0 = 0.014 + (k * fw) / parts;
        b.panel(fw / parts, fh, { x: x0 + fw / parts / 2, y: p.h - fh - 0.03, z: k === 1 ? 0.025 : 0, ry: k === 1 ? 0.12 : -0.08, both: true, color: p.c, mat: c.M });
      }
    },
  },

  // ═══════════════════════════════ ENERGY & TECH
  {
    t: 'solar',
    label: 'Solar array',
    family: 'energy',
    blurb: 'Rows of tilted panels. Boosts a Power design.',
    glyph: '<path d="M3 16 7 7h14l-4 9zM5 11.5h14M10 7l-2.5 9M15 7l-2.5 9M6 19h12"/>',
    params: [pW(), pD(), pN('Rows', 1, 16), pTilt('Panel tilt', 0, 60)],
    accent: 'Frames',
    habitable: 0,
    height: () => 0.12,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.9 : c.fpR * 1.4;
      return { w, d: c.host ? c.host.topD * 0.9 : w, n: 4, tilt: 25, c: 0x1a2a4a, c2: 0xc9ccd3, m: 'solar' };
    },
    build(b, p, c) {
      const n = Math.max(1, p.n);
      const rowD = p.d / n;
      for (let r = 0; r < n; r++) {
        const z = -p.d / 2 + rowD * (r + 0.5);
        b.box(p.w, 0.014, rowD * 0.8, { y: 0.06, z, rx: -p.tilt * DEG, color: p.c, mat: c.M, bottom: true });
        for (const sx of [-1, 1]) b.box(0.02, 0.06, 0.02, { x: (sx * p.w) / 2 * 0.9, z, color: p.c2, mat: Mat.Metal, detail: true });
      }
    },
  },
  {
    t: 'turbine',
    label: 'Wind turbine',
    family: 'energy',
    blurb: 'Three blades, endless breeze. Boosts Power.',
    glyph: '<path d="M12 10v11M9 21h6M12 10 12 2M12 10l7 4M12 10l-7 4"/><circle cx="12" cy="10" r="1.3"/>',
    params: [pH('Mast height', 12), { key: 'w', label: 'Rotor', min: 0.2, max: 6, step: 0.01, unit: 'm', curve: true }],
    accent: 'Hub',
    habitable: 0,
    height: (p) => p.h,
    topScale: () => 0.05,
    create: (c) => ({ h: 1.6, w: Math.min(2.4, 1.1 * Math.max(1, c.fpR / 1.5)), c: 0xf4f1ea, c2: 0xc9ccd3, m: 'plain' }),
    build(b, p, c) {
      const s = Math.max(0.4, p.w);
      b.cyl(s * 0.018 + 0.008, s * 0.032 + 0.014, p.h, { seg: 10, color: p.c, mat: c.M });
      const nd = 0.12 + s * 0.05, nh = 0.05 + s * 0.025;
      b.box(nh, nh, nd, { y: p.h - nh / 2, color: p.c, mat: c.M });
      const zf = nd / 2 + 0.015;
      b.sphere(nh * 0.6, { y: p.h, z: zf, wSeg: 8, hSeg: 6, color: p.c2, mat: c.M });
      for (let k = 0; k < 3; k++) {
        b.group({ y: p.h, z: zf + 0.01, rz: (k / 3) * Math.PI * 2 + 0.35 + c.index }, () => b.box(0.018 + s * 0.022, p.w / 2, 0.012, { color: p.c, mat: c.M }));
      }
    },
  },
  {
    t: 'dish',
    label: 'Satellite dish',
    family: 'energy',
    blurb: 'Listens to the stars. Boosts Research.',
    glyph: '<path d="M4 9a9 9 0 0 0 12 8L4 9z"/><path d="M10 13l5-5M15 8l1.5-1.5M9 16l-1 5M6 21h6"/>',
    params: [pW('Diameter'), pH('Mount', 6, 0.02), pTilt('Aim', 0, 85)],
    accent: 'Mount',
    habitable: 0,
    height: (p) => p.h + p.w * 0.45,
    topScale: () => 0.1,
    create: (c) => ({ w: Math.min(1.6, c.fpR * 0.6), h: 0.25, tilt: 35, c: 0xf4f1ea, c2: 0x8a909c, m: 'plain' }),
    build(b, p, c) {
      const R = p.w / 2, depth = R * 0.35;
      b.cyl(0.03 + R * 0.08, 0.05 + R * 0.1, p.h, { seg: 10, color: p.c2, mat: Mat.Metal });
      const steps = b.lod === 1 ? 3 : 6;
      const prof: [number, number][] = [];
      for (let k = 0; k <= steps; k++) {
        const r = (k / steps) * R;
        prof.push([r, (r / R) * (r / R) * depth]);
      }
      b.group({ y: p.h + 0.02, rx: -p.tilt * DEG }, () => {
        b.lathe(prof, { seg: 16, color: shade(p.c, 0.75), mat: c.M });
        b.lathe(
          prof
            .slice()
            .reverse()
            .map(([r, y]) => [r, y + 0.008]),
          { seg: 16, color: p.c, mat: c.M },
        );
        b.cyl(0.008, 0.012, depth * 2.2, { seg: 5, color: p.c2, mat: Mat.Metal, detail: true });
        b.sphere(0.02 + R * 0.04, { y: depth * 2.2, wSeg: 6, hSeg: 4, color: p.c2, mat: Mat.Metal, detail: true });
      });
    },
  },
  {
    t: 'helipad',
    label: 'Helipad',
    family: 'energy',
    blurb: 'For air-taxis, drones and the occasional dragon.',
    glyph: '<circle cx="12" cy="12" r="8.5"/><path d="M9 8v8M15 8v8M9 12h6"/>',
    params: [pW('Diameter'), pN('Lights', 4, 24)],
    accent: 'Markings',
    habitable: 0,
    height: () => 0.07,
    create: (c) => ({ w: c.host ? Math.max(0.4, Math.min(c.host.topW, c.host.topD) * 0.95) : c.fpR * 1.2, n: 8, c: 0x3b404b, c2: 0xf4f1ea, m: 'plain' }),
    build(b, p, c) {
      const R = p.w / 2;
      b.prism(8, R, 0.06, { color: p.c, mat: c.M, capBottom: true });
      const s = R * 0.5;
      b.box(s * 0.18, 0.004, s, { x: -s * 0.32, y: 0.06, color: p.c2, mat: Mat.Plain });
      b.box(s * 0.18, 0.004, s, { x: s * 0.32, y: 0.06, color: p.c2, mat: Mat.Plain });
      b.box(s * 0.64, 0.004, s * 0.16, { y: 0.06, color: p.c2, mat: Mat.Plain });
      b.torus(R * 0.78, 0.012, { y: 0.062, seg: 24, tube: 3, sy: 0.25, color: 0xffd36b, mat: Mat.Plain, detail: true });
      const n = Math.max(4, p.n);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        b.box(0.03, 0.02, 0.03, { x: Math.sin(a) * R * 0.92, y: 0.06, z: Math.cos(a) * R * 0.92, color: 0x7cffb0, mat: Mat.Light, detail: true });
      }
    },
  },
  {
    t: 'lattice',
    label: 'Lattice tower',
    family: 'energy',
    blurb: 'Iron lacework, Paris-style. Antenna on top.',
    glyph: '<path d="M5 21 10.5 3h3L19 21M7.5 13h9M9 8h6M6.2 17h11.6M7.5 13l7.4 4M9 8l5.5 5"/>',
    params: [pW('Base'), pH(), pTaper('Taper', 0.95), pN('Levels', 2, 14)],
    accent: 'Beacon',
    habitable: 0,
    height: (p) => p.h * 1.1,
    topScale: () => 0.05,
    create: (c) => ({ w: c.fpR * 1.2, h: 4, taper: 0.88, n: 6, c: 0xb98552, c2: 0xff3b30, m: 'metal' }),
    build(b, p, c) {
      const n = Math.max(2, p.n);
      const top = p.w * Math.max(0.04, 1 - p.taper);
      const half = (t: number) => (p.w + (top - p.w) * Math.pow(t, 0.6)) / 2;
      const T = Math.max(0.016, p.w * 0.022);
      const corners: [number, number][] = [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ];
      for (let j = 0; j < n; j++) {
        const t0 = j / n, t1 = (j + 1) / n;
        const h0 = half(t0), h1 = half(t1);
        for (let k = 0; k < 4; k++) {
          const [sx, sz] = corners[k];
          const [nx, nz] = corners[(k + 1) % 4];
          beam(b, [sx * h0, t0 * p.h, sz * h0], [sx * h1, t1 * p.h, sz * h1], T, { color: p.c, mat: c.M });
          beam(b, [sx * h1, t1 * p.h, sz * h1], [nx * h1, t1 * p.h, nz * h1], T * 0.7, { color: p.c, mat: c.M });
          if (j % 2 === k % 2) beam(b, [sx * h0, t0 * p.h, sz * h0], [nx * h1, t1 * p.h, nz * h1], T * 0.5, { color: p.c, mat: c.M, detail: true });
          else beam(b, [nx * h0, t0 * p.h, nz * h0], [sx * h1, t1 * p.h, sz * h1], T * 0.5, { color: p.c, mat: c.M, detail: true });
        }
      }
      b.cyl(T * 0.5, T * 1.2, p.h * 0.1, { y: p.h, seg: 6, color: p.c, mat: c.M });
      b.sphere(T * 1.4 + 0.01, { y: p.h * 1.1, wSeg: 6, hSeg: 4, color: p.c2, mat: Mat.Light });
    },
  },

  // ═══════════════════════════════ NATURE & WATER
  {
    t: 'garden',
    label: 'Roof garden',
    family: 'nature',
    blurb: 'Planters bursting with shrubs. Bees approve.',
    glyph: '<path d="M3 17h18v4H3z"/><circle cx="7" cy="13.5" r="3"/><circle cx="13" cy="12" r="4"/><circle cx="18" cy="14" r="2.5"/>',
    params: [pW(), pD(), pN('Plants', 1, 30), { key: 'h', label: 'Plant size', min: 0.1, max: 2, step: 0.01, unit: 'm' }],
    accent: 'Planter',
    habitable: 0,
    height: () => 0.05,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.95 : c.fpR * 1.6;
      return { w, d: c.host ? c.host.topD * 0.95 : w, n: 10, h: 0.4, c: 0x5bbf5a, c2: 0xc9ccd3, m: 'foliage' };
    },
    build(b, p, c) {
      b.box(p.w, 0.05, p.d, { color: p.c2, mat: Mat.Plain, top: 0x4a3a28 });
      const n = Math.max(1, p.n);
      const k = Math.min(2, Math.max(0.4, p.h * 2.5));
      for (let i = 0; i < n; i++) {
        const r = (0.05 + 0.08 * hash01(c.index, i * 3 + 2)) * k;
        const x = (hash01(c.index, i * 3) - 0.5) * Math.max(0, p.w - r * 2);
        const z = (hash01(c.index, i * 3 + 1) - 0.5) * Math.max(0, p.d - r * 2);
        b.sphere(r, { x, y: 0.05 + r * 0.6, z, wSeg: 6, hSeg: 4, flat: true, color: mix(p.c, shade(p.c, 1.3), hash01(c.index, i + 50)), mat: c.M });
      }
    },
  },
  {
    t: 'tree',
    label: 'Trees',
    family: 'nature',
    blurb: 'A lone pine or a little grove — on any rooftop.',
    glyph: '<path d="M12 21v-6"/><path d="M12 15c-3.9 0-6.5-2.3-6.5-5.4 0-3.2 2.9-6.1 6.5-6.1s6.5 2.9 6.5 6.1c0 3.1-2.6 5.4-6.5 5.4z"/>',
    params: [pH('Height', 6, 0.1), pW('Grove spread'), pN('Trees', 1, 16), { key: 'seg', label: 'Shape', min: 5, max: 8, step: 3, unit: 'sides', choices: [{ value: 5, label: 'Pine' }, { value: 8, label: 'Round' }] }],
    accent: 'Trunk',
    habitable: 0,
    height: (p) => p.h,
    topScale: () => 0.2,
    create: (c) => ({ h: 0.7, w: Math.min(c.fpR * 1.4, 0.6), n: 1, seg: 8, c: 0x4caf50, c2: 0x6b4a2b, m: 'foliage' }),
    build(b, p, c) {
      const n = Math.max(1, p.n);
      for (let i = 0; i < n; i++) {
        const s = n === 1 ? 1 : 0.7 + 0.45 * hash01(c.index, i * 7 + 3);
        const x = n === 1 ? 0 : (hash01(c.index, i * 7) - 0.5) * p.w;
        const z = n === 1 ? 0 : (hash01(c.index, i * 7 + 1) - 0.5) * p.w;
        const th = p.h * s;
        b.cyl(0.018 * s + 0.006, 0.03 * s + 0.008, th * 0.45, { x, z, seg: 5, color: p.c2, mat: Mat.Plain });
        const leaf = mix(p.c, shade(p.c, 1.2), hash01(c.index, i + 90));
        if (p.seg <= 5) {
          b.cone(th * 0.26, th * 0.55, { x, y: th * 0.3, z, seg: 6, color: leaf, mat: c.M });
          b.cone(th * 0.19, th * 0.42, { x, y: th * 0.58, z, seg: 6, color: shade(leaf, 1.1), mat: c.M });
        } else {
          b.sphere(th * 0.3, { x, y: th * 0.62, z, wSeg: 7, hSeg: 5, flat: true, color: leaf, mat: c.M });
          b.sphere(th * 0.2, { x: x + th * 0.12, y: th * 0.82, z: z - th * 0.05, wSeg: 6, hSeg: 4, flat: true, color: shade(leaf, 1.12), mat: c.M, detail: true });
        }
      }
    },
  },
  {
    t: 'pool',
    label: 'Pool',
    family: 'nature',
    blurb: 'A rippling infinity pool. Rooftop optional.',
    glyph: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M6 12c2-1.5 4 1.5 6 0s4 1.5 6 0M6 15.5c2-1.5 4 1.5 6 0s4 1.5 6 0"/>',
    params: [pW(), pD(), pH('Rim height', 2, 0.02), SIDES([4, 6, 8, 24])],
    accent: 'Rim',
    habitable: 0,
    height: (p) => p.h,
    create: (c) => {
      const w = c.host ? c.host.topW * 0.7 : c.fpR * 1.2;
      return { w, d: w * 0.6, h: 0.06, seg: 4, c: 0x3a8dde, c2: 0xf4f1ea, m: 'water' };
    },
    build(b, p, c) {
      solid(b, p.seg, p.w, p.d, p.h, { color: p.c2, mat: Mat.Plain });
      solid(b, p.seg, Math.max(0.02, p.w - 0.08), Math.max(0.02, p.d - 0.08), 0.004, { y: p.h, color: p.c, mat: c.M });
    },
  },
  {
    t: 'crystal',
    label: 'Crystal shards',
    family: 'nature',
    blurb: 'A cluster of glowing geodes from the deep crust.',
    glyph: '<path d="M12 2 15 8l-3 13-3-13zM5 9l3 3-1 8-3-6zM19 9l-3 3 1 8 3-6z"/>',
    params: [pW('Spread'), pH('Height', 16), pN('Shards', 1, 14), pTilt('Splay', 0, 45)],
    habitable: 0,
    height: (p) => p.h,
    topScale: () => 0.1,
    create: (c) => ({ w: c.fpR * 0.8, h: 1.2, n: 5, tilt: 18, c: 0x8fe9ff, c2: 0xffffff, m: 'glass' }),
    build(b, p, c) {
      const n = Math.max(1, p.n);
      for (let k = 0; k < n; k++) {
        const r1 = hash01(c.index, k * 5), r2 = hash01(c.index, k * 5 + 1), r3 = hash01(c.index, k * 5 + 2);
        const hk = p.h * (k === 0 ? 1 : 0.4 + 0.45 * r1);
        const rk = Math.max(0.02, p.w * (k === 0 ? 0.16 : 0.08 + 0.06 * r2));
        const a = k * 2.39996 + c.index;
        const dist = k === 0 ? 0 : p.w * 0.34 * (0.45 + 0.55 * r3);
        const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
        const tilt = k === 0 ? 0 : p.tilt * DEG * (0.6 + 0.4 * r2);
        const prof: [number, number][] = [
          [0, 0],
          [rk, hk * 0.12],
          [rk * 0.9, hk * 0.76],
          [0, hk],
        ];
        b.group({ x, z, ry: Math.PI / 2 - a }, () => b.lathe(prof, { seg: 6, flat: true, rx: tilt, color: k === 0 ? p.c : mix(p.c, p.c2, 0.15 + 0.2 * r1), mat: c.M }));
      }
    },
  },
];

export const PART_DEFS: Record<PartType, PartDef> = Object.fromEntries(DEFS.map((d) => [d.t, d])) as Record<PartType, PartDef>;
export const PART_LIST: PartDef[] = DEFS;

export function partDef(t: PartType): PartDef {
  return PART_DEFS[t];
}

/** Resolve a dynamic parameter bound. */
export function bound(v: number | ((fpR: number) => number), fpR: number): number {
  return typeof v === 'function' ? v(fpR) : v;
}

/** Create a new part of `t` with smart defaults for the design described by `ctx`. */
export function createPart(t: PartType, ctx: AddCtx): PartSpec {
  const def = PART_DEFS[t];
  const base = def.create(ctx);
  return normalizePart({ t, stack: true, ...base } as PartSpec);
}

/** Material id for a part (main material channel). */
export function matOf(m: MatName): MatId {
  return MAT_IDS[m] ?? Mat.Plain;
}

/** Parts whose `d` is a horizontal depth (others are round in plan: depth = width). */
const DEPTH_TYPES = new Set<PartType>([
  'plinth', 'podium', 'block', 'rounded', 'cylinder', 'tapered', 'twisted', 'setback', 'colonnade', 'vault', 'obelisk', 'wedge', 'dome', 'onion',
  'pyramid', 'gable', 'pagoda', 'cone', 'neon', 'balcony', 'fins', 'solar', 'garden', 'pool', 'skybridge',
]);

/** Plan size of a part (width × depth) at its base. */
export function planSize(p: PartSpec): { w: number; d: number } {
  return { w: p.w, d: DEPTH_TYPES.has(p.t) ? p.d : p.w };
}

/** Width / depth of a part's top for things stacked on it. */
export function topWidth(p: PartSpec): { w: number; d: number } {
  const def = PART_DEFS[p.t];
  const s = def.topScale ? def.topScale(p) : 1;
  const ps = planSize(p);
  return { w: ps.w * s, d: ps.d * s };
}
