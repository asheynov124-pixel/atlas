/**
 * OWNER: roads-props.
 * Decor prop meshes (placement 'free', footprint 1). Each factory draws one small object at the origin, +Z toward
 * the viewer/road, sized to real scale (1 unit ≈ 20 m: a bench is 0.16 long, a street lamp 0.32 tall, trees ≈ 0.6).
 * Budget: ≤ 150 triangles at LOD0 each; tiny details are `detail: true` (dropped at LOD1).
 * Paintable surfaces (Plain / Metal default, foliage explicitly) follow the decor tint tool; lights use Mat.Light
 * (night-only glow), neon Mat.Glow, screens Mat.Screen, holograms Mat.Holo, fire Mat.Lava, water Mat.Water.
 */
import type { MeshFactory } from '../../catalog';
import { Mat, mix, shade, type MeshBuilder } from '../../kit';
import { drawTree, type TreeSpecies } from './trees';

const D = { detail: true } as const;
const IRON = 0x2f343c;
const STONE = 0xc9c2b4;
const STONE_D = 0x9a9488;
const WOOD = 0xa86a3a;
const WOOD_D = 0x7a4a2a;
const BRASS = 0xc89a4a;
const WHITE = 0xf2f4f6;
const NEON_PINK = 0xff3fd0;
const NEON_CYAN = 0x2ff0ff;

/** Trees as decor: same species as the wild ones, a little larger (planted specimens). */
export const treeMesh = (sp: TreeSpecies, s = 1.5): MeshFactory => ({ b, rng }) => drawTree(b, sp, rng, { s });

function plinth(b: MeshBuilder, w: number, h: number, color = STONE): void {
  b.box(w + 0.03, h * 0.35, w + 0.03, { color: shade(color, 0.9) });
  b.box(w, h * 0.65, w, { color, y: h * 0.35 });
}

function post(b: MeshBuilder, h: number, color: number, x = 0, z = 0, r = 0.008, seg = 5): void {
  b.cyl(r * 0.85, r, h, { color, seg, x, z, capTop: false, flat: true });
}

// ───────────────────────────────────────────────────────────── plants

const hedge: MeshFactory = ({ b }) => {
  const c = 0x3f8a3a;
  b.box(0.42, 0.11, 0.12, { color: c, mat: Mat.Foliage, paint: true });
  b.box(0.38, 0.03, 0.1, { color: shade(c, 1.12), mat: Mat.Foliage, paint: true, y: 0.11 });
};

const flowerbed: MeshFactory = ({ b, rng }) => {
  const brick = 0xb0603e;
  b.box(0.32, 0.035, 0.03, { color: brick, z: 0.1 });
  b.box(0.32, 0.035, 0.03, { color: brick, z: -0.1 });
  b.box(0.03, 0.035, 0.17, { color: brick, x: 0.145 });
  b.box(0.03, 0.035, 0.17, { color: brick, x: -0.145 });
  b.box(0.26, 0.03, 0.17, { color: 0x5a3e2a, paint: false });
  const cols = [0xff4a6a, 0xffd23a, 0xffffff, 0xb07aff, 0xff8a2a];
  for (let i = 0; i < 6; i++) {
    const x = -0.09 + (i % 3) * 0.09, z = i < 3 ? -0.04 : 0.04;
    b.cone(0.035, 0.05, { color: 0x4f9a3a, seg: 3, x, z, y: 0.03, flat: true, mat: Mat.Foliage, paint: true });
    b.sphere(0.022, { color: cols[(i + rng.int(0, 4)) % cols.length], mat: Mat.Foliage, wSeg: 3, hSeg: 2, x, z, y: 0.08, flat: true, ...D });
  }
};

const planter: MeshFactory = ({ b }) => {
  b.box(0.2, 0.06, 0.1, { color: WOOD, top: 0x5a3e2a });
  b.box(0.21, 0.012, 0.11, { color: WOOD_D, y: 0.06 });
  b.sphere(0.06, { color: 0x4f9a3a, mat: Mat.Foliage, paint: true, wSeg: 5, hSeg: 3, flat: true, x: -0.05, y: 0.09 });
  b.sphere(0.055, { color: 0x5aa844, mat: Mat.Foliage, paint: true, wSeg: 5, hSeg: 3, flat: true, x: 0.05, y: 0.085 });
  b.sphere(0.02, { color: 0xff5a8a, mat: Mat.Foliage, wSeg: 3, hSeg: 2, flat: true, y: 0.12, ...D });
};

const topiary: MeshFactory = ({ b }) => {
  b.cyl(0.05, 0.04, 0.06, { color: 0xc0704a, seg: 8, top: 0x4a3020 });
  post(b, 0.12, 0x6a4a32, 0, 0, 0.008, 4);
  const c = 0x2f7a3a;
  b.sphere(0.07, { color: c, mat: Mat.Foliage, paint: true, wSeg: 6, hSeg: 4, flat: true, y: 0.14 });
  b.sphere(0.05, { color: shade(c, 1.08), mat: Mat.Foliage, paint: true, wSeg: 6, hSeg: 3, flat: true, y: 0.24 });
  b.sphere(0.03, { color: shade(c, 1.16), mat: Mat.Foliage, paint: true, wSeg: 5, hSeg: 3, flat: true, y: 0.31 });
};

const shrubs: MeshFactory = ({ b, rng }) => {
  drawTree(b, 'shrub', rng, { s: 1.3, x: -0.05 });
  drawTree(b, 'shrub', rng, { s: 1, x: 0.08, z: 0.05, ry: 1.3 });
};

const glowshrooms: MeshFactory = ({ b, rng }) => {
  const caps = [0x7affd8, 0xff9af0, 0xfff07a, 0x9ac8ff];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3, r = i === 0 ? 0 : 0.07;
    const h = i === 0 ? 0.1 : rng.range(0.04, 0.07);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    b.cyl(0.008, 0.012, h, { color: 0xeee2d0, seg: 4, x, z, capTop: false, flat: true });
    b.dome(i === 0 ? 0.05 : 0.03, { color: caps[i % caps.length], mat: Mat.Glow, wSeg: 6, hSeg: 2, x, z, y: h, flat: true });
  }
};

