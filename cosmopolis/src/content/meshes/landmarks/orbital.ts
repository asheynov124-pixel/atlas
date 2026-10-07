/**
 * landmarks · mesh factories for orbital structures (OWNER: landmarks). Registered by content/items/orbital.ts.
 *
 * Orbitals are modelled at their own scale (satellites ≈ 1–3 units, stations ≈ 5–10) and centred on the origin
 * (centre of mass, not the ground): +Y points away from the planet ("zenith"), −Y faces the surface, +Z is the
 * direction of travel. Renderers place them at orbit × planet radius on their inclined orbit.
 *
 * Exception — the ORBITAL RING (`orbitalRing`): a single torus that encircles the planet. It is modelled centred
 * on the PLANET CENTRE (origin) in the XZ plane, at RING_RADIUS = 1.15 × REF_PLANET_RADIUS (66), so a renderer
 * should put it at the planet centre, tilt it by the orbit's inclination, scale it by planet.radius / 66 and spin
 * it slowly about its axis (orbit.speed) instead of translating it along the orbit.
 *
 * Night: running lights (Mat.Glow), lit habitat windows (Mat.WindowSmall / Mat.Glass), engine glows (Mat.Lava)
 * and screens make every station sparkle on the planet's night side. Solar arrays use Mat.Solar.
 */
import { Mat } from '../../kit';
import type { MeshContext } from '../../catalog';
import { P, TAU, beacon, ringOf, strut, type V3 } from './parts';

type Ctx = MeshContext;
type B = Ctx['b'];

/** Reference planet radius (f = 40) the orbital ring is modelled for. */
export const REF_PLANET_RADIUS = 66;
/** Orbital ring radius in world units at the reference planet radius. */
export const RING_RADIUS = 1.15 * REF_PLANET_RADIUS;

const FOIL = 0xe8b84a;
const HULL = 0xe9edf2;
const PANEL = 0x2a3a6a;

/** Solar wing along ±X: boom + n panels. */
function wing(b: B, side: 1 | -1, len: number, w: number, o: { y?: number; z?: number; x0?: number; n?: number; ry?: number } = {}): void {
  const y = o.y ?? 0, z = o.z ?? 0, x0 = o.x0 ?? 0.3, n = o.n ?? 3;
  b.push({ y, z, ry: o.ry ?? 0 });
  strut(b, [side * x0, 0, 0], [side * (x0 + len), 0, 0], 0.02, 0.02, { color: P.steel, seg: 4, paint: false });
  const pl = (len - 0.06 * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const cx = side * (x0 + 0.03 + pl / 2 + i * (pl + 0.06));
    b.box(pl, 0.02, w, { color: PANEL, mat: Mat.Solar, topMat: Mat.Solar, x: cx, y: -0.01, paint: false, bottom: true });
  }
  b.pop();
}

/** Blinking-style running light pair. */
function lights(b: B, pts: V3[], color: number = P.red): void {
  for (const [x, y, z] of pts) beacon(b, x, y, z, 0.035, color, Mat.Glow, true);
}

// ─────────────────────────────────────────────────────────── satellites

/** Gold-foil comsat with twin solar wings and a big dish aimed at the surface. */
export function commSat({ b }: Ctx): void {
  b.box(0.5, 0.56, 0.46, { color: FOIL, y: -0.28, bottom: true, paint: false });
  b.box(0.52, 0.06, 0.48, { color: HULL, y: 0.28, paint: false });
  wing(b, 1, 1.3, 0.42);
  wing(b, -1, 1.3, 0.42);
  // dish facing down
  b.dome(0.36, { color: HULL, y: -0.3, rx: Math.PI, h: 0.14, wSeg: 12, hSeg: 3, paint: false });
  b.cyl(0.015, 0.02, 0.3, { color: P.steel, seg: 4, y: -0.62, paint: false });
  b.sphere(0.04, { color: P.dark, y: -0.64, wSeg: 5, hSeg: 3, paint: false });
  // small dish + whip antenna
  b.dome(0.14, { color: HULL, y: 0.1, x: 0.18, z: 0.3, rx: Math.PI / 2, h: 0.05, wSeg: 8, hSeg: 2, paint: false, detail: true });
  b.cyl(0.008, 0.008, 0.5, { color: P.steel, seg: 3, y: 0.34, paint: false, detail: true });
  lights(b, [[1.62, 0, 0], [-1.62, 0, 0]], P.red);
  beacon(b, 0, 0.86, 0, 0.04, P.cyan, Mat.Glow);
}

