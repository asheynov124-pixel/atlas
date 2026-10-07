/**
 * OWNER: god.
 * Damage — how god powers hurt (or help) a city, always through PlanetOps so the sim, renderers and UI stay in
 * sync. Every destructive helper respects damage resistance (shield generators, blessings, shelters — the sim's
 * `damageResistance(tile)`), batches its PlanetOps calls, spawns the matching FX (collapse dust, blasts, flying
 * buildings) and accumulates a DamageReport the power turns into news at the end.
 */
import { Matrix4, Vector3 } from 'three';
import { Biome, BuildingState, Feature, TileFlag } from '../core/types';
import { getItem } from '../content/catalog';
import * as simModule from '../sim/Simulation';
import type { BuildingInstance, Planet } from '../world/planet';
import type { PlanetOps } from '../world/ops';
import type { FxLayer } from '../render/fx/FxLayer';
import type { PlanetView } from '../render/PlanetView';

export interface DamageReport {
  destroyed: number;
  displaced: number;
  burned: number;
  flooded: number;
  frozen: number;
  /** tiles touched */
  tiles: number;
}

export interface WreckOpts {
  /** base probability a building in range is destroyed (before resistance), default 1 */
  chance?: number;
  /** extra probability for tall buildings (×height in units / 10) */
  heightBias?: number;
  /** only buildings at most this tall (world units) */
  maxHeight?: number;
  /** leave rubble (default true) */
  rubble?: boolean;
  /** visual: dust collapse (default), fiery blast, nothing (caller animates), or custom */
  fx?: 'collapse' | 'blast' | 'none';
  /** take a copy for animation before it is removed (flyers) */
  launch?: (b: BuildingInstance, m: Matrix4) => void;
  /** also break roads (probability 0..1) */
  roads?: number;
  /** strip trees / flowers to rubble */
  trees?: boolean;
  /** remove props on the tiles (default true) */
  props?: boolean;
  /** set this tile flag on the tiles */
  flag?: number;
  report?: DamageReport;
  /** random source (default Math.random) */
  rand?: () => number;
  /** ignore resistance (planet-ending powers) */
  unstoppable?: boolean;
}

const _m = new Matrix4();
const _p = new Vector3();
const _n = new Vector3();

/** 0..1 damage resistance of a tile (shields / blessings / shelters). */
export function resistance(tile: number): number {
  try {
    const fn = (simModule as { damageResistance?: (t: number) => number }).damageResistance;
    if (typeof fn === 'function') {
      const r = fn(tile);
      if (Number.isFinite(r)) return Math.max(0, Math.min(1, r));
    }
  } catch {
    /* sim unavailable */
  }
  return 0;
}

/** Approximate building height in world units. */
export function buildingHeight(b: BuildingInstance): number {
  const def = getItem(b.defId);
  const h = def?.height ?? (def?.footprint === 19 ? 5 : def?.footprint === 7 ? 3.5 : 2);
  return h * (def?.growable ? 0.6 + b.level * 0.25 : 1);
}

/** Residents / workers lost or displaced if this building goes. */
export function peopleIn(b: BuildingInstance): number {
  return Math.max(0, (b.occupants ?? 0) + (b.jobs ?? 0) * 0.3);
}

export class Damage {
  constructor(private planet: Planet, private ops: PlanetOps, private view: PlanetView, private fx: FxLayer) {}

  /** Buildings (unique) on a set of tiles. */
  buildingsOn(tiles: Iterable<number>): BuildingInstance[] {
    const p = this.planet;
    const seen = new Set<number>();
    const out: BuildingInstance[] = [];
    for (const t of tiles) {
      const id = p.building[t];
      if (id < 0 || seen.has(id)) continue;
      seen.add(id);
      const b = p.buildings.get(id);
      if (b) out.push(b);
    }
    return out;
  }

  /** World matrix of a building (falls back to its tile frame). */
  matrixOf(b: BuildingInstance, out = _m): Matrix4 {
    const m = this.view.buildings.getMatrix(b.id, out);
    if (m) return m;
    return this.view.buildings.matrixFor(b, out);
  }

