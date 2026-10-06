/**
 * OWNER: roads-props.
 * RoadBuilder — bakes the geometry of one road tile into a GeoWriter (merged chunk geometry, shared building
 * material). Uses render/roads/lanes.ts for every position so traffic and asphalt always agree.
 *
 * Anatomy per kind (all halves run node → edge midpoint, see lanes.ts):
 *   Path       sandstone paving with darker stepping stones, stone edging, garden bollard lights; boardwalk on water
 *   Street     sidewalks · kerb band · asphalt · dashed centre line · crosswalks + stop lines + traffic lights at
 *              junctions · street lamps with warm light pools · cul-de-sacs at dead ends
 *   Avenue     4 lanes, raised planted median with trees (instanced, they sway), double-arm median lamps, lane
 *              dividers, roundabouts with a planted island at junctions
 *   Highway    raised deck slab, 6 lanes, jersey barriers, edge + centre lines, sodium mast lamps, sign gantries,
 *              interchange plates, crash cushions at dead ends
 *   Maglev     white guideway on pylons, glowing cyan rails, under-glow strips at night, buffer stops
 *   Hyperloop  twin metal tubes on Y-pylons with glowing rings and night light lines, junction pods / terminals
 *   Bridges    any ground road on a water tile: girder deck, railings with lights, piers down to the seabed,
 *              abutments; ramps between terraces get retaining walls (skirts)
 *
 * Layers are stacked a few millimetres apart (sidewalk < kerb < asphalt < light pool < markings) so nothing
 * z-fights; overlapping pieces on the same layer share colour so overlaps are invisible.
 * Mixed-kind links taper every layer to the narrower road over the outer half (TAPER_START → edge).
 */
import { Vector3 } from 'three';
import { Mat } from '../../content/kit';
import { hash3, hashFloat } from '../../core/rng';
import { RoadKind, TileFlag } from '../../core/types';
import type { Planet } from '../../world/planet';
import { InstState } from '../materials';
import { GeoWriter, lin, type Lin } from './GeoWriter';
import type { GlowWriter } from './glow';
import {
  halfSegment,
  linkedNeighbours,
  newHalfSegment,
  pointOnHalf,
  roadSpec,
  sameClass,
  smoothRamp,
  type HalfSegment,
  type RoadSpec,
} from './lanes';

// ───────────────────────────────────────────────────────────── palette (linear)
const C = {
  asphalt: lin(0x43464d),
  asphaltAve: lin(0x3e4148),
  asphaltHwy: lin(0x393b41),
  walk: lin(0xbcbab2),
  walkAve: lin(0xc7c0b2),
  kerb: lin(0xe4e2da),
  white: lin(0xf2f0e8),
  yellow: lin(0xf0c246),
  pathPave: lin(0xd8caa8),
  pathStone: lin(0xbfae8a),
  pathStone2: lin(0xe6dcc2),
  pathEdge: lin(0x9a8c74),
  wood: lin(0x9c7048),
  woodDark: lin(0x6e4c30),
  grass: lin(0x5b9a45),
  grassDark: lin(0x4a8238),
  concrete: lin(0xa7a8aa),
  concreteDark: lin(0x8e9093),
  wall: lin(0xb4afa3),
  rail2: lin(0x8c939c),
  barrier: lin(0xdcdbd5),
  pole: lin(0x3b4049),
  poleLight: lin(0x9aa2ad),
  lampWarm: lin(0xffe2ac),
  lampWhite: lin(0xfff3dc),
  lampSodium: lin(0xffb661),
  lampGarden: lin(0xffd38a),
  signal: lin(0x23262c),
  red: lin(0xff3b30),
  amber: lin(0xffb020),
  green: lin(0x38e070),
  dim: lin(0x3a3d42),
  gantry: lin(0xa4abb4),
  sign: lin(0x1e7a48),
  chevron: lin(0xff8a2a),
  guide: lin(0xe9ebef),
  guideTop: lin(0xd2d6dc),
  rail: lin(0x45e3ff),
  railNight: lin(0x7fdcff),
  pylon: lin(0xd0d4da),
  tube: lin(0xe3e8ef),
  tubeRing: lin(0xa48bff),
  tubeLine: lin(0xa9dcff),
  pod: lin(0xeef1f6),
  bufferRed: lin(0xff4040),
};

// ───────────────────────────────────────────────────────────── layer heights (relative to driving surface)
const D_SIDE = -0.01;
const D_KERB = -0.005;
const D_ASPH = 0;
const D_POOL = 0.004;
const D_MARK = 0.008;
/** taper to a narrower neighbour starts here (fraction of the half) */
const TAPER_START = 0.45;

/** Where a road tile's trees go (median / roundabout islands): px,py,pz, ux,uy,uz, scale, seed. */
export interface RoadBuildOut {
  w: GeoWriter;
  /** additive night glow (light pools, lamp halos) */
  glow: GlowWriter;
  trees: number[];
}

// ───────────────────────────────────────────────────────────── scratch
const KS: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
const SEGS: HalfSegment[] = [0, 1, 2, 3, 4, 5].map(() => newHalfSegment());
const MOUTH = new Float32Array(6);
const MARK0 = new Float32Array(6);
const ST = new Float32Array(16);
const P0 = new Vector3();
const P1 = new Vector3();
const P2 = new Vector3();
const P3 = new Vector3();
const Q0 = new Vector3();
const Q1 = new Vector3();
const UP = new Vector3();
const E1 = new Vector3();
const E2 = new Vector3();
const NODE = new Vector3();
const TMP = new Vector3();
const TMP2 = new Vector3();
/** per-feature frame written by frameAt (never the node frame) */
const FUP = new Vector3();
const FWD = new Vector3();
const RIGHT = new Vector3();
const TUP = new Vector3();
const DIR = new Vector3();
const NEG = new Vector3();

interface Taper {
  outer: number;
  kerb: number;
  car: number;
}
const TAPERS: Taper[] = [0, 1, 2, 3, 4, 5].map(() => ({ outer: 0, kerb: 0, car: 0 }));

/** Build context for the tile currently being baked. */
const ctx = {
  planet: null as unknown as Planet,
  w: null as unknown as GeoWriter,
  glow: null as unknown as GlowWriter,
  trees: null as unknown as number[],
  t: 0,
  kind: 0 as RoadKind,
  spec: null as unknown as RoadSpec,
  n: 0,
  /** 'dead' (0–1 links) · 'straight' (2, mitred) · 'bend' (2) · 'junction' (3+) */
  shape: 'dead' as 'dead' | 'straight' | 'bend' | 'junction',
  water: false,
  ground: 0,
  deck: 0,
  R: 0,
};

function flagState(f: number): number {
  if (f & TileFlag.Burning) return InstState.Burning;
  if (f & TileFlag.Goo) return InstState.Goo;
  if (f & TileFlag.Frozen) return InstState.Frozen;
  if (f & TileFlag.Irradiated) return InstState.Irradiated;
  if (f & TileFlag.Blessed) return InstState.Blessed;
  if (f & TileFlag.Scorched) return InstState.Dark;
  return InstState.Normal;
}

