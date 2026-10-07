/**
 * services · venues, attractions and resorts (OWNER: services).
 *
 * The showpieces: stadiums whose stands sparkle with phone lights at night, an opera house of white sails,
 * a Ferris wheel and roller coaster, an alien zoo, resorts and the impossible Pocket Universe. Big parts are
 * lathes / tori with modest segment counts; crowds, flags and furniture are `detail` so far views stay cheap.
 * Concave shells (concert bowl) draw an inner, inward-facing lathe so their insides render from the front.
 */
import type { MeshContext } from '../../catalog';
import {
  C, G, TAU, FUN, Mat, shade, lot, block, door, canopy, sign, car, carRow, antenna, flag, lamp, lampRing, tree, grove, bush, bench,
  person, crowd, path, ringPath, pool, rect, steps, columns, flowers, hedge, roundRect, ellipse, disc, fence, wall, stringLights,
  umbrella, halfDisc, edging, softHex, plate, type V2,
} from './parts';

// ─────────────────────────────────────────────────────────── sports venues

/** Stadium: oval bowl with sparkling stands, white canopy, striped pitch, jumbotrons and floodlight masts. */
export function stadium(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 19, C.paving);
  const sz = 0.8;
  b.group({ y: G, sz }, () => {
    const seg = 28;
    b.lathe([[3.7, 0], [3.7, 0.92], [3.62, 1.02]], { color: 0xeef0f4, mat: Mat.Window, seg });
    b.lathe([[3.62, 1.02], [3.4, 0.98], [2.75, 0.56], [2.12, 0.14], [2.02, 0.04]], { color: 0x2a5ad0, mat: Mat.WindowSmall, seg });
    b.lathe([[3.72, 1.0], [3.78, 1.3], [2.9, 1.42]], { color: 0xf8f8fa, seg, capTop: false });
    b.cyl(2.04, 2.04, 0.04, { color: 0xe0453a, seg, y: 0 });
  });
  // pitch
  const W = 2.6, D = 1.5;
  for (let i = 0; i < 8; i++) b.plane(W / 8, D, { color: i % 2 ? 0x6ab452 : 0x5aa446, x: -W / 2 + (i + 0.5) * (W / 8), y: G + 0.042, z: 0, paint: false });
  const ln = 0xffffff, y = G + 0.046;
  for (const s of [-1, 1]) {
    b.plane(W, 0.02, { color: ln, y, z: s * D / 2, paint: false });
    b.plane(0.02, D, { color: ln, x: s * W / 2, y, paint: false });
    b.box(0.03, 0.1, 0.3, { color: ln, x: s * (W / 2 + 0.03), y: G + 0.04, detail: true, paint: false });
  }
  b.plane(0.02, D, { color: ln, y, paint: false });
  ringPath(b, 0.24, 0.02, ln, 12, y);
  for (let i = 0; i < 12; i++) person(b, rng.range(-1.1, 1.1), rng.range(-0.6, 0.6), i % 2 ? 0xffcf3a : 0xe0453a, G + 0.04);
  // jumbotrons on the canopy ends
  for (const s of [-1, 1]) {
    b.box(0.9, 0.42, 0.08, { color: 0x2a2e36, x: s * 3.25, y: G + 1.35, z: 0, ry: s * Math.PI / 2 });
    b.panel(0.8, 0.34, { color: 0xffffff, mat: Mat.Screen, x: s * 3.2, y: G + 1.39, z: 0, ry: -s * Math.PI / 2, paint: false });
  }
  // floodlight masts
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * TAU;
    const x = Math.sin(a) * 3.95, z = Math.cos(a) * 3.95 * 0.86;
    b.box(0.08, 2.1, 0.08, { color: 0xb8bec8, x, y: G, z });
    b.box(0.42, 0.26, 0.06, { color: 0xfff6e0, mat: Mat.Light, x, y: G + 2.1, z, ry: a + Math.PI, rx: 0.4, paint: false });
  }
  // entrance plazas, flags, fans, cars
  for (const s of [-1, 1]) {
    b.box(1.0, 0.3, 0.32, { color: 0x7aa8d0, mat: Mat.Glass, top: 0xe0453a, x: 0, y: G, z: s * 3.12 });
    sign(b, 0, G + 0.32, s * 3.29, 0.9, 0.1, s > 0 ? 0xffcf3a : 0x3a7ae0, Mat.Glow, s > 0 ? 0 : Math.PI);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    flag(b, Math.sin(a) * 3.7, Math.cos(a) * 3.7 * sz, 0.28, FUN[i % FUN.length], G + 1.3);
  }
  crowd(b, rng, 0, 3.6, 0.6, 10);
  crowd(b, rng, -2.6, 2.6, 0.4, 6);
  carRow(b, rng, 1.2, 2.4, 3.0, 5, Math.PI / 2);
  carRow(b, rng, -2.4, -1.2, -3.0, 5, Math.PI / 2);
}

/** Indoor arena: drum with a wraparound LED ribbon, white dome, glass entrance pavilions. */
export function arena(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.paving);
  b.cyl(1.52, 1.58, 0.62, { color: 0xe8eaee, mat: Mat.Window, seg: 20, y: G, z: -0.2 });
  b.cyl(1.54, 1.54, 0.2, { color: 0xffffff, mat: Mat.Screen, seg: 20, y: G + 0.38, z: -0.2, capTop: false });
  b.cyl(1.6, 1.6, 0.05, { color: 0xc8ccd4, seg: 20, y: G + 0.62, z: -0.2 });
  b.dome(1.5, { color: 0xf6f6f8, y: G + 0.66, z: -0.2, wSeg: 20, hSeg: 4, h: 0.42 });
  b.cyl(0.2, 0.2, 0.06, { color: 0x3a7ae0, mat: Mat.Glow, seg: 10, y: G + 1.07, z: -0.2 });
  for (const s of [-1, 1]) {
    b.box(0.6, 0.32, 0.36, { color: 0x7aa8d0, mat: Mat.Glass, x: s * 0.7, y: G, z: 1.25 });
    sign(b, s * 0.7, G + 0.33, 1.435, 0.5, 0.07, s > 0 ? 0xff4ad0 : 0x3ad0ff);
  }
  path(b, 0, 2.3, 0, 1.3, 0.5, C.paving);
  crowd(b, rng, 0, 1.75, 0.55, 12);
  lampRing(b, 1.95, 8, 0.3, C.lamp, 0.2, 0, -0.2);
  edging(b, rng, 7, 6, ['round'], { gap: 1.4, frac: 0.97 });
}

