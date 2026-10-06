/**
 * OWNER: terrain.
 * Procedural planet generation — generatePlanet(spec) → a fully initialised Planet (elevation, biome, feature).
 * Deterministic per spec (seed, type, frequency, oceanLevel, mountains, temperature, tags). Budget: < 150 ms at f=40,
 * < 600 ms at f=64.
 *
 * Pipeline (all per-tile typed arrays, no allocation in the inner loops):
 *   1. continents   domain-warped fbm + a few continental "blobs" (+ island noise on ocean worlds), sea level by
 *                   percentile (archetype coverage + spec.oceanLevel)
 *   2. relief       lowland hills, ridged mountain belts (spec.mountains), mesas/plateaus with cliffs, valleys,
 *                   coastal ramps (beaches vs. sea cliffs), continental shelves (shallow turquoise → deep ocean)
 *   3. archetype    impact craters with rims & maria (barren), volcanoes with lava calderas, lava rivers & lava seas
 *                   (volcanic), Voronoi metal plates + coolant canals (machine), atolls (ocean), ice shelves (cold)
 *   4. cleanup      slope limiter (readable terraces), 1-tile spike/pit removal, tiny-lake filling
 *   5. settlement   the home planet (tags: 'home') gets a large flat temperate plain; every other world a smaller
 *                   landing plain. Stored in planet.ext.terrain.site (see `homeSite`).
 *   6. water        rivers carved to the sea along valleys (+ source lakes), glacial lakes, oases
 *   7. climate      temperature (latitude, altitude, spec.temperature) × moisture (noise, coasts, rivers) →
 *                   per-archetype biome classifier (polar caps, deserts, swamps, fungal forests, crystal fields…)
 *   8. features     clustered: forests by moisture, ore near mountains, vents near volcanic areas, crystal fields,
 *                   kelp beds, rare ruin sites (many on machine worlds), crater scars
 *
 * Extra exports for other modules:
 *   homeSite(planet)            → recommended first-city tile (flat plain; falls back to a scored search)
 *   deriveBiome(planet, tile)   → the biome this tile "should" have at its current elevation (use after terraforming:
 *                                 ops.setBiome(tiles, …) one by one or grouped by result)
 *   PLANET_GEN_VERSION
 */
import { Biome, Feature, type PlanetSpec, type PlanetTypeId } from '../core/types';
import { Noise3, Rng, clamp, hash2, hashFloat } from '../core/rng';
import { PLANET_TYPES, type PlanetArchetype } from '../content/planetTypes';
import type { HexGrid } from './hexsphere';
import { MAX_LEVEL, MIN_LEVEL, Planet } from './planet';

export const PLANET_GEN_VERSION = 2;

// ───────────────────────────────────────────────────────────── archetype relief profiles

interface Profile {
  /** continent noise frequency */
  freq: number;
  /** domain warp strength */
  warp: number;
  /** continental blobs added to the noise */
  blobs: number;
  /** island noise weight (archipelagos) */
  islands: number;
  /** lowland relief (levels) */
  lowland: number;
  /** mountain range height (levels) at spec.mountains = 0.5 */
  ridge: number;
  /** width of the mountain belts 0..1 */
  belts: number;
  /** plateau / mesa coverage 0..1 */
  plateau: number;
  plateauHeight: number;
  /** valley carving 0..1 */
  valleys: number;
  /** max ocean depth (levels) */
  depth: number;
  /** rivers per 1000 tiles */
  rivers: number;
  /** extra lakes per 1000 tiles */
  lakes: number;
  /** coastal slope range (levels per tile inland) */
  coast: [number, number];
  /** levels of fine detail noise */
  detail: number;
}

const P = (o: Partial<Profile>): Profile => ({
  freq: 1.15, warp: 0.35, blobs: 3, islands: 0.12, lowland: 3.5, ridge: 9, belts: 0.42, plateau: 0.2, plateauHeight: 3,
  valleys: 0.4, depth: 7, rivers: 0.5, lakes: 0.12, coast: [0.7, 2.2], detail: 0.7, ...o,
});

const PROFILES: Record<PlanetTypeId, Profile> = {
  terran: P({ blobs: 5, islands: 0.07, rivers: 0.6, plateau: 0.18 }),
  desert: P({ freq: 1.3, blobs: 0, islands: 0.05, lowland: 3, ridge: 7, belts: 0.36, plateau: 0.85, plateauHeight: 4, depth: 4, rivers: 0.12, lakes: 0.28, coast: [0.6, 3] }),
  arctic: P({ freq: 1.2, warp: 0.4, blobs: 3, islands: 0.16, lowland: 3, ridge: 8, plateau: 0.4, plateauHeight: 3, depth: 6, rivers: 0.12, lakes: 0.2, coast: [0.9, 3.5] }),
  volcanic: P({ freq: 1.4, warp: 0.3, blobs: 0, islands: 0, lowland: 4, ridge: 6, belts: 0.34, plateau: 0.3, plateauHeight: 3, rivers: 0, lakes: 0 }),
  ocean: P({ freq: 1.6, warp: 0.45, blobs: 0, islands: 0.62, lowland: 3, ridge: 5, belts: 0.3, plateau: 0.08, depth: 8, rivers: 0.08, lakes: 0, coast: [0.8, 2] }),
  jungle: P({ freq: 1.2, warp: 0.42, blobs: 4, islands: 0.16, lowland: 3, ridge: 8, plateau: 0.36, plateauHeight: 4, depth: 6, rivers: 1.0, lakes: 0.25, coast: [0.55, 1.8] }),
  barren: P({ freq: 1.0, warp: 0.2, blobs: 0, islands: 0, lowland: 3, ridge: 4, belts: 0.24, plateau: 0.12, valleys: 0.15, rivers: 0, lakes: 0 }),
  toxic: P({ freq: 1.3, warp: 0.5, blobs: 3, islands: 0.2, lowland: 3, ridge: 6, plateau: 0.2, depth: 5, rivers: 0.4, lakes: 0.3, coast: [0.5, 1.8] }),
  crystal: P({ freq: 1.25, warp: 0.35, blobs: 3, islands: 0.1, lowland: 3, ridge: 10, belts: 0.5, plateau: 0.5, plateauHeight: 4, depth: 5, rivers: 0.22, lakes: 0.15, coast: [0.8, 3] }),
  fungal: P({ freq: 1.2, warp: 0.45, blobs: 4, islands: 0.2, lowland: 3, ridge: 6, belts: 0.35, plateau: 0.25, depth: 5, rivers: 0.5, lakes: 0.25 }),
  tundra: P({ freq: 1.15, warp: 0.35, blobs: 4, islands: 0.15, lowland: 3, ridge: 7, belts: 0.4, plateau: 0.2, depth: 6, rivers: 0.8, lakes: 0.6, coast: [0.6, 2] }),
  machine: P({ freq: 1.0, warp: 0.25, blobs: 2, islands: 0, lowland: 2, ridge: 4, belts: 0.3, plateau: 0, valleys: 0, depth: 3, rivers: 0, lakes: 0, coast: [2, 4] }),
};

// river / special tile marks (Gen.mark)
const M_RIVER = 1;
const M_LAKE = 2;
const M_LAVA = 3; // lava sea / lava river / caldera
const M_CRATER = 4; // crater floor
const M_SHELF = 5; // polar ice shelf (former sea)

interface Gen {
  p: Planet;
  spec: PlanetSpec;
  arch: PlanetArchetype;
  prof: Profile;
  g: HexGrid;
  n: number;
  C: Float32Array;
  rng: Rng;
  /** continuous height in levels */
  lvl: Float32Array;
  cont: Float32Array;
  wx: Float32Array;
  wy: Float32Array;
  wz: Float32Array;
  /** mountain mask 0..1 */
  mount: Float32Array;
  /** plateau mask 0..1 */
  plat: Float32Array;
  temp: Float32Array;
  moist: Float32Array;
  dsea: Int16Array;
  mark: Uint8Array;
  core: Uint8Array;
  queue: Int32Array;
  rug: number;
  sea: boolean;
}

