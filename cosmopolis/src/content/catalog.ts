/**
 * Item catalog — every placeable thing (building, road, zone brush, prop, orbital, custom creation) is an ItemDef.
 * Content modules call `registerItems([...])` at import time (see content/index.ts). CONTRACT.
 *
 * Balance guide (career mode; sandbox ignores money):
 *   Starting money 60 000. Tier unlock populations ≈ T1 400 · T2 1 500 · T3 5 000 · T4 12 000 · T5 25 000 · T6 50 000 · T7 100 000 · T8 200 000.
 *   cost:   small T0 service 3 000–8 000 · power plant 8 000–40 000 · landmark 40 000–150 000 · wonder 250 000–2 000 000
 *   upkeep: ≈ 3–8 % of cost per month for services, ~2 % for decor, 0 for zones/roads (roads: per tile 5–60)
 *   power:  solar farm +20 MW, wind +12, coal-like +80 (heavy pollution), fission +300, fusion +900, antimatter +3 000
 *           consumers: houses −0.5..−2, shops −1..−3, industry −3..−8, services −2..−10
 *   coverage radius in tiles: small 4–6, medium 7–10, large 11–16, city-wide 30+
 */
import type { BufferGeometry } from 'three';
import type { Category, Feature, PlanetTypeId, Placement, RoadKind, ServiceType, StyleId, Zone } from '../core/types';
import { MeshBuilder } from './kit';
import { STYLES, type StylePalette } from './styles';
import { Rng, hashString } from '../core/rng';
import { bus } from '../core/events';

export interface Effects {
  /** + produces / − consumes, MW */
  power?: number;
  /** + produces / − consumes, kL/day */
  water?: number;
  /** + produces / − consumes, units (only matters where planet needs oxygen) */
  oxygen?: number;
  /** workplaces provided */
  jobs?: number;
  /** residents housed (ploppable housing: arcologies, habitats) */
  housing?: number;
  /** research points per month */
  research?: number;
  /** tourists attracted per month */
  tourism?: number;
  /** pollution emitted (0..100 scale, spread over ~4 tiles) */
  pollution?: number;
  /** noise emitted (0..100) */
  noise?: number;
  /** land value modifier in radius (−50..+50) */
  landValue?: number;
  /** happiness modifier (local, −20..+20) */
  happiness?: number;
  /** direct monthly revenue (casinos, spaceports, tolls) */
  income?: number;
  /** garbage processed per month (+) */
  garbage?: number;
  /** data / communications capacity */
  data?: number;
  /** effect radius in tiles for landValue / happiness / pollution (default 4) */
  radius?: number;
}

export interface Coverage {
  service: ServiceType;
  /** radius in tiles */
  radius: number;
  /** 0..1 (stacking capped by sim) */
  strength: number;
  /** people served (patients, students, ...) */
  capacity?: number;
}

export interface MeshContext {
  /** a fresh builder — draw into it */
  b: MeshBuilder;
  /** deterministic RNG seeded by (defId, variant, level, style) */
  rng: Rng;
  def: ItemDef;
  variant: number;
  level: number;
  styleId: StyleId;
  style: StylePalette;
  lod: 0 | 1;
  footprint: 1 | 7 | 19;
}
export type MeshFactory = (ctx: MeshContext) => void;

export interface ItemDef {
  id: string;
  name: string;
  category: Category;
  /** sub-group label shown in the build sheet (e.g. "Power Plants", "Parks") */
  group?: string;
  description: string;
  /** witty one-liner shown in the info card */
  flavor?: string;
  /** emoji fallback icon */
  icon?: string;
  footprint: 1 | 7 | 19;
  placement: Placement;
  cost: number;
  upkeep: number;
  /** 0..8 — unlocked by career milestones (see cosmos/progression) */
  tier: number;
  /** restrict to these planet types (omit = anywhere) */
  planetTypes?: PlanetTypeId[];
  requires?: {
    coastal?: boolean;
    /** must be placed on one of these natural features (e.g. mines on Ore) */
    feature?: Feature[];
    /** needs a road adjacent (default: true for surface buildings, false for decor/orbital/water) */
    road?: boolean;
    /** minimum terrace level */
    minElevation?: number;
  };
  effects?: Effects;
  coverage?: Coverage[];
  /** only one per planet (wonders) */
  unique?: boolean;
  /** number of visual variants (default 1) */
  variants?: number;
  /** mesh changes with architectural style */
  styleable?: boolean;
  /** zoned growable: which zone it grows on (hidden from build menus) */
  growable?: { zone: Zone; minLevel?: number; maxLevel?: number };
  /** road / rail item: drawn by RoadRenderer from per-tile data */
  road?: { kind: RoadKind; capacity: number; speed: number };
  /** zone paint brush */
  zone?: Zone;
  /** item is really a tool (terraform etc.) — id understood by ToolManager */
  tool?: string;
  /** hidden from build menus (growables, internal) */
  hidden?: boolean;
  /** geometry factory; omitted for roads / zones / tools */
  mesh?: MeshFactory;
  /** approximate height in world units (thumbnail framing, LOD) */
  height?: number;
  tags?: string[];
  /** orbital defaults */
  orbit?: { radius: number; speed: number };
  /** Architect Studio payload (custom items) */
  custom?: unknown;
}

