/**
 * landmarks · mesh factories for the 25 Landmarks (OWNER: landmarks). Registered by content/items/landmarks.ts.
 *
 * Each factory draws one unique monument on its own plaza (footprint 1 or 7). Budget ≤ 3 000 triangles at LOD0;
 * small ornaments are `detail: true` so LOD1 keeps only the silhouette. Every landmark carries something that
 * lights up after dusk (Mat.Light lamps, Mat.Glow neon, Mat.Holo projections, lit windows) so the city's
 * landmarks read as jewels on the night side of the planet.
 */
import { Mat, mix, shade } from '../../kit';
import type { MeshContext } from '../../catalog';
import {
  G, P, TAU, arch, beacon, beam, crowd, disc, figure, flag, flagRing, glowRing, grove, helix, lamp, lampRing,
  plaza, pond, pool, ringOf, shard, stairs, steps, strut, taper, tree, truss, vdisc, vring, type V3,
} from './parts';

type Ctx = MeshContext;

// ─────────────────────────────────────────────────────────── T0 – T1

/** The battered landing craft the first colonists rode down in, now resting on its legs in a scorched plaza. */
export function landerMemorial({ b, rng }: Ctx): void {
  plaza(b, 7, P.pavingWarm, { field: 0x6a5f55, fieldR: 0.55, round: true, kerb: P.stone });
  // scorch rays on the field
  if (b.lod === 0) ringOf(10, 0.95, (x, z, a) => b.box(0.06, 0.006, 0.55, { color: 0x4a4038, x, z, y: G + 0.012, ry: a, paint: false, detail: true }));
  const hull = P.hull, band = P.orange;
  const y0 = 0.78;
  // engine bell + glowing nozzle
  b.cyl(0.22, 0.4, 0.34, { color: P.hullDark, seg: 12, y: y0 - 0.34, mat: Mat.Metal, capTop: false, paint: false });
  b.cyl(0.33, 0.33, 0.01, { color: P.orange, seg: 12, y: y0 - 0.33, mat: Mat.Lava, paint: false });
  // main hull (octagonal), livery band, porthole band, upper cone and cockpit
  b.cyl(0.78, 0.72, 0.62, { color: hull, seg: 8, y: y0, flat: true, top: hull, paint: false });
  b.cyl(0.79, 0.79, 0.1, { color: band, seg: 8, y: y0 + 0.08, flat: true, paint: false });
  b.cyl(0.785, 0.785, 0.16, { color: 0xc9d0da, seg: 8, y: y0 + 0.36, flat: true, mat: Mat.WindowSmall, paint: false });
  b.cyl(0.36, 0.78, 0.55, { color: shade(hull, 0.95), seg: 8, y: y0 + 0.62, flat: true, paint: false });
  b.dome(0.34, { color: 0x6fb8e8, mat: Mat.Glass, y: y0 + 1.17, wSeg: 10, hSeg: 4, paint: false });
  // antenna mast + dish
  b.cyl(0.02, 0.025, 0.55, { color: P.steel, seg: 4, y: y0 + 1.45, x: 0.12, paint: false });
  beacon(b, 0.12, y0 + 2.02, 0, 0.04, P.red, Mat.Glow);
  b.dome(0.16, { color: P.chrome, mat: Mat.Metal, x: -0.35, y: y0 + 1.05, z: -0.3, rx: -0.6, h: 0.06, wSeg: 8, hSeg: 2, paint: false, detail: true });
  // RCS pods with glowing tips
  ringOf(4, 0.8, (x, z, a) => {
    b.box(0.14, 0.2, 0.14, { color: P.hullDark, x, z, y: y0 + 0.66, ry: a, paint: false });
    b.box(0.05, 0.05, 0.05, { color: P.cyan, mat: Mat.Glow, x: x * 1.12, z: z * 1.12, y: y0 + 0.74, ry: a, paint: false, detail: true });
  }, Math.PI / 4);
  // four splayed legs with pads
  ringOf(4, 1.0, (x, z) => {
    const top: V3 = [x * 0.66, y0 + 0.22, z * 0.66];
    const foot: V3 = [x * 1.32, G + 0.05, z * 1.32];
    strut(b, top, foot, 0.06, 0.045, { color: P.steel, mat: Mat.Metal, seg: 6, paint: false });
    strut(b, [x * 0.5, y0, z * 0.5], [x * 1.1, G + 0.3, z * 1.1], 0.03, 0.03, { color: P.hullDark, seg: 4, paint: false, detail: true });
    b.cyl(0.14, 0.17, 0.05, { color: P.hullDark, seg: 8, x: foot[0], z: foot[2], y: G, paint: false });
  }, Math.PI / 4);
  // boarding ramp down to the plaza (front, +Z)
  b.push({ z: 0.75, y: G });
  b.quad([-0.24, y0 - 0.02, 0], [0.24, y0 - 0.02, 0], [0.24, 0.0, 0.95], [-0.24, 0.0, 0.95], { color: P.steel }, 0x8a909a, Mat.Metal);
  b.quad([0.24, y0 - 0.02, 0], [-0.24, y0 - 0.02, 0], [-0.24, 0.0, 0.95], [0.24, 0.0, 0.95], { color: P.steel }, 0x5a606a, Mat.Plain);
  b.pop();
  b.box(0.4, 0.42, 0.04, { color: 0xffe6a8, mat: Mat.Light, z: 0.79, y: y0 + 0.02, paint: false });
  // memorial plaques + flags + lamps + a wreath of trees
  ringOf(3, 1.85, (x, z, a) => {
    b.box(0.42, 0.16, 0.1, { color: P.granite, x, z, y: G, ry: a, paint: false });
    b.box(0.34, 0.03, 0.012, { color: P.gold, mat: Mat.Glow, x: x * 0.97, z: z * 0.97, y: G + 0.1, ry: a, paint: false, detail: true });
  }, Math.PI);
  flagRing(b, 6, 2.15, 0.55, [P.blue, P.white, P.orange], Math.PI / 6);
  lampRing(b, 8, 1.5, 0.2, P.lamp, Math.PI / 8);
  grove(b, rng, 6, 2.25, ['round', 'pine'], 1.15, 0);
  crowd(b, rng, 8, 1.25, 1.9);
}

/** Obelisk with a gilded pyramidion on a stepped plinth, three founders at its foot. */
export function foundersMonument({ b, rng }: Ctx): void {
  plaza(b, 1, P.marbleWarm, { field: P.paving, fieldR: 0.84 });
  let y = steps(b, 0.86, 3, 0.04, 0.08, P.stone);
  b.cyl(0.11, 0.15, 1.5, { color: P.marble, seg: 4, ry: Math.PI / 4, flat: true, y, paint: false });
  b.cyl(0, 0.11, 0.16, { color: P.gold, seg: 4, ry: Math.PI / 4, flat: true, y: y + 1.5, mat: Mat.Metal, paint: false });
  beacon(b, 0, y + 1.68, 0, 0.03, P.amber, Mat.Glow);
  // gilded band + inscription glow
  b.cyl(0.145, 0.145, 0.04, { color: P.gold, seg: 4, ry: Math.PI / 4, flat: true, y: y + 0.18, mat: Mat.Metal, paint: false });
  y = G + 0.08;
  ringOf(3, 0.32, (x, z, a) => figure(b, { x, z, y, h: 0.24, ry: a, color: P.bronze, mat: Mat.Metal, kind: 'plain', right: [0.18, 0.62, 0.12], detail: true }), Math.PI / 3);
  ringOf(4, 0.62, (x, z) => lamp(b, x, z, 0.18, P.lamp), Math.PI / 4);
  ringOf(4, 0.66, (x, z) => tree(b, x, z, 0.75, 'blossom', rng, G, true));
}

/** Victorian-ish clock tower: glowing faces, open belfry with a golden bell, copper spire. */
export function clockTower({ b }: Ctx): void {
  plaza(b, 1, P.paving, { field: P.grass, fieldR: 0.78 });
  const stone = 0xd8c8a8, trim = 0x8a6a4a;
  b.box(0.62, 0.12, 0.62, { color: P.stoneDark, y: G, paint: false });
  b.box(0.5, 1.7, 0.5, { color: stone, mat: Mat.WindowSmall, y: G + 0.12, top: trim });
  for (const yy of [0.62, 1.22]) b.box(0.54, 0.05, 0.54, { color: trim, y: G + yy, paint: false });
  // clock stage
  const cy = G + 1.82;
  b.box(0.6, 0.56, 0.6, { color: shade(stone, 0.95), y: cy });
  b.box(0.66, 0.06, 0.66, { color: trim, y: cy + 0.56, paint: false });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    const sx = Math.sin(a), sz = Math.cos(a);
    b.push({ x: sx * 0.305, z: sz * 0.305, y: cy + 0.28, ry: a });
    vdisc(b, 0.2, 0.03, { color: 0xfff2d0, mat: Mat.Light, seg: 16, paint: false });
    b.torus(0.205, 0.018, { color: P.gold, mat: Mat.Metal, rx: Math.PI / 2, seg: 16, tube: 4, z: 0.02, paint: false, detail: true });
    b.box(0.018, 0.14, 0.01, { color: P.dark, y: -0.01, z: 0.022, rz: 0.5, paint: false });
    b.box(0.018, 0.1, 0.01, { color: P.dark, y: -0.01, z: 0.024, rz: -1.9, paint: false });
    b.pop();
  }
  // belfry: four corner columns, bell, roof
  const by = cy + 0.62;
  ringOf(4, 0.3, (x, z) => b.box(0.07, 0.4, 0.07, { color: stone, x, z, y: by, paint: false }), Math.PI / 4);
  b.cone(0.13, 0.2, { color: P.gold, mat: Mat.Metal, seg: 10, y: by + 0.12, paint: false });
  b.sphere(0.04, { color: P.amber, mat: Mat.Light, y: by + 0.12, wSeg: 6, hSeg: 3, paint: false });
  b.box(0.58, 0.05, 0.58, { color: trim, y: by + 0.4, paint: false });
  b.cyl(0, 0.42, 0.95, { color: P.copper, seg: 4, ry: Math.PI / 4, flat: true, y: by + 0.45, paint: false });
  b.cyl(0.012, 0.016, 0.22, { color: P.gold, seg: 4, y: by + 1.38, paint: false });
  beacon(b, 0, by + 1.62, 0, 0.03, P.red, Mat.Light);
  ringOf(4, 0.32, (x, z) => b.cone(0.05, 0.18, { color: P.copper, seg: 4, x, z, y: by + 0.45, flat: true, paint: false, detail: true }), Math.PI / 4);
  ringOf(4, 0.7, (x, z) => lamp(b, x, z, 0.2), 0);
}

