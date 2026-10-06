/**
 * zoned-rc · shared geometry helpers for residential & commercial growables (OWNER: zoned-rc).
 *
 * Pure functions on top of the kit (content/kit.ts): outline polygons (hex lot, rounded rect, ellipse, arch),
 * roof shapes the kit lacks (hip roof, shed), abstract signage glyphs and a library of tiny props
 * (trees, bushes, lamps, pools, umbrellas, hover-cars, AC units, antennas, columns). Every prop is flagged
 * `detail: true` so it disappears at LOD1. Local space follows the kit: +Y up, +Z faces the road.
 */
import { Mat, mix, shade, type MatId, type MeshBuilder, type PartOpts } from '../../../kit';

/** One storey (matches world/planet.ts FLOOR_HEIGHT) — facade window rows are aligned to it. */
export const FL = 0.2;
/** Lot plate radius (hexagon circumradius, flat side facing +Z). */
export const LOT = 0.9;
/** Top of the lot plate: buildings stand on this. */
export const G = 0.025;

export type V2 = [number, number];

// ─────────────────────────────────────────────────────────── outlines

/** Regular n-gon (x, z) with first vertex at angle `rot` measured from +Z towards +X. */
export function ngon(n: number, r: number, rot = 0, cx = 0, cz = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    out.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return out;
}

/** Hexagon with a flat side facing +Z (matches the tile when the building faces a neighbour). */
export function hexPoly(r: number): V2[] {
  return ngon(6, r, Math.PI / 6);
}

/** Rounded rectangle centred at the origin. */
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

/** Chamfered rectangle (octagon-ish). */
export function chamferRect(w: number, d: number, c: number, cx = 0, cz = 0): V2[] {
  const hw = w / 2, hd = d / 2;
  c = Math.min(c, hw * 0.9, hd * 0.9);
  return [
    [cx - hw + c, cz + hd], [cx + hw - c, cz + hd], [cx + hw, cz + hd - c], [cx + hw, cz - hd + c],
    [cx + hw - c, cz - hd], [cx - hw + c, cz - hd], [cx - hw, cz - hd + c], [cx - hw, cz + hd - c],
  ];
}

/** Ellipse outline with n points. */
export function ellipse(w: number, d: number, n = 14, cx = 0, cz = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.sin(a) * w * 0.5, cz + Math.cos(a) * d * 0.5]);
  }
  return out;
}

/** L-shaped outline: full w×d minus the (+x, -z) quadrant notch of size nw×nd. */
export function lShape(w: number, d: number, nw: number, nd: number): V2[] {
  const hw = w / 2, hd = d / 2;
  return [[-hw, hd], [hw, hd], [hw, -hd + nd], [hw - nw, -hd + nd], [hw - nw, -hd], [-hw, -hd]];
}

