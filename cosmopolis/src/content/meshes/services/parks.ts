/**
 * services · parks, gardens and small sports grounds (OWNER: services).
 *
 * Parks are the city's lungs and its softest silhouettes: layered Mat.Foliage trees (they sway and glow faintly
 * at night), cream paths, benches and warm lamps (Mat.Light) so every green space reads as inviting by day and
 * twinkles after dark. Small parks have three layout variants.
 */
import type { MeshContext } from '../../catalog';
import {
  C, G, TAU, FUN, Mat, lot, block, door, flag, lamp, tree, bush, bench, person, crowd, path, ringPath, pool, steps, flowers, hedge,
  ellipse, disc, fence, edging, softHex, type V2,
} from './parts';

// ─────────────────────────────────────────────────────────── neighbourhood parks

/** Pocket park — three layouts: formal cross, duck pond, picnic lawn with a gazebo. */
export function smallPark(ctx: MeshContext): void {
  const { b, rng, variant } = ctx;
  lot(b, 1, C.grass, { border: C.path });
  if (variant % 3 === 0) {
    path(b, 0, 0.82, 0, -0.82, 0.13);
    path(b, -0.72, 0, 0.72, 0, 0.13);
    disc(b, 0.2, 0.04, C.stone, { y: G, seg: 10, top: 0x6a4a32 });
    flowers(b, 0, 0, 0.17, 0xff7ab8, G + 0.04, false);
    b.cyl(0.03, 0.035, 0.16, { color: 0xe8e2d6, seg: 6, y: G + 0.04 });
    b.sphere(0.035, { color: 0xffd04a, mat: Mat.Glow, y: G + 0.22, wSeg: 6, hSeg: 4 });
    for (const [x, z, k] of [[-0.38, -0.36, 'round'], [0.38, -0.36, 'blossom'], [-0.4, 0.34, 'blossom'], [0.4, 0.34, 'round']] as const) tree(b, x, z, 1.05, k, rng);
    bench(b, -0.22, 0.11, 0);
    bench(b, 0.22, -0.11, Math.PI);
    lamp(b, 0.12, 0.3);
    lamp(b, -0.12, -0.3);
    hedge(b, -0.5, 0, 0.04, 0.3);
    hedge(b, 0.5, 0, 0.04, 0.3);
    for (const [x, z, c] of [[-0.2, -0.58, 0xffcf3a], [0.2, 0.58, 0xff7ab8], [0.58, -0.15, 0xffffff], [-0.58, 0.15, 0xc89aff]] as const) flowers(b, x, z, 0.07, c);
    for (const [x, z] of [[-0.62, -0.32], [0.62, 0.32], [0.18, -0.62], [-0.18, 0.62]] as const) bush(b, x, z, 0.06, 0x4f9a3a);
  } else if (variant % 3 === 1) {
    const pond: V2[] = ellipse(0.62, 0.42, 12, 0.12, -0.12);
    pool(b, ellipse(0.7, 0.5, 12, 0.12, -0.12), pond, 0.02, 0xb8b0a0);
    for (let i = 0; i < 3; i++) b.box(0.035, 0.02, 0.05, { color: 0xf8f8f4, top: 0xf8f8f4, x: 0.05 + i * 0.1, y: G + 0.022, z: -0.1 + (i % 2) * 0.08, ry: i, detail: true, paint: false });
    path(b, -0.7, 0.3, -0.15, 0.32, 0.12);
    path(b, -0.15, 0.32, 0.45, 0.55, 0.12);
    tree(b, -0.42, -0.35, 1.25, 'round', rng);
    tree(b, 0.52, -0.38, 1.0, 'birch', rng);
    tree(b, 0.25, 0.38, 0.95, 'round', rng);
    for (let i = 0; i < 4; i++) bush(b, 0.45 + Math.sin(i) * 0.08, -0.05 + i * 0.05, 0.05, 0x5a9a3a);
    bench(b, -0.32, 0.42, Math.PI * 1.02);
    lamp(b, 0.0, 0.42);
    person(b, -0.1, 0.45, 0xe0453a);
    for (let i = 0; i < 5; i++) b.cyl(0.006, 0.006, 0.09, { color: 0x6a9a3a, seg: 3, x: -0.2 + i * 0.03, y: G, z: -0.36 - (i % 2) * 0.02, detail: true, paint: false });
    flowers(b, -0.62, -0.05, 0.07, 0xffcf3a);
    flowers(b, 0.6, 0.2, 0.06, 0xff7ab8);
    bush(b, -0.6, 0.35, 0.07, 0x4a8a3a);
  } else {
    tree(b, -0.18, -0.15, 1.8, 'round', rng);
    // gazebo
    b.group({ x: 0.36, y: G, z: 0.18 }, () => {
      b.cyl(0.2, 0.2, 0.03, { color: C.stone, seg: 6 });
      for (let i = 0; i < 6; i++) b.box(0.018, 0.18, 0.018, { color: 0xf4f0e6, x: Math.sin((i / 6) * TAU) * 0.17, y: 0.03, z: Math.cos((i / 6) * TAU) * 0.17 });
      b.cone(0.24, 0.12, { color: 0x5a7a9a, seg: 6, flat: true, y: 0.21 });
      b.box(0.04, 0.03, 0.04, { color: C.lamp, mat: Mat.Light, y: 0.17, paint: false });
    });
    for (const [x, z, r] of [[-0.42, 0.42, 0.4], [0.05, 0.5, -0.2]] as const) {
      b.group({ x, y: G, z, ry: r }, () => {
        b.box(0.18, 0.012, 0.09, { color: C.wood, y: 0.06, detail: true, paint: false });
        b.box(0.18, 0.012, 0.03, { color: C.woodDark, y: 0.03, z: 0.07, detail: true, paint: false });
        b.box(0.18, 0.012, 0.03, { color: C.woodDark, y: 0.03, z: -0.07, detail: true, paint: false });
        b.box(0.02, 0.06, 0.1, { color: C.woodDark, detail: true, paint: false });
      });
    }
    b.box(0.22, 0.004, 0.16, { color: 0xe0453a, x: 0.4, y: G + 0.004, z: -0.42, ry: 0.4, detail: true, paint: false });
    flowers(b, -0.55, -0.1, 0.08, 0xffcf3a);
    flowers(b, 0.6, -0.15, 0.07, 0xff7ab8);
    person(b, 0.35, -0.4, 0x3a7ae0, G, 0.05);
    person(b, 0.45, -0.45, 0xffcf3a, G, 0.05);
  }
}

