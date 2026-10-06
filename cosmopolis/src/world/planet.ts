/**
 * Planet state — the mutable, serialisable model of one world. CONTRACT.
 *
 * Mutations should go through `PlanetOps` (world/ops.ts) so that events fire and renderers/sim stay in sync.
 * Per-tile data lives in typed arrays indexed by tile id (see HexGrid).
 */
import { getGrid, type HexGrid } from './hexsphere';
import type { BuildingState, PlanetSpec, StyleId } from '../core/types';
import { b64ToBytes, bytesToB64 } from '../core/b64';

/** World units between adjacent tile centres. Planet radius = TILE_SIZE / grid.unitEdge. */
export const TILE_SIZE = 2.0;
/** World units per elevation level (terraces). */
export const LEVEL_HEIGHT = 0.32;
/** Small lift so level-0 land sits just above the water line. */
export const LAND_LIFT = 0.1;
export const MIN_LEVEL = -10;
export const MAX_LEVEL = 24;
/** Height of one building storey in world units (≈ 4 m when 1 unit ≈ 20 m). */
export const FLOOR_HEIGHT = 0.2;

export interface BuildingInstance {
  id: number;
  defId: string;
  /** anchor (centre) tile */
  tile: number;
  /** all occupied tiles (footprint) */
  tiles: number[];
  /** facing: 0..5 = toward neighbour k of anchor tile (mod degree) */
  rot: number;
  /** growth / upgrade level 1..5 */
  level: number;
  /** visual variant seed */
  variant: number;
  style: StyleId;
  state: BuildingState;
  /** optional paint tint 0xRRGGBB (applies to paintable surfaces) */
  tint?: number;
  name?: string;
  /** game day when placed */
  builtDay: number;
  /** sim-owned counters (residents, workers, visitors...) */
  occupants?: number;
  jobs?: number;
  /** progress 0..1 while Constructing/Upgrading (render reads) */
  progress?: number;
}

export interface PropInstance {
  id: number;
  defId: string;
  tile: number;
  /** offset inside the tile on its tangent plane, world units */
  u: number;
  v: number;
  /** yaw radians around the tile normal */
  yaw: number;
  scale: number;
  tint?: number;
}

export interface OrbitalInstance {
  id: number;
  defId: string;
  /** orbit radius as multiple of planet radius */
  orbit: number;
  inclination: number;
  /** longitude of ascending node */
  node: number;
  phase: number;
  /** radians per real second at 1x */
  speed: number;
  tint?: number;
  name?: string;
}

export interface District {
  id: number;
  name: string;
  color: number;
  style?: StyleId;
  policies: string[];
}

export interface CityInfo {
  name: string;
  foundedDay: number;
  style: StyleId;
  mayor: string;
}

export class Planet {
  readonly spec: PlanetSpec;
  readonly grid: HexGrid;
  readonly radius: number;
  readonly count: number;

  /** terrace level; tile is underwater when elevation < seaOffset (and spec.hasOcean) */
  elevation: Int8Array;
  biome: Uint8Array;
  feature: Uint8Array;
  zone: Uint8Array;
  road: Uint8Array;
  /** bitmask of neighbour indices k this road tile connects to */
  roadLinks: Uint8Array;
  /** building id occupying the tile, or -1 */
  building: Int32Array;
  district: Uint8Array;
  flags: Uint8Array;

  /** global water level offset in levels (god powers flood / drain) */
  seaOffset = 0;
  /** bumped by PlanetOps whenever elevation / sea level changes (cache invalidation) */
  terrainVersion = 0;

  buildings = new Map<number, BuildingInstance>();
  props = new Map<number, PropInstance>();
  orbitals = new Map<number, OrbitalInstance>();
  /** index = district id; [0] is a placeholder "no district" */
  districts: District[] = [{ id: 0, name: '', color: 0, policies: [] }];
  nextId = 1;
  city: CityInfo;
  /** Sim-owned JSON-serialisable state (history, accumulators...). */
  simData: Record<string, unknown> = {};
  /** Free-form JSON-serialisable state for other modules (god powers, cosmos...). Namespaced by module. */
  ext: Record<string, unknown> = {};

  constructor(spec: PlanetSpec) {
    this.spec = spec;
    this.grid = getGrid(spec.frequency);
    this.count = this.grid.count;
    this.radius = TILE_SIZE / this.grid.unitEdge;
    const n = this.count;
    this.elevation = new Int8Array(n);
    this.biome = new Uint8Array(n);
    this.feature = new Uint8Array(n);
    this.zone = new Uint8Array(n);
    this.road = new Uint8Array(n);
    this.roadLinks = new Uint8Array(n);
    this.building = new Int32Array(n).fill(-1);
    this.district = new Uint8Array(n);
    this.flags = new Uint8Array(n);
    this.city = { name: spec.name + ' City', foundedDay: 0, style: 'classic', mayor: 'Mayor' };
  }

