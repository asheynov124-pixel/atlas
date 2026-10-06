/**
 * zoned-io · Mining growables (zone IM) (OWNER: zoned-io).
 *
 *   open-pit quarry · ore crusher · mine headframe · deep-core drill rig · slag heaps · ore refinery
 *
 * Heavy, dusty and proudly ugly-beautiful: terraced pits (a flat-shaded lathe), lattice derricks and headframes,
 * conveyor galleries to stockpiles in the look's ore colours, molten slag that glows day and night. The style
 * still re-skins sheds, tanks, stacks, frames and the ore itself (Martian rust, prismatic gems, bio-mineral).
 */
import { Mat, mix, shade } from '../../../kit';
import { DET, G, NP, beam, byL, conveyor, heap, lampPost, lattice, pipeRack, polyTop, ngon, storeys, truck } from './common';
import { factory, fits, flip, type IO } from './look';
import { block, hall, lot, opt, roofGear, stack, tank, tree } from './parts';

/** Haul truck with a tipped bed (detail). */
function haulTruck(io: IO, x: number, z: number, ry: number, bed: number, y = G): void {
  const { b } = io;
  if (io.lo || !fits(io, 30)) return;
  b.group({ x, z, y: y + 0.012, ry }, () => {
    b.box(0.08, 0.06, 0.07, { color: io.sid === 'cyber' ? 0x3a3f4e : 0xf0b020, ...DET, z: 0.08 });
    b.box(0.1, 0.05, 0.13, { color: shade(bed, 0.8), ...DET, z: -0.03, y: 0.02, rx: -0.15 });
    b.box(0.08, 0.03, 0.1, { color: bed, ...DET, z: -0.035, y: 0.055, rx: -0.15 });
  });
}

/** Excavator: tracks, cab, boom, stick and bucket (detail). */
function excavator(io: IO, x: number, z: number, ry: number, y = G): void {
  const { b } = io;
  if (io.lo || !fits(io, 50)) return;
  const col = io.sid === 'cyber' ? 0xff2fd0 : io.sid === 'neo' ? 0xf4f6fa : io.sid === 'crystal' ? 0x8a6ae0 : 0xf0b020;
  b.group({ x, z, y, ry }, () => {
    b.box(0.1, 0.03, 0.12, { color: 0x30343c, ...DET });
    b.box(0.08, 0.05, 0.08, { color: col, ...DET, y: 0.03 });
    beam(b, [0, 0.07, 0.03], [0, 0.16, 0.13], 0.025, { color: col, ...DET });
    beam(b, [0, 0.16, 0.13], [0, 0.06, 0.2], 0.02, { color: col, ...DET });
    b.box(0.05, 0.035, 0.04, { color: 0x50545c, ...DET, y: 0.03, z: 0.21 });
  });
}

/** Ore colour with style flavour. */
function oreOf(io: IO, k = 0): number {
  return io.lk.ore[(io.seed + k) % io.lk.ore.length];
}

/** Gem / crystal ore glows in the crystal look, smoulders elsewhere at high levels. */
function oreMat(io: IO): number {
  return io.sid === 'crystal' ? Mat.Glow : Mat.Plain;
}

// ═══════════════════════════════════════════════════════════════ open-pit quarry

