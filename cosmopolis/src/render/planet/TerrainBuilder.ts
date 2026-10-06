/**
 * OWNER: terrain.
 * TerrainBuilder — splits the hex sphere into 20 chunks (one per icosahedron face) and builds their geometry:
 *
 *   terrain chunk  stylised terraced hex tiles: inset top polygon + a band ring whose outer corners drop by BEVEL
 *                  wherever the tile overlooks a lower neighbour (rounded, readable cliff lips), and vertical cliff
 *                  walls down to the lower neighbour (strata are drawn by the shader from world height).
 *                  Deep sea-floor tiles skip the band (cheap, never seen closely).
 *   water chunk    a fan per water tile on the UNIT sphere (the shader scales it to the live sea level), carrying the
 *                  seabed height per vertex (corner = mean of the 3 tiles that meet there) for depth colour & foam.
 *
 * Per-vertex attributes (terrain): position · normal (int8) · aCol (sRGB rgb + AO, u8) · aTile (u16/f32) ·
 * aLocal (ideal hex coords, int8; walls: (v, wallHeight/8)) · aInfo (biome, part, degree, extra) (u8).
 */
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import { Biome } from '../../core/types';
import type { HexGrid } from '../../world/hexsphere';
import type { Planet } from '../../world/planet';
import { renderBiome, tileColor, type Rgb, type SurfacePalette } from './palette';

/** top polygon inset (fraction of the centre→corner distance) */
export const INSET = 0.86;
/** how far a cliff lip's outer corner drops (world units) */
export const BEVEL = 0.075;
export const PART_TOP = 0;
export const PART_WALL = 1;
export const PART_DEEP = 2;

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

export interface ChunkInfo {
  id: number;
  tiles: Int32Array;
  /** unit direction of the chunk centre */
  dir: Vector3;
  /** angular radius of the chunk (centre → farthest tile corner), radians */
  angle: number;
}

export function partition(grid: HexGrid): { chunkOf: Uint8Array; chunks: ChunkInfo[] } {
  const centres = ICO_F.map((f) => {
    const v = new Vector3();
    for (const k of f) v.add(new Vector3(ICO_V[k][0], ICO_V[k][1], ICO_V[k][2]).normalize());
    return v.normalize();
  });
  const n = grid.count;
  const chunkOf = new Uint8Array(n);
  const counts = new Int32Array(centres.length);
  const C = grid.center;
  for (let i = 0; i < n; i++) {
    let best = 0, bestD = -2;
    for (let f = 0; f < centres.length; f++) {
      const d = C[i * 3] * centres[f].x + C[i * 3 + 1] * centres[f].y + C[i * 3 + 2] * centres[f].z;
      if (d > bestD) {
        bestD = d;
        best = f;
      }
    }
    chunkOf[i] = best;
    counts[best]++;
  }
  const lists = centres.map((_, f) => new Int32Array(counts[f]));
  const fill = new Int32Array(centres.length);
  for (let i = 0; i < n; i++) lists[chunkOf[i]][fill[chunkOf[i]]++] = i;
  const chunks: ChunkInfo[] = centres.map((dir, id) => {
    let minDot = 1;
    for (const t of lists[id]) {
      for (let q = grid.start[t]; q < grid.start[t + 1]; q++) {
        const d = grid.corner[q * 3] * dir.x + grid.corner[q * 3 + 1] * dir.y + grid.corner[q * 3 + 2] * dir.z;
        if (d < minDot) minDot = d;
      }
    }
    return { id, tiles: lists[id], dir, angle: Math.acos(Math.max(-1, Math.min(1, minDot))) };
  });
  return { chunkOf, chunks };
}

/** Bounding sphere for a chunk (heights up to `maxH` above the radius). */
export function chunkBounds(planet: Planet, info: ChunkInfo, maxH: number): Sphere {
  const R = planet.radius;
  const chord = 2 * Math.sin(info.angle / 2) * (R + maxH);
  return new Sphere(info.dir.clone().multiplyScalar(R), chord + maxH + 1);
}

const _col: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Build the terrain geometry of one chunk. `deepBelow`: water tiles with elevation below this level skip their
 * bevel band (sea floor far below the waves).
 */
