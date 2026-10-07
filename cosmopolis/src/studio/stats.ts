/**
 * OWNER: studio.
 * Functions & balance — a design's function (housing, offices, shops, landmark, park, power, research, decorative)
 * turns its measured size into gameplay effects, service coverage, cost and upkeep, calibrated against the catalog's
 * balance guide (a 50-floor one-tile tower ≈ a high-density growable: ~380 residents). Parts matter too: solar
 * arrays and turbines boost Power, dishes and antennas boost Research, gardens / trees / pools make better Parks,
 * neon, screens and holograms pull shoppers and tourists.
 */
import type { Coverage, Effects } from '../content/catalog';
import { FLOOR_HEIGHT, TILE_SIZE } from '../world/planet';
import { analyze } from './builder';
import type { DesignSpec, FnId, PartSpec } from './model';
import { PART_DEFS } from './parts';

export interface FnDef {
  id: FnId;
  label: string;
  /** ui icon name */
  icon: string;
  emoji: string;
  blurb: string;
}

export const FUNCTIONS: FnDef[] = [
  { id: 'housing', label: 'Housing', icon: 'housing', emoji: '🏠', blurb: 'Homes for citizens. Every storey counts.' },
  { id: 'offices', label: 'Offices', icon: 'office', emoji: '🏢', blurb: 'Jobs and a steady trickle of tax.' },
  { id: 'shops', label: 'Shops', icon: 'shop', emoji: '🛍️', blurb: 'Retail jobs, income — neon brings crowds.' },
  { id: 'landmark', label: 'Landmark', icon: 'landmarks', emoji: '🗼', blurb: 'Tourists, land value, civic pride. Taller is better.' },
  { id: 'park', label: 'Park', icon: 'park', emoji: '🌳', blurb: 'Happiness & leisure. Greenery and water help.' },
  { id: 'power', label: 'Power', icon: 'power', emoji: '⚡', blurb: 'Clean megawatts. Solar arrays & turbines boost it.' },
  { id: 'research', label: 'Research', icon: 'research', emoji: '🔭', blurb: 'Science points. Dishes & antennas boost it.' },
  { id: 'decor', label: 'Decorative', icon: 'decor', emoji: '✨', blurb: 'Pure beauty — cheap, no road needed.' },
];

export function fnDef(id: FnId): FnDef {
  return FUNCTIONS.find((f) => f.id === id) ?? FUNCTIONS[3];
}

const TILE_AREA = (Math.sqrt(3) / 2) * TILE_SIZE * TILE_SIZE;

export interface Measure {
  /** usable floor area in tile-storeys (one storey of one whole tile = 1) */
  floors: number;
  height: number;
  volume: number;
  triangles: number;
  /** solar panel area (world units²) */
  solar: number;
  /** summed rotor diameter of turbines */
  rotor: number;
  dishes: number;
  antennas: number;
  /** glowing / animated attention-grabbers (neon, screens, holograms, halos) */
  bling: number;
  /** plants (garden plants + trees) */
  green: number;
  /** water surface (world units²) */
  water: number;
  parts: number;
}

function planArea(p: PartSpec): number {
  const round = p.seg > 8 || p.t === 'cylinder' || p.t === 'dome' || p.t === 'onion' || p.t === 'cone';
  if (p.t === 'rounded') return p.w * p.d * (1 - 0.2146 * p.s * p.s);
  return round ? (Math.PI / 4) * p.w * p.d : p.w * p.d;
}

/** Approximate enclosed volume of a part (world units³). */
export function partVolume(p: PartSpec): number {
  const tf = 1 - p.taper + (p.taper * p.taper) / 3;
  switch (p.t) {
    case 'torus': {
      const r = Math.min(p.h / 2, (p.w / 2) * 0.45);
      const R = Math.max(r * 1.05, p.w / 2 - r);
      return 2 * Math.PI * Math.PI * R * r * r;
    }
    case 'sphere':
      return (Math.PI / 6) * p.w * p.w * p.h;
    case 'dome':
      return (Math.PI / 6) * p.w * p.d * p.h;
    case 'onion':
      return (Math.PI / 6) * p.w * p.d * p.h * 0.8;
    case 'pods':
      return p.n * (4 / 3) * Math.PI * Math.pow(p.d / 2, 3);
    case 'vault':
      return (Math.PI * (p.d / 2) * (p.d / 2) * p.w) / 2;
    case 'pyramid':
    case 'cone':
    case 'spire':
      return (planArea(p) * p.h) / 3;
    case 'wedge':
      return (p.w * p.d * p.h) / 2;
    case 'gable':
      return (p.w * p.d * p.h) / 2;
    case 'pagoda':
      return planArea(p) * p.h * 0.3;
    case 'shell':
      return p.n * p.w * p.h * p.w * 0.12;
    case 'twisted':
      return planArea(p) * p.h * tf * 0.84;
    case 'skybridge':
      return p.w * p.d * p.h;
    default:
      return planArea(p) * p.h * tf;
  }
}