/** Lighthouse on a rocky outcrop: red & white bands, glass lantern with a blazing lamp, keeper's cottage. */
export function lighthouse({ b, rng }: Ctx): void {
  plaza(b, 1, 0x9a948a, { field: 0xb8b0a0, fieldR: 0.82 });
  // rocks
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rng.range(0, 0.6), r = rng.range(0.42, 0.62);
    b.sphere(rng.range(0.14, 0.24), { color: rng.pick([0x7a746c, 0x8a8478, 0x6a645c]), flat: true, wSeg: 5, hSeg: 3, x: Math.sin(a) * r, z: Math.cos(a) * r, y: G + 0.03, sy: 0.6, paint: false });
  }
  b.cyl(0.32, 0.38, 0.14, { color: 0x8a8478, seg: 8, y: G, flat: true, paint: false });
  // banded tower
  const bands = 6, h = 1.86, y0 = G + 0.14;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands, t1 = (i + 1) / bands;
    b.cyl(0.24 - 0.09 * t1, 0.24 - 0.09 * t0, h / bands, { color: i % 2 === 0 ? 0xf4f2ee : 0xd8342c, seg: 12, y: y0 + t0 * h, capTop: false, paint: false });
  }
  // a few small windows up the tower
  for (let i = 0; i < 3; i++) b.box(0.05, 0.08, 0.02, { color: 0xffe0a0, mat: Mat.Light, y: y0 + 0.35 + i * 0.5, z: 0.21 - i * 0.03, paint: false, detail: true });
  const gy = y0 + h;
  b.cyl(0.24, 0.17, 0.05, { color: P.dark, seg: 12, y: gy, paint: false });
  b.torus(0.23, 0.01, { color: P.dark, y: gy + 0.12, seg: 12, tube: 3, paint: false, detail: true });
  b.cyl(0.12, 0.12, 0.2, { color: 0xbfe6ff, mat: Mat.Glass, seg: 8, y: gy + 0.05, paint: false });
  b.sphere(0.075, { color: 0xfff0a0, mat: Mat.Glow, y: gy + 0.15, wSeg: 8, hSeg: 4, paint: false });
  b.cyl(0.02, 0.15, 0.13, { color: 0xd8342c, seg: 8, y: gy + 0.25, paint: false });
  b.cyl(0.006, 0.01, 0.1, { color: P.dark, seg: 3, y: gy + 0.38, paint: false });
  // beams sweeping out to sea (night light)
  for (const a of [0.3, 0.3 + Math.PI]) {
    b.push({ y: gy + 0.15, ry: a });
    b.cyl(0.09, 0.015, 0.72, { color: 0xfff4c0, mat: Mat.Light, rz: -Math.PI / 2, seg: 6, x: 0.06, capTop: false, paint: false, detail: true });
    b.pop();
  }
  // keeper's cottage
  b.box(0.36, 0.2, 0.26, { color: 0xf4f2ee, mat: Mat.WindowSmall, x: 0.42, z: -0.32, y: G, ry: 0.5 });
  b.gable(0.36, 0.14, 0.26, { color: 0x3a5a7a, x: 0.42, z: -0.32, y: G + 0.2, ry: 0.5, paint: false });
  lamp(b, -0.5, 0.42, 0.18);
}

/** An astronaut planting the colony flag, cast in white bronze on a round plinth. */
export function pioneerStatue({ b, rng }: Ctx): void {
  plaza(b, 1, P.paving, { field: P.grass, fieldR: 0.8, round: true });
  const y = steps(b, 0.7, 2, 0.06, 0.08, P.granite, { round: 16 });
  b.cyl(0.24, 0.26, 0.28, { color: P.stone, seg: 8, y, flat: true, paint: false });
  b.box(0.2, 0.06, 0.012, { color: P.gold, mat: Mat.Glow, y: y + 0.12, z: 0.24, paint: false, detail: true });
  const fy = y + 0.28;
  const hands = figure(b, { y: fy, h: 0.95, color: 0xe6ebf2, mat: Mat.Metal, kind: 'suit', visor: P.amber, right: [0.22, 1.02, 0.06], left: [-0.18, 0.5, 0.12] });
  // flag pole held in the left hand, planted beside the boot
  const px = hands.left[0] * 0.95, pz = hands.left[2] * 0.95;
  b.cyl(0.01, 0.012, 1.22, { color: P.chrome, seg: 4, x: px, z: pz, y: fy, paint: false });
  b.push({ x: px, z: pz, y: fy + 0.88, ry: -0.6 });
  b.panel(0.44, 0.26, { color: P.blue, x: 0.22, both: true, paint: false });
  b.box(0.12, 0.12, 0.01, { color: P.orange, x: 0.12, y: 0.07, z: 0.006, paint: false, detail: true });
  b.pop();
  ringOf(4, 0.62, (x, z) => lamp(b, x, z, 0.18, P.lampCool), Math.PI / 4);
  ringOf(3, 0.66, (x, z) => tree(b, x, z, 0.7, 'pine', rng, G, true), 0.3);
}

// ─────────────────────────────────────────────────────────── T2

/** A soaring stainless catenary arch with a neon spine, framing a reflecting pool. */
export function grandArch({ b, rng }: Ctx): void {
  plaza(b, 7, P.paving, { field: P.grass, fieldR: 0.92 });
  // promenade through the arch
  b.box(1.1, 0.012, 4.6, { color: P.marbleWarm, y: G, paint: false });
  pond(b, 0.8, 1.6, { z: -1.1 });
  pond(b, 0.8, 1.6, { z: 1.1 });
  const S = 2.05, H = 7.2, k = 2.2, n = b.lod ? 10 : 18;
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n;
    const y = H * (1 - (Math.cosh(k * t) - 1) / (Math.cosh(k) - 1));
    pts.push([t * S, G + Math.max(0, y), 0]);
  }
  // legs taper from thick feet to a slender crown
  for (let i = 0; i < n; i++) {
    const tA = Math.abs(-1 + (2 * i) / n), tB = Math.abs(-1 + (2 * (i + 1)) / n);
    strut(b, pts[i], pts[i + 1], 0.12 + 0.2 * tA, 0.12 + 0.2 * tB, { color: 0xd7dee8, mat: Mat.Metal, seg: 3, flat: true, paint: false, caps: false });
    strut(b, [pts[i][0] * 0.93, pts[i][1] - 0.06 - 0.12 * tA, 0.0], [pts[i + 1][0] * 0.93, pts[i + 1][1] - 0.06 - 0.12 * tB, 0], 0.03, 0.03, { color: P.cyan, mat: Mat.Glow, seg: 4, paint: false });
  }
  ringOf(2, 2.05, (x, z) => b.box(0.7, 0.08, 0.7, { color: P.granite, x, z, y: G, paint: false }), Math.PI / 2);
  b.box(0.06, 0.24, 0.06, { color: P.white, mat: Mat.Light, y: G + H - 0.25, paint: false, detail: true });
  lampRing(b, 10, 1.85, 0.22, P.lamp, 0.31);
  grove(b, rng, 8, 2.15, ['round', 'round', 'pine'], 1.2, 0.4);
  crowd(b, rng, 12, 0.3, 2.0);
}

/** Tiered fountain whose central sculpture is a twist of aurora ribbons; water jets ring the basin. */
export function auroraFountain({ b, rng }: Ctx): void {
  plaza(b, 7, P.marbleWarm, { field: P.paving, fieldR: 0.94, round: true });
  pool(b, 1.95, { seg: 28, h: 0.1, rim: P.marble });
  let y = G + 0.1;
  for (let i = 0; i < 3; i++) {
    const r = 1.1 - i * 0.32, h = 0.28 + i * 0.05;
    b.cyl(r * 0.45, r * 0.55, h, { color: P.marble, seg: 14, y, paint: false });
    b.cyl(r, r * 0.95, 0.08, { color: P.marble, seg: 18, y: y + h, paint: false });
    b.cyl(r * 0.88, r * 0.88, 0.012, { color: P.water, mat: Mat.Water, seg: 18, y: y + h + 0.08, paint: false });
    // water curtains spilling over the rim
    b.cyl(r * 0.99, r * 0.99, h * 0.9, { color: P.water, mat: Mat.Water, seg: 18, y: y + 0.02, capTop: false, paint: false, detail: true });
    y += h + 0.08;
  }
  // aurora ribbons (green → teal → violet) twisting above the top basin
  const cols = [0x5affa0, 0x3fe8ff, 0xb070ff];
  for (let k = 0; k < 3; k++) b.tube(helix(0.22, y, y + 1.5, 1.1, b.lod ? 6 : 12, (k / 3) * TAU), 0.035, { color: cols[k], mat: Mat.Glow, seg: 4, paint: false });
  b.sphere(0.12, { color: 0xeafff6, mat: Mat.Glow, y: y + 1.6, wSeg: 8, hSeg: 4, paint: false });
  // ring of jets
  ringOf(12, 1.55, (x, z) => b.cyl(0.012, 0.03, 0.55, { color: 0xbfe8ff, mat: Mat.Water, seg: 4, x, z, y: G + 0.1, capTop: false, paint: false, detail: true }));
  glowRing(b, 12, 1.75, 0x7affd0, { y: G + 0.1, rot: Math.PI / 12 });
  lampRing(b, 8, 2.2, 0.22, P.lamp, Math.PI / 8);
  grove(b, rng, 6, 2.3, ['blossom', 'round'], 1.1);
  crowd(b, rng, 10, 2.0, 2.3);
}

