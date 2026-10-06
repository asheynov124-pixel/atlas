/**
 * Shared enums and types. This file is a CONTRACT used by every module — keep it stable.
 * Numeric enums are stored in per-tile typed arrays and in save files: never renumber, only append.
 */

// ───────────────────────────────────────────────────────────── Zones
export enum Zone {
  None = 0,
  ResLow = 1,
  ResMed = 2,
  ResHigh = 3,
  ComLow = 4,
  ComHigh = 5,
  ComLeisure = 6,
  IndGeneral = 7,
  IndFarm = 8,
  IndMining = 9,
  IndTech = 10,
  Office = 11,
}
export const ZONE_COUNT = 12;
export type ZoneFamily = 'R' | 'C' | 'I' | 'O';
export function zoneFamily(z: Zone): ZoneFamily | null {
  if (z >= 1 && z <= 3) return 'R';
  if (z >= 4 && z <= 6) return 'C';
  if (z >= 7 && z <= 10) return 'I';
  if (z === 11) return 'O';
  return null;
}

// ───────────────────────────────────────────────────────────── Roads (per-tile `road` array)
export enum RoadKind {
  None = 0,
  Path = 1, // pedestrian / dirt path
  Street = 2, // 2-lane street
  Avenue = 3, // 4-lane boulevard with median
  Highway = 4, // elevated-feel multi-lane highway
  Maglev = 5, // rail
  Hyperloop = 6, // tube
}
export const ROAD_KIND_COUNT = 7;

// ───────────────────────────────────────────────────────────── Biomes (per-tile `biome` array)
export enum Biome {
  DeepOcean = 0,
  Ocean = 1,
  Beach = 2,
  Grass = 3,
  Forest = 4,
  Jungle = 5,
  Savanna = 6,
  Desert = 7,
  Tundra = 8,
  Snow = 9,
  Ice = 10,
  Rock = 11,
  Mountain = 12,
  Volcanic = 13,
  Lava = 14,
  Regolith = 15,
  Crater = 16,
  Crystal = 17,
  Toxic = 18,
  Fungal = 19,
  Salt = 20,
  Swamp = 21,
  Ash = 22,
  Metal = 23,
  Coral = 24,
  Meadow = 25,
}
export const BIOME_COUNT = 26;

// ───────────────────────────────────────────────────────────── Natural terrain features (per-tile `feature`)
export enum Feature {
  None = 0,
  Trees = 1, // light woodland (species depend on biome/planet)
  DenseTrees = 2,
  Rocks = 3,
  Ore = 4, // metal ore deposit (mining)
  CrystalDeposit = 5,
  IceDeposit = 6,
  GasVent = 7, // exotic gas / oil
  Ruins = 8, // ancient alien ruins (tourism)
  GeoVent = 9, // geothermal vent
  Flowers = 10,
  AlienFlora = 11,
  Kelp = 12, // underwater
  Rubble = 13, // left by disasters/demolition
  Crater = 14, // impact crater scar (visual)
}
export const FEATURE_COUNT = 15;

// ───────────────────────────────────────────────────────────── Per-tile status flags (`flags` bitfield)
export const TileFlag = {
  Burning: 1 << 0,
  Flooded: 1 << 1,
  Scorched: 1 << 2,
  Frozen: 1 << 3,
  Goo: 1 << 4, // grey goo / nanite infestation
  Irradiated: 1 << 5,
  Blessed: 1 << 6, // god power boon
  Locked: 1 << 7, // cannot be built on (reserved / sandbox lock)
} as const;

// ───────────────────────────────────────────────────────────── Planets & cosmos
export type PlanetTypeId =
  | 'terran'
  | 'desert'
  | 'arctic'
  | 'volcanic'
  | 'ocean'
  | 'jungle'
  | 'barren'
  | 'toxic'
  | 'crystal'
  | 'fungal'
  | 'tundra'
  | 'machine';

export interface RingSpec {
  inner: number; // multiples of planet radius
  outer: number;
  color: number; // 0xRRGGBB
  opacity: number; // 0..1
  tilt: number; // radians
}

export interface MoonSpec {
  name: string;
  radius: number; // multiples of planet radius (0.08..0.35)
  distance: number; // multiples of planet radius (2.5..9)
  color: number;
  type: PlanetTypeId;
  speed: number; // radians per real second at 1x
  inclination: number; // radians
  phase: number; // radians
}

export interface PlanetSpec {
  id: string; // universe id, e.g. "g0.s0.p2" or "sandbox.<n>"
  name: string;
  type: PlanetTypeId;
  seed: number;
  frequency: number; // Goldberg subdivision frequency → 10f²+2 tiles (16..64)
  oceanLevel: number; // -1..1 bias; 0 = archetype default ocean coverage
  mountains: number; // 0..1 ruggedness
  temperature: number; // °C mean (flavour + sim)
  gravity: number; // in g (flavour + sim)
  axialTilt: number; // radians
  dayLength: number; // real seconds per full day at 1x speed
  atmosphere: { color: number; density: number; breathable: boolean };
  hasOcean: boolean;
  oceanColor: number;
  cloudCover: number; // 0..1
  rings: RingSpec | null;
  moons: MoonSpec[];
  /** Optional colour overrides (sandbox planet forge). */
  palette?: Partial<Record<'land' | 'highland' | 'lowland' | 'shore' | 'snow', number>>;
  /** Free-form tags e.g. 'home', 'shattered', 'tidally-locked'. */
  tags?: string[];
}

