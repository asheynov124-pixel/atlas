/**
 * PlanetOps — the ONLY sanctioned way to mutate a Planet (FOUNDATION, CONTRACT).
 * Every method validates, mutates, then emits bus events so renderers, sim and UI stay in sync.
 * Money / unlocks / undo / sounds are handled one level up (game/Commands.ts).
 */
import { bus, type RemoveCause } from '../core/events';
import { BuildingState, Feature, RoadKind, Zone, TileFlag, type StyleId } from '../core/types';
import { getItem, type ItemDef } from '../content/catalog';
import { MAX_LEVEL, MIN_LEVEL, Planet, type BuildingInstance, type District, type OrbitalInstance, type PropInstance } from './planet';

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
  tiles: number[];
  /** tiles that would be cleared if forced (buildings/roads in the way) */
  blocked: number[];
}

export interface PlaceOptions {
  level?: number;
  variant?: number;
  style?: StyleId;
  state?: BuildingState;
  tint?: number;
  name?: string;
  day?: number;
  /** skip validation and clear anything in the way (sandbox / god mode / undo) */
  force?: boolean;
  /** flatten the footprint to the anchor's level (default true for footprint > 1) */
  autoLevel?: boolean;
  /** preserve this id (undo / load) */
  id?: number;
}

const NO_ROAD_NEEDED = new Set(['decor', 'orbital', 'zones', 'roads', 'custom']);

export class PlanetOps {
  constructor(public planet: Planet) {}

  // ─────────────────────────────────────────── queries
  checkPlace(defId: string, tile: number, _rot = 0): PlaceCheck {
    const p = this.planet;
    const def = getItem(defId);
    const fail = (reason: string, tiles: number[] = [], blocked: number[] = []): PlaceCheck => ({ ok: false, reason, tiles, blocked });
    if (!def) return fail('Unknown item');
    if (tile < 0 || tile >= p.count) return fail('Out of bounds');
    if (def.placement === 'orbit') return { ok: true, tiles: [], blocked: [] };
    const tiles = p.grid.footprint(tile, def.footprint);
    const blocked: number[] = [];
    if (def.planetTypes && !def.planetTypes.includes(p.spec.type)) return fail(`Only on ${def.planetTypes.join(' / ')} worlds`, tiles);
    if (def.unique) for (const b of p.buildings.values()) if (b.defId === defId) return fail('Only one per planet', tiles);
    for (const t of tiles) {
      if (p.flags[t] & TileFlag.Locked) return fail('Tile is locked', tiles);
      const water = p.isWater(t);
      if (def.placement === 'water' && !water) return fail('Must be placed on water', tiles);
      if (def.placement === 'surface' && water) return fail('Cannot build on water', tiles);
      if (p.building[t] >= 0 || p.road[t] !== 0) blocked.push(t);
    }
    if (blocked.length) return fail('Something is in the way', tiles, blocked);
    if (def.footprint > 1) {
      let lo = Infinity, hi = -Infinity;
      for (const t of tiles) {
        lo = Math.min(lo, p.elevation[t]);
        hi = Math.max(hi, p.elevation[t]);
      }
      if (hi - lo > 4) return fail('Terrain too steep', tiles);
    }
    if (def.requires?.feature && !def.requires.feature.includes(p.feature[tile])) return fail('Needs a matching resource deposit', tiles);
    if (def.requires?.coastal && !tiles.some((t) => p.isCoastal(t) || p.grid.neighbors(t).some((n) => p.isWater(n)))) return fail('Must be on the coast', tiles);
    if (def.requires?.minElevation !== undefined && p.elevation[tile] < def.requires.minElevation) return fail('Needs higher ground', tiles);
    const needsRoad = def.requires?.road ?? (def.placement === 'surface' && !NO_ROAD_NEEDED.has(def.category));
    if (needsRoad && !tiles.some((t) => p.hasRoadAccess(t))) return fail('Needs road access', tiles);
    return { ok: true, tiles, blocked };
  }

  /** Buildings of a given def on this planet. */
  count(defId: string): number {
    let n = 0;
    for (const b of this.planet.buildings.values()) if (b.defId === defId) n++;
    return n;
  }