/** Playground: rubber pad, slide tower, swings, climbing dome, seesaw, sandpit. */
export function playground(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.grass, { border: C.path });
  disc(b, 0.6, 0.012, 0xd8603a, { y: G, seg: 12 });
  // slide tower
  b.group({ x: -0.18, y: G + 0.012, z: -0.18 }, () => {
    for (let i = 0; i < 4; i++) b.box(0.02, 0.24, 0.02, { color: 0x3a7ae0, x: (i % 2 ? 1 : -1) * 0.08, z: (i < 2 ? 1 : -1) * 0.08 });
    b.box(0.2, 0.03, 0.2, { color: 0xffcf3a, y: 0.16 });
    b.pyramid(0.24, 0.12, 0.24, { color: 0xe0453a, y: 0.24 });
    b.wedge(0.08, 0.17, 0.3, { color: 0x4ac06a, y: 0, z: 0.25 });
  });
  // swings
  b.group({ x: 0.28, y: G + 0.012, z: -0.1, ry: 0.3 }, () => {
    for (const x of [-0.18, 0.18]) for (const s of [-1, 1]) b.box(0.016, 0.26, 0.016, { color: 0x9aa0aa, x, z: s * 0.06, rx: s * -0.22 });
    b.box(0.4, 0.02, 0.02, { color: 0x9aa0aa, y: 0.25 });
    for (const x of [-0.08, 0.08]) {
      b.box(0.004, 0.18, 0.004, { color: 0x6a6e78, x, y: 0.07, detail: true, paint: false });
      b.box(0.06, 0.01, 0.03, { color: FUN[x < 0 ? 0 : 2], x, y: 0.07, detail: true, paint: false });
    }
  });
  // climbing dome, seesaw, sandpit
  b.dome(0.14, { color: 0xff7ab8, x: -0.3, y: G + 0.012, z: 0.25, wSeg: 6, hSeg: 3, flat: true });
  b.group({ x: 0.25, y: G + 0.012, z: 0.3, ry: 0.9 }, () => {
    b.box(0.03, 0.04, 0.03, { color: 0x6a6e78 });
    b.box(0.32, 0.015, 0.04, { color: 0xffcf3a, y: 0.04, rz: 0.15 });
  });
  disc(b, 0.12, 0.018, C.sand, { x: 0.05, y: G + 0.01, z: 0.05, seg: 8 });
  for (let i = 0; i < 7; i++) person(b, rng.range(-0.45, 0.45), rng.range(-0.1, 0.45), rng.pick(FUN), G + 0.012, 0.045);
  bench(b, -0.55, -0.15, Math.PI / 2);
  bench(b, 0.55, 0.15, -Math.PI / 2);
  tree(b, 0.5, -0.45, 1, 'round', rng);
  tree(b, -0.52, -0.42, 0.9, 'round', rng);
  lamp(b, 0.0, -0.55);
}