/** Zero-G sports dome: a glass sphere cradled on a glowing anti-grav ring, orbited by balls and a holo scoreboard. */
export function zeroGDome(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0xd8dce6);
  b.lathe([[1.6, 0], [1.6, 0.12], [1.3, 0.38], [1.05, 0.42]], { color: 0x3a3e4a, mat: Mat.WindowSmall, seg: 20, y: G });
  b.torus(1.05, 0.06, { color: 0x7ae0ff, mat: Mat.Glow, seg: 24, tube: 4, y: G + 0.44 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    b.box(0.08, 0.95, 0.12, { color: 0xdfe4ec, x: Math.sin(a) * 1.05, y: G + 0.4, z: Math.cos(a) * 1.05, rx: Math.cos(a) * 0.3, rz: -Math.sin(a) * 0.3 });
  }
  const cy = G + 1.75;
  b.sphere(1.15, { color: 0x9ad8ff, mat: Mat.Glass, y: cy, wSeg: 14, hSeg: 9 });
  b.torus(1.17, 0.025, { color: 0xf4f4f6, seg: 28, tube: 3, y: cy });
  b.torus(1.42, 0.035, { color: 0xffb04a, mat: Mat.Holo, seg: 28, tube: 3, y: cy + 0.25, rx: 0.2 });
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * TAU, e = rng.range(-0.6, 0.8);
    b.sphere(0.07, { color: i % 2 ? 0xff7ad8 : 0x7affa0, mat: Mat.Glow, x: Math.sin(a) * 1.3 * Math.cos(e), y: cy + Math.sin(e) * 1.3, z: Math.cos(a) * 1.3 * Math.cos(e), wSeg: 6, hSeg: 4 });
  }
  b.sphere(0.12, { color: 0xffffff, mat: Mat.Glow, y: cy + 1.25, wSeg: 6, hSeg: 4 });
  sign(b, 0, G + 0.14, 1.62, 0.8, 0.08, 0x7ae0ff);
  crowd(b, rng, 0, 1.95, 0.5, 10);
  lampRing(b, 2.05, 8, 0.3, C.lampCool, 0.4);
}

// ─────────────────────────────────────────────────────────── entertainment

/** Holo-theatre: velvet-purple playhouse with a marquee screen and a towering hologram dancer on the roof. */
export function holoTheatre(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, 0x6a6470);
  const top = block(b, 0.72, 0.38, 0.5, { color: 0x4a3a6a, roof: 0x2a2236, x: 0, z: -0.18 });
  b.panel(0.6, 0.12, { color: 0xffffff, mat: Mat.Screen, x: 0, y: G + 0.24, z: 0.075, paint: false });
  canopy(b, 0, G + 0.2, 0.07, 0.5, 0.14, 0x2a2236);
  for (let i = 0; i < 8; i++) b.box(0.02, 0.02, 0.02, { color: 0xffe08a, mat: Mat.Glow, x: -0.22 + i * 0.063, y: G + 0.198, z: 0.215, detail: true, paint: false });
  door(b, 0, 0.073, 0.2, 0.15, 0x7a2a4a);
  // projector + hologram dancer
  b.cyl(0.14, 0.18, 0.06, { color: 0x2a2e36, seg: 10, y: top, z: -0.18 });
  b.cyl(0.16, 0.16, 0.01, { color: 0xff7ad8, mat: Mat.Glow, seg: 10, y: top + 0.06, z: -0.18 });
  const hy = top + 0.08, hz = -0.18, H = 0xff7ad8;
  b.cone(0.16, 0.26, { color: H, mat: Mat.Holo, seg: 8, y: hy, z: hz });
  b.cyl(0.035, 0.05, 0.22, { color: H, mat: Mat.Holo, seg: 6, y: hy + 0.2, z: hz });
  b.sphere(0.05, { color: H, mat: Mat.Holo, y: hy + 0.47, z: hz, wSeg: 6, hSeg: 4 });
  b.box(0.02, 0.2, 0.02, { color: H, mat: Mat.Holo, x: -0.08, y: hy + 0.36, z: hz, rz: 0.9 });
  b.box(0.02, 0.2, 0.02, { color: H, mat: Mat.Holo, x: 0.09, y: hy + 0.38, z: hz, rz: -1.2 });
  b.torus(0.2, 0.008, { color: 0x7ad8ff, mat: Mat.Holo, seg: 14, tube: 3, y: hy + 0.12, z: hz, rx: 0.2, detail: true });
  for (let i = 0; i < 6; i++) person(b, -0.35 + i * 0.07, 0.42 + (i % 2) * 0.04, rng.pick(FUN));
  lamp(b, -0.5, 0.25, 0.28, 0xff9ad8);
  lamp(b, 0.5, 0.25, 0.28, 0xff9ad8);
}

/** Opera house: white sail shells over a stone podium, glass-faced foyers, a grand stair and a reflecting pool. */
export function operaHouse(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.paving);
  b.box(2.8, 0.18, 1.9, { color: 0xd8c8a8, x: 0, y: G, z: -0.5 });
  steps(b, -0.55, 0.65, 1.1, 3, 0.06, 0.12, 0xd8c8a8, G);
  const shell = (x: number, z: number, r: number, sx: number, sy: number, tilt: number) => {
    b.group({ x, y: G + 0.18, z, rx: tilt }, () => {
      b.group({ ry: Math.PI / 2, sx: 1, sy, sz: sx }, () => {
        b.lathe([[r, 0], [r * 0.93, r * 0.38], [r * 0.72, r * 0.72], [r * 0.4, r * 0.93], [0.001, r]], { color: 0xf8f6f0, seg: 8, arc: Math.PI, flat: true });
      });
      halfDisc(b, r * sx, r * sy, 6, { color: 0xc8a070, mat: Mat.Glass, z: 0.002 });
    });
  };
  // main hall (three nested sails) + small hall
  shell(-0.55, -0.05, 0.85, 0.55, 1.35, -0.12);
  shell(-0.55, -0.45, 0.72, 0.52, 1.25, -0.12);
  shell(-0.55, -0.8, 0.58, 0.5, 1.1, -0.12);
  shell(0.75, -0.2, 0.62, 0.5, 1.2, -0.12);
  shell(0.75, -0.6, 0.5, 0.48, 1.05, -0.12);
  shell(1.3, 0.35, 0.36, 0.55, 1.0, -0.1);
  pool(b, rect(1.0, 0.36, 0.75, 1.0), rect(0.92, 0.28, 0.75, 1.0), 0.03, 0xd8c8a8);
  crowd(b, rng, -0.3, 1.1, 0.4, 9);
  lampRing(b, 1.9, 8, 0.28, C.lamp, 0.2);
  edging(b, rng, 7, 5, ['round', 'cypress'], { skip: [[0, 2.4], [5.8, 6.3]] });
}

/** Concert bowl: a white quarter-sphere band shell with glowing light rings, speaker towers and a lawn of fans. */
export function concertBowl(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.grass, { border: C.paving });
  // audience lawn fan
  b.plane(2.4, 1.6, { color: 0x6ab452, x: 0, y: G + 0.003, z: 0.75, paint: false });
  const sz = -0.85;
  b.box(1.5, 0.12, 0.7, { color: 0x3a3e46, x: 0, y: G, z: sz + 0.05 });
  // shell (outer + inner faces)
  const prof: [number, number][] = [[1.05, 0], [1.0, 0.33], [0.85, 0.66], [0.55, 0.92], [0.001, 1.02]];
  b.group({ x: 0, y: G, z: sz - 0.2, ry: Math.PI / 2 }, () => {
    b.lathe(prof, { color: 0xf6f6f8, seg: 10, arc: Math.PI });
    b.lathe(prof.map(([r, y]) => [r * 0.95, y * 0.95] as [number, number]).reverse(), { color: 0xe8e8f0, seg: 10, arc: Math.PI });
  });
  for (const [r, col, dz] of [[0.45, 0xff4ad0, -0.45], [0.62, 0x4ad0ff, -0.38], [0.78, 0xffd04a, -0.3]] as const) b.torus(r, 0.018, { color: col, mat: Mat.Glow, seg: 12, tube: 3, arc: Math.PI, x: 0, y: G + 0.12, z: sz + dz, rx: -Math.PI / 2, ry: -Math.PI / 2 });
  // band + speakers + rig
  for (let i = 0; i < 4; i++) person(b, -0.3 + i * 0.2, sz + 0.1, 0x1a1a1a, G + 0.12, 0.07);
  for (const s of [-1, 1]) {
    b.box(0.22, 0.5, 0.2, { color: 0x1e2026, x: s * 0.95, y: G, z: sz + 0.25 });
    b.box(0.16, 0.06, 0.01, { color: 0xff4ad0, mat: Mat.Light, x: s * 0.95, y: G + 0.44, z: sz + 0.351, paint: false });
  }
  // fans
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9 - r; c++) {
    if (b.lod) break;
    person(b, -0.8 + c * 0.2 + r * 0.1 + rng.range(-0.04, 0.04), 0.0 + r * 0.32 + rng.range(-0.05, 0.05), rng.pick(FUN));
  }
  // food stall + lamps
  b.box(0.3, 0.16, 0.2, { color: 0xffcf3a, x: 1.5, y: G, z: 0.9 });
  b.wedge(0.34, 0.06, 0.14, { color: 0xe0453a, x: 1.5, y: G + 0.16, z: 1.02, ry: Math.PI });
  lampRing(b, 1.85, 6, 0.3, 0xff9ad8, 0.5);
  edging(b, rng, 7, 6, ['round', 'pine'], { skip: [[0, 1.2], [5.1, 6.3]] });
}

