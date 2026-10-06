/**
 * zoned-io · High-tech industry growables (zone IT) (OWNER: zoned-io).
 *
 *   clean fab · robotics plant · nano-forge · server farm · drone logistics hub · quantum lab · biotech campus
 *
 * Clean, bright and humming: pale cleanroom volumes under forests of exhaust fans, server halls striped with
 * always-on LED racks, glowing containment rings, robot arms on the forecourt and drones everywhere. Every type
 * keeps the style's architecture (blocks and halls from parts.ts) and picks its glow from the style accents, so a
 * neon cyber fab and a terracotta solarpunk fab are unmistakably the same building type.
 */
import { Mat, mix, shade, type MatId } from '../../../kit';
import { DET, G, NP, beacon, beam, byL, drone, fence, lampPost, pipeRack, storeys, truck } from './common';
import { factory, fits, flip, type IO } from './look';
import { apron, block, dome, hall, lot, opt, sign, stack, strip, tank, tree } from './parts';
import { carPark, coolingTower, dish, fanDeck, ledRack, lobby, pad, robotArm } from './gear';

/** Clean pale wall for tech buildings (dark styles stay dark). */
function techWall(io: IO): number {
  const k = io.sid === 'classic' ? 0.55 : io.sid === 'solarpunk' ? 0.25 : io.sid === 'cyber' ? 0 : 0.2;
  return mix(io.p.wall, 0xffffff, k);
}

/** Tech glow: the style glow for neon looks, a cool cyan otherwise. Always-on material. */
function techGlow(io: IO): number {
  return io.lk.glowy ? io.p.glow : io.sid === 'mars' ? 0xffb050 : io.sid === 'solarpunk' ? 0x7aff9a : 0x3ad0ff;
}

/** Accent band round a box-shelled block (skipped for curved outlines). 10 tris. */
function bandIfBox(io: IO, x: number, y: number, z: number, w: number, d: number, color: number, mat: MatId = Mat.Glow): void {
  if (io.lk.shell !== 'box' || !fits(io, 10)) return;
  io.b.box(w + 0.014, 0.022, d + 0.014, { color, mat, ...NP, x, z, y });
}

// ═══════════════════════════════════════════════════════════════ clean fab