// ───────────────────────────────────────────────────────────── helpers

/** Lateral offset at s for a layer that tapers from `own` to `tgt` after TAPER_START. */
function latAt(s: number, own: number, tgt: number): number {
  if (s <= TAPER_START || own === tgt) return own;
  return own + (tgt - own) * smoothRamp((s - TAPER_START) / (1 - TAPER_START));
}

/** Collect the s stations of a half (ramps / tapers need intermediate rows). Returns the count. */
function stations(seg: HalfSegment, tp: Taper, spec: RoadSpec): number {
  let n = 0;
  ST[n++] = 0;
  const ramp = Math.abs(seg.edgeH - seg.nodeH) > 0.004;
  const taper = tp.outer < spec.outer - 1e-4 || tp.car < spec.carriage - 1e-4;
  if (ramp && !taper) {
    ST[n++] = 0.25;
    ST[n++] = 0.5;
    ST[n++] = 0.75;
  } else if (ramp && taper) {
    ST[n++] = 0.25;
    ST[n++] = TAPER_START;
    ST[n++] = 0.62;
    ST[n++] = 0.8;
  } else if (taper) {
    ST[n++] = TAPER_START;
    ST[n++] = 0.65;
    ST[n++] = 0.84;
  }
  ST[n++] = 1;
  return n;
}
let stCount = 0;

/**
 * Flat ribbon on a half between s0..s1, lateral from a (own→tgt) to b (own→tgt), at height dz above the
 * driving surface. Follows ramps, mitres and tapers.
 */
function ribbon(seg: HalfSegment, s0: number, s1: number, a: number, at: number, b: number, bt: number, dz: number, col: Lin, mat: number): void {
  if (s1 - s0 < 1e-4) return;
  const p = ctx.planet;
  pointOnHalf(p, seg, s0, latAt(s0, a, at), P0, dz);
  pointOnHalf(p, seg, s0, latAt(s0, b, bt), P1, dz);
  for (let i = 0; i <= stCount; i++) {
    const s = i < stCount ? ST[i] : s1;
    if (i < stCount && (s <= s0 + 1e-4 || s >= s1 - 1e-4)) continue;
    pointOnHalf(p, seg, s, latAt(s, b, bt), P2, dz);
    pointOnHalf(p, seg, s, latAt(s, a, at), P3, dz);
    ctx.w.quad(P0, P1, P2, P3, seg.nodeDir, col, mat);
    P0.copy(P3);
    P1.copy(P2);
    if (i === stCount) break;
  }
}

/**
 * Raised strip (kerb, median, barrier, guideway): top + both vertical sides (+ optional bottom & end caps)
 * between lateral a..b and heights dz0..dz1.
 */
function raised(seg: HalfSegment, s0: number, s1: number, a: number, at: number, b: number, bt: number, dz0: number, dz1: number, top: Lin, side: Lin, mat: number, o: { bottom?: boolean; cap0?: boolean; cap1?: boolean; topMat?: number; sideMat?: number } = {}): void {
  if (s1 - s0 < 1e-4) return;
  const p = ctx.planet;
  const w = ctx.w;
  const tmat = o.topMat ?? mat;
  const smat = o.sideMat ?? mat;
  let sPrev = s0;
  const doCap = (s: number, dirSign: number) => {
    pointOnHalf(p, seg, s, latAt(s, a, at), Q0, dz0);
    pointOnHalf(p, seg, s, latAt(s, b, bt), Q1, dz0);
    pointOnHalf(p, seg, s, latAt(s, b, bt), P2, dz1);
    pointOnHalf(p, seg, s, latAt(s, a, at), P3, dz1);
    NEG.copy(seg.fwd).multiplyScalar(dirSign);
    w.quad(Q0, Q1, P2, P3, NEG, side, smat);
  };
  if (o.cap0) doCap(s0, -1);
  for (let i = 0; i <= stCount; i++) {
    const s = i < stCount ? ST[i] : s1;
    if (i < stCount && (s <= s0 + 1e-4 || s >= s1 - 1e-4)) continue;
    // top
    pointOnHalf(p, seg, sPrev, latAt(sPrev, a, at), P0, dz1);
    pointOnHalf(p, seg, sPrev, latAt(sPrev, b, bt), P1, dz1);
    pointOnHalf(p, seg, s, latAt(s, b, bt), P2, dz1);
    pointOnHalf(p, seg, s, latAt(s, a, at), P3, dz1);
    w.quad(P0, P1, P2, P3, seg.nodeDir, top, tmat);
    // side b (right, if b > a)
    pointOnHalf(p, seg, sPrev, latAt(sPrev, b, bt), Q0, dz0);
    pointOnHalf(p, seg, s, latAt(s, b, bt), Q1, dz0);
    TMP.copy(seg.rightNode).multiplyScalar(b >= a ? 1 : -1);
    w.quad(Q0, Q1, P2, P1, TMP, side, smat);
    // side a
    pointOnHalf(p, seg, sPrev, latAt(sPrev, a, at), Q0, dz0);
    pointOnHalf(p, seg, s, latAt(s, a, at), Q1, dz0);
    TMP.negate();
    w.quad(Q0, Q1, P3, P0, TMP, side, smat);
    if (o.bottom) {
      pointOnHalf(p, seg, sPrev, latAt(sPrev, b, bt), P1, dz0);
      pointOnHalf(p, seg, s, latAt(s, b, bt), P2, dz0);
      NEG.copy(seg.nodeDir).negate();
      w.quad(Q0, P1, P2, Q1, NEG, side, smat);
    }
    sPrev = s;
    if (i === stCount) break;
  }
  if (o.cap1) doCap(s1, 1);
}

/** Local frame at s on a half (UP radial, RIGHT cross-section, FWD travel) + the point at lateral/dz into out. */
function frameAt(seg: HalfSegment, s: number, lateral: number, dz: number, out: Vector3): void {
  pointOnHalf(ctx.planet, seg, s, lateral, out, dz, FWD);
  FUP.copy(out).normalize();
  RIGHT.crossVectors(FUP, FWD).normalize();
  FWD.crossVectors(RIGHT, FUP).normalize();
}

/** Repeated dashes along a half at lateral `lat`, measured from the edge so patterns continue across tiles. */
function dashes(seg: HalfSegment, sFrom: number, sTo: number, lat: number, width: number, dash: number, gap: number, col: Lin): void {
  const L = Math.max(0.2, seg.length);
  const period = dash + gap;
  for (let d = gap / 2; d < L; d += period) {
    const e1 = 1 - d / L;
    const e0 = 1 - (d + dash) / L;
    const s0 = Math.max(sFrom, e0), s1 = Math.min(sTo, e1);
    if (s1 - s0 < 0.02) continue;
    ribbon(seg, s0, s1, lat - width / 2, lat - width / 2, lat + width / 2, lat + width / 2, D_MARK, col, Mat.Plain);
  }
}

