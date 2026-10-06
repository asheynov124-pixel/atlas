/**
 * OWNER: tools.
 * History — snapshot-diff undo / redo for player commands (driven by game/Commands).
 *
 * A Recorder is opened per gesture (Commands.begin/end). Before a command mutates anything it calls
 * `touch(tiles)`, which captures — at first sight only — every per-tile array of those tiles AND their neighbours,
 * every building standing on them (whose whole footprint is then touched too) and every prop on them. Orbitals,
 * districts, sea level and building patches (tint / name) are captured through their own hooks.
 * `finish()` captures the matching "after" state, producing a HistoryEntry with two Sides.
 *
 * `applySide(ops, side, other)` restores one Side:
 *   1. removes buildings / props that belong to either side or currently occupy the core tiles,
 *   2. writes the core tiles' arrays back, and only the link bits of neighbour tiles that point INTO the core,
 *   3. re-places the side's buildings (same ids, levels, variants, styles, tints, names) and props,
 *   4. restores orbitals, districts, sea level and patches, then emits one batched event per kind.
 * Restoring never records (it goes straight to PlanetOps).
 */
import { bus } from '../core/events';
import type { PlanetOps } from '../world/ops';
import type { BuildingInstance, District, OrbitalInstance, Planet, PropInstance } from '../world/planet';

export type BuildingPatch = Partial<Pick<BuildingInstance, 'tint' | 'name' | 'style' | 'variant' | 'rot' | 'level'>>;

export interface TileSnap {
  tiles: Int32Array;
  elevation: Int8Array;
  biome: Uint8Array;
  feature: Uint8Array;
  zone: Uint8Array;
  road: Uint8Array;
  roadLinks: Uint8Array;
  district: Uint8Array;
}

export interface Side {
  /** core tiles (fully restored) */
  core: TileSnap;
  /** neighbour tiles: [tile, linkBits] — only the bits pointing into the core are restored */
  links: Int32Array;
  buildings: BuildingInstance[];
  props: PropInstance[];
  /** tracked orbitals: id → instance (null = did not exist) */
  orbitals: [number, OrbitalInstance | null][];
  districts: District[] | null;
  seaOffset: number | null;
  patches: [number, BuildingPatch][];
}

export interface HistoryEntry {
  label: string;
  planetId: string;
  before: Side;
  after: Side;
  /** credits spent by the gesture (refunded on undo, charged again on redo) */
  money: number;
  /** representative tile (camera focus) */
  focus: number;
  time: number;
}

function cloneBuilding(b: BuildingInstance): BuildingInstance {
  return { ...b, tiles: b.tiles.slice() };
}

function cloneDistricts(ds: District[]): District[] {
  return ds.map((d) => (d ? { ...d, policies: d.policies.slice() } : (d as District)));
}

export class Recorder {
  /** tiles whose arrays were captured (core + neighbours), in capture order */
  private seen = new Map<number, number>();
  private capTiles: number[] = [];
  private capE: number[] = [];
  private capB: number[] = [];
  private capF: number[] = [];
  private capZ: number[] = [];
  private capR: number[] = [];
  private capL: number[] = [];
  private capD: number[] = [];
  readonly core = new Set<number>();
  private buildingsBefore = new Map<number, BuildingInstance>();
  private propsBefore = new Map<number, PropInstance>();
  private orbitalsBefore = new Map<number, OrbitalInstance | null>();
  private patchBefore = new Map<number, BuildingPatch>();
  private patchKeys = new Map<number, Set<keyof BuildingPatch>>();
  private districtsBefore: District[] | null = null;
  private seaBefore: number | null = null;
  private propIndex: Map<number, PropInstance[]> | null = null;
  money = 0;
  focus = -1;

  constructor(readonly planet: Planet) {}

  get empty(): boolean {
    return this.core.size === 0 && this.orbitalsBefore.size === 0 && this.patchBefore.size === 0 && this.districtsBefore === null && this.seaBefore === null;
  }

  private capture(t: number): void {
    if (this.seen.has(t)) return;
    const p = this.planet;
    this.seen.set(t, this.capTiles.length);
    this.capTiles.push(t);
    this.capE.push(p.elevation[t]);
    this.capB.push(p.biome[t]);
    this.capF.push(p.feature[t]);
    this.capZ.push(p.zone[t]);
    this.capR.push(p.road[t]);
    this.capL.push(p.roadLinks[t]);
    this.capD.push(p.district[t]);
  }

