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
