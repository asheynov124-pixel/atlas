/**
 * OWNER: roads-props.
 * Road lane geometry — the single source of truth for WHERE road surfaces are. RoadRenderer draws with it and the
 * life role (traffic, trains, pods) drives on it, so vehicles always sit exactly on the asphalt / rails.
 *
 * ── Model ────────────────────────────────────────────────────────────────────────────────────────────────────────
 *   Every road tile has a NODE at its centre. For every linked neighbour k (bit k of planet.roadLinks[t], and the
 *   neighbour is a road too) a straight HALF-SEGMENT runs from the node to the EDGE MIDPOINT shared with neighbour k;
 *   the neighbour draws the other half, so a car going a → b travels  node(a) → edge(a,b) → node(b).
 *
 *   Heights (world units above planet.radius):
 *     base(t)   terrain top; over water (bridges) at least waterHeight + clearance
 *     deck(t)   base(t) + ROAD_SPECS[kind].lift — the driving surface at the node (rails: top of the guideway,
 *               hyperloop: tube centre line)
 *     edge(t,k) max(deck(t), deck(nbr)) when both tiles are the same class (road ↔ road, rail ↔ rail), else deck(t).
 *               Ramps therefore always sit on the LOWER tile's half, and both halves meet seamlessly at the edge.
 *   Along a half the height follows a smoothstep from deck (s = 0) to edge (s = 1).
 *
 *   Cross-sections: at the edge the "right" vector is perpendicular to the a→b direction (both tiles agree, so strips
 *   join without gaps). At the node it is perpendicular to the half's own direction, except on straight-through
 *   tiles (exactly two links, nearly opposite) where it is mitred along the bisector and stretched by `nodeScale`,
 *   so lanes continue through the node without a kink.
 *
 *   Lanes use right-hand traffic: for travel from the node toward the edge, lane i sits at lateral +lanes[i]
 *   (lateral = offset to the RIGHT of travel). Oncoming traffic on the same half uses −lanes[i].
 *
 * ── API (allocation-free when you pass `out` objects) ──────────────────────────────────────────────────────────────
 *   ROAD_SPECS[kind]                         widths, lane offsets, lift, rail flag, cruise speed (world units / s)
 *   isRailKind(kind) · sameClass(a, b)
 *   tileBase(planet, t) · deckHeight(planet, t) · edgeHeight(planet, t, k)
 *   linkedNeighbours(planet, t, outK)        fills outK with the linked neighbour indices k, returns the count
 *   nodePosition(planet, t, out, lift?)      world position of the node's driving surface
 *   edgeMidpoint(planet, t, k, out, lift?)   world position of the edge midpoint's driving surface
 *   halfSegment(planet, t, k, out?)          precomputed frame of one half (directions, heights, rights, length)
 *   pointOnHalf(planet, seg, s, lateral, out, lift?, dirOut?)   s ∈ [0,1] node → edge, lateral to the RIGHT
 *   travelPoint(planet, a, b, u, lateral, out, dirOut?)          u ∈ [0,1] from node a to node b (a, b adjacent)
 *   laneOffset(kind, lane)                   ±offset of lane `lane` (clamped), handy for spawning
 *   smoothRamp(s)                            the height profile used along a half
 *
 * Example (life role): a car on lane 0 driving a → b at parameter u:
 *   travelPoint(planet, a, b, u, laneOffset(planet.road[a], 0), pos, dir);  // pos on asphalt, dir = heading
 */
import { Vector3 } from 'three';
import { RoadKind } from '../../core/types';
import type { Planet } from '../../world/planet';

export interface RoadSpec {
  kind: RoadKind;
  rail: boolean;
  /** half-width of the outermost layer (sidewalk / verge / deck slab / guideway) */
  outer: number;
  /** half-width of the kerb band (the light edge around the drivable surface) */
  kerb: number;
  /** half-width of the drivable surface */
  carriage: number;
  /** half-width of the central median / barrier (0 = none) */
  median: number;
  /** driving-surface height above the tile top (or bridge base) */
  lift: number;
  /** lane centre offsets to the RIGHT of travel (right-hand traffic), innermost first */
  lanes: number[];
  /** cruise speed in world units per real second at 1x (1 unit ≈ 20 m) */
  speed: number;
}

