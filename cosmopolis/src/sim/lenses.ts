/**
 * Data lenses (overlay maps). Each lens fills a cached Float32Array with per-tile values 0..1 from the sim's
 * fields. Tiles where a lens has nothing to say (empty land for building-based lenses, land for traffic…)
 * get NaN, which the terrain overlay renders transparent. Building lenses return −1 from their value
 * callback to mean "skip".
 */
import { Biome, Feature } from '../core/types';
import type { LensDef, Simulation } from './Simulation';
import type { Planet } from '../world/planet';
import { SERVICE_INDEX } from './params';
import { MAX_LEVEL, MIN_LEVEL } from '../world/planet';
import { BuildingState } from '../core/types';
import { SV_DATA, SV_GARBAGE, SV_OXYGEN, SV_POWER, SV_WATER } from './buildings';
import { P } from './state';

const RESOURCE: number[] = [];
RESOURCE[Feature.Ore] = 1;
RESOURCE[Feature.CrystalDeposit] = 0.95;
RESOURCE[Feature.GasVent] = 0.8;
RESOURCE[Feature.GeoVent] = 0.85;
RESOURCE[Feature.IceDeposit] = 0.7;
RESOURCE[Feature.Ruins] = 0.6;
RESOURCE[Feature.DenseTrees] = 0.45;
RESOURCE[Feature.Trees] = 0.35;
RESOURCE[Feature.AlienFlora] = 0.4;
RESOURCE[Feature.Kelp] = 0.3;
RESOURCE[Feature.Flowers] = 0.2;
const FERTILE = new Set<number>([Biome.Grass, Biome.Meadow, Biome.Forest, Biome.Jungle, Biome.Savanna, Biome.Fungal, Biome.Swamp]);

type Fill = (sim: Simulation, p: Planet, out: Float32Array) => void;

interface Spec {
  id: string;
  name: string;
  icon: string;
  group: string;
  description: string;
  ramp: LensDef['ramp'];
  legend: [string, string];
  fill: Fill;
}

/** Utility lens: buildings served = 1, unserved = 0, network roads = supply balance, else no data. */
function utilityLens(bit: number, u: number): Fill {
  return (sim, p, out) => {
    out.fill(NaN);
    const nets = sim.nets;
    if (nets) {
      for (let t = 0; t < p.count; t++) {
        if (!p.road[t]) continue;
        const k = nets.label[t];
        if (k < 0) continue;
        const bal = nets.balance(u, k);
        out[t] = bal <= 0 ? 0.1 : Math.min(1, 0.25 + bal * 0.6);
      }
    }
    for (const r of sim.recs) {
      const b = r.b;
      let v: number;
      if (b.state === BuildingState.Constructing || b.state === BuildingState.Abandoned || b.state === BuildingState.Ruined) v = 0.5;
      else if (producerOf(r.info, u)) v = 1;
      else v = r.served & bit ? 0.92 : 0.02;
      for (const t of b.tiles) out[t] = v;
    }
  };
}

function producerOf(info: { powerOut: number; waterOut: number; oxygenOut: number; garbageCap: number; dataCap: number }, u: number): boolean {
  switch (u) {
    case 0:
      return info.powerOut > 0;
    case 1:
      return info.waterOut > 0;
    case 2:
      return info.oxygenOut > 0;
    case 3:
      return info.garbageCap > 0;
    default:
      return info.dataCap > 0;
  }
}

function coverageLens(service: keyof typeof SERVICE_INDEX): Fill {
  const si = SERVICE_INDEX[service];
  return (sim, p, out) => {
    const cov = sim.fields!.cov[si];
    for (let t = 0; t < p.count; t++) out[t] = p.isWater(t) ? NaN : cov[t];
  };
}

function fieldLens(get: (sim: Simulation) => Float32Array, scale: number, landOnly = true): Fill {
  return (sim, p, out) => {
    const f = get(sim);
    for (let t = 0; t < p.count; t++) out[t] = landOnly && p.isWater(t) ? NaN : Math.min(1, Math.max(0, f[t] / scale));
  };
}

/** Building-based lens: per-building value, else −1. */
function buildingLens(value: (sim: Simulation, r: Simulation['recs'][number]) => number): Fill {
  return (sim, _p, out) => {
    out.fill(NaN);
    for (const r of sim.recs) {
      const v = value(sim, r);
      if (v < 0) continue;
      for (const t of r.b.tiles) out[t] = v;
    }
  };
}

