/**
 * landmarks · mesh factories for the 14 Wonders (OWNER: landmarks). Registered by content/items/landmarks.ts.
 *
 * Footprint 19 (usable radius ≈ 4.3, plaza to 4.75), ≤ 6 000 triangles at LOD0. Wonders are meant to be read
 * from orbit: a strong, unique silhouette (terraced cone, saucer, captive star, standing ring, needle, gyroscope),
 * and a night signature in Glow / Holo / Lava that blooms on the dark side of the planet.
 */
import { Mat, shade } from '../../kit';
import type { MeshContext } from '../../catalog';
import {
  G, P, TAU, arch, beacon, beam, crowd, disc, flagRing, grove, helix, lampRing, plaza, pond, pool,
  ringOf, shard, steps, strut, taper, tree, vdisc, vring, type V3,
} from './parts';

type Ctx = MeshContext;

/** Floating rock island: inverted cone with a grassy top. Returns the top height. */
function island(b: Ctx['b'], x: number, y: number, z: number, r: number, depth: number, rng: Ctx['rng'], o: { trees?: number; house?: boolean; falls?: boolean; detail?: boolean } = {}): number {
  b.cyl(r, r * 0.12, depth, { color: rng.pick([0x7a6e62, 0x8a7a68, 0x6e645a]), seg: 7, flat: true, x, z, y: y - depth, paint: false });
  b.cyl(r * 1.03, r, 0.12, { color: 0x5f9a3f, seg: 7, flat: true, x, z, y: y - 0.06, top: 0x6aad48, paint: false });
  shard(b, r * 0.08, depth * 0.3, 0x9fe8ff, { x, z, y: y - depth * 0.85, rx: Math.PI, mat: Mat.Glow, detail: true });
  const top = y + 0.06;
  const n = o.trees ?? 2;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), rr = rng.range(0.2, 0.65) * r;
    tree(b, x + Math.sin(a) * rr, z + Math.cos(a) * rr, rng.range(1.0, 1.5), rng.pick(['round', 'pine', 'blossom'] as const), rng, top, i > 0);
  }
  if (o.house) {
    const a = rng.range(0, TAU);
    const hx = x + Math.sin(a) * r * 0.25, hz = z + Math.cos(a) * r * 0.25;
    b.box(0.42, 0.3, 0.34, { color: 0xf2e6c8, mat: Mat.WindowSmall, x: hx, z: hz, y: top, ry: a });
    b.gable(0.42, 0.2, 0.34, { color: 0xc0583a, x: hx, z: hz, y: top + 0.3, ry: a, paint: false });
  }
  if (o.falls) {
    const a = rng.range(0, TAU);
    b.box(0.16, depth * 0.9 + 0.6, 0.03, { color: 0xbfe8ff, mat: Mat.Water, x: x + Math.sin(a) * r * 0.98, z: z + Math.cos(a) * r * 0.98, y: y - depth * 0.9 - 0.55, ry: a, paint: false, detail: o.detail });
  }
  return top;
}

// ─────────────────────────────────────────────────────────── T5

/** Eight terraced rings of homes and gardens rising to a glass crown — a city in one building. */
export function arcologyPrime({ b, rng, style }: Ctx): void {
  plaza(b, 19, P.paving, { field: 0x6aad48, fieldR: 0.94, round: true, kerb: P.stone });
  const walls = [0xf2f4f6, 0xe6ecf4, 0xf0ece4];
  const tiers = 8;
  let y = G;
  const seg = b.lod ? 12 : 20;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r0 = 3.9 - t * 3.0, r1 = r0 - 0.42, h = 1.25;
    b.cyl(r1, r0, h, { color: walls[i % walls.length], mat: Mat.Window, seg, y, top: 0xd8dde4 });
    // garden ledge on top of the tier
    const lr = r1 - 0.05;
    const nr = 3.9 - ((i + 1) / tiers) * 3.0;
    if (i < tiers - 1) {
      b.cyl(lr, lr, 0.06, { color: 0x5a9a3f, mat: Mat.Foliage, seg, y: y + h, capTop: false, paint: false });
      b.torus((lr + nr) / 2 + 0.04, 0.09, { color: 0x4f8f3a, mat: Mat.Foliage, y: y + h + 0.06, seg, tube: 3, sy: 0.7, paint: false, detail: true });
    }
    b.torus(r0 + 0.01, 0.03, { color: i % 2 ? P.cyan : 0xffd890, mat: Mat.Glow, y: y + 0.02, seg: b.lod ? 16 : 28, tube: 3, paint: false });
    y += h;
  }
  // terrace trees on the lower ledges
  for (let i = 0; i < 4; i++) {
    const t = (i + 1) / tiers;
    const rr = 3.9 - t * 3.0 + 0.2;
    ringOf(7 - i, rr, (x, z, _a, k) => tree(b, x, z, 1.3, k % 2 ? 'round' : 'blossom', rng, G + (i + 1) * 1.25 + 0.06, k % 2 === 1), i * 0.4);
  }
  // crown
  b.cyl(0.55, 0.9, 0.5, { color: 0xe8ecf0, seg: 16, y, paint: false });
  b.dome(0.75, { color: style.glass, mat: Mat.Glass, y: y + 0.5, h: 1.1, wSeg: 16, hSeg: 6, paint: false });
  b.cyl(0.04, 0.12, 4.2, { color: 0xe8ecf0, seg: 6, y: y + 1.5, paint: false });
  beacon(b, 0, y + 5.75, 0, 0.12, P.red, Mat.Glow);
  b.torus(0.5, 0.04, { color: P.cyan, mat: Mat.Glow, y: y + 2.8, seg: 16, tube: 3, paint: false });
  // entrance portals at ground level
  ringOf(6, 3.92, (x, z, a) => {
    b.box(0.7, 0.62, 0.12, { color: 0x2a2e3a, x, z, y: G, ry: a, paint: false });
    b.box(0.56, 0.5, 0.03, { color: 0xffd890, mat: Mat.Light, x: x * 1.016, z: z * 1.016, y: G, ry: a, paint: false });
  });
  lampRing(b, 18, 4.4, 0.24, P.lamp, 0.1);
  crowd(b, rng, 18, 4.0, 4.5);
}