export const ROAD_SPECS: Record<number, RoadSpec> = {
  [RoadKind.None]: { kind: RoadKind.None, rail: false, outer: 0, kerb: 0, carriage: 0, median: 0, lift: 0, lanes: [0], speed: 0 },
  [RoadKind.Path]: { kind: RoadKind.Path, rail: false, outer: 0.15, kerb: 0.136, carriage: 0.12, median: 0, lift: 0.026, lanes: [0.05], speed: 0.18 },
  [RoadKind.Street]: { kind: RoadKind.Street, rail: false, outer: 0.32, kerb: 0.216, carriage: 0.2, median: 0, lift: 0.026, lanes: [0.1], speed: 0.9 },
  [RoadKind.Avenue]: { kind: RoadKind.Avenue, rail: false, outer: 0.44, kerb: 0.336, carriage: 0.32, median: 0.055, lift: 0.026, lanes: [0.125, 0.255], speed: 1.3 },
  [RoadKind.Highway]: { kind: RoadKind.Highway, rail: false, outer: 0.5, kerb: 0.487, carriage: 0.47, median: 0.03, lift: 0.135, lanes: [0.1, 0.23, 0.36], speed: 2.2 },
  [RoadKind.Maglev]: { kind: RoadKind.Maglev, rail: true, outer: 0.16, kerb: 0.16, carriage: 0.15, median: 0, lift: 0.62, lanes: [0.085], speed: 4.5 },
  [RoadKind.Hyperloop]: { kind: RoadKind.Hyperloop, rail: true, outer: 0.2, kerb: 0.2, carriage: 0.19, median: 0, lift: 0.72, lanes: [0.11], speed: 9 },
};

/** Ground roads over water float this far above the sea surface (bridge decks). */
export const BRIDGE_CLEARANCE = 0.3;
/** Rails over water: base sits this far above the sea surface (the rail lift does the rest). */
export const RAIL_WATER_CLEARANCE = 0.08;

export function roadSpec(kind: number): RoadSpec {
  return ROAD_SPECS[kind] ?? ROAD_SPECS[RoadKind.Street];
}

export function isRailKind(kind: number): boolean {
  return kind === RoadKind.Maglev || kind === RoadKind.Hyperloop;
}

/** Road ↔ road or rail ↔ rail (only those blend widths and heights at shared edges). */
export function sameClass(a: number, b: number): boolean {
  return a !== 0 && b !== 0 && isRailKind(a) === isRailKind(b);
}

/** Smoothstep height profile along a half-segment. */
export function smoothRamp(s: number): number {
  const x = s < 0 ? 0 : s > 1 ? 1 : s;
  return x * x * (3 - 2 * x);
}

/** Base height of a road tile: terrain top, or the bridge base over water. */
export function tileBase(planet: Planet, t: number): number {
  const h = planet.heightOf(t);
  if (!planet.isWater(t)) return h;
  const kind = planet.road[t];
  const clear = isRailKind(kind) ? RAIL_WATER_CLEARANCE : BRIDGE_CLEARANCE;
  return Math.max(h, planet.waterHeight + clear);
}

/** Driving-surface height at the node of road tile t. */
export function deckHeight(planet: Planet, t: number): number {
  return tileBase(planet, t) + roadSpec(planet.road[t]).lift;
}

/** Driving-surface height at the midpoint of the edge toward neighbour k. */
export function edgeHeight(planet: Planet, t: number, k: number): number {
  const d = deckHeight(planet, t);
  const n = planet.grid.neighbor(t, k);
  if (!sameClass(planet.road[t], planet.road[n])) return d;
  const dn = deckHeight(planet, n);
  return dn > d ? dn : d;
}

/** Fill outK with the indices k of linked road neighbours of t. Returns the count. */
export function linkedNeighbours(planet: Planet, t: number, outK: number[]): number {
  const g = planet.grid;
  const links = planet.roadLinks[t];
  const d = g.degree(t);
  let n = 0;
  if (!links || !planet.road[t]) return 0;
  for (let k = 0; k < d; k++) {
    if (!(links & (1 << k))) continue;
    if (!planet.road[g.neighbor(t, k)]) continue;
    outK[n++] = k;
  }
  return n;
}

