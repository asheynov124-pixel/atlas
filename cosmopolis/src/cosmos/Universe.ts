/**
 * OWNER: cosmos agent.
 * Universe — deterministic catalogue of galaxies → star systems → planets (+ moons), generated from the empire's
 * universe seed. Six hand-authored galaxies (names, shapes, palettes, themes, unlock rules) with hand-authored
 * star systems; the home system "Sol Prime" is fully authored (homeworld g0.s0.p2, its moon Selene, Ares, Boreas,
 * the gas giant Titanus with Ignis & Thalassa, …). Every other world gets a PlanetSpec rolled from its archetype
 * (content/planetTypes: frequency, rings & moons chances, colours, gravity, temperature).
 *
 * Ids: galaxy "g3", system "g3.s1", planet "g3.s1.p4", moon "g3.s1.p4.m0". Sandbox forged worlds: "sandbox.<n>".
 * Requirement ids (career, evaluated by Progression.checkReq):
 *   tier:N · tag:spaceport|warpgate|intergalactic · colonies:N · pop:N · galaxies:N (colonised galaxies) ·
 *   visited:N (galaxies landed in) · gcol:<galaxyId>:N (colonies in that galaxy) · goal:<goalId>
 *
 * Pure data + math (no three.js) — safe for tests and for the UI.
 */
import type { MoonSpec, PlanetSpec, PlanetTypeId, RingSpec, StarKind } from '../core/types';
import { Rng, clamp, hashString } from '../core/rng';
import { PLANET_TYPES, PLANET_TYPE_IDS } from '../content/planetTypes';
import { moonName, planetName, worldName } from './names';

export interface PlanetEntry {
  id: string;
  name: string;
  spec: PlanetSpec;
  /** orbit radius in system-view units (moons: distance from the parent's centre) */
  orbit: number;
  /** is this a moon of another planet entry */
  parent?: string;
  // ── appended (cosmos) ──
  kind: 'planet' | 'moon' | 'giant';
  /** can be settled (gas & ice giants cannot) */
  colonisable: boolean;
  /** career requirements on top of the system's */
  reqs: string[];
  /** visual radius in system-view units */
  size: number;
  /** orbital phase at t = 0, angular speed (rad / real second) and orbital-plane tilt */
  phase: number;
  speed: number;
  inclination: number;
  /** gas / ice giant look */
  giant?: { colors: [number, number, number]; storm: boolean; ice: boolean };
  description?: string;
  galaxyId: string;
  systemId: string;
}

export interface StarSystem {
  id: string;
  name: string;
  star: StarKind;
  /** position in galaxy-view units */
  pos: [number, number, number];
  planets: PlanetEntry[];
  /** career unlock requirement id (e.g. 'tier:6') — the first of `reqs` */
  requires?: string;
  description?: string;
  // ── appended (cosmos) ──
  reqs: string[];
  galaxyId: string;
  /** spectral class label ("G2 V yellow dwarf") */
  spectral: string;
  /** binary companion kind */
  companion?: StarKind;
  /** home system of the empire */
  home?: boolean;
}

export interface Galaxy {
  id: string;
  name: string;
  kind: 'spiral' | 'barred' | 'elliptical' | 'ring' | 'irregular';
  colors: [number, number];
  pos: [number, number, number];
  systems: StarSystem[];
  requires?: string;
  description?: string;
  /** planet types that tend to appear here */
  planetTypes?: PlanetTypeId[];
  // ── appended (cosmos) ──
  reqs: string[];
  tagline: string;
  arms: number;
  /** logarithmic spiral twist */
  twist: number;
  /** galaxy-view radius */
  radius: number;
  /** disc tilt in the universe view (radians) */
  tilt: number;
  /** accent colour for UI */
  accent: number;
  /** total star count drawn in the galaxy view */
  stars: number;
}

// ───────────────────────────────────────────────────────────── stars

export interface StarInfo {
  name: string;
  spectral: string;
  color: number;
  /** corona / glow colour */
  glow: number;
  /** system-view radius */
  radius: number;
  /** relative luminosity (habitable distance, planet temperature) */
  lum: number;
  blurb: string;
}

export const STAR_INFO: Record<StarKind, StarInfo> = {
  yellow: { name: 'Yellow dwarf', spectral: 'G2 V', color: 0xfff0c2, glow: 0xffc86a, radius: 3.2, lum: 1, blurb: 'A calm, middle-aged sun. Reliable. Boring. Perfect.' },
  orange: { name: 'Orange dwarf', spectral: 'K4 V', color: 0xffc98a, glow: 0xff9a45, radius: 2.8, lum: 0.6, blurb: 'Warm, long-lived and in no hurry to explode.' },
  red: { name: 'Red dwarf', spectral: 'M3 V', color: 0xff8a62, glow: 0xff5532, radius: 2.2, lum: 0.25, blurb: 'Small, dim and prone to tantrums (flares). Will outlive everything.' },
  white: { name: 'White main-sequence star', spectral: 'A1 V', color: 0xf4f6ff, glow: 0xcfdcff, radius: 3.5, lum: 1.8, blurb: 'Blinding, brilliant and a little too keen.' },
  blue: { name: 'Blue giant', spectral: 'B0 III', color: 0xbcd4ff, glow: 0x6f9dff, radius: 4.8, lum: 4, blurb: 'Lives fast, dies young, leaves a gorgeous nebula.' },
  neutron: { name: 'Pulsar', spectral: 'PSR', color: 0xe2f0ff, glow: 0x8ec8ff, radius: 1.0, lum: 0.4, blurb: 'A city-sized star spinning 700 times a second. Lighthouse of the galaxy.' },
  binary: { name: 'Binary pair', spectral: 'G8 V + K1 V', color: 0xffe2a8, glow: 0xffb060, radius: 2.5, lum: 1.3, blurb: 'Two suns, two shadows, twice the sunsets.' },
  blackhole: { name: 'Black hole', spectral: 'BH · 14 M☉', color: 0x000000, glow: 0xffa05a, radius: 2.4, lum: 0.8, blurb: 'Light goes in. Nothing comes out. Real-estate prices are… complicated.' },
};