  // ─────────────────────────────────────────── buildings
  placeBuilding(defId: string, tile: number, rot = 0, o: PlaceOptions = {}): BuildingInstance | null {
    const p = this.planet;
    const def = getItem(defId);
    if (!def || def.placement === 'orbit' || def.placement === 'free') return null;
    const check = this.checkPlace(defId, tile, rot);
    if (!check.ok && !o.force) return null;
    const tiles = p.grid.footprint(tile, def.footprint);
    if (o.force) {
      for (const t of tiles) {
        const bid = p.building[t];
        if (bid >= 0) this.removeBuilding(bid, 'replace');
      }
      const roadTiles = tiles.filter((t) => p.road[t] !== 0);
      if (roadTiles.length) this.removeRoad(roadTiles);
    }
    // ground prep: level footprint, clear trees / zones (except growables keep their zone)
    const terrainTiles: number[] = [];
    if ((o.autoLevel ?? def.footprint > 1) && def.placement === 'surface') {
      const lvl = p.elevation[tile];
      for (const t of tiles)
        if (p.elevation[t] !== lvl) {
          p.elevation[t] = lvl;
          terrainTiles.push(t);
        }
    }
    for (const t of tiles)
      if (p.feature[t] !== Feature.None && p.feature[t] !== Feature.Ore && p.feature[t] !== Feature.CrystalDeposit && p.feature[t] !== Feature.IceDeposit && p.feature[t] !== Feature.GasVent && p.feature[t] !== Feature.GeoVent) {
        p.feature[t] = Feature.None;
        if (!terrainTiles.includes(t)) terrainTiles.push(t);
      }
    if (terrainTiles.length) {
      p.terrainVersion++;
      bus.emit('tiles:terrain', { tiles: terrainTiles });
    }
    if (!def.growable) {
      const zoned = tiles.filter((t) => p.zone[t] !== Zone.None);
      if (zoned.length) {
        for (const t of zoned) p.zone[t] = Zone.None;
        bus.emit('tiles:zone', { tiles: zoned });
      }
    }
    const id = o.id ?? p.allocId();
    if (o.id !== undefined && o.id >= p.nextId) p.nextId = o.id + 1;
    const inst: BuildingInstance = {
      id,
      defId,
      tile,
      tiles,
      rot: ((rot % 6) + 6) % 6,
      level: o.level ?? 1,
      variant: o.variant ?? Math.floor(Math.random() * Math.max(1, def.variants ?? 1)),
      style: o.style ?? districtStyle(p, tile) ?? p.city.style,
      state: o.state ?? BuildingState.Active,
      tint: o.tint,
      name: o.name,
      builtDay: o.day ?? 0,
    };
    p.buildings.set(id, inst);
    for (const t of tiles) p.building[t] = id;
    bus.emit('building:added', { id });
    return inst;
  }

  removeBuilding(id: number, cause: RemoveCause = 'bulldoze'): BuildingInstance | null {
    const p = this.planet;
    const b = p.buildings.get(id);
    if (!b) return null;
    p.buildings.delete(id);
    for (const t of b.tiles) if (p.building[t] === id) p.building[t] = -1;
    if (cause === 'disaster') {
      for (const t of b.tiles) if (!p.isWater(t)) p.feature[t] = Feature.Rubble;
      bus.emit('tiles:terrain', { tiles: b.tiles });
    }
    bus.emit('building:removed', { id, defId: b.defId, tiles: b.tiles, cause });
    return b;
  }

  updateBuilding(id: number, patch: Partial<Pick<BuildingInstance, 'level' | 'variant' | 'state' | 'tint' | 'name' | 'style' | 'progress' | 'occupants' | 'jobs' | 'rot'>>): void {
    const b = this.planet.buildings.get(id);
    if (!b) return;
    // capture only the compared fields (no object copy: the sim calls this from its daily pass)
    const level = b.level, state = b.state, variant = b.variant, style = b.style, tint = b.tint, rot = b.rot;
    Object.assign(b, patch);
    const what = patch.level !== undefined && patch.level !== level ? 'level'
      : patch.state !== undefined && patch.state !== state ? 'state'
      : patch.variant !== undefined && patch.variant !== variant ? 'variant'
      : patch.style !== undefined && patch.style !== style ? 'style'
      : patch.tint !== tint && 'tint' in patch ? 'tint'
      : patch.rot !== undefined && patch.rot !== rot ? 'variant'
      : patch.name !== undefined ? 'name' : null;
    if (what) bus.emit('building:updated', { id, what });
  }

