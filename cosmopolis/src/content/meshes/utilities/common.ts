/**
 * utilities · shared mesh helpers (OWNER: utilities).
 *
 * Every power / water / air / waste / data / industry / transit ploppable is drawn from these parts so the whole
 * infrastructure family shares one visual language: footprint-shaped concrete plinths, style-tinted halls, white
 * tanks with accent bands, banded stacks with aviation beacons, steam puffs, lattice masts, dishes, conveyors and
 * night lights. `factory(fn)` wraps a builder into a MeshFactory and hands it a `U` (builder + style-derived palette).
 *
 * Space: +Y up, +Z forward (road side), origin = footprint centre on the ground. Footprint radius 1 → 0.92,
 * 7 → 2.5, 19 → 4.3. Coastal buildings put their water side (piers, intakes) at −Z: the road is inland.
 * Budget: ≤ 1 500 triangles at LOD0 for every ploppable; small parts carry `detail` so LOD1 drops them.
 */
import { FOOTPRINT_RADIUS, Mat, MeshBuilder, mix, shade, type MatId, type PartOpts } from '../../kit';
import type { MeshContext, MeshFactory } from '../../catalog';
import type { StyleId } from '../../../core/types';

/** Spread into opts: dropped at LOD1. */
export const DET = { detail: true } as const;
/** Spread into opts: never tinted by the paint tool (ground, glass, lights). */
export const NP = { paint: false } as const;

/** Industrial base palette (sRGB). Styles shift a few of these in `look()`. */
export const C = {
  concrete: 0xbdb7ab,
  concreteDark: 0x8e887e,
  asphalt: 0x4a4d55,
  asphaltLight: 0x60636b,
  gravel: 0xa39d90,
  steel: 0x9ba5b1,
  steelDark: 0x5b6470,
  iron: 0x3e434c,
  white: 0xeef1f4,
  offwhite: 0xdcd8cf,
  yellow: 0xf2c230,
  orange: 0xff7a2a,
  red: 0xd8423a,
  blue: 0x2f7fd6,
  navy: 0x24406e,
  teal: 0x22b8a8,
  green: 0x4caf50,
  leaf: 0x5f9e45,
  leafDark: 0x3e7a34,
  copper: 0xc07a48,
  rust: 0x9a5434,
  soil: 0x7a5a3e,
  sand: 0xd8c08a,
  coal: 0x2c2a2a,
  steam: 0xf2f4f6,
  smoke: 0x9c9a98,
  beacon: 0xff2a20,
  lamp: 0xffd9a0,
  cyan: 0x5ff0ff,
  water: 0x2f86c8,
  line: 0xf4f4ee,
} as const;

/** Builder + style-derived palette handed to every utility factory. */
export interface U {
  b: MeshBuilder;
  ctx: MeshContext;
  /** LOD1 */
  lo: boolean;
  sid: StyleId;
  /** usable footprint radius */
  R: number;
  wall: number;
  wall2: number;
  roof: number;
  trim: number;
  dark: number;
  accent: number;
  accent2: number;
  glass: number;
  /** concrete pad colour */
  ground: number;
  /** pad edge / kerb colour */
  edge: number;
  /** landscaped verge around big pads (lawn, gravel, snow...) */
  verge: number;
  /** painted steel for frames / pipes */
  steel: number;
  /** tank shell colour */
  tank: number;
  /** 0..1 style knobs */
  neon: number;
  green: number;
  curvy: number;
  /** deterministic 0..1 */
  rnd: () => number;
}

const GROUND: Record<StyleId, [number, number]> = {
  classic: [0xbdb7ab, 0x8e887e],
  neo: [0xd9dee6, 0xa9b4c4],
  solarpunk: [0xcbbf98, 0x8f7a58],
  cyber: [0x33363f, 0x1f2128],
  mars: [0xc9a07a, 0x96684a],
  ice: [0xe2ebf3, 0xa9c0d4],
  crystal: [0xd4cce8, 0x9a8cc4],
  organic: [0xcfbaa8, 0x8e6e74],
};
const VERGE: Record<StyleId, number> = {
  classic: 0x6fa452,
  neo: 0x86c070,
  solarpunk: 0x5aa04a,
  cyber: 0x2a2d35,
  mars: 0xb98058,
  ice: 0xf0f6fc,
  crystal: 0xb9aae4,
  organic: 0x8aa05e,
};
const TANK: Record<StyleId, number> = {
  classic: 0xe9ecef,
  neo: 0xf8fafc,
  solarpunk: 0xf0e4c4,
  cyber: 0x3e4352,
  mars: 0xf0dfc6,
  ice: 0xf6faff,
  crystal: 0xe8e0ff,
  organic: 0xeedccc,
};
const STEEL: Record<StyleId, number> = {
  classic: 0x9ba5b1,
  neo: 0xc4ccd8,
  solarpunk: 0x8a6a48,
  cyber: 0x4a505e,
  mars: 0xa07a5a,
  ice: 0x9fb8cc,
  crystal: 0xa898d8,
  organic: 0x8e6e7e,
};

