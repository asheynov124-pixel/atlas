/**
 * zoned-io · extra style-aware parts for high-tech industry and offices (OWNER: zoned-io).
 *
 *   hover-cars & car parks · plazas, fountains & flagpoles · lobbies & canopies · helipads · summits (crown,
 *   helipad or antenna spire on a tower top) · satellite dishes · cooling towers · fan decks · LED rack facades ·
 *   robot arms · drone landing pads
 *
 * Same conventions as parts.ts: building space (+Y up, +Z street), costs documented in triangles, optional parts
 * budget-checked through fits() so no growable can outgrow its 400-triangle LOD0 budget.
 */
import { Mat, mix, shade } from '../../../kit';
import { DET, G, NP, antenna, beacon, beam, drone, fan, stripes } from './common';
import { fits, type IO } from './look';
import { crown, strip } from './parts';

/** Body colours for parked hover-cars. */
const CARS = [0xe8e8e0, 0x2a2e36, 0xc0392b, 0x2e6fb0, 0xd8b23a, 0x8a8f96, 0x3a8a4a];

/** Parked hover-car facing +Z (rotated by ry). 20 tris, detail. */
export function car(io: IO, x: number, z: number, ry: number, color: number): void {
  const { b } = io;
  if (io.lo) return;
  b.group({ x, z, y: G + 0.012, ry }, () => {
    b.box(0.065, 0.022, 0.12, { color, ...DET });
    b.box(0.052, 0.02, 0.058, { color: 0x1c2430, ...DET, y: 0.022, z: -0.008 });
  });
}

/** Painted car park of `n` bays along X centred at (x, z), cars nose-in toward -Z. ~2 + 2n + 20 per car. */
export function carPark(io: IO, x: number, z: number, w: number, n: number, color?: number): void {
  const { b } = io;
  b.plane(w, 0.2, { color: color ?? io.lk.asphalt, ...NP, x, z, y: G + 0.002 });
  stripes(b, x, z, w, n + 1, 0.16);
  for (let i = 0; i < n; i++) {
    if ((io.seed >> (i + 3)) % 5 === 0 || !fits(io, 22)) continue;
    car(io, x - w / 2 + (w * (i + 0.5)) / n, z - 0.01, Math.PI, CARS[(io.seed + i * 3) % CARS.length]);
  }
}

/** Paved plaza plane (2 tris). */
export function plaza(io: IO, x: number, z: number, w: number, d: number, color?: number): void {
  io.b.plane(w, d, { color: color ?? mix(io.lk.yard, 0xffffff, 0.12), ...NP, x, z, y: G + 0.003 });
}

/** Round fountain: basin with an animated water surface and a jet. ~44 tris. */
export function fountain(io: IO, x: number, z: number, r: number): void {
  const { b, p } = io;
  b.cyl(r, r * 1.04, 0.035, { color: mix(p.trim, 0xd8d4cc, 0.5), seg: 8, ...NP, x, z, y: G, top: 0x3a7ab8, topMat: Mat.Water });
  if (fits(io, 20)) b.cone(r * 0.18, 0.12, { color: 0xcfe8ff, mat: Mat.Water, ...NP, seg: 5, x, z, y: G + 0.035 });
}

/** Row of flagpoles with flags in the accent colours (detail). ~16 tris each. */
export function flags(io: IO, x: number, z: number, n: number, h = 0.32, gap = 0.07): void {
  const { b, p, st } = io;
  for (let i = 0; i < n; i++) {
    if (!fits(io, 16)) return;
    const fx = x + (i - (n - 1) / 2) * gap;
    b.cyl(0.004, 0.006, h, { color: 0xe8e8e8, seg: 3, ...DET, x: fx, z, y: G, capTop: false });
    b.panel(0.05, 0.032, { color: i === 0 ? p.accent : st.accents[(i + io.seed) % st.accents.length], ...DET, both: true, x: fx + 0.026, z, y: G + h - 0.04 });
  }
}

/** Glazed lobby band on a street face (+Z) at the ground floor. 2 tris. */
export function lobby(io: IO, x: number, zFront: number, w: number, h = 0.15): void {
  io.b.panel(w, h, { color: mix(io.p.glass, 0xffffff, 0.15), mat: Mat.Glass, ...NP, x, z: zFront + 0.004, y: G });
}

/** Entrance canopy with a lit sign on it (street face). ~40 tris. */
export function canopy(io: IO, x: number, zFront: number, w: number, glyphs = 3): void {
  const { b, p } = io;
  b.box(w, 0.018, 0.11, { color: p.trim, ...NP, x, z: zFront + 0.055, y: G + 0.16 });
  if (fits(io, 22)) for (const sx of [-1, 1]) b.box(0.012, 0.16, 0.012, { color: p.trim, ...DET, x: x + sx * (w / 2 - 0.02), z: zFront + 0.1, y: G });
  if (fits(io, 18)) b.box(w * 0.86, 0.008, 0.008, { color: io.lk.glowy ? p.glow : p.lamp, mat: io.lk.glowy ? Mat.Glow : Mat.Light, ...NP, x, z: zFront + 0.112, y: G + 0.164 });
  void glyphs;
}