export function measure(spec: DesignSpec): Measure {
  const a = analyze(spec);
  const m: Measure = { floors: 0, height: a.height, volume: 0, triangles: a.triangles, solar: 0, rotor: 0, dishes: 0, antennas: 0, bling: 0, green: 0, water: 0, parts: spec.parts.length };
  for (const p of spec.parts) {
    const def = PART_DEFS[p.t];
    if (!def) continue;
    const v = partVolume(p);
    m.volume += v;
    m.floors += (v * def.habitable) / (TILE_AREA * FLOOR_HEIGHT);
    if (p.t === 'solar') m.solar += p.w * p.d * 0.8;
    else if (p.m === 'solar') m.solar += planArea(p) * 0.4;
    if (p.t === 'turbine') m.rotor += p.w;
    if (p.t === 'dish') m.dishes += 1 + p.w;
    if (p.t === 'antenna' || p.t === 'lattice') m.antennas += 1;
    if (p.m === 'glow' || p.m === 'screen' || p.m === 'holo') m.bling += p.t === 'neon' ? Math.max(1, p.n) * 0.6 : p.t === 'billboard' ? 1.5 : 1;
    if (p.t === 'garden') m.green += p.n * 0.5 + p.w * p.d;
    if (p.t === 'tree') m.green += p.n * 1.5;
    if (p.m === 'foliage' && p.t !== 'garden' && p.t !== 'tree') m.green += 1;
    if (p.t === 'pool') m.water += p.w * p.d;
    if (p.m === 'water' && p.t !== 'pool') m.water += planArea(p) * 0.5;
  }
  return m;
}

export interface DerivedStats {
  effects: Effects;
  coverage: Coverage[];
  cost: number;
  upkeep: number;
  roadNeeded: boolean;
  tags: string[];
  /** pretty rows for the UI: [icon, label, value, tone] */
  rows: { icon: string; label: string; value: string; tone: 'good' | 'bad' | 'neutral' }[];
}

/** Diminishing returns past ~150 tile-storeys so megastructures stay sane. */
function soft(f: number): number {
  return f <= 150 ? f : 150 + Math.pow(f - 150, 0.8);
}
const r10 = (v: number) => Math.round(v / 10) * 10;
const r100 = (v: number) => Math.round(v / 100) * 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fmt = (v: number) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : (Math.round(v * 10) / 10).toString());