/** Night market: lantern-strung stalls with candy-stripe awnings, a food truck, tables and a hungry crowd. */
export function nightMarket(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, 0x7a746c, { border: 0x5a554e });
  const stalls: [number, number, number][] = [[-0.45, -0.35, 0.5], [0.0, -0.5, 0], [0.45, -0.35, -0.5], [-0.55, 0.15, 1.4], [0.55, 0.15, -1.4]];
  stalls.forEach(([x, z, ry], i) => {
    b.group({ x, y: G, z, ry }, () => {
      b.box(0.24, 0.1, 0.14, { color: C.wood });
      b.box(0.02, 0.2, 0.02, { color: 0x3a3e46, x: -0.11, z: 0.06 });
      b.box(0.02, 0.2, 0.02, { color: 0x3a3e46, x: 0.11, z: 0.06 });
      b.wedge(0.28, 0.05, 0.2, { color: FUN[i % FUN.length], y: 0.2, z: 0.02, ry: Math.PI });
      b.sphere(0.025, { color: 0xff5a3a, mat: Mat.Glow, y: 0.17, z: 0.12, wSeg: 5, hSeg: 3, detail: true });
    });
  });
  // string lights from corner poles
  const poles: V2[] = [[-0.6, -0.55], [0.6, -0.55], [0.6, 0.5], [-0.6, 0.5]];
  for (const [x, z] of poles) b.box(0.02, 0.32, 0.02, { color: 0x3a3e46, x, y: G, z, detail: true });
  const warm = [0xffd27a, 0xff9a5a, 0xfff0b0];
  stringLights(b, -0.6, G + 0.32, -0.55, 0.6, G + 0.32, 0.5, 9, warm);
  stringLights(b, 0.6, G + 0.32, -0.55, -0.6, G + 0.32, 0.5, 9, warm);
  stringLights(b, -0.6, G + 0.32, 0.5, 0.6, G + 0.32, 0.5, 6, warm);
  // food truck
  b.group({ x: 0.1, y: G, z: 0.45, ry: Math.PI / 2 }, () => {
    b.box(0.13, 0.12, 0.3, { color: 0x3ad0c0, y: 0.015 });
    b.panel(0.18, 0.05, { color: 0xffffff, mat: Mat.Screen, x: 0.066, y: 0.08, ry: Math.PI / 2, paint: false });
    b.box(0.02, 0.01, 0.22, { color: 0xffcf3a, x: 0.1, y: 0.13, detail: true });
  });
  for (const [x, z] of [[-0.15, 0.0], [0.2, -0.05]] as const) {
    b.cyl(0.06, 0.06, 0.05, { color: C.wood, seg: 6, x, y: G, z, detail: true });
    umbrella(b, x, z, rng.pick(FUN), 0.9);
  }
  crowd(b, rng, 0, -0.05, 0.42, 9);
}

/** Starlight drive-in: a giant screen, arcs of hover-cars, a striped snack bar with a projector beam. */
export function driveIn(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0x4a4d54, { border: C.paving });
  // screen
  b.box(2.3, 0.08, 0.12, { color: 0xe8e8ec, x: 0, y: G + 0.22, z: -1.55 });
  b.box(2.3, 1.0, 0.08, { color: 0xe8e8ec, x: 0, y: G + 0.3, z: -1.6 });
  b.panel(2.1, 0.86, { color: 0xffffff, mat: Mat.Screen, x: 0, y: G + 0.37, z: -1.555, paint: false });
  for (const x of [-0.9, 0.9]) b.box(0.08, 0.3, 0.08, { color: 0x9aa0aa, x, y: G, z: -1.6 });
  // cars in arcs facing the screen
  for (let r = 0; r < 3; r++) {
    const R = 1.0 + r * 0.42;
    for (let i = 0; i < 6 + r; i++) {
      const a = -0.75 + (i / (5 + r)) * 1.5;
      const x = Math.sin(a) * R, z = -1.6 + Math.cos(a) * R + 0.35;
      if (rng.chance(0.85)) car(b, x, z, a + Math.PI, rng.pick([0xe0453a, 0x3a7ae0, 0xffcf3a, 0x4ac06a, 0xf4f4f4, 0xff7ab8, 0x9a5ae0]));
    }
  }
  // snack bar + projector beam
  b.box(0.5, 0.22, 0.3, { color: 0xf4f0e8, mat: Mat.WindowSmall, x: 0, y: G, z: 1.25 });
  for (let i = 0; i < 4; i++) b.box(0.125, 0.04, 0.32, { color: i % 2 ? 0xffffff : 0xe0453a, x: -0.19 + i * 0.125, y: G + 0.22, z: 1.25 });
  b.cyl(0.02, 0.4, 2.6, { color: 0xbfd8ff, mat: Mat.Holo, seg: 6, x: 0, y: G + 0.26, z: 1.1, rx: -Math.PI / 2 + 0.04, capTop: false, detail: true });
  sign(b, 0.95, G + 0.4, 1.6, 0.5, 0.14, 0xff4ad0);
  b.box(0.04, 0.4, 0.04, { color: 0x3a3e46, x: 0.95, y: G, z: 1.6 });
  for (let i = 0; i < 5; i++) b.box(0.03, 0.03, 0.01, { color: 0xfff27a, mat: Mat.Glow, x: 0.77 + i * 0.09, y: G + 0.56, z: 1.6, detail: true, paint: false });
  edging(b, rng, 7, 6, ['palm'], { skip: [[0, 0.8], [5.5, 6.3], [2.4, 3.9]], s: 1.1 });
}

// ─────────────────────────────────────────────────────────── attractions

