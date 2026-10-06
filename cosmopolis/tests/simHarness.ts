/**
 * Headless harness for sim tests: registers a compact test catalog (growables for every zone, utilities,
 * services, a park and a landmark), builds a flat planet with a ring-and-spoke road grid and zones, and wires a
 * Simulation to a minimal fake Game (planet, ops, empire, clock).
 */
import { registerItems, type ItemDef } from '../src/content/catalog';
import { Planet } from '../src/world/planet';
import { PlanetOps } from '../src/world/ops';
import { Empire } from '../src/game/Empire';
import { Clock } from '../src/game/Clock';
import { Simulation } from '../src/sim/Simulation';
import { RoadKind, Zone, type GameMode, type PlanetSpec, type PlanetTypeId } from '../src/core/types';
import type { Game } from '../src/game/Game';

let registered = false;
export function registerTestCatalog(): void {
  if (registered) return;
  registered = true;
  const grow = (id: string, zone: Zone, minLevel = 1, maxLevel = 5): ItemDef => ({
    id, name: id, category: 'zones', description: '', footprint: 1, placement: 'surface', cost: 0, upkeep: 0, tier: 0, hidden: true, growable: { zone, minLevel, maxLevel },
  });
  const defs: ItemDef[] = [
    grow('t_res_low', Zone.ResLow), grow('t_res_low_b', Zone.ResLow), grow('t_res_med', Zone.ResMed), grow('t_res_high', Zone.ResHigh, 1, 3), grow('t_res_tower', Zone.ResHigh, 3, 5),
    grow('t_com_low', Zone.ComLow), grow('t_com_high', Zone.ComHigh), grow('t_leisure', Zone.ComLeisure),
    grow('t_ind', Zone.IndGeneral), grow('t_farm', Zone.IndFarm), grow('t_mine', Zone.IndMining), grow('t_tech', Zone.IndTech), grow('t_office', Zone.Office),
    { id: 't_power', name: 'Test Power Plant', category: 'power', description: '', footprint: 1, placement: 'surface', cost: 20000, upkeep: 700, tier: 0, effects: { power: 250, pollution: 30, jobs: 15, radius: 4 } },
    { id: 't_solar', name: 'Test Solar', category: 'power', description: '', footprint: 1, placement: 'surface', cost: 6000, upkeep: 150, tier: 0, effects: { power: 20 } },
    { id: 't_water', name: 'Test Pump', category: 'water', description: '', footprint: 1, placement: 'surface', cost: 8000, upkeep: 350, tier: 0, effects: { water: 250, power: -4, jobs: 6 } },
    { id: 't_oxygen', name: 'Test O2', category: 'water', description: '', footprint: 1, placement: 'surface', cost: 8000, upkeep: 300, tier: 0, effects: { oxygen: 400, power: -5 } },
    { id: 't_landfill', name: 'Test Landfill', category: 'water', description: '', footprint: 1, placement: 'surface', cost: 6000, upkeep: 250, tier: 0, effects: { garbage: 600, pollution: 15, power: -2 } },
    { id: 't_police', name: 'Test Police', category: 'services', description: '', footprint: 1, placement: 'surface', cost: 5000, upkeep: 250, tier: 0, effects: { power: -2, jobs: 12 }, coverage: [{ service: 'police', radius: 10, strength: 1, capacity: 6000 }] },
    { id: 't_fire', name: 'Test Fire', category: 'services', description: '', footprint: 1, placement: 'surface', cost: 5000, upkeep: 250, tier: 0, effects: { power: -2, jobs: 10 }, coverage: [{ service: 'fire', radius: 10, strength: 1, capacity: 6000 }] },
    { id: 't_clinic', name: 'Test Clinic', category: 'services', description: '', footprint: 1, placement: 'surface', cost: 6000, upkeep: 300, tier: 0, effects: { power: -3, jobs: 14 }, coverage: [{ service: 'health', radius: 9, strength: 1, capacity: 400 }] },
    { id: 't_school', name: 'Test School', category: 'education', description: '', footprint: 1, placement: 'surface', cost: 6000, upkeep: 300, tier: 0, effects: { power: -3, jobs: 14 }, coverage: [{ service: 'education', radius: 9, strength: 1, capacity: 900 }] },
    { id: 't_park', name: 'Test Park', category: 'leisure', description: '', footprint: 1, placement: 'surface', cost: 1500, upkeep: 40, tier: 0, effects: { landValue: 15, happiness: 6, radius: 5 }, coverage: [{ service: 'leisure', radius: 6, strength: 0.8 }] },
    { id: 't_landmark', name: 'Test Spire', category: 'landmarks', description: '', footprint: 1, placement: 'surface', cost: 60000, upkeep: 600, tier: 0, effects: { landValue: 25, happiness: 10, tourism: 600, radius: 9 }, tags: ['landmark'] },
    { id: 't_shield', name: 'Test Shield', category: 'services', description: '', footprint: 1, placement: 'surface', cost: 50000, upkeep: 500, tier: 0, effects: { power: -10, radius: 8 }, tags: ['shield'] },
    { id: 't_street', name: 'Test Street', category: 'roads', description: '', footprint: 1, placement: 'surface', cost: 50, upkeep: 4, tier: 0, road: { kind: RoadKind.Street, capacity: 600, speed: 1 } },
  ];
  registerItems(defs);
}