/** Navigation satellite: hexagonal bus, cruciform arrays and a helix antenna farm. */
export function gpsSat({ b }: Ctx): void {
  b.cyl(0.3, 0.3, 0.6, { color: 0xc8ccd4, seg: 6, y: -0.3, capBottom: true, paint: false });
  b.cyl(0.31, 0.31, 0.08, { color: 0x3a6ad0, seg: 6, y: 0.0, paint: false });
  wing(b, 1, 0.9, 0.36, { n: 2 });
  wing(b, -1, 0.9, 0.36, { n: 2 });
  wing(b, 1, 0.7, 0.3, { n: 2, ry: Math.PI / 2 });
  wing(b, -1, 0.7, 0.3, { n: 2, ry: Math.PI / 2 });
  ringOf(6, 0.18, (x, z) => b.cyl(0.03, 0.03, 0.16, { color: 0xf2f4f6, seg: 4, x, z, y: -0.46, rx: Math.PI, paint: false, detail: true }));
  b.cyl(0.04, 0.04, 0.2, { color: 0xf2f4f6, seg: 4, y: -0.5, rx: Math.PI, paint: false });
  beacon(b, 0, 0.35, 0, 0.05, 0x3fe8ff, Mat.Glow);
  lights(b, [[1.22, 0, 0], [-1.22, 0, 0]], 0x9aff5a);
}

/** Weather satellite: white drum, sensor dome scanning the clouds, one long array and an instrument boom. */
export function weatherSat({ b }: Ctx): void {
  b.cyl(0.32, 0.32, 0.9, { color: HULL, seg: 12, rx: Math.PI / 2, z: -0.45, capBottom: true, paint: false });
  b.cyl(0.33, 0.33, 0.1, { color: 0x3a7ae0, seg: 12, rx: Math.PI / 2, z: 0.1, paint: false });
  b.sphere(0.24, { color: 0x6fb8e8, mat: Mat.Glass, y: -0.28, wSeg: 10, hSeg: 6, paint: false });
  wing(b, 1, 1.8, 0.5, { n: 4, y: 0.1 });
  strut(b, [0, 0.2, -0.3], [-0.9, 0.7, -0.3], 0.015, 0.015, { color: P.steel, seg: 4, paint: false });
  b.box(0.16, 0.16, 0.16, { color: FOIL, x: -0.95, y: 0.72, z: -0.3, paint: false });
  b.box(0.12, 0.02, 0.12, { color: 0x9fe8ff, mat: Mat.Glow, y: -0.04, z: 0.47, paint: false, detail: true });
  lights(b, [[2.1, 0.1, 0], [-0.95, 0.85, -0.3]]);
}

/** Orbital telescope: foil-wrapped tube, open aperture door, twin arrays. */
export function telescope({ b }: Ctx): void {
  b.cyl(0.42, 0.42, 2.4, { color: 0xd8dde4, seg: 14, rx: Math.PI / 2, z: -1.2, capBottom: true, paint: false });
  b.cyl(0.44, 0.44, 0.7, { color: FOIL, seg: 14, rx: Math.PI / 2, z: -1.2, paint: false });
  b.cyl(0.43, 0.43, 0.02, { color: 0x0a1020, seg: 14, rx: Math.PI / 2, z: 1.19, paint: false });
  // aperture door hinged open
  b.push({ y: 0.42, z: 1.2 });
  b.cyl(0.42, 0.42, 0.03, { color: HULL, seg: 14, rx: -0.5, z: 0, y: 0.36, paint: false });
  b.pop();
  wing(b, 1, 1.3, 0.55, { n: 2, z: -0.6 });
  wing(b, -1, 1.3, 0.55, { n: 2, z: -0.6 });
  b.dome(0.16, { color: HULL, y: -0.44, z: -0.8, rx: Math.PI, h: 0.06, wSeg: 8, hSeg: 2, paint: false, detail: true });
  lights(b, [[0, 0.46, -1.1]], P.cyan);
  lights(b, [[1.62, 0, -0.6], [-1.62, 0, -0.6]]);
}

/** Orbital billboard: a giant screen in a truss frame with station-keeping thrusters. */
export function billboard({ b }: Ctx): void {
  b.box(6.2, 3.6, 0.2, { color: 0x3a3f4e, y: -1.8, z: -0.1, bottom: true, paint: false });
  b.box(5.8, 3.2, 0.06, { color: P.dark, mat: Mat.Screen, y: -1.6, z: 0.08, paint: false });
  b.box(5.8, 3.2, 0.06, { color: P.dark, mat: Mat.Screen, y: -1.6, z: -0.28, paint: false, detail: true });
  for (const [x, y] of [[-3.1, 1.8], [3.1, 1.8], [-3.1, -1.8], [3.1, -1.8]] as [number, number][]) {
    b.box(0.32, 0.32, 0.5, { color: 0x6a707e, x, y: y - 0.16, z: -0.25, paint: false });
    b.cone(0.1, 0.18, { color: 0x4a4f5e, seg: 6, x: x * 1.08, y, z: -0.25, rz: Math.sign(x) * -Math.PI / 2, paint: false, detail: true });
  }
  b.box(6.3, 0.06, 0.06, { color: P.magenta, mat: Mat.Glow, y: 1.82, z: 0.02, paint: false });
  b.box(6.3, 0.06, 0.06, { color: P.cyan, mat: Mat.Glow, y: -1.88, z: 0.02, paint: false });
  wing(b, 1, 1.2, 0.6, { n: 2, x0: 3.25, z: -0.3 });
  wing(b, -1, 1.2, 0.6, { n: 2, x0: 3.25, z: -0.3 });
}

