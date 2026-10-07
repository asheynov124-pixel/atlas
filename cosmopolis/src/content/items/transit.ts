/**
 * OWNER: agent utilities
 * Transit stations, depots, airports, spaceports, space elevator base, mass driver (category 'transit').
 *
 *   Local Transit · shuttle stop · shuttle depot · metro station · ferry terminal (coastal) · drone port
 *   Rapid Transit · maglev station · hyperloop terminal · teleporter hub
 *   Ports         · cargo hub · skyport (airport) · spaceport (tags 'spaceport': unlocks interplanetary travel)
 *   Space Access  · mass driver · space elevator (unique; tag 'elevator', tether climbs 120 units)
 *
 * Passenger stations provide `coverage: transit` (radius in tiles, strength, capacity in riders); freight sites
 * earn income instead. Tags other modules read: 'spaceport', 'elevator', 'airport', 'harbor'. Only the spaceport
 * carries 'spaceport' / 'launch': cosmos/Progression unlocks anything with those tags early (tier 3, or tier 2 with
 * Reusable Rocketry), which must not pull the tier-5/6 mass driver and elevator forward.
 * Meshes: content/meshes/utilities/transit.ts.
 */
import { registerItems, type ItemDef } from '../catalog';
import * as T from '../meshes/utilities/transit';

type Def = Omit<ItemDef, 'placement' | 'styleable' | 'upkeep' | 'category'> & { placement?: ItemDef['placement']; upkeep?: number };

/** Transit defaults: surface placement, styleable, upkeep ≈ 4 % of cost. */
function tr(d: Def): ItemDef {
  return { category: 'transit', placement: 'surface', styleable: true, upkeep: Math.round((d.cost * 0.04) / 10) * 10, ...d };
}

const transit = (radius: number, strength: number, capacity: number) => [{ service: 'transit' as const, radius, strength, capacity }];