export function deriveStats(spec: DesignSpec, m: Measure = measure(spec)): DerivedStats {
  const F = Math.max(0.2, m.floors);
  const Fs = soft(F);
  const fpScale = spec.footprint === 1 ? 1 : spec.footprint === 7 ? 1.6 : 2.4;
  const H = m.height;
  const e: Effects = {};
  const cov: Coverage[] = [];
  let cost = 0, upkeep = 0;
  let road = true;
  const tags = ['custom', spec.fn];
  switch (spec.fn) {
    case 'housing': {
      e.housing = Math.max(4, Math.round(Fs * 22));
      e.power = -+(0.4 + e.housing * 0.006).toFixed(1);
      e.water = -+(0.4 + e.housing * 0.006).toFixed(1);
      e.landValue = Math.round(clamp(2 + H * 0.35 + m.green * 0.3, 2, 16));
      if (m.green > 2) e.happiness = Math.round(clamp(m.green * 0.4, 1, 5));
      cost = r100(1500 + F * 180);
      upkeep = r10(cost * 0.015);
      break;
    }
    case 'offices': {
      e.jobs = Math.max(4, Math.round(Fs * 16));
      e.power = -+(1 + e.jobs * 0.009).toFixed(1);
      e.water = -+(0.5 + e.jobs * 0.004).toFixed(1);
      e.income = Math.round(e.jobs * 0.8);
      e.landValue = Math.round(clamp(1 + H * 0.25, 1, 10));
      cost = r100(2500 + F * 230);
      upkeep = r10(cost * 0.02);
      break;
    }
    case 'shops': {
      e.jobs = Math.max(3, Math.round(Fs * 7));
      e.income = Math.round(Fs * 16 + m.bling * 40);
      e.tourism = Math.round(Fs * 1.2 + m.bling * 18);
      e.power = -+(1 + e.jobs * 0.012 + m.bling * 0.3).toFixed(1);
      e.water = -+(0.3 + e.jobs * 0.004).toFixed(1);
      e.noise = Math.round(clamp(2 + m.bling * 1.5, 2, 20));
      e.landValue = Math.round(clamp(2 + m.bling * 0.8, 2, 12));
      cost = r100(2000 + F * 170 + m.bling * 400);
      upkeep = r10(cost * 0.02);
      break;
    }
    case 'landmark': {
      const awe = H * 10 + m.bling * 25 + Math.sqrt(m.volume) * 6 + m.parts * 3;
      e.tourism = Math.round(clamp(40 + awe, 40, 4000));
      e.landValue = Math.round(clamp(6 + H * 0.7 + m.bling * 0.6, 6, 35));
      e.happiness = Math.round(clamp(2 + H * 0.2, 2, 10));
      e.jobs = Math.round(clamp(Fs * 2, 4, 400));
      e.power = -+(1 + m.bling * 0.5 + Fs * 0.02).toFixed(1);
      e.radius = Math.round(clamp(4 + fpScale * 2 + H * 0.15, 4, 16));
      cov.push({ service: 'tourism', radius: e.radius, strength: clamp(0.2 + H * 0.02, 0.2, 0.8) });
      cost = r100(clamp(8000 + m.volume * 900 + H * 1500 + m.bling * 1200, 8000, 900000));
      upkeep = r10(cost * 0.03);
      tags.push('landmark');
      break;
    }
    case 'park': {
      const lush = m.green + m.water * 3;
      e.happiness = Math.round(clamp(2 + lush * 0.35 + fpScale, 2, 14));
      e.landValue = Math.round(clamp(4 + lush * 0.6 + fpScale * 2, 4, 24));
      e.tourism = Math.round(clamp(lush * 6 + m.bling * 8, 0, 600));
      e.radius = Math.round(clamp(3 + fpScale * 2 + lush * 0.15, 3, 12));
      cov.push({ service: 'leisure', radius: e.radius, strength: clamp(0.3 + lush * 0.02, 0.3, 0.9), capacity: Math.round(200 * fpScale + lush * 20) });
      cost = r100(clamp(1200 + lush * 220 + m.volume * 120, 1200, 120000));
      upkeep = r10(cost * 0.03);
      road = false;
      tags.push('park');
      break;
    }
    case 'power': {
      const mw = 4 + Fs * 0.9 + m.solar * 24 + m.rotor * 14 + m.volume * 0.15;
      e.power = Math.round(clamp(mw, 4, 2500));
      e.jobs = Math.round(clamp(4 + Fs * 1.5, 4, 600));
      e.noise = Math.round(clamp(m.rotor * 4, 0, 30));
      if (m.rotor > 0) e.radius = 3;
      cost = r100(clamp(e.power * 380, 4000, 1500000));
      upkeep = r10(cost * 0.035);
      tags.push('power', 'renewable');
      break;
    }
    case 'research': {
      e.research = Math.round(clamp(2 + Fs * 0.35 + m.dishes * 4 + m.antennas * 2, 2, 600));
      e.jobs = Math.round(clamp(6 + Fs * 6, 6, 1200));
      e.power = -+(2 + Fs * 0.08 + m.dishes).toFixed(1);
      e.water = -+(0.5 + Fs * 0.02).toFixed(1);
      const radius = Math.round(clamp(6 + fpScale * 2 + m.dishes, 6, 16));
      cov.push({ service: 'research', radius, strength: clamp(0.3 + e.research / 120, 0.3, 1), capacity: Math.round(e.jobs * 2) });
      cost = r100(clamp(5000 + F * 260 + m.dishes * 3000, 5000, 1200000));
      upkeep = r10(cost * 0.04);
      tags.push('research');
      break;
    }
    case 'decor':
    default: {
      e.landValue = Math.round(clamp(2 + H * 0.3 + m.bling * 0.5 + m.green * 0.3, 2, 12));
      e.happiness = Math.round(clamp(1 + m.green * 0.15 + m.bling * 0.2, 1, 5));
      e.radius = Math.round(clamp(2 + fpScale, 2, 6));
      cost = r100(clamp(300 + m.volume * 60 + m.parts * 40, 300, 60000));
      upkeep = r10(Math.max(10, cost * 0.02));
      road = false;
      tags.push('decor');
      break;
    }
  }
  if (m.bling > 0) tags.push('glow');
  if (m.green > 2) tags.push('green');
  if (H > 8) tags.push('skyscraper');
  return { effects: e, coverage: cov, cost: Math.max(0, cost), upkeep: Math.max(0, upkeep), roadNeeded: road, tags, rows: rowsFor(e) };
}