/** Historic rockets standing on their launch stands — the colony's ride, its rivals and its first mistake. */
export function rocketGarden({ b, rng }: Ctx): void {
  plaza(b, 7, P.paving, { field: 0xcfc6b2, fieldR: 0.9 });
  const rocket = (x: number, z: number, h: number, r: number, body: number, band: number, boosters: number) => {
    b.cyl(r * 1.4, r * 1.6, 0.08, { color: P.granite, seg: 8, x, z, y: G, paint: false });
    const y0 = G + 0.08 + r * 0.6;
    b.cyl(r * 0.55, r * 0.8, r * 0.6, { color: P.hullDark, seg: 8, x, z, y: G + 0.08, mat: Mat.Metal, paint: false });
    b.cyl(r, r, h * 0.72, { color: body, seg: 10, x, z, y: y0, paint: false });
    b.cyl(r * 1.01, r * 1.01, h * 0.06, { color: band, seg: 10, x, z, y: y0 + h * 0.22, paint: false });
    b.cyl(r * 1.01, r * 1.01, h * 0.04, { color: band, seg: 10, x, z, y: y0 + h * 0.55, paint: false, detail: true });
    b.cyl(0, r, h * 0.28, { color: band, seg: 10, x, z, y: y0 + h * 0.72, paint: false });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      b.box(0.02, r * 1.6, r * 1.1, { color: band, x: x + Math.sin(a) * r * 1.05, z: z + Math.cos(a) * r * 1.05, y: y0 - r * 0.2, ry: a, paint: false });
    }
    for (let k = 0; k < boosters; k++) {
      const a = (k / boosters) * TAU;
      const bx = x + Math.sin(a) * r * 1.5, bz = z + Math.cos(a) * r * 1.5;
      b.cyl(r * 0.45, r * 0.45, h * 0.38, { color: body, seg: 6, x: bx, z: bz, y: y0, paint: false });
      b.cyl(0, r * 0.45, h * 0.1, { color: band, seg: 6, x: bx, z: bz, y: y0 + h * 0.38, paint: false });
    }
    beacon(b, x, y0 + h + 0.03, z, 0.035, P.red, Mat.Light, true);
  };
  rocket(0, 0, 4.2, 0.3, P.white, 0x23252c, 4);
  rocket(1.35, 0.6, 2.3, 0.17, 0xe8e4dc, P.red, 0);
  rocket(-1.3, 0.75, 2.8, 0.2, P.white, 0x3a6ad0, 2);
  rocket(0.95, -1.35, 1.8, 0.15, 0xf0d070, P.dark, 0);
  rocket(-1.0, -1.25, 2.1, 0.16, 0xd0d8e0, P.orange, 3);
  rocket(0.0, 1.7, 1.4, 0.13, P.white, P.red, 0);
  // gantry tower beside the big one
  truss(b, 0.32, G, 3.4, 0xd84a2a, { x: 0.55, z: -0.35, bays: 6 });
  b.box(0.45, 0.06, 0.08, { color: 0xd84a2a, x: 0.36, z: -0.35, y: 2.9, paint: false });
  // floodlights & placards
  ringOf(4, 2.1, (x, z, a) => {
    b.cyl(0.015, 0.02, 0.5, { color: P.dark, seg: 4, x, z, y: G, paint: false, detail: true });
    b.box(0.14, 0.08, 0.05, { color: 0xfff0d0, mat: Mat.Light, x, z, y: G + 0.5, ry: a, rx: 0.4, paint: false, detail: true });
  }, Math.PI / 4);
  ringOf(6, 1.8, (x, z, a) => b.box(0.2, 0.12, 0.03, { color: P.dark, mat: Mat.Screen, x, z, y: G + 0.08, ry: a, rx: -0.3, paint: false, detail: true }), 0.5);
  grove(b, rng, 5, 2.3, ['pine', 'round'], 1.1, 1.0);
  crowd(b, rng, 10, 0.6, 2.1);
}

/** A slender column wrapped in a golden spiral relief, crowned by a winged figure and a halo of light. */
export function ascensionColumn({ b, rng }: Ctx): void {
  plaza(b, 1, P.marble, { field: P.paving, fieldR: 0.82 });
  let y = steps(b, 0.72, 3, 0.05, 0.06, P.stone);
  b.box(0.36, 0.3, 0.36, { color: P.marbleWarm, y, paint: false });
  b.box(0.3, 0.05, 0.012, { color: P.gold, mat: Mat.Glow, y: y + 0.14, z: 0.18, paint: false, detail: true });
  y += 0.3;
  b.cyl(0.1, 0.12, 2.3, { color: P.marble, seg: 10, y, paint: false });
  b.tube(helix(0.115, y + 0.05, y + 2.25, 3.5, b.lod ? 12 : 28), 0.018, { color: P.gold, mat: Mat.Metal, seg: 4, paint: false, detail: true });
  y += 2.3;
  b.box(0.28, 0.08, 0.28, { color: P.marble, y, paint: false });
  b.torus(0.2, 0.02, { color: 0xfff0c0, mat: Mat.Glow, y: y + 0.42, seg: 16, tube: 4, paint: false });
  y += 0.08;
  figure(b, { y, h: 0.5, color: P.gold, mat: Mat.Metal, kind: 'robe', right: [0.12, 1.1, 0.06], left: [-0.26, 0.62, 0.1] });
  // wings
  for (const s of [-1, 1]) b.box(0.03, 0.34, 0.12, { color: P.gold, mat: Mat.Metal, x: s * 0.12, y: y + 0.3, z: -0.08, rz: s * -0.55, ry: s * 0.4, paint: false });
  ringOf(4, 0.62, (x, z) => lamp(b, x, z, 0.18), Math.PI / 4);
  ringOf(2, 0.66, (x, z) => tree(b, x, z, 0.75, 'round', rng, G, true), Math.PI / 2);
}

// ─────────────────────────────────────────────────────────── T3

/** Tripod observation tower with a flying-saucer deck, neon halo and a spire tipped with a red beacon. */
export function skyNeedle({ b, rng }: Ctx): void {
  plaza(b, 7, P.paving, { field: P.grass, fieldR: 0.9, round: true });
  const white = 0xf2f4f6, deckY = 6.1;
  // base pavilion
  b.cyl(0.75, 0.8, 0.32, { color: 0x9fd0f0, mat: Mat.Glass, seg: 16, y: G, top: white, paint: false });
  // core shaft (glass lift tube)
  b.cyl(0.2, 0.24, deckY, { color: 0x8ac8f0, mat: Mat.Glass, seg: 10, y: G, paint: false });
  // three legs: splayed feet → pinched waist → deck
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    const sx = Math.sin(a), sz = Math.cos(a);
    const pts: V3[] = [[sx * 1.55, G, sz * 1.55], [sx * 0.9, 1.4, sz * 0.9], [sx * 0.32, 3.2, sz * 0.32], [sx * 0.42, 4.7, sz * 0.42], [sx * 0.62, deckY, sz * 0.62]];
    taper(b, pts, 0.13, 0.07, { color: white, seg: 6, paint: false });
    b.cyl(0.2, 0.24, 0.1, { color: P.granite, seg: 8, x: pts[0][0], z: pts[0][2], y: G, paint: false });
  }
  b.torus(0.5, 0.05, { color: white, y: 3.2, seg: 16, tube: 4, paint: false });
  // the saucer deck
  b.lathe([[0.3, deckY - 0.1], [1.15, deckY + 0.18], [1.6, deckY + 0.36], [1.62, deckY + 0.42], [1.5, deckY + 0.5]], { color: white, seg: 24, paint: false });
  b.cyl(1.5, 1.5, 0.26, { color: 0x7ab8e0, mat: Mat.Glass, seg: 24, y: deckY + 0.5, capTop: false, paint: false });
  b.lathe([[1.52, deckY + 0.76], [1.2, deckY + 0.9], [0.5, deckY + 1.02], [0.0, deckY + 1.05]], { color: white, seg: 24, paint: false });
  b.torus(1.63, 0.035, { color: P.cyan, mat: Mat.Glow, y: deckY + 0.4, seg: 32, tube: 4, paint: false });
  b.torus(1.1, 0.025, { color: P.magenta, mat: Mat.Glow, y: deckY + 0.18, seg: 24, tube: 3, paint: false, detail: true });
  // spire
  b.cyl(0.05, 0.16, 2.2, { color: white, seg: 8, y: deckY + 1.05, paint: false });
  beacon(b, 0, deckY + 3.3, 0, 0.07, P.red, Mat.Glow);
  b.torus(0.12, 0.02, { color: P.red, mat: Mat.Light, y: deckY + 2.2, seg: 10, tube: 3, paint: false, detail: true });
  lampRing(b, 10, 2.0, 0.22, P.lampCool, 0.3);
  grove(b, rng, 9, 2.25, ['round', 'pine', 'blossom'], 1.1);
  crowd(b, rng, 10, 0.95, 1.9);
}