export type StarKind = 'yellow' | 'orange' | 'red' | 'white' | 'blue' | 'neutron' | 'binary' | 'blackhole';

// ───────────────────────────────────────────────────────────── Buildings
export enum BuildingState {
  Active = 0,
  Constructing = 1,
  Abandoned = 2,
  Burning = 3,
  Ruined = 4, // rubble left after disaster; can be cleared
  Upgrading = 5,
}

export type StyleId = 'classic' | 'neo' | 'solarpunk' | 'cyber' | 'mars' | 'ice' | 'crystal' | 'organic';

export type Category =
  | 'roads'
  | 'zones'
  | 'power'
  | 'water' // water, air (oxygen), waste
  | 'services' // safety, fire, health
  | 'education' // schools, research
  | 'leisure' // parks, plazas, entertainment
  | 'transit' // stations, spaceports
  | 'industry' // resource extractors, special industry
  | 'landmarks' // landmarks & wonders
  | 'orbital' // satellites, stations, megastructures
  | 'decor' // trees, props, decorations
  | 'custom'; // Architect Studio creations

export type ServiceType =
  | 'police'
  | 'fire'
  | 'health'
  | 'education'
  | 'research'
  | 'leisure'
  | 'transit'
  | 'deathcare'
  | 'garbage'
  | 'data'
  | 'tourism'
  | 'spiritual';

export type Placement = 'surface' | 'water' | 'orbit' | 'free';

// ───────────────────────────────────────────────────────────── Metrics (used by goals, stats, graphs)
export type MetricId =
  | 'population'
  | 'happiness' // 0..100
  | 'money'
  | 'monthlyIncome' // net per month
  | 'research' // accumulated research points
  | 'jobs'
  | 'unemployment' // %
  | 'buildings'
  | 'roadTiles'
  | 'zonedTiles'
  | 'parks'
  | 'landValue' // average 0..100
  | 'pollution' // average 0..100
  | 'crime' // average 0..100
  | 'education' // 0..100
  | 'health' // 0..100
  | 'tourism' // visitors per month
  | 'powerSupply'
  | 'waterSupply'
  | 'oxygenSupply'
  | 'districts'
  | 'wonders'
  | 'landmarks'
  | 'planetsColonized'
  | 'systemsVisited'
  | 'galaxiesVisited'
  | 'totalPopulation' // across all planets
  | 'disastersSurvived'
  | 'customBuildings'
  | 'daysPlayed';

// ───────────────────────────────────────────────────────────── Sound names (AudioEngine contract)
export type SfxName =
  | 'click'
  | 'tap'
  | 'open'
  | 'close'
  | 'toggle'
  | 'place'
  | 'placeBig'
  | 'road'
  | 'zone'
  | 'bulldoze'
  | 'demolish'
  | 'terraform'
  | 'paint'
  | 'error'
  | 'money'
  | 'milestone'
  | 'unlock'
  | 'levelUp'
  | 'notify'
  | 'warp'
  | 'whoosh'
  | 'explosion'
  | 'bigExplosion'
  | 'rumble'
  | 'quake'
  | 'thunder'
  | 'wind'
  | 'fire'
  | 'water'
  | 'splash'
  | 'laser'
  | 'alien'
  | 'monster'
  | 'roar'
  | 'blackhole'
  | 'supernova'
  | 'freeze'
  | 'magic'
  | 'chime'
  | 'crumble'
  | 'alarm'
  | 'launch'
  | 'engine'
  | 'camera'
  | 'rewind';

export type LoopName = 'wind' | 'fire' | 'rain' | 'rumble' | 'alarm' | 'hum' | 'blackhole' | 'storm' | 'engine';

export type MusicMood = 'menu' | 'day' | 'night' | 'space' | 'galaxy' | 'tension' | 'apocalypse' | 'studio';

export type ViewKind = 'planet' | 'system' | 'galaxy' | 'universe' | 'studio';

export type GameMode = 'career' | 'sandbox';

export interface Notification {
  id: number;
  title: string;
  body?: string;
  icon?: string; // emoji or icon name
  kind?: 'info' | 'good' | 'warn' | 'bad' | 'milestone';
  tile?: number; // optional tile to fly to
  time: number; // ms timestamp
}

export interface NewsItem {
  id: number;
  author: string; // display name
  handle: string; // @handle
  text: string;
  icon?: string; // avatar emoji
  tile?: number;
  day: number; // game day
  likes?: number;
}

export interface InspectRow {
  label: string;
  value: string;
  /** optional 0..1 bar */
  bar?: number;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}

export type Selection =
  | { kind: 'building'; id: number }
  | { kind: 'tile'; tile: number }
  | { kind: 'prop'; id: number }
  | { kind: 'orbital'; id: number }
  | null;
