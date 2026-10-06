/**
 * OWNER: agent zoned-io
 * Industrial (general / hydroponics / mining / high-tech) and office growables: zones I1 · IF · IM · IT · O.
 *
 * Geometry lives in content/meshes/zoned/io/ — massing per type (general.ts, farm.ts, mining.ts, tech.ts,
 * office.ts) dressed by a per-style Look (look.ts + parts.ts), so all 8 architectural styles re-skin every type.
 * Effects are the capacity at the type's typical level (the middle of its level range); the simulation scales
 * jobs, power, pollution and research with the building's actual level. Every type renders sensibly at any
 * level 1..5; `growable.minLevel/maxLevel` is where it naturally appears.
 */
import { registerItems, type Effects, type ItemDef, type MeshFactory } from '../catalog';
import { Zone } from '../../core/types';
import * as IG from '../meshes/zoned/io/general';
import * as IF from '../meshes/zoned/io/farm';
import * as IM from '../meshes/zoned/io/mining';
import * as IT from '../meshes/zoned/io/tech';
import * as O from '../meshes/zoned/io/office';

const ZONE_META: Record<number, { tier: number; group: string; family: string; tag: string }> = {
  [Zone.IndGeneral]: { tier: 0, group: 'General Industry', family: 'industrial', tag: 'general' },
  [Zone.IndFarm]: { tier: 1, group: 'Hydroponics & Farms', family: 'industrial', tag: 'farm' },
  [Zone.IndMining]: { tier: 1, group: 'Mining', family: 'industrial', tag: 'mining' },
  [Zone.IndTech]: { tier: 2, group: 'High-Tech Industry', family: 'industrial', tag: 'tech' },
  [Zone.Office]: { tier: 3, group: 'Offices', family: 'office', tag: 'office' },
};

interface Grow {
  id: string;
  name: string;
  zone: Zone;
  levels: [number, number];
  variants: number;
  mesh: MeshFactory;
  height: number;
  icon: string;
  description: string;
  flavor: string;
  effects: Effects;
  tags?: string[];
}

function grow(g: Grow): ItemDef {
  const m = ZONE_META[g.zone];
  return {
    id: g.id,
    name: g.name,
    category: 'zones',
    group: m.group,
    description: g.description,
    flavor: g.flavor,
    icon: g.icon,
    footprint: 1,
    placement: 'surface',
    cost: 0,
    upkeep: 0,
    tier: m.tier,
    growable: { zone: g.zone, minLevel: g.levels[0], maxLevel: g.levels[1] },
    styleable: true,
    hidden: true,
    variants: g.variants,
    mesh: g.mesh,
    height: g.height,
    effects: g.effects,
    tags: ['growable', m.family, m.tag, ...(g.tags ?? [])],
  };
}

// ═══════════════════════════════════════════════════════════════ I1 · general industry