/** Five-tier pagoda outlined in neon, with a torii gate, paper lanterns and cherry trees. */
export function neonPagoda({ b, rng }: Ctx): void {
  plaza(b, 7, 0x3a3640, { field: 0xd8d0c0, fieldR: 0.9 });
  let y = steps(b, 2.3, 2, 0.12, 0.12, 0x5a4a44);
  const neon = [P.magenta, P.cyan, P.magenta, P.cyan, 0xffd84a];
  for (let i = 0; i < 5; i++) {
    const w = 1.5 - i * 0.22, h = i === 0 ? 0.62 : 0.46;
    b.box(w, h, w, { color: i % 2 ? 0x9a2a2a : 0xb83a2a, mat: Mat.WindowSmall, y, top: 0x2a1a1a });
    y += h;
    const ew = w * 0.86 + 0.32;
    // eave: square frustum roof with upturned golden corners and a neon trim line
    b.cyl(ew * 0.42, ew * 0.74, 0.2, { color: 0x2a2228, seg: 4, ry: Math.PI / 4, flat: true, y, paint: false });
    const hw = (ew * 0.74) / Math.SQRT2;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      const ox = Math.sin(a) * hw, oz = Math.cos(a) * hw;
      b.box(ew * 1.04, 0.035, 0.035, { color: neon[i], mat: Mat.Glow, x: ox, z: oz, y: y + 0.005, ry: a + Math.PI / 2, paint: false });
      const cx = Math.sin(a + Math.PI / 4) * hw * Math.SQRT2, cz = Math.cos(a + Math.PI / 4) * hw * Math.SQRT2;
      b.cone(0.05, 0.16, { color: P.gold, seg: 4, x: cx, z: cz, y: y + 0.02, rx: Math.cos(a + Math.PI / 4) * 0.6, rz: -Math.sin(a + Math.PI / 4) * 0.6, paint: false, detail: true });
      b.box(0.07, 0.12, 0.07, { color: 0xff5a3a, mat: Mat.Glow, x: cx * 0.98, z: cz * 0.98, y: y - 0.14, paint: false, detail: true });
    }
    y += 0.2;
  }
  // sorin finial
  b.cyl(0.03, 0.04, 1.1, { color: P.gold, mat: Mat.Metal, seg: 6, y, paint: false });
  for (let k = 0; k < 5; k++) b.torus(0.09 - k * 0.01, 0.015, { color: P.gold, mat: Mat.Metal, y: y + 0.25 + k * 0.13, seg: 10, tube: 3, paint: false, detail: true });
  b.sphere(0.08, { color: 0xffe0a0, mat: Mat.Glow, y: y + 1.15, wSeg: 8, hSeg: 4, paint: false });
  // torii gate at the front
  const tz = 1.95;
  for (const s of [-1, 1]) b.cyl(0.05, 0.06, 0.95, { color: 0xd8342c, seg: 8, x: s * 0.42, z: tz, y: G, paint: false });
  b.box(1.2, 0.07, 0.1, { color: 0x1a1414, y: G + 0.95, z: tz, paint: false });
  b.box(1.0, 0.05, 0.08, { color: 0xd8342c, y: G + 0.78, z: tz, paint: false });
  b.box(1.1, 0.025, 0.02, { color: P.magenta, mat: Mat.Glow, y: G + 1.02, z: tz + 0.05, paint: false });
  // lantern posts
  ringOf(8, 1.7, (x, z) => {
    b.cyl(0.02, 0.03, 0.26, { color: 0x4a4a4a, seg: 4, x, z, y: G, paint: false, detail: true });
    b.box(0.09, 0.1, 0.09, { color: 0xffb070, mat: Mat.Light, x, z, y: G + 0.26, paint: false, detail: true });
  }, Math.PI / 8);
  grove(b, rng, 7, 2.2, ['blossom'], 1.2, 0.5);
}

/** A colossal civic hall crowned by a glass mega-dome; portico, grand stairs, flags and fountains. */
export function megadomeHall(ctx: Ctx): void {
  const { b, rng, style } = ctx;
  const wall = style.walls[ctx.variant % style.walls.length], trim = style.trims[0], glass = style.glass, accent = style.accents[0];
  plaza(b, 7, P.paving, { field: style.green > 0.5 ? 0x6aad48 : P.pavingWarm, fieldR: 0.9 });
  const y0 = G;
  b.box(3.4, 0.14, 2.3, { color: shade(wall, 0.8), y: y0, paint: false });
  b.box(3.1, 0.82, 1.9, { color: wall, mat: Mat.Window, y: y0 + 0.14, top: trim });
  b.box(3.2, 0.08, 2.0, { color: trim, y: y0 + 0.96, paint: false });
  b.box(1.2, 0.32, 1.2, { color: wall, mat: Mat.Window, y: y0 + 1.04, x: 0, top: trim });
  // portico: columns + pediment
  for (let i = 0; i < 6; i++) b.cyl(0.055, 0.06, 0.78, { color: trim, seg: 8, x: -0.85 + i * 0.34, z: 1.18, y: y0 + 0.14, paint: false });
  b.box(2.0, 0.08, 0.42, { color: trim, y: y0 + 0.92, z: 1.08, paint: false });
  b.gable(2.0, 0.3, 0.42, { color: shade(trim, 0.95), y: y0 + 1.0, z: 1.08, paint: false });
  stairs(b, 1.7, 3, 0.045, 0.1, P.stone, { z: 1.62, y: G });
  // drum + dome + lantern
  const dy = y0 + 1.36;
  b.cyl(0.82, 0.86, 0.42, { color: wall, mat: Mat.Window, seg: 20, y: dy, top: trim });
  b.torus(0.86, 0.035, { color: trim, y: dy + 0.42, seg: 20, tube: 4, paint: false });
  b.dome(0.84, { color: mix(glass, 0xffffff, 0.15), mat: Mat.Glass, y: dy + 0.42, h: 1.0, wSeg: 20, hSeg: 8, paint: false });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const pts: V3[] = [];
    for (let j = 0; j <= 5; j++) {
      const t = (j / 5) * (Math.PI / 2);
      pts.push([Math.sin(a) * Math.cos(t) * 0.86, dy + 0.42 + Math.sin(t) * 1.02, Math.cos(a) * Math.cos(t) * 0.86]);
    }
    b.tube(pts, 0.02, { color: trim, mat: Mat.Metal, seg: 3, paint: false, detail: true });
  }
  b.cyl(0.14, 0.16, 0.22, { color: trim, seg: 8, y: dy + 1.4, paint: false });
  b.sphere(0.08, { color: accent, mat: Mat.Glow, y: dy + 1.7, wSeg: 6, hSeg: 4, paint: false });
  b.cyl(0.008, 0.01, 0.4, { color: P.chrome, seg: 3, y: dy + 1.62, paint: false, detail: true });
  b.box(0.2, 0.12, 0.004, { color: accent, x: 0.1, y: dy + 1.86, paint: false, detail: true });
  // forecourt
  pool(b, 0.32, { x: -1.2, z: 1.8, seg: 12 });
  pool(b, 0.32, { x: 1.2, z: 1.8, seg: 12 });
  ringOf(2, 1.6, (x) => flag(b, x * 0.75, 2.05, 0.7, accent), Math.PI / 2);
  lampRing(b, 10, 2.15, 0.22, P.lamp, 0.3);
  grove(b, rng, 7, 2.25, style.green > 0.5 ? ['round', 'blossom'] : ['round', 'pine'], 1.1, Math.PI / 7);
  crowd(b, rng, 10, 1.5, 2.1);
}

/** Helical tower of twisting reading floors, wrapped by a ramp and lit by a lantern of knowledge. */
export function spiralLibrary({ b, rng }: Ctx): void {
  plaza(b, 7, P.pavingWarm, { field: P.grass, fieldR: 0.9, round: true });
  const floors = 13, fh = 0.26;
  let y = G + 0.06;
  b.cyl(1.25, 1.3, 0.06, { color: P.stone, seg: 16, y: G, paint: false });
  const spines = [0xb8423a, 0x3a6ad0, 0x4a9a5a, 0xe0b040, 0x8a4ab0];
  for (let i = 0; i < floors; i++) {
    const t = i / floors;
    const w = 1.85 - t * 0.6, d = 1.05 - t * 0.25;
    b.box(w, fh, d, { color: 0xf0e6d6, mat: Mat.Window, y, ry: i * 0.21, top: 0xd8ccb8 });
    b.box(w + 0.06, 0.035, d + 0.06, { color: spines[i % spines.length], y: y + fh - 0.01, ry: i * 0.21, paint: false });
    y += fh + 0.03;
  }
  b.cyl(0.38, 0.42, 0.08, { color: P.bronze, seg: 12, y, paint: false });
  b.dome(0.36, { color: 0xffe6b0, mat: Mat.Glass, y: y + 0.08, h: 0.42, wSeg: 12, hSeg: 4, paint: false });
  b.sphere(0.12, { color: 0xffd890, mat: Mat.Glow, y: y + 0.38, wSeg: 8, hSeg: 4, paint: false });
  beam(b, 1.4, 0.05, 0xffe0a0, { y: y + 0.5 });
  // outer spiral ramp with a glowing handrail
  b.tube(helix(1.28, G + 0.1, y - 0.2, 2.2, b.lod ? 14 : 30), 0.05, { color: P.marble, seg: 4, paint: false });
  b.tube(helix(1.32, G + 0.22, y - 0.08, 2.2, b.lod ? 14 : 30), 0.012, { color: 0xffd890, mat: Mat.Glow, seg: 3, paint: false, detail: true });
  // reading garden: benches, book-stack sculptures, lamps
  ringOf(6, 1.8, (x, z, a) => b.box(0.3, 0.05, 0.08, { color: P.wood, x, z, y: G + 0.04, ry: a + Math.PI / 2, paint: false, detail: true }), 0.25);
  lampRing(b, 8, 1.95, 0.2, P.lamp, 0.1);
  grove(b, rng, 7, 2.25, ['round', 'blossom'], 1.05, 0.4);
  crowd(b, rng, 9, 1.5, 2.1);
}