const bamboo: MeshFactory = ({ b, rng }) => {
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26, r = i ? 0.05 : 0;
    const h = rng.range(0.35, 0.5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    b.cyl(0.011, 0.013, h, { color: 0x8ab84a, seg: 5, x, z, capTop: false, flat: true, mat: Mat.Foliage, paint: true });
    b.box(0.03, 0.006, 0.03, { color: 0x6a9a3a, x, z, y: h * 0.5, ...D });
    b.pyramid(0.05, 0.1, 0.012, { color: 0x5aa83a, mat: Mat.Foliage, paint: true, x, z, y: h - 0.02, rx: 1.0, ry: a, ...D });
  }
};

// ───────────────────────────────────────────────────────────── furniture

const bench: MeshFactory = ({ b }) => {
  for (const x of [-0.065, 0.065]) {
    b.box(0.012, 0.04, 0.05, { color: IRON, x, paint: false });
    b.box(0.012, 0.05, 0.01, { color: IRON, x, y: 0.04, z: -0.022, paint: false });
  }
  b.box(0.17, 0.01, 0.05, { color: WOOD, y: 0.04 });
  b.box(0.17, 0.028, 0.008, { color: WOOD, y: 0.058, z: -0.026, rx: -0.12 });
};

const picnic: MeshFactory = ({ b }) => {
  b.box(0.18, 0.012, 0.09, { color: WOOD, y: 0.06 });
  for (const z of [-0.075, 0.075]) b.box(0.18, 0.01, 0.035, { color: WOOD, y: 0.035, z });
  for (const x of [-0.07, 0.07]) {
    b.box(0.012, 0.06, 0.15, { color: WOOD_D, x, rx: 0, y: 0 });
  }
  b.cyl(0.01, 0.01, 0.12, { color: 0xffffff, seg: 4, y: 0.072, x: 0.04, capTop: false, ...D });
  b.cone(0.07, 0.04, { color: 0xff5a4a, seg: 6, y: 0.19, x: 0.04, flat: true, ...D });
};

const busstop: MeshFactory = ({ b }) => {
  const frame = 0x3a4250;
  for (const x of [-0.12, 0.12]) b.box(0.012, 0.16, 0.012, { color: frame, x, z: -0.03, paint: false });
  b.box(0.27, 0.012, 0.1, { color: frame, y: 0.16, z: 0.0, top: 0xdfe4ea });
  b.box(0.25, 0.12, 0.006, { color: 0x9ac8e0, y: 0.03, z: -0.035, paint: false });
  b.box(0.006, 0.12, 0.06, { color: 0x9ac8e0, y: 0.03, x: 0.12, z: -0.005, paint: false });
  b.box(0.18, 0.008, 0.035, { color: WOOD, y: 0.045, z: -0.015 });
  b.box(0.08, 0.1, 0.006, { color: 0x222222, mat: Mat.Screen, y: 0.04, x: -0.08, z: -0.03, paint: false });
  // route sign
  post(b, 0.24, frame, 0.15, 0.04, 0.006, 4);
  b.box(0.05, 0.05, 0.008, { color: 0x2ab0ff, mat: Mat.Glow, x: 0.15, z: 0.04, y: 0.2 });
  b.box(0.2, 0.006, 0.02, { color: 0xfff0d0, mat: Mat.Light, y: 0.152, z: 0.02, ...D });
};

const mailbox: MeshFactory = ({ b }) => {
  post(b, 0.07, IRON, 0, 0, 0.007, 4);
  b.box(0.04, 0.04, 0.07, { color: 0x2a5ad0, y: 0.07 });
  b.box(0.03, 0.012, 0.07, { color: 0x2a5ad0, y: 0.11 });
  b.box(0.004, 0.035, 0.01, { color: 0xff3a3a, x: 0.022, y: 0.1, z: 0.01, ...D });
  b.box(0.02, 0.004, 0.002, { color: 0xffffff, y: 0.095, z: 0.036, ...D });
};

const bikerack: MeshFactory = ({ b }) => {
  b.box(0.2, 0.008, 0.03, { color: 0x8a8f96, paint: false });
  for (let i = 0; i < 3; i++) b.panel(0.03, 0.05, { color: 0xc0c4ca, x: -0.07 + i * 0.07, y: 0.008, both: true, ry: Math.PI / 2 });
  // a parked bike
  for (const z of [-0.035, 0.035]) b.cyl(0.026, 0.026, 0.006, { color: 0x1a1a1a, seg: 6, rx: Math.PI / 2, x: -0.035, y: 0.026, z: z + 0.003, flat: true, ...D });
  b.box(0.008, 0.008, 0.07, { color: 0xe04040, x: -0.035, y: 0.045, ...D });
  b.box(0.008, 0.03, 0.008, { color: 0xe04040, x: -0.035, y: 0.04, z: -0.02, ...D });
};

const bins: MeshFactory = ({ b }) => {
  const cols = [0x2a7ad0, 0x3aa04a, 0xf0c030];
  cols.forEach((c, i) => {
    const x = -0.055 + i * 0.055;
    b.box(0.045, 0.075, 0.05, { color: c, x });
    b.box(0.05, 0.01, 0.055, { color: shade(c, 0.75), x, y: 0.075 });
  });
};

const foodcart: MeshFactory = ({ b }) => {
  b.box(0.16, 0.07, 0.08, { color: 0xf0e0c0, y: 0.025, top: 0xd0d4d8 });
  b.box(0.16, 0.02, 0.082, { color: 0xe04a3a, y: 0.05 });
  for (const x of [-0.05, 0.05]) b.cyl(0.025, 0.025, 0.012, { color: IRON, seg: 8, rx: Math.PI / 2, x, y: 0.025, z: 0.045, flat: true });
  post(b, 0.2, 0xdddddd, 0.0, 0, 0.005, 4);
  b.cone(0.13, 0.05, { color: 0xffd23a, seg: 8, y: 0.2, flat: true });
  b.box(0.06, 0.03, 0.004, { color: 0xffa020, mat: Mat.Glow, y: 0.065, z: 0.042, ...D });
  b.box(0.05, 0.016, 0.02, { color: 0xfff0d0, mat: Mat.Light, y: 0.185, ...D });
};

const kiosk: MeshFactory = ({ b }) => {
  b.box(0.14, 0.14, 0.12, { color: 0x2f6a4a, mat: Mat.WindowSmall });
  b.box(0.17, 0.02, 0.15, { color: 0x1f4a34, y: 0.14 });
  b.pyramid(0.15, 0.05, 0.13, { color: 0x1f4a34, y: 0.16 });
  b.box(0.1, 0.03, 0.02, { color: 0xffe08a, mat: Mat.Light, y: 0.1, z: 0.065 });
  const mags = [0xff5a5a, 0x5a8aff, 0xffd23a, 0xffffff];
  mags.forEach((c, i) => b.box(0.022, 0.03, 0.004, { color: c, x: -0.04 + i * 0.027, y: 0.04, z: 0.062, ...D }));
};

