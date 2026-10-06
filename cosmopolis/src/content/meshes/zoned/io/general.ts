/**
 * zoned-io · General industry growables (zone I1) (OWNER: zoned-io).
 *
 *   workshop · sawtooth factory · logistics warehouse · tank farm · container depot · arc foundry ·
 *   hover-car assembly plant · scrap reclaimer
 *
 * Halls, stacks and tanks come from parts.ts (the style decides what a "hall" is); cranes, conveyors, containers,
 * trucks and pipework are drawn here with the look's machinery colours. Level 1 is a modest yard; level 5 is a
 * roaring complex with more stacks, bigger cranes and lit signage.
 */
import { Mat, mix, shade } from '../../../kit';
import {
  DET, G, NP, barrel, beam, byL, container, conveyor, fence, gantry, heap, lampPost, pallets, pipeRack, stripes, storeys, truck,
} from './common';
import { factory, fits, flip, type IO } from './look';
import { apron, block, hall, lot, opt, roofGear, sign, stack, tank, tree } from './parts';

/** Little forklift / reach-stacker (detail). */
function forklift(io: IO, x: number, z: number, ry: number): void {
  const { b } = io;
  if (io.lo || !fits(io, 30)) return;
  b.group({ x, z, y: G, ry }, () => {
    b.box(0.06, 0.04, 0.08, { color: 0xf0b020, ...DET, y: 0.01 });
    b.box(0.05, 0.035, 0.03, { color: 0x30343c, ...DET, y: 0.05, z: -0.015 });
    b.box(0.05, 0.08, 0.008, { color: 0x50545c, ...DET, y: 0.01, z: 0.045 });
  });
}

/** Yard clutter: pallets, drums, a lamp. */
function clutter(io: IO, x: number, z: number, n: number): void {
  const { b, p } = io;
  for (let i = 0; i < n; i++) {
    if (!fits(io, 16)) return;
    const k = (io.seed >> (i * 3)) & 7;
    const px = x + ((k & 3) - 1.5) * 0.07, pz = z + ((k >> 2) - 0.5) * 0.09;
    if (i % 3 === 0) pallets(b, px, pz, i % 2 ? 0xb08a5a : p.cargo);
    else barrel(b, px, pz, i % 2 ? p.accent : 0x3a6a9a);
  }
}

/** Office annex block on the side of a hall, with a logo sign from L3. */
function annex(io: IO, x: number, z: number, w: number, d: number, fl: number, logo: boolean): number {
  const top = block(io, { x, z, w, d, h: storeys(fl), use: 'office', color: io.p.wall });
  if (logo && fits(io, 22)) sign(io, x, top + 0.01, z + d / 2 - 0.02, w * 0.75, 0.07, 4);
  return top;
}

// ═══════════════════════════════════════════════════════════════ workshop

