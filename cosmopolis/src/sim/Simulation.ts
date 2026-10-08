/**
 * OWNER: sim.
 * Simulation — the city model of the active planet: RCI(O) demand with causes, zoned growth & levelling,
 * construction, abandonment & collapse, utilities on road/building networks (power / water / oxygen / garbage /
 * data, rationed in neighbourhood blocks), service coverage with capacity, land value, pollution, noise, crime,
 * health, education, happiness, traffic, tourism, research, economy (taxes, upkeep × budget, loans, monthly
 * reports, bankruptcy bailout), districts & 29 policies, 25 lenses, disaster interplay (fire spread, floods,
 * radiation, goo, shelters & shields), city events, Hypernet citizen chatter, and inactive-colony income.
 *
 * Timing: whole sim days arrive via tick(days). The per-building pass is ROLLED across the frames of each day
 * (update() processes buildings in proportion to clock.dayFraction) and the field pass is a time-budgeted
 * generator, so no frame pays for a whole day. tick() finishes whatever is left (headless tests work too).
 *
 * CONTRACT (used by UI, progression, overlays, god powers):
 *   tick(days)                            called by Game with whole elapsed sim days (update(dt) amortises work)
 *   stats: Record<string, number>         every MetricId + extras (powerDemand, workers, jobsCommercial, debt,
 *                                         utilitiesFree bitmask, demandR…, realHappiness…) → ui.stats
 *   demand: { R, C, I, O }                −1..1            demandReasons() → named causes (+ blockers) per family
 *   lenses: LensDef[]                     25 overlay maps (values 0..1, NaN = no data)
 *   policies: PolicyDef[]                 29 policies (SimPolicyDef: effects[], category, satire, mods)
 *       setPolicy(id, on, district=0) · isPolicyOn(id, district) · policyCost(id, district)
 *   taxes: { R, C, I, O }                 0..0.3 (UI sliders; or setTax(fam, v))
 *   budget: Record<DeptId, number>        department funding 0.5..1.5 (or setBudget(dept, v))
 *   departments · departmentUpkeep() · incomeLabels · expenseLabels   budget panel rows
 *   lastMonth / projectedMonth()          MonthReport { income{}, expenses{}, totalIncome, totalExpenses, net }
 *   loans · loanOffers() · takeLoan(amount?, lender?) · repay(id?)
 *   getMetric(id): number
 *   inspectBuilding(id) / inspectTile(tile): InspectRow[]
 *   colonySummary(): ColonySummary        for the empire when leaving the planet
 *   damageResistance(tile) 0..1           shields / blessings / shelters (also exported as a module function)
 *   problemsSummary() · problemsOf(id) · troubledBuildings() · advisor()   problem icons, advice cards
 *   districtStats(id) · cityHistory() · citizenSpotlight() · events (active city events) · season()
 *   areaName(tile) · roadName(tile)        generated neighbourhood / street names (districts win)
 *   rules: SandboxRules · setRule(id, on)  sandbox toggles: freeUtilities, noAbandon, fastGrowth, maxDemand
 *   trafficAt(tile) (0..1.5 congestion, −1 off-road) · coverageAt(service, tile) — for the life renderer
 * Events: emits 'sim:day' and 'sim:month'; posts Hypernet news (ui/store pushNews) and toasts (notify, with tiles).
 * Tile flags: decays Frozen, Scorched, Irradiated, Goo and recedes Flooded on dry land; spreads / fights Burning.
 * Persistence: everything lives in planet.simData.sim (live toJSON while active, plain JSON when unloaded).
 */
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import type { InspectRow, MetricId, ServiceType } from '../core/types';
import { BuildingState, TileFlag } from '../core/types';
import { bus, type RemoveCause } from '../core/events';
import type { Planet } from '../world/planet';
import type { ColorRamp } from '../render/planet/PlanetSurface';
import type { ColonySummary } from '../game/Empire';
import { catalogVersion, getItem } from '../content/catalog';
import { PLANET_TYPES } from '../content/planetTypes';
import { notify, pushNews, ui } from '../ui/store';
import { game as gameInstance } from '../game/instance';
import { b64ToBytes, bytesToB64 } from '../core/b64';
import { Agg } from './agg';
import { BRec, P, PROBLEM_INFO, U, U_COUNT, type CityEvent, type CityHistory, type DemandReason, type DistrictStats, type Loan, type LoanOffer, type MonthReport, type ProblemSummary, type SandboxRules } from './state';
import { DEFAULT_TAX, DEPARTMENTS, DEPT_IDS, FAMILIES, GARBAGE_START_POP, MAX_TAX, SERVICE_INDEX, budgetEffect, type DeptId } from './params';
import { POLICIES, POLICY_MAP, applyPatch, baseMods, modsFor, type Mods, type SimPolicyDef } from './policies';
import { catalogCaps, clearDefInfo, defInfo } from './defInfo';
import { Fields, type FieldContext } from './fields';
import { Networks } from './networks';
import { Growth, roadFacing } from './growth';
import { Hazards, resistanceAt } from './hazards';
import { SV_DATA, SV_GARBAGE, SV_OXYGEN, SV_POWER, SV_WATER, capacityOf, refreshServed, updateRec } from './buildings';
import { computeDemand, type Fam } from './demand';
import { computeReport, departmentUpkeep, invalidateEconomyCache, loanOffers, payLoans, annuity, LENDERS, INCOME_LABELS, EXPENSE_LABELS, type EconomyContext } from './economy';
import { makeLenses } from './lenses';
import { inspectBuilding, inspectTile } from './inspect';
import { SimRng, hash01 } from './rng';
import { CHARACTERS, areaName as areaNameAt, citizenJob, line, randomPersona, residentQuote, streetName, towerName, type Persona } from './chatter';
import { CITY_EVENTS } from './cityEvents';

export interface LensDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  group?: string;
  ramp: ColorRamp;
  /** [low label, high label] */
  legend: [string, string];
  /** per-tile values 0..1 for the active planet (NaN = no data, transparent) */
  values(planet: Planet): ArrayLike<number>;
}

export interface PolicyDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** monthly cost (+) or income (−) per 1 000 citizens */
  costPer1k: number;
  scope: 'city' | 'district' | 'both';
  tier?: number;
}

export type { DemandReason, MonthReport, Loan, LoanOffer, ProblemSummary, SandboxRules, CityEvent, CityHistory, DistrictStats, SimPolicyDef, DeptId };
export { DEPARTMENTS, PROBLEM_INFO };

const HISTORY_MAX = 240;
const SAVE_VERSION = 1;
/** max ms of field-pass work per frame */
const FIELD_BUDGET_MS = 1.0;

interface SavedState {
  v: number;
  day: number;
  rng: number;
  taxes: { R: number; C: number; I: number; O: number };
  budget: Record<string, number>;
  loans: Loan[];
  lastMonth: MonthReport | null;
  rules: SandboxRules;
  events: CityEvent[];
  history: CityHistory;
  demand: { R: number; C: number; I: number; O: number };
  notes: Record<string, number>;
  hints: string[];
  negMonths: number;
  prevTaxes: { R: number; C: number; I: number; O: number };
  displaced: number;
  nextLoanId: number;
  milestonesPop: number;
  recs: { id: number[]; hap: number[]; lp: number[]; dis: number[]; ab: number[]; gb: number[]; edu: number[]; burn: number[]; flood: number[]; haz: number[]; low: number[] };
  fields?: { pol: string; lv: string; crime: string; noise: string };
  /** residents of orbital habitats by orbital id */
  orbitalRes?: Record<string, number>;
}

function emptyHistory(): CityHistory {
  return { day: [], population: [], happiness: [], income: [], jobs: [], landValue: [], pollution: [], crime: [], traffic: [], tourism: [] };
}

function defaultBudget(): Record<string, number> {
  return Object.fromEntries(DEPT_IDS.map((d) => [d, 1]));
}

export class Simulation implements System {
  // ───────────────────────────── contract surface
  stats: Record<string, number> = { population: 0, happiness: 50, jobs: 0 };
  demand = { R: 0.6, C: 0.3, I: 0.4, O: 0 };
  lenses: LensDef[] = [];
  policies: PolicyDef[] = POLICIES;
  taxes = { R: DEFAULT_TAX, C: DEFAULT_TAX, I: DEFAULT_TAX, O: DEFAULT_TAX };
  budget: Record<string, number> = defaultBudget();
  readonly departments = DEPARTMENTS;
  /** display names for MonthReport.income / .expenses keys (budget panel) */
  readonly incomeLabels = INCOME_LABELS;
  readonly expenseLabels = EXPENSE_LABELS;
  lastMonth: MonthReport | null = null;
  loans: Loan[] = [];
  rules: SandboxRules = { freeUtilities: false, noAbandon: false, fastGrowth: false, maxDemand: false };
  events: CityEvent[] = [];
  history: CityHistory = emptyHistory();

  // ───────────────────────────── internals (read by helper modules)
  planet: Planet | null = null;
  fields: Fields | null = null;
  nets: Networks | null = null;
  growth: Growth | null = null;
  hazards: Hazards | null = null;
  recs: BRec[] = [];
  recMap = new Map<number, BRec>();
  rng = new SimRng(1);
  cityMods: Mods = baseMods();
  eventMods: Mods = baseMods();
  private districtMods: (Mods | null)[] = [];
  acc = new Agg();
  agg = new Agg();
  /** labour fill ratio per family index (0 —, 1 C, 2 I, 3 O, 4 ploppables) */
  fill = new Float32Array(5).fill(1);
  skillFill = 1;
  workerEdu = 0;
  custFactor = 1;
  needsOxygen = false;
  garbageActive = false;
  dataSupply = 0;
  /** utility service bits granted for free (sandbox rule, or nothing in the catalog can produce them) */
  exempt = 0;
  /** survivors of destroyed homes looking for housing (decays) */
  displaced = 0;
  /** current sim day (integer) */
  day = 0;
  /** true during load-time settle passes (no time advances) */
  settling = false;
  /** bumped whenever roads change (buildings re-check their road access lazily) */
  roadVersion = 0;
  private roadCounts = new Int32Array(8);
  private roadCountVer = -1;

  private reasons: Record<Fam, DemandReason[]> = { R: [], C: [], I: [], O: [] };
  private cursor = 0;
  private fieldJob: Generator<void, void, void> | null = null;
  private fieldJobDay = 0;
  private nextFieldDay = 0;
  private fieldsDirty = true;
  private pendingRemove = new Map<number, RemoveCause>();
  private pendingLevel = new Map<number, number>();
  private pendingIgnite: number[] = [];
  private carry: { residents: number; happiness: number; edu: number; distress: number } | null = null;
  private offs: (() => void)[] = [];
  private globalOffs: (() => void)[] = [];
  private notes: Record<string, number> = {};
  private hints = new Set<string>();
  private negMonths = 0;
  private prevTaxes = { R: DEFAULT_TAX, C: DEFAULT_TAX, I: DEFAULT_TAX, O: DEFAULT_TAX };
  private nextLoanId = 1;
  private milestonesPop = 0;
  private newsQueue: { persona: Persona; text: string; tile?: number }[] = [];
  private lastNewsReal = -1e9;
  private nextFlavourDay = 8;
  private projected: MonthReport | null = null;
  private orbitalCoverage = new Float32Array(SERVICE_INDEX.spiritual + 1);
  /** residents living in orbital habitats (orbital id → people) */
  private orbitalRes = new Map<number, number>();
  private ctx: FieldContext | null = null;
  private liveRef: LiveSimState | null = null;
  private abandonCause = new Map<number, string>();
  private lastAbandonNotice = -999;
  private abandonedToday = 0;
  private catVer = -1;
  private fieldsRestored = false;
  private lastPausedRefresh = 0;
  private policySig = '';
  private ambientSig = '';
  private lastSeason = '';
  private projectedAt = -1e9;
  /** buildings changed since the last utilities resolve */
  private utilDirty = false;
  private realNotes = new Map<string, number>();