const stall: MeshFactory = ({ b }) => {
  b.box(0.2, 0.05, 0.1, { color: WOOD });
  for (const x of [-0.09, 0.09]) for (const z of [-0.045, 0.045]) b.box(0.008, 0.16, 0.008, { color: WOOD_D, x, z, y: 0.05 });
  // striped canopy
  for (let i = 0; i < 4; i++) b.box(0.055, 0.012, 0.13, { color: i % 2 ? 0xffffff : 0xe04a5a, x: -0.0825 + i * 0.055, y: 0.21, rx: 0.18, z: 0.01 });
  const fruit = [0xff5a3a, 0xffc030, 0x6ac040, 0xff8a2a];
  for (let i = 0; i < 4; i++) b.sphere(0.022, { color: fruit[i], wSeg: 4, hSeg: 2, x: -0.06 + i * 0.04, y: 0.06, z: 0.02, flat: true, ...D });
};

const slide: MeshFactory = ({ b }) => {
  const c = 0xffb020;
  b.box(0.08, 0.008, 0.08, { color: 0x2a8ad0, y: 0.14, z: -0.05 });
  for (const x of [-0.035, 0.035]) for (const z of [-0.085, -0.015]) b.box(0.008, 0.14, 0.008, { color: 0x2a8ad0, x, z });
  // ladder rungs
  for (let i = 1; i < 4; i++) b.box(0.07, 0.006, 0.006, { color: 0xdddddd, y: i * 0.035, z: -0.09, ...D });
  // slide chute
  b.box(0.06, 0.008, 0.2, { color: c, y: 0.07, z: 0.06, rx: 0.68 });
  b.box(0.006, 0.02, 0.2, { color: shade(c, 0.85), y: 0.075, z: 0.06, x: 0.03, rx: 0.68 });
  b.box(0.006, 0.02, 0.2, { color: shade(c, 0.85), y: 0.075, z: 0.06, x: -0.03, rx: 0.68 });
};

const swings: MeshFactory = ({ b }) => {
  const c = 0xd04a4a;
  for (const x of [-0.11, 0.11]) {
    b.box(0.01, 0.2, 0.01, { color: c, x, z: 0.035, rx: -0.18 });
    b.box(0.01, 0.2, 0.01, { color: c, x, z: -0.035, rx: 0.18 });
  }
  b.box(0.24, 0.012, 0.012, { color: c, y: 0.195 });
  for (const x of [-0.05, 0.05]) {
    b.box(0.003, 0.14, 0.003, { color: 0x888888, x: x - 0.02, y: 0.055 });
    b.box(0.003, 0.14, 0.003, { color: 0x888888, x: x + 0.02, y: 0.055 });
    b.box(0.05, 0.008, 0.025, { color: 0x2a6ad0, x, y: 0.05 });
  }
};

const hydrant: MeshFactory = ({ b }) => {
  const c = 0xe0302a;
  b.cyl(0.03, 0.034, 0.012, { color: c, seg: 8, flat: true });
  b.cyl(0.024, 0.024, 0.07, { color: c, seg: 8, y: 0.012, flat: true });
  b.dome(0.026, { color: shade(c, 0.9), wSeg: 8, hSeg: 2, y: 0.082, flat: true });
  b.cyl(0.012, 0.012, 0.03, { color: 0xd8d8d8, seg: 6, rz: Math.PI / 2, x: 0.015, y: 0.06, flat: true, paint: false });
  b.cyl(0.012, 0.012, 0.03, { color: 0xd8d8d8, seg: 6, rz: -Math.PI / 2, x: -0.015, y: 0.06, flat: true, paint: false });
};

const phonebooth: MeshFactory = ({ b }) => {
  const c = 0x2a3a5a;
  b.box(0.08, 0.2, 0.08, { color: c, top: shade(c, 1.2) });
  b.box(0.06, 0.13, 0.004, { color: 0x6ad8ff, mat: Mat.Holo, y: 0.04, z: 0.041 });
  b.box(0.07, 0.02, 0.004, { color: NEON_CYAN, mat: Mat.Glow, y: 0.18, z: 0.041 });
  b.box(0.004, 0.13, 0.06, { color: 0x9ac8e0, y: 0.04, x: 0.041, paint: false });
  b.dome(0.035, { color: 0xffe0a0, mat: Mat.Light, wSeg: 6, hSeg: 2, y: 0.2, flat: true });
};

// ───────────────────────────────────────────────────────────── lights

const lampClassic: MeshFactory = ({ b }) => {
  b.cyl(0.022, 0.028, 0.03, { color: IRON, seg: 6, flat: true });
  post(b, 0.28, IRON, 0, 0, 0.008, 6);
  b.cyl(0.018, 0.014, 0.012, { color: IRON, seg: 6, y: 0.28, flat: true });
  b.box(0.03, 0.04, 0.03, { color: 0xffe2a8, mat: Mat.Light, y: 0.292 });
  b.pyramid(0.044, 0.026, 0.044, { color: IRON, y: 0.332 });
  b.box(0.004, 0.04, 0.034, { color: IRON, y: 0.292, ...D });
  b.box(0.034, 0.04, 0.004, { color: IRON, y: 0.292, ...D });
};

const lampNeo: MeshFactory = ({ b }) => {
  const w = 0xf2f4f8;
  b.cyl(0.03, 0.035, 0.012, { color: w, seg: 8, flat: true });
  b.cyl(0.008, 0.012, 0.26, { color: w, seg: 8, y: 0.012, rz: 0.08, capTop: false });
  b.group({ x: -0.022, y: 0.27 }, () => {
    b.torus(0.04, 0.008, { color: NEON_CYAN, mat: Mat.Glow, seg: 10, tube: 3, rx: Math.PI / 2 - 0.2 });
    b.sphere(0.02, { color: 0xe0f8ff, mat: Mat.Light, wSeg: 6, hSeg: 3 });
  });
};

