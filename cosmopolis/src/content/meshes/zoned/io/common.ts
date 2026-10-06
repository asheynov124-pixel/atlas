/**
 * zoned-io · shared geometry helpers for industrial & office growables (OWNER: zoned-io).
 *
 * Pure functions on top of the kit (content/kit.ts): outlines (hex lot, n-gons, rounded rects), roof shapes the
 * kit lacks (sawtooth, barrel vault), structural pieces (lattice masts, pipe racks, conveyor galleries, cranes)
 * and a library of tiny yard props (hover-trucks, containers, barrels, pallets, fans, drones, beacons). Every
 * small prop is flagged `detail: true` so it vanishes at LOD1.
 *
 * Local space follows the kit: +Y up, +Z faces the road, origin = lot centre on the ground.
 * Units: world units (1 ≈ 20 m). One storey = FL. Everything must stay inside FOOTPRINT_RADIUS (0.92).
 */
import { Mat, mix, shade, type MatId, type MeshBuilder, type PartOpts } from '../../../kit';

/** One storey (world/planet.ts FLOOR_HEIGHT) — window rows of the shared shader align to it. */
export const FL = 0.2;
/** Top of the lot plate: everything stands on this. */
export const G = 0.025;
/** Lot plate circumradius (hexagon, flat side facing +Z). */
export const LOT = 0.9;
/** Hard radius limit for geometry (FOOTPRINT_RADIUS for footprint 1). */
export const RMAX = 0.92;
/** LOD0 triangle budget for a growable (ARCHITECTURE.md §5). */
export const BUDGET = 400;
/** Spread into options of small parts that should vanish at LOD1. */
export const DET = { detail: true, paint: false } as const;
/** Spread into options of parts that must never take the tint tool. */
export const NP = { paint: false } as const;

export type V2 = [number, number];

// ─────────────────────────────────────────────────────────── math

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** Pick by level (1..5) from a 5-entry table. */
export function byL<T>(L: number, table: readonly T[]): T {
  return table[clamp(Math.round(L), 1, table.length) - 1];
}

/** Interpolate between the level-1 value and the level-5 value. */
export function lerpL(L: number, a: number, b: number): number {
  return a + ((clamp(L, 1, 5) - 1) / 4) * (b - a);
}

/** Height of n whole storeys (+ parapet allowance) so window rows never leave slivers. */
export function storeys(n: number, extra = 0.02): number {
  return Math.max(1, Math.round(n)) * FL + extra;
}

/** Snap a y coordinate to the storey grid (keeps window rows of stacked parts continuous). */
export function snapFL(y: number): number {
  return Math.round(y / FL) * FL;
}

// ─────────────────────────────────────────────────────────── outlines

/** Regular n-gon (x, z), first vertex at angle `rot` measured from +Z towards +X. */
export function ngon(n: number, r: number, rot = 0, cx = 0, cz = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    out.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return out;
}

/** Hexagon with a flat side facing +Z (matches the tile when the building faces its road). */
export function hexPoly(r: number): V2[] {
  return ngon(6, r, Math.PI / 6);
}