const GENERAL: Grow[] = [
  {
    id: 'io_ig_workshop', name: 'Fabrication Workshop', zone: Zone.IndGeneral, levels: [1, 3], variants: 10, mesh: IG.workshop, height: 1.0, icon: '🔧',
    description: 'A small machine shop with roll-up doors, a forklift and a stubborn little chimney.',
    flavor: 'Fixes anything. Except the coffee machine.',
    effects: { jobs: 12, power: -3, water: -1.5, pollution: 22, noise: 20 },
  },
  {
    id: 'io_ig_factory', name: 'Sawtooth Factory', zone: Zone.IndGeneral, levels: [1, 5], variants: 10, mesh: IG.factoryHall, height: 2.0, icon: '🏭',
    description: 'A glazed sawtooth production hall that sprouts smokestacks, process tanks and a corporate front office as it grows.',
    flavor: 'Produces widgets, gadgets and, occasionally, gizmos.',
    effects: { jobs: 26, power: -5, water: -3, pollution: 45, noise: 30 },
  },
  {
    id: 'io_ig_warehouse', name: 'Logistics Warehouse', zone: Zone.IndGeneral, levels: [1, 4], variants: 8, mesh: IG.warehouse, height: 1.1, icon: '📦',
    description: 'Loading docks, hover-trucks and racking — upgrading to an automated high-bay store with conveyor bridges.',
    flavor: 'Next-orbit delivery, guaranteed or your gravity back.',
    effects: { jobs: 18, power: -4, water: -1, pollution: 12, noise: 24 },
  },
  {
    id: 'io_ig_tankfarm', name: 'Tank Farm', zone: Zone.IndGeneral, levels: [1, 5], variants: 8, mesh: IG.tankFarm, height: 1.4, icon: '🛢️',
    description: 'Bunded storage tanks, pipe racks and a flare stack that burns day and night.',
    flavor: 'Contents: classified. Smell: unmistakable.',
    effects: { jobs: 14, power: -3.5, water: -2, pollution: 34, noise: 15 },
  },
  {
    id: 'io_ig_depot', name: 'Container Depot', zone: Zone.IndGeneral, levels: [1, 4], variants: 10, mesh: IG.depot, height: 0.9, icon: '🚛',
    description: 'Stacked cargo containers in every colour, worked by a portal gantry crane that grows with the yard.',
    flavor: 'Every container is labelled "MISC". Nobody knows who started it.',
    effects: { jobs: 20, power: -3.5, water: -1, pollution: 15, noise: 32 },
  },
  {
    id: 'io_ig_foundry', name: 'Arc Foundry', zone: Zone.IndGeneral, levels: [2, 5], variants: 8, mesh: IG.foundry, height: 2.0, icon: '🔥',
    description: 'A blast furnace with a glowing tap-hole, molten runners into the casting hall and a forest of stacks.',
    flavor: 'Forges hull plates for starships and the occasional novelty spoon.',
    effects: { jobs: 40, power: -8, water: -5, pollution: 70, noise: 42 },
    tags: ['heavy'],
  },
  {
    id: 'io_ig_assembly', name: 'Hover-Car Assembly Plant', zone: Zone.IndGeneral, levels: [3, 5], variants: 8, mesh: IG.assembly, height: 1.3, icon: '🚗',
    description: 'A long assembly hall with a glazed office wing and a test track where fresh hover-cars do their first laps.',
    flavor: 'Zero to orbital velocity in "please read the warranty".',
    effects: { jobs: 46, power: -7, water: -3, pollution: 28, noise: 26 },
  },
  {
    id: 'io_ig_scrap', name: 'Scrap Reclaimer', zone: Zone.IndGeneral, levels: [1, 3], variants: 8, mesh: IG.scrapyard, height: 0.9, icon: '🧲',
    description: 'Heaps of salvage, a magnet crane and crushed-car cubes waiting to be reborn as something shiny.',
    flavor: "One colony's junk is another colony's starship.",
    effects: { jobs: 10, power: -2.5, water: -0.5, pollution: 36, noise: 36 },
    tags: ['recycling'],
  },
];


// ═══════════════════════════════════════════════════════════════ IF · hydroponics & farms

const FARM: Grow[] = [
  {
    id: 'io_if_fields', name: 'Crop Fields', zone: Zone.IndFarm, levels: [1, 4], variants: 10, mesh: IF.cropField, height: 0.6, icon: '🌾',
    description: 'Striped rows of space-wheat and moon-beans, a red barn, a silo and a pivot sprinkler that never stops turning.',
    flavor: 'Organic, free-range, low-gravity. The corn grows sideways if you let it.',
    effects: { jobs: 10, power: -1, water: -4, pollution: 6, noise: 6 },
  },
  {
    id: 'io_if_greenhouse', name: 'Greenhouse Range', zone: Zone.IndFarm, levels: [1, 5], variants: 10, mesh: IF.greenhouses, height: 0.8, icon: '🍅',
    description: 'Rows of glasshouses that merge into one great glass vault with a heat store and its own little boiler stack.',
    flavor: 'Tomatoes so red they have their own gravitational pull.',
    effects: { jobs: 14, power: -3, water: -3, pollution: 4, noise: 4 },
  },
  {
    id: 'io_if_homestead', name: 'Homestead Barn', zone: Zone.IndFarm, levels: [1, 3], variants: 10, mesh: IF.homestead, height: 0.7, icon: '🐄',
    description: 'A big barn, a row of feed silos and a paddock of contented low-g cattle.',
    flavor: 'The cows jump over the moon here. Literally. The fences are tall.',
    effects: { jobs: 8, power: -1, water: -2, pollution: 10, noise: 10 },
  },
  {
    id: 'io_if_algae', name: 'Algae Vats', zone: Zone.IndFarm, levels: [2, 5], variants: 8, mesh: IF.algaeVats, height: 0.6, icon: '🦠',
    description: 'Open spirulina ponds and snaking photobioreactor tubes that glow green after dark.',
    flavor: 'Tastes like the sea, if the sea were a smoothie with ambitions.',
    effects: { jobs: 14, power: -3, water: -6, pollution: 3, noise: 5 },
  },
  {
    id: 'io_if_spire', name: 'Hydroponic Spire', zone: Zone.IndFarm, levels: [3, 5], variants: 8, mesh: IF.hydroSpire, height: 3.4, icon: '🥬',
    description: 'A glass tower of stacked grow-floors wrapped in planted ledges, crowned in the local style.',
    flavor: 'Thirteen floors of lettuce. The penthouse is a single, perfect radish.',
    effects: { jobs: 22, power: -4.5, water: -3, pollution: 2, noise: 3, landValue: 2 },
    tags: ['vertical'],
  },
  {
    id: 'io_if_vertical', name: 'Vertical Farm', zone: Zone.IndFarm, levels: [2, 5], variants: 8, mesh: IF.verticalFarm, height: 2.6, icon: '🪴',
    description: 'Terraced grow-blocks lit by magenta LED ribbons, planted roofs on every step and a rooftop turbine.',
    flavor: 'Pink light, green leaves, zero weeds. The weeds were not invited.',
    effects: { jobs: 18, power: -4, water: -3, pollution: 3, noise: 4 },
    tags: ['vertical'],
  },
  {
    id: 'io_if_livestock', name: 'Livestock Domes', zone: Zone.IndFarm, levels: [1, 4], variants: 8, mesh: IF.livestock, height: 0.7, icon: '🐑',
    description: 'Pressurised pasture domes with a feed silo, a barn and a herd that wanders the yard.',
    flavor: 'Each dome has its own weather. The sheep have opinions about it.',
    effects: { jobs: 11, power: -2, water: -3, pollution: 18, noise: 12 },
  },
  {
    id: 'io_if_orchard', name: 'Bio-Orchard', zone: Zone.IndFarm, levels: [1, 3], variants: 8, mesh: IF.orchard, height: 0.6, icon: '🍎',
    description: 'Neat rows of fruit trees (or whatever counts as a tree in this style), a packing shed and a picking drone.',
    flavor: 'An apple a day keeps the space medic away. Two keeps the space dentist busy.',
    effects: { jobs: 9, power: -0.5, water: -2.5, noise: 2, landValue: 3, happiness: 1 },
  },
];