export const quarry = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 21) ? 1 : -1;
  lot(io, 'soil', mix(lk.soil, oreOf(io), 0.35));
  const steps = byL(L, [2, 2, 3, 3, 3]);
  const R0 = byL(L, [0.5, 0.56, 0.62, 0.66, 0.68]);
  const cz = -0.1;
  const stepH = 0.055, ledge = (R0 - 0.16) / (steps + 0.5);
  const H = stepH * steps + 0.02;
  // terraced pit: outer berm → rim → stepped walls down to the floor (outer → inner keeps normals facing in)
  const prof: [number, number][] = [[R0, 0], [R0 - 0.05, H], [R0 - 0.08, H]];
  let r = R0 - 0.08, y = H;
  for (let i = 0; i < steps; i++) {
    y -= stepH;
    prof.push([r, y]);
    r -= ledge;
    prof.push([r, y]);
  }
  const pitCol = mix(lk.soil, oreOf(io), 0.55);
  io.reserve = 60;
  b.lathe(prof, { color: pitCol, seg: 9, flat: true, x: 0, z: cz, y: G });
  polyTop(b, ngon(9, r + 0.01), { color: shade(pitCol, 0.62), ...NP, x: 0, z: cz, y: G + y + 0.001 });
  // ore seam glints in the crystal look
  if (io.sid === 'crystal' && fits(io, 16)) for (let k = 0; k < 2; k++) b.cone(0.03, 0.1, { color: p.glow, mat: Mat.Glow, ...NP, seg: 4, flat: true, x: (k ? 0.12 : -0.16) * s, z: cz - 0.05 + k * 0.1, y: G + y });
  io.reserve = 40;
  excavator(io, -0.08 * s, cz + 0.04, 0.6 * s, G + y);
  haulTruck(io, 0.14 * s, cz - 0.12, -0.8 * s, oreOf(io, 1), G + y);
  io.reserve = 0;
  // conveyor out of the pit to a stockpile by the road (L2+), site office
  if (L >= 2 && fits(io, 45)) {
    conveyor(b, [0.06 * s, G + y + 0.02, cz + 0.06], [0.4 * s, G + 0.26, 0.5], 0.045, lk.metal);
    heap(b, 0.5 * s, 0.58, 0.14, 0.16, oreOf(io, 2));
  }
  if (fits(io, 40)) block(io, { x: -0.44 * s, z: 0.6, w: 0.22, d: 0.14, h: storeys(1), use: 'ind', color: p.wall });
  if (L >= 3) haulTruck(io, -0.1 * s, 0.62, 0.3, oreOf(io, 1));
  opt(io, 12, () => lampPost(b, 0.66 * s, 0.1, 0.24, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ ore crusher

export const crusher = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 22) ? 1 : -1;
  lot(io, 'soil');
  const hx = -0.3 * s, hz = -0.22;
  const fl = byL(L, [2, 3, 3, 4, 5]);
  io.reserve = 150;
  const top = block(io, { x: hx, z: hz, w: 0.36, d: 0.34, h: storeys(fl), use: 'ind', color: p.ind });
  // feed hopper on legs
  b.cyl(0.13, 0.05, 0.14, { color: lk.metal, mat: Mat.Plain, seg: 6, ...NP, x: hx + 0.02 * s, z: hz + 0.3, y: G + 0.14, top: shade(oreOf(io), 0.7) });
  b.box(0.12, 0.14, 0.12, { color: shade(lk.metal, 0.7), ...NP, x: hx + 0.02 * s, z: hz + 0.3, y: G });
  io.reserve = 60;
  // main conveyor to the coarse stockpile
  const px = 0.4 * s, pz = 0.12;
  conveyor(b, [hx + 0.16 * s, top - 0.08, hz + 0.06], [px - 0.04 * s, G + byL(L, [0.32, 0.36, 0.4, 0.44, 0.48]), pz], 0.05, lk.metal);
  heap(b, px, pz, byL(L, [0.16, 0.18, 0.2, 0.22, 0.22]), byL(L, [0.2, 0.24, 0.28, 0.32, 0.34]), oreOf(io));
  io.reserve = 20;
  if (L >= 2) {
    conveyor(b, [hx - 0.04 * s, G + 0.18, hz + 0.2], [-0.06 * s, G + 0.24, 0.5], 0.04, lk.metal);
    heap(b, 0.0, 0.56, 0.13, 0.13, shade(oreOf(io, 1), 0.85));
  }
  io.reserve = 0;
  if (L >= 3) {
    stack(io, hx - 0.14 * s, hz - 0.12, 0.035, 0.5, top);
    tank(io, 0.44 * s, -0.4, 0.1, 0.22);
  }
  if (L >= 4 && fits(io, 30)) roofGear(io, hx, top, hz, 0.3, 0.28, 2);
  haulTruck(io, hx + 0.04 * s, hz + 0.56, Math.PI, oreOf(io));
  opt(io, 12, () => lampPost(b, -0.62 * s, 0.32, 0.24, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ mine headframe

export const headframe = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 23) ? 1 : -1;
  lot(io, 'soil');
  const fx = -0.22 * s, fz = -0.18;
  const fh = byL(L, [0.8, 0.95, 1.15, 1.35, 1.6]);
  io.reserve = 170;
  let sheaveY = G + fh;
  if (L <= 4) {
    lattice(b, fx, fz, G, 0.3, 0.16, fh, byL(L, [1, 2, 2, 3, 3]), lk.steel, 0.024);
    b.box(0.22, 0.05, 0.22, { color: shade(lk.steel, 0.85), ...NP, x: fx, z: fz, y: G + fh });
    // back-leg strut toward the winding house
    beam(b, [fx + 0.3 * s, G, fz - 0.05], [fx + 0.04 * s, G + fh * 0.9, fz], 0.03, { color: lk.steel, mat: Mat.Plain, ...NP });
    sheaveY = G + fh + 0.05;
  } else {
    // modern concrete tower headframe
    const top = block(io, { x: fx, z: fz, w: 0.3, d: 0.3, h: storeys(Math.round(fh / 0.2)), use: 'ind', color: p.wall2 });
    b.box(0.34, 0.12, 0.34, { color: p.trim, ...NP, x: fx, z: fz, y: top });
    sheaveY = top + 0.12;
  }
  // sheave wheels
  for (const dz of [-0.05, 0.05]) b.cyl(0.075, 0.075, 0.02, { color: p.accent, mat: Mat.Plain, ...NP, seg: 8, x: fx + 0.01 * s, z: fz + dz, y: sheaveY + 0.075, rx: Math.PI / 2, capBottom: true });
  b.box(0.03, 0.03, 0.03, { color: 0xff2a1a, mat: Mat.Light, ...NP, x: fx, z: fz, y: sheaveY + 0.16 });
  // winding house + hoist ropes
  io.reserve = 70;
  const wx = 0.34 * s, wz = -0.3;
  const wh = hall(io, { x: wx, z: wz, w: 0.36, d: 0.3, h: byL(L, [0.26, 0.28, 0.3, 0.32, 0.34]), doors: 1, windows: true });
  if (fits(io, 24)) for (const dz of [-0.05, 0.05]) beam(b, [fx + 0.06 * s, sheaveY + 0.12, fz + dz], [wx - 0.16 * s, G + 0.22, wz + dz], 0.008, { color: 0x202226, ...NP, detail: true });
  if (wh.flat) roofGear(io, wx, wh.y, wz, 0.3, 0.24, 1);
  io.reserve = 0;
  // ore bin + load-out conveyor
  if (L >= 2 && fits(io, 60)) {
    b.cyl(0.09, 0.05, 0.16, { color: lk.metal, mat: Mat.Plain, seg: 6, ...NP, x: fx, z: fz + 0.36, y: G + 0.16 });
    b.box(0.03, 0.16, 0.03, { color: shade(lk.metal, 0.7), ...NP, x: fx, z: fz + 0.36, y: G });
    conveyor(b, [fx, G + 0.2, fz + 0.18], [fx, G + 0.3, fz + 0.34], 0.04, lk.metal);
  }
  if (L >= 3) haulTruck(io, fx + 0.2 * s, 0.4, 0.4 * s, oreOf(io));
  opt(io, 12, () => heap(b, 0.4 * s, 0.38, 0.14, 0.14, oreOf(io), true));
  opt(io, 12, () => lampPost(b, -0.62 * s, 0.34, 0.24, p.lamp));
  tree(io, 0.64 * s, 0.1, 0.7);
});