/** Arch outline in the (x, up) plane: rectangle of height h - w/2 topped by a semicircle. */
export function archPoly(w: number, h: number, seg = 4): V2[] {
  const r = w / 2;
  const sh = Math.max(0, h - r);
  const out: V2[] = [[-r, 0], [r, 0], [r, sh]];
  for (let s = 1; s < seg; s++) {
    const a = (s / seg) * Math.PI;
    out.push([Math.cos(a) * r, sh + Math.sin(a) * r]);
  }
  out.push([-r, sh]);
  return out;
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

// ─────────────────────────────────────────────────────────── roofs & facade bits

/** Hip roof: ridge along X, bottom at o.y. */
export function hip(b: MeshBuilder, w: number, h: number, d: number, o: PartOpts & { overhang?: number }): void {
  if (o.detail && b.lod === 1) return;
  const ov = o.overhang ?? 0.04;
  const hw = w / 2 + ov, hd = d / 2 + ov;
  const rx = Math.max(0, hw - hd);
  const mat = o.mat ?? Mat.Plain;
  const c = o.color;
  b.quad([-hw, 0, hd], [hw, 0, hd], [rx, h, 0], [-rx, h, 0], o, c, mat);
  b.quad([hw, 0, -hd], [-hw, 0, -hd], [-rx, h, 0], [rx, h, 0], o, c, mat);
  b.tri([hw, 0, hd], [hw, 0, -hd], [rx, h, 0], o, c, mat);
  b.tri([-hw, 0, -hd], [-hw, 0, hd], [-rx, h, 0], o, c, mat);
}

/** Mono-pitch (shed) roof slab sloping down toward +Z, bottom at o.y (high edge at -Z). */
export function shed(b: MeshBuilder, w: number, h: number, d: number, o: PartOpts & { overhang?: number }): void {
  const ov = o.overhang ?? 0.04;
  b.wedge(w + ov * 2, h, d + ov * 2, o);
}

/**
 * Arched opening drawn as a shallow extrusion standing on the facade plane z = 0, protruding +Z by `depth`.
 * Bottom at local y (use a group to place it).
 */
export function arch(b: MeshBuilder, w: number, h: number, depth: number, o: PartOpts & { seg?: number }): void {
  if (o.detail && b.lod === 1) return;
  const poly = archPoly(w, h, b.lod === 1 ? 2 : o.seg ?? 4);
  // extrude along +Y then rotate so the outline stands up (outline z → world up), extrusion → +Z
  b.group({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, rx: Math.PI / 2 }, () => {
    b.extrude(
      poly.map(([x, y]) => [x, -y] as V2),
      depth,
      { color: o.color, mat: o.mat, paint: o.paint, top: o.color, topMat: o.mat },
    );
  });
}

/**
 * Abstract lettering: `n` glyph panels of varied width on a sign face (facing +Z, bottom at y).
 * Reads as a word from a distance and glows at night with Mat.Glow.
 */
export function glyphs(b: MeshBuilder, w: number, h: number, n: number, seed: number, o: PartOpts): void {
  if (o.detail && b.lod === 1) return;
  const gap = 0.18;
  const ws: number[] = [];
  let tot = 0;
  for (let i = 0; i < n; i++) {
    const r = 0.6 + (((seed * 9301 + i * 49297) % 233280) / 233280) * 0.8;
    ws.push(r);
    tot += r;
  }
  const unit = w / (tot + gap * (n - 1));
  let x = -w / 2;
  for (let i = 0; i < n; i++) {
    const gw = ws[i] * unit;
    const gh = h * (i === 0 ? 1 : 0.78);
    b.panel(gw, gh, { ...o, x: (o.x ?? 0) + x + gw / 2, y: (o.y ?? 0) + (h - gh) * 0.5 });
    x += gw + gap * unit;
  }
}

// ─────────────────────────────────────────────────────────── tiny props (all detail)

export type TreeKind = 'round' | 'cone' | 'palm' | 'cactus' | 'crystal' | 'bulb' | 'pine' | 'neon';

/**
 * Low-poly tree. `sway` uses Mat.Foliage (only for things near the ground — the shader's sway grows with height).
 */
export function tree(b: MeshBuilder, x: number, z: number, s: number, kind: TreeKind, crown: number, trunk = 0x6a4a32, y = 0, sway = true): void {
  if (b.lod === 1) return;
  const fm: MatId = sway && y < 1.2 ? Mat.Foliage : Mat.Plain;
  const d = { detail: true, paint: false };
  switch (kind) {
    case 'round':
      b.cyl(0.02 * s, 0.028 * s, 0.14 * s, { ...d, color: trunk, seg: 3, x, z, y, capTop: false });
      b.sphere(0.13 * s, { ...d, color: crown, mat: fm, wSeg: 5, hSeg: 3, flat: true, x, z, y: y + 0.21 * s, sy: 0.9 });
      break;
    case 'cone':
    case 'pine':
      b.cyl(0.018 * s, 0.024 * s, 0.08 * s, { ...d, color: trunk, seg: 3, x, z, y, capTop: false });
      b.cone(0.12 * s, 0.3 * s, { ...d, color: crown, mat: fm, seg: 6, x, z, y: y + 0.06 * s });
      if (kind === 'pine') b.cone(0.085 * s, 0.2 * s, { ...d, color: shade(crown, 1.15), mat: fm, seg: 6, x, z, y: y + 0.22 * s });
      break;
    case 'palm':
      b.cyl(0.014 * s, 0.024 * s, 0.32 * s, { ...d, color: trunk, seg: 3, x, z, y, capTop: false, rz: 0.08 });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        b.group({ x: x + 0.026 * s, z, y: y + 0.31 * s, ry: a }, () => b.box(0.05 * s, 0.012 * s, 0.2 * s, { ...d, color: crown, mat: fm, z: 0.085 * s, rx: 0.38 }));
      }
      break;
    case 'cactus':
      b.cyl(0.035 * s, 0.04 * s, 0.24 * s, { ...d, color: crown, seg: 5, x, z, y });
      b.cyl(0.022 * s, 0.022 * s, 0.09 * s, { ...d, color: crown, seg: 4, x: x + 0.06 * s, z, y: y + 0.09 * s });
      b.box(0.06 * s, 0.03 * s, 0.03 * s, { ...d, color: crown, x: x + 0.035 * s, z, y: y + 0.08 * s });
      break;
    case 'crystal':
      b.cone(0.05 * s, 0.32 * s, { ...d, color: crown, mat: Mat.Glow, seg: 4, x, z, y, flat: true });
      b.cone(0.035 * s, 0.2 * s, { ...d, color: shade(crown, 0.8), mat: Mat.Glow, seg: 4, x: x + 0.06 * s, z: z + 0.02 * s, y, rz: -0.35, flat: true });
      b.cone(0.03 * s, 0.16 * s, { ...d, color: mix(crown, 0xffffff, 0.3), mat: Mat.Glow, seg: 4, x: x - 0.05 * s, z: z - 0.03 * s, y, rz: 0.4, flat: true });
      break;
    case 'bulb':
      b.cyl(0.012 * s, 0.02 * s, 0.2 * s, { ...d, color: trunk, seg: 3, x, z, y, capTop: false, rz: 0.1 });
      b.sphere(0.075 * s, { ...d, color: crown, mat: Mat.Glow, wSeg: 5, hSeg: 3, x: x - 0.01 * s, z, y: y + 0.24 * s, sy: 1.25 });
      break;
    case 'neon':
      b.cyl(0.012 * s, 0.02 * s, 0.3 * s, { ...d, color: 0x2a2e38, seg: 3, x, z, y, capTop: false });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        b.group({ x, z, y: y + 0.29 * s, ry: a }, () => b.box(0.035 * s, 0.01 * s, 0.17 * s, { ...d, color: crown, mat: Mat.Glow, z: 0.075 * s, rx: 0.45 }));
      }
      break;
  }
}