/** A mossy cave hill glowing from within, ringed by luminous mushrooms and a crystal pool. */
export function grotto({ b, rng }: Ctx): void {
  plaza(b, 7, 0x4a5a4a, { field: 0x3f6a4a, fieldR: 0.92, round: true });
  // the mound
  const rocks: [number, number, number, number][] = [[0, -0.3, 1.25, 0.8], [-0.9, -0.1, 0.8, 0.6], [0.95, -0.2, 0.85, 0.65], [-0.3, -1.0, 0.85, 0.7], [0.5, -0.95, 0.75, 0.6], [0, 0.35, 0.7, 0.55]];
  for (const [x, z, r, sy] of rocks) b.sphere(r, { color: rng.pick([0x5a6a62, 0x4f5f5a, 0x667468]), flat: true, wSeg: 7, hSeg: 5, x, z, y: G - r * 0.2, sy, paint: false });
  // moss caps
  b.sphere(0.95, { color: 0x4f8a4a, mat: Mat.Foliage, flat: true, wSeg: 7, hSeg: 3, y: G + 0.62, z: -0.35, sy: 0.35, thetaLength: Math.PI / 2, paint: false });
  // cave mouth: dark arch with a glowing interior
  b.push({ z: 0.88, y: G });
  arch(b, 0.42, 0.1, { color: 0x3a4440, seg: 10, tube: 4, paint: false });
  vdisc(b, 0.36, 0.04, { color: 0x30f0d0, mat: Mat.Holo, seg: 12, y: 0, z: -0.04, paint: false });
  b.box(0.75, 0.37, 0.05, { color: 0x30f0d0, mat: Mat.Holo, y: -0.01, z: -0.04, paint: false });
  b.pop();
  // crystal pool
  pool(b, 0.55, { z: 1.55, seg: 14, rim: 0x5a6a62 });
  // bioluminescent mushrooms
  const mush = [0x3fe8ff, 0xff5ad0, 0x9a5aff, 0x5affc8];
  for (let i = 0; i < 18; i++) {
    const a = rng.range(0, TAU), r = rng.range(1.25, 2.2);
    const x = Math.sin(a) * r, z = Math.cos(a) * r, s = rng.range(0.6, 1.4);
    const det = i >= 10;
    b.cyl(0.02 * s, 0.03 * s, 0.16 * s, { color: 0xe8e0d0, seg: 4, x, z, y: G, paint: false, detail: det });
    b.sphere(0.08 * s, { color: rng.pick(mush), mat: Mat.Glow, wSeg: 6, hSeg: 2, thetaLength: Math.PI / 2, x, z, y: G + 0.16 * s, sy: 0.6, paint: false, detail: det });
  }
  // glowing vines & crystals on the hill
  for (let i = 0; i < 6; i++) {
    const a = rng.range(-1.6, 1.6);
    shard(b, 0.06, 0.25, rng.pick([0x9a5aff, 0x3fe8ff]), { x: Math.sin(a) * 1.1, z: Math.cos(a) * 1.1 - 0.4, y: G + 0.5, rx: rng.range(-0.4, 0.4), rz: rng.range(-0.4, 0.4), mat: Mat.Glow, detail: i >= 3 });
  }
  glowRing(b, 14, 2.3, 0x5affc8, { rot: 0.2 });
  ringOf(5, 2.2, (x, z) => tree(b, x, z, 1.0, 'glow', rng, G, true), 2.3);
}

// ─────────────────────────────────────────────────────────── T4

/** A glass pyramid with a glowing skeleton, gold capstone and a pillar of light into the sky. */
export function pyramidOfLight({ b }: Ctx): void {
  plaza(b, 7, P.granite, { field: P.water, fieldR: 0.86, fieldMat: Mat.Water, kerb: P.stone });
  b.box(2.9, 0.08, 2.9, { color: P.stone, y: G, paint: false });
  const y0 = G + 0.08, W = 2.6, H = 2.05;
  b.pyramid(W, H, W, { color: 0x9fd0f0, mat: Mat.Glass, y: y0, paint: false });
  // glowing edges
  const hw = W / 2;
  for (const [cx, cz] of [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]] as [number, number][]) strut(b, [cx, y0, cz], [0, y0 + H, 0], 0.03, 0.03, { color: 0xffe08a, mat: Mat.Glow, seg: 4, paint: false });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    b.box(W, 0.03, 0.03, { color: 0xffe08a, mat: Mat.Glow, x: Math.sin(a) * hw, z: Math.cos(a) * hw, y: y0, ry: a + Math.PI / 2, paint: false });
  }
  b.pyramid(0.36, 0.28, 0.36, { color: P.gold, mat: Mat.Metal, y: y0 + H - 0.26, paint: false });
  beacon(b, 0, y0 + H + 0.04, 0, 0.07, 0xfff4d0, Mat.Glow);
  beam(b, 7.5, 0.12, 0xfff0c0, { y: y0 + H, seg: 8 });
  // little pyramids at the corners
  for (const [cx, cz] of [[-1.7, 0], [1.7, 0], [0, 1.7], [0, -1.7]] as [number, number][]) {
    b.box(0.6, 0.05, 0.6, { color: P.stone, x: cx, z: cz, y: G, paint: false });
    b.pyramid(0.5, 0.4, 0.5, { color: 0x9fd0f0, mat: Mat.Glass, x: cx, z: cz, y: G + 0.05, paint: false });
    beacon(b, cx, G + 0.47, cz, 0.03, 0xffe08a, Mat.Glow, true);
  }
  lampRing(b, 12, 2.25, 0.2, P.lampCool, Math.PI / 12);
}

/** A colossal robed guardian holding aloft a burning torch and the colony charter. */
export function colossus({ b, rng }: Ctx): void {
  plaza(b, 7, P.stone, { field: P.paving, fieldR: 0.9, round: true });
  let y = steps(b, 3.1, 3, 0.1, 0.18, P.stoneDark, { round: 12 });
  b.box(1.25, 0.95, 1.25, { color: P.marbleWarm, y, top: P.stone, paint: false });
  b.box(1.31, 0.08, 1.31, { color: P.stoneDark, y: y + 0.95, paint: false });
  ringOf(4, 0.63, (x, z, a) => b.box(0.7, 0.08, 0.02, { color: P.gold, mat: Mat.Glow, x, z, y: y + 0.6, ry: a, paint: false, detail: true }));
  y += 1.03;
  const patina = 0x5fae94;
  const h = 4.6;
  const hands = figure(b, { y, h, color: patina, mat: Mat.Plain, kind: 'robe', right: [0.2, 1.15, 0.04], left: [-0.17, 0.58, 0.16] });
  // torch: handle + cup + flame
  const tx = hands.right[0] * h, ty = y + hands.right[1] * h, tz = hands.right[2] * h;
  b.cyl(0.07, 0.05, 0.42, { color: patina, seg: 6, x: tx, y: ty - 0.12, z: tz, paint: false });
  b.cyl(0.16, 0.08, 0.14, { color: P.gold, mat: Mat.Metal, seg: 8, x: tx, y: ty + 0.3, z: tz, paint: false });
  b.cone(0.13, 0.42, { color: 0xffa040, mat: Mat.Lava, seg: 6, x: tx, y: ty + 0.42, z: tz, paint: false });
  b.cone(0.07, 0.3, { color: 0xfff0a0, mat: Mat.Glow, seg: 5, x: tx, y: ty + 0.44, z: tz, paint: false });
  // charter tablet
  b.box(0.28, 0.36, 0.06, { color: patina, x: hands.left[0] * h, y: y + hands.left[1] * h - 0.05, z: hands.left[2] * h + 0.02, rx: -0.3, paint: false });
  // crown of rays
  ringOf(7, 0.36, (x, z, a) => b.cone(0.045, 0.32, { color: patina, seg: 4, x, z, y: y + 0.9 * h, rx: Math.cos(a) * 0.5, rz: -Math.sin(a) * 0.5, paint: false }), -Math.PI / 2);
  // floodlights aimed up at the statue
  ringOf(4, 1.65, (x, z, a) => b.box(0.16, 0.1, 0.1, { color: 0xfff0d0, mat: Mat.Light, x, z, y: G, ry: a, rx: -0.6, paint: false, detail: true }), Math.PI / 4);
  flagRing(b, 8, 2.15, 0.6, [P.red, P.white, P.blue, P.gold], Math.PI / 8);
  grove(b, rng, 6, 2.3, ['pine', 'round'], 1.1, 0.2);
  crowd(b, rng, 10, 1.7, 2.2);
}