  buildingAt(tile: number): BuildingInstance | undefined {
    const id = this.planet.building[tile];
    return id >= 0 ? this.planet.buildings.get(id) : undefined;
  }

  // ─────────────────────────────────────────── zones
  /** Paint a zone. Skips water/road/non-growable-building tiles. Growables of another zone are removed. Returns changed tiles. */
  setZone(tiles: number[], zone: Zone): number[] {
    const p = this.planet;
    const changed: number[] = [];
    for (const t of tiles) {
      if (p.isWater(t) || p.road[t] !== 0) continue;
      const bid = p.building[t];
      if (bid >= 0) {
        const b = p.buildings.get(bid)!;
        const def = getItem(b.defId);
        if (!def?.growable) continue;
        if (def.growable.zone !== zone) this.removeBuilding(bid, 'replace');
      }
      if (p.zone[t] !== zone) {
        p.zone[t] = zone;
        changed.push(t);
      }
    }
    if (changed.length) bus.emit('tiles:zone', { tiles: changed });
    return changed;
  }

  // ─────────────────────────────────────────── roads
  /** Which tiles of a road path are blocked (buildings). */
  checkRoad(path: number[]): { ok: boolean; blocked: number[] } {
    const p = this.planet;
    const blocked = path.filter((t) => p.building[t] >= 0);
    return { ok: blocked.length === 0, blocked };
  }

  /**
   * Build / upgrade a road along consecutive tiles (each adjacent to the next). Links consecutive tiles.
   * Tiles with buildings are skipped unless force (then buildings are removed).
   */
  buildRoad(path: number[], kind: RoadKind, force = false): number[] {
    const p = this.planet;
    const g = p.grid;
    const touched = new Set<number>();
    const zoneCleared: number[] = [];
    const terrain: number[] = [];
    let prev = -1;
    for (const t of path) {
      if (p.building[t] >= 0) {
        if (!force) {
          prev = -1;
          continue;
        }
        this.removeBuilding(p.building[t], 'replace');
      }
      if (p.road[t] === RoadKind.None || p.road[t] !== kind) p.road[t] = kind;
      if (p.zone[t] !== Zone.None) {
        p.zone[t] = Zone.None;
        zoneCleared.push(t);
      }
      if (p.feature[t] === Feature.Trees || p.feature[t] === Feature.DenseTrees || p.feature[t] === Feature.Rocks || p.feature[t] === Feature.Flowers || p.feature[t] === Feature.AlienFlora || p.feature[t] === Feature.Rubble) {
        p.feature[t] = Feature.None;
        terrain.push(t);
      }
      touched.add(t);
      if (prev >= 0) {
        const k = g.neighborIndex(prev, t);
        const k2 = g.neighborIndex(t, prev);
        if (k >= 0 && k2 >= 0) {
          p.roadLinks[prev] |= 1 << k;
          p.roadLinks[t] |= 1 << k2;
          touched.add(prev);
        }
      }
      prev = t;
    }
    // remove props standing on new road tiles
    for (const pr of [...p.props.values()]) if (touched.has(pr.tile)) this.removeProp(pr.id);
    if (zoneCleared.length) bus.emit('tiles:zone', { tiles: zoneCleared });
    if (terrain.length) bus.emit('tiles:terrain', { tiles: terrain });
    const list = [...touched];
    if (list.length) bus.emit('tiles:road', { tiles: list });
    return list;
  }

  /** Connect two adjacent road tiles (both must be roads). */
  linkRoads(a: number, b: number, on = true): void {
    const p = this.planet;
    const k = p.grid.neighborIndex(a, b), k2 = p.grid.neighborIndex(b, a);
    if (k < 0 || !p.road[a] || !p.road[b]) return;
    if (on) {
      p.roadLinks[a] |= 1 << k;
      p.roadLinks[b] |= 1 << k2;
    } else {
      p.roadLinks[a] &= ~(1 << k);
      p.roadLinks[b] &= ~(1 << k2);
    }
    bus.emit('tiles:road', { tiles: [a, b] });
  }