/** Fountain plaza: tiered stone fountain with animated water, benches facing in, planters and lamps. */
export function plazaFountain(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, 0xdccfb4, { border: 0xbfae90 });
  ringPath(b, 0.5, 0.08, 0xc8b898, 14);
  disc(b, 0.34, 0.07, 0xd8d0c0, { y: G, seg: 14 });
  disc(b, 0.3, 0.006, C.water, { y: G + 0.068, seg: 14, mat: Mat.Water, topMat: Mat.Water });
  b.cyl(0.045, 0.06, 0.16, { color: 0xe8e2d6, seg: 8, y: G + 0.07 });
  b.lathe([[0.04, 0], [0.15, 0.04], [0.17, 0.065]], { color: 0xe8e2d6, seg: 10, y: G + 0.2 });
  disc(b, 0.15, 0.005, C.water, { y: G + 0.257, seg: 10, mat: Mat.Water, topMat: Mat.Water });
  b.cyl(0.02, 0.03, 0.12, { color: 0xe8e2d6, seg: 6, y: G + 0.26 });
  b.cyl(0.012, 0.03, 0.14, { color: 0xbfe8ff, mat: Mat.Water, seg: 6, y: G + 0.36 });
  b.sphere(0.05, { color: 0xbfe8ff, mat: Mat.Water, y: G + 0.5, sy: 0.7, wSeg: 6, hSeg: 4 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    bench(b, Math.sin(a) * 0.5, Math.cos(a) * 0.5, a + Math.PI, 0x8a6a4a);
    const a2 = (i / 4) * TAU;
    lamp(b, Math.sin(a2) * 0.62, Math.cos(a2) * 0.62, 0.3);
  }
  for (const a of [Math.PI / 6, (5 * Math.PI) / 6, (7 * Math.PI) / 6, (11 * Math.PI) / 6]) {
    const x = Math.sin(a) * 0.72, z = Math.cos(a) * 0.72;
    b.box(0.14, 0.07, 0.14, { color: 0xbfae90, x, y: G, z });
    tree(b, x, z, 0.75, 'topiary', rng, G + 0.07);
  }
  crowd(b, rng, 0, 0, 0.62, 6);
}

/** Dog park: fenced run with agility ramp, tunnel and hurdles, a hydrant and very good dogs. */
export function dogPark(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.grass, { border: C.path });
  fence(b, softHex(0.74, Math.PI / 6, 0.12), 0.07, 0xd8d8dc, true, G, 0.012, Mat.Plain);
  b.group({ x: -0.2, y: G, z: -0.2, ry: 0.5 }, () => {
    b.wedge(0.12, 0.14, 0.2, { color: 0xffcf3a, z: 0.1 });
    b.wedge(0.12, 0.14, 0.2, { color: 0x3a7ae0, z: -0.1, ry: Math.PI });
  });
  b.cyl(0.07, 0.07, 0.26, { color: 0xe0453a, seg: 8, arc: Math.PI, capBottom: true, x: 0.25, y: G, z: -0.25, rz: Math.PI / 2 });
  for (let i = 0; i < 3; i++) {
    const x = -0.35 + i * 0.18, z = 0.3;
    b.box(0.012, 0.07, 0.012, { color: 0xffffff, x: x - 0.05, y: G, z, detail: true });
    b.box(0.012, 0.07, 0.012, { color: 0xffffff, x: x + 0.05, y: G, z, detail: true });
    b.box(0.11, 0.012, 0.012, { color: 0xe0453a, x, y: G + 0.05, z, detail: true });
  }
  b.cyl(0.025, 0.03, 0.08, { color: C.fire, seg: 6, x: 0.42, y: G, z: 0.15 });
  for (let i = 0; i < 5; i++) {
    const x = rng.range(-0.45, 0.45), z = rng.range(-0.4, 0.45), ry = rng.next() * TAU;
    const col = rng.pick([0x8a5a3a, 0xf2e6d0, 0x2a2a2a, 0xd8a050]);
    b.group({ x, y: G, z, ry }, () => {
      b.box(0.03, 0.025, 0.07, { color: col, y: 0.02, detail: true, paint: false });
      b.box(0.025, 0.025, 0.03, { color: col, y: 0.04, z: 0.04, detail: true, paint: false });
    });
  }
  person(b, -0.05, 0.05, 0x3a7ae0);
  person(b, 0.1, -0.05, 0xe0453a);
  bench(b, 0.0, 0.55, Math.PI);
  tree(b, -0.5, 0.1, 1, 'round', rng);
  tree(b, 0.5, -0.4, 0.9, 'round', rng);
}