const TRANSIT: ItemDef[] = [
  // ── local transit
  tr({
    id: 'tr.stop', name: 'Shuttle Stop', group: 'Local Transit', icon: '🚏', footprint: 1, cost: 600, upkeep: 30, tier: 0,
    description: 'A glass shelter, a bench and a glowing timetable. Electric shuttles pick up neighbours and drop off gossip.',
    flavor: 'Next shuttle: 3 minutes. It has said 3 minutes for 7 minutes.',
    effects: { landValue: 1, radius: 2 }, coverage: transit(5, 0.5, 300), mesh: T.shuttleStop, height: 0.5, tags: ['transit', 'bus', 'stop'],
  }),
  tr({
    id: 'tr.depot', name: 'Shuttle Depot', group: 'Local Transit', icon: '🚌', footprint: 7, cost: 9_000, upkeep: 360, tier: 1,
    description: 'Garages, chargers and a wash bay for a fleet of city shuttles. Powers every stop in a wide radius.',
    flavor: 'Where shuttles go to recharge and complain about the passengers.',
    effects: { jobs: 40, noise: 15, radius: 4 }, coverage: transit(10, 0.7, 2_500), mesh: T.shuttleDepot, height: 0.7, tags: ['transit', 'bus', 'depot'],
  }),
  tr({
    id: 'tr.metro', name: 'Metro Station', group: 'Local Transit', icon: '🚇', footprint: 1, cost: 12_000, upkeep: 480, tier: 2,
    description: 'A glass canopy over the stairs down to fast underground trains. Big coverage, tiny footprint, no traffic.',
    flavor: 'Mind the gap. The gap has opinions.',
    effects: { jobs: 10, landValue: 4, radius: 3 }, coverage: transit(8, 0.9, 4_000), mesh: T.metroStation, height: 0.8, tags: ['transit', 'metro', 'rail', 'station'],
  }),
  tr({
    id: 'tr.ferry', name: 'Ferry Terminal', group: 'Local Transit', icon: '⛴️', footprint: 1, cost: 7_000, upkeep: 280, tier: 1,
    description: 'A sheltered basin, a waiting hall and a cheerful ferry linking shores. Must be built on the coast.',
    flavor: 'The scenic route, with complimentary sea spray.',
    requires: { coastal: true }, effects: { jobs: 8, tourism: 15, landValue: 2, radius: 3 }, coverage: transit(9, 0.7, 1_500), mesh: T.ferryTerminal, height: 0.7, tags: ['transit', 'harbor', 'ferry', 'coastal'],
  }),
  tr({
    id: 'tr.droneport', name: 'Drone Port', group: 'Local Transit', icon: '🚁', footprint: 1, cost: 9_000, upkeep: 360, tier: 2,
    description: 'A rooftop pad for autonomous air-taxis and delivery drones, hopping over traffic jams.',
    flavor: 'Your pizza now arrives by air. The pigeons are livid.',
    effects: { jobs: 6, noise: 18, tourism: 5, radius: 3 }, coverage: transit(9, 0.6, 1_000), mesh: T.dronePort, height: 1.0, tags: ['transit', 'heliport', 'drone', 'air'],
  }),
  // ── rapid transit
  tr({
    id: 'tr.maglev', name: 'Maglev Station', group: 'Rapid Transit', icon: '🚄', footprint: 7, cost: 24_000, upkeep: 920, tier: 3,
    description: 'An elevated platform under a glass roof where magnetic trains glide in silently at 500 km/h.',
    flavor: 'So smooth you can balance a coin on it. People keep losing coins.',
    effects: { jobs: 25, landValue: 6, tourism: 10, noise: 6, radius: 4 }, coverage: transit(13, 0.95, 8_000), mesh: T.maglevStation, height: 1.5, tags: ['transit', 'rail', 'maglev', 'station'],
  }),
  tr({
    id: 'tr.hyperloop', name: 'Hyperloop Terminal', group: 'Rapid Transit', icon: '🚅', footprint: 7, cost: 48_000, upkeep: 1_800, tier: 4,
    description: 'Capsules shoot through vacuum tubes at near-airliner speeds. The terminal swoops like a wave.',
    flavor: 'Commute time to the other side of the planet: one podcast episode.',
    effects: { jobs: 30, landValue: 8, tourism: 30, radius: 5 }, coverage: transit(18, 1, 15_000), mesh: T.hyperloopTerminal, height: 1.3, tags: ['transit', 'hyperloop', 'rail', 'glow'],
  }),
  tr({
    id: 'tr.teleporter', name: 'Teleporter Hub', group: 'Rapid Transit', icon: '💫', footprint: 7, cost: 400_000, upkeep: 12_000, tier: 7,
    description: 'Step through a humming ring gate and step out across the planet. Covers vast areas; tourists adore it.',
    flavor: 'Arrives with 100 % of your atoms. We check twice. Usually.',
    effects: { jobs: 40, tourism: 200, landValue: 12, radius: 8 }, coverage: transit(40, 1, 60_000), mesh: T.teleporterHub, height: 2.6, tags: ['transit', 'teleporter', 'exotic', 'glow'],
  }),
  // ── ports
  tr({
    id: 'tr.cargo', name: 'Cargo Hub', group: 'Ports', icon: '📦', footprint: 7, cost: 25_000, upkeep: 760, tier: 2,
    description: 'A container yard, gantry crane, cross-dock warehouse and drone rack that keep freight off city streets.',
    flavor: 'Somewhere in there is the parcel you ordered last month.',
    effects: { jobs: 120, income: 1_500, noise: 35, pollution: 10, radius: 5 }, coverage: transit(7, 0.3, 3_000), mesh: T.cargoHub, height: 0.7, tags: ['transit', 'cargo', 'logistics', 'freight'],
  }),
  tr({
    id: 'tr.skyport', name: 'Skyport', group: 'Ports', icon: '✈️', footprint: 19, cost: 80_000, upkeep: 2_800, tier: 3,
    description: 'A runway, a wave-roofed terminal with jet bridges and a control tower. Floods the city with tourists — and noise.',
    flavor: 'Lost luggage now travels to more planets than you do.',
    effects: { jobs: 200, income: 2_500, tourism: 160, noise: 60, landValue: -10, radius: 8 }, coverage: transit(22, 0.6, 10_000), mesh: T.skyport, height: 2.4, tags: ['transit', 'airport', 'air', 'tourism'],
  }),
  tr({
    id: 'tr.spaceport', name: 'Spaceport', group: 'Ports', icon: '🚀', footprint: 19, cost: 150_000, upkeep: 4_500, tier: 3,
    description: 'Twin launch pads, a vehicle assembly building and mission control. Opens interplanetary travel and colonisation.',
    flavor: 'Ground control to everyone: please keep your arms inside the planet.',
    effects: { jobs: 250, income: 4_000, tourism: 300, noise: 70, radius: 9 }, coverage: transit(24, 0.5, 12_000), mesh: T.spaceport, height: 3.9, tags: ['transit', 'spaceport', 'launch', 'tourism'],
  }),
  // ── space access
  tr({
    id: 'tr.massdriver', name: 'Mass Driver', group: 'Space Access', icon: '🧲', footprint: 7, cost: 300_000, upkeep: 9_000, tier: 5,
    description: 'An electromagnetic rail flings cargo sleds into orbit off a soaring ramp. Exports by the megaton.',
    flavor: 'It’s a railgun for parcels. The parcels did not consent.',
    effects: { jobs: 80, income: 12_000, noise: 50, radius: 6 }, mesh: T.massDriver, height: 4.6, tags: ['transit', 'massdriver', 'cargo', 'orbital'],
  }),
  tr({
    id: 'tr.elevator', name: 'Space Elevator', group: 'Space Access', icon: '🛗', footprint: 19, cost: 1_200_000, upkeep: 30_000, tier: 6, unique: true,
    description: 'An anchor citadel and a carbon tether climbing 36 000 km to orbit. Climbers ride it up daily. One per planet.',
    flavor: 'Going up? Please allow three days and pack a sandwich.',
    effects: { jobs: 400, income: 25_000, tourism: 800, landValue: 10, radius: 12 }, coverage: transit(30, 0.8, 30_000), mesh: T.elevatorBase, height: 124, tags: ['transit', 'elevator', 'orbital', 'megastructure', 'landmark'],
  }),
];

registerItems(TRANSIT);