/** Rooftop helipad: deck, white H and a ring of edge lights. ~46 tris. */
export function helipad(io: IO, x: number, y: number, z: number, r: number): void {
  const { b } = io;
  b.cyl(r, r * 0.9, 0.035, { color: 0x3a3e46, seg: 8, ...NP, x, z, y, top: 0x40444c });
  const yy = y + 0.036;
  b.plane(0.022, r * 0.9, { color: 0xf2f2f2, ...NP, x: x - r * 0.24, z, y: yy });
  b.plane(0.022, r * 0.9, { color: 0xf2f2f2, ...NP, x: x + r * 0.24, z, y: yy });
  b.plane(r * 0.48, 0.022, { color: 0xf2f2f2, ...NP, x, z, y: yy });
  if (fits(io, 16)) b.cyl(r * 1.01, r * 1.01, 0.012, { color: 0x7aff8a, mat: Mat.Light, ...NP, seg: 8, capTop: false, x, z, y: y + 0.024 });
}

export type SummitKind = 'crown' | 'helipad' | 'spire';

export interface SummitOpts {
  x?: number;
  z?: number;
  y: number;
  w: number;
  d: number;
  prestige: number;
  tall?: number;
}

/**
 * Tower top: the style crown, a helipad with an antenna, or a stepped plinth with an antenna spire.
 * Always ends in aviation lights. Returns the tip height. Cost ≈ 40–140 tris.
 */
export function summit(io: IO, kind: SummitKind, o: SummitOpts): number {
  const { b, p } = io;
  const x = o.x ?? 0, z = o.z ?? 0, y = o.y, w = o.w, d = o.d;
  const tall = o.tall ?? 1;
  if (kind === 'crown') return crown(io, { x, z, y, w, d, prestige: o.prestige, tall });
  if (kind === 'helipad') {
    const r = Math.min(w, d) * 0.44;
    b.box(w * 0.92, 0.05, d * 0.92, { color: shade(p.trim, 0.85), ...NP, x, z, y });
    helipad(io, x, y + 0.05, z, r);
    const ah = (0.35 + o.prestige * 0.4) * tall;
    b.cyl(0.006, 0.014, ah, { color: 0xd8d8d8, mat: Mat.Metal, ...NP, seg: 3, x: x + w * 0.4, z: z - d * 0.4, y: y + 0.05, capTop: false });
    beacon(b, x + w * 0.4, y + 0.05 + ah, z - d * 0.4, 0.03);
    if (fits(io, 10)) beacon(b, x - w * 0.42, y + 0.07, z + d * 0.42, 0.024);
    return y + 0.05 + ah;
  }
  // spire: two stepped plinths, a needle and a beacon
  b.box(w * 0.8, 0.12, d * 0.8, { color: p.trim, ...NP, x, z, y });
  b.box(w * 0.5, 0.1, d * 0.5, { color: shade(p.trim, 0.9), ...NP, x, z, y: y + 0.12 });
  if (fits(io, 12)) strip(io, x, y + 0.115, z, w * 0.82, 0.014, d * 0.82);
  const sh = (0.8 + o.prestige * 0.9) * tall;
  b.cyl(0.004, 0.03, sh, { color: 0xe8e8e8, mat: Mat.Metal, ...NP, seg: 4, x, z, y: y + 0.22, capTop: false });
  beacon(b, x, y + 0.22 + sh, z, 0.03);
  if (fits(io, 10)) beacon(b, x, y + 0.22 + sh * 0.55, z, 0.022);
  return y + 0.22 + sh;
}

/** Satellite dish on a short pedestal, tilted toward yaw: a shallow cone with its face up. ~34 tris. */
export function dish(io: IO, x: number, y: number, z: number, r: number, yaw: number): void {
  const { b } = io;
  b.cyl(r * 0.12, r * 0.18, r * 0.5, { color: 0xb8bcc4, seg: 4, ...NP, x, z, y, capTop: false });
  b.group({ x, z, y: y + r * 0.5, ry: yaw }, () => {
    b.group({ rx: 0.7 }, () => {
      b.cone(r, r * 0.35, { color: 0xf0f0ec, seg: 8, ...NP, capBottom: true, rx: Math.PI, y: r * 0.35, top: 0xf6f6f2 });
      b.box(0.008, r * 0.8, 0.008, { color: 0x9aa0aa, ...DET, y: r * 0.3 });
    });
  });
}