// ───────────────────────────────────────────────────────────── public API

export function generatePlanet(spec: PlanetSpec): Planet {
  const p = new Planet(spec);
  const arch = PLANET_TYPES[spec.type] ?? PLANET_TYPES.terran;
  const prof = PROFILES[spec.type] ?? PROFILES.terran;
  const n = p.count;
  const G: Gen = {
    p, spec, arch, prof, g: p.grid, n, C: p.grid.center,
    rng: new Rng(hash2(spec.seed | 0, 0x27d4eb2d)),
    lvl: new Float32Array(n), cont: new Float32Array(n),
    wx: new Float32Array(n), wy: new Float32Array(n), wz: new Float32Array(n),
    mount: new Float32Array(n), plat: new Float32Array(n),
    temp: new Float32Array(n), moist: new Float32Array(n),
    dsea: new Int16Array(n), mark: new Uint8Array(n), core: new Uint8Array(n), queue: new Int32Array(n),
    rug: clamp(0.5 + (spec.mountains ?? 0.5), 0.3, 1.6),
    sea: spec.hasOcean,
  };

  continents(G);
  relief(G);
  if (spec.type === 'barren') craters(G);
  if (spec.type === 'volcanic') volcanoes(G);
  if (spec.type === 'machine') plates(G);
  if (spec.type === 'ocean') atolls(G);
  quantize(G);
  cleanup(G);
  const site = settle(G);
  if (G.sea) {
    seaShape(G);
    rivers(G);
    lakes(G);
    fillPuddles(G);
  }
  if (spec.type === 'volcanic') lavaSeas(G);
  climate(G);
  if (G.sea) iceShelves(G);
  biomes(G);
  features(G);
  if (site >= 0) dressSite(G, site);

  p.ext.terrain = { site, v: PLANET_GEN_VERSION };
  p.city.style = arch.defaultStyle;
  p.terrainVersion++;
  return p;
}