export function look(ctx: MeshContext): U {
  const s = ctx.style;
  const sid = ctx.styleId;
  let seed = 0x9e3779b1 ^ (ctx.def.id.length * 977);
  for (let i = 0; i < ctx.def.id.length; i++) seed = Math.imul(seed ^ ctx.def.id.charCodeAt(i), 0x85ebca6b) >>> 0;
  const rnd = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296;
  };
  const [ground, edge] = GROUND[sid] ?? GROUND.classic;
  return {
    b: ctx.b,
    ctx,
    lo: ctx.lod === 1,
    sid,
    R: FOOTPRINT_RADIUS[ctx.footprint],
    wall: s.walls[0],
    wall2: s.walls[1 % s.walls.length],
    roof: s.roofs[sid === 'classic' ? 1 : 0],
    trim: s.trims[0],
    dark: s.trims[s.trims.length - 1],
    accent: s.accents[0],
    accent2: s.accents[1 % s.accents.length],
    glass: s.glass,
    ground,
    edge,
    verge: VERGE[sid] ?? VERGE.classic,
    steel: STEEL[sid] ?? C.steel,
    tank: TANK[sid] ?? C.white,
    neon: s.neon,
    green: s.green,
    curvy: s.curvy,
    rnd,
  };
}

/** Wrap a utility builder into a catalog MeshFactory. */
export function factory(fn: (u: U) => void): MeshFactory {
  return (ctx) => fn(look(ctx));
}

// ═══════════════════════════════════════════════════════════════ ground

/**
 * Footprint-shaped plinth: hexagon (1 tile, flat edge to the road), pointy hexagon (7-tile flower) or 12-gon (19).
 * It reaches 0.3 below the ground so it seals terraced slopes. Big pads get a landscaped verge (style-coloured) around
 * the hardstanding; `inset` draws a second surface inside.
 */
export function pad(u: U, o: { color?: number; edge?: number; h?: number; scale?: number; inset?: number; insetColor?: number; verge?: number | false } = {}): void {
  const { b } = u;
  const fp = u.ctx.footprint;
  const h = o.h ?? 0.05;
  const sides = fp === 19 ? 12 : 6;
  const ry = fp === 1 ? Math.PI / 6 : fp === 19 ? Math.PI / 12 : 0;
  const r = (fp === 1 ? 1.0 : fp === 7 ? 2.78 : 4.5) * (o.scale ?? 1);
  b.prism(sides, r, h + 0.3, { color: o.edge ?? u.edge, top: o.edge ?? u.edge, y: -0.3, ry, ...NP });
  const verge = o.verge ?? (fp === 1 ? false : u.verge);
  let top = h;
  if (verge !== false) {
    b.prism(sides, r - 0.09, 0.012, { color: verge, y: h, ry, ...NP });
    top = h + 0.004;
    b.prism(sides, r - (fp === 7 ? 0.32 : 0.45), 0.012, { color: o.color ?? u.ground, y: top, ry, ...NP });
  } else b.prism(sides, r - (fp === 1 ? 0.05 : 0.09), 0.012, { color: o.color ?? u.ground, y: h, ry, ...NP });
  if (o.inset) b.prism(sides, r * o.inset, 0.01, { color: o.insetColor ?? shade(o.color ?? u.ground, 0.9), y: top + 0.012, ry, ...NP, detail: true });
}

/** Height of the pad's top surface (pad default h + skin; verge pads sit 4 mm higher inside). */
export const PAD_TOP = 0.062;

/** Flat painted ground patch (asphalt apron, lawn, gravel) as an n-gon or box. */
export function patch(u: U, w: number, d: number, x: number, z: number, color: number, o: { ry?: number; y?: number; detail?: boolean } = {}): void {
  u.b.box(w, 0.012, d, { color, x, z, y: o.y ?? PAD_TOP, ry: o.ry ?? 0, ...NP, detail: o.detail });
}

/** Round patch. */
export function disc(u: U, r: number, x: number, z: number, color: number, o: { y?: number; seg?: number; mat?: MatId; detail?: boolean } = {}): void {
  u.b.cyl(r, r, 0.012, { color, x, z, y: o.y ?? PAD_TOP, seg: o.seg ?? 16, mat: o.mat, ...NP, detail: o.detail });
}

/** Painted line (runway / parking / helipad markings). */
export function stripe(u: U, w: number, d: number, x: number, z: number, o: { ry?: number; color?: number; y?: number } = {}): void {
  u.b.box(w, 0.006, d, { color: o.color ?? C.line, x, z, y: (o.y ?? PAD_TOP) + 0.006, ry: o.ry ?? 0, ...NP, detail: true });
}