// ─────────────────────────────────────────────────────────── stations

/** Spoked wheel station with lit habitat windows, a central hub and docking spire. */
export function haloStation({ b }: Ctx): void {
  const seg = b.lod ? 24 : 40;
  b.torus(3.0, 0.38, { color: HULL, mat: Mat.WindowSmall, seg, tube: 8 });
  b.torus(3.0, 0.4, { color: 0x8a90a0, seg, tube: 8, sy: 0.25, paint: false, detail: true });
  ringOf(4, 1.55, (x, z, a) => strut(b, [x * 0.24, 0, z * 0.24], [x * 1.82, 0, z * 1.82], 0.12, 0.12, { color: 0xc8ccd4, seg: 6, paint: false }), Math.PI / 4);
  b.cyl(0.6, 0.6, 1.4, { color: HULL, seg: 12, y: -0.7, capBottom: true });
  b.cyl(0.62, 0.62, 0.12, { color: P.cyan, mat: Mat.Glow, seg: 12, y: -0.06, paint: false });
  b.dome(0.6, { color: 0x6fb8e8, mat: Mat.Glass, y: 0.7, h: 0.5, wSeg: 12, hSeg: 4, paint: false });
  // docking spire + arrays
  b.cyl(0.18, 0.25, 1.6, { color: 0xc8ccd4, seg: 8, y: -2.3, paint: false });
  b.torus(0.3, 0.05, { color: P.amber, mat: Mat.Glow, y: -2.3, seg: 12, tube: 3, paint: false });
  wing(b, 1, 1.6, 0.6, { n: 3, y: 1.3, x0: 0.15 });
  wing(b, -1, 1.6, 0.6, { n: 3, y: 1.3, x0: 0.15 });
  b.cyl(0.05, 0.05, 1.0, { color: P.steel, seg: 4, y: 0.95, paint: false });
  ringOf(8, 3.0, (x, z) => beacon(b, x * 1.13, 0, z * 1.13, 0.06, P.red, Mat.Glow, true), Math.PI / 8);
  beacon(b, 0, -3.15, 0, 0.08, P.cyan, Mat.Glow);
}

/** Zero-G laboratory: truss backbone, pressurised modules and eight solar wings. */
export function zeroGLab({ b }: Ctx): void {
  b.box(7.0, 0.3, 0.3, { color: 0xc8ccd4, y: 0.6, paint: false });
  for (const x of [-3.0, -2.2, 2.2, 3.0]) {
    for (const s of [-1, 1]) b.box(0.7, 0.02, 2.2, { color: PANEL, mat: Mat.Solar, topMat: Mat.Solar, x, y: 0.74, z: s * 1.3, paint: false, bottom: true });
    b.cyl(0.03, 0.03, 4.8, { color: P.steel, seg: 4, x, y: 0.75, z: -2.4, rx: Math.PI / 2, paint: false });
  }
  // modules (long axis = Z) clustered under the truss
  const mod = (x: number, z: number, len: number, r: number, col = HULL) => {
    b.cyl(r, r, len, { color: col, mat: Mat.WindowSmall, seg: 10, rx: Math.PI / 2, x, z: z - len / 2, y: 0, capBottom: true });
  };
  mod(0, 0, 3.0, 0.45);
  mod(0.95, 0.3, 1.6, 0.36);
  mod(-0.95, -0.3, 1.8, 0.38);
  b.sphere(0.5, { color: HULL, y: 0, wSeg: 10, hSeg: 6, paint: false });
  b.dome(0.32, { color: 0x6fb8e8, mat: Mat.Glass, y: -0.42, rx: Math.PI, h: 0.25, wSeg: 10, hSeg: 3, paint: false });
  // radiators
  for (const s of [-1, 1]) b.box(0.03, 1.2, 1.0, { color: 0xf4f6f8, x: s * 1.4, y: -0.5, z: -1.0, paint: false });
  b.cyl(0.03, 0.03, 0.8, { color: P.steel, seg: 3, y: 0.2, z: 1.4, paint: false, detail: true });
  lights(b, [[3.5, 0.6, 0], [-3.5, 0.6, 0], [0, 0, 1.55]]);
  beacon(b, 0, -0.75, 0, 0.06, P.cyan, Mat.Glow);
}