/** Recommended first-city tile: the generated plain, or the best flat temperate area found by a quick search. */
export function homeSite(planet: Planet): number {
  const ext = planet.ext.terrain as { site?: number } | undefined;
  if (ext && typeof ext.site === 'number' && ext.site >= 0 && ext.site < planet.count && !planet.isWater(ext.site)) return ext.site;
  const rng = new Rng(hash2(planet.spec.seed | 0, 77));
  let best = 0, bestScore = -Infinity;
  for (let k = 0; k < 300; k++) {
    const t = rng.int(0, planet.count - 1);
    if (planet.isWater(t)) continue;
    const e = planet.elevation[t];
    let s = 0;
    for (const q of planet.grid.disk(t, 5)) s += planet.isWater(q) ? -1.5 : Math.abs(planet.elevation[q] - e) <= 1 ? 1 : -0.4;
    s -= Math.abs(planet.grid.center[t * 3 + 1]) * 25;
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}

/**
 * The biome a tile should have at its current elevation (water status, latitude, altitude and the planet's climate).
 * Deterministic; cheap enough for terraforming brushes (a few hundred tiles per call).
 */
export function deriveBiome(planet: Planet, tile: number): Biome {
  const spec = planet.spec;
  const arch = PLANET_TYPES[spec.type] ?? PLANET_TYPES.terran;
  const g = planet.grid;
  const C = g.center;
  const x = C[tile * 3], y = C[tile * 3 + 1], z = C[tile * 3 + 2];
  const nM = noiseFor(spec.seed, 0x5bd1e995);
  const nX = noiseFor(spec.seed, 121);
  const e = planet.elevation[tile];
  // distance to water, up to 4 rings
  let dsea = 9;
  if (planet.isWater(tile)) dsea = 0;
  else if (spec.hasOcean) {
    for (let r = 1; r <= 4 && dsea === 9; r++) for (const q of g.ring(tile, r)) if (planet.isWater(q)) { dsea = r; break; }
  }
  const t = temperatureAt(spec, y, Math.max(0, e - planet.seaOffset), nM.noise(x * 3.1, y * 3.1, z * 3.1));
  const m = clamp(0.5 + 0.55 * nM.fbm(x * 2.1 + 4, y * 2.1, z * 2.1, 3) + (spec.hasOcean ? 0.22 * Math.exp(-dsea / 5) : -0.1), 0, 1);
  if (planet.isWater(tile)) return seabedBiome(spec, arch, e - planet.seaOffset, t);
  let maxNbrDiff = 0;
  for (let q = g.start[tile]; q < g.start[tile + 1]; q++) maxNbrDiff = Math.max(maxNbrDiff, Math.abs(planet.elevation[g.nbr[q]] - e));
  return classify(spec.type, arch, {
    t, tr: t - spec.temperature, m, e: e - planet.seaOffset, lat: Math.abs(y), dsea, mount: e >= 8 ? 1 : 0, plat: 0, cliff: maxNbrDiff >= 3 ? 1 : 0,
    crys: nX.fbm(x * 4.2 + 9, y * 4.2, z * 4.2, 2), mark: 0,
  });
}

const noiseCache = new Map<number, Noise3>();
function noiseFor(seed: number, salt: number): Noise3 {
  const key = hash2(seed | 0, salt);
  let nz = noiseCache.get(key);
  if (!nz) {
    if (noiseCache.size > 16) noiseCache.clear();
    nz = new Noise3(key);
    noiseCache.set(key, nz);
  }
  return nz;
}

// ───────────────────────────────────────────────────────────── 1. continents

function continents(G: Gen): void {
  const { n, C, prof, spec } = G;
  const nW = new Noise3(hash2(spec.seed | 0, 11));
  const nC = new Noise3(hash2(spec.seed | 0, 12));
  const nI = new Noise3(hash2(spec.seed | 0, 13));
  const F = prof.freq;
  const W = prof.warp;
  // continental blobs
  const rng = new Rng(hash2(spec.seed | 0, 14));
  const nb = prof.blobs;
  const bx = new Float32Array(nb), by = new Float32Array(nb), bz = new Float32Array(nb), bc = new Float32Array(nb), ba = new Float32Array(nb);
  for (let k = 0; k < nb; k++) {
    const u = rng.range(-1, 1), th = rng.range(0, Math.PI * 2), s = Math.sqrt(1 - u * u);
    bx[k] = s * Math.cos(th);
    by[k] = u * 0.85;
    bz[k] = s * Math.sin(th);
    const l = Math.hypot(bx[k], by[k], bz[k]);
    bx[k] /= l; by[k] /= l; bz[k] /= l;
    const rad = rng.range(0.38, 0.8);
    bc[k] = Math.cos(rad);
    ba[k] = rng.range(0.22, 0.36);
  }
  for (let i = 0; i < n; i++) {
    const x = C[i * 3], y = C[i * 3 + 1], z = C[i * 3 + 2];
    const wx = x + W * nW.fbm(x * 1.7 + 3.1, y * 1.7, z * 1.7, 2);
    const wy = y + W * nW.fbm(x * 1.7, y * 1.7 + 7.9, z * 1.7, 2);
    const wz = z + W * nW.fbm(x * 1.7, y * 1.7, z * 1.7 + 5.3, 2);
    G.wx[i] = wx; G.wy[i] = wy; G.wz[i] = wz;
    let c = nC.fbm(wx * F, wy * F, wz * F, 5);
    for (let k = 0; k < nb; k++) {
      const d = x * bx[k] + y * by[k] + z * bz[k];
      if (d > bc[k]) {
        const t = (d - bc[k]) / (1 - bc[k]);
        c += ba[k] * Math.min(1, t * 2.2);
      }
    }
    if (prof.islands > 0) c += prof.islands * nI.fbm(wx * 5.5, wy * 5.5, wz * 5.5, 3);
    G.cont[i] = c;
  }
}

// ───────────────────────────────────────────────────────────── 2. relief

function relief(G: Gen): void {
  const { n, prof, spec, arch } = G;
  const cont = G.cont;
  const sorted = Float32Array.from(cont).sort();
  const cmin = sorted[0], cmax = sorted[n - 1];
  const coverage = G.sea ? clamp(arch.oceanCoverage + (spec.oceanLevel ?? 0) * 0.35, 0, 0.95) : 0;
  const thr = G.sea ? sorted[Math.min(n - 1, Math.floor(coverage * n))] : cmin - 1e-6;
  const nB = new Noise3(hash2(spec.seed | 0, 21));
  const nR = new Noise3(hash2(spec.seed | 0, 22));
  const nP = new Noise3(hash2(spec.seed | 0, 23));
  const nV = new Noise3(hash2(spec.seed | 0, 24));
  const nD = new Noise3(hash2(spec.seed | 0, 25));
  const ridgeH = prof.ridge * G.rug;
  const beltW = clamp(prof.belts * (0.6 + 0.8 * (spec.mountains ?? 0.5)), 0.05, 0.9);
  const landSpan = Math.max(1e-6, cmax - thr);
  const seaSpan = Math.max(1e-6, thr - cmin);
  for (let i = 0; i < n; i++) {
    const c = cont[i];
    const wx = G.wx[i], wy = G.wy[i], wz = G.wz[i];
    if (G.sea && c < thr) {
      // provisional depth; reshaped later by distance to land (continental shelves)
      G.lvl[i] = -1 - Math.pow((thr - c) / seaSpan, 0.8) * (prof.depth - 1);
      continue;
    }
    const land = G.sea ? (c - thr) / landSpan : (c - cmin) / Math.max(1e-6, cmax - cmin);
    let h = G.sea ? Math.pow(land, 1.15) * prof.lowland * 2.2 : -2.5 + Math.pow(land, 1.1) * (prof.lowland * 2 + 3);
    // mountain belts: ridged noise along the zero-lines of a low-frequency field
    const belt = 1 - Math.abs(nB.fbm(wx * 1.35 + 2.2, wy * 1.35, wz * 1.35, 3));
    const bm = smooth(1 - beltW, 1 - beltW * 0.25, belt) * smooth(0.0, 0.18, land);
    let m = 0;
    if (bm > 0.001) {
      const r = nR.ridged(wx * 3.1, wy * 3.1, wz * 3.1, 4);
      m = bm * Math.pow(r, 1.6);
      h += m * ridgeH;
    }
    G.mount[i] = m;
    // plateaus / mesas — sharp-edged masks become cliffs after quantisation
    if (prof.plateau > 0) {
      const pv = nP.fbm(wx * 2.3 + 5, wy * 2.3, wz * 2.3, 2);
      const pm = smooth(0.5 - prof.plateau * 0.42, 0.53 - prof.plateau * 0.42, pv) * smooth(0.04, 0.2, land);
      G.plat[i] = pm;
      h += pm * prof.plateauHeight * (0.8 + 0.4 * G.rug);
    }
    // valleys through the highlands
    if (prof.valleys > 0) {
      const v = Math.abs(nV.noise(wx * 2.6, wy * 2.6, wz * 2.6));
      h -= prof.valleys * smooth(0.11, 0.0, v) * Math.min(h * 0.6, 4);
    }
    h += nD.noise(wx * 9, wy * 9, wz * 9) * prof.detail;
    G.lvl[i] = h;
  }
}

// ───────────────────────────────────────────────────────────── 3. archetype specials (on the continuous field)

/** Barren moons: maria + impact craters (bowl, raised rim, ejecta, central peaks). */
function craters(G: Gen): void {
  const { g, spec } = G;
  const rng = new Rng(hash2(spec.seed | 0, 31));
  const step = g.unitEdge; // radians per tile
  const scale = G.n / 6000;
  const list: [number, number, number][] = []; // [angular radius (tiles), depth, count]
  list.push([16, 2.2, 2], [9, 5, Math.round(3 * scale)], [5, 3.5, Math.round(9 * scale)], [2.6, 2.2, Math.round(26 * scale)], [1.6, 1.4, Math.round(30 * scale)]);
  for (const [rt, depth, count] of list) {
    for (let k = 0; k < count; k++) {
      const c = rng.int(0, G.n - 1);
      const r = rt * rng.range(0.75, 1.3);
      const a = r * step;
      const mare = rt >= 16;
      const D = depth * rng.range(0.8, 1.2) * (0.7 + 0.3 * G.rug);
      const tiles = g.withinAngle(c, a * 1.7);
      for (const t of tiles) {
        const u = g.angle(c, t) / a;
        let dh: number;
        if (mare) {
          dh = u < 1 ? -D * smooth(1.05, 0.55, u) : 0;
          if (u < 0.95) G.mark[t] = M_CRATER;
        } else {
          const bowl = u < 1 ? -D * (1 - u * u) : 0;
          const flat = r > 4 && u < 0.45 ? D * (1 - u * u) - D * (1 - 0.2) : 0; // flattened floor
          const rim = D * 0.6 * Math.exp(-((u - 1) * (u - 1)) / 0.03);
          const ejecta = u > 1 ? D * 0.16 * Math.exp(-(u - 1) * 3.5) : 0;
          const peak = r > 6 && u < 0.18 ? D * 0.7 * (1 - u / 0.18) : 0;
          dh = bowl + Math.max(0, flat) + rim + ejecta + peak;
          if (u < 0.8) G.mark[t] = M_CRATER;
        }
        G.lvl[t] += dh;
      }
    }
  }
}

/** Volcanic worlds: shield volcanoes & cones with lava-filled calderas, lava rivers down their flanks. */
function volcanoes(G: Gen): void {
  const { g, spec } = G;
  const rng = new Rng(hash2(spec.seed | 0, 41));
  const step = g.unitEdge;
  const count = Math.max(4, Math.round((G.n / 16000) * 8));
  const nN = new Noise3(hash2(spec.seed | 0, 42));
  for (let k = 0; k < count; k++) {
    const c = rng.int(0, G.n - 1);
    const big = k < 2;
    const rt = big ? rng.range(9, 13) : rng.range(4, 8);
    const a = rt * step;
    const H = (big ? rng.range(11, 15) : rng.range(6, 10)) * (0.75 + 0.25 * G.rug);
    const tiles = g.withinAngle(c, a);
    const base = G.lvl[c];
    for (const t of tiles) {
      const u = g.angle(c, t) / a;
      const C = G.C;
      const wob = 0.12 * nN.noise(C[t * 3] * 14, C[t * 3 + 1] * 14, C[t * 3 + 2] * 14);
      const cone = base + H * Math.pow(Math.max(0, 1 - u + wob), 1.25);
      if (cone > G.lvl[t]) G.lvl[t] = cone;
      if (u < 0.2) {
        // caldera: a lava lake sunk below the rim
        G.lvl[t] = base + H * 0.62;
        G.mark[t] = M_LAVA;
      }
    }
  }
}

/** Machine worlds: geodesic Voronoi plates with constant heights; coolant canals along some plate seams. */
function plates(G: Gen): void {
  const { g, n, spec } = G;
  const rng = new Rng(hash2(spec.seed | 0, 51));
  const K = Math.max(24, Math.round(n / 60));
  const cell = new Int32Array(n).fill(-1);
  const q = G.queue;
  let head = 0, tail = 0;
  for (let k = 0; k < K; k++) {
    const s = rng.int(0, n - 1);
    if (cell[s] >= 0) continue;
    cell[s] = k;
    q[tail++] = s;
  }
  while (head < tail) {
    const t = q[head++];
    for (let j = g.start[t]; j < g.start[t + 1]; j++) {
      const m = g.nbr[j];
      if (cell[m] < 0) {
        cell[m] = cell[t];
        q[tail++] = m;
      }
    }
  }
  // cell heights from the mean continuous height (quantised to even steps → stacked plates)
  const sum = new Float32Array(K), cnt = new Float32Array(K);
  for (let i = 0; i < n; i++) {
    const c = cell[i];
    if (c < 0) continue;
    sum[c] += G.lvl[i];
    cnt[c]++;
  }
  const hk = new Float32Array(K);
  for (let k = 0; k < K; k++) {
    const mean = cnt[k] ? sum[k] / cnt[k] : 0;
    const tower = hashFloat(spec.seed | 0, k, 3) < 0.08 ? 4 : 0;
    hk[k] = mean < -0.5 ? Math.min(-1, Math.round(mean)) : Math.max(0, Math.round(mean / 2) * 2 + tower);
  }
  for (let i = 0; i < n; i++) {
    const c = cell[i];
    if (c < 0) continue;
    G.lvl[i] = hk[c];
    G.mount[i] = 0;
    // seams: canal along boundaries between selected plate pairs
    for (let j = g.start[i]; j < g.start[i + 1]; j++) {
      const o = cell[g.nbr[j]];
      if (o !== c && o >= 0 && hk[c] >= 0 && hk[o] >= 0 && hashFloat(Math.min(c, o), Math.max(c, o), spec.seed | 0) < 0.22 && c < o) {
        G.lvl[i] = -1;
        G.mark[i] = M_RIVER;
        break;
      }
    }
  }
}

/** Ocean worlds: ring-shaped coral atolls with shallow lagoons. */
function atolls(G: Gen): void {
  const { g, spec } = G;
  const rng = new Rng(hash2(spec.seed | 0, 61));
  const count = Math.round((G.n / 16000) * 9);
  for (let k = 0; k < count; k++) {
    const c = rng.int(0, G.n - 1);
    if (G.lvl[c] > -2) continue;
    const rt = rng.range(2.2, 3.6);
    const a = rt * g.unitEdge;
    for (const t of g.withinAngle(c, a * 1.3)) {
      const u = g.angle(c, t) / a;
      if (u > 0.78 && u < 1.08) G.lvl[t] = Math.max(G.lvl[t], 0.2 + hashFloat(t, 7) * 0.6);
      else if (u <= 0.78) G.lvl[t] = -1;
      else G.lvl[t] = Math.max(G.lvl[t], -1.6);
    }
  }
}

// ───────────────────────────────────────────────────────────── 4. quantise + cleanup

function quantize(G: Gen): void {
  const e = G.p.elevation;
  for (let i = 0; i < G.n; i++) e[i] = clampLevel(Math.round(G.lvl[i]));
  if (G.sea) {
    // coastal ramps (beaches vs. cliffs) and continental shelves need distances to the shore
    coastRamp(G);
  }
}

function coastRamp(G: Gen): void {
  const { p, n, prof, spec } = G;
  const e = p.elevation;
  const dist = G.dsea;
  // distance to water over land
  bfsDistance(G, (i) => e[i] < 0, dist, 40);
  const nS = new Noise3(hash2(spec.seed | 0, 71));
  const [c0, c1] = prof.coast;
  for (let i = 0; i < n; i++) {
    if (e[i] < 0) continue;
    const d = dist[i];
    if (d > 12) continue;
    const C = G.C;
    const s = c0 + (c1 - c0) * (0.5 + 0.5 * nS.noise(C[i * 3] * 3.3, C[i * 3 + 1] * 3.3, C[i * 3 + 2] * 3.3));
    const cap = Math.floor((d - 1) * s + s * 0.42);
    if (e[i] > cap) e[i] = Math.max(0, cap);
  }
  // shelves: depth grows with distance from land
  const land = new Int16Array(n);
  bfsDistance(G, (i) => e[i] >= 0, land, 40);
  for (let i = 0; i < n; i++) {
    if (e[i] >= 0) continue;
    const d = land[i];
    const C = G.C;
    const nz = nS.noise(C[i * 3] * 5.1, C[i * 3 + 1] * 5.1, C[i * 3 + 2] * 5.1);
    // continental shelf: depth grows with distance from land and with the continental field; noise adds seamounts
    const seaness = clamp((-1 - G.lvl[i]) / Math.max(1, prof.depth - 1), 0, 1);
    const depth = 1 + Math.floor(Math.max(0, (d - 1) * 0.55 + seaness * 2.2 + nz * 1.1));
    e[i] = d <= 1 ? -1 : clampLevel(-Math.min(prof.depth, depth));
  }
}

function cleanup(G: Gen): void {
  const { p, g, n } = G;
  const e = p.elevation;
  const sea = G.sea;
  // slope limiter → readable stepped terraces; plateau edges and big mountains may form cliffs
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      if (sea && e[i] < 0) continue;
      let mn = 127;
      for (let j = g.start[i]; j < g.start[i + 1]; j++) mn = Math.min(mn, e[g.nbr[j]]);
      const step = G.plat[i] > 0.5 ? 5 : G.mount[i] > 0.35 ? 3 : 2;
      const floor = sea ? Math.max(mn, 0) : mn;
      if (e[i] > floor + step) e[i] = floor + step;
    }
  }
  // majority filter: remove 1-tile bumps / dents on otherwise flat ground
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      if (G.mark[i] === M_CRATER || G.mark[i] === M_LAVA || G.mark[i] === M_RIVER) continue;
      const ei = e[i];
      if (sea && ei < 0) continue;
      let hi = -127, lo = 127, same = 0, mode = 0, modeCount = 0;
      const s = g.start[i], d = g.start[i + 1] - s;
      for (let j = s; j < s + d; j++) {
        const v = e[g.nbr[j]];
        if (v > hi) hi = v;
        if (v < lo) lo = v;
        if (v === ei) same++;
      }
      if (same > 0) continue;
      // most common neighbour level
      for (let j = s; j < s + d; j++) {
        const v = e[g.nbr[j]];
        let c = 0;
        for (let k = s; k < s + d; k++) if (e[g.nbr[k]] === v) c++;
        if (c > modeCount) {
          modeCount = c;
          mode = v;
        }
      }
      if (ei > hi) e[i] = Math.abs(ei - hi) <= 1 && modeCount >= d - 1 ? mode : hi + (ei - hi > 1 ? 1 : 0);
      else if (ei < lo) e[i] = lo; // pit
      else if (modeCount >= d - 1 && Math.abs(mode - ei) <= 1) e[i] = mode;
      if (sea && ei >= 0 && e[i] < 0) e[i] = 0;
    }
  }
}