/** Alien zoo: crystal pen, tentacle lagoon, sky-grazer jungle, sandworm dunes, aviary dome and a grand gate. */
export function alienZoo(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 19, 0xd8d0bc, { border: C.paving });
  ringPath(b, 1.6, 0.26, C.path, 18);
  path(b, 0, 4.3, 0, 1.65, 0.4);
  // gate
  for (const x of [-0.45, 0.45]) {
    b.cyl(0.12, 0.14, 0.7, { color: 0x6a4a8a, seg: 6, x, y: G, z: 3.65 });
    b.sphere(0.1, { color: 0x7affa0, mat: Mat.Glow, x, y: G + 0.78, z: 3.65, wSeg: 6, hSeg: 4 });
  }
  b.box(1.1, 0.12, 0.16, { color: 0x6a4a8a, x: 0, y: G + 0.62, z: 3.65 });
  sign(b, 0, G + 0.5, 3.75, 0.7, 0.1, 0x7affa0);
  // crystal pen (back-left)
  const cx = -2.2, cz = -2.0;
  disc(b, 0.85, 0.02, 0x7a5aa0, { x: cx, y: G, z: cz, seg: 12 });
  fence(b, ellipse(1.75, 1.75, 12, cx, cz), 0.1, 0xd8d8dc, true, G, 0.012, Mat.Plain);
  for (let i = 0; i < 6; i++) b.cone(0.07, rng.range(0.2, 0.45), { color: rng.pick([0x9a7aff, 0xff6ad8, 0x6affd0]), mat: Mat.Glow, seg: 5, x: cx + rng.range(-0.6, 0.6), y: G, z: cz + rng.range(-0.6, 0.5), rz: rng.range(-0.3, 0.3), paint: false });
  for (let i = 0; i < 2; i++) {
    b.group({ x: cx + (i ? 0.3 : -0.25), y: G + 0.02, z: cz + (i ? 0.35 : 0.1), ry: rng.next() * TAU }, () => {
      b.box(0.14, 0.08, 0.24, { color: 0x4a3a6a, y: 0.08 });
      for (const [lx, lz] of [[-0.05, 0.08], [0.05, 0.08], [-0.05, -0.08], [0.05, -0.08]]) b.box(0.03, 0.08, 0.03, { color: 0x3a2a5a, x: lx, z: lz, detail: true });
      for (let k = 0; k < 3; k++) b.cone(0.025, 0.08, { color: 0xff6ad8, mat: Mat.Glow, seg: 4, y: 0.16, z: -0.08 + k * 0.08, detail: true });
      b.box(0.08, 0.07, 0.08, { color: 0x4a3a6a, y: 0.1, z: 0.15 });
    });
  }
  // tentacle lagoon (back-right)
  const lx = 2.2, lz = -1.95;
  pool(b, ellipse(1.75, 1.45, 14, lx, lz), ellipse(1.61, 1.31, 14, lx, lz), 0.05, 0xa8a090);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.3, ox = lx + Math.sin(a) * 0.4, oz = lz + Math.cos(a) * 0.3;
    b.tube([[ox, G + 0.04, oz], [ox + 0.05, G + 0.3, oz + 0.04], [ox + 0.16, G + 0.48, oz - 0.02], [ox + 0.22, G + 0.4, oz - 0.08]], 0.04 - k * 0.004, { color: 0x9a3ab0, seg: 5, paint: false });
  }
  b.tube([[lx - 0.6, G + 0.04, lz + 0.3], [lx - 0.5, G + 0.5, lz + 0.3], [lx - 0.3, G + 0.7, lz + 0.25], [lx - 0.15, G + 0.62, lz + 0.2]], 0.06, { color: 0x2a8a8a, seg: 6, paint: false });
  b.box(0.12, 0.08, 0.16, { color: 0x2a8a8a, x: lx - 0.12, y: G + 0.6, z: lz + 0.2, ry: 0.5 });
  // sky-grazer jungle (front-left)
  const jx = -2.3, jz = 1.75;
  disc(b, 0.85, 0.02, 0x3a8a3a, { x: jx, y: G, z: jz, seg: 12 });
  for (let i = 0; i < 4; i++) tree(b, jx + rng.range(-0.65, 0.65), jz + rng.range(-0.6, 0.5), 1.3, 'alien', rng);
  b.group({ x: jx + 0.15, y: G + 0.02, z: jz + 0.1, ry: 0.7 }, () => {
    b.sphere(0.2, { color: 0xd88a3a, y: 0.42, sz: 1.5, sy: 0.8, wSeg: 8, hSeg: 5 });
    for (const [x, z] of [[-0.1, 0.18], [0.1, 0.18], [-0.1, -0.18], [0.1, -0.18]]) b.cyl(0.035, 0.045, 0.36, { color: 0xb86a2a, seg: 5, x, z });
    b.tube([[0, 0.5, 0.22], [0, 0.85, 0.35], [0, 1.15, 0.38]], 0.05, { color: 0xd88a3a, seg: 6 });
    b.box(0.08, 0.08, 0.16, { color: 0xd88a3a, y: 1.13, z: 0.44 });
    b.box(0.08, 0.02, 0.02, { color: 0x1a1a1a, y: 1.18, z: 0.52, detail: true });
  });
  // sandworm dunes (front-right)
  const dx = 2.3, dz = 1.8;
  disc(b, 0.85, 0.03, 0xe8c888, { x: dx, y: G, z: dz, seg: 12 });
  const arc: [number, number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    arc.push([dx - 0.55 + t * 0.9, G + Math.sin(t * Math.PI) * 0.55, dz + 0.1 - t * 0.2]);
  }
  b.tube(arc, 0.1, { color: 0xc8a070, seg: 6, paint: false });
  b.cyl(0.12, 0.12, 0.04, { color: 0xff6a3a, mat: Mat.Glow, seg: 6, x: dx + 0.35, y: G + 0.03, z: dz - 0.1, rx: 0.4, detail: true });
  for (let i = 0; i < 3; i++) b.sphere(0.1, { color: 0xb89a70, x: dx + rng.range(-0.6, 0.6), y: G, z: dz + rng.range(-0.5, 0.6), sy: 0.6, wSeg: 5, hSeg: 3, flat: true, detail: true });
  // aviary dome + flyers
  b.cyl(0.95, 0.98, 0.08, { color: C.stone, seg: 14, y: G });
  b.dome(0.92, { color: 0xbfe8ff, mat: Mat.Glass, y: G + 0.08, wSeg: 12, hSeg: 4, flat: true });
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * TAU;
    b.box(0.12, 0.012, 0.04, { color: 0xffcf3a, mat: Mat.Glow, x: Math.sin(a) * 0.7, y: G + rng.range(0.9, 1.3), z: Math.cos(a) * 0.7, ry: a, rz: 0.3, detail: true, paint: false });
  }
  // visitors, benches, trees
  crowd(b, rng, 0, 2.3, 0.9, 10);
  crowd(b, rng, -1.5, 0.0, 0.6, 5);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.4;
    bench(b, Math.sin(a) * 1.9, Math.cos(a) * 1.9, a + Math.PI);
  }
  edging(b, rng, 19, 10, ['round', 'palm', 'alien'], { frac: 0.92, skip: [[5.9, 6.3], [0, 0.4]] });
}