/** A terraced ziggurat dripping with greenery and waterfalls, garden islands floating overhead. */
export function hangingGardens({ b, rng }: Ctx): void {
  plaza(b, 19, P.pavingWarm, { field: 0x6aad48, fieldR: 0.94, kerb: P.stone });
  const stone = 0xe6d2a8;
  let y = G;
  const ws = [6.0, 4.9, 3.8, 2.8, 1.9];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i], h = 0.95;
    b.box(w, h, w, { color: shade(stone, 1 - i * 0.03), mat: Mat.WindowSmall, y, top: 0x6aad48 });
    // hanging foliage curtains on all four faces
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      b.box(w * 0.92, h * 0.55, 0.06, { color: 0x4f8f3a, mat: Mat.Foliage, x: Math.sin(a) * (w / 2 + 0.02), z: Math.cos(a) * (w / 2 + 0.02), y: y + h * 0.45, ry: a, paint: false, detail: i > 2 });
      b.box(w, 0.08, 0.1, { color: 0x5a9a3f, mat: Mat.Foliage, x: Math.sin(a) * (w / 2), z: Math.cos(a) * (w / 2), y: y + h, ry: a, paint: false });
    }
    // trees along the ledge
    if (i < ws.length - 1) {
      const nw = ws[i + 1];
      const lr = (w + nw) / 4;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + Math.PI / 8;
        const s = 1 / Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a)));
        tree(b, Math.sin(a) * lr * s * 0.99, Math.cos(a) * lr * s * 0.99, 1.4, rng.pick(['round', 'blossom', 'palm'] as const), rng, y + h + 0.02, k % 2 === 1);
      }
    }
    // central staircase cascade (front) + waterfall
    b.box(0.5, 0.02, w / 2 - (ws[i + 1] ?? 0) / 2, { color: P.marble, y: y + h, z: w / 2 - (w / 2 - (ws[i + 1] ?? 0) / 2) / 2, paint: false, detail: true });
    b.box(0.55, h, 0.04, { color: 0xbfe8ff, mat: Mat.Water, y, z: w / 2 + 0.06, x: 1.0, paint: false });
    b.box(0.55, h, 0.04, { color: 0xbfe8ff, mat: Mat.Water, y, z: -w / 2 - 0.06, x: -1.0, paint: false });
    y += h;
  }
  pond(b, 1.6, 0.6, { x: 1.0, z: 3.45 });
  pond(b, 1.6, 0.6, { x: -1.0, z: -3.45 });
  // crystal pavilion on the summit
  b.dome(0.75, { color: 0xbfe6ff, mat: Mat.Glass, y, h: 0.9, wSeg: 14, hSeg: 5, paint: false });
  b.sphere(0.2, { color: 0xffe6a0, mat: Mat.Glow, y: y + 0.4, wSeg: 8, hSeg: 4, paint: false });
  b.cyl(0.02, 0.04, 0.8, { color: P.gold, seg: 4, y: y + 0.88, paint: false });
  // floating garden islands overhead
  island(b, 2.6, 7.2, 1.4, 0.75, 0.9, rng, { trees: 2, falls: true });
  island(b, -2.3, 8.1, -1.6, 0.6, 0.8, rng, { trees: 2, house: true });
  island(b, -1.9, 6.3, 2.4, 0.45, 0.6, rng, { trees: 1, detail: true });
  lampRing(b, 16, 4.4, 0.24, P.lamp, 0.2);
  crowd(b, rng, 16, 3.5, 4.4);
}

// ─────────────────────────────────────────────────────────── T6

/** Saucer-shaped senate chamber on a crystal stem under a holographic galaxy, flags of a hundred worlds. */
export function galacticSenate({ b, rng }: Ctx): void {
  plaza(b, 19, 0xd8d4cc, { field: 0xc8c4bc, fieldR: 0.92, round: true, kerb: P.gold });
  let y = steps(b, 7.0, 3, 0.14, 0.3, P.marble, { round: 28 });
  // radial avenues of light
  ringOf(6, 2.9, (x, z, a) => b.box(0.12, 0.012, 1.7, { color: 0x9fe8ff, mat: Mat.Glow, x, z, y, ry: a, paint: false }), Math.PI / 6);
  // stem
  b.cyl(0.9, 1.25, 2.3, { color: 0x9fd0f0, mat: Mat.Glass, seg: 16, y, paint: false });
  ringOf(8, 1.15, (x, z) => b.cyl(0.06, 0.06, 2.3, { color: P.gold, seg: 4, x, z, y, paint: false }));
  y += 2.3;
  // the saucer chamber
  const seg = b.lod ? 16 : 32;
  b.lathe([[1.0, y], [2.6, y + 0.65], [3.7, y + 1.3], [3.85, y + 1.45]], { color: 0xf2eee6, seg, paint: false });
  b.cyl(3.85, 3.85, 0.34, { color: 0xffd890, mat: Mat.Glass, seg, y: y + 1.45, capTop: false, paint: false });
  b.lathe([[3.86, y + 1.79], [3.6, y + 2.05], [2.6, y + 2.35], [1.7, y + 2.5]], { color: 0xf2eee6, seg, paint: false });
  b.torus(3.88, 0.05, { color: P.gold, mat: Mat.Glow, y: y + 1.44, seg, tube: 3, paint: false });
  b.torus(3.0, 0.035, { color: P.cyan, mat: Mat.Glow, y: y + 0.97, seg, tube: 3, paint: false, detail: true });
  // senate dome + holographic galaxy
  b.dome(1.75, { color: 0xbfe6ff, mat: Mat.Glass, y: y + 2.45, h: 1.1, wSeg: seg, hSeg: 6, paint: false });
  const gy = y + 4.3;
  b.cyl(1.9, 1.9, 0.02, { color: 0x8a6aff, mat: Mat.Holo, seg: 24, y: gy, paint: false });
  for (let k = 0; k < 2; k++) {
    const pts: V3[] = [];
    for (let j = 0; j <= 14; j++) {
      const t = j / 14;
      const a = k * Math.PI + t * TAU * 0.85;
      pts.push([Math.sin(a) * (0.2 + t * 1.6), gy + 0.04, Math.cos(a) * (0.2 + t * 1.6)]);
    }
    b.tube(pts, 0.07, { color: 0xffd8ff, mat: Mat.Holo, seg: 3, paint: false });
  }
  b.sphere(0.32, { color: 0xfff0c0, mat: Mat.Glow, y: gy + 0.04, sy: 0.5, wSeg: 10, hSeg: 5, paint: false });
  strut(b, [0, y + 3.5, 0], [0, gy, 0], 0.08, 0.02, { color: 0xbfe8ff, mat: Mat.Holo, seg: 5, paint: false });
  // honour guard of pillars and the flags of member worlds
  ringOf(10, 4.2, (x, z) => {
    b.cyl(0.12, 0.14, 1.1, { color: P.marble, seg: 6, x, z, y: G, paint: false });
    b.sphere(0.1, { color: 0x9fe8ff, mat: Mat.Glow, x, z, y: G + 1.2, wSeg: 6, hSeg: 3, paint: false });
  }, Math.PI / 10);
  flagRing(b, 14, 4.55, 0.9, [P.red, P.blue, P.yellow, P.teal, P.violet, P.orange, P.pink], 0.05);
  crowd(b, rng, 20, 3.6, 4.5);
}

