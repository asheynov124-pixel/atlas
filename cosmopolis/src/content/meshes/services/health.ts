/**
 * services · health, deathcare & faith meshes (OWNER: services).
 *
 * Clinics and hospitals read crisp white with teal bands and glowing crosses; deathcare is calm stone, cypress
 * and lantern light; the faith buildings are the warmest things on the map at night (rose windows, braziers,
 * orreries). Styleable buildings tint their walls from the district style.
 */
import type { MeshContext } from '../../catalog';
import {
  C, G, FL, TAU, Mat, mix, shade, civic, lot, block, door, canopy, sign, cross, ambulance, helipad, antenna, acUnit, lamp,
  lampRing, tree, bench, crowd, roofGarden, neonStrip, path, ringPath, pool, rect, columns, solar, flowers, roundRect, carRow,
  disc, edging,
} from './parts';

const WHITE = 0xf6f8fa;

// ─────────────────────────────────────────────────────────── health

/** Neighbourhood clinic: two white storeys, teal band, glowing pharmacy cross and an ambulance bay. */
export function clinic(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const cv = civic(ctx);
  const wall = mix(cv.wall, WHITE, 0.6);
  lot(b, 1, C.paving);
  b.plane(0.26, 0.5, { color: C.asphalt, x: 0.43, y: G + 0.003, z: 0.18, paint: false });
  const top = block(b, 0.72, 2 * FL, 0.46, { color: wall, roof: cv.roof, x: -0.08, z: -0.15 });
  b.box(0.73, 0.03, 0.47, { color: C.teal, x: -0.08, y: G + FL - 0.005, z: -0.15, paint: false });
  b.box(0.28, 0.2, 0.1, { color: cv.glass, mat: Mat.Glass, x: -0.08, y: G, z: 0.13 });
  canopy(b, -0.08, G + 0.2, 0.13, 0.36, 0.1, WHITE, C.healthGlow);
  b.box(0.16, 0.16, 0.025, { color: 0xffffff, x: -0.08, y: G + 0.24, z: 0.09, paint: false });
  cross(b, -0.08, G + 0.32, 0.105, 0.11);
  // green pharmacy cross on a post
  b.box(0.025, 0.36, 0.025, { color: C.steel, x: 0.33, y: G, z: 0.42, paint: false });
  cross(b, 0.33, G + 0.43, 0.43, 0.12, C.healthGlow);
  cross(b, 0.33, G + 0.43, 0.43, 0.12, C.healthGlow, Mat.Glow, Math.PI / 2);
  ambulance(b, 0.43, 0.08, 0);
  b.wedge(0.12, 0.03, 0.18, { color: C.stone, x: -0.33, y: G, z: 0.17, ry: Math.PI / 2 });
  tree(b, -0.52, 0.3, 0.85, 'round', rng);
  bench(b, -0.3, 0.45, 0);
  acUnit(b, -0.25, top, -0.25);
  if (cv.green) roofGarden(b, 0.05, top, -0.15, 0.36, 0.3, rng);
  else solar(b, 0.08, top + 0.02, -0.15, 0.3, 0.24);
  if (cv.curvy) b.dome(0.16, { color: cv.glass, mat: Mat.Glass, x: -0.25, y: top, z: -0.1, wSeg: 10, hSeg: 4 });
  if (cv.neon) neonStrip(b, -0.08, top - 0.04, 0.083, 0.72, cv.accent);
}