export const cleanFab = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 41) ? 1 : -1;
  lot(io, 'paved', mix(lk.yard, 0xffffff, 0.18));
  const w = byL(L, [0.7, 0.78, 0.84, 0.9, 0.96]), d = byL(L, [0.42, 0.46, 0.5, 0.52, 0.54]);
  const fl = byL(L, [1, 2, 2, 3, 3]);
  const x0 = -0.1 * s, z0 = -0.22;
  io.reserve = 170;
  const top = block(io, { x: x0, z: z0, w, d, h: storeys(fl), use: 'lab', color: techWall(io), bare: true });
  bandIfBox(io, x0, top - 0.07, z0, w, d, techGlow(io));
  if (io.lk.shell !== 'pod') lobby(io, x0 + s * w * 0.15, z0 + d / 2, w * 0.4);
  io.reserve = 120;
  // the fab's signature roof: rows of exhaust fans + scrubber stacks
  const flatTop = io.lk.shell !== 'pod';
  if (flatTop) fanDeck(io, x0, top, z0 - 0.02, w * 0.78, d * 0.66, byL(L, [3, 3, 4, 4, 5]), 2);
  io.reserve = 90;
  const ns = byL(L, [1, 1, 2, 2, 2]);
  for (let i = 0; i < ns; i++) stack(io, x0 - s * (w / 2 - 0.1 - i * 0.14), z0 - d / 2 + 0.08, 0.035, byL(L, [0.4, 0.5, 0.6, 0.7, 0.8]), flatTop ? top : G);
  // utility yard: bulk-gas tanks piped into the fab
  io.reserve = 40;
  const tx = s * 0.62;
  const nt = byL(L, [1, 2, 2, 3, 3]);
  for (let i = 0; i < nt; i++) if (i === 0 || fits(io, 66)) tank(io, tx, -0.4 + i * 0.2, 0.075, byL(L, [0.2, 0.22, 0.26, 0.3, 0.32]), io.sid === 'classic' ? 0xe8eef2 : undefined);
  if (fits(io, 40)) pipeRack(b, tx - s * 0.1, -0.42, tx - s * 0.1, 0.1, 0.14, [lk.pipes[0], lk.pipes[1]], lk.metal);
  io.reserve = 0;
  sign(io, x0 - s * w * 0.18, G + 0.05, z0 + d / 2 + 0.012, 0.3, 0.06, 4, techGlow(io));
  carPark(io, -0.12 * s, 0.5, 0.5, byL(L, [2, 3, 3, 4, 4]));
  tree(io, -0.62 * s, 0.24, 0.8);
  opt(io, 12, () => lampPost(b, 0.4 * s, 0.62, 0.22, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ robotics plant

export const roboticsPlant = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 42) ? 1 : -1;
  lot(io, 'paved', mix(lk.asphalt, lk.yard, 0.5));
  const w = byL(L, [0.74, 0.82, 0.9, 0.96, 1.0]), d = 0.44;
  const hx = -0.06 * s, hz = -0.26;
  const armCol = io.sid === 'cyber' ? 0xff2fd0 : io.sid === 'neo' || io.sid === 'ice' ? 0xf4f6fa : io.sid === 'crystal' ? 0xb89aff : io.sid === 'organic' ? 0xe6d0c0 : 0xf0a020;
  io.reserve = 200;
  const top = hall(io, { x: hx, z: hz, w, d, h: byL(L, [0.32, 0.36, 0.4, 0.44, 0.46]), doors: 2, color: techWall(io) });
  io.reserve = 150;
  // office & control annex with the logo
  if (L >= 2) {
    const ax = hx + s * (w / 2 - 0.14), az = hz + d / 2 + 0.1;
    const at = block(io, { x: ax, z: az, w: 0.26, d: 0.18, h: storeys(byL(L, [1, 2, 2, 3, 3])), use: 'lab', color: p.wall2 });
    if (fits(io, 30)) sign(io, ax, at + 0.01, az + 0.07, 0.2, 0.05, 3, techGlow(io));
  }
  io.reserve = 90;
  // forecourt robot arms, the bigger the level the bigger the showpiece
  robotArm(io, -0.4 * s, 0.34, byL(L, [0.9, 1.0, 1.15, 1.3, 1.45]), (io.seed % 7) / 7, s * 0.6, armCol);
  io.reserve = 40;
  if (L >= 3) robotArm(io, 0.08 * s, 0.4, 0.8, ((io.seed >> 3) % 7) / 7, -s * 0.9, armCol);
  // test cage with a walking mech (L3+)
  if (L >= 3 && fits(io, 60)) {
    const cx = 0.48 * s, cz = 0.42;
    for (const dz of [-0.12, 0.12]) fence(b, cx, cz + dz, 0.26, lk.metal, 0.08);
    b.group({ x: cx, z: cz, y: G }, () => {
      for (const sx of [-1, 1]) b.box(0.025, 0.1, 0.03, { color: 0x3a3e46, ...DET, x: sx * 0.035 });
      b.box(0.1, 0.06, 0.07, { color: armCol, ...DET, y: 0.1 });
      b.box(0.04, 0.025, 0.02, { color: techGlow(io), mat: Mat.Glow, ...DET, y: 0.13, z: 0.04 });
    });
  }
  io.reserve = 0;
  if (top.flat) roofGear2(io, hx, top.y, hz, w, d);
  // automated guided vehicles shuttling parts
  for (let i = 0; i < byL(L, [1, 2, 2, 3, 3]); i++)
    opt(io, 20, () => {
      b.box(0.07, 0.02, 0.1, { color: 0x30343c, ...DET, x: (-0.1 + i * 0.12) * s, z: 0.16 + (i % 2) * 0.06, y: G + 0.004 });
      b.box(0.05, 0.004, 0.08, { color: techGlow(io), mat: Mat.Glow, ...DET, x: (-0.1 + i * 0.12) * s, z: 0.16 + (i % 2) * 0.06, y: G + 0.024 });
    });
  opt(io, 30, () => truck(b, 0.6 * s, 0.12, Math.PI, 0xe8e8e0, p.cargo));
  tree(io, -0.64 * s, -0.04, 0.8);
});