/** A captive miniature star in a magnetic cage of rings and pylons, plasma piped down to transformers. */
export function stellarForge({ b, rng }: Ctx): void {
  plaza(b, 19, 0x3a3e48, { field: 0x4a4f5e, fieldR: 0.92, round: true, kerb: 0xff8a2a });
  // heat-sink fins radiating out
  ringOf(12, 3.3, (x, z, a) => {
    b.box(0.12, 0.9, 1.4, { color: 0x6a707e, x, z, y: G, ry: a, paint: false });
    b.box(0.13, 0.05, 1.2, { color: 0xff7a2a, mat: Mat.Glow, x, z, y: G + 0.9, ry: a, paint: false, detail: true });
  }, Math.PI / 12);
  // base reactor drum
  b.cyl(1.7, 1.9, 0.7, { color: 0x4a4f5e, seg: 16, y: G, paint: false });
  b.cyl(1.72, 1.72, 0.12, { color: 0xff8a2a, mat: Mat.Glow, seg: 16, y: G + 0.42, capTop: false, paint: false });
  // the star
  const sy = 6.4;
  b.sphere(1.45, { color: 0xffa040, mat: Mat.Lava, y: sy, wSeg: b.lod ? 12 : 22, hSeg: b.lod ? 8 : 14, paint: false });
  b.sphere(0.95, { color: 0xfff4c0, mat: Mat.Glow, y: sy + 0.5, x: 0.55, z: 0.55, wSeg: 10, hSeg: 6, paint: false, detail: true });
  // magnetic confinement gyroscope
  b.torus(2.3, 0.14, { color: 0x8a90a0, mat: Mat.Metal, y: sy, rx: 0.35, seg: 40, tube: 6, paint: false });
  b.torus(2.55, 0.12, { color: 0x8a90a0, mat: Mat.Metal, y: sy, rz: Math.PI / 2 - 0.2, rx: 0.4, seg: 40, tube: 6, paint: false });
  b.torus(2.05, 0.1, { color: 0x8a90a0, mat: Mat.Metal, y: sy, rx: Math.PI / 2, rz: 0.6, seg: 36, tube: 6, paint: false });
  b.torus(2.31, 0.04, { color: 0x9fe8ff, mat: Mat.Glow, y: sy, rx: 0.35, seg: 40, tube: 3, paint: false });
  // pylons holding the cage
  ringOf(4, 3.0, (x, z) => {
    taper(b, [[x, G, z], [x * 0.95, 3.0, z * 0.95], [x * 0.72, sy - 0.6, z * 0.72]], 0.32, 0.14, { color: 0x5a606e, seg: 5, paint: false });
    b.sphere(0.24, { color: 0x9fe8ff, mat: Mat.Glow, x: x * 0.7, y: sy - 0.5, z: z * 0.7, wSeg: 8, hSeg: 4, paint: false });
    strut(b, [x * 0.7, sy - 0.5, z * 0.7], [x * 0.35, sy - 0.25, z * 0.35], 0.04, 0.02, { color: 0xbfefff, mat: Mat.Glow, seg: 4, paint: false });
  }, Math.PI / 4);
  // plasma conduits down to transformers
  ringOf(3, 2.0, (x, z) => {
    b.tube([[x * 0.3, sy - 1.3, z * 0.3], [x * 0.6, 3.0, z * 0.6], [x, 1.2, z], [x * 1.1, G + 0.6, z * 1.1]], 0.1, { color: 0xff8a2a, mat: Mat.Glow, seg: 5, paint: false });
    b.cyl(0.4, 0.45, 0.6, { color: 0x4a4f5e, seg: 8, x: x * 1.1, z: z * 1.1, y: G, paint: false });
  });
  lampRing(b, 12, 4.4, 0.24, 0xffc890, 0.2);
}

/** A standing ring the height of a skyscraper, its event horizon shimmering blue above a launch apron. */
export function warpGate({ b, rng }: Ctx): void {
  plaza(b, 19, 0x2a2e3a, { field: 0x3a3f4e, fieldR: 0.94, kerb: 0x9fe8ff });
  // runway lights leading into the gate
  for (let i = 1; i <= 5; i++) for (const s of [-1, 1]) b.box(0.12, 0.03, 0.3, { color: i % 2 ? P.cyan : 0x9a7aff, mat: Mat.Glow, x: s * 1.2, z: 0.9 + i * 0.62, y: G, paint: false });
  b.box(2.0, 0.02, 4.0, { color: 0x4a4f5e, z: 2.0, y: G, paint: false });
  // launch platform
  b.box(5.2, 0.35, 1.8, { color: 0x4a4f5e, y: G, top: 0x5a6070, paint: false });
  const R = 3.45, cy = 4.3, seg = b.lod ? 32 : 56;
  // the ring itself: armoured torus + glowing inner rim + chevrons
  vring(b, R, 0.42, { color: 0x6a707e, y: cy, seg, tube: 8, paint: false });
  vring(b, R - 0.45, 0.09, { color: P.cyan, mat: Mat.Glow, y: cy, seg, tube: 4, paint: false });
  vring(b, R + 0.44, 0.05, { color: 0x9a7aff, mat: Mat.Glow, y: cy, seg, tube: 3, paint: false, detail: true });
  ringOf(12, R, (x, yy, a) => {
    b.box(0.62, 0.5, 1.02, { color: 0x3a3f4e, x, y: cy + yy - 0.25, rz: -a, paint: false });
    b.box(0.3, 0.2, 1.06, { color: 0xffb84a, mat: Mat.Glow, x: x * 0.93, y: cy + yy * 0.93 - 0.1, rz: -a, paint: false });
  });
  // event horizon
  vdisc(b, R - 0.5, 0.06, { color: 0x4a8aff, mat: Mat.Holo, y: cy, seg: b.lod ? 24 : 40, paint: false });
  vdisc(b, 1.1, 0.1, { color: 0xd8f0ff, mat: Mat.Glow, y: cy, seg: 20, paint: false });
  vring(b, 2.0, 0.04, { color: 0xbfe8ff, mat: Mat.Holo, y: cy, z: 0.08, seg: 32, tube: 3, paint: false, detail: true });
  // cradle: two massive angled supports
  for (const s of [-1, 1]) {
    strut(b, [s * 3.3, G, 0.8], [s * 2.6, cy - 2.2, 0], 0.4, 0.26, { color: 0x5a606e, seg: 5, paint: false, caps: true });
    strut(b, [s * 3.3, G, -0.8], [s * 2.6, cy - 2.2, 0], 0.4, 0.26, { color: 0x5a606e, seg: 5, paint: false, caps: true });
    b.box(1.2, 0.5, 2.2, { color: 0x3a3f4e, x: s * 3.35, y: G, paint: false });
    b.box(0.9, 0.04, 1.9, { color: 0xffb84a, mat: Mat.Glow, x: s * 3.35, y: G + 0.5, paint: false, detail: true });
  }
  // control towers with screens
  for (const [x, z] of [[-3.0, 2.6], [3.0, -2.6]] as [number, number][]) {
    b.cyl(0.35, 0.45, 2.2, { color: 0x4a4f5e, mat: Mat.Window, seg: 8, x, z, y: G });
    b.cyl(0.6, 0.4, 0.4, { color: 0x9fd0f0, mat: Mat.Glass, seg: 8, x, z, y: G + 2.2, paint: false });
    b.box(0.5, 0.3, 0.04, { color: P.dark, mat: Mat.Screen, x, z: z + Math.sign(z) * 0.62, y: G + 2.25, paint: false, detail: true });
    beacon(b, x, G + 2.75, z, 0.07, P.red, Mat.Glow);
  }
  // a ship lining up for the jump
  b.push({ x: 0, y: cy - 0.4, z: 3.1 });
  b.box(0.36, 0.16, 0.9, { color: P.hull, y: 0, paint: false, detail: true });
  b.cone(0.18, 0.4, { color: P.hull, rx: Math.PI / 2, z: 0.45, y: 0.08, seg: 6, paint: false, detail: true });
  b.box(0.9, 0.04, 0.3, { color: P.hullDark, y: 0.06, z: -0.1, paint: false, detail: true });
  b.box(0.2, 0.1, 0.06, { color: P.cyan, mat: Mat.Glow, y: 0.03, z: -0.46, paint: false, detail: true });
  b.pop();
  lampRing(b, 14, 4.45, 0.24, P.lampCool, 0.12);
}

