/**
 * OWNER: agent utilities
 * Power, water, oxygen, waste and data buildings (categories 'power' and 'water').
 *
 *   Power  · Renewables: wind turbine, solar farm, offshore wind, tidal barrage, solar power tower, myco-electric grove
 *          · Thermal: combustion plant, geothermal plant (on a GeoVent), planetary core tap (machine worlds)
 *          · Storage: battery bank   · Nuclear & Fusion: fission plant, fusion tokamak
 *          · Exotic: orbital solar receiver, antimatter reactor, zero-point tap, Dyson beam receiver
 *   Water  · Water: pump, tower, desalination, treatment, ice miner (IceDeposit), atmospheric harvester
 *          · Air: oxygen generator, toxin scrubber (toxic/volcanic), algae bioreactor, hydroponic O₂ garden,
 *            atmosphere processor   · Sanitation: landfill, recycling centre, incinerator, matter recycler
 *          · Data & Comms: comms tower, data centre, satellite uplink, quantum relay
 *
 * Numbers follow the balance guide in catalog.ts (power: wind +12 · solar +20 · combustion +80 · fission +300 ·
 * fusion +900 · antimatter +3 000; upkeep ≈ 3–5 % of cost per month). Water is sized against the sim's growables
 * (≈ 0.85 kL per MW of demand), oxygen at 0.06 per resident, garbage ≈ 0.15 t per resident per month.
 * Meshes: content/meshes/utilities/{power,water}.ts. All defs are styleable (district style re-skins the halls).
 * Tags used by other modules: 'power', 'water', 'oxygen', 'garbage', 'data', 'nuclear', 'smoke', 'renewable'.
 */
import { registerItems, type ItemDef } from '../catalog';
import { Feature, type PlanetTypeId } from '../../core/types';
import * as P from '../meshes/utilities/power';
import * as W from '../meshes/utilities/water';

/** Every planet type except airless ones (wind and fog need an atmosphere). */
const WITH_AIR: PlanetTypeId[] = ['terran', 'desert', 'arctic', 'volcanic', 'ocean', 'jungle', 'toxic', 'crystal', 'fungal', 'tundra', 'machine'];

type Def = Omit<ItemDef, 'placement' | 'styleable' | 'upkeep'> & { placement?: ItemDef['placement']; upkeep?: number };

/** Utility defaults: surface placement, styleable, upkeep ≈ 4 % of cost. */
function util(d: Def): ItemDef {
  return { placement: 'surface', styleable: true, upkeep: Math.round((d.cost * 0.04) / 10) * 10, ...d };
}

// ═══════════════════════════════════════════════════════════════ power