// ═══════════════════════════════════════════════════════════════ buildings

export interface HallOpts {
  x?: number;
  z?: number;
  y?: number;
  ry?: number;
  color?: number;
  roof?: number;
  mat?: MatId;
  /** barrel-vault roof (auto for curvy styles when undefined) */
  vault?: boolean;
  /** neon strip under the roofline (auto for neon styles when undefined) */
  neon?: boolean;
  /** rooftop HVAC boxes */
  gear?: boolean;
  /** green roof (auto for green styles when undefined) */
  garden?: boolean;
  /** industrial shed: clad walls with a ribbon of glazing instead of a window grid */
  shed?: boolean;
}

/** The glazing shader lays one window row per 0.2 world units: ribbons must start on that grid to show one clean row. */
const ROW = 0.2;

/** A one-row ribbon window wrapped around a w×d block, at the highest row that fits inside [y0, y1]. */
export function ribbon(u: U, w: number, d: number, y0: number, y1: number, o: { x?: number; z?: number; ry?: number } = {}): boolean {
  const k = Math.floor((y1 - 0.04) / ROW) - 1;
  const yr = k * ROW;
  if (yr < y0 + 0.03) return false;
  u.b.box(w + 0.012, ROW, d + 0.012, { color: u.glass, mat: Mat.Glass, top: u.trim, x: o.x ?? 0, z: o.z ?? 0, y: yr, ry: o.ry ?? 0, ...NP });
  return true;
}

/** Style-tinted hall / control building with windows, a parapet roof (or vault) and optional neon & gear. */
export function hall(u: U, w: number, h: number, d: number, o: HallOpts = {}): void {
  const { b } = u;
  const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? PAD_TOP;
  const col = o.color ?? u.wall;
  const roof = o.roof ?? u.roof;
  b.group({ x, z, y, ry: o.ry ?? 0 }, () => {
    b.box(w, h, d, { color: col, mat: o.mat ?? (o.shed ? Mat.Plain : Mat.WindowSmall), top: roof });
    const vault = o.vault ?? u.curvy >= 0.7;
    if (vault) {
      const r = Math.min(d / 2, h * 0.6);
      b.cyl(r, r, w, { color: roof, arc: Math.PI, rz: Math.PI / 2, x: w / 2, y: h, sz: d / 2 / r, capBottom: true, seg: 8 });
    } else {
      b.box(w + 0.03, 0.04, d + 0.03, { color: u.trim, top: roof, y: h - 0.03 });
      if (o.garden ?? u.green >= 0.6) b.box(w * 0.86, 0.035, d * 0.8, { color: C.leaf, mat: Mat.Foliage, y: h + 0.01, ...NP, detail: true });
      else if (o.gear ?? true) {
        b.box(Math.min(0.22, w * 0.3), 0.08, Math.min(0.16, d * 0.35), { color: C.steel, mat: Mat.Metal, x: w * 0.2, y: h + 0.01, z: -d * 0.12, detail: true });
        b.box(Math.min(0.14, w * 0.2), 0.06, Math.min(0.14, d * 0.3), { color: shade(C.steel, 0.85), x: -w * 0.22, y: h + 0.01, z: d * 0.1, detail: true });
      }
    }
    if (o.neon ?? u.neon >= 0.5) b.box(w + 0.035, 0.022, d + 0.035, { color: u.accent, mat: Mat.Glow, y: h - 0.075, ...NP, detail: true });
  });
  if (o.shed) ribbon(u, w, d, y, y + h, { x, z, ry: o.ry });
}

/** Simple door / roller shutter on a facade at local z (front). */
export function door(u: U, w: number, h: number, x: number, z: number, o: { ry?: number; color?: number; y?: number } = {}): void {
  u.b.box(w, h, 0.02, { color: o.color ?? shade(u.dark, 0.9), x, z, y: o.y ?? PAD_TOP, ry: o.ry ?? 0, detail: true });
}

/** Glass-fronted lobby box (lit at night). */
export function lobby(u: U, w: number, h: number, d: number, x: number, z: number, o: { ry?: number; y?: number } = {}): void {
  u.b.box(w, h, d, { color: u.glass, mat: Mat.Glass, top: u.trim, x, z, y: o.y ?? PAD_TOP, ry: o.ry ?? 0, ...NP });
}

// ═══════════════════════════════════════════════════════════════ industrial parts

export interface TankOpts {
  y?: number;
  color?: number;
  band?: number | false;
  dome?: boolean;
  seg?: number;
  mat?: MatId;
}