/** A crystal-crowned emitter projecting a lattice dome of force over its capacitor banks. */
export function shieldGenerator({ b, rng }: Ctx): void {
  plaza(b, 19, 0x3a3f4e, { field: 0x4a5060, fieldR: 0.94, round: true, kerb: P.cyan });
  const R = 4.25, seg = b.lod ? 28 : 48;
  // lattice dome of force (latitude rings + meridians)
  for (const lat of [0.1, 0.38, 0.68, 0.98, 1.25]) b.torus(R * Math.cos(lat), 0.04, { color: 0x7ae8ff, mat: Mat.Holo, y: G + R * Math.sin(lat), seg, tube: 3, paint: false });
  for (let k = 0; k < 4; k++) {
    b.push({ ry: (k / 4) * Math.PI });
    arch(b, R, 0.035, { color: 0x7ae8ff, mat: Mat.Holo, y: G, seg: b.lod ? 16 : 28, tube: 3, paint: false });
    b.pop();
  }
  // capacitor banks
  ringOf(6, 2.6, (x, z) => {
    b.cyl(0.42, 0.48, 1.1, { color: 0x5a606e, seg: 10, x, z, y: G, paint: false });
    for (let j = 0; j < 3; j++) b.cyl(0.44, 0.44, 0.06, { color: P.cyan, mat: Mat.Glow, seg: 10, x, z, y: G + 0.25 + j * 0.3, capTop: false, paint: false });
    b.dome(0.4, { color: 0x8a90a0, x, z, y: G + 1.1, h: 0.25, wSeg: 10, hSeg: 3, paint: false });
    strut(b, [x * 0.85, G + 1.2, z * 0.85], [x * 0.2, 3.0, z * 0.2], 0.03, 0.03, { color: 0x9fe8ff, mat: Mat.Glow, seg: 4, paint: false, detail: true });
  });
  // the emitter tower
  b.cyl(0.95, 1.3, 0.6, { color: 0x4a4f5e, seg: 12, y: G, paint: false });
  b.cyl(0.42, 0.75, 6.4, { color: 0xd8dee8, seg: 10, y: G + 0.6, paint: false });
  for (let j = 0; j < 5; j++) b.torus(0.7 - j * 0.06, 0.07, { color: j % 2 ? 0x9fe8ff : P.cyan, mat: Mat.Glow, y: G + 1.4 + j * 1.1, seg: 18, tube: 4, paint: false });
  const ty = G + 7.0;
  // three prongs cradling the crystal
  ringOf(3, 0.4, (x, z) => taper(b, [[x, ty - 0.1, z], [x * 2.6, ty + 0.9, z * 2.6], [x * 1.6, ty + 2.1, z * 1.6]], 0.12, 0.05, { color: 0xd8dee8, seg: 5, paint: false }));
  shard(b, 0.42, 1.0, 0x9fefff, { y: ty + 0.6, tip: 0.9, mat: Mat.Glow });
  b.cone(0.42, 0.6, { color: 0x9fefff, mat: Mat.Glow, rx: Math.PI, y: ty + 0.6, seg: 6, flat: true, paint: false });
  beam(b, 4.0, 0.14, 0xbff4ff, { y: ty + 2.4 });
  lampRing(b, 16, 4.5, 0.22, P.lampCool, 0.2);
  crowd(b, rng, 10, 3.4, 4.3);
}

