/**
 * OWNER: life.
 * Route — a short ring of HOPS (node(a) → edge(a,b) → node(b)) along the road / rail lane contract of
 * render/roads/lanes.ts, with smooth Bézier turns through every node so vehicles never snap between lanes.
 *
 *   hop h: a → b, the two half-segment frames (a's half toward b, b's half toward a), lateral lane offsets at both
 *          ends (right-hand traffic), chord length, and the TURN that joins it to hop h+1 (P0 on h at u = 1 − T,
 *          P1 = lane-line intersection at node b, P2 on h+1 at u = T; U-turns loop around the node).
 *   sample(h, u)  position + heading anywhere on hop h (including the turn zones at both ends).
 *
 * Pedestrians use the same machinery with `sidewalk` lateral offsets (pavements, or the middle of paths).
 * Cars keep a ring of 4 hops (previous, current, next); trains keep 16 so every carriage can be placed behind the
 * locomotive on the exact same curve. All frames are allocated once per Route; nothing allocates per frame.
 */
import { Vector3 } from 'three';
import type { Planet } from '../../world/planet';
import { halfSegment, newHalfSegment, pointOnHalf, roadSpec, type HalfSegment } from '../roads/lanes';
import { bezier2 } from './common';

/** Fraction of a hop (each end) given to the smooth turn. */
export const TURN_T = 0.2;

export class Hop {
  a = -1;
  b = -1;
  segA: HalfSegment = newHalfSegment();
  segB: HalfSegment = newHalfSegment();
  latA = 0;
  latB = 0;
  len = 2;
  /** turn into the next hop */
  turn = false;
  p0 = new Vector3();
  p1 = new Vector3();
  p2 = new Vector3();
  /** 0 (U-turn) … 1 (straight): how gently the next turn bends */
  ease = 1;
  /** node b is a junction (≥ 3 links) */
  junction = false;
}

const _v = new Vector3();
const _w = new Vector3();
const _n = new Vector3();
const _dIn = new Vector3();
const _dOut = new Vector3();
const _A = new Vector3();
const _B = new Vector3();
const _t1 = new Vector3();

/** Lateral offset of the pavement (right of travel) for pedestrians on a road kind. */
export function sidewalkOffset(kind: number): number {
  const sp = roadSpec(kind);
  if (kind === 1) return 0.035; // dirt / pedestrian path: walk near the middle
  return Math.max(sp.carriage + 0.03, sp.outer - 0.04);
}

export class Route {
  readonly hops: Hop[];
  private mask: number;
  /** absolute index of the newest hop (-1 = empty) */
  last = -1;

  constructor(size: 4 | 8 | 16 | 32) {
    this.hops = [];
    for (let i = 0; i < size; i++) this.hops.push(new Hop());
    this.mask = size - 1;
  }

  reset(): void {
    this.last = -1;
  }

  hop(h: number): Hop {
    return this.hops[h & this.mask];
  }

  /** oldest absolute hop index still stored */
  get first(): number {
    return Math.max(0, this.last - this.mask);
  }

  /**
   * Append hop a → b (adjacent tiles) with lane index `lane` (0 = innermost). Computes the turn joining the
   * previous hop to this one. Returns the hop, or null when a and b are not neighbours.
   */
  push(planet: Planet, a: number, b: number, lane: number, liftLat = 0, sidewalk = false): Hop | null {
    const g = planet.grid;
    const ka = g.neighborIndex(a, b);
    const kb = g.neighborIndex(b, a);
    if (ka < 0 || kb < 0) return null;
    const h = this.hop(++this.last);
    h.a = a;
    h.b = b;
    halfSegment(planet, a, ka, h.segA);
    halfSegment(planet, b, kb, h.segB);
    if (sidewalk) {
      h.latA = sidewalkOffset(planet.road[a]) + liftLat;
      h.latB = sidewalkOffset(planet.road[b]) + liftLat;
    } else {
      const la = roadSpec(planet.road[a]).lanes, lb = roadSpec(planet.road[b]).lanes;
      h.latA = la[Math.min(la.length - 1, lane)] + liftLat;
      h.latB = lb[Math.min(lb.length - 1, lane)] + liftLat;
    }
    h.len = Math.max(0.2, h.segA.length + h.segB.length);
    h.turn = false;
    h.ease = 1;
    if (this.last > 0) this.joinTurn(planet, this.hop(this.last - 1), h);
    return h;
  }