const lampCyber: MeshFactory = ({ b }) => {
  const c = 0x22252e;
  b.box(0.05, 0.02, 0.05, { color: c });
  b.box(0.022, 0.3, 0.022, { color: c, y: 0.02 });
  b.box(0.006, 0.26, 0.006, { color: NEON_PINK, mat: Mat.Glow, y: 0.04, z: 0.012 });
  b.box(0.12, 0.014, 0.03, { color: c, y: 0.31, x: 0.04 });
  b.box(0.1, 0.006, 0.024, { color: 0xc8f0ff, mat: Mat.Light, y: 0.304, x: 0.045, bottom: true });
  b.box(0.1, 0.004, 0.004, { color: NEON_CYAN, mat: Mat.Glow, y: 0.325, x: 0.045, z: 0.015, ...D });
};

const lanterns: MeshFactory = ({ b }) => {
  for (const x of [-0.14, 0.14]) post(b, 0.22, WOOD_D, x, 0, 0.008, 4);
  b.box(0.28, 0.003, 0.003, { color: 0x333333, y: 0.2 });
  const cols = [0xff6a4a, 0xffd04a, 0x6ad0ff, 0xff8ad0];
  cols.forEach((c, i) => {
    const x = -0.09 + i * 0.06;
    b.sphere(0.022, { color: c, mat: Mat.Light, wSeg: 5, hSeg: 3, x, y: 0.165, sy: 1.2, flat: true });
  });
};

const campfire: MeshFactory = ({ b }) => {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(0.03, 0.025, 0.025, { color: 0x8a8478, x: Math.cos(a) * 0.075, z: Math.sin(a) * 0.075, ry: a });
  }
  for (let i = 0; i < 3; i++) b.cyl(0.012, 0.012, 0.1, { color: WOOD_D, seg: 4, rz: Math.PI / 2 - 0.25, ry: (i * Math.PI * 2) / 3, y: 0.012, x: 0, flat: true, capTop: true });
  b.cone(0.04, 0.09, { color: 0xff7a20, mat: Mat.Lava, seg: 5, y: 0.01, flat: true });
  b.cone(0.022, 0.12, { color: 0xffc040, mat: Mat.Lava, seg: 4, y: 0.01, x: 0.012, flat: true, ...D });
  b.box(0.04, 0.025, 0.004, { color: WOOD, x: 0.12, z: 0.05, ry: 0.4, ...D });
};

const torches: MeshFactory = ({ b }) => {
  for (const x of [-0.08, 0.08]) {
    b.cyl(0.008, 0.01, 0.24, { color: 0xb08a4a, seg: 5, x, capTop: false, flat: true });
    b.cyl(0.016, 0.01, 0.03, { color: 0x6a4a2a, seg: 5, x, y: 0.24, flat: true });
    b.cone(0.016, 0.06, { color: 0xffa030, mat: Mat.Lava, seg: 4, x, y: 0.27, flat: true });
  }
};

const searchlight: MeshFactory = ({ b }) => {
  b.cyl(0.06, 0.07, 0.03, { color: 0x4a505a, seg: 8, flat: true });
  b.box(0.012, 0.06, 0.012, { color: 0x4a505a, y: 0.03, x: 0.03 });
  b.box(0.012, 0.06, 0.012, { color: 0x4a505a, y: 0.03, x: -0.03 });
  b.group({ y: 0.08, rx: -0.5 }, () => {
    b.cyl(0.03, 0.026, 0.08, { color: 0x5a606a, seg: 8, y: -0.04, flat: true, top: 0xfff2d0, topMat: Mat.Light });
    b.cyl(0.018, 0.06, 0.5, { color: 0xbfe8ff, mat: Mat.Holo, seg: 6, y: 0.042, capTop: false, flat: true, ...D });
  });
};

// ───────────────────────────────────────────────────────────── art & monuments

const statue: MeshFactory = ({ b }) => {
  plinth(b, 0.09, 0.1);
  const bronze = 0x9a7446;
  b.group({ y: 0.1 }, () => {
    b.box(0.045, 0.08, 0.03, { color: bronze });
    b.box(0.055, 0.075, 0.035, { color: bronze, y: 0.08 });
    b.sphere(0.02, { color: bronze, wSeg: 6, hSeg: 4, y: 0.175, flat: true });
    b.box(0.014, 0.08, 0.014, { color: bronze, x: 0.032, y: 0.13, rz: -0.35 });
    b.box(0.014, 0.06, 0.014, { color: bronze, x: -0.032, y: 0.1, rz: 0.15 });
    b.box(0.07, 0.01, 0.07, { color: shade(bronze, 0.8), y: -0.002, ...D });
  });
};

const robotStatue: MeshFactory = ({ b }) => {
  plinth(b, 0.1, 0.06, 0x8a929c);
  const m = 0xb8c0ca;
  b.group({ y: 0.06 }, () => {
    for (const x of [-0.02, 0.02]) b.box(0.022, 0.07, 0.03, { color: shade(m, 0.85), x });
    b.box(0.08, 0.07, 0.05, { color: m, y: 0.07 });
    b.box(0.04, 0.012, 0.004, { color: NEON_CYAN, mat: Mat.Glow, y: 0.11, z: 0.026 });
    for (const x of [-0.05, 0.05]) b.box(0.016, 0.06, 0.02, { color: shade(m, 0.85), x, y: 0.08, rz: x > 0 ? -0.5 : 0.2 });
    b.box(0.05, 0.04, 0.045, { color: m, y: 0.142 });
    for (const x of [-0.012, 0.012]) b.box(0.01, 0.008, 0.004, { color: 0xff4a4a, mat: Mat.Glow, x, y: 0.165, z: 0.023 });
    b.box(0.004, 0.035, 0.004, { color: m, y: 0.182, ...D });
    b.box(0.012, 0.012, 0.012, { color: 0xff4040, mat: Mat.Light, y: 0.215, ...D });
  });
};

const fountain: MeshFactory = ({ b }) => {
  b.cyl(0.24, 0.25, 0.04, { color: STONE, seg: 10, flat: true, top: STONE_D });
  b.cyl(0.215, 0.215, 0.006, { color: 0x4aa8d8, mat: Mat.Water, seg: 10, y: 0.04, flat: true });
  b.cyl(0.03, 0.04, 0.14, { color: STONE, seg: 6, y: 0.05, flat: true });
  b.cyl(0.09, 0.05, 0.03, { color: STONE, seg: 8, y: 0.17, flat: true, top: 0x4aa8d8, topMat: Mat.Water });
  b.cone(0.02, 0.08, { color: 0x8ad0f0, mat: Mat.Water, seg: 5, y: 0.2, flat: true });
  b.cyl(0.1, 0.07, 0.07, { color: 0x8ad0f0, mat: Mat.Water, seg: 8, y: 0.12, capTop: false, flat: true, ...D });
};