// ───────────────────────────────────────────────────────────── home world

export function homeSpec(seed: number, name = 'Terra Nova'): PlanetSpec {
  return {
    id: 'g0.s0.p2',
    name,
    type: 'terran',
    seed,
    frequency: 40,
    oceanLevel: 0,
    mountains: 0.5,
    temperature: 16,
    gravity: 1,
    axialTilt: 0.35,
    dayLength: 240,
    atmosphere: { color: 0x6fb6ff, density: 1, breathable: true },
    hasOcean: true,
    oceanColor: 0x1d6fb8,
    cloudCover: 0.45,
    rings: null,
    moons: [{ name: 'Selene', radius: 0.27, distance: 5.5, color: 0xb8b8c0, type: 'barren', speed: 0.02, inclination: 0.12, phase: 1 }],
    tags: ['home'],
  };
}

export const HOME_PLANET_ID = 'g0.s0.p2';
export const HOME_SYSTEM_ID = 'g0.s0';
export const HOME_GALAXY_ID = 'g0';

// ───────────────────────────────────────────────────────────── authored galaxies

interface SystemDef {
  name: string;
  star: StarKind;
  companion?: StarKind;
  description: string;
  reqs: string[];
  /** fixed planet count (else 3..7) */
  planets?: number;
  /** preferred planet types (else the galaxy's) */
  types?: PlanetTypeId[];
}

interface GalaxyDef {
  name: string;
  kind: Galaxy['kind'];
  colors: [number, number];
  accent: number;
  arms: number;
  twist: number;
  tilt: number;
  pos: [number, number, number];
  planetTypes: PlanetTypeId[];
  tagline: string;
  description: string;
  reqs: string[];
  stars: number;
  systems: SystemDef[];
}

const ALL_TYPES = PLANET_TYPE_IDS;