// ───────────────────────────────────────────────────────────── 5. settlement plain

function settle(G: Gen): number {
  const { p, g, n, spec } = G;
  const e = p.elevation;
  const home = spec.tags?.includes('home') ?? false;
  const f = spec.frequency;
  const R = Math.max(4, Math.round(f * (home ? 0.25 : 0.14)));
  if (G.sea) bfsDistance(G, (i) => e[i] < 0, G.dsea, 60);
  // candidates near a pleasant default framing direction (the camera's default target is +Z)
  const pref = [0, 0.3, 0.95];
  const pl = Math.hypot(pref[0], pref[1], pref[2]);
  const rng = new Rng(hash2(spec.seed | 0, 81));
  let best = -1, bestScore = -Infinity;
  const C = G.C;
  const isWaterLv = (v: number) => G.sea && v < 0;
  // pass 0: strict (temperate, near a coast, near the default framing); 1: relaxed; 2: anything (water worlds → island)
  for (let relax = 0; relax < 3 && best < 0; relax++) {
    for (let k = 0; k < 360; k++) {
      const t = rng.int(0, n - 1);
      const lat = Math.abs(C[t * 3 + 1]);
      if (relax < 2 && (isWaterLv(e[t]) || lat > (relax ? 0.7 : 0.55))) continue;
      const dir = (C[t * 3] * pref[0] + C[t * 3 + 1] * pref[1] + C[t * 3 + 2] * pref[2]) / pl;
      if (home && relax === 0 && dir < 0.35) continue;
      if (relax === 0 && G.sea && (G.dsea[t] < 3 || G.dsea[t] > R + 10)) continue;
      if (G.mark[t] === M_LAVA && relax < 2) continue;
      let land = 0, flat = 0, cnt = 0;
      const e0 = e[t];
      for (const q of g.disk(t, Math.min(R, 7))) {
        cnt++;
        if (!isWaterLv(e[q]) && G.mark[q] !== M_LAVA) land++;
        if (Math.abs(e[q] - e0) <= 1) flat++;
      }
      const score = (land / cnt) * 3 + (flat / cnt) * 2 - lat * 1.5 + dir * 0.8 - Math.max(0, e0 - 4) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
  }
  if (best < 0) return -1;
  const site = best;
  // flatten: core level = clamped median of the land around
  const disk = g.disk(site, R + 3);
  const lvls: number[] = [];
  for (const q of g.disk(site, R)) if (!isWaterLv(e[q])) lvls.push(e[q]);
  lvls.sort((a, b) => a - b);
  const L = clamp(lvls.length ? lvls[lvls.length >> 1] : 1, G.sea ? 1 : -1, home ? 3 : 5);
  const nE = new Noise3(hash2(spec.seed | 0, 82));
  const sa = Math.max(1e-6, g.unitEdge);
  for (const q of disk) {
    const dTiles = g.angle(site, q) / sa;
    const rho = R * (0.84 + 0.26 * nE.noise(C[q * 3] * 6, C[q * 3 + 1] * 6, C[q * 3 + 2] * 6));
    const u = dTiles / rho;
    if (u < 0.62) {
      if (!isWaterLv(e[q]) || u < 0.5) e[q] = L;
      G.core[q] = 1;
      G.mark[q] = 0;
      G.mount[q] = 0;
      G.plat[q] = 0;
    } else if (u < 1) {
      if (!isWaterLv(e[q])) e[q] = clampLevel(L + clamp(e[q] - L, -1, 1));
      G.core[q] = 2;
      G.mount[q] *= 0.3;
      if (G.mark[q] === M_LAVA) G.mark[q] = 0;
    } else {
      const ring = (u - 1) * rho;
      if (!isWaterLv(e[q])) e[q] = clampLevel(L + clamp(e[q] - L, -Math.ceil(ring * 1.6 + 1), Math.ceil(ring * 1.6 + 1)));
    }
  }
  return site;
}

// ───────────────────────────────────────────────────────────── 6. water

/** Re-shape the sea after edits: keep coasts shallow. */
function seaShape(G: Gen): void {
  const { p, g, n } = G;
  const e = p.elevation;
  for (let i = 0; i < n; i++) {
    if (e[i] >= 0) continue;
    let landNbr = false;
    for (let j = g.start[i]; j < g.start[i + 1]; j++) if (e[g.nbr[j]] >= 0) landNbr = true;
    if (landNbr) e[i] = -1;
  }
  bfsDistance(G, (i) => e[i] < 0, G.dsea, 60);
}

function rivers(G: Gen): void {
  const { p, g, n, prof, spec } = G;
  const e = p.elevation;
  const want = Math.round((prof.rivers * n) / 1000);
  if (want <= 0) return;
  const rng = new Rng(hash2(spec.seed | 0, 91));
  const nM = new Noise3(hash2(spec.seed | 0, 92));
  const C = G.C;
  const dsea = G.dsea;
  const minLen = Math.max(5, Math.round(spec.frequency * 0.14));
  const orig = new Int8Array(e);
  const taken = new Uint8Array(n);
  let made = 0;
  for (let attempt = 0; attempt < want * 30 && made < want; attempt++) {
    const s = rng.int(0, n - 1);
    if (e[s] < 2 || dsea[s] < minLen || G.core[s] || taken[s] || G.mark[s]) continue;
    // spacing from other rivers
    let near = false;
    for (const q of g.disk(s, 4)) if (taken[q]) { near = true; break; }
    if (near) continue;
    const path: number[] = [s];
    let cur = s;
    let ok = true;
    for (let guard = 0; guard < 400 && dsea[cur] > 0; guard++) {
      let next = -1, bestV = Infinity;
      for (let j = g.start[cur]; j < g.start[cur + 1]; j++) {
        const m = g.nbr[j];
        if (dsea[m] !== dsea[cur] - 1 || G.core[m] === 1) continue;
        const v = nM.noise(C[m * 3] * 11, C[m * 3 + 1] * 11, C[m * 3 + 2] * 11) + e[m] * 0.15;
        if (v < bestV) {
          bestV = v;
          next = m;
        }
      }
      if (next < 0) {
        ok = path.length >= minLen;
        break;
      }
      if (dsea[next] === 0) break;
      path.push(next);
      cur = next;
      if (taken[cur]) break; // joined another river
    }
    if (!ok || path.length < 3) continue;
    for (const t of path) {
      taken[t] = 1;
      e[t] = -1;
      G.mark[t] = M_RIVER;
    }
    // source lake
    if (rng.chance(0.35)) for (const q of g.disk(s, 1)) if (!G.core[q]) { e[q] = -1; G.mark[q] = M_LAKE; taken[q] = 1; }
    made++;
  }
  if (!made) return;
  // valleys: banks capped relative to the nearest river's original level
  const base = new Int8Array(n);
  const dist = new Int8Array(n).fill(-1);
  const q = G.queue;
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++)
    if (G.mark[i] === M_RIVER || G.mark[i] === M_LAKE) {
      dist[i] = 0;
      base[i] = Math.max(0, Math.round(orig[i] * 0.5));
      q[tail++] = i;
    }
  const BANK = [0, 1, 2, 4];
  while (head < tail) {
    const t = q[head++];
    if (dist[t] >= 3) continue;
    for (let j = g.start[t]; j < g.start[t + 1]; j++) {
      const m = g.nbr[j];
      if (dist[m] >= 0 || e[m] < 0) continue;
      dist[m] = dist[t] + 1;
      base[m] = base[t];
      q[tail++] = m;
    }
  }
  for (let i = 0; i < n; i++) {
    if (dist[i] <= 0) continue;
    const cap = base[i] + BANK[dist[i]];
    if (e[i] > cap) e[i] = Math.max(0, cap);
  }
}