/** A needle tower with cloud-seeding arms and a captive storm crackling around its crown. */
export function weatherDominion({ b, rng }: Ctx): void {
  plaza(b, 19, 0x4a5060, { field: 0x5a6070, fieldR: 0.94, round: true });
  // control bunker ring with weather-map screens
  b.cyl(2.3, 2.6, 0.7, { color: 0xd8dee8, mat: Mat.Window, seg: 18, y: G, top: 0x8a90a0 });
  ringOf(6, 2.42, (x, z, a) => b.box(0.7, 0.36, 0.04, { color: P.dark, mat: Mat.Screen, x: x * 1.07, z: z * 1.07, y: G + 0.18, ry: a, paint: false, detail: true }), Math.PI / 6);
  // the needle
  b.cyl(0.35, 1.1, 15.5, { color: 0xe8ecf2, mat: Mat.Window, seg: 10, y: G + 0.7 });
  ringOf(3, 1, (x, z) => strut(b, [x * 1.12, G + 0.9, z * 1.12], [x * 0.4, G + 15.9, z * 0.4], 0.05, 0.035, { color: P.cyan, mat: Mat.Glow, seg: 4, paint: false }), Math.PI / 3);
  // cloud-seeding arms with pods
  for (const [y, n, r] of [[9.0, 3, 2.3], [12.0, 3, 1.7]] as [number, number, number][]) {
    ringOf(n, r, (x, z) => {
      strut(b, [0, y, 0], [x, y + 0.6, z], 0.12, 0.06, { color: 0xc8d0dc, seg: 5, paint: false });
      b.sphere(0.28, { color: 0xd8dee8, x, y: y + 0.6, z, wSeg: 10, hSeg: 6, paint: false });
      b.cone(0.18, 0.45, { color: 0x9fe8ff, mat: Mat.Holo, x, y: y + 0.3, z, rx: Math.PI, seg: 6, paint: false, detail: true });
    }, y > 10 ? Math.PI / 3 : 0);
  }
  b.torus(1.5, 0.08, { color: 0x8a90a0, y: 10.6, rx: 0.12, seg: 28, tube: 5, paint: false });
  b.torus(1.2, 0.06, { color: 0x8a90a0, y: 13.6, rz: 0.15, seg: 24, tube: 4, paint: false });
  // the captive storm
  const sy = 17.0;
  b.sphere(1.5, { color: 0x6a7aa0, mat: Mat.Holo, y: sy, wSeg: b.lod ? 12 : 18, hSeg: b.lod ? 8 : 12, paint: false });
  ringOf(7, 1.55, (x, z, _a, i) => b.sphere(0.7 + (i % 3) * 0.12, { color: 0xe8ecf2, flat: true, x, z, y: sy - 0.55 + (i % 2) * 0.3, sy: 0.55, wSeg: 7, hSeg: 4, paint: false }), 0.4);
  // lightning bolts
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.3;
    const pts: V3[] = [];
    let x = Math.sin(a) * 0.4, z = Math.cos(a) * 0.4;
    for (let j = 0; j < 5; j++) {
      pts.push([x, sy + 0.6 - j * 0.65, z]);
      x += Math.sin(a) * 0.32 + rng.range(-0.18, 0.18);
      z += Math.cos(a) * 0.32 + rng.range(-0.18, 0.18);
    }
    b.tube(pts, 0.035, { color: 0xeaffff, mat: Mat.Glow, seg: 3, paint: false, detail: k >= 3 });
  }
  b.cyl(0.03, 0.06, 2.2, { color: P.chrome, seg: 4, y: sy + 1.2, paint: false });
  beacon(b, 0, sy + 3.45, 0, 0.12, 0xeaffff, Mat.Glow);
  lampRing(b, 14, 4.4, 0.24, P.lampCool, 0.1);
  grove(b, rng, 10, 3.6, ['pine', 'round'], 1.3, 0.3);
}

/** Five islands of rock and garden hovering above the plaza, waterfalls falling into thin air. */
export function gravityDefier({ b, rng }: Ctx): void {
  plaza(b, 19, 0x7a8a6a, { field: 0x6aad48, fieldR: 0.94, round: true, kerb: P.stone });
  // anchor pylons and the lake the falls feed
  pool(b, 1.6, { seg: 24, h: 0.08, rim: 0x8a8478 });
  ringOf(3, 3.3, (x, z) => {
    taper(b, [[x, G, z], [x * 0.92, 1.8, z * 0.92]], 0.4, 0.2, { color: 0x6a645c, seg: 5, paint: false });
    b.sphere(0.28, { color: 0x9fe8ff, mat: Mat.Glow, x: x * 0.92, y: 2.0, z: z * 0.92, wSeg: 8, hSeg: 4, paint: false });
  }, Math.PI / 3);
  const isl: [number, number, number, number, number][] = [
    [0.2, 4.6, 0.1, 1.5, 1.6],
    [2.4, 6.8, 1.3, 0.95, 1.1],
    [-2.3, 7.6, 1.0, 0.85, 1.0],
    [-1.0, 9.6, -1.9, 1.0, 1.1],
    [1.9, 10.6, -1.6, 0.7, 0.9],
  ];
  const tops: V3[] = [];
  isl.forEach(([x, y, z, r, d], i) => {
    const top = island(b, x, y, z, r, d, rng, { trees: i === 0 ? 4 : 2, house: i === 1 || i === 3, falls: i !== 4, detail: i > 2 });
    tops.push([x, top, z]);
  });
  // temple on the largest island
  const [tx, ty, tz] = tops[0];
  b.cyl(0.55, 0.6, 0.1, { color: P.marble, seg: 10, x: tx, z: tz, y: ty, paint: false });
  ringOf(6, 0.45, (x, z) => b.cyl(0.05, 0.05, 0.6, { color: P.marble, seg: 6, x: tx + x, z: tz + z, y: ty + 0.1, paint: false }));
  b.dome(0.55, { color: P.gold, x: tx, z: tz, y: ty + 0.7, h: 0.4, wSeg: 10, hSeg: 4, paint: false });
  // glowing chains between islands and down to the pylons
  for (let i = 0; i < tops.length - 1; i++) strut(b, [tops[i][0], tops[i][1] - 0.3, tops[i][2]], [tops[i + 1][0], tops[i + 1][1] - 0.6, tops[i + 1][2]], 0.03, 0.03, { color: 0x9fe8ff, mat: Mat.Glow, seg: 4, paint: false });
  ringOf(3, 3.3, (x, z, _a, i) => strut(b, [x * 0.92, 2.1, z * 0.92], [tops[i + 1][0], tops[i + 1][1] - 0.9, tops[i + 1][2]], 0.025, 0.025, { color: 0x9fe8ff, mat: Mat.Glow, seg: 4, paint: false, detail: true }), Math.PI / 3);
  grove(b, rng, 12, 4.1, ['round', 'pine', 'blossom'], 1.4, 0.2);
  lampRing(b, 12, 2.2, 0.22, P.lamp, 0.25);
  crowd(b, rng, 14, 1.8, 3.8);
}

// ─────────────────────────────────────────────────────────── T7 – T8