// ═══════════════════════════════════════════════════════════════ deep-core drill rig

export const drillRig = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 24) ? 1 : -1;
  lot(io, 'soil');
  const dx = -0.12 * s, dz = -0.2;
  const dh = byL(L, [0.8, 1.0, 1.3, 1.6, 2.0]);
  io.reserve = 150;
  // drill floor, derrick, crown block, beacon
  b.box(0.42, 0.07, 0.42, { color: shade(lk.metal, 0.8), ...NP, x: dx, z: dz, y: G });
  lattice(b, dx, dz, G + 0.07, byL(L, [0.28, 0.3, 0.32, 0.34, 0.36]), 0.07, dh, byL(L, [1, 2, 2, 3, 3]), lk.steel, 0.022);
  b.box(0.1, 0.06, 0.1, { color: p.accent, ...NP, x: dx, z: dz, y: G + 0.07 + dh });
  b.box(0.03, 0.03, 0.03, { color: 0xff2a1a, mat: Mat.Light, ...NP, x: dx, z: dz, y: G + 0.13 + dh });
  // doghouse + mud tanks
  io.reserve = 80;
  b.box(0.16, 0.12, 0.12, { color: p.wall, mat: Mat.WindowSmall, x: dx + 0.32 * s, z: dz + 0.14, y: G, top: p.roof });
  b.box(0.3, 0.09, 0.12, { color: lk.metal, ...NP, x: dx + 0.28 * s, z: dz - 0.16, y: G });
  // pipe rack of drill pipe lying by the road
  io.reserve = 40;
  for (let k = 0; k < 3; k++) b.cyl(0.018, 0.018, 0.5, { color: lk.pipes[k % lk.pipes.length], mat: Mat.Plain, ...NP, seg: 4, x: 0.16, z: 0.34 + k * 0.04, y: G + 0.035, rz: Math.PI / 2, capTop: false });
  if (L <= 2 && fits(io, 40)) {
    // pumpjack nodding over an old well
    const jx = 0.44 * s, jz = -0.42;
    b.box(0.03, 0.14, 0.05, { color: lk.metal, ...NP, x: jx, z: jz, y: G });
    b.box(0.26, 0.03, 0.03, { color: p.accent, ...NP, x: jx, z: jz, y: G + 0.14, rz: 0.15 });
    b.box(0.03, 0.08, 0.05, { color: p.accent, ...NP, x: jx - 0.13, z: jz, y: G + 0.1 });
  }
  io.reserve = 0;
  if (L >= 3) tank(io, 0.48 * s, -0.42, 0.1, byL(L, [0, 0, 0.2, 0.24, 0.28]));
  if (L >= 5 && fits(io, 90)) {
    // plasma bore: glowing core and energy rings climbing the derrick
    b.cyl(0.07, 0.07, 0.02, { color: 0xffa040, mat: Mat.Lava, ...NP, seg: 6, x: dx, z: dz, y: G + 0.07 });
    for (const f of [0.3, 0.55]) b.torus(0.17 - f * 0.12, 0.012, { color: p.glow, mat: Mat.Glow, ...NP, seg: 10, tube: 3, x: dx, z: dz, y: G + 0.07 + dh * f });
  }
  haulTruck(io, -0.46 * s, 0.4, 0.3, lk.pipes[0]);
  opt(io, 12, () => lampPost(b, 0.64 * s, 0.1, 0.24, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ slag heaps

export const slagHeaps = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 25) ? 1 : -1;
  lot(io, 'soil', shade(lk.soil, 0.75));
  const slag = io.sid === 'crystal' ? 0x4a3a6a : io.sid === 'mars' ? 0x5a2a1a : io.sid === 'organic' ? 0x4a3040 : 0x3a3634;
  const heaps: [number, number, number, number][] = [[-0.32, -0.34, 0.26, 0.26], [0.22, -0.4, 0.22, 0.2], [-0.5, 0.12, 0.18, 0.15], [0.1, -0.06, 0.16, 0.13]];
  const n = byL(L, [2, 3, 4, 4, 4]);
  io.reserve = 110;
  for (let i = 0; i < n; i++) {
    const [hx, hz, r, h] = heaps[i];
    b.cone(r, h * byL(L, [0.8, 0.9, 1, 1.1, 1.2]), { color: shade(slag, 1 + i * 0.08), seg: 7, flat: true, ...NP, x: hx * s, z: hz, y: G });
  }
  // the pour: a molten stream down the big heap into a glowing pool
  const [hx, hz, r, h] = heaps[0];
  const hh = h * byL(L, [0.8, 0.9, 1, 1.1, 1.2]);
  beam(b, [hx * s + 0.02 * s, G + hh * 0.85, hz + 0.03], [hx * s + 0.06 * s, G + 0.01, hz + r + 0.02], 0.03, { color: 0xff7020, mat: Mat.Lava, ...NP });
  b.cyl(0.08, 0.08, 0.008, { color: 0xff5010, mat: Mat.Lava, ...NP, seg: 6, x: hx * s + 0.08 * s, z: hz + r + 0.08, y: G });
  // slag ladle car on rails
  io.reserve = 60;
  b.plane(0.02, 0.9, { color: 0x6a6e76, ...NP, x: 0.42 * s, z: 0.0, y: G + 0.004 });
  b.plane(0.02, 0.9, { color: 0x6a6e76, ...NP, x: 0.5 * s, z: 0.0, y: G + 0.004 });
  b.box(0.12, 0.04, 0.16, { color: 0x30343c, ...NP, x: 0.46 * s, z: 0.1, y: G });
  b.cyl(0.07, 0.05, 0.09, { color: 0x4a4440, mat: Mat.Plain, ...NP, seg: 7, x: 0.46 * s, z: 0.1, y: G + 0.04, top: 0xff8030, topMat: Mat.Lava });
  // smelter shed with a glowing mouth
  io.reserve = 20;
  const top = hall(io, { x: -0.1 * s, z: 0.44, w: 0.42, d: 0.24, h: byL(L, [0.22, 0.24, 0.27, 0.3, 0.32]), doors: 0, windows: false });
  b.panel(0.12, 0.1, { color: 0xff7a30, mat: Mat.Lava, ...NP, x: -0.1 * s, z: 0.56 + 0.004, y: G });
  io.reserve = 0;
  if (L >= 2) stack(io, -0.26 * s, 0.4, 0.035, byL(L, [0.5, 0.6, 0.75, 0.85, 0.95]), top.flat ? top.y : G);
  opt(io, 12, () => lampPost(b, 0.64 * s, 0.36, 0.24, p.lamp));
  void oreMat;
});

