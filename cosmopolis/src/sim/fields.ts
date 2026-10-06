/**
 * Fields — per-tile scalar fields of the active planet (service coverage, pollution, noise, land value, crime,
 * traffic, tourism, shelter/shield) and the amortised pass that recomputes them.
 *
 * The pass is a generator: Simulation.update() pulls it under a per-frame time budget, Simulation.tick() flushes
 * it synchronously if it falls behind (headless tests). Contributions are radial "stamps" (great-circle discs
 * cached per anchor tile + radius) with per-kind falloff. Temporal smoothing makes pollution drift in and
 * decay out gradually instead of snapping.
 */
import { Feature, Biome, TileFlag } from '../core/types';
import type { Planet } from '../world/planet';
import { BuildingState } from '../core/types';
import type { BRec } from './state';
import type { Mods } from './policies';
import { ROAD_CAPACITY, SERVICES, SERVICE_INDEX, budgetEffect, isRail, type DeptId } from './params';

export interface Stamp {
  tiles: Int32Array;
  /** normalised distance 0..1 from the anchor */
  d: Float32Array;
}

/** Context the pass reads from the simulation. */
export interface FieldContext {
  planet: Planet;
  recs: BRec[];
  budget: Record<string, number>;
  modsAt(district: number): Mods;
  unemployment: number;
  eduAvg: number;
  /** planet-wide coverage from orbitals per service (0..1) */
  orbitalCoverage: Float32Array;
}

/** Share of residents that count against a service's capacity. */
const DEMAND_FACTOR: number[] = SERVICES.map((s) =>
  s === 'police' || s === 'fire' ? 1 : s === 'health' ? 0.08 : s === 'education' ? 0.2 : s === 'leisure' ? 0.25 : s === 'transit' ? 0.3 : s === 'deathcare' ? 0.01 : s === 'spiritual' ? 0.12 : 0,
);
/** Land value bonus per unit of coverage. */
const LV_WEIGHT: number[] = SERVICES.map((s) =>
  s === 'police' ? 6 : s === 'fire' ? 5 : s === 'health' ? 7 : s === 'education' ? 7 : s === 'research' ? 3 : s === 'leisure' ? 12 : s === 'transit' ? 8 : s === 'deathcare' ? 2 : s === 'data' ? 3 : s === 'tourism' ? 4 : s === 'spiritual' ? 4 : 0,
);

const FEATURE_LV: number[] = [];
FEATURE_LV[Feature.Trees] = 5;
FEATURE_LV[Feature.DenseTrees] = 7;
FEATURE_LV[Feature.Flowers] = 6;
FEATURE_LV[Feature.AlienFlora] = 6;
FEATURE_LV[Feature.Ruins] = 12;
FEATURE_LV[Feature.Rubble] = -12;
FEATURE_LV[Feature.Crater] = -4;
FEATURE_LV[Feature.Rocks] = 1;
FEATURE_LV[Feature.GeoVent] = -3;
FEATURE_LV[Feature.GasVent] = -6;
const BIOME_LV: number[] = [];
BIOME_LV[Biome.Beach] = 8;
BIOME_LV[Biome.Meadow] = 5;
BIOME_LV[Biome.Grass] = 3;
BIOME_LV[Biome.Forest] = 4;
BIOME_LV[Biome.Jungle] = 2;
BIOME_LV[Biome.Coral] = 8;
BIOME_LV[Biome.Crystal] = 7;
BIOME_LV[Biome.Fungal] = 3;
BIOME_LV[Biome.Toxic] = -10;
BIOME_LV[Biome.Lava] = -15;
BIOME_LV[Biome.Ash] = -6;
BIOME_LV[Biome.Swamp] = -4;
BIOME_LV[Biome.Volcanic] = -3;
BIOME_LV[Biome.Salt] = -1;
BIOME_LV[Biome.Metal] = 1;

const SMOOTH = 0.5;

