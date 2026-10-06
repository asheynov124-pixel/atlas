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

registerItems([...GENERAL].map(grow));