/** O'Neill habitat: a rotating cylinder of land and windows, end caps and hinged mirror vanes. */
export function oneillCylinder({ b }: Ctx): void {
  const R = 1.5, L = 8.0, strips = 6;
  b.push({ rx: Math.PI / 2, z: -L / 2 });
  for (let i = 0; i < strips; i++) {
    const glass = i % 2 === 0;
    b.cyl(R, R, L, { color: glass ? 0x8ac8f0 : 0x5a9a3f, mat: glass ? Mat.Glass : Mat.Foliage, seg: b.lod ? 4 : 6, arc: TAU / strips, ry: (i / strips) * TAU, capTop: false, paint: false });
  }
  // ribs
  for (let k = 0; k <= 4; k++) b.torus(R + 0.03, 0.06, { color: 0xc8ccd4, y: (k / 4) * L, seg: 24, tube: 4, paint: false, detail: k % 2 === 1 });
  b.pop();
  // end caps
  b.dome(R, { color: 0xc8ccd4, rx: Math.PI / 2, z: L / 2, h: 0.7, wSeg: 16, hSeg: 4, paint: false });
  b.dome(R, { color: 0xc8ccd4, rx: -Math.PI / 2, z: -L / 2, h: 0.7, wSeg: 16, hSeg: 4, paint: false });
  // docking spindle with a glow ring
  b.cyl(0.25, 0.25, 1.2, { color: 0xc8ccd4, seg: 8, rx: Math.PI / 2, z: L / 2 + 0.6, paint: false });
  b.torus(0.45, 0.06, { color: P.cyan, mat: Mat.Glow, rx: Math.PI / 2, z: L / 2 + 1.3, seg: 14, tube: 3, paint: false });
  // hinged mirror vanes over the glass strips
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + TAU / 12;
    b.push({ ry: 0, rz: a });
    b.push({ y: R + 0.1, z: -L / 2 + 0.05 });
    b.box(0.9, 0.04, L * 0.95, { color: 0xe8f0ff, rx: -0.35, y: 0, z: -L * 0.0, x: 0, paint: false });
    b.pop();
    b.pop();
  }
  // agricultural ring at the far end
  b.torus(2.2, 0.28, { color: 0x8ac8f0, mat: Mat.Glass, rx: Math.PI / 2, z: -L / 2 - 0.4, seg: 24, tube: 6, paint: false });
  ringOf(4, 1.1, (x, y) => strut(b, [x * 0.6, y * 0.6, -L / 2 - 0.4], [x * 1.75, y * 1.75, -L / 2 - 0.4], 0.06, 0.06, { color: 0xc8ccd4, seg: 4, paint: false }), Math.PI / 4);
  lights(b, [[0, R + 0.2, L / 2], [0, -R - 0.2, -L / 2]]);
}

/** Orbital shipyard: an open truss dock with a half-built starship, cranes and welding sparks. */
export function shipyard({ b, rng }: Ctx): void {
  const W = 3.0, H = 2.2, L = 6.0;
  const col = 0xe0b040;
  // dock frame: four longerons + rings
  for (const [x, y] of [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]] as [number, number][]) b.box(0.14, 0.14, L, { color: col, x, y: y - 0.07, z: 0, paint: false });
  for (let k = 0; k <= 3; k++) {
    const z = -L / 2 + (k / 3) * L;
    for (const s of [-1, 1]) {
      b.box(W, 0.1, 0.1, { color: col, y: s * H / 2 - 0.05, z, paint: false });
      b.box(0.1, H, 0.1, { color: col, x: s * W / 2, y: -H / 2, z, paint: false });
    }
  }
  // the ship: finished bow, skeletal stern
  b.box(1.2, 0.8, 2.4, { color: HULL, mat: Mat.WindowSmall, y: -0.4, z: 1.2 });
  b.cone(0.62, 1.1, { color: HULL, rx: Math.PI / 2, z: 2.4, seg: 8, flat: true, paint: false });
  for (let k = 0; k < 5; k++) b.torus(0.62, 0.035, { color: 0x8a90a0, rx: Math.PI / 2, z: -0.2 - k * 0.5, seg: 12, tube: 3, sx: 1.1, paint: false });
  b.box(0.12, 0.12, 2.6, { color: 0x8a90a0, y: -0.06, z: -1.3, paint: false });
  // cranes + welding sparks
  for (const s of [-1, 1]) {
    strut(b, [s * W / 2, H / 2, -0.5 + s * 0.8], [s * 0.4, 0.5, -0.8 + s * 0.6], 0.05, 0.04, { color: 0xd84a2a, seg: 4, paint: false });
    b.sphere(0.07, { color: 0xbfe8ff, mat: Mat.Glow, x: s * 0.4, y: 0.45, z: -0.8 + s * 0.6, wSeg: 6, hSeg: 3, paint: false });
  }
  for (let i = 0; i < 6; i++) b.sphere(0.035, { color: 0xffe6a0, mat: Mat.Glow, x: rng.range(-0.6, 0.6), y: rng.range(-0.5, 0.5), z: rng.range(-2.4, -0.2), wSeg: 4, hSeg: 2, paint: false, detail: true });
  // floodlights at the corners
  for (const [x, y] of [[-W / 2, H / 2], [W / 2, H / 2], [-W / 2, -H / 2], [W / 2, -H / 2]] as [number, number][]) b.box(0.18, 0.12, 0.12, { color: 0xfff0d0, mat: Mat.Light, x, y, z: L / 2, paint: false, detail: true });
  // control module + arrays
  b.cyl(0.4, 0.4, 0.9, { color: HULL, mat: Mat.WindowSmall, seg: 10, y: H / 2, z: -L / 2 + 0.4 });
  wing(b, 1, 1.4, 0.6, { y: H / 2 + 0.4, z: -L / 2 + 0.4, x0: 0.4, n: 2 });
  wing(b, -1, 1.4, 0.6, { y: H / 2 + 0.4, z: -L / 2 + 0.4, x0: 0.4, n: 2 });
  lights(b, [[-W / 2, H / 2, -L / 2], [W / 2, H / 2, -L / 2]], P.amber);
}