function lakes(G: Gen): void {
  const { p, g, n, prof, spec } = G;
  const e = p.elevation;
  const want = Math.round((prof.lakes * n) / 1000);
  if (want <= 0) return;
  const rng = new Rng(hash2(spec.seed | 0, 101));
  let made = 0;
  for (let attempt = 0; attempt < want * 20 && made < want; attempt++) {
    const s = rng.int(0, n - 1);
    if (e[s] < 0 || e[s] > 4 || G.core[s] || G.dsea[s] < 3 || G.mount[s] > 0.2) continue;
    const r = rng.chance(0.4) ? 2 : 1;
    const area = g.disk(s, r);
    if (area.some((t) => G.core[t] === 1)) continue;
    for (const t of area) {
      if (r === 2 && hashFloat(t, spec.seed | 0, 5) < 0.3 && g.angle(s, t) > g.unitEdge * 1.5) continue;
      e[t] = -1;
      G.mark[t] = M_LAKE;
    }
    // gentle shores
    for (const t of g.disk(s, r + 1)) if (e[t] > 1 && G.mark[t] !== M_LAKE) e[t] = Math.min(e[t], 1 + (hashFloat(t, 3) < 0.5 ? 0 : 1));
    made++;
  }
}

/** Fill accidental 1–2 tile water holes that aren't designated rivers / lakes. */
function fillPuddles(G: Gen): void {
  const { p, g, n } = G;
  const e = p.elevation;
  const comp = new Int32Array(n).fill(-1);
  const q = G.queue;
  for (let i = 0; i < n; i++) {
    if (e[i] >= 0 || comp[i] >= 0) continue;
    let head = 0, tail = 0, designated = false;
    q[tail++] = i;
    comp[i] = i;
    while (head < tail) {
      const t = q[head++];
      if (G.mark[t] === M_RIVER || G.mark[t] === M_LAKE) designated = true;
      for (let j = g.start[t]; j < g.start[t + 1]; j++) {
        const m = g.nbr[j];
        if (e[m] < 0 && comp[m] < 0) {
          comp[m] = i;
          q[tail++] = m;
        }
      }
    }
    if (tail <= 2 && !designated) for (let k = 0; k < tail; k++) e[q[k]] = 0;
  }
  bfsDistance(G, (i) => e[i] < 0, G.dsea, 60);
}