/** Zebra crosswalk at s0 (world length `len`) across the carriage. */
function crosswalk(seg: HalfSegment, s0: number, car: number, len: number): void {
  const L = Math.max(0.2, seg.length);
  const s1 = Math.min(0.98, s0 + len / L);
  const n = Math.max(3, Math.floor((car * 2) / 0.062));
  const step = (car * 2 - 0.03) / n;
  for (let i = 0; i < n; i++) {
    const c = -car + 0.015 + step * (i + 0.5);
    ribbon(seg, s0, s1, c - step * 0.28, c - step * 0.28, c + step * 0.28, c + step * 0.28, D_MARK, C.white, Mat.Plain);
  }
}

/** Night light pool on the road surface (additive glow layer — invisible by day). */
const POOL_WARM = 0xa8743c;
const POOL_WHITE = 0x9a8c74;
const POOL_SODIUM = 0xb0682a;
const POOL_COLD = 0x5a8aa0;
function lightPool(seg: HalfSegment, s: number, lat: number, r: number, hex = POOL_WARM): void {
  frameAt(seg, s, lat, D_POOL, P0);
  ctx.glow.pool(P0, RIGHT, FWD, r, hex);
}

/** Street lamp: pole on the sidewalk at `lat`, arm reaching `reach` toward the road (negative = toward −lateral). */
function lamp(seg: HalfSegment, s: number, lat: number, height: number, reach: number, head: Lin, double = false, haloHex = 0x8a7050): void {
  const w = ctx.w;
  frameAt(seg, s, lat, D_SIDE, P0);
  // pole (square, tapered look via two boxes)
  w.box(P0, FUP, RIGHT, FWD, 0.018, 0.05, 0.018, C.pole, Mat.Metal);
  w.box(P0, FUP, RIGHT, FWD, 0.011, height, 0.011, C.pole, Mat.Metal);
  const arms = double ? [-1, 1] : [Math.sign(reach) || -1];
  const r = Math.abs(reach);
  for (const sg of arms) {
    // arm
    P1.copy(P0).addScaledVector(FUP, height - 0.012);
    P2.copy(P1).addScaledVector(RIGHT, sg * r);
    TMP2.copy(FWD);
    w.beam(P1, P2, FUP, TMP2, 0.01, 0.01, C.pole, Mat.Metal);
    // head: dark housing + glowing underside
    P3.copy(P2).addScaledVector(FUP, -0.012);
    w.box(P3, FUP, RIGHT, FWD, 0.07, 0.018, 0.034, C.pole, Mat.Metal, { top: C.pole });
    P3.addScaledVector(FUP, -0.004);
    w.box(P3, FUP, RIGHT, FWD, 0.06, 0.006, 0.028, head, Mat.Light, { bottom: true });
    ctx.glow.halo(P3, 0.075, haloHex);
  }
}

/** Short garden bollard light (paths, plazas). */
function bollard(seg: HalfSegment, s: number, lat: number): void {
  frameAt(seg, s, lat, D_SIDE, P0);
  ctx.w.box(P0, FUP, RIGHT, FWD, 0.022, 0.05, 0.022, C.pole, Mat.Metal);
  P0.addScaledVector(FUP, 0.05);
  ctx.w.box(P0, FUP, RIGHT, FWD, 0.026, 0.018, 0.026, C.lampGarden, Mat.Light, { top: C.pole });
  P0.addScaledVector(FUP, 0.009);
  ctx.glow.halo(P0, 0.05, 0x7a5a30);
  P0.addScaledVector(FUP, -0.059 + D_POOL - D_SIDE);
  ctx.glow.pool(P0, RIGHT, FWD, 0.12, 0x6a4a24);
}

/** Traffic signal facing traffic arriving from the edge (head looks toward +fwd). */
function signal(seg: HalfSegment, s: number, lat: number, lit: number): void {
  const w = ctx.w;
  frameAt(seg, s, lat, D_SIDE, P0);
  w.box(P0, FUP, RIGHT, FWD, 0.012, 0.2, 0.012, C.pole, Mat.Metal);
  P1.copy(P0).addScaledVector(FUP, 0.135);
  w.box(P1, FUP, RIGHT, FWD, 0.028, 0.072, 0.022, C.signal, Mat.Plain);
  const cols = [C.red, C.amber, C.green];
  for (let i = 0; i < 3; i++) {
    P2.copy(P1).addScaledVector(FUP, 0.054 - i * 0.021).addScaledVector(FWD, 0.0115);
    w.box(P2, FUP, RIGHT, FWD, 0.014, 0.013, 0.004, i === lit ? cols[i] : C.dim, i === lit ? Mat.Glow : Mat.Plain);
  }
}

/** Retaining walls under a ramp on land (only where the surface rises above the ground). */
function skirts(seg: HalfSegment, outer: number, outerT: number, ground: number): void {
  const p = ctx.planet;
  const R = ctx.R;
  const w = ctx.w;
  let sPrev = 0;
  for (let i = 1; i < stCount; i++) {
    const s = ST[i];
    for (const sg of [-1, 1]) {
      const l0 = sg * latAt(sPrev, outer, outerT), l1 = sg * latAt(s, outer, outerT);
      pointOnHalf(p, seg, sPrev, l0, P0, D_SIDE);
      pointOnHalf(p, seg, s, l1, P1, D_SIDE);
      P3.copy(P0).normalize().multiplyScalar(R + ground);
      P2.copy(P1).normalize().multiplyScalar(R + ground);
      TMP.copy(seg.rightNode).multiplyScalar(sg);
      w.quad(P3, P2, P1, P0, TMP, C.wall, Mat.Plain);
    }
    sPrev = s;
  }
}

/** Abutment wall closing the gap under a half that ends high above its ground at the edge. */
function abutment(seg: HalfSegment, outer: number, ground: number): void {
  const p = ctx.planet;
  const R = ctx.R;
  pointOnHalf(p, seg, 1, -outer, P0, D_SIDE);
  pointOnHalf(p, seg, 1, outer, P1, D_SIDE);
  P2.copy(P1).normalize().multiplyScalar(R + ground);
  P3.copy(P0).normalize().multiplyScalar(R + ground);
  ctx.w.quad(P3, P2, P1, P0, seg.fwd, C.wall, Mat.Plain);
}

/** Pier from the seabed / ground up to just under the deck at the node. */
function pier(radius: number, bottom: number, top: number, lat: number, col: Lin): void {
  const R = ctx.R;
  P0.copy(UP).multiplyScalar(R + bottom).addScaledVector(E1, lat);
  if (top - bottom < 0.02) return;
  ctx.w.prism(P0, UP, E1, E2, radius, radius * 0.85, top - bottom, 6, col, Mat.Plain, true);
}

// ───────────────────────────────────────────────────────────── per-tile entry

/**
 * Bake road tile t into out.w (and tree spots into out.trees). Never throws on odd data (unlinked tiles,
 * pentagons, mixed kinds); unknown kinds fall back to streets.
 */
