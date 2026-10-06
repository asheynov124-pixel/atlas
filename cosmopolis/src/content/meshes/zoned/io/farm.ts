/**
 * zoned-io · Hydroponics & farm growables (zone IF) (OWNER: zoned-io).
 *
 *   crop fields · greenhouse range · homestead barn · algae vats · hydroponic spire · vertical farm ·
 *   livestock domes · bio-orchard
 *
 * Fields are striped ridges of the look's crop colours, greenhouses and domes use the look's glass, and farm
 * buildings borrow the style's hall grammar with a pitched roof where the style has one. Grow lights and algae
 * tubes are Mat.Light: green / magenta by day, glowing after dark.
 */
import { Mat, mix, shade } from '../../../kit';
import { DET, G, LOT, NP, bale, beam, byL, critter, drone, fence, lampPost, storeys, truck, vaultX } from './common';
import { factory, fits, flip, type IO } from './look';
import { block, crown, dome, hall, lot, opt, ring, sign, stack, tank, tower, tree } from './parts';

/** Half-width of the lot hexagon at depth z (vertices at x = ±LOT). */
function halfWidth(z: number): number {
  return Math.max(0, LOT * 0.96 - Math.abs(z) * 0.5774);
}

/**
 * Striped crop field between z0 and z1: raised ridges (boxes) alternating with soil furrows.
 * `patch` splits rows into two crops left/right. Cost ≈ 10 per ridge.
 */
function field(io: IO, z0: number, z1: number, rows: number, crops: number[], patch: boolean, inset = 0.06): void {
  const { b } = io;
  const pitch = (z1 - z0) / rows;
  for (let i = 0; i < rows; i++) {
    const z = z0 + pitch * (i + 0.5);
    const hw = Math.min(halfWidth(z - pitch * 0.4), halfWidth(z + pitch * 0.4)) - inset;
    if (hw < 0.1) continue;
    const c = crops[i % crops.length];
    const hgt = 0.02 + ((io.seed >> i) & 1) * 0.008;
    if (patch && hw > 0.3) {
      const c2 = crops[(i + 2) % crops.length];
      b.box(hw - 0.02, hgt, pitch * 0.62, { color: c, ...NP, x: -hw / 2 - 0.01, z, y: G, top: shade(c, 1.08) });
      b.box(hw - 0.02, hgt * 1.3, pitch * 0.62, { color: c2, ...NP, x: hw / 2 + 0.01, z, y: G, top: shade(c2, 1.08) });
    } else b.box(hw * 2, hgt, pitch * 0.62, { color: c, ...NP, z, y: G, top: shade(c, 1.08) });
  }
}

/** Grain / feed silo in the style: cylinder with a cap (cone, dome or bulb). ~30–45 tris. */
function silo(io: IO, x: number, z: number, r: number, h: number): void {
  const { b, lk, p } = io;
  const col = io.sid === 'classic' ? 0xd8d4cc : io.sid === 'cyber' ? 0x3a3f4e : io.sid === 'solarpunk' ? 0xc9a070 : p.wall2;
  if (lk.shell === 'facet') {
    b.prism(6, r, h, { color: col, x, z, y: G });
    b.cyl(0, r * 1.05, r * 1.1, { color: mix(col, p.glow, 0.4), seg: 6, flat: true, ...NP, x, z, y: G + h });
    return;
  }
  b.cyl(r, r, h, { color: col, seg: 7, x, z, y: G, capTop: false });
  if (lk.shell === 'box' && io.sid !== 'cyber') b.cone(r * 1.05, r * 0.8, { color: io.sid === 'classic' ? 0x9aa2ac : p.roof, mat: Mat.Metal, seg: 7, ...NP, x, z, y: G + h });
  else b.dome(r, { color: io.sid === 'cyber' ? 0x2a2e38 : mix(col, 0xffffff, 0.3), wSeg: 7, hSeg: 2, x, z, y: G + h, h: r * 0.8 });
  if (io.lk.glowy && fits(io, 14)) b.cyl(r * 1.02, r * 1.02, 0.012, { color: p.glow, mat: Mat.Glow, ...NP, seg: 7, capTop: false, x, z, y: G + h * 0.75 });
}

