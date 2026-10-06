/**
 * Inspector rows for buildings and tiles: who lives / works there, level progress, happiness and its causes,
 * needs ✓/✗ (power, water, oxygen, garbage, data), service coverage, land value, pollution, taxes or upkeep,
 * production, problems and a quote from a (procedurally generated) resident.
 */
import { Biome, BuildingState, Feature, RoadKind, TileFlag, type InspectRow } from '../core/types';
import { zoneInfo } from '../content/zones';
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

const STATE_LABEL: Record<number, string> = {
  [BuildingState.Active]: 'Operating',
  [BuildingState.Constructing]: 'Under construction',
  [BuildingState.Abandoned]: 'Abandoned',
  [BuildingState.Burning]: 'On fire!',
  [BuildingState.Ruined]: 'Ruins',
  [BuildingState.Upgrading]: 'Renovating',
};

const ROAD_NAMES = ['—', 'Path', 'Street', 'Avenue', 'Highway', 'Maglev', 'Hyperloop'];

export function inspectBuilding(sim: Simulation, id: number): InspectRow[] {
  const p = sim.planet;
  const r = sim.recMap.get(id);
  const b = p?.buildings.get(id);
  if (!p || !b || !r) return [];
  const info = r.info;
  const def = info.def;
  const f = sim.fields!;
  const t = b.tile;
  const rows: InspectRow[] = [];
  const row = (label: string, value: string, extra: Partial<InspectRow> = {}) => rows.push({ label, value, ...extra });
  const zi = info.growable ? zoneInfo(info.zone) : undefined;
  row('Type', zi ? `${def.name} · ${zi.short}` : def.name);
  const d = p.district[t];
  if (d > 0 && p.districts[d]) row('District', p.districts[d].name);

  // state
  if (b.state === BuildingState.Constructing || b.state === BuildingState.Upgrading) {
    row('Status', `${STATE_LABEL[b.state]} ${pct(b.progress ?? 0)}`, { bar: b.progress ?? 0, tone: 'neutral' });
  } else if (b.state === BuildingState.Abandoned) {
    row('Status', `Abandoned — ${sim.abandonReason(r)}`, { tone: 'bad' });
    row('Collapses in', `~${Math.max(1, Math.round(45 + r.h * 40 - r.abandonDays))} days`, { tone: 'warn' });
  } else row('Status', STATE_LABEL[b.state] ?? 'Operating', { tone: b.state === BuildingState.Active ? 'good' : 'bad' });

  // level
  if (info.growable) {
    const maxL = sim.maxLevelFor(info.zone, d);
    const target = b.state === BuildingState.Active ? levelTarget(sim, r, r.problems) : b.level;
    const next = b.level >= maxL ? 'max level' : target > b.level ? `levelling up ${pct(r.lvlProgress)}` : 'needs better land value & services';
    row('Level', `${b.level} / ${maxL} · ${next}`, { bar: b.level >= maxL ? 1 : r.lvlProgress, tone: target > b.level ? 'good' : 'neutral' });
  }

  // people
  if (info.fam === 0 || info.housing > 0) {
    row('Residents', `${num(r.residents)} / ${num(r.capacity)}`, { bar: r.capacity ? r.residents / r.capacity : 0, tone: 'neutral' });
    const e = r.edu;
    const hi = Math.max(0, e - 1), ed = Math.min(1, e) - hi, un = 1 - Math.min(1, e);
    row('Education', `${pct(un)} basic · ${pct(ed)} educated · ${pct(hi)} graduates`);
  }
  if (r.capacity > 0 && info.fam !== 0) row('Workers', `${num(r.workers)} / ${num(r.capacity)} jobs`, { bar: r.workers / r.capacity, tone: tone(r.workers / r.capacity, 0.85, 0.5) });
  else if (info.jobs > 0 && info.fam !== 0) row('Workers', `${num(r.workers)} / ${num(info.jobs)} jobs`, { bar: r.workers / info.jobs, tone: tone(r.workers / info.jobs, 0.85, 0.5) });

  // happiness
  if (b.state === BuildingState.Active || b.state === BuildingState.Burning) {
    const h = r.happiness;
    row('Happiness', `${Math.round(h)} ${h >= 75 ? '😄' : h >= 55 ? '🙂' : h >= 35 ? '😐' : '😠'}`, { bar: h / 100, tone: tone(h / 100, 0.6, 0.38) });
    const factors: Factor[] = [];
    happinessTarget(sim, r, r.problems, flagsOf(sim, r), sim.modsAt(d), factors);
    const pos = factors.filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const neg = factors.filter((x) => x[1] < 0).sort((a, b) => a[1] - b[1]).slice(0, 3);
    if (pos.length) row('Likes', pos.map(([l, v]) => `${l} +${v}`).join(' · '), { tone: 'good' });
    if (neg.length) row('Dislikes', neg.map(([l, v]) => `${l} ${v}`).join(' · '), { tone: 'bad' });
  }

  // needs
  if (info.consumer && b.state !== BuildingState.Constructing && b.state !== BuildingState.Ruined) {
    const s = r.served;
    const need = (label: string, ok: boolean, detail: string) => row(label, ok ? `✓ ${detail}` : `✗ ${detail}`, { tone: ok ? 'good' : 'bad' });
    if (r.powerUse > 0) need('Power', !!(s & SV_POWER), s & SV_POWER ? `${r.powerUse.toFixed(1)} MW` : 'no power');
    if (r.waterUse > 0) need('Water', !!(s & SV_WATER), s & SV_WATER ? `${r.waterUse.toFixed(1)} kL/day` : 'dry taps');
    if (sim.needsOxygen && r.oxygenUse > 0) need('Oxygen', !!(s & SV_OXYGEN), s & SV_OXYGEN ? 'breathable' : 'suffocating');
    if (r.garbageGen > 0) need('Garbage', !(r.problems & P.Garbage), r.problems & P.Garbage ? 'piling up' : 'collected');
    if (r.dataUse > 0.2) need('Data', !!(s & SV_DATA), s & SV_DATA ? 'online' : 'offline');
  }

  // production
  const prod: string[] = [];
  const eff = info.dept ? budgetEffect(sim.budget[info.dept] ?? 1) : 1;
  if (info.powerOut) prod.push(`${num(info.powerOut * eff)} MW`);
  if (info.waterOut) prod.push(`${num(info.waterOut * eff)} kL water`);
  if (info.oxygenOut) prod.push(`${num(info.oxygenOut * eff)} O₂`);
  if (info.garbageCap) prod.push(`${num(info.garbageCap * eff)} t trash/mo`);
  if (info.dataCap) prod.push(`${num(info.dataCap * eff)} Tb data`);
  if (prod.length) row('Produces', prod.join(' · '), { tone: 'good' });
  if (info.coverage.length) {
    for (const c of info.coverage.slice(0, 3)) row('Covers', `${c.service} · ${c.radius} tiles${c.capacity ? ` · ${num(c.capacity * eff)} capacity` : ''}`);
  }
  if (r.visitors > 0.5) row('Visitors', `${num(r.visitors)} / month`, { tone: 'good' });

  // environment
  const cov = f.cov;
  const svc: [string, number][] = [
    ['Police', cov[SERVICE_INDEX.police][t]],
    ['Fire', cov[SERVICE_INDEX.fire][t]],
    ['Health', cov[SERVICE_INDEX.health][t]],
    ['Education', cov[SERVICE_INDEX.education][t]],
    ['Parks', cov[SERVICE_INDEX.leisure][t]],
  ];
  row('Coverage', svc.map(([l, v]) => `${l} ${v >= 0.66 ? '●' : v >= 0.25 ? '◐' : '○'}`).join('  '));
  row('Land value', `${Math.round(f.landValue[t])}`, { bar: f.landValue[t] / 100, tone: tone(f.landValue[t] / 100, 0.55, 0.3) });
  if (f.pollution[t] > 3) row('Pollution', `${Math.round(f.pollution[t])}`, { bar: Math.min(1, f.pollution[t] / 80), tone: f.pollution[t] > 35 ? 'bad' : 'warn' });
  if (f.crime[t] > 5) row('Crime', `${Math.round(f.crime[t])}`, { bar: Math.min(1, f.crime[t] / 70), tone: f.crime[t] > 45 ? 'bad' : 'warn' });

  // money
  if (info.growable) row('Taxes paid', `${money(r.taxPaid)} / month`, { tone: 'good' });
  else if (info.upkeep > 0) row('Upkeep', `${money(info.upkeep * (sim.budget[info.dept ?? ''] ?? 1))} / month`, { tone: 'neutral' });
  if (info.income > 0) row('Revenue', `${money(info.income)} / month`, { tone: 'good' });

  // problems
  if (r.problems) {
    const list = PROBLEM_INFO.filter((x) => r.problems & x.bit).map((x) => `${x.icon} ${x.label}`);
    row('Problems', list.join(' · '), { tone: 'bad' });
  }

  // a voice from inside
  if ((r.residents > 0 || r.workers > 0) && b.state === BuildingState.Active) {
    const rng = new SimRng(id * 7919 + Math.floor(sim.day / 15));
    const first = PROBLEM_INFO.find((x) => r.problems & x.bit);
    const quote = residentQuote(rng, r.happiness, first?.id ?? null, { city: p.city.name });
    const age = 18 + Math.floor(rng.next() * 60);
    row(info.fam === 0 || info.housing > 0 ? 'Resident' : 'Employee', `${quote} — ${citizenName(rng)}, ${age}, ${citizenJob(rng)}`);
  }
  row('Built', dateOf(b.builtDay));
  return rows;
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
  row('Terrain', `${prettyEnum(Biome[p.biome[t]])}${water ? ' (underwater)' : ''}`);
  row('Elevation', `${rel >= 0 ? '+' : ''}${rel * 6} m ${rel >= 0 ? 'above' : 'below'} sea level`);
  if (p.feature[t] !== Feature.None) row('Feature', featureLabel(p.feature[t]));
  const z = p.zone[t];
  if (z) {
    const zi = zoneInfo(z);
    row('Zone', `${zi?.icon ?? ''} ${zi?.name ?? 'Zoned'}`);
    if (p.building[t] < 0 && !p.road[t]) {
      if (!p.hasRoadAccess(t)) row('Lot', 'Needs a road to develop', { tone: 'warn' });
      else {
        const net = sim.nets?.netOf(t) ?? -1;
        const powered = sim.rules.freeUtilities || sim.sandbox || (sim.nets?.hasSupply(0, net) ?? false);
        row('Lot', powered ? 'Ready to develop' : 'Waiting for power ⚡', { tone: powered ? 'good' : 'warn' });
      }
    }
  }
  const d = p.district[t];
  if (d > 0 && p.districts[d]) row('District', p.districts[d].name);
  if (p.road[t]) {
    row('Road', ROAD_NAMES[p.road[t]] ?? 'Road');
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
