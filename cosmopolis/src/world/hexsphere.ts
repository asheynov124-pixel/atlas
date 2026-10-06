/**
 * Goldberg hex-sphere grid.
 *
 * A geodesic icosphere of frequency f has 10f²+2 vertices. Each vertex becomes a TILE (12 pentagons,
 * the rest hexagons). Tile corners are the centroids of the geodesic triangles around the vertex.
 *
 * Indexing (CSR): for tile i, its neighbours and corners live at [start[i], start[i+1]).
 *   corner k  = centroid of the k-th incident triangle (CCW seen from outside the sphere)
 *   neighbour k is the tile across the edge (corner k → corner k+1)
 * All vectors are on the UNIT sphere; multiply by planet radius for world space.
 *
 * Grids are immutable and cached per frequency (`getGrid(f)`).
 */

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V: number[][] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];
const ICO_F: number[][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

export class HexGrid {
  readonly frequency: number;
  readonly count: number;
  /** unit-sphere tile centres, xyz * count */
  readonly center: Float32Array;
  /** CSR offsets, length count+1 (shared by neighbours and corners) */
  readonly start: Uint32Array;
  /** neighbour tile indices (CCW) */
  readonly nbr: Int32Array;
  /** unit-sphere corner positions, xyz per corner slot (CCW) */
  readonly corner: Float32Array;
  /** per-tile inradius on the unit sphere (centre → nearest edge midpoint) */
  readonly inradius: Float32Array;
  /** mean centre-to-centre distance between neighbours on the unit sphere */
  readonly unitEdge: number;

  private hint = 0;

  constructor(frequency: number) {
    const f = Math.max(1, Math.floor(frequency));
    this.frequency = f;
    const count = 10 * f * f + 2;
    this.count = count;

    // ── canonical vertex ids
    const icoV = ICO_V.map((v) => {
      const l = Math.hypot(v[0], v[1], v[2]);
      return [v[0] / l, v[1] / l, v[2] / l];
    });
    const edgeIndex = new Map<number, number>();
    const edges: [number, number][] = [];
    for (const face of ICO_F) {
      for (let k = 0; k < 3; k++) {
        const a = face[k], b = face[(k + 1) % 3];
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const key = lo * 16 + hi;
        if (!edgeIndex.has(key)) {
          edgeIndex.set(key, edges.length);
          edges.push([lo, hi]);
        }
      }
    }
    const edgeBase = 12;
    const faceBase = 12 + 30 * (f - 1);
    const perFace = ((f - 1) * (f - 2)) / 2;
    const pos = new Float32Array(count * 3);
    const done = new Uint8Array(count);

    const setPos = (id: number, x: number, y: number, z: number) => {
      if (done[id]) return;
      const l = Math.hypot(x, y, z);
      pos[id * 3] = x / l;
      pos[id * 3 + 1] = y / l;
      pos[id * 3 + 2] = z / l;
      done[id] = 1;
    };
    const edgePoint = (x: number, y: number, t: number): number => {
      // point on edge x→y, t steps from x (0<t<f)
      const lo = Math.min(x, y), hi = Math.max(x, y);
      const e = edgeIndex.get(lo * 16 + hi)!;
      const tc = x === lo ? t : f - t; // steps from lo
      const id = edgeBase + e * (f - 1) + (tc - 1);
      if (!done[id]) {
        const A = icoV[lo], B = icoV[hi], s = tc / f;
        setPos(id, A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s, A[2] + (B[2] - A[2]) * s);
      }
      return id;
    };

    const tris: number[] = [];
    for (let fi = 0; fi < 20; fi++) {
      const [a, b, c] = ICO_F[fi];
      const A = icoV[a], B = icoV[b], C = icoV[c];
      // id grid for this face
      const ids: number[][] = [];
      let local = 0;
      for (let i = 0; i <= f; i++) {
        ids[i] = [];
        for (let j = 0; j <= f - i; j++) {
          let id: number;
          if (i === 0 && j === 0) id = a;
          else if (i === f) id = b;
          else if (j === f) id = c;
          else if (j === 0) id = edgePoint(a, b, i);
          else if (i === 0) id = edgePoint(a, c, j);
          else if (i + j === f) id = edgePoint(b, c, j);
          else {
            id = faceBase + fi * perFace + local++;
          }
          if (!done[id]) {
            const wb = i / f, wc = j / f, wa = 1 - wb - wc;
            setPos(id, A[0] * wa + B[0] * wb + C[0] * wc, A[1] * wa + B[1] * wb + C[1] * wc, A[2] * wa + B[2] * wb + C[2] * wc);
          }
          ids[i][j] = id;
        }
      }
      for (let i = 0; i < f; i++) {
        for (let j = 0; j < f - i; j++) {
          tris.push(ids[i][j], ids[i + 1][j], ids[i][j + 1]);
          if (i + j < f - 1) tris.push(ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]);
        }
      }
    }
    // icosahedron corner vertices
    for (let v = 0; v < 12; v++) setPos(v, icoV[v][0], icoV[v][1], icoV[v][2]);
    this.center = pos;

    // ── triangle centroids
    const triCount = tris.length / 3;
    const triC = new Float32Array(triCount * 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = tris[t * 3] * 3, i1 = tris[t * 3 + 1] * 3, i2 = tris[t * 3 + 2] * 3;
      const x = pos[i0] + pos[i1] + pos[i2], y = pos[i0 + 1] + pos[i1 + 1] + pos[i2 + 1], z = pos[i0 + 2] + pos[i1 + 2] + pos[i2 + 2];
      const l = Math.hypot(x, y, z);
      triC[t * 3] = x / l;
      triC[t * 3 + 1] = y / l;
      triC[t * 3 + 2] = z / l;
    }

    // ── incident triangles per vertex, as (x,y) "next" links for CCW walk
    const deg = new Uint8Array(count);
    for (let t = 0; t < tris.length; t++) deg[tris[t]]++;
    const start = new Uint32Array(count + 1);
    for (let i = 0; i < count; i++) start[i + 1] = start[i] + deg[i];
    const total = start[count];
    const incTri = new Int32Array(total);
    const incX = new Int32Array(total);
    const incY = new Int32Array(total);
    const fill = new Uint32Array(count);
    for (let t = 0; t < triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const v = tris[t * 3 + k];
        const x = tris[t * 3 + ((k + 1) % 3)];
        const y = tris[t * 3 + ((k + 2) % 3)];
        const slot = start[v] + fill[v]++;
        incTri[slot] = t;
        incX[slot] = x;
        incY[slot] = y;
      }
    }

    const nbr = new Int32Array(total);
    const corner = new Float32Array(total * 3);
    for (let v = 0; v < count; v++) {
      const s = start[v], d = deg[v];
      // walk CCW: from triangle (v,x,y) the next is the one whose x equals our y
      let slot = s;
      for (let k = 0; k < d; k++) {
        const t = incTri[slot];
        corner[(s + k) * 3] = triC[t * 3];
        corner[(s + k) * 3 + 1] = triC[t * 3 + 1];
        corner[(s + k) * 3 + 2] = triC[t * 3 + 2];
        const y = incY[slot];
        nbr[s + k] = y;
        let next = -1;
        for (let q = s; q < s + d; q++) if (incX[q] === y) { next = q; break; }
        slot = next < 0 ? slot : next;
      }
    }
    this.start = start;
    this.nbr = nbr;
    this.corner = corner;

    // ── metrics
    let sum = 0, n = 0;
    const inr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const cx = pos[i * 3], cy = pos[i * 3 + 1], cz = pos[i * 3 + 2];
      let minR = Infinity;
      const s = start[i], d = start[i + 1] - s;
      for (let k = 0; k < d; k++) {
        const j = nbr[s + k];
        if (j > i) {
          sum += Math.hypot(pos[j * 3] - cx, pos[j * 3 + 1] - cy, pos[j * 3 + 2] - cz);
          n++;
        }
        const a = (s + k) * 3, b = (s + ((k + 1) % d)) * 3;
        const mx = (corner[a] + corner[b]) / 2 - cx, my = (corner[a + 1] + corner[b + 1]) / 2 - cy, mz = (corner[a + 2] + corner[b + 2]) / 2 - cz;
        minR = Math.min(minR, Math.hypot(mx, my, mz));
      }
      inr[i] = minR;
    }
    this.unitEdge = sum / n;
    this.inradius = inr;
  }

  degree(i: number): number {
    return this.start[i + 1] - this.start[i];
  }
  isPentagon(i: number): boolean {
    return this.degree(i) === 5;
  }
  /** neighbour k of tile i */
  neighbor(i: number, k: number): number {
    const d = this.degree(i);
    return this.nbr[this.start[i] + (((k % d) + d) % d)];
  }
  neighbors(i: number): number[] {
    return Array.from(this.nbr.subarray(this.start[i], this.start[i + 1]));
  }
  /** index k such that neighbor(i,k) === j, or -1 */
  neighborIndex(i: number, j: number): number {
    const s = this.start[i], e = this.start[i + 1];
    for (let q = s; q < e; q++) if (this.nbr[q] === j) return q - s;
    return -1;
  }
  areNeighbors(i: number, j: number): boolean {
    return this.neighborIndex(i, j) >= 0;
  }
  /** Write unit centre of tile i into out[o..o+2] */
  centerOf(i: number, out: { x: number; y: number; z: number }): typeof out {
    out.x = this.center[i * 3];
    out.y = this.center[i * 3 + 1];
    out.z = this.center[i * 3 + 2];
    return out;
  }
  dot(a: number, b: number): number {
    const c = this.center;
    return c[a * 3] * c[b * 3] + c[a * 3 + 1] * c[b * 3 + 1] + c[a * 3 + 2] * c[b * 3 + 2];
  }
  /** great-circle angle between tile centres (radians) */
  angle(a: number, b: number): number {
    return Math.acos(Math.max(-1, Math.min(1, this.dot(a, b))));
  }

  /** Tile containing (nearest to) direction (x,y,z) — need not be normalised. Greedy walk, O(f). */
  tileAt(x: number, y: number, z: number, hint = this.hint): number {
    const c = this.center;
    let cur = hint >= 0 && hint < this.count ? hint : 0;
    let best = c[cur * 3] * x + c[cur * 3 + 1] * y + c[cur * 3 + 2] * z;
    // jump-start from the best icosahedron vertex if hint is far
    for (let v = 0; v < 12; v++) {
      const d = c[v * 3] * x + c[v * 3 + 1] * y + c[v * 3 + 2] * z;
      if (d > best) {
        best = d;
        cur = v;
      }
    }
    for (let guard = 0; guard < 4096; guard++) {
      let moved = false;
      const s = this.start[cur], e = this.start[cur + 1];
      for (let q = s; q < e; q++) {
        const j = this.nbr[q];
        const d = c[j * 3] * x + c[j * 3 + 1] * y + c[j * 3 + 2] * z;
        if (d > best) {
          best = d;
          cur = j;
          moved = true;
        }
      }
      if (!moved) break;
    }
    this.hint = cur;
    return cur;
  }

  /** All tiles within `radius` steps of `i` (BFS), including i. */
  disk(i: number, radius: number): number[] {
    if (radius <= 0) return [i];
    const seen = new Set<number>([i]);
    let frontier = [i];
    const out = [i];
    for (let r = 0; r < radius; r++) {
      const next: number[] = [];
      for (const t of frontier) {
        const s = this.start[t], e = this.start[t + 1];
        for (let q = s; q < e; q++) {
          const j = this.nbr[q];
          if (!seen.has(j)) {
            seen.add(j);
            next.push(j);
            out.push(j);
          }
        }
      }
      frontier = next;
    }
    return out;
  }

  /** Tiles exactly `radius` steps away. */
  ring(i: number, radius: number): number[] {
    if (radius <= 0) return [i];
    const inner = new Set(this.disk(i, radius - 1));
    return this.disk(i, radius).filter((t) => !inner.has(t));
  }

  /** Tiles whose centre lies within `angle` radians of tile i's centre (BFS, so it's connected). */
  withinAngle(i: number, angle: number): number[] {
    const cosA = Math.cos(angle);
    const seen = new Set<number>([i]);
    const out = [i];
    let frontier = [i];
    while (frontier.length) {
      const next: number[] = [];
      for (const t of frontier) {
        const s = this.start[t], e = this.start[t + 1];
        for (let q = s; q < e; q++) {
          const j = this.nbr[q];
          if (seen.has(j)) continue;
          seen.add(j);
          if (this.dot(i, j) >= cosA) {
            out.push(j);
            next.push(j);
          }
        }
      }
      frontier = next;
    }
    return out;
  }

  /**
   * Footprint for multi-tile buildings: size 1 → [i]; 7 → i + ring 1; 19 → i + rings 1..2.
   * (Pentagons yield 6 / 16 tiles.)
   */
  footprint(i: number, size: 1 | 7 | 19): number[] {
    return size === 1 ? [i] : size === 7 ? this.disk(i, 1) : this.disk(i, 2);
  }

  /** Approximate great-circle path of adjacent tiles from a to b (inclusive). */
  path(a: number, b: number): number[] {
    if (a === b) return [a];
    const out = [a];
    let cur = a;
    const c = this.center;
    const bx = c[b * 3], by = c[b * 3 + 1], bz = c[b * 3 + 2];
    for (let guard = 0; guard < this.count && cur !== b; guard++) {
      // step to the neighbour that minimises distance to b, tie-broken toward the great circle
      const ax = c[cur * 3], ay = c[cur * 3 + 1], az = c[cur * 3 + 2];
      // plane of the great circle through cur and b
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      let best = -1, bestScore = -Infinity;
      const s = this.start[cur], e = this.start[cur + 1];
      for (let q = s; q < e; q++) {
        const j = this.nbr[q];
        const jx = c[j * 3], jy = c[j * 3 + 1], jz = c[j * 3 + 2];
        const toward = jx * bx + jy * by + jz * bz;
        const off = Math.abs(jx * nx + jy * ny + jz * nz);
        const score = toward - off * 0.35;
        if (score > bestScore) {
          bestScore = score;
          best = j;
        }
      }
      if (best < 0) break;
      cur = best;
      out.push(cur);
    }
    return out;
  }
}

const cache = new Map<number, HexGrid>();
export function getGrid(frequency: number): HexGrid {
  let g = cache.get(frequency);
  if (!g) {
    g = new HexGrid(frequency);
    cache.set(frequency, g);
  }
  return g;
}