export class Fields {
  readonly n: number;
  /** coverage per service (index = SERVICE_INDEX), 0..1 */
  readonly cov: Float32Array[];
  readonly pollution: Float32Array;
  readonly noise: Float32Array;
  readonly landValue: Float32Array;
  readonly crime: Float32Array;
  /** road congestion 0..1.5 (load / capacity); −1 off-road */
  readonly traffic: Float32Array;
  /** raw trips / day on road tiles */
  readonly trafficLoad: Float32Array;
  readonly tourism: Float32Array;
  readonly shelter: Float32Array;
  readonly shield: Float32Array;
  /** happiness bonus stamps (parks, landmarks) */
  readonly happyFx: Float32Array;
  /** residents / workers per tile (written by the building pass) */
  readonly residents: Float32Array;
  readonly workers: Float32Array;
  /** terrain-only land value base */
  readonly lvBase: Float32Array;

  // accumulators
  private covAcc: Float32Array[];
  private polAcc: Float32Array;
  private noiseAcc: Float32Array;
  private lvAcc: Float32Array;
  private happyAcc: Float32Array;
  private tourAcc: Float32Array;
  private shelterAcc: Float32Array;
  private shieldAcc: Float32Array;
  private crimeTmp: Float32Array;

  // road graph cache
  private roadList = new Int32Array(0);
  private roadStart = new Int32Array(1);
  private roadNbr = new Int32Array(0);
  private roadCap = new Float32Array(0);
  private capSum = new Float32Array(0);
  private src: Float32Array;
  private loadA: Float32Array;
  private loadB: Float32Array;
  roadsDirty = true;
  lvBaseDirty = true;
  /** ancient ruins tiles (tourism magnets) */
  ruins: number[] = [];
  /** ruins reachable from a road (count toward visitors) */
  ruinsReachable = 0;

  private stamps = new Map<number, Stamp>();
  /** completed passes (for tests / staleness) */
  passes = 0;
  // published averages
  avgLandValue = 0;
  avgPollution = 0;
  avgCrime = 0;
  avgNoise = 0;
  avgTraffic = 0;
  roadCount = 0;

  constructor(private planet: Planet) {
    const n = (this.n = planet.count);
    const f = () => new Float32Array(n);
    this.cov = SERVICES.map(f);
    this.covAcc = SERVICES.map(f);
    this.pollution = f();
    this.noise = f();
    this.landValue = f();
    this.crime = f();
    this.traffic = f().fill(-1);
    this.trafficLoad = f();
    this.tourism = f();
    this.shelter = f();
    this.shield = f();
    this.happyFx = f();
    this.residents = f();
    this.workers = f();
    this.lvBase = f();
    this.polAcc = f();
    this.noiseAcc = f();
    this.lvAcc = f();
    this.happyAcc = f();
    this.tourAcc = f();
    this.shelterAcc = f();
    this.shieldAcc = f();
    this.crimeTmp = f();
    this.src = f();
    this.loadA = f();
    this.loadB = f();
  }

  /** Great-circle disc around `anchor` with `radius` tiles (cached). */
  stamp(anchor: number, radius: number): Stamp {
    const r = Math.max(1, Math.min(60, Math.round(radius)));
    const key = anchor * 64 + r;
    let s = this.stamps.get(key);
    if (s) return s;
    const g = this.planet.grid;
    const ang = r * g.unitEdge * 1.02;
    const list = g.withinAngle(anchor, ang);
    const tiles = new Int32Array(list.length);
    const d = new Float32Array(list.length);
    for (let i = 0; i < list.length; i++) {
      tiles[i] = list[i];
      d[i] = Math.min(1, g.angle(anchor, list[i]) / ang);
    }
    s = { tiles, d };
    if (this.stamps.size > 60000) this.stamps.clear();
    this.stamps.set(key, s);
    return s;
  }

  coverageAt(service: number, tile: number): number {
    return this.cov[service]?.[tile] ?? 0;
  }

  // ─────────────────────────────────────────── terrain base

