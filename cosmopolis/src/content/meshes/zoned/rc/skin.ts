/**
 * zoned-rc · Skin — the architectural "grammar" of one style (OWNER: zoned-rc).
 *
 * Building types (residential.ts, commercial.ts, leisure.ts) describe MASSING only — "a two-storey house 0.9
 * wide", "a 30-storey shaft with a crown", "a shop front 1.1 wide". A Skin turns those requests into geometry in
 * its own architectural language, so one building type looks completely different in each of the 8 styles
 * (classic gables & chimneys, neo white curves, solarpunk timber & gardens, cyber neon megablocks, mars adobe
 * domes & arches, ice insulated domes, crystal prisms, organic pods & tendrils).
 *
 * Conventions: local space of the building (+Y up, +Z = street side). Methods that take a "facade" draw on the
 * plane z = 0 facing +Z — the caller positions them with b.group({ x, z, ry }). Heights snap to storeys (FL).
 * The base class holds sensible modern defaults; each style subclass overrides what makes it distinct.
 */
import type { MatId, MeshBuilder } from '../../../kit';
import type { Rng } from '../../../../core/rng';
import type { StyleId } from '../../../../core/types';
import type { StylePalette } from '../../../styles';
import {
  FL, G, LOT, Mat, antenna, bladeSign, bush, columns, ellipse, glyphs, hedge, hexPoly, hip, lamp, planter, polyTop, room, roundRect, shade, mix, tree,
  type TreeKind, type V2,
} from './common';

/** Resolved colours for one building (variant-stable). */
export interface Pal {
  wall: number;
  wall2: number;
  roof: number;
  trim: number;
  trim2: number;
  accent: number;
  accent2: number;
  accent3: number;
  glass: number;
  ground: number;
  pave: number;
  plaza: number;
  asphalt: number;
  green: number;
  green2: number;
  trunk: number;
  dark: number;
  metal: number;
  gold: number;
  timber: number;
  awning: number;
}

/** Everything a building factory needs. */
export interface RC {
  b: MeshBuilder;
  /** level 1..5 */
  L: number;
  /** variant index */
  v: number;
  /** variant-stable integer seed (identity is kept while the building levels up) */
  seed: number;
  /** variant-stable rng — use for layout / colour choices */
  vr: Rng;
  /** per-mesh rng (level & style specific) — use for small decorative jitter */
  rng: Rng;
  sid: StyleId;
  st: StylePalette;
  p: Pal;
  sk: Skin;
  /** true at LOD1 (far): skip fussy work */
  lo: boolean;
  /** triangles still needed by mandatory parts drawn later (optional trims leave this much room) */
  reserve: number;
}

/**
 * True when an optional part of `n` triangles fits the budget while leaving rc.reserve for what follows
 * (+ a small margin for mandatory bits a skin method may still draw after its optional ones).
 */
export function fits(rc: RC, n: number): boolean {
  return room(rc.b, n + rc.reserve + 12);
}

/** Reserve the mandatory cost of skin elements still to be drawn (pairs of [element, count]) + extra. */
export function need(rc: RC, parts: [keyof SkinCost, number][] = [], extra = 0): void {
  let n = extra;
  for (const [k, c] of parts) n += rc.sk.cost[k] * c;
  rc.reserve = n;
}

export type LotKind = 'lawn' | 'pave' | 'plaza' | 'asphalt' | 'garden';
export type RoofKind = 'gable' | 'hip' | 'flat' | 'front' | 'shed';
export type UseKind = 'res' | 'shop' | 'office' | 'hotel' | 'fun';

export interface HouseOpts {
  x?: number;
  z?: number;
  y?: number;
  ry?: number;
  w: number;
  d: number;
  floors: number;
  roof?: RoofKind;
  /** 0..1 — ornament / luxury */
  prestige?: number;
  color?: number;
  door?: boolean;
}

export interface MassOpts {
  x?: number;
  z?: number;
  y?: number;
  w: number;
  d: number;
  /** height (callers pass storeys(n)) */
  h: number;
  use?: UseKind;
  color?: number;
  /** 0..1 how much the top is narrower than the bottom (towers) */
  taper?: number;
  /** segment index within a stacked tower (for twists / alternation) */
  seg?: number;
  /** ornament level 0..1 */
  prestige?: number;
  /** round / polygonal plan instead of the style's default outline */
  round?: boolean;
  /** minimal geometry (no trims) — for many-segment signature towers */
  lite?: boolean;
}