const GALAXIES: GalaxyDef[] = [
  {
    name: 'Lumen Spiral',
    kind: 'spiral',
    colors: [0xffd9a0, 0x8fb4ff],
    accent: 0x7fb4ff,
    arms: 4,
    twist: 2.5,
    tilt: 0.5,
    pos: [0, 0, 0],
    planetTypes: ALL_TYPES,
    tagline: 'Home. Four lazy arms of warm suns.',
    description: 'A grand, four-armed spiral of 200 billion stars. Somewhere in its third arm, a small yellow sun warms a world you happen to own.',
    reqs: [],
    stars: 64000,
    systems: [
      { name: 'Sol Prime', star: 'yellow', description: 'Your cradle. Seven worlds, a gas giant with delusions of grandeur and a moon that has been waiting patiently.', reqs: [] },
      { name: 'Tau Ember', star: 'orange', description: 'A cosy orange sun four light-years out — the first stop for anyone with a warp gate and ambition.', reqs: ['tier:6', 'tag:warpgate'], types: ['desert', 'terran', 'tundra', 'volcanic'] },
      { name: 'Vega Halcyon', star: 'white', description: 'A brilliant white star ringed by crystal worlds. Sunglasses are mandatory.', reqs: ['tier:6', 'tag:warpgate'], types: ['crystal', 'arctic', 'barren', 'ocean'] },
      { name: 'Proxima Rook', star: 'red', description: 'A grumpy red dwarf with tidally-locked worlds: eternal day on one side, eternal night on the other.', reqs: ['tier:7', 'tag:warpgate'], types: ['barren', 'tundra', 'toxic', 'arctic'] },
      { name: 'Castor & Pollux', star: 'binary', companion: 'orange', description: 'Twin suns locked in an eternal waltz. Double sunsets, double the tourism brochures.', reqs: ['tier:7', 'tag:warpgate'], types: ['jungle', 'desert', 'ocean', 'terran'] },
      { name: 'Lighthouse PSR-7', star: 'neutron', description: 'A pulsar sweeping the void every 1.4 milliseconds. Navigators love it. Insomniacs do not.', reqs: ['tier:7', 'tag:warpgate', 'colonies:6'], planets: 3, types: ['machine', 'barren', 'crystal'] },
      { name: 'Rigel Crown', star: 'blue', description: 'A blue giant burning a million years of fuel per afternoon. Its worlds are young, wild and very bright.', reqs: ['tier:8', 'tag:warpgate'], types: ['volcanic', 'crystal', 'jungle', 'toxic'] },
      { name: 'The Maw', star: 'blackhole', description: 'A stellar black hole with a glowing accretion disc. The view from the inner worlds is literally time-bending.', reqs: ['tier:8', 'tag:warpgate', 'colonies:8'], planets: 4, types: ['machine', 'barren', 'crystal', 'volcanic'] },
    ],
  },
  {
    name: 'Andromeda Veil',
    kind: 'barred',
    colors: [0xd7c6ff, 0x9fe6ff],
    accent: 0xb59cff,
    arms: 2,
    twist: 2.8,
    tilt: 0.9,
    pos: [-330, 70, -140],
    planetTypes: ['crystal', 'arctic', 'tundra', 'crystal', 'arctic', 'barren'],
    tagline: 'A barred spiral of crystal and ice.',
    description: 'A shimmering barred spiral veiled in violet nebulae. Its worlds are frozen, faceted and sing faintly when the wind blows.',
    reqs: ['tier:8', 'tag:intergalactic'],
    stars: 56000,
    systems: [
      { name: 'Aurelia Prism', star: 'white', description: 'A prism-cut system where every sunrise splits into seven.', reqs: [] },
      { name: 'Frostgate', star: 'blue', description: 'Cold worlds orbiting a hot star. The universe enjoys irony.', reqs: ['gcol:g1:1'] },
      { name: 'Seraphine', star: 'yellow', description: 'Gentle light, crystal forests and a famously quiet nightlife.', reqs: ['gcol:g1:1'] },
      { name: 'Glimmerfall', star: 'binary', companion: 'white', description: 'Twin white suns refracting through ice rings into permanent rainbows.', reqs: ['gcol:g1:2'] },
      { name: 'Opaline Deep', star: 'red', description: 'A dim red ember lighting opal-veined glaciers.', reqs: ['gcol:g1:2'] },
      { name: 'Wintermere', star: 'orange', description: 'An orange sun over endless tundra. Bring a scarf. Bring ten.', reqs: ['gcol:g1:3'] },
    ],
  },
  {
    name: 'Sombrero Crown',
    kind: 'elliptical',
    colors: [0xffc27a, 0xff7b4a],
    accent: 0xffa85c,
    arms: 0,
    twist: 0,
    tilt: 1.32,
    pos: [300, -60, -200],
    planetTypes: ['desert', 'volcanic', 'desert', 'volcanic', 'barren', 'toxic'],
    tagline: 'A blazing halo crowned by a ring of dust.',
    description: 'An enormous golden halo of ancient suns wearing a dark ring of dust like a hat brim. Deserts, volcanoes and spectacular sunsets.',
    reqs: ['tier:8', 'tag:intergalactic', 'galaxies:2'],
    stars: 60000,
    systems: [
      { name: 'Pharos Ember', star: 'orange', description: 'A lighthouse sun over canyon worlds of copper and glass.', reqs: [] },
      { name: 'Duneholt', star: 'yellow', description: 'Sand as far as the telescope can see. And then more sand.', reqs: ['gcol:g2:1'] },
      { name: 'Kiln Major', star: 'blue', description: 'A blue furnace baking its planets into ceramics.', reqs: ['gcol:g2:1'] },
      { name: 'Brimstone Binary', star: 'binary', companion: 'red', description: 'A red and gold pair circling a field of volcanic worlds.', reqs: ['gcol:g2:2'] },
      { name: 'Solace Dunes', star: 'white', description: 'Pale dunes that hum at dusk. Nobody knows why. Everyone has a theory.', reqs: ['gcol:g2:2'] },
    ],
  },
  {
    name: 'Whirlpool Abyss',
    kind: 'spiral',
    colors: [0x9ff0ff, 0x6c8dff],
    accent: 0x5ee0ff,
    arms: 2,
    twist: 3.3,
    tilt: 0.25,
    pos: [140, 110, 330],
    planetTypes: ['ocean', 'jungle', 'ocean', 'jungle', 'terran', 'fungal'],
    tagline: 'A grand-design spiral of oceans and rainforests.',
    description: 'Two perfect arms swirling around a hungry core. Its worlds are drowned in oceans and smothered in jungle — paradise for the brave.',
    reqs: ['tier:8', 'tag:intergalactic', 'pop:400000'],
    stars: 62000,
    systems: [
      { name: 'Tidecall', star: 'yellow', description: 'Ocean worlds with tides the height of skyscrapers. Surf is up. Permanently.', reqs: [] },
      { name: 'Coralis', star: 'white', description: 'Reef-ringed archipelagos glittering under a white sun.', reqs: ['gcol:g3:1'] },
      { name: 'Verdance', star: 'orange', description: 'Jungle worlds so green the satellites need sunglasses.', reqs: ['gcol:g3:1'] },
      { name: "Leviathan's Rest", star: 'red', description: 'Something enormous sleeps in these oceans. Please keep the noise down.', reqs: ['gcol:g3:2'] },
      { name: 'Monsoon Reach', star: 'binary', companion: 'yellow', description: 'Two suns, one endless rainy season.', reqs: ['gcol:g3:2'] },
      { name: 'Maelstrom Eye', star: 'blackhole', description: 'The black heart of the Whirlpool. Its worlds orbit at the edge of forever.', reqs: ['gcol:g3:3'], planets: 3 },
    ],
  },
  {
    name: 'Magellanic Shards',
    kind: 'irregular',
    colors: [0xc9ffb0, 0xff9ad6],
    accent: 0x9dff7a,
    arms: 0,
    twist: 0,
    tilt: 0.7,
    pos: [-150, -120, 320],
    planetTypes: ['barren', 'toxic', 'machine', 'barren', 'toxic', 'machine'],
    tagline: 'Shattered star clouds of rust, acid and machines.',
    description: 'The broken remains of a galaxy that lost a fight with a bigger one. Barren rocks, acid seas and abandoned machine worlds — cheap land, terrible neighbours.',
    reqs: ['tier:8', 'tag:intergalactic', 'colonies:10'],
    stars: 46000,
    systems: [
      { name: 'Shard Alpha', star: 'red', description: 'A splinter of stars drifting through the dark. Nobody owns it. Yet.', reqs: [] },
      { name: 'Rustbelt', star: 'orange', description: 'Asteroid mines and rust-red rocks. Smells like pennies.', reqs: ['gcol:g4:1'] },
      { name: 'Venomire', star: 'yellow', description: 'Toxic worlds wreathed in green fog. Great for chemistry, bad for picnics.', reqs: ['gcol:g4:1'] },
      { name: 'Null Station', star: 'neutron', description: 'A pulsar ticking like a clock. The machines here still keep its time.', reqs: ['gcol:g4:2'], planets: 3 },
      { name: 'Cogwheel', star: 'white', description: 'Machine worlds turning in perfect gear-like resonance.', reqs: ['gcol:g4:2'] },
      { name: 'Scrapheap', star: 'binary', companion: 'red', description: 'Where old spaceships go to die — and get turned into very cheap housing.', reqs: ['gcol:g4:3'] },
    ],
  },
  {
    name: 'The Elder Ring',
    kind: 'ring',
    colors: [0xffd27a, 0x8affd6],
    accent: 0xffd27a,
    arms: 0,
    twist: 0,
    tilt: 0.62,
    pos: [-40, 190, -380],
    planetTypes: ['machine', 'fungal', 'machine', 'fungal', 'crystal'],
    tagline: 'A perfect ring of ancient suns around a silent eye.',
    description: 'A flawless ring of stars around an empty core — too perfect to be natural. Ancient machine worlds and colossal fungal forests guard the oldest secrets in the universe.',
    reqs: ['tier:8', 'tag:intergalactic', 'visited:5'],
    stars: 52000,
    systems: [
      { name: "The Architects' Forge", star: 'blue', description: 'Planet-sized machinery still humming after a billion years. Someone left the lights on.', reqs: [] },
      { name: 'Sporehold', star: 'orange', description: 'Fungal worlds glowing like lanterns in the dark.', reqs: ['gcol:g5:1'] },
      { name: 'Ringward', star: 'yellow', description: 'The gatekeepers of the Ring. Polite, but extremely large.', reqs: ['gcol:g5:1'] },
      { name: 'Mycelia Prime', star: 'binary', companion: 'yellow', description: 'A single fungal network spanning three worlds. It has opinions about your zoning.', reqs: ['gcol:g5:2'] },
      { name: 'Eldritch Reach', star: 'red', description: 'Worlds whose geometry is slightly wrong. Architects love it.', reqs: ['gcol:g5:2'] },
      { name: 'The Silent Engine', star: 'neutron', description: 'A pulsar wired into a planet-sized engine. What does it power? Better not to ask.', reqs: ['gcol:g5:3'], planets: 3 },
      { name: 'The Singular Eye', star: 'blackhole', description: 'The empty heart of the Ring. Ancient worlds orbit it in perfect, impossible order.', reqs: ['gcol:g5:4'], planets: 4 },
    ],
  },
];