const SPECS: Spec[] = [
  { id: 'power', name: 'Power', icon: '⚡', group: 'Utilities', description: 'Which buildings have electricity. Roads show how healthy each grid is.', ramp: 'good', legend: ['Blackout', 'Powered'], fill: utilityLens(SV_POWER, 0) },
  { id: 'water', name: 'Water', icon: '💧', group: 'Utilities', description: 'Water supply by building and network.', ramp: 'cool', legend: ['Dry', 'Supplied'], fill: utilityLens(SV_WATER, 1) },
  { id: 'oxygen', name: 'Oxygen', icon: '🫁', group: 'Utilities', description: 'Breathable air — vital on worlds without an atmosphere.', ramp: 'cool', legend: ['Suffocating', 'Breathing'], fill: utilityLens(SV_OXYGEN, 2) },
  { id: 'garbage', name: 'Garbage', icon: '🗑️', group: 'Utilities', description: 'Trash pickup. Red buildings are drowning in garbage.', ramp: 'good', legend: ['Piling up', 'Collected'], fill: utilityLens(SV_GARBAGE, 3) },
  { id: 'data', name: 'Data', icon: '📡', group: 'Utilities', description: 'Hypernet coverage and data centre capacity.', ramp: 'cool', legend: ['Offline', 'Gigabit'], fill: (sim, p, out) => {
    const cov = sim.fields!.cov[SERVICE_INDEX.data];
    for (let t = 0; t < p.count; t++) out[t] = p.isWater(t) ? NaN : cov[t];
    for (const r of sim.recs) if (r.dataUse > 0) for (const t of r.b.tiles) out[t] = Math.max(out[t], r.served & SV_DATA ? 0.9 : 0.05);
  } },
  { id: 'landValue', name: 'Land Value', icon: '💎', group: 'City', description: 'What a lot is worth: views, services, parks, minus pollution, noise and crime.', ramp: 'heat', legend: ['Cheap', 'Prime'], fill: (sim, p, out) => {
    const lv = sim.fields!.landValue;
    for (let t = 0; t < p.count; t++) out[t] = p.isWater(t) ? NaN : Math.min(1, Math.max(0, (lv[t] - 10) / 65));
  } },
  { id: 'pollution', name: 'Pollution', icon: '☁️', group: 'Environment', description: 'Air and ground pollution from industry and traffic.', ramp: 'bad', legend: ['Clean', 'Toxic'], fill: fieldLens((s) => s.fields!.pollution, 80) },
  { id: 'noise', name: 'Noise', icon: '🔊', group: 'Environment', description: 'Noise from traffic, nightlife and industry.', ramp: 'bad', legend: ['Quiet', 'Deafening'], fill: fieldLens((s) => s.fields!.noise, 70) },
  { id: 'crime', name: 'Crime', icon: '🦹', group: 'Safety', description: 'Crime rate. Police stations push it down.', ramp: 'bad', legend: ['Safe', 'Dangerous'], fill: (sim, p, out) => {
    const c = sim.fields!.crime;
    for (let t = 0; t < p.count; t++) out[t] = p.isWater(t) ? NaN : Math.min(1, c[t] / 70);
  } },
  { id: 'police', name: 'Police', icon: '🚓', group: 'Safety', description: 'Police coverage.', ramp: 'cool', legend: ['None', 'Patrolled'], fill: coverageLens('police') },
  { id: 'fire', name: 'Fire', icon: '🚒', group: 'Safety', description: 'Fire coverage. Uncovered blocks burn longer — and spread.', ramp: 'cool', legend: ['None', 'Protected'], fill: coverageLens('fire') },
  { id: 'health', name: 'Health', icon: '🏥', group: 'Services', description: 'Healthcare coverage.', ramp: 'good', legend: ['None', 'Excellent'], fill: coverageLens('health') },
  { id: 'education', name: 'Education', icon: '🎓', group: 'Services', description: 'School and university coverage; offices need graduates.', ramp: 'cool', legend: ['None', 'Scholarly'], fill: coverageLens('education') },
  { id: 'happiness', name: 'Happiness', icon: '😊', group: 'City', description: 'How happy each building is.', ramp: 'good', legend: ['Miserable', 'Joyful'], fill: buildingLens((_s, r) => (r.b.state === BuildingState.Active ? r.happiness / 100 : r.b.state === BuildingState.Abandoned ? 0 : -1)) },
  { id: 'traffic', name: 'Traffic', icon: '🚗', group: 'Transport', description: 'Road congestion. Upgrade red roads to avenues or add transit.', ramp: 'bad', legend: ['Free-flowing', 'Gridlock'], fill: (sim, p, out) => {
    const tr = sim.fields!.traffic;
    for (let t = 0; t < p.count; t++) out[t] = tr[t] < 0 ? NaN : Math.min(1, tr[t]);
  } },
  { id: 'transit', name: 'Transit', icon: '🚝', group: 'Transport', description: 'Public transit coverage — cuts car trips.', ramp: 'cool', legend: ['None', 'Connected'], fill: coverageLens('transit') },
  { id: 'tourism', name: 'Tourism & Leisure', icon: '🎡', group: 'City', description: 'Where visitors go: landmarks, parks, leisure districts.', ramp: 'rainbow', legend: ['Quiet', 'Hotspot'], fill: fieldLens((s) => s.fields!.tourism, 1) },
  { id: 'density', name: 'Population Density', icon: '👥', group: 'City', description: 'Residents and workers per tile.', ramp: 'heat', legend: ['Sparse', 'Packed'], fill: (sim, p, out) => {
    const f = sim.fields!;
    for (let t = 0; t < p.count; t++) {
      const v = f.residents[t] + f.workers[t] * 0.5;
      out[t] = v <= 0 ? (p.building[t] >= 0 ? 0 : NaN) : Math.min(1, Math.sqrt(v / 320));
    }
  } },
  { id: 'wealth', name: 'Wealth', icon: '💰', group: 'City', description: 'Household wealth: building level, education and land value.', ramp: 'heat', legend: ['Modest', 'Rich'], fill: buildingLens((sim, r) => {
    if (r.info.fam !== 0 && r.info.housing <= 0) return -1;
    if (r.b.state !== BuildingState.Active) return 0;
    return Math.min(1, (r.b.level - 1) / 4 * 0.5 + r.edu * 0.15 + sim.fields!.landValue[r.b.tile] / 100 * 0.3);
  }) },
  { id: 'resources', name: 'Natural Resources', icon: '⛏️', group: 'Environment', description: 'Ore, crystal, ice, gas, geothermal vents, forests and ancient ruins.', ramp: 'rainbow', legend: ['Barren', 'Rich'], fill: (_sim, p, out) => {
    for (let t = 0; t < p.count; t++) {
      const v = RESOURCE[p.feature[t]] ?? 0;
      out[t] = v > 0 ? v : p.isWater(t) ? NaN : FERTILE.has(p.biome[t]) ? 0.12 : 0;
    }
  } },
  { id: 'elevation', name: 'Elevation', icon: '🏔️', group: 'Environment', description: 'Terrain height relative to sea level.', ramp: 'rainbow', legend: ['Low', 'High'], fill: (_sim, p, out) => {
    const lo = Math.min(p.seaOffset, MIN_LEVEL), hi = MAX_LEVEL;
    for (let t = 0; t < p.count; t++) out[t] = (p.elevation[t] - lo) / (hi - lo);
  } },
  { id: 'research', name: 'Research', icon: '🔬', group: 'Services', description: 'Research labs and academies — boosts higher education.', ramp: 'cool', legend: ['None', 'Cutting-edge'], fill: coverageLens('research') },
  { id: 'problems', name: 'Problems', icon: '⚠️', group: 'City', description: 'Buildings with problems. Red = severe (no power, water, oxygen, fire, flood).', ramp: 'bad', legend: ['Fine', 'Trouble'], fill: buildingLens((_s, r) => {
    const pr = r.problems;
    if (r.b.state === BuildingState.Abandoned || r.b.state === BuildingState.Ruined) return 1;
    if (!pr) return 0;
    if (pr & (P.NoPower | P.NoWater | P.NoOxygen | P.Fire | P.Flood | P.Radiation | P.Goo | P.Garbage)) return 0.95;
    return 0.5;
  }) },
  { id: 'levels', name: 'Building Levels', icon: '🏙️', group: 'City', description: 'Zoned building levels 1–5.', ramp: 'rainbow', legend: ['Level 1', 'Level 5'], fill: buildingLens((_s, r) => (r.info.growable ? (r.b.level - 1) / 4 : -1)) },
  { id: 'shelter', name: 'Shelters & Shields', icon: '🛡️', group: 'Safety', description: 'Disaster shelters and shield generators — protection from god powers.', ramp: 'cool', legend: ['Exposed', 'Protected'], fill: (sim, p, out) => {
    const f = sim.fields!;
    for (let t = 0; t < p.count; t++) out[t] = p.isWater(t) ? NaN : Math.min(1, Math.max(f.shield[t], f.shelter[t] * 0.7));
  } },
];

export function makeLenses(sim: Simulation): LensDef[] {
  return SPECS.map((s) => {
    let buf: Float32Array | null = null;
    return {
      id: s.id,
      name: s.name,
      icon: s.icon,
      description: s.description,
      group: s.group,
      ramp: s.ramp,
      legend: s.legend,
      values(planet: Planet): ArrayLike<number> {
        if (!buf || buf.length !== planet.count) buf = new Float32Array(planet.count);
        if (sim.planet !== planet || !sim.fields) return buf.fill(NaN);
        try {
          s.fill(sim, planet, buf);
        } catch (e) {
          console.error('[sim] lens failed', s.id, e);
          buf.fill(NaN);
        }
        return buf;
      },
    };
  });
}

export const LENS_IDS = SPECS.map((s) => s.id);