export interface RoofOpts {
  x?: number;
  z?: number;
  y: number;
  w: number;
  d: number;
  kind: 'flat' | 'pitched' | 'garden' | 'deck' | 'mech';
  prestige?: number;
}

export interface CrownOpts {
  x?: number;
  z?: number;
  y: number;
  w: number;
  d: number;
  /** 0..1 — level-5 icons get the full show */
  prestige: number;
  /** extra spire height multiplier */
  tall?: number;
  /** variant selector */
  kind?: number;
}

export interface FaceOpts {
  w: number;
  y0: number;
  y1: number;
  /** storeys between balconies */
  every?: number;
  depth?: number;
  /** number of columns of balconies across the face (0 = continuous band) */
  cols?: number;
}

export interface ShopOpts {
  w: number;
  /** height of the shop storey */
  h: number;
  kind?: 'shop' | 'cafe' | 'big' | 'fun';
  /** sign glyph count (0 = no sign) */
  glyphs?: number;
  color?: number;
}

export interface SignOpts {
  w: number;
  h: number;
  kind: 'board' | 'blade' | 'screen' | 'holo' | 'roof' | 'marquee';
  color?: number;
  n?: number;
}

const DET = { detail: true, paint: false } as const;

/** Approximate mandatory triangle cost of each skin element (used by types to reserve budget). */
export interface SkinCost {
  house: number;
  pod: number;
  block: number;
  tower: number;
  crown: number;
  roof: number;
  portico: number;
  shop: number;
  bridge: number;
  terrace: number;
  sign: number;
}

export abstract class Skin {
  abstract readonly id: StyleId;
  /** measured by rc.ts calibrate() on first use (mandatory parts only) */
  cost: SkinCost = { house: 120, pod: 90, block: 70, tower: 70, crown: 110, roof: 60, portico: 50, shop: 80, bridge: 40, terrace: 30, sign: 40 };
  calibrated = false;
  /** ground colours */
  abstract readonly ground: number;
  abstract readonly pave: number;
  abstract readonly plaza: number;
  readonly asphalt: number = 0x4a4c52;
  abstract readonly green: number;
  readonly trunk: number = 0x6a4a32;
  readonly treeKind: TreeKind = 'round';
  readonly timber: number = 0x8a5a3a;
  readonly gold: number = 0xe0b860;
  /** facade material for homes / apartments / towers */
  readonly houseMat: MatId = Mat.WindowSmall;
  readonly blockMat: MatId = Mat.Window;
  readonly towerMat: MatId = Mat.Window;
  readonly officeMat: MatId = Mat.Glass;

  /** Style-specific palette tweaks (called once per building). */
  palette(p: Pal, _vr: Rng): Pal {
    return p;
  }

  // ───────────────────────────────────────────── ground & greenery

  /** Hexagonal lot plate (+ optional front path). Top surface only — it sits flush on the terrace. */
  lot(rc: RC, kind: LotKind, path = 0): void {
    const { b, p } = rc;
    const base = kind === 'lawn' || kind === 'garden' ? p.ground : kind === 'pave' ? p.pave : kind === 'plaza' ? p.plaza : p.asphalt;
    const col = shade(base, 0.95 + (rc.seed % 7) * 0.016);
    polyTop(b, hexPoly(LOT), { color: col, paint: false, y: G });
    if (path > 0) b.plane(path, LOT * 0.62, { color: p.pave, paint: false, z: LOT * 0.55, y: G + 0.002, detail: true });
  }

  /** Garden boundary segment along X (hedge by default; styles swap in pickets, adobe walls, snow banks…). */
  fence(rc: RC, x: number, z: number, w: number, d = 0.05): void {
    if (rc.lo || !fits(rc, 12)) return;
    this.drawFence(rc, x, z, w, d);
  }

  protected drawFence(rc: RC, x: number, z: number, w: number, d: number): void {
    hedge(rc.b, x, z, w, d, shade(rc.p.green, 0.9));
  }

  /** Style tree — skipped when the triangle budget is spent (decor never breaks the budget). */
  tree(rc: RC, x: number, z: number, s = 1, y = G): void {
    if (fits(rc, this.treeCost)) this.drawTree(rc, x, z, s, y);
  }

  shrub(rc: RC, x: number, z: number, s = 1, y = G): void {
    if (fits(rc, 24)) this.drawShrub(rc, x, z, s, y);
  }

  /** Garden lamp / porch light flavour. */
  lamp(rc: RC, x: number, z: number, h = 0.2): void {
    if (fits(rc, 26)) this.drawLamp(rc, x, z, h);
  }