export const workshop = factory((io) => {
  const { b, L, p } = io;
  const s = flip(io, 1) ? 1 : -1;
  const w = byL(L, [0.62, 0.78, 0.9, 0.98, 1.04]), d = byL(L, [0.46, 0.52, 0.56, 0.6, 0.62]);
  const h = byL(L, [0.28, 0.32, 0.38, 0.42, 0.46]);
  const z0 = -0.14, hx = -s * byL(L, [0.06, 0.08, 0.1, 0.1, 0.1]);
  lot(io, 'yard');
  io.reserve = 60;
  const top = hall(io, { x: hx, z: z0, w, d, h, doors: byL(L, [1, 2, 2, 3, 3]) });
  apron(io, hx, z0 + d / 2, w * 0.7);
  io.reserve = 40;
  if (L >= 2) annex(io, hx + s * (w / 2 + 0.13), z0 + d / 2 - 0.16, 0.24, 0.3, byL(L, [1, 2, 2, 3, 3]), L >= 3);
  io.reserve = 0;
  stack(io, hx - s * (w / 2 - 0.12), z0 - d / 2 + 0.1, byL(L, [0.04, 0.045, 0.05, 0.055, 0.06]), byL(L, [0.55, 0.7, 0.85, 1.0, 1.1]), top.flat ? top.y : G);
  if (top.flat) roofGear(io, hx + s * 0.1, top.y, z0, w * 0.6, d * 0.7, L >= 3 ? 2 : 1);
  if (L >= 2) opt(io, 30, () => truck(b, hx - s * 0.2, 0.52, 0, p.accent, mix(p.cargo, 0xffffff, 0.2)));
  forklift(io, hx + s * 0.18, 0.38, s * 0.6);
  clutter(io, -s * 0.52, 0.32, byL(L, [3, 4, 4, 5, 5]));
  tree(io, s * 0.56, 0.42, 0.85);
  opt(io, 12, () => lampPost(b, -s * 0.3, 0.66, 0.2, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ sawtooth factory

export const factoryHall = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 2) ? 1 : -1;
  const w = byL(L, [0.8, 0.92, 1.02, 1.1, 1.18]), d = byL(L, [0.5, 0.56, 0.6, 0.64, 0.66]);
  const h = byL(L, [0.3, 0.36, 0.42, 0.48, 0.54]);
  const z0 = -0.08;
  lot(io, 'yard');
  io.reserve = byL(L, [60, 60, 100, 130, 150]);
  const top = hall(io, { z: z0, w, d, h, doors: byL(L, [1, 2, 2, 3, 3]) });
  apron(io, 0, z0 + d / 2, w * 0.8);
  // stacks behind the hall, rising with level
  const n = byL(L, [1, 1, 2, 2, 3]);
  const sh = byL(L, [0.85, 1.05, 1.3, 1.6, 1.95]);
  const sr = byL(L, [0.05, 0.055, 0.06, 0.068, 0.075]);
  io.reserve = byL(L, [20, 20, 50, 80, 100]);
  for (let i = 0; i < n; i++) stack(io, s * (-w / 2 + 0.14 + i * 0.17), z0 - d / 2 - 0.06, sr * (i === 0 ? 1.15 : 1), sh * (i === 0 ? 1 : 0.82));
  // L4+: process tank + pipework, L5: lit front office with logo
  io.reserve = L >= 5 ? 60 : 0;
  if (L >= 3) {
    const tx = s * (w / 2 + 0.06), tz = z0 - d / 2 + 0.06;
    tank(io, tx, tz, 0.11, byL(L, [0, 0, 0.28, 0.34, 0.4]));
    if (fits(io, 30)) pipeRack(b, tx - s * 0.08, tz + 0.12, tx - s * 0.08, z0 + d / 2 - 0.08, 0.2, [lk.pipes[0], lk.pipes[1]], lk.metal);
  }
  io.reserve = 0;
  if (L >= 5) annex(io, -s * w * 0.26, z0 + d / 2 + 0.11, 0.42, 0.16, 2, true);
  if (top.flat && L >= 2) roofGear(io, s * 0.12, top.y, z0, w * 0.7, d * 0.7, L);
  opt(io, 30, () => truck(b, s * 0.36, 0.56, 0, p.accent, p.cargo));
  if (L >= 3) opt(io, 30, () => truck(b, s * 0.12, 0.6, 0.1, 0x30343c, mix(p.cargo, 0xffffff, 0.3)));
  clutter(io, -s * 0.5, 0.42, 3);
  tree(io, -s * 0.6, 0.5, 0.8);
  opt(io, 12, () => lampPost(b, s * 0.6, 0.4, 0.22, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ logistics warehouse

export const warehouse = factory((io) => {
  const { b, L, p } = io;
  const w = byL(L, [0.9, 1.04, 1.14, 1.2, 1.2]), d = byL(L, [0.48, 0.54, 0.58, 0.62, 0.62]);
  const z0 = -0.2;
  lot(io, 'paved');
  io.reserve = 80;
  if (L <= 3) {
    const top = hall(io, { z: z0, w, d, h: byL(L, [0.26, 0.3, 0.34, 0.34, 0.34]), doors: byL(L, [2, 3, 4, 4, 4]), windows: false });
    if (top.flat) roofGear(io, 0, top.y, z0, w * 0.8, d * 0.8, L + 1);
  } else {
    // automated high-bay store behind a low dock hall, linked by a conveyor bridge
    const hb = storeys(L >= 5 ? 5 : 4, 0.03);
    const tz = z0 - 0.08;
    const roofY = block(io, { z: tz, w: w * 0.9, d: d * 0.62, h: hb, use: 'ind', color: io.p.ind2 });
    hall(io, { z: z0 + d * 0.32, w, d: d * 0.36, h: 0.24, doors: 4, windows: false });
    sign(io, 0, G + hb - 0.16, tz + (d * 0.62) / 2 + 0.012, w * 0.55, 0.1, 5);
    if (fits(io, 40)) roofGear(io, 0, roofY, tz, w * 0.8, d * 0.55, 3);
  }
  io.reserve = 0;
  // docks: trucks backed up to the doors, painted bays
  stripes(b, 0, z0 + d / 2 + 0.24, w * 0.85, byL(L, [3, 4, 5, 5, 5]), 0.2);
  const tn = byL(L, [1, 2, 2, 3, 3]);
  for (let i = 0; i < tn; i++) opt(io, 30, () => truck(b, tn > 1 ? -w * 0.3 + (i * w * 0.6) / (tn - 1) : 0, z0 + d / 2 + 0.2, 0, i % 2 ? p.accent : 0xe8e8e0, i % 2 ? p.cargo : mix(p.cargo, 0xffffff, 0.35)));
  forklift(io, w * 0.42, 0.52, -0.8);
  clutter(io, -0.55, 0.48, 3);
  opt(io, 12, () => lampPost(b, 0.62, 0.42, 0.22, p.lamp));
  opt(io, 12, () => lampPost(b, -0.64, 0.3, 0.22, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ tank farm

const TANK_SPOTS: [number, number][] = [[-0.38, -0.24], [0.1, -0.4], [0.5, -0.04], [-0.44, 0.26], [0.06, 0.12]];

export const tankFarm = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 3) ? 1 : -1;
  lot(io, 'yard');
  const n = byL(L, [2, 3, 3, 4, 4]);
  const r = byL(L, [0.15, 0.16, 0.18, 0.19, 0.2]);
  const h = byL(L, [0.2, 0.26, 0.32, 0.4, 0.48]);
  // bund walls first (cheap, reads as a tank farm from orbit)
  b.box(1.1, 0.04, 0.02, { color: shade(lk.yard, 0.8), ...NP, x: 0.04, z: 0.01 + 0.24, y: G });
  io.reserve = 70;
  for (let i = 0; i < n; i++) {
    const [tx, tz] = TANK_SPOTS[i];
    tank(io, tx * s, tz, i === 4 ? r * 0.8 : r, i % 2 ? h * 0.85 : h, i === 1 && L >= 4 ? 0xd8d4cc : undefined);
  }
  // control hut + pipe run to the tanks
  io.reserve = L >= 3 ? 40 : 0;
  const hx = 0.32 * s;
  block(io, { x: hx, z: 0.5, w: 0.3, d: 0.18, h: storeys(L >= 4 ? 2 : 1), use: 'ind', color: p.wall });
  pipeRack(b, -0.52 * s, 0.4, hx - 0.17 * s, 0.4, 0.12, [lk.pipes[0], lk.pipes[2]], lk.metal);
  io.reserve = 0;
  // flare stack from L3 (flame glows day and night)
  if (L >= 3) {
    const fx = -0.12 * s, fz = 0.46, fh = byL(L, [0, 0, 0.9, 1.1, 1.3]);
    b.cyl(0.018, 0.03, fh, { color: lk.metal, mat: Mat.Plain, ...NP, seg: 4, x: fx, z: fz, y: G });
    b.cone(0.035, 0.12, { color: 0xffa040, mat: Mat.Lava, ...NP, seg: 4, x: fx, z: fz, y: G + fh });
  }
  opt(io, 30, () => truck(b, 0.62 * s, 0.32, -0.5 * s, 0xe8e8e0, 0xd8d8d0));
  opt(io, 12, () => lampPost(b, -0.62 * s, 0.4, 0.22, p.lamp));
  tree(io, 0.64 * s, -0.3, 0.8);
});

// ═══════════════════════════════════════════════════════════════ container depot

export const depot = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 4) ? 1 : -1;
  lot(io, 'paved');
  const rows = byL(L, [2, 3, 3, 3, 3]);
  const cols = byL(L, [3, 3, 4, 4, 4]);
  const maxT = byL(L, [1, 2, 2, 3, 3]);
  const z0 = -0.42;
  io.reserve = (L >= 2 ? 75 : 45) + (L >= 3 ? 85 : 0) + 20;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = -0.42 + c * 0.24 + (r % 2) * 0.03;
      const z = z0 + r * 0.17;
      if (Math.hypot(Math.abs(x) + 0.12, z) > 0.86) continue;
      const tiers = 1 + ((io.seed >> ((r * cols + c) % 24)) % maxT);
      for (let t = 0; t < tiers; t++) {
        if (!fits(io, 10)) break;
        container(b, x * s, G + t * 0.078, z, Math.PI / 2, lk.cargo[(r * 3 + c * 2 + t + io.seed) % lk.cargo.length], 0.2);
      }
    }
  io.reserve = 30;
  if (L >= 2) gantry(b, 0, z0 + 0.17, byL(L, [0, 0.9, 1.02, 1.12, 1.16]), byL(L, [0, 0.32, 0.36, 0.44, 0.5]), 0.12 + rows * 0.08, lk.steel);
  else {
    block(io, { x: -0.4 * s, z: 0.4, w: 0.24, d: 0.18, h: storeys(1), use: 'office', color: p.wall });
    forklift(io, 0.2 * s, 0.3, 0.4);
  }
  io.reserve = 0;
  if (L >= 3) block(io, { x: 0.46 * s, z: 0.42, w: 0.22, d: 0.2, h: storeys(L >= 4 ? 3 : 2), use: 'office', color: p.wall });
  opt(io, 30, () => truck(b, -0.15 * s, 0.5, 0, p.accent, lk.cargo[io.seed % lk.cargo.length]));
  if (L >= 2) opt(io, 30, () => truck(b, 0.12 * s, 0.56, 0.15, 0xe8e8e0, lk.cargo[(io.seed + 2) % lk.cargo.length]));
  opt(io, 12, () => lampPost(b, -0.62 * s, 0.24, 0.26, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ arc foundry

export const foundry = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 5) ? 1 : -1;
  lot(io, 'yard', shade(lk.yard, 0.82));
  const fh = byL(L, [0.7, 0.8, 1.0, 1.2, 1.4]);
  const fx = -0.4 * s, fz = -0.26;
  io.reserve = 150;
  // blast furnace: tapered shell, banding, glowing tap-hole, downcomer to the dust catcher
  b.cyl(0.11, 0.17, fh, { color: lk.metal, mat: Mat.Plain, seg: 8, ...NP, x: fx, z: fz, y: G, top: 0x2a2a2a });
  b.cyl(0.18, 0.19, 0.08, { color: 0x3a3a3a, seg: 8, ...NP, x: fx, z: fz, y: G, capTop: false });
  b.cyl(0.115, 0.115, 0.03, { color: p.accent, seg: 8, ...NP, x: fx, z: fz, y: G + fh * 0.62, capTop: false });
  b.box(0.08, 0.06, 0.03, { color: 0xffa030, mat: Mat.Lava, ...NP, x: fx + 0.06 * s, z: fz + 0.16, y: G + 0.02 });
  beam(b, [fx, G + fh, fz], [fx + 0.3 * s, G + fh * 0.7, fz - 0.24], 0.04, { color: lk.pipes[0], mat: Mat.Plain, ...NP });
  b.cyl(0.07, 0.07, fh * 0.55, { color: lk.pipes[0], mat: Mat.Plain, seg: 6, ...NP, x: fx + 0.32 * s, z: fz - 0.26, y: G + 0.06, top: 0x30343c });
  b.cone(0.07, 0.07, { color: lk.pipes[0], seg: 6, ...NP, x: fx + 0.32 * s, z: fz - 0.26, y: G - 0.01, rx: Math.PI });
  // casting hall with a molten runner from the tap-hole
  io.reserve = 60;
  const hz = 0.08;
  const top = hall(io, { x: 0.18 * s, z: hz, w: 0.62, d: 0.46, h: byL(L, [0.34, 0.36, 0.4, 0.46, 0.5]), doors: 2, color: p.ind });
  b.plane(0.05, 0.36, { color: 0xff6a20, mat: Mat.Lava, ...NP, x: fx + 0.06 * s, z: fz + 0.36, y: G + 0.004 });
  io.reserve = 30;
  const n = byL(L, [1, 1, 2, 2, 3]);
  for (let i = 0; i < n; i++) stack(io, (0.42 - i * 0.18) * s, -0.42 + i * 0.04, 0.06, byL(L, [1.0, 1.1, 1.35, 1.6, 1.9]) * (i ? 0.85 : 1));
  io.reserve = 0;
  if (top.flat) roofGear(io, 0.18 * s, top.y, hz, 0.5, 0.36, 2);
  if (L >= 4 && fits(io, 30)) conveyor(b, [fx + 0.1 * s, G + 0.1, fz + 0.3], [fx + 0.08 * s, G + fh * 0.85, fz + 0.05], 0.05, lk.metal);
  opt(io, 12, () => heap(b, -0.52 * s, 0.42, 0.14, 0.12, p.ore, true));
  opt(io, 12, () => heap(b, -0.32 * s, 0.56, 0.1, 0.08, shade(p.ore, 0.7), true));
  opt(io, 30, () => truck(b, 0.26 * s, 0.56, 0, 0x30343c, shade(p.ore, 0.9)));
  opt(io, 12, () => lampPost(b, 0.62 * s, 0.32, 0.24, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ hover-car assembly plant

export const assembly = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 6) ? 1 : -1;
  lot(io, 'paved');
  const w = byL(L, [0.96, 1.02, 1.1, 1.16, 1.2]), d = byL(L, [0.42, 0.44, 0.46, 0.48, 0.5]);
  const z0 = -0.26;
  io.reserve = 130;
  const top = hall(io, { z: z0, w, d, h: byL(L, [0.36, 0.38, 0.42, 0.46, 0.5]), doors: 2, color: p.ind });
  sign(io, -0.14 * s, G + byL(L, [0.36, 0.38, 0.42, 0.46, 0.5]) - 0.13, z0 + d / 2 + 0.013, 0.36, 0.08, 5);
  // office annex with glazed lobby
  io.reserve = 90;
  const ax = 0.38 * s, az = z0 + d / 2 + 0.18;
  annex(io, ax, az, 0.32, 0.22, byL(L, [1, 2, 2, 3, 4]), false);
  // test track: an octagonal oval with a hover-car on it
  io.reserve = 20;
  const cx = -0.26 * s, cz = 0.36, rx = 0.26, rz = 0.16;
  const pts: [number, number][] = [];
  for (let k = 0; k < 8; k++) pts.push([cx + Math.sin((k / 8) * Math.PI * 2) * rx, cz + Math.cos((k / 8) * Math.PI * 2) * rz]);
  b.plane(rx * 1.5, rz * 1.4, { color: lk.ground, ...NP, x: cx, z: cz, y: G + 0.002 });
  for (let k = 0; k < 8; k++) {
    const a = pts[k], c = pts[(k + 1) % 8];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    b.plane(0.05, len + 0.02, { color: 0x2a2c32, ...NP, x: (a[0] + c[0]) / 2, z: (a[1] + c[1]) / 2, y: G + 0.004, ry: Math.atan2(c[0] - a[0], c[1] - a[1]) });
  }
  io.reserve = 0;
  b.group({ x: cx + rx, z: cz, y: G + 0.02 }, () => {
    b.box(0.07, 0.025, 0.13, { color: p.accent, ...DET });
    b.box(0.055, 0.025, 0.06, { color: 0x1c2430, mat: Mat.Plain, ...DET, y: 0.025 });
  });
  if (top.flat) roofGear(io, 0, top.y, z0, w * 0.8, d * 0.8, 3);
  if (L >= 5 && fits(io, 40)) {
    // robotic arm sculpture on the forecourt
    b.cyl(0.04, 0.05, 0.08, { color: lk.steel, mat: Mat.Plain, seg: 6, ...NP, x: ax, z: 0.62, y: G });
    beam(b, [ax, G + 0.08, 0.62], [ax - 0.06 * s, G + 0.3, 0.56], 0.03, { color: p.accent, ...NP });
    beam(b, [ax - 0.06 * s, G + 0.3, 0.56], [ax + 0.06 * s, G + 0.38, 0.5], 0.025, { color: p.accent, ...NP });
  }
  opt(io, 30, () => truck(b, 0.18 * s, 0.6, 0, 0xe8e8e0, p.cargo));
  tree(io, 0.62 * s, 0.32, 0.8);
  opt(io, 12, () => lampPost(b, -0.62 * s, 0.1, 0.22, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ scrap reclaimer

export const scrapyard = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 7) ? 1 : -1;
  lot(io, 'soil');
  // scrap heaps in mixed rust & metal tones
  const heaps: [number, number, number][] = [[-0.38, -0.3, 0.2], [0.04, -0.46, 0.16], [-0.48, 0.16, 0.15], [0.12, -0.12, 0.13], [0.42, -0.36, 0.14]];
  const tones = [0x8a5a3a, lk.metal, 0x6a6e76, p.ore, 0xa0603a];
  const hn = byL(L, [3, 4, 5, 5, 5]);
  for (let i = 0; i < hn; i++) heap(b, heaps[i][0] * s, heaps[i][1], heaps[i][2], heaps[i][2] * 0.8, tones[(i + io.seed) % tones.length]);
  // sorting shed
  io.reserve = 90;
  const top = hall(io, { x: 0.4 * s, z: 0.12, w: 0.36, d: 0.34, h: byL(L, [0.24, 0.28, 0.32, 0.34, 0.36]), doors: 1 });
  if (top.flat) roofGear(io, 0.4 * s, top.y, 0.12, 0.3, 0.26, 1);
  // magnet crane: slewing base, boom, cable and disc magnet
  io.reserve = 20;
  const mx = -0.12 * s, mz = 0.18, bh = byL(L, [0.5, 0.6, 0.7, 0.75, 0.8]);
  b.box(0.12, 0.08, 0.14, { color: lk.steel, ...NP, x: mx, z: mz, y: G });
  b.box(0.08, 0.06, 0.06, { color: 0x30343c, ...NP, x: mx, z: mz + 0.03, y: G + 0.08 });
  const tip: [number, number, number] = [mx - 0.24 * s, G + bh, mz - 0.22];
  beam(b, [mx, G + 0.1, mz], tip, 0.035, { color: lk.steel, mat: Mat.Plain, ...NP });
  b.box(0.006, bh * 0.45, 0.006, { color: 0x202020, ...NP, x: tip[0], z: tip[2], y: G + bh * 0.55 });
  b.cyl(0.06, 0.06, 0.025, { color: 0x3a3a3a, mat: Mat.Plain, seg: 6, ...NP, x: tip[0], z: tip[2], y: G + bh * 0.55 - 0.025 });
  io.reserve = 0;
  // crushed-car cubes waiting by the road
  const cc = byL(L, [3, 4, 5, 6, 6]);
  for (let i = 0; i < cc; i++) {
    if (!fits(io, 10)) break;
    b.box(0.06, 0.05, 0.06, { color: tones[(i * 2 + io.seed) % tones.length], ...NP, x: (-0.5 + i * 0.075) * s, z: 0.52, y: G + (i % 3 === 2 ? 0.05 : 0), ry: i * 0.3 });
  }
  opt(io, 10, () => fence(b, 0, 0.72, 0.9, 0x6a6e76));
  if (L >= 2) opt(io, 30, () => truck(b, 0.36 * s, 0.56, 0, p.accent, 0x6a6e76));
  opt(io, 12, () => lampPost(b, 0.66 * s, -0.2, 0.22, p.lamp));
});
