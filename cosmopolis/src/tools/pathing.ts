/**
 * OWNER: tools.
 * Road pathfinding on the hex sphere — A* over (tile, came-from) states so the cost can punish turns: roads come
 * out as clean straight runs with as few bends as possible instead of jittery zig-zags. Buildings and open water
 * are impassable (unless allowed), steep terrace steps cost extra (and are impassable beyond `maxStep`), existing
 * roads are slightly cheaper to reuse. Falls back to the greedy great-circle line (with the offending tiles
 * flagged) when no legal route exists within the node budget.
 *
 * Pure functions of the Planet model — no rendering, no globals — so they run in node tests.
 */
import type { Planet } from '../world/planet';

export interface RoadPathOptions {
  /** allow crossing open water (bridges). Default false. */
  water?: boolean;
  /** allow running through buildings (sandbox force). Default false. */
  throughBuildings?: boolean;
  /** largest terrace step between consecutive tiles. Default 3. */
  maxStep?: number;
  /** only travel on existing road tiles (upgrade mode). Default false. */
  roadsOnly?: boolean;
  /** search budget (expanded states). Default 24 000. */
  maxNodes?: number;
  /** cost of a 60° bend (a 120° bend costs 3×). Default 0.55. */
  turnCost?: number;
}

export interface RoadPathResult {
  /** consecutive adjacent tiles from start to end (inclusive) */
  path: number[];
  /** true when every tile is legal */
  ok: boolean;
  /** tiles of `path` that can't take a road (fallback lines only) */
  blocked: number[];
  /** why the route is not legal */
  reason?: string;
}

/** Why a single tile can't take a road (null = fine). */
export function roadBlockReason(p: Planet, t: number, o: RoadPathOptions = {}): string | null {
  if (o.roadsOnly && p.road[t] === 0) return 'Not a road';
  if (!o.throughBuildings && p.building[t] >= 0) return 'A building is in the way';
  if (!o.water && p.isWater(t)) return "Roads can't cross open water";
  return null;
}

// ─────────────────────────────────────────────── binary heap (indices into node arrays)

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, key: number): void {
    const ids = this.ids, keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      ids[i] = ids[parent];
      keys[i] = keys[parent];
      i = parent;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const ids = this.ids, keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}

/**
 * Best road route from `a` to `b` (both inclusive). States are (tile, previous tile) so bends can be priced.
 */
export function findRoadPath(p: Planet, a: number, b: number, o: RoadPathOptions = {}): RoadPathResult {
  if (a === b) {
    const r = roadBlockReason(p, a, o);
    return { path: [a], ok: !r, blocked: r ? [a] : [], reason: r ?? undefined };
  }
  const g = p.grid;
  const C = g.center;
  // an unreachable end (or start) would make A* burn its whole node budget: go straight to the flagged line
  if (roadBlockReason(p, b, o) || roadBlockReason(p, a, o)) return fallbackLine(p, a, b, o);
  const maxStep = o.maxStep ?? 3;
  const maxNodes = o.maxNodes ?? 24000;
  const turnCost = o.turnCost ?? 0.55;
  const unit = g.unitEdge;
  // plane of the a→b great circle: a gentle pull toward the straight line breaks ties between equal-cost routes
  let nx = C[a * 3 + 1] * C[b * 3 + 2] - C[a * 3 + 2] * C[b * 3 + 1];
  let ny = C[a * 3 + 2] * C[b * 3] - C[a * 3] * C[b * 3 + 2];
  let nz = C[a * 3] * C[b * 3 + 1] - C[a * 3 + 1] * C[b * 3];
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  const bx = C[b * 3], by = C[b * 3 + 1], bz = C[b * 3 + 2];
  const heur = (t: number): number => {
    const d = C[t * 3] * bx + C[t * 3 + 1] * by + C[t * 3 + 2] * bz;
    return (Math.acos(d > 1 ? 1 : d < -1 ? -1 : d) / unit) * 0.86;
  };

  // node storage: state key = tile * 8 + slot (slot = index of prev in tile's neighbour list, 7 = start)
  const nodeOf = new Map<number, number>();
  const nTile: number[] = [];
  const nPrev: number[] = [];
  const nG: number[] = [];
  const nParent: number[] = [];
  const closed: boolean[] = [];
  const heap = new MinHeap();
  const startKey = a * 8 + 7;
  nodeOf.set(startKey, 0);
  nTile.push(a);
  nPrev.push(-1);
  nG.push(0);
  nParent.push(-1);
  closed.push(false);
  heap.push(0, heur(a));
  let found = -1;
  let expanded = 0;
  while (heap.size > 0 && expanded < maxNodes) {
    const id = heap.pop();
    if (closed[id]) continue;
    closed[id] = true;
    expanded++;
    const t = nTile[id];
    if (t === b) {
      found = id;
      break;
    }
    const prev = nPrev[id];
    const s = g.start[t], e = g.start[t + 1];
    // incoming direction
    let dx = 0, dy = 0, dz = 0, dl = 0;
    if (prev >= 0) {
      dx = C[t * 3] - C[prev * 3];
      dy = C[t * 3 + 1] - C[prev * 3 + 1];
      dz = C[t * 3 + 2] - C[prev * 3 + 2];
      dl = Math.hypot(dx, dy, dz) || 1;
    }
    for (let q = s; q < e; q++) {
      const n = g.nbr[q];
      if (n === prev) continue;
      if (roadBlockReason(p, n, o)) continue;
      const step = Math.abs(p.elevation[n] - p.elevation[t]);
      if (step > maxStep && !p.isWater(n) && !p.isWater(t)) continue;
      let cost = 1 + step * 0.35;
      if (p.road[n] !== 0) cost *= 0.86;
      if (prev >= 0) {
        const ex = C[n * 3] - C[t * 3], ey = C[n * 3 + 1] - C[t * 3 + 1], ez = C[n * 3 + 2] - C[t * 3 + 2];
        const el = Math.hypot(ex, ey, ez) || 1;
        const cos = (dx * ex + dy * ey + dz * ez) / (dl * el);
        // hex grid: straight ≈ 1, 60° bend ≈ 0.5, 120° bend ≈ −0.5
        cost += (1 - cos) * 2 * turnCost * (cos < 0 ? 1.5 : 1);
      }
      if (p.isWater(n)) cost += 2.5;
      cost += Math.abs(C[n * 3] * nx + C[n * 3 + 1] * ny + C[n * 3 + 2] * nz) / unit * 0.04;
      const slot = g.neighborIndex(n, t);
      const key = n * 8 + (slot < 0 ? 6 : slot);
      const gNew = nG[id] + cost;
      let nid = nodeOf.get(key);
      if (nid === undefined) {
        nid = nTile.length;
        nodeOf.set(key, nid);
        nTile.push(n);
        nPrev.push(t);
        nG.push(gNew);
        nParent.push(id);
        closed.push(false);
        heap.push(nid, gNew + heur(n));
      } else if (!closed[nid] && gNew < nG[nid]) {
        nG[nid] = gNew;
        nParent[nid] = id;
        heap.push(nid, gNew + heur(n));
      }
    }
  }
  if (found >= 0) {
    const path: number[] = [];
    for (let id = found; id >= 0; id = nParent[id]) path.push(nTile[id]);
    path.reverse();
    const startReason = roadBlockReason(p, a, o);
    if (startReason) return { path, ok: false, blocked: [a], reason: startReason };
    return { path, ok: true, blocked: [] };
  }
  return fallbackLine(p, a, b, o);
}