/** Volcanic worlds: the lowest basins become flat lava seas; lava rivers run from calderas down to them. */
function lavaSeas(G: Gen): void {
  const { p, g, n, spec } = G;
  const e = p.elevation;
  const sorted = Int8Array.from(e).sort();
  const Lv = sorted[Math.floor(n * 0.2)];
  for (let i = 0; i < n; i++)
    if (e[i] <= Lv && !G.core[i]) {
      e[i] = Lv;
      G.mark[i] = M_LAVA;
    }
  // lava rivers: overflow from caldera rims, steepest descent toward the lava sea
  const rng = new Rng(hash2(spec.seed | 0, 111));
  const starts: number[] = [];
  for (let i = 0; i < n; i++) {
    if (G.mark[i] === M_LAVA || e[i] <= Lv + 2) continue;
    for (let j = g.start[i]; j < g.start[i + 1]; j++) {
      const m = g.nbr[j];
      if (G.mark[m] === M_LAVA && e[m] > Lv) {
        starts.push(i);
        break;
      }
    }
  }
  rng.shuffle(starts);
  const maxRivers = Math.max(3, Math.round(n / 2500));
  let made = 0;
  const used = new Uint8Array(n);
  for (const s of starts) {
    if (made >= maxRivers) break;
    if (used[s]) continue;
    let cur = s;
    const path: number[] = [s];
    let reached = false;
    for (let guard = 0; guard < 160; guard++) {
      let next = -1, low = Infinity;
      for (let j = g.start[cur]; j < g.start[cur + 1]; j++) {
        const m = g.nbr[j];
        if (G.mark[m] === M_LAVA && e[m] === Lv) {
          reached = true;
          break;
        }
        if (G.mark[m] === M_LAVA || used[m] || path.includes(m)) continue;
        const v = e[m] + hashFloat(m, s) * 0.9;
        if (e[m] <= e[cur] && v < low) {
          low = v;
          next = m;
        }
      }
      if (reached || next < 0 || G.core[next]) break;
      path.push(next);
      cur = next;
    }
    if (!reached || path.length < 3) continue;
    for (const t of path) {
      G.mark[t] = M_LAVA;
      used[t] = 1;
      e[t] = Math.max(Lv, e[t] - 1);
    }
    for (const t of path) for (const q of g.neighbors(t)) used[q] = 1;
    made++;
  }
}

// ───────────────────────────────────────────────────────────── 7. climate & biomes

function temperatureAt(spec: PlanetSpec, y: number, altitude: number, noise: number): number {
  const lat = Math.abs(y);
  return spec.temperature + 12 - 50 * Math.pow(lat, 2.4) + noise * 5 - Math.max(0, altitude) * 2.1;
}

function climate(G: Gen): void {
  const { p, n, spec } = G;
  const e = p.elevation;
  const C = G.C;
  const nT = new Noise3(hash2(spec.seed | 0, 0x5bd1e995));
  const nRiv = new Int16Array(n);
  if (G.sea) bfsDistance(G, (i) => G.mark[i] === M_RIVER || G.mark[i] === M_LAKE, nRiv, 8);
  for (let i = 0; i < n; i++) {
    const x = C[i * 3], y = C[i * 3 + 1], z = C[i * 3 + 2];
    G.temp[i] = temperatureAt(spec, y, e[i], nT.noise(x * 3.1, y * 3.1, z * 3.1));
    let m = 0.5 + 0.55 * nT.fbm(x * 2.1 + 4, y * 2.1, z * 2.1, 3);
    if (G.sea) {
      m += 0.22 * Math.exp(-G.dsea[i] / 5);
      if (nRiv[i] < 8) m += 0.18 * Math.exp(-nRiv[i] / 2);
    } else m -= 0.1;
    G.moist[i] = clamp(m, 0, 1);
  }
}

/** Polar seas freeze into ice shelves on cold worlds. */
function iceShelves(G: Gen): void {
  const { p, n } = G;
  const e = p.elevation;
  for (let i = 0; i < n; i++) {
    if (e[i] >= 0 || e[i] < -3) continue;
    const T = G.spec.temperature;
    const rel = T < -20 ? -12 : T < 0 ? -26 : -32;
    if (G.temp[i] - T < rel - (G.mark[i] ? 6 : 0) && G.temp[i] < -10) {
      e[i] = 0;
      G.mark[i] = M_SHELF;
    }
  }
}

interface ClassIn {
  t: number;
  /** temperature relative to the planet mean (equator ≈ +12, poles ≈ −38) */
  tr: number;
  m: number;
  e: number;
  lat: number;
  dsea: number;
  mount: number;
  plat: number;
  cliff: number;
  crys: number;
  mark: number;
}

function seabedBiome(spec: PlanetSpec, arch: PlanetArchetype, e: number, t: number): Biome {
  const sb = arch.biomes.seabed;
  if (spec.type === 'ocean') return e >= -2 && t > 8 ? Biome.Coral : e <= -4 ? Biome.DeepOcean : Biome.Ocean;
  if (sb === Biome.Ocean) return e <= -4 ? Biome.DeepOcean : Biome.Ocean;
  return sb;
}