/** Light rooftop plant for tech halls (fans + one AC unit). */
function roofGear2(io: IO, x: number, y: number, z: number, w: number, d: number): void {
  fanDeck(io, x, y, z, w * 0.6, d * 0.5, 3, 1);
}

// ═══════════════════════════════════════════════════════════════ nano-forge

export const nanoForge = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 43) ? 1 : -1;
  lot(io, 'paved', mix(lk.yard, 0x000000, 0.06));
  const glow = techGlow(io);
  const vx = 0.0, vz = -0.18;
  const vh = byL(L, [0.4, 0.5, 0.62, 0.76, 0.9]);
  const r = byL(L, [0.16, 0.17, 0.19, 0.2, 0.21]);
  io.reserve = 150;
  // plinth, containment vessel, glowing bands, glass cupola over a molten core
  b.cyl(r * 1.6, r * 1.7, 0.05, { color: shade(techWall(io), 0.85), seg: 8, ...NP, x: vx, z: vz, y: G });
  b.cyl(r, r * 1.08, vh, { color: techWall(io), seg: 8, x: vx, z: vz, y: G + 0.05 });
  const nb = byL(L, [1, 2, 2, 3, 3]);
  for (let i = 0; i < nb; i++) b.cyl(r * 1.05, r * 1.06, 0.03, { color: glow, mat: Mat.Glow, ...NP, seg: 8, capTop: false, x: vx, z: vz, y: G + 0.05 + vh * (0.25 + i * 0.25) });
  const cy = G + 0.05 + vh;
  b.sphere(r * 0.62, { color: 0xffa040, mat: Mat.Lava, ...NP, wSeg: 6, hSeg: 3, x: vx, z: vz, y: cy + r * 0.12 });
  b.dome(r * 0.92, { color: mix(p.glass, 0xffffff, 0.35), mat: Mat.Glass, ...NP, wSeg: 8, hSeg: 2, x: vx, z: vz, y: cy, h: r * 0.8 });
  io.reserve = 110;
  // twin process halls linked to the vessel by glowing conduits
  for (const side of [-1, 1]) {
    const hx = side * 0.52, hz = -0.12;
    const t = hall(io, { x: hx, z: hz, w: 0.3, d: 0.44, h: byL(L, [0.24, 0.26, 0.3, 0.34, 0.36]), doors: 1, color: techWall(io) });
    if (fits(io, 12)) beam(b, [hx - side * 0.15, G + 0.16, hz], [vx + side * r, G + 0.2, vz], 0.03, { color: glow, mat: Mat.Glow, ...NP });
    void t;
  }
  io.reserve = 60;
  // magnetic pylons (L4+) and a floating halo (L5)
  if (L >= 4 && fits(io, 70)) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      const px = vx + Math.sin(a) * r * 1.9, pz = vz + Math.cos(a) * r * 1.9;
      b.box(0.03, vh * 0.8, 0.03, { color: shade(lk.metal, 0.9), ...NP, x: px, z: pz, y: G + 0.05 });
      b.box(0.04, 0.04, 0.04, { color: glow, mat: Mat.Glow, ...NP, x: px, z: pz, y: G + 0.05 + vh * 0.8 });
    }
  }
  if (L >= 5 && fits(io, 64)) b.torus(r * 1.15, 0.018, { color: glow, mat: Mat.Glow, ...NP, seg: 10, tube: 3, x: vx, z: vz, y: cy + r * 1.1 });
  io.reserve = 0;
  coolingTower(io, 0.5 * s, -0.56 + 0.04, 0.09, byL(L, [0.22, 0.26, 0.3, 0.34, 0.38]));
  sign(io, 0, G + 0.02, 0.34, 0.34, 0.06, 4, glow);
  apron(io, 0, 0.12, 0.3, mix(lk.yard, 0xffffff, 0.1));
  opt(io, 30, () => truck(b, -0.44 * s, 0.5, 0, 0x30343c, glow));
  tree(io, 0.6 * s, 0.4, 0.8);
  opt(io, 12, () => lampPost(b, -0.62 * s, 0.24, 0.22, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ server farm

export const serverFarm = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 44) ? 1 : -1;
  lot(io, 'paved', mix(lk.asphalt, 0x000000, 0.12));
  const led = io.lk.glowy ? io.p.glow : io.sid === 'mars' ? 0xffa040 : 0x3ad0ff;
  const led2 = io.sid === 'cyber' ? 0xff2fd0 : 0x50ff90;
  const rows = byL(L, [1, 2, 2, 3, 3]);
  const fl = byL(L, [1, 1, 2, 2, 3]);
  const w = byL(L, [0.84, 0.92, 1.0, 1.06, 1.1]);
  const hallCol = io.sid === 'cyber' ? 0x22252e : shade(techWall(io), io.sid === 'classic' ? 0.9 : 0.78);
  const zs = [-0.48, -0.22, 0.04];
  io.reserve = 60 + rows * 30;
  for (let i = 0; i < rows; i++) {
    const z = zs[3 - rows + i];
    const ww = w - (i === 0 && rows === 3 ? 0.14 : 0);
    const h = storeys(fl) - 0.02;
    b.box(ww, h, 0.2, { color: hallCol, x: 0, z, y: G, top: shade(hallCol, 0.85) });
    ledRack(io, 0, z + 0.1, ww * 0.9, G + 0.03, h - 0.07, byL(L, [6, 7, 8, 9, 10]), led, led2);
    io.reserve -= 30;
    fanDeck(io, 0, G + h, z, ww * 0.86, 0.14, byL(L, [3, 4, 4, 5, 5]), 1, io.sid === 'cyber' ? 0x3a3f4e : 0xd8dce0);
  }
  io.reserve = 40;
  // dry coolers / cooling towers on the flank (L3+), a dish (L2+)
  if (L >= 3) coolingTower(io, -0.62 * s, -0.16, 0.08, byL(L, [0, 0, 0.24, 0.28, 0.32]));
  if (L >= 2 && fits(io, 40)) dish(io, 0.58 * s, G, 0.32, byL(L, [0, 0.09, 0.1, 0.11, 0.12]), s * 0.8);
  io.reserve = 0;
  // backup generators + fuel tank, security fence
  for (let i = 0; i < byL(L, [1, 1, 2, 2, 3]); i++) opt(io, 10, () => b.box(0.1, 0.07, 0.16, { color: io.sid === 'cyber' ? 0x3a3f4e : 0xe8e4d8, ...NP, x: (-0.42 + i * 0.13) * s, z: 0.4, y: G, top: 0x9aa0a8 }));
  opt(io, 40, () => tank(io, 0.3 * s, 0.42, 0.06, 0.12, io.sid === 'classic' ? 0xd8d4cc : undefined));
  opt(io, 10, () => fence(b, 0, 0.62, 1.0, io.sid === 'cyber' ? 0x5a5f6e : 0x8a8f96, 0.06));
  opt(io, 12, () => lampPost(b, 0.62 * s, 0.1, 0.22, p.lamp));
  tree(io, -0.66 * s, 0.24, 0.7);
});