// ═══════════════════════════════════════════════════════════════ IM · mining

const MINING: Grow[] = [
  {
    id: 'io_im_quarry', name: 'Open-Pit Quarry', zone: Zone.IndMining, levels: [1, 4], variants: 8, mesh: IM.quarry, height: 0.6, icon: '⛏️',
    description: 'A terraced pit worked by an excavator and haul trucks, with a conveyor lifting ore to a roadside stockpile.',
    flavor: 'We dig a hole, then we dig a slightly bigger hole. Business is booming. Mostly from the blasting.',
    effects: { jobs: 16, power: -4, water: -1.5, pollution: 50, noise: 45 },
    tags: ['heavy'],
  },
  {
    id: 'io_im_crusher', name: 'Ore Crusher', zone: Zone.IndMining, levels: [1, 5], variants: 8, mesh: IM.crusher, height: 1.2, icon: '🪨',
    description: 'A rattling crushing house with a feed hopper and conveyor galleries feeding coarse and fine stockpiles.',
    flavor: 'Turns big rocks into small rocks at a very reasonable price.',
    effects: { jobs: 20, power: -6, water: -2, pollution: 55, noise: 50 },
    tags: ['heavy'],
  },
  {
    id: 'io_im_headframe', name: 'Mine Headframe', zone: Zone.IndMining, levels: [1, 5], variants: 8, mesh: IM.headframe, height: 1.9, icon: '🏗️',
    description: 'A lattice headframe over a deep shaft, sheave wheels spinning, hoist ropes running to the winding house.',
    flavor: 'Elevator to the planet\'s basement. Mind the magma.',
    effects: { jobs: 22, power: -5, water: -2, pollution: 40, noise: 35 },
    tags: ['heavy'],
  },
  {
    id: 'io_im_drill', name: 'Deep-Core Drill Rig', zone: Zone.IndMining, levels: [2, 5], variants: 8, mesh: IM.drillRig, height: 2.2, icon: '🛢️',
    description: 'A derrick that grows taller every level until it bores with plasma, energy rings climbing its lattice.',
    flavor: 'Currently 40 km down. Has found two fossils, one mantle and a very surprised worm.',
    effects: { jobs: 18, power: -6, water: -3, pollution: 45, noise: 40 },
    tags: ['heavy'],
  },
  {
    id: 'io_im_slag', name: 'Slag Heaps', zone: Zone.IndMining, levels: [1, 4], variants: 8, mesh: IM.slagHeaps, height: 0.8, icon: '🌋',
    description: 'Smouldering slag mountains fed by a ladle car, with a molten pour that glows day and night.',
    flavor: 'Technically a mountain range. The tourism board is working on it.',
    effects: { jobs: 12, power: -4, water: -1, pollution: 60, noise: 30, landValue: -6 },
    tags: ['heavy'],
  },
  {
    id: 'io_im_refinery', name: 'Ore Refinery', zone: Zone.IndMining, levels: [2, 5], variants: 8, mesh: IM.refinery, height: 1.7, icon: '⚗️',
    description: 'Leach columns, pipe racks and a burning flare stack turning raw ore into ingots of every element.',
    flavor: 'Refines ore, metal and, on a good day, the manners of the night shift.',
    effects: { jobs: 26, power: -8, water: -4, pollution: 58, noise: 32 },
    tags: ['heavy'],
  },
];