  private propsOn(t: number): PropInstance[] | undefined {
    if (!this.propIndex) {
      this.propIndex = new Map();
      for (const pr of this.planet.props.values()) {
        let list = this.propIndex.get(pr.tile);
        if (!list) this.propIndex.set(pr.tile, (list = []));
        list.push(pr);
      }
    }
    return this.propIndex.get(t);
  }

  /** Capture everything on these tiles before they change (idempotent per tile). */
  touch(tiles: Iterable<number>): void {
    const p = this.planet;
    const g = p.grid;
    const queue: number[] = [];
    for (const t of tiles) if (t >= 0 && t < p.count) queue.push(t);
    for (let qi = 0; qi < queue.length; qi++) {
      const t = queue[qi];
      if (this.core.has(t)) continue;
      this.core.add(t);
      if (this.focus < 0) this.focus = t;
      this.capture(t);
      for (let q = g.start[t]; q < g.start[t + 1]; q++) this.capture(g.nbr[q]);
      const bid = p.building[t];
      if (bid >= 0 && !this.buildingsBefore.has(bid)) {
        const b = p.buildings.get(bid);
        if (b) {
          this.buildingsBefore.set(bid, cloneBuilding(b));
          for (const ft of b.tiles) if (!this.core.has(ft)) queue.push(ft);
        }
      }
      const props = this.propsOn(t);
      if (props) for (const pr of props) if (!this.propsBefore.has(pr.id)) this.propsBefore.set(pr.id, { ...pr });
    }
  }

  /** Track an orbital (call before changing / right after creating — pass `created` for new ones). */
  touchOrbital(id: number, created = false): void {
    if (this.orbitalsBefore.has(id)) return;
    const o = this.planet.orbitals.get(id);
    this.orbitalsBefore.set(id, created || !o ? null : { ...o });
  }

  /** Track a building field patch (tint / name / style …) without touching tiles. */
  touchPatch(id: number, keys: (keyof BuildingPatch)[]): void {
    const b = this.planet.buildings.get(id);
    if (!b) return;
    let set = this.patchKeys.get(id);
    if (!set) this.patchKeys.set(id, (set = new Set()));
    let before = this.patchBefore.get(id);
    if (!before) this.patchBefore.set(id, (before = {}));
    for (const k of keys) {
      if (set.has(k)) continue;
      set.add(k);
      (before as Record<string, unknown>)[k] = b[k];
    }
    if (this.focus < 0) this.focus = b.tile;
  }

  touchDistricts(): void {
    if (this.districtsBefore === null) this.districtsBefore = cloneDistricts(this.planet.districts);
  }

  touchSea(): void {
    if (this.seaBefore === null) this.seaBefore = this.planet.seaOffset;
  }

  private snapTiles(after: boolean): { core: TileSnap; links: Int32Array } {
    const p = this.planet;
    const coreList = [...this.core];
    const n = coreList.length;
    const core: TileSnap = {
      tiles: new Int32Array(coreList),
      elevation: new Int8Array(n),
      biome: new Uint8Array(n),
      feature: new Uint8Array(n),
      zone: new Uint8Array(n),
      road: new Uint8Array(n),
      roadLinks: new Uint8Array(n),
      district: new Uint8Array(n),
    };
    for (let i = 0; i < n; i++) {
      const t = coreList[i];
      if (after) {
        core.elevation[i] = p.elevation[t];
        core.biome[i] = p.biome[t];
        core.feature[i] = p.feature[t];
        core.zone[i] = p.zone[t];
        core.road[i] = p.road[t];
        core.roadLinks[i] = p.roadLinks[t];
        core.district[i] = p.district[t];
      } else {
        const j = this.seen.get(t)!;
        core.elevation[i] = this.capE[j];
        core.biome[i] = this.capB[j];
        core.feature[i] = this.capF[j];
        core.zone[i] = this.capZ[j];
        core.road[i] = this.capR[j];
        core.roadLinks[i] = this.capL[j];
        core.district[i] = this.capD[j];
      }
    }
    const links: number[] = [];
    for (let j = 0; j < this.capTiles.length; j++) {
      const t = this.capTiles[j];
      if (this.core.has(t)) continue;
      links.push(t, after ? p.roadLinks[t] : this.capL[j]);
    }
    return { core, links: new Int32Array(links) };
  }

