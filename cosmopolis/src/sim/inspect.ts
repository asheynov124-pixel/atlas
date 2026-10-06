/**
 * Inspector rows for buildings and tiles: who lives / works there, level progress, happiness and its causes,
 * needs ✓/✗ (power, water, oxygen, garbage, data), service coverage, land value, pollution, taxes or upkeep,
 * production, problems and a quote from a (procedurally generated) resident.
 */
import { BuildingState, Feature, RoadKind, TileFlag, type InspectRow } from '../core/types';
import type { Simulation } from './Simulation';
import { SimRng } from './rng';
import { PROBLEM_INFO, P, type BRec } from './state';
import { SERVICE_INDEX, budgetEffect } from './params';
import { happinessTarget, levelTarget, SV_DATA, SV_GARBAGE, SV_OXYGEN, SV_POWER, SV_WATER, type Factor } from './buildings';
import { citizenJob, citizenName, residentQuote } from './chatter';
import { DAYS_PER_MONTH, MONTHS, START_YEAR } from '../game/Clock';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const num = (v: number) => Math.round(v).toLocaleString('en-US');
const money = (v: number) => `₡${Math.round(v).toLocaleString('en-US')}`;
const tone = (v: number, good = 0.66, warn = 0.33): InspectRow['tone'] => (v >= good ? 'good' : v >= warn ? 'warn' : 'bad');

export function dateOf(day: number): string {
  const m = Math.floor(day / DAYS_PER_MONTH) % 12;
  const y = START_YEAR + Math.floor(day / (DAYS_PER_MONTH * 12));
  return `${MONTHS[m]} ${y}`;
}