const sculpture: MeshFactory = ({ b }) => {
  plinth(b, 0.08, 0.06, 0xe8e8e8);
  b.torus(0.075, 0.016, { color: 0xff6a3a, seg: 10, tube: 4, y: 0.15, rx: Math.PI / 2 - 0.3, ry: 0.5, flat: true });
  b.sphere(0.03, { color: 0x3a8aff, wSeg: 6, hSeg: 3, y: 0.15, flat: true });
  b.box(0.012, 0.06, 0.012, { color: 0x2a2a2a, y: 0.06 });
};

const monolith: MeshFactory = ({ b }) => {
  b.box(0.14, 0.012, 0.08, { color: 0x3a3a40 });
  b.box(0.08, 0.36, 0.02, { color: 0x0a0a0e, y: 0.012, top: 0x0a0a0e });
  for (let i = 0; i < 3; i++) b.box(0.06, 0.004, 0.022, { color: 0x7affff, mat: Mat.Glow, y: 0.09 + i * 0.1, z: 0 });
  b.box(0.004, 0.32, 0.022, { color: 0x7a5aff, mat: Mat.Glow, x: 0.041, y: 0.03, ...D });
};

const totem: MeshFactory = ({ b }) => {
  const cols = [0xc0503a, 0x3a8a6a, 0xe0b040, 0x3a5ac0];
  for (let i = 0; i < 4; i++) {
    b.box(0.07, 0.07, 0.07, { color: cols[i], y: i * 0.07 });
    b.panel(0.05, 0.012, { color: 0x1a1a1a, y: i * 0.07 + 0.016, z: 0.0355, ...D });
    b.panel(0.014, 0.014, { color: 0xffffff, x: -0.016, y: i * 0.07 + 0.042, z: 0.0355, ...D });
    b.panel(0.014, 0.014, { color: 0xffffff, x: 0.016, y: i * 0.07 + 0.042, z: 0.0355, ...D });
  }
  b.wedge(0.2, 0.05, 0.03, { color: 0xe0b040, y: 0.28, z: -0.005 });
};

const cascade: MeshFactory = ({ b }) => {
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    const w = 0.24 - i * 0.05, h = 0.05 + i * 0.05;
    b.box(w, h, 0.1 - i * 0.015, { color: STONE, z: -i * 0.03, top: 0x5ab8e0, topMat: Mat.Water });
    b.box(w * 0.7, h, 0.004, { color: 0x8ad8f8, mat: Mat.Water, z: -i * 0.03 + (0.05 - i * 0.0075) + 0.002, ...D });
  }
  b.cyl(0.16, 0.16, 0.02, { color: STONE_D, seg: 8, z: 0.08, flat: true, top: 0x4aa8d8, topMat: Mat.Water });
};