/** Squashed low-poly bush / hedge ball. */
export function bush(b: MeshBuilder, x: number, z: number, s: number, color: number, y = 0, mat: MatId = Mat.Foliage): void {
  if (b.lod === 1) return;
  b.sphere(0.08 * s, { color, mat: y < 1.2 ? mat : Mat.Plain, detail: true, paint: false, wSeg: 5, hSeg: 2, flat: true, x, z, y: y + 0.035 * s, sy: 0.8 });
}

/** Hedge strip (box). */
export function hedge(b: MeshBuilder, x: number, z: number, w: number, d: number, color: number, h = 0.07, y = G): void {
  b.box(w, h, d, { color, detail: true, paint: false, x, z, y, top: shade(color, 1.12) });
}

/** Garden / street lamp with a night-only head. */
export function lamp(b: MeshBuilder, x: number, z: number, h = 0.22, head = 0xffe0a0, pole = 0x3a3d44, y = G): void {
  if (b.lod === 1) return;
  b.cyl(0.009, 0.012, h, { color: pole, detail: true, paint: false, seg: 3, x, z, y, capTop: false });
  b.box(0.05, 0.03, 0.05, { color: head, mat: Mat.Light, detail: true, paint: false, x, z, y: y + h });
}

/** Swimming pool: coping rim + animated water. */
export function pool(b: MeshBuilder, x: number, z: number, w: number, d: number, rim = 0xe8e4dc, y = G, detail = false): void {
  b.box(w + 0.05, 0.03, d + 0.05, { color: rim, paint: false, x, z, y, detail });
  b.plane(w, d, { color: 0x3a9ad0, mat: Mat.Water, paint: false, x, z, y: y + 0.031, detail });
}

/** Café / market umbrella. */
export function umbrella(b: MeshBuilder, x: number, z: number, color: number, s = 1, y = G): void {
  if (b.lod === 1) return;
  b.cyl(0.006, 0.006, 0.16 * s, { color: 0xdddddd, detail: true, paint: false, seg: 3, x, z, y, capTop: false });
  b.cone(0.11 * s, 0.05 * s, { color, detail: true, paint: false, seg: 6, x, z, y: y + 0.14 * s, flat: true });
}

/** Parked hover-car (no wheels — it's 2350). */
export function hovercar(b: MeshBuilder, x: number, z: number, ry: number, color: number, y = G): void {
  if (b.lod === 1) return;
  b.group({ x, z, y: y + 0.015, ry }, () => {
    b.box(0.09, 0.03, 0.17, { color, detail: true, paint: false });
    b.box(0.075, 0.03, 0.08, { color: 0x1c2430, mat: Mat.Metal, detail: true, paint: false, y: 0.03, z: -0.01 });
  });
}

