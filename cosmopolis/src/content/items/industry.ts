/**
 * OWNER: agent utilities
 * Ploppable resource extractors & special industry (category 'industry').
 *
 *   Extraction · ore mine (Ore) · lumber mill (woodland) · glacier ice harvester (arctic / tundra) · gas extractor
 *                (GasVent) · geothermal heat tap (GeoVent)
 *   Exotic Resources · crystal resonator (CrystalDeposit) · lava forge (volcanic) · deep-sea drill (on water)
 *                · helium-3 regolith miner (barren) · spore harvester (fungal) · ruins excavation (Ruins)
 *   Heavy Industry · refinery · foundry · vertical farm · nanofabricator · shipyard (coastal)
 *
 * Effects follow the catalog balance guide: jobs + direct monthly income, with pollution / noise for the dirty
 * ones. Feature-locked extractors must be centred on their deposit (requires.feature checks the anchor tile);
 * planet-type extractors give every world its own economy. Meshes: content/meshes/utilities/industry.ts.
 * Tags: 'industry', 'extractor', 'harbor' (shipyard), 'ruins', 'research'.
 */
import { registerItems, type ItemDef } from '../catalog';
import { Feature } from '../../core/types';
import * as I from '../meshes/utilities/industry';

type Def = Omit<ItemDef, 'placement' | 'styleable' | 'upkeep' | 'category'> & { placement?: ItemDef['placement']; upkeep?: number };

/** Industry defaults: surface placement, styleable, upkeep ≈ 3 % of cost (they earn their keep). */
function ind(d: Def): ItemDef {
  return { category: 'industry', placement: 'surface', styleable: true, upkeep: Math.round((d.cost * 0.03) / 10) * 10, ...d };
}