export function flatSpec(type: PlanetTypeId = 'terran', frequency = 16, seed = 7): PlanetSpec {
  return {
    id: `test.${type}.${frequency}.${seed}`, name: 'Testia', type, seed, frequency, oceanLevel: 0, mountains: 0, temperature: 15, gravity: 1, axialTilt: 0, dayLength: 240,
    atmosphere: { color: 0x88aaff, density: 1, breathable: type === 'terran' }, hasOcean: false, oceanColor: 0x2266aa, cloudCover: 0, rings: null, moons: [],
  };
}

export interface Harness {
  game: Game;
  sim: Simulation;
  planet: Planet;
  ops: PlanetOps;
  center: number;
  days(n: number): void;
}

export function makeHarness(o: { mode?: GameMode; planet?: Planet; type?: PlanetTypeId; frequency?: number } = {}): Harness {
  registerTestCatalog();
  const planet = o.planet ?? new Planet(flatSpec(o.type, o.frequency));
  const ops = new PlanetOps(planet);
  const clock = new Clock();
  const empire = Empire.create(o.mode ?? 'career', 'Test', 1);
  const game = { planet, ops, empire, clock } as unknown as Game;
  const sim = new Simulation(game);
  (game as unknown as { sim: Simulation }).sim = sim;
  sim.init();
  sim.onPlanetLoaded(planet);
  const days = (n: number) => {
    for (let i = 0; i < n; i++) {
      clock.day += 1;
      sim.tick(1);
    }
  };
  return { game, sim, planet, ops, center: 0, days };
}

/** Roads on rings 2,5,8 around `center` plus 6 spokes; zones in between. Returns tiles by role. */
export function layoutTown(h: Harness, center: number, o: { rings?: number[]; zones?: (d: number, i: number) => Zone } = {}): { roads: number[]; zoned: number[] } {
  const g = h.planet.grid;
  const rings = o.rings ?? [2, 5, 8];
  const roads = new Set<number>();
  for (const r of rings) for (const t of g.ring(center, r)) roads.add(t);
  // spokes
  for (const n of g.neighbors(center)) {
    let prev = center, cur = n;
    for (let k = 0; k < rings[rings.length - 1]; k++) {
      roads.add(cur);
      let next = -1, best = Infinity;
      for (const x of g.neighbors(cur)) {
        const d = g.dot(x, prev);
        if (d < best) (best = d), (next = x);
      }
      prev = cur;
      cur = next;
    }
  }
  roads.add(center);
  for (const t of roads) h.ops.buildRoad([t], RoadKind.Street);
  const zoned: number[] = [];
  const dist = new Map<number, number>();
  for (let r = 0; r <= rings[rings.length - 1] + 1; r++) for (const t of g.ring(center, r)) dist.set(t, r);
  let i = 0;
  for (const [t, d] of dist) {
    if (h.planet.road[t] || !h.planet.hasRoadAccess(t)) continue;
    const z = o.zones ? o.zones(d, i++) : defaultZone(d, i++);
    if (z) {
      h.ops.setZone([t], z);
      zoned.push(t);
    }
  }
  return { roads: [...roads], zoned };
}

function defaultZone(d: number, i: number): Zone {
  if (d <= 3) return i % 3 === 0 ? Zone.ComLow : Zone.ResLow;
  if (d <= 6) return i % 4 === 0 ? Zone.ComLow : Zone.ResLow;
  return i % 2 === 0 ? Zone.IndGeneral : Zone.ResLow;
}

/** Place a ploppable on the first free road-adjacent tile at distance ≥ minD from centre. */
export function plop(h: Harness, defId: string, center: number, minD = 3): number {
  const g = h.planet.grid;
  for (let r = minD; r < 14; r++) {
    for (const t of g.ring(center, r)) {
      if (h.planet.building[t] >= 0 || h.planet.road[t]) continue;
      if (!h.planet.hasRoadAccess(t)) continue;
      const b = h.ops.placeBuilding(defId, t, 0, { day: h.sim.day });
      if (b) return b.id;
    }
  }
  return -1;
}