  /** Lateral offset (right of travel) at parameter u. */
  lateral(h: Hop, u: number): number {
    const t = u <= 0.35 ? 0 : u >= 0.65 ? 1 : ((u - 0.35) / 0.3) * ((u - 0.35) / 0.3) * (3 - 2 * ((u - 0.35) / 0.3));
    return h.latA + (h.latB - h.latA) * t;
  }

  /** Straight evaluation (no turn smoothing): point on the lane at u, heading into dir. */
  private raw(planet: Planet, h: Hop, u: number, out: Vector3, dir: Vector3 | null, lift: number): void {
    const lat = this.lateral(h, u);
    if (u <= 0.5) pointOnHalf(planet, h.segA, u * 2, lat, out, lift, dir ?? undefined);
    else {
      pointOnHalf(planet, h.segB, (1 - u) * 2, -lat, out, lift, dir ?? undefined);
      if (dir) dir.negate();
    }
  }

  private joinTurn(planet: Planet, h: Hop, n: Hop): void {
    // incoming lane line at node b and outgoing lane line
    const node = _n.copy(h.segB.nodeDir);
    _dIn.copy(h.segB.fwd).negate();
    _dOut.copy(n.segA.fwd);
    pointOnHalf(planet, h.segB, 0, -h.latB, _A, 0);
    pointOnHalf(planet, n.segA, 0, n.latA, _B, 0);
    this.raw(planet, h, 1 - TURN_T, h.p0, null, 0);
    this.raw(planet, n, TURN_T, h.p2, null, 0);
    const dot = _dIn.dot(_dOut);
    h.ease = Math.max(0, Math.min(1, (dot + 1) / 2));
    h.turn = true;
    // intersection of the two lane lines in the tangent plane at the node
    _v.subVectors(_B, _A);
    _t1.crossVectors(_dIn, _dOut);
    const den = _t1.dot(node);
    if (Math.abs(den) > 0.3) {
      _w.crossVectors(_v, _dOut);
      let s = _w.dot(node) / den;
      s = Math.max(-0.45, Math.min(0.45, s));
      h.p1.copy(_A).addScaledVector(_dIn, s);
    } else if (dot > 0) {
      h.p1.addVectors(_A, _B).multiplyScalar(0.5);
    } else {
      // U-turn: loop around the node beyond the stop line
      h.p1.addVectors(_A, _B).multiplyScalar(0.5).addScaledVector(_dIn, _v.length() * 0.9 + 0.06);
    }
    // keep the control point on the driving surface height of the node
    const r = h.p1.length();
    const target = (_A.length() + _B.length()) / 2;
    if (r > 1e-6) h.p1.multiplyScalar(target / r);
  }

  /**
   * Position + heading on hop index hi at parameter u ∈ [0,1]. `lift` raises the point above the lane surface
   * (applied radially). Turn zones use the Bézier joining the neighbouring hops.
   */
  sample(planet: Planet, hi: number, u: number, out: Vector3, dir: Vector3, lift = 0): void {
    const h = this.hop(hi);
    if (u > 1 - TURN_T && h.turn && hi < this.last) {
      bezier2(h.p0, h.p1, h.p2, (u - (1 - TURN_T)) / (2 * TURN_T), out, dir);
      dir.normalize();
      if (lift) out.addScaledVector(_v.copy(out).normalize(), lift);
      return;
    }
    if (u < TURN_T && hi > this.first) {
      const p = this.hop(hi - 1);
      if (p.turn && p.b === h.a) {
        bezier2(p.p0, p.p1, p.p2, 0.5 + u / (2 * TURN_T), out, dir);
        dir.normalize();
        if (lift) out.addScaledVector(_v.copy(out).normalize(), lift);
        return;
      }
    }
    this.raw(planet, h, u, out, dir, lift);
  }
}
