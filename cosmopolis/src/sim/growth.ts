/**
 * Zoned growth — tracks buildable zoned lots per family and spawns growable buildings where demand is positive.
 * Lots are picked by tournament selection on desirability (land value, services, pollution, customers),
 * gated by utilities in career mode (no power ⇒ no development, like classic SimCity). New buildings start in
 * the Constructing state; big lots (footprint 7) appear when a whole block is zoned and desirable.
 * Also owns the def pickers used for level-up replacements.
 */
import { BuildingState, Feature, TileFlag, Zone } from '../core/types';
import { allItems, catalogVersion, type ItemDef } from '../content/catalog';
import type { Planet } from '../world/planet';
import type { Simulation } from './Simulation';
import { SERVICE_INDEX } from './params';
import { U } from './state';

const BLOCK_FLAGS = TileFlag.Burning | TileFlag.Flooded | TileFlag.Goo | TileFlag.Irradiated | TileFlag.Locked | TileFlag.Frozen;

export function familyIndexOfZone(z: number): number {
  if (z >= 1 && z <= 3) return 0;
  if (z >= 4 && z <= 6) return 1;
  if (z >= 7 && z <= 10) return 2;
  if (z === 11) return 3;
  return -1;
}

export class Growth {
  /** candidate lots per family */
  cand: Int32Array[] = [new Int32Array(0), new Int32Array(0), new Int32Array(0), new Int32Array(0)];
  candN = [0, 0, 0, 0];
  /** zoned tiles (any state) per family */
  zoned = [0, 0, 0, 0];
  dirty = true;
  private acc = [0, 0, 0, 0];
  /** lots that could not develop for lack of power / oxygen (last day) */
  blockedPower = 0;
  blockedOxygen = 0;
  /** zoned lots without road access */
  noRoad = 0;
  /** zoned lot with no road (example tile) */
  noRoadTile = -1;
  blockedTile = -1;
  private byZone = new Map<number, ItemDef[]>();

  constructor(private planet: Planet) {}

  private maxLv = new Int8Array(16);
  private catVer = -1;

  invalidateCatalog(): void {
    this.byZone.clear();
    this.maxLv.fill(0);
  }

  /** Growables available for a zone on this planet (cached). */
  defsFor(zone: number): ItemDef[] {
    const v = catalogVersion();
    if (v !== this.catVer) {
      this.catVer = v;
      this.invalidateCatalog();
    }
    let list = this.byZone.get(zone);
    if (!list) {
      const type = this.planet.spec.type;
      list = allItems().filter((d) => d.growable?.zone === zone && (!d.planetTypes || d.planetTypes.includes(type)));
      this.byZone.set(zone, list);
    }
    return list;
  }

  /** Highest level any growable of this zone supports. */
  maxLevel(zone: number): number {
    const cached = this.maxLv[zone];
    if (cached) return cached;
    let m = 0;
    for (const d of this.defsFor(zone)) m = Math.max(m, Math.min(5, d.growable!.maxLevel ?? 5));
    this.maxLv[zone] = m || 5;
    return this.maxLv[zone];
  }

  refresh(): void {
    const p = this.planet;
    const n = p.count;
    for (let k = 0; k < 4; k++) {
      if (this.cand[k].length < n) this.cand[k] = new Int32Array(n);
      this.candN[k] = 0;
      this.zoned[k] = 0;
    }
    this.noRoad = 0;
    this.noRoadTile = -1;
    for (let t = 0; t < n; t++) {
      const z = p.zone[t];
      if (!z) continue;
      const fam = familyIndexOfZone(z);
      if (fam < 0) continue;
      this.zoned[fam]++;
      if (p.building[t] >= 0 || p.road[t] || p.isWater(t)) continue;
      if (p.flags[t] & BLOCK_FLAGS) continue;
      if (p.feature[t] === Feature.Ruins) continue;
      if (!p.hasRoadAccess(t)) {
        this.noRoad++;
        if (this.noRoadTile < 0) this.noRoadTile = t;
        continue;
      }
      this.cand[fam][this.candN[fam]++] = t;
    }
    this.dirty = false;
  }