const items = new Map<string, ItemDef>();
let version = 0;

export function registerItems(defs: ItemDef[]): void {
  for (const d of defs) {
    if (items.has(d.id) && !d.custom) console.warn(`[catalog] duplicate item id "${d.id}" — overriding`);
    items.set(d.id, d);
    geoCache.forEach((_, k) => {
      if (k.startsWith(d.id + '|')) geoCache.delete(k);
    });
  }
  changed();
}

export function unregisterItem(id: string): void {
  items.delete(id);
  changed();
}

let emitQueued = false;
/** Bump the version and emit one coalesced 'catalog:changed' per task (late registrations: Studio, unlocks). */
function changed(): void {
  version++;
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(() => {
    emitQueued = false;
    bus.emit('catalog:changed', {});
  });
}

export function getItem(id: string): ItemDef | undefined {
  return items.get(id);
}

export function requireItem(id: string): ItemDef {
  const d = items.get(id);
  if (!d) throw new Error(`[catalog] unknown item "${id}"`);
  return d;
}

export function allItems(): ItemDef[] {
  return [...items.values()];
}

export function itemsByCategory(cat: Category, includeHidden = false): ItemDef[] {
  return allItems().filter((d) => d.category === cat && (includeHidden || !d.hidden));
}

export function growablesFor(zone: Zone): ItemDef[] {
  return allItems().filter((d) => d.growable?.zone === zone);
}

export function catalogVersion(): number {
  return version;
}

export function footprintOf(defId: string): 1 | 7 | 19 {
  return items.get(defId)?.footprint ?? 1;
}

// ─────────────────────────────────────────────── geometry cache

const geoCache = new Map<string, BufferGeometry>();

export interface GeoKey {
  variant?: number;
  level?: number;
  style?: StyleId;
  lod?: 0 | 1;
}

/** Cache key for a mesh variant (style only matters for styleable defs). */
export function meshKey(def: ItemDef, k: GeoKey): string {
  const variant = (k.variant ?? 0) % Math.max(1, def.variants ?? 1);
  const style = def.styleable ? k.style ?? 'classic' : '-';
  const level = def.growable || def.styleable ? k.level ?? 1 : 1;
  return `${def.id}|${variant}|${level}|${style}`;
}

/**
 * Build (or fetch cached) geometry for an item. Returns null for items without meshes.
 * Never throws: a failing factory yields a magenta placeholder box and logs once.
 */
export function getGeometry(defId: string, k: GeoKey = {}): BufferGeometry | null {
  const def = items.get(defId);
  if (!def || !def.mesh) return null;
  const key = meshKey(def, k) + '|' + (k.lod ?? 0);
  let g = geoCache.get(key);
  if (g) return g;
  const variant = (k.variant ?? 0) % Math.max(1, def.variants ?? 1);
  const styleId: StyleId = k.style ?? 'classic';
  const level = k.level ?? 1;
  const b = new MeshBuilder(k.lod ?? 0);
  try {
    def.mesh({
      b,
      rng: new Rng(hashString(meshKey(def, k))),
      def,
      variant,
      level,
      styleId,
      style: STYLES[styleId] ?? STYLES.classic,
      lod: k.lod ?? 0,
      footprint: def.footprint,
    });
    if (b.triangles === 0) throw new Error('factory produced no triangles');
    g = b.build();
  } catch (err) {
    console.error(`[catalog] mesh factory failed for "${key}"`, err);
    const fb = new MeshBuilder(0);
    fb.box(1, 1, 1, { color: 0xff00ff });
    g = fb.build();
  }
  geoCache.set(key, g);
  return g;
}

/** Drop cached geometries (e.g. after a custom item changes). */
export function clearGeometryCache(prefix?: string): void {
  for (const [k, g] of geoCache) {
    if (!prefix || k.startsWith(prefix)) {
      g.dispose();
      geoCache.delete(k);
    }
  }
}