// ─────────────────────────────────────────────────────────── gardens

/** Community garden: raised beds, a tool shed, water barrel, sunflowers and a scarecrow robot. */
export function communityGarden(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.grass, { border: C.path });
  const greens = [0x5aaa44, 0x7ac055, 0x4a9a3a, 0x8ab84a];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 2; c++) {
      const x = -0.32 + c * 0.38, z = -0.3 + r * 0.24;
      b.box(0.3, 0.05, 0.14, { color: C.wood, top: 0x6a4a32, x, y: G, z, paint: false });
      b.box(0.27, 0.03, 0.11, { color: greens[(r + c) % 4], mat: Mat.Foliage, x, y: G + 0.05, z, paint: false });
      if ((r + c) % 2 === 0) for (let k = 0; k < 3; k++) b.box(0.025, 0.025, 0.025, { color: k % 2 ? 0xe0453a : 0xff9a2a, x: x - 0.08 + k * 0.08, y: G + 0.08, z, detail: true, paint: false });
    }
  // shed + barrel + compost
  b.box(0.2, 0.16, 0.16, { color: 0x9a6a42, x: 0.42, y: G, z: -0.25 });
  b.gable(0.2, 0.08, 0.16, { color: 0x4a6a3a, x: 0.42, y: G + 0.16, z: -0.25 });
  door(b, 0.42, -0.168, 0.07, 0.12, 0x5a3a22);
  b.cyl(0.045, 0.045, 0.1, { color: 0x3a7ae0, seg: 8, x: 0.5, y: G, z: 0.0 });
  b.box(0.12, 0.08, 0.12, { color: 0x5a3a22, x: 0.48, y: G, z: 0.2 });
  // sunflowers
  for (let i = 0; i < 4; i++) {
    const x = -0.55 + i * 0.06, z = 0.42 - i * 0.05;
    b.box(0.008, 0.2, 0.008, { color: 0x4a8a3a, x, y: G, z, detail: true, paint: false });
    b.cyl(0.03, 0.03, 0.01, { color: 0xffcf3a, top: 0x6a4a22, seg: 6, x, y: G + 0.2, z, rx: Math.PI / 2.4, detail: true, paint: false });
  }
  // scarecrow robot
  b.group({ x: 0.05, y: G, z: 0.42 }, () => {
    b.box(0.012, 0.18, 0.012, { color: 0x8a6a4a });
    b.box(0.06, 0.08, 0.04, { color: 0xc0c4cc, y: 0.12 });
    b.box(0.18, 0.015, 0.015, { color: 0x8a6a4a, y: 0.17 });
    b.box(0.05, 0.05, 0.05, { color: 0xd8dce4, y: 0.2 });
    b.box(0.035, 0.01, 0.01, { color: C.science, mat: Mat.Glow, y: 0.225, z: 0.026, paint: false });
    b.cone(0.05, 0.04, { color: 0xc8a84a, seg: 6, y: 0.25 });
  });
  person(b, -0.15, 0.25, 0x4ac06a);
  person(b, 0.25, 0.1, 0xffcf3a);
  tree(b, -0.55, -0.15, 0.9, 'round', rng);
}