export function buildTerrainChunk(planet: Planet, info: ChunkInfo, pal: SurfacePalette, deepBelow: number): BufferGeometry {
  const g = planet.grid;
  const R = planet.radius;
  const tiles = info.tiles;
  const elev = planet.elevation;
  // ── count
  let nv = 0, ni = 0;
  for (let ti = 0; ti < tiles.length; ti++) {
    const i = tiles[ti];
    const s = g.start[i], d = g.start[i + 1] - s;
    const deep = planet.isWater(i) && elev[i] < deepBelow;
    nv += deep ? d : 2 * d;
    ni += (d - 2) * 3 + (deep ? 0 : d * 6);
    for (let k = 0; k < d; k++) {
      if (elev[g.nbr[s + k]] < elev[i]) {
        nv += 4;
        ni += 6;
      }
    }
  }
  const pos = new Float32Array(nv * 3);
  const nrm = new Int8Array(nv * 3);
  const col = new Uint8Array(nv * 4);
  const tileA = planet.count < 65536 ? new Uint16Array(nv) : new Float32Array(nv);
  const loc = new Int8Array(nv * 2);
  const info4 = new Uint8Array(nv * 4);
  const index = nv < 65536 ? new Uint16Array(ni) : new Uint32Array(ni);
  let v = 0, x = 0;
  const C = g.center, K = g.corner;
  const lower = new Uint8Array(8);

  const putV = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, r: number, gg: number, b: number, ao: number, tile: number, lx: number, ly: number, biome: number, part: number, deg: number, extra: number) => {
    pos[v * 3] = px; pos[v * 3 + 1] = py; pos[v * 3 + 2] = pz;
    nrm[v * 3] = Math.round(nx * 127); nrm[v * 3 + 1] = Math.round(ny * 127); nrm[v * 3 + 2] = Math.round(nz * 127);
    col[v * 4] = r; col[v * 4 + 1] = gg; col[v * 4 + 2] = b; col[v * 4 + 3] = ao;
    tileA[v] = tile;
    loc[v * 2] = Math.round(Math.max(-1, Math.min(1, lx)) * 127);
    loc[v * 2 + 1] = Math.round(Math.max(-1, Math.min(1, ly)) * 127);
    info4[v * 4] = biome; info4[v * 4 + 1] = part; info4[v * 4 + 2] = deg; info4[v * 4 + 3] = extra;
    return v++;
  };

  for (let ti = 0; ti < tiles.length; ti++) {
    const i = tiles[ti];
    const s = g.start[i], d = g.start[i + 1] - s;
    const cx = C[i * 3], cy = C[i * 3 + 1], cz = C[i * 3 + 2];
    const h = planet.heightOf(i);
    const r = R + h;
    const water = planet.isWater(i);
    const deep = water && elev[i] < deepBelow;
    const biome = renderBiome(planet, i);
    tileColor(planet, i, pal, _col);
    const cr = Math.round(_col.r * 255), cg = Math.round(_col.g * 255), cb = Math.round(_col.b * 255);
    let higher = 0;
    for (let k = 0; k < d; k++) {
      const m = g.nbr[s + k];
      lower[k] = elev[m] < elev[i] ? 1 : 0;
      if (elev[m] > elev[i]) higher++;
    }
    const ao = Math.round(255 * (1 - 0.05 * Math.min(4, higher)));
    const feat = planet.feature[i];
    const base = v;
    if (deep) {
      for (let k = 0; k < d; k++) {
        const a = (s + k) * 3;
        const ang = (Math.PI * 2 * k) / d;
        putV(K[a] * r, K[a + 1] * r, K[a + 2] * r, cx, cy, cz, cr, cg, cb, ao, i, Math.cos(ang), Math.sin(ang), biome, PART_DEEP, d, feat);
      }
      for (let k = 1; k < d - 1; k++) {
        index[x++] = base; index[x++] = base + k; index[x++] = base + k + 1;
      }
    } else {
      // inset ring
      for (let k = 0; k < d; k++) {
        const a = (s + k) * 3;
        let px = cx + (K[a] - cx) * INSET, py = cy + (K[a + 1] - cy) * INSET, pz = cz + (K[a + 2] - cz) * INSET;
        const l = r / Math.hypot(px, py, pz);
        px *= l; py *= l; pz *= l;
        const ang = (Math.PI * 2 * k) / d;
        putV(px, py, pz, cx, cy, cz, cr, cg, cb, ao, i, Math.cos(ang) * INSET, Math.sin(ang) * INSET, biome, PART_TOP, d, feat);
      }
      // outer ring (bevelled where a lower neighbour touches the corner)
      for (let k = 0; k < d; k++) {
        const a = (s + k) * 3;
        const bev = lower[k] || lower[(k + d - 1) % d];
        const rr = bev ? r - BEVEL : r;
        let nx = cx, ny = cy, nz = cz;
        if (bev) {
          // tilt the normal outward toward the corner → soft rounded lip
          let ox = K[a] - cx, oy = K[a + 1] - cy, oz = K[a + 2] - cz;
          const dp = ox * cx + oy * cy + oz * cz;
          ox -= cx * dp; oy -= cy * dp; oz -= cz * dp;
          const ol = Math.hypot(ox, oy, oz) || 1;
          nx = cx * 0.62 + (ox / ol) * 0.78;
          ny = cy * 0.62 + (oy / ol) * 0.78;
          nz = cz * 0.62 + (oz / ol) * 0.78;
          const nl = Math.hypot(nx, ny, nz);
          nx /= nl; ny /= nl; nz /= nl;
        }
        const ang = (Math.PI * 2 * k) / d;
        putV(K[a] * rr, K[a + 1] * rr, K[a + 2] * rr, nx, ny, nz, cr, cg, cb, bev ? Math.round(ao * 0.96) : ao, i, Math.cos(ang), Math.sin(ang), biome, PART_TOP, d, feat);
      }
      for (let k = 1; k < d - 1; k++) {
        index[x++] = base; index[x++] = base + k; index[x++] = base + k + 1;
      }
      for (let k = 0; k < d; k++) {
        const k1 = (k + 1) % d;
        const P0 = base + k, P1 = base + k1, Q0 = base + d + k, Q1 = base + d + k1;
        index[x++] = P0; index[x++] = Q0; index[x++] = Q1;
        index[x++] = P0; index[x++] = Q1; index[x++] = P1;
      }
    }
    // cliff walls toward lower neighbours
    for (let k = 0; k < d; k++) {
      if (!lower[k]) continue;
      const k1 = (k + 1) % d;
      const m = g.nbr[s + k];
      const hn = planet.heightOf(m);
      const a = (s + k) * 3, b = (s + k1) * 3;
      const topBevA = deep ? 0 : BEVEL;
      const rTop = r - topBevA;
      const rBot = R + hn - BEVEL * 1.5;
      // outward normal: centre → edge midpoint, made tangent
      let ox = (K[a] + K[b]) * 0.5 - cx, oy = (K[a + 1] + K[b + 1]) * 0.5 - cy, oz = (K[a + 2] + K[b + 2]) * 0.5 - cz;
      const dp = ox * cx + oy * cy + oz * cz;
      ox -= cx * dp; oy -= cy * dp; oz -= cz * dp;
      const ol = Math.hypot(ox, oy, oz) || 1;
      ox /= ol; oy /= ol; oz /= ol;
      const wallH = Math.min(1, (rTop - rBot) / 8);
      const nb = planet.biome[m];
      const extra = nb === Biome.Lava ? 1 : planet.isWater(m) ? 2 : 0;
      const w0 = putV(K[a] * rTop, K[a + 1] * rTop, K[a + 2] * rTop, ox, oy, oz, cr, cg, cb, 255, i, 1, wallH, biome, PART_WALL, d, extra);
      const w1 = putV(K[a] * rBot, K[a + 1] * rBot, K[a + 2] * rBot, ox, oy, oz, cr, cg, cb, 255, i, 0, wallH, biome, PART_WALL, d, extra);
      const w2 = putV(K[b] * rBot, K[b + 1] * rBot, K[b + 2] * rBot, ox, oy, oz, cr, cg, cb, 255, i, 0, wallH, biome, PART_WALL, d, extra);
      const w3 = putV(K[b] * rTop, K[b + 1] * rTop, K[b + 2] * rTop, ox, oy, oz, cr, cg, cb, 255, i, 1, wallH, biome, PART_WALL, d, extra);
      index[x++] = w0; index[x++] = w1; index[x++] = w2;
      index[x++] = w0; index[x++] = w2; index[x++] = w3;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('normal', new BufferAttribute(nrm, 3, true));
  geo.setAttribute('aCol', new BufferAttribute(col, 4, true));
  geo.setAttribute('aTile', new BufferAttribute(tileA, 1));
  geo.setAttribute('aLocal', new BufferAttribute(loc, 2, true));
  geo.setAttribute('aInfo', new BufferAttribute(info4, 4));
  geo.setIndex(new BufferAttribute(index, 1));
  return geo;
}

/**
 * Water fans for tiles with elevation < coverLevel (= ceil(seaOffset): exactly the tiles that can be under water at
 * the current sea level). Positions are unit directions; the shader scales them to the live water radius.
 */
export function buildWaterChunk(planet: Planet, info: ChunkInfo, coverLevel: number): BufferGeometry | null {
  if (!planet.spec.hasOcean) return null;
  const g = planet.grid;
  const elev = planet.elevation;
  const tiles = info.tiles;
  let nv = 0, ni = 0;
  for (let ti = 0; ti < tiles.length; ti++) {
    const i = tiles[ti];
    if (elev[i] >= coverLevel) continue;
    const d = g.degree(i);
    nv += d + 1;
    ni += d * 3;
  }
  if (!nv) return null;
  const pos = new Float32Array(nv * 3);
  const bed = new Float32Array(nv);
  const tileA = planet.count < 65536 ? new Uint16Array(nv) : new Float32Array(nv);
  const loc = new Int8Array(nv * 2);
  const deg = new Uint8Array(nv);
  const index = nv < 65536 ? new Uint16Array(ni) : new Uint32Array(ni);
  const C = g.center, K = g.corner;
  let v = 0, x = 0;
  for (let ti = 0; ti < tiles.length; ti++) {
    const i = tiles[ti];
    if (elev[i] >= coverLevel) continue;
    const s = g.start[i], d = g.start[i + 1] - s;
    const hi = planet.heightOf(i);
    const c0 = v;
    pos[v * 3] = C[i * 3]; pos[v * 3 + 1] = C[i * 3 + 1]; pos[v * 3 + 2] = C[i * 3 + 2];
    // centre: own seabed blended with the ring average → softer hex-shaped depth gradients
    let ring = 0;
    for (let k = 0; k < d; k++) ring += planet.heightOf(g.nbr[s + k]);
    bed[v] = hi * 0.6 + (ring / d) * 0.4;
    tileA[v] = i;
    deg[v] = d;
    v++;
    for (let k = 0; k < d; k++) {
      const a = (s + k) * 3;
      pos[v * 3] = K[a]; pos[v * 3 + 1] = K[a + 1]; pos[v * 3 + 2] = K[a + 2];
      const m0 = g.nbr[s + ((k + d - 1) % d)], m1 = g.nbr[s + k];
      bed[v] = (hi + planet.heightOf(m0) + planet.heightOf(m1)) / 3;
      tileA[v] = i;
      const ang = (Math.PI * 2 * k) / d;
      loc[v * 2] = Math.round(Math.cos(ang) * 127);
      loc[v * 2 + 1] = Math.round(Math.sin(ang) * 127);
      deg[v] = d;
      v++;
    }
    for (let k = 0; k < d; k++) {
      index[x++] = c0; index[x++] = c0 + 1 + k; index[x++] = c0 + 1 + ((k + 1) % d);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aBed', new BufferAttribute(bed, 1));
  geo.setAttribute('aTile', new BufferAttribute(tileA, 1));
  geo.setAttribute('aLocal', new BufferAttribute(loc, 2, true));
  geo.setAttribute('aDeg', new BufferAttribute(deg, 1));
  geo.setIndex(new BufferAttribute(index, 1));
  return geo;
}