// ═══════════════════════════════════════════════════════════════ drone logistics hub

export const droneHub = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 45) ? 1 : -1;
  lot(io, 'paved');
  const w = 0.74, d = 0.5, x0 = -0.1 * s, z0 = -0.2;
  const fl = byL(L, [1, 2, 3, 4, 5]);
  io.reserve = 190;
  const top = block(io, { x: x0, z: z0, w, d, h: storeys(fl), use: 'ind', color: techWall(io), bare: true });
  bandIfBox(io, x0, top - 0.06, z0, w, d, techGlow(io));
  // loading bays + parcel locker wall on the street face
  if (io.lk.shell !== 'pod') b.panel(w * 0.5, 0.12, { color: mix(p.accent, 0x30343c, 0.3), mat: Mat.WindowSmall, ...NP, x: x0 + s * w * 0.18, z: z0 + d / 2 + 0.004, y: G });
  io.reserve = 130;
  // roof landing pads with parked & arriving drones
  const np = byL(L, [1, 2, 2, 3, 3]);
  const spots: [number, number][] = [[-0.2, -0.08], [0.18, 0.06], [0.0, -0.12]];
  for (let i = 0; i < np; i++) pad(io, x0 + spots[i][0] * s, top + 0.005, z0 + spots[i][1], 0.1, i !== 1);
  io.reserve = 70;
  // control tower (L3+): stem, glazed cab, beacon
  if (L >= 3) {
    const cx = x0 + s * (w / 2 - 0.08), cz = z0 - d / 2 + 0.08;
    const ch = byL(L, [0, 0, 0.3, 0.4, 0.5]);
    b.cyl(0.035, 0.045, ch, { color: techWall(io), seg: 6, ...NP, x: cx, z: cz, y: top });
    b.cyl(0.075, 0.06, 0.07, { color: mix(p.glass, 0xffffff, 0.2), mat: Mat.Glass, ...NP, seg: 6, x: cx, z: cz, y: top + ch, top: p.trim });
    beacon(b, cx, top + ch + 0.08, cz, 0.026);
  }
  io.reserve = 20;
  // drone tree (L4+): a mast with cantilevered pads at three heights
  if (L >= 4 && fits(io, 110)) {
    const mx = 0.52 * s, mz = 0.3, mh = byL(L, [0, 0, 0, 0.8, 1.0]);
    b.cyl(0.018, 0.026, mh, { color: lk.metal, seg: 5, ...NP, x: mx, z: mz, y: G });
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + 0.4;
      const py = G + mh * (0.45 + k * 0.25);
      const px = mx + Math.sin(a) * 0.08, pz = mz + Math.cos(a) * 0.08;
      if (fits(io, 30)) {
        b.box(0.016, 0.016, 0.1, { color: lk.metal, ...NP, x: mx + Math.sin(a) * 0.04, z: mz + Math.cos(a) * 0.04, y: py - 0.02, ry: a });
        pad(io, px, py - 0.02, pz, 0.06, k !== 1);
      }
    }
  }
  io.reserve = 0;
  // drones in flight
  const nd = byL(L, [2, 3, 3, 4, 5]);
  for (let i = 0; i < nd; i++) {
    const a = io.seed * 0.1 + i * 2.3;
    opt(io, 20, () => drone(b, Math.sin(a) * 0.5, top + 0.2 + i * 0.12, z0 + Math.cos(a) * 0.4, io.sid === 'cyber' ? 0x2a2e38 : 0xe8e8e0, i % 2 ? techGlow(io) : 0xff5a3a));
  }
  opt(io, 30, () => truck(b, -0.4 * s, 0.5, 0, techWall(io), p.accent));
  opt(io, 30, () => truck(b, -0.18 * s, 0.56, 0.1, techWall(io), p.accent2));
  sign(io, x0 - s * w * 0.22, G + 0.04, z0 + d / 2 + 0.012, 0.22, 0.05, 3, techGlow(io));
  opt(io, 12, () => lampPost(b, 0.24 * s, 0.62, 0.22, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ quantum lab

export const quantumLab = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 46) ? 1 : -1;
  lot(io, 'green');
  const glow = techGlow(io);
  const cz = -0.12, R = byL(L, [0.46, 0.5, 0.54, 0.56, 0.58]);
  io.reserve = 180;
  // the collider ring: a buried tunnel berm with a glowing beamline on top
  b.torus(R, 0.04, { color: shade(techWall(io), 0.9), ...NP, seg: 14, tube: 3, x: 0, z: cz, y: G });
  io.reserve = 150;
  if (fits(io, 30)) b.cyl(R, R, 0.008, { color: glow, mat: Mat.Glow, ...NP, seg: 14, capTop: false, x: 0, z: cz, y: G + 0.036 });
  // central lab
  const fl = byL(L, [1, 2, 2, 3, 3]);
  const top = block(io, { x: -0.06 * s, z: cz - 0.02, w: 0.4, d: 0.3, h: storeys(fl), use: 'lab', color: techWall(io) });
  io.reserve = 90;
  // the cryostat: a tall drum topped by the famous golden chandelier and a qubit core
  const qx = 0.22 * s, qz = cz + 0.08;
  const qh = byL(L, [0.3, 0.36, 0.44, 0.5, 0.56]);
  b.cyl(0.075, 0.08, qh, { color: io.sid === 'cyber' ? 0x3a3f4e : 0xe8eef4, seg: 8, x: qx, z: qz, y: G, top: shade(lk.metal, 0.9) });
  const gold = io.sid === 'crystal' ? 0xffd0ff : io.sid === 'cyber' ? 0xffd040 : 0xe8b84a;
  for (let k = 0; k < byL(L, [2, 2, 3, 3, 4]); k++) {
    if (!fits(io, 20)) break;
    b.cyl(0.06 - k * 0.01, 0.06 - k * 0.01, 0.014, { color: gold, mat: Mat.Metal, ...NP, seg: 6, x: qx, z: qz, y: G + qh + 0.02 + k * 0.05 });
  }
  if (L >= 4 && fits(io, 40)) b.sphere(0.035, { color: glow, mat: Mat.Glow, ...NP, wSeg: 6, hSeg: 3, x: qx, z: qz, y: G + qh + 0.26 });
  io.reserve = 40;
  // cryogen tanks outside the ring
  tank(io, -0.66 * s, -0.36, 0.07, 0.2, io.sid === 'classic' ? 0xe8eef2 : undefined);
  if (L >= 4) tank(io, -0.56 * s, -0.58, 0.06, 0.18, io.sid === 'classic' ? 0xe8eef2 : undefined);
  io.reserve = 0;
  if (fits(io, 30)) sign(io, -0.06 * s, top - 0.13, cz + 0.13 + 0.006, 0.26, 0.06, 3, glow);
  apron(io, 0, 0.44, 0.16, mix(lk.yard, 0xffffff, 0.1));
  tree(io, 0.48 * s, 0.56, 0.8);
  tree(io, -0.44 * s, 0.58, 0.9);
  opt(io, 12, () => lampPost(b, 0.16 * s, 0.66, 0.2, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ biotech campus

export const biotechCampus = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 47) ? 1 : -1;
  lot(io, 'green');
  const glow = techGlow(io);
  io.reserve = 200;
  const ax = -0.26 * s, az = -0.34, bx = 0.36 * s, bz = -0.08;
  const ta = block(io, { x: ax, z: az, w: 0.56, d: 0.3, h: storeys(byL(L, [2, 2, 3, 4, 5])), use: 'lab', color: techWall(io) });
  io.reserve = 150;
  const tb = block(io, { x: bx, z: bz, w: 0.32, d: 0.5, h: storeys(byL(L, [1, 2, 2, 3, 4])), use: 'lab', color: mix(techWall(io), p.wall2, 0.4) });
  bandIfBox(io, ax, ta - 0.08, az, 0.56, 0.3, glow, Mat.Light);
  io.reserve = 110;
  // glass atrium greenhouse in the courtyard
  dome(io, -0.12 * s, 0.12, byL(L, [0.14, 0.16, 0.17, 0.18, 0.19]), byL(L, [0.12, 0.14, 0.15, 0.16, 0.17]), true, 8);
  io.reserve = 60;
  // DNA helix sculpture by the road: rungs twisting up a glowing spine
  const hx = 0.24 * s, hz = 0.44;
  const rungs = byL(L, [4, 5, 6, 7, 8]);
  b.box(0.012, rungs * 0.05 + 0.04, 0.012, { color: glow, mat: Mat.Glow, ...NP, x: hx, z: hz, y: G });
  for (let k = 0; k < rungs; k++) {
    if (!fits(io, 10)) break;
    b.box(0.13, 0.016, 0.016, { color: k % 2 ? p.accent : p.accent2, ...NP, x: hx, z: hz, y: G + 0.04 + k * 0.05, ry: k * 0.55 });
  }
  io.reserve = 20;
  // bioreactor vats
  if (L >= 3) tank(io, 0.62 * s, -0.42, 0.07, 0.18);
  io.reserve = 0;
  sign(io, ax, G + 0.05, az + 0.15 + 0.012, 0.3, 0.06, 4, glow);
  carPark(io, -0.36 * s, 0.5, 0.36, 3);
  tree(io, -0.66 * s, 0.1, 0.9);
  tree(io, 0.58 * s, 0.32, 0.8);
  void tb;
});