/** Barn colour: the classic red barn, style walls elsewhere. */
function barnColor(io: IO): number {
  return io.sid === 'classic' ? [0xa8382c, 0x9a3a2a, 0x8a4a3a][io.seed % 3] : io.sid === 'solarpunk' ? 0xb07a4a : io.p.wall;
}

/** Hovering agri-drone with a light bar. */
function agriDrone(io: IO, x: number, y: number, z: number): void {
  if (fits(io, 24)) drone(io.b, x, y, z, io.sid === 'cyber' ? 0x2a2e38 : 0xe8e8e0, io.lk.glowy ? io.p.glow : 0x7aff7a);
}

/** Glass greenhouse along X: gable (box looks), vault (round looks) or pod (organic). ~20–40 tris. */
function glasshouse(io: IO, x: number, z: number, w: number, d: number, h: number): void {
  const { b, lk } = io;
  const gl = mix(lk.houseGlass, lk.green, 0.18);
  b.box(w, 0.05, d, { color: io.p.trim, ...NP, x, z, y: G });
  if (lk.shell === 'round') {
    vaultX(b, w, d, h, { color: gl, mat: Mat.Glass, ...NP, x, z, y: G + 0.05, seg: 6 });
  } else if (lk.shell === 'pod') {
    b.dome(0.5, { color: gl, mat: Mat.Glass, ...NP, wSeg: 8, hSeg: 2, sx: w, sz: d, h: h + 0.04, x, z, y: G + 0.04 });
  } else {
    b.box(w, h * 0.45, d, { color: gl, mat: Mat.Glass, ...NP, x, z, y: G + 0.05 });
    b.gable(w, h * (lk.shell === 'facet' ? 0.9 : 0.55), d, { color: gl, mat: Mat.Glass, ...NP, x, z, y: G + 0.05 + h * 0.45, overhang: 0.005 });
    if (lk.glowy && fits(io, 12)) b.box(w + 0.01, 0.012, 0.012, { color: io.p.glow, mat: Mat.Glow, ...NP, x, z, y: G + 0.05 + h * (lk.shell === 'facet' ? 1.35 : 1.0) - 0.006 });
  }
}

/** Little wind turbine: mast + three blades + nacelle (~45 tris). */
function turbine(io: IO, x: number, y: number, z: number, h: number): void {
  const { b } = io;
  if (!fits(io, 50)) return;
  const col = io.sid === 'cyber' ? 0x5a5f6e : io.sid === 'mars' ? 0xf2e6d0 : 0xf4f4f0;
  b.cyl(0.008, 0.016, h, { color: col, ...NP, seg: 4, x, z, y, capTop: false });
  b.box(0.03, 0.03, 0.06, { color: col, ...NP, x, z, y: y + h - 0.015 });
  b.group({ x, z: z + 0.035, y: y + h }, () => {
    for (let k = 0; k < 3; k++) b.box(0.022, h * 0.42, 0.006, { color: col, ...NP, rz: (k * Math.PI * 2) / 3 + 0.3, y: 0 });
  });
}

// ═══════════════════════════════════════════════════════════════ crop fields