/** Armoured defence platform: hex hull, three turrets, a planet-facing lance and a shield emitter. */
export function defensePlatform({ b }: Ctx): void {
  const armour = 0x4a4f5e;
  b.cyl(1.6, 1.6, 0.5, { color: armour, seg: 6, flat: true, y: -0.25, capBottom: true, top: 0x5a6070, paint: false });
  b.cyl(1.62, 1.62, 0.06, { color: P.red, mat: Mat.Glow, seg: 6, flat: true, y: -0.03, capTop: false, paint: false });
  b.cyl(0.9, 1.3, 0.35, { color: 0x5a6070, seg: 6, flat: true, y: 0.25, paint: false });
  // turrets
  ringOf(3, 1.05, (x, z, a) => {
    b.cyl(0.26, 0.3, 0.2, { color: 0x6a707e, seg: 8, x, z, y: 0.25, paint: false });
    b.box(0.32, 0.18, 0.36, { color: 0x6a707e, x, z, y: 0.45, ry: a, paint: false });
    for (const s of [-1, 1]) {
      const bx = x + Math.cos(a) * s * 0.08, bz = z - Math.sin(a) * s * 0.08;
      strut(b, [bx, 0.54, bz], [bx + Math.sin(a) * 0.7, 0.62, bz + Math.cos(a) * 0.7], 0.035, 0.03, { color: 0x3a3f4e, mat: Mat.Metal, seg: 5, caps: true, paint: false });
    }
    b.box(0.08, 0.05, 0.03, { color: P.red, mat: Mat.Glow, x: x + Math.sin(a) * 0.19, z: z + Math.cos(a) * 0.19, y: 0.5, ry: a, paint: false, detail: true });
  }, Math.PI / 3);
  // command dome
  b.dome(0.5, { color: 0x9fd0f0, mat: Mat.Glass, y: 0.6, h: 0.4, wSeg: 12, hSeg: 4, paint: false });
  // planet-facing lance
  b.cyl(0.3, 0.45, 0.6, { color: 0x3a3f4e, seg: 8, y: -0.85, paint: false });
  b.cyl(0.12, 0.22, 1.0, { color: 0x6a707e, seg: 8, y: -1.85, paint: false });
  b.sphere(0.16, { color: 0xff3a3a, mat: Mat.Glow, y: -1.9, wSeg: 8, hSeg: 4, paint: false });
  // shield emitter fins
  ringOf(6, 1.65, (x, z, a) => b.box(0.06, 0.5, 0.5, { color: 0x6a707e, x: x * 1.03, z: z * 1.03, y: -0.3, ry: a, paint: false, detail: true }));
  b.torus(1.95, 0.04, { color: 0x7ae8ff, mat: Mat.Holo, y: 0, seg: 30, tube: 3, paint: false });
  lights(b, [[0, 1.12, 0]], P.red);
}

/** Space hotel: a glass-ringed panorama saucer, pod clusters, a neon sign and a docking spire. */
export function spaceHotel({ b }: Ctx): void {
  const seg = b.lod ? 18 : 28;
  b.lathe([[0.6, -0.6], [2.4, -0.25], [2.7, 0.0], [2.6, 0.12]], { color: 0xf4f2ee, seg, paint: false });
  b.cyl(2.6, 2.6, 0.38, { color: 0xffd8b0, mat: Mat.Glass, seg, y: 0.12, capTop: false, paint: false });
  b.lathe([[2.6, 0.5], [2.1, 0.75], [0.8, 0.95], [0.0, 1.0]], { color: 0xf4f2ee, seg, paint: false });
  b.torus(2.72, 0.05, { color: P.pink, mat: Mat.Glow, y: 0.02, seg, tube: 3, paint: false });
  b.torus(2.62, 0.035, { color: P.amber, mat: Mat.Glow, y: 0.52, seg, tube: 3, paint: false, detail: true });
  // central tower with pods
  b.cyl(0.35, 0.45, 2.6, { color: 0xe8ecf0, mat: Mat.WindowSmall, seg: 10, y: 0.9 });
  ringOf(6, 0.75, (x, z, _a, i) => b.sphere(0.32, { color: 0xbfe6ff, mat: Mat.Glass, x, z, y: 1.6 + (i % 2) * 0.7, wSeg: 10, hSeg: 6, paint: false }));
  b.dome(0.55, { color: 0xffd8b0, mat: Mat.Glass, y: 3.5, h: 0.5, wSeg: 12, hSeg: 4, paint: false });
  // neon sign on a pylon
  b.cyl(0.04, 0.05, 0.9, { color: 0xc8ccd4, seg: 4, y: 3.9, paint: false });
  b.push({ y: 4.75, ry: 0.4 });
  b.box(1.3, 0.42, 0.08, { color: P.dark, mat: Mat.Screen, y: 0, paint: false });
  b.box(1.38, 0.04, 0.1, { color: P.magenta, mat: Mat.Glow, y: 0.44, paint: false });
  b.box(1.38, 0.04, 0.1, { color: P.magenta, mat: Mat.Glow, y: -0.04, paint: false });
  b.pop();
  // rooftop lido on the saucer: pool ring, deck lights
  b.cyl(1.9, 1.9, 0.04, { color: 0xd8c8b0, seg, y: 0.86, paint: false });
  b.torus(1.45, 0.22, { color: P.water, mat: Mat.Water, y: 0.9, seg, tube: 3, sy: 0.15, paint: false });
  b.torus(1.92, 0.03, { color: P.pink, mat: Mat.Glow, y: 0.9, seg, tube: 3, paint: false, detail: true });
  // docking spire below
  b.cyl(0.25, 0.4, 1.4, { color: 0xc8ccd4, seg: 8, y: -2.0, paint: false });
  b.torus(0.42, 0.05, { color: P.cyan, mat: Mat.Glow, y: -2.0, seg: 12, tube: 3, paint: false });
  ringOf(12, 2.7, (x, z) => beacon(b, x, -0.2, z, 0.04, P.amber, Mat.Light, true));
}

