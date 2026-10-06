/**
 * OWNER: ui-core.
 * Name generators for the new-game flow (civilisations, cities, homeworlds) + witty loading lines.
 */
import { Rng } from '../../../core/rng';
import type { PlanetTypeId } from '../../../core/types';

const CIV_ADJ = ['Azure', 'Solar', 'Ninth', 'Radiant', 'Silent', 'Iron', 'Verdant', 'Stellar', 'Crimson', 'Lunar', 'Golden', 'Free', 'Distant', 'Eternal', 'Gentle', 'Boundless', 'Luminous', 'Sovereign', 'Wandering', 'Hopeful'];
const CIV_NOUN = ['Concord', 'Compact', 'Dominion', 'Collective', 'Republic', 'Ascendancy', 'Accord', 'Federation', 'Commonwealth', 'Union', 'Assembly', 'Covenant', 'Mandate', 'Directorate', 'Cooperative', 'League', 'Consortium', 'Fellowship'];
const CITY_A = ['New', 'Port', 'Fort', 'Mount', 'Lake', 'East', 'West', 'Upper', 'Old', 'Saint', 'Nova', 'Bright', 'High', 'Far'];
const CITY_B = ['Meridian', 'Aurora', 'Halcyon', 'Vesper', 'Tycho', 'Kepler', 'Solace', 'Lumen', 'Arcadia', 'Elysium', 'Cinder', 'Helios', 'Tessera', 'Juniper', 'Calypso', 'Orion', 'Zephyr', 'Ember', 'Marigold', 'Sable', 'Cobalt', 'Willow', 'Seren', 'Atlas', 'Lyra', 'Polaris', 'Harbor', 'Quill'];
const CITY_C = ['', '', '', ' Bay', ' Falls', ' Reach', ' Landing', ' Heights', ' Springs', ' Crossing', ' Haven', ' Point', ' Vale', ' Prime'];

const WORLDS: Partial<Record<PlanetTypeId, string[]>> = {
  terran: ['Terra Nova', 'Gaia Secunda', 'Verdana', 'Hearth', 'New Eden', 'Thalassa', 'Avalon'],
  tundra: ['Borealis', 'Frostmere', 'Taiga Prime', 'Kalev', 'Nordhalla', 'Whitepine'],
  desert: ['Sahrine', 'Dunehold', 'Ochre', 'Mirage', 'Tamarind', 'Sunreach'],
  ocean: ['Pelagia', 'Maris', 'Atoll', 'Nerida', 'Coralyn', 'Tidewell'],
  arctic: ['Glacia', 'Rime', 'Aurorae', 'Isolde', 'Polaria'],
  volcanic: ['Pyros', 'Cinderfall', 'Magmara', 'Hephaestia', 'Ashkara'],
  jungle: ['Viridia', 'Canopy', 'Selvan', 'Emeraldine', 'Tangle'],
  barren: ['Selene', 'Grayhold', 'Regolis', 'Quietude', 'Pallas'],
  toxic: ['Acerbus', 'Venomira', 'Bilegreen', 'Miasma', 'Caustica'],
  crystal: ['Prisma', 'Quartzine', 'Geodessa', 'Lucent', 'Facet'],
  fungal: ['Mycelia', 'Sporehaven', 'Lumicap', 'Hyphae', 'Toadstool'],
  machine: ['Mechanon', 'Axiom', 'Cogitara', 'Ferrum', 'Gridlock'],
};

export function randomCivName(seed: number): string {
  const r = new Rng(seed);
  return `${r.pick(CIV_ADJ)} ${r.pick(CIV_NOUN)}`;
}

export function randomCityName(seed: number): string {
  const r = new Rng(seed * 7 + 3);
  const a = r.chance(0.4) ? r.pick(CITY_A) + ' ' : '';
  return (a + r.pick(CITY_B) + (a ? '' : r.pick(CITY_C))).trim();
}

export function randomWorldName(type: PlanetTypeId, seed: number): string {
  const list = WORLDS[type] ?? WORLDS.terran!;
  return new Rng(seed * 13 + type.length).pick(list);
}

export const LOADING_LINES = [
  'Calibrating gravity…',
  'Teaching clouds to drift…',
  'Negotiating with tectonic plates…',
  'Polishing the stars…',
  'Hiring a very patient mayor…',
  'Folding hexagons into a sphere…',
  'Convincing the ocean to stay put…',
  'Zoning the atmosphere…',
  'Installing sunsets…',
  'Warming up the god powers (safely)…',
  'Counting every grain of regolith…',
  'Reticulating hexagons…',
];