export function buildRoadTile(planet: Planet, t: number, out: RoadBuildOut): void {
  const kind = planet.road[t] as RoadKind;
  if (!kind) return;
  const spec = roadSpec(kind);
  ctx.planet = planet;
  ctx.w = out.w;
  ctx.glow = out.glow;
  ctx.trees = out.trees;
  ctx.t = t;
  ctx.kind = kind;
  ctx.spec = spec;
  ctx.R = planet.radius;
  ctx.water = planet.isWater(t);
  ctx.ground = planet.heightOf(t);
  const n = Math.min(6, linkedNeighbours(planet, t, KS));
  ctx.n = n;
  for (let i = 0; i < n; i++) halfSegment(planet, t, KS[i], SEGS[i]);
  // node frame
  const c = planet.grid.center;
  UP.set(c[t * 3], c[t * 3 + 1], c[t * 3 + 2]);
  if (n > 0) E1.copy(SEGS[0].fwd);
  else {
    E1.set(0, 1, 0).addScaledVector(UP, -UP.y);
    if (E1.lengthSq() < 1e-6) E1.set(1, 0, 0).addScaledVector(UP, -UP.x);
    E1.normalize();
  }
  E2.crossVectors(UP, E1).normalize();
  ctx.deck = n > 0 ? SEGS[0].nodeH : planet.heightOf(t) + spec.lift;
  if (n === 0 && ctx.water) ctx.deck = Math.max(planet.heightOf(t), planet.waterHeight + 0.3) + spec.lift;
  NODE.copy(UP).multiplyScalar(ctx.R + ctx.deck);
  ctx.shape = n <= 1 ? 'dead' : n === 2 ? (SEGS[0].mitred ? 'straight' : 'bend') : 'junction';
  out.w.state = flagState(planet.flags[t]);

  // per-half tapers (to a narrower same-class neighbour) and junction mouths
  for (let i = 0; i < n; i++) {
    const seg = SEGS[i];
    const nk = planet.road[seg.nbr];
    const tp = TAPERS[i];
    if (sameClass(kind, nk) && nk !== kind) {
      const o = roadSpec(nk);
      tp.outer = Math.min(spec.outer, o.outer);
      tp.kerb = Math.min(spec.kerb, o.kerb);
      tp.car = Math.min(spec.carriage, o.carriage);
    } else {
      tp.outer = spec.outer;
      tp.kerb = spec.kerb;
      tp.car = spec.carriage;
    }
    // smallest angle to another link
    let minA = Math.PI;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const a = Math.acos(Math.max(-1, Math.min(1, seg.fwd.dot(SEGS[j].fwd))));
      if (a < minA) minA = a;
    }
    const half = Math.max(0.2, minA / 2);
    MOUTH[i] = Math.min(seg.length * 0.6, Math.max(spec.carriage + 0.03, spec.carriage / Math.tan(half) + 0.02));
    MARK0[i] = ctx.shape === 'straight' ? 0 : ctx.shape === 'dead' ? 0.42 : ctx.shape === 'bend' ? Math.min(0.5, (spec.carriage * 0.75) / Math.tan(half) + 0.02) : 0;
  }

  try {
    switch (kind) {
      case RoadKind.Path:
        buildPath();
        break;
      case RoadKind.Avenue:
        buildAvenue();
        break;
      case RoadKind.Highway:
        buildHighway();
        break;
      case RoadKind.Maglev:
        buildMaglev();
        break;
      case RoadKind.Hyperloop:
        buildHyperloop();
        break;
      default:
        buildStreet();
    }
  } finally {
    out.w.state = 0;
  }
}

// ───────────────────────────────────────────────────────────── shared ground-road pieces

/** Node discs for bends / junctions / dead ends (round joins of every layer). */
function nodeDiscs(outer: number, kerb: number, car: number, walk: Lin, asphalt: Lin): void {
  const w = ctx.w;
  P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_SIDE);
  w.disc(P0, UP, E1, E2, outer, 16, walk, Mat.Plain);
  P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_KERB);
  w.disc(P0, UP, E1, E2, kerb, 16, C.kerb, Mat.Plain);
  P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_ASPH);
  w.disc(P0, UP, E1, E2, car, 16, asphalt, Mat.Plain);
}

/** Bridge / ramp structure common to ground roads. */
function groundStructure(seg: HalfSegment, i: number, outer: number, railH: number, wood = false): void {
  const p = ctx.planet;
  const tp = TAPERS[i];
  const outerT = tp.outer;
  if (ctx.water) {
    // girder deck under the whole half + railings
    raised(seg, 0, 1, -outer - 0.012, -outerT - 0.012, outer + 0.012, outerT + 0.012, wood ? -0.05 : -0.1, D_SIDE - 0.001, wood ? C.wood : C.concrete, wood ? C.woodDark : C.concreteDark, Mat.Plain, { bottom: true });
    for (const sg of [-1, 1]) {
      const a = sg * (outer - 0.004), at = sg * (outerT - 0.004);
      raised(seg, 0, 1, a - sg * 0.012, at - sg * 0.012, a, at, D_SIDE, railH, wood ? C.wood : C.poleLight, wood ? C.woodDark : C.rail2, Mat.Plain);
    }
    // railing lights every half at s=0.5 (both sides) — the bridge necklace at night
    for (const sg of [-1, 1]) {
      frameAt(seg, 0.5, sg * (outer - 0.01), railH, P0);
      ctx.w.box(P0, FUP, RIGHT, FWD, 0.02, 0.016, 0.02, wood ? C.lampGarden : C.lampWhite, Mat.Light);
      P0.addScaledVector(FUP, 0.008);
      ctx.glow.halo(P0, 0.06, wood ? 0x7a5a30 : 0x7a7468);
    }
  } else {
    const ground = ctx.ground;
    // where the half rises above the ground (ramps up to a terrace or a bridge): embankment walls for gentle
    // rises, an elevated viaduct (girder, railings, pillars) for steep climbs
    const top = Math.max(seg.nodeH, seg.edgeH) - ctx.spec.lift;
    const rise = top - ground;
    if (rise > 0.36) {
      raised(seg, 0, 1, -outer - 0.012, -outerT - 0.012, outer + 0.012, outerT + 0.012, -0.1, D_SIDE - 0.001, C.concrete, C.concreteDark, Mat.Plain, { bottom: true });
      for (const sg of [-1, 1]) {
        const a = sg * (outer - 0.004), at = sg * (outerT - 0.004);
        raised(seg, 0.2, 1, a - sg * 0.012, at - sg * 0.012, a, at, D_SIDE, railH, C.poleLight, C.rail2, Mat.Plain);
      }
      for (const ps of [0.5, 0.82]) {
        frameAt(seg, ps, 0, D_SIDE - 0.1, P0);
        const h = P0.length() - ctx.R - ground + 0.04;
        if (h < 0.1) continue;
        P1.copy(P0).addScaledVector(FUP, -h);
        ctx.w.prism(P1, FUP, RIGHT, FWD, 0.05, 0.04, h, 6, C.concreteDark, Mat.Plain, false);
      }
    } else if (rise > 0.05) {
      skirts(seg, outer, outerT, ground - 0.04);
      const nb = seg.nbr;
      if (p.isWater(nb) || seg.edgeH - ctx.spec.lift - ground > 0.12) abutment(seg, outerT, ground - 0.3);
    }
  }
}