/** General hospital: podium, 7-storey ward tower with a red cross, twin wings, rooftop helipad and an ER bay. */
export function hospital(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const cv = civic(ctx);
  const wall = mix(cv.wall, WHITE, 0.62);
  lot(b, 7, C.paving);
  const podTop = block(b, 2.1, 0.3, 1.25, { color: wall, roof: 0xb8bcc0, x: 0, z: -0.45 });
  b.box(2.11, 0.03, 1.26, { color: C.teal, x: 0, y: G + 0.26, z: -0.45, paint: false });
  const tTop = block(b, 0.9, 7 * FL, 0.56, { color: mix(cv.wall, WHITE, 0.78), roof: 0x9aa0a8, x: 0, z: -0.55, y: podTop });
  for (const x of [-0.82, 0.82]) {
    const wt = block(b, 0.46, 4 * FL, 1.0, { color: wall, roof: cv.roof, x, z: -0.45, y: podTop });
    if (cv.green) roofGarden(b, x, wt, -0.45, 0.36, 0.8, rng);
    else acUnit(b, x, wt, -0.6);
  }
  // red cross on the tower crown
  b.box(0.36, 0.36, 0.03, { color: 0xffffff, x: 0, y: tTop - 0.48, z: -0.26, paint: false });
  cross(b, 0, tTop - 0.3, -0.24, 0.26);
  b.box(0.92, 0.03, 0.58, { color: C.healthGlow, mat: Mat.Glow, x: 0, y: tTop - 0.07, z: -0.55, paint: false });
  helipad(b, 0, tTop, -0.55, 0.25);
  b.group({ x: 0.06, y: tTop + 0.03, z: -0.52, ry: 0.5 }, () => {
    b.box(0.08, 0.06, 0.24, { color: WHITE, top: C.cross, detail: true });
    b.cyl(0.12, 0.12, 0.006, { color: 0x2a2e36, seg: 8, y: 0.07, detail: true, paint: false });
  });
  // main entrance (left) + ER (right)
  b.box(0.5, 0.26, 0.18, { color: cv.glass, mat: Mat.Glass, x: -0.45, y: G, z: 0.26 });
  canopy(b, -0.45, G + 0.26, 0.26, 0.6, 0.16, WHITE, C.healthGlow);
  canopy(b, 0.62, G + 0.2, 0.18, 0.62, 0.36, WHITE, C.cross);
  sign(b, 0.62, G + 0.22, 0.55, 0.3, 0.05, C.cross);
  ambulance(b, 0.5, 0.42, 0.2);
  ambulance(b, 0.8, 0.48, -0.15);
  // healing garden
  b.plane(1.2, 0.62, { color: C.grass, x: -0.85, y: G + 0.003, z: 0.82, paint: false });
  for (let i = 0; i < 4; i++) tree(b, -1.35 + i * 0.33, 0.95 - (i % 2) * 0.22, 1, i % 2 ? 'blossom' : 'round', rng);
  bench(b, -0.6, 0.62, Math.PI);
  bench(b, -1.0, 0.62, Math.PI);
  carRow(b, rng, 0.25, 1.35, 1.05, 5, 0);
  lampRing(b, 1.25, 5, 0.26, C.lampCool, 0.6, 0, 0.6);
  crowd(b, rng, -0.3, 0.55, 0.2, 3);
  if (cv.neon) neonStrip(b, 0, tTop - 0.15, -0.265, 0.9, cv.accent);
  if (cv.curvy) b.dome(0.24, { color: cv.glass, mat: Mat.Glass, x: 0.82, y: podTop + 4 * FL + 0.02, z: -0.75, wSeg: 10, hSeg: 4 });
  edging(b, rng, 7, 6, ['round', 'birch'], { skip: [[0, 1.0], [5.2, 6.3]] });
}

