/**
 * Simulation balance tables (sim-owned). Growable buildings take their capacity / consumption / emissions from
 * these per-zone, per-level tables so balance stays consistent across every art variant the content roles add;
 * a growable def's `effects` only ADD extras (pollution, noise, landValue, happiness, tourism, research).
 *
 * Units: residents & jobs are people; power in MW; water in kL/day; oxygen in units; garbage & data per month;
 * money in credits (₡) per month. Levels are 1..5 (index = level − 1).
 */
import { RoadKind, Zone, type ServiceType, type ZoneFamily } from '../core/types';

export type Density = 'low' | 'med' | 'high';

export interface ZoneParams {
  zone: Zone;
  family: ZoneFamily;
  density: Density;
  /** residents (R) or jobs (C/I/O) per single-tile lot, per level */
  capacity: number[];
  /** MW per lot per level */
  power: number[];
  /** pollution emitted (0..100 scale) per level */
  pollution: number[];
  /** noise emitted (0..100) */
  noise: number;
  /** tourists / month per level (leisure) */
  tourism: number[];
  /** taxable income per occupant / month at this level (before tax rate) */
  taxBase: number[];
  /** research points / month per filled job */
  research: number;
  /** share of jobs that need an educated (1) / highly educated (2) worker */
  eduNeed: [number, number];
  /** data use per occupant per month */
  data: number;
  /** garbage per occupant per month */
  garbage: number;
}

const L = (a: number, b: number, c: number, d: number, e: number) => [a, b, c, d, e];

export const ZONE_PARAMS: Partial<Record<Zone, ZoneParams>> = {
  [Zone.ResLow]: { zone: Zone.ResLow, family: 'R', density: 'low', capacity: L(6, 9, 13, 18, 24), power: L(0.5, 0.6, 0.75, 0.9, 1.1), pollution: L(0, 0, 0, 0, 0), noise: 0, tourism: L(0, 0, 0, 0, 0), taxBase: L(30, 31, 32, 34, 36), research: 0, eduNeed: [0, 0], data: 0, garbage: 0.15 },
  [Zone.ResMed]: { zone: Zone.ResMed, family: 'R', density: 'med', capacity: L(16, 26, 38, 52, 70), power: L(1, 1.4, 1.9, 2.5, 3.2), pollution: L(0, 0, 0, 0, 0), noise: 3, tourism: L(0, 0, 0, 0, 0), taxBase: L(30, 31, 33, 35, 37), research: 0, eduNeed: [0, 0], data: 0.004, garbage: 0.15 },
  [Zone.ResHigh]: { zone: Zone.ResHigh, family: 'R', density: 'high', capacity: L(40, 80, 140, 220, 320), power: L(2.5, 4, 6, 8.5, 11), pollution: L(1, 1, 1, 1, 1), noise: 6, tourism: L(0, 0, 0, 2, 5), taxBase: L(31, 32, 34, 36, 38), research: 0, eduNeed: [0, 0], data: 0.008, garbage: 0.14 },
  [Zone.ComLow]: { zone: Zone.ComLow, family: 'C', density: 'low', capacity: L(4, 6, 9, 13, 18), power: L(1, 1.3, 1.7, 2.2, 2.8), pollution: L(1, 1, 1, 1, 1), noise: 10, tourism: L(1, 1, 2, 3, 4), taxBase: L(85, 88, 92, 96, 100), research: 0, eduNeed: [0, 0], data: 0.01, garbage: 0.12 },
  [Zone.ComHigh]: { zone: Zone.ComHigh, family: 'C', density: 'high', capacity: L(14, 24, 38, 56, 80), power: L(2.5, 3.5, 5, 7, 9), pollution: L(3, 3, 3, 3, 3), noise: 18, tourism: L(3, 5, 8, 12, 18), taxBase: L(88, 91, 95, 99, 104), research: 0, eduNeed: [0.2, 0.05], data: 0.03, garbage: 0.12 },
  [Zone.ComLeisure]: { zone: Zone.ComLeisure, family: 'C', density: 'med', capacity: L(8, 14, 22, 32, 45), power: L(2, 2.8, 3.8, 5, 6.5), pollution: L(2, 2, 2, 2, 2), noise: 30, tourism: L(15, 30, 50, 80, 120), taxBase: L(88, 92, 97, 102, 108), research: 0, eduNeed: [0.1, 0], data: 0.02, garbage: 0.16 },
  [Zone.IndGeneral]: { zone: Zone.IndGeneral, family: 'I', density: 'med', capacity: L(10, 15, 22, 30, 40), power: L(3, 4, 5, 6.5, 8), pollution: L(40, 36, 32, 27, 22), noise: 25, tourism: L(0, 0, 0, 0, 0), taxBase: L(75, 77, 80, 83, 86), research: 0.01, eduNeed: [0.1, 0], data: 0.005, garbage: 0.22 },
  [Zone.IndFarm]: { zone: Zone.IndFarm, family: 'I', density: 'low', capacity: L(6, 9, 12, 16, 20), power: L(1.5, 2, 2.5, 3, 3.6), pollution: L(12, 10, 9, 8, 7), noise: 8, tourism: L(1, 1, 2, 2, 3), taxBase: L(66, 68, 70, 73, 76), research: 0.01, eduNeed: [0, 0], data: 0.002, garbage: 0.18 },
  [Zone.IndMining]: { zone: Zone.IndMining, family: 'I', density: 'med', capacity: L(8, 12, 17, 23, 30), power: L(4, 5, 6, 7, 8), pollution: L(55, 50, 45, 40, 34), noise: 35, tourism: L(0, 0, 0, 0, 0), taxBase: L(82, 84, 87, 90, 93), research: 0.01, eduNeed: [0.05, 0], data: 0.003, garbage: 0.25 },
  [Zone.IndTech]: { zone: Zone.IndTech, family: 'I', density: 'med', capacity: L(10, 18, 28, 42, 60), power: L(3, 4.2, 5.6, 7.2, 9), pollution: L(6, 5, 4, 3, 2), noise: 12, tourism: L(0, 0, 0, 1, 2), taxBase: L(92, 96, 100, 105, 110), research: 0.09, eduNeed: [0.55, 0.2], data: 0.08, garbage: 0.12 },
  [Zone.Office]: { zone: Zone.Office, family: 'O', density: 'high', capacity: L(18, 34, 58, 90, 130), power: L(2.5, 4, 6, 8.5, 11.5), pollution: L(1, 1, 1, 1, 1), noise: 8, tourism: L(0, 0, 1, 2, 4), taxBase: L(100, 104, 109, 114, 120), research: 0.05, eduNeed: [0.6, 0.25], data: 0.1, garbage: 0.1 },
};