/** A forest of faceted crystal shards around a luminous core, with fragments floating overhead. */
export function crystalSpire({ b, rng }: Ctx): void {
  plaza(b, 7, 0x2c2838, { field: 0x4a3f6a, fieldR: 0.9, round: true });
  const cols = [0xc8b8ff, 0xb0e8ff, 0xe0c8ff, 0x9fd8f0];
  // luminous core pillar
  shard(b, 0.2, 5.6, 0x9f8aff, { mat: Mat.Holo, tip: 0.8, y: G });
  // main shards (tall, faceted)
  shard(b, 0.55, 4.6, 0xd8ccff, { y: G, tip: 1.6, rx: 0.06, rz: 0.04, ry: 0.3 });
  shard(b, 0.4, 3.2, 0xb8e8ff, { x: 0.65, z: 0.25, y: G, tip: 1.1, rz: -0.25, ry: 0.2 });
  shard(b, 0.42, 3.6, 0xe6d2ff, { x: -0.6, z: 0.35, y: G, tip: 1.2, rz: 0.22, rx: 0.1 });
  shard(b, 0.36, 2.6, 0xa8dcf6, { x: 0.15, z: -0.7, y: G, tip: 1.0, rx: -0.28 });
  // outer ring of leaning shards
  ringOf(9, 1.5, (x, z, a, i) => {
    const h = rng.range(0.7, 1.5);
    shard(b, rng.range(0.14, 0.24), h, rng.pick(cols), { x, z, y: G, tip: h * 0.5, rx: Math.cos(a) * 0.45, rz: -Math.sin(a) * 0.45, detail: i % 3 === 2 });
  }, 0.2);
  // floating fragments
  ringOf(6, 1.45, (x, z, a, i) => shard(b, 0.09, 0.25, i % 2 ? 0x3fe8ff : 0xff6ad8, { x, z, y: 3.4 + (i % 3) * 0.55, tip: 0.2, rx: a, rz: 0.5, mat: Mat.Glow }), 0.5);
  b.torus(1.45, 0.025, { color: 0xc8a8ff, mat: Mat.Glow, y: 3.9, rx: 0.15, seg: 32, tube: 3, paint: false });
  glowRing(b, 16, 2.15, 0xb08aff, { s: 1.2 });
  lampRing(b, 6, 2.3, 0.2, P.lampCool, 0.4);
}

/** A hovering moon rendered in light above a stepped pedestal, wrapped in projected orbit rings. */
export function holoMoon({ b, rng }: Ctx): void {
  plaza(b, 7, 0x2a2e3a, { field: 0x3a4050, fieldR: 0.9, round: true });
  let y = steps(b, 2.6, 3, 0.1, 0.22, 0x5a6070, { round: 20 });
  b.torus(0.8, 0.03, { color: P.cyan, mat: Mat.Glow, y: y + 0.01, seg: 24, tube: 3, paint: false });
  b.cyl(0.55, 0.65, 0.18, { color: 0x3a3f4e, seg: 16, y, paint: false });
  b.cyl(0.42, 0.42, 0.02, { color: 0xbfefff, mat: Mat.Glow, seg: 16, y: y + 0.18, paint: false });
  y += 0.2;
  // projector pylons
  ringOf(3, 1.25, (x, z) => {
    strut(b, [x, G + 0.3, z], [x * 0.75, 2.0, z * 0.75], 0.12, 0.06, { color: 0x4a4f5e, mat: Mat.Metal, seg: 5, caps: true, paint: false });
    beacon(b, x * 0.75, 2.05, z * 0.75, 0.07, P.cyan, Mat.Glow);
    strut(b, [x * 0.75, 2.05, z * 0.75], [0, 3.3, 0], 0.01, 0.01, { color: 0x9fe8ff, mat: Mat.Holo, seg: 3, paint: false, detail: true });
  }, Math.PI / 3);
  // the moon
  const my = 3.35;
  b.sphere(1.05, { color: 0xbfe6ff, mat: Mat.Holo, y: my, wSeg: 18, hSeg: 12, paint: false });
  for (let i = 0; i < 6; i++) {
    const th = rng.range(0.4, 2.6), ph = rng.range(0, TAU), r = rng.range(0.12, 0.26);
    b.sphere(r, { color: 0x7aa8ff, mat: Mat.Holo, x: Math.sin(th) * Math.sin(ph) * 0.98, y: my + Math.cos(th) * 0.98, z: Math.sin(th) * Math.cos(ph) * 0.98, sx: 1, sy: 0.4, wSeg: 6, hSeg: 3, paint: false, detail: i >= 3 });
  }
  b.torus(1.5, 0.025, { color: 0x9fe8ff, mat: Mat.Holo, y: my, rx: 0.35, rz: 0.15, seg: 32, tube: 3, paint: false });
  b.torus(1.75, 0.02, { color: 0xc8a8ff, mat: Mat.Holo, y: my, rx: -0.25, rz: -0.4, seg: 32, tube: 3, paint: false });
  b.sphere(0.12, { color: 0xffffff, mat: Mat.Glow, x: 1.5 * Math.sin(1.1), y: my + 0.3, z: 1.5 * Math.cos(1.1) * 0.94, wSeg: 6, hSeg: 4, paint: false, detail: true });
  lampRing(b, 10, 2.2, 0.2, P.lampCool, 0.2);
  crowd(b, rng, 10, 1.6, 2.2);
}

/** A lattice tower ringed by a magnetic roller-coaster that corkscrews to the top. */
export function magCoasterTower({ b, rng }: Ctx): void {
  plaza(b, 7, 0x3a3e48, { field: 0x5a5f6e, fieldR: 0.9, round: true });
  const top = 6.2;
  truss(b, 0.7, G, top, 0xe8ecf2, { bays: 9, r: 0.035 });
  b.cyl(0.6, 0.5, 0.2, { color: 0xe8ecf2, seg: 12, y: top, paint: false });
  b.cyl(0.5, 0.5, 0.36, { color: 0x7ab8e0, mat: Mat.Glass, seg: 12, y: top + 0.2, paint: false });
  b.cone(0.55, 0.5, { color: P.magenta, seg: 12, y: top + 0.56, paint: false });
  beacon(b, 0, top + 1.12, 0, 0.07, P.cyan, Mat.Glow);
  // the track: a double helix of rails with glowing undersides
  const n = b.lod ? 22 : 44;
  const track = helix(1.4, 0.45, top - 0.3, 2.6, n);
  b.tube(track, 0.07, { color: P.magenta, mat: Mat.Metal, seg: 4, paint: false });
  b.tube(helix(1.4, 0.37, top - 0.38, 2.6, n), 0.025, { color: P.cyan, mat: Mat.Glow, seg: 3, paint: false });
  // supports from the tower to the track
  for (let i = 2; i < track.length; i += b.lod ? 3 : 4) {
    const p = track[i];
    strut(b, [p[0] * 0.26, p[1] - 0.15, p[2] * 0.26], [p[0], p[1] - 0.05, p[2]], 0.025, 0.025, { color: 0xe8ecf2, seg: 3, paint: false });
  }
  // a train of cars
  for (let c = 0; c < 4; c++) {
    const p = track[12 + c];
    const q = track[13 + c];
    b.box(0.22, 0.14, 0.32, { color: [P.yellow, P.cyan, P.yellow, P.cyan][c], x: p[0], y: p[1] + 0.06, z: p[2], ry: Math.atan2(q[0] - p[0], q[2] - p[2]), paint: false });
  }
  // station + screen sign
  b.box(1.0, 0.36, 0.6, { color: 0x2a2e3a, mat: Mat.Window, x: 1.35, z: 1.2, y: G, ry: 0.8 });
  b.box(0.7, 0.24, 0.04, { color: P.dark, mat: Mat.Screen, x: 1.12, z: 1.42, y: G + 0.4, ry: 0.8, paint: false });
  lampRing(b, 8, 2.2, 0.22, P.lampCool, 0.4);
  grove(b, rng, 6, 2.3, ['round', 'palm'], 1.1, 1.2);
  crowd(b, rng, 12, 1.7, 2.2);
}

/** Three slender glass towers carrying cantilevered gardens, with waterfalls dropping from terrace to terrace. */
export function skyGardens({ b, rng }: Ctx): void {
  plaza(b, 7, P.pavingWarm, { field: P.grass, fieldR: 0.92 });
  const towers: [number, number, number][] = [];
  ringOf(3, 1.05, (x, z, _a, i) => {
    const h = 4.4 + i * 1.1;
    towers.push([x, z, h]);
    b.cyl(0.24, 0.3, h, { color: 0x8ac8e0, mat: Mat.Glass, seg: 10, x, z, y: G, top: 0xe8ecf0, paint: false });
    b.cyl(0.08, 0.1, 0.6, { color: 0xe8ecf0, seg: 6, x, z, y: G + h, paint: false });
    beacon(b, x, G + h + 0.64, z, 0.05, P.red, Mat.Light);
  }, Math.PI / 6);
  // garden platforms between towers
  const plats: [number, number, number, number][] = [[0.35, 0.3, 1.4, 0.8], [-0.4, -0.2, 2.6, 0.75], [0.2, -0.45, 3.8, 0.7], [-0.15, 0.4, 4.9, 0.6]];
  for (const [x, z, y, r] of plats) {
    b.cyl(r, r * 0.85, 0.14, { color: 0xe8ecf0, seg: 12, x, z, y: y - 0.14, paint: false });
    b.cyl(r * 0.95, r * 0.95, 0.05, { color: 0x5a9a3f, mat: Mat.Foliage, seg: 12, x, z, y, paint: false });
    b.torus(r, 0.02, { color: 0x9affc8, mat: Mat.Glow, x, z, y: y - 0.07, seg: 14, tube: 3, paint: false, detail: true });
    for (let k = 0; k < 3; k++) {
      const a = rng.range(0, TAU), rr = rng.range(0, r * 0.6);
      tree(b, x + Math.sin(a) * rr, z + Math.cos(a) * rr, rng.range(0.9, 1.3), rng.pick(['round', 'blossom', 'round'] as const), rng, y + 0.05, k === 2);
    }
    // hanging greenery
    b.cyl(r * 0.98, r * 0.92, 0.12, { color: 0x4a8a3a, mat: Mat.Foliage, seg: 12, x, z, y: y - 0.26, capTop: false, paint: false, detail: true });
  }
  // waterfalls: from each platform's outer edge down to the next / the pool
  pool(b, 0.75, { x: 0.55, z: 1.25, seg: 14 });
  for (let i = 0; i < plats.length; i++) {
    const [x, z, y, r] = plats[i];
    const a = Math.atan2(x, z) || 0.4;
    const fx = x + Math.sin(a) * r * 0.9, fz = z + Math.cos(a) * r * 0.9;
    const yb = i === 0 ? G + 0.06 : plats[i - 1][2] + 0.05;
    b.box(0.22, y - yb, 0.03, { color: 0xbfe8ff, mat: Mat.Water, x: fx, z: fz, y: yb, ry: a, paint: false });
  }
  // sky bridges
  strut(b, [towers[0][0], 3.2, towers[0][1]], [towers[1][0], 3.2, towers[1][1]], 0.07, 0.07, { color: 0x9fd8f0, mat: Mat.Glass, seg: 4, paint: false });
  strut(b, [towers[1][0], 4.3, towers[1][1]], [towers[2][0], 4.3, towers[2][1]], 0.07, 0.07, { color: 0x9fd8f0, mat: Mat.Glass, seg: 4, paint: false });
  lampRing(b, 8, 2.2, 0.2, P.lamp, 0.2);
  crowd(b, rng, 10, 1.5, 2.2);
}