/** Aquarium: wave-roofed glass hall, a towering water column of fish and a whale breaching from the plaza pool. */
export function aquarium(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0xe0e6ea);
  // hall + wave roof
  b.extrude(roundRect(2.2, 0.85, 0.35, 3, 0.2, -0.75), 0.38, { color: 0x6aa8d0, mat: Mat.Glass, top: 0xe8eef2, y: G });
  b.cyl(0.42, 0.42, 2.2, { color: 0xf4f8fa, arc: Math.PI, capBottom: true, seg: 10, x: 1.3, y: G + 0.38, z: -0.75, rz: Math.PI / 2, sz: 1.0, sy: 0.6 });
  // water column with fish
  const tx = -1.05, tz = -0.55;
  b.cyl(0.46, 0.5, 0.08, { color: 0xd8dce0, seg: 12, x: tx, y: G, z: tz });
  b.cyl(0.42, 0.42, 1.25, { color: 0x3a8ad0, mat: Mat.Water, seg: 12, x: tx, y: G + 0.08, z: tz });
  b.cyl(0.45, 0.45, 0.06, { color: 0xf4f8fa, seg: 12, x: tx, y: G + 1.33, z: tz });
  for (let i = 0; i < 10; i++) {
    const a = rng.next() * TAU, y = G + rng.range(0.2, 1.2);
    b.box(0.07, 0.035, 0.015, { color: rng.pick([0xff8a2a, 0xffd23a, 0xff6ad8, 0x6affd0]), mat: Mat.Glow, x: tx + Math.sin(a) * 0.425, y, z: tz + Math.cos(a) * 0.425, ry: a + Math.PI / 2, detail: true, paint: false });
  }
  // whale breaching from the plaza pool
  pool(b, ellipse(1.3, 0.7, 14, 0.4, 0.75), ellipse(1.2, 0.6, 14, 0.4, 0.75), 0.03);
  b.group({ x: 0.4, y: G + 0.05, z: 0.75, ry: 0.4, rx: -0.5 }, () => {
    b.sphere(0.2, { color: 0x4a6a8a, z: 0.1, sz: 1.9, sy: 0.85, wSeg: 10, hSeg: 6 });
    b.box(0.36, 0.02, 0.12, { color: 0x3a5a7a, z: -0.32, rx: 0.4 });
    b.box(0.14, 0.12, 0.02, { color: 0xe8eef2, y: -0.08, z: 0.28, detail: true });
  });
  b.sphere(0.07, { color: 0xbfe8ff, mat: Mat.Water, x: 0.55, y: G + 0.65, z: 0.85, sy: 1.6, wSeg: 6, hSeg: 4, detail: true });
  sign(b, 0.2, G + 0.3, -0.31, 0.7, 0.07, 0x3ad0ff);
  for (let i = 0; i < 4; i++) tree(b, -1.65 + i * 0.12, 0.35 + i * 0.3, 1.05, 'palm', rng);
  crowd(b, rng, -0.3, 0.2, 0.4, 8);
  lampRing(b, 1.9, 6, 0.28, C.lampCool, 0.3);
}

/** Amusement park: Ferris wheel, looping roller coaster, carousel, drop tower, fairy-tale gate and balloons. */
export function amusementPark(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 19, 0xe8dcc8, { border: C.paving });
  ringPath(b, 2.0, 0.3, 0xd8c8a8, 18);
  path(b, 0, 4.3, 0, 2.0, 0.45, 0xd8c8a8);
  // Ferris wheel (back-left)
  const fx = -1.85, fz = -1.75, fy = G + 1.45, R = 1.15;
  for (const s of [-1, 1]) {
    b.box(0.07, 1.6, 0.07, { color: 0xf4f4f6, x: fx - 0.45, y: G, z: fz + s * 0.12, rz: -0.3 });
    b.box(0.07, 1.6, 0.07, { color: 0xf4f4f6, x: fx + 0.45, y: G, z: fz + s * 0.12, rz: 0.3 });
  }
  b.group({ x: fx, y: fy, z: fz }, () => {
    b.torus(R, 0.035, { color: 0xf4f4f6, seg: 24, tube: 3, rx: Math.PI / 2 });
    b.cyl(0.08, 0.08, 0.3, { color: 0xe0453a, seg: 8, rx: Math.PI / 2, z: -0.15 });
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      b.box(0.025, R, 0.025, { color: 0xf4f4f6, x: Math.sin(a) * R * 0.5, y: Math.cos(a) * R * 0.5, rz: -a });
      b.box(0.14, 0.12, 0.12, { color: FUN[i % FUN.length], x: Math.sin(a) * R, y: Math.cos(a) * R - 0.1 });
      b.box(0.03, 0.03, 0.03, { color: C.lamp, mat: Mat.Light, x: Math.sin(a + 0.31) * R, y: Math.cos(a + 0.31) * R, z: 0.04, detail: true, paint: false });
    }
  });
  // roller coaster (right): ellipse circuit with hills and a loop
  const cx = 1.55, cz = -0.65;
  const pts: [number, number, number][] = [];
  const N = b.lod ? 12 : 22;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * TAU;
    const h = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2 + 0.6)) + (i === 0 || i === N ? 0 : 0.08 * Math.sin(t * 5));
    pts.push([cx + Math.sin(t) * 1.55, G + h, cz + Math.cos(t) * 1.05]);
  }
  b.tube(pts, 0.035, { color: 0xe0453a, seg: 4, paint: false });
  for (let i = 0; i < N; i += 2) b.box(0.035, pts[i][1] - G, 0.035, { color: 0xf4f4f6, x: pts[i][0], y: G, z: pts[i][2] });
  const loop: [number, number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = (i / 10) * TAU;
    loop.push([cx + 1.55 + Math.sin(t) * 0.02, G + 0.75 + Math.cos(t + Math.PI) * 0.4 + 0.0, cz + Math.sin(t) * 0.4]);
  }
  b.tube(loop, 0.035, { color: 0xffcf3a, seg: 4, paint: false });
  b.box(0.04, 0.35, 0.04, { color: 0xf4f4f6, x: cx + 1.55, y: G, z: cz });
  for (let k = 0; k < 3; k++) {
    const p = pts[3 + k];
    b.box(0.1, 0.07, 0.12, { color: FUN[k + 1], x: p[0], y: p[1] + 0.03, z: p[2], ry: Math.atan2(pts[4 + k][0] - p[0], pts[4 + k][2] - p[2]), detail: true });
  }
  // carousel (front-left)
  b.group({ x: -1.75, y: G, z: 1.45 }, () => {
    b.cyl(0.5, 0.52, 0.06, { color: 0xf4e6c8, seg: 12 });
    b.cyl(0.08, 0.08, 0.45, { color: 0xffcf3a, seg: 8, y: 0.06 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      b.box(0.012, 0.36, 0.012, { color: 0xffd04a, x: Math.sin(a) * 0.38, y: 0.06, z: Math.cos(a) * 0.38, detail: true });
      b.box(0.04, 0.06, 0.12, { color: i % 2 ? 0xffffff : 0xffb8d8, x: Math.sin(a) * 0.38, y: 0.18 + (i % 2) * 0.05, z: Math.cos(a) * 0.38, ry: a + Math.PI / 2, detail: true });
    }
    b.cone(0.58, 0.3, { color: 0xe0453a, seg: 8, flat: true, y: 0.44 });
    b.cyl(0.58, 0.58, 0.04, { color: 0xffffff, seg: 8, y: 0.42, capTop: false });
    b.sphere(0.05, { color: 0xffd04a, mat: Mat.Glow, y: 0.78, wSeg: 6, hSeg: 4 });
  });
  // drop tower (front-right)
  b.cyl(0.11, 0.14, 2.6, { color: 0xf4f4f6, seg: 8, x: 2.55, y: G, z: 1.35 });
  b.cyl(0.24, 0.24, 0.12, { color: 0x3a7ae0, seg: 10, x: 2.55, y: G + 1.5, z: 1.35 });
  b.cone(0.13, 0.25, { color: 0xe0453a, seg: 8, x: 2.55, y: G + 2.6, z: 1.35 });
  b.box(0.05, 0.05, 0.05, { color: 0xff3030, mat: Mat.Glow, x: 2.55, y: G + 2.86, z: 1.35, paint: false });
  // fairy-tale gate
  for (const x of [-0.6, 0.6]) {
    b.cyl(0.18, 0.18, 0.62, { color: 0xf4ece0, seg: 8, x, y: G, z: 3.7 });
    b.cone(0.22, 0.38, { color: 0x3a7ae0, seg: 8, x, y: G + 0.62, z: 3.7 });
    flag(b, x, 3.7, 0.18, 0xffcf3a, G + 0.98);
  }
  b.box(1.05, 0.42, 0.18, { color: 0xf4ece0, x: 0, y: G + 0.2, z: 3.7 });
  sign(b, 0, G + 0.4, 3.8, 0.6, 0.1, 0xff7ab8);
  // balloons, stalls, people
  for (let i = 0; i < 5; i++) {
    const x = -0.4 + i * 0.2, z = 2.6;
    b.box(0.004, 0.25, 0.004, { color: 0xdddddd, x, y: G + 0.07, z, detail: true, paint: false });
    b.sphere(0.05, { color: FUN[i], x, y: G + 0.35, z, sy: 1.2, wSeg: 5, hSeg: 4, detail: true, paint: false });
  }
  for (const [x, z, col] of [[-0.6, -0.3, 0xffcf3a], [0.4, 0.9, 0xe0453a]] as const) {
    b.box(0.26, 0.14, 0.18, { color: 0xf4f0e8, x, y: G, z });
    b.wedge(0.3, 0.05, 0.12, { color: col, x, y: G + 0.14, z: z + 0.08, ry: Math.PI });
  }
  crowd(b, rng, 0, 2.0, 1.4, 16);
  crowd(b, rng, 0, 0.3, 0.8, 6);
  lampRing(b, 2.25, 10, 0.3, C.lamp, 0.3);
  edging(b, rng, 19, 8, ['round', 'blossom', 'palm'], { frac: 0.93, skip: [[5.9, 6.3], [0, 0.4], [3.3, 4.6], [0.6, 2.3]] });
}