/** Piers for a water tile (one or two columns down to the seabed). */
function groundPiers(cols: number, spread: number, wood = false): void {
  if (!ctx.water) return;
  const bottom = ctx.ground - 0.08;
  const top = ctx.deck + (wood ? -0.05 : -0.1) - 0.002;
  const r = wood ? 0.022 : cols > 1 ? 0.06 : 0.075;
  if (cols === 1) pier(r, bottom, top, 0, wood ? C.woodDark : C.concreteDark);
  else for (const sg of [-1, 1]) pier(r, bottom, top, sg * spread, wood ? C.woodDark : C.concreteDark);
  if (!wood) {
    // pier cap across the deck
    P0.copy(UP).multiplyScalar(ctx.R + top - 0.06);
    ctx.w.box(P0, UP, E2, E1, cols > 1 ? spread * 2 + 0.2 : 0.3, 0.06, 0.14, C.concrete, Mat.Plain);
  }
}

// ───────────────────────────────────────────────────────────── Path

function buildPath(): void {
  const s = ctx.spec;
  const w = ctx.w;
  const wood = ctx.water;
  for (let i = 0; i < ctx.n; i++) {
    const seg = SEGS[i];
    const tp = TAPERS[i];
    stCount = stations(seg, tp, s);
    groundStructure(seg, i, s.outer, 0.06, true);
    if (wood) {
      // boardwalk planks
      ribbon(seg, 0, 1, -s.outer, -tp.outer, s.outer, tp.outer, D_ASPH, C.wood, Mat.Plain);
      const L = Math.max(0.2, seg.length);
      for (let d = 0.06; d < L - 0.02; d += 0.11) {
        const s0 = 1 - (d + 0.012) / L, s1 = 1 - d / L;
        ribbon(seg, s0, s1, -s.outer + 0.01, -s.outer + 0.01, s.outer - 0.01, s.outer - 0.01, D_MARK, C.woodDark, Mat.Plain);
      }
      continue;
    }
    ribbon(seg, 0, 1, -s.outer, -tp.outer, s.outer, tp.outer, D_SIDE, C.pathEdge, Mat.Plain);
    ribbon(seg, 0, 1, -s.carriage, -tp.car, s.carriage, tp.car, D_ASPH, C.pathPave, Mat.Plain);
    // stepping stones (deterministic per tile/half)
    const L = Math.max(0.2, seg.length);
    let k = 0;
    for (let d = 0.05; d < L - 0.05; d += 0.13, k++) {
      const h = hashFloat(ctx.t, seg.k, k);
      const lat = (h - 0.5) * 0.08;
      const sz = 0.035 + h * 0.02;
      const s1 = 1 - d / L, s0 = 1 - (d + 0.075) / L;
      if (s0 < MARK0[i]) continue;
      ribbon(seg, s0, s1, lat - sz, lat - sz, lat + sz, lat + sz, D_POOL, h > 0.5 ? C.pathStone : C.pathStone2, Mat.Plain);
    }
    if (hashFloat(ctx.t, seg.k, 77) < 0.6) bollard(seg, 0.55, (i % 2 ? -1 : 1) * (s.outer + 0.03));
  }
  if (ctx.shape !== 'straight') {
    if (wood) {
      P0.copy(UP).multiplyScalar(ctx.R + ctx.deck);
      w.disc(P0, UP, E1, E2, ctx.shape === 'dead' ? 0.22 : s.outer, 12, C.wood, Mat.Plain);
    } else {
      const big = ctx.shape === 'dead';
      P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_SIDE);
      w.disc(P0, UP, E1, E2, big ? 0.26 : s.outer, 14, C.pathEdge, Mat.Plain);
      P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_ASPH);
      w.disc(P0, UP, E1, E2, big ? 0.225 : s.carriage, 14, C.pathPave, Mat.Plain);
      if (big) {
        // a little round plaza with a sundial-ish marker
        P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_POOL);
        w.disc(P0, UP, E1, E2, 0.12, 10, C.pathStone, Mat.Plain);
        P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_ASPH);
        w.prism(P0, UP, E1, E2, 0.03, 0.022, 0.07, 6, C.pathEdge, Mat.Plain, true, C.lampGarden, Mat.Light);
      }
    }
  }
  groundPiers(2, 0.1, true);
}

// ───────────────────────────────────────────────────────────── Street

function buildStreet(): void {
  const s = ctx.spec;
  const junction = ctx.shape === 'junction';
  for (let i = 0; i < ctx.n; i++) {
    const seg = SEGS[i];
    const tp = TAPERS[i];
    stCount = stations(seg, tp, s);
    groundStructure(seg, i, s.outer, 0.055);
    ribbon(seg, 0, 1, -s.outer, -tp.outer, s.outer, tp.outer, D_SIDE, C.walk, Mat.Plain);
    ribbon(seg, 0, 1, -s.kerb, -tp.kerb, s.kerb, tp.kerb, D_KERB, C.kerb, Mat.Plain);
    ribbon(seg, 0, 1, -s.carriage, -tp.car, s.carriage, tp.car, D_ASPH, C.asphalt, Mat.Plain);
    const tapered = tp.car < s.carriage - 1e-4;
    const markEnd = tapered ? TAPER_START : 1;
    let mark0 = MARK0[i];
    if (junction) {
      const m = MOUTH[i];
      const L = Math.max(0.2, seg.length);
      crosswalk(seg, m, s.carriage, 0.1);
      // stop line for inbound traffic (left of outbound travel)
      const sl = Math.min(0.97, m + 0.125 / L);
      ribbon(seg, sl, Math.min(0.99, sl + 0.016 / L), -s.carriage + 0.012, -s.carriage + 0.012, -0.012, -0.012, D_MARK, C.white, Mat.Plain);
      signal(seg, Math.min(0.95, m + 0.14 / L), -(s.kerb + 0.05), hash3(ctx.t, seg.k, 5) % 3);
      mark0 = Math.min(0.95, m + 0.16 / L);
    }
    if (markEnd > mark0) dashes(seg, mark0, markEnd, 0, 0.016, 0.1, 0.08, ctx.water ? C.white : C.yellow);
    // lamp on the right sidewalk, arm over the road, warm pool on the outbound lane
    const ls = junction ? Math.min(0.9, MOUTH[i] + 0.3 / Math.max(0.2, seg.length)) : 0.55;
    if (ls < 0.92 && !(tapered && ls > TAPER_START)) {
      lamp(seg, ls, s.outer - 0.045, 0.3, -0.13, C.lampWarm);
      lightPool(seg, ls, s.outer - 0.045 - 0.12, 0.24);
    }
  }
  if (ctx.shape === 'dead') {
    // cul-de-sac turning circle
    nodeDiscs(0.46, 0.356, 0.34, C.walk, C.asphalt);
    if (ctx.n === 0) {
      P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_ASPH);
      ctx.w.prism(P0, UP, E1, E2, 0.1, 0.1, 0.022, 12, C.kerb, Mat.Plain, true, C.grass);
    }
  } else if (ctx.shape !== 'straight') nodeDiscs(s.outer, s.kerb, s.carriage, C.walk, C.asphalt);
  groundPiers(1, 0);
}

