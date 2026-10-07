/**
 * OWNER: agent landmarks
 * Orbital items (category "orbital", placement "orbit"): satellites, stations, habitats, shipyards, mirrors, Dyson
 * collectors and the planet-encircling Orbital Ring. Meshes: content/meshes/landmarks/orbital.ts (modelled at their
 * own scale and centred on their centre of mass; the ring is centred on the planet — see that file's header).
 *
 * `orbit.radius` is in planet radii (1.15 ring · 1.2–1.5 low orbit · 1.5–2.2 stations · 2.5–3 high orbit),
 * `orbit.speed` in radians per real second at 1× (low orbits are faster). The sim applies orbital power, water,
 * oxygen, data and service coverage planet-wide (coverage with radius ≥ 30 counts in full) and their income, so
 * orbital benefits are expressed only through those channels (tourism / research → coverage, habitats → income).
 * Tags: "defense" (counted by god powers against invasions/meteors), "ring" (the Orbital Ring progression goal).
 */
import { registerItems, type ItemDef } from '../catalog';
import { ORBITAL_MESHES as O } from '../meshes/landmarks/orbital';

const SAT = 'Satellites';
const STA = 'Stations';
const MEGA = 'Megastructures';

type Base = Pick<ItemDef, 'category' | 'placement' | 'footprint'>;
const orb: Base = { category: 'orbital', placement: 'orbit', footprint: 1 };