/** Observation tower: slender flared shaft, glass saucer pod with a lit rim, needle antenna and beacon. */
export function observationTower(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.paving);
  b.cyl(0.45, 0.5, 0.12, { color: 0xd8dce2, mat: Mat.WindowSmall, seg: 12, y: G });
  b.lathe([[0.34, 0], [0.2, 0.25], [0.11, 0.8], [0.085, 2.55], [0.1, 2.7]], { color: 0xf2f4f8, seg: 10, y: G + 0.12 });
  b.box(0.03, 2.4, 0.02, { color: 0x7ae0ff, mat: Mat.Glow, x: 0, y: G + 0.3, z: 0.105, paint: false });
  const py = G + 2.82;
  b.lathe([[0.1, 0], [0.42, 0.08], [0.46, 0.15]], { color: 0xe8ecf2, seg: 14, y: py });
  b.cyl(0.46, 0.4, 0.14, { color: 0x6aa0c8, mat: Mat.Glass, seg: 14, y: py + 0.15, capTop: false });
  b.cyl(0.465, 0.465, 0.02, { color: 0xffd27a, mat: Mat.Light, seg: 14, y: py + 0.14, capTop: false });
  b.lathe([[0.4, 0], [0.3, 0.08], [0.08, 0.14]], { color: 0xe8ecf2, seg: 14, y: py + 0.29 });
  b.cyl(0.02, 0.04, 0.75, { color: 0xdfe4ea, seg: 5, y: py + 0.43 });
  b.box(0.04, 0.04, 0.04, { color: 0xff3030, mat: Mat.Glow, y: py + 1.18, paint: false });
  tree(b, -0.55, 0.2, 0.9, 'round', rng);
  tree(b, 0.55, -0.25, 0.85, 'round', rng);
  crowd(b, rng, 0.2, 0.5, 0.18, 4);
  bench(b, -0.3, 0.55, 0);
}

/** Water park: lagoon, wave pool, a slide tower with three twisting slides, palms and parasols. */
export function waterPark(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0xeae6dc);
  pool(b, ellipse(1.9, 1.15, 14, -0.45, 0.55), ellipse(1.78, 1.03, 14, -0.45, 0.55), 0.03, 0xd8d0c0);
  pool(b, roundRect(1.0, 0.7, 0.15, 2, 1.15, 0.85), roundRect(0.9, 0.6, 0.12, 2, 1.15, 0.85), 0.03, 0xd8d0c0);
  for (let i = 0; i < 3; i++) b.box(0.88, 0.012, 0.03, { color: 0xffffff, x: 1.15, y: G + 0.034, z: 0.62 + i * 0.12, detail: true, paint: false });
  // slide tower
  const sx = 0.35, sz = -0.95;
  b.box(0.4, 1.0, 0.4, { color: 0xffcf3a, mat: Mat.WindowSmall, x: sx, y: G, z: sz });
  b.pyramid(0.5, 0.22, 0.5, { color: 0xe0453a, x: sx, y: G + 1.0, z: sz });
  const slides: [number, number[]][] = [[0x3a7ae0, [-0.5, 0.4]], [0xff7ab8, [-1.3, 0.25]], [0x4ac06a, [0.2, 0.15]]];
  slides.forEach(([col, [ex, ez]], k) => {
    const pts: [number, number, number][] = [];
    const n = b.lod ? 4 : 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const wob = Math.sin(t * Math.PI * 2 + k) * 0.35 * (1 - t);
      pts.push([sx + (ex - sx) * t + wob, G + 0.95 - t * 0.9 + (k * 0.1) * (1 - t), sz + (ez - sz) * t + Math.cos(t * Math.PI * 2 + k) * 0.25 * (1 - t)]);
    }
    b.tube(pts, 0.045, { color: col, seg: 5, paint: false });
  });
  // palms, parasols, loungers, swimmers
  for (let i = 0; i < 5; i++) {
    const a = 0.9 + i * 0.75;
    tree(b, Math.sin(a) * 2.05, Math.cos(a) * 2.05, 1.1, 'palm', rng);
  }
  for (let i = 0; i < 6; i++) {
    const x = -1.6 + (i % 3) * 0.3, z = -0.55 + Math.floor(i / 3) * 0.3;
    umbrella(b, x, z, FUN[i]);
    b.box(0.06, 0.015, 0.14, { color: 0xffffff, x: x + 0.08, y: G + 0.02, z, detail: true, paint: false });
  }
  for (let i = 0; i < 10; i++) person(b, -0.45 + rng.range(-0.7, 0.7), 0.55 + rng.range(-0.35, 0.35), rng.pick(FUN), G - 0.02, 0.06);
  crowd(b, rng, 1.15, 0.2, 0.3, 4);
}

// ─────────────────────────────────────────────────────────── resorts