/** Rounded rectangle centred at (cx, cz). */
export function roundRect(w: number, d: number, r: number, seg = 2, cx = 0, cz = 0): V2[] {
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

/** Chamfered rectangle (octagonal plan). */
export function chamferRect(w: number, d: number, c: number, cx = 0, cz = 0): V2[] {
  const hw = w / 2, hd = d / 2;
  c = Math.min(c, hw * 0.9, hd * 0.9);
  return [
    [cx - hw + c, cz + hd], [cx + hw - c, cz + hd], [cx + hw, cz + hd - c], [cx + hw, cz - hd + c],
    [cx + hw - c, cz - hd], [cx - hw + c, cz - hd], [cx - hw, cz - hd + c], [cx - hw, cz + hd - c],
  ];
}

/** Flat convex polygon facing up at height o.y (fan triangulation, n-2 triangles). */
export function polyTop(b: MeshBuilder, poly: V2[], o: PartOpts): void {
  if (o.detail && b.lod === 1) return;
  const mat = o.mat ?? Mat.Plain;
  const a = poly[0];
  for (let i = 1; i < poly.length - 1; i++) {
    const p1 = poly[i], p2 = poly[i + 1];
    const ny = (p1[1] - a[1]) * (p2[0] - a[0]) - (p1[0] - a[0]) * (p2[1] - a[1]);
    if (ny >= 0) b.tri([a[0], 0, a[1]], [p1[0], 0, p1[1]], [p2[0], 0, p2[1]], o, o.color, mat);
    else b.tri([a[0], 0, a[1]], [p2[0], 0, p2[1]], [p1[0], 0, p1[1]], o, o.color, mat);
  }
}

// ─────────────────────────────────────────────────────────── budget

/** True when `n` more triangles still fit the growable budget (LOD1 always fits: detail is skipped there). */
export function room(b: MeshBuilder, n: number): boolean {
  return b.lod === 1 || b.triangles + n <= BUDGET - 4;
}

// ─────────────────────────────────────────────────────────── roofs

/**
 * Sawtooth roof over a w (X) × d (Z) hall: `n` teeth with ridges along X. The vertical glazed faces look toward
 * +Z (the street), so the classic north-light silhouette reads from the road. Cost: 8 tris per tooth.
 */
export function sawtooth(b: MeshBuilder, w: number, d: number, th: number, n: number, o: PartOpts & { glass: number; slopeMat?: MatId }): void {
  const t = d / n;
  for (let i = 0; i < n; i++) {
    const zc = (o.z ?? 0) - d / 2 + t * (i + 0.5);
    b.wedge(w, th, t, { color: o.color, mat: o.slopeMat ?? Mat.Plain, paint: o.paint, x: o.x, y: o.y, z: zc, ry: Math.PI });
    b.panel(w * 0.94, th * 0.8, { color: o.glass, mat: Mat.Glass, paint: false, x: o.x, y: (o.y ?? 0) + th * 0.08, z: zc + t / 2 + 0.004 });
  }
}

/**
 * Barrel vault: half cylinder with its ridge along X (length w), spanning depth d, rising `rise` above o.y.
 * Cost: 4 × seg tris (half caps included).
 */
export function vaultX(b: MeshBuilder, w: number, d: number, rise: number, o: PartOpts & { seg?: number }): void {
  const r = d / 2;
  b.cyl(r, r, w, { ...o, x: (o.x ?? 0) + w / 2, y: o.y ?? 0, z: o.z ?? 0, rz: Math.PI / 2, arc: Math.PI, seg: o.seg ?? 6, capBottom: true, sx: rise / r });
}

/** Barrel vault with its ridge along Z (length d), spanning width w. */
export function vaultZ(b: MeshBuilder, w: number, d: number, rise: number, o: PartOpts & { seg?: number }): void {
  const r = w / 2;
  b.cyl(r, r, d, { ...o, x: o.x ?? 0, y: o.y ?? 0, z: (o.z ?? 0) - d / 2, rz: Math.PI / 2, ry: Math.PI / 2, arc: Math.PI, seg: o.seg ?? 6, capBottom: true, sx: rise / r });
}

/** Thin horizontal band wrapped round a w × d box at height y (a glow strip, a cornice, a gutter). */
export function band(b: MeshBuilder, w: number, d: number, h: number, o: PartOpts & { out?: number }): void {
  const e = o.out ?? 0.012;
  b.box(w + e * 2, h, d + e * 2, { ...o });
}

// ─────────────────────────────────────────────────────────── structures

/**
 * Straight member between two points (a beam, strut, pipe or cable) as a thin box. Cost: 10 tris.
 */
export function beam(b: MeshBuilder, a: [number, number, number], c: [number, number, number], t: number, o: PartOpts): void {
  if (o.detail && b.lod === 1) return;
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  b.group({ x: a[0], y: a[1], z: a[2], ry: yaw }, () => {
    b.group({ rx: -pitch }, () => b.box(t, t, len, { ...o, x: 0, y: -t / 2, z: len / 2 }));
  });
}

/**
 * Four-legged lattice mast / derrick: legs taper from `wb` at the base to `wt` at the top with `bands`
 * horizontal braces and one X-brace per face on the bottom bay. Cost ≈ 40 + 40 × bands tris (bands are optional).
 */
export function lattice(b: MeshBuilder, x: number, z: number, y: number, wb: number, wt: number, h: number, bands: number, color: number, t = 0.022, detailBraces = true): void {
  const hb = wb / 2, ht = wt / 2;
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) beam(b, [x + sx * hb, y, z + sz * hb], [x + sx * ht, y + h, z + sz * ht], t, { color, mat: Mat.Plain, paint: false });
  for (let k = 1; k <= bands; k++) {
    const f = k / (bands + 1);
    const hw = hb + (ht - hb) * f;
    const yy = y + h * f;
    b.box(hw * 2 + t, t * 0.8, t * 0.8, { color, mat: Mat.Plain, paint: false, x, y: yy, z: z + hw, detail: detailBraces });
    b.box(hw * 2 + t, t * 0.8, t * 0.8, { color, mat: Mat.Plain, paint: false, x, y: yy, z: z - hw, detail: detailBraces });
    b.box(t * 0.8, t * 0.8, hw * 2 + t, { color, mat: Mat.Plain, paint: false, x: x + hw, y: yy, z, detail: detailBraces });
    b.box(t * 0.8, t * 0.8, hw * 2 + t, { color, mat: Mat.Plain, paint: false, x: x - hw, y: yy, z, detail: detailBraces });
  }
}