// ═══════════════════════════════════════════════════════════════ IT · high-tech industry

const TECH: Grow[] = [
  {
    id: 'io_it_fab', name: 'Clean Fab', zone: Zone.IndTech, levels: [1, 5], variants: 10, mesh: IT.cleanFab, height: 1.4, icon: '💾',
    description: 'A spotless cleanroom under a carpet of exhaust fans, fed by bulk-gas tanks. Makes the chips that make everything else.',
    flavor: 'Cleaner than an operating theatre. The staff hug-test their bunny suits daily.',
    effects: { jobs: 30, power: -7, water: -5, pollution: 6, noise: 10, research: 2 },
  },
  {
    id: 'io_it_robotics', name: 'Robotics Plant', zone: Zone.IndTech, levels: [1, 4], variants: 10, mesh: IT.roboticsPlant, height: 1.2, icon: '🤖',
    description: 'Robots building robots: an assembly hall, a test cage with a walking mech and giant arms showing off on the forecourt.',
    flavor: 'Unionised in 2291. Demands include oil, dignity and slightly longer charging cables.',
    effects: { jobs: 26, power: -6, water: -1.5, pollution: 8, noise: 14 },
  },
  {
    id: 'io_it_nanoforge', name: 'Nano-Forge', zone: Zone.IndTech, levels: [3, 5], variants: 8, mesh: IT.nanoForge, height: 1.6, icon: '⚛️',
    description: 'A containment vessel ringed in light, a molten core under a glass cupola and twin process halls on glowing conduits.',
    flavor: 'Assembles matter one atom at a time. Please do not sneeze near the intake.',
    effects: { jobs: 40, power: -10, water: -3, pollution: 10, noise: 12, research: 4 },
  },
  {
    id: 'io_it_server', name: 'Server Farm', zone: Zone.IndTech, levels: [1, 5], variants: 10, mesh: IT.serverFarm, height: 1.0, icon: '🖥️',
    description: 'Rows of data halls striped with blinking rack lights, fans on every roof, coolers, generators and a dish to the stars.',
    flavor: 'Stores 40 zettabytes, 39 of which are cat holograms.',
    effects: { jobs: 16, power: -12, water: -4, pollution: 3, noise: 16 },
  },
  {
    id: 'io_it_drones', name: 'Drone Logistics Hub', zone: Zone.IndTech, levels: [2, 5], variants: 8, mesh: IT.droneHub, height: 2.2, icon: '🛸',
    description: 'A parcel depot with landing pads on the roof, a control tower and, at the top levels, a drone tree buzzing like a hive.',
    flavor: 'Delivers anywhere in eleven minutes. Delivers the right thing in twelve.',
    effects: { jobs: 34, power: -6, water: -1, pollution: 4, noise: 20 },
  },
  {
    id: 'io_it_quantum', name: 'Quantum Lab', zone: Zone.IndTech, levels: [3, 5], variants: 8, mesh: IT.quantumLab, height: 1.3, icon: '🧪',
    description: 'A glowing collider ring around a lab and a cryostat crowned with a golden chandelier and a humming qubit core.',
    flavor: 'Simultaneously open and closed until somebody checks the opening hours.',
    effects: { jobs: 30, power: -9, water: -2, pollution: 1, noise: 4, research: 8 },
    tags: ['research'],
  },
  {
    id: 'io_it_biotech', name: 'Biotech Campus', zone: Zone.IndTech, levels: [2, 5], variants: 8, mesh: IT.biotechCampus, height: 1.4, icon: '🧬',
    description: 'Lab wings around a greenhouse atrium, bioreactor vats and a twisting DNA sculpture lit from within.',
    flavor: 'Engineered a tomato that tells jokes. They are mostly about ketchup.',
    effects: { jobs: 38, power: -5, water: -4, pollution: 3, noise: 4, research: 5, landValue: 3 },
    tags: ['research'],
  },
];

// ═══════════════════════════════════════════════════════════════ O · offices