/** Beach resort: terraced white hotel, infinity pool, thatched cabanas, palms, parasols and a volleyball net. */
export function beachResort(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.sand, { border: 0xe0c890 });
  for (let i = 0; i < 3; i++) block(b, 2.0 - i * 0.3, 0.42 - i * 0.12, 0.6 - i * 0.12, { color: 0xf8f6f0, roof: 0xe8e2d6, x: 0, z: -1.15 + i * 0.12 + 0.0, y: G + i * 0.0, mat: Mat.Window });
  b.box(2.02, 0.025, 0.04, { color: 0x3ad0c0, x: 0, y: G + 0.2, z: -0.84, paint: false });
  for (let i = 0; i < 5; i++) b.box(0.3, 0.012, 0.08, { color: 0xffffff, x: -0.8 + i * 0.4, y: G + 0.21, z: -0.81, detail: true });
  pool(b, roundRect(1.4, 0.5, 0.2, 2, 0, -0.25), roundRect(1.32, 0.42, 0.18, 2, 0, -0.25), 0.04, 0xf4f0e8);
  for (let i = 0; i < 3; i++) {
    const x = 1.25 + (i % 2) * 0.35, z = -0.5 + i * 0.45;
    b.box(0.22, 0.12, 0.22, { color: 0xc8a070, x, y: G, z });
    b.cone(0.2, 0.16, { color: 0xb89a5a, seg: 6, flat: true, x, y: G + 0.12, z });
  }
  for (let i = 0; i < 7; i++) umbrella(b, -1.2 + i * 0.36, 0.55 + (i % 2) * 0.25, FUN[i], 1.2);
  for (let i = 0; i < 6; i++) b.box(0.07, 0.015, 0.16, { color: 0xffffff, x: -1.1 + i * 0.4, y: G + 0.02, z: 0.95, detail: true, paint: false });
  // volleyball
  for (const x of [-0.25, 0.25]) b.box(0.015, 0.18, 0.015, { color: 0xf4f4f4, x, y: G, z: 1.45, detail: true });
  b.panel(0.5, 0.06, { color: 0xf4f4f4, x: 0, y: G + 0.12, z: 1.45, both: true, detail: true, paint: false });
  // tiki torches
  for (const x of [-0.75, 0.75]) {
    b.box(0.015, 0.18, 0.015, { color: 0x6a4a2a, x, y: G, z: 0.15, detail: true });
    b.cone(0.025, 0.05, { color: 0xff8a2a, mat: Mat.Lava, seg: 4, x, y: G + 0.18, z: 0.15, paint: false });
  }
  for (let i = 0; i < 7; i++) {
    const a = -1.4 + i * 0.47;
    tree(b, Math.sin(a) * 2.05, Math.cos(a) * 2.05 * 0.95, 1.15, 'palm', rng);
  }
  crowd(b, rng, 0, 0.75, 0.9, 10);
}

/** Hot springs: cascading rock pools on a geothermal vent, rising steam, a wooden bathhouse, lanterns, bathing monkeys. */
export function hotSprings(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, 0xb8b0a4, { border: 0x8a847a });
  const tiers: [number, number, number, number, number][] = [[-0.2, -0.3, 0.55, 0.38, 0.16], [0.12, -0.02, 0.5, 0.34, 0.1], [0.28, 0.34, 0.5, 0.32, 0.05]];
  for (const [x, z, w, d, h] of tiers) {
    b.extrude(ellipse(w, d, 10, x, z), h, { color: 0x8a847a, y: G });
    b.extrude(ellipse(w * 0.84, d * 0.8, 10, x, z), 0.005, { color: 0x5ac8c0, mat: Mat.Water, topMat: Mat.Water, y: G + h - 0.002, paint: false });
    for (let k = 0; k < 2; k++) b.sphere(0.06 + k * 0.02, { color: 0xf4f6f8, x: x + rng.range(-0.1, 0.1), y: G + h + 0.08 + k * 0.08, z: z + rng.range(-0.05, 0.05), sy: 0.7, wSeg: 5, hSeg: 3, flat: true, detail: true, paint: false });
  }
  for (let i = 0; i < 3; i++) {
    const [x, z, , , h] = tiers[i % 3];
    b.box(0.04, 0.04, 0.04, { color: 0x8a5a3a, top: 0xf0a0a0, x: x + 0.08, y: G + h - 0.02, z, detail: true, paint: false });
  }
  // bathhouse
  b.group({ x: 0.45, y: G, z: -0.4 }, () => {
    b.box(0.3, 0.18, 0.24, { color: 0x9a6a42, mat: Mat.WindowSmall });
    b.gable(0.36, 0.1, 0.3, { color: 0x3a3a42 });
    b.gable(0.36, 0.1, 0.3, { color: 0x3a3a42, y: 0.18, overhang: 0.05 });
  });
  for (const [x, z] of [[-0.5, 0.1], [0.0, 0.55]] as const) {
    b.box(0.015, 0.14, 0.015, { color: 0x3a3a42, x, y: G, z, detail: true });
    b.box(0.045, 0.05, 0.045, { color: 0xff8a3a, mat: Mat.Glow, x, y: G + 0.14, z, paint: false });
  }
  tree(b, -0.55, 0.35, 0.9, 'pine', rng);
  tree(b, -0.5, -0.5, 0.85, 'autumn', rng);
  for (let i = 0; i < 3; i++) b.sphere(0.05, { color: 0x7a746a, x: rng.range(-0.6, 0.6), y: G, z: rng.range(0.2, 0.6), sy: 0.6, wSeg: 4, hSeg: 3, flat: true, detail: true });
}

/** Ski lodge: snow-capped A-frame chalet, a groomed slope with slalom flags, chairlift, snowman and a fire pit. */
export function skiLodge(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0xf2f6fc, { border: 0xc8d4e2 });
  // slope (back)
  b.wedge(2.0, 0.85, 1.5, { color: 0xf8fbff, x: 0.25, y: G, z: -1.05 });
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const z = -1.7 + t * 1.3, y = G + 0.85 * (1 - (z + 1.8) / 1.5);
    b.box(0.01, 0.1, 0.01, { color: 0x3a3e46, x: -0.1 + (i % 2) * 0.3, y, z, detail: true });
    b.panel(0.05, 0.035, { color: i % 2 ? 0x3a7ae0 : 0xe0453a, x: -0.075 + (i % 2) * 0.3, y: y + 0.06, z, both: true, detail: true, paint: false });
  }
  // chairlift
  for (let i = 0; i < 3; i++) {
    const z = 0.1 - i * 0.75, y0 = G + Math.max(0, 0.85 * (1 - (z + 1.8) / 1.5) * (z < -0.3 ? 1 : 0));
    b.box(0.04, 0.5, 0.04, { color: 0x6a7280, x: 1.15, y: y0, z });
    b.box(0.2, 0.03, 0.03, { color: 0x6a7280, x: 1.15, y: y0 + 0.5, z });
  }
  b.box(0.01, 0.01, 1.6, { color: 0x3a3e46, x: 1.15, y: G + 0.72, z: -0.65, rx: -0.42, detail: true });
  for (let i = 0; i < 4; i++) b.box(0.07, 0.04, 0.05, { color: FUN[i], x: 1.15, y: G + 0.52 + i * 0.16, z: 0.0 - i * 0.38, detail: true });
  // chalet
  b.box(0.95, 0.24, 0.62, { color: 0x8a5a36, mat: Mat.WindowSmall, x: -0.75, y: G, z: 0.55 });
  b.gable(0.62, 0.55, 0.95, { color: 0xf4f8ff, x: -0.75, y: G + 0.24, z: 0.55, ry: Math.PI / 2, overhang: 0.06 });
  b.box(0.3, 0.4, 0.02, { color: 0xffd27a, mat: Mat.Window, x: -0.75, y: G + 0.24, z: 0.87, paint: false });
  b.box(0.12, 0.6, 0.12, { color: 0x8a847a, x: -1.05, y: G + 0.2, z: 0.45 });
  // fire pit, snowman, skis
  b.cyl(0.1, 0.12, 0.04, { color: 0x6a645a, seg: 8, x: 0.1, y: G, z: 0.9 });
  b.cone(0.06, 0.12, { color: 0xff8a2a, mat: Mat.Lava, seg: 5, x: 0.1, y: G + 0.04, z: 0.9, paint: false });
  for (const [r, y] of [[0.07, 0.06], [0.05, 0.17], [0.035, 0.25]] as const) b.sphere(r, { color: 0xffffff, x: 0.6, y: G + y, z: 0.85, wSeg: 6, hSeg: 4 });
  b.cone(0.01, 0.05, { color: 0xff8a2a, seg: 4, x: 0.6, y: G + 0.25, z: 0.88, rx: Math.PI / 2, detail: true });
  for (let i = 0; i < 4; i++) b.box(0.012, 0.18, 0.012, { color: FUN[i], x: -0.2 + i * 0.03, y: G, z: 0.62, rz: 0.15, detail: true, paint: false });
  crowd(b, rng, 0.2, 0.75, 0.3, 6);
  edging(b, rng, 7, 8, ['snowpine'], { skip: [[0, 0.9], [5.5, 6.3]], s: 1.15 });
}