export const cropField = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 11) ? 1 : -1;
  lot(io, 'soil');
  const crops = L >= 3 ? [lk.crops[0], lk.crops[1], lk.crops[2]] : [lk.crops[io.seed % 2 ? 0 : 1], shade(lk.crops[io.seed % 2 ? 0 : 1], 0.85)];
  io.reserve = 110;
  field(io, -0.74, 0.28, byL(L, [7, 8, 9, 9, 9]), crops, L >= 2);
  // homestead at the road: barn + silo
  io.reserve = 50;
  hall(io, { x: -0.36 * s, z: 0.52, w: 0.34, d: 0.2, h: 0.17, color: barnColor(io), doors: 1, windows: false, pitched: true });
  silo(io, 0.08 * s, 0.56, 0.07, byL(L, [0.26, 0.3, 0.34, 0.36, 0.38]));
  io.reserve = 0;
  if (L >= 3) silo(io, 0.24 * s, 0.56, 0.06, 0.28);
  // centre-pivot irrigation arm from L2
  if (L >= 2 && fits(io, 50)) {
    const px = 0.42 * s, pz = -0.22;
    b.cyl(0.02, 0.03, 0.12, { color: lk.metal, mat: Mat.Metal, ...NP, seg: 4, x: px, z: pz, y: G });
    beam(b, [px, G + 0.11, pz], [px - 0.78 * s, G + 0.09, pz - 0.12], 0.016, { color: lk.metal, mat: Mat.Metal, ...NP });
    for (const f of [0.35, 0.7]) b.box(0.012, 0.1, 0.03, { color: lk.metal, ...DET, x: px - 0.78 * s * f, z: pz - 0.12 * f, y: G });
  }
  agriDrone(io, -0.1 * s, G + 0.24, -0.3);
  if (L >= 3) opt(io, 30, () => truck(b, 0.44 * s, 0.5, 0, p.accent, lk.crops[0]));
  opt(io, 16, () => bale(b, -0.62 * s, 0.32, lk.crops[0]));
  tree(io, 0.64 * s, 0.34, 0.8);
});

// ═══════════════════════════════════════════════════════════════ greenhouse range

export const greenhouses = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 12) ? 1 : -1;
  lot(io, 'yard');
  io.reserve = 60;
  if (L <= 3) {
    const n = byL(L, [1, 2, 3, 3, 3]);
    const zs = [-0.44, -0.16, 0.12];
    for (let i = 0; i < n; i++) {
      const z = zs[i];
      const hw = Math.min(halfWidth(z - 0.12), halfWidth(z + 0.12)) - 0.06;
      glasshouse(io, 0, z, hw * 2, 0.22, byL(L, [0.14, 0.15, 0.17, 0.17, 0.17]));
    }
    if (L === 1) field(io, -0.24, 0.24, 3, [lk.crops[1], lk.crops[2]], false, 0.2);
  } else {
    // big glass vault with a heat-store tank and CO₂ stack
    b.box(1.18, 0.07, 0.6, { color: p.trim, ...NP, z: -0.22, y: G });
    vaultX(b, 1.18, 0.6, byL(L, [0, 0, 0, 0.32, 0.38]), { color: mix(lk.houseGlass, lk.green, 0.2), mat: Mat.Glass, ...NP, z: -0.22, y: G + 0.07, seg: 7 });
    if (fits(io, 14)) b.box(1.2, 0.016, 0.016, { color: lk.glowy ? p.glow : 0x7aff9a, mat: lk.glowy ? Mat.Glow : Mat.Light, ...NP, z: -0.22, y: G + 0.07 + byL(L, [0, 0, 0, 0.32, 0.38]) - 0.004 });
    tank(io, 0.5 * s, 0.32, 0.1, 0.24);
  }
  io.reserve = 20;
  // boiler house with a stack
  if (L >= 2) {
    block(io, { x: -0.42 * s, z: 0.46, w: 0.26, d: 0.18, h: storeys(1), use: 'ind', color: p.ind });
    stack(io, -0.52 * s, 0.38, 0.03, byL(L, [0.4, 0.45, 0.5, 0.6, 0.65]));
  }
  io.reserve = 0;
  if (L >= 3) opt(io, 30, () => truck(b, 0.1 * s, 0.56, 0, 0xe8e8e0, lk.crops[0]));
  agriDrone(io, 0.3 * s, G + 0.42, -0.1);
  opt(io, 12, () => lampPost(b, 0.62 * s, 0.32, 0.2, p.lamp));
  tree(io, -0.66 * s, 0.1, 0.8);
});

// ═══════════════════════════════════════════════════════════════ homestead barn