/** The greedy hex line from a to b with every illegal tile (blocked, too steep) flagged. */
function fallbackLine(p: Planet, a: number, b: number, o: RoadPathOptions): RoadPathResult {
  const maxStep = o.maxStep ?? 3;
  const path = p.grid.path(a, b);
  const blocked: number[] = [];
  let reason: string | undefined;
  for (let i = 0; i < path.length; i++) {
    const t = path[i];
    const r = roadBlockReason(p, t, o);
    if (r) {
      blocked.push(t);
      reason ??= r;
      continue;
    }
    if (i > 0 && Math.abs(p.elevation[t] - p.elevation[path[i - 1]]) > maxStep && !p.isWater(t) && !p.isWater(path[i - 1])) {
      blocked.push(t);
      reason ??= 'Too steep — terraform a ramp first';
    }
  }
  return { path, ok: blocked.length === 0 && path[path.length - 1] === b, blocked, reason: reason ?? (blocked.length ? undefined : 'No route found') };
}

/** Number of 60°+ direction changes along a path (tests / quality metric). */
export function countBends(p: Planet, path: number[]): number {
  const C = p.grid.center;
  let bends = 0;
  for (let i = 2; i < path.length; i++) {
    const a = path[i - 2], b = path[i - 1], c = path[i];
    const dx = C[b * 3] - C[a * 3], dy = C[b * 3 + 1] - C[a * 3 + 1], dz = C[b * 3 + 2] - C[a * 3 + 2];
    const ex = C[c * 3] - C[b * 3], ey = C[c * 3 + 1] - C[b * 3 + 1], ez = C[c * 3 + 2] - C[b * 3 + 2];
    const cos = (dx * ex + dy * ey + dz * ez) / ((Math.hypot(dx, dy, dz) || 1) * (Math.hypot(ex, ey, ez) || 1));
    if (cos < 0.85) bends++;
  }
  return bends;
}

/** True when consecutive tiles are neighbours. */
export function isContiguous(p: Planet, path: number[]): boolean {
  for (let i = 1; i < path.length; i++) if (!p.grid.areNeighbors(path[i - 1], path[i])) return false;
  return true;
}

/**
 * Join a sequence of (possibly non-adjacent) sampled tiles into a contiguous chain — for brush strokes and god
 * paths drawn faster than one tile per frame. Consecutive duplicates are dropped.
 */
export function chainTiles(p: Planet, last: number, next: number, out: number[]): void {
  if (last < 0) {
    out.push(next);
    return;
  }
  if (last === next) return;
  const seg = p.grid.path(last, next);
  for (let i = 1; i < seg.length; i++) out.push(seg[i]);
}