  constructor(private game: Game) {
    this.lenses = makeLenses(this);
  }

  // ───────────────────────────── system lifecycle

  init(): void {
    this.globalOffs.push(
      bus.on('catalog:changed', () => this.onCatalogChanged()),
      bus.on('disaster:start', ({ powerId, tile }) => this.onDisaster(powerId, true, tile)),
      bus.on('disaster:end', ({ powerId }) => this.onDisaster(powerId, false)),
      bus.on('milestone:reached', ({ goalId }) => this.onMilestone(goalId)),
      bus.on('unlock', ({ kind, id }) => {
        if (kind === 'tier' && this.planet) this.post(CHARACTERS.news, line(this.rng, 'milestone', this.vars({ thing: tierLabel(id) })));
      }),
    );
  }

  get ops() {
    return this.game.ops;
  }
  get sandbox(): boolean {
    return this.game.empire.sandbox;
  }

  onPlanetLoaded(planet: Planet): void {
    try {
      this.setupPlanet(planet);
    } catch (e) {
      console.error('[sim] failed to load planet state — starting fresh', e);
      planet.simData.sim = undefined;
      this.setupPlanet(planet);
    }
  }

  private setupPlanet(planet: Planet): void {
    this.teardown();
    this.planet = planet;
    this.fields = new Fields(planet);
    this.nets = new Networks(planet);
    this.growth = new Growth(planet);
    this.hazards = new Hazards(this);
    const arch = PLANET_TYPES[planet.spec.type];
    this.needsOxygen = arch ? arch.needsOxygen : !planet.spec.atmosphere.breathable;
    this.day = Math.floor(this.game.clock?.day ?? 0);
    this.rng = new SimRng((planet.spec.seed ^ 0x51ed) + this.day);
    this.recs = [];
    this.recMap.clear();
    this.cursor = 0;
    this.roadVersion++;
    this.pendingRemove.clear();
    this.pendingLevel.clear();
    this.abandonCause.clear();
    this.newsQueue = [];
    this.fieldJob = null;
    this.acc.reset();
    this.agg.reset();
    this.fill.fill(1);
    const saved = planet.simData.sim as SavedState | { toJSON(): SavedState } | undefined;
    const state: SavedState | null = saved ? ('toJSON' in saved && typeof saved.toJSON === 'function' ? saved.toJSON() : (saved as SavedState)) : null;
    this.restoreGlobals(state);
    this.refreshExempt();
    this.recomputeMods();
    for (const b of planet.buildings.values()) this.addRec(b.id, true);
    if (state) this.restoreRecs(state);
    this.subscribe();
    // settle: build networks, aggregates and fields without advancing time
    this.nets.rebuild();
    this.hazards.scanAll();
    this.fields.computeLvBase();
    this.fieldsRestored = false;
    if (state?.fields) this.restoreFields(state.fields);
    this.settle();
    this.liveRef = new LiveSimState();
    LIVE.set(this.liveRef, this);
    planet.simData.sim = this.liveRef;
    this.publishStats();
    this.projected = this.report(false);
    this.publishStats();
  }

  /** Load-time passes: aggregates → networks → fields → aggregates, with time frozen. */
  private settle(): void {
    this.settling = true;
    try {
      for (let pass = 0; pass < 2; pass++) {
        this.nets!.beginDay();
        this.acc.reset();
        for (const r of this.recs) updateRec(this, r);
        this.accumulateOrbitals();
        this.swapAgg();
        this.addOrbitals();
        this.nets!.resolve(this.rules.freeUtilities);
        if (pass === 0) this.flushFields(true);
      }
      this.nets!.beginDay();
      this.flushFields(true);
      const res = computeDemand(this);
      this.reasons = res.reasons;
    } finally {
      this.settling = false;
    }
  }

  onPlanetUnloading(planet: Planet): void {
    if (planet !== this.planet) return;
    try {
      planet.simData.sim = this.serialize();
    } catch (e) {
      console.error('[sim] serialize failed', e);
    }
    this.teardown();
    this.planet = null;
  }

  private teardown(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
    this.fields?.dispose();
    this.fieldJob = null;
  }

  dispose(): void {
    this.teardown();
    this.globalOffs.forEach((f) => f());
    this.globalOffs = [];
  }

  private subscribe(): void {
    const p = this.planet!;
    this.offs.push(
      bus.on('building:added', ({ id }) => this.addRec(id, false)),
      bus.on('building:removed', ({ id, tiles, cause }) => this.removeRec(id, tiles, cause)),
      bus.on('tiles:zone', () => {
        this.growth!.dirty = true;
      }),
      bus.on('tiles:road', () => {
        this.roadVersion++;
        this.growth!.dirty = true;
        this.nets!.dirty = true;
        this.fields!.roadsDirty = true;
        this.fieldsDirty = true;
      }),
      bus.on('tiles:terrain', ({ tiles }) => {
        this.fields!.terrainChanged(tiles);
        this.growth!.dirty = true;
      }),
      bus.on('planet:sea', () => {
        this.fields!.lvBaseDirty = true;
        this.growth!.dirty = true;
        this.fieldsDirty = true;
      }),
      bus.on('tiles:flags', ({ tiles }) => {
        this.hazards!.onFlags(tiles);
        this.growth!.dirty = true;
      }),
      bus.on('orbital:added', () => (this.fieldsDirty = true)),
      bus.on('orbital:removed', () => (this.fieldsDirty = true)),
    );
    void p;
  }

  // ───────────────────────────── records

  private addRec(id: number, loading: boolean): void {
    const p = this.planet;
    if (!p || this.recMap.has(id)) return;
    const b = p.buildings.get(id);
    if (!b) return;
    const info = defInfo(b.defId);
    if (!info) return;
    const r = new BRec(b, info);
    const cx = p.grid.center[b.tile * 3], cy = p.grid.center[b.tile * 3 + 1], cz = p.grid.center[b.tile * 3 + 2];
    const cell = (Math.floor(cx * 9) * 73856093) ^ (Math.floor(cy * 9) * 19349663) ^ (Math.floor(cz * 9) * 83492791);
    r.h = hash01(cell) * 0.7 + hash01(id * 2654435761) * 0.3;
    r.edu = this.agg.education * 0.6;
    if (info.fam === 0 || info.housing > 0 || info.extraHousing > 0) r.residents = b.occupants ?? 0;
    else r.workers = b.occupants ?? 0;
    if (this.carry) {
      r.residents = info.fam === 0 ? this.carry.residents : r.residents;
      r.happiness = this.carry.happiness;
      r.edu = this.carry.edu;
      r.distress = this.carry.distress;
      this.carry = null;
    }
    r.idx = this.recs.length;
    this.recs.push(r);
    this.recMap.set(id, r);
    this.utilDirty = true;
    if (loading) return;
    // placed ready-made (sandbox demo, showroom, god "instant city"): move people in straight away
    if (b.state === BuildingState.Active && !b.occupants && info.growable && !this.settling) {
      const cap = capacityOf(info, b.level, b.tiles.length, this.modsAt(p.district[b.tile]).industryJobs);
      if (cap.homeCap > 0) {
        r.residents = Math.round(cap.homeCap * 0.85);
        b.occupants = r.residents;
        this.stats.population = (this.stats.population ?? 0) + r.residents;
      } else {
        r.workers = Math.round(cap.jobCap * 0.8);
        b.occupants = r.workers;
      }
    }
    this.nets?.join(b.tiles);
    this.growth!.dirty = true;
    if (!info.growable) {
      this.fieldsDirty = true;
      this.onPlopped(r);
    }
  }

  private removeRec(id: number, tiles: number[], cause: RemoveCause): void {
    const r = this.recMap.get(id);
    if (!r) return;
    this.recMap.delete(id);
    this.utilDirty = true;
    const last = this.recs.pop()!;
    if (last !== r) {
      this.recs[r.idx] = last;
      last.idx = r.idx;
    }
    const f = this.fields;
    if (f) for (const t of tiles) (f.residents[t] = 0), (f.workers[t] = 0);
    this.nets && (this.nets.dirty = true);
    this.growth && (this.growth.dirty = true);
    if (!r.info.growable) this.fieldsDirty = true;
    this.pendingRemove.delete(id);
    this.pendingLevel.delete(id);
    this.abandonCause.delete(id);
    if (cause === 'disaster') this.casualties(r);
    if (cause === 'upgrade') this.carry = { residents: r.residents, happiness: r.happiness, edu: r.edu, distress: r.distress };
  }

  private onCatalogChanged(): void {
    clearDefInfo();
    invalidateEconomyCache();
    this.growth?.invalidateCatalog();
    for (const r of this.recs) {
      const info = defInfo(r.b.defId);
      if (info) r.info = info;
    }
    this.refreshExempt();
    this.fieldsDirty = true;
    this.catVer = catalogVersion();
  }

  // ───────────────────────────── helpers used by buildings.ts

  modsAt(district: number): Mods {
    if (district > 0) {
      const m = this.districtMods[district];
      if (m) return m;
    }
    return this.cityMods;
  }

  taxRate(fam: number): number {
    return fam === 0 ? this.taxes.R : fam === 1 ? this.taxes.C : fam === 2 ? this.taxes.I : this.taxes.O;
  }

  maxLevelFor(zone: number, district: number): number {
    let m = this.growth?.maxLevel(zone) ?? 5;
    if (zone >= 1 && zone <= 6) m = Math.min(m, this.modsAt(district).maxLevelRC);
    return Math.max(1, m);
  }

  queueRemoval(id: number, cause: RemoveCause): void {
    if (this.settling) return;
    this.pendingRemove.set(id, cause);
  }

  queueIgnite(tiles: readonly number[]): void {
    if (this.settling) return;
    for (const t of tiles) this.pendingIgnite.push(t);
  }

  queueLevel(r: BRec, level: number): void {
    if (this.settling) return;
    this.pendingLevel.set(r.id, level);
  }

  abandon(r: BRec, cause: string): void {
    if (this.settling || r.b.state === BuildingState.Abandoned) return;
    this.ops?.updateBuilding(r.id, { state: BuildingState.Abandoned, occupants: 0 });
    r.residents = 0;
    r.workers = 0;
    r.abandonDays = 0;
    r.distress = 0;
    this.abandonCause.set(r.id, cause);
    this.abandonedToday++;
  }

  recover(r: BRec): void {
    if (this.settling) return;
    const lvl = Math.max(1, r.b.level - 1);
    this.ops?.updateBuilding(r.id, { state: BuildingState.Active, level: lvl });
    r.abandonDays = 0;
    r.distress = 0;
    r.hazardDays = 0;
    this.abandonCause.delete(r.id);
  }

  abandonReason(r: BRec): string {
    const c = this.abandonCause.get(r.id);
    const map: Record<string, string> = { oxygen: 'no oxygen', power: 'no power', water: 'no water', garbage: 'buried in garbage', unhappy: 'residents left unhappy', radiation: 'radiation', goo: 'grey goo', flood: 'flooded' };
    return c ? map[c] ?? c : 'conditions were poor';
  }