/** Rooftop / facade AC unit. */
export function acUnit(b: MeshBuilder, x: number, y: number, z: number, s = 1, color = 0xb8bcc4): void {
  b.box(0.1 * s, 0.06 * s, 0.08 * s, { color, mat: Mat.Metal, detail: true, paint: false, x, y, z });
}

/** Thin mast with a night beacon. */
export function antenna(b: MeshBuilder, x: number, y: number, z: number, h: number, beacon = 0xff3030, color = 0x9aa0aa): void {
  b.cyl(0.008, 0.016, h, { color, mat: Mat.Metal, seg: 3, detail: true, paint: false, x, y, z, capTop: false });
  b.box(0.035, 0.035, 0.035, { color: beacon, mat: Mat.Light, detail: true, paint: false, x, y: y + h, z });
}

/** Row of round columns along X at depth z (portico). */
export function columns(b: MeshBuilder, n: number, span: number, h: number, r: number, z: number, color: number, y = G, detail = false): void {
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
    b.cyl(r, r * 1.1, h, { color, seg: 6, x, z, y, detail, capTop: false });
  }
}

/** Slim vertical sign: dark backing + glowing face (blade sign projecting from a wall along +Z). */
export function bladeSign(b: MeshBuilder, x: number, y: number, z: number, h: number, color: number, mat: MatId = Mat.Glow, w = 0.05): void {
  b.box(0.025, h + 0.02, w + 0.04, { color: 0x1a1c22, paint: false, x, y: y - 0.01, z });
  b.box(0.03, h, w, { color, mat, paint: false, x, y, z });
}

/** Rooftop water tank on legs (New-York style). */
export function waterTank(b: MeshBuilder, x: number, y: number, z: number, s = 1, color = 0x8a6a4a): void {
  b.box(0.16 * s, 0.05 * s, 0.16 * s, { color: 0x3a3a40, detail: true, paint: false, x, y, z });
  b.cyl(0.075 * s, 0.075 * s, 0.13 * s, { color, seg: 6, detail: true, paint: false, x, y: y + 0.05 * s, z, capTop: false });
  b.cone(0.085 * s, 0.06 * s, { color: shade(color, 0.7), seg: 6, detail: true, paint: false, x, y: y + 0.18 * s, z });
}

/** Tilted solar panel on a short post. Angle tilts the panel toward +Z. */
export function solarPanel(b: MeshBuilder, x: number, y: number, z: number, w: number, d: number, tilt = 0.45, ry = 0, detail = true): void {
  b.group({ x, y, z, ry }, () => {
    b.box(0.02, 0.06, 0.02, { color: 0x6a6f78, detail, paint: false });
    b.box(w, 0.012, d, { color: 0x1a2a4a, mat: Mat.Solar, detail, paint: false, y: 0.05, rx: tilt });
  });
}

/** Planter strip with low greenery on top (rooftop / terrace / balcony edge). */
export function planter(b: MeshBuilder, x: number, y: number, z: number, w: number, d: number, box: number, green: number, detail = true): void {
  b.box(w, 0.04, d, { color: box, detail, paint: false, x, y, z });
  b.box(w * 0.92, 0.035, d * 0.7, { color: green, detail, paint: false, x, y: y + 0.04, z, top: shade(green, 1.15) });
}

/** LOD0 triangle budget for a growable (ARCHITECTURE.md §5). */
export const BUDGET = 400;

/** True when `n` more triangles still fit the growable budget (optional decor checks this first). */
export function room(b: MeshBuilder, n: number): boolean {
  return b.lod === 1 || b.triangles + n <= BUDGET - 6;
}

/** Clamp helper. */
export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** Pick by level (1..5) from a 5-entry table (clamped). */
export function byL<T>(L: number, table: readonly T[]): T {
  return table[clamp(Math.round(L), 1, table.length) - 1];
}

/** Linear interpolation between level-1 value a and level-5 value b. */
export function lerpL(L: number, a: number, b: number): number {
  return a + ((clamp(L, 1, 5) - 1) / 4) * (b - a);
}

/** Snap a height to whole storeys (+ small parapet allowance) so window rows never leave slivers. */
export function storeys(n: number, extra = 0.03): number {
  return Math.max(1, Math.round(n)) * FL + extra;
}

export { Mat, mix, shade };