export const homestead = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 13) ? 1 : -1;
  lot(io, 'green');
  io.reserve = 90;
  const bw = byL(L, [0.44, 0.5, 0.56, 0.6, 0.62]);
  hall(io, { x: -0.18 * s, z: -0.2, w: bw, d: 0.36, h: byL(L, [0.2, 0.22, 0.24, 0.26, 0.28]), color: barnColor(io), doors: 1, windows: false, pitched: true });
  io.reserve = 40;
  const sn = byL(L, [1, 2, 3, 3, 3]);
  for (let i = 0; i < sn; i++) silo(io, (0.3 + i * 0.16) * s, -0.36 + i * 0.05, 0.075, byL(L, [0.34, 0.4, 0.46, 0.5, 0.52]) - i * 0.04);
  io.reserve = 0;
  // paddock with livestock and hay
  const pz = 0.32;
  if (fits(io, 40)) {
    b.plane(0.7, 0.34, { color: shade(lk.ground, 1.08), ...NP, x: 0.05 * s, z: pz, y: G + 0.002 });
    for (const zz of [pz - 0.17, pz + 0.17]) fence(b, 0.05 * s, zz, 0.7, io.sid === 'classic' ? 0xf0ece4 : p.trim, 0.04);
  }
  const cows = byL(L, [2, 3, 4, 5, 5]);
  const cowCol = io.sid === 'cyber' ? 0x8a8aa0 : io.sid === 'crystal' ? 0xe0d8ff : io.sid === 'organic' ? 0xe8c0d0 : io.sid === 'mars' ? 0xc89a7a : 0xf2f0ea;
  for (let i = 0; i < cows; i++) if (fits(io, 20)) critter(b, (-0.2 + i * 0.12) * s, pz - 0.06 + ((i * 37) % 5) * 0.03, i * 1.3, i % 2 ? cowCol : shade(cowCol, 0.55));
  for (let i = 0; i < 2; i++) opt(io, 16, () => bale(b, (0.52 - i * 0.07) * s, 0.06, lk.crops[0]));
  tree(io, -0.6 * s, 0.3, 1);
  tree(io, 0.62 * s, 0.32, 0.8);
  if (L >= 2) opt(io, 12, () => lampPost(b, -0.36 * s, 0.6, 0.2, p.lamp));
});

// ═══════════════════════════════════════════════════════════════ algae vats

const VATS: [number, number][] = [[-0.34, -0.36], [0.16, -0.42], [-0.46, 0.08], [0.02, -0.04], [0.46, -0.06]];

export const algaeVats = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 14) ? 1 : -1;
  lot(io, 'yard');
  const n = byL(L, [2, 3, 3, 4, 5]);
  const r = byL(L, [0.17, 0.18, 0.19, 0.2, 0.2]);
  const algae = io.sid === 'cyber' ? 0x40ffb0 : io.sid === 'crystal' ? 0x7ae0d0 : io.sid === 'organic' ? 0xd0ff7a : 0x5ad04a;
  io.reserve = 70;
  for (let i = 0; i < n; i++) {
    const [vx, vz] = VATS[i];
    b.cyl(r, r * 1.04, byL(L, [0.07, 0.08, 0.09, 0.1, 0.11]), { color: io.sid === 'classic' ? 0xc8c4bc : p.wall, seg: 8, x: vx * s, z: vz, y: G, top: 0x3a9a5a, topMat: Mat.Water });
    if (fits(io, 18)) b.cyl(r * 1.05, r * 1.05, 0.014, { color: algae, mat: Mat.Light, ...NP, seg: 8, capTop: false, x: vx * s, z: vz, y: G + byL(L, [0.07, 0.08, 0.09, 0.1, 0.11]) - 0.01 });
  }
  // photobioreactor tubes snaking along the front: green by day, bioluminescent at night
  io.reserve = 50;
  const tubes = byL(L, [2, 3, 3, 4, 4]);
  for (let k = 0; k < tubes; k++) {
    if (!fits(io, 12)) break;
    const z = 0.3 + k * 0.07;
    const hw = halfWidth(z) - 0.16;
    b.cyl(0.018, 0.018, hw * 2, { color: algae, mat: Mat.Light, ...NP, seg: 4, x: hw - 0.1 * s, z, y: G + 0.05, rz: Math.PI / 2, capTop: false });
  }
  io.reserve = 0;
  // processing block (from L3: with a stack)
  if (L >= 3 && fits(io, 60)) {
    block(io, { x: 0.46 * s, z: 0.36 + (L >= 4 ? -0.62 : 0), w: 0.22, d: 0.2, h: storeys(L >= 4 ? 2 : 1), use: 'lab', color: p.wall });
  }
  if (L >= 2) opt(io, 30, () => truck(b, -0.5 * s, 0.56, 0.2, 0xe8e8e0, algae));
  opt(io, 12, () => lampPost(b, 0.66 * s, 0.24, 0.2, p.lamp));
  void lk;
});