/** Water use relative to power use for growables. */
export const WATER_PER_POWER = 0.85;
/** Oxygen per occupant (planets that need oxygen). */
export const OXYGEN_PER_PERSON = 0.06;
/** Share of residents who work. */
export const WORKFORCE_RATIO = 0.56;
/** Construction time in days by density. */
export const BUILD_DAYS: Record<Density, number> = { low: 2, med: 3, high: 4 };
/** Days needed to climb from level L to L+1 under good conditions. */
export function levelUpDays(level: number): number {
  return 10 + level * 7;
}
/** Capacity multiplier for multi-tile lots. */
export function footprintMul(tiles: number): number {
  return tiles <= 1 ? 1 : tiles <= 7 ? tiles * 0.9 : tiles * 0.85;
}

// ─────────────────────────────────────────────── services & departments

export const SERVICES: ServiceType[] = ['police', 'fire', 'health', 'education', 'research', 'leisure', 'transit', 'deathcare', 'garbage', 'data', 'tourism', 'spiritual'];
export const SERVICE_INDEX = Object.fromEntries(SERVICES.map((s, i) => [s, i])) as Record<ServiceType, number>;

export type DeptId =
  | 'power'
  | 'water'
  | 'garbage'
  | 'police'
  | 'fire'
  | 'health'
  | 'education'
  | 'research'
  | 'leisure'
  | 'transit'
  | 'data'
  | 'roads'
  | 'landmarks'
  | 'orbital'
  | 'industry';

export interface DepartmentDef {
  id: DeptId;
  name: string;
  icon: string;
  /** what the budget slider changes, for the budget panel */
  blurb: string;
}

export const DEPARTMENTS: DepartmentDef[] = [
  { id: 'power', name: 'Power', icon: '⚡', blurb: 'Plant output and grid upkeep' },
  { id: 'water', name: 'Water & Air', icon: '💧', blurb: 'Pumping, treatment and oxygen scrubbers' },
  { id: 'garbage', name: 'Sanitation', icon: '♻️', blurb: 'Landfills, recyclers and incinerators' },
  { id: 'police', name: 'Police', icon: '🚓', blurb: 'Patrol coverage and crime response' },
  { id: 'fire', name: 'Fire & Rescue', icon: '🚒', blurb: 'Fire coverage and disaster response' },
  { id: 'health', name: 'Healthcare', icon: '🏥', blurb: 'Clinics, hospitals and med-bays' },
  { id: 'education', name: 'Education', icon: '🎓', blurb: 'Schools, academies and universities' },
  { id: 'research', name: 'Research', icon: '🔬', blurb: 'Labs and observatories — research points' },
  { id: 'leisure', name: 'Parks & Leisure', icon: '🌳', blurb: 'Parks, plazas and venues' },
  { id: 'transit', name: 'Transit', icon: '🚝', blurb: 'Stations, depots and spaceports' },
  { id: 'data', name: 'Data & Comms', icon: '📡', blurb: 'Relays, data centres and the Hypernet' },
  { id: 'roads', name: 'Roads', icon: '🛣️', blurb: 'Road and rail maintenance' },
  { id: 'landmarks', name: 'Landmarks', icon: '🗽', blurb: 'Wonders and monuments' },
  { id: 'orbital', name: 'Orbital', icon: '🛰️', blurb: 'Satellites, stations and megastructures' },
  { id: 'industry', name: 'Special Industry', icon: '🏭', blurb: 'Extractors and unique industry' },
];
export const DEPT_IDS = DEPARTMENTS.map((d) => d.id);

/** Budget slider → effectiveness (0.5 → 0.7, 1 → 1, 1.5 → 1.3). */
export function budgetEffect(mul: number): number {
  return 0.4 + 0.6 * Math.max(0.5, Math.min(1.5, mul));
}

// ─────────────────────────────────────────────── roads

/** Car trips per day a road tile carries before congesting (sim-calibrated, by kind). */
export const ROAD_CAPACITY: number[] = [0, 180, 650, 1600, 3800, 9000, 16000];
/** Monthly upkeep per road tile when the road def has none. */
export const ROAD_UPKEEP: number[] = [0, 1, 3, 8, 18, 24, 38];
/** Rail kinds carry passengers (transit), not cars. */
export function isRail(kind: number): boolean {
  return kind === RoadKind.Maglev || kind === RoadKind.Hyperloop;
}

// ─────────────────────────────────────────────── taxes

export const DEFAULT_TAX = 0.09;
export const MAX_TAX = 0.3;
export const FAMILIES: ZoneFamily[] = ['R', 'C', 'I', 'O'];

/** Population at which garbage starts to matter (tiny towns burn their own trash). */
export const GARBAGE_START_POP = 400;