/**
 * Covered conveyor gallery from point a to point c (rising), with a support trestle under its midpoint.
 * Cost: 10 (gallery) + 10 (trestle) + 10 (belt glint, detail).
 */
export function conveyor(b: MeshBuilder, a: [number, number, number], c: [number, number, number], w: number, color: number, belt = 0x2a2c30): void {
  beam(b, a, c, w, { color, mat: Mat.Plain, paint: false });
  const mx = (a[0] + c[0]) / 2, mz = (a[2] + c[2]) / 2, my = (a[1] + c[1]) / 2;
  if (my > G + 0.06) b.box(w * 0.5, my - G - w * 0.5, w * 0.5, { color: shade(color, 0.7), mat: Mat.Plain, paint: false, x: mx, y: G, z: mz });
  beam(b, [a[0], a[1] + w * 0.52, a[2]], [c[0], c[1] + w * 0.52, c[2]], w * 0.5, { color: belt, paint: false, detail: true });
}

/** Pipe rack: a run of `n` pipes between two points at height y on simple bents. */
export function pipeRack(b: MeshBuilder, x0: number, z0: number, x1: number, z1: number, y: number, colors: number[], steel: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const bents = Math.max(2, Math.round(len / 0.35) + 1);
  const nx = -(z1 - z0) / (len || 1), nz = (x1 - x0) / (len || 1);
  for (let i = 0; i < bents; i++) {
    const f = i / (bents - 1);
    const px = x0 + (x1 - x0) * f, pz = z0 + (z1 - z0) * f;
    b.box(0.02, y - G, 0.02, { color: steel, mat: Mat.Plain, paint: false, x: px, y: G, z: pz, detail: i > 0 && i < bents - 1 });
  }
  colors.forEach((c, k) => {
    const off = (k - (colors.length - 1) / 2) * 0.03;
    beam(b, [x0 + nx * off, y + 0.012, z0 + nz * off], [x1 + nx * off, y + 0.012, z1 + nz * off], 0.022, { color: c, mat: Mat.Plain, paint: false });
  });
}

/**
 * Tower crane: lattice-look mast, jib with counter-jib & ballast, cab, hook line and a night beacon at the tip.
 * `ry` turns the jib. Cost ≈ 70 tris.
 */
export function towerCrane(b: MeshBuilder, x: number, z: number, h: number, jib: number, ry: number, color: number, y = G): void {
  b.group({ x, z, y, ry }, () => {
    b.box(0.06, h, 0.06, { color, mat: Mat.Plain, paint: false });
    b.box(0.08, 0.05, 0.08, { color: 0x30343c, paint: false, y: h - 0.07, z: 0.05 });
    b.box(0.035, 0.035, jib, { color, mat: Mat.Plain, paint: false, y: h, z: jib / 2 - 0.04 });
    b.box(0.035, 0.03, jib * 0.35, { color, mat: Mat.Plain, paint: false, y: h, z: -jib * 0.2 });
    b.box(0.07, 0.06, 0.07, { color: 0x6a6e76, paint: false, y: h - 0.04, z: -jib * 0.33 });
    b.cone(0.02, 0.12, { color, seg: 4, y: h, paint: false });
    b.box(0.006, h * 0.45, 0.006, { color: 0x30343c, paint: false, y: h * 0.55, z: jib * 0.7, detail: true });
    b.box(0.04, 0.03, 0.04, { color: 0xffc040, paint: false, y: h * 0.55 - 0.03, z: jib * 0.7, detail: true });
    b.box(0.025, 0.025, 0.025, { color: 0xff3a2a, mat: Mat.Light, paint: false, y: h + 0.03, z: jib - 0.05 });
  });
}