/** Medical research centre: twin teal-glass rotundas joined by a skybridge, DNA sculpture, healing garden. */
export function medicalCentre(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.paving);
  b.extrude(roundRect(2.7, 1.0, 0.4, 3, 0, -0.55), 0.3, { color: WHITE, mat: Mat.Window, top: 0xc8ccd0, y: G });
  b.extrude(roundRect(2.72, 1.02, 0.4, 3, 0, -0.55), 0.03, { color: C.teal, y: G + 0.27, paint: false });
  const glass = 0x6ab8c8;
  const towers: [number, number, number, number][] = [[-0.62, -0.6, 0.48, 2.0], [0.7, -0.62, 0.4, 1.55]];
  for (const [x, z, r, h] of towers) {
    b.cyl(r, r, h, { color: glass, mat: Mat.Glass, seg: 12, x, y: G + 0.3, z });
    b.cyl(r + 0.03, r + 0.03, 0.06, { color: WHITE, seg: 12, x, y: G + 0.3 + h, z });
    b.cyl(r + 0.035, r + 0.035, 0.02, { color: C.healthGlow, mat: Mat.Glow, seg: 12, x, y: G + 0.33 + h, z, capTop: false });
    antenna(b, x + r * 0.4, G + 0.36 + h, z, 0.25, C.healthGlow);
  }
  // skybridge
  const [ax, az] = [-0.62, -0.6], [bx, bz] = [0.7, -0.62];
  b.box(0.16, 0.14, Math.hypot(bx - ax, bz - az), { color: glass, mat: Mat.Glass, x: (ax + bx) / 2, y: G + 1.15, z: (az + bz) / 2, ry: Math.atan2(bx - ax, bz - az) });
  // cross on the big rotunda
  b.box(0.3, 0.3, 0.03, { color: 0xffffff, x: -0.62, y: G + 1.6, z: -0.11, paint: false });
  cross(b, -0.62, G + 1.75, -0.09, 0.22);
  // DNA helix
  const hx = 0.75, hz = 0.75;
  b.cyl(0.14, 0.16, 0.05, { color: C.stone, seg: 8, x: hx, y: G, z: hz });
  const n = b.lod ? 6 : 12;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = t * TAU * 1.2;
    const y = G + 0.08 + t * 0.85;
    const dx = Math.sin(a) * 0.1, dz = Math.cos(a) * 0.1;
    b.box(0.045, 0.045, 0.045, { color: C.science, mat: Mat.Glow, x: hx + dx, y, z: hz + dz, paint: false });
    b.box(0.045, 0.045, 0.045, { color: 0xff6ad0, mat: Mat.Glow, x: hx - dx, y, z: hz - dz, paint: false });
    if (i % 2 === 0) b.box(0.2, 0.012, 0.012, { color: 0xf0f4f8, x: hx, y: y + 0.016, z: hz, ry: Math.atan2(dx, dz) + Math.PI / 2, detail: true, paint: false });
  }
  // garden + entrance
  b.plane(1.1, 0.75, { color: C.grass, x: -0.75, y: G + 0.003, z: 0.75, paint: false });
  pool(b, rect(0.42, 0.24, -0.7, 0.75), rect(0.36, 0.18, -0.7, 0.75), 0.03);
  for (let i = 0; i < 5; i++) tree(b, -1.25 + i * 0.25, 1.1 - (i % 2) * 0.1, 0.95, i % 2 ? 'birch' : 'round', rng);
  bench(b, -0.95, 0.5, 0);
  b.box(0.6, 0.24, 0.16, { color: glass, mat: Mat.Glass, x: 0.05, y: G, z: 0.03 });
  canopy(b, 0.05, G + 0.24, 0.03, 0.72, 0.2, WHITE, C.healthGlow);
  ambulance(b, 0.3, 0.55, 0.3);
  for (const [x, z] of [[0.05, -0.28], [0.05, -0.85], [1.15, -0.25]] as const) solar(b, x, G + 0.35, z, 0.26, 0.2);
  crowd(b, rng, 0.05, 0.5, 0.25, 4);
  edging(b, rng, 7, 6, ['round', 'birch'], { skip: [[5.3, 6.3], [0, 0.6]] });
}

/** Cryo-care longevity clinic: frosted capsule ringed by glowing cryo pods and drifting cold mist. */
export function cryoClinic(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, 0xe2eaf2);
  b.lathe([[0.4, 0], [0.43, 0.1], [0.42, 0.3], [0.35, 0.46], [0.2, 0.57], [0.001, 0.61]], { color: 0xf2f8fc, seg: 14, y: G, z: -0.05 });
  b.cyl(0.432, 0.432, 0.1, { color: 0x9fd8ff, mat: Mat.Glass, seg: 14, y: G + 0.13, z: -0.05, capTop: false });
  b.cyl(0.1, 0.1, 0.08, { color: 0xbff0ff, mat: Mat.Glow, seg: 8, y: G + 0.6, z: -0.05 });
  antenna(b, 0, G + 0.68, -0.05, 0.18, 0x7ae0ff);
  // pods (leave the entrance clear)
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 0.32 + (i / 5) * Math.PI * 1.36;
    const x = Math.sin(a) * 0.62, z = -0.05 + Math.cos(a) * 0.62;
    b.cyl(0.07, 0.07, 0.03, { color: C.steel, mat: Mat.Plain, seg: 6, x, y: G, z });
    b.cyl(0.055, 0.055, 0.26, { color: 0x7ae8ff, mat: Mat.Glow, seg: 6, x, y: G + 0.03, z, capTop: false });
    b.cyl(0.07, 0.07, 0.03, { color: C.steel, mat: Mat.Plain, seg: 6, x, y: G + 0.29, z });
    b.box(0.02, 0.05, 0.02, { color: 0xf4f8ff, x: x * 0.86, y: G + 0.18, z: -0.05 + (z + 0.05) * 0.86, detail: true, paint: false });
  }
  // entrance + snowflake
  b.box(0.22, 0.22, 0.12, { color: 0x9fd8ff, mat: Mat.Glass, x: 0, y: G, z: 0.38 });
  for (let k = 0; k < 3; k++) b.box(0.13, 0.016, 0.01, { color: 0xbff0ff, mat: Mat.Glow, x: 0, y: G + 0.36, z: 0.335, rz: (k / 3) * Math.PI, paint: false });
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * TAU;
    b.sphere(rng.range(0.05, 0.09), { color: 0xf4faff, x: Math.sin(a) * 0.55, y: G + 0.02, z: -0.05 + Math.cos(a) * 0.55, sy: 0.45, wSeg: 5, hSeg: 3, flat: true, detail: true, paint: false });
  }
}

