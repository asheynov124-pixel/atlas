/**
 * The per-building daily update (the sim's hot loop) and the happiness / level-target models.
 * `updateRec` is called once per building per sim day (rolling across frames by Simulation.update) and:
 *   – draws utilities from its network (rationed), records consumption into the network accumulators,
 *   – moves residents in / out and staffs jobs from the city-wide labour pool,
 *   – evaluates problems, happiness, health, education drift, tourism, research,
 *   – advances construction, level progress, downgrade, distress → abandonment → collapse,
 *   – accumulates city / district aggregates into `sim.acc`.
 * No allocations in the hot path (factor breakdown only when `factors` is passed, for the inspector).
 */
import { BuildingState, TileFlag } from '../core/types';
import type { Simulation } from './Simulation';
import { BRec, P, U } from './state';
import { BUILD_DAYS, OXYGEN_PER_PERSON, ROAD_CAPACITY, SERVICE_INDEX, WATER_PER_POWER, budgetEffect, footprintMul, isRail, levelUpDays } from './params';
import type { Mods } from './policies';
import type { DefInfo } from './defInfo';

const S_POLICE = SERVICE_INDEX.police;
const S_FIRE = SERVICE_INDEX.fire;
const S_HEALTH = SERVICE_INDEX.health;
const S_EDU = SERVICE_INDEX.education;
const S_RESEARCH = SERVICE_INDEX.research;
const S_LEISURE = SERVICE_INDEX.leisure;
const S_TRANSIT = SERVICE_INDEX.transit;
const S_DATA = SERVICE_INDEX.data;
const S_SPIRIT = SERVICE_INDEX.spiritual;
const S_DEATH = SERVICE_INDEX.deathcare;

export type Factor = [label: string, value: number];

/** Utility service bits in BRec.served. */
export const SV_POWER = 1, SV_WATER = 2, SV_OXYGEN = 4, SV_GARBAGE = 8, SV_DATA = 16;

/** Hazard flags on any of the building's tiles (anchor is enough for 1-tile lots). */
function hazardFlags(sim: Simulation, r: BRec): number {
  const p = sim.planet!;
  const tiles = r.b.tiles;
  let f = 0;
  for (let i = 0; i < tiles.length; i++) f |= p.flags[tiles[i]];
  return f;
}

/** Cache the building's best adjacent (non-rail) road tile; recomputed when the road network changes. */
function refreshRoad(sim: Simulation, r: BRec): void {
  const p = sim.planet!;
  const g = p.grid;
  const tiles = r.b.tiles;
  let best = -1, bestCap = -1, any = false;
  for (let i = 0; i < tiles.length; i++) {
    const tt = tiles[i];
    for (let q = g.start[tt]; q < g.start[tt + 1]; q++) {
      const nb = g.nbr[q];
      const k = p.road[nb];
      if (!k) continue;
      any = true;
      if (isRail(k)) continue;
      const cap = ROAD_CAPACITY[k] ?? 0;
      if (cap > bestCap) {
        bestCap = cap;
        best = nb;
      }
    }
  }
  r.roadTile = best;
  r.hasRoad = any;
  r.roadVer = sim.roadVersion;
}

/** Home / job capacity of a building at a level (growables scale with level and type size). */
export function capacityOf(info: DefInfo, level: number, tiles: number, industryJobs = 1): { homeCap: number; jobCap: number } {
  const zp = info.zp;
  if (!zp) return { homeCap: info.housing, jobCap: info.jobs };
  const lvl = Math.max(1, Math.min(5, level)) - 1;
  const lvlRatio = zp.capacity[lvl] / zp.capacity[info.typLevel - 1];
  const cap = zp.capacity[lvl] * footprintMul(tiles) * info.sizeMul;
  if (info.fam === 0) return { homeCap: Math.round(cap), jobCap: Math.round(info.extraJobs * lvlRatio) };
  return { homeCap: Math.round(info.extraHousing * lvlRatio), jobCap: Math.round(cap * (info.fam === 2 ? industryJobs : 1)) };
}