// ═══════════════════════════════════════════════════════════════ hydroponic spire

export const hydroSpire = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 15) ? 1 : -1;
  lot(io, 'green');
  const tiers = byL(L, [3, 5, 7, 10, 13]);
  const H = tiers * 0.2;
  const w = byL(L, [0.42, 0.46, 0.5, 0.54, 0.56]);
  const tz = -0.12;
  io.reserve = 120;
  const gl = mix(lk.houseGlass, lk.green, 0.3);
  const top = tower(io, { z: tz, y: G, w, d: w, h: H, color: gl, taper: 0.1 });
  // planted ledges every couple of floors
  const ledges = Math.max(1, Math.floor(tiers / 2));
  io.reserve = 90;
  for (let k = 1; k <= ledges; k++) {
    if (!fits(io, 30)) break;
    ring(io, 0, tz, w * 1.12, w * 1.12, G + k * 0.4 - 0.04, 0.04, lk.green, Mat.Foliage, true);
  }
  io.reserve = 20;
  crown(io, { z: tz, y: top, w: w * 0.9, d: w * 0.9, prestige: io.pr, tall: 0.5 });
  io.reserve = 0;
  // nutrient tank + packing shed
  tank(io, 0.48 * s, 0.32, 0.1, 0.2);
  if (fits(io, 40)) hall(io, { x: -0.36 * s, z: 0.44, w: 0.34, d: 0.2, h: 0.16, doors: 1, windows: false, pitched: true });
  agriDrone(io, 0.3 * s, G + H * 0.6, tz + 0.3);
  tree(io, 0.6 * s, -0.2, 0.9);
  tree(io, -0.62 * s, 0.0, 0.8);
});

// ═══════════════════════════════════════════════════════════════ vertical farm

export const verticalFarm = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 16) ? 1 : -1;
  lot(io, 'yard');
  const grow = io.sid === 'cyber' ? 0xff40d0 : io.sid === 'neo' ? 0xc070ff : 0xff5ad8;
  const steps = byL(L, [1, 2, 2, 3, 3]);
  const fl = byL(L, [3, 3, 4, 4, 5]);
  let y = G;
  let w = 1.0, d = 0.66;
  const z0 = -0.12;
  io.reserve = 60 + steps * 40;
  for (let k = 0; k < steps; k++) {
    const h = storeys(fl);
    const top = block(io, { x: 0, z: z0 - k * 0.06, y, w, d, h, use: 'office', color: k % 2 ? p.wall2 : p.wall, bare: true });
    io.reserve -= 40;
    // grow-light ribbon on the street face and a planted terrace on top
    b.box(w * 0.86, 0.035, 0.01, { color: grow, mat: Mat.Light, ...NP, x: 0, z: z0 - k * 0.06 + d / 2 + 0.006, y: y + h * 0.5 });
    b.box(w * 0.92, 0.035, d * 0.9, { color: lk.green, mat: Mat.Foliage, ...NP, z: z0 - k * 0.06, y: top, top: lk.green2 });
    y = top;
    w *= 0.74;
    d *= 0.8;
  }
  io.reserve = 0;
  if (L >= 4) turbine(io, 0.1 * s, y + 0.035, z0 - 0.2, 0.5);
  sign(io, -0.24 * s, G + 0.06, z0 + 0.335, 0.3, 0.07, 4, grow);
  if (fits(io, 40)) for (let i = 0; i < 2; i++) tree(io, (0.36 + i * 0.22) * s, 0.48, 0.8);
  opt(io, 30, () => truck(b, -0.3 * s, 0.56, 0, 0xe8e8e0, lk.crops[0]));
  agriDrone(io, -0.4 * s, y + 0.2, z0);
});