function classify(type: PlanetTypeId, arch: PlanetArchetype, c: ClassIn): Biome {
  const { t, tr, m, e, lat, dsea, mount, plat, cliff } = c;
  const shore = dsea === 1 && e <= 0 && c.crys > -0.05;
  if (c.mark === M_LAVA) return Biome.Lava;
  if (c.mark === M_SHELF) return Biome.Ice;
  switch (type) {
    case 'tundra': {
      if (tr < -24) return lat > 0.85 && e <= 2 ? Biome.Ice : Biome.Snow;
      if (cliff || mount > 0.55) return tr < -6 ? Biome.Snow : Biome.Rock;
      if (shore) return Biome.Beach;
      if (tr < -10) return m > 0.62 ? Biome.Forest : Biome.Tundra;
      if (tr < 2) return m > 0.55 ? Biome.Forest : m > 0.4 ? Biome.Tundra : Biome.Grass;
      return m > 0.6 ? Biome.Forest : m > 0.42 ? Biome.Grass : Biome.Meadow;
    }
    case 'terran': {
      if (t < -11) return lat > 0.85 && e <= 2 ? Biome.Ice : Biome.Snow;
      if (cliff || mount > 0.55) return t < -3 ? Biome.Snow : mount > 0.75 ? Biome.Mountain : Biome.Rock;
      if (shore && t > -4) return Biome.Beach;
      if (t < -3) return Biome.Tundra;
      if (t < 6) return m > 0.52 ? Biome.Forest : Biome.Tundra;
      if (t < 23.5) return m > 0.62 ? Biome.Forest : m > 0.44 ? Biome.Grass : m > 0.3 ? Biome.Meadow : Biome.Savanna;
      return m > 0.62 ? Biome.Jungle : m > 0.36 ? Biome.Savanna : Biome.Desert;
    }
    case 'desert': {
      if (lat > 0.88 && t < 0) return Biome.Tundra;
      if (cliff || mount > 0.6) return mount > 0.8 ? Biome.Mountain : Biome.Rock;
      if (plat > 0.5) return m > 0.66 ? Biome.Savanna : Biome.Desert;
      if (shore) return Biome.Beach;
      if (m > 0.78 || dsea <= 2) return Biome.Savanna;
      if (e <= 1 && m < 0.36 && dsea > 4) return Biome.Salt;
      return Biome.Desert;
    }
    case 'arctic': {
      if (cliff || mount > 0.6) return Biome.Rock;
      if (lat > 0.8 || e >= 7) return Biome.Ice;
      if (shore) return Biome.Snow;
      if (tr > 2 && e <= 3) return m > 0.5 ? Biome.Tundra : Biome.Snow;
      return plat > 0.5 ? Biome.Ice : Biome.Snow;
    }
    case 'volcanic': {
      if (cliff || mount > 0.6) return Biome.Rock;
      if (lat > 0.85) return Biome.Ash;
      if (plat > 0.5 || e >= 6) return Biome.Ash;
      return c.m > 0.62 ? Biome.Ash : Biome.Volcanic;
    }
    case 'ocean': {
      if (t < -11) return Biome.Ice;
      if (cliff || mount > 0.6) return Biome.Rock;
      if (shore || e <= 0) return Biome.Beach;
      return m > 0.55 ? Biome.Jungle : Biome.Grass;
    }
    case 'jungle': {
      if (t < -8) return Biome.Tundra;
      if (cliff || mount > 0.65) return Biome.Rock;
      if (shore) return m > 0.75 ? Biome.Swamp : Biome.Beach;
      if (e <= 1 && m > 0.7) return Biome.Swamp;
      if (e >= 6 || plat > 0.5) return m > 0.5 ? Biome.Forest : Biome.Meadow;
      return m < 0.3 ? Biome.Meadow : Biome.Jungle;
    }
    case 'barren': {
      if (lat > 0.86 && c.mark === M_CRATER) return Biome.Ice;
      if (c.mark === M_CRATER) return Biome.Crater;
      if (cliff || mount > 0.5 || e >= 6) return Biome.Rock;
      return Biome.Regolith;
    }
    case 'toxic': {
      if (lat > 0.92) return Biome.Salt;
      if (cliff || mount > 0.6) return Biome.Rock;
      if (shore) return c.crys > 0.1 ? Biome.Salt : Biome.Swamp;
      if (e <= 1 && m > 0.6) return Biome.Swamp;
      if (e >= 5 || plat > 0.5) return Biome.Ash;
      return Biome.Toxic;
    }
    case 'crystal': {
      if (lat > 0.9 || e >= 10) return Biome.Ice;
      if (shore) return Biome.Salt;
      if (c.crys > 0.18 || mount > 0.45) return Biome.Crystal;
      if (cliff) return Biome.Rock;
      if (e <= 1 && m < 0.45) return Biome.Salt;
      return c.crys > -0.25 ? Biome.Crystal : Biome.Rock;
    }
    case 'fungal': {
      if (t < -10) return Biome.Tundra;
      if (cliff || mount > 0.6) return Biome.Rock;
      if (shore) return Biome.Swamp;
      if (e <= 1 && m > 0.72) return Biome.Swamp;
      return m > 0.45 ? Biome.Fungal : Biome.Meadow;
    }
    case 'machine': {
      if (lat > 0.88) return Biome.Ice;
      return c.crys > 0.55 && !cliff ? Biome.Rock : Biome.Metal;
    }
  }
  return arch.biomes.low[0] ?? Biome.Grass;
}

function biomes(G: Gen): void {
  const { p, g, n, spec, arch } = G;
  const e = p.elevation;
  const C = G.C;
  const nX = new Noise3(hash2(spec.seed | 0, 121));
  if (G.sea) bfsDistance(G, (i) => e[i] < 0, G.dsea, 60);
  const ci: ClassIn = { t: 0, tr: 0, m: 0, e: 0, lat: 0, dsea: 0, mount: 0, plat: 0, cliff: 0, crys: 0, mark: 0 };
  for (let i = 0; i < n; i++) {
    if (G.sea && e[i] < 0) {
      p.biome[i] = seabedBiome(spec, arch, e[i], G.temp[i]);
      continue;
    }
    let maxUp = 0;
    for (let j = g.start[i]; j < g.start[i + 1]; j++) maxUp = Math.max(maxUp, Math.abs(e[g.nbr[j]] - e[i]));
    ci.t = G.temp[i];
    ci.tr = G.temp[i] - spec.temperature;
    ci.m = G.moist[i];
    ci.e = e[i];
    ci.lat = Math.abs(C[i * 3 + 1]);
    ci.dsea = G.sea ? G.dsea[i] : 99;
    ci.mount = G.mount[i];
    ci.plat = G.plat[i];
    ci.cliff = maxUp >= 4 && e[i] >= 3 ? 1 : 0;
    ci.crys = nX.fbm(C[i * 3] * 4.2 + 9, C[i * 3 + 1] * 4.2, C[i * 3 + 2] * 4.2, 2);
    ci.mark = G.mark[i];
    let b = classify(spec.type, arch, ci);
    if (G.core[i] && (b === Biome.Rock || b === Biome.Mountain || b === Biome.Lava)) b = arch.biomes.low[0];
    p.biome[i] = b;
  }
}

// ───────────────────────────────────────────────────────────── 8. features