/** A twisting spire threaded through floating rings and clock faces, an hourglass of liquid light at its waist. */
export function timeSpire({ b, rng }: Ctx): void {
  plaza(b, 19, 0xe8e2d6, { field: 0xd8d0c0, fieldR: 0.94, round: true, kerb: P.gold });
  // sundial plaza: glowing hour lines
  ringOf(12, 2.7, (x, z, a) => b.box(0.06, 0.012, 2.4, { color: 0xffd890, mat: Mat.Glow, x, z, y: G + 0.01, ry: a, paint: false }));
  let y = steps(b, 3.4, 3, 0.15, 0.25, P.marble, { round: 24 });
  // twisting lower spire
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const r = 1.1 - t * 0.55;
    b.cyl(r * 0.92, r, 0.6, { color: i % 2 ? 0xf2f4f6 : 0xe0e6ee, mat: Mat.Window, seg: 3, flat: true, y, ry: i * 0.32 });
    y += 0.6;
  }
  // the hourglass
  b.cone(0.8, 1.2, { color: 0xbfe6ff, mat: Mat.Glass, seg: 10, y: y + 1.2, rx: Math.PI, paint: false });
  b.cone(0.8, 1.2, { color: 0xbfe6ff, mat: Mat.Glass, seg: 10, y: y + 1.2, paint: false });
  b.cone(0.5, 0.65, { color: 0xffc040, mat: Mat.Lava, seg: 8, y, paint: false });
  b.cyl(0.03, 0.03, 1.2, { color: 0xffe080, mat: Mat.Glow, seg: 4, y: y + 0.6, paint: false });
  b.cyl(0.85, 0.85, 0.12, { color: P.gold, seg: 12, y: y + 2.4, paint: false });
  b.cyl(0.85, 0.85, 0.12, { color: P.gold, seg: 12, y: y - 0.12, paint: false });
  y += 2.52;
  // upper needle
  for (let i = 0; i < 8; i++) {
    const r = 0.5 - i * 0.055;
    b.cyl(r * 0.9, r, 0.75, { color: i % 2 ? 0xf2f4f6 : 0xe0e6ee, mat: Mat.Window, seg: 3, flat: true, y, ry: -i * 0.35 });
    y += 0.75;
  }
  b.cyl(0, 0.08, 1.4, { color: P.gold, seg: 6, y, paint: false });
  beacon(b, 0, y + 1.45, 0, 0.1, 0xfff0c0, Mat.Glow);
  // floating rings at different tilts
  const rings: [number, number, number, number][] = [[2.2, 4.3, 0.25, 0], [1.8, 8.0, -0.3, 0.2], [2.6, 10.2, 0.15, -0.35], [1.4, 13.5, 0.4, 0.1], [1.0, 16.2, -0.2, -0.3]];
  for (const [R, ry, rx, rz] of rings) {
    b.torus(R, 0.07, { color: P.gold, y: ry, rx, rz, seg: 32, tube: 4, paint: false });
    b.torus(R - 0.12, 0.025, { color: 0xffe8a0, mat: Mat.Glow, y: ry, rx, rz, seg: 32, tube: 3, paint: false, detail: true });
  }
  // holographic clock faces
  ringOf(4, 1.35, (x, z, a) => {
    b.push({ x, z, y: 11.6, ry: a });
    vdisc(b, 0.7, 0.03, { color: 0x9fd8ff, mat: Mat.Holo, seg: 18, paint: false });
    for (let h = 0; h < 12; h++) {
      const ha = (h / 12) * TAU;
      b.box(0.04, 0.12, 0.02, { color: 0xffffff, mat: Mat.Glow, x: Math.sin(ha) * 0.58, y: Math.cos(ha) * 0.58, z: 0.03, rz: -ha, paint: false, detail: true });
    }
    b.box(0.04, 0.45, 0.02, { color: 0xffe080, mat: Mat.Glow, y: 0.18, z: 0.04, rz: -0.6, paint: false });
    b.pop();
  }, Math.PI / 4);
  lampRing(b, 16, 4.45, 0.24, P.lamp, 0.15);
  crowd(b, rng, 16, 3.4, 4.4);
}

/** Nested shells of computronium around a blazing core — a planetary brain. */
export function matrioshkaNode({ b, rng }: Ctx): void {
  plaza(b, 19, 0x23252c, { field: 0x2c2f38, fieldR: 0.94, round: true, kerb: 0x9a7aff });
  // circuit traces on the plaza
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const r0 = 2.2, r1 = 4.2;
    b.box(0.05, 0.012, r1 - r0, { color: i % 2 ? P.cyan : 0x9a7aff, mat: Mat.Glow, x: Math.sin(a) * (r0 + r1) / 2, z: Math.cos(a) * (r0 + r1) / 2, y: G + 0.01, ry: a, paint: false });
    b.box(0.14, 0.03, 0.14, { color: 0xffffff, mat: Mat.Glow, x: Math.sin(a) * r1, z: Math.cos(a) * r1, y: G, paint: false, detail: true });
  }
  // radiator fins and pedestal
  ringOf(8, 2.6, (x, z, a) => b.box(0.08, 1.4, 1.0, { color: 0x4a4f5e, x, z, y: G, ry: a, paint: false }), Math.PI / 8);
  b.cyl(1.2, 1.6, 1.0, { color: 0x3a3f4e, seg: 12, y: G, paint: false });
  const cy = 5.2, seg = b.lod ? 28 : 44;
  // outer shell: metal meridians + equator, studded nodes
  for (let k = 0; k < 3; k++) vring(b, 3.4, 0.11, { color: 0x6a707e, y: cy, ry: (k / 3) * Math.PI, seg, tube: 5, paint: false });
  b.torus(3.4, 0.13, { color: 0x6a707e, y: cy, seg, tube: 5, paint: false });
  ringOf(8, 3.4, (x, z) => b.box(0.3, 0.3, 0.3, { color: 0x9a7aff, mat: Mat.Glow, x, z, y: cy - 0.15, paint: false }));
  // middle shell: holographic computronium lattice
  for (let k = 0; k < 4; k++) vring(b, 2.3, 0.04, { color: 0x7ae8ff, mat: Mat.Holo, y: cy, ry: (k / 4) * Math.PI + 0.4, seg: 36, tube: 3, paint: false });
  for (const lat of [-0.6, 0, 0.6]) b.torus(2.3 * Math.cos(lat), 0.04, { color: 0x7ae8ff, mat: Mat.Holo, y: cy + 2.3 * Math.sin(lat), seg: 36, tube: 3, paint: false });
  // inner core
  b.sphere(1.05, { color: 0xeaf6ff, mat: Mat.Glow, y: cy, wSeg: 16, hSeg: 10, paint: false });
  b.sphere(1.35, { color: 0x6a4aff, mat: Mat.Holo, y: cy, wSeg: 14, hSeg: 8, flat: true, paint: false, detail: true });
  // data conduits to the ground
  ringOf(4, 1.0, (x, z) => strut(b, [x * 1.1, G + 1.0, z * 1.1], [x * 0.9, cy - 2.2, z * 0.9], 0.08, 0.06, { color: P.cyan, mat: Mat.Glow, seg: 5, paint: false }), Math.PI / 4);
  b.cyl(0.25, 0.45, cy - 3.3, { color: 0x5a606e, seg: 8, y: G + 1.0, paint: false });
  lampRing(b, 16, 4.45, 0.22, 0xc8b8ff, 0.1);
  crowd(b, rng, 10, 3.0, 4.3);
}