  completeConstruction(r: BRec): void {
    if (this.settling) return;
    this.ops?.updateBuilding(r.id, { state: BuildingState.Active, progress: 1 });
  }

  noteFireStart(tile: number): void {
    if (this.cool('fire', 8)) {
      this.toast('fire', { title: 'Fire!', body: 'A building is burning. Fire stations nearby will respond.', icon: '🔥', kind: 'bad', tile });
      this.post(this.persona(), line(this.rng, 'fire', this.vars()), tile);
    }
  }

  noteFireLoss(tile: number): void {
    if (this.cool('fireloss', 10)) this.toast('fireloss', { title: 'Building lost to fire', body: 'Build fire stations to protect your city.', icon: '🚒', kind: 'bad', tile });
  }

  damageResistance(tile: number): number {
    return resistanceAt(this, tile);
  }

  // ───────────────────────────── frame & day loop

  update(_dt: number): void {
    const p = this.planet;
    if (!p || !this.fields) return;
    try {
      const t0 = performance.now();
      const clock = this.game.clock;
      if (clock.speed > 0 && this.recs.length) {
        const target = Math.min(this.recs.length, Math.floor(clock.dayFraction * this.recs.length));
        while (this.cursor < target) updateRec(this, this.recs[this.cursor++]);
      } else if (clock.speed === 0) this.pausedRefresh(t0);
      if (this.fieldJob) {
        const budget = Math.max(0.35, FIELD_BUDGET_MS - (performance.now() - t0));
        const end = performance.now() + budget;
        while (this.fieldJob && performance.now() < end) {
          if (this.fieldJob.next().done) this.fieldJob = null;
        }
      }
      this.flushNews(false);
    } catch (e) {
      console.error('[sim] update failed', e);
      this.fieldJob = null;
    }
  }

  /**
   * While paused, keep the map honest after edits: re-resolve utility networks (so a new power plant lights its
   * grid in the lenses / inspector) and refresh coverage fields. Throttled; restarts the current day's pass.
   */
  private pausedRefresh(now: number): void {
    if (now - this.lastPausedRefresh < 400) return;
    const nets = this.nets!;
    if (nets.dirty || this.utilDirty) {
      this.lastPausedRefresh = now;
      this.utilDirty = false;
      if (nets.dirty) nets.rebuild();
      this.reaccumulate();
      this.addOrbitals();
      nets.resolve(this.rules.freeUtilities);
      nets.beginDay();
      this.cursor = 0;
      this.acc.reset();
      for (const r of this.recs) refreshServed(this, r);
    }
    if (this.fieldsDirty && !this.fieldJob) {
      this.lastPausedRefresh = now;
      this.startFieldJob();
    }
  }

  tick(days: number): void {
    if (!this.planet) return;
    for (let i = 0; i < days; i++) {
      try {
        this.finishDay();
      } catch (e) {
        console.error('[sim] day failed', e);
        this.cursor = 0;
      }
    }
    // stay locked to the global calendar (months are shared by every colony)
    const cal = Math.floor(this.game.clock?.day ?? this.day);
    if (cal > this.day) this.day = cal;
  }

  private swapAgg(): void {
    const done = this.acc;
    this.acc = this.agg;
    this.agg = done;
    this.acc.reset();
    this.agg.derive(this.cityMods.workforce, this.fill);
    this.skillFill = this.agg.skillFill;
    this.workerEdu = this.agg.workerEdu;
    // sightseers at road-accessible ancient ruins
    if (this.fields) this.agg.visitors += this.fields.ruinsReachable * 45 * this.cityMods.tourism * this.eventMods.tourism;
    const shoppers = this.agg.population * 0.13 + (this.agg.visitors / 30) * 0.35;
    this.custFactor = this.agg.jobs[1] > 0 ? Math.max(0.4, Math.min(1.2, shoppers / this.agg.jobs[1])) : 1;
    this.refreshExempt();
    this.garbageActive = this.agg.population >= GARBAGE_START_POP && !(this.exempt & SV_GARBAGE);
  }

  private refreshExempt(): void {
    if (this.rules.freeUtilities) {
      this.exempt = 31;
      return;
    }
    const c = catalogCaps();
    this.exempt = (c.power ? 0 : SV_POWER) | (c.water ? 0 : SV_WATER) | (c.oxygen ? 0 : SV_OXYGEN) | (c.garbage ? 0 : SV_GARBAGE) | (c.data ? 0 : SV_DATA);
  }

  private addOrbitals(): void {
    const p = this.planet!;
    const g = this.nets!.global;
    this.orbitalCoverage.fill(0);
    for (const o of p.orbitals.values()) {
      const info = defInfo(o.defId);
      if (!info) continue;
      const eff = info.dept ? budgetEffect(this.budget[info.dept] ?? 1) : 1;
      g[U.Power] += info.powerOut * eff;
      g[U.Water] += info.waterOut * eff;
      g[U.Oxygen] += info.oxygenOut * eff;
      g[U.Data] += info.dataCap * eff;
      g[U.Garbage] += info.garbageCap * eff;
      for (const c of info.coverage) {
        const si = SERVICE_INDEX[c.service];
        if (si !== undefined) this.orbitalCoverage[si] = Math.min(1, this.orbitalCoverage[si] + c.strength * eff * (c.radius >= 30 ? 1 : 0.5));
      }
    }
  }

  /**
   * Orbital effects that live in the daily aggregates: habitats house people (they move in gradually, like
   * homes on the ground), stations employ crews, labs produce research and attractions draw tourists.
   * Orbitals sit above every network, so they are always served; their department budget scales output.
   */
  private accumulateOrbitals(): void {
    const p = this.planet;
    if (!p || !p.orbitals.size) {
      if (this.orbitalRes.size) this.orbitalRes.clear();
      return;
    }
    const acc = this.acc;
    const mods = this.cityMods;
    for (const o of p.orbitals.values()) {
      const info = defInfo(o.defId);
      if (!info) continue;
      const eff = info.dept ? budgetEffect(this.budget[info.dept] ?? 1) : 1;
      if (info.housing > 0) {
        const cap = info.housing;
        let res = Math.min(cap, this.orbitalRes.get(o.id) ?? 0);
        if (!this.settling) {
          const target = cap * (this.demand.R < -0.45 ? 0.9 : 1);
          if (res < target) res = Math.min(target, res + Math.max(2, cap * 0.08) * (this.demand.R > -0.2 ? 1 : 0.3) * (this.rules.fastGrowth ? 3 : 1));
          else res -= Math.ceil((res - target) * 0.25);
          res = Math.max(0, Math.round(res));
          this.orbitalRes.set(o.id, res);
        }
        // spacefarers are well educated: mostly educated, some graduates
        acc.eduRes[1] += res * 0.7;
        acc.eduRes[2] += res * 0.3;
        acc.population += res;
        acc.housingCap += cap;
        acc.healthSum += 70 * res;
        acc.healthW += res;
        acc.eduSum += 1.3 * res;
        acc.eduW += res;
        acc.happySum += 68 * res;
        acc.happyW += res;
      }
      if (info.jobs > 0) {
        acc.jobs[4] += info.jobs * eff;
        acc.jobsE1[4] += info.jobs * eff * 0.45;
        acc.jobsE2[4] += info.jobs * eff * 0.25;
        acc.workers[4] += Math.round(info.jobs * eff * this.fill[4]);
      }
      if (info.research > 0) acc.research += info.research * eff * mods.research * this.eventMods.research;
      if (info.tourism > 0) acc.visitors += info.tourism * mods.tourism * this.eventMods.tourism;
    }
  }

  /** Re-collect network supply/demand from cached per-building values (after a topology rebuild). */
  private reaccumulate(): void {
    const nets = this.nets!;
    nets.beginDay();
    for (const r of this.recs) {
      const b = r.b;
      if (b.state !== BuildingState.Active && b.state !== BuildingState.Upgrading && b.state !== BuildingState.Burning) continue;
      const k = nets.label[b.tile];
      if (k < 0) continue;
      const dem = r.info.priority === 0 ? nets.demandSvc : nets.demandGrow;
      dem[U.Power][k] += r.powerUse;
      dem[U.Water][k] += r.waterUse;
      dem[U.Oxygen][k] += r.oxygenUse;
      dem[U.Garbage][k] += r.garbageGen;
      dem[U.Data][k] += r.dataUse;
      const info = r.info;
      if (info.powerOut || info.waterOut || info.oxygenOut || info.garbageCap || info.dataCap) {
        let fl = 0;
        for (const t of b.tiles) fl |= this.planet!.flags[t];
        const eff = (info.dept ? budgetEffect(this.budget[info.dept] ?? 1) : 1) * (fl & (TileFlag.Burning | TileFlag.Frozen | TileFlag.Flooded) ? 0 : 1);
        nets.supply[U.Power][k] += info.powerOut * eff;
        nets.supply[U.Water][k] += info.waterOut * eff;
        nets.supply[U.Oxygen][k] += info.oxygenOut * eff;
        nets.supply[U.Garbage][k] += info.garbageCap * eff;
        nets.supply[U.Data][k] += info.dataCap * eff;
      }
    }
  }

  private finishDay(): void {
    const p = this.planet!;
    if (this.catVer !== catalogVersion()) this.onCatalogChanged();
    // policies may also be edited directly on planet.districts (UI, districts created / deleted)
    const sig = this.policySignature();
    if (sig !== this.policySig) {
      this.policySig = sig;
      this.recomputeMods();
    }
    const amb = this.ambientSignature();
    if (amb !== this.ambientSig) this.recomputeMods();
    const season = this.season();
    if (season.id !== this.lastSeason) {
      if (this.lastSeason && season.strength > 0.3 && this.agg.population > 50) this.post(CHARACTERS.weather, line(this.rng, 'season_' + season.id, this.vars()));
      this.lastSeason = season.id;
    }
    // 1. finish the rolling building pass
    while (this.cursor < this.recs.length) updateRec(this, this.recs[this.cursor++]);
    this.cursor = 0;
    this.accumulateOrbitals();
    // 2. aggregates
    this.swapAgg();
    // 3. utilities
    const nets = this.nets!;
    if (nets.dirty) {
      nets.rebuild();
      this.reaccumulate();
    }
    this.addOrbitals();
    nets.resolve(this.rules.freeUtilities);
    this.utilDirty = false;
    this.dataSupply = nets.totalSupply[U.Data];
    this.utilityAlerts();
    nets.beginDay();
    // 4. deferred structural changes
    this.applyPending();
    // 5. demand & growth
    const res = computeDemand(this);
    this.reasons = res.reasons;
    const ease = 0.25;
    this.demand.R += (res.target.R - this.demand.R) * ease;
    this.demand.C += (res.target.C - this.demand.C) * ease;
    this.demand.I += (res.target.I - this.demand.I) * ease;
    this.demand.O += (res.target.O - this.demand.O) * ease;
    this.growth!.spawnDay(this);
    // 6. disasters & events
    this.hazards!.day();
    this.displaced *= 0.97;
    this.tickEvents();
    // 7. time
    this.day++;
    if (this.day % 360 === 0) this.yearInReview();
    if (this.day % 1440 === 0) this.election();
    if (this.day % 30 === 0) this.monthEnd();
    else if (this.day % 5 === 0) this.projected = this.report(false);
    // 8. fields cadence
    if (this.fieldJob && this.day - this.fieldJobDay >= 8) this.flushFields(false);
    if (!this.fieldJob && (this.fieldsDirty || this.day >= this.nextFieldDay)) this.startFieldJob();
    // 9. voice of the people
    this.dailyChatter();
    this.hintsAndAlerts();
    this.publishStats();
    bus.emit('sim:day', { day: this.day });
    void p;
  }