/** Mining tug: a rugged little ship gripping an ore-veined asteroid with grapple arms. */
export function miningTug({ b, rng }: Ctx): void {
  // asteroid
  b.sphere(1.3, { color: 0x7a6e62, flat: true, wSeg: 9, hSeg: 6, sx: 1.2, sy: 0.85, sz: 1.0, z: -1.1, paint: false });
  for (let i = 0; i < 4; i++) b.sphere(rng.range(0.35, 0.6), { color: rng.pick([0x6a5f55, 0x8a7a6a]), flat: true, wSeg: 6, hSeg: 4, x: rng.range(-1, 1), y: rng.range(-0.6, 0.6), z: -1.1 + rng.range(-0.8, 0.8), paint: false, detail: i >= 2 });
  for (let i = 0; i < 7; i++) {
    const th = rng.range(0.3, 2.8), ph = rng.range(0, TAU);
    b.box(0.08, 0.32, 0.08, { color: rng.pick([0xffa040, 0x3fe8ff]), mat: Mat.Glow, x: Math.sin(th) * Math.sin(ph) * 1.4, y: Math.cos(th) * 1.0, z: -1.1 + Math.sin(th) * Math.cos(ph) * 1.15, rx: rng.range(0, 3), rz: rng.range(0, 3), paint: false, detail: i >= 4 });
  }
  // tug
  const z0 = 0.6;
  b.box(0.7, 0.5, 1.1, { color: 0xf0c040, y: -0.25, z: z0 + 0.55, paint: false });
  b.box(0.5, 0.26, 0.4, { color: 0x6fb8e8, mat: Mat.Glass, y: 0.12, z: z0 + 0.75, paint: false });
  b.box(0.9, 0.18, 0.4, { color: 0x3a3f4e, y: -0.1, z: z0 + 0.2, paint: false });
  for (const s of [-1, 1]) {
    b.cyl(0.18, 0.22, 0.5, { color: 0x4a4f5e, seg: 8, rx: Math.PI / 2, x: s * 0.42, z: z0 + 1.1, paint: false });
    b.cyl(0.15, 0.15, 0.02, { color: 0xff8a2a, mat: Mat.Lava, seg: 8, rx: Math.PI / 2, x: s * 0.42, z: z0 + 1.6, paint: false });
    // grapple arms
    b.tube([[s * 0.35, -0.1, z0 + 0.1], [s * 0.85, 0.1, z0 - 0.3], [s * 0.9, 0.2, -0.3]], 0.05, { color: 0x8a90a0, seg: 4, paint: false });
    b.box(0.2, 0.2, 0.12, { color: 0x5a606e, x: s * 0.9, y: 0.2, z: -0.35, paint: false });
  }
  b.box(0.06, 0.06, 0.06, { color: P.amber, mat: Mat.Glow, y: 0.02, z: z0 + 1.12, paint: false });
  lights(b, [[0.36, 0, z0 + 0.6], [-0.36, 0, z0 + 0.6]], P.amber);
}