/** Vertical tank with optional dome cap and accent band. */
export function tank(u: U, r: number, h: number, x: number, z: number, o: TankOpts = {}): void {
  const { b } = u;
  const y = o.y ?? PAD_TOP;
  const col = o.color ?? u.tank;
  const seg = o.seg ?? 12;
  b.cyl(r, r, h, { color: col, x, z, y, seg, mat: o.mat });
  if (o.dome ?? true) b.dome(r, { color: col, x, z, y: y + h, h: r * 0.45, wSeg: seg, hSeg: 2, mat: o.mat });
  if (o.band !== false) b.cyl(r + 0.008, r + 0.008, Math.max(0.025, h * 0.08), { color: o.band ?? u.accent, x, z, y: y + h * 0.72, seg, capTop: false, ...DET });
}

/** Horizontal tank / vessel lying along X (or rotated by ry). */
export function vessel(u: U, r: number, len: number, x: number, y: number, z: number, o: { ry?: number; color?: number; legs?: boolean } = {}): void {
  const { b } = u;
  const col = o.color ?? u.tank;
  b.group({ x, y, z, ry: o.ry ?? 0 }, () => {
    b.cyl(r, r, len, { color: col, rz: Math.PI / 2, x: len / 2, seg: 10, capBottom: true });
    b.sphere(r, { color: col, x: len / 2, wSeg: 8, hSeg: 3, sy: 0.4, rz: -Math.PI / 2, thetaLength: Math.PI / 2, detail: true });
    b.sphere(r, { color: col, x: -len / 2, wSeg: 8, hSeg: 3, sy: 0.4, rz: Math.PI / 2, thetaLength: Math.PI / 2, detail: true });
    if (o.legs ?? true) for (const s of [-1, 1]) b.box(0.04, y, r * 1.4, { color: C.steelDark, x: s * len * 0.3, y: -y, ...DET });
  });
}

export interface StackOpts {
  y?: number;
  color?: number;
  bands?: boolean;
  smoke?: number | false;
  seg?: number;
  puffs?: number;
}

/** Chimney / exhaust stack with red-white bands, a lip, an aviation beacon and optional smoke puffs. */
export function stack(u: U, r: number, h: number, x: number, z: number, o: StackOpts = {}): void {
  const { b } = u;
  const y = o.y ?? PAD_TOP;
  const seg = o.seg ?? 10;
  b.cyl(r * 0.78, r, h, { color: o.color ?? C.offwhite, x, z, y, seg });
  if (o.bands ?? true) {
    b.cyl(r * 0.8 + 0.006, r * 0.83 + 0.006, h * 0.08, { color: C.red, x, z, y: y + h * 0.84, seg, capTop: false, ...DET });
    b.cyl(r * 0.79 + 0.006, r * 0.8 + 0.006, h * 0.06, { color: C.red, x, z, y: y + h * 0.66, seg, capTop: false, ...DET });
  }
  b.cyl(r * 0.84, r * 0.84, 0.04, { color: C.iron, x, z, y: y + h - 0.02, seg, ...DET });
  beacon(u, x + r * 0.8, y + h, z);
  if (o.smoke !== false && o.smoke !== undefined) puffs(u, x, y + h + r * 0.4, z, r * 1.5, o.smoke, o.puffs ?? 3);
}

/** Static stylised steam / smoke cloud: flat-shaded puffs drifting up and downwind (+X). */
export function puffs(u: U, x: number, y: number, z: number, size: number, color: number, n = 3): void {
  const { b } = u;
  for (let i = 0; i < n; i++) {
    const s = size * (1 + i * 0.35);
    b.sphere(s, { color: i === 0 ? color : mix(color, 0xffffff, 0.15 * i), x: x + i * size * 0.75, y: y + i * size * 1.05, z: z - i * size * 0.15, wSeg: 6, hSeg: 4, flat: true, ...NP, detail: i > 1 });
  }
}

/** Night-only red aviation light (or any colour). */
export function beacon(u: U, x: number, y: number, z: number, color: number = C.beacon, s = 0.045): void {
  u.b.box(s, s, s, { color, mat: Mat.Light, x, y, z, ...NP, detail: true });
}

/** Always-on glowing light / indicator. */
export function glowBox(u: U, w: number, h: number, d: number, x: number, y: number, z: number, color: number, o: { ry?: number; detail?: boolean } = {}): void {
  u.b.box(w, h, d, { color, mat: Mat.Glow, x, y, z, ry: o.ry ?? 0, ...NP, detail: o.detail });
}

/** Lamp post with a warm night light. */
export function lamp(u: U, x: number, z: number, h = 0.32, o: { y?: number; color?: number } = {}): void {
  const { b } = u;
  const y = o.y ?? PAD_TOP;
  b.box(0.018, h, 0.018, { color: C.iron, x, z, y, ...DET });
  b.box(0.05, 0.025, 0.05, { color: o.color ?? C.lamp, mat: Mat.Light, x, z, y: y + h, ...NP, detail: true });
}