  private applyPending(): void {
    const ops = this.ops;
    if (ops && this.pendingIgnite.length) {
      ops.setFlags(this.pendingIgnite, TileFlag.Burning, true);
      this.pendingIgnite = [];
    }
    if (!ops || (!this.pendingRemove.size && !this.pendingLevel.size && !this.abandonedToday)) return;
    const p = this.planet!;
    for (const [id, cause] of [...this.pendingRemove]) {
      this.pendingRemove.delete(id);
      if (p.buildings.has(id)) ops.removeBuilding(id, cause);
    }
    for (const [id, level] of [...this.pendingLevel]) {
      this.pendingLevel.delete(id);
      const r = this.recMap.get(id);
      if (!r) continue;
      this.changeLevel(r, level);
    }
    if (this.abandonedToday > 0) {
      if (this.day - this.lastAbandonNotice > 20) {
        this.lastAbandonNotice = this.day;
        const r = this.recs.find((x) => x.b.state === BuildingState.Abandoned);
        const why = r ? this.abandonReason(r) : 'poor conditions';
        this.toast('abandoned', { title: 'Buildings abandoned', body: `Residents are leaving — ${why}.`, icon: '🏚️', kind: 'warn', tile: r?.b.tile });
        this.post(this.persona(), line(this.rng, 'abandoned', this.vars()), r?.b.tile);
      }
      this.abandonedToday = 0;
    }
  }

  private changeLevel(r: BRec, level: number): void {
    const ops = this.ops!;
    const b = r.b;
    const info = r.info;
    const lvl = Math.max(1, Math.min(5, level));
    const prev = b.level;
    if (lvl === prev) return;
    if (lvl >= info.minLevel && lvl <= info.maxLevel) {
      ops.updateBuilding(b.id, { level: lvl });
    } else {
      const def = this.growth!.defForLevel(info.zone, info.def.footprint, lvl, () => this.rng.next());
      if (!def) return;
      const tile = b.tile, rot = b.rot, style = b.style, tint = b.tint, name = b.name, built = b.builtDay;
      ops.removeBuilding(b.id, 'upgrade');
      const nb = ops.placeBuilding(def.id, tile, rot, { level: lvl, variant: Math.floor(this.rng.next() * Math.max(1, def.variants ?? 1)), style, tint, name, state: BuildingState.Upgrading, day: built, force: true });
      if (nb) nb.progress = 0;
      this.carry = null;
    }
    const p = this.planet!;
    const live = p.buildings.get(p.building[b.tile]) ?? null;
    const tall = info.zone === 3 || info.zone === 5 || info.zone === 11 || info.zone === 10;
    if (lvl === 5 && prev < 5 && tall) {
      if (live && !live.name) {
        const name = towerName(this.rng, info.family ?? 'O');
        ops.updateBuilding(live.id, { name });
        this.post(this.persona(), line(this.rng, 'topOut', this.vars({ thing: name }, live.tile)), live.tile);
      }
    } else if (lvl > prev && lvl >= 4 && this.rng.chance(0.08)) this.post(this.persona(), line(this.rng, 'levelUp', this.vars({ n: lvl }, b.tile)), b.tile);
  }

  // ───────────────────────────── fields

  private fieldCtx(): FieldContext {
    if (!this.ctx) {
      this.ctx = {
        planet: this.planet!,
        recs: this.recs,
        budget: this.budget,
        modsAt: (d) => this.modsAt(d),
        unemployment: 0,
        eduAvg: 0,
        orbitalCoverage: this.orbitalCoverage,
      };
    }
    const c = this.ctx;
    c.freeze = this.settling && this.fieldsRestored;
    c.planet = this.planet!;
    c.recs = this.recs;
    c.budget = this.budget;
    c.unemployment = this.agg.unemploymentFelt;
    c.eduAvg = this.agg.education;
    return c;
  }

  private startFieldJob(): void {
    this.fieldJob = this.fields!.pass(this.fieldCtx());
    this.fieldJobDay = this.day;
    // fields drift slowly: refresh every 3 sim days, stretched at high speed so it stays ~2 passes per second
    const speed = this.game.clock?.speed ?? 1;
    this.nextFieldDay = this.day + (speed >= 4 ? 6 : speed >= 3 ? 4 : 3);
    this.fieldsDirty = false;
  }

  /** Run a field pass to completion now (load time / falling behind). */
  private flushFields(fresh: boolean): void {
    if (fresh || !this.fieldJob) this.startFieldJob();
    let guard = 0;
    while (this.fieldJob && guard++ < 100000) if (this.fieldJob.next().done) this.fieldJob = null;
    this.fieldJob = null;
  }

  // ───────────────────────────── policies & mods

  private policySignature(): string {
    const p = this.planet;
    if (!p) return '';
    let sig = '';
    for (let i = 0; i < p.districts.length; i++) {
      const d = p.districts[i];
      if (d && d.policies.length) sig += i + ':' + d.policies.join(',') + '|';
    }
    return sig;
  }

  private recomputeMods(): void {
    const p = this.planet;
    if (!p) return;
    this.policySig = this.policySignature();
    const city = p.districts[0]?.policies ?? [];
    this.cityMods = modsFor(city);
    this.districtMods = [];
    for (let i = 1; i < p.districts.length; i++) {
      const d = p.districts[i];
      if (!d || !d.policies.length) continue;
      const m = modsFor(city);
      modsFor(d.policies, m);
      this.districtMods[i] = m;
    }
    this.eventMods = baseMods();
    for (const e of this.events) {
      const def = CITY_EVENTS.find((x) => x.id === e.id);
      if (def) applyPatch(this.eventMods, def.mods);
    }
    applyPatch(this.eventMods, this.ambientPatch());
    this.ambientSig = this.ambientSignature();
    if (this.fields) this.fields.fullNext = true;
  }

  // ───────────────────────────── seasons, wonders, spaceports

  /** Current season of the active planet (tilted worlds have real seasons; cold / hot worlds shift demand). */
  season(): { id: 'spring' | 'summer' | 'autumn' | 'winter'; name: string; icon: string; strength: number } {
    const m = Math.floor(this.day / 30) % 12;
    const tilt = this.planet ? Math.min(1.2, Math.abs(this.planet.spec.axialTilt) / 0.4) : 1;
    const id = m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
    const meta = { winter: ['Winter', '❄️'], spring: ['Spring', '🌱'], summer: ['Summer', '☀️'], autumn: ['Autumn', '🍂'] }[id];
    return { id, name: meta[0], icon: meta[1], strength: tilt };
  }

  private ambientSignature(): string {
    const s = this.season();
    return `${s.id}|${Math.min(5, this.agg.wonders)}|${Math.min(4, this.agg.spaceports)}`;
  }

  /** City-wide modifiers from climate, the season, wonders and spaceports. */
  private ambientPatch(): Partial<Mods> {
    const p = this.planet;
    if (!p) return {};
    const temp = p.spec.temperature;
    const cold = Math.max(0, Math.min(1.5, (5 - temp) / 40));
    const hot = Math.max(0, Math.min(1.5, (temp - 28) / 30));
    const s = this.season();
    const a = s.strength;
    const wonders = Math.min(5, this.agg.wonders);
    const ports = Math.min(4, this.agg.spaceports);
    return {
      powerUse: 1 + 0.12 * cold + 0.06 * hot + (s.id === 'winter' ? 0.1 * a : 0),
      waterUse: 1 + 0.15 * hot + (s.id === 'summer' ? 0.1 * a : 0),
      tourism: (s.id === 'summer' ? 1 + 0.15 * a : s.id === 'winter' ? 1 - 0.08 * a : 1) * (1 + 0.1 * wonders) * (1 + 0.3 * ports),
      happiness: Math.min(10, wonders * 2),
    };
  }

  /** Every four years: the mayor faces the voters. */
  private election(): void {
    const pop = this.agg.population;
    if (!this.planet || pop < 200) return;
    const approval = Math.round(Math.max(3, Math.min(97, (this.stats.realHappiness ?? 50) * 0.9 + (this.projected && this.projected.net >= 0 ? 8 : -6) - this.loans.length * 2)));
    const id = approval >= 62 ? 'landslide' : approval >= 45 ? 'scraped' : 'recall';
    const def = CITY_EVENTS.find((e) => e.id === id)!;
    this.events = this.events.filter((e) => e.id !== 'landslide' && e.id !== 'scraped' && e.id !== 'recall');
    this.events.push({ id, name: def.name, icon: def.icon, description: def.description, daysLeft: def.days });
    this.recomputeMods();
    this.stats.approval = approval;
    this.toast('election', { title: `${def.icon} ${def.name}`, body: `Approval rating: ${approval}%. ${def.description}`, icon: def.icon, kind: def.good ? 'good' : 'warn' }, 5);
    this.post(CHARACTERS.news, def.news[0].replace('{n}', String(approval)), undefined, true);
  }

  isPolicyOn(id: string, district = 0): boolean {
    return !!this.planet?.districts[district]?.policies.includes(id);
  }

  /** Enable / disable a policy city-wide (district 0) or in one district. */
  setPolicy(id: string, on: boolean, district = 0): boolean {
    const p = this.planet;
    const def = POLICY_MAP.get(id);
    const d = p?.districts[district];
    if (!p || !def || !d) return false;
    if (district === 0 && def.scope === 'district') return false;
    if (district > 0 && def.scope === 'city') return false;
    const has = d.policies.includes(id);
    if (on === has) return true;
    d.policies = on ? [...d.policies, id] : d.policies.filter((x) => x !== id);
    this.recomputeMods();
    this.fieldsDirty = true;
    this.projected = this.report(false);
    if (on) {
      const where = district > 0 ? ` in ${d.name}` : '';
      notify({ title: `${def.name} enacted${where}`, body: def.effects.join(' · '), icon: def.icon, kind: 'good' });
      const cheer = def.cheers?.length ? this.rng.pick(def.cheers) : line(this.rng, 'policy', this.vars({ thing: def.name }));
      this.post(this.persona(), cheer);
    }
    return true;
  }

  /** Monthly cost (+) / income (−) of a policy at the current population. */
  policyCost(id: string, district = 0): number {
    const def = POLICY_MAP.get(id);
    if (!def) return 0;
    const pop = district > 0 ? this.agg.distPop[district] ?? 0 : this.agg.population;
    return Math.round((def.costPer1k * pop) / 1000);
  }

  setTax(fam: 'R' | 'C' | 'I' | 'O', v: number): void {
    this.taxes[fam] = Math.max(0, Math.min(MAX_TAX, v));
    this.projected = this.report(false);
  }

  setBudget(dept: string, v: number): void {
    this.budget[dept] = Math.max(0.5, Math.min(1.5, v));
    this.fieldsDirty = true;
    this.projected = this.report(false);
  }

  setRule(id: keyof SandboxRules, on: boolean): void {
    this.rules[id] = on;
    if (id === 'freeUtilities') {
      this.refreshExempt();
      this.nets?.resolve(on);
    }
  }

  // ───────────────────────────── economy

  private countRoads(): Int32Array {
    if (this.roadCountVer !== this.roadVersion && this.planet) {
      const c = this.roadCounts;
      c.fill(0);
      const road = this.planet.road;
      for (let i = 0; i < road.length; i++) if (road[i]) c[road[i] & 7]++;
      this.roadCountVer = this.roadVersion;
    }
    return this.roadCounts;
  }