// ───────────────────────────────────────────────────────────── Avenue

const ROUNDABOUT = 0.48;

function buildAvenue(): void {
  const s = ctx.spec;
  const junction = ctx.shape === 'junction';
  const med = s.median;
  for (let i = 0; i < ctx.n; i++) {
    const seg = SEGS[i];
    const tp = TAPERS[i];
    const L = Math.max(0.2, seg.length);
    stCount = stations(seg, tp, s);
    groundStructure(seg, i, s.outer, 0.055);
    ribbon(seg, 0, 1, -s.outer, -tp.outer, s.outer, tp.outer, D_SIDE, C.walkAve, Mat.Plain);
    ribbon(seg, 0, 1, -s.kerb, -tp.kerb, s.kerb, tp.kerb, D_KERB, C.kerb, Mat.Plain);
    ribbon(seg, 0, 1, -s.carriage, -tp.car, s.carriage, tp.car, D_ASPH, C.asphaltAve, Mat.Plain);
    const tapered = tp.car < s.carriage - 1e-4;
    const mouth = junction ? Math.min(L * 0.62, Math.max(MOUTH[i], ROUNDABOUT + 0.06)) : 0;
    if (junction) crosswalk(seg, mouth, s.carriage, 0.1);
    // planted median
    const m0 = junction ? Math.min(0.9, mouth + 0.16 / L) : ctx.shape === 'straight' ? 0 : ctx.shape === 'bend' ? Math.min(0.6, MARK0[i] + 0.06) : 0.52;
    const m1 = tapered ? TAPER_START : 1;
    if (m1 - m0 > 0.06) {
      raised(seg, m0, m1, -med, -med, med, med, D_ASPH - 0.002, D_ASPH + 0.026, C.grass, C.kerb, Mat.Plain, { cap0: ctx.shape !== 'straight', cap1: tapered });
      // a tree in the median
      const ts = Math.min(m1 - 0.08, Math.max(m0 + 0.12, 0.62));
      if (ts > m0 + 0.06 && ts < m1 - 0.04) {
        pointOnHalf(ctx.planet, seg, ts, 0, P0, D_ASPH + 0.026);
        TUP.copy(P0).normalize();
        ctx.trees.push(P0.x, P0.y, P0.z, TUP.x, TUP.y, TUP.z, 0.62 + hashFloat(ctx.t, seg.k, 3) * 0.18, hash3(ctx.t, seg.k, 9));
      }
    }
    // lane dividers
    const mk0 = junction ? Math.min(0.95, mouth + 0.14 / L) : MARK0[i];
    const mk1 = tapered ? TAPER_START : 1;
    if (mk1 > mk0) {
      dashes(seg, mk0, mk1, 0.19, 0.012, 0.09, 0.09, C.white);
      dashes(seg, mk0, mk1, -0.19, 0.012, 0.09, 0.09, C.white);
      if (m1 - m0 <= 0.06) dashes(seg, mk0, mk1, 0, 0.016, 0.1, 0.08, C.yellow);
    }
    // double-arm lamp in the median (or on the sidewalk where there is no median)
    const lsMed = Math.max(m0 + 0.06, 0.24);
    if (m1 - m0 > 0.2 && lsMed < m1 - 0.05 && Math.abs(lsMed - 0.62) > 0.12) {
      lamp(seg, lsMed, 0, 0.36, 0.15, C.lampWhite, true, 0x8a8070);
      lightPool(seg, lsMed, 0.17, 0.24, POOL_WHITE);
      lightPool(seg, lsMed, -0.17, 0.24, POOL_WHITE);
    } else if (!tapered) {
      const ls = junction ? Math.min(0.9, mouth + 0.3 / L) : 0.5;
      if (ls < 0.92) {
        lamp(seg, ls, s.outer - 0.05, 0.34, -0.14, C.lampWhite, false, 0x8a8070);
        lightPool(seg, ls, s.outer - 0.19, 0.24, POOL_WHITE);
      }
    }
  }
  if (junction) {
    // roundabout with a planted island
    nodeDiscs(Math.min(ROUNDABOUT + 0.13, 0.7), ROUNDABOUT + 0.016, ROUNDABOUT, C.walkAve, C.asphaltAve);
    P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_ASPH);
    ctx.w.prism(P0, UP, E1, E2, 0.2, 0.2, 0.03, 16, C.kerb, Mat.Plain, true, C.grass);
    // dashed yield ring
    P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_MARK);
    for (let k = 0; k < 16; k += 2) {
      const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
      for (const [r0, r1] of [[0.33, 0.342]]) {
        P1.copy(P0).addScaledVector(E1, Math.cos(a0) * r0).addScaledVector(E2, Math.sin(a0) * r0);
        P2.copy(P0).addScaledVector(E1, Math.cos(a1) * r0).addScaledVector(E2, Math.sin(a1) * r0);
        P3.copy(P0).addScaledVector(E1, Math.cos(a1) * r1).addScaledVector(E2, Math.sin(a1) * r1);
        Q0.copy(P0).addScaledVector(E1, Math.cos(a0) * r1).addScaledVector(E2, Math.sin(a0) * r1);
        ctx.w.quad(P1, P2, P3, Q0, UP, C.white, Mat.Plain);
      }
    }
    P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_ASPH + 0.03);
    ctx.trees.push(P0.x, P0.y, P0.z, UP.x, UP.y, UP.z, 0.95, hash3(ctx.t, 1, 2));
    // island uplights
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      P1.copy(P0).addScaledVector(E1, Math.cos(a) * 0.15).addScaledVector(E2, Math.sin(a) * 0.15);
      ctx.w.box(P1, UP, E1, E2, 0.022, 0.02, 0.022, C.lampWhite, Mat.Light);
    }
  } else if (ctx.shape === 'dead') {
    nodeDiscs(0.54, 0.436, 0.42, C.walkAve, C.asphaltAve);
    P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_ASPH);
    ctx.w.prism(P0, UP, E1, E2, 0.16, 0.16, 0.03, 14, C.kerb, Mat.Plain, true, C.grass);
    P0.addScaledVector(UP, 0.03);
    ctx.trees.push(P0.x, P0.y, P0.z, UP.x, UP.y, UP.z, 0.8, hash3(ctx.t, 3, 4));
  } else if (ctx.shape === 'bend') nodeDiscs(s.outer, s.kerb, s.carriage, C.walkAve, C.asphaltAve);
  groundPiers(2, 0.2);
}

// ───────────────────────────────────────────────────────────── Highway