/** Re-evaluate only which utilities reach a building (no accumulation) — used while the game is paused. */
export function refreshServed(sim: Simulation, r: BRec): void {
  const nets = sim.nets!;
  const net = nets.label[r.b.tile];
  r.net = net;
  let served = sim.exempt;
  if (net >= 0) {
    const ratio = r.info.priority === 0 ? nets.ratioSvc : nets.ratioGrow;
    const ok = (u: number) => r.h < ratio[u][net] || ratio[u][net] >= 1;
    if (r.powerUse <= 0 || ok(U.Power)) served |= SV_POWER;
    if (r.waterUse <= 0 || ok(U.Water)) served |= SV_WATER;
    if (r.oxygenUse <= 0 || ok(U.Oxygen)) served |= SV_OXYGEN;
    if (r.garbageGen <= 0 || ok(U.Garbage)) served |= SV_GARBAGE;
    if (r.dataUse <= 0 || ok(U.Data)) served |= SV_DATA;
  }
  r.served = served;
}

/** Main daily update for one building. */
export function updateRec(sim: Simulation, r: BRec): void {
  const p = sim.planet!;
  const b = r.b;
  const info = r.info;
  const t = b.tile;
  const f = sim.fields!;
  const nets = sim.nets!;
  const acc = sim.acc;
  const mods = sim.modsAt(p.district[t]);
  const state = b.state;

  r.net = nets.label[t];
  const flags = hazardFlags(sim, r);
  const underwater = info.def.placement !== 'water' && p.isWater(t);
  r.problems = 0;

  acc.buildings++;
  if (info.park) acc.parks++;
  if (info.landmark) acc.landmarks++;
  if (info.wonder) acc.wonders++;
  if (info.def.category === 'custom') acc.custom++;
  if (info.spaceport && state === BuildingState.Active) acc.spaceports++;

  // ── ruined / abandoned: no occupants, collapse timer, possible recovery
  if (state === BuildingState.Abandoned || state === BuildingState.Ruined) {
    acc.abandoned++;
    r.residents = 0;
    r.workers = 0;
    r.visitors = 0;
    if (!sim.settling) r.abandonDays++;
    if (b.occupants) b.occupants = 0;
    if (info.growable) {
      const fam = info.fam;
      // would it be served if people moved back? (no demand recorded)
      const net = r.net;
      let pr = 0;
      const ex = sim.exempt;
      if (!(ex & SV_POWER) && (net < 0 || r.h >= nets.ratioGrow[U.Power][net])) pr |= P.NoPower;
      if (!(ex & SV_WATER) && (net < 0 || r.h >= nets.ratioGrow[U.Water][net])) pr |= P.NoWater;
      if (!(ex & SV_OXYGEN) && sim.needsOxygen && (net < 0 || r.h >= nets.ratioGrow[U.Oxygen][net])) pr |= P.NoOxygen;
      r.problems = pr;
      r.happiness += (happinessTarget(sim, r, pr, flags, mods, null) - r.happiness) * 0.25;
      const ok = !(flags & (TileFlag.Irradiated | TileFlag.Goo | TileFlag.Flooded | TileFlag.Burning)) && !underwater && !(pr & (P.NoPower | P.NoOxygen));
      const d = fam === 0 ? sim.demand.R : fam === 1 ? sim.demand.C : fam === 2 ? sim.demand.I : sim.demand.O;
      if (state === BuildingState.Abandoned && ok && d > 0.15 && r.happiness > 45 && sim.rng.chance(0.02)) {
        sim.recover(r);
      } else if (!sim.rules.noAbandon && r.abandonDays > 45 + r.h * 40) {
        sim.queueRemoval(r.id, state === BuildingState.Ruined ? 'disaster' : 'abandon');
      }
    }
    trackDistrict(sim, r, 0);
    return;
  }

  // ── construction
  if (state === BuildingState.Constructing || state === BuildingState.Upgrading) {
    acc.constructing++;
    const days = sim.rules.fastGrowth ? 0.5 : BUILD_DAYS[info.zp?.density ?? 'med'] * (state === BuildingState.Upgrading ? 0.6 : 1);
    const prog = sim.settling ? b.progress ?? 0 : Math.min(1, (b.progress ?? 0) + 1 / Math.max(0.5, days));
    b.progress = prog;
    if (info.growable && info.zp) {
      const cap = info.zp.capacity[Math.max(1, Math.min(5, b.level)) - 1] * footprintMul(b.tiles.length);
      if (info.fam === 0) acc.pipelineHousing += cap;
      else acc.pipelineJobs[info.fam] += cap;
    }
    if (prog >= 1) sim.completeConstruction(r);
    trackDistrict(sim, r, 0);
    return;
  }

  // ── active (also Burning state: still occupied but suffering)
  const zp = info.zp;
  const lvl = Math.max(1, Math.min(5, b.level)) - 1;
  const fpMul = footprintMul(b.tiles.length);
  const fam = info.fam;
  const isHome = fam === 0 || info.housing > 0 || info.extraHousing > 0;

  // consumption
  const evPower = sim.eventMods.powerUse, evWater = sim.eventMods.waterUse;
  let powerUse = 0, waterUse = 0;
  if (zp) {
    // the content's own (budget-calibrated) figures at the type's typical level, scaled with level; else the zone table
    const size = fpMul * info.sizeMul;
    const lvlRatio = zp.capacity[lvl] / zp.capacity[info.typLevel - 1];
    powerUse = (info.growPower > 0 ? info.growPower * lvlRatio : zp.power[lvl] * size) * mods.powerUse * evPower;
    waterUse = (info.growWater > 0 ? info.growWater * lvlRatio : zp.power[lvl] * size * WATER_PER_POWER) * mods.waterUse * evWater;
  } else if (info.consumer) {
    powerUse = info.powerUse * mods.powerUse * evPower;
    waterUse = info.waterUse * mods.waterUse * evWater;
  }
  const occ0 = r.residents + r.workers;
  const oxyUse = sim.needsOxygen && info.consumer ? (info.oxygenUse + (r.capacity * 0.5 + occ0 * 0.5) * OXYGEN_PER_PERSON) * mods.oxygenUse : 0;
  const garbageGen = sim.garbageActive && info.consumer ? occ0 * (zp ? zp.garbage : 0.08) * mods.garbageGen : 0;
  const dataUse = occ0 * (zp ? zp.data : 0) * mods.dataUse;
  r.powerUse = powerUse;
  r.waterUse = waterUse;
  r.oxygenUse = oxyUse;
  r.garbageGen = garbageGen;
  r.dataUse = dataUse;

  // utilities: record demand, decide service (stable rationing)
  const net = r.net;
  let served = 0;
  const prioSvc = info.priority === 0;
  const h = r.h;
  if (net >= 0) {
    const ratio = prioSvc ? nets.ratioSvc : nets.ratioGrow;
    const dem = prioSvc ? nets.demandSvc : nets.demandGrow;
    if (powerUse > 0) {
      dem[U.Power][net] += powerUse;
      if (h < ratio[U.Power][net] || ratio[U.Power][net] >= 1) served |= SV_POWER;
    } else served |= SV_POWER;
    if (waterUse > 0) {
      dem[U.Water][net] += waterUse;
      if (h < ratio[U.Water][net] || ratio[U.Water][net] >= 1) served |= SV_WATER;
    } else served |= SV_WATER;
    if (oxyUse > 0) {
      dem[U.Oxygen][net] += oxyUse;
      if (h < ratio[U.Oxygen][net] || ratio[U.Oxygen][net] >= 1) served |= SV_OXYGEN;
    } else served |= SV_OXYGEN;
    if (garbageGen > 0) {
      dem[U.Garbage][net] += garbageGen;
      if (h < ratio[U.Garbage][net] || ratio[U.Garbage][net] >= 1) served |= SV_GARBAGE;
    } else served |= SV_GARBAGE;
    if (dataUse > 0) {
      dem[U.Data][net] += dataUse;
      if (h < ratio[U.Data][net] || ratio[U.Data][net] >= 1 || f.cov[S_DATA][t] > 0.35) served |= SV_DATA;
    } else served |= SV_DATA;
  }
  served |= sim.exempt;
  // frozen / burning buildings can't use what they get
  const burning = (flags & TileFlag.Burning) !== 0 || state === BuildingState.Burning;
  // a building set ablaze by state alone (no tile flag) joins the fire simulation
  if (state === BuildingState.Burning && !(flags & TileFlag.Burning)) sim.queueIgnite(b.tiles);
  const frozen = (flags & TileFlag.Frozen) !== 0;
  r.served = served;

  // producers feed the network (scaled by budget; dead while burning / frozen / flooded)
  if (net >= 0 && (info.powerOut || info.waterOut || info.oxygenOut || info.garbageCap || info.dataCap)) {
    const eff = (info.dept ? budgetEffect(sim.budget[info.dept] ?? 1) : 1) * (burning || frozen || underwater || (flags & TileFlag.Flooded) ? 0 : 1);
    if (eff > 0) {
      if (info.powerOut) nets.supply[U.Power][net] += info.powerOut * eff;
      if (info.waterOut) nets.supply[U.Water][net] += info.waterOut * eff;
      if (info.oxygenOut) nets.supply[U.Oxygen][net] += info.oxygenOut * eff;
      if (info.garbageCap) nets.supply[U.Garbage][net] += info.garbageCap * eff;
      if (info.dataCap) nets.supply[U.Data][net] += info.dataCap * eff;
    }
  }

  // problems from utilities
  let pr = 0;
  if (!(served & SV_POWER)) pr |= P.NoPower;
  if (!(served & SV_WATER)) pr |= P.NoWater;
  if (!(served & SV_OXYGEN)) pr |= P.NoOxygen;
  if (!sim.settling) {
    if (garbageGen > 0 && !(served & SV_GARBAGE)) r.garbage += 1;
    else r.garbage = Math.max(0, r.garbage - 3);
  }
  if (r.garbage > 8) pr |= P.Garbage;
  if (dataUse > 0.4 && !(served & SV_DATA)) pr |= P.NoData;
  if (burning) pr |= P.Fire;
  if ((flags & TileFlag.Flooded) || underwater) pr |= P.Flood;
  if (flags & TileFlag.Irradiated) pr |= P.Radiation;
  if (flags & TileFlag.Goo) pr |= P.Goo;
  if (frozen) pr |= P.Frozen;

  // ── occupancy: homes (residents) and / or workplaces (jobs); growables scale with level and type size
  const powered = (served & SV_POWER) !== 0;
  const watered = (served & SV_WATER) !== 0;
  const breathing = (served & SV_OXYGEN) !== 0;
  const caps = capacityOf(info, b.level, b.tiles.length, mods.industryJobs);
  const homeCap = caps.homeCap, jobCap = caps.jobCap;
  const jobIdx = zp ? (fam === 0 ? 1 : fam) : 4;
  r.capacity = fam === 0 || (!zp && homeCap > 0) ? homeCap : jobCap;
  let residents = 0, workers = 0;
  if (homeCap > 0) {
    let target = homeCap * (powered ? 1 : 0.55) * (watered ? 1 : 0.7) * (breathing ? 1 : 0.3) * (r.happiness < 25 ? 0.8 : 1);
    if (pr & (P.Radiation | P.Goo | P.Flood | P.Fire)) target *= 0.3;
    if (sim.demand.R < -0.45) target *= 0.92;
    residents = Math.min(r.residents, homeCap);
    if (sim.settling) {
      /* keep the saved occupancy */
    } else if (residents < target) {
      const rate = sim.demand.R > -0.2 ? 1 : 0.3;
      residents = Math.min(target, residents + Math.max(1, homeCap * 0.12) * rate * (sim.rules.fastGrowth ? 3 : 1));
    } else residents -= Math.ceil((residents - target) * 0.25);
    residents = Math.max(0, Math.round(residents));
  }
  r.residents = residents;
  if (jobCap > 0) {
    const needE1 = zp ? zp.eduNeed[0] : 0.15, needE2 = zp ? zp.eduNeed[1] : 0.05;
    acc.jobs[jobIdx] += jobCap;
    acc.jobsE1[jobIdx] += jobCap * needE1;
    acc.jobsE2[jobIdx] += jobCap * needE2;
    workers = Math.round(jobCap * sim.fill[jobIdx] * (powered ? 1 : 0.6) * (frozen || burning ? 0.3 : 1));
  }
  r.workers = workers;
  const occ = residents + workers;
  const occShown = homeCap > 0 ? residents : workers;
  if (b.occupants !== occShown) b.occupants = occShown;
  if (b.jobs !== jobCap) b.jobs = jobCap;

  // per-tile people (crime density, coverage capacity) — spread over the footprint
  const tiles = b.tiles;
  const perTileRes = residents / tiles.length, perTileWork = workers / tiles.length;
  for (let i = 0; i < tiles.length; i++) {
    f.residents[tiles[i]] = perTileRes;
    f.workers[tiles[i]] = perTileWork;
  }

  // ── environment problems
  const pol = f.pollution[t], noise = f.noise[t], crime = f.crime[t];
  if (isHome) {
    if (pol > 35) pr |= P.Pollution;
    if (noise > 45) pr |= P.Noise;
    if (sim.agg.unemploymentFelt > 0.12) pr |= P.Unemployment;
  }
  if (crime > 45) pr |= P.Crime;
  if (fam === 1 && sim.custFactor < 0.55) pr |= P.NoCustomers;
  if (jobCap > 0 && fam !== 0 && sim.fill[jobIdx] < 0.6) pr |= P.NoWorkers;
  if ((fam === 3 || (zp && zp.eduNeed[0] > 0.4)) && sim.skillFill < 0.6) pr |= P.NoEducated;
  if (fam >= 0 && sim.taxRate(fam) > 0.16) pr |= P.Taxes;
  if (r.roadVer !== sim.roadVersion) refreshRoad(sim, r);
  if (!r.hasRoad && info.growable) pr |= P.NoRoad;
  if (isHome && f.cov[S_HEALTH][t] < 0.05 && sim.agg.population > 2500) pr |= P.NoHealth;
  if (!isHome && r.roadTile >= 0 && f.traffic[r.roadTile] > 0.95) pr |= P.Traffic;

  // ── happiness
  const target = happinessTarget(sim, r, pr, flags, mods, null);
  if (!sim.settling) r.happiness += (target - r.happiness) * 0.25;
  if (r.happiness < 25) pr |= P.Unhappy;
  r.problems = pr;

  // ── education drift (homes), health
  if (isHome) {
    const eduT = Math.min(2, f.cov[S_EDU][t] * 1.45 + f.cov[S_RESEARCH][t] * 0.55 + (flags & TileFlag.Blessed ? 0.2 : 0));
    if (!sim.settling) r.edu += (eduT - r.edu) * 0.012 * mods.education * sim.eventMods.education;
    const e = r.edu;
    const fHi = e > 1 ? e - 1 : 0;
    const fEd = (e < 1 ? e : 1) - fHi;
    acc.eduRes[0] += residents * (1 - (e < 1 ? e : 1));
    acc.eduRes[1] += residents * fEd;
    acc.eduRes[2] += residents * fHi;
    acc.population += residents;
    acc.housingCap += homeCap;
    const health = healthOf(sim, r, pr, mods);
    acc.healthSum += health * residents;
    acc.healthW += residents;
    acc.eduSum += e * residents;
    acc.eduW += residents;
    acc.happySum += r.happiness * (residents + workers * 0.5);
    acc.happyW += residents + workers * 0.5;
  } else {
    r.edu = sim.workerEdu;
    acc.happySum += r.happiness * workers * 0.5;
    acc.happyW += workers * 0.5;
  }
  acc.workers[jobIdx] += workers;
  if (fam === 0 || fam === 1 || fam === 2 || fam === 3) acc.zoneBuildings[info.zone]++;
  acc.growables += info.growable ? 1 : 0;

  // ── tourism & research
  let visitors = 0;
  if (zp) visitors += (info.tourism > 0 ? info.tourism * (zp.capacity[lvl] / zp.capacity[info.typLevel - 1]) : zp.tourism[lvl]) * fpMul;
  else visitors += info.tourism;
  if (visitors > 0) visitors *= mods.tourism * sim.eventMods.tourism * (0.5 + r.happiness / 100) * (powered ? 1 : 0.5);
  r.visitors = visitors;
  acc.visitors += visitors;
  let research = 0;
  if (zp && zp.research) research += workers * zp.research;
  if (info.research) research += info.research * budgetEffect(sim.budget[info.dept ?? 'research'] ?? 1) * (powered ? 1 : 0.3) * (info.jobs > 0 ? 0.5 + 0.5 * sim.fill[4] : 1);
  acc.research += research * mods.research * sim.eventMods.research;

  // ── problems tally (iterate set bits only)
  let bits = pr;
  while (bits) {
    const low = bits & -bits;
    const bit = 31 - Math.clz32(low);
    bits ^= low;
    const n = ++acc.problems[bit];
    if (acc.problemTile[bit] < 0 || (r.h < 0.2 && n < 40)) acc.problemTile[bit] = t;
  }

  // ── levels (growables)
  if (sim.settling) {
    trackDistrict(sim, r, occ);
    return;
  }
  if (info.growable && zp && !mods.levelLock && !burning && !frozen) levelStep(sim, r, pr, mods);

  // ── distress → abandonment
  distressStep(sim, r, pr, isHome && zp ? zp.density : 'med');

  // ── hazards on the building
  hazardStep(sim, r, flags, underwater);

  trackDistrict(sim, r, occ);
}

