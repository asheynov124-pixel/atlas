/**
 * OWNER: cosmos.
 * Goal content: the career milestone ladder (tiers 0–8, each gated by TOTAL population across colonies plus a
 * signature goal) and 56 side goals / achievements with rewards. Pure data + measure functions over a GoalCtx
 * supplied by Progression — no game imports here, so the content is easy to read, balance and test.
 */
import type { PlanetTypeId } from '../core/types';

/** Everything a goal may ask about the empire (implemented by Progression). */
export interface GoalCtx {
  sandbox: boolean;
  tier: number;
  /** sim metric of the active planet (MetricId or any ui.stats key) */
  metric(id: string): number;
  /** total population across every colony */
  totalPop(): number;
  /** population of every colony except the homeworld */
  colonyPop(): number;
  /** colonies founded (incl. the homeworld) */
  colonies(): number;
  coloniesOfType(t: PlanetTypeId): number;
  /** colonies that are moons */
  moonColonies(): number;
  /** distinct star systems / galaxies with a colony */
  systemsColonised(): number;
  galaxiesColonised(): number;
  /** distinct galaxies landed in */
  galaxiesVisited(): number;
  /** visited a black-hole system */
  blackHoleVisited(): boolean;
  /** buildings + orbitals matching a progression tag, across every colony */
  tagCount(tag: 'spaceport' | 'warpgate' | 'intergalactic' | 'ring'): number;
  /** is any item with this tag registered (else tag requirements are waived) */
  tagAvailable(tag: 'spaceport' | 'warpgate' | 'intergalactic' | 'ring'): boolean;
  /** empire counter (game.empire.s.counters) */
  counter(name: string): number;
  techs(): number;
  techTotal(): number;
  orbitals(): number;
  stylesUsed(): number;
  customDesigns(): number;
  money(): number;
  days(): number;
}

export type GoalCategory = 'city' | 'people' | 'economy' | 'space' | 'god' | 'creator' | 'time';

export interface Reward {
  money?: number;
  research?: number;
}

export interface GoalDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: GoalCategory;
  /** [current, target] */
  measure: (c: GoalCtx) => [number, number];
  /** unit shown in the progress label ("citizens") */
  unit?: string;
  reward: Reward;
  /** full-screen celebration when completed (otherwise a toast) */
  major?: boolean;
  /** hidden in lists until completed */
  secret?: boolean;
  /** only offered from this tier on (career "active goals" selection) */
  minTier?: number;
  /** extra condition (e.g. a population floor) — goal cannot complete while false */
  gate?: (c: GoalCtx) => boolean;
  gateText?: string;
}

export interface TierDef {
  tier: number;
  name: string;
  /** total population required */
  pop: number;
  blurb: string;
  reward: Reward;
  /** signature goal (besides population) */
  signature?: { id: string; title: string; description: string; icon: string; measure: (c: GoalCtx) => [number, number]; unit?: string; tag?: 'spaceport' | 'warpgate' | 'intergalactic' };
  /** what opens up (shown in the celebration / goals panel) */
  opens: string;
}

