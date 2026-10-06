/**
 * OWNER: ui-core.
 * Build-menu model: category metadata, item → tool mapping, sorting, lock/affordability state and the key-stat
 * chips shown on item cards and detail sheets.
 */
import { itemsByCategory, type ItemDef } from '../../../content/catalog';
import type { Category } from '../../../core/types';
import { game } from '../../../game/instance';
import type { ToolState } from '../../store';
import { fmtCompact } from '../format';

export interface CategoryMeta {
  id: Category;
  label: string;
  icon: string;
  blurb: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  roads: { id: 'roads', label: 'Roads', icon: 'roads', blurb: 'Streets, avenues, highways and rail.' },
  zones: { id: 'zones', label: 'Zones', icon: 'zones', blurb: 'Paint land for homes, shops, industry and offices.' },
  power: { id: 'power', label: 'Power', icon: 'power', blurb: 'Keep the lights — and the neon — on.' },
  water: { id: 'water', label: 'Water & Air', icon: 'water', blurb: 'Water, oxygen and waste.' },
  services: { id: 'services', label: 'Services', icon: 'services', blurb: 'Police, fire, health and safety.' },
  education: { id: 'education', label: 'Education', icon: 'education', blurb: 'Schools, universities and research.' },
  leisure: { id: 'leisure', label: 'Leisure', icon: 'leisure', blurb: 'Parks, plazas and entertainment.' },
  transit: { id: 'transit', label: 'Transit', icon: 'transit', blurb: 'Stations, ports and spaceports.' },
  industry: { id: 'industry', label: 'Industry', icon: 'industry', blurb: 'Extractors and special industry.' },
  landmarks: { id: 'landmarks', label: 'Landmarks', icon: 'landmarks', blurb: 'Icons, monuments and wonders.' },
  orbital: { id: 'orbital', label: 'Orbital', icon: 'orbital', blurb: 'Satellites, stations and megastructures.' },
  decor: { id: 'decor', label: 'Nature & Decor', icon: 'nature', blurb: 'Trees, gardens and street furniture.' },
  custom: { id: 'custom', label: 'My Designs', icon: 'custom', blurb: 'Buildings you designed in the Architect Studio.' },
};

/** Tabs of the "Build" sheet (roads / zones / decor have their own dock buttons). */
export const BUILD_TABS: Category[] = ['power', 'water', 'services', 'education', 'leisure', 'transit', 'industry', 'landmarks', 'orbital', 'custom'];

/** Which dock button owns a category. */
export function dockFor(cat: string | null): 'roads' | 'zones' | 'decor' | 'build' | null {
  if (!cat) return null;
  if (cat === 'roads' || cat === 'zones' || cat === 'decor') return cat;
  if ((BUILD_TABS as string[]).includes(cat)) return 'build';
  return null;
}

/** Tool to select for an item (see ui-core contract). */
export function toolFor(def: ItemDef): ToolState {
  const base = { itemId: def.id, label: def.name };
  if (def.zone !== undefined) return { id: 'zone', ...base };
  if (def.road) return { id: 'road', ...base };
  if (def.tool && def.tool !== 'zone') return { id: def.tool, ...base };
  if (def.category === 'decor') return { id: 'decor', ...base };
  if (def.placement === 'orbit') return { id: 'orbit', ...base };
  return { id: 'plop', ...base };
}

export function isUnlocked(def: ItemDef): boolean {
  try {
    return game.progression.isItemUnlocked(def);
  } catch {
    return true;
  }
}

export function lockReason(def: ItemDef): string | null {
  try {
    return game.progression.lockReason(def);
  } catch {
    return null;
  }
}

export function canAfford(def: ItemDef): boolean {
  try {
    return game.empire.canAfford(def.cost);
  } catch {
    return true;
  }
}