function trackDistrict(sim: Simulation, r: BRec, _occ: number): void {
  const d = sim.planet!.district[r.b.tile];
  if (d === 0) return;
  const acc = sim.acc;
  acc.distPop[d] += r.residents;
  acc.distJobs[d] += r.workers;
  acc.distBld[d]++;
  const w = r.residents + r.workers * 0.5 + 1;
  acc.distHappy[d] += r.happiness * w;
  acc.distHappyW[d] += w;
}

/** Push a factor (inspector breakdown) and return its value. */
function fac(factors: Factor[] | null, label: string, v: number): number {
  if (factors && v !== 0) factors.push([label, v]);
  return v;
}

/** Target happiness 0..100 (optionally records the factor breakdown). */
export function happinessTarget(sim: Simulation, r: BRec, pr: number, flags: number, mods: Mods, factors: Factor[] | null): number {
  const f = sim.fields!;
  const t = r.b.tile;
  const info = r.info;
  const isHome = info.fam === 0 || info.housing > 0 || info.extraHousing > 0;
  const cov = f.cov;
  let h = 55;
  const svc = cov[S_POLICE][t] * 4 + cov[S_FIRE][t] * 4 + cov[S_HEALTH][t] * (isHome ? 5 : 2) + (isHome ? cov[S_EDU][t] * 4 : 0) + cov[S_LEISURE][t] * (isHome ? 6 : 3) + cov[S_TRANSIT][t] * 2 + cov[S_SPIRIT][t] * 2 + cov[S_DEATH][t];
  h += fac(factors, 'Services nearby', Math.round(svc));
  h += fac(factors, 'Land value', Math.round((f.landValue[t] - 32) * 0.2));
  h += fac(factors, 'Parks & landmarks', Math.round(Math.max(-15, Math.min(20, f.happyFx[t]))));
  if (isHome) {
    h += fac(factors, 'Pollution', -Math.round(f.pollution[t] * 0.3));
    h += fac(factors, 'Noise', -Math.round(Math.max(0, f.noise[t] - 15) * 0.18));
    h += fac(factors, 'Unemployment', -Math.round(sim.agg.unemploymentFelt * 35));
  } else {
    h += fac(factors, 'Pollution', -Math.round(f.pollution[t] * 0.08));
  }
  h += fac(factors, 'Crime', -Math.round(f.crime[t] * 0.2));
  const fam = info.fam >= 0 ? info.fam : 0;
  h += fac(factors, 'Taxes', -Math.round((sim.taxRate(fam) - 0.09) * 150));
  if (pr) {
    if (pr & P.NoPower) h += fac(factors, 'No power', -20);
    if (pr & P.NoWater) h += fac(factors, 'No water', -15);
    if (pr & P.NoOxygen) h += fac(factors, 'No oxygen', -35);
    if (pr & P.Garbage) h += fac(factors, 'Garbage', -10);
    if (pr & P.NoData) h += fac(factors, 'No data', -5);
    if (pr & P.NoCustomers) h += fac(factors, 'No customers', -10);
    if (pr & P.NoWorkers) h += fac(factors, 'Short-staffed', -6);
    if (pr & P.Traffic) h += fac(factors, 'Traffic', -6);
  }
  if (flags) {
    if (flags & TileFlag.Blessed) h += fac(factors, 'Divine blessing', 15);
    if (flags & TileFlag.Frozen) h += fac(factors, 'Frozen', -20);
    if (flags & TileFlag.Irradiated) h += fac(factors, 'Radiation', -50);
    if (flags & TileFlag.Goo) h += fac(factors, 'Grey goo', -50);
    if (flags & TileFlag.Flooded) h += fac(factors, 'Flooding', -30);
    if (flags & TileFlag.Burning) h += fac(factors, 'Fire!', -40);
  }
  h += fac(factors, 'Policies & events', mods.happiness + sim.eventMods.happiness);
  return h < 0 ? 0 : h > 100 ? 100 : h;
}

