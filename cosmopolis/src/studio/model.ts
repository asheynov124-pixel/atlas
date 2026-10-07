/**
 * OWNER: studio.
 * Architect Studio — the design data model. A design (DesignSpec) is an ordered list of parts (PartSpec) on a
 * hex lot of 1 / 7 / 19 tiles plus a function (housing, offices, …) that decides its gameplay stats.
 * Everything here is plain JSON so designs persist in the save (`empire.s.customItems`), travel as share codes
 * and live in the device library.
 *
 * Units: world units (1 ≈ 20 m, one storey = FLOOR_HEIGHT 0.2). Object space: +Y up, +Z = front (faces the road).
 * Stacking: a part with `stack: true` sits on the top of the previous stacked part (+ its `y` offset) and raises
 * the stack; a free part (`stack: false`) sits at absolute height `y` and leaves the stack alone.
 */
import { FOOTPRINT_RADIUS, Mat, type MatId } from '../content/kit';

export type PartType =
  | 'plinth'
  | 'podium'
  | 'block'
  | 'rounded'
  | 'cylinder'
  | 'tapered'
  | 'twisted'
  | 'setback'
  | 'torus'
  | 'sphere'
  | 'pods'
  | 'colonnade'
  | 'vault'
  | 'arch'
  | 'skybridge'
  | 'obelisk'
  | 'wedge'
  | 'dome'
  | 'onion'
  | 'spire'
  | 'pyramid'
  | 'gable'
  | 'pagoda'
  | 'cone'
  | 'crown'
  | 'shell'
  | 'antenna'
  | 'halo'
  | 'neon'
  | 'balcony'
  | 'fins'
  | 'billboard'
  | 'hologram'
  | 'flag'
  | 'solar'
  | 'turbine'
  | 'dish'
  | 'helipad'
  | 'lattice'
  | 'garden'
  | 'tree'
  | 'pool'
  | 'crystal';

export type MatName = 'plain' | 'windows' | 'smallWindows' | 'glass' | 'metal' | 'glow' | 'light' | 'solar' | 'holo' | 'screen' | 'foliage' | 'water' | 'lava';

export type FnId = 'decor' | 'housing' | 'offices' | 'shops' | 'landmark' | 'park' | 'power' | 'research';

export type Footprint = 1 | 7 | 19;

/** Numeric part parameters (all always present after `normalizePart`). */
export type NumKey = 'w' | 'd' | 'h' | 'taper' | 'twist' | 'seg' | 'n' | 's' | 'x' | 'y' | 'z' | 'ry' | 'tilt';

export interface PartSpec {
  t: PartType;
  /** width (X) — diameter for round parts */
  w: number;
  /** depth (Z) */
  d: number;
  /** height */
  h: number;
  /** 0..1 — how much the top shrinks */
  taper: number;
  /** degrees of rotation from bottom to top */
  twist: number;
  /** sides / curve segments */
  seg: number;
  /** count: floors, tiers, spikes, pods, rows… */
  n: number;
  /** spacing (bands, balconies) */
  s: number;
  x: number;
  y: number;
  z: number;
  /** yaw, degrees */
  ry: number;
  /** tilt, degrees (crystals, panels, shells, dishes) */
  tilt: number;
  /** main colour 0xRRGGBB */
  c: number;
  /** accent colour */
  c2: number;
  m: MatName;
  stack: boolean;
}

export interface DesignSpec {
  v: 1;
  id: string;
  name: string;
  description: string;
  /** emoji */
  icon: string;
  footprint: Footprint;
  fn: FnId;
  parts: PartSpec[];
  created: number;
  updated: number;
  /** template it started from (for the "based on" line) */
  base?: string;
}

export const MAT_IDS: Record<MatName, MatId> = {
  plain: Mat.Plain,
  windows: Mat.Window,
  smallWindows: Mat.WindowSmall,
  glass: Mat.Glass,
  metal: Mat.Metal,
  glow: Mat.Glow,
  light: Mat.Light,
  solar: Mat.Solar,
  holo: Mat.Holo,
  screen: Mat.Screen,
  foliage: Mat.Foliage,
  water: Mat.Water,
  lava: Mat.Lava,
};

export interface MatInfo {
  id: MatName;
  label: string;
  /** CSS preview (swatch background) */
  preview: string;
  hint: string;
}

