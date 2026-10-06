/**
 * Per-building simulation record + problem flags + shared sim-side types.
 * A BRec mirrors one BuildingInstance (live reference `b`) and carries the sim-only state (happiness, level
 * progress, distress timers, education, utility service flags). Records live in a dense array for fast
 * iteration (swap-remove; `idx` tracks the slot).
 */
import type { BuildingInstance } from '../world/planet';
import type { DefInfo } from './defInfo';

/** Building problem bits (shown as ✗ needs / problem icons; see PROBLEM_INFO). */
export const P = {
  NoPower: 1 << 0,
  NoWater: 1 << 1,
  NoOxygen: 1 << 2,
  Garbage: 1 << 3,
  NoData: 1 << 4,
  Pollution: 1 << 5,
  Crime: 1 << 6,
  Noise: 1 << 7,
  NoCustomers: 1 << 8,
  NoWorkers: 1 << 9,
  NoEducated: 1 << 10,
  Taxes: 1 << 11,
  Unemployment: 1 << 12,
  Traffic: 1 << 13,
  Fire: 1 << 14,
  Flood: 1 << 15,
  Radiation: 1 << 16,
  Goo: 1 << 17,
  Frozen: 1 << 18,
  NoRoad: 1 << 19,
  Unhappy: 1 << 20,
  NoHealth: 1 << 21,
} as const;

export interface ProblemInfo {
  bit: number;
  id: string;
  label: string;
  icon: string;
  /** advice shown by the advisor / problems list */
  fix: string;
  severe: boolean;
}

export const PROBLEM_INFO: ProblemInfo[] = [
  { bit: P.NoPower, id: 'power', label: 'No power', icon: '⚡', fix: 'Build power plants or connect this area to the grid with roads.', severe: true },
  { bit: P.NoWater, id: 'water', label: 'No water', icon: '💧', fix: 'Build water pumps or towers on the same road network.', severe: true },
  { bit: P.NoOxygen, id: 'oxygen', label: 'No oxygen', icon: '🫁', fix: 'This world has no breathable air — build oxygen generators.', severe: true },
  { bit: P.Garbage, id: 'garbage', label: 'Garbage piling up', icon: '🗑️', fix: 'Build landfills, recyclers or incinerators.', severe: true },
  { bit: P.NoData, id: 'data', label: 'No data uplink', icon: '📡', fix: 'Offices and tech industry need data centres or relays.', severe: false },
  { bit: P.Pollution, id: 'pollution', label: 'Polluted', icon: '☁️', fix: 'Keep homes away from heavy industry; plant parks.', severe: false },
  { bit: P.Crime, id: 'crime', label: 'High crime', icon: '🦹', fix: 'Build police stations nearby.', severe: false },
  { bit: P.Noise, id: 'noise', label: 'Noisy', icon: '🔊', fix: 'Buffer homes from busy roads and nightlife.', severe: false },
  { bit: P.NoCustomers, id: 'customers', label: 'Not enough customers', icon: '🛍️', fix: 'Zone more residential or attract tourists.', severe: false },
  { bit: P.NoWorkers, id: 'workers', label: 'Not enough workers', icon: '👷', fix: 'Zone more residential.', severe: false },
  { bit: P.NoEducated, id: 'educated', label: 'Needs educated workers', icon: '🎓', fix: 'Build schools and universities.', severe: false },
  { bit: P.Taxes, id: 'taxes', label: 'Taxes too high', icon: '💸', fix: 'Lower taxes in the budget panel.', severe: false },
  { bit: P.Unemployment, id: 'jobs', label: 'Unemployed residents', icon: '📉', fix: 'Zone commercial, industry or offices.', severe: false },
  { bit: P.Traffic, id: 'traffic', label: 'Gridlocked', icon: '🚗', fix: 'Upgrade roads to avenues, add transit.', severe: false },
  { bit: P.Fire, id: 'fire', label: 'On fire!', icon: '🔥', fix: 'Fire stations nearby put fires out.', severe: true },
  { bit: P.Flood, id: 'flood', label: 'Flooded', icon: '🌊', fix: 'Wait for the waters to recede — or terraform.', severe: true },
  { bit: P.Radiation, id: 'radiation', label: 'Irradiated', icon: '☢️', fix: 'Residents flee radiation. It decays slowly.', severe: true },
  { bit: P.Goo, id: 'goo', label: 'Grey goo', icon: '🦠', fix: 'Nanites are eating the block.', severe: true },
  { bit: P.Frozen, id: 'frozen', label: 'Frozen solid', icon: '🧊', fix: 'It will thaw… eventually.', severe: false },
  { bit: P.NoRoad, id: 'road', label: 'No road access', icon: '🛣️', fix: 'Connect the lot to a road.', severe: false },
  { bit: P.Unhappy, id: 'unhappy', label: 'Very unhappy', icon: '😠', fix: 'Improve services, lower taxes, add parks.', severe: false },
  { bit: P.NoHealth, id: 'health', label: 'Sick residents', icon: '🤒', fix: 'Build clinics and hospitals.', severe: false },
];