/** Items of a category for the build sheet: unlocked first (by tier, then cost), locked last. */
export function itemsFor(cat: Category): ItemDef[] {
  let list: ItemDef[] = itemsByCategory(cat);
  if (cat === 'custom') {
    try {
      const extra = typeof game.studio?.customDefs === 'function' ? game.studio.customDefs() : [];
      for (const d of extra) if (!list.some((x) => x.id === d.id) && !d.hidden) list.push(d);
    } catch {
      /* studio optional */
    }
  }
  list = list.filter((d) => !d.growable);
  const unlocked = new Map<string, boolean>();
  for (const d of list) unlocked.set(d.id, isUnlocked(d));
  // groups keep the order their modules registered them in; fully locked groups sink to the end
  const groupRank = new Map<string, number>();
  list.forEach((d, i) => {
    const g = d.group ?? 'General';
    if (!groupRank.has(g)) groupRank.set(g, i);
  });
  for (const [g, r] of groupRank) if (!list.some((d) => (d.group ?? 'General') === g && unlocked.get(d.id))) groupRank.set(g, r + 10000);
  return list.sort((a, b) => {
    const ga = groupRank.get(a.group ?? 'General')!, gb = groupRank.get(b.group ?? 'General')!;
    if (ga !== gb) return ga - gb;
    const ua = unlocked.get(a.id) ? 0 : 1, ub = unlocked.get(b.id) ? 0 : 1;
    if (ua !== ub) return ua - ub;
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.cost - b.cost || a.name.localeCompare(b.name);
  });
}

/** Group items by def.group preserving order of first appearance. */
export function groupItems(list: ItemDef[]): { group: string; items: ItemDef[] }[] {
  const out: { group: string; items: ItemDef[] }[] = [];
  const idx = new Map<string, number>();
  for (const d of list) {
    const g = d.group ?? 'General';
    let i = idx.get(g);
    if (i === undefined) {
      i = out.length;
      idx.set(g, i);
      out.push({ group: g, items: [] });
    }
    out[i].items.push(d);
  }
  return out;
}

export interface StatChip {
  icon: string;
  text: string;
  tone: 'good' | 'bad' | 'neutral' | 'accent' | 'warn' | 'info' | 'violet' | 'money';
  label: string;
}

/** Up to `max` most telling stats for a card. */
export function keyStats(def: ItemDef, max = 2): StatChip[] {
  const e = def.effects ?? {};
  const out: StatChip[] = [];
  const push = (c: StatChip) => out.length < max && out.push(c);
  if (def.road) push({ icon: 'traffic', text: `${def.road.capacity}`, tone: 'info', label: 'Capacity' });
  if (e.power && e.power > 0) push({ icon: 'power', text: `+${fmtCompact(e.power)} MW`, tone: 'warn', label: 'Power' });
  if (e.water && e.water > 0) push({ icon: 'water', text: `+${fmtCompact(e.water)}`, tone: 'info', label: 'Water' });
  if (e.oxygen && e.oxygen > 0) push({ icon: 'oxygen', text: `+${fmtCompact(e.oxygen)}`, tone: 'accent', label: 'Oxygen' });
  if (e.housing && e.housing > 0) push({ icon: 'population', text: fmtCompact(e.housing), tone: 'good', label: 'Housing' });
  if (def.coverage?.length) {
    const c = def.coverage[0];
    push({ icon: SERVICE_ICON[c.service] ?? 'target', text: `${c.radius} tiles`, tone: 'violet', label: 'Coverage' });
  }
  if (e.jobs && e.jobs > 0) push({ icon: 'jobs', text: fmtCompact(e.jobs), tone: 'neutral', label: 'Jobs' });
  if (e.research && e.research > 0) push({ icon: 'research', text: `+${fmtCompact(e.research)}`, tone: 'violet', label: 'Research' });
  if (e.tourism && e.tourism > 0) push({ icon: 'tourism', text: `+${fmtCompact(e.tourism)}`, tone: 'accent', label: 'Tourism' });
  if (e.income && e.income > 0) push({ icon: 'money', text: `+${fmtCompact(e.income)}`, tone: 'money', label: 'Income' });
  if (e.happiness && e.happiness > 0) push({ icon: 'happiness', text: `+${e.happiness}`, tone: 'good', label: 'Happiness' });
  if (e.landValue && e.landValue > 0) push({ icon: 'landValue', text: `+${e.landValue}`, tone: 'good', label: 'Land value' });
  if (e.data && e.data > 0) push({ icon: 'data', text: `+${fmtCompact(e.data)}`, tone: 'info', label: 'Data' });
  if (e.garbage && e.garbage > 0) push({ icon: 'recycle', text: `+${fmtCompact(e.garbage)}`, tone: 'good', label: 'Garbage' });
  if (e.pollution && e.pollution > 0) push({ icon: 'pollution', text: `${e.pollution}`, tone: 'bad', label: 'Pollution' });
  if (e.power && e.power < 0) push({ icon: 'plug', text: `${fmtCompact(e.power)} MW`, tone: 'neutral', label: 'Power use' });
  return out;
}