const OFFICE: Grow[] = [
  {
    id: 'io_of_corner', name: 'Corner Office', zone: Zone.Office, levels: [1, 2], variants: 10, mesh: O.cornerOffice, height: 1.6, icon: '🏢',
    description: 'A neat walk-up office with a canopy entrance, a lit nameplate and a car park out front.',
    flavor: 'Three accountants, two lawyers and one very confident consultant.',
    effects: { jobs: 26, power: -2.5, water: -1 },
  },
  {
    id: 'io_of_park', name: 'Business Park', zone: Zone.Office, levels: [1, 3], variants: 8, mesh: O.businessPark, height: 1.2, icon: '🏞️',
    description: 'Two office pavilions linked by a glass bridge, set on a lawn with a pond, trees and plenty of parking.',
    flavor: 'Synergy grows on trees here. The ducks are on retainer.',
    effects: { jobs: 34, power: -3, water: -1.5, landValue: 3 },
  },
  {
    id: 'io_of_loft', name: 'Startup Lofts', zone: Zone.Office, levels: [1, 3], variants: 8, mesh: O.startupLofts, height: 1.3, icon: '🚀',
    description: 'An old warehouse turned co-working hub: neon name, a glass box bolted on the side, a roof deck and a food truck.',
    flavor: 'Disrupting the disruption industry. Series Q funding secured.',
    effects: { jobs: 30, power: -2.5, water: -1, landValue: 2 },
  },
  {
    id: 'io_of_glass', name: 'Glass Office Tower', zone: Zone.Office, levels: [2, 5], variants: 10, mesh: O.glassTower, height: 7.4, icon: '🏙️',
    description: 'A curtain-wall tower on a lobby podium that climbs from a dozen floors to a crowned, helipadded or spired high-rise.',
    flavor: 'Floor-to-ceiling windows, so everyone can see you pretending to work.',
    effects: { jobs: 90, power: -8, water: -3 },
  },
  {
    id: 'io_of_hq', name: 'Corporate HQ', zone: Zone.Office, levels: [3, 5], variants: 8, mesh: O.corporateHQ, height: 8.0, icon: '💼',
    description: 'A setback tower with a giant logo near the top, a ceremonial plaza, a fountain and a row of company flags.',
    flavor: 'Mission statement: "Yes." Vision statement: "Also yes, but bigger."',
    effects: { jobs: 110, power: -9.5, water: -3.5, landValue: 6 },
  },
  {
    id: 'io_of_twin', name: 'Twin Exchange Towers', zone: Zone.Office, levels: [3, 5], variants: 8, mesh: O.twinTowers, height: 6.6, icon: '🗼',
    description: 'Two slender towers on a shared podium, linked by a glowing sky bridge; one wears a crown, the other a helipad.',
    flavor: 'The east tower buys, the west tower sells. The bridge is where they argue.',
    effects: { jobs: 120, power: -10, water: -4, landValue: 5 },
  },
  {
    id: 'io_of_media', name: 'Media Tower', zone: Zone.Office, levels: [2, 5], variants: 8, mesh: O.mediaTower, height: 6.4, icon: '📺',
    description: 'A broadcaster\'s tower wrapped in animated screens and topped by a lattice transmission mast.',
    flavor: 'Broadcasting 900 channels. 899 are about the weather on other planets.',
    effects: { jobs: 80, power: -9, water: -3, noise: 6, landValue: 2 },
  },
  {
    id: 'io_of_helix', name: 'Helix Tower', zone: Zone.Office, levels: [4, 5], variants: 6, mesh: O.helixTower, height: 7.4, icon: '🌀',
    description: 'A tower that turns as it rises, floor plates twisting a full quarter-turn on the way to its crown.',
    flavor: 'Architect\'s brief: "like a regular tower, but it heard some music."',
    effects: { jobs: 140, power: -12, water: -4, landValue: 8, tourism: 2 },
    tags: ['skyline'],
  },
  {
    id: 'io_of_mega', name: 'Megatower', zone: Zone.Office, levels: [4, 5], variants: 6, mesh: O.megatower, height: 11, icon: '🌆',
    description: 'A supertall in three setbacks with sky gardens, a cantilevered helipad, aviation lights and a spire that scrapes the clouds.',
    flavor: 'Has its own postcode, weather system and a lift that takes a lunch break halfway.',
    effects: { jobs: 180, power: -15, water: -5, landValue: 10, tourism: 3 },
    tags: ['skyline'],
  },
];

registerItems([...GENERAL, ...FARM, ...MINING, ...TECH, ...OFFICE].map(grow));