const INDUSTRY: ItemDef[] = [
  // ── extraction
  ind({
    id: 'ind.oremine', name: 'Ore Mine', group: 'Extraction', icon: '⛏️', footprint: 7, cost: 7_000, tier: 0,
    description: 'Headframe, open pit and crusher over a metal ore deposit. Must be centred on an ore deposit.',
    flavor: 'Dig deep, think shallow, sell high.',
    requires: { feature: [Feature.Ore] }, effects: { jobs: 60, income: 1_100, pollution: 35, noise: 30, power: -8, radius: 5 }, mesh: I.oreMine, height: 1.9, tags: ['industry', 'extractor', 'ore', 'mining'],
  }),
  ind({
    id: 'ind.lumber', name: 'Lumber Mill', group: 'Extraction', icon: '🪵', footprint: 7, cost: 6_000, tier: 0,
    description: 'Log decks, a sawmill and a crane, built in the woods. Must be centred on a woodland tile.',
    flavor: 'Replants two trees for every one it cuts. The trees remain suspicious.',
    planetTypes: ['terran', 'jungle', 'tundra', 'arctic', 'ocean'], requires: { feature: [Feature.Trees, Feature.DenseTrees] },
    effects: { jobs: 40, income: 800, noise: 20, pollution: 8, radius: 4 }, mesh: I.lumberMill, height: 1.2, tags: ['industry', 'extractor', 'timber'],
  }),
  ind({
    id: 'ind.iceharvest', name: 'Glacier Ice Harvester', group: 'Extraction', icon: '🧊', footprint: 7, cost: 9_000, tier: 1,
    description: 'Arctic and tundra worlds: gantry saws cut the glacier into gleaming blocks for export — and a little for the taps.',
    flavor: 'Premium glacier ice. Your cocktails have never been this geologically significant.',
    planetTypes: ['arctic', 'tundra'], effects: { jobs: 50, income: 1_200, water: 40, noise: 20, radius: 4 }, mesh: I.glacierHarvester, height: 1.1, tags: ['industry', 'extractor', 'ice', 'water'],
  }),
  ind({
    id: 'ind.gas', name: 'Gas Extractor', group: 'Extraction', icon: '🔥', footprint: 1, cost: 9_000, tier: 1,
    description: 'A wellhead, gas spheres and a roaring flare over an exotic gas vent. Must be built on a gas vent.',
    flavor: 'Smells like money. Also like eggs.',
    requires: { feature: [Feature.GasVent] }, effects: { jobs: 25, income: 1_600, power: 10, pollution: 30, noise: 20, radius: 4 }, mesh: I.gasExtractor, height: 1.6, tags: ['industry', 'extractor', 'gas', 'smoke'],
  }),
  ind({
    id: 'ind.heattap', name: 'Geothermal Heat Tap', group: 'Extraction', icon: '♨️', footprint: 1, cost: 6_000, tier: 1,
    description: 'Caps a geothermal vent with a finned copper dome and pipes its heat to industry and greenhouses. Must sit on a vent.',
    flavor: 'Free heating, courtesy of the planet’s molten heart.',
    requires: { feature: [Feature.GeoVent] }, effects: { jobs: 15, income: 700, power: 15, radius: 2 }, mesh: I.heatTap, height: 0.95, tags: ['industry', 'extractor', 'geothermal', 'steam'],
  }),
  // ── exotic resources
  ind({
    id: 'ind.crystal', name: 'Crystal Resonator', group: 'Exotic Resources', icon: '💎', footprint: 1, cost: 12_000, tier: 2,
    description: 'Tunes a crystal deposit until it sings, then sells the song. Must be built on a crystal deposit.',
    flavor: 'Hums in perfect B-flat. The neighbours have learned to harmonise.',
    requires: { feature: [Feature.CrystalDeposit] }, effects: { jobs: 20, income: 2_200, research: 12, tourism: 15, power: -4, radius: 2 }, mesh: I.crystalResonator, height: 1.15, tags: ['industry', 'extractor', 'crystal', 'research', 'glow'],
  }),
  ind({
    id: 'ind.lavaforge', name: 'Lava Forge', group: 'Exotic Resources', icon: '🌋', footprint: 7, cost: 26_000, tier: 2,
    description: 'Volcanic worlds only: channels living lava straight into the crucibles. No fuel bill, ever.',
    flavor: 'Why build a furnace when the planet already is one?',
    planetTypes: ['volcanic'], effects: { jobs: 120, income: 3_400, pollution: 40, noise: 30, radius: 5 }, mesh: I.lavaForge, height: 2.4, tags: ['industry', 'lava', 'forge', 'smoke', 'glow'],
  }),
  ind({
    id: 'ind.seadrill', name: 'Deep-Sea Drill', group: 'Exotic Resources', icon: '🛢️', footprint: 7, placement: 'water', cost: 28_000, tier: 2,
    description: 'A jack-up rig standing on lattice legs over the seabed, drilling for oil, gas and the occasional sea monster.',
    flavor: 'The helipad doubles as the only flat surface for three hundred kilometres.',
    effects: { jobs: 80, income: 3_000, pollution: 25, noise: 25, radius: 5 }, mesh: I.seaDrill, height: 3.6, tags: ['industry', 'extractor', 'offshore', 'oil', 'harbor'],
  }),
  ind({
    id: 'ind.he3', name: 'Helium-3 Regolith Miner', group: 'Exotic Resources', icon: '🌑', footprint: 7, cost: 40_000, tier: 3,
    description: 'Barren worlds only: a bucket-wheel crawler strips solar-wind-soaked regolith for fusion fuel.',
    flavor: 'The moon dust that keeps every fusion reactor in the sector purring.',
    planetTypes: ['barren'], effects: { jobs: 70, income: 4_500, power: 40, noise: 25, radius: 4 }, mesh: I.he3Miner, height: 1.1, tags: ['industry', 'extractor', 'helium3', 'fuel'],
  }),
  ind({
    id: 'ind.spore', name: 'Spore Harvester', group: 'Exotic Resources', icon: '🍄', footprint: 7, cost: 20_000, tier: 2,
    description: 'Fungal worlds only: cultivation domes and funnelled towers gather luminous spores prized by medicine and perfumers.',
    flavor: 'Side effects of exposure include seeing sounds and hearing colours. Mildly.',
    planetTypes: ['fungal'], effects: { jobs: 60, income: 2_400, research: 8, tourism: 15, radius: 4 }, mesh: I.sporeHarvester, height: 1.8, tags: ['industry', 'extractor', 'bio', 'glow'],
  }),
  ind({
    id: 'ind.ruins', name: 'Ruins Excavation', group: 'Exotic Resources', icon: '🏺', footprint: 7, cost: 8_000, tier: 1,
    description: 'Archaeologists sift an ancient alien site while tourists queue at the visitor pavilion. Must be centred on ruins.',
    flavor: 'The glyphs translate roughly to “Please do not touch the exhibits.”',
    requires: { feature: [Feature.Ruins] }, effects: { jobs: 25, research: 30, tourism: 90, income: 300, happiness: 2, radius: 4 }, mesh: I.ruinsDig, height: 1.0, tags: ['industry', 'ruins', 'research', 'tourism'],
  }),
  // ── heavy industry
  ind({
    id: 'ind.refinery', name: 'Refinery', group: 'Heavy Industry', icon: '🏭', footprint: 7, cost: 18_000, tier: 1,
    description: 'Distillation columns, a tank farm and a flare stack turning crude into everything from fuel to plastic forks.',
    flavor: 'At night it looks like a city. During the day it smells like one too.',
    effects: { jobs: 90, income: 2_200, pollution: 50, noise: 25, power: -15, radius: 6 }, mesh: I.refinery, height: 2.7, tags: ['industry', 'refinery', 'smoke'],
  }),
  ind({
    id: 'ind.foundry', name: 'Foundry', group: 'Heavy Industry', icon: '🔩', footprint: 7, cost: 24_000, tier: 2,
    description: 'A blast furnace, hot-blast stoves and a casting hall glowing with molten steel. The backbone of every skyline.',
    flavor: 'Every skyscraper in the city started its life here, at 1 500 °C.',
    effects: { jobs: 120, income: 2_800, pollution: 55, noise: 35, power: -25, radius: 6 }, mesh: I.foundry, height: 2.6, tags: ['industry', 'steel', 'smoke'],
  }),
  ind({
    id: 'ind.vertfarm', name: 'Vertical Farm', group: 'Heavy Industry', icon: '🥬', footprint: 1, cost: 14_000, tier: 2,
    description: 'Seven glass floors of hydroponic greens under pink grow-lights. Feeds a neighbourhood from one lot.',
    flavor: 'Lettuce with a penthouse view.',
    effects: { jobs: 30, income: 900, oxygen: 20, happiness: 1, power: -6, water: -15, radius: 2 }, mesh: I.verticalFarm, height: 1.8, tags: ['industry', 'farm', 'green'],
  }),
  ind({
    id: 'ind.fabricator', name: 'Nanofabricator', group: 'Heavy Industry', icon: '🤖', footprint: 7, cost: 60_000, tier: 4,
    description: 'Robot arms and nanite vats assemble anything from spoons to starship parts in a spotless clean room.',
    flavor: 'Prints its own replacement parts. And, lately, small hats.',
    effects: { jobs: 140, income: 5_500, research: 15, pollution: 4, power: -40, radius: 4 }, mesh: I.nanofabricator, height: 1.4, tags: ['industry', 'hightech', 'glow'],
  }),
  ind({
    id: 'ind.shipyard', name: 'Shipyard', group: 'Heavy Industry', icon: '🚢', footprint: 7, cost: 45_000, tier: 3,
    description: 'A dry dock, a goliath crane and fabrication sheds building ships for the colony’s seas. Must be on the coast.',
    flavor: 'Every hull is christened with a bottle of the finest local fizzy water.',
    requires: { coastal: true }, effects: { jobs: 160, income: 4_800, noise: 30, pollution: 15, power: -20, radius: 5 }, mesh: I.shipyard, height: 1.9, tags: ['industry', 'harbor', 'shipyard', 'coastal'],
  }),
];

registerItems(INDUSTRY);