export function healthOf(sim: Simulation, r: BRec, pr: number, mods: Mods): number {
  const f = sim.fields!;
  const t = r.b.tile;
  let h = 42 + f.cov[S_HEALTH][t] * 45 - f.pollution[t] * 0.35 + mods.health + sim.eventMods.health;
  if (pr & P.NoWater) h -= 12;
  if (pr & P.Garbage) h -= 8;
  if (pr & P.Radiation) h -= 40;
  if (f.cov[S_LEISURE][t] > 0.3) h += 4;
  return h < 0 ? 0 : h > 100 ? 100 : h;
}

/** Desired level 1..5 from land value, services, education, customers, data. */
export function levelTarget(sim: Simulation, r: BRec, pr: number): number {
  const f = sim.fields!;
  const t = r.b.tile;
  const info = r.info;
  const cov = f.cov;
  const lv = f.landValue[t];
  const svc = (cov[S_POLICE][t] + cov[S_FIRE][t] + cov[S_HEALTH][t] + cov[S_EDU][t] + cov[S_LEISURE][t]) / 5;
  let s = 0;
  switch (info.fam) {
    case 0:
      s = lv * 0.5 + svc * 32 + r.edu * 9 + (r.happiness - 50) * 0.15;
      break;
    case 1:
      s = lv * 0.45 + Math.min(1.2, sim.custFactor) * 18 + (cov[S_POLICE][t] + cov[S_FIRE][t] + cov[S_TRANSIT][t]) * 6 + sim.workerEdu * 8;
      break;
    case 2:
      if (info.zone === 10) s = lv * 0.2 + sim.workerEdu * 26 + svc * 18 + cov[S_DATA][t] * 10;
      else s = 22 + (cov[S_POLICE][t] + cov[S_FIRE][t]) * 12 + sim.workerEdu * 16 + lv * 0.1;
      break;
    case 3:
      s = lv * 0.4 + sim.workerEdu * 22 + cov[S_DATA][t] * 14 + svc * 14;
      break;
  }
  if (pr & P.Traffic) s -= 10;
  let lvl = 1 + Math.floor(s / 15);
  // hard requirements
  if (pr & (P.NoWater | P.NoPower)) lvl = Math.min(lvl, 1);
  if (pr & P.Garbage) lvl = Math.min(lvl, 2);
  if ((info.fam === 3 || info.zone === 10) && pr & P.NoData) lvl = Math.min(lvl, 2);
  if (r.happiness < 35) lvl = Math.min(lvl, r.b.level);
  const max = sim.maxLevelFor(info.zone, sim.planet!.district[t]);
  return Math.max(1, Math.min(max, lvl));
}