/**
 * Portal / gantry crane straddling a yard: two legged frames along X with a girder and trolley. Cost ≈ 70 tris.
 */
export function gantry(b: MeshBuilder, x: number, z: number, span: number, h: number, depth: number, color: number, ry = 0): void {
  b.group({ x, z, y: G, ry }, () => {
    for (const s of [-1, 1]) {
      b.box(0.04, h, 0.04, { color, mat: Mat.Plain, paint: false, x: s * span / 2, z: -depth / 2 });
      b.box(0.04, h, 0.04, { color, mat: Mat.Plain, paint: false, x: s * span / 2, z: depth / 2 });
      b.box(0.05, 0.03, depth + 0.06, { color: shade(color, 0.75), mat: Mat.Plain, paint: false, x: s * span / 2, y: 0 });
    }
    b.box(span + 0.12, 0.06, 0.06, { color, mat: Mat.Plain, paint: false, y: h, z: -depth / 2 });
    b.box(span + 0.12, 0.06, 0.06, { color, mat: Mat.Plain, paint: false, y: h, z: depth / 2 });
    b.box(0.12, 0.07, depth + 0.04, { color: 0x30343c, paint: false, x: span * 0.12, y: h - 0.01 });
    b.box(0.008, h * 0.4, 0.008, { color: 0x30343c, paint: false, x: span * 0.12, y: h * 0.6, detail: true });
    b.box(0.022, 0.022, 0.022, { color: 0xffa020, mat: Mat.Light, paint: false, x: span / 2 + 0.05, y: h + 0.06, z: depth / 2, detail: true });
  });
}

// ─────────────────────────────────────────────────────────── yard props (detail)

/** Hover-truck: cab + cargo box (no wheels — it's 2350). Faces +Z by default. Cost: 20 (+10 light bar). */
export function truck(b: MeshBuilder, x: number, z: number, ry: number, cab: number, cargo: number, y = G): void {
  if (b.lod === 1) return;
  b.group({ x, z, y: y + 0.014, ry }, () => {
    b.box(0.085, 0.07, 0.085, { color: cab, ...DET, z: 0.11 });
    b.box(0.09, 0.085, 0.2, { color: cargo, ...DET, z: -0.04 });
    b.box(0.07, 0.012, 0.012, { color: 0xfff0c0, mat: Mat.Light, ...DET, y: 0.04, z: 0.155 });
  });
}

/** Shipping container (10 tris). */
export function container(b: MeshBuilder, x: number, y: number, z: number, ry: number, color: number, len = 0.2, detail = false): void {
  b.box(0.075, 0.075, len, { color, paint: false, x, y, z, ry, top: shade(color, 1.1), detail });
}

/** Barrel / drum (seg 5 → 15 tris). */
export function barrel(b: MeshBuilder, x: number, z: number, color: number, y = G, s = 1): void {
  b.cyl(0.022 * s, 0.022 * s, 0.05 * s, { color, seg: 5, ...DET, x, y, z });
}

/** Pallet stack (box, 10 tris). */
export function pallets(b: MeshBuilder, x: number, z: number, color = 0xb08a5a, h = 0.05): void {
  b.box(0.08, h, 0.08, { color, ...DET, x, y: G, z, top: shade(color, 1.1) });
}

/** Rooftop fan / chiller (short cylinder + dark grille). Cost: 2 × seg + 8. */
export function fan(b: MeshBuilder, x: number, y: number, z: number, r: number, color: number, seg = 6): void {
  b.cyl(r, r, 0.03, { color, mat: Mat.Plain, seg, ...DET, x, y, z, top: 0x22252b });
}

/** Rooftop air-handler box. */
export function airHandler(b: MeshBuilder, x: number, y: number, z: number, w: number, d: number, color = 0xb8bcc4): void {
  b.box(w, 0.06, d, { color, mat: Mat.Plain, ...DET, x, y, z });
}