  computeLvBase(): void {
    const p = this.planet;
    const g = p.grid;
    const base = this.lvBase;
    this.ruins = [];
    for (let t = 0; t < p.count; t++) {
      if (p.feature[t] === Feature.Ruins) this.ruins.push(t);
      if (p.isWater(t)) {
        base[t] = 0;
        continue;
      }
      let v = 22;
      const e = p.elevation[t] - p.seaOffset;
      v += Math.min(10, Math.max(0, e - 1) * 1.1);
      v += FEATURE_LV[p.feature[t]] ?? 0;
      v += BIOME_LV[p.biome[t]] ?? 0;
      let coast = false, greens = 0;
      for (let q = g.start[t]; q < g.start[t + 1]; q++) {
        const nb = g.nbr[q];
        if (p.isWater(nb)) coast = true;
        const f = p.feature[nb];
        if (f === Feature.Trees || f === Feature.DenseTrees || f === Feature.Flowers || f === Feature.AlienFlora) greens++;
        else if (f === Feature.Ruins) greens += 2;
      }
      if (coast) v += 10;
      v += Math.min(6, greens * 1.5);
      base[t] = v;
    }
    this.lvBaseDirty = false;
  }

  // ─────────────────────────────────────────── road graph

  private rebuildRoads(): void {
    const p = this.planet;
    const g = p.grid;
    let count = 0;
    for (let t = 0; t < p.count; t++) if (p.road[t]) count++;
    const list = new Int32Array(count);
    const start = new Int32Array(count + 1);
    const idx = new Int32Array(p.count).fill(-1);
    let k = 0;
    for (let t = 0; t < p.count; t++) if (p.road[t]) (idx[t] = k), (list[k++] = t);
    const nbr: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = list[i];
      start[i] = nbr.length;
      const links = p.roadLinks[t];
      const d = g.degree(t);
      for (let q = 0; q < d; q++) {
        const n = g.nbr[g.start[t] + q];
        if (!p.road[n]) continue;
        // honour explicit links; unlinked tiles connect to every road neighbour
        if (links && !(links & (1 << q))) continue;
        nbr.push(idx[n]);
      }
    }
    start[count] = nbr.length;
    const cap = new Float32Array(count);
    for (let i = 0; i < count; i++) cap[i] = ROAD_CAPACITY[p.road[list[i]]] ?? 600;
    const capSum = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      let s = 0;
      for (let q = start[i]; q < start[i + 1]; q++) s += cap[nbr[q]];
      capSum[i] = s;
    }
    this.roadList = list;
    this.roadStart = start;
    this.roadNbr = Int32Array.from(nbr);
    this.roadCap = cap;
    this.capSum = capSum;
    this.roadCount = count;
    this.roadsDirty = false;
  }

  // ─────────────────────────────────────────── the pass

  /** Generator recomputing every field; yields between chunks. */
  *pass(ctx: FieldContext): Generator<void, void, void> {
    const p = this.planet;
    const n = this.n;
    if (this.lvBaseDirty) this.computeLvBase();
    if (this.roadsDirty) this.rebuildRoads();
    for (const a of this.covAcc) a.fill(0);
    this.polAcc.fill(0);
    this.noiseAcc.fill(0);
    this.lvAcc.fill(0);
    this.happyAcc.fill(0);
    this.tourAcc.fill(0);
    this.shelterAcc.fill(0);
    this.shieldAcc.fill(0);
    this.src.fill(0);
    yield;

    // ── stamps from buildings
    const recs = ctx.recs;
    const res = this.residents;
    let work = 0;
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (!r) continue;
      const b = r.b;
      if (b.state !== BuildingState.Active && b.state !== BuildingState.Upgrading) continue;
      const info = r.info;
      const mods = ctx.modsAt(p.district[b.tile]);
      const fpExtra = b.tiles.length >= 19 ? 2 : b.tiles.length >= 7 ? 1 : 0;
      const zp = info.zp;
      const lvl = Math.max(1, Math.min(5, b.level)) - 1;
      // coverage
      if (info.coverage.length) {
        const eff = (info.dept ? budgetEffect(ctx.budget[info.dept] ?? 1) : 1) * (r.served & 1 ? 1 : 0.35);
        for (const c of info.coverage) {
          const si = SERVICE_INDEX[c.service];
          if (si === undefined) continue;
          const st = this.stamp(b.tile, c.radius + fpExtra);
          let strength = Math.max(0, Math.min(1, c.strength)) * eff;
          if (c.service === 'police') strength *= mods.police;
          const factor = DEMAND_FACTOR[si];
          if (c.capacity && factor > 0) {
            let served = 0;
            for (let k = 0; k < st.tiles.length; k++) served += res[st.tiles[k]];
            served *= factor;
            const capEff = (c.capacity * eff) / Math.max(1, served);
            if (capEff < 1) strength *= Math.max(0.15, capEff);
          }
          const acc = this.covAcc[si];
          for (let k = 0; k < st.tiles.length; k++) {
            const d = st.d[k];
            acc[st.tiles[k]] += strength * (d <= 0.55 ? 1 : (1 - d) / 0.45);
          }
          work += st.tiles.length;
        }
      }
      // pollution
      let pol = info.pollution + (zp ? zp.pollution[lvl] : 0);
      if (pol !== 0) {
        pol *= mods.pollution;
        const st = this.stamp(b.tile, (zp ? 3 : info.radius) + fpExtra);
        for (let k = 0; k < st.tiles.length; k++) {
          const w = 1 - st.d[k];
          this.polAcc[st.tiles[k]] += pol * w * Math.sqrt(w);
        }
        work += st.tiles.length;
      }
      // noise
      let noise = info.noise + (zp ? zp.noise : 0);
      if (noise > 0) {
        noise *= mods.noise;
        const st = this.stamp(b.tile, (zp ? 2 : Math.min(6, info.radius)) + fpExtra);
        for (let k = 0; k < st.tiles.length; k++) this.noiseAcc[st.tiles[k]] += noise * (1 - st.d[k]);
        work += st.tiles.length;
      }
      // land value / happiness stamps (parks, landmarks, eyesores)
      if (info.landValue !== 0 || info.happiness !== 0) {
        const st = this.stamp(b.tile, info.radius + fpExtra);
        for (let k = 0; k < st.tiles.length; k++) {
          const w = 1 - st.d[k];
          this.lvAcc[st.tiles[k]] += info.landValue * w;
          this.happyAcc[st.tiles[k]] += info.happiness * w;
        }
        work += st.tiles.length;
      }
      // tourism draw
      const tour = r.visitors;
      if (tour > 0) {
        const st = this.stamp(b.tile, Math.min(12, 3 + Math.sqrt(tour) * 0.25) + fpExtra);
        const amp = Math.min(1, tour / 400);
        for (let k = 0; k < st.tiles.length; k++) this.tourAcc[st.tiles[k]] += amp * (1 - st.d[k]);
        work += st.tiles.length;
      }
      if (info.shelter) {
        const st = this.stamp(b.tile, 8 + fpExtra);
        for (let k = 0; k < st.tiles.length; k++) {
          const v = 1 - st.d[k] * 0.4;
          if (v > this.shelterAcc[st.tiles[k]]) this.shelterAcc[st.tiles[k]] = v;
        }
      }
      if (info.shield) {
        const st = this.stamp(b.tile, Math.max(6, info.radius) + fpExtra);
        for (let k = 0; k < st.tiles.length; k++) {
          const v = 0.85 - st.d[k] * 0.35;
          if (v > this.shieldAcc[st.tiles[k]]) this.shieldAcc[st.tiles[k]] = v;
        }
      }
      // traffic sources → adjacent road tiles
      const trips = tripsOf(r, mods, this.cov[SERVICE_INDEX.transit][b.tile]);
      if (trips > 0) this.addTrips(b.tiles, b.tile, trips);
      if (work > 6000) {
        work = 0;
        yield;
      }
    }
    yield;

    // ── ancient ruins draw sightseers once a road reaches them
    let reach = 0;
    for (const t of this.ruins) {
      if (p.feature[t] !== Feature.Ruins) continue;
      let near = p.road[t] !== 0;
      if (!near) for (const x of this.stamp(t, 2).tiles) if (p.road[x]) (near = true);
      if (!near) continue;
      reach++;
      const st = this.stamp(t, 4);
      for (let k = 0; k < st.tiles.length; k++) this.tourAcc[st.tiles[k]] += 0.6 * (1 - st.d[k]);
    }
    this.ruinsReachable = reach;

    // ── traffic diffusion over the road graph (flows prefer high-capacity roads)
    const rc = this.roadCount;
    const list = this.roadList, start = this.roadStart, nbr = this.roadNbr, cap = this.roadCap, capSum = this.capSum;
    let la = this.loadA, lb = this.loadB;
    for (let i = 0; i < rc; i++) la[i] = this.src[list[i]];
    for (let it = 0; it < 8; it++) {
      for (let i = 0; i < rc; i++) {
        let acc = 0;
        for (let q = start[i]; q < start[i + 1]; q++) {
          const j = nbr[q];
          acc += (la[j] * cap[i]) / (capSum[j] || 1);
        }
        lb[i] = this.src[list[i]] + 0.72 * acc;
      }
      const tmp = la;
      la = lb;
      lb = tmp;
      if (rc > 3000 && (it & 1)) yield;
    }
    let congSum = 0, loadSum = 0;
    this.traffic.fill(-1);
    for (let i = 0; i < rc; i++) {
      const t = list[i];
      const load = la[i];
      const kind = p.road[t];
      const c = Math.min(1.5, load / (cap[i] || 1));
      this.trafficLoad[t] = load;
      this.traffic[t] = c;
      if (!isRail(kind)) {
        congSum += c * load;
        loadSum += load;
        // traffic noise & fumes
        this.noiseAcc[t] += Math.min(30, 4 + c * 22);
        this.polAcc[t] += c * 9;
      }
    }
    this.avgTraffic = loadSum > 0 ? congSum / loadSum : 0;
    yield;

    // ── per-tile resolve + temporal smoothing
    const lv = this.landValue, pollution = this.pollution, noiseF = this.noise, crime = this.crime;
    const covArr = this.cov, covAcc = this.covAcc;
    const orb = ctx.orbitalCoverage;
    const flags = p.flags;
    const unemp = ctx.unemployment, edu = ctx.eduAvg;
    const crimeTmp = this.crimeTmp;
    const police = SERVICE_INDEX.police;
    const sCount = SERVICES.length;
    let lvSum = 0, lvN = 0, polSum = 0, polN = 0, crimeSum = 0, crimeN = 0, noiseSum = 0;
    for (let t0 = 0; t0 < n; t0 += 4096) {
      const t1 = Math.min(n, t0 + 4096);
      for (let t = t0; t < t1; t++) {
        let covLv = 0;
        for (let s = 0; s < sCount; s++) {
          const v = Math.min(1, covAcc[s][t] + orb[s]);
          covArr[s][t] = v;
          covLv += v * LV_WEIGHT[s];
        }
        const polT = Math.min(100, this.polAcc[t]);
        pollution[t] += (polT - pollution[t]) * SMOOTH;
        const noiseT = Math.min(100, this.noiseAcc[t]);
        noiseF[t] += (noiseT - noiseF[t]) * SMOOTH;
        this.happyFx[t] = this.happyAcc[t];
        this.tourism[t] = Math.min(1, this.tourAcc[t] + covArr[SERVICE_INDEX.leisure][t] * 0.35 + covArr[SERVICE_INDEX.tourism][t] * 0.5);
        this.shelter[t] = this.shelterAcc[t];
        this.shield[t] = this.shieldAcc[t];
        if (p.isWater(t)) {
          lv[t] = 0;
          crimeTmp[t] = 0;
          continue;
        }
        const mods = ctx.modsAt(p.district[t]);
        // land value
        let lvT = this.lvBase[t] + covLv * 0.75 + this.lvAcc[t] + this.happyAcc[t] * 0.3 - pollution[t] * 0.45 - noiseF[t] * 0.22 - crime[t] * 0.15 + mods.landValue;
        const f = flags[t];
        if (f) {
          if (f & TileFlag.Blessed) lvT += 20;
          if (f & TileFlag.Scorched) lvT -= 15;
          if (f & TileFlag.Irradiated) lvT -= 40;
          if (f & TileFlag.Goo) lvT -= 30;
          if (f & TileFlag.Flooded) lvT -= 20;
          if (f & TileFlag.Burning) lvT -= 10;
        }
        lvT = lvT < 0 ? 0 : lvT > 100 ? 100 : lvT;
        lv[t] += (lvT - lv[t]) * SMOOTH;
        // crime
        const dens = this.residents[t] + this.workers[t] * 0.4;
        let crT = 0;
        if (dens > 0) {
          crT = (Math.sqrt(dens) * 2.2 + unemp * 70 + Math.max(0, 40 - lv[t]) * 0.35 + (1 - Math.min(1, edu)) * 10) * mods.crime - covArr[police][t] * 55;
          crT = crT < 0 ? 0 : crT > 100 ? 100 : crT;
        }
        crimeTmp[t] = crT;
        if (this.residents[t] + this.workers[t] > 0 || p.road[t]) {
          lvSum += lv[t];
          lvN++;
          polSum += pollution[t];
          noiseSum += noiseF[t];
          polN++;
        }
      }
      yield;
    }
    // crime spills a little into neighbouring tiles, then smooths in time
    const g = p.grid;
    for (let t0 = 0; t0 < n; t0 += 4096) {
      const t1 = Math.min(n, t0 + 4096);
      for (let t = t0; t < t1; t++) {
        let m = crimeTmp[t];
        let sum = 0, cnt = 0;
        for (let q = g.start[t]; q < g.start[t + 1]; q++) {
          sum += crimeTmp[g.nbr[q]];
          cnt++;
        }
        const spill = cnt ? (sum / cnt) * 0.6 : 0;
        if (spill > m) m = spill;
        crime[t] += (m - crime[t]) * SMOOTH;
        if (this.residents[t] > 0) {
          crimeSum += crime[t] * this.residents[t];
          crimeN += this.residents[t];
        }
      }
      yield;
    }
    this.avgLandValue = lvN ? lvSum / lvN : 0;
    this.avgPollution = polN ? polSum / polN : 0;
    this.avgNoise = polN ? noiseSum / polN : 0;
    this.avgCrime = crimeN ? crimeSum / crimeN : 0;
    this.passes++;
  }

  /** Spread a building's trips over its adjacent (non-rail) road tiles: anchor first, else the whole footprint. */
  private addTrips(tiles: number[], anchor: number, trips: number): void {
    if (this.spreadTrips(anchor, trips)) return;
    let found = 0;
    for (let i = 0; i < tiles.length; i++) found += this.countRoads(tiles[i]);
    if (!found) return;
    const share = trips / found;
    for (let i = 0; i < tiles.length; i++) this.spreadTrips(tiles[i], share * this.countRoads(tiles[i]));
  }

  private countRoads(t: number): number {
    const p = this.planet;
    const g = p.grid;
    let c = 0;
    for (let q = g.start[t]; q < g.start[t + 1]; q++) {
      const k = p.road[g.nbr[q]];
      if (k && !isRail(k)) c++;
    }
    return c;
  }

  private spreadTrips(t: number, trips: number): boolean {
    const c = this.countRoads(t);
    if (!c) return false;
    const p = this.planet;
    const g = p.grid;
    const share = trips / c;
    for (let q = g.start[t]; q < g.start[t + 1]; q++) {
      const nb = g.nbr[q];
      const k = p.road[nb];
      if (k && !isRail(k)) this.src[nb] += share;
    }
    return true;
  }

  dispose(): void {
    this.stamps.clear();
  }
}

/** Car trips per day generated by a building. */
export function tripsOf(r: BRec, mods: Mods, transitCov: number): number {
  const info = r.info;
  const share = Math.min(0.75, transitCov * 0.5 + mods.transitShare);
  let trips = 0;
  if (info.fam === 0) trips = r.residents * 0.55;
  else if (info.fam === 1) trips = r.workers * 0.5 + r.capacity * 0.9;
  else if (info.fam === 2) trips = r.workers * 0.5 + r.capacity * 0.55;
  else if (info.fam === 3) trips = r.workers * 0.55;
  else trips = r.workers * 0.4 + r.residents * 0.5 + r.visitors * 0.02;
  return trips * (1 - share) * mods.traffic;
}

export type { DeptId };