  /**
   * Destroy buildings on `tiles` (each with probability chance × (1 − resistance) [+ height bias]).
   * Returns the destroyed instances (already removed from the planet).
   */
  wreck(tiles: Iterable<number> | number[], o: WreckOpts = {}): BuildingInstance[] {
    const list = Array.isArray(tiles) ? tiles : [...tiles];
    if (!list.length) return [];
    const rand = o.rand ?? Math.random;
    const out: BuildingInstance[] = [];
    const rep = o.report;
    for (const b of this.buildingsOn(list)) {
      const h = buildingHeight(b);
      if (o.maxHeight !== undefined && h > o.maxHeight) continue;
      const res = o.unstoppable ? 0 : resistance(b.tile);
      const chance = Math.min(1, (o.chance ?? 1) + (o.heightBias ?? 0) * (h / 10)) * (1 - res);
      if (rand() >= chance) continue;
      const m = this.matrixOf(b, _m);
      if (o.launch) {
        try {
          o.launch(b, m);
        } catch (e) {
          console.error('[god] launch failed', e);
        }
      } else if (o.fx !== 'none') {
        _p.setFromMatrixPosition(m);
        _n.copy(_p).normalize();
        _p.addScaledVector(_n, Math.min(3, h * 0.35));
        const size = Math.min(2.4, 0.6 + h * 0.15) * (b.tiles.length > 1 ? 1.5 : 1);
        if (o.fx === 'blast') this.fx.blast(_p, _n, size, { debris: Math.round(4 + size * 3) });
        else this.fx.collapse(_p, _n, size);
      }
      const people = peopleIn(b);
      if (this.ops.removeBuilding(b.id, o.rubble === false ? 'bulldoze' : 'disaster')) {
        out.push(b);
        if (rep) {
          rep.destroyed++;
          rep.displaced += people;
        }
      }
    }
    if (o.roads) {
      const r = list.filter((t) => this.planet.road[t] !== 0 && rand() < o.roads! * (1 - (o.unstoppable ? 0 : resistance(t))));
      if (r.length) this.ops.removeRoad(r);
    }
    if (o.props ?? true) {
      const props = this.ops.propsOn(list);
      for (const pr of props) this.ops.removeProp(pr.id);
    }
    if (o.trees) {
      const p = this.planet;
      const tr = list.filter((t) => {
        const f = p.feature[t];
        return f === Feature.Trees || f === Feature.DenseTrees || f === Feature.Flowers || f === Feature.AlienFlora;
      });
      if (tr.length) this.ops.setFeature(tr, o.rubble === false ? Feature.None : Feature.Rubble);
    }
    if (o.flag) this.flag(list, o.flag, true, rep);
    if (rep) rep.tiles += list.length;
    return out;
  }

  /** Set / clear a flag on tiles (land only for Flooded-less flags; respects resistance for harmful flags). */
  flag(tiles: number[], flag: number, on: boolean, rep?: DamageReport, chance = 1, rand: () => number = Math.random): number {
    const p = this.planet;
    const harmful = flag !== TileFlag.Blessed && flag !== TileFlag.Locked;
    const list = on
      ? tiles.filter((t) => {
          if (flag === TileFlag.Burning && (p.isWater(t) || p.flags[t] & (TileFlag.Flooded | TileFlag.Frozen))) return false;
          if (flag === TileFlag.Frozen && p.flags[t] & TileFlag.Burning) return true;
          return rand() < chance * (harmful ? 1 - resistance(t) : 1);
        })
      : tiles;
    if (!list.length) return 0;
    if (on && flag === TileFlag.Frozen) this.ops.setFlags(list, TileFlag.Burning, false);
    if (on && flag === TileFlag.Flooded) this.ops.setFlags(list, TileFlag.Burning, false);
    this.ops.setFlags(list, flag, on);
    if (rep && on) {
      if (flag === TileFlag.Burning) rep.burned += list.length;
      if (flag === TileFlag.Flooded) rep.flooded += list.length;
      if (flag === TileFlag.Frozen) rep.frozen += list.length;
    }
    return list.length;
  }

  /** Ignite tiles (buildings start burning; the sim spreads & fights the fire). */
  ignite(tiles: number[], chance = 1, rep?: DamageReport, rand: () => number = Math.random): number {
    const n = this.flag(tiles, TileFlag.Burning, true, rep, chance, rand);
    // burning buildings show it immediately
    for (const b of this.buildingsOn(tiles)) if (this.planet.flags[b.tile] & TileFlag.Burning && b.state === BuildingState.Active) this.ops.updateBuilding(b.id, { state: BuildingState.Burning });
    return n;
  }

  /** Change the biome of land tiles (water stays water). */
  biome(tiles: number[], biome: Biome, landOnly = true): void {
    const p = this.planet;
    const list = landOnly ? tiles.filter((t) => !p.isWater(t)) : tiles;
    if (list.length) this.ops.setBiome(list, biome);
  }

  /** Add / subtract elevation (levels) per tile. */
  raise(tiles: number[], deltas: number[] | number): void {
    const p = this.planet;
    const lv = tiles.map((t, i) => p.elevation[t] + (Array.isArray(deltas) ? deltas[i] : deltas));
    this.ops.setElevation(tiles, lv);
  }

  /** Bowl-shaped crater with a raised rim; returns the tiles of the bowl. */
  crater(center: number, radius: number, depth: number, biome: Biome = Biome.Crater): number[] {
    const p = this.planet;
    const g = p.grid;
    const bowl = g.disk(center, radius);
    const rim = g.ring(center, radius + 1);
    const lv: number[] = [];
    const ang0 = g.angle(center, center);
    void ang0;
    const maxA = Math.max(1e-4, g.angle(center, rim[0] ?? center));
    for (const t of bowl) {
      const a = g.angle(center, t) / maxA;
      lv.push(p.elevation[t] - Math.round(depth * (1 - a * a)));
    }
    this.ops.setElevation(bowl, lv);
    this.ops.setElevation(rim, rim.map((t) => p.elevation[t] + (depth >= 2 ? 1 : 0)));
    this.biome(bowl, biome);
    const feat = bowl.filter((t) => !p.isWater(t) && p.building[t] < 0 && p.road[t] === 0);
    if (feat.length) this.ops.setFeature(feat.slice(0, Math.max(1, Math.ceil(feat.length * 0.3))), Feature.Crater);
    return bowl;
  }
}