export const SERVICE_ICON: Record<string, string> = {
  police: 'police',
  fire: 'fire',
  health: 'health',
  education: 'education',
  research: 'research',
  leisure: 'leisure',
  transit: 'transit',
  deathcare: 'deathcare',
  garbage: 'recycle',
  data: 'data',
  tourism: 'tourism',
  spiritual: 'spiritual',
};

const EFFECT_ROWS: { key: keyof NonNullable<ItemDef['effects']>; label: string; icon: string; unit?: string; goodWhenPositive: boolean }[] = [
  { key: 'power', label: 'Power', icon: 'power', unit: ' MW', goodWhenPositive: true },
  { key: 'water', label: 'Water', icon: 'water', unit: ' kL/day', goodWhenPositive: true },
  { key: 'oxygen', label: 'Oxygen', icon: 'oxygen', goodWhenPositive: true },
  { key: 'housing', label: 'Residents', icon: 'population', goodWhenPositive: true },
  { key: 'jobs', label: 'Jobs', icon: 'jobs', goodWhenPositive: true },
  { key: 'research', label: 'Research / month', icon: 'research', goodWhenPositive: true },
  { key: 'tourism', label: 'Tourists / month', icon: 'tourism', goodWhenPositive: true },
  { key: 'income', label: 'Revenue / month', icon: 'money', goodWhenPositive: true },
  { key: 'happiness', label: 'Happiness', icon: 'happiness', goodWhenPositive: true },
  { key: 'landValue', label: 'Land value', icon: 'landValue', goodWhenPositive: true },
  { key: 'garbage', label: 'Garbage processed', icon: 'recycle', goodWhenPositive: true },
  { key: 'data', label: 'Data capacity', icon: 'data', goodWhenPositive: true },
  { key: 'pollution', label: 'Pollution', icon: 'pollution', goodWhenPositive: false },
  { key: 'noise', label: 'Noise', icon: 'noise', goodWhenPositive: false },
];

export interface DetailRow {
  icon: string;
  label: string;
  value: string;
  tone: 'good' | 'bad' | 'neutral';
}

/** Every non-zero effect for the detail sheet. */
export function effectRows(def: ItemDef): DetailRow[] {
  const e = def.effects ?? {};
  const out: DetailRow[] = [];
  for (const r of EFFECT_ROWS) {
    const v = e[r.key];
    if (!v) continue;
    const good = v > 0 === r.goodWhenPositive;
    out.push({ icon: r.icon, label: r.label, value: (v > 0 ? '+' : '−') + fmtCompact(Math.abs(v)) + (r.unit ?? ''), tone: good ? 'good' : 'bad' });
  }
  if (e.radius) out.push({ icon: 'target', label: 'Effect radius', value: `${e.radius} tiles`, tone: 'neutral' });
  return out;
}

export function footprintLabel(f: 1 | 7 | 19): string {
  return f === 1 ? '1 tile' : f === 7 ? '7 tiles (hex)' : '19 tiles (large hex)';
}