// ─────────────────────────────────────────────────────────── T5 – T6

/** A gothic cathedral hovering on a floating rock above its plaza, held aloft by glowing anti-grav rings. */
export function floatingCathedral({ b, rng }: Ctx): void {
  plaza(b, 7, P.marble, { field: P.paving, fieldR: 0.9, round: true });
  // ground emitter
  b.cyl(0.9, 1.0, 0.1, { color: 0x4a4f5e, seg: 16, y: G, paint: false });
  b.torus(0.85, 0.05, { color: P.cyan, mat: Mat.Glow, y: G + 0.12, seg: 24, tube: 4, paint: false });
  ringOf(4, 0.7, (x, z) => strut(b, [x, G + 0.1, z], [x * 0.7, 1.7, z * 0.7], 0.03, 0.015, { color: 0x9fe8ff, mat: Mat.Holo, seg: 4, paint: false }), Math.PI / 4);
  // floating rock
  const ry = 2.3;
  b.cyl(1.55, 0.2, 1.1, { color: 0x7a6e62, seg: 9, flat: true, y: ry - 1.1, paint: false });
  b.cyl(1.6, 1.55, 0.2, { color: 0x6a8a4a, seg: 9, flat: true, y: ry, top: 0x7aa85a, paint: false });
  ringOf(5, 0.75, (x, z, a) => shard(b, 0.08, 0.3, 0x9fe8ff, { x, z, y: ry - 0.55, rx: Math.PI + Math.cos(a) * 0.4, rz: -Math.sin(a) * 0.4, mat: Mat.Glow, detail: true }), 0.3);
  b.torus(1.35, 0.06, { color: P.cyan, mat: Mat.Glow, y: ry - 0.35, seg: 24, tube: 4, paint: false });
  b.torus(0.9, 0.05, { color: 0x9fe8ff, mat: Mat.Glow, y: ry - 0.75, seg: 18, tube: 3, paint: false });
  // cathedral
  const cy = ry + 0.2, stone = 0xe8e2d6, roof = 0x4a5a7a;
  b.box(0.8, 0.9, 2.0, { color: stone, mat: Mat.Window, y: cy, top: roof });
  b.gable(0.8, 0.5, 2.0, { color: roof, y: cy + 0.9, ry: Math.PI / 2, paint: false });
  b.box(1.9, 0.75, 0.6, { color: stone, mat: Mat.Window, y: cy, z: -0.2, top: roof });
  b.gable(1.9, 0.42, 0.6, { color: roof, y: cy + 0.75, z: -0.2, paint: false });
  // apse
  b.cyl(0.42, 0.42, 0.8, { color: stone, mat: Mat.Window, seg: 8, y: cy, z: -1.0, arc: Math.PI, ry: Math.PI / 2, paint: false });
  // twin towers at the front
  for (const s of [-1, 1]) {
    b.box(0.36, 1.7, 0.36, { color: stone, mat: Mat.Window, x: s * 0.42, z: 0.85, y: cy, top: roof });
    b.cyl(0, 0.26, 1.05, { color: roof, seg: 4, ry: Math.PI / 4, flat: true, x: s * 0.42, z: 0.85, y: cy + 1.7, paint: false });
    beacon(b, s * 0.42, cy + 2.8, 0.85, 0.035, P.gold, Mat.Glow, true);
  }
  // central spire over the crossing
  b.cyl(0.2, 0.24, 0.5, { color: stone, seg: 8, y: cy + 1.05, z: -0.2, paint: false });
  b.cyl(0, 0.2, 1.7, { color: roof, seg: 8, y: cy + 1.55, z: -0.2, paint: false });
  beacon(b, 0, cy + 3.3, -0.2, 0.05, P.gold, Mat.Glow);
  // rose window (stained glass shifting colours) + portal
  vdisc(b, 0.26, 0.04, { color: 0x6a4aff, mat: Mat.Screen, y: cy + 0.95, z: 1.01, seg: 14, paint: false });
  b.torus(0.27, 0.025, { color: P.gold, mat: Mat.Metal, rx: Math.PI / 2, y: cy + 0.95, z: 1.03, seg: 14, tube: 3, paint: false, detail: true });
  b.box(0.24, 0.42, 0.03, { color: 0xffd890, mat: Mat.Light, y: cy, z: 1.01, paint: false });
  // flying buttresses
  for (const s of [-1, 1]) for (const z of [-0.6, 0.3]) strut(b, [s * 0.95, cy, z], [s * 0.42, cy + 0.8, z], 0.04, 0.03, { color: stone, seg: 4, paint: false, detail: true });
  lampRing(b, 10, 2.15, 0.22, P.lamp, 0.15);
  grove(b, rng, 6, 2.3, ['round', 'pine'], 1.1, 0.5);
  crowd(b, rng, 10, 1.1, 2.1);
}

/** A colossal ancient tree with glowing fruit and lanterns, roots gripping a garden ring. */
export function treeOfLife({ b, rng }: Ctx): void {
  plaza(b, 7, 0x8a7a5a, { field: 0x5f9e3f, fieldR: 0.93, round: true, kerb: P.stone });
  const bark = 0x6a4a3a;
  b.lathe([[1.0, G], [0.62, G + 0.25], [0.44, 0.9], [0.4, 1.8], [0.48, 2.6], [0.7, 3.05]], { color: bark, seg: b.lod ? 6 : 10, flat: true, paint: false });
  // roots
  ringOf(7, 0.5, (x, z, a) => taper(b, [[x, 0.55, z], [x * 2.0, 0.12, z * 2.0], [x * 3.1, G - 0.02, z * 3.1]], 0.16, 0.05, { color: bark, seg: 5, paint: false }), 0.3);
  // branches & canopy
  const greens = [0x4f9a4a, 0x5aa85a, 0x3f8a5a, 0x6ab86a, 0x4aa08a];
  const blobs: V3[] = [[0, 4.3, 0], [1.2, 3.75, 0.3], [-1.15, 3.85, 0.25], [0.3, 3.7, 1.2], [-0.35, 3.8, -1.15], [0.85, 4.35, -0.75], [-0.8, 4.4, 0.75], [0.9, 3.6, -1.0], [-1.0, 3.6, -0.5]];
  for (let i = 0; i < blobs.length; i++) {
    const [x, y, z] = blobs[i];
    if (i > 0) taper(b, [[x * 0.15, 2.8, z * 0.15], [x * 0.65, y - 0.35, z * 0.65]], 0.16, 0.08, { color: bark, seg: 5, paint: false });
    b.sphere(i === 0 ? 1.15 : rng.range(0.75, 0.95), { color: greens[i % greens.length], mat: Mat.Foliage, flat: true, wSeg: b.lod ? 5 : 8, hSeg: b.lod ? 3 : 5, x, y, z, sy: 0.75, paint: false });
  }
  // glowing fruit / lanterns hanging in the canopy
  const fruit = [0x5affe0, 0xffd84a, 0xff6ad8, 0x8affff];
  for (let i = 0; i < 26; i++) {
    const c = blobs[i % blobs.length];
    const a = rng.range(0, TAU);
    const r = i === 0 ? 1.1 : 0.85;
    b.sphere(0.06, { color: fruit[i % fruit.length], mat: Mat.Glow, x: c[0] + Math.sin(a) * r * 0.9, y: c[1] - rng.range(0.2, 0.55), z: c[2] + Math.cos(a) * r * 0.9, wSeg: 5, hSeg: 3, paint: false, detail: i >= 14 });
  }
  // dangling glow vines
  for (let i = 0; i < 10; i++) {
    const c = blobs[1 + (i % (blobs.length - 1))];
    const a = rng.range(0, TAU);
    b.cyl(0.008, 0.008, rng.range(0.6, 1.2), { color: 0x7affd0, mat: Mat.Glow, x: c[0] + Math.sin(a) * 0.5, z: c[2] + Math.cos(a) * 0.5, y: c[1] - 1.5, seg: 3, paint: false, detail: true });
  }
  b.torus(2.05, 0.04, { color: P.paving, y: G + 0.01, seg: 28, tube: 3, sy: 0.3, paint: false });
  lampRing(b, 10, 2.25, 0.2, 0xa0ffd8, 0.3);
  crowd(b, rng, 10, 1.6, 2.2);
}