const GIANT_PALETTES: { colors: [number, number, number]; ice: boolean }[] = [
  { colors: [0xe9c48f, 0xb9844f, 0xf6e6c8], ice: false },
  { colors: [0xd9b38c, 0x9b6a4a, 0xefd9b8], ice: false },
  { colors: [0x8fd0e6, 0x4f8fc0, 0xd8f2ff], ice: true },
  { colors: [0x9aa6ff, 0x6a5fd0, 0xd9dcff], ice: true },
  { colors: [0xf0a8a0, 0xb8606a, 0xffe0d0], ice: false },
  { colors: [0xc8e6a0, 0x7aa860, 0xeef8d8], ice: false },
];

// ───────────────────────────────────────────────────────────── shape math (shared with the galaxy renderer)

/** Angle of spiral arm `arm` at normalised radius rn (0..1). */
export function armAngle(g: Pick<Galaxy, 'kind' | 'arms' | 'twist'>, rn: number, arm: number): number {
  const arms = Math.max(1, g.arms);
  const base = (arm / arms) * Math.PI * 2;
  if (g.kind === 'barred') {
    const bar = 0.28;
    if (rn <= bar) return base;
    return base + g.twist * Math.log(1 + (3 * (rn - bar)) / (1 - bar));
  }
  return base + g.twist * Math.log(1 + 3 * rn);
}

/** Radius of the Elder Ring's ring of stars (normalised). */
export const RING_RADIUS = 0.68;

// ───────────────────────────────────────────────────────────── generation

function jitterColor(c: number, rng: Rng, amt = 0.08): number {
  const j = (v: number) => clamp(Math.round(v + (rng.next() - 0.5) * 255 * amt * 2), 0, 255);
  return (j((c >> 16) & 255) << 16) | (j((c >> 8) & 255) << 8) | j(c & 255);
}