  /** Close the recording: before / after sides of everything touched. */
  finish(label: string, planetId: string): HistoryEntry {
    const p = this.planet;
    const beforeTiles = this.snapTiles(false);
    const afterTiles = this.snapTiles(true);
    // buildings after: whatever occupies the core now + survivors of the before set
    const afterB = new Map<number, BuildingInstance>();
    for (const t of this.core) {
      const bid = p.building[t];
      if (bid >= 0 && !afterB.has(bid)) {
        const b = p.buildings.get(bid);
        if (b) afterB.set(bid, cloneBuilding(b));
      }
    }
    for (const id of this.buildingsBefore.keys()) {
      const b = p.buildings.get(id);
      if (b && !afterB.has(id)) afterB.set(id, cloneBuilding(b));
    }
    const afterP = new Map<number, PropInstance>();
    for (const pr of p.props.values()) if (this.core.has(pr.tile) || this.propsBefore.has(pr.id)) afterP.set(pr.id, { ...pr });
    const orbBefore: [number, OrbitalInstance | null][] = [];
    const orbAfter: [number, OrbitalInstance | null][] = [];
    for (const [id, o] of this.orbitalsBefore) {
      orbBefore.push([id, o]);
      const now = p.orbitals.get(id);
      orbAfter.push([id, now ? { ...now } : null]);
    }
    const patchBefore: [number, BuildingPatch][] = [];
    const patchAfter: [number, BuildingPatch][] = [];
    for (const [id, before] of this.patchBefore) {
      patchBefore.push([id, before]);
      const b = p.buildings.get(id);
      const after: BuildingPatch = {};
      for (const k of this.patchKeys.get(id) ?? []) (after as Record<string, unknown>)[k] = b ? b[k] : (before as Record<string, unknown>)[k];
      patchAfter.push([id, after]);
    }
    return {
      label,
      planetId,
      money: this.money,
      focus: this.focus,
      time: Date.now(),
      before: {
        core: beforeTiles.core,
        links: beforeTiles.links,
        buildings: [...this.buildingsBefore.values()],
        props: [...this.propsBefore.values()],
        orbitals: orbBefore,
        districts: this.districtsBefore,
        seaOffset: this.seaBefore,
        patches: patchBefore,
      },
      after: {
        core: afterTiles.core,
        links: afterTiles.links,
        buildings: [...afterB.values()],
        props: [...afterP.values()],
        orbitals: orbAfter,
        districts: this.districtsBefore ? cloneDistricts(p.districts) : null,
        seaOffset: this.seaBefore !== null ? p.seaOffset : null,
        patches: patchAfter,
      },
    };
  }
}

/** Does the side change anything relative to the current planet? (no-op entries are dropped) */
export function sidesDiffer(a: Side, b: Side): boolean {
  const ca = a.core, cb = b.core;
  for (let i = 0; i < ca.tiles.length; i++) {
    if (ca.elevation[i] !== cb.elevation[i] || ca.biome[i] !== cb.biome[i] || ca.feature[i] !== cb.feature[i] || ca.zone[i] !== cb.zone[i]) return true;
    if (ca.road[i] !== cb.road[i] || ca.roadLinks[i] !== cb.roadLinks[i] || ca.district[i] !== cb.district[i]) return true;
  }
  for (let i = 1; i < a.links.length; i += 2) if (a.links[i] !== b.links[i]) return true;
  if (a.buildings.length !== b.buildings.length || a.props.length !== b.props.length) return true;
  const bIds = new Map(b.buildings.map((x) => [x.id, x]));
  for (const x of a.buildings) {
    const y = bIds.get(x.id);
    if (!y || y.tile !== x.tile || y.defId !== x.defId || y.rot !== x.rot || y.level !== x.level || y.tint !== x.tint || y.name !== x.name || y.style !== x.style) return true;
  }
  const pIds = new Map(b.props.map((x) => [x.id, x]));
  for (const x of a.props) {
    const y = pIds.get(x.id);
    if (!y || y.tile !== x.tile || y.u !== x.u || y.v !== x.v || y.yaw !== x.yaw || y.scale !== x.scale || y.tint !== x.tint) return true;
  }
  for (let i = 0; i < a.orbitals.length; i++) if ((a.orbitals[i][1] === null) !== (b.orbitals[i]?.[1] === null)) return true;
  if (a.seaOffset !== b.seaOffset) return true;
  if (a.districts && b.districts && JSON.stringify(a.districts) !== JSON.stringify(b.districts)) return true;
  for (let i = 0; i < a.patches.length; i++) if (JSON.stringify(a.patches[i][1]) !== JSON.stringify(b.patches[i]?.[1])) return true;
  return false;
}

/**
 * Restore one side of an entry. `other` is the opposite side (its buildings / props / orbitals are removed too).
 */