  private econCtx(): EconomyContext {
    let coloniesIncome = 0;
    const cur = this.planet?.spec.id;
    for (const c of Object.values(this.game.empire.s.colonies ?? {})) if (c && c.planetId !== cur) coloniesIncome += c.income || 0;
    return {
      planet: this.planet!,
      recs: this.recs,
      taxes: this.taxes,
      budget: this.budget,
      modsAt: (d) => this.modsAt(d),
      cityMods: this.cityMods,
      population: this.agg.population,
      districtPop: this.agg.distPop,
      visitorsPerMonth: this.agg.visitors,
      loans: this.loans,
      coloniesIncome,
      customerFactor: this.custFactor,
      bonusIncome: 0,
      roadCounts: this.countRoads(),
    };
  }

  private report(apply: boolean): MonthReport {
    return computeReport(this.econCtx(), this.day, apply);
  }

  /** Live projection of this month's budget (for the budget panel). */
  projectedMonth(): MonthReport {
    // UI sliders may write taxes / budget directly: refresh the projection at most 4× a second
    const now = performance.now();
    if ((!this.projected || now - this.projectedAt > 250) && this.planet) {
      this.projected = this.report(false);
      this.projectedAt = now;
      this.stats.monthlyIncome = this.projected.net;
    }
    return this.projected ?? this.report(false);
  }

  departmentUpkeep(): Record<DeptId, number> {
    return departmentUpkeep({ recs: this.recs, budget: this.budget, planet: this.planet! });
  }

  loanOffers(): LoanOffer[] {
    return loanOffers(this.agg.population, this.loans);
  }

  /** Take a loan (default: the first available offer). Returns the loan or null. */
  takeLoan(amount?: number, lender?: string): Loan | null {
    const offers = this.loanOffers();
    const offer = lender ? offers.find((o) => o.lender === lender) : offers[0];
    if (!offer || this.loans.length >= 3) return null;
    const principal = Math.round(Math.max(1000, Math.min(offer.amount, amount ?? offer.amount)));
    const loan: Loan = { id: this.nextLoanId++, lender: offer.lender, principal, remaining: principal, rate: offer.rate, monthlyPayment: annuity(principal, offer.rate, offer.months), monthsLeft: offer.months, takenDay: this.day };
    this.loans.push(loan);
    if (!this.sandbox) this.game.empire.s.money += principal;
    notify({ title: 'Loan approved', body: `${offer.lender}: ₡${principal.toLocaleString('en-US')} at ${(offer.rate * 100).toFixed(1)}% for ${offer.months} months`, icon: offer.icon, kind: 'info' });
    this.projected = this.report(false);
    return loan;
  }

  /** Repay a loan in full (or every loan when id is omitted) if affordable. */
  repay(id?: number): boolean {
    const list = id === undefined ? [...this.loans] : this.loans.filter((l) => l.id === id);
    if (!list.length) return false;
    const total = list.reduce((s, l) => s + l.remaining, 0);
    const e = this.game.empire;
    if (!e.sandbox && e.s.money < total) {
      notify({ title: 'Not enough credits', body: `Repaying needs ₡${Math.round(total).toLocaleString('en-US')}`, icon: '💸', kind: 'warn' });
      return false;
    }
    if (!e.sandbox) e.s.money -= total;
    this.loans = this.loans.filter((l) => !list.includes(l));
    notify({ title: 'Loan repaid', body: 'Debt-free feels good. 🎉', icon: '🏦', kind: 'good' });
    this.projected = this.report(false);
    return true;
  }

  private monthEnd(): void {
    const e = this.game.empire;
    const report = this.report(true);
    // loans: the payments are part of expenses; advance balances
    const { finished } = payLoans(this.loans);
    for (const l of finished) notify({ title: 'Loan paid off', body: `${l.lender} loan fully repaid.`, icon: '🏦', kind: 'good' });
    // one-off event money already in eventMoney
    if (!e.sandbox) e.s.money += report.net;
    this.lastMonth = report;
    this.projected = this.report(false);
    // research
    const cur = this.planet!.spec.id;
    let colonyResearch = 0;
    for (const c of Object.values(e.s.colonies ?? {})) if (c && c.planetId !== cur) colonyResearch += c.research || 0;
    e.s.research += this.agg.research + colonyResearch;
    this.stats.researchRate = Math.round(this.agg.research);
    // history
    const pop = this.agg.population;
    let total = pop;
    for (const c of Object.values(e.s.colonies ?? {})) if (c && c.planetId !== cur) total += c.population || 0;
    e.s.history.push({ day: this.day, population: Math.round(total), money: Math.round(e.s.money), happiness: Math.round(this.stats.happiness ?? 50), income: report.net, research: Math.round(e.s.research) });
    if (e.s.history.length > HISTORY_MAX) e.s.history.splice(0, e.s.history.length - HISTORY_MAX);
    const h = this.history;
    const push = (k: keyof CityHistory, v: number) => {
      h[k].push(Math.round(v * 100) / 100);
      if (h[k].length > HISTORY_MAX) h[k].splice(0, h[k].length - HISTORY_MAX);
    };
    push('day', this.day);
    push('population', pop);
    push('happiness', this.stats.happiness ?? 50);
    push('income', report.net);
    push('jobs', this.agg.jobsTotal);
    push('landValue', this.fields!.avgLandValue);
    push('pollution', this.fields!.avgPollution);
    push('crime', this.fields!.avgCrime);
    push('traffic', this.fields!.avgTraffic * 100);
    push('tourism', this.agg.visitors);
    // bankruptcy
    if (!e.sandbox) {
      if (e.s.money < 0) {
        this.negMonths++;
        if (this.negMonths >= 3 && this.loans.length < 3) {
          const need = Math.ceil((-e.s.money + 15000) / 1000) * 1000;
          const loan: Loan = { id: this.nextLoanId++, lender: 'Galactic Federation (bailout)', principal: need, remaining: need, rate: 0.15, monthlyPayment: annuity(need, 0.15, 48), monthsLeft: 48, takenDay: this.day };
          this.loans.push(loan);
          e.s.money += need;
          this.negMonths = 0;
          notify({ title: 'Federation bailout', body: `The Galactic Federation lent you ₡${need.toLocaleString('en-US')} at 15%. They are "disappointed".`, icon: '🏛️', kind: 'bad' });
          this.post(CHARACTERS.news, `BREAKING: ${this.planet!.city.name} bailed out by the Federation. Mayor seen hiding behind a potted plant. 🪴`);
        } else {
          this.toast('bankrupt', { title: 'Bankruptcy warning', body: `The treasury is ₡${Math.round(-e.s.money).toLocaleString('en-US')} in the red. Raise taxes, cut budgets or take a loan.`, icon: '📉', kind: 'bad' });
          if (this.rng.chance(0.5)) this.post(this.persona(), line(this.rng, 'bankrupt', this.vars()));
        }
      } else this.negMonths = 0;
    }
    // taxes chatter
    for (const f of FAMILIES) {
      const now = this.taxes[f], before = this.prevTaxes[f];
      if (Math.abs(now - before) >= 0.009) {
        const topic = now > 0.18 ? 'taxHigh' : now > before ? 'taxUp' : 'taxDown';
        this.post(this.persona(), line(this.rng, topic, this.vars({ tax: Math.round(now * 100) })));
        break;
      }
    }
    this.prevTaxes = { ...this.taxes };
    // city events
    this.rollEvent();
    bus.emit('sim:month', { day: this.day });
  }

  // ───────────────────────────── city events

  private tickEvents(): void {
    if (!this.events.length) return;
    let changed = false;
    for (const ev of this.events) ev.daysLeft--;
    const before = this.events.length;
    this.events = this.events.filter((e) => e.daysLeft > 0);
    if (this.events.length !== before) changed = true;
    if (changed) this.recomputeMods();
  }

  private rollEvent(): void {
    const pop = this.agg.population;
    if (this.events.length >= 2 || pop < 100 || !this.rng.chance(0.35)) return;
    const pool = CITY_EVENTS.filter((e) => e.weight > 0 && pop >= e.minPop && !this.events.some((x) => x.id === e.id));
    if (!pool.length) return;
    let total = 0;
    for (const e of pool) total += e.weight;
    let roll = this.rng.next() * total;
    const def = pool.find((e) => (roll -= e.weight) <= 0) ?? pool[0];
    const tile = this.recs.length ? this.recs[Math.floor(this.rng.next() * this.recs.length)].b.tile : undefined;
    this.events.push({ id: def.id, name: def.name, icon: def.icon, description: def.description, daysLeft: def.days, tile });
    this.recomputeMods();
    if (def.money && !this.sandbox) this.game.empire.s.money += def.money;
    this.toast('event.' + def.id, { title: def.name, body: def.description + (def.money ? ` (${def.money > 0 ? '+' : '−'}₡${Math.abs(def.money).toLocaleString('en-US')})` : ''), icon: def.icon, kind: def.good ? 'good' : 'warn', tile });
    this.post(this.persona(), this.rng.pick(def.news), tile);
  }

  // ───────────────────────────── stats