export const TIERS: TierDef[] = [
  { tier: 0, name: 'Outpost', pop: 0, blurb: 'A landing pad, a flag and a dream.', reward: {}, opens: 'Roads, basic zoning and starter utilities.' },
  {
    tier: 1,
    name: 'Settlement',
    pop: 400,
    blurb: 'People are actually choosing to live here.',
    reward: { money: 10_000, research: 60 },
    signature: { id: 'sig.rci', title: 'Something for everyone', description: 'Have homes, shops and industry growing at the same time.', icon: 'zones', measure: (c) => [Math.min(1, c.metric('residentialBuildings') + c.metric('housing')) + Math.min(1, c.metric('commercialBuildings') + c.metric('jobsCommercial')) + Math.min(1, c.metric('industrialBuildings') + c.metric('jobsIndustrial')), 3], unit: 'zone types' },
    opens: 'Medium-density zoning, first services and parks.',
  },
  {
    tier: 2,
    name: 'Township',
    pop: 1_500,
    blurb: 'A real town, with real traffic jams.',
    reward: { money: 25_000, research: 120 },
    signature: { id: 'sig.happy', title: 'Keep them smiling', description: 'Hold average happiness at 55 % or better.', icon: 'smile', measure: (c) => [c.metric('happiness'), 55], unit: '% happy' },
    opens: 'Schools, clinics, avenues and offices.',
  },
  {
    tier: 3,
    name: 'Colony City',
    pop: 5_000,
    blurb: 'Big enough to dream about the moon.',
    reward: { money: 50_000, research: 250 },
    signature: { id: 'sig.spaceport', title: 'Ground control', description: 'Build a spaceport — the moon will not colonise itself.', icon: 'rocket', measure: (c) => [c.tagCount('spaceport'), 1], unit: 'spaceport', tag: 'spaceport' },
    opens: 'High density, orbital launches — and your moon, Selene.',
  },
  {
    tier: 4,
    name: 'Metropolis',
    pop: 12_000,
    blurb: 'Your skyline is visible from orbit. Literally.',
    reward: { money: 100_000, research: 400 },
    signature: { id: 'sig.colony', title: 'One small step', description: 'Found your first off-world colony.', icon: 'rocket', measure: (c) => [c.colonies() - 1, 1], unit: 'colony' },
    opens: 'Ares and Boreas, landmarks and mass transit.',
  },
  {
    tier: 5,
    name: 'Megacity',
    pop: 25_000,
    blurb: 'Traffic now has its own weather system.',
    reward: { money: 200_000, research: 700 },
    signature: { id: 'sig.colonypop', title: 'Second homes', description: 'Grow your off-world colonies to 2 500 citizens in total.', icon: 'planet', measure: (c) => [c.colonyPop(), 2_500], unit: 'colonists' },
    opens: 'The moons of Titanus — Ignis and Thalassa — and orbital industry.',
  },
  {
    tier: 6,
    name: 'Interplanetary Power',
    pop: 50_000,
    blurb: 'Three worlds answer to you. They mostly complain.',
    reward: { money: 400_000, research: 1_200 },
    signature: { id: 'sig.colonies3', title: 'Interplanetary', description: 'Rule 3 worlds at once.', icon: 'planet', measure: (c) => [c.colonies(), 3], unit: 'worlds' },
    opens: 'Warp gates, nearby star systems and megastructures.',
  },
  {
    tier: 7,
    name: 'Stellar Civilisation',
    pop: 100_000,
    blurb: 'Your empire spans the stars. Your inbox spans light-years.',
    reward: { money: 800_000, research: 2_000 },
    signature: { id: 'sig.stars', title: 'Beyond the sun', description: 'Colonise a world in another star system.', icon: 'starSystem', measure: (c) => [c.systemsColonised() - 1, 1], unit: 'system' },
    opens: 'Distant systems, pulsars, Dyson-class engineering.',
  },
  {
    tier: 8,
    name: 'Galactic Civilisation',
    pop: 200_000,
    blurb: 'The galaxy is your neighbourhood. Next: other neighbourhoods.',
    reward: { money: 2_000_000, research: 3_500 },
    signature: { id: 'sig.network', title: 'Stellar network', description: 'Hold colonies in 3 different star systems.', icon: 'galaxy', measure: (c) => [c.systemsColonised(), 3], unit: 'systems' },
    opens: 'Intergalactic gates and the other five galaxies.',
  },
];

export const TIER_NAMES = TIERS.map((t) => t.name);
export const TIER_POP = TIERS.map((t) => t.pop);

const m = (id: string, target: number) => (c: GoalCtx): [number, number] => [c.metric(id), target];
const popAtLeast = (n: number) => (c: GoalCtx) => c.metric('population') >= n;