interface SpecOpts {
  temp?: number;
  moon?: boolean;
  freq?: number;
  rings?: RingSpec | null;
  moons?: MoonSpec[];
  tags?: string[];
  oceanLevel?: number;
  mountains?: number;
}

/** Roll a PlanetSpec for an archetype. */
export function rollSpec(id: string, name: string, type: PlanetTypeId, seed: number, o: SpecOpts = {}): PlanetSpec {
  const a = PLANET_TYPES[type] ?? PLANET_TYPES.terran;
  const rng = new Rng(seed);
  const freq = o.freq ?? (o.moon ? rng.int(18, 26) : rng.int(a.frequency[0], a.frequency[1]));
  const rings: RingSpec | null =
    o.rings !== undefined
      ? o.rings
      : !o.moon && rng.chance(a.ringChance)
        ? { inner: rng.range(1.35, 1.6), outer: rng.range(2.0, 2.7), color: jitterColor(rng.pick([0xd8c8a8, 0xb8c8d8, 0xc8b0e0, 0xe0d0c0, a.atmosphere.color]), rng), opacity: rng.range(0.45, 0.8), tilt: rng.range(-0.5, 0.5) }
        : null;
  return {
    id,
    name,
    type,
    seed: (seed ^ 0x5bd1e995) >>> 0,
    frequency: freq,
    oceanLevel: o.oceanLevel ?? Math.round(rng.range(-0.18, 0.18) * 100) / 100,
    mountains: o.mountains ?? clamp(Math.round((a.ruggedness + rng.range(-0.15, 0.15)) * 100) / 100, 0.1, 0.95),
    temperature: Math.round(o.temp ?? a.temperature + rng.range(-8, 8)),
    gravity: Math.round(rng.range(a.gravity[0], a.gravity[1]) * 100) / 100,
    axialTilt: Math.round(rng.range(0.05, 0.55) * 100) / 100,
    dayLength: rng.int(180, 320),
    atmosphere: { color: jitterColor(a.atmosphere.color, rng, 0.05), density: a.atmosphere.density, breathable: a.atmosphere.breathable },
    hasOcean: a.hasOcean,
    oceanColor: a.oceanColor,
    cloudCover: clamp(Math.round((a.cloudCover + rng.range(-0.1, 0.1)) * 100) / 100, 0, 0.9),
    rings,
    moons: o.moons ?? [],
    tags: o.tags ?? (o.moon ? ['moon'] : []),
  };
}

function moonSpecFor(entry: PlanetEntry, parentSize: number, index: number, rng: Rng): MoonSpec {
  const a = PLANET_TYPES[entry.spec.type];
  return {
    name: entry.name,
    radius: clamp(entry.size / Math.max(0.5, parentSize) * 0.6, 0.08, 0.32),
    distance: 3.2 + index * 1.7 + rng.range(0, 0.6),
    color: a?.palette.land ?? 0xb0b0b0,
    type: entry.spec.type,
    speed: 0.012 + rng.range(0, 0.02),
    inclination: rng.range(-0.25, 0.25),
    phase: rng.range(0, Math.PI * 2),
  };
}

function sizeFor(spec: PlanetSpec, moon = false): number {
  const f = (spec.frequency - 16) / 48;
  return moon ? 0.32 + f * 0.5 : 0.6 + f * 1.0;
}

const TEMP_BY_ORBIT = (i: number, n: number, lum: number) => (lum * 60 - (i / Math.max(1, n - 1)) * 90) * 0.6;

function pickType(rng: Rng, prefs: PlanetTypeId[], orbitIndex: number, n: number): PlanetTypeId {
  // inner orbits lean hot, outer lean cold
  const hot: PlanetTypeId[] = ['volcanic', 'desert', 'toxic'];
  const cold: PlanetTypeId[] = ['arctic', 'tundra', 'barren', 'crystal'];
  const t = orbitIndex / Math.max(1, n - 1);
  const weights = prefs.map((p) => 1 + (hot.includes(p) ? (1 - t) * 1.5 : 0) + (cold.includes(p) ? t * 1.5 : 0));
  return rng.weighted(prefs, weights);
}