/** Oriented box between two points (pipes, girders, conveyors, struts). */
export function beam(u: U, p0: [number, number, number], p1: [number, number, number], w: number, h: number, o: PartOpts): void {
  const { b } = u;
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const hor = Math.hypot(dx, dz);
  const len = Math.hypot(hor, dy);
  if (len < 1e-4) return;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, hor);
  b.group({ x: p0[0], y: p0[1], z: p0[2], ry: yaw }, () => {
    b.group({ rx: -pitch }, () => {
      b.box(w, h, len, { ...o, x: 0, y: -h / 2, z: len / 2, rx: 0, ry: 0, rz: 0 });
    });
  });
}

/** Round pipe along a polyline. */
export function pipe(u: U, path: [number, number, number][], r: number, color: number = C.steel, o: { detail?: boolean; mat?: MatId; seg?: number } = {}): void {
  u.b.tube(path, r, { color, seg: o.seg ?? 6, mat: o.mat ?? Mat.Metal, detail: o.detail });
}

/** Pipe rack: a run of portal frames carrying 2 pipes from a to b (in the XZ plane at height h). */
export function pipeRack(u: U, a: [number, number], c: [number, number], h: number, o: { colors?: [number, number]; frames?: number } = {}): void {
  const n = o.frames ?? 3;
  const [c1, c2] = o.colors ?? [C.steel, C.yellow];
  const dx = c[0] - a[0], dz = c[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const px = (-dz / len) * 0.05, pz = (dx / len) * 0.05;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + dx * t, z = a[1] + dz * t;
    u.b.box(0.025, h, 0.025, { color: C.steelDark, x: x + px * 1.4, z: z + pz * 1.4, y: PAD_TOP, ...DET });
    u.b.box(0.025, h, 0.025, { color: C.steelDark, x: x - px * 1.4, z: z - pz * 1.4, y: PAD_TOP, ...DET });
  }
  pipe(u, [[a[0] + px, PAD_TOP + h + 0.03, a[1] + pz], [c[0] + px, PAD_TOP + h + 0.03, c[1] + pz]], 0.03, c1);
  pipe(u, [[a[0] - px, PAD_TOP + h + 0.03, a[1] - pz], [c[0] - px, PAD_TOP + h + 0.03, c[1] - pz]], 0.025, c2, { detail: true });
}

/** Square lattice mast (4 legs, zig-zag braced faces). */
export function lattice(u: U, h: number, wBase: number, wTop: number, o: { x?: number; z?: number; y?: number; color?: number; color2?: number; levels?: number; r?: number } = {}): void {
  const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? PAD_TOP;
  const col = o.color ?? C.red;
  const col2 = o.color2 ?? col;
  const lv = o.levels ?? 4;
  const r = o.r ?? 0.018;
  const at = (t: number, sx: number, sz: number): [number, number, number] => {
    const w = (wBase + (wTop - wBase) * t) / 2;
    return [x + sx * w, y + h * t, z + sz * w];
  };
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) u.b.tube([at(0, sx, sz), at(1, sx, sz)], r, { color: col, seg: 4 });
  for (let l = 0; l < lv; l++) {
    const t0 = l / lv, t1 = (l + 1) / lv;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      const flip = (l + k) % 2 === 0;
      beam(u, flip ? at(t0, ax, az) : at(t0, bx, bz), flip ? at(t1, bx, bz) : at(t1, ax, az), r * 1.1, r * 1.1, { color: l % 2 ? col2 : col, detail: true });
    }
  }
}

/** Electricity pylon: four splayed legs, a waist brace and two cross-arms with insulators (≈ 70 triangles). */
export function pylon(u: U, x: number, z: number, h = 0.9, o: { ry?: number; y?: number } = {}): void {
  const { b } = u;
  const y = o.y ?? PAD_TOP;
  b.group({ x, z, y, ry: o.ry ?? 0 }, () => {
    const wb = 0.09, wt = 0.025;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) beam(u, [sx * wb, 0, sz * wb], [sx * wt, h, sz * wt], 0.018, 0.018, { color: C.steel, mat: Mat.Metal });
    b.box(0.13, 0.018, 0.13, { color: C.steel, y: h * 0.42, mat: Mat.Metal, ...DET });
    b.box(0.36, 0.025, 0.025, { color: C.steel, y: h * 0.78, mat: Mat.Metal });
    b.box(0.26, 0.025, 0.025, { color: C.steel, y: h * 0.95, mat: Mat.Metal, ...DET });
    b.box(0.34, 0.04, 0.016, { color: 0x6f8fb0, y: h * 0.78 - 0.04, ...NP, detail: true });
  });
}