/** Side goals & achievements. */
export const GOALS: GoalDef[] = [
  // ── city ────────────────────────────────────────────────────────────
  { id: 'city.roads', title: 'Paving Paradise', description: 'Lay 25 tiles of road.', icon: 'roads', category: 'city', measure: m('roadTiles', 25), unit: 'road tiles', reward: { money: 3_000, research: 10 } },
  { id: 'city.zoned', title: 'Zoning Enthusiast', description: 'Zone 150 tiles.', icon: 'zones', category: 'city', measure: m('zonedTiles', 150), unit: 'tiles', reward: { money: 5_000, research: 15 } },
  { id: 'city.buildings100', title: 'Skyline Starter', description: 'Have 100 buildings on one world.', icon: 'building', category: 'city', measure: m('buildings', 100), unit: 'buildings', reward: { money: 8_000, research: 25 } },
  { id: 'city.buildings500', title: 'Concrete Jungle', description: 'Have 500 buildings on one world.', icon: 'building', category: 'city', measure: m('buildings', 500), unit: 'buildings', reward: { money: 40_000, research: 120 }, minTier: 3 },
  { id: 'city.buildings1500', title: 'Ecumenopolis Lite', description: 'Have 1 500 buildings on one world.', icon: 'office', category: 'city', measure: m('buildings', 1500), unit: 'buildings', reward: { money: 150_000, research: 400 }, minTier: 5, major: true },
  { id: 'city.parks5', title: 'Green Thumb', description: 'Build 5 parks or leisure spots.', icon: 'park', category: 'city', measure: m('parks', 5), unit: 'parks', reward: { money: 6_000, research: 20 } },
  { id: 'city.parks25', title: 'Garden World', description: 'Build 25 parks or leisure spots.', icon: 'tree', category: 'city', measure: m('parks', 25), unit: 'parks', reward: { money: 50_000, research: 150 }, minTier: 3 },
  { id: 'city.districts', title: 'Neighbourhood Watch', description: 'Draw 3 districts.', icon: 'district', category: 'city', measure: m('districts', 3), unit: 'districts', reward: { money: 8_000, research: 25 }, minTier: 1 },
  { id: 'city.landmark', title: 'Point of Interest', description: 'Build a landmark.', icon: 'landmarks', category: 'city', measure: m('landmarks', 1), unit: 'landmark', reward: { money: 20_000, research: 60 }, minTier: 2 },
  { id: 'city.wonder', title: 'Wonder of the Worlds', description: 'Complete a wonder.', icon: 'crown', category: 'city', measure: m('wonders', 1), unit: 'wonder', reward: { money: 120_000, research: 300 }, minTier: 4, major: true },
  { id: 'city.wonders3', title: 'Seven Wonders (Well, Three)', description: 'Complete 3 wonders.', icon: 'crown', category: 'city', measure: m('wonders', 3), unit: 'wonders', reward: { money: 400_000, research: 900 }, minTier: 6, major: true },
  { id: 'city.traffic', title: 'Free-Flowing', description: 'Keep traffic congestion under 25 % with 10 000 citizens.', icon: 'traffic', category: 'city', measure: (c) => [Math.max(0, 100 - c.metric('traffic')), 75], unit: '% clear', gate: popAtLeast(10_000), gateText: 'Needs 10 000 citizens', reward: { money: 30_000, research: 100 }, minTier: 3 },
  { id: 'city.landvalue', title: 'Prime Real Estate', description: 'Raise average land value to 70.', icon: 'landValue', category: 'city', measure: m('landValue', 70), unit: 'land value', gate: popAtLeast(2_000), gateText: 'Needs 2 000 citizens', reward: { money: 40_000, research: 120 }, minTier: 2 },

  // ── people ──────────────────────────────────────────────────────────
  { id: 'people.1k', title: 'Four Digits', description: 'Reach 1 000 citizens on one world.', icon: 'population', category: 'people', measure: m('population', 1_000), unit: 'citizens', reward: { money: 5_000, research: 20 } },
  { id: 'people.10k', title: 'Five Digits', description: 'Reach 10 000 citizens on one world.', icon: 'population', category: 'people', measure: m('population', 10_000), unit: 'citizens', reward: { money: 30_000, research: 100 }, minTier: 2 },
  { id: 'people.100k', title: 'Six-Figure Empire', description: 'Reach 100 000 citizens across your empire.', icon: 'population', category: 'people', measure: (c) => [c.totalPop(), 100_000], unit: 'citizens', reward: { money: 250_000, research: 600 }, minTier: 5, major: true },
  { id: 'people.1m', title: 'The Million Club', description: 'Reach 1 000 000 citizens across your empire.', icon: 'crown', category: 'people', measure: (c) => [c.totalPop(), 1_000_000], unit: 'citizens', reward: { money: 5_000_000, research: 8_000 }, minTier: 8, major: true },
  { id: 'people.happy75', title: 'Good Vibes Only', description: 'Reach 75 % happiness with 1 000 citizens.', icon: 'smile', category: 'people', measure: m('happiness', 75), unit: '% happy', gate: popAtLeast(1_000), gateText: 'Needs 1 000 citizens', reward: { money: 15_000, research: 40 } },
  { id: 'people.happy90', title: 'Utopia, Basically', description: 'Reach 90 % happiness with 5 000 citizens.', icon: 'heart', category: 'people', measure: m('happiness', 90), unit: '% happy', gate: popAtLeast(5_000), gateText: 'Needs 5 000 citizens', reward: { money: 80_000, research: 250 }, minTier: 3, major: true },
  { id: 'people.safe', title: 'Safe Streets', description: 'Keep crime at 10 or lower with 5 000 citizens.', icon: 'police', category: 'people', measure: (c) => [Math.max(0, 100 - c.metric('crime')), 90], unit: '% safe', gate: popAtLeast(5_000), gateText: 'Needs 5 000 citizens', reward: { money: 25_000, research: 80 }, minTier: 2 },
  { id: 'people.clean', title: 'Breathe Easy', description: 'Keep pollution at 15 or lower with 5 000 citizens.', icon: 'pollution', category: 'people', measure: (c) => [Math.max(0, 100 - c.metric('pollution')), 85], unit: '% clean', gate: popAtLeast(5_000), gateText: 'Needs 5 000 citizens', reward: { money: 25_000, research: 80 }, minTier: 2 },
  { id: 'people.educated', title: 'Brain Trust', description: 'Reach an education score of 70.', icon: 'education', category: 'people', measure: m('education', 70), unit: 'education', gate: popAtLeast(2_000), gateText: 'Needs 2 000 citizens', reward: { money: 30_000, research: 200 }, minTier: 2 },
  { id: 'people.healthy', title: 'An Apple a Day', description: 'Reach a health score of 80.', icon: 'health', category: 'people', measure: m('health', 80), unit: 'health', gate: popAtLeast(2_000), gateText: 'Needs 2 000 citizens', reward: { money: 25_000, research: 80 }, minTier: 2 },
  { id: 'people.jobs', title: 'Full Employment', description: 'Unemployment at 3 % or lower with 3 000 citizens.', icon: 'jobs', category: 'people', measure: (c) => [Math.max(0, 100 - c.metric('unemployment')), 97], unit: '% employed', gate: popAtLeast(3_000), gateText: 'Needs 3 000 citizens', reward: { money: 20_000, research: 60 }, minTier: 1 },
  { id: 'people.tourists', title: 'Tourist Trap', description: 'Attract 10 000 tourists a month.', icon: 'tourism', category: 'people', measure: m('tourism', 10_000), unit: 'tourists', reward: { money: 60_000, research: 150 }, minTier: 3 },

  // ── economy ─────────────────────────────────────────────────────────
  { id: 'econ.black', title: 'In the Black', description: 'Earn ₡5 000 net per month.', icon: 'income', category: 'economy', measure: m('monthlyIncome', 5_000), unit: '₡/mo', reward: { research: 40 } },
  { id: 'econ.income50k', title: 'Cash Cow', description: 'Earn ₡50 000 net per month.', icon: 'trendUp', category: 'economy', measure: m('monthlyIncome', 50_000), unit: '₡/mo', reward: { research: 250 }, minTier: 4 },
  { id: 'econ.million', title: 'Millionaire Mayor', description: 'Hold ₡1 000 000 in the treasury.', icon: 'money', category: 'economy', measure: (c) => [c.money(), 1_000_000], unit: '₡', reward: { research: 300 }, minTier: 2, major: true },
  { id: 'econ.tenmillion', title: 'Credit Where Due', description: 'Hold ₡10 000 000 in the treasury.', icon: 'wallet', category: 'economy', measure: (c) => [c.money(), 10_000_000], unit: '₡', reward: { research: 1_500 }, minTier: 6 },
  { id: 'econ.techs5', title: 'Tech Savvy', description: 'Research 5 technologies.', icon: 'research', category: 'economy', measure: (c) => [c.techs(), 5], unit: 'techs', reward: { money: 40_000 }, minTier: 1 },
  { id: 'econ.techs15', title: 'Mad Scientist', description: 'Research 15 technologies.', icon: 'research', category: 'economy', measure: (c) => [c.techs(), 15], unit: 'techs', reward: { money: 250_000 }, minTier: 4 },
  { id: 'econ.techsAll', title: 'Singularity Achieved', description: 'Research every technology.', icon: 'sparkles', category: 'economy', measure: (c) => [c.techs(), c.techTotal()], unit: 'techs', reward: { money: 3_000_000 }, minTier: 7, major: true },

  // ── space ───────────────────────────────────────────────────────────
  { id: 'space.map', title: 'Cartographer', description: 'Open the star map.', icon: 'map', category: 'space', measure: (c) => [Math.min(1, c.counter('cosmos.mapOpened')), 1], reward: { money: 2_000, research: 10 } },
  { id: 'space.galaxyMap', title: 'Big Picture', description: 'Zoom out all the way to the universe.', icon: 'universe', category: 'space', measure: (c) => [Math.min(1, c.counter('cosmos.universeOpened')), 1], reward: { money: 3_000, research: 15 } },
  { id: 'space.spaceport', title: 'Ground Control', description: 'Build a spaceport.', icon: 'rocket', category: 'space', measure: (c) => [c.tagCount('spaceport'), 1], unit: 'spaceport', reward: { money: 25_000, research: 80 }, minTier: 2 },
  { id: 'space.moon', title: 'Moonlighting', description: 'Found a colony on a moon.', icon: 'moon', category: 'space', measure: (c) => [c.moonColonies(), 1], unit: 'moon colony', reward: { money: 40_000, research: 150 }, minTier: 3, major: true },
  { id: 'space.ocean', title: 'Water World', description: 'Colonise an ocean world.', icon: 'wave', category: 'space', measure: (c) => [c.coloniesOfType('ocean'), 1], unit: 'colony', reward: { money: 60_000, research: 200 }, minTier: 4 },
  { id: 'space.volcanic', title: 'Hot Property', description: 'Colonise a volcanic world.', icon: 'volcano', category: 'space', measure: (c) => [c.coloniesOfType('volcanic'), 1], unit: 'colony', reward: { money: 60_000, research: 200 }, minTier: 4 },
  { id: 'space.arctic', title: 'Cold Feet', description: 'Colonise an arctic world.', icon: 'snowflake', category: 'space', measure: (c) => [c.coloniesOfType('arctic'), 1], unit: 'colony', reward: { money: 50_000, research: 150 }, minTier: 4 },
  { id: 'space.desert', title: 'Dune Raider', description: 'Colonise a desert world.', icon: 'sun', category: 'space', measure: (c) => [c.coloniesOfType('desert'), 1], unit: 'colony', reward: { money: 50_000, research: 150 }, minTier: 4 },
  { id: 'space.exotic', title: 'Strange New Worlds', description: 'Colonise a crystal, fungal or machine world.', icon: 'alien', category: 'space', measure: (c) => [c.coloniesOfType('crystal') + c.coloniesOfType('fungal') + c.coloniesOfType('machine'), 1], unit: 'colony', reward: { money: 120_000, research: 400 }, minTier: 6 },
  { id: 'space.colonies5', title: 'Interplanetary Landlord', description: 'Rule 5 worlds at once.', icon: 'globe', category: 'space', measure: (c) => [c.colonies(), 5], unit: 'worlds', reward: { money: 250_000, research: 600 }, minTier: 5, major: true },
  { id: 'space.colonies12', title: 'Cosmic Real-Estate Mogul', description: 'Rule 12 worlds at once.', icon: 'globe', category: 'space', measure: (c) => [c.colonies(), 12], unit: 'worlds', reward: { money: 2_000_000, research: 3_000 }, minTier: 8, major: true },
  { id: 'space.orbitals', title: 'Space Junk', description: 'Put 5 structures in orbit.', icon: 'satellite', category: 'space', measure: (c) => [c.orbitals(), 5], unit: 'orbitals', reward: { money: 30_000, research: 100 }, minTier: 3 },
  { id: 'space.ring', title: 'Lord of the Rings', description: 'Build an orbital ring.', icon: 'station', category: 'space', measure: (c) => [c.tagCount('ring'), 1], unit: 'ring', reward: { money: 300_000, research: 800 }, minTier: 6, major: true, gate: (c) => c.tagAvailable('ring') },
  { id: 'space.warpgate', title: 'Now You’re Thinking With Portals', description: 'Build a warp gate.', icon: 'warp', category: 'space', measure: (c) => [c.tagCount('warpgate'), 1], unit: 'gate', reward: { money: 200_000, research: 500 }, minTier: 6, gate: (c) => c.tagAvailable('warpgate') },
  { id: 'space.system', title: 'Over the Horizon', description: 'Land in another star system.', icon: 'starSystem', category: 'space', measure: (c) => [c.systemsColonised() - 1, 1], unit: 'system', reward: { money: 150_000, research: 400 }, minTier: 6 },
  { id: 'space.blackhole', title: 'Event Horizon Tourism', description: 'Visit a black-hole system.', icon: 'blackhole', category: 'space', measure: (c) => [c.blackHoleVisited() ? 1 : 0, 1], reward: { money: 500_000, research: 1_000 }, minTier: 7, major: true },
  { id: 'space.galaxy', title: 'Intergalactic Tourist', description: 'Land in another galaxy.', icon: 'galaxy', category: 'space', measure: (c) => [c.galaxiesVisited() - 1, 1], unit: 'galaxy', reward: { money: 1_000_000, research: 2_000 }, minTier: 8, major: true },
  { id: 'space.allGalaxies', title: 'Seen It All', description: 'Land in all six galaxies.', icon: 'universe', category: 'space', measure: (c) => [c.galaxiesVisited(), 6], unit: 'galaxies', reward: { money: 10_000_000, research: 10_000 }, minTier: 8, major: true },

  // ── god ─────────────────────────────────────────────────────────────
  { id: 'god.first', title: 'Act of God', description: 'Unleash any god power.', icon: 'god', category: 'god', measure: (c) => [Math.min(1, c.counter('cosmos.powers')), 1], reward: { money: 2_000, research: 10 } },
  { id: 'god.meteor', title: 'Duck and Cover', description: 'Survive a meteor strike with your city intact.', icon: 'meteor', category: 'god', measure: (c) => [Math.min(1, c.counter('cosmos.survived.meteor')), 1], reward: { money: 15_000, research: 50 } },
  { id: 'god.tornado', title: 'Not in Kansas Anymore', description: 'Summon a tornado.', icon: 'tornado', category: 'god', measure: (c) => [Math.min(1, c.counter('cosmos.power.tornado')), 1], reward: { money: 5_000, research: 15 } },
  { id: 'god.tsunami', title: 'Surf’s Up', description: 'Survive a tsunami.', icon: 'tsunami', category: 'god', measure: (c) => [Math.min(1, c.counter('cosmos.survived.tsunami')), 1], reward: { money: 15_000, research: 50 } },
  { id: 'god.survivor', title: 'Glutton for Punishment', description: 'Survive 10 disasters.', icon: 'skull', category: 'god', measure: (c) => [c.counter('cosmos.survived'), 10], unit: 'disasters', reward: { money: 60_000, research: 200 } },
  { id: 'god.apocalypse', title: 'Oops', description: 'Use a planet-ending power. (We all make mistakes.)', icon: 'blackhole', category: 'god', measure: (c) => [Math.min(1, c.counter('cosmos.planetEnding')), 1], reward: { research: 100 }, secret: true },
  { id: 'god.rewind', title: 'Time Lord', description: 'Rewind time after a catastrophe.', icon: 'rewind', category: 'god', measure: (c) => [Math.min(1, c.counter('cosmos.power.rewind')), 1], reward: { research: 150 }, secret: true },

  // ── creator ─────────────────────────────────────────────────────────
  { id: 'make.pink', title: 'Think Pink', description: 'Paint a building pink.', icon: 'palette', category: 'creator', measure: (c) => [Math.min(1, c.counter('cosmos.pink')), 1], reward: { money: 5_000, research: 20 } },
  { id: 'make.rename', title: 'Name Dropper', description: 'Give a building a name of its own.', icon: 'tag', category: 'creator', measure: (c) => [Math.min(1, c.counter('cosmos.renamed')), 1], reward: { money: 3_000, research: 10 } },
  { id: 'make.studio', title: 'Architect', description: 'Save a design in the Architect Studio.', icon: 'custom', category: 'creator', measure: (c) => [c.customDesigns(), 1], unit: 'design', reward: { money: 10_000, research: 40 } },
  { id: 'make.studio5', title: 'Starchitect', description: 'Save 5 designs in the Architect Studio.', icon: 'custom', category: 'creator', measure: (c) => [c.customDesigns(), 5], unit: 'designs', reward: { money: 50_000, research: 150 } },
  { id: 'make.styles', title: 'Eclectic Taste', description: 'Have buildings in 3 architectural styles on one world.', icon: 'brush', category: 'creator', measure: (c) => [c.stylesUsed(), 3], unit: 'styles', reward: { money: 15_000, research: 50 }, minTier: 1 },
  { id: 'make.photo', title: 'Say Cheese', description: 'Take a photo in photo mode.', icon: 'camera', category: 'creator', measure: (c) => [Math.min(1, c.counter('cosmos.photos')), 1], reward: { money: 2_000, research: 10 } },
  { id: 'make.forge', title: 'World Builder', description: 'Forge a planet of your own design (sandbox).', icon: 'magic', category: 'creator', measure: (c) => [Math.min(1, c.counter('cosmos.forged')), 1], reward: {}, secret: true },

  // ── time ────────────────────────────────────────────────────────────
  { id: 'time.year', title: 'Happy Anniversary', description: 'Govern for a full year.', icon: 'calendar', category: 'time', measure: (c) => [c.days(), 360], unit: 'days', reward: { money: 10_000, research: 30 } },
  { id: 'time.decade', title: 'Decade of Progress', description: 'Govern for ten years.', icon: 'hourglass', category: 'time', measure: (c) => [c.days(), 3600], unit: 'days', reward: { money: 200_000, research: 600 }, minTier: 3 },
  { id: 'time.century', title: 'Eternal Mayor', description: 'Govern for a hundred years. Have you tried sleeping?', icon: 'clock', category: 'time', measure: (c) => [c.days(), 36000], unit: 'days', reward: { money: 5_000_000, research: 5_000 }, minTier: 6, secret: true },
];

export const CATEGORY_INFO: Record<GoalCategory, { name: string; icon: string }> = {
  city: { name: 'City', icon: 'building' },
  people: { name: 'People', icon: 'population' },
  economy: { name: 'Economy', icon: 'money' },
  space: { name: 'Space', icon: 'rocket' },
  god: { name: 'God', icon: 'god' },
  creator: { name: 'Creator', icon: 'palette' },
  time: { name: 'Time', icon: 'clock' },
};