/** Orbital farm: three greenhouse drums on a spine under purple grow-lights and wide solar sails. */
export function orbitalFarm({ b }: Ctx): void {
  b.cyl(0.14, 0.14, 6.0, { color: 0xc8ccd4, seg: 6, rx: Math.PI / 2, z: -3.0, paint: false });
  for (let k = 0; k < 3; k++) {
    const z = -2.0 + k * 2.0;
    b.push({ z: z - 0.75, rx: Math.PI / 2 });
    for (let i = 0; i < 6; i++) b.cyl(0.75, 0.75, 1.5, { color: i % 2 ? 0x5aa04a : 0x9fd8f0, mat: i % 2 ? Mat.Foliage : Mat.Glass, seg: 3, arc: TAU / 6, ry: (i / 6) * TAU, capTop: false, paint: false });
    b.pop();
    for (const s of [-1, 1]) b.cyl(0.77, 0.77, 0.08, { color: 0xc8ccd4, seg: 12, rx: Math.PI / 2, z: z + s * 0.75 - 0.04, paint: false });
    b.torus(0.8, 0.03, { color: 0xc07aff, mat: Mat.Light, rx: Math.PI / 2, z, seg: 16, tube: 3, paint: false, detail: true });
  }
  // solar sails
  for (const s of [-1, 1]) {
    strut(b, [0, 0, 0], [s * 1.6, 0, 0], 0.04, 0.04, { color: P.steel, seg: 4, paint: false });
    b.box(2.4, 0.02, 5.0, { color: PANEL, mat: Mat.Solar, topMat: Mat.Solar, x: s * 2.8, y: 0, z: 0, paint: false, bottom: true });
  }
  lights(b, [[4.0, 0, 2.5], [-4.0, 0, 2.5], [0, 0, 3.1]], 0x9aff5a);
}

/** Cargo depot: container racks around a spine, docking arms and a freighter alongside. */
export function cargoDepot({ b, rng }: Ctx): void {
  b.cyl(0.35, 0.35, 5.0, { color: 0xc8ccd4, seg: 8, rx: Math.PI / 2, z: -2.5, capBottom: true, paint: false });
  const cols = [0xd8423a, 0x3a7ae0, 0xe0b040, 0x4ac06a, 0xff8a2a, 0x8a4ab0, 0xe8ecf0];
  for (let k = 0; k < 4; k++) {
    const z = -1.8 + k * 1.2;
    ringOf(6, 0.8, (x, y, a) => {
      b.box(0.5, 0.42, 1.0, { color: rng.pick(cols), x, y: y - 0.21, z, rz: -a, paint: false, detail: k === 3 && (Math.round(a * 10) % 2 === 0) });
    }, 0);
    b.torus(1.15, 0.04, { color: 0x8a90a0, rx: Math.PI / 2, z, seg: 14, tube: 3, paint: false, detail: true });
  }
  // docking arms and a freighter
  strut(b, [0, 0, 1.8], [0, -1.6, 2.4], 0.08, 0.08, { color: 0x8a90a0, seg: 4, paint: false });
  b.box(0.8, 0.6, 2.2, { color: 0xe8ecf0, mat: Mat.WindowSmall, y: -2.0, z: 2.0 });
  b.cone(0.4, 0.6, { color: 0xe8ecf0, rx: Math.PI / 2, y: -1.7, z: 3.1, seg: 6, flat: true, paint: false });
  b.box(0.5, 0.3, 0.06, { color: 0xff8a2a, mat: Mat.Lava, y: -1.85, z: 0.88, paint: false });
  // control ring + beacons
  b.torus(0.6, 0.12, { color: 0xe8ecf0, mat: Mat.WindowSmall, rx: Math.PI / 2, z: 2.6, seg: 14, tube: 5 });
  lights(b, [[0, 0.45, -2.6], [0, 0.45, 2.6]], P.amber);
  beacon(b, 0, 0, 3.0, 0.08, P.cyan, Mat.Glow);
}

/** Solar mirror: a hexagonal array of chrome reflector petals on a truss, focusing sunlight down. */
export function solarMirror({ b }: Ctx): void {
  const petal = (x: number, z: number, col: number) => {
    b.cyl(1.0, 1.0, 0.05, { color: col, seg: 6, flat: true, x, z, y: 0.0, ry: Math.PI / 6, capBottom: true, paint: false });
    b.cyl(1.02, 1.02, 0.06, { color: 0xffc860, mat: Mat.Glow, seg: 6, flat: true, x, z, y: -0.03, ry: Math.PI / 6, capTop: false, paint: false, detail: true });
  };
  petal(0, 0, 0xf4f8ff);
  ringOf(6, 1.78, (x, z, _a, i) => petal(x, z, i % 2 ? 0xd8e6f6 : 0xc4d6ee), 0);
  // truss behind
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    b.box(4.4, 0.08, 0.08, { color: 0x8a90a0, y: 0.12, ry: a, paint: false });
  }
  // focal collector + downward beam
  ringOf(3, 1.2, (x, z) => strut(b, [x, -0.06, z], [0, -1.8, 0], 0.03, 0.03, { color: P.steel, seg: 4, paint: false }));
  b.sphere(0.22, { color: 0xfff0c0, mat: Mat.Glow, y: -1.85, wSeg: 8, hSeg: 4, paint: false });
  b.cyl(0.08, 0.35, 2.8, { color: 0xfff4c0, mat: Mat.Holo, y: -4.8, seg: 8, capTop: false, paint: false });
  b.box(0.5, 0.3, 0.5, { color: FOIL, y: 0.15, paint: false });
  lights(b, [[2.7, 0.1, 0], [-2.7, 0.1, 0]], P.amber);
}