  /** Height of a tile's top surface above `radius` (world units). */
  heightOf(i: number): number {
    return this.elevation[i] * LEVEL_HEIGHT + LAND_LIFT;
  }
  /** Height for an arbitrary level. */
  static levelHeight(level: number): number {
    return level * LEVEL_HEIGHT + LAND_LIFT;
  }
  /** Water surface height above `radius`. */
  get waterHeight(): number {
    return this.seaOffset * LEVEL_HEIGHT + LAND_LIFT * 0.45;
  }
  isWater(i: number): boolean {
    return this.spec.hasOcean && this.elevation[i] < this.seaOffset;
  }
  isLand(i: number): boolean {
    return !this.isWater(i);
  }
  /** Is tile free for construction (land, no road, no building)? */
  isFree(i: number): boolean {
    return this.building[i] < 0 && this.road[i] === 0 && !this.isWater(i);
  }
  /** Any neighbour has a road? */
  hasRoadAccess(i: number): boolean {
    const g = this.grid;
    for (let q = g.start[i]; q < g.start[i + 1]; q++) if (this.road[g.nbr[q]] !== 0) return true;
    return false;
  }
  /** A tile on the coast (land with a water neighbour). */
  isCoastal(i: number): boolean {
    if (this.isWater(i)) return false;
    const g = this.grid;
    for (let q = g.start[i]; q < g.start[i + 1]; q++) if (this.isWater(g.nbr[q])) return true;
    return false;
  }
  allocId(): number {
    return this.nextId++;
  }

  // ─────────────────────────────────────────────── serialisation
  serialize(): PlanetSave {
    return {
      v: 1,
      spec: this.spec,
      seaOffset: this.seaOffset,
      elevation: bytesToB64(new Uint8Array(this.elevation.buffer.slice(0))),
      biome: bytesToB64(this.biome),
      feature: bytesToB64(this.feature),
      zone: bytesToB64(this.zone),
      road: bytesToB64(this.road),
      roadLinks: bytesToB64(this.roadLinks),
      district: bytesToB64(this.district),
      flags: bytesToB64(this.flags),
      buildings: [...this.buildings.values()].map((b) => ({ ...b, tiles: undefined as unknown as number[] })),
      props: [...this.props.values()],
      orbitals: [...this.orbitals.values()],
      districts: this.districts,
      nextId: this.nextId,
      city: this.city,
      simData: this.simData,
      ext: this.ext,
    };
  }

  static deserialize(s: PlanetSave, footprintOf: (defId: string) => 1 | 7 | 19): Planet {
    const p = new Planet(s.spec);
    p.seaOffset = s.seaOffset ?? 0;
    p.elevation.set(new Int8Array(b64ToBytes(s.elevation).buffer));
    p.biome.set(b64ToBytes(s.biome));
    p.feature.set(b64ToBytes(s.feature));
    p.zone.set(b64ToBytes(s.zone));
    p.road.set(b64ToBytes(s.road));
    p.roadLinks.set(b64ToBytes(s.roadLinks));
    p.district.set(b64ToBytes(s.district));
    p.flags.set(b64ToBytes(s.flags));
    for (const b of s.buildings) {
      const tiles = p.grid.footprint(b.tile, footprintOf(b.defId));
      const inst: BuildingInstance = { ...b, tiles };
      p.buildings.set(b.id, inst);
      for (const t of tiles) p.building[t] = b.id;
    }
    for (const pr of s.props) p.props.set(pr.id, pr);
    for (const o of s.orbitals ?? []) p.orbitals.set(o.id, o);
    p.districts = s.districts?.length ? s.districts : p.districts;
    p.nextId = s.nextId;
    p.city = s.city;
    p.simData = s.simData ?? {};
    p.ext = s.ext ?? {};
    return p;
  }
}

export interface PlanetSave {
  v: number;
  spec: PlanetSpec;
  seaOffset: number;
  elevation: string;
  biome: string;
  feature: string;
  zone: string;
  road: string;
  roadLinks: string;
  district: string;
  flags: string;
  buildings: BuildingInstance[];
  props: PropInstance[];
  orbitals: OrbitalInstance[];
  districts: District[];
  nextId: number;
  city: CityInfo;
  simData: Record<string, unknown>;
  ext: Record<string, unknown>;
}