/** Hyperbolic cooling tower (lathe). ~36–50 tris. */
export function coolingTower(io: IO, x: number, z: number, r: number, h: number, color?: number): void {
  const c = color ?? (io.sid === 'cyber' ? 0x4a4f5e : io.sid === 'mars' ? 0xe6c8a0 : io.sid === 'crystal' ? 0xd8d0f0 : 0xd8d6d0);
  io.b.lathe([[r, 0], [r * 0.7, h * 0.62], [r * 0.76, h]], { color: c, seg: 7, ...NP, x, z, y: G });
  if (fits(io, 14)) io.b.cyl(r * 0.77, r * 0.77, 0.012, { color: io.lk.glowy ? io.p.glow : 0x9aa0a8, mat: io.lk.glowy ? Mat.Glow : Mat.Plain, ...NP, seg: 7, capTop: false, x, z, y: G + h - 0.03 });
}

/** Grid of rooftop exhaust fans (detail; budget-checked per fan). 12 tris each. */
export function fanDeck(io: IO, x: number, y: number, z: number, w: number, d: number, cols: number, rows: number, color?: number): void {
  const { b, lk } = io;
  if (io.lo) return;
  const c = color ?? (io.sid === 'cyber' ? 0x4a505e : mix(lk.metal, 0xffffff, 0.2));
  const r = Math.min(w / cols, d / rows) * 0.32;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if (!fits(io, 12)) return;
      fan(b, x - w / 2 + (w * (i + 0.5)) / cols, y, z - d / 2 + (d * (j + 0.5)) / rows, r, c, 4);
    }
}

/**
 * Data-hall facade: `n` vertical always-on LED rack strips on the +Z face (2 tris each) with a status line along
 * the top. Glows day and night.
 */
export function ledRack(io: IO, x: number, zFront: number, w: number, y: number, h: number, n: number, color: number, color2?: number): void {
  const { b } = io;
  for (let i = 0; i < n; i++) {
    const lx = x - w / 2 + (w * (i + 0.5)) / n;
    b.panel(0.014, h, { color: i % 3 === 2 && color2 !== undefined ? color2 : color, mat: Mat.Glow, ...NP, x: lx, z: zFront + 0.003, y });
  }
  b.panel(w, 0.012, { color: color2 ?? color, mat: Mat.Glow, ...NP, x, z: zFront + 0.003, y: y + h + 0.02 });
}

/** Six-axis industrial robot arm on a round base, posed by `pose` (0..1). ~56 tris. */
export function robotArm(io: IO, x: number, z: number, scale: number, pose: number, ry: number, color: number): void {
  const { b } = io;
  const s = scale;
  b.group({ x, z, y: G, ry }, () => {
    b.cyl(0.05 * s, 0.06 * s, 0.05 * s, { color: 0x30343c, seg: 6, ...NP });
    b.cyl(0.035 * s, 0.04 * s, 0.05 * s, { color, seg: 6, ...NP, y: 0.05 * s });
    const a1 = 0.35 + pose * 0.5, a2 = -0.6 - pose * 0.7;
    const sh: [number, number, number] = [0, 0.1 * s, 0];
    const el: [number, number, number] = [0, sh[1] + Math.cos(a1) * 0.24 * s, Math.sin(a1) * 0.24 * s];
    const wr: [number, number, number] = [0, el[1] + Math.cos(Math.PI / 2 + a2) * 0.2 * s, el[2] + Math.sin(Math.PI / 2 + a2) * 0.2 * s + 0.08 * s];
    beam(b, sh, el, 0.045 * s, { color, ...NP });
    beam(b, el, wr, 0.034 * s, { color, ...NP });
    b.box(0.05 * s, 0.03 * s, 0.05 * s, { color: 0x30343c, ...NP, x: wr[0], y: wr[1] - 0.03 * s, z: wr[2] });
    if (fits(io, 10)) b.box(0.03 * s, 0.03 * s, 0.03 * s, { color: io.lk.glowy ? io.p.glow : 0xffb030, mat: io.lk.glowy ? Mat.Glow : Mat.Light, ...DET, x: el[0], y: el[1] - 0.015 * s, z: el[2] });
  });
}

/** Drone landing pad: deck with a lit ring and maybe a parked drone. ~40 tris. */
export function pad(io: IO, x: number, y: number, z: number, r: number, withDrone: boolean): void {
  const { b, p } = io;
  b.cyl(r, r, 0.02, { color: io.sid === 'cyber' ? 0x22252e : 0x4a4e58, seg: 8, ...NP, x, z, y });
  if (fits(io, 16)) b.cyl(r * 0.72, r * 0.72, 0.006, { color: io.lk.glowy ? p.glow : 0xffc040, mat: io.lk.glowy ? Mat.Glow : Mat.Light, ...NP, seg: 8, capTop: false, x, z, y: y + 0.018 });
  if (withDrone && fits(io, 24)) drone(b, x, y + 0.03, z, io.sid === 'cyber' ? 0x2a2e38 : 0xe8e8e0, io.lk.glowy ? p.glow : 0xff6a3a);
}

/** Thin mast with a beacon (re-export for types that only import gear). */
export { antenna };