/** An inverted ziggurat of reading halls balanced on a glass stem, orbited by floating books. */
export function infiniteLibrary({ b, rng }: Ctx): void {
  plaza(b, 19, 0xe6d6b8, { field: 0x6aad48, fieldR: 0.94, kerb: P.stone });
  // reading garden + pools
  pond(b, 1.2, 3.0, { x: -2.6 });
  pond(b, 1.2, 3.0, { x: 2.6 });
  // stem with a helical stair
  b.cyl(0.85, 1.1, 3.4, { color: 0x9fd0f0, mat: Mat.Glass, seg: 14, y: G, paint: false });
  b.tube(helix(1.2, G + 0.1, 3.3, 1.6, b.lod ? 12 : 24), 0.06, { color: P.marble, seg: 4, paint: false });
  ringOf(4, 1.5, (x, z) => strut(b, [x * 1.4, G, z * 1.4], [x * 0.8, 3.4, z * 0.8], 0.12, 0.08, { color: P.marble, seg: 5, paint: false }), Math.PI / 4);
  // inverted stepped levels
  let y = 3.4;
  const ws = [2.2, 3.0, 3.8, 4.5, 5.1, 5.6];
  const spines = [0xb8423a, 0x3a6ad0, 0x4a9a5a, 0xe0b040, 0x8a4ab0, 0xd8783a];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    b.box(w, 0.95, w, { color: 0xf2ead8, mat: Mat.Window, y, top: 0xd8ccb8, bottom: true });
    b.box(w + 0.08, 0.08, w + 0.08, { color: spines[i], y: y + 0.88, paint: false });
    b.box(w + 0.1, 0.03, w + 0.1, { color: 0xffd890, mat: Mat.Glow, y: y - 0.02, paint: false });
    y += 0.95;
  }
  // roof garden + reading dome + beacon of knowledge
  b.box(5.2, 0.04, 5.2, { color: 0x6aad48, mat: Mat.Foliage, y, paint: false });
  ringOf(8, 2.2, (x, z, _a, k) => tree(b, x, z, 1.3, 'round', rng, y + 0.04, k % 2 === 1), Math.PI / 8);
  b.dome(1.1, { color: 0xffe6b0, mat: Mat.Glass, y: y + 0.04, h: 1.2, wSeg: 16, hSeg: 5, paint: false });
  b.sphere(0.35, { color: 0xffe0a0, mat: Mat.Glow, y: y + 0.9, wSeg: 10, hSeg: 6, paint: false });
  beam(b, 3.0, 0.1, 0xffe8b0, { y: y + 1.24 });
  // floating books
  const cols = [0xd8423a, 0x3a7ae0, 0x4ac06a, 0xffcf3a, 0x9a5ae0, 0xff9a2a];
  ringOf(10, 3.6, (x, z, a, i) => {
    const yy = 5.0 + (i % 4) * 1.4;
    b.box(0.5, 0.7, 0.12, { color: cols[i % cols.length], x, z, y: yy, ry: a + 0.6, rz: 0.3 * Math.sin(i), paint: false, detail: i % 3 === 2 });
    b.box(0.46, 0.66, 0.13, { color: 0xfff6e0, mat: Mat.Light, x: x * 0.99, z: z * 0.99, y: yy + 0.02, ry: a + 0.6, rz: 0.3 * Math.sin(i), paint: false, detail: true });
  }, 0.2);
  lampRing(b, 16, 4.45, 0.22, P.lamp, 0.15);
  crowd(b, rng, 16, 1.6, 4.3);
}

/** A living brain-dome laced with glowing synapses, wired to antenna pylons. */
export function neuralNexus({ b, rng }: Ctx): void {
  plaza(b, 19, 0x23252c, { field: 0x2c2f38, fieldR: 0.94, round: true, kerb: 0xff6ad8 });
  b.cyl(2.9, 3.2, 0.5, { color: 0x3a3f4e, seg: 20, y: G, paint: false });
  b.torus(3.0, 0.05, { color: 0xff6ad8, mat: Mat.Glow, y: G + 0.5, seg: 32, tube: 3, paint: false });
  const by = G + 0.5;
  // brain lobes
  const lobes: [number, number, number, number][] = [[0.9, 1.5, 0, 1.75], [-0.9, 1.5, 0, 1.75], [0.7, 1.15, 1.2, 1.3], [-0.7, 1.15, 1.2, 1.3], [0.6, 1.2, -1.3, 1.35], [-0.6, 1.2, -1.3, 1.35], [0, 1.9, 0.3, 1.5]];
  for (const [x, y, z, r] of lobes) b.sphere(r, { color: 0xd88ab8, x, y: by + y, z, sy: 0.72, wSeg: b.lod ? 10 : 14, hSeg: b.lod ? 6 : 9, paint: false });
  // the central fissure
  b.box(0.08, 1.4, 3.6, { color: 0x8a3a6a, y: by + 1.6, paint: false });
  // synapses crawling over the surface
  for (let k = 0; k < 9; k++) {
    const a0 = rng.range(0, TAU);
    const pts: V3[] = [];
    for (let j = 0; j <= 6; j++) {
      const th = 0.25 + j * 0.2;
      const ph = a0 + j * rng.range(-0.35, 0.35);
      pts.push([Math.sin(th) * Math.sin(ph) * 2.35, by + 1.4 + Math.cos(th) * 1.75, Math.sin(th) * Math.cos(ph) * 2.35]);
    }
    b.tube(pts, 0.04, { color: k % 2 ? 0x7affff : 0xff9af0, mat: Mat.Glow, seg: 3, paint: false, detail: k >= 6 });
    b.sphere(0.09, { color: 0xffffff, mat: Mat.Glow, x: pts[3][0], y: pts[3][1], z: pts[3][2], wSeg: 5, hSeg: 3, paint: false, detail: true });
  }
  // antenna pylons linked by arcing nerve cables
  ringOf(6, 3.75, (x, z) => {
    b.cyl(0.12, 0.22, 3.4, { color: 0x4a4f5e, seg: 6, x, z, y: G, paint: false });
    b.sphere(0.24, { color: 0xff6ad8, mat: Mat.Holo, x, z, y: G + 3.6, wSeg: 8, hSeg: 5, paint: false });
    b.tube([[x, G + 3.4, z], [x * 0.75, G + 4.4, z * 0.75], [x * 0.4, by + 2.6, z * 0.4]], 0.035, { color: 0x7affff, mat: Mat.Glow, seg: 3, paint: false });
  }, Math.PI / 6);
  lampRing(b, 14, 4.45, 0.22, 0xffb8f0, 0.2);
  crowd(b, rng, 12, 3.3, 4.4);
}