/** Unit direction of tile t's centre. */
function centreDir(planet: Planet, t: number, out: Vector3): Vector3 {
  const c = planet.grid.center;
  return out.set(c[t * 3], c[t * 3 + 1], c[t * 3 + 2]);
}

/** Unit direction of the midpoint of the edge between corner k and k+1 of tile t. */
export function edgeDir(planet: Planet, t: number, k: number, out: Vector3): Vector3 {
  const g = planet.grid;
  const d = g.degree(t);
  const s = g.start[t];
  const a = (s + (((k % d) + d) % d)) * 3;
  const b = (s + ((((k + 1) % d) + d) % d)) * 3;
  const C = g.corner;
  return out.set(C[a] + C[b], C[a + 1] + C[b + 1], C[a + 2] + C[b + 2]).normalize();
}

export function nodePosition(planet: Planet, t: number, out: Vector3, lift = 0): Vector3 {
  return centreDir(planet, t, out).multiplyScalar(planet.radius + deckHeight(planet, t) + lift);
}

export function edgeMidpoint(planet: Planet, t: number, k: number, out: Vector3, lift = 0): Vector3 {
  return edgeDir(planet, t, k, out).multiplyScalar(planet.radius + edgeHeight(planet, t, k) + lift);
}

/** Precomputed frame of one half-segment (node of `tile` → edge toward neighbour k). */
export interface HalfSegment {
  tile: number;
  k: number;
  nbr: number;
  /** unit direction of the node / of the edge midpoint */
  nodeDir: Vector3;
  edgeDir: Vector3;
  /** driving-surface heights above radius at node / edge */
  nodeH: number;
  edgeH: number;
  /** tangent at the node pointing toward the edge */
  fwd: Vector3;
  /** cross-section right vectors (tangent) at node and edge */
  rightNode: Vector3;
  rightEdge: Vector3;
  /** lateral stretch at the node (> 1 on mitred straight-throughs) */
  nodeScale: number;
  /** chord length node → edge (world units) */
  length: number;
  /** true when the tile is a straight-through (mitred) node */
  mitred: boolean;
}

export function newHalfSegment(): HalfSegment {
  return {
    tile: -1,
    k: 0,
    nbr: -1,
    nodeDir: new Vector3(),
    edgeDir: new Vector3(),
    nodeH: 0,
    edgeH: 0,
    fwd: new Vector3(),
    rightNode: new Vector3(),
    rightEdge: new Vector3(),
    nodeScale: 1,
    length: 1,
    mitred: false,
  };
}

const _v = new Vector3();
const _w = new Vector3();
const _c2 = new Vector3();
const _f2 = new Vector3();
const _m2 = new Vector3();
const _ks: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

/** Tangent at unit direction `up` toward the unit direction `to`. */
function tangentToward(up: Vector3, to: Vector3, out: Vector3): Vector3 {
  out.copy(to).sub(up);
  out.addScaledVector(up, -out.dot(up));
  const l = out.length();
  if (l < 1e-9) return out.set(1, 0, 0);
  return out.multiplyScalar(1 / l);
}

/**
 * Compute the frame of the half-segment from tile t toward neighbour k. Works for any k (linked or not);
 * mitring is decided from the tile's actual links.
 */