  /** approximate triangles of one drawTree() */
  protected readonly treeCost: number = 40;

  protected drawTree(rc: RC, x: number, z: number, s: number, y: number): void {
    tree(rc.b, x, z, s, this.treeKind, rc.rng.chance(0.5) ? rc.p.green : rc.p.green2, rc.p.trunk, y);
  }

  protected drawShrub(rc: RC, x: number, z: number, s: number, y: number): void {
    bush(rc.b, x, z, s, rc.p.green2, y);
  }

  protected drawLamp(rc: RC, x: number, z: number, h: number): void {
    lamp(rc.b, x, z, h, 0xffd890);
  }

  // ───────────────────────────────────────────── homes

  /** Detached dwelling with a roof; returns the height of its highest point. */
  house(rc: RC, o: HouseOpts): number {
    const { b, p } = rc;
    const h = o.floors * FL + 0.03;
    let top = h;
    b.group({ x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, ry: o.ry ?? 0 }, () => {
      b.box(o.w, h - G, o.d, { color: o.color ?? p.wall, mat: this.houseMat, y: G });
      b.box(o.w + 0.08, 0.03, o.d + 0.08, { color: p.trim, y: h });
      top = h + 0.03;
      if (o.door !== false) b.box(0.1, 0.15, 0.02, { color: p.dark, y: G, z: o.d / 2 + 0.005, ...DET });
    });
    return top;
  }

  /** Habitat dome / pod (used by "dome home" and decorative annexes). */
  pod(rc: RC, x: number, z: number, r: number, h: number, glass = false, y = G): number {
    const { b, p } = rc;
    b.cyl(r, r, 0.06, { color: p.trim, seg: 9, x, z, y, capTop: false });
    b.dome(r, { color: glass ? p.glass : p.wall, mat: glass ? Mat.Glass : Mat.Plain, wSeg: 9, hSeg: 3, h, x, z, y: y + 0.06 });
    return y + 0.06 + h;
  }

  // ───────────────────────────────────────────── masses

  /** Outline of a mass in this style (null = plain box). */
  outline(_rc: RC, w: number, d: number): V2[] | null {
    return roundRect(w, d, Math.min(w, d) * 0.12, 1);
  }

  /**
   * Width of the straight part of a w×d mass's street face. Rounded styles curve away at the corners, so
   * shop fronts, balconies and lit edges are clamped to this to never hang in the air.
   */
  frontWidth(w: number, _d: number): number {
    return w;
  }

  /** Outline used for round towers (o.round). */
  roundOutline(w: number, d: number): V2[] {
    return ellipse(w, d, 12);
  }

  facadeMat(use: UseKind | undefined, tower = false): MatId {
    if (use === 'office') return this.officeMat;
    return tower ? this.towerMat : this.blockMat;
  }

  /** Plain extruded mass (no trims). */
  shell(rc: RC, o: MassOpts, mat: MatId, color: number, outline?: V2[] | null): void {
    const { b } = rc;
    const poly = outline !== undefined ? outline : o.round ? this.roundOutline(o.w, o.d) : this.outline(rc, o.w, o.d);
    const y = o.y ?? G;
    if (poly) b.extrude(poly, o.h, { color, mat, x: o.x ?? 0, z: o.z ?? 0, y, top: rc.p.roof });
    else b.box(o.w, o.h, o.d, { color, mat, x: o.x ?? 0, z: o.z ?? 0, y, top: rc.p.roof });
  }

  /** Low/mid-rise block (no roof). */
  block(rc: RC, o: MassOpts): void {
    this.shell(rc, o, this.facadeMat(o.use), o.color ?? rc.p.wall);
  }

  /** Tall shaft section (no roof). */
  tower(rc: RC, o: MassOpts): void {
    this.shell(rc, o, this.facadeMat(o.use, true), o.color ?? rc.p.wall);
  }

  /** Roof treatment for a block whose top is at o.y. */
  roof(rc: RC, o: RoofOpts): void {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0;
    if (o.kind === 'pitched') {
      hip(b, o.w, Math.min(o.w, o.d) * 0.32, o.d, { color: p.roof, x, z, y: o.y });
      return;
    }
    b.box(o.w * 0.3, 0.12, o.d * 0.3, { color: p.trim, x: x - o.w * 0.18, z: z - o.d * 0.15, y: o.y, detail: true });
    if (o.kind === 'garden' || o.kind === 'deck') this.roofGarden(rc, x, z, o.y, o.w, o.d);
  }