const POWER: ItemDef[] = [
  // ── renewables
  util({
    id: 'power.wind', name: 'Wind Turbine', category: 'power', group: 'Renewables', icon: '🌬️', footprint: 1, cost: 4_000, upkeep: 140, tier: 0,
    description: 'A three-bladed turbine on a slender tower. Clean, cheap power that loves open plains and hilltops. Not for airless worlds.',
    flavor: 'Powered entirely by the complaints of people who hate the view.',
    effects: { power: 12, jobs: 2, noise: 14, radius: 2 }, planetTypes: WITH_AIR, variants: 3, mesh: P.windTurbine, height: 3.6, tags: ['power', 'renewable', 'wind'],
  }),
  util({
    id: 'power.solar', name: 'Solar Farm', category: 'power', group: 'Renewables', icon: '☀️', footprint: 7, cost: 9_000, upkeep: 260, tier: 0,
    description: 'Fields of tilted panels drinking in starlight. Silent, spotless and maintenance-light — just keep the tumbleweeds off.',
    flavor: 'Officially the largest sunbathing club in the colony.',
    effects: { power: 20, jobs: 6, landValue: -2, radius: 3 }, mesh: P.solarFarm, height: 0.45, tags: ['power', 'renewable', 'solar'],
  }),
  util({
    id: 'power.offshore', name: 'Offshore Wind Turbine', category: 'power', group: 'Renewables', icon: '🌊', footprint: 1, placement: 'water', cost: 9_000, upkeep: 320, tier: 2,
    description: 'A bigger turbine on a monopile out at sea, where the wind never stops and nobody can see it from their balcony.',
    flavor: 'The seagulls have formed a union and are demanding hazard pay.',
    effects: { power: 20, jobs: 3, noise: 4, radius: 1 }, planetTypes: WITH_AIR, variants: 3, mesh: P.offshoreWind, height: 4.2, tags: ['power', 'renewable', 'wind', 'offshore'],
  }),
  util({
    id: 'power.tidal', name: 'Tidal Barrage', category: 'power', group: 'Renewables', icon: '🌊', footprint: 7, cost: 22_000, upkeep: 760, tier: 2,
    description: 'Bulb turbines in a barrage harvest the tide twice a day, every day. Must be built on the coast.',
    flavor: 'Technically powered by the moon, which makes this a lunar colony.',
    requires: { coastal: true }, effects: { power: 55, jobs: 25, noise: 8, radius: 3 }, mesh: P.tidalBarrage, height: 1.1, tags: ['power', 'renewable', 'tidal', 'harbor'],
  }),
  util({
    id: 'power.solartower', name: 'Solar Power Tower', category: 'power', group: 'Renewables', icon: '🔆', footprint: 19, cost: 34_000, upkeep: 1_150, tier: 2,
    description: 'Rings of heliostat mirrors focus sunlight onto a molten-salt receiver that keeps the turbines spinning long after dusk.',
    flavor: 'Please do not look directly at the infrastructure.',
    effects: { power: 110, jobs: 40, landValue: -4, radius: 4 }, mesh: P.solarTower, height: 4.7, tags: ['power', 'renewable', 'solar'],
  }),
  util({
    id: 'power.mycogrove', name: 'Myco-Electric Grove', category: 'power', group: 'Renewables', icon: '🍄', footprint: 7, cost: 18_000, upkeep: 560, tier: 2,
    description: 'Fungal worlds only: giant bioluminescent mushrooms whose mycelium web hums with a gentle, emission-free current.',
    flavor: 'Each cap produces three watts and one deeply relaxed vibe.',
    planetTypes: ['fungal'], effects: { power: 75, jobs: 15, happiness: 3, tourism: 15, landValue: 4, radius: 4 }, mesh: P.mycoGrove, height: 1.9, tags: ['power', 'renewable', 'bio', 'glow'],
  }),
  // ── thermal
  util({
    id: 'power.combustion', name: 'Combustion Power Plant', category: 'power', group: 'Thermal', icon: '🏭', footprint: 7, cost: 8_000, upkeep: 380, tier: 0,
    description: 'Burns coal, biomass or old tax forms for cheap, plentiful power. Heavy smoke: keep it far downwind of homes.',
    flavor: 'Retro energy. The 19th century called — it wants its smog back.',
    effects: { power: 80, jobs: 60, pollution: 70, noise: 30, landValue: -12, radius: 6 }, mesh: P.combustionPlant, height: 3.9, tags: ['power', 'smoke', 'fossil'],
  }),
  util({
    id: 'power.geothermal', name: 'Geothermal Plant', category: 'power', group: 'Thermal', icon: '♨️', footprint: 7, cost: 15_000, upkeep: 520, tier: 1,
    description: 'Taps superheated steam from a geothermal vent for steady, clean power. Must be centred on a geothermal vent.',
    flavor: 'The planet is basically a kettle. We just plugged it in.',
    requires: { feature: [Feature.GeoVent] }, effects: { power: 70, jobs: 30, pollution: 6, noise: 12, radius: 4 }, mesh: P.geothermalPlant, height: 1.2, tags: ['power', 'renewable', 'geothermal', 'steam'],
  }),
  util({
    id: 'power.coretap', name: 'Planetary Core Tap', category: 'power', group: 'Thermal', icon: '⚙️', footprint: 7, cost: 38_000, upkeep: 1_400, tier: 3,
    description: 'Machine worlds only: a shaft bored straight down into the planet’s humming core, ringed by converter blocks.',
    flavor: 'The planet said “ouch”. In binary.',
    planetTypes: ['machine'], effects: { power: 380, jobs: 80, noise: 25, radius: 4 }, mesh: P.coreTap, height: 2.4, tags: ['power', 'core', 'glow'],
  }),
  // ── storage
  util({
    id: 'power.battery', name: 'Battery Bank', category: 'power', group: 'Storage', icon: '🔋', footprint: 1, cost: 6_000, upkeep: 180, tier: 1,
    description: 'Liquid-cooled cells soak up surplus power and release it at peak hours, steadying the whole grid.',
    flavor: 'The world’s most expensive pack of AA batteries.',
    effects: { power: 10, jobs: 2, noise: 3, radius: 1 }, mesh: P.batteryBank, height: 0.4, tags: ['power', 'storage', 'battery'],
  }),
  // ── nuclear & fusion
  util({
    id: 'power.fission', name: 'Fission Plant', category: 'power', group: 'Nuclear & Fusion', icon: '☢️', footprint: 19, cost: 40_000, upkeep: 1_800, tier: 3,
    description: 'A domed reactor, twin cooling towers and a turbine hall: enormous, steady output with almost no smoke.',
    flavor: 'Safe, clean and only slightly glowing. Please stop asking about the three-eyed fish.',
    effects: { power: 300, jobs: 120, pollution: 10, noise: 20, landValue: -12, radius: 8 }, mesh: P.fissionPlant, height: 3.6, tags: ['power', 'nuclear', 'radiation', 'steam'],
  }),
  util({
    id: 'power.fusion', name: 'Fusion Tokamak', category: 'power', group: 'Nuclear & Fusion', icon: '🌀', footprint: 7, cost: 95_000, upkeep: 3_400, tier: 4,
    description: 'A magnetic bottle holding a tiny star: a ring of violet plasma caged by field coils. Colossal, clean power.',
    flavor: 'Fusion was always thirty years away. Then, suddenly, it wasn’t.',
    effects: { power: 900, jobs: 160, noise: 10, landValue: -2, tourism: 20, radius: 4 }, mesh: P.fusionTokamak, height: 2.3, tags: ['power', 'fusion', 'plasma', 'glow'],
  }),
  // ── exotic
  util({
    id: 'power.receiver', name: 'Orbital Solar Receiver', category: 'power', group: 'Exotic', icon: '📡', footprint: 7, cost: 140_000, upkeep: 4_800, tier: 5,
    description: 'A rectenna field catching a microwave beam from solar collectors in orbit. The beam is visible from anywhere in the city.',
    flavor: 'Birds have learned to fly around it. Mostly.',
    effects: { power: 1_400, jobs: 40, landValue: -4, tourism: 25, radius: 4 }, mesh: P.orbitalReceiver, height: 10.3, tags: ['power', 'beam', 'orbital', 'glow'],
  }),
  util({
    id: 'power.antimatter', name: 'Antimatter Reactor', category: 'power', group: 'Exotic', icon: '⚛️', footprint: 7, cost: 280_000, upkeep: 9_200, tier: 6,
    description: 'Annihilates matter and antimatter inside a gimballed Penning trap. Unthinkable output; the neighbours are a little nervous.',
    flavor: 'Contains exactly one teaspoon of the opposite of everything. Do not stir.',
    effects: { power: 3_000, jobs: 120, noise: 15, happiness: -4, landValue: -8, radius: 6 }, mesh: P.antimatterReactor, height: 2.4, tags: ['power', 'antimatter', 'danger', 'glow'],
  }),
  util({
    id: 'power.zeropoint', name: 'Zero-Point Tap', category: 'power', group: 'Exotic', icon: '💠', footprint: 7, cost: 600_000, upkeep: 16_000, tier: 7,
    description: 'Draws energy out of the quantum vacuum through a levitating crystal heart. Silent, clean and faintly unsettling.',
    flavor: 'Free energy from nothing. Accounting is still trying to invoice the void.',
    effects: { power: 6_000, jobs: 30, happiness: 2, tourism: 40, landValue: 6, radius: 5 }, mesh: P.zeroPointTap, height: 3.0, tags: ['power', 'exotic', 'glow'],
  }),
  util({
    id: 'power.dyson', name: 'Dyson Beam Receiver', category: 'power', group: 'Exotic', icon: '🌞', footprint: 19, cost: 950_000, upkeep: 22_000, tier: 7, unique: true,
    description: 'A vast golden bowl catching a beam from the Dyson swarm around your star. One per planet — it outshines everything.',
    flavor: 'The sun now pays your electricity bill by direct deposit.',
    effects: { power: 12_000, jobs: 200, tourism: 150, landValue: 4, radius: 6 }, mesh: P.dysonReceiver, height: 26, tags: ['power', 'dyson', 'beam', 'megastructure', 'glow'],
  }),
];