/** Transformer yard: plinths with transformer boxes, finned radiators and bushings (≈ 40 triangles each). */
export function transformers(u: U, x: number, z: number, n = 2, o: { ry?: number } = {}): void {
  const { b } = u;
  b.group({ x, z, ry: o.ry ?? 0 }, () => {
    for (let i = 0; i < n; i++) {
      const px = (i - (n - 1) / 2) * 0.32;
      b.box(0.24, 0.03, 0.22, { color: C.concreteDark, x: px, y: PAD_TOP, ...NP });
      b.box(0.16, 0.16, 0.14, { color: 0x6e7f72, x: px, y: PAD_TOP + 0.03 });
      b.box(0.2, 0.12, 0.04, { color: 0x5e6f62, x: px, y: PAD_TOP + 0.04, z: 0.09, ...DET });
      b.box(0.12, 0.07, 0.025, { color: 0x8fa8c8, x: px, y: PAD_TOP + 0.19, ...NP, detail: true });
    }
  });
}

/** Satellite / radio dish: a concave bowl on a yoke, tilted up by `tilt` and turned by `ry`. */
export function dish(u: U, r: number, x: number, y: number, z: number, o: { tilt?: number; ry?: number; color?: number; seg?: number; feed?: boolean } = {}): void {
  const { b } = u;
  const col = o.color ?? C.white;
  const seg = o.seg ?? 14;
  const d = r * 0.42;
  b.group({ x, y, z, ry: o.ry ?? 0 }, () => {
    b.group({ rx: -(o.tilt ?? 0.7) }, () => {
      // bowl: outer (back) face, then inner face with reversed profile so the concave side renders
      b.lathe([[0.02, 0], [r * 0.55, d * 0.3], [r, d]], { color: shade(col, 0.82), seg, ...NP });
      b.lathe([[r * 0.985, d + 0.004], [r * 0.54, d * 0.3 + 0.008], [0.02, 0.008]], { color: col, seg, ...NP });
      if (o.feed ?? true) {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          b.tube([[Math.sin(a) * r * 0.92, d, Math.cos(a) * r * 0.92], [0, r * 0.95, 0]], r * 0.018, { color: C.steelDark, seg: 3, detail: true });
        }
        b.cyl(r * 0.07, r * 0.09, r * 0.14, { color: C.steelDark, y: r * 0.9, seg: 6, ...DET });
      }
    });
  });
}

/** Hyperbolic cooling tower (outer + inner walls, dark basin) with an optional steam plume. */
export function coolingTower(u: U, r: number, h: number, x: number, z: number, o: { steam?: boolean; color?: number; stripe?: number; seg?: number; legs?: boolean; puffs?: number } = {}): void {
  const { b } = u;
  const col = o.color ?? 0xd6d2ca;
  const seg = o.seg ?? 16;
  const prof: [number, number][] = [[r, 0], [r * 0.8, h * 0.34], [r * 0.64, h * 0.78], [r * 0.7, h]];
  b.lathe(prof, { color: col, seg, x, z, y: PAD_TOP });
  const inner = prof.map(([pr, py]) => [pr * 0.93, py] as [number, number]).reverse();
  b.lathe(inner, { color: shade(col, 0.55), seg, x, z, y: PAD_TOP, ...NP });
  b.cyl(r * 0.85, r * 0.85, 0.02, { color: 0x3a3c40, x, z, y: PAD_TOP + 0.05, seg: Math.max(6, seg / 2), ...NP });
  if (o.stripe !== undefined) b.cyl(r * 0.705, r * 0.7, h * 0.07, { color: o.stripe, x, z, y: PAD_TOP + h * 0.9, seg, capTop: false, ...DET });
  if (o.legs)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.box(0.03, 0.12, 0.03, { color: shade(col, 0.8), x: x + Math.sin(a) * r * 1.0, z: z + Math.cos(a) * r * 1.0, y: PAD_TOP, ry: a, ...DET });
    }
  if (o.steam ?? true) puffs(u, x - r * 0.05, PAD_TOP + h + r * 0.32, z, r * 0.4, C.steam, o.puffs ?? 2);
}

/** Wind turbine: tapered tower, nacelle, hub and 3 blades in the plane facing +Z (after `yaw`). */
export function turbine(u: U, x: number, z: number, h: number, rotor: number, o: { yaw?: number; y?: number; phase?: number; color?: number } = {}): void {
  const { b } = u;
  const y = o.y ?? PAD_TOP;
  const col = o.color ?? C.white;
  const s = h / 3;
  b.group({ x, z, y, ry: o.yaw ?? 0 }, () => {
    b.cyl(0.032 * s, 0.07 * s, h, { color: col, seg: 8 });
    b.box(0.1 * s, 0.09 * s, 0.26 * s, { color: col, y: h - 0.02, z: -0.04 * s });
    b.cone(0.045 * s, 0.09 * s, { color: shade(col, 0.95), rx: Math.PI / 2, y: h + 0.025 * s, z: 0.09 * s, seg: 8 });
    b.group({ y: h + 0.025 * s, z: 0.1 * s, rz: o.phase ?? 0.3 }, () => {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        b.group({ rz: a }, () => {
          b.box(0.055 * s, rotor * 0.55, 0.014, { color: col, x: 0.012 * s });
          b.box(0.036 * s, rotor * 0.45, 0.012, { color: col, y: rotor * 0.55, x: 0.006 * s });
          b.box(0.037 * s, rotor * 0.09, 0.016, { color: C.red, y: rotor * 0.88, x: 0.006 * s, ...DET });
        });
      }
    });
    beacon(u, 0, h + 0.07 * s, -0.12 * s);
  });
}