function buildHighway(): void {
  const s = ctx.spec;
  const w = ctx.w;
  const lift = s.lift;
  const junction = ctx.shape === 'junction';
  const slabBottom = ctx.water ? -0.13 : -(lift + 0.03);
  for (let i = 0; i < ctx.n; i++) {
    const seg = SEGS[i];
    const tp = TAPERS[i];
    const L = Math.max(0.2, seg.length);
    stCount = stations(seg, tp, s);
    const tapered = tp.car < s.carriage - 1e-4;
    // deck slab (sides reach the ground on land, a girder over water)
    raised(seg, 0, 1, -s.outer, -tp.outer, s.outer, tp.outer, slabBottom, D_SIDE, C.concrete, C.concreteDark, Mat.Plain, { bottom: ctx.water });
    if (!ctx.water) {
      const top = Math.max(seg.nodeH, seg.edgeH) - lift;
      if (top - ctx.ground > 0.05) skirts(seg, s.outer, tp.outer, ctx.ground - 0.04);
    }
    ribbon(seg, 0, 1, -s.carriage, -tp.car, s.carriage, tp.car, D_ASPH, C.asphaltHwy, Mat.Plain);
    const b0 = junction ? Math.min(0.9, MOUTH[i] + 0.02) : ctx.shape === 'bend' ? MARK0[i] : 0;
    // outer jersey barriers
    for (const sg of [-1, 1]) {
      const a = sg * (s.outer - 0.03), at = sg * (tp.outer - 0.03);
      const b = sg * (s.outer - 0.004), bt = sg * (tp.outer - 0.004);
      raised(seg, b0, 1, a, at, b, bt, D_ASPH, 0.05, C.barrier, C.barrier, Mat.Plain);
    }
    const mk0 = junction ? Math.min(0.95, MOUTH[i] + 0.1 / L) : MARK0[i];
    const mk1 = tapered ? TAPER_START : 1;
    if (mk1 > mk0 + 0.02) {
      // central barrier + yellow lines
      raised(seg, mk0, mk1, -0.022, -0.022, 0.022, 0.022, D_ASPH, 0.045, C.barrier, C.barrier, Mat.Plain, { cap0: ctx.shape !== 'straight', cap1: tapered });
      for (const sg of [-1, 1]) {
        ribbon(seg, mk0, mk1, sg * 0.036, sg * 0.036, sg * 0.046, sg * 0.046, D_MARK, C.yellow, Mat.Plain);
        ribbon(seg, mk0, mk1, sg * (s.carriage - 0.026), sg * (s.carriage - 0.026), sg * (s.carriage - 0.014), sg * (s.carriage - 0.014), D_MARK, C.white, Mat.Plain);
        dashes(seg, mk0, mk1, sg * 0.165, 0.011, 0.12, 0.1, C.white);
        dashes(seg, mk0, mk1, sg * 0.295, 0.011, 0.12, 0.1, C.white);
      }
      // sodium mast on the central barrier
      if (mk1 > 0.6 && mk0 < 0.4) {
        lamp(seg, 0.5, 0, 0.44, 0.2, C.lampSodium, true, 0x9a5a28);
        lightPool(seg, 0.5, 0.22, 0.3, POOL_SODIUM);
        lightPool(seg, 0.5, -0.22, 0.3, POOL_SODIUM);
      }
      // sign gantry on some tiles
      if (hash3(ctx.t, seg.k, 11) % 5 === 0 && mk0 < 0.2 && mk1 > 0.4) gantry(seg, 0.3);
    }
  }
  if (ctx.shape !== 'straight') {
    const r = ctx.shape === 'junction' ? 0.56 : s.outer;
    P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + slabBottom);
    w.prism(P0, UP, E1, E2, r, r, -slabBottom + D_SIDE, 18, C.concreteDark, Mat.Plain, true, C.concrete);
    P0.copy(UP).multiplyScalar(ctx.R + ctx.deck + D_ASPH);
    w.disc(P0, UP, E1, E2, r - 0.03, 18, C.asphaltHwy, Mat.Plain);
    if (ctx.shape === 'dead') {
      // crash cushion with glowing chevrons across the end
      const seg = SEGS[0];
      if (ctx.n === 1) {
        stCount = 2;
        ST[0] = 0;
        ST[1] = 1;
        frameAt(seg, 0, 0, D_ASPH, P1);
        P1.addScaledVector(FWD, -0.32);
        w.box(P1, FUP, RIGHT, FWD, 0.8, 0.07, 0.05, C.barrier, Mat.Plain);
        P1.addScaledVector(FWD, -0.026).addScaledVector(FUP, 0.022);
        TMP.copy(FWD).negate();
        TMP2.copy(RIGHT).negate();
        for (let k = -2; k <= 2; k++) {
          P2.copy(P1).addScaledVector(RIGHT, k * 0.15);
          w.box(P2, FUP, TMP2, TMP, 0.09, 0.028, 0.004, C.chevron, Mat.Glow);
        }
      }
    }
  }
  if (ctx.water) {
    const bottom = ctx.ground - 0.08;
    const top = ctx.deck + slabBottom - 0.002;
    for (const sg of [-1, 1]) pier(0.07, bottom, top, sg * 0.26, C.concreteDark);
    P0.copy(UP).multiplyScalar(ctx.R + top - 0.07);
    w.box(P0, UP, E2, E1, 0.78, 0.07, 0.16, C.concrete, Mat.Plain);
  }
}

/** Overhead sign gantry spanning the carriageway. */
function gantry(seg: HalfSegment, s: number): void {
  const w = ctx.w;
  const sp = ctx.spec;
  frameAt(seg, s, 0, D_ASPH, P0);
  const h = 0.36;
  for (const sg of [-1, 1]) {
    P1.copy(P0).addScaledVector(RIGHT, sg * (sp.outer - 0.02));
    w.box(P1, FUP, RIGHT, FWD, 0.022, h, 0.022, C.gantry, Mat.Plain);
  }
  P1.copy(P0).addScaledVector(RIGHT, -(sp.outer - 0.02)).addScaledVector(FUP, h - 0.025);
  P2.copy(P0).addScaledVector(RIGHT, sp.outer - 0.02).addScaledVector(FUP, h - 0.025);
  w.beam(P1, P2, FUP, FWD, 0.024, 0.024, C.gantry, Mat.Plain, { bottom: true });
  // signs both ways: green board with a glowing legend strip
  for (const dir of [-1, 1]) {
    for (const sg of [-1, 1]) {
      P3.copy(P0).addScaledVector(RIGHT, sg * 0.22 * dir).addScaledVector(FUP, h - 0.09).addScaledVector(FWD, dir * 0.016);
      TMP.copy(FWD).multiplyScalar(dir);
      TMP2.copy(RIGHT).multiplyScalar(dir);
      w.box(P3, FUP, TMP2, TMP, 0.3, 0.1, 0.008, C.sign, Mat.Plain);
      P3.addScaledVector(TMP, 0.0045).addScaledVector(FUP, 0.035);
      w.box(P3, FUP, TMP2, TMP, 0.22, 0.016, 0.002, C.white, Mat.Glow);
      P3.addScaledVector(FUP, -0.03);
      w.box(P3, FUP, TMP2, TMP, 0.14, 0.012, 0.002, C.white, Mat.Glow);
    }
  }
}

// ───────────────────────────────────────────────────────────── Maglev