function buildHomeSystem(seed: number, g: Galaxy): StarSystem {
  const sid = 'g0.s0';
  const sys: StarSystem = {
    id: sid,
    name: 'Sol Prime',
    star: 'yellow',
    pos: [0, 0, 0],
    planets: [],
    reqs: [],
    galaxyId: g.id,
    spectral: STAR_INFO.yellow.spectral,
    description: GALAXIES[0].systems[0].description,
    home: true,
  };
  const rng = new Rng(seed ^ 0xa11ce);
  const P = (i: number) => `${sid}.p${i}`;
  const add = (e: Omit<PlanetEntry, 'galaxyId' | 'systemId' | 'phase' | 'speed' | 'inclination'> & Partial<Pick<PlanetEntry, 'phase' | 'speed' | 'inclination'>>): PlanetEntry => {
    const full: PlanetEntry = {
      phase: rng.range(0, Math.PI * 2),
      speed: e.parent ? 0.22 + rng.range(0, 0.1) : 0.05 * Math.pow(12 / e.orbit, 1.5),
      inclination: e.parent ? rng.range(-0.2, 0.2) : rng.range(-0.04, 0.04),
      galaxyId: g.id,
      systemId: sid,
      ...e,
    };
    sys.planets.push(full);
    return full;
  };
  const s = (i: number) => hashString(`${seed}:home:${i}`);
  add({ id: P(0), name: 'Vesper', kind: 'planet', colonisable: true, reqs: ['tier:6', 'tag:spaceport'], orbit: 13, size: 0.8, spec: rollSpec(P(0), 'Vesper', 'toxic', s(0), { temp: 95 }), description: 'A sulphur-yellow greenhouse world. Gorgeous from orbit, rude up close.' });
  add({ id: P(1), name: 'Ares', kind: 'planet', colonisable: true, reqs: ['tier:4', 'tag:spaceport'], orbit: 20, size: 0.95, spec: rollSpec(P(1), 'Ares', 'desert', s(1), { temp: 38, freq: 34 }), description: 'Red canyons, dust devils and a sky the colour of rust. Solar power heaven.' });
  const home = add({ id: P(2), name: 'Terra Nova', kind: 'planet', colonisable: true, reqs: [], orbit: 28, size: 1.25, spec: homeSpec(seed), description: 'Your homeworld. Blue oceans, green continents and one very ambitious mayor.' });
  const selene = add({ id: P(2) + '.m0', name: 'Selene', parent: home.id, kind: 'moon', colonisable: true, reqs: ['tier:3', 'tag:spaceport'], orbit: 3.1, size: 0.42, spec: rollSpec(P(2) + '.m0', 'Selene', 'barren', s(20), { moon: true, freq: 24, temp: -120 }), description: 'Your homeworld’s silent grey moon. The view of home is worth the oxygen bill.' });
  void selene;
  add({ id: P(3), name: 'Boreas', kind: 'planet', colonisable: true, reqs: ['tier:4', 'tag:spaceport'], orbit: 37, size: 1.0, spec: rollSpec(P(3), 'Boreas', 'arctic', s(3), { temp: -42, freq: 36 }), description: 'A frozen jewel under shimmering aurorae. Heating bills are… significant.' });
  const giantRings: RingSpec = { inner: 1.45, outer: 2.45, color: 0xd9c49a, opacity: 0.75, tilt: 0.32 };
  const titan = add({
    id: P(4),
    name: 'Titanus',
    kind: 'giant',
    colonisable: false,
    reqs: [],
    orbit: 52,
    size: 3.0,
    spec: { ...rollSpec(P(4), 'Titanus', 'barren', s(4), { rings: giantRings }), tags: ['giant'] },
    giant: { colors: [0xe9c48f, 0xb9844f, 0xf6e6c8], storm: true, ice: false },
    description: 'A banded gas giant with a storm larger than your homeworld. Not for building on. Great for looking at.',
  });
  add({ id: titan.id + '.m0', name: 'Ignis', parent: titan.id, kind: 'moon', colonisable: true, reqs: ['tier:5', 'tag:spaceport'], orbit: 5.4, size: 0.62, spec: rollSpec(titan.id + '.m0', 'Ignis', 'volcanic', s(40), { moon: true, freq: 30 }), description: 'Squeezed by Titanus’ gravity until it glows. Limitless geothermal power; limited fire insurance.' });
  add({ id: titan.id + '.m1', name: 'Thalassa', parent: titan.id, kind: 'moon', colonisable: true, reqs: ['tier:5', 'tag:spaceport'], orbit: 7.0, size: 0.7, spec: rollSpec(titan.id + '.m1', 'Thalassa', 'ocean', s(41), { moon: true, freq: 32 }), description: 'A warm ocean moon of atolls and reefs, lit by a giant in the sky.' });
  add({ id: P(5), name: 'Halcyon', kind: 'planet', colonisable: true, reqs: ['tier:6', 'tag:spaceport'], orbit: 68, size: 0.9, spec: rollSpec(P(5), 'Halcyon', 'crystal', s(5), { rings: { inner: 1.5, outer: 2.3, color: 0xcdb8ff, opacity: 0.7, tilt: -0.35 } }), description: 'A ringed crystal world that chimes when the solar wind picks up.' });
  const oke = add({
    id: P(6),
    name: 'Okeanos',
    kind: 'giant',
    colonisable: false,
    reqs: [],
    orbit: 84,
    size: 2.3,
    spec: { ...rollSpec(P(6), 'Okeanos', 'barren', s(6), { rings: null }), tags: ['giant'] },
    giant: { colors: [0x8fd0e6, 0x4f8fc0, 0xd8f2ff], storm: false, ice: true },
    description: 'A serene blue ice giant at the edge of the system. It tilts on its side for reasons it won’t discuss.',
  });
  add({ id: oke.id + '.m0', name: 'Umbra', parent: oke.id, kind: 'moon', colonisable: true, reqs: ['tier:7', 'tag:spaceport'], orbit: 4.6, size: 0.55, spec: rollSpec(oke.id + '.m0', 'Umbra', 'fungal', s(60), { moon: true, freq: 28 }), description: 'A dark moon carpeted in glowing fungus. The locals (spores) are friendly.' });
  // giants' MoonSpecs for planet-view skies
  for (const p of sys.planets) {
    if (p.parent) continue;
    const ms = sys.planets.filter((m) => m.parent === p.id);
    if (ms.length && p.id !== home.id) p.spec.moons = ms.map((m, i) => moonSpecFor(m, p.size, i, rng));
  }
  return sys;
}