  removeRoad(tiles: number[]): number[] {
    const p = this.planet;
    const g = p.grid;
    const touched = new Set<number>();
    for (const t of tiles) {
      if (!p.road[t]) continue;
      const d = g.degree(t);
      for (let k = 0; k < d; k++) {
        if (!(p.roadLinks[t] & (1 << k))) continue;
        const n = g.neighbor(t, k);
        const k2 = g.neighborIndex(n, t);
        if (k2 >= 0) p.roadLinks[n] &= ~(1 << k2);
        touched.add(n);
      }
      p.road[t] = RoadKind.None;
      p.roadLinks[t] = 0;
      touched.add(t);
    }
    const list = [...touched];
    if (list.length) bus.emit('tiles:road', { tiles: list });
    return list;
  }

  // ─────────────────────────────────────────── terrain
  /** Set absolute elevation (number or per-tile array). Returns changed tiles. */
  setElevation(tiles: number[], level: number | number[]): number[] {
    const p = this.planet;
    const changed: number[] = [];
    tiles.forEach((t, i) => {
      const lv = Math.round(Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Array.isArray(level) ? level[i] : level)));
      if (p.elevation[t] !== lv) {
        p.elevation[t] = lv;
        changed.push(t);
      }
    });
    if (changed.length) {
      p.terrainVersion++;
      bus.emit('tiles:terrain', { tiles: changed });
    }
    return changed;
  }

  raise(tiles: number[], delta: number): number[] {
    const p = this.planet;
    return this.setElevation(tiles, tiles.map((t) => p.elevation[t] + delta));
  }

  setBiome(tiles: number[], biome: number): void {
    const p = this.planet;
    const changed = tiles.filter((t) => p.biome[t] !== biome);
    for (const t of changed) p.biome[t] = biome;
    if (changed.length) bus.emit('tiles:terrain', { tiles: changed });
  }

  setFeature(tiles: number[], feature: Feature): void {
    const p = this.planet;
    const changed = tiles.filter((t) => p.feature[t] !== feature && (feature === Feature.None || (p.building[t] < 0 && p.road[t] === 0)));
    for (const t of changed) p.feature[t] = feature;
    if (changed.length) bus.emit('tiles:terrain', { tiles: changed });
  }

  setSeaOffset(v: number): void {
    const p = this.planet;
    p.seaOffset = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, v));
    p.terrainVersion++;
    bus.emit('planet:sea', { seaOffset: p.seaOffset });
  }

  setFlags(tiles: number[], flag: number, on: boolean): void {
    const p = this.planet;
    const changed: number[] = [];
    for (const t of tiles) {
      const before = p.flags[t];
      p.flags[t] = on ? before | flag : before & ~flag;
      if (p.flags[t] !== before) changed.push(t);
    }
    if (changed.length) bus.emit('tiles:flags', { tiles: changed });
  }

  // ─────────────────────────────────────────── districts
  createDistrict(name: string, color: number, style?: StyleId): District {
    const p = this.planet;
    let id = p.districts.findIndex((d, i) => i > 0 && !d);
    if (id < 0) id = p.districts.length;
    if (id > 254) throw new Error('Too many districts');
    const d: District = { id, name, color, style, policies: [] };
    p.districts[id] = d;
    return d;
  }

  deleteDistrict(id: number): void {
    const p = this.planet;
    if (id <= 0 || !p.districts[id]) return;
    const tiles: number[] = [];
    for (let t = 0; t < p.count; t++) if (p.district[t] === id) tiles.push(t);
    this.setDistrict(tiles, 0);
    p.districts[id] = undefined as unknown as District;
  }

  setDistrict(tiles: number[], id: number): void {
    const p = this.planet;
    const changed = tiles.filter((t) => p.district[t] !== id);
    for (const t of changed) p.district[t] = id;
    if (changed.length) bus.emit('tiles:district', { tiles: changed });
  }

  // ─────────────────────────────────────────── props
  addProp(defId: string, tile: number, u = 0, v = 0, yaw = 0, scale = 1, tint?: number, id?: number): PropInstance | null {
    const p = this.planet;
    if (!getItem(defId)) return null;
    const pid = id ?? p.allocId();
    if (id !== undefined && id >= p.nextId) p.nextId = id + 1;
    const pr: PropInstance = { id: pid, defId, tile, u, v, yaw, scale, tint };
    p.props.set(pid, pr);
    bus.emit('prop:added', { id: pid });
    return pr;
  }

  removeProp(id: number): PropInstance | null {
    const pr = this.planet.props.get(id);
    if (!pr) return null;
    this.planet.props.delete(id);
    bus.emit('prop:removed', { id });
    return pr;
  }

  propsOn(tiles: number[]): PropInstance[] {
    const set = new Set(tiles);
    return [...this.planet.props.values()].filter((pr) => set.has(pr.tile));
  }

  // ─────────────────────────────────────────── orbitals
  addOrbital(defId: string, o: Partial<Omit<OrbitalInstance, 'id' | 'defId'>> = {}, id?: number): OrbitalInstance | null {
    const p = this.planet;
    const def = getItem(defId);
    if (!def) return null;
    const oid = id ?? p.allocId();
    if (id !== undefined && id >= p.nextId) p.nextId = id + 1;
    const inst: OrbitalInstance = {
      id: oid,
      defId,
      orbit: o.orbit ?? def.orbit?.radius ?? 1.6,
      inclination: o.inclination ?? (Math.random() - 0.5) * 1.2,
      node: o.node ?? Math.random() * Math.PI * 2,
      phase: o.phase ?? Math.random() * Math.PI * 2,
      speed: o.speed ?? def.orbit?.speed ?? 0.08,
      tint: o.tint,
      name: o.name,
    };
    p.orbitals.set(oid, inst);
    bus.emit('orbital:added', { id: oid });
    return inst;
  }

  removeOrbital(id: number): OrbitalInstance | null {
    const o = this.planet.orbitals.get(id);
    if (!o) return null;
    this.planet.orbitals.delete(id);
    bus.emit('orbital:removed', { id });
    return o;
  }

  // ─────────────────────────────────────────── destruction
  /** Clear everything on tiles (bulldoze tool). */
  bulldoze(tiles: number[]): { buildings: number; roads: number; props: number } {
    const p = this.planet;
    let buildings = 0, props = 0;
    const ids = new Set<number>();
    for (const t of tiles) if (p.building[t] >= 0) ids.add(p.building[t]);
    for (const id of ids) if (this.removeBuilding(id, 'bulldoze')) buildings++;
    const roads = tiles.filter((t) => p.road[t] !== 0);
    if (roads.length) this.removeRoad(roads);
    for (const pr of this.propsOn(tiles)) if (this.removeProp(pr.id)) props++;
    const rubble = tiles.filter((t) => p.feature[t] === Feature.Rubble);
    if (rubble.length) this.setFeature(rubble, Feature.None);
    return { buildings, roads: roads.length, props };
  }

  /** Disaster damage: destroys buildings (leaving rubble), optionally roads/props/trees, flags tiles. */
  destroyTiles(tiles: number[], o: { roads?: boolean; props?: boolean; trees?: boolean; rubble?: boolean; flag?: number } = {}): number {
    const p = this.planet;
    const ids = new Set<number>();
    for (const t of tiles) if (p.building[t] >= 0) ids.add(p.building[t]);
    let n = 0;
    for (const id of ids) if (this.removeBuilding(id, o.rubble === false ? 'bulldoze' : 'disaster')) n++;
    if (o.roads) {
      const r = tiles.filter((t) => p.road[t] !== 0);
      if (r.length) this.removeRoad(r);
    }
    if (o.props ?? true) for (const pr of this.propsOn(tiles)) this.removeProp(pr.id);
    if (o.trees) {
      const tr = tiles.filter((t) => p.feature[t] === Feature.Trees || p.feature[t] === Feature.DenseTrees || p.feature[t] === Feature.AlienFlora || p.feature[t] === Feature.Flowers);
      if (tr.length) this.setFeature(tr, o.rubble === false ? Feature.None : Feature.Rubble);
    }
    if (o.flag) this.setFlags(tiles, o.flag, true);
    return n;
  }
}

function districtStyle(p: Planet, tile: number): StyleId | undefined {
  const d = p.district[tile];
  return d > 0 ? p.districts[d]?.style : undefined;
}

export function isGrowable(def: ItemDef | undefined): boolean {
  return !!def?.growable;
}