/** Dyson swarm collector: a vast hexagonal flower of solar petals around a power-beam emitter. */
export function dysonCollector({ b }: Ctx): void {
  // hub
  b.cyl(0.9, 1.2, 1.0, { color: 0x4a4f5e, seg: 6, flat: true, y: -0.5, capBottom: true, paint: false });
  b.torus(1.2, 0.1, { color: 0xffb84a, mat: Mat.Glow, y: -0.1, seg: 18, tube: 4, paint: false });
  // six petal arrays (two tiers)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    b.push({ ry: a });
    strut(b, [0, 0, 1.0], [0, 0, 7.6], 0.07, 0.05, { color: 0x8a90a0, seg: 4, paint: false });
    b.box(2.2, 0.03, 3.0, { color: PANEL, mat: Mat.Solar, topMat: Mat.Solar, z: 3.0, rx: -0.12, paint: false, bottom: true });
    b.box(3.2, 0.03, 3.2, { color: PANEL, mat: Mat.Solar, topMat: Mat.Solar, z: 6.2, rx: -0.2, y: 0.4, paint: false, bottom: true });
    b.box(3.3, 0.05, 0.08, { color: 0xffb84a, mat: Mat.Glow, z: 7.85, y: 0.6, paint: false, detail: true });
    b.pop();
  }
  // collector crown + power-beam emitter facing the planet
  b.dome(0.8, { color: 0xffd890, mat: Mat.Glass, y: 0.5, h: 0.7, wSeg: 12, hSeg: 4, paint: false });
  b.cyl(0.5, 0.9, 1.0, { color: 0x6a707e, seg: 8, y: -1.5, paint: false });
  b.cone(0.45, 0.8, { color: 0xfff0c0, mat: Mat.Glow, y: -1.5, rx: Math.PI, seg: 8, paint: false });
  b.cyl(0.12, 0.4, 4.0, { color: 0xffe0a0, mat: Mat.Holo, y: -6.3, seg: 8, capTop: false, paint: false });
  ringOf(6, 7.9, (x, z) => beacon(b, x, 0.6, z, 0.12, P.amber, Mat.Glow, true), Math.PI / 6);
}

// ─────────────────────────────────────────────────────────── megastructure

/**
 * The Orbital Ring: one torus around the planet at RING_RADIUS (modelled at the planet centre, see header) with
 * a lit habitat band, glowing rails, eight hub stations and four space-elevator tethers down to the surface.
 */
export function orbitalRing({ b }: Ctx): void {
  const R = RING_RADIUS;
  const seg = b.lod ? 72 : 144;
  // the habitat band: a broad, flattened torus (≈ 4.6 wide × 1.2 thick) whose windows glitter all night
  b.torus(R, 2.3, { color: 0xdfe4ea, mat: Mat.WindowSmall, seg, tube: 8, sy: 0.26 });
  // glowing rails along the inner and outer edges (always lit: the ring reads from orbit day and night)
  b.torus(R - 2.35, 0.22, { color: P.cyan, mat: Mat.Glow, seg, tube: 3, paint: false });
  b.torus(R + 2.35, 0.22, { color: 0xffb84a, mat: Mat.Glow, seg, tube: 3, paint: false });
  // hub stations: towers rising from the band with glass domes, neon collars and beacons
  ringOf(10, R, (x, z, a, i) => {
    b.push({ x, z, ry: a });
    b.box(5.6, 3.4, 4.2, { color: HULL, mat: Mat.WindowSmall, y: -1.7 });
    b.dome(1.7, { color: 0x8ac8f0, mat: Mat.Glass, y: 1.7, h: 1.2, wSeg: 10, hSeg: 3, paint: false });
    b.box(5.8, 0.16, 4.4, { color: i % 2 ? P.cyan : P.magenta, mat: Mat.Glow, y: 1.62, paint: false });
    b.cyl(0.22, 0.3, 3.0, { color: 0xc8ccd4, seg: 6, y: 2.6, paint: false, detail: true });
    beacon(b, 0, 5.8, 0, 0.35, P.red, Mat.Glow);
    for (const s of [-1, 1]) b.box(0.1, 0.03, 7.0, { color: PANEL, mat: Mat.Solar, topMat: Mat.Solar, x: s * 4.2, y: 0.8, paint: false, bottom: true, detail: true });
    b.pop();
  }, Math.PI / 10);
  // space-elevator tethers dropping to the surface, with climber pods
  ringOf(4, R, (x, z) => {
    const k = (REF_PLANET_RADIUS + 1) / R;
    strut(b, [x, -0.4, z], [x * k, -0.4, z * k], 0.16, 0.16, { color: 0xbfe8ff, mat: Mat.Glow, seg: 4, paint: false });
    b.box(1.2, 1.2, 1.2, { color: HULL, x: x * 0.95, z: z * 0.95, y: -1.0, paint: false, detail: true });
  }, Math.PI / 20);
}

export const ORBITAL_MESHES = {
  commSat,
  gpsSat,
  weatherSat,
  telescope,
  billboard,
  haloStation,
  zeroGLab,
  oneillCylinder,
  shipyard,
  defensePlatform,
  spaceHotel,
  miningTug,
  orbitalFarm,
  cargoDepot,
  solarMirror,
  dysonCollector,
  orbitalRing,
};