/** Thin mast with a night beacon on top. */
export function antenna(b: MeshBuilder, x: number, y: number, z: number, h: number, beacon = 0xff3030, color = 0x9aa0aa, detail = true): void {
  b.cyl(0.006, 0.014, h, { color, mat: Mat.Metal, seg: 3, paint: false, detail, x, y, z, capTop: false });
  b.box(0.03, 0.03, 0.03, { color: beacon, mat: Mat.Light, paint: false, detail, x, y: y + h, z });
}

/** Red aviation light (night only). */
export function beacon(b: MeshBuilder, x: number, y: number, z: number, s = 0.035, color = 0xff2a1a): void {
  b.box(s, s, s, { color, mat: Mat.Light, paint: false, x, y, z });
}

/** Little quad-drone (detail). */
export function drone(b: MeshBuilder, x: number, y: number, z: number, body: number, light: number): void {
  if (b.lod === 1) return;
  b.box(0.05, 0.016, 0.05, { color: body, ...DET, x, y, z });
  b.box(0.08, 0.006, 0.012, { color: light, mat: Mat.Glow, ...DET, x, y: y + 0.016, z });
}

/** Lamp post with a night-only head. */
export function lampPost(b: MeshBuilder, x: number, z: number, h = 0.22, head = 0xffe0a0, pole = 0x3a3d44): void {
  if (b.lod === 1) return;
  b.cyl(0.008, 0.011, h, { color: pole, ...DET, seg: 3, x, z, y: G, capTop: false });
  b.box(0.045, 0.025, 0.045, { color: head, mat: Mat.Light, ...DET, x, z, y: G + h });
}

/** Stockpile cone of loose material (seg 6 → 12 tris). */
export function heap(b: MeshBuilder, x: number, z: number, r: number, h: number, color: number, detail = false): void {
  b.cone(r, h, { color, seg: 6, paint: false, flat: true, x, z, y: G, detail });
}

/** Low fence run along X at depth z (one thin box + posts at the ends). */
export function fence(b: MeshBuilder, x: number, z: number, w: number, color: number, h = 0.05, ry = 0): void {
  b.box(w, h, 0.012, { color, ...DET, x, z, y: G, ry });
}

/** Tiny livestock: body + head (12-20 tris). */
export function critter(b: MeshBuilder, x: number, z: number, ry: number, color: number, head = 0x3a2a22): void {
  if (b.lod === 1) return;
  b.group({ x, z, y: G, ry }, () => {
    b.box(0.03, 0.03, 0.055, { color, ...DET, y: 0.018 });
    b.box(0.022, 0.022, 0.022, { color: head, ...DET, y: 0.03, z: 0.035 });
  });
}

/** Round hay bale / produce drum lying on its side (seg 5). */
export function bale(b: MeshBuilder, x: number, z: number, color: number, ry = 0): void {
  b.cyl(0.03, 0.03, 0.05, { color, seg: 5, ...DET, x: x + 0.025 * Math.cos(ry), y: G + 0.03, z: z - 0.025 * Math.sin(ry), rz: Math.PI / 2, ry, capBottom: true });
}

/** Painted ground stripes (parking bays / hazard lines), n thin planes along X at depth z. */
export function stripes(b: MeshBuilder, x: number, z: number, w: number, n: number, len: number, color = 0xe8e4d8): void {
  if (b.lod === 1) return;
  for (let i = 0; i < n; i++) b.plane(0.01, len, { color, ...DET, x: x - w / 2 + (w * (i + 0.5)) / n, z, y: G + 0.003 });
}

/** Low-poly lollipop tree used when a look has no special kind. */
export function roundTree(b: MeshBuilder, x: number, z: number, s: number, crown: number, trunk: number, y = G): void {
  if (b.lod === 1) return;
  b.cyl(0.016 * s, 0.022 * s, 0.12 * s, { color: trunk, seg: 3, ...DET, x, z, y, capTop: false });
  b.sphere(0.11 * s, { color: crown, mat: y < 1.2 ? Mat.Foliage : Mat.Plain, ...DET, wSeg: 5, hSeg: 3, flat: true, x, z, y: y + 0.18 * s, sy: 0.9 });
}

export { Mat, mix, shade };
export type { MatId, MeshBuilder, PartOpts };