function levelStep(sim: Simulation, r: BRec, pr: number, mods: Mods): void {
  const b = r.b;
  const target = levelTarget(sim, r, pr);
  r.target = target;
  if (target > b.level) {
    const speed = mods.growthSpeed * (sim.rules.fastGrowth ? 3 : 1);
    r.lvlProgress += speed / levelUpDays(b.level);
    r.lowDays = 0;
    if (r.lvlProgress >= 1) {
      r.lvlProgress = 0;
      sim.queueLevel(r, b.level + 1);
    }
  } else {
    r.lvlProgress *= 0.985;
    if (target < b.level - 1) {
      if (++r.lowDays > 90) {
        r.lowDays = 0;
        sim.queueLevel(r, b.level - 1);
      }
    } else r.lowDays = 0;
  }
}

function distressStep(sim: Simulation, r: BRec, pr: number, density: string): void {
  let w = 0;
  if (pr & P.NoOxygen) w += 3;
  if (pr & P.NoPower) w += 1;
  if (pr & P.NoWater) w += density === 'low' && r.b.level <= 1 ? 0.3 : 1;
  if (pr & P.Garbage && r.garbage > 20) w += 0.35;
  if (pr & P.NoWorkers && !(r.info.fam === 0)) w += 0.25;
  if (pr & P.NoCustomers) w += 0.25;
  if (r.happiness < 22) w += 0.6;
  if (w > 0) r.distress += w;
  else r.distress = Math.max(0, r.distress - 2);
  if (r.distress >= 30 + r.h * 25 && !sim.rules.noAbandon && r.info.growable) {
    const cause = pr & P.NoOxygen ? 'oxygen' : pr & P.NoPower ? 'power' : pr & P.NoWater ? 'water' : pr & P.Garbage ? 'garbage' : 'unhappy';
    sim.abandon(r, cause);
  }
}

function hazardStep(sim: Simulation, r: BRec, flags: number, underwater: boolean): void {
  const severeHaz = flags & (TileFlag.Irradiated | TileFlag.Goo);
  if (severeHaz) {
    r.hazardDays++;
    if (!sim.rules.noAbandon && r.hazardDays > 3 && r.b.state === BuildingState.Active && r.info.growable) sim.abandon(r, flags & TileFlag.Goo ? 'goo' : 'radiation');
    if (flags & TileFlag.Goo && r.hazardDays > 14) sim.queueRemoval(r.id, 'disaster');
  } else r.hazardDays = Math.max(0, r.hazardDays - 1);
  if (flags & TileFlag.Flooded || underwater) {
    r.floodDays++;
    if (r.floodDays > 5 && r.b.state === BuildingState.Active && r.info.growable && !sim.rules.noAbandon) sim.abandon(r, 'flood');
    if (r.floodDays > 14) sim.queueRemoval(r.id, 'disaster');
  } else r.floodDays = Math.max(0, r.floodDays - 2);
}