  /** Planted roof. */
  roofGarden(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    const { b, p } = rc;
    b.box(w * 0.82, 0.03, d * 0.82, { color: p.green, paint: false, x, z, y });
    planter(b, x + w * 0.3, y + 0.03, z, w * 0.12, d * 0.6, p.trim, p.green2);
    tree(b, x - w * 0.22, z - d * 0.2, 0.7, this.treeKind, p.green2, p.trunk, y + 0.03, false);
  }

  /** Crown / spire for towers. Returns the highest point. */
  crown(rc: RC, o: CrownOpts): number {
    const { b, p } = rc;
    const x = o.x ?? 0, z = o.z ?? 0;
    b.box(o.w * 0.7, 0.2, o.d * 0.7, { color: p.trim, x, z, y: o.y });
    const h = 0.6 * (o.tall ?? 1) * (0.4 + o.prestige);
    antenna(b, x, o.y + 0.2, z, h);
    return o.y + 0.2 + h;
  }

  /** Terrace / setback deck with planting (y = deck level). */
  terrace(rc: RC, x: number, z: number, y: number, w: number, d: number): void {
    const { b, p } = rc;
    b.box(w, 0.025, d, { color: p.pave, paint: false, x, z, y });
    if (fits(rc, 20)) planter(b, x, y + 0.025, z + d / 2 - 0.04, w * 0.9, 0.06, p.trim, p.green);
  }

  /** Floor plates / balconies on a facade (local, plane z = 0, protruding +Z). */
  balconies(rc: RC, o: FaceOpts): void {
    const { b, p } = rc;
    const every = o.every ?? 1;
    const dep = o.depth ?? 0.07;
    const n0 = Math.ceil((o.y0 - 0.001) / FL), n1 = Math.floor(o.y1 / FL);
    for (let f = n0; f <= n1; f += every) {
      const y = f * FL;
      if (o.cols && o.cols > 0) {
        const cw = o.w / o.cols;
        for (let c = 0; c < o.cols; c++) b.box(cw * 0.7, 0.06, dep, { color: p.trim, x: -o.w / 2 + cw * (c + 0.5), z: dep / 2, y, ...DET });
      } else b.box(o.w, 0.05, dep, { color: p.trim, z: dep / 2, y, ...DET });
    }
  }

  /** Floor-plate rings around a mass (tower "wedding cake" lines); at most ~6 rings, never over budget. */
  plates(rc: RC, x: number, z: number, w: number, d: number, y0: number, y1: number, every: number, color = rc.p.trim, over = 0.05, round = false): void {
    const { b } = rc;
    const n = Math.max(1, Math.floor((y1 - y0) / FL));
    const step = Math.max(every, Math.ceil(n / 6));
    const poly = round ? null : this.outline(rc, w + over * 2, d + over * 2);
    const cost = round ? 24 : poly ? poly.length * 3 : 10;
    for (let f = Math.ceil(y0 / FL); f * FL <= y1; f += step) {
      if (!fits(rc, cost)) return;
      const y = f * FL - 0.01;
      if (round) b.cyl(Math.min(w, d) / 2 + over, Math.min(w, d) / 2 + over, 0.025, { color, x, z, y, seg: 12, capTop: false, detail: true, paint: true });
      else if (poly) b.extrude(poly, 0.025, { color, x, z, y, detail: true, paint: true });
      else b.box(w + over * 2, 0.025, d + over * 2, { color, x, z, y, detail: true });
    }
  }

  /** Sky-bridge between two points at height y (a box along the segment). */
  bridge(rc: RC, x0: number, z0: number, x1: number, z1: number, y: number, h = FL * 2, w = 0.16): void {
    const { b, p } = rc;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    b.box(w, h, len, { color: p.glass, mat: Mat.Glass, x: (x0 + x1) / 2, z: (z0 + z1) / 2, y, ry, top: p.trim });
  }

  // ───────────────────────────────────────────── commerce

  /** Shop storey front: display glazing, entrance, awning / canopy and sign (local facade). */
  shopfront(rc: RC, o: ShopOpts): void {
    if (rc.lo) {
      // far away: lit glazing + one canopy slab reads the same
      rc.b.box(o.w - 0.04, o.h * 0.75, 0.03, { color: mix(rc.p.glass, 0xffffff, 0.3), mat: Mat.Glass, y: G, z: 0.012, paint: false });
      rc.b.box(o.w + 0.02, 0.025, 0.14, { color: rc.p.awning, y: o.h * 0.78, z: 0.07, paint: false });
      return;
    }
    this.drawShopfront(rc, o);
  }