// ═══════════════════════════════════════════════════════════════ ore refinery

export const refinery = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 26) ? 1 : -1;
  lot(io, 'yard');
  const n = byL(L, [2, 2, 3, 3, 4]);
  const cols: [number, number, number, number][] = [[-0.36, -0.32, 0.09, 1.0], [-0.1, -0.44, 0.075, 1.25], [0.14, -0.3, 0.1, 0.85], [-0.42, 0.02, 0.07, 0.7]];
  const hs = byL(L, [0.7, 0.85, 1.0, 1.15, 1.3]);
  io.reserve = 140;
  for (let i = 0; i < n; i++) {
    const [cx, cz, r, k] = cols[i];
    const ch = hs * k;
    const c = io.sid === 'cyber' ? 0x3a3f4e : io.sid === 'classic' ? 0xd8d4cc : p.wall2;
    b.cyl(r, r, ch, { color: c, mat: Mat.Plain, seg: 7, x: cx * s, z: cz, y: G, top: shade(c, 0.8) });
    b.cyl(r * 1.35, r * 1.35, 0.016, { color: lk.steel, mat: Mat.Plain, ...NP, seg: 7, x: cx * s, z: cz, y: G + ch * 0.55, capBottom: true });
    if (lk.glowy && fits(io, 16)) b.cyl(r * 1.02, r * 1.02, 0.014, { color: p.glow, mat: Mat.Glow, ...NP, seg: 7, capTop: false, x: cx * s, z: cz, y: G + ch * 0.82 });
  }
  io.reserve = 70;
  pipeRack(b, -0.5 * s, 0.24, 0.44 * s, 0.24, 0.16, [lk.pipes[0], lk.pipes[1], lk.pipes[2]], lk.metal);
  // control building + flare
  const top = block(io, { x: 0.42 * s, z: 0.46, w: 0.28, d: 0.18, h: storeys(L >= 4 ? 2 : 1), use: 'office', color: p.wall });
  if (fits(io, 30)) {
    const fh = byL(L, [0.9, 1.0, 1.2, 1.4, 1.6]);
    b.cyl(0.016, 0.026, fh, { color: lk.metal, mat: Mat.Plain, ...NP, seg: 4, x: 0.5 * s, z: -0.36, y: G });
    b.cone(0.03, 0.11, { color: 0xffa040, mat: Mat.Lava, ...NP, seg: 4, x: 0.5 * s, z: -0.36, y: G + fh });
  }
  io.reserve = 0;
  if (L >= 4 && fits(io, 64)) tank(io, 0.36 * s, -0.04, 0.11, 0.24);
  if (L >= 4 && fits(io, 30)) roofGear(io, 0.42 * s, top, 0.46, 0.22, 0.14, 1);
  haulTruck(io, -0.2 * s, 0.56, 0, oreOf(io));
  opt(io, 12, () => lampPost(b, -0.64 * s, 0.32, 0.24, p.lamp));
});