/** Chrono-clinic: an hourglass of living light inside gyroscopic clock rings. */
export function chronoClinic(ctx: MeshContext): void {
  const { b } = ctx;
  lot(b, 1, 0xd8d4e8);
  b.cyl(0.5, 0.55, 0.16, { color: 0xf2f0f8, mat: Mat.WindowSmall, seg: 12, y: G });
  b.cyl(0.505, 0.505, 0.02, { color: 0xffd47a, mat: Mat.Glow, seg: 12, y: G + 0.13, capTop: false });
  const y0 = G + 0.16;
  b.cyl(0.28, 0.28, 0.04, { color: 0xc9a84a, mat: Mat.Metal, seg: 10, y: y0 });
  b.cyl(0.02, 0.26, 0.42, { color: 0xb8d8ff, mat: Mat.Glass, seg: 10, y: y0 + 0.04 });
  b.cyl(0.26, 0.02, 0.42, { color: 0xb8d8ff, mat: Mat.Glass, seg: 10, y: y0 + 0.46 });
  b.cyl(0.28, 0.28, 0.04, { color: 0xc9a84a, mat: Mat.Metal, seg: 10, y: y0 + 0.88 });
  b.cone(0.18, 0.16, { color: 0xffd47a, mat: Mat.Glow, seg: 8, y: y0 + 0.04 });
  b.cyl(0.012, 0.012, 0.3, { color: 0xffd47a, mat: Mat.Glow, seg: 4, y: y0 + 0.2, capTop: false });
  for (let i = 0; i < 3; i++) b.box(0.025, 0.92, 0.025, { color: 0xc9a84a, mat: Mat.Metal, x: Math.sin((i / 3) * TAU) * 0.28, y: y0, z: Math.cos((i / 3) * TAU) * 0.28 });
  // clock rings
  b.torus(0.48, 0.02, { color: 0xb08aff, mat: Mat.Holo, seg: 24, tube: 4, y: y0 + 0.5, rx: 1.1 });
  b.torus(0.42, 0.02, { color: 0x7ae0ff, mat: Mat.Holo, seg: 24, tube: 4, y: y0 + 0.5, rz: 1.1 });
  b.torus(0.56, 0.015, { color: 0xffd47a, mat: Mat.Glow, seg: 24, tube: 3, y: y0 + 0.5, detail: true });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    b.box(0.03, 0.03, 0.012, { color: 0xffd47a, mat: Mat.Glow, x: Math.sin(a) * 0.5, y: G + 0.08, z: Math.cos(a) * 0.5, ry: a, detail: true, paint: false });
  }
  door(b, 0, 0.52, 0.16, 0.12, 0x30285a, G, Mat.Glass);
}

// ─────────────────────────────────────────────────────────── deathcare

