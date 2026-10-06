/**
 * DefInfo — the sim's digest of an ItemDef (cached per def id, cleared on 'catalog:changed').
 * Normalises effects into producer outputs / consumer uses, picks the budget department and flags
 * (park, landmark, wonder, shelter, shield, housing) so the hot loops never touch ItemDef objects.
 */
import { Zone, type ZoneFamily } from '../core/types';
import { allItems, getItem, type Coverage, type ItemDef } from '../content/catalog';
import { ZONE_PARAMS, type DeptId, type ZoneParams } from './params';

export interface DefInfo {
  id: string;
  def: ItemDef;
  name: string;
  growable: boolean;
  zone: Zone;
  family: ZoneFamily | null;
  /** 0 R · 1 C · 2 I · 3 O · −1 none */
  fam: number;
  zp: ZoneParams | null;
  minLevel: number;
  maxLevel: number;
  dept: DeptId | null;
  upkeep: number;
  // producers (+, per month or MW at 100 % budget)
  powerOut: number;
  waterOut: number;
  oxygenOut: number;
  garbageCap: number;
  dataCap: number;
  // ploppable consumers (positive numbers)
  powerUse: number;
  waterUse: number;
  oxygenUse: number;
  housing: number;
  jobs: number;
  coverage: Coverage[];
  pollution: number;
  noise: number;
  landValue: number;
  happiness: number;
  tourism: number;
  research: number;
  income: number;
  /** effect radius in tiles (landValue / happiness / pollution) */
  radius: number;
  park: boolean;
  landmark: boolean;
  wonder: boolean;
  shelter: boolean;
  shield: boolean;
  /** consumes power etc. at all (decor and roads do not) */
  consumer: boolean;
  /** priority class when utilities run short (0 first) */
  priority: number;
}

const cache = new Map<string, DefInfo | null>();

/** Which utilities the current catalog can produce at all (missing content must never soft-lock a city). */
export interface CatalogCaps {
  power: boolean;
  water: boolean;
  oxygen: boolean;
  garbage: boolean;
  data: boolean;
}
let caps: CatalogCaps | null = null;

export function catalogCaps(): CatalogCaps {
  if (caps) return caps;
  const c: CatalogCaps = { power: false, water: false, oxygen: false, garbage: false, data: false };
  for (const d of allItems()) {
    const e = d.effects;
    if (e) {
      if ((e.power ?? 0) > 0) c.power = true;
      if ((e.water ?? 0) > 0) c.water = true;
      if ((e.oxygen ?? 0) > 0) c.oxygen = true;
      if ((e.garbage ?? 0) > 0) c.garbage = true;
      if ((e.data ?? 0) > 0) c.data = true;
    }
    for (const cv of d.coverage ?? []) {
      if (cv.service === 'garbage') c.garbage = true;
      if (cv.service === 'data') c.data = true;
    }
  }
  caps = c;
  return c;
}

export function clearDefInfo(): void {
  cache.clear();
  caps = null;
}

export function defInfo(defId: string): DefInfo | null {
  let d = cache.get(defId);
  if (d !== undefined) return d;
  const def = getItem(defId);
  d = def ? build(def) : null;
  cache.set(defId, d);
  return d;
}

function famIndex(f: ZoneFamily | null): number {
  return f === 'R' ? 0 : f === 'C' ? 1 : f === 'I' ? 2 : f === 'O' ? 3 : -1;
}

function familyOf(z: Zone): ZoneFamily | null {
  if (z >= 1 && z <= 3) return 'R';
  if (z >= 4 && z <= 6) return 'C';
  if (z >= 7 && z <= 10) return 'I';
  if (z === 11) return 'O';
  return null;
}

function deptFor(def: ItemDef): DeptId | null {
  const e = def.effects ?? {};
  const cov = def.coverage?.[0]?.service;
  switch (def.category) {
    case 'roads':
    case 'zones':
      return null;
    case 'power':
      return 'power';
    case 'water':
      if ((e.garbage ?? 0) > 0 || cov === 'garbage') return 'garbage';
      return 'water';
    case 'services':
      if (cov === 'police') return 'police';
      if (cov === 'fire') return 'fire';
      if (cov === 'garbage') return 'garbage';
      if (cov === 'data') return 'data';
      if (cov === 'education') return 'education';
      if (cov === 'research') return 'research';
      if (cov === 'leisure' || cov === 'spiritual' || cov === 'tourism') return 'leisure';
      if (cov === 'transit') return 'transit';
      return 'health';
    case 'education':
      return cov === 'research' || ((e.research ?? 0) > 0 && !cov) ? 'research' : 'education';
    case 'leisure':
    case 'decor':
      return 'leisure';
    case 'transit':
      return 'transit';
    case 'industry':
      if ((e.data ?? 0) > 0) return 'data';
      return 'industry';
    case 'landmarks':
      return 'landmarks';
    case 'orbital':
      return 'orbital';
    case 'custom':
      return (e.power ?? 0) > 0 ? 'power' : 'landmarks';
  }
  return null;
}

function build(def: ItemDef): DefInfo {
  const e = def.effects ?? {};
  const tags = def.tags ?? [];
  const zone = (def.growable?.zone ?? Zone.None) as Zone;
  const family = def.growable ? familyOf(zone) : null;
  const pos = (v: number | undefined) => (v !== undefined && v > 0 ? v : 0);
  const neg = (v: number | undefined) => (v !== undefined && v < 0 ? -v : 0);
  const consumer = !!def.growable || !['decor', 'roads', 'zones'].includes(def.category) || (e.power ?? 0) < 0;
  const isService = !def.growable && consumer;
  return {
    id: def.id,
    def,
    name: def.name,
    growable: !!def.growable,
    zone,
    family,
    fam: famIndex(family),
    zp: def.growable ? ZONE_PARAMS[zone] ?? null : null,
    minLevel: Math.max(1, def.growable?.minLevel ?? 1),
    maxLevel: Math.min(5, def.growable?.maxLevel ?? 5),
    dept: def.growable ? null : deptFor(def),
    upkeep: Math.max(0, def.upkeep ?? 0),
    powerOut: pos(e.power),
    waterOut: pos(e.water),
    oxygenOut: pos(e.oxygen),
    garbageCap: pos(e.garbage),
    dataCap: pos(e.data),
    powerUse: def.growable ? 0 : neg(e.power),
    waterUse: def.growable ? 0 : neg(e.water),
    oxygenUse: def.growable ? 0 : neg(e.oxygen),
    housing: def.growable ? 0 : pos(e.housing),
    jobs: def.growable ? 0 : pos(e.jobs),
    coverage: def.coverage ?? [],
    pollution: e.pollution ?? 0,
    noise: e.noise ?? 0,
    landValue: e.landValue ?? 0,
    happiness: e.happiness ?? 0,
    tourism: pos(e.tourism),
    research: pos(e.research),
    income: e.income ?? 0,
    radius: Math.max(1, Math.min(40, e.radius ?? 4)),
    park: def.category === 'leisure' || tags.includes('park'),
    landmark: def.category === 'landmarks' || tags.includes('landmark'),
    wonder: tags.includes('wonder') || (def.category === 'landmarks' && !!def.unique),
    shelter: tags.includes('shelter'),
    shield: tags.includes('shield'),
    consumer,
    priority: isService ? 0 : 1,
  };
}