export function inspectBuilding(sim: Simulation, id: number): InspectRow[] {
  const p = sim.planet;
  const r = sim.recMap.get(id);
  const b = p?.buildings.get(id);
  if (!p || !b || !r) return [];
  const info = r.info;
  const f = sim.fields!;
  const t = b.tile;
  const d = p.district[t];
  const rows: InspectRow[] = [];
  const row = (label: string, value: string, extra: Partial<InspectRow> = {}) => rows.push({ label, value, ...extra });
  const active = b.state === BuildingState.Active || b.state === BuildingState.Burning;
  const isHome = info.fam === 0 || info.housing > 0;

  // what is going on (the header already shows name, stars and a state chip)
  if (b.state === BuildingState.Abandoned) {
    row('Abandoned', sim.abandonReason(r), { tone: 'bad' });
    if (info.growable) row('Collapses in', `~${Math.max(1, Math.round(45 + r.h * 40 - r.abandonDays))} days unless conditions improve`, { tone: 'warn' });
  } else if (b.state === BuildingState.Ruined) row('Ruins', 'Bulldoze to clear the lot', { tone: 'bad' });
  if (r.problems) {
    const list = problemsByImpact(r.problems);
    const shown = list.slice(0, 3).map((x) => `${x.icon} ${x.label}`).join(' · ') + (list.length > 3 ? ` · +${list.length - 3}` : '');
    row('Problems', shown, { tone: list.some((x) => x.severe) ? 'bad' : 'warn' });
    row('Fix', list[0].fix, { tone: 'neutral' });
  }

  // mood
  if (active) {
    const h = r.happiness;
    row('Happiness', `${Math.round(h)} ${h >= 75 ? '😄' : h >= 55 ? '🙂' : h >= 35 ? '😐' : '😠'}`, { bar: h / 100, tone: tone(h / 100, 0.6, 0.38) });
    const factors: Factor[] = [];
    happinessTarget(sim, r, r.problems, flagsOf(sim, r), sim.modsAt(d), factors);
    const pos = factors.filter((x) => x[1] > 0).sort((a, c) => c[1] - a[1]).slice(0, 3);
    const neg = factors.filter((x) => x[1] < 0).sort((a, c) => a[1] - c[1]).slice(0, 3);
    if (pos.length) row('Likes', pos.map(([l, v]) => `${l} +${v}`).join(' · '), { tone: 'good' });
    if (neg.length) row('Dislikes', neg.map(([l, v]) => `${l} ${v}`).join(' · '), { tone: 'bad' });
  }

  // people
  if (isHome && b.state !== BuildingState.Constructing) {
    row('Residents', `${num(r.residents)} / ${num(r.capacity)}`, { bar: r.capacity ? r.residents / r.capacity : 0, tone: 'neutral' });
  }
  const jobs = info.fam > 0 ? r.capacity : info.jobs;
  if (jobs > 0 && b.state !== BuildingState.Constructing) row('Workers', `${num(r.workers)} / ${num(jobs)} jobs`, { bar: r.workers / jobs, tone: tone(r.workers / jobs, 0.85, 0.5) });

  // level
  if (info.growable && b.state !== BuildingState.Constructing) {
    const maxL = sim.maxLevelFor(info.zone, d);
    const target = active ? levelTarget(sim, r, r.problems) : b.level;
    const next = b.level >= maxL ? 'top level' : sim.modsAt(d).levelLock ? 'heritage — frozen' : target > b.level ? `upgrading ${pct(r.lvlProgress)}` : 'needs land value & services';
    row('Level', `${b.level} / ${maxL} · ${next}`, { bar: b.level >= maxL ? 1 : r.lvlProgress, tone: target > b.level ? 'good' : 'neutral' });
  }

  // needs
  if (info.consumer && active) {
    const s = r.served;
    const need = (label: string, ok: boolean, detail: string) => row(label, `${ok ? '✓' : '✗'} ${detail}`, { tone: ok ? 'good' : 'bad' });
    if (r.powerUse > 0) need('Power', !!(s & SV_POWER), s & SV_POWER ? `${r.powerUse.toFixed(1)} MW` : 'no power');
    if (r.waterUse > 0) need('Water', !!(s & SV_WATER), s & SV_WATER ? `${r.waterUse.toFixed(1)} kL/day` : 'dry taps');
    if (sim.needsOxygen && r.oxygenUse > 0) need('Oxygen', !!(s & SV_OXYGEN), s & SV_OXYGEN ? 'breathable' : 'suffocating');
    if (r.garbageGen > 0) need('Garbage', !(r.problems & P.Garbage), r.problems & P.Garbage ? 'piling up' : 'collected');
    if (r.dataUse > 0.2) need('Data', !!(s & SV_DATA), s & SV_DATA ? 'online' : 'offline');
  }

  // production & reach
  const prod: string[] = [];
  const eff = info.dept ? budgetEffect(sim.budget[info.dept] ?? 1) : 1;
  if (info.powerOut) prod.push(`${num(info.powerOut * eff)} MW`);
  if (info.waterOut) prod.push(`${num(info.waterOut * eff)} kL water`);
  if (info.oxygenOut) prod.push(`${num(info.oxygenOut * eff)} O₂`);
  if (info.garbageCap) prod.push(`${num(info.garbageCap * eff)} t trash/mo`);
  if (info.dataCap) prod.push(`${num(info.dataCap * eff)} Tb data`);
  if (prod.length) row('Produces', prod.join(' · '), { tone: 'good' });
  for (const c of info.coverage.slice(0, 3)) row('Covers', `${SERVICE_LABEL[c.service] ?? c.service} · ${c.radius} tiles${c.capacity ? ` · ${num(c.capacity * eff)} served` : ''}`);
  if (r.visitors > 0.5) row('Visitors', `${num(r.visitors)} / month`, { tone: 'good' });
  if (info.research > 0) row('Research', `${num(info.research * eff)} pts / month`, { tone: 'good' });

  // surroundings
  const cov = f.cov;
  const svc: [string, number][] = [
    ['Police', cov[SERVICE_INDEX.police][t]],
    ['Fire', cov[SERVICE_INDEX.fire][t]],
    ['Health', cov[SERVICE_INDEX.health][t]],
    ['Schools', cov[SERVICE_INDEX.education][t]],
    ['Parks', cov[SERVICE_INDEX.leisure][t]],
  ];
  row('Coverage', svc.map(([l, v]) => `${v >= 0.66 ? '●' : v >= 0.25 ? '◐' : '○'} ${l}`).join('  '));
  row('Land value', `${Math.round(f.landValue[t])}`, { bar: f.landValue[t] / 100, tone: tone(f.landValue[t] / 100, 0.55, 0.3) });
  if (f.pollution[t] > 3) row('Pollution', `${Math.round(f.pollution[t])}`, { bar: Math.min(1, f.pollution[t] / 80), tone: f.pollution[t] > 35 ? 'bad' : 'warn' });
  if (f.noise[t] > 20) row('Noise', `${Math.round(f.noise[t])}`, { bar: Math.min(1, f.noise[t] / 70), tone: f.noise[t] > 45 ? 'bad' : 'warn' });
  if (f.crime[t] > 5) row('Crime', `${Math.round(f.crime[t])}`, { bar: Math.min(1, f.crime[t] / 70), tone: f.crime[t] > 45 ? 'bad' : 'warn' });

  // money
  if (info.growable) row('Taxes paid', `${money(r.taxPaid)} / month`, { tone: 'good' });
  else if (info.upkeep > 0) row('Upkeep', `${money(info.upkeep * (sim.budget[info.dept ?? ''] ?? 1))} / month`, { tone: 'neutral' });
  if (info.income > 0) row('Revenue', `${money(info.income)} / month`, { tone: 'good' });

  if (isHome && r.residents > 0) {
    const e = r.edu;
    const hi = Math.max(0, e - 1), ed = Math.min(1, e) - hi, un = 1 - Math.min(1, e);
    row('Education', `${pct(un)} basic · ${pct(ed)} educated · ${pct(hi)} graduates`);
  }

  // a voice from inside
  if ((r.residents > 0 || r.workers > 0) && active) {
    const rng = new SimRng(id * 7919 + Math.floor(sim.day / 15));
    const first = problemsByImpact(r.problems)[0];
    const quote = residentQuote(rng, r.happiness, first?.id ?? null, { city: p.city.name });
    const age = 18 + Math.floor(rng.next() * 60);
    row(isHome ? 'Resident' : 'Employee', `${quote} — ${citizenName(rng)}, ${age}, ${citizenJob(rng)}`);
  }
  if (isHome && active && r.residents > 0) {
    const jam = r.roadTile >= 0 ? Math.max(0, f.traffic[r.roadTile]) : 0;
    const transit = cov[SERVICE_INDEX.transit][t];
    const mins = Math.round(9 + jam * 28 + (1 - Math.min(1, sim.stats.jobs / Math.max(1, sim.stats.workforce))) * 6 - transit * 5);
    row('Commute', `~${Math.max(4, mins)} min${transit > 0.4 ? ' · transit nearby' : ''}`, { tone: mins > 30 ? 'bad' : mins > 18 ? 'warn' : 'good' });
  }
  row('Address', `${sim.roadName(r.roadTile >= 0 ? r.roadTile : t)}, ${sim.areaName(t)}`);
  row('Built', dateOf(b.builtDay));
  return rows;
}