/** Low-poly shrub (20 tris) or conifer (11 tris); both sway. */
export function shrub(u: U, x: number, z: number, s = 0.12, o: { color?: number; y?: number; tall?: boolean } = {}): void {
  const { b } = u;
  const y = o.y ?? PAD_TOP;
  const col = o.color ?? C.leaf;
  if (o.tall) {
    b.cyl(s * 0.12, s * 0.16, s * 0.9, { color: 0x6a4a32, x, z, y, seg: 3, capTop: false, ...DET });
    b.cone(s * 0.55, s * 1.9, { color: shade(col, 0.85), mat: Mat.Foliage, x, z, y: y + s * 0.6, seg: 5, ...NP, detail: true });
  } else b.sphere(s, { color: col, mat: Mat.Foliage, x, z, y: y + s * 0.6, wSeg: 5, hSeg: 3, flat: true, sy: 0.8, ...NP, detail: true });
}

/** Ring of trees / shrubs around a site (detail). */
export function greenRing(u: U, r: number, n: number, o: { s?: number; skipFront?: boolean; tall?: boolean; color?: number } = {}): void {
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    if (o.skipFront && Math.cos(a) > 0.75) continue;
    const jit = 0.9 + u.rnd() * 0.2;
    shrub(u, Math.sin(a) * r * jit, Math.cos(a) * r * jit, (o.s ?? 0.12) * (0.8 + u.rnd() * 0.4), { tall: o.tall && i % 2 === 0, color: o.color });
  }
}

/** Perimeter fence along the pad edge (thin metal panels), with a gap at the front gate. */
export function fence(u: U, r: number, o: { sides?: number; h?: number; gap?: boolean; color?: number; ry?: number } = {}): void {
  const n = o.sides ?? (u.ctx.footprint === 19 ? 12 : 6);
  const h = o.h ?? 0.09;
  const ry0 = o.ry ?? (u.ctx.footprint === 1 ? Math.PI / 6 : u.ctx.footprint === 19 ? Math.PI / 12 : 0);
  for (let i = 0; i < n; i++) {
    const a0 = ry0 + (i / n) * Math.PI * 2, a1 = ry0 + ((i + 1) / n) * Math.PI * 2;
    const x0 = Math.sin(a0) * r, z0 = Math.cos(a0) * r, x1 = Math.sin(a1) * r, z1 = Math.cos(a1) * r;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if ((o.gap ?? true) && mz > r * 0.6 && Math.abs(mx) < r * 0.6) continue;
    const len = Math.hypot(x1 - x0, z1 - z0);
    u.b.box(len, h, 0.01, { color: o.color ?? C.steelDark, mat: Mat.Metal, x: mx, z: mz, y: PAD_TOP, ry: Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2, ...DET });
  }
}

/** Little truck (cab + box/bed). */
export function truck(u: U, x: number, z: number, ry: number, o: { color?: number; cargo?: number; y?: number } = {}): void {
  const { b } = u;
  const y = o.y ?? PAD_TOP;
  b.group({ x, z, y, ry }, () => {
    b.box(0.09, 0.07, 0.07, { color: o.color ?? C.yellow, z: 0.08, y: 0.012, ...DET });
    b.box(0.1, 0.08, 0.16, { color: o.cargo ?? C.white, z: -0.04, y: 0.012, ...DET });
  });
}

/** Car-sized blob (parking lots). */
export function car(u: U, x: number, z: number, ry: number, color: number): void {
  u.b.box(0.06, 0.035, 0.11, { color, x, z, y: PAD_TOP + 0.008, ry, ...NP, detail: true });
}

/** Row of parked cars. */
export function parking(u: U, x: number, z: number, n: number, o: { ry?: number; gap?: number } = {}): void {
  const cols = [0xd84a3a, 0x3a6ad8, 0xf0f0f0, 0x2a2a2e, 0xe0c040, 0x5aa05a, 0x9aa0aa];
  u.b.group({ x, z, ry: o.ry ?? 0 }, () => {
    for (let i = 0; i < n; i++) if (u.rnd() > 0.25) car(u, (i - (n - 1) / 2) * (o.gap ?? 0.09), 0, 0, cols[Math.floor(u.rnd() * cols.length)]);
  });
}