function buildSystem(seed: number, g: Galaxy, gd: GalaxyDef, si: number, def: SystemDef, pos: [number, number, number]): StarSystem {
  const sid = `${g.id}.s${si}`;
  const rng = new Rng(hashString(`${seed}:${sid}`));
  const star = STAR_INFO[def.star];
  const sys: StarSystem = {
    id: sid,
    name: def.name,
    star: def.star,
    companion: def.companion,
    pos,
    planets: [],
    reqs: def.reqs,
    requires: def.reqs[0],
    galaxyId: g.id,
    spectral: star.spectral,
    description: def.description,
  };
  const n = def.planets ?? rng.int(3, 7);
  const prefs = def.types ?? gd.planetTypes;
  let orbit = star.radius * 2.6 + 6 + (def.star === 'binary' ? 5 : 0) + (def.star === 'blackhole' ? 6 : 0);
  let prevSize = 0;
  for (let i = 0; i < n; i++) {
    const pid = `${sid}.p${i}`;
    const giant = i >= 2 && rng.chance(def.star === 'neutron' || def.star === 'blackhole' ? 0.15 : 0.32);
    if (giant) {
      const pal = rng.pick(GIANT_PALETTES);
      const size = rng.range(2.1, 3.1);
      orbit += 6 + (prevSize + size) * 1.6 + 6;
      const name = planetName(rng, def.name, i);
      const rings = rng.chance(0.55) ? { inner: rng.range(1.35, 1.6), outer: rng.range(2.1, 2.8), color: jitterColor(pal.colors[2], rng), opacity: rng.range(0.5, 0.8), tilt: rng.range(-0.5, 0.5) } : null;
      const e: PlanetEntry = {
        id: pid,
        name,
        kind: 'giant',
        colonisable: false,
        reqs: [],
        orbit,
        size,
        spec: { ...rollSpec(pid, name, 'barren', rng.int(1, 1e9), { rings }), tags: ['giant'] },
        giant: { colors: [jitterColor(pal.colors[0], rng), jitterColor(pal.colors[1], rng), pal.colors[2]], storm: rng.chance(0.5), ice: pal.ice },
        phase: rng.range(0, Math.PI * 2),
        speed: 0.05 * Math.pow(12 / orbit, 1.5),
        inclination: rng.range(-0.05, 0.05),
        galaxyId: g.id,
        systemId: sid,
        description: pal.ice ? 'An ice giant of methane haze and diamond rain.' : 'A banded gas giant. Its storms have storms.',
      };
      sys.planets.push(e);
      // giant moons: 1–3 colonisable moons
      const mc = rng.int(1, 3);
      const moons: PlanetEntry[] = [];
      for (let m = 0; m < mc; m++) {
        const mt = pickType(rng, prefs, Math.min(n - 1, i + m), n);
        const mid = `${pid}.m${m}`;
        const mname = moonName(rng);
        const spec = rollSpec(mid, mname, mt, rng.int(1, 1e9), { moon: true, freq: rng.int(20, 30), temp: PLANET_TYPES[mt].temperature + TEMP_BY_ORBIT(i, n, star.lum) * 0.3 });
        const me: PlanetEntry = { id: mid, name: mname, parent: pid, kind: 'moon', colonisable: true, reqs: [], orbit: size * 1.75 + 1.2 + m * 1.3, size: sizeFor(spec, true), spec, phase: rng.range(0, 6.28), speed: 0.25 / (m + 1), inclination: rng.range(-0.2, 0.2), galaxyId: g.id, systemId: sid };
        moons.push(me);
        sys.planets.push(me);
      }
      e.spec.moons = moons.map((m, k) => moonSpecFor(m, size, k, rng));
      orbit += moons.length ? moons[moons.length - 1].orbit * 0.8 : 0;
      prevSize = size;
      continue;
    }
    const type = pickType(rng, prefs, i, n);
    const name = planetName(rng, def.name, i);
    const temp = PLANET_TYPES[type].temperature + TEMP_BY_ORBIT(i, n, star.lum) * 0.35 + rng.range(-6, 6);
    const spec = rollSpec(pid, name, type, rng.int(1, 1e9), { temp });
    const size = sizeFor(spec);
    orbit += 5 + (prevSize + size) * 1.5 + rng.range(0, 3);
    const e: PlanetEntry = {
      id: pid,
      name,
      kind: 'planet',
      colonisable: true,
      reqs: def.star === 'blackhole' ? ['tier:8'] : [],
      orbit,
      size,
      spec,
      phase: rng.range(0, Math.PI * 2),
      speed: 0.05 * Math.pow(12 / orbit, 1.5),
      inclination: rng.range(-0.05, 0.05),
      galaxyId: g.id,
      systemId: sid,
      description: PLANET_TYPES[type].tagline,
    };
    sys.planets.push(e);
    // rocky moons
    const [mn, mx] = PLANET_TYPES[type].moons;
    const mc = rng.int(mn, Math.min(2, mx));
    const moons: PlanetEntry[] = [];
    for (let m = 0; m < mc; m++) {
      const mt: PlanetTypeId = rng.chance(0.7) ? 'barren' : pickType(rng, prefs, n - 1, n);
      const mid = `${pid}.m${m}`;
      const mname = moonName(rng);
      const mspec = rollSpec(mid, mname, mt, rng.int(1, 1e9), { moon: true });
      const me: PlanetEntry = { id: mid, name: mname, parent: pid, kind: 'moon', colonisable: true, reqs: [], orbit: size * 1.9 + 0.9 + m * 1.0, size: Math.min(size * 0.55, sizeFor(mspec, true)), spec: mspec, phase: rng.range(0, 6.28), speed: 0.3 / (m + 1), inclination: rng.range(-0.25, 0.25), galaxyId: g.id, systemId: sid };
      moons.push(me);
      sys.planets.push(me);
    }
    spec.moons = moons.map((m, k) => moonSpecFor(m, size, k, rng));
    if (moons.length) orbit += moons[moons.length - 1].orbit * 0.6;
    prevSize = size;
  }
  return sys;
}