// ═══════════════════════════════════════════════════════════════ livestock domes

export const livestock = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 17) ? 1 : -1;
  lot(io, 'green');
  const n = byL(L, [1, 2, 2, 3, 3]);
  const spots: [number, number, number][] = n === 1 ? [[-0.12, -0.24, 0.34]] : n === 2 ? [[-0.32, -0.26, 0.28], [0.3, -0.3, 0.26]] : [[-0.36, -0.28, 0.26], [0.26, -0.36, 0.25], [-0.02, 0.1, 0.22]];
  io.reserve = 70;
  for (const [dx, dz, r] of spots) {
    if (!fits(io, 56)) break;
    dome(io, dx * s, dz, r * byL(L, [1, 0.95, 1.05, 1, 1.06]), r * byL(L, [0.85, 0.8, 0.9, 0.85, 0.95]), true);
  }
  io.reserve = 30;
  // feed silo + barn + pasture with animals
  silo(io, 0.52 * s, 0.14, 0.07, 0.34);
  if (L >= 2) hall(io, { x: -0.42 * s, z: 0.42, w: 0.3, d: 0.2, h: 0.16, color: barnColor(io), doors: 1, windows: false, pitched: true });
  io.reserve = 0;
  const cowCol = io.sid === 'cyber' ? 0x8a8aa0 : io.sid === 'mars' ? 0xc89a7a : 0xf2f0ea;
  const herd = byL(L, [3, 4, 4, 5, 5]);
  for (let i = 0; i < herd; i++) if (fits(io, 20)) critter(b, (0.06 + (i % 3) * 0.11) * s, 0.44 + Math.floor(i / 3) * 0.1, i * 1.7, i % 2 ? cowCol : 0x6a4a3a);
  opt(io, 10, () => fence(b, 0.17 * s, 0.68, 0.46, p.trim, 0.04));
  tree(io, 0.66 * s, -0.24, 0.8);
  void lk;
});

// ═══════════════════════════════════════════════════════════════ bio-orchard

export const orchard = factory((io) => {
  const { b, L, p, lk } = io;
  const s = flip(io, 18) ? 1 : -1;
  lot(io, 'green', shade(lk.ground, 0.9));
  io.reserve = 50;
  hall(io, { x: 0.36 * s, z: 0.44, w: 0.34, d: 0.2, h: 0.17, doors: 1, windows: false, pitched: true });
  io.reserve = 0;
  const rows = byL(L, [2, 3, 3, 3, 3]), cols = byL(L, [3, 3, 4, 4, 4]);
  const sc = byL(L, [0.85, 0.95, 1.05, 1.1, 1.15]);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = (-0.48 + c * (0.96 / Math.max(1, cols - 1))) * (cols > 1 ? 1 : 0);
      const z = -0.5 + r * 0.25;
      if (Math.hypot(x, z) > 0.74) continue;
      tree(io, x + (r % 2) * 0.05, z, sc);
    }
  // crates of produce and a picking drone
  for (let i = 0; i < 3; i++) opt(io, 10, () => b.box(0.06, 0.04, 0.06, { color: 0xb08a5a, ...DET, x: (-0.2 + i * 0.08) * s, z: 0.5, y: G, top: lk.crops[(i + 1) % lk.crops.length] }));
  agriDrone(io, -0.1 * s, G + 0.36, -0.1);
  if (L >= 2) opt(io, 30, () => truck(b, -0.46 * s, 0.5, 0.1, p.accent, 0xb08a5a));
});