const SERVICE_LABEL: Record<string, string> = {
  police: 'Police', fire: 'Fire', health: 'Health', education: 'Education', research: 'Research', leisure: 'Leisure', transit: 'Transit',
  deathcare: 'Deathcare', garbage: 'Garbage pickup', data: 'Data', tourism: 'Tourism', spiritual: 'Spiritual',
};

/** Display order: emergencies first, then what hurts the most, symptoms ("very unhappy") last. */
const IMPACT = ['fire', 'flood', 'radiation', 'goo', 'oxygen', 'power', 'water', 'garbage', 'jobs', 'customers', 'workers', 'educated', 'crime', 'health', 'pollution', 'traffic', 'noise', 'taxes', 'data', 'road', 'frozen', 'unhappy'];
function problemsByImpact(bits: number) {
  return PROBLEM_INFO.filter((x) => bits & x.bit).sort((a, b) => IMPACT.indexOf(a.id) - IMPACT.indexOf(b.id));
}

function flagsOf(sim: Simulation, r: BRec): number {
  let f = 0;
  for (const t of r.b.tiles) f |= sim.planet!.flags[t];
  return f;
}

export function inspectTile(sim: Simulation, t: number): InspectRow[] {
  const p = sim.planet;
  if (!p || t < 0 || t >= p.count) return [];
  const f = sim.fields;
  const rows: InspectRow[] = [];
  const row = (label: string, value: string, extra: Partial<InspectRow> = {}) => rows.push({ label, value, ...extra });
  const water = p.isWater(t);
  const rel = p.elevation[t] - p.seaOffset;
  if (!water && rel > 0) row('Altitude', `${rel * 6} m above sea level`);
  const feat = p.feature[t];
  if (feat === Feature.Ruins || feat === Feature.Ore || feat === Feature.CrystalDeposit || feat === Feature.IceDeposit || feat === Feature.GasVent || feat === Feature.GeoVent) row('Resource', featureLabel(feat), { tone: 'good' });
  const z = p.zone[t];
  if (z) {
    if (p.building[t] < 0 && !p.road[t]) {
      if (!p.hasRoadAccess(t)) row('Lot', 'Needs a road to develop', { tone: 'warn' });
      else {
        const net = sim.nets?.netOf(t) ?? -1;
        const powered = sim.rules.freeUtilities || sim.sandbox || (sim.nets?.hasSupply(0, net) ?? false);
        row('Lot', powered ? 'Ready to develop' : 'Waiting for power ⚡', { tone: powered ? 'good' : 'warn' });
      }
    }
  }
  if (!water) row('Area', sim.areaName(t));
  if (p.road[t]) {
    row('Street', sim.roadName(t));
    if (f && f.traffic[t] >= 0 && p.road[t] !== RoadKind.Maglev && p.road[t] !== RoadKind.Hyperloop) {
      const c = f.traffic[t];
      row('Traffic', `${num(f.trafficLoad[t])} trips/day · ${pct(Math.min(1.5, c))} of capacity`, { bar: Math.min(1, c), tone: c > 0.9 ? 'bad' : c > 0.6 ? 'warn' : 'good' });
    }
  }
  if (f && !water) {
    row('Land value', `${Math.round(f.landValue[t])}`, { bar: f.landValue[t] / 100, tone: tone(f.landValue[t] / 100, 0.55, 0.3) });
    row('Pollution', `${Math.round(f.pollution[t])}`, { bar: Math.min(1, f.pollution[t] / 80), tone: f.pollution[t] > 35 ? 'bad' : f.pollution[t] > 10 ? 'warn' : 'good' });
    if (f.noise[t] > 5) row('Noise', `${Math.round(f.noise[t])}`, { bar: Math.min(1, f.noise[t] / 70), tone: f.noise[t] > 45 ? 'bad' : 'warn' });
    if (f.crime[t] > 2) row('Crime', `${Math.round(f.crime[t])}`, { bar: Math.min(1, f.crime[t] / 70), tone: f.crime[t] > 45 ? 'bad' : 'warn' });
    const covs = (Object.keys(SERVICE_INDEX) as (keyof typeof SERVICE_INDEX)[])
      .map((k) => [k, f.cov[SERVICE_INDEX[k]][t]] as [string, number])
      .filter(([, v]) => v > 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (covs.length) row('Coverage', covs.map(([k, v]) => `${k} ${pct(v)}`).join(' · '));
    const res = sim.damageResistance(t);
    if (res > 0.05) row('Protection', `${pct(res)} damage resistance`, { tone: 'good' });
  }
  const fl = p.flags[t];
  if (fl) {
    const names: string[] = [];
    if (fl & TileFlag.Burning) names.push('🔥 burning');
    if (fl & TileFlag.Flooded) names.push('🌊 flooded');
    if (fl & TileFlag.Scorched) names.push('scorched');
    if (fl & TileFlag.Frozen) names.push('🧊 frozen');
    if (fl & TileFlag.Goo) names.push('🦠 grey goo');
    if (fl & TileFlag.Irradiated) names.push('☢️ irradiated');
    if (fl & TileFlag.Blessed) names.push('✨ blessed');
    if (fl & TileFlag.Locked) names.push('🔒 locked');
    if (names.length) row('Status', names.join(' · '), { tone: fl & (TileFlag.Blessed) && names.length === 1 ? 'good' : 'bad' });
  }
  return rows;
}

function prettyEnum(s: string | undefined): string {
  if (!s) return 'Unknown';
  return s.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function featureLabel(f: number): string {
  switch (f) {
    case Feature.Trees: return '🌲 Woodland';
    case Feature.DenseTrees: return '🌳 Dense forest';
    case Feature.Rocks: return '🪨 Boulders';
    case Feature.Ore: return '⛏️ Ore deposit';
    case Feature.CrystalDeposit: return '💎 Crystal deposit';
    case Feature.IceDeposit: return '🧊 Ice deposit';
    case Feature.GasVent: return '💨 Gas vent';
    case Feature.Ruins: return '🏛️ Ancient ruins (tourism)';
    case Feature.GeoVent: return '♨️ Geothermal vent';
    case Feature.Flowers: return '🌸 Wildflowers';
    case Feature.AlienFlora: return '🍄 Alien flora';
    case Feature.Kelp: return '🌿 Kelp forest';
    case Feature.Rubble: return '🧱 Rubble';
    case Feature.Crater: return '☄️ Impact crater';
  }
  return prettyEnum(Feature[f]);
}