const pond: MeshFactory = ({ b, rng }) => {
  b.cyl(0.22, 0.24, 0.015, { color: STONE_D, seg: 8, flat: true, sx: 1.25 });
  b.cyl(0.2, 0.2, 0.006, { color: 0x2a8ab0, mat: Mat.Water, seg: 8, y: 0.012, flat: true, sx: 1.25 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    b.box(0.05, 0.03, 0.04, { color: shade(STONE, rng.range(0.85, 1.05)), x: Math.cos(a) * 0.26, z: Math.sin(a) * 0.21, ry: a });
  }
  for (const [x, z] of [[0.08, 0.05], [-0.1, -0.04]]) b.cyl(0.03, 0.03, 0.004, { color: 0x4a9a3a, seg: 5, x, z, y: 0.02, flat: true, ...D });
  b.box(0.035, 0.005, 0.012, { color: 0xff7a2a, x: 0.0, z: -0.06, y: 0.016, ry: 0.5, ...D });
};

const gnome: MeshFactory = ({ b }) => {
  b.cyl(0.028, 0.03, 0.035, { color: 0x3a5ad0, seg: 6, flat: true });
  b.sphere(0.018, { color: 0xf0c8a0, wSeg: 6, hSeg: 3, y: 0.05, flat: true, paint: false });
  b.cone(0.022, 0.05, { color: 0xffffff, seg: 5, y: 0.012, z: 0.012, rx: -0.15, flat: true, paint: false });
  b.cone(0.022, 0.05, { color: 0xe0302a, seg: 6, y: 0.06, flat: true });
  b.sphere(0.006, { color: 0xff8a7a, wSeg: 3, hSeg: 2, y: 0.05, z: 0.018, ...D });
};

const obelisk: MeshFactory = ({ b }) => {
  b.box(0.12, 0.025, 0.12, { color: 0xcdbb94 });
  b.cyl(0.03, 0.045, 0.32, { color: 0xbcab84, seg: 4, y: 0.025, ry: Math.PI / 4, flat: true, capTop: false });
  b.pyramid(0.043, 0.05, 0.043, { color: 0xd8c8a0, y: 0.345 });
  for (let i = 0; i < 4; i++) b.box(0.03, 0.012, 0.004, { color: 0x5afff0, mat: Mat.Glow, y: 0.08 + i * 0.06, z: 0.04 - i * 0.003 });
};

const astronaut: MeshFactory = ({ b }) => {
  plinth(b, 0.09, 0.06, 0x8a929c);
  b.group({ y: 0.06 }, () => {
    for (const x of [-0.016, 0.016]) b.box(0.02, 0.06, 0.024, { color: WHITE, x });
    b.box(0.06, 0.07, 0.04, { color: WHITE, y: 0.06 });
    b.box(0.045, 0.05, 0.02, { color: 0xd0d4da, y: 0.07, z: -0.03 });
    b.sphere(0.028, { color: WHITE, wSeg: 6, hSeg: 4, y: 0.155, flat: true });
    b.box(0.032, 0.02, 0.008, { color: 0xffc040, mat: Mat.Glow, y: 0.15, z: 0.023 });
    b.box(0.014, 0.06, 0.014, { color: WHITE, x: 0.04, y: 0.11, rz: -0.9 });
    b.box(0.004, 0.08, 0.004, { color: 0xcccccc, x: 0.08, y: 0.14, ...D });
    b.panel(0.05, 0.03, { color: 0x3a6ad0, x: 0.105, y: 0.19, both: true, ...D });
  });
};

// ───────────────────────────────────────────────────────────── signs & flags

const flag: MeshFactory = ({ b }) => {
  post(b, 0.4, 0xdedede, 0, 0, 0.006, 5);
  b.sphere(0.009, { color: BRASS, wSeg: 4, hSeg: 2, y: 0.405, flat: true, paint: false });
  b.panel(0.12, 0.075, { color: 0xe0303a, x: 0.06, y: 0.31, both: true });
  b.panel(0.12, 0.025, { color: 0xffffff, x: 0.06, y: 0.335, z: 0.001, both: true, ...D });
};

const banner: MeshFactory = ({ b }) => {
  for (const x of [-0.08, 0.08]) {
    post(b, 0.32, 0x3a3f48, x, 0, 0.006, 4);
    b.box(0.05, 0.004, 0.004, { color: 0x3a3f48, x: x + 0.025, y: 0.3 });
    b.panel(0.04, 0.16, { color: x < 0 ? 0x3a6ad0 : 0xf0b030, x: x + 0.028, y: 0.14, both: true });
    b.panel(0.03, 0.02, { color: 0xffffff, x: x + 0.028, y: 0.24, z: 0.001, both: true, ...D });
  }
};

const neonSign: MeshFactory = ({ b }) => {
  post(b, 0.12, 0x2a2e36, 0, 0, 0.008, 4);
  b.box(0.18, 0.12, 0.012, { color: 0x15161c, y: 0.12 });
  // a glowing cocktail glass
  b.box(0.08, 0.008, 0.004, { color: NEON_PINK, mat: Mat.Glow, y: 0.215, z: 0.008, x: -0.02 });
  b.box(0.008, 0.06, 0.004, { color: NEON_PINK, mat: Mat.Glow, y: 0.16, z: 0.008, x: -0.045, rz: 0.55 });
  b.box(0.008, 0.06, 0.004, { color: NEON_PINK, mat: Mat.Glow, y: 0.16, z: 0.008, x: 0.005, rz: -0.55 });
  b.box(0.006, 0.04, 0.004, { color: NEON_PINK, mat: Mat.Glow, y: 0.135, z: 0.008, x: -0.02 });
  b.box(0.04, 0.006, 0.004, { color: NEON_PINK, mat: Mat.Glow, y: 0.132, z: 0.008, x: -0.02 });
  // OPEN bar
  b.box(0.045, 0.02, 0.004, { color: NEON_CYAN, mat: Mat.Glow, y: 0.17, z: 0.008, x: 0.055 });
  b.box(0.17, 0.004, 0.004, { color: 0xfff04a, mat: Mat.Glow, y: 0.236, z: 0.007, ...D });
};

const holoBoard: MeshFactory = ({ b }) => {
  for (const x of [-0.14, 0.14]) b.box(0.016, 0.3, 0.016, { color: 0x3a3f48, x });
  b.box(0.3, 0.012, 0.03, { color: 0x3a3f48, y: 0.12 });
  b.panel(0.26, 0.15, { color: 0x4ad8ff, mat: Mat.Holo, y: 0.14, both: true });
  b.box(0.3, 0.008, 0.02, { color: NEON_PINK, mat: Mat.Glow, y: 0.295 });
  b.box(0.26, 0.004, 0.012, { color: 0x9a5aff, mat: Mat.Glow, y: 0.132, ...D });
};

const signpost: MeshFactory = ({ b }) => {
  post(b, 0.26, WOOD_D, 0, 0, 0.009, 4);
  const cols = [0x3a8a4a, 0x3a5ac0, 0xc0503a];
  cols.forEach((c, i) => {
    b.group({ y: 0.21 - i * 0.05, ry: [0.3, 2.1, -1.2][i] }, () => {
      b.box(0.1, 0.03, 0.008, { color: c, x: 0.045 });
      b.box(0.022, 0.022, 0.008, { color: c, x: 0.1, rz: Math.PI / 4 });
      b.box(0.06, 0.005, 0.009, { color: 0xffffff, x: 0.04, ...D });
    });
  });
  b.pyramid(0.02, 0.02, 0.02, { color: WOOD_D, y: 0.26 });
};

// ───────────────────────────────────────────────────────────── sci-fi

const antenna: MeshFactory = ({ b }) => {
  const c = 0xb8bec8;
  for (const [x, z] of [[0.04, 0.03], [-0.04, 0.03], [0, -0.045]]) b.box(0.008, 0.36, 0.008, { color: c, x, z, rx: -z * 0.18, rz: x * 0.18 * 1.5 });
  for (let i = 1; i < 4; i++) b.cyl(0.05 - i * 0.01, 0.05 - i * 0.01, 0.004, { color: c, seg: 3, y: i * 0.08, capTop: false, flat: true, ...D });
  b.group({ y: 0.36 }, () => post(b, 0.12, c, 0, 0, 0.004, 3));
  b.box(0.016, 0.016, 0.016, { color: 0xff3030, mat: Mat.Light, y: 0.48 });
  b.box(0.05, 0.004, 0.004, { color: c, y: 0.42, ...D });
  b.box(0.004, 0.004, 0.05, { color: c, y: 0.44, ...D });
};

const dish: MeshFactory = ({ b }) => {
  b.box(0.08, 0.04, 0.08, { color: 0x8a929c });
  b.cyl(0.015, 0.02, 0.06, { color: 0xb8c0ca, seg: 6, y: 0.04, flat: true });
  b.group({ y: 0.11, rx: -0.75 }, () => {
    b.lathe([[0.005, -0.01], [0.06, 0.0], [0.11, 0.03], [0.13, 0.05]], { color: WHITE, seg: 10, flat: true });
    b.cyl(0.004, 0.004, 0.09, { color: 0x8a929c, seg: 3, y: 0.0, capTop: false, ...D });
    b.box(0.016, 0.02, 0.016, { color: 0x6a6f78, y: 0.09 });
    b.box(0.008, 0.008, 0.008, { color: 0x40ff80, mat: Mat.Glow, y: 0.105, ...D });
  });
};

const holoGlobe: MeshFactory = ({ b }) => {
  b.cyl(0.06, 0.08, 0.05, { color: 0x3a3f48, seg: 8, flat: true, top: 0x2a2e36 });
  b.cyl(0.05, 0.05, 0.006, { color: NEON_CYAN, mat: Mat.Glow, seg: 8, y: 0.05, flat: true });
  b.sphere(0.07, { color: 0x4ad8ff, mat: Mat.Holo, wSeg: 7, hSeg: 4, y: 0.14 });
  b.torus(0.095, 0.005, { color: 0xb07aff, mat: Mat.Glow, seg: 9, tube: 3, y: 0.14, rx: 0.4, ...D });
};

const dronePad: MeshFactory = ({ b }) => {
  b.cyl(0.22, 0.24, 0.025, { color: 0x4a505a, seg: 6, flat: true, top: 0x3a3f48 });
  b.box(0.024, 0.004, 0.14, { color: 0xffd23a, mat: Mat.Glow, y: 0.026, x: -0.045 });
  b.box(0.024, 0.004, 0.14, { color: 0xffd23a, mat: Mat.Glow, y: 0.026, x: 0.045 });
  b.box(0.07, 0.004, 0.024, { color: 0xffd23a, mat: Mat.Glow, y: 0.026 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    b.box(0.016, 0.01, 0.016, { color: 0x6ad8ff, mat: Mat.Light, x: Math.cos(a) * 0.2, z: Math.sin(a) * 0.2, y: 0.025, ...D });
  }
  // a parked delivery drone
  b.group({ y: 0.03, x: 0.06, z: 0.06, ry: 0.4 }, () => {
    b.box(0.05, 0.02, 0.05, { color: 0xf0f0f0 });
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.plane(0.034, 0.034, { color: 0x2a2a2a, x: x * 0.035, z: z * 0.035, y: 0.022, ry: 0.78, ...D });
  });
};

const crystalShard: MeshFactory = ({ b }) => {
  const c = 0x9a7aff;
  b.group({ rz: 0.1 }, () => {
    b.prism(6, 0.05, 0.28, { color: mix(c, 0xffffff, 0.35) });
    b.cone(0.05, 0.1, { color: mix(c, 0xffffff, 0.15), mat: Mat.Glow, seg: 6, y: 0.28, flat: true });
  });
  b.group({ rz: 0.55, x: 0.05 }, () => {
    b.prism(5, 0.03, 0.14, { color: mix(0x4ad0ff, 0xffffff, 0.35) });
    b.cone(0.03, 0.06, { color: 0x8ae8ff, mat: Mat.Glow, seg: 5, y: 0.14, flat: true });
  });
  b.group({ rz: -0.6, x: -0.04, rx: 0.3 }, () => {
    b.prism(5, 0.025, 0.11, { color: mix(0xff6ad8, 0xffffff, 0.35) });
    b.cone(0.025, 0.05, { color: 0xffa8ec, mat: Mat.Glow, seg: 5, y: 0.11, flat: true });
  });
  b.cyl(0.1, 0.12, 0.01, { color: 0x4a3a8a, mat: Mat.Glow, seg: 8, flat: true, ...D });
};

const teleporter: MeshFactory = ({ b }) => {
  b.cyl(0.17, 0.19, 0.03, { color: 0x3a3f4a, seg: 10, flat: true, top: 0x2a2e38 });
  b.cyl(0.14, 0.14, 0.012, { color: NEON_CYAN, mat: Mat.Glow, seg: 10, y: 0.03, capTop: false, flat: true });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(0.03, 0.2, 0.03, { color: 0x5a606a, x: Math.cos(a) * 0.17, z: Math.sin(a) * 0.17, ry: -a });
    b.box(0.02, 0.03, 0.02, { color: 0xb07aff, mat: Mat.Glow, x: Math.cos(a) * 0.165, z: Math.sin(a) * 0.165, y: 0.2 });
  }
  b.cyl(0.11, 0.06, 0.32, { color: 0x6ae8ff, mat: Mat.Holo, seg: 8, y: 0.035, capTop: false, flat: true, ...D });
};

const charger: MeshFactory = ({ b }) => {
  b.box(0.05, 0.2, 0.04, { color: WHITE, top: 0xdfe4ea });
  b.box(0.036, 0.05, 0.004, { color: 0x111111, mat: Mat.Screen, y: 0.12, z: 0.021 });
  b.box(0.05, 0.008, 0.042, { color: 0x40ff90, mat: Mat.Glow, y: 0.19 });
  b.box(0.01, 0.06, 0.01, { color: IRON, y: 0.04, z: 0.03, rx: 0.5 });
  b.cyl(0.12, 0.12, 0.004, { color: 0x40ff90, mat: Mat.Glow, seg: 10, z: 0.12, flat: true, ...D });
};

const serviceBot: MeshFactory = ({ b }) => {
  for (const x of [-0.03, 0.03]) b.cyl(0.018, 0.018, 0.012, { color: IRON, seg: 8, rz: Math.PI / 2, x, y: 0.018, flat: true, paint: false });
  b.sphere(0.05, { color: 0xf2f2f2, wSeg: 6, hSeg: 4, y: 0.065, sy: 0.85, flat: true });
  b.dome(0.03, { color: 0xd0d6de, wSeg: 6, hSeg: 2, y: 0.1, flat: true });
  b.box(0.04, 0.012, 0.006, { color: NEON_CYAN, mat: Mat.Glow, y: 0.08, z: 0.046 });
  b.box(0.004, 0.03, 0.004, { color: 0x8a929c, y: 0.128, ...D });
  b.box(0.01, 0.01, 0.01, { color: 0xff4040, mat: Mat.Light, y: 0.16, ...D });
};

// ───────────────────────────────────────────────────────────── rocks

const boulder: MeshFactory = ({ b, rng }) => {
  b.sphere(0.13, { color: 0x8f8a7e, wSeg: 6, hSeg: 4, flat: true, y: 0.06, sx: 1.25, sy: 0.75, ry: rng.range(0, 3) });
  b.sphere(0.06, { color: 0x9f9a8e, wSeg: 5, hSeg: 3, flat: true, x: 0.14, z: 0.05, y: 0.02, sy: 0.7 });
  b.cone(0.05, 0.02, { color: 0x5a9a3a, seg: 5, x: -0.1, z: 0.08, flat: true, mat: Mat.Foliage, paint: true, ...D });
};

const zen: MeshFactory = ({ b }) => {
  b.box(0.36, 0.02, 0.26, { color: WOOD_D });
  b.box(0.33, 0.022, 0.23, { color: 0xe8e0cc, paint: false });
  for (let i = 0; i < 5; i++) b.box(0.3, 0.003, 0.006, { color: 0xcfc6b0, y: 0.022, z: -0.09 + i * 0.045, paint: false, ...D });
  b.sphere(0.05, { color: 0x6a6660, wSeg: 5, hSeg: 3, flat: true, x: 0.08, y: 0.03, sy: 0.7 });
  b.sphere(0.03, { color: 0x7a766e, wSeg: 5, hSeg: 3, flat: true, x: -0.09, z: 0.05, y: 0.025, sy: 0.8 });
  b.cone(0.04, 0.04, { color: 0x3a8a3a, seg: 5, x: -0.11, z: -0.07, y: 0.02, flat: true, mat: Mat.Foliage, paint: true });
};

// ───────────────────────────────────────────────────────────── seasonal

const snowman: MeshFactory = ({ b }) => {
  const s = 0xf6f9ff;
  b.sphere(0.07, { color: s, wSeg: 6, hSeg: 3, y: 0.06, flat: true, paint: false });
  b.sphere(0.05, { color: s, wSeg: 6, hSeg: 3, y: 0.15, flat: true, paint: false });
  b.sphere(0.035, { color: s, wSeg: 6, hSeg: 3, y: 0.22, flat: true, paint: false });
  b.cone(0.009, 0.04, { color: 0xff8a2a, seg: 4, y: 0.222, z: 0.03, rx: Math.PI / 2, flat: true, paint: false });
  b.cyl(0.03, 0.03, 0.006, { color: 0x1a1a1a, seg: 6, y: 0.245, flat: true });
  b.cyl(0.022, 0.022, 0.04, { color: 0x1a1a1a, seg: 6, y: 0.25, flat: true });
  b.cyl(0.042, 0.046, 0.016, { color: 0xe0302a, seg: 6, y: 0.18, capTop: false, flat: true, ...D });
};

const festiveTree: MeshFactory = ({ b }) => {
  b.cyl(0.03, 0.03, 0.05, { color: 0x6a4a32, seg: 5, flat: true });
  const g = 0x2a7a3a;
  for (let i = 0; i < 3; i++) b.cone(0.16 - i * 0.04, 0.17, { color: shade(g, 1 + i * 0.06), mat: Mat.Foliage, paint: true, seg: 7, y: 0.05 + i * 0.1, flat: true });
  b.box(0.035, 0.035, 0.012, { color: 0xffe04a, mat: Mat.Glow, y: 0.4, rz: Math.PI / 4 });
  const balls = [0xff3a3a, 0x3a8aff, 0xffd23a, 0xff3a3a];
  balls.forEach((c, i) => {
    const a = i * 2.2, r = 0.11 - (i % 3) * 0.03, y = 0.1 + (i % 3) * 0.09;
    b.box(0.018, 0.018, 0.018, { color: c, mat: Mat.Glow, x: Math.cos(a) * r, z: Math.sin(a) * r, y });
  });
  for (let i = 0; i < 3; i++) b.box(0.02, 0.012, 0.016, { color: [0xe0302a, 0x3a8a4a, 0xf0c030][i], x: -0.06 + i * 0.06, z: 0.12, ...D });
};

const pumpkin: MeshFactory = ({ b }) => {
  b.lathe([[0.001, 0], [0.07, 0.015], [0.085, 0.05], [0.07, 0.09], [0.012, 0.1]], { color: 0xf07a1a, seg: 8, flat: true });
  b.cyl(0.008, 0.012, 0.03, { color: 0x4a6a2a, seg: 4, y: 0.095, flat: true, rz: 0.2 });
  b.box(0.022, 0.018, 0.006, { color: 0xffb020, mat: Mat.Lava, x: -0.028, y: 0.06, z: 0.078, rz: 0.4 });
  b.box(0.022, 0.018, 0.006, { color: 0xffb020, mat: Mat.Lava, x: 0.028, y: 0.06, z: 0.078, rz: -0.4 });
  b.box(0.05, 0.012, 0.006, { color: 0xffb020, mat: Mat.Lava, y: 0.035, z: 0.08 });
};

const springEgg: MeshFactory = ({ b }) => {
  b.lathe([[0.001, 0], [0.05, 0.01], [0.075, 0.06], [0.07, 0.12], [0.045, 0.17], [0.001, 0.19]], { color: 0x8ad0ff, seg: 8 });
  b.cyl(0.077, 0.077, 0.016, { color: 0xff7ab0, seg: 8, y: 0.052, capTop: false, ...D });
  b.cyl(0.072, 0.073, 0.016, { color: 0xffe04a, seg: 8, y: 0.104, capTop: false, ...D });
  b.cyl(0.08, 0.08, 0.01, { color: 0x5a9a3a, seg: 8, flat: true, mat: Mat.Foliage, paint: true });
};

const gifts: MeshFactory = ({ b }) => {
  const set: [number, number, number, number, number, number][] = [
    [0.1, 0.08, 0.1, 0, 0, 0xe0302a],
    [0.07, 0.07, 0.07, 0.09, 0.02, 0x3a8a4a],
    [0.06, 0.05, 0.06, 0.01, 0.0, 0x3a6ad0],
  ];
  set.forEach(([w, h, d, x, z, c], i) => {
    const y = i === 2 ? 0.08 : 0;
    b.box(w, h, d, { color: c, x, z, y, ry: i * 0.4 });
    b.box(w + 0.004, h + 0.002, 0.014, { color: 0xffd23a, x, z, y, ry: i * 0.4 });
    b.box(0.014, h + 0.002, d + 0.004, { color: 0xffd23a, x, z, y, ry: i * 0.4, ...D });
  });
};

/** Every decor mesh by short id (items/decor.ts maps these onto ItemDefs). */
export const DECOR_MESHES: Record<string, MeshFactory> = {
  hedge,
  flowerbed,
  planter,
  topiary,
  shrubs,
  glowshrooms,
  bamboo,
  bench,
  picnic,
  busstop,
  mailbox,
  bikerack,
  bins,
  foodcart,
  kiosk,
  stall,
  slide,
  swings,
  hydrant,
  phonebooth,
  lampClassic,
  lampNeo,
  lampCyber,
  lanterns,
  campfire,
  torches,
  searchlight,
  statue,
  robotStatue,
  fountain,
  sculpture,
  monolith,
  totem,
  cascade,
  pond,
  gnome,
  obelisk,
  astronaut,
  flag,
  banner,
  neonSign,
  holoBoard,
  signpost,
  antenna,
  dish,
  holoGlobe,
  dronePad,
  crystalShard,
  teleporter,
  charger,
  serviceBot,
  boulder,
  zen,
  snowman,
  festiveTree,
  pumpkin,
  springEgg,
  gifts,
};