/** Conveyor gallery on legs between two points. */
export function conveyor(u: U, p0: [number, number, number], p1: [number, number, number], o: { w?: number; color?: number; legs?: number } = {}): void {
  const w = o.w ?? 0.07;
  beam(u, p0, p1, w, 0.05, { color: o.color ?? C.yellow });
  const n = o.legs ?? 2;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const x = p0[0] + (p1[0] - p0[0]) * t, yy = p0[1] + (p1[1] - p0[1]) * t, z = p0[2] + (p1[2] - p0[2]) * t;
    if (yy - PAD_TOP > 0.05) u.b.box(0.025, yy - PAD_TOP - 0.03, 0.025, { color: C.steelDark, x, z, y: PAD_TOP, ...DET });
  }
}

/** Material heap (ore, coal, ice, garbage): flat-shaded cone. */
export function heap(u: U, r: number, h: number, x: number, z: number, color: number, o: { seg?: number; mat?: MatId; y?: number } = {}): void {
  u.b.cone(r, h, { color, x, z, y: o.y ?? PAD_TOP, seg: o.seg ?? 7, flat: true, mat: o.mat, ...NP, ry: x * 3.1 + z });
}

/** Shipping container. */
export function container(u: U, x: number, y: number, z: number, color: number, ry = 0): void {
  u.b.box(0.1, 0.07, 0.22, { color, x, y, z, ry, detail: true });
}

/** Rows of solar panels filling a circle of radius r (centre x,z), tilted toward +Z. */
export function solarRows(u: U, r: number, x: number, z: number, o: { rows?: number; tilt?: number; skip?: (px: number, pz: number) => boolean; legs?: boolean; panel?: number; y?: number } = {}): void {
  const { b } = u;
  const rows = o.rows ?? 6;
  const tilt = o.tilt ?? 0.42;
  const pd = o.panel ?? (r * 2) / rows * 0.62;
  const y = o.y ?? PAD_TOP;
  for (let i = 0; i < rows; i++) {
    const pz = -r + ((i + 0.5) / rows) * r * 2;
    const half = Math.sqrt(Math.max(0, r * r - pz * pz)) - 0.08;
    if (half < 0.2) continue;
    // break long rows into tables so the field reads as an array
    const tables = Math.max(1, Math.round((half * 2) / 0.9));
    const tw = (half * 2) / tables;
    for (let t = 0; t < tables; t++) {
      const px = -half + (t + 0.5) * tw;
      if (o.skip?.(x + px, z + pz)) continue;
      b.box(tw - 0.06, 0.025, pd, { color: 0x1a2a4a, topMat: Mat.Solar, top: 0x1a2a4a, x: x + px, z: z + pz, y: y + 0.08, rx: tilt, ...NP });
      if (o.legs ?? true) b.box(tw * 0.5, 0.08, 0.025, { color: C.steelDark, x: x + px, z: z + pz, y, ...DET });
    }
  }
}

/** Hologram sign / emblem disc floating above a building. */
export function holoDisc(u: U, r: number, x: number, y: number, z: number, color: number, o: { ry?: number } = {}): void {
  u.b.cyl(r, r, 0.012, { color, mat: Mat.Holo, x, y, z, rx: Math.PI / 2, ry: o.ry ?? 0, seg: 12, ...NP, detail: true });
}

// ═══════════════════════════════════════════════════════════════ water surfaces

/** Animated water surface (pools, basins, channels). */
export function pool(u: U, w: number, d: number, x: number, z: number, o: { ry?: number; color?: number; y?: number; rim?: number } = {}): void {
  const { b } = u;
  const y = o.y ?? PAD_TOP;
  if (o.rim !== 0) b.box(w + 0.08, 0.07, d + 0.08, { color: o.rim ?? C.concrete, x, z, y, ry: o.ry ?? 0, ...NP });
  b.box(w, 0.012, d, { color: o.color ?? C.water, mat: Mat.Water, x, z, y: y + 0.064, ry: o.ry ?? 0, ...NP });
}

/** Round basin (clarifier / settling tank) with a water surface. */
export function basin(u: U, r: number, x: number, z: number, o: { color?: number; arm?: boolean; seg?: number } = {}): void {
  const { b } = u;
  const seg = o.seg ?? 14;
  b.cyl(r + 0.05, r + 0.05, 0.14, { color: C.concrete, x, z, y: PAD_TOP, seg, top: shade(C.concrete, 0.92), ...NP });
  b.cyl(r, r, 0.01, { color: o.color ?? C.water, mat: Mat.Water, x, z, y: PAD_TOP + 0.13, seg, ...NP });
  if (o.arm ?? true) {
    b.box(r * 2, 0.035, 0.07, { color: C.yellow, x, z, y: PAD_TOP + 0.16, ry: x * 2 + z });
    b.cyl(0.08, 0.08, 0.1, { color: C.steelDark, x, z, y: PAD_TOP + 0.13, seg: 6 });
  }
}