  private publishStats(): void {
    const s = this.stats;
    const a = this.agg;
    const f = this.fields!;
    const nets = this.nets!;
    const e = this.game.empire;
    const realHappy = a.happyW > 0 ? a.happiness : 50;
    s.population = Math.round(a.population);
    s.realHappiness = Math.round(realHappy);
    s.happiness = Math.max(0, Math.min(100, Math.round(realHappy + this.cityMods.reportedHappiness)));
    s.jobs = Math.round(a.jobsTotal);
    s.workers = Math.round(a.employed);
    s.workforce = Math.round(a.workforce);
    s.unemployed = Math.round(Math.max(0, a.workforce - a.employed));
    s.unemployment = Math.round(a.unemployment * 1000) / 10;
    s.openJobs = Math.round(a.openJobs);
    s.jobsCommercial = Math.round(a.jobs[1]);
    s.jobsIndustrial = Math.round(a.jobs[2]);
    s.jobsOffice = Math.round(a.jobs[3]);
    s.jobsServices = Math.round(a.jobs[4]);
    s.housing = Math.round(a.housingCap);
    s.buildings = a.buildings;
    s.abandoned = a.abandoned;
    s.constructing = a.constructing;
    s.roadTiles = f.roadCount;
    s.zonedTiles = this.growth ? this.growth.zoned[0] + this.growth.zoned[1] + this.growth.zoned[2] + this.growth.zoned[3] : 0;
    s.parks = a.parks;
    s.landmarks = a.landmarks;
    s.wonders = a.wonders;
    s.landValue = Math.round(f.avgLandValue);
    s.pollution = Math.round(f.avgPollution);
    s.noise = Math.round(f.avgNoise);
    s.crime = Math.round(f.avgCrime);
    s.traffic = Math.round(f.avgTraffic * 100);
    s.education = Math.round((a.education / 2) * 100);
    s.educated = Math.round(a.eduRes[1] + a.eduRes[2]);
    s.graduates = Math.round(a.eduRes[2]);
    s.health = Math.round(a.health);
    s.tourism = Math.round(a.visitors);
    s.researchRate = Math.round(a.research);
    s.research = Math.floor(e.s.research);
    const sup = nets.totalSupply, dem = nets.totalDemand;
    s.powerSupply = Math.round(sup[U.Power]);
    s.powerDemand = Math.round(dem[U.Power]);
    s.waterSupply = Math.round(sup[U.Water]);
    s.waterDemand = Math.round(dem[U.Water]);
    s.oxygenSupply = Math.round(sup[U.Oxygen]);
    s.oxygenDemand = Math.round(dem[U.Oxygen]);
    s.garbageCapacity = Math.round(sup[U.Garbage]);
    s.garbageProduced = Math.round(dem[U.Garbage]);
    s.dataCapacity = Math.round(sup[U.Data]);
    s.dataDemand = Math.round(dem[U.Data]);
    s.needsOxygen = this.needsOxygen ? 1 : 0;
    /** bitmask of utilities supplied for free (1 power · 2 water · 4 oxygen · 8 garbage · 16 data) */
    s.utilitiesFree = this.exempt;
    s.monthlyIncome = this.projected ? this.projected.net : 0;
    s.monthlyRevenue = this.projected ? this.projected.totalIncome : 0;
    s.monthlyExpenses = this.projected ? this.projected.totalExpenses : 0;
    s.debt = Math.round(this.loans.reduce((x, l) => x + l.remaining, 0));
    s.districts = this.planet ? this.planet.districts.filter((d, i) => i > 0 && !!d).length : 0;
    s.policies = this.planet ? this.planet.districts.reduce((n, d) => n + (d?.policies.length ?? 0), 0) : 0;
    s.demandR = Math.round(this.demand.R * 100);
    s.demandC = Math.round(this.demand.C * 100);
    s.demandI = Math.round(this.demand.I * 100);
    s.demandO = Math.round(this.demand.O * 100);
    s.residentialBuildings = a.zoneBuildings[1] + a.zoneBuildings[2] + a.zoneBuildings[3];
    s.commercialBuildings = a.zoneBuildings[4] + a.zoneBuildings[5] + a.zoneBuildings[6];
    s.industrialBuildings = a.zoneBuildings[7] + a.zoneBuildings[8] + a.zoneBuildings[9] + a.zoneBuildings[10];
    s.officeBuildings = a.zoneBuildings[11];
    s.fires = this.hazards?.fireTiles ?? 0;
    /** 0 spring · 1 summer · 2 autumn · 3 winter */
    s.season = ['spring', 'summer', 'autumn', 'winter'].indexOf(this.season().id);
    s.events = this.events.length;
    s.daysPlayed = this.day;
    s.customBuildings = Math.max(a.custom, (e.s.customItems ?? []).length);
    const visited = e.s.visited ?? [];
    s.planetsColonized = Math.max(1, Object.keys(e.s.planets ?? {}).filter((id) => id !== this.planet?.spec.id).length + 1);
    s.systemsVisited = visited.filter((v) => v.startsWith('system:')).length;
    s.galaxiesVisited = visited.filter((v) => v.startsWith('galaxy:')).length;
    let total = a.population;
    const cur = this.planet?.spec.id;
    for (const c of Object.values(e.s.colonies ?? {})) if (c && c.planetId !== cur) total += c.population || 0;
    s.totalPopulation = Math.round(total);
    s.disastersSurvived = Math.max(e.s.counters.disastersSurvived ?? 0, e.s.counters['sim.disasters'] ?? 0);
    s.casualties = e.s.counters['sim.casualties'] ?? 0;
  }

  getMetric(id: MetricId): number {
    if (id === 'money') return this.game.empire.money;
    if (id === 'research') return Math.floor(this.game.empire.s.research);
    if (id === 'daysPlayed') return Math.floor(this.game.clock?.day ?? this.day);
    return this.stats[id] ?? 0;
  }

  demandReasons(): Record<Fam, DemandReason[]> {
    return this.reasons;
  }

  /** Grouped building problems (counts + an example tile to fly to), most severe first. */
  problemsSummary(): ProblemSummary[] {
    const out: ProblemSummary[] = [];
    for (const info of PROBLEM_INFO) {
      const bit = Math.log2(info.bit) | 0;
      const n = this.agg.problems[bit];
      if (n > 0) out.push({ id: info.id, label: info.label, icon: info.icon, fix: info.fix, count: n, tile: this.agg.problemTile[bit], severe: info.severe });
    }
    if (this.agg.abandoned > 0) {
      const r = this.recs.find((x) => x.b.state === BuildingState.Abandoned);
      out.push({ id: 'abandoned', label: 'Abandoned buildings', icon: '🏚️', fix: 'Fix what drove people out; abandoned lots collapse and regrow.', count: this.agg.abandoned, tile: r?.b.tile ?? -1, severe: true });
    }
    return out.sort((a, b) => Number(b.severe) - Number(a.severe) || b.count - a.count);
  }

  /** A few prioritised, witty tips for the advisor / help UI. */
  advisor(): { icon: string; text: string; tile?: number; tone: 'good' | 'warn' | 'bad' | 'info' }[] {
    const tips: { icon: string; text: string; tile?: number; tone: 'good' | 'warn' | 'bad' | 'info' }[] = [];
    const s = this.stats;
    const g = this.growth;
    if (!this.planet) return tips;
    if (s.roadTiles === 0) tips.push({ icon: '🛣️', text: 'Every city starts with a road. Draw one from the build menu.', tone: 'info' });
    else if (s.zonedTiles === 0) tips.push({ icon: '🏡', text: 'Paint residential, commercial and industrial zones along your roads.', tone: 'info' });
    const ex = this.exempt;
    if (!(ex & SV_POWER)) {
      if (!this.sandbox && s.powerSupply === 0 && s.zonedTiles > 0) tips.push({ icon: '⚡', text: 'Zoned lots need power to develop. Build a power plant on your road network.', tile: g && g.blockedTile >= 0 ? g.blockedTile : undefined, tone: 'warn' });
      else if (s.powerDemand > s.powerSupply * 0.95 && s.powerDemand > 0) tips.push({ icon: '⚡', text: `Power is maxed out (${s.powerDemand}/${s.powerSupply} MW). Growth stalls without more plants.`, tone: 'warn' });
    }
    if (!(ex & SV_WATER) && s.waterDemand > s.waterSupply && s.waterDemand > 0) tips.push({ icon: '💧', text: 'Taps are running dry. Build water pumps or towers.', tone: 'warn' });
    if (!(ex & SV_OXYGEN) && this.needsOxygen && s.oxygenDemand > s.oxygenSupply) tips.push({ icon: '🫁', text: 'Citizens are gasping — this world needs more oxygen generators!', tone: 'bad' });
    if (this.garbageActive && s.garbageProduced > s.garbageCapacity) tips.push({ icon: '🗑️', text: 'Garbage is piling up. Build a landfill or recycling centre.', tone: 'warn' });
    if (s.unemployment > 12) tips.push({ icon: '💼', text: `${s.unemployment}% unemployment. Zone commercial or industry.`, tone: 'warn' });
    if (this.agg.openJobs > Math.max(60, this.agg.workforce * 0.2)) tips.push({ icon: '🏡', text: 'Lots of open jobs — zone more housing.', tone: 'info' });
    if (s.crime > 40) tips.push({ icon: '🚓', text: 'Crime is climbing. Police stations would help.', tone: 'warn' });
    if (s.traffic > 70) tips.push({ icon: '🚗', text: 'Traffic is a nightmare. Upgrade busy streets to avenues or add transit.', tone: 'warn' });
    if (s.pollution > 35) tips.push({ icon: '🌳', text: 'Pollution is high. Separate homes from industry and plant parks.', tone: 'warn' });
    if (s.education < 25 && s.population > 1500) tips.push({ icon: '🎓', text: 'Offices need graduates. Build schools and a university.', tone: 'info' });
    if (this.projected && this.projected.net < 0 && !this.sandbox) tips.push({ icon: '💸', text: `You're losing ₡${Math.abs(this.projected.net).toLocaleString('en-US')} a month. Raise taxes or trim budgets.`, tone: 'bad' });
    if ((g?.noRoad ?? 0) > 0) tips.push({ icon: '🛣️', text: `${g!.noRoad} zoned lots can't be reached by road.`, tile: g!.noRoadTile, tone: 'info' });
    if (!tips.length) tips.push({ icon: '😎', text: s.happiness > 70 ? 'Citizens are thrilled. Maybe treat them to a landmark?' : 'All systems nominal. Keep growing!', tone: 'good' });
    return tips.slice(0, 6);
  }

  districtStats(id: number): DistrictStats {
    const a = this.agg;
    const p = this.planet;
    let lv = 0, cr = 0, pol = 0, n = 0;
    if (p && this.fields && id > 0) {
      for (let t = 0; t < p.count; t++) {
        if (p.district[t] !== id) continue;
        lv += this.fields.landValue[t];
        cr += this.fields.crime[t];
        pol += this.fields.pollution[t];
        n++;
      }
    }
    let policyCost = 0;
    for (const pid of p?.districts[id]?.policies ?? []) policyCost += this.policyCost(pid, id);
    return {
      id,
      population: Math.round(a.distPop[id] ?? 0),
      jobs: Math.round(a.distJobs[id] ?? 0),
      workers: Math.round(a.distJobs[id] ?? 0),
      buildings: Math.round(a.distBld[id] ?? 0),
      happiness: a.distHappyW[id] > 0 ? Math.round(a.distHappy[id] / a.distHappyW[id]) : 0,
      landValue: n ? Math.round(lv / n) : 0,
      crime: n ? Math.round(cr / n) : 0,
      pollution: n ? Math.round(pol / n) : 0,
      policyCost,
    };
  }

  cityHistory(): CityHistory {
    return this.history;
  }

  trafficAt(tile: number): number {
    return this.fields?.traffic[tile] ?? -1;
  }

  coverageAt(service: ServiceType, tile: number): number {
    const si = SERVICE_INDEX[service];
    return si === undefined ? 0 : this.fields?.cov[si][tile] ?? 0;
  }

  /** Problems bitmask of a building (see PROBLEM_INFO) — for problem-icon overlays. */
  problemsOf(id: number): number {
    return this.recMap.get(id)?.problems ?? 0;
  }

  /** Buildings with severe problems (ids) — e.g. to draw warning icons. */
  troubledBuildings(max = 200): number[] {
    const out: number[] = [];
    for (const r of this.recs) {
      if (r.problems & (P.NoPower | P.NoWater | P.NoOxygen | P.Garbage | P.Fire)) out.push(r.id);
      if (out.length >= max) break;
    }
    return out;
  }

  /**
   * A random citizen of this city, for "meet the citizens" moments: name, age, job, home, mood and a quote
   * that reflects their building's real situation.
   */
  citizenSpotlight(): { name: string; age: number; job: string; buildingId: number; tile: number; mood: number; quote: string; icon: string } | null {
    const homes = this.recs.filter((r) => r.residents > 0);
    if (!homes.length) return null;
    const r = homes[Math.floor(this.rng.next() * homes.length)];
    const rng = new SimRng(r.id * 31 + this.day);
    const first = PROBLEM_INFO.find((x) => r.problems & x.bit);
    const persona = randomPersona(rng);
    return {
      name: persona.author,
      age: 18 + Math.floor(rng.next() * 70),
      job: citizenJob(rng),
      buildingId: r.id,
      tile: r.b.tile,
      mood: Math.round(r.happiness),
      quote: residentQuote(rng, r.happiness, first?.id ?? null, { city: this.planet?.city.name ?? 'the city' }),
      icon: persona.icon,
    };
  }

  // ───────────────────────────── inspect & colonies