function buildMaglev(): void {
  const s = ctx.spec;
  const w = ctx.w;
  const hw = s.carriage;
  for (let i = 0; i < ctx.n; i++) {
    const seg = SEGS[i];
    const tp = TAPERS[i];
    stCount = stations(seg, tp, s);
    // guideway beam (white, visible underside)
    raised(seg, 0, 1, -hw, -hw, hw, hw, -0.075, 0, C.guideTop, C.guide, Mat.Plain, { bottom: true });
    // night under-glow strips along both sides
    for (const sg of [-1, 1]) ribbonSide(seg, sg * (hw + 0.002), -0.058, -0.044, C.railNight, Mat.Light);
    // glowing rails
    for (const sg of [-1, 1]) raised(seg, 0, 1, sg * s.lanes[0] - 0.011, sg * s.lanes[0] - 0.011, sg * s.lanes[0] + 0.011, sg * s.lanes[0] + 0.011, 0, 0.012, C.rail, C.guideTop, Mat.Glow, { sideMat: Mat.Plain });
  }
  // node: pylon + platform
  const base = ctx.ground - 0.05;
  const top = ctx.deck - 0.075;
  P0.copy(UP).multiplyScalar(ctx.R + base);
  if (top - base > 0.03) {
    w.prism(P0, UP, E1, E2, 0.05, 0.04, top - base - 0.05, 6, C.pylon, Mat.Plain, false);
    P1.copy(UP).multiplyScalar(ctx.R + top - 0.05);
    w.box(P1, UP, E2, E1, 0.36, 0.05, 0.12, C.pylon, Mat.Plain);
  }
  if (ctx.shape !== 'straight') {
    const r = ctx.shape === 'junction' ? 0.24 : 0.16;
    P0.copy(UP).multiplyScalar(ctx.R + ctx.deck - 0.075);
    w.prism(P0, UP, E1, E2, r, r, 0.073, 14, C.guide, Mat.Plain, true, C.guideTop);
    if (ctx.shape === 'junction') {
      P0.copy(UP).multiplyScalar(ctx.R + ctx.deck);
      w.disc(P0, UP, E1, E2, 0.07, 10, C.rail, Mat.Glow);
    }
    if (ctx.shape === 'dead' && ctx.n === 1) {
      // buffer stop with a red lamp
      const seg = SEGS[0];
      frameAt(seg, 0, 0, 0, P1);
      P1.addScaledVector(FWD, -0.1);
      w.box(P1, FUP, RIGHT, FWD, 0.26, 0.06, 0.05, C.guideTop, Mat.Plain);
      P1.addScaledVector(FUP, 0.06);
      w.box(P1, FUP, RIGHT, FWD, 0.04, 0.03, 0.04, C.bufferRed, Mat.Glow);
    }
  }
}

/** A vertical band on the side of a beam at lateral `lat` between dz0..dz1 (no taper). */
function ribbonSide(seg: HalfSegment, lat: number, dz0: number, dz1: number, col: Lin, mat: number): void {
  const p = ctx.planet;
  let sPrev = 0;
  for (let i = 1; i < stCount; i++) {
    const s = ST[i];
    pointOnHalf(p, seg, sPrev, lat, P0, dz0);
    pointOnHalf(p, seg, s, lat, P1, dz0);
    pointOnHalf(p, seg, s, lat, P2, dz1);
    pointOnHalf(p, seg, sPrev, lat, P3, dz1);
    TMP.copy(seg.rightNode).multiplyScalar(lat >= 0 ? 1 : -1);
    ctx.w.quad(P0, P1, P2, P3, TMP, col, mat);
    sPrev = s;
  }
}

// ───────────────────────────────────────────────────────────── Hyperloop

function buildHyperloop(): void {
  const s = ctx.spec;
  const w = ctx.w;
  const off = s.lanes[0];
  const r = 0.068;
  const pod = ctx.shape !== 'straight';
  const podR = 0.19;
  for (let i = 0; i < ctx.n; i++) {
    const seg = SEGS[i];
    const tp = TAPERS[i];
    stCount = stations(seg, tp, s);
    const L = Math.max(0.2, seg.length);
    const sStart = pod ? Math.min(0.5, (podR - 0.02) / L) : 0;
    for (const sg of [-1, 1]) {
      let sPrev = sStart;
      for (let k = 1; k < stCount; k++) {
        const sc = ST[k];
        if (sc <= sStart + 1e-4) continue;
        frameAt(seg, sPrev, sg * off, 0, P0);
        P1.copy(P0);
        pointOnHalf(ctx.planet, seg, sc, sg * off, Q0, 0);
        w.tube(P1, Q0, FUP, RIGHT, r, 8, C.tube, Mat.Plain);
        sPrev = sc;
      }
      // glowing ring + night light line along the top
      frameAt(seg, 0.55, sg * off, 0, P0);
      P1.copy(P0).addScaledVector(FWD, -0.022);
      P2.copy(P0).addScaledVector(FWD, 0.022);
      w.tube(P1, P2, FUP, RIGHT, r + 0.008, 8, C.tubeRing, Mat.Glow);
      ribbon(seg, sStart, 1, sg * off - 0.007, sg * off - 0.007, sg * off + 0.007, sg * off + 0.007, r + 0.002, C.tubeLine, Mat.Light);
    }
  }
  // Y-pylon at the node
  const base = ctx.ground - 0.05;
  const saddle = ctx.deck - r - 0.02;
  if (saddle - base > 0.08) {
    P0.copy(UP).multiplyScalar(ctx.R + base);
    w.prism(P0, UP, E1, E2, 0.055, 0.042, saddle - base - 0.05, 6, C.pylon, Mat.Plain, false);
    P1.copy(UP).multiplyScalar(ctx.R + saddle - 0.05);
    const across = ctx.n > 0 ? SEGS[0].rightNode : E2;
    const along = ctx.n > 0 ? SEGS[0].fwd : E1;
    w.box(P1, UP, across, along, 0.36, 0.05, 0.1, C.pylon, Mat.Plain);
  }
  if (pod) {
    // junction / terminal pod: a capsule with a glowing equator
    P0.copy(UP).multiplyScalar(ctx.R + ctx.deck - podR * 0.62);
    w.prism(P0, UP, E1, E2, podR * 0.86, podR, podR * 0.62, 12, C.pod, Mat.Plain, false);
    P1.copy(P0).addScaledVector(UP, podR * 0.62);
    w.prism(P1, UP, E1, E2, podR, podR * 0.72, podR * 0.5, 12, C.pod, Mat.Plain, false);
    P2.copy(P1).addScaledVector(UP, podR * 0.5);
    w.prism(P2, UP, E1, E2, podR * 0.72, 0.001, podR * 0.32, 12, C.pod, Mat.Plain, false);
    P3.copy(P1).addScaledVector(UP, -0.012);
    w.prism(P3, UP, E1, E2, podR + 0.006, podR + 0.006, 0.026, 12, C.tubeRing, Mat.Glow, false);
    P3.copy(P2).addScaledVector(UP, podR * 0.32 - 0.004);
    w.prism(P3, UP, E1, E2, 0.03, 0.02, 0.03, 6, C.tubeLine, Mat.Light, true);
  }
}