export function halfSegment(planet: Planet, t: number, k: number, out: HalfSegment = newHalfSegment()): HalfSegment {
  const g = planet.grid;
  const R = planet.radius;
  out.tile = t;
  out.k = k;
  const n = g.neighbor(t, k);
  out.nbr = n;
  centreDir(planet, t, out.nodeDir);
  edgeDir(planet, t, k, out.edgeDir);
  out.nodeH = deckHeight(planet, t);
  out.edgeH = edgeHeight(planet, t, k);
  tangentToward(out.nodeDir, out.edgeDir, out.fwd);
  // edge cross-section: perpendicular to the a→b direction at the edge (shared with the neighbour)
  centreDir(planet, n, _c2);
  tangentToward(out.edgeDir, _c2, _w);
  // direction a→b measured at the edge midpoint: (c_b − c_a) projected
  _v.copy(_c2).sub(out.nodeDir);
  _v.addScaledVector(out.edgeDir, -_v.dot(out.edgeDir));
  if (_v.lengthSq() > 1e-12) _v.normalize();
  else _v.copy(_w);
  out.rightEdge.crossVectors(out.edgeDir, _v).normalize();
  // node cross-section (mitred on straight-throughs)
  out.rightNode.crossVectors(out.nodeDir, out.fwd).normalize();
  out.nodeScale = 1;
  out.mitred = false;
  const cnt = linkedNeighbours(planet, t, _ks);
  if (cnt === 2 && (_ks[0] === k || _ks[1] === k)) {
    const other = _ks[0] === k ? _ks[1] : _ks[0];
    edgeDir(planet, t, other, _m2);
    tangentToward(out.nodeDir, _m2, _f2);
    if (out.fwd.dot(_f2) < -0.7) {
      _v.copy(out.fwd).sub(_f2).normalize();
      out.rightNode.crossVectors(out.nodeDir, _v).normalize();
      const c = _v.dot(out.fwd);
      out.nodeScale = 1 / Math.max(0.55, c);
      out.mitred = true;
    }
  }
  _v.copy(out.edgeDir).multiplyScalar(R + out.edgeH);
  _w.copy(out.nodeDir).multiplyScalar(R + out.nodeH);
  out.length = _v.distanceTo(_w);
  return out;
}

const _d = new Vector3();
const _r = new Vector3();

/**
 * Point on a half-segment: s ∈ [0,1] from node to edge, `lateral` world units to the right of node→edge travel,
 * `lift` above the driving surface. Optionally writes the travel direction (node → edge) into dirOut.
 */
export function pointOnHalf(planet: Planet, seg: HalfSegment, s: number, lateral: number, out: Vector3, lift = 0, dirOut?: Vector3): Vector3 {
  const R = planet.radius;
  _d.copy(seg.nodeDir).lerp(seg.edgeDir, s).normalize();
  const h = seg.nodeH + (seg.edgeH - seg.nodeH) * smoothRamp(s);
  _r.copy(seg.rightNode).lerp(seg.rightEdge, s).normalize();
  const sc = seg.nodeScale + (1 - seg.nodeScale) * s;
  out.copy(_d).multiplyScalar(R + h + lift).addScaledVector(_r, lateral * sc);
  if (dirOut) {
    // heading: tangent ⟂ right, slope from the ramp derivative
    dirOut.crossVectors(_r, _d).normalize();
    const slope = ((seg.edgeH - seg.nodeH) * 6 * s * (1 - s)) / Math.max(0.05, seg.length);
    dirOut.addScaledVector(_d, slope).normalize();
  }
  return out;
}

const _segA = newHalfSegment();
const _segB = newHalfSegment();

/**
 * Point on the route node(a) → edge(a,b) → node(b) for u ∈ [0,1] (a and b adjacent). `lateral` is to the right of
 * travel from a to b. Returns false (and leaves out untouched) when a and b are not neighbours.
 */
export function travelPoint(planet: Planet, a: number, b: number, u: number, lateral: number, out: Vector3, dirOut?: Vector3): boolean {
  const g = planet.grid;
  const ka = g.neighborIndex(a, b);
  const kb = g.neighborIndex(b, a);
  if (ka < 0 || kb < 0) return false;
  if (u <= 0.5) {
    halfSegment(planet, a, ka, _segA);
    pointOnHalf(planet, _segA, u * 2, lateral, out, 0, dirOut);
  } else {
    // on b's half the travel direction is edge → node, so "right of travel" is −right of the half
    halfSegment(planet, b, kb, _segB);
    pointOnHalf(planet, _segB, (1 - u) * 2, -lateral, out, 0, dirOut);
    if (dirOut) dirOut.negate();
  }
  return true;
}

/** Lateral offset of lane `lane` (0 = innermost) for travel in the forward direction. */
export function laneOffset(kind: number, lane = 0): number {
  const l = roadSpec(kind).lanes;
  return l[Math.max(0, Math.min(l.length - 1, lane))];
}