export const SEVERE_MASK = PROBLEM_INFO.filter((p) => p.severe).reduce((a, p) => a | p.bit, 0);

/** Utility channels (network supply/demand arrays index). */
export const U = { Power: 0, Water: 1, Oxygen: 2, Garbage: 3, Data: 4 } as const;
export const U_COUNT = 5;
export const U_NAMES = ['power', 'water', 'oxygen', 'garbage', 'data'] as const;

export class BRec {
  idx = -1;
  /** utility network id (−1 isolated) */
  net = -1;
  /** 0..1 stable hash for utility rationing */
  h = 0;
  happiness = 60;
  /** 0..1 progress toward the next level */
  lvlProgress = 0;
  /** days of severe distress (→ abandonment) */
  distress = 0;
  /** days spent abandoned / ruined (→ collapse) */
  abandonDays = 0;
  /** days without garbage pickup */
  garbage = 0;
  /** average education of occupants 0..2 */
  edu = 0;
  burnDays = 0;
  floodDays = 0;
  /** days under radiation / goo / frost */
  hazardDays = 0;
  /** days with target level well below current (→ downgrade) */
  lowDays = 0;
  problems = 0;
  /** filled jobs */
  workers = 0;
  /** residents (R / housing) or job slots (workplaces) at current level */
  capacity = 0;
  /** residents (for R or housing) — mirrors b.occupants for homes */
  residents = 0;
  served = 0b11111;
  // consumption snapshot (per day / month units, after mods)
  powerUse = 0;
  waterUse = 0;
  oxygenUse = 0;
  garbageGen = 0;
  dataUse = 0;
  /** taxes paid last month (₡) */
  taxPaid = 0;
  /** desired level */
  target = 1;
  /** visitors / month (tourism) */
  visitors = 0;
  /** cached road adjacency (see Simulation.roadVersion) */
  roadVer = -1;
  roadTile = -1;
  hasRoad = true;
  constructor(public b: BuildingInstance, public info: DefInfo) {}
  get id(): number {
    return this.b.id;
  }
}

export interface DemandReason {
  text: string;
  /** signed contribution to the demand bar (−1..1) */
  weight: number;
  icon?: string;
  /** explanation of why growth is stalled (weight 0) */
  blocker?: boolean;
}

export interface MonthReport {
  day: number;
  income: Record<string, number>;
  expenses: Record<string, number>;
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

export interface Loan {
  id: number;
  lender: string;
  principal: number;
  remaining: number;
  /** annual interest rate */
  rate: number;
  monthlyPayment: number;
  monthsLeft: number;
  takenDay: number;
}

export interface LoanOffer {
  lender: string;
  icon: string;
  amount: number;
  rate: number;
  months: number;
  monthlyPayment: number;
  blurb: string;
}

export interface CityEvent {
  id: string;
  name: string;
  icon: string;
  description: string;
  daysLeft: number;
  tile?: number;
}

export interface CityHistory {
  day: number[];
  population: number[];
  happiness: number[];
  income: number[];
  jobs: number[];
  landValue: number[];
  pollution: number[];
  crime: number[];
  traffic: number[];
  tourism: number[];
}

export interface ProblemSummary {
  id: string;
  label: string;
  icon: string;
  fix: string;
  count: number;
  /** example tile to fly to */
  tile: number;
  severe: boolean;
}

export interface SandboxRules {
  /** utilities always fully supplied */
  freeUtilities: boolean;
  /** buildings never get abandoned or collapse */
  noAbandon: boolean;
  /** growth ×3, construction instant */
  fastGrowth: boolean;
  /** demand pinned high */
  maxDemand: boolean;
}

export interface DistrictStats {
  id: number;
  population: number;
  jobs: number;
  workers: number;
  buildings: number;
  happiness: number;
  landValue: number;
  crime: number;
  pollution: number;
  policyCost: number;
}