function rowsFor(e: Effects): DerivedStats['rows'] {
  const rows: DerivedStats['rows'] = [];
  const add = (v: number | undefined, icon: string, label: string, unit = '', invert = false) => {
    if (v === undefined || v === 0) return;
    const good = invert ? v < 0 : v > 0;
    rows.push({ icon, label, value: (v > 0 ? '+' : '−') + fmt(Math.abs(v)) + unit, tone: good ? 'good' : 'bad' });
  };
  add(e.housing, 'housing', 'Residents');
  add(e.jobs, 'jobs', 'Jobs');
  add(e.power, 'power', 'Power', ' MW');
  add(e.research, 'research', 'Research', '/mo');
  add(e.tourism, 'tourism', 'Tourists', '/mo');
  add(e.income, 'income', 'Revenue', '/mo');
  add(e.happiness, 'happiness', 'Happiness');
  add(e.landValue, 'landValue', 'Land value');
  add(e.water, 'water', 'Water', ' kL');
  add(e.noise, 'noise', 'Noise', '', true);
  return rows;
}

// ───────────────────────────────────────────── witty copy

const FLAVOR: Record<FnId, string[]> = {
  housing: [
    'Ceilings so high the clouds need visitor passes.',
    'Every apartment comes with a view and a slightly smug neighbour.',
    'The lift has a lift. Don’t ask.',
    'Rent includes oxygen. Mostly.',
    'Residents report 30 % more sunsets than the competition.',
  ],
  offices: [
    'Open-plan, open-minded, open until the heat death of the universe.',
    'Synergy levels are dangerously high on floor 42.',
    'The coffee machine has its own security clearance.',
    'Hot-desking, cold fusion, lukewarm meetings.',
  ],
  shops: [
    'Now selling things you didn’t know existed, at prices you won’t believe.',
    'Loyalty points redeemable across three star systems.',
    'Gift shop exits through another gift shop.',
    'Neon so bright it has its own fan club.',
  ],
  landmark: [
    'Visible from orbit. Postcard-ready from everywhere else.',
    'Tourists photograph it; it photographs them back.',
    'Locals pretend not to love it. They love it.',
    'Architects across the galaxy are quietly furious.',
  ],
  park: [
    'Grass: touched. Spirits: lifted.',
    'A pocket of calm in a very loud universe.',
    'The ducks were imported at great expense. They know it.',
    'Picnic-certified by the Interplanetary Sandwich Board.',
  ],
  power: [
    'Clean megawatts with a side of style.',
    'Powered by sunshine, wind and a frankly unreasonable amount of ambition.',
    'Keeps the lights on and the skyline gorgeous.',
  ],
  research: [
    'Currently asking the universe some very pointed questions.',
    'Where eureka moments go to get peer-reviewed.',
    'The antennae are listening. Politely.',
  ],
  decor: [
    'Serves no purpose. Serves it beautifully.',
    'Pure, unapologetic eye candy.',
    'Proof that a city is more than its spreadsheets.',
  ],
};

export function flavorFor(spec: DesignSpec): string {
  const list = FLAVOR[spec.fn] ?? FLAVOR.decor;
  let h = 0;
  for (const ch of spec.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

const NAME_A = ['Aurora', 'Nova', 'Helix', 'Zenith', 'Solstice', 'Vega', 'Orion', 'Halcyon', 'Lumen', 'Quasar', 'Cobalt', 'Ember', 'Polaris', 'Meridian', 'Nimbus', 'Opal', 'Saffron', 'Tidal', 'Vertex', 'Zephyr', 'Atlas', 'Celeste', 'Prism', 'Sable'];
const NAME_B_TALL = ['Spire', 'Tower', 'Needle', 'Pinnacle', 'Heights', 'Obelisk', 'Beacon', 'Monolith'];
const NAME_B_WIDE = ['Pavilion', 'Habitat', 'Commons', 'Arcology', 'Rotunda', 'Hall', 'Terrace', 'Gardens', 'Dome', 'Exchange'];

const NAME_B_KIND: Record<string, string[]> = {
  temple: ['Temple', 'Sanctum', 'Shrine', 'Basilica', 'Pavilion', 'Pagoda'],
  habitat: ['Habitat', 'Biodome', 'Colony', 'Outpost', 'Arcology'],
  eco: ['Gardens', 'Terraces', 'Canopy', 'Commons', 'Greenhouse'],
  monument: ['Monument', 'Memorial', 'Monolith', 'Gate', 'Sculpture'],
};

/** A pleasant generated name (deterministic for a seed); `kind` picks a fitting noun family. */
export function generateName(spec: DesignSpec, seed: number, kind?: string): string {
  const tall = analyze(spec).height > footprintWidth(spec) * 1.6;
  const a = NAME_A[Math.abs(seed) % NAME_A.length];
  const list = (kind && NAME_B_KIND[kind]) || (tall ? NAME_B_TALL : NAME_B_WIDE);
  const b = list[Math.abs(Math.floor(seed / 7)) % list.length];
  return `${a} ${b}`;
}

function footprintWidth(spec: DesignSpec): number {
  return spec.footprint === 1 ? 1.8 : spec.footprint === 7 ? 5 : 8.6;
}