const orbitals: ItemDef[] = [
  // ─────────────────────────────── satellites
  {
    ...orb, id: 'orb_comm_sat', name: 'Comm Satellite', group: SAT, icon: '📡', tier: 2,
    cost: 18_000, upkeep: 300, height: 1.8, mesh: O.commSat, orbit: { radius: 1.25, speed: 0.12 },
    description: 'A gold-foil communications satellite with twin solar wings and a big dish aimed at your city. Adds planet-wide data capacity and keeps everyone streaming.',
    flavor: '99.9 % of its bandwidth is cat videos. The other 0.1 % is people complaining about buffering.',
    effects: { data: 400 },
    coverage: [{ service: 'data', radius: 40, strength: 0.3 }],
    tags: ['satellite', 'data'],
  },
  {
    ...orb, id: 'orb_weather_sat', name: 'Weather Satellite', group: SAT, icon: '🛰️', tier: 2,
    cost: 22_000, upkeep: 350, height: 2.2, mesh: O.weatherSat, orbit: { radius: 1.3, speed: 0.11 },
    description: 'Watches the clouds from above so the fire brigade sees trouble coming. Early warnings improve fire response everywhere.',
    flavor: 'Forecast accuracy: 98 %. Forecast believability: still 40 %.',
    effects: { data: 50 },
    coverage: [{ service: 'fire', radius: 40, strength: 0.15 }],
    tags: ['satellite', 'weather'],
  },
  {
    ...orb, id: 'orb_gps_sat', name: 'Navigation Satellite', group: SAT, icon: '🧭', tier: 3,
    cost: 26_000, upkeep: 400, height: 1.3, mesh: O.gpsSat, orbit: { radius: 1.4, speed: 0.1 },
    description: 'A hexagonal navigation satellite with cruciform arrays. Precise positioning smooths traffic, transit schedules and emergency routing planet-wide.',
    flavor: '“Recalculating…” — the most-heard word in the colony.',
    effects: { data: 150 },
    coverage: [{ service: 'transit', radius: 40, strength: 0.15 }, { service: 'police', radius: 40, strength: 0.08 }],
    tags: ['satellite', 'navigation'],
  },
  {
    ...orb, id: 'orb_telescope', name: 'Orbital Telescope', group: SAT, icon: '🔭', tier: 3,
    cost: 45_000, upkeep: 700, height: 1.8, mesh: O.telescope, orbit: { radius: 1.6, speed: 0.08 },
    description: 'A foil-wrapped space telescope with its aperture door swung open to the deep sky. Boosts research across the whole planet.',
    flavor: 'Has photographed 4 billion galaxies and one very surprised astronaut.',
    effects: { data: 100 },
    coverage: [{ service: 'research', radius: 40, strength: 0.3 }, { service: 'tourism', radius: 40, strength: 0.05 }],
    tags: ['satellite', 'science'],
  },
  {
    ...orb, id: 'orb_billboard', name: 'Orbital Billboard', group: SAT, icon: '📺', tier: 3,
    cost: 35_000, upkeep: 500, height: 3.7, mesh: O.billboard, orbit: { radius: 1.3, speed: 0.1 },
    description: 'A giant animated screen held in place by thrusters, readable from the ground on a clear night. Pure advertising income — and mild light pollution.',
    flavor: 'Astronomers hate it. Marketing departments named their children after it.',
    effects: { income: 1_200 },
    tags: ['satellite', 'commerce'],
  },
  // ─────────────────────────────── stations
  {
    ...orb, id: 'orb_halo_station', name: 'Halo Station', group: STA, icon: '🎡', tier: 4,
    cost: 160_000, upkeep: 2_600, height: 3.3, mesh: O.haloStation, orbit: { radius: 1.5, speed: 0.07 },
    description: 'A classic spoked wheel station whose spin makes gravity, its habitat ring glittering with lit windows. Research labs, a tourist promenade and the best view in the system.',
    flavor: 'The waltz plays on loop in the hub. Nobody remembers who started it.',
    effects: { income: 1_500, data: 200 },
    coverage: [{ service: 'research', radius: 40, strength: 0.2 }, { service: 'tourism', radius: 40, strength: 0.15 }],
    tags: ['station', 'habitat'],
  },
  {
    ...orb, id: 'orb_zero_g_lab', name: 'Zero-G Laboratory', group: STA, icon: '🧪', tier: 4,
    cost: 120_000, upkeep: 2_000, height: 3.6, mesh: O.zeroGLab, orbit: { radius: 1.4, speed: 0.09 },
    description: 'A sprawling truss of pressurised labs and eight solar wings, running experiments impossible on the ground. A strong planet-wide research boost.',
    flavor: 'Current experiment: does toast still land butter-side down in zero g? (Inconclusive. Very messy.)',
    effects: { data: 150 },
    coverage: [{ service: 'research', radius: 40, strength: 0.35 }, { service: 'education', radius: 40, strength: 0.05 }],
    tags: ['station', 'science'],
  },
  {
    ...orb, id: 'orb_orbital_farm', name: 'Orbital Farm', group: STA, icon: '🌾', tier: 4,
    cost: 110_000, upkeep: 1_800, height: 5.0, mesh: O.orbitalFarm, orbit: { radius: 1.45, speed: 0.085 },
    description: 'Three spinning greenhouse drums under purple grow-lights and wide solar sails. Fresh food and fresh air shipped down daily.',
    flavor: 'Zero-gravity strawberries: perfectly round, mildly unsettling.',
    effects: { oxygen: 150, income: 800 },
    tags: ['station', 'farm'],
  },
  {
    ...orb, id: 'orb_mining_tug', name: 'Asteroid Mining Tug', group: STA, icon: '☄️', tier: 4,
    cost: 90_000, upkeep: 1_500, height: 2.6, mesh: O.miningTug, orbit: { radius: 2.6, speed: 0.04 },
    description: 'A rugged tug that drags ore-veined asteroids into high orbit and strips them for metals. Steady mining income with zero pollution on the surface.',
    flavor: 'Catch of the day: one rock, eight billion credits. Tip your tug pilot.',
    effects: { income: 2_500 },
    tags: ['station', 'mining'],
  },
  {
    ...orb, id: 'orb_cargo_depot', name: 'Cargo Depot', group: STA, icon: '📦', tier: 3,
    cost: 75_000, upkeep: 1_200, height: 3.6, mesh: O.cargoDepot, orbit: { radius: 1.8, speed: 0.06 },
    description: 'Racks of containers around a docking spine, with freighters coming and going. Interplanetary trade income and a boost to industry.',
    flavor: 'Contents: 30 % machine parts, 70 % packing foam.',
    effects: { income: 1_500 },
    coverage: [{ service: 'transit', radius: 40, strength: 0.1 }],
    tags: ['station', 'trade'],
  },
  {
    ...orb, id: 'orb_defense_platform', name: 'Defense Platform', group: STA, icon: '🛡️', tier: 5,
    cost: 180_000, upkeep: 3_000, height: 2.2, mesh: O.defensePlatform, orbit: { radius: 1.35, speed: 0.1 },
    description: 'An armoured hexagonal battle platform with three turrets, a planet-facing lance and a shield emitter. Shoots down meteors and discourages uninvited saucers.',
    flavor: 'Motto: “Peace through superior orbital mechanics.”',
    coverage: [{ service: 'police', radius: 40, strength: 0.2 }, { service: 'fire', radius: 40, strength: 0.1 }],
    tags: ['station', 'defense'],
  },
  {
    ...orb, id: 'orb_space_hotel', name: 'Space Hotel', group: STA, icon: '🏨', tier: 5,
    cost: 220_000, upkeep: 3_200, height: 4.8, mesh: O.spaceHotel, orbit: { radius: 1.55, speed: 0.075 },
    description: 'A glass-ringed panorama saucer with suites in floating pods and a neon sign you can read from the ground. Luxury tourism across the whole planet, luxury income.',
    flavor: 'Room service takes 90 minutes. That’s one full orbit, and they bring you a sunrise.',
    effects: { income: 4_000 },
    coverage: [{ service: 'tourism', radius: 40, strength: 0.3 }, { service: 'leisure', radius: 40, strength: 0.1 }],
    tags: ['station', 'tourism'],
  },
  {
    ...orb, id: 'orb_shipyard', name: 'Shipyard Dock', group: STA, icon: '🚀', tier: 5,
    cost: 260_000, upkeep: 4_000, height: 3.8, mesh: O.shipyard, orbit: { radius: 1.7, speed: 0.065 },
    description: 'An open truss dock where starships are welded together in the sparks of a hundred torches. Export income and a steady trickle of engineering breakthroughs.',
    flavor: 'Current build: “The Unsinkable II”. Nobody asked what happened to the first one.',
    effects: { income: 4_000 },
    coverage: [{ service: 'research', radius: 40, strength: 0.1 }],
    tags: ['station', 'shipyard'],
  },
  {
    ...orb, id: 'orb_solar_mirror', name: 'Solar Mirror', group: STA, icon: '🪞', tier: 4,
    cost: 140_000, upkeep: 1_800, height: 4.4, mesh: O.solarMirror, orbit: { radius: 2.0, speed: 0.05 },
    description: 'Seven chrome petals focus sunlight onto a collector and beam it down as clean power — 60 MW day and night.',
    flavor: 'Also used to give the mayor a spotlight during speeches. Only once. It was a lot.',
    effects: { power: 60 },
    tags: ['station', 'power'],
  },
  {
    ...orb, id: 'orb_oneill_cylinder', name: "O'Neill Habitat", group: STA, icon: '🌀', tier: 6,
    cost: 600_000, upkeep: 8_000, height: 5.8, mesh: O.oneillCylinder, orbit: { radius: 2.2, speed: 0.045 },
    description: 'A spinning cylinder of land and windows eight kilometres long, with hinged mirror vanes and a farming ring. A whole suburb in orbit: its residents pay taxes down the well and its parks draw tourists from across the colony.',
    flavor: 'Look up and you see the neighbours’ lawns. Look down and you see the neighbours’ lawns.',
    effects: { income: 6_000, oxygen: 100 },
    coverage: [{ service: 'tourism', radius: 40, strength: 0.2 }, { service: 'leisure', radius: 40, strength: 0.15 }],
    tags: ['station', 'habitat', 'housing'],
  },
  // ─────────────────────────────── megastructures
  {
    ...orb, id: 'orb_dyson_collector', name: 'Dyson Swarm Collector', group: MEGA, icon: '🌞', tier: 7,
    cost: 900_000, upkeep: 9_000, height: 9.0, mesh: O.dysonCollector, orbit: { radius: 2.9, speed: 0.03 },
    description: 'A vast flower of solar petals, one node of a swarm that will one day wrap the sun, beaming 3 000 MW down to your grid.',
    flavor: 'Step one of a 10 000-year plan. Step two is sunglasses.',
    effects: { power: 3_000 },
    tags: ['megastructure', 'power', 'dyson'],
  },
  {
    ...orb, id: 'orb_orbital_ring', name: 'Orbital Ring', group: MEGA, icon: '💍', tier: 7,
    cost: 1_500_000, upkeep: 15_000, height: 77, mesh: O.orbitalRing, orbit: { radius: 1.15, speed: 0.004 },
    description: 'A single habitat band that encircles the whole planet, glittering with windows and rails, with hub stations and space-elevator tethers down to the surface. Trade, tourism and transit on a planetary scale.',
    flavor: 'Saturn called. It wants its look back.',
    effects: { income: 12_000, data: 1_000 },
    coverage: [{ service: 'transit', radius: 40, strength: 0.4 }, { service: 'tourism', radius: 40, strength: 0.4 }],
    tags: ['megastructure', 'ring', 'habitat'],
  },
];

registerItems(orbitals);