/** Place systems inside a galaxy consistently with its rendered shape. */
function systemPositions(g: GalaxyDef, count: number, rng: Rng, R: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const minD = R * 0.16;
  const tryPos = (): [number, number, number] => {
    switch (g.kind) {
      case 'spiral':
      case 'barred': {
        const rn = rng.range(0.3, 0.92);
        const arm = rng.int(0, Math.max(1, g.arms) - 1);
        const a = armAngle(g, rn, arm) + rng.range(-0.12, 0.12);
        return [Math.cos(a) * rn * R, rng.range(-1, 1) * R * 0.02, Math.sin(a) * rn * R];
      }
      case 'ring': {
        const a = rng.range(0, Math.PI * 2);
        const rn = RING_RADIUS + rng.range(-0.06, 0.06);
        return [Math.cos(a) * rn * R, rng.range(-1, 1) * R * 0.03, Math.sin(a) * rn * R];
      }
      case 'elliptical': {
        const a = rng.range(0, Math.PI * 2);
        const rn = rng.range(0.25, 0.8);
        return [Math.cos(a) * rn * R, rng.range(-1, 1) * R * 0.12, Math.sin(a) * rn * R * 0.85];
      }
      default: {
        const a = rng.range(0, Math.PI * 2);
        const rn = rng.range(0.15, 0.85);
        return [Math.cos(a) * rn * R, rng.range(-1, 1) * R * 0.1, Math.sin(a) * rn * R * 0.7];
      }
    }
  };
  for (let i = 0; i < count; i++) {
    let best: [number, number, number] = tryPos();
    for (let k = 0; k < 40; k++) {
      const p = k === 0 ? best : tryPos();
      if (out.every((q) => Math.hypot(q[0] - p[0], q[2] - p[2]) > minD)) {
        best = p;
        break;
      }
      best = p;
    }
    out.push(best);
  }
  return out;
}

/** Build the whole (deterministic) universe for a seed. */
export function buildUniverse(seed: number): Galaxy[] {
  const out: Galaxy[] = [];
  GALAXIES.forEach((gd, gi) => {
    const id = `g${gi}`;
    const R = 100;
    const g: Galaxy = {
      id,
      name: gd.name,
      kind: gd.kind,
      colors: gd.colors,
      pos: gd.pos,
      systems: [],
      reqs: gd.reqs,
      requires: gd.reqs[0],
      description: gd.description,
      planetTypes: gd.planetTypes,
      tagline: gd.tagline,
      arms: gd.arms,
      twist: gd.twist,
      radius: R,
      tilt: gd.tilt,
      accent: gd.accent,
      stars: gd.stars,
    };
    const rng = new Rng(hashString(`${seed}:${id}:layout`));
    const positions = systemPositions(gd, gd.systems.length, rng, R);
    gd.systems.forEach((sd, si) => {
      if (gi === 0 && si === 0) {
        const home = buildHomeSystem(seed, g);
        // home sits on arm 0 at 58 % radius
        const a = armAngle(g, 0.58, 0);
        home.pos = [Math.cos(a) * 58, 0, Math.sin(a) * 58];
        g.systems.push(home);
      } else g.systems.push(buildSystem(seed, g, gd, si, sd, positions[si]));
    });
    out.push(g);
  });
  return out;
}

// ───────────────────────────────────────────────────────────── lookups

export interface IdParts {
  galaxy: string;
  system: string;
  planet: string;
}

/** "g0.s3.p2.m1" → { galaxy: 'g0', system: 'g0.s3', planet: 'g0.s3.p2' } */
export function idParts(id: string): IdParts | null {
  const m = /^(g\d+)\.(s\d+)(?:\.(p\d+))?/.exec(id);
  if (!m) return null;
  return { galaxy: m[1], system: `${m[1]}.${m[2]}`, planet: m[3] ? `${m[1]}.${m[2]}.${m[3]}` : '' };
}

export function findGalaxy(gs: Galaxy[], id: string): Galaxy | undefined {
  return gs.find((g) => g.id === id);
}
export function findSystem(gs: Galaxy[], id: string): StarSystem | undefined {
  const p = idParts(id);
  if (!p) return undefined;
  return findGalaxy(gs, p.galaxy)?.systems.find((s) => s.id === p.system);
}
export function findPlanet(gs: Galaxy[], id: string): PlanetEntry | undefined {
  const sys = findSystem(gs, id);
  return sys?.planets.find((p) => p.id === id);
}

/** Random syllable world name (Planet Forge dice). */
export function randomWorldName(seed: number): string {
  return worldName(new Rng(seed));
}