function features(G: Gen): void {
  const { p, g, n, spec, arch } = G;
  const e = p.elevation;
  const C = G.C;
  const rng = new Rng(hash2(spec.seed | 0, 131));
  const nF = new Noise3(hash2(spec.seed | 0, 132)); // forests
  const nO = new Noise3(hash2(spec.seed | 0, 133)); // ore veins / vent fields
  const nK = new Noise3(hash2(spec.seed | 0, 134)); // kelp
  const fp = (f: Feature) => arch.features[f] ?? 0;
  const pTrees = fp(Feature.Trees), pDense = fp(Feature.DenseTrees), pRocks = fp(Feature.Rocks), pOre = fp(Feature.Ore);
  const pCrys = fp(Feature.CrystalDeposit), pIce = fp(Feature.IceDeposit), pGas = fp(Feature.GasVent), pGeo = fp(Feature.GeoVent);
  const pFlow = fp(Feature.Flowers), pAlien = fp(Feature.AlienFlora), pKelp = fp(Feature.Kelp), pCrater = fp(Feature.Crater);
  // proximity to lava (for geothermal vents)
  const dLava = new Int16Array(n);
  bfsDistance(G, (i) => G.mark[i] === M_LAVA, dLava, 6);
  for (let i = 0; i < n; i++) {
    const x = C[i * 3], y = C[i * 3 + 1], z = C[i * 3 + 2];
    p.feature[i] = Feature.None;
    if (G.sea && e[i] < 0) {
      if (pKelp > 0 && e[i] >= -3 && G.mark[i] !== M_RIVER) {
        const k = nK.noise(x * 7, y * 7, z * 7);
        if (k > 0.1 && rng.chance(pKelp * 3.2 * (k + 0.2))) p.feature[i] = Feature.Kelp;
      }
      continue;
    }
    const b = p.biome[i] as Biome;
    if (b === Biome.Lava) continue;
    const forest = nF.fbm(x * 4.5, y * 4.5, z * 4.5, 3); // −1..1 clusters
    const vein = nO.fbm(x * 6.5 + 3, y * 6.5, z * 6.5, 2);
    let slope = 0;
    for (let j = g.start[i]; j < g.start[i + 1]; j++) slope = Math.max(slope, Math.abs(e[g.nbr[j]] - e[i]));
    const high = e[i] >= 5 || G.mount[i] > 0.3;
    // resources first (never in the settlement core's centre)
    if (G.core[i] !== 1) {
      if (pOre > 0 && rng.chance(pOre * (vein > 0.32 ? (high ? 6 : 2.5) : 0.1))) { p.feature[i] = Feature.Ore; continue; }
      if (pCrys > 0 && rng.chance(pCrys * (b === Biome.Crystal ? (vein > 0.1 ? 3 : 1) : high ? 0.6 : 0.15))) { p.feature[i] = Feature.CrystalDeposit; continue; }
      if (pIce > 0 && rng.chance(pIce * (G.mark[i] === M_CRATER ? 2.5 : b === Biome.Ice ? 0.9 : b === Biome.Snow ? 0.45 : G.temp[i] < -12 ? 0.6 : 0.05) * (vein > 0 ? 1.6 : 0.5))) { p.feature[i] = Feature.IceDeposit; continue; }
      if (pGas > 0 && rng.chance(pGas * (vein < -0.3 ? 5 : 0.1) * (b === Biome.Toxic || b === Biome.Swamp || b === Biome.Desert || b === Biome.Salt || b === Biome.Metal ? 1.4 : 0.6))) { p.feature[i] = Feature.GasVent; continue; }
      if (pGeo > 0 && rng.chance(pGeo * (dLava[i] <= 1 ? 2.2 : dLava[i] <= 3 ? 1 : high ? 0.6 : 0.12) * (vein < 0 ? 1.5 : 0.5))) { p.feature[i] = Feature.GeoVent; continue; }
    }
    // vegetation
    const wood = woodiness(b);
    if (wood > 0) {
      const f = forest + (G.moist[i] - 0.5) * 0.6;
      if (pDense > 0 && f > 0.12 && rng.chance(Math.min(0.92, pDense * wood * 6.5 * (f - 0.05)))) { p.feature[i] = Feature.DenseTrees; continue; }
      if (pTrees > 0 && f > -0.22 && rng.chance(Math.min(0.85, pTrees * wood * 3.4 * (f + 0.4)))) { p.feature[i] = Feature.Trees; continue; }
    }
    if (pAlien > 0) {
      const a = b === Biome.Fungal ? 1.8 : b === Biome.Swamp || b === Biome.Toxic ? 1.4 : b === Biome.Crystal ? 0.8 : b === Biome.Jungle ? 0.6 : 0.15;
      if (rng.chance(Math.min(0.9, pAlien * a * 1.9 * Math.max(0, forest + 0.4)))) { p.feature[i] = Feature.AlienFlora; continue; }
    }
    if (pFlow > 0 && rng.chance(pFlow * (b === Biome.Meadow ? 3 : b === Biome.Grass ? 1 : b === Biome.Fungal ? 0.8 : 0.1))) { p.feature[i] = Feature.Flowers; continue; }
    if (pCrater > 0 && G.mark[i] === M_CRATER && rng.chance(pCrater * 2.5)) { p.feature[i] = Feature.Crater; continue; }
    if (pRocks > 0 && rng.chance(pRocks * 0.75 * (slope >= 2 ? 1.6 : 1) * (b === Biome.Rock || b === Biome.Mountain || b === Biome.Ash ? 1.2 : b === Biome.Regolith || b === Biome.Desert ? 0.8 : 0.45))) { p.feature[i] = Feature.Rocks; continue; }
  }
  // ruins: a few clustered sites (whole districts on machine worlds)
  const pRuins = fp(Feature.Ruins);
  if (pRuins > 0) {
    let landCount = 0;
    for (let i = 0; i < n; i++) if (!(G.sea && e[i] < 0)) landCount++;
    const sites = Math.min(60, Math.max(1, Math.round((pRuins * landCount) / 6)));
    for (let k = 0, tries = 0; k < sites && tries < sites * 20; tries++) {
      const s = rng.int(0, n - 1);
      if ((G.sea && e[s] < 0) || G.core[s] || p.biome[s] === Biome.Lava) continue;
      const r = rng.chance(0.3) ? 2 : 1;
      for (const t of g.disk(s, r)) if (!(G.sea && e[t] < 0) && !G.core[t] && p.biome[t] !== Biome.Lava && rng.chance(0.62)) p.feature[t] = Feature.Ruins;
      k++;
    }
  }
}

function woodiness(b: Biome): number {
  switch (b) {
    case Biome.Forest: return 1.25;
    case Biome.Jungle: return 1.3;
    case Biome.Grass: return 0.55;
    case Biome.Meadow: return 0.35;
    case Biome.Savanna: return 0.3;
    case Biome.Tundra: return 0.55;
    case Biome.Swamp: return 0.7;
    case Biome.Beach: return 0.12;
    case Biome.Snow: return 0.12;
    case Biome.Desert: return 0.04;
    default: return 0;
  }
}

/** Settlement plain dressing: friendly ground, a few trees and flowers, a resource deposit near the edge. */
function dressSite(G: Gen, site: number): void {
  const { p, g, spec, arch } = G;
  const rng = new Rng(hash2(spec.seed | 0, 141));
  const low = arch.biomes.low;
  const friendly = new Set<Biome>([Biome.Grass, Biome.Meadow, Biome.Savanna, Biome.Desert, Biome.Tundra, Biome.Regolith, Biome.Volcanic, Biome.Metal, Biome.Fungal, Biome.Toxic, Biome.Crystal, Biome.Snow, Biome.Salt, Biome.Jungle, Biome.Forest, Biome.Ash, Biome.Swamp, Biome.Crater]);
  let placedOre = false;
  for (const t of g.disk(site, Math.round(spec.frequency * 0.3))) {
    const core = G.core[t];
    if (!core || p.isWater(t)) continue;
    const b = p.biome[t] as Biome;
    if (core === 1) {
      if (!friendly.has(b) || b === Biome.Forest || b === Biome.Jungle || b === Biome.Swamp) {
        p.biome[t] = spec.type === 'terran' || spec.type === 'tundra' ? (hashFloat(t, 9) < 0.3 ? Biome.Meadow : Biome.Grass) : low[0];
      }
      const f = p.feature[t];
      if (f === Feature.DenseTrees || f === Feature.Rocks || f === Feature.Ruins || f === Feature.AlienFlora) p.feature[t] = rng.chance(0.15) ? (arch.features[Feature.Trees] ? Feature.Trees : Feature.None) : Feature.None;
      else if (f === Feature.Trees && rng.chance(0.6)) p.feature[t] = Feature.None;
      if (p.feature[t] === Feature.None && arch.features[Feature.Flowers] && rng.chance(0.05)) p.feature[t] = Feature.Flowers;
    } else if (!placedOre && core === 2 && rng.chance(0.08)) {
      p.feature[t] = arch.features[Feature.Ore] ? Feature.Ore : arch.features[Feature.CrystalDeposit] ? Feature.CrystalDeposit : arch.features[Feature.IceDeposit] ? Feature.IceDeposit : p.feature[t];
      placedOre = true;
    }
  }
}

// ───────────────────────────────────────────────────────────── helpers

function smooth(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function clampLevel(v: number): number {
  return v < MIN_LEVEL ? MIN_LEVEL : v > MAX_LEVEL ? MAX_LEVEL : v;
}

/** Multi-source BFS: distance (in tiles) from tiles where `src(i)` to every tile, capped at maxD. */
function bfsDistance(G: Gen, src: (i: number) => boolean, out: Int16Array, maxD: number): void {
  const { g, n } = G;
  const q = G.queue;
  let head = 0, tail = 0;
  out.fill(maxD);
  for (let i = 0; i < n; i++)
    if (src(i)) {
      out[i] = 0;
      q[tail++] = i;
    }
  while (head < tail) {
    const t = q[head++];
    const d = out[t] + 1;
    if (d >= maxD) continue;
    for (let j = g.start[t]; j < g.start[t + 1]; j++) {
      const m = g.nbr[j];
      if (out[m] > d) {
        out[m] = d;
        q[tail++] = m;
      }
    }
  }
}