/** Memorial garden: reflecting pool, cypress avenues, lantern-lit rows of stones, obelisk and a tiny chapel. */
export function memorialGarden(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.lawn);
  path(b, 0, 2.3, 0, 1.0, 0.24, C.gravel);
  ringPath(b, 1.25, 0.12, C.gravel, 16);
  pool(b, rect(0.42, 1.7, 0, 0.05), rect(0.34, 1.62, 0, 0.05), 0.035, 0xc8c2b6);
  // obelisk
  b.box(0.3, 0.08, 0.3, { color: 0xb8b2a6, x: 0, y: G, z: -1.05 });
  b.cyl(0.05, 0.09, 1.0, { color: 0xd8d2c6, seg: 4, flat: true, x: 0, y: G + 0.08, z: -1.05, ry: Math.PI / 4 });
  b.cone(0.05, 0.08, { color: 0xd8d2c6, seg: 4, flat: true, x: 0, y: G + 1.08, z: -1.05, ry: Math.PI / 4 });
  b.box(0.04, 0.04, 0.04, { color: 0xffe2a8, mat: Mat.Light, x: 0, y: G + 1.16, z: -1.05, paint: false });
  // cypress avenues
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) tree(b, s * 0.38, -0.7 + i * 0.36, 1.05, 'cypress', rng);
  // stones
  for (const s of [-1, 1])
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        const x = s * (0.85 + c * 0.2), z = -0.5 + r * 0.32;
        b.box(0.06, 0.08, 0.025, { color: rng.pick([0xd8d4cc, 0xc8c2b8, 0xe6e2da]), x, y: G, z, detail: true, paint: false });
      }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const x = Math.sin(a) * 1.25, z = Math.cos(a) * 1.25;
    b.box(0.02, 0.1, 0.02, { color: 0x4a4a4a, x, y: G, z, detail: true, paint: false });
    b.box(0.045, 0.045, 0.045, { color: 0xffd8a0, mat: Mat.Light, x, y: G + 0.1, z, detail: true, paint: false });
  }
  // little chapel
  b.group({ x: -1.35, y: G, z: -1.05, ry: 0.5 }, () => {
    b.box(0.34, 0.26, 0.46, { color: 0xeee8dc });
    b.gable(0.46, 0.16, 0.34, { color: 0x6a6a72, y: 0.26, ry: Math.PI / 2, overhang: 0 });
    b.cyl(0.05, 0.05, 0.01, { color: 0xffc070, mat: Mat.Light, y: 0.3, z: 0.232, rx: Math.PI / 2, seg: 8, paint: false });
  });
  for (let i = 0; i < 4; i++) flowers(b, (i < 2 ? -1 : 1) * 0.62, 0.85 - (i % 2) * 1.5, 0.1, rng.pick([0xf2f2f8, 0xd8b8ff, 0xffd0e0]));
  for (let i = 0; i < 4; i++) tree(b, 1.5 + (i % 2) * 0.3, -1.0 + i * 0.25, 1, 'round', rng);
  bench(b, -0.62, 0.3, Math.PI / 2);
  bench(b, 0.62, 0.3, -Math.PI / 2);
}

/** Stardust crematorium: lilac chapel of rest beside a launch rail that sends ashes to orbit. */
export function crematorium(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, 0xd8d0e0);
  const lil = 0xece4f0;
  const top = block(b, 0.56, 0.32, 0.46, { color: lil, roof: 0x5a4a7a, x: -0.15, z: -0.08, mat: Mat.WindowSmall });
  b.box(0.2, 0.22, 0.06, { color: 0x9a7ae0, mat: Mat.Light, x: -0.15, y: G, z: 0.16 });
  canopy(b, -0.15, G + 0.24, 0.15, 0.3, 0.1, 0x5a4a7a, 0xc8a8ff);
  // launch rail + rocket
  const rx = 0.38, rz = -0.25;
  b.box(0.16, 0.06, 0.16, { color: 0x8a8296, x: rx, y: G, z: rz });
  b.box(0.035, 1.0, 0.035, { color: C.steel, mat: Mat.Plain, x: rx - 0.08, y: G, z: rz });
  for (let i = 0; i < 3; i++) b.box(0.08, 0.015, 0.015, { color: C.steel, mat: Mat.Plain, x: rx - 0.04, y: G + 0.25 + i * 0.28, z: rz, detail: true });
  b.cyl(0.045, 0.045, 0.32, { color: 0xf4f2fa, seg: 8, x: rx, y: G + 0.12, z: rz });
  b.cone(0.045, 0.1, { color: 0x9a7ae0, seg: 8, x: rx, y: G + 0.44, z: rz });
  for (let i = 0; i < 3; i++) b.box(0.012, 0.07, 0.06, { color: 0x9a7ae0, x: rx + Math.sin((i / 3) * TAU) * 0.045, y: G + 0.12, z: rz + Math.cos((i / 3) * TAU) * 0.045, ry: (i / 3) * TAU, detail: true });
  b.cyl(0.05, 0.03, 0.05, { color: 0xd0a8ff, mat: Mat.Glow, seg: 6, x: rx, y: G + 0.07, z: rz });
  // memorial wall of stars
  b.box(0.5, 0.16, 0.05, { color: 0x4a3a6a, x: 0.1, y: G, z: 0.42 });
  for (let i = 0; i < 6; i++) b.box(0.025, 0.025, 0.01, { color: 0xffe8a8, mat: Mat.Light, x: -0.1 + i * 0.08, y: G + 0.06 + (i % 2) * 0.05, z: 0.447, detail: true, paint: false });
  tree(b, -0.52, 0.3, 0.9, 'cypress', rng);
  tree(b, -0.55, -0.35, 0.9, 'cypress', rng);
  flowers(b, 0.45, 0.25, 0.07, 0xd8b8ff);
  acUnit(b, -0.25, top, -0.2);
}