/** Zen garden: raked gravel, moss rocks, koi pond, bonsai, stone lantern and a red torii gate. */
export function zenGarden(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, 0xe8e2d4, { border: 0x9a9286 });
  for (let i = 0; i < 7; i++) b.plane(1.0, 0.012, { color: 0xd4ccbc, x: -0.05, y: G + 0.003, z: -0.45 + i * 0.07, detail: true, paint: false });
  for (const [x, z, r] of [[-0.3, -0.25, 0.1], [-0.12, -0.32, 0.06], [0.2, -0.2, 0.08]] as const) {
    b.sphere(r, { color: 0x8a8680, x, y: G, z, sy: 0.7, wSeg: 5, hSeg: 3, flat: true });
    bush(b, x - r * 0.4, z + r * 0.5, r * 0.5, 0x4a7a3a);
  }
  pool(b, ellipse(0.5, 0.3, 10, 0.25, 0.3), ellipse(0.44, 0.24, 10, 0.25, 0.3), 0.02, 0x8a8680);
  for (const [x, z, col] of [[0.2, 0.28, 0xff8a2a], [0.32, 0.33, 0xf4f4f0]] as const) b.box(0.04, 0.008, 0.015, { color: col, x, y: G + 0.022, z, ry: 0.6, detail: true, paint: false });
  // stone lantern
  b.group({ x: -0.42, y: G, z: 0.22 }, () => {
    b.box(0.08, 0.03, 0.08, { color: 0xb8b2a8 });
    b.cyl(0.02, 0.02, 0.09, { color: 0xb8b2a8, seg: 6, y: 0.03 });
    b.box(0.07, 0.05, 0.07, { color: 0xffd8a0, mat: Mat.Light, y: 0.12 });
    b.pyramid(0.12, 0.05, 0.12, { color: 0x9a948a, y: 0.17 });
  });
  // bonsai on a stone
  b.box(0.1, 0.05, 0.08, { color: 0x9a948a, x: 0.42, y: G, z: -0.15 });
  tree(b, 0.42, -0.15, 1.1, 'bonsai', rng, G + 0.05);
  // torii gate (front)
  b.group({ x: 0, y: G, z: 0.62 }, () => {
    for (const x of [-0.17, 0.17]) b.cyl(0.018, 0.022, 0.28, { color: 0xd8342a, seg: 6, x });
    b.box(0.48, 0.03, 0.05, { color: 0x2a2a2a, y: 0.28 });
    b.box(0.42, 0.025, 0.04, { color: 0xd8342a, y: 0.255 });
    b.box(0.38, 0.02, 0.03, { color: 0xd8342a, y: 0.2 });
  });
  tree(b, -0.5, -0.35, 1, 'autumn', rng);
  for (let i = 0; i < 6; i++) b.cyl(0.008, 0.008, 0.22, { color: 0x7aa04a, seg: 3, x: 0.58 + (i % 2) * 0.02, y: G, z: 0.05 - i * 0.07, detail: true, paint: false });
  person(b, -0.15, 0.45, 0xf4f0e8);
}

/** Sculpture garden: a red torus, a twisted cube stack, a chrome sphere on a cone and a very serious stone head. */
export function sculptureGarden(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.lawn, { border: C.path });
  path(b, 0, 0.8, 0, -0.1, 0.12);
  ringPath(b, 0.35, 0.1, C.path, 10, G + 0.004, 0, -0.1);
  // torus
  b.box(0.12, 0.05, 0.08, { color: C.stone, x: -0.35, y: G, z: -0.3 });
  b.torus(0.12, 0.035, { color: 0xe0453a, seg: 14, tube: 5, x: -0.35, y: G + 0.17, z: -0.3, rx: Math.PI / 2, ry: 0.4 });
  // twisted stack
  for (let i = 0; i < 5; i++) b.box(0.1 - i * 0.008, 0.06, 0.1 - i * 0.008, { color: i % 2 ? 0xf4f4f0 : 0x3a7ae0, x: 0.38, y: G + i * 0.06, z: -0.25, ry: i * 0.32 });
  // chrome sphere on cone
  b.cone(0.05, 0.12, { color: 0x3a3e46, seg: 6, x: 0.3, y: G, z: 0.3 });
  b.sphere(0.07, { color: 0xdfe6ee, mat: Mat.Metal, x: 0.3, y: G + 0.18, z: 0.3, wSeg: 10, hSeg: 6 });
  // stone head
  b.group({ x: -0.32, y: G, z: 0.3, ry: 0.5 }, () => {
    b.box(0.1, 0.22, 0.1, { color: 0x8a847a });
    b.box(0.12, 0.03, 0.1, { color: 0x7a746a, y: 0.15, z: 0.01 });
    b.box(0.03, 0.06, 0.03, { color: 0x8a847a, y: 0.08, z: 0.06 });
    b.box(0.08, 0.02, 0.02, { color: 0x6a645a, y: 0.04, z: 0.05 });
  });
  hedge(b, 0, -0.62, 0.6, 0.05, 0.07);
  for (let i = 0; i < 3; i++) tree(b, -0.55 + i * 0.55, -0.5 - (i % 2) * 0.1, 0.9, i === 1 ? 'cypress' : 'round', rng);
  bench(b, 0.18, -0.1, -Math.PI / 2);
  crowd(b, rng, 0, 0.1, 0.4, 4);
  lamp(b, -0.12, 0.55);
}