  inspectBuilding(id: number): InspectRow[] {
    try {
      const rows = inspectBuilding(this, id);
      if (rows.length) return rows;
    } catch (e) {
      console.error('[sim] inspectBuilding failed', e);
    }
    const b = this.game.planet?.buildings.get(id);
    if (!b) return [];
    const def = getItem(b.defId);
    return [
      { label: 'Type', value: def?.name ?? b.defId },
      { label: 'Level', value: String(b.level) },
    ];
  }

  inspectTile(tile: number): InspectRow[] {
    try {
      return inspectTile(this, tile);
    } catch (e) {
      console.error('[sim] inspectTile failed', e);
      return [];
    }
  }

  colonySummary(): ColonySummary {
    const p = this.planet ?? this.game.planet;
    const rep = this.lastMonth ?? this.projected ?? this.report(false);
    const own = rep.net - (rep.income.colonies ?? 0);
    return {
      planetId: p?.spec.id ?? '',
      name: p?.city.name ?? '',
      population: Math.round(this.agg.population),
      happiness: Math.round(this.stats.happiness ?? 50),
      income: Math.round(own > 0 ? own * 0.75 : own),
      foundedDay: p?.city.foundedDay ?? 0,
      research: Math.round(this.agg.research * 0.75),
    };
  }

  // ───────────────────────────── utilities alerts, hints, chatter

  private cool(key: string, days: number): boolean {
    const last = this.notes[key] ?? -1e9;
    if (this.day - last < days) return false;
    this.notes[key] = this.day;
    return true;
  }

  /**
   * System toast with anti-spam: never repeats a title already on screen, and the same key waits at least
   * `realSec` real seconds (fast-forward would otherwise fire game-day cooldowns every few seconds).
   */
  private toast(key: string, n: Parameters<typeof notify>[0], realSec = 45): void {
    const now = performance.now();
    if (now - (this.realNotes.get(key) ?? -1e12) < realSec * 1000) return;
    if (ui.toasts.value.some((x) => x.title === n.title)) return;
    this.realNotes.set(key, now);
    notify(n);
  }

  private utilityAlerts(): void {
    if (this.sandbox && this.rules.freeUtilities) return;
    const nets = this.nets!;
    const checks: [number, string, string, string][] = [
      [U.Power, 'power', '⚡', 'Power shortage'],
      [U.Water, 'water', '💧', 'Water shortage'],
      [U.Oxygen, 'oxygen', '🫁', 'Oxygen shortage'],
      [U.Garbage, 'garbage', '🗑️', 'Garbage overflowing'],
    ];
    for (const [u, key, icon, title] of checks) {
      if (this.exempt & (1 << u)) continue;
      if (u === U.Oxygen && !this.needsOxygen) continue;
      if (u === U.Garbage && !this.garbageActive) continue;
      const sup = nets.totalSupply[u], dem = nets.totalDemand[u];
      if (dem <= 0) continue;
      const bit = u === U.Power ? P.NoPower : u === U.Water ? P.NoWater : u === U.Oxygen ? P.NoOxygen : P.Garbage;
      const bi = Math.log2(bit) | 0;
      const n = this.agg.problems[bi];
      if (n < 3 && sup >= dem) continue;
      if (!this.cool('util.' + key, key === 'oxygen' ? 10 : 25)) continue;
      const tile = this.agg.problemTile[bi] >= 0 ? this.agg.problemTile[bi] : undefined;
      const body =
        sup <= 0 ? `Nothing supplies ${key} yet — ${n} building${n === 1 ? '' : 's'} affected.`
        : `Demand ${Math.round(dem)} vs supply ${Math.round(sup)} — ${n} building${n === 1 ? '' : 's'} cut off.`;
      this.toast('util.' + key, { title, body, icon, kind: key === 'oxygen' ? 'bad' : 'warn', tile }, 60);
      const topic = key === 'power' ? 'powerOut' : key === 'water' ? 'waterOut' : key === 'oxygen' ? 'oxygenOut' : 'garbage';
      this.post(this.persona(), line(this.rng, topic, this.vars()), tile);
    }
  }

  private hint(id: string, n: { title: string; body: string; icon: string; tile?: number; kind?: 'info' | 'good' | 'warn' }): void {
    if (this.hints.has(id)) return;
    this.hints.add(id);
    this.toast('hint.' + id, { kind: 'info', ...n }, 5);
  }