/** Ascension spire: a pearl needle with glowing seams, a floating halo and a beam into the sky. */
export function ascensionSpire(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0xe6e2ee);
  disc(b, 1.45, 0.06, 0xd8d2e6, { y: G, seg: 16 });
  b.torus(1.2, 0.16, { color: C.water, mat: Mat.Water, seg: 24, tube: 4, y: G + 0.05, sy: 0.15, paint: false });
  const pearl = 0xf4f0ff;
  b.lathe([[0.55, 0], [0.5, 0.16], [0.32, 0.42], [0.26, 1.5], [0.32, 1.6], [0.2, 1.72], [0.16, 3.0], [0.21, 3.1], [0.12, 3.22], [0.06, 4.2], [0.001, 4.8]], { color: pearl, seg: 10, y: G + 0.06 });
  for (const [y, r] of [[1.58, 0.33], [3.08, 0.22]]) b.cyl(r, r, 0.05, { color: 0xc8a8ff, mat: Mat.Glow, seg: 10, y: G + y, capTop: false });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    b.box(0.02, 1.0, 0.02, { color: 0xc8a8ff, mat: Mat.Glow, x: Math.sin(a) * 0.27, y: G + 0.48, z: Math.cos(a) * 0.27, paint: false });
  }
  b.torus(0.48, 0.03, { color: 0xffd47a, mat: Mat.Glow, seg: 20, tube: 3, y: G + 4.35 });
  b.cyl(0.018, 0.018, 0.9, { color: 0xfff4d8, mat: Mat.Glow, seg: 4, y: G + 4.8, capTop: false });
  door(b, 0, 0.46, 0.14, 0.2, 0x5a4a8a, G + 0.06, Mat.Light);
  // pylons with holo flames
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * TAU;
    const x = Math.sin(a) * 1.75, z = Math.cos(a) * 1.75;
    b.box(0.14, 0.32, 0.14, { color: 0xd8d2e6, x, y: G, z });
    b.cone(0.07, 0.2, { color: 0xc8a8ff, mat: Mat.Holo, seg: 5, x, y: G + 0.32, z });
  }
  path(b, 0, 2.3, 0, 1.45, 0.3, 0xd8d2e6);
  for (let i = 0; i < 6; i++) tree(b, (i < 3 ? -1 : 1) * (1.7 + (i % 3) * 0.12), -0.7 + (i % 3) * 0.45, 1, 'cypress', rng);
  crowd(b, rng, 0.3, 1.55, 0.25, 4);
}

// ─────────────────────────────────────────────────────────── faith

/** Interfaith chapel: stone nave, rose window that glows at night, bell tower, cypress and a garden bench. */
export function chapel(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.lawn);
  path(b, 0, 0.8, 0, 0.2, 0.14, C.gravel);
  const stone = 0xeee6d8;
  b.box(0.36, 0.3, 0.62, { color: stone, mat: Mat.WindowSmall, x: 0, y: G, z: -0.12 });
  b.gable(0.62, 0.22, 0.36, { color: 0x5a5a66, x: 0, y: G + 0.3, z: -0.12, ry: Math.PI / 2, overhang: 0 });
  b.cyl(0.075, 0.075, 0.015, { color: 0xffb070, mat: Mat.Light, seg: 8, x: 0, y: G + 0.36, z: 0.19, rx: Math.PI / 2, paint: false });
  door(b, 0, 0.192, 0.1, 0.16, 0x5a3a2a);
  // bell tower
  b.box(0.17, 0.62, 0.17, { color: stone, x: 0.3, y: G, z: 0.12 });
  b.box(0.13, 0.1, 0.18, { color: 0x2a2a30, x: 0.3, y: G + 0.48, z: 0.12, paint: false });
  b.cyl(0.03, 0.045, 0.05, { color: 0xc9a84a, mat: Mat.Metal, seg: 6, x: 0.3, y: G + 0.5, z: 0.12, detail: true });
  b.pyramid(0.2, 0.3, 0.2, { color: 0x5a5a66, x: 0.3, y: G + 0.62, z: 0.12 });
  b.box(0.03, 0.03, 0.03, { color: 0xffe2a8, mat: Mat.Light, x: 0.3, y: G + 0.93, z: 0.12, paint: false });
  tree(b, -0.42, 0.25, 0.95, 'cypress', rng);
  tree(b, -0.45, -0.4, 0.95, 'cypress', rng);
  tree(b, 0.5, -0.35, 0.85, 'round', rng);
  bench(b, -0.25, 0.48, Math.PI / 2);
  lamp(b, 0.15, 0.55);
  flowers(b, 0.3, 0.45, 0.07, 0xffc8e0);
}