registerItems(POWER);

// ═══════════════════════════════════════════════════════════════ water, air, sanitation, data

const garbage = (radius: number, capacity: number) => [{ service: 'garbage' as const, radius, strength: 0.8, capacity }];
const data = (radius: number, strength: number) => [{ service: 'data' as const, radius, strength }];

const WATER: ItemDef[] = [
  // ── water
  util({
    id: 'water.pump', name: 'Water Pump Station', category: 'water', group: 'Water', icon: '🚰', footprint: 1, cost: 3_500, upkeep: 140, tier: 0,
    description: 'Draws water from the sea or a lake through screened intakes and pushes it into the mains. Must be built on the shore.',
    flavor: 'Filtered twice, chlorinated once, judged by the fish forever.',
    requires: { coastal: true }, effects: { water: 90, power: -3, jobs: 4, noise: 6, radius: 2 }, mesh: W.pumpStation, height: 0.6, tags: ['water', 'pump', 'coastal'],
  }),
  util({
    id: 'water.tower', name: 'Water Tower', category: 'water', group: 'Water', icon: '💧', footprint: 1, cost: 2_800, upkeep: 110, tier: 0,
    description: 'Stores pumped groundwater up high so gravity does the work. Wears the city’s colours with pride.',
    flavor: 'Technically the city’s largest drink. Please do not add a straw.',
    effects: { water: 45, power: -1, jobs: 1, landValue: 1, radius: 2 }, mesh: W.waterTower, height: 1.9, tags: ['water', 'tower'],
  }),
  util({
    id: 'water.desal', name: 'Desalination Plant', category: 'water', group: 'Water', icon: '🧂', footprint: 7, cost: 16_000, upkeep: 640, tier: 1,
    description: 'Reverse-osmosis halls turn seawater into drinking water and the leftovers into very fancy salt. Coastal only.',
    flavor: 'The salt is sold to restaurants as “artisanal ocean flakes”.',
    requires: { coastal: true }, effects: { water: 320, power: -20, jobs: 30, noise: 10, radius: 3 }, mesh: W.desalination, height: 0.8, tags: ['water', 'coastal', 'desalination'],
  }),
  util({
    id: 'water.treatment', name: 'Water Treatment Works', category: 'water', group: 'Water', icon: '🧪', footprint: 7, cost: 13_000, upkeep: 520, tier: 1,
    description: 'Clarifiers, aeration lanes and filter beds recycle used water and scrub the surrounding ground clean.',
    flavor: 'What goes down must come back up. Sparkling, ideally.',
    effects: { water: 240, power: -10, jobs: 25, pollution: -12, radius: 6 }, mesh: W.treatmentPlant, height: 0.7, tags: ['water', 'treatment', 'clean'],
  }),
  util({
    id: 'water.iceminer', name: 'Ice Miner', category: 'water', group: 'Water', icon: '🧊', footprint: 1, cost: 7_000, upkeep: 280, tier: 1,
    description: 'Drills into a buried ice deposit and melts it into fresh water. Must be built on an ice deposit.',
    flavor: 'Ten-thousand-year-old ice, served at room temperature.',
    requires: { feature: [Feature.IceDeposit] }, effects: { water: 200, power: -6, jobs: 10, noise: 15, radius: 2 }, mesh: W.iceMiner, height: 1.25, tags: ['water', 'ice', 'mining'],
  }),
  util({
    id: 'water.harvester', name: 'Atmospheric Water Harvester', category: 'water', group: 'Water', icon: '🌫️', footprint: 1, cost: 7_500, upkeep: 300, tier: 2,
    description: 'Finned condenser towers and fog nets wring water straight out of the air. Works anywhere with an atmosphere.',
    flavor: 'Literally squeezing blood from a stone, but it’s fog, and the stone is the sky.',
    planetTypes: WITH_AIR, effects: { water: 70, power: -4, jobs: 2, radius: 1 }, mesh: W.atmoHarvester, height: 1.3, tags: ['water', 'air'],
  }),
  // ── air
  util({
    id: 'air.oxygen', name: 'Oxygen Generator', category: 'water', group: 'Air', icon: '🫧', footprint: 1, cost: 4_500, upkeep: 180, tier: 0,
    description: 'Splits water into oxygen and hydrogen. Essential on worlds whose air would rather you didn’t breathe it.',
    flavor: 'Smells faintly of “new planet”.',
    effects: { oxygen: 60, power: -8, water: -5, jobs: 4, radius: 1 }, mesh: W.oxygenGenerator, height: 1.0, tags: ['oxygen', 'air'],
  }),
  util({
    id: 'air.scrubber', name: 'Toxin Scrubber', category: 'water', group: 'Air', icon: '🍃', footprint: 1, cost: 6_500, upkeep: 260, tier: 1,
    description: 'Toxic and volcanic worlds: inhales acid fog, exhales breathable air and cleans the neighbourhood around it.',
    flavor: 'The filters are changed weekly. Nobody volunteers twice.',
    planetTypes: ['toxic', 'volcanic'], effects: { oxygen: 70, pollution: -18, power: -6, jobs: 3, radius: 6 }, mesh: W.toxinScrubber, height: 2.4, tags: ['oxygen', 'air', 'clean'],
  }),
  util({
    id: 'air.algae', name: 'Algae Bioreactor', category: 'water', group: 'Air', icon: '🦠', footprint: 7, cost: 13_000, upkeep: 520, tier: 1,
    description: 'Racks of bright-green photobioreactor tubes turn light and CO₂ into oxygen, scrubbing the air nearby.',
    flavor: 'The city’s greenest employees. Literally. They are algae.',
    effects: { oxygen: 260, pollution: -8, power: -6, water: -20, jobs: 20, radius: 5 }, mesh: W.algaeBioreactor, height: 0.9, tags: ['oxygen', 'air', 'bio'],
  }),
  util({
    id: 'air.hydroponic', name: 'Hydroponic O₂ Garden', category: 'water', group: 'Air', icon: '🌱', footprint: 7, cost: 17_000, upkeep: 600, tier: 2,
    description: 'Glass biodomes and planted terraces that breathe for the city — and double as its favourite picnic spot.',
    flavor: 'Officially an oxygen plant. Unofficially the best first-date venue in the colony.',
    effects: { oxygen: 220, happiness: 5, landValue: 8, tourism: 20, water: -25, jobs: 15, radius: 5 }, mesh: W.hydroponicGarden, height: 1.1, tags: ['oxygen', 'air', 'park', 'garden'],
  }),
  util({
    id: 'air.processor', name: 'Atmosphere Processor', category: 'water', group: 'Air', icon: '🌍', footprint: 7, cost: 85_000, upkeep: 3_000, tier: 4,
    description: 'A buttressed terraforming spire that breathes an entire region of sky into shape. Makes thin air thick and foul air sweet.',
    flavor: 'Step one: build a giant chimney. Step two: reverse it. Step three: planet.',
    effects: { oxygen: 2_200, pollution: -30, power: -60, jobs: 60, noise: 20, radius: 16 }, mesh: W.atmosphereProcessor, height: 6.2, tags: ['oxygen', 'air', 'terraform', 'clean'],
  }),
  // ── sanitation
  util({
    id: 'waste.landfill', name: 'Landfill', category: 'water', group: 'Sanitation', icon: '🗑️', footprint: 7, cost: 5_000, upkeep: 200, tier: 0,
    description: 'Terraced cells of compacted rubbish, capped with grass when full. Cheap, effective and fragrant.',
    flavor: 'Future archaeologists will learn a lot about our snacks.',
    effects: { garbage: 450, pollution: 35, landValue: -18, jobs: 15, radius: 5 }, coverage: garbage(14, 3_000), mesh: W.landfill, height: 1.0, tags: ['garbage', 'waste'],
  }),
  util({
    id: 'waste.recycling', name: 'Recycling Centre', category: 'water', group: 'Sanitation', icon: '♻️', footprint: 7, cost: 14_000, upkeep: 520, tier: 1,
    description: 'Sorts the city’s trash into tidy coloured bales and sells them back to industry. Far cleaner than a landfill.',
    flavor: 'Every can gets a second chance. Some get a fifth.',
    effects: { garbage: 700, pollution: 8, jobs: 35, income: 300, radius: 4 }, coverage: garbage(14, 5_000), mesh: W.recyclingCentre, height: 1.1, tags: ['garbage', 'waste', 'recycling'],
  }),
  util({
    id: 'waste.incinerator', name: 'Waste-to-Energy Plant', category: 'water', group: 'Sanitation', icon: '🔥', footprint: 7, cost: 20_000, upkeep: 760, tier: 2,
    description: 'Burns rubbish at scorching temperatures for power and heat — with a public ski slope on the roof.',
    flavor: 'Burns your trash, powers your toaster, and the black run is excellent.',
    effects: { garbage: 1_100, power: 25, pollution: 30, happiness: 2, tourism: 30, jobs: 40, radius: 5 }, coverage: garbage(16, 8_000), mesh: W.incinerator, height: 2.8, tags: ['garbage', 'waste', 'power', 'smoke'],
  }),
  util({
    id: 'waste.matter', name: 'Matter Recycler', category: 'water', group: 'Sanitation', icon: '✨', footprint: 7, cost: 120_000, upkeep: 4_200, tier: 5,
    description: 'Unmakes garbage atom by atom and returns it as neatly bottled elements. Leaves the air cleaner than it found it.',
    flavor: 'Yesterday’s banana peel is tomorrow’s carbon fibre. Probably.',
    effects: { garbage: 6_000, pollution: -10, power: -40, jobs: 40, radius: 5 }, coverage: garbage(30, 40_000), mesh: W.matterRecycler, height: 2.3, tags: ['garbage', 'waste', 'exotic', 'glow'],
  }),
  // ── data & comms
  util({
    id: 'data.comms', name: 'Comms Tower', category: 'water', group: 'Data & Comms', icon: '🗼', footprint: 1, cost: 3_000, upkeep: 120, tier: 0,
    description: 'A red-and-white lattice mast carrying the city’s radio, phone and Hypernet links.',
    flavor: 'Five bars everywhere. Four if you stand near the fridge.',
    effects: { data: 60, power: -2, jobs: 2, landValue: -2, radius: 2 }, coverage: data(8, 0.6), mesh: W.commsTower, height: 3.4, tags: ['data', 'comms', 'tower'],
  }),
  util({
    id: 'data.centre', name: 'Data Centre', category: 'water', group: 'Data & Comms', icon: '🖥️', footprint: 7, cost: 26_000, upkeep: 1_000, tier: 2,
    description: 'Windowless server halls humming with the city’s memories, memes and medical records. Thirsty for power.',
    flavor: 'Contains 40 % of all cat videos in the sector. The other 60 % are pending.',
    effects: { data: 700, power: -25, water: -10, jobs: 45, noise: 8, radius: 3 }, coverage: data(12, 0.8), mesh: W.dataCentre, height: 0.8, tags: ['data', 'servers'],
  }),
  util({
    id: 'data.uplink', name: 'Satellite Uplink', category: 'water', group: 'Data & Comms', icon: '📡', footprint: 7, cost: 32_000, upkeep: 1_200, tier: 3,
    description: 'A farm of dishes linking the colony to its satellites, its sister worlds and anyone else who happens to be listening.',
    flavor: 'Mostly used for streaming. Occasionally for first contact.',
    effects: { data: 1_000, research: 10, power: -12, jobs: 25, radius: 3 }, coverage: data(18, 0.9), mesh: W.satelliteUplink, height: 1.6, tags: ['data', 'comms', 'dish'],
  }),
  util({
    id: 'data.quantum', name: 'Quantum Relay', category: 'water', group: 'Data & Comms', icon: '🔮', footprint: 1, cost: 120_000, upkeep: 4_000, tier: 6,
    description: 'Entangled particles carry data instantly across the planet — and across the stars. Covers enormous areas.',
    flavor: 'Your message arrived before you finished typing it. Please stop being surprised.',
    effects: { data: 5_000, research: 40, tourism: 15, power: -30, jobs: 6, radius: 2 }, coverage: data(40, 1), mesh: W.quantumRelay, height: 3.0, tags: ['data', 'quantum', 'glow'],
  }),
];

registerItems(WATER);