export function applySide(ops: PlanetOps, side: Side, other: Side): void {
  const p = ops.planet;
  const g = p.grid;
  const core = side.core;
  const coreSet = new Set<number>(core.tiles);
  // 1. clear entities
  const removeB = new Set<number>();
  for (const b of side.buildings) removeB.add(b.id);
  for (const b of other.buildings) removeB.add(b.id);
  for (const t of core.tiles) if (p.building[t] >= 0) removeB.add(p.building[t]);
  for (const id of removeB) if (p.buildings.has(id)) ops.removeBuilding(id, 'undo');
  const removeP = new Set<number>();
  for (const pr of side.props) removeP.add(pr.id);
  for (const pr of other.props) removeP.add(pr.id);
  for (const pr of p.props.values()) if (coreSet.has(pr.tile)) removeP.add(pr.id);
  for (const id of removeP) if (p.props.has(id)) ops.removeProp(id);

  // 2. tile arrays
  const terrain: number[] = [];
  const zone: number[] = [];
  const road: number[] = [];
  const district: number[] = [];
  let elevationChanged = false;
  for (let i = 0; i < core.tiles.length; i++) {
    const t = core.tiles[i];
    if (p.elevation[t] !== core.elevation[i] || p.biome[t] !== core.biome[i] || p.feature[t] !== core.feature[i]) {
      if (p.elevation[t] !== core.elevation[i]) elevationChanged = true;
      p.elevation[t] = core.elevation[i];
      p.biome[t] = core.biome[i];
      p.feature[t] = core.feature[i];
      terrain.push(t);
    }
    if (p.zone[t] !== core.zone[i]) {
      p.zone[t] = core.zone[i];
      zone.push(t);
    }
    if (p.road[t] !== core.road[i] || p.roadLinks[t] !== core.roadLinks[i]) {
      p.road[t] = core.road[i];
      p.roadLinks[t] = core.roadLinks[i];
      road.push(t);
    }
    if (p.district[t] !== core.district[i]) {
      p.district[t] = core.district[i];
      district.push(t);
    }
  }
  for (let i = 0; i < side.links.length; i += 2) {
    const t = side.links[i];
    const bits = side.links[i + 1];
    let mask = 0;
    const d = g.degree(t);
    for (let k = 0; k < d; k++) if (coreSet.has(g.neighbor(t, k))) mask |= 1 << k;
    const next = (p.roadLinks[t] & ~mask) | (bits & mask);
    if (next !== p.roadLinks[t]) {
      p.roadLinks[t] = next;
      road.push(t);
    }
  }
  if (elevationChanged) p.terrainVersion++;

  // 3. districts before buildings (placement reads district styles)
  if (side.districts) {
    p.districts = cloneDistricts(side.districts);
    if (!district.length) for (const t of core.tiles) district.push(t);
  }
  if (side.seaOffset !== null && side.seaOffset !== p.seaOffset) ops.setSeaOffset(side.seaOffset);

  // events for the terrain first so renderers have fresh heights when buildings arrive
  if (terrain.length) bus.emit('tiles:terrain', { tiles: terrain });
  if (zone.length) bus.emit('tiles:zone', { tiles: zone });
  if (road.length) bus.emit('tiles:road', { tiles: road });
  if (district.length) bus.emit('tiles:district', { tiles: district });

  // 4. buildings & props
  for (const b of side.buildings) {
    const inst = ops.placeBuilding(b.defId, b.tile, b.rot, {
      force: true,
      autoLevel: false,
      id: b.id,
      level: b.level,
      variant: b.variant,
      style: b.style,
      state: b.state,
      tint: b.tint,
      name: b.name,
      day: b.builtDay,
    });
    if (inst) {
      if (b.occupants !== undefined) inst.occupants = b.occupants;
      if (b.jobs !== undefined) inst.jobs = b.jobs;
      if (b.progress !== undefined) inst.progress = b.progress;
    }
  }
  for (const pr of side.props) ops.addProp(pr.defId, pr.tile, pr.u, pr.v, pr.yaw, pr.scale, pr.tint, pr.id);

  // 5. orbitals & patches
  for (const [id, o] of side.orbitals) {
    if (p.orbitals.has(id)) ops.removeOrbital(id);
    if (o) ops.addOrbital(o.defId, { orbit: o.orbit, inclination: o.inclination, node: o.node, phase: o.phase, speed: o.speed, tint: o.tint, name: o.name }, o.id);
  }
  for (const [id, patch] of side.patches) if (p.buildings.has(id)) ops.updateBuilding(id, { ...patch });
}

/** Rough memory weight of an entry (for trimming very large histories). */
export function entryWeight(e: HistoryEntry): number {
  return e.before.core.tiles.length + e.after.core.tiles.length + (e.before.buildings.length + e.after.buildings.length) * 4 + (e.before.props.length + e.after.props.length);
}