/** Temple of the Stars: sandstone terraces, braziers and a golden orrery shrine at the summit. */
export function templeOfStars(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const sand = 0xe8d8b8, gold = 0xffc84a;
  lot(b, 7, 0xd8c8a4);
  const tiers: [number, number][] = [[2.3, 1.9], [1.7, 1.4], [1.1, 0.9]];
  let y = G;
  tiers.forEach(([w, d], i) => {
    b.box(w, 0.2, d, { color: shade(sand, 1 - i * 0.04), x: 0, y, z: -0.35 });
    b.box(w + 0.02, 0.03, d + 0.02, { color: gold, x: 0, y: y + 0.14, z: -0.35, paint: false });
    y += 0.23;
  });
  b.wedge(0.44, y - G, 1.25, { color: shade(sand, 0.92), x: 0, y: G, z: 0.75 });
  // shrine
  columns(b, 2, 0.5, 0.36, 0.035, -0.1, 0xf2e6c8, y);
  columns(b, 2, 0.5, 0.36, 0.035, -0.6, 0xf2e6c8, y);
  b.cyl(0.42, 0.42, 0.04, { color: sand, seg: 12, x: 0, y: y + 0.36, z: -0.35 });
  const oy = y + 0.75;
  b.sphere(0.13, { color: gold, mat: Mat.Glow, x: 0, y: oy, z: -0.35, wSeg: 10, hSeg: 6 });
  b.torus(0.32, 0.01, { color: 0xc9a84a, mat: Mat.Metal, seg: 20, tube: 3, x: 0, y: oy, z: -0.35, rx: 0.35 });
  b.torus(0.5, 0.01, { color: 0xc9a84a, mat: Mat.Metal, seg: 24, tube: 3, x: 0, y: oy, z: -0.35, rz: 0.3 });
  b.sphere(0.05, { color: 0x4a8aff, x: 0.32, y: oy - 0.04, z: -0.35, wSeg: 6, hSeg: 4 });
  b.sphere(0.04, { color: 0xff6a3a, x: -0.48, y: oy + 0.14, z: -0.35, wSeg: 6, hSeg: 4 });
  b.cyl(0.015, 0.015, 0.38, { color: 0xc9a84a, mat: Mat.Metal, seg: 4, x: 0, y: y + 0.4, z: -0.35 });
  // braziers
  for (const [x, z] of [[-1.05, 0.5], [1.05, 0.5], [-1.05, -1.2], [1.05, -1.2]] as const) {
    b.cyl(0.07, 0.04, 0.12, { color: 0x6a5a3a, mat: Mat.Plain, seg: 6, x, y: G + 0.2, z });
    b.cone(0.06, 0.12, { color: 0xff8a2a, mat: Mat.Lava, seg: 5, x, y: G + 0.32, z, paint: false });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    if (Math.cos(a) > 0.7) continue;
    tree(b, Math.sin(a) * 1.85, -0.2 + Math.cos(a) * 1.65, 1, 'blossom', rng);
  }
  for (const x of [-0.32, 0.32]) {
    b.box(0.02, 0.5, 0.02, { color: 0x6a5a3a, x, y: G, z: 1.45, detail: true });
    b.panel(0.12, 0.3, { color: x < 0 ? 0x9a5ae0 : 0x3a6ae0, x: x + 0.07, y: G + 0.18, z: 1.45, both: true, detail: true, paint: false });
  }
  crowd(b, rng, 0, 1.6, 0.3, 5);
}