  /** Desirability of tile t for a family (higher = better). */
  score(sim: Simulation, fam: number, t: number): number {
    const f = sim.fields!;
    const lv = f.landValue[t];
    const cov = f.cov;
    switch (fam) {
      case 0:
        return lv + cov[SERVICE_INDEX.leisure][t] * 18 + cov[SERVICE_INDEX.education][t] * 8 - f.pollution[t] * 0.9 - f.noise[t] * 0.3 - f.crime[t] * 0.25;
      case 1:
        return lv * 0.7 + Math.min(40, Math.sqrt(f.trafficLoad[t] + neighbourLoad(sim.planet!, f.trafficLoad, t)) * 2) - f.crime[t] * 0.2;
      case 2:
        return 40 - lv * 0.15 + cov[SERVICE_INDEX.fire][t] * 10 - f.crime[t] * 0.1;
      default:
        return lv * 0.8 + cov[SERVICE_INDEX.data][t] * 15 + cov[SERVICE_INDEX.transit][t] * 10 - f.pollution[t] * 0.4;
    }
  }

  /** Spawn new growables for one day. Returns number placed. */
  spawnDay(sim: Simulation): number {
    if (this.dirty) this.refresh();
    const p = this.planet;
    const ops = sim.ops;
    if (!ops) return 0;
    const career = !sim.sandbox;
    const strict = career && !sim.rules.freeUtilities;
    this.blockedPower = 0;
    this.blockedOxygen = 0;
    this.blockedTile = -1;
    let placed = 0;
    const demands = [sim.demand.R, sim.demand.C, sim.demand.I, sim.demand.O];
    for (let fam = 0; fam < 4; fam++) {
      const n = this.candN[fam];
      const d = sim.rules.maxDemand ? 1 : demands[fam];
      if (n === 0 || d <= 0.03) {
        this.acc[fam] = 0;
        continue;
      }
      const rate = d * (0.5 + Math.min(5, n / 60)) * (sim.rules.fastGrowth ? 3 : 1);
      this.acc[fam] += rate;
      let k = Math.min(30, Math.floor(this.acc[fam]));
      this.acc[fam] -= k;
      let attempts = k * 3;
      while (k > 0 && attempts-- > 0 && this.candN[fam] > 0) {
        const t = this.pick(sim, fam);
        if (t < 0) break;
        if (!this.valid(t)) {
          this.removeCand(fam, t);
          continue;
        }
        if (strict) {
          const net = sim.nets!.netOf(t);
          const nets = sim.nets!;
          if (!(sim.exempt & 1) && (!nets.hasSupply(U.Power, net) || (net >= 0 && nets.ratioGrow[U.Power][net] < 0.999))) {
            this.blockedPower++;
            if (this.blockedTile < 0) this.blockedTile = t;
            continue;
          }
          if (sim.needsOxygen && !(sim.exempt & 4) && (!nets.hasSupply(U.Oxygen, net) || (net >= 0 && nets.ratioGrow[U.Oxygen][net] < 0.999))) {
            this.blockedOxygen++;
            if (this.blockedTile < 0) this.blockedTile = t;
            continue;
          }
        }
        if (this.build(sim, t)) {
          placed++;
          k--;
          this.removeCand(fam, t);
        } else this.removeCand(fam, t);
      }
    }
    return placed;
  }

  private valid(t: number): boolean {
    const p = this.planet;
    return p.zone[t] !== 0 && p.building[t] < 0 && !p.road[t] && !p.isWater(t) && !(p.flags[t] & BLOCK_FLAGS) && p.hasRoadAccess(t);
  }

  private removeCand(fam: number, t: number): void {
    const arr = this.cand[fam];
    const n = this.candN[fam];
    for (let i = 0; i < n; i++) {
      if (arr[i] === t) {
        arr[i] = arr[n - 1];
        this.candN[fam] = n - 1;
        return;
      }
    }
  }