/** Botanic garden: glass palm house with barrel wings, ribbon flower beds, lily pond and a world of trees. */
export function botanicGarden(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.lawn, { border: C.path });
  const glass = 0xbfe8dc;
  // palm house
  b.box(2.6, 0.06, 0.95, { color: C.stone, x: 0, y: G, z: -0.75 });
  b.lathe([[0.62, 0], [0.64, 0.28], [0.54, 0.62], [0.34, 0.86], [0.1, 0.96], [0.001, 0.98]], { color: glass, mat: Mat.Glass, seg: 12, y: G + 0.06, z: -0.75 });
  b.cyl(0.04, 0.05, 0.14, { color: 0xffffff, seg: 6, y: G + 1.02, z: -0.75 });
  b.sphere(0.04, { color: 0xffd04a, mat: Mat.Glow, y: G + 1.18, z: -0.75, wSeg: 6, hSeg: 4 });
  for (const s of [-1, 1]) {
    b.cyl(0.32, 0.32, 0.62, { color: glass, mat: Mat.Glass, arc: Math.PI, capBottom: true, seg: 8, x: s * 0.62 + (s > 0 ? 0.62 : 0), y: G + 0.06 + 0.12, z: -0.75, rz: Math.PI / 2 });
    b.box(0.62, 0.12, 0.64, { color: glass, mat: Mat.Glass, x: s * 0.93, y: G + 0.06, z: -0.75 });
  }
  // a palm peeking out of the roof lantern
  tree(b, 0.0, -0.75, 1.4, 'palm', rng, G + 0.75);
  // ribbon flower beds
  for (let i = 0; i < 5; i++) b.box(1.5, 0.03, 0.1, { color: 0x6a4a32, top: FUN[i], topMat: Mat.Foliage, x: -0.35, y: G, z: 0.15 + i * 0.17, paint: false });
  path(b, 0, 2.3, 0, -0.2, 0.2);
  path(b, -1.4, 0.0, 1.4, 0.0, 0.14);
  // lily pond
  const px = 1.2, pz = 0.65;
  pool(b, ellipse(0.9, 0.62, 12, px, pz), ellipse(0.82, 0.54, 12, px, pz), 0.025, 0xa8a090);
  for (let i = 0; i < 5; i++) b.cyl(0.04, 0.04, 0.004, { color: i === 2 ? 0xff9ac8 : 0x4a9a3a, seg: 6, x: px + rng.range(-0.3, 0.3), y: G + 0.026, z: pz + rng.range(-0.2, 0.2), detail: true, paint: false });
  bench(b, 0.55, 0.0, 0);
  bench(b, -1.0, 0.0, Math.PI);
  edging(b, rng, 7, 10, ['round', 'blossom', 'pine', 'birch', 'palm', 'autumn'], { gap: 0.5, skip: [[0.4, 1.3]], lamps: true });
  crowd(b, rng, 0, 0.6, 0.6, 6);
}