export const MATERIALS: MatInfo[] = [
  { id: 'plain', label: 'Plain', preview: 'linear-gradient(135deg,#d9dde6,#9aa3b5)', hint: 'Matte painted surface' },
  { id: 'windows', label: 'Windows', preview: 'repeating-linear-gradient(0deg,#c9d2e3 0 3px,#3a4a66 3px 7px),#c9d2e3', hint: 'Office grid — lights up at night' },
  { id: 'smallWindows', label: 'Small windows', preview: 'radial-gradient(circle at 30% 40%,#2a3550 18%,transparent 20%),radial-gradient(circle at 70% 40%,#2a3550 18%,transparent 20%),#d8cbb4', hint: 'Homes & workshops' },
  { id: 'glass', label: 'Glass', preview: 'linear-gradient(160deg,#9fd6ff,#21406a 60%,#7fb6e8)', hint: 'Curtain wall — dense lit floors at night' },
  { id: 'metal', label: 'Metal', preview: 'linear-gradient(135deg,#f4f6fa,#7c8597 45%,#e3e7ee 60%,#5d6576)', hint: 'Polished, reflective' },
  { id: 'glow', label: 'Neon', preview: 'radial-gradient(circle,#ffffff 0 20%,#5ef0ff 60%,#1b6fff)', hint: 'Always glowing' },
  { id: 'light', label: 'Night light', preview: 'radial-gradient(circle,#fff6d6 0 25%,#ffc65c 60%,#3a2a10)', hint: 'Switches on after dusk' },
  { id: 'solar', label: 'Solar', preview: 'repeating-linear-gradient(90deg,#0a1636 0 5px,#8995ad 5px 6px),repeating-linear-gradient(0deg,#0a1636 0 5px,#8995ad 5px 6px)', hint: 'Photovoltaic cells' },
  { id: 'holo', label: 'Hologram', preview: 'repeating-linear-gradient(0deg,rgba(94,240,255,.9) 0 2px,rgba(94,240,255,.25) 2px 4px)', hint: 'Flickering light-form' },
  { id: 'screen', label: 'Screen', preview: 'linear-gradient(135deg,#ff4fd8,#ffd84f 50%,#4fffd0)', hint: 'Animated advertising' },
  { id: 'foliage', label: 'Foliage', preview: 'radial-gradient(circle at 35% 35%,#8fe36a,#2f7a32 70%)', hint: 'Sways in the wind' },
  { id: 'water', label: 'Water', preview: 'linear-gradient(160deg,#7fd8ff,#1d5fa8)', hint: 'Rippling pools' },
  { id: 'lava', label: 'Lava', preview: 'radial-gradient(circle at 40% 40%,#ffe28a,#ff5a12 55%,#5a0d00)', hint: 'Molten plasma' },
];

/** Curated palette (sRGB). */
export const PALETTE: number[] = [
  0xf4f1ea, 0xc9ccd3, 0x8a909c, 0x3b404b, 0x16181f, 0xd9c29a, 0xb98552, 0xc4573a, 0x8e2f2a, 0xe8b64a,
  0xffd36b, 0x6fd3a8, 0x2e8b6f, 0x2d5a3a, 0x5ef0ff, 0x3a8dde, 0x1f3f7a, 0xa77bff, 0xff6fb5, 0xff8a3d,
];

export const FN_IDS: FnId[] = ['decor', 'housing', 'offices', 'shops', 'landmark', 'park', 'power', 'research'];

export function footprintRadius(fp: Footprint): number {
  return FOOTPRINT_RADIUS[fp] ?? 0.92;
}

const PART_TYPES = new Set<PartType>([
  'plinth', 'podium', 'block', 'rounded', 'cylinder', 'tapered', 'twisted', 'setback', 'torus', 'sphere', 'pods', 'colonnade', 'vault', 'arch',
  'skybridge', 'obelisk', 'wedge', 'dome', 'onion', 'spire', 'pyramid', 'gable', 'pagoda', 'cone', 'crown', 'shell', 'antenna', 'halo', 'neon',
  'balcony', 'fins', 'billboard', 'hologram', 'flag', 'solar', 'turbine', 'dish', 'helipad', 'lattice', 'garden', 'tree', 'pool', 'crystal',
]);
export function isPartType(t: unknown): t is PartType {
  return typeof t === 'string' && PART_TYPES.has(t as PartType);
}
const MAT_NAMES = new Set(Object.keys(MAT_IDS));
export function isMatName(m: unknown): m is MatName {
  return typeof m === 'string' && MAT_NAMES.has(m);
}