  /** Tournament selection: best of a few random lots. */
  private pick(sim: Simulation, fam: number): number {
    const n = this.candN[fam];
    if (!n) return -1;
    const arr = this.cand[fam];
    const rng = sim.rng;
    let best = -1, bestS = -Infinity;
    const tries = Math.min(n, 6);
    for (let i = 0; i < tries; i++) {
      const t = arr[Math.floor(rng.next() * n)];
      const s = this.score(sim, fam, t) + rng.next() * 12;
      if (s > bestS) {
        bestS = s;
        best = t;
      }
    }
    return best;
  }

  /** Place a new growable on lot t (Constructing). */
  build(sim: Simulation, t: number): boolean {
    const p = this.planet;
    const zone = p.zone[t] as Zone;
    const defs = this.defsFor(zone);
    if (!defs.length) return false;
    const rng = sim.rng;
    // big lot? whole ring zoned the same, empty, flat-ish, desirable
    let def: ItemDef | null = null;
    const big = defs.filter((d) => d.footprint === 7 && (d.growable!.minLevel ?? 1) <= 2);
    if (big.length && rng.chance(0.22) && this.blockFits(t, zone)) def = rng.pick(big);
    if (!def) {
      const small = defs.filter((d) => d.footprint === 1);
      const pool = small.filter((d) => (d.growable!.minLevel ?? 1) <= 1);
      const src = pool.length ? pool : small.length ? small : defs;
      if (!src.length) return false;
      def = weightedPick(rng, src);
    }
    if (def.footprint !== 1 && !this.blockFits(t, zone)) return false;
    const level = Math.max(1, def.growable!.minLevel ?? 1);
    const rot = roadFacing(p, t);
    const b = sim.ops!.placeBuilding(def.id, t, rot, {
      level,
      variant: Math.floor(rng.next() * Math.max(1, def.variants ?? 1)),
      state: BuildingState.Constructing,
      day: sim.day,
    });
    if (!b) return false;
    b.progress = 0;
    return true;
  }

  private blockFits(t: number, zone: number): boolean {
    const p = this.planet;
    const tiles = p.grid.footprint(t, 7);
    if (tiles.length < 6) return false;
    const e = p.elevation[t];
    let road = false;
    for (const x of tiles) {
      if (p.zone[x] !== zone || p.building[x] >= 0 || p.road[x] || p.isWater(x) || p.flags[x] & BLOCK_FLAGS) return false;
      if (Math.abs(p.elevation[x] - e) > 1) return false;
      if (p.hasRoadAccess(x)) road = true;
    }
    return road;
  }

  /** Pick a def for a level-up (same zone & footprint, range includes level). */
  defForLevel(zone: number, footprint: number, level: number, rngNext: () => number): ItemDef | null {
    const defs = this.defsFor(zone).filter((d) => d.footprint === footprint && (d.growable!.minLevel ?? 1) <= level && (d.growable!.maxLevel ?? 5) >= level);
    if (!defs.length) return null;
    return defs[Math.floor(rngNext() * defs.length)];
  }
}

function weightedPick(rng: { next(): number }, defs: ItemDef[]): ItemDef {
  // variety: every def equally likely; defs with many variants get a small boost
  let total = 0;
  for (const d of defs) total += 1 + Math.min(4, d.variants ?? 1) * 0.15;
  let r = rng.next() * total;
  for (const d of defs) {
    r -= 1 + Math.min(4, d.variants ?? 1) * 0.15;
    if (r <= 0) return d;
  }
  return defs[defs.length - 1];
}

/** Rotation index facing a road neighbour (0 if none). */
export function roadFacing(p: Planet, t: number): number {
  const g = p.grid;
  const d = g.degree(t);
  for (let k = 0; k < d; k++) if (p.road[g.neighbor(t, k)]) return k;
  return 0;
}

function neighbourLoad(p: Planet, load: Float32Array, t: number): number {
  const g = p.grid;
  let s = 0;
  for (let q = g.start[t]; q < g.start[t + 1]; q++) if (p.road[g.nbr[q]]) s += load[g.nbr[q]];
  return s;
}

export function isGrowableActive(state: BuildingState): boolean {
  return state === BuildingState.Active || state === BuildingState.Upgrading;
}