/** Biodome: faceted glass dome with an oculus, a giant tree rising through it, satellite domes and a waterfall. */
export function biodome(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.grass, { border: C.paving });
  const r = 1.55, glass = 0x9ae8d0;
  b.cyl(r + 0.05, r + 0.08, 0.1, { color: C.concrete, seg: 14, y: G, z: -0.2 });
  const prof: [number, number][] = [];
  for (let i = 0; i <= 4; i++) {
    const t = (i / 4) * (Math.PI * 0.39);
    prof.push([Math.cos(t) * r, Math.sin(t) * r * 0.95]);
  }
  b.lathe(prof, { color: glass, mat: Mat.Glass, seg: 14, flat: true, y: G + 0.1, z: -0.2 });
  const top = G + 0.1 + Math.sin(Math.PI * 0.39) * r * 0.95;
  const oc = Math.cos(Math.PI * 0.39) * r;
  b.torus(oc, 0.03, { color: 0xf4f4f0, seg: 16, tube: 3, y: top, z: -0.2 });
  // giant tree through the oculus
  b.cyl(0.08, 0.14, top - G + 0.15, { color: 0x6a4a32, seg: 6, y: G + 0.1, z: -0.2 });
  b.sphere(0.62, { color: 0x3f9a3a, mat: Mat.Foliage, y: top + 0.42, z: -0.2, sy: 0.6, wSeg: 8, hSeg: 4, flat: true });
  b.sphere(0.36, { color: 0x5ab04a, mat: Mat.Foliage, x: 0.25, y: top + 0.62, z: -0.1, sy: 0.7, wSeg: 6, hSeg: 3, flat: true });
  for (let i = 0; i < 5; i++) b.sphere(0.04, { color: 0xff7ad8, mat: Mat.Glow, x: rng.range(-0.4, 0.4), y: top + rng.range(0.3, 0.6), z: -0.2 + rng.range(-0.4, 0.4), wSeg: 4, hSeg: 3, detail: true });
  // satellite domes
  for (const [x, z, rr] of [[1.55, 0.95, 0.42], [-1.5, 1.0, 0.36]] as const) {
    b.dome(rr, { color: glass, mat: Mat.Glass, x, y: G, z, wSeg: 10, hSeg: 3, flat: true });
    const dx = -x * 0.5, dz = -0.2 - z;
    b.box(0.16, 0.14, Math.hypot(x * 0.5, dz), { color: glass, mat: Mat.Glass, x: x * 0.75, y: G, z: z + dz / 2, ry: Math.atan2(dx, dz) });
  }
  // waterfall rock
  b.sphere(0.25, { color: 0x8a847a, x: 1.6, y: G, z: -0.9, sy: 1.4, wSeg: 6, hSeg: 4, flat: true });
  b.box(0.12, 0.3, 0.02, { color: 0xbfe8ff, mat: Mat.Water, x: 1.5, y: G + 0.02, z: -0.72, ry: -0.5, paint: false });
  pool(b, ellipse(0.5, 0.3, 10, 1.4, -0.55), ellipse(0.44, 0.24, 10, 1.4, -0.55), 0.02);
  path(b, 0, 2.3, 0, 1.3, 0.24);
  edging(b, rng, 7, 6, ['round', 'palm', 'birch'], { skip: [[0.5, 1.4], [5.0, 5.8]] });
  crowd(b, rng, 0, 1.55, 0.3, 5);
}

// ─────────────────────────────────────────────────────────── grounds

/** Sports field: striped pitch with markings, goals, a covered stand, floodlights and a clubhouse. */
export function sportsField(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0x5aa044, { border: C.paving });
  const W = 2.6, D = 1.55, cz = 0.05;
  for (let i = 0; i < 8; i++) b.plane(W / 8, D, { color: i % 2 ? 0x66b04e : 0x5aa044, x: -W / 2 + (i + 0.5) * (W / 8), y: G + 0.004, z: cz, paint: false });
  const ln = 0xffffff, t = 0.02, y = G + 0.007;
  for (const s of [-1, 1]) {
    b.plane(W, t, { color: ln, x: 0, y, z: cz + s * D / 2, paint: false });
    b.plane(t, D, { color: ln, x: s * W / 2, y, z: cz, paint: false });
    b.plane(t, 0.6, { color: ln, x: s * (W / 2 - 0.35), y, z: cz, paint: false });
    b.plane(0.35, t, { color: ln, x: s * (W / 2 - 0.175), y, z: cz + 0.3, paint: false });
    b.plane(0.35, t, { color: ln, x: s * (W / 2 - 0.175), y, z: cz - 0.3, paint: false });
    // goals
    b.group({ x: s * (W / 2 + 0.02), y: G, z: cz }, () => {
      b.box(0.02, 0.12, 0.02, { color: ln, z: 0.15 });
      b.box(0.02, 0.12, 0.02, { color: ln, z: -0.15 });
      b.box(0.02, 0.02, 0.32, { color: ln, y: 0.12 });
      b.box(0.1, 0.12, 0.3, { color: 0xe8e8e8, x: s * 0.06, detail: true, paint: false });
    });
  }
  b.plane(t, D, { color: ln, x: 0, y, z: cz, paint: false });
  ringPath(b, 0.25, 0.02, ln, 12, y, 0, cz);
  // stand
  for (let r = 0; r < 3; r++) b.box(1.6, 0.06 + r * 0.06, 0.12, { color: r % 2 ? 0x3a6ae0 : 0xe8e8ec, x: 0, y: G, z: -1.0 - r * 0.12 });
  b.box(1.7, 0.03, 0.42, { color: 0xf4f4f0, x: 0, y: G + 0.36, z: -1.14 });
  for (const x of [-0.8, 0.8]) b.box(0.03, 0.36, 0.03, { color: 0x9aa0aa, x, y: G, z: -1.32 });
  crowd(b, rng, 0, -1.1, 0.5, 8, G + 0.12);
  // floodlights
  for (const [x, z] of [[-1.55, -0.95], [1.55, -0.95], [-1.55, 1.05], [1.55, 1.05]] as const) {
    b.box(0.04, 0.85, 0.04, { color: 0x9aa0aa, x, y: G, z });
    b.box(0.2, 0.12, 0.04, { color: 0xfff6e0, mat: Mat.Light, x, y: G + 0.85, z, ry: Math.atan2(-x, -z + cz), paint: false });
  }
  // players
  for (let i = 0; i < 10; i++) person(b, rng.range(-1.1, 1.1), cz + rng.range(-0.6, 0.6), i % 2 ? 0xe0453a : 0x3a7ae0);
  // clubhouse
  block(b, 0.5, 0.22, 0.3, { color: 0xf2ece0, roof: 0x3a6ae0, x: -1.25, z: 1.25, mat: Mat.WindowSmall });
  flag(b, -0.9, 1.3, 0.4, 0x3a6ae0);
  tree(b, 1.3, 1.45, 1, 'round', rng);
  tree(b, 1.6, 0.3, 0.9, 'round', rng);
}