  private hintsAndAlerts(): void {
    const g = this.growth!;
    const s = this.stats;
    if (!this.sandbox) {
      if (g.blockedPower > 0 && (s.powerSupply ?? 0) <= 0) this.hint('needPower', { title: 'Zones need power ⚡', body: 'Lots only develop once a power plant feeds their road network.', icon: '⚡', tile: g.blockedTile >= 0 ? g.blockedTile : undefined });
      else if (g.blockedPower > 3 && this.cool('stalledPower', 30)) this.toast('stalledPower', { title: 'Growth stalled', body: 'The power grid is maxed out — new buildings are waiting for electricity.', icon: '⚡', kind: 'warn', tile: g.blockedTile >= 0 ? g.blockedTile : undefined });
      if (g.blockedOxygen > 0 && (s.oxygenSupply ?? 0) <= 0) this.hint('needOxygen', { title: 'This world has no air 🫁', body: 'Build oxygen generators before anyone can move in.', icon: '🫁' });
    }
    if (g.noRoad > 0 && g.candN[0] + g.candN[1] + g.candN[2] + g.candN[3] === 0) this.hint('noRoad', { title: 'Zones need roads', body: 'Zoned lots must touch a road to develop.', icon: '🛣️', tile: g.noRoadTile >= 0 ? g.noRoadTile : undefined });
    const pop = this.agg.population;
    if (pop > 0) this.hint('firstCitizens', { title: 'First citizens have arrived!', body: `Welcome to ${this.planet!.city.name}. Keep them happy and they'll bring friends.`, icon: '🎉', kind: 'good' });
    // population milestones in the feed
    const marks = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 200000, 500000, 1000000];
    for (const m of marks) {
      if (pop >= m && this.milestonesPop < m) {
        this.milestonesPop = m;
        this.post(CHARACTERS.news, line(this.rng, 'milestone', this.vars({ pop: m.toLocaleString('en-US'), thing: `${m.toLocaleString('en-US')}-strong city` })));
      }
    }
    if (this.agg.unemployment > 0.15 && pop > 300 && this.cool('unemp', 40)) {
      this.toast('unemp', { title: 'High unemployment', body: `${Math.round(this.agg.unemployment * 100)}% of workers have no job. Zone commercial or industry.`, icon: '📉', kind: 'warn' });
      this.post(this.persona(), line(this.rng, 'unemployed', this.vars()));
    }
  }

  private dailyChatter(): void {
    if (!this.planet || this.day < this.nextFlavourDay) return;
    const pop = this.agg.population;
    this.nextFlavourDay = this.day + (pop < 50 ? 14 : 5 + Math.floor(this.rng.next() * 7));
    if (pop < 5 && this.recs.length === 0) return;
    const rng = this.rng;
    const s = this.stats;
    const a = this.agg;
    const v = this.vars();
    // weighted topics: what the city is actually like right now, plus everyday flavour
    const topics: [string, number, Persona?][] = [
      ['traffic', s.traffic > 50 ? (s.traffic - 40) / 20 : 0],
      ['trafficBot', s.traffic > 35 ? 0.4 : 0, CHARACTERS.traffic],
      ['pollution', s.pollution > 22 ? (s.pollution - 15) / 15 : 0],
      ['crime', s.crime > 28 ? (s.crime - 20) / 15 : 0],
      ['heist', s.crime > 35 ? 0.6 : 0],
      ['police', a.population > 300 && this.coverageAvg(SERVICE_INDEX.police) > 0.1 ? 0.35 : 0, CHARACTERS.police],
      ['fireDept', a.population > 300 && this.coverageAvg(SERVICE_INDEX.fire) > 0.1 ? 0.25 : 0, CHARACTERS.fire],
      ['newcomer', this.demand.R > 0.2 && pop < 50000 ? 1.1 : 0],
      ['jobsPlenty', a.openJobs > Math.max(30, a.workforce * 0.15) ? 0.8 : 0],
      ['unemployed', a.unemploymentFelt > 0.1 ? 1.2 : 0],
      ['happy', s.happiness >= 68 ? 1 : 0],
      ['unhappy', s.happiness < 40 && pop > 100 ? 1.2 : 0],
      ['tourism', s.tourism > 300 ? 0.7 : 0],
      ['research', a.research > 20 ? 0.4 : 0],
      ['prof', pop > 1500 ? 0.3 : 0, CHARACTERS.prof],
      ['grandma', 0.3, CHARACTERS.grandma],
      ['cat', 0.25, CHARACTERS.cat],
      ['robot', 0.18, CHARACTERS.robot],
      ['alien', pop > 3000 ? 0.18 : 0, CHARACTERS.alien],
      ['critic', pop > 800 ? 0.25 : 0, CHARACTERS.critic],
      ['random', 1.6],
    ];
    let total = 0;
    for (const t of topics) total += t[1];
    let roll = rng.next() * total;
    let pick = topics[topics.length - 1];
    for (const t of topics) {
      roll -= t[1];
      if (roll <= 0 && t[1] > 0) {
        pick = t;
        break;
      }
    }
    const [topic, , who] = pick;
    const extra: Record<string, string | number> = topic === 'trafficBot' ? { n: s.traffic } : topic === 'prof' ? { n: s.education } : {};
    this.post(who ?? this.persona(), line(rng, topic, { ...v, ...extra }));
  }

  /** Average coverage of a service over populated tiles (cheap estimate from homes). */
  private coverageAvg(si: number): number {
    const f = this.fields;
    if (!f || !this.recs.length) return 0;
    let sum = 0, n = 0;
    for (let i = 0; i < this.recs.length; i += Math.max(1, Math.floor(this.recs.length / 64))) {
      sum += f.cov[si][this.recs[i].b.tile];
      n++;
    }
    return n ? sum / n : 0;
  }

  /** Cosmo Daily's yearly recap: growth, mood and the citizens' top complaint. */
  private yearInReview(): void {
    if (!this.planet || this.agg.population < 50) return;
    const h = this.history;
    const pop = this.agg.population;
    const before = h.population.length >= 12 ? h.population[h.population.length - 12] : h.population[0] ?? 0;
    const growth = before > 0 ? `${pop >= before ? '+' : '−'}${Math.abs(Math.round(((pop - before) / before) * 100))}%` : 'from nothing';
    const happy = Math.round(this.stats.happiness ?? 50);
    const mood = happy >= 75 ? 'blissful' : happy >= 60 ? 'upbeat' : happy >= 45 ? 'meh' : 'grumpy';
    const top = this.problemsSummary()[0];
    const year = 2350 + Math.floor(this.day / 360) - 1;
    this.post(CHARACTERS.news, line(this.rng, 'yearReview', this.vars({ growth, mood, happy, problem: top ? top.label.toLowerCase() : 'nothing, honestly', year })), undefined, true);
  }

  noteFireSaved(tile: number): void {
    if (this.cool('fireSaved', 12)) this.post(this.rng.chance(0.5) ? CHARACTERS.fire : this.persona(), line(this.rng, this.rng.chance(0.5) ? 'fireDept' : 'fireOut', this.vars()), tile);
  }

  private onPlopped(r: BRec): void {
    const p = this.planet!;
    if (r.b.builtDay < this.day - 1 || this.settling) return;
    const info = r.info;
    const v = this.vars({ thing: info.name });
    if (info.landmark || info.wonder) this.post(this.persona(), line(this.rng, 'newLandmark', v), r.b.tile);
    else if (info.park && this.rng.chance(0.5)) this.post(this.persona(), line(this.rng, 'newPark', v), r.b.tile);
    else if (info.coverage.length && this.rng.chance(0.35)) this.post(this.persona(), line(this.rng, 'newService', v), r.b.tile);
    void p;
  }

  private onDisaster(powerId: string, start: boolean, tile?: number): void {
    if (!this.planet) return;
    const god = (this.game as unknown as { god?: { powers?: { id: string; name: string }[] } }).god;
    const pretty = god?.powers?.find((x) => x.id === powerId)?.name ?? powerId.replace(/[_-]/g, ' ');
    if (start) {
      if (this.cool('disaster.' + powerId, 2)) this.post(this.persona(), line(this.rng, 'disaster', this.vars({ thing: pretty.toUpperCase() }, tile)), tile, true);
    } else {
      this.game.empire.bump('sim.disasters');
      if (this.cool('disasterEnd.' + powerId, 2)) this.post(rngPick(this.rng, [CHARACTERS.news, this.persona()]), line(this.rng, 'disasterOver', this.vars({ thing: pretty.toLowerCase() })), undefined, true);
    }
  }

  private onMilestone(goalId: string): void {
    if (!this.planet) return;
    if (this.cool('milestone', 1)) this.post(CHARACTERS.mayorfan, `Another milestone for ${this.planet.city.name}! ${goalId.replace(/[_:.-]/g, ' ')} ✅ We stan a productive mayor. 📣`);
  }

  private casualties(r: BRec): void {
    const people = r.residents + r.workers;
    if (people <= 0) return;
    const f = this.fields;
    const shelter = f ? f.shelter[r.b.tile] : 0;
    const dead = Math.round(people * 0.12 * (1 - shelter * 0.9));
    this.displaced += r.residents - Math.min(r.residents, dead);
    if (dead > 0) this.game.empire.bump('sim.casualties', dead);
  }

  persona(): Persona {
    return randomPersona(this.rng);
  }

  vars(extra: Record<string, string | number> = {}, tile?: number): Record<string, string | number> {
    const p = this.planet;
    let at = tile;
    if (at === undefined && this.recs.length) at = this.recs[Math.floor(this.rng.next() * this.recs.length)].b.tile;
    const worst = this.fields?.worstRoad ?? -1;
    return {
      city: p?.city.name ?? 'the city',
      planet: p?.spec.name ?? 'this world',
      mayor: p?.city.mayor ?? 'Mayor',
      district: at !== undefined ? this.areaName(at) : 'downtown',
      road: worst >= 0 ? this.roadName(worst) : 'the main drag',
      pop: Math.round(this.agg.population).toLocaleString('en-US'),
      ...extra,
    };
  }

  /** Name of the neighbourhood around a tile: its district's name, else a generated area name. */
  areaName(tile: number): string {
    const p = this.planet;
    if (!p || tile < 0 || tile >= p.count) return 'downtown';
    const d = p.district[tile];
    if (d > 0 && p.districts[d]) return p.districts[d].name;
    const c = p.grid.center;
    return areaNameAt(c[tile * 3], c[tile * 3 + 1], c[tile * 3 + 2], p.spec.seed);
  }

  /** Street name of a road tile (or of the best road next to a lot). */
  roadName(tile: number): string {
    const p = this.planet;
    if (!p || tile < 0 || tile >= p.count) return 'Main Street';
    let t = tile;
    if (!p.road[t]) {
      for (const n of p.grid.neighbors(t)) if (p.road[n]) (t = n);
      if (!p.road[t]) return 'an unnamed lane';
    }
    const c = p.grid.center;
    return streetName(c[t * 3], c[t * 3 + 1], c[t * 3 + 2], p.road[t], p.spec.seed);
  }

  /** Queue a Hypernet post (rate-limited in real time by update()). */
  post(persona: Persona, text: string, tile?: number, urgent = false): void {
    if (urgent) this.newsQueue.unshift({ persona, text, tile });
    else this.newsQueue.push({ persona, text, tile });
    if (this.newsQueue.length > 6) this.newsQueue.length = 6;
  }

  private flushNews(force: boolean): void {
    if (!this.newsQueue.length) return;
    const now = performance.now();
    if (!force && now - this.lastNewsReal < 3500) return;
    const n = this.newsQueue.shift()!;
    this.lastNewsReal = now;
    pushNews({ author: n.persona.author, handle: n.persona.handle, icon: n.persona.icon, text: n.text, tile: n.tile, likes: Math.floor(this.rng.next() * this.rng.next() * 900) });
  }

  // ───────────────────────────── persistence

  private restoreGlobals(st: SavedState | null): void {
    const sandbox = this.sandbox;
    this.taxes = st?.taxes ? { ...st.taxes } : { R: DEFAULT_TAX, C: DEFAULT_TAX, I: DEFAULT_TAX, O: DEFAULT_TAX };
    this.budget = { ...defaultBudget(), ...(st?.budget ?? {}) };
    this.loans = st?.loans ? st.loans.map((l) => ({ ...l })) : [];
    this.lastMonth = st?.lastMonth ?? null;
    this.rules = st?.rules ? { ...st.rules } : { freeUtilities: false, noAbandon: sandbox, fastGrowth: false, maxDemand: false };
    this.events = st?.events ? st.events.map((e) => ({ ...e })) : [];
    this.history = st?.history ?? emptyHistory();
    if (st?.demand) this.demand = { ...st.demand };
    else this.demand = { R: 0.6, C: 0.3, I: 0.4, O: 0 };
    this.notes = st?.notes ? { ...st.notes } : {};
    this.hints = new Set(st?.hints ?? []);
    this.negMonths = st?.negMonths ?? 0;
    this.prevTaxes = st?.prevTaxes ? { ...st.prevTaxes } : { ...this.taxes };
    this.displaced = st?.displaced ?? 0;
    this.nextLoanId = st?.nextLoanId ?? 1;
    this.milestonesPop = st?.milestonesPop ?? 0;
    this.orbitalRes.clear();
    if (st?.orbitalRes) for (const [k, v] of Object.entries(st.orbitalRes)) this.orbitalRes.set(Number(k), Number(v) || 0);
    if (st) {
      this.rng.s = st.rng >>> 0 || this.rng.s;
      this.day = Math.max(this.day, st.day ?? 0);
    }
    this.nextFlavourDay = this.day + 6;
    this.nextFieldDay = this.day;
    this.projected = null;
  }

  private restoreRecs(st: SavedState): void {
    const c = st.recs;
    if (!c?.id) return;
    for (let i = 0; i < c.id.length; i++) {
      const r = this.recMap.get(c.id[i]);
      if (!r) continue;
      r.happiness = c.hap[i] ?? r.happiness;
      r.lvlProgress = c.lp[i] ?? 0;
      r.distress = c.dis[i] ?? 0;
      r.abandonDays = c.ab[i] ?? 0;
      r.garbage = c.gb[i] ?? 0;
      r.edu = c.edu[i] ?? r.edu;
      r.burnDays = c.burn[i] ?? 0;
      r.floodDays = c.flood[i] ?? 0;
      r.hazardDays = c.haz[i] ?? 0;
      r.lowDays = c.low[i] ?? 0;
    }
  }

  private restoreFields(fs: NonNullable<SavedState['fields']>): void {
    const f = this.fields!;
    const dec = (s: string, out: Float32Array, scale: number) => {
      try {
        const bytes = b64ToBytes(s);
        if (bytes.length !== out.length) return;
        for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] / 255) * scale;
      } catch {
        /* ignore corrupt field */
      }
    };
    dec(fs.pol, f.pollution, 100);
    dec(fs.lv, f.landValue, 100);
    dec(fs.crime, f.crime, 100);
    dec(fs.noise, f.noise, 100);
    f.snapNext = false;
    this.fieldsRestored = true;
  }

  /** Plain JSON snapshot of everything the sim needs to resume exactly. */
  serialize(): SavedState {
    const n = this.recs.length;
    const col = { id: new Array<number>(n), hap: new Array<number>(n), lp: new Array<number>(n), dis: new Array<number>(n), ab: new Array<number>(n), gb: new Array<number>(n), edu: new Array<number>(n), burn: new Array<number>(n), flood: new Array<number>(n), haz: new Array<number>(n), low: new Array<number>(n) };
    const r2 = (v: number) => Math.round(v * 100) / 100;
    for (let i = 0; i < n; i++) {
      const r = this.recs[i];
      col.id[i] = r.id;
      col.hap[i] = r2(r.happiness);
      col.lp[i] = r2(r.lvlProgress);
      col.dis[i] = r2(r.distress);
      col.ab[i] = r.abandonDays;
      col.gb[i] = r.garbage;
      col.edu[i] = r2(r.edu);
      col.burn[i] = r.burnDays;
      col.flood[i] = r.floodDays;
      col.haz[i] = r.hazardDays;
      col.low[i] = r.lowDays;
    }
    let fields: SavedState['fields'];
    const f = this.fields;
    if (f) {
      const enc = (a: Float32Array, scale: number) => {
        const out = new Uint8Array(a.length);
        for (let i = 0; i < a.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((a[i] / scale) * 255)));
        return bytesToB64(out);
      };
      fields = { pol: enc(f.pollution, 100), lv: enc(f.landValue, 100), crime: enc(f.crime, 100), noise: enc(f.noise, 100) };
    }
    return {
      v: SAVE_VERSION,
      day: this.day,
      rng: this.rng.s,
      taxes: { ...this.taxes },
      budget: { ...this.budget },
      loans: this.loans.map((l) => ({ ...l })),
      lastMonth: this.lastMonth,
      rules: { ...this.rules },
      events: this.events.map((e) => ({ ...e })),
      history: this.history,
      demand: { ...this.demand },
      notes: { ...this.notes },
      hints: [...this.hints],
      negMonths: this.negMonths,
      prevTaxes: { ...this.prevTaxes },
      displaced: this.displaced,
      nextLoanId: this.nextLoanId,
      milestonesPop: this.milestonesPop,
      recs: col,
      fields,
      orbitalRes: this.orbitalRes.size ? Object.fromEntries([...this.orbitalRes].map(([k, v]) => [String(k), Math.round(v)])) : undefined,
    };
  }
}

/**
 * Placeholder stored in planet.simData.sim while the planet is active: JSON.stringify (saves, snapshots) calls
 * toJSON() and gets the live state. No own properties, so structuredClone yields a harmless {} instead of throwing.
 */
const LIVE = new WeakMap<LiveSimState, Simulation>();
class LiveSimState {
  toJSON(): SavedState | Record<string, never> {
    return LIVE.get(this)?.serialize() ?? {};
  }
}

function tierLabel(id: string): string {
  const names = ['Outpost', 'Settlement', 'Township', 'Colony City', 'Metropolis', 'Megacity', 'Interplanetary Power', 'Stellar Civilisation', 'Galactic Civilisation'];
  const n = Number(String(id).replace(/\D/g, ''));
  return names[n] ?? 'new tier';
}

function rngPick<T>(rng: SimRng, arr: T[]): T {
  return arr[Math.floor(rng.next() * arr.length)];
}

/** Damage resistance 0..1 of a tile on the active planet (shields, blessings, shelters) — for god powers. */
export function damageResistance(tile: number): number {
  const sim = gameInstance?.sim;
  return sim ? sim.damageResistance(tile) : 0;
}

/** Re-exported for tests & tools. */
export { POLICIES, LENDERS, roadFacing, U_COUNT };