/** Hard limits that keep any design (even an imported, hand-edited code) renderable. */
export const LIMITS = {
  parts: 48,
  size: 12,
  height: 40,
  offset: 10,
  y: 60,
  seg: 48,
  n: 40,
};

const clampN = (v: unknown, lo: number, hi: number, def: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.min(hi, Math.max(lo, n));
};

/** Fill missing fields and clamp everything into safe ranges (imports, old saves). */
export function normalizePart(raw: Partial<PartSpec> & { t: PartType }): PartSpec {
  return {
    t: raw.t,
    w: clampN(raw.w, 0.02, LIMITS.size, 1),
    d: clampN(raw.d, 0.02, LIMITS.size, 1),
    h: clampN(raw.h, 0.01, LIMITS.height, 1),
    taper: clampN(raw.taper, 0, 1, 0),
    twist: clampN(raw.twist, -720, 720, 0),
    seg: Math.round(clampN(raw.seg, 3, LIMITS.seg, 12)),
    n: Math.round(clampN(raw.n, 1, LIMITS.n, 1)),
    s: clampN(raw.s, 0.02, 6, 0.4),
    x: clampN(raw.x, -LIMITS.offset, LIMITS.offset, 0),
    y: clampN(raw.y, -LIMITS.y, LIMITS.y, 0),
    z: clampN(raw.z, -LIMITS.offset, LIMITS.offset, 0),
    ry: clampN(raw.ry, -360, 360, 0),
    tilt: clampN(raw.tilt, -90, 90, 0),
    c: Math.round(clampN(raw.c, 0, 0xffffff, 0xd8dce4)),
    c2: Math.round(clampN(raw.c2, 0, 0xffffff, 0x5ef0ff)),
    m: isMatName(raw.m) ? raw.m : 'plain',
    stack: raw.stack !== false,
  };
}

const FP = new Set([1, 7, 19]);

/** Validate & sanitise a design from any source. Returns null when it is not a design at all. */
export function normalizeDesign(raw: unknown): DesignSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<DesignSpec>;
  if (!Array.isArray(r.parts)) return null;
  const parts: PartSpec[] = [];
  for (const p of r.parts.slice(0, LIMITS.parts)) {
    if (p && typeof p === 'object' && isPartType((p as PartSpec).t)) parts.push(normalizePart(p as PartSpec));
  }
  if (!parts.length) return null;
  const now = Date.now();
  return {
    v: 1,
    id: typeof r.id === 'string' && /^[a-z0-9]{3,24}$/.test(r.id) ? r.id : newDesignId(),
    name: cleanText(r.name, 40) || 'Untitled Design',
    description: cleanText(r.description, 220),
    icon: cleanText(r.icon, 8) || '🏙️',
    footprint: (FP.has(r.footprint as number) ? r.footprint : 1) as Footprint,
    fn: FN_IDS.includes(r.fn as FnId) ? (r.fn as FnId) : 'landmark',
    parts,
    created: typeof r.created === 'number' ? r.created : now,
    updated: typeof r.updated === 'number' ? r.updated : now,
    base: typeof r.base === 'string' ? cleanText(r.base, 32) : undefined,
  };
}

export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // strip control characters and markup-ish brackets, collapse whitespace
  return v
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

let idSalt = 0;
/** Short random id (base36, 8 chars). */
export function newDesignId(): string {
  const t = Date.now().toString(36).slice(-4);
  let r = '';
  for (let i = 0; i < 4; i++) r += Math.floor(Math.random() * 36).toString(36);
  idSalt = (idSalt + 1) % 36;
  return (t + r + idSalt.toString(36)).slice(0, 9);
}

export function cloneDesign(d: DesignSpec): DesignSpec {
  return { ...d, parts: d.parts.map((p) => ({ ...p })) };
}

export const CUSTOM_PREFIX = 'custom_';
export function defIdOf(designId: string): string {
  return CUSTOM_PREFIX + designId;
}
export function designIdOf(defId: string): string | null {
  return defId.startsWith(CUSTOM_PREFIX) ? defId.slice(CUSTOM_PREFIX.length) : null;
}