/** Alpine gondola lodge: stone-and-timber hotel, a cable-car station with a red gondola climbing to a mountain pylon. */
export function alpineLodge(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0x7cb85a, { border: 0x9a948a });
  // hotel
  b.box(1.2, 0.2, 0.6, { color: 0xb8b0a4, mat: Mat.WindowSmall, x: -0.6, y: G, z: 0.55 });
  b.box(1.2, 0.36, 0.6, { color: 0x9a6a42, mat: Mat.Window, x: -0.6, y: G + 0.2, z: 0.55 });
  for (let i = 0; i < 2; i++) b.box(1.24, 0.02, 0.06, { color: 0x6a4a2a, x: -0.6, y: G + 0.3 + i * 0.16, z: 0.87, detail: true });
  b.gable(1.2, 0.3, 0.6, { color: 0x5a3a2a, x: -0.6, y: G + 0.56, z: 0.55, overhang: 0.08 });
  for (let i = 0; i < 6; i++) flowers(b, -1.1 + i * 0.2, 0.9, 0.04, i % 2 ? 0xe0453a : 0xff7ab8, G + 0.3);
  // gondola station + pylon + cable
  b.box(0.5, 0.36, 0.42, { color: 0xe8e4dc, mat: Mat.WindowSmall, x: 0.9, y: G, z: 0.75 });
  b.box(0.56, 0.04, 0.48, { color: 0xe0453a, x: 0.9, y: G + 0.36, z: 0.75 });
  const px = 0.9, pz = -1.55, ph = 2.1;
  b.box(0.1, ph, 0.1, { color: 0x8a92a0, x: px, y: G, z: pz });
  b.box(0.36, 0.05, 0.08, { color: 0x8a92a0, x: px, y: G + ph, z: pz });
  const y0 = G + 0.32, len = Math.hypot(ph - 0.32, pz - 0.75);
  const pitch = Math.atan2(ph - 0.32, 0.75 - pz);
  for (const ox of [-0.12, 0.12]) b.box(0.008, 0.008, len, { color: 0x3a3e46, x: px + ox, y: (y0 + G + ph) / 2, z: (0.75 + pz) / 2, rx: pitch, detail: true });
  const gy = y0 + (ph - 0.32) * 0.45, gz = 0.75 + (pz - 0.75) * 0.45;
  b.box(0.012, 0.12, 0.012, { color: 0x3a3e46, x: px - 0.12, y: gy - 0.1, z: gz, detail: true });
  b.box(0.14, 0.12, 0.18, { color: 0xe0453a, mat: Mat.WindowSmall, x: px - 0.12, y: gy - 0.22, z: gz });
  // a craggy peak behind the pylon
  b.cone(0.6, 1.1, { color: 0x9a948a, seg: 6, flat: true, x: -0.4, y: G, z: -1.2 });
  b.cone(0.28, 0.42, { color: 0xf8fbff, seg: 6, flat: true, x: -0.4, y: G + 0.7, z: -1.2 });
  // cows on the meadow
  for (let i = 0; i < 3; i++) {
    const x = 0.2 + i * 0.25, z = -0.2 + (i % 2) * 0.2;
    b.group({ x, y: G, z, ry: rng.next() * TAU }, () => {
      b.box(0.06, 0.05, 0.12, { color: 0xf4f4f0, y: 0.04, detail: true });
      b.box(0.05, 0.04, 0.04, { color: 0x2a2a2a, y: 0.06, z: 0.07, detail: true });
    });
  }
  crowd(b, rng, 0.3, 1.2, 0.3, 4);
  edging(b, rng, 7, 7, ['pine', 'snowpine'], { skip: [[0, 1.1], [5.4, 6.3], [2.6, 3.4]] });
}

// ─────────────────────────────────────────────────────────── beyond

/** Pocket universe park: a portal ring cradling a miniature planet with its own moon and stars above a mirror pool. */
export function pocketUniverse(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0x2a2a44, { border: 0x1a1a2e });
  pool(b, ngonPoly(14, 1.5), ngonPoly(14, 1.4), 0.04, 0x3a3a5a);
  const cy = G + 1.45;
  b.torus(1.15, 0.07, { color: 0xe8e4ff, seg: 24, tube: 4, y: cy, rx: Math.PI / 2 });
  b.torus(1.25, 0.025, { color: 0xb08aff, mat: Mat.Glow, seg: 24, tube: 3, y: cy, rx: Math.PI / 2 });
  for (const s of [-1, 1]) b.box(0.14, 0.4, 0.2, { color: 0xe8e4ff, x: s * 0.9, y: G + 0.04, z: 0, rz: s * 0.5 });
  b.cyl(1.08, 1.08, 0.01, { color: 0x3a2a8a, mat: Mat.Holo, seg: 20, y: cy, rx: Math.PI / 2, z: -0.005 });
  // miniature world with ring and moon
  b.sphere(0.42, { color: 0x2a7ad0, y: cy, wSeg: 12, hSeg: 8 });
  for (const [dx, dy, dz, s] of [[0.22, 0.15, 0.28, 0.2], [-0.25, -0.1, 0.28, 0.17], [0.05, 0.3, -0.25, 0.18]] as const)
    b.sphere(s, { color: 0x5aaa44, x: dx, y: cy + dy, z: dz, wSeg: 6, hSeg: 4, flat: true });
  b.torus(0.62, 0.04, { color: 0xffd8a0, mat: Mat.Glow, seg: 20, tube: 3, y: cy, rx: 0.4, rz: 0.2 });
  b.sphere(0.09, { color: 0xe8e8f0, mat: Mat.Glow, x: 0.8, y: cy + 0.35, z: 0.2, wSeg: 6, hSeg: 4 });
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * TAU, r = rng.range(0.6, 1.0);
    b.box(0.025, 0.025, 0.025, { color: 0xfff6d8, mat: Mat.Glow, x: Math.cos(a) * r, y: cy + Math.sin(a) * r, z: rng.range(-0.1, 0.1), detail: true, paint: false });
  }
  // crystal-tree garden
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const x = Math.sin(a) * 1.95, z = Math.cos(a) * 1.95;
    if (Math.cos(a) > 0.85) continue;
    b.cone(0.1, 0.5, { color: rng.pick([0x9a7aff, 0x6affd0, 0xff6ad8]), mat: Mat.Glow, seg: 5, x, y: G, z, paint: false });
    b.cone(0.06, 0.3, { color: 0xe8e4ff, mat: Mat.Glow, seg: 5, x: x + 0.12, y: G, z: z + 0.05, rz: -0.3, detail: true, paint: false });
  }
  path(b, 0, 2.3, 0, 1.5, 0.3, 0x4a4a6a);
  crowd(b, rng, 0, 1.75, 0.35, 6);
  lampRing(b, 1.7, 8, 0.28, 0xb08aff, 0.2);
}

function ngonPoly(n: number, r: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) out.push([Math.sin((i / n) * TAU) * r, Math.cos((i / n) * TAU) * r]);
  return out;
}