/** Skate park: half-pipe ramps, a funbox with rail, stair set, graffiti wall and skaters mid-trick. */
export function skatePark(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, 0xccc8c0, { border: 0x9a968e });
  // half-pipe (two facing ramps + decks)
  b.group({ x: -0.1, y: G, z: -0.28 }, () => {
    b.wedge(0.6, 0.16, 0.18, { color: 0xd4d0c8, z: -0.12 });
    b.box(0.6, 0.16, 0.06, { color: 0xa8a49c, z: -0.24 });
    b.wedge(0.6, 0.16, 0.18, { color: 0xd4d0c8, z: 0.12, ry: Math.PI });
    b.box(0.6, 0.16, 0.06, { color: 0xa8a49c, z: 0.24 });
    for (const z of [-0.21, 0.21]) b.box(0.6, 0.014, 0.014, { color: 0xffcf3a, y: 0.165, z, paint: false });
  });
  // funbox + rail
  b.group({ x: 0.3, y: G, z: 0.28, ry: 0.4 }, () => {
    b.box(0.2, 0.06, 0.2, { color: 0xb8b4ac });
    b.wedge(0.2, 0.06, 0.12, { color: 0xb8b4ac, z: 0.16, ry: Math.PI });
    b.wedge(0.2, 0.06, 0.12, { color: 0xb8b4ac, z: -0.16 });
    b.box(0.012, 0.012, 0.3, { color: 0xffcf3a, y: 0.08, x: 0.08 });
    for (const z of [-0.12, 0.12]) b.box(0.01, 0.08, 0.01, { color: 0xffcf3a, x: 0.08, z, detail: true });
  });
  steps(b, -0.35, 0.35, 0.3, 3, 0.025, 0.06, 0xb8b4ac);
  // graffiti wall
  b.box(0.04, 0.2, 0.6, { color: 0xd8d4cc, x: 0.62, y: G, z: -0.1 });
  for (let i = 0; i < 5; i++) b.panel(0.1, 0.08 + (i % 2) * 0.05, { color: FUN[(i * 3) % FUN.length], x: 0.598, y: G + 0.03 + (i % 3) * 0.04, z: -0.32 + i * 0.1, ry: -Math.PI / 2, detail: true, paint: false });
  for (let i = 0; i < 4; i++) {
    const x = rng.range(-0.4, 0.4), z = rng.range(-0.2, 0.45);
    person(b, x, z, rng.pick(FUN), G + (i === 0 ? 0.18 : 0.01), 0.06);
    b.box(0.03, 0.008, 0.08, { color: 0x2a2a2a, x, y: G + (i === 0 ? 0.17 : 0.004), z, ry: rng.next(), detail: true, paint: false });
  }
  lamp(b, -0.55, 0.0, 0.3);
  lamp(b, 0.45, -0.5, 0.3);
  bench(b, -0.5, 0.35, Math.PI / 2);
  tree(b, -0.55, -0.45, 0.85, 'round', rng);
}