/** A black monolith that greens the land around it: rune channels, atmosphere vents, orbiting rings. */
export function terraformObelisk({ b, rng }: Ctx): void {
  plaza(b, 7, 0x6a6258, { field: 0x5aa04a, fieldR: 0.94, round: true });
  b.cyl(0.95, 1.05, 0.2, { color: P.basalt, seg: 4, ry: Math.PI / 4, flat: true, y: G, paint: false });
  const y0 = G + 0.2, H = 6.2;
  b.cyl(0.32, 0.55, H, { color: P.obsidian, seg: 4, ry: Math.PI / 4, flat: true, y: y0, paint: false });
  b.cyl(0, 0.32, 0.7, { color: P.obsidian, seg: 4, ry: Math.PI / 4, flat: true, y: y0 + H, paint: false });
  beacon(b, 0, y0 + H + 0.72, 0, 0.08, 0x9aff5a, Mat.Glow);
  // rune channels on each face
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    b.push({ ry: a });
    for (let j = 0; j < 4; j++) {
      const t = (j + 0.5) / 4;
      const r = 0.55 - 0.23 * t;
      b.box(0.05, H * 0.17, 0.02, { color: 0x9aff5a, mat: Mat.Glow, y: y0 + t * H - H * 0.085, z: r * 0.708 + 0.004, rx: -0.035, paint: false, detail: j === 3 });
      b.box(0.24 * (1 - t * 0.4), 0.03, 0.02, { color: 0x5affa0, mat: Mat.Glow, y: y0 + t * H + 0.25, z: r * 0.708 + 0.002, paint: false, detail: true });
    }
    b.pop();
  }
  // atmosphere vents with misty plumes
  ringOf(4, 1.35, (x, z) => {
    b.cyl(0.14, 0.18, 0.22, { color: P.basalt, seg: 6, x, z, y: G, paint: false });
    b.cyl(0.32, 0.1, 1.1, { color: 0xd8fff0, mat: Mat.Holo, x, z, y: G + 0.22, seg: 6, capTop: false, paint: false, detail: true });
  });
  // orbiting rings
  b.torus(1.0, 0.035, { color: 0x9aff5a, mat: Mat.Glow, y: 3.6, rx: 0.2, seg: 24, tube: 3, paint: false });
  b.torus(0.78, 0.03, { color: 0x5affa0, mat: Mat.Glow, y: 4.9, rz: -0.25, seg: 20, tube: 3, paint: false });
  // the green tide: meadow ring of trees and flowers
  grove(b, rng, 12, 2.15, ['round', 'pine', 'blossom'], 1.15);
  for (let i = 0; i < 14; i++) {
    const a = rng.range(0, TAU), r = rng.range(1.5, 2.0);
    b.sphere(0.05, { color: rng.pick([0xff7ab8, 0xffd84a, 0xffffff, 0xb07aff]), x: Math.sin(a) * r, z: Math.cos(a) * r, y: G + 0.02, wSeg: 4, hSeg: 2, paint: false, detail: true });
  }
}

/** A giant brass orrery: a blazing sun, tilted orbit rings and their worlds, on a zodiac plaza. */
export function cosmicClock({ b, rng }: Ctx): void {
  plaza(b, 7, 0x2a2e3a, { field: 0x3a3f4e, fieldR: 0.92, round: true, kerb: P.brass });
  // zodiac ring on the ground
  ringOf(12, 1.95, (x, z, a) => b.box(0.32, 0.012, 0.08, { color: 0xffd890, mat: Mat.Glow, x, z, y: G + 0.012, ry: a + Math.PI / 2, paint: false }));
  b.torus(1.7, 0.02, { color: P.brass, mat: Mat.Metal, y: G + 0.02, seg: 32, tube: 3, sy: 0.5, paint: false });
  // pedestal
  b.cyl(0.6, 0.8, 0.3, { color: P.brass, mat: Mat.Metal, seg: 12, y: G, paint: false });
  b.cyl(0.14, 0.22, 2.4, { color: P.brass, mat: Mat.Metal, seg: 8, y: G + 0.3, paint: false });
  // the sun
  const sy = 3.05;
  b.sphere(0.5, { color: 0xffb040, mat: Mat.Lava, y: sy, wSeg: 14, hSeg: 10, paint: false });
  b.torus(0.62, 0.02, { color: 0xfff0a0, mat: Mat.Glow, y: sy, rx: 0.4, seg: 20, tube: 3, paint: false, detail: true });
  // orbits & planets
  const orbits: [number, number, number, number, number][] = [
    [0.95, 0.12, 0.1, 0.09, 0xb8a090],
    [1.3, -0.15, 0.2, 0.12, 0xe8c070],
    [1.65, 0.08, -0.12, 0.14, 0x4a8ae0],
    [1.88, -0.05, 0.18, 0.11, 0xd85a3a],
    [2.12, 0.18, -0.06, 0.18, 0xd8b890],
  ];
  orbits.forEach(([R, rx, rz, pr, col], i) => {
    b.torus(R, 0.022, { color: P.brass, mat: Mat.Metal, y: sy, rx, rz, seg: 28, tube: 3, paint: false });
    const a = 0.7 + i * 1.3;
    // planet position on the tilted ring
    const px = Math.sin(a) * R, pz = Math.cos(a) * R;
    const y1 = -Math.sin(rx) * pz + Math.sin(rz) * px;
    b.sphere(pr, { color: col, x: px, y: sy + y1, z: pz, wSeg: 10, hSeg: 6, paint: false });
    if (i === 4) b.torus(pr * 1.7, 0.02, { color: 0xe8d8b0, x: px, y: sy + y1, z: pz, rx: 0.5, seg: 16, tube: 2, paint: false });
    if (i === 2) b.sphere(0.04, { color: 0xe8e8e8, x: px + 0.22, y: sy + y1 + 0.05, z: pz, wSeg: 5, hSeg: 3, paint: false, detail: true });
  });
  // support arcs
  for (const s of [-1, 1]) {
    const pts: V3[] = [];
    for (let j = 0; j <= 8; j++) {
      const t = (j / 8) * Math.PI * 0.62 - 0.3;
      pts.push([s * Math.cos(t) * 2.2, sy + Math.sin(t) * 2.2, 0]);
    }
    pts.unshift([s * 2.15, G, 0]);
    b.tube(pts, 0.04, { color: P.brass, mat: Mat.Metal, seg: 4, paint: false });
  }
  lampRing(b, 8, 2.25, 0.2, P.lamp, 0.2);
  crowd(b, rng, 9, 1.0, 1.6);
}

/** A giant standing halo framing a glowing bridge deck: the gateway every parade must pass through. */
export function haloGate({ b, rng }: Ctx): void {
  plaza(b, 7, 0x3a3f4e, { field: 0x50586a, fieldR: 0.92 });
  // bridge deck through the halo with light rails
  b.box(1.1, 0.16, 4.7, { color: 0x4a4f5e, y: G, top: 0x5a6070, paint: false });
  for (const s of [-1, 1]) b.box(0.04, 0.04, 4.6, { color: P.cyan, mat: Mat.Glow, x: s * 0.52, y: G + 0.16, paint: false });
  for (let i = -4; i <= 4; i++) b.box(0.5, 0.008, 0.08, { color: 0x9fe8ff, mat: Mat.Glow, z: i * 0.5, y: G + 0.16, paint: false, detail: true });
  // the halo
  const R = 2.15, cy = 2.55;
  vring(b, R, 0.22, { color: 0xd8dee8, mat: Mat.Metal, y: cy, seg: b.lod ? 24 : 40, tube: 6, paint: false });
  vring(b, R - 0.24, 0.05, { color: P.cyan, mat: Mat.Glow, y: cy, seg: b.lod ? 24 : 40, tube: 4, paint: false });
  vring(b, R + 0.24, 0.03, { color: P.magenta, mat: Mat.Glow, y: cy, seg: b.lod ? 24 : 40, tube: 3, paint: false, detail: true });
  // chevron nodes around the halo
  ringOf(9, R, (x, y, a) => {
    b.box(0.3, 0.3, 0.52, { color: 0x4a4f5e, x, y: cy + y - 0.15, rz: -a, paint: false });
    b.box(0.12, 0.12, 0.54, { color: 0xffd84a, mat: Mat.Glow, x: x * 0.9, y: cy + y * 0.9 - 0.06, rz: -a, paint: false, detail: true });
  }, Math.PI / 9);
  // pylons cradling the halo
  for (const s of [-1, 1]) {
    strut(b, [s * 1.9, G, 0.5], [s * 1.8, cy - 0.8, 0], 0.22, 0.14, { color: 0x5a6070, seg: 4, paint: false, caps: true });
    strut(b, [s * 1.9, G, -0.5], [s * 1.8, cy - 0.8, 0], 0.22, 0.14, { color: 0x5a6070, seg: 4, paint: false, caps: true });
    b.box(0.7, 0.2, 1.4, { color: 0x2a2e3a, x: s * 1.95, y: G, paint: false });
  }
  ringOf(6, 2.1, (x, z) => (Math.abs(x) > 0.7 ? lamp(b, x, z, 0.24, P.lampCool) : undefined), Math.PI / 6);
  grove(b, rng, 4, 2.2, ['pine'], 1.1, Math.PI / 4);
  crowd(b, rng, 8, 0.2, 2.0);
}

export const LANDMARK_MESHES = {
  landerMemorial,
  foundersMonument,
  clockTower,
  lighthouse,
  pioneerStatue,
  grandArch,
  auroraFountain,
  rocketGarden,
  ascensionColumn,
  skyNeedle,
  neonPagoda,
  megadomeHall,
  spiralLibrary,
  grotto,
  pyramidOfLight,
  colossus,
  crystalSpire,
  holoMoon,
  magCoasterTower,
  skyGardens,
  floatingCathedral,
  treeOfLife,
  terraformObelisk,
  cosmicClock,
  haloGate,
};