/** Six naves radiating like a star around a glass crossing, a spire piercing the clouds. */
export function cosmicCathedral({ b, rng }: Ctx): void {
  plaza(b, 19, P.marble, { field: P.paving, fieldR: 0.94, round: true, kerb: P.gold });
  const stone = 0xece4d4, roof = 0x3a4a7a;
  // six naves
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    b.push({ ry: a });
    b.box(1.3, 2.0, 2.6, { color: stone, mat: Mat.Window, z: 2.1, y: G, top: roof });
    b.gable(1.3, 0.9, 2.6, { color: roof, z: 2.1, y: G + 2.0, ry: Math.PI / 2, paint: false });
    // end facade: rose window + portal + twin pinnacles
    vdisc(b, 0.38, 0.05, { color: 0x6a4aff, mat: Mat.Screen, z: 3.42, y: G + 1.45, seg: 14, paint: false });
    b.torus(0.4, 0.04, { color: P.gold, rx: Math.PI / 2, z: 3.45, y: G + 1.45, seg: 14, tube: 3, paint: false, detail: true });
    b.box(0.4, 0.75, 0.04, { color: 0xffd890, mat: Mat.Light, z: 3.42, y: G, paint: false });
    for (const s of [-1, 1]) {
      b.box(0.22, 2.4, 0.22, { color: stone, x: s * 0.7, z: 3.35, y: G, paint: false });
      b.cyl(0, 0.16, 0.9, { color: roof, seg: 4, ry: Math.PI / 4, flat: true, x: s * 0.7, z: 3.35, y: G + 2.4, paint: false });
      strut(b, [s * 1.25, G, 1.6], [s * 0.66, G + 1.8, 1.6], 0.07, 0.05, { color: stone, seg: 4, paint: false, detail: true });
    }
    b.pop();
  }
  // crossing: glass dome on an octagonal drum
  b.cyl(1.35, 1.45, 2.4, { color: stone, mat: Mat.Window, seg: 8, flat: true, y: G });
  b.dome(1.45, { color: 0xbfe0ff, mat: Mat.Glass, y: G + 2.4, h: 1.5, wSeg: 16, hSeg: 6, paint: false });
  // the spire
  b.cyl(0.45, 0.6, 2.0, { color: stone, mat: Mat.Window, seg: 8, flat: true, y: G + 3.7 });
  ringOf(8, 0.55, (x, z) => b.cone(0.08, 0.6, { color: P.gold, seg: 4, x, z, y: G + 5.7, paint: false, detail: true }));
  b.cyl(0, 0.45, 9.5, { color: roof, seg: 8, flat: true, y: G + 5.7, paint: false });
  ringOf(4, 0.3, (x, z) => b.box(0.03, 7.5, 0.03, { color: P.gold, mat: Mat.Glow, x: x * 0.85, z: z * 0.85, y: G + 5.9, rx: -z * 0.042, rz: x * 0.042, paint: false }), Math.PI / 8);
  b.sphere(0.14, { color: 0xfff0c0, mat: Mat.Glow, y: G + 15.25, wSeg: 8, hSeg: 4, paint: false });
  beam(b, 5.0, 0.1, 0xfff0c0, { y: G + 15.3 });
  // processional ring of lamps and trees between the naves
  ringOf(6, 3.4, (x, z, _a, i) => tree(b, x, z, 1.5, i % 2 ? 'pine' : 'round', rng, G, false), Math.PI / 6);
  lampRing(b, 18, 4.45, 0.24, P.lamp, 0.1);
  crowd(b, rng, 18, 3.6, 4.5);
}

/** Three nested gyroscopic rings around a captive galaxy-vortex, held by four titanic arms. */
export function intergalacticGate({ b, rng }: Ctx): void {
  plaza(b, 19, 0x1e1c28, { field: 0x2a2838, fieldR: 0.94, round: true, kerb: 0xb07aff });
  // radial launch lines
  ringOf(12, 3.0, (x, z, a, i) => b.box(0.08, 0.012, 2.4, { color: i % 2 ? 0xb07aff : 0xffd890, mat: Mat.Glow, x, z, y: G + 0.01, ry: a, paint: false }));
  disc(b, 2.0, 0.25, 0x3a3848, { seg: 20 });
  b.torus(2.0, 0.05, { color: 0xb07aff, mat: Mat.Glow, y: G + 0.25, seg: 28, tube: 3, paint: false });
  const cy = 5.6, seg = b.lod ? 32 : 56;
  // gyroscope rings
  vring(b, 4.0, 0.34, { color: 0x4a4658, y: cy, seg, tube: 7, paint: false });
  vring(b, 4.0, 0.06, { color: 0xffd890, mat: Mat.Glow, y: cy, z: 0.34, seg, tube: 3, paint: false, detail: true });
  b.push({ y: cy });
  b.torus(3.35, 0.26, { color: P.gold, rx: Math.PI / 2, ry: 1.05, rz: 0.35, seg, tube: 6, paint: false });
  b.torus(2.7, 0.2, { color: 0x8a7aa8, rx: 0.5, rz: -0.4, seg, tube: 5, paint: false });
  b.torus(2.72, 0.05, { color: 0xb07aff, mat: Mat.Glow, rx: 0.5, rz: -0.4, seg, tube: 3, paint: false });
  b.pop();
  // captive galaxy vortex
  b.sphere(1.8, { color: 0x6a3aff, mat: Mat.Holo, y: cy, wSeg: b.lod ? 14 : 22, hSeg: b.lod ? 10 : 14, paint: false });
  b.sphere(0.65, { color: 0xffffff, mat: Mat.Glow, y: cy, wSeg: 12, hSeg: 8, paint: false });
  for (let k = 0; k < 3; k++) {
    const pts: V3[] = [];
    for (let j = 0; j <= 16; j++) {
      const t = j / 16;
      const a = (k / 3) * TAU + t * TAU * 0.9;
      const r = 0.6 + t * 1.6;
      pts.push([Math.sin(a) * r, cy + Math.sin(a * 2) * 0.1, Math.cos(a) * r]);
    }
    b.tube(pts, 0.07 * (1 - k * 0.15), { color: k === 1 ? 0xffd890 : 0xe0c0ff, mat: Mat.Glow, seg: 3, paint: false });
  }
  // four titanic anchor arms
  ringOf(4, 4.0, (x, z) => {
    taper(b, [[x, G, z], [x * 1.0, 2.6, z * 1.0], [x * 0.78, cy - 2.6, z * 0.78]], 0.42, 0.22, { color: 0x3a3848, seg: 5, paint: false });
    b.box(1.0, 0.45, 1.0, { color: 0x2a2838, x, z, y: G, paint: false });
    b.sphere(0.22, { color: 0xb07aff, mat: Mat.Glow, x: x * 0.78, y: cy - 2.5, z: z * 0.78, wSeg: 8, hSeg: 4, paint: false });
    strut(b, [x * 0.78, cy - 2.5, z * 0.78], [x * 0.5, cy - 1.1, z * 0.5], 0.04, 0.02, { color: 0xe0c0ff, mat: Mat.Glow, seg: 4, paint: false, detail: true });
  }, Math.PI / 4);
  lampRing(b, 16, 4.45, 0.22, 0xd8c0ff, 0.15);
  crowd(b, rng, 10, 2.5, 4.3);
}

export const WONDER_MESHES = {
  arcologyPrime,
  hangingGardens,
  galacticSenate,
  stellarForge,
  warpGate,
  shieldGenerator,
  weatherDominion,
  gravityDefier,
  timeSpire,
  matrioshkaNode,
  infiniteLibrary,
  neuralNexus,
  cosmicCathedral,
  intergalacticGate,
};