  protected drawShopfront(rc: RC, o: ShopOpts): void {
    const { b, p } = rc;
    b.box(o.w - 0.06, o.h * 0.72, 0.03, { color: p.glass, mat: Mat.Glass, y: G, z: 0.012, paint: false });
    b.box(o.w + 0.04, 0.025, 0.16, { color: p.trim, y: o.h * 0.8, z: 0.08 });
    b.box(o.w * 0.9, 0.006, 0.01, { color: p.accent, mat: Mat.Glow, y: o.h * 0.8 - 0.006, z: 0.155, ...DET });
    if (o.glyphs) this.sign(rc, { w: Math.min(o.w * 0.7, 0.6), h: 0.07, kind: 'board', n: o.glyphs, color: o.color }, 0, o.h * 0.82, 0.02);
  }

  /** Grand entrance (local facade): canopy / columns / porch for prestige buildings (skipped at LOD1). */
  portico(rc: RC, w: number, h: number): void {
    if (!rc.lo) this.drawPortico(rc, w, h);
  }

  protected drawPortico(rc: RC, w: number, h: number): void {
    const { b, p } = rc;
    b.box(w, 0.03, 0.22, { color: p.trim, y: h, z: 0.11 });
    columns(b, 2, w - 0.06, h - G, 0.018, 0.2, p.trim, G, true);
    b.box(w * 0.8, 0.008, 0.012, { color: p.accent, mat: Mat.Glow, y: h - 0.008, z: 0.215, ...DET });
  }

  /** Signage (local, facing +Z). */
  sign(rc: RC, o: SignOpts, x: number, y: number, z: number): void {
    const { b, p } = rc;
    const col = o.color ?? p.accent;
    switch (o.kind) {
      case 'board':
        b.box(o.w + 0.03, o.h + 0.03, 0.02, { color: p.dark, paint: false, x, y: y - 0.015, z });
        glyphs(b, o.w, o.h * 0.8, o.n ?? 4, rc.seed, { color: col, mat: Mat.Glow, x, y: y + o.h * 0.1, z: z + 0.012, paint: false });
        break;
      case 'blade':
        bladeSign(b, x, y, z + 0.06, o.h, col, Mat.Glow, o.w);
        break;
      case 'screen':
        b.box(o.w + 0.03, o.h + 0.03, 0.025, { color: 0x15171c, mat: Mat.Metal, paint: false, x, y: y - 0.015, z });
        b.panel(o.w, o.h, { color: 0xffffff, mat: Mat.Screen, paint: false, x, y, z: z + 0.014 });
        break;
      case 'holo':
        b.box(o.w * 0.9, 0.02, 0.05, { color: 0x2a2e38, mat: Mat.Metal, paint: false, x, y, z });
        b.panel(o.w, o.h, { color: col, mat: Mat.Holo, paint: false, x, y: y + 0.03, z, both: true });
        break;
      case 'roof':
        b.box(0.02, o.h * 0.5, 0.02, { color: p.metal, x: x - o.w * 0.35, y, z, ...DET });
        b.box(0.02, o.h * 0.5, 0.02, { color: p.metal, x: x + o.w * 0.35, y, z, ...DET });
        glyphs(b, o.w, o.h * 0.6, o.n ?? 5, rc.seed + 7, { color: col, mat: Mat.Glow, x, y: y + o.h * 0.4, z, paint: false });
        break;
      case 'marquee':
        b.box(o.w, o.h, 0.18, { color: p.dark, paint: false, x, y, z: z + 0.09, top: p.trim });
        b.panel(o.w * 0.92, o.h * 0.6, { color: col, mat: Mat.Glow, paint: false, x, y: y + o.h * 0.2, z: z + 0.182 });
        b.box(o.w + 0.02, 0.012, 0.2, { color: 0xffe9a0, mat: Mat.Light, paint: false, x, y: y - 0.012, z: z + 0.1 });
        break;
    }
  }

  /** Accent colour helper (neon cycling for multi-sign facades). */
  neon(rc: RC, i: number): number {
    const a = rc.st.accents;
    return a[(rc.seed + i) % a.length];
  }

  // ───────────────────────────────────────────── shared small helpers for subclasses

  protected dark(c: number, f = 0.75): number {
    return shade(c, f);
  }
  protected light(c: number, t = 0.25): number {
    return mix(c, 0xffffff, t);
  }
}

export { DET };
