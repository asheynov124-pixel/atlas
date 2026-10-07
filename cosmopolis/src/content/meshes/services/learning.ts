/**
 * services · education, culture & research meshes (OWNER: services).
 *
 * Schools are warm brick with yellow buses and playgrounds; culture is sandstone, columns and domes; research
 * reads white, glass and cyan glow (labs light up at night). Styleable schools take walls from the district style.
 */
import type { MeshContext } from '../../catalog';
import {
  C, G, FL, TAU, FUN, Mat, mix, shade, civic, lot, block, door, canopy, sign, schoolBus, car, helipad, antenna, dish, acUnit, flag,
  lamp, lampRing, tree, grove, bush, bench, person, crowd, roofGarden, neonStrip, path, ringPath, pool, rect, steps, columns, solar,
  flowers, hedge, roundRect, lShape, ellipse, disc, ngon, fence, plate, softHex,
} from './parts';

const BRICK = 0xc0583a;
const SANDSTONE = 0xeadcc0;

/** Clock face (white disc + two hands) facing +Z at (x, y, z). */
function clockFace(b: MeshContext['b'], x: number, y: number, z: number, r: number, ry = 0): void {
  b.group({ x, y, z, ry }, () => {
    b.cyl(r, r, 0.012, { color: 0xf8f6f0, seg: 10, rx: Math.PI / 2, paint: false });
    b.box(r * 0.12, r * 0.75, 0.006, { color: 0x222222, z: 0.012, paint: false });
    b.box(r * 0.55, r * 0.12, 0.006, { color: 0x222222, x: r * 0.27, z: 0.012, y: -r * 0.06, paint: false });
    b.box(r * 0.3, r * 0.3, 0.01, { color: 0xffe2a8, mat: Mat.Light, z: 0.004, y: -r * 0.15, detail: true, paint: false });
  });
}

/** Basketball hoop. */
function hoop(b: MeshContext['b'], x: number, z: number, ry: number): void {
  b.group({ x, y: G, z, ry }, () => {
    b.box(0.02, 0.24, 0.02, { color: 0x6a6e78, detail: true, paint: false });
    b.box(0.1, 0.07, 0.01, { color: 0xffffff, y: 0.22, z: 0.02, detail: true, paint: false });
    b.box(0.05, 0.006, 0.04, { color: 0xff6a1a, y: 0.22, z: 0.045, detail: true, paint: false });
  });
}

// ─────────────────────────────────────────────────────────── schools

/** Daycare nursery: stacked toy-block classrooms, sun sign, tiny slide and a sandpit full of very small people. */
export function kindergarten(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.paving);
  b.plane(0.9, 0.42, { color: 0x7cc055, x: 0.05, y: G + 0.003, z: 0.36, paint: false });
  b.box(0.38, 0.24, 0.36, { color: 0xe0503a, mat: Mat.WindowSmall, top: 0xf4f0e8, x: -0.26, y: G, z: -0.2 });
  b.box(0.32, 0.22, 0.32, { color: 0xffc83a, mat: Mat.WindowSmall, top: 0xf4f0e8, x: 0.14, y: G, z: -0.3 });
  b.box(0.26, 0.18, 0.26, { color: 0x3a8ae0, mat: Mat.WindowSmall, top: 0xf4f0e8, x: -0.2, y: G + 0.24, z: -0.24 });
  b.gable(0.32, 0.12, 0.32, { color: 0x4ac06a, x: 0.14, y: G + 0.22, z: -0.3 });
  b.cyl(0.07, 0.07, 0.015, { color: 0xffd23a, mat: Mat.Glow, seg: 10, x: -0.2, y: G + 0.33, z: -0.105, rx: Math.PI / 2, paint: false });
  door(b, -0.26, -0.018, 0.1, 0.13, 0x3a8ae0);
  // yard
  fence(b, [[-0.55, 0.12], [-0.55, 0.58], [0.5, 0.58], [0.5, 0.12]], 0.06, 0xffffff, false, G, 0.01, Mat.Plain);
  b.cyl(0.13, 0.14, 0.02, { color: C.sand, seg: 8, x: -0.28, y: G, z: 0.35, paint: false });
  b.box(0.08, 0.14, 0.08, { color: 0xff7ab8, x: 0.2, y: G, z: 0.28, paint: false });
  b.wedge(0.07, 0.14, 0.2, { color: 0xffcf3a, x: 0.2, y: G, z: 0.42, paint: false });
  for (let i = 0; i < 3; i++) b.sphere(0.025, { color: FUN[i * 2], x: rng.range(-0.1, 0.4), y: G + 0.025, z: rng.range(0.2, 0.5), wSeg: 5, hSeg: 3, detail: true, paint: false });
  for (let i = 0; i < 6; i++) person(b, rng.range(-0.45, 0.4), rng.range(0.2, 0.52), rng.pick(FUN), G, 0.045);
  tree(b, 0.48, -0.15, 0.85, 'round', rng);
}

/** Elementary school: two-storey brick L with a clock gable, bell cupola, yellow bus, hopscotch yard. */
export function elementarySchool(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const cv = civic(ctx);
  const brick = mix(cv.wall, BRICK, 0.5);
  lot(b, 1, C.paving);
  const H = 2 * FL + 0.02;
  b.extrude(lShape(0.9, 0.6, 0.36, 0.28, -0.05, -0.22), H, { color: brick, mat: Mat.Window, top: cv.roof, y: G });
  b.extrude(lShape(0.92, 0.62, 0.36, 0.28, -0.05, -0.22), 0.03, { color: 0xf2ece0, y: G + FL - 0.01, paint: false });
  // clock gable portico
  b.box(0.24, 0.5, 0.1, { color: shade(brick, 1.08), x: -0.25, y: G, z: 0.13 });
  b.gable(0.24, 0.12, 0.1, { color: cv.roof, x: -0.25, y: G + 0.5, z: 0.13 });
  clockFace(b, -0.25, G + 0.4, 0.182, 0.06);
  door(b, -0.25, 0.182, 0.1, 0.14, 0x3a2a22);
  // bell cupola
  b.box(0.1, 0.1, 0.1, { color: 0xf2ece0, x: 0.1, y: G + H, z: -0.3 });
  b.pyramid(0.14, 0.1, 0.14, { color: cv.roof, x: 0.1, y: G + H + 0.1, z: -0.3 });
  // yard: hopscotch + hoop
  b.plane(0.4, 0.4, { color: 0x8a8e96, x: 0.38, y: G + 0.003, z: 0.3, paint: false });
  for (let i = 0; i < 4; i++) b.plane(0.06, 0.06, { color: FUN[i], x: 0.3 + (i % 2) * 0.07, y: G + 0.006, z: 0.18 + i * 0.07, paint: false });
  hoop(b, 0.52, 0.45, -Math.PI / 2);
  schoolBus(b, -0.16, 0.47, Math.PI / 2);
  flag(b, 0.0, 0.2, 0.4, cv.accent);
  tree(b, 0.5, -0.35, 0.9, 'round', rng);
  for (let i = 0; i < 4; i++) person(b, rng.range(0.25, 0.5), rng.range(0.15, 0.45), rng.pick(FUN), G, 0.05);
  if (cv.green) roofGarden(b, -0.25, G + H, -0.32, 0.3, 0.2, rng);
  else solar(b, -0.25, G + H + 0.02, -0.32, 0.3, 0.2);
  if (cv.neon) neonStrip(b, -0.05, G + H - 0.04, 0.083, 0.9, cv.accent);
  if (cv.curvy) b.dome(0.1, { color: cv.glass, mat: Mat.Glass, x: 0.28, y: G + H, z: -0.12, wSeg: 8, hSeg: 3 });
}

/** High school: three-storey main hall, barrel-roofed gym, running track with bleachers, buses. */
export function highSchool(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const cv = civic(ctx);
  const brick = mix(cv.wall, BRICK, 0.5);
  lot(b, 7, C.paving);
  // track + field
  b.extrude(ellipse(1.95, 1.05, 18, 0.6, 0.95), 0.008, { color: 0xc0583a, y: G, paint: false });
  b.extrude(ellipse(1.55, 0.68, 16, 0.6, 0.95), 0.006, { color: 0x5aaa44, y: G + 0.008, paint: false });
  b.plane(0.012, 0.66, { color: 0xffffff, x: 0.6, y: G + 0.016, z: 0.95, paint: false });
  for (const x of [0.0, 1.2]) b.box(0.02, 0.06, 0.18, { color: 0xffffff, x, y: G + 0.014, z: 0.95, detail: true, paint: false });
  for (let r = 0; r < 3; r++) b.box(0.9, 0.04 + r * 0.04, 0.07, { color: r % 2 ? 0x3a6ae0 : 0xd8d8dc, x: 0.6, y: G, z: 0.34 - r * 0.07 });
  // main hall
  const top = block(b, 1.9, 3 * FL + 0.02, 0.52, { color: brick, roof: cv.roof, x: -0.2, z: -0.42 });
  b.box(1.91, 0.03, 0.53, { color: 0xf2ece0, x: -0.2, y: G + FL - 0.01, z: -0.42, paint: false });
  b.box(0.36, 0.72, 0.14, { color: shade(brick, 1.08), x: -0.55, y: G, z: -0.1 });
  b.gable(0.36, 0.14, 0.14, { color: cv.roof, x: -0.55, y: G + 0.72, z: -0.1 });
  clockFace(b, -0.55, G + 0.56, -0.025, 0.09);
  door(b, -0.55, -0.028, 0.14, 0.16, 0x3a2a22);
  // gym
  b.box(0.8, 0.26, 0.62, { color: shade(brick, 0.95), mat: Mat.WindowSmall, x: 1.15, y: G, z: -0.75 });
  b.cyl(0.31, 0.31, 0.8, { color: 0x8a96a6, mat: Mat.Plain, arc: Math.PI, capBottom: true, seg: 10, x: 1.55, y: G + 0.26, z: -0.75, rz: Math.PI / 2 });
  // parking + buses
  b.plane(1.0, 0.62, { color: C.asphalt, x: -1.1, y: G + 0.003, z: 0.5, paint: false });
  schoolBus(b, -1.35, 0.5, 0);
  schoolBus(b, -1.1, 0.5, 0);
  car(b, -0.8, 0.45, 0, 0x3a6ad0);
  flag(b, -0.2, 0.05, 0.5, cv.accent);
  hoop(b, -0.1, 0.55, Math.PI);
  for (let i = 0; i < 4; i++) tree(b, -1.75 + i * 0.3, -0.05 + (i % 2) * 0.1, 0.95, 'round', rng);
  crowd(b, rng, 0.6, 0.95, 0.5, 8);
  if (cv.green) roofGarden(b, -0.2, top, -0.42, 0.8, 0.36, rng);
  else for (let i = 0; i < 3; i++) acUnit(b, -0.8 + i * 0.5, top, -0.5);
  if (cv.neon) neonStrip(b, -0.2, top - 0.05, -0.155, 1.9, cv.accent);
  if (cv.curvy) b.dome(0.16, { color: cv.glass, mat: Mat.Glass, x: 0.3, y: top, z: -0.42, wSeg: 8, hSeg: 3 });
}

/** University campus: grassy quad, domed library, clock tower, gabled halls, science wing and dorm towers. */
export function university(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const stone = SANDSTONE, roof = 0x6a5a5a, brick = 0xb8664a;
  lot(b, 19, 0xd6d0c2);
  // quad
  b.plane(2.5, 2.7, { color: C.lawn, x: 0, y: G + 0.003, z: 0.15, paint: false });
  path(b, 0, 2.6, 0, -1.2, 0.2, C.path);
  path(b, -1.25, 0.15, 1.25, 0.15, 0.16, C.path);
  ringPath(b, 0.42, 0.1, C.path, 12, G + 0.006, 0, 0.15);
  b.box(0.16, 0.16, 0.16, { color: 0xc8c0b0, x: 0, y: G, z: 0.15 });
  b.box(0.06, 0.2, 0.05, { color: 0x6a8a7a, mat: Mat.Plain, x: 0, y: G + 0.16, z: 0.15 });
  // library with dome (head of the quad)
  b.box(1.7, 0.5, 0.9, { color: stone, mat: Mat.WindowSmall, top: 0xb8ae98, x: 0, y: G, z: -1.75 });
  columns(b, 6, 0.9, 0.42, 0.04, -1.24, 0xf6f0e2, G);
  b.box(1.1, 0.06, 0.2, { color: stone, x: 0, y: G + 0.42, z: -1.22 });
  b.gable(1.1, 0.16, 0.2, { color: 0xe0d4ba, x: 0, y: G + 0.48, z: -1.22, overhang: 0.02 });
  b.cyl(0.36, 0.36, 0.2, { color: stone, mat: Mat.WindowSmall, seg: 12, x: 0, y: G + 0.5, z: -1.8 });
  b.dome(0.38, { color: 0x5a8aaa, x: 0, y: G + 0.7, z: -1.8, wSeg: 12, hSeg: 5, h: 0.36 });
  b.cyl(0.04, 0.05, 0.12, { color: 0xffd040, mat: Mat.Metal, seg: 6, x: 0, y: G + 1.06, z: -1.8 });
  // clock tower
  const tx = 1.55, tz = -1.55;
  b.box(0.36, 1.85, 0.36, { color: brick, mat: Mat.WindowSmall, x: tx, y: G, z: tz });
  b.box(0.42, 0.06, 0.42, { color: stone, x: tx, y: G + 1.85, z: tz });
  for (let k = 0; k < 4; k++) clockFace(b, tx + Math.sin((k * Math.PI) / 2) * 0.185, G + 1.6, tz + Math.cos((k * Math.PI) / 2) * 0.185, 0.11, (k * Math.PI) / 2);
  b.pyramid(0.4, 0.55, 0.4, { color: 0x5a9a8a, x: tx, y: G + 1.91, z: tz });
  b.box(0.04, 0.04, 0.04, { color: 0xff3030, mat: Mat.Glow, x: tx, y: G + 2.46, z: tz, paint: false });
  // gabled halls along the quad
  const hall = (x: number, z: number, w: number, d: number, floors: number) => {
    b.box(w, floors * FL, d, { color: brick, mat: Mat.Window, x, y: G, z });
    b.gable(d, 0.22, w, { color: roof, x, y: G + floors * FL, z, ry: Math.PI / 2 });
  };
  hall(-1.75, -0.2, 0.62, 1.9, 3);
  hall(1.75, 0.35, 0.62, 1.5, 3);
  hall(-1.55, 1.95, 1.0, 0.55, 2);
  // modern science wing with an observatory dome
  b.box(0.9, 0.5, 0.6, { color: 0xeef2f6, mat: Mat.Glass, top: 0xc8ccd0, x: 1.75, y: G, z: 1.85 });
  b.dome(0.18, { color: 0xf4f4f6, x: 1.95, y: G + 0.5, z: 1.8, wSeg: 10, hSeg: 4 });
  b.box(0.04, 0.2, 0.02, { color: 0x2a2e36, x: 1.95, y: G + 0.56, z: 1.97, rx: -0.5, paint: false });
  // dorm towers
  for (const [x, z] of [[-2.65, -1.35], [-2.05, -2.1]] as const) {
    block(b, 0.5, 5 * FL, 0.5, { color: 0xe8dcc8, roof: 0x8a7a6a, x, z });
  }
  // gate
  for (const x of [-0.42, 0.42]) b.box(0.14, 0.5, 0.14, { color: stone, x, y: G, z: 2.75 });
  b.box(1.0, 0.1, 0.12, { color: stone, x: 0, y: G + 0.5, z: 2.75 });
  sign(b, 0, G + 0.52, 2.82, 0.6, 0.06, 0xffd88a, Mat.Light);
  // tennis court
  b.plane(0.8, 0.5, { color: 0x3a8a6a, x: 1.25, y: G + 0.004, z: -0.95, paint: false });
  b.plane(0.012, 0.5, { color: 0xffffff, x: 1.25, y: G + 0.008, z: -0.95, paint: false });
  // trees and students
  for (let i = 0; i < 5; i++) {
    tree(b, -1.05, -0.95 + i * 0.55, 1.05, 'round', rng);
    tree(b, 1.05, -0.45 + i * 0.5, 1.05, i % 2 ? 'autumn' : 'round', rng, G, i > 3);
  }
  grove(b, rng, -2.55, 0.6, 0, 0.55, 4, ['round', 'birch'], 1.05);
  grove(b, rng, 2.8, -0.6, 0, 0.4, 3, ['pine', 'round'], 1.05);
  crowd(b, rng, 0, 0.6, 1.0, 12);
  lampRing(b, 1.15, 8, 0.28, C.lamp, Math.PI / 8, 0, 0.15);
  schoolBus(b, -0.9, 2.55, Math.PI / 2);
  bench(b, -0.35, 0.55, Math.PI);
  bench(b, 0.35, 0.55, Math.PI);
}

/** Robotics academy: glass-fronted workshop, giant orange robot-arm sculpture and a rover test loop. */
export function roboticsAcademy(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.paving);
  const orange = 0xff8a2a, dk = 0x30343c;
  const top = block(b, 0.72, 0.42, 0.42, { color: 0xeef0f2, roof: 0x9aa0a8, x: -0.1, z: -0.24 });
  b.box(0.5, 0.36, 0.02, { color: 0x4a6a8a, mat: Mat.Glass, x: -0.1, y: G, z: -0.025 });
  b.box(0.73, 0.03, 0.43, { color: orange, x: -0.1, y: G + 0.39, z: -0.24, paint: false });
  sign(b, -0.1, G + 0.36, -0.02, 0.3, 0.04, orange);
  // robot arm
  const ax = 0.36, az = 0.25;
  b.cyl(0.1, 0.12, 0.06, { color: dk, seg: 8, x: ax, y: G, z: az });
  b.group({ x: ax, y: G + 0.06, z: az, ry: -0.7 }, () => {
    b.box(0.07, 0.36, 0.07, { color: orange, rz: 0.35 });
    b.sphere(0.055, { color: dk, x: -0.12, y: 0.34, wSeg: 6, hSeg: 4 });
    b.group({ x: -0.12, y: 0.34, rz: -1.6 }, () => {
      b.box(0.06, 0.3, 0.06, { color: orange });
      b.box(0.03, 0.08, 0.06, { color: dk, x: -0.025, y: 0.3, rz: 0.4, detail: true });
      b.box(0.03, 0.08, 0.06, { color: dk, x: 0.025, y: 0.3, rz: -0.4, detail: true });
      b.box(0.03, 0.03, 0.03, { color: C.science, mat: Mat.Glow, y: 0.28, paint: false });
    });
  });
  // rover loop
  b.extrude(ellipse(0.5, 0.26, 10, -0.25, 0.4), 0.005, { color: 0x6a6e78, y: G, paint: false });
  for (let i = 0; i < 3; i++) {
    const a = rng.next() * TAU;
    const x = -0.25 + Math.sin(a) * 0.22, z = 0.4 + Math.cos(a) * 0.1;
    b.box(0.05, 0.03, 0.06, { color: FUN[i * 3 % FUN.length], x, y: G + 0.005, z, ry: a + Math.PI / 2, detail: true, paint: false });
    b.box(0.03, 0.01, 0.01, { color: C.science, mat: Mat.Glow, x, y: G + 0.035, z, ry: a + Math.PI / 2, detail: true, paint: false });
  }
  antenna(b, -0.35, top, -0.35, 0.3, C.science);
  solar(b, 0.05, top + 0.02, -0.3, 0.3, 0.24);
  person(b, 0.15, 0.1, 0x3a6ae0);
  tree(b, 0.5, -0.3, 0.85, 'round', rng);
}

/** Space academy: training rocket on its gantry, centrifuge ring, crater sim pit, domed classroom and cadets. */
export function spaceAcademy(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.paving);
  // main hall
  b.extrude(roundRect(1.7, 0.62, 0.3, 3, -0.15, 0.35), 0.42, { color: 0xf2f4f8, mat: Mat.Window, top: 0xc8d0dc, y: G });
  b.extrude(roundRect(1.72, 0.64, 0.3, 3, -0.15, 0.35), 0.04, { color: 0x2a5ad0, y: G + 0.2, paint: false });
  b.dome(0.3, { color: 0x7ab8e0, mat: Mat.Glass, x: -0.6, y: G + 0.42, z: 0.35, wSeg: 10, hSeg: 4 });
  sign(b, 0.1, G + 0.3, 0.668, 0.5, 0.06, 0x7ab8ff);
  // launch pad + gantry + rocket
  const px = 1.05, pz = -0.85;
  b.cyl(0.5, 0.52, 0.06, { color: 0xb8b4ac, seg: 12, x: px, y: G, z: pz });
  b.box(0.14, 1.55, 0.14, { color: 0xd84a2a, mat: Mat.Plain, x: px + 0.28, y: G + 0.06, z: pz });
  for (let i = 0; i < 3; i++) b.box(0.18, 0.02, 0.04, { color: 0xd84a2a, mat: Mat.Plain, x: px + 0.17, y: G + 0.5 + i * 0.4, z: pz, detail: true });
  b.cyl(0.11, 0.11, 1.2, { color: 0xf6f6f8, seg: 10, x: px, y: G + 0.06, z: pz });
  b.cyl(0.112, 0.112, 0.08, { color: 0x1a1a1a, seg: 10, x: px, y: G + 0.6, z: pz, capTop: false });
  b.cone(0.11, 0.3, { color: 0x2a5ad0, seg: 10, x: px, y: G + 1.26, z: pz });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    b.box(0.015, 0.18, 0.12, { color: 0x2a5ad0, x: px + Math.sin(a) * 0.12, y: G + 0.06, z: pz + Math.cos(a) * 0.12, ry: a });
  }
  // centrifuge
  const cx = -1.0, cz = -0.8;
  b.cyl(0.1, 0.12, 0.3, { color: 0x8a96a6, mat: Mat.Plain, seg: 8, x: cx, y: G, z: cz });
  b.torus(0.62, 0.045, { color: 0xe8ecf0, seg: 20, tube: 4, x: cx, y: G + 0.22, z: cz });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    b.box(0.03, 0.03, 0.6, { color: 0x8a96a6, mat: Mat.Plain, x: cx + Math.sin(a) * 0.3, y: G + 0.21, z: cz + Math.cos(a) * 0.3, ry: a });
    b.box(0.12, 0.09, 0.09, { color: 0xf4f4f6, mat: Mat.WindowSmall, x: cx + Math.sin(a + 0.4) * 0.62, y: G + 0.18, z: cz + Math.cos(a + 0.4) * 0.62, ry: a + 0.4 });
  }
  // crater sim pit + rover
  b.cyl(0.42, 0.46, 0.03, { color: 0x9a8a7a, seg: 10, x: 0.15, y: G, z: -1.55 + 0.35 });
  for (let i = 0; i < 4; i++) b.sphere(0.05, { color: 0x7a6e62, flat: true, wSeg: 4, hSeg: 3, x: 0.15 + rng.range(-0.3, 0.3), y: G + 0.03, z: -1.2 + rng.range(-0.25, 0.25), detail: true, paint: false });
  b.box(0.1, 0.05, 0.14, { color: 0xf4f4f6, x: 0.2, y: G + 0.05, z: -1.15, ry: 0.5, detail: true });
  b.box(0.04, 0.04, 0.01, { color: C.science, mat: Mat.Glow, x: 0.25, y: G + 0.1, z: -1.1, ry: 0.5, detail: true, paint: false });
  // parade ground: cadets in formation, flags of worlds
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) person(b, -0.6 + c * 0.1, 1.05 + r * 0.1, 0x2a4ab0);
  for (let i = 0; i < 4; i++) flag(b, 0.25 + i * 0.22, 1.25, 0.45, [0x3a8ae0, 0xe0703a, 0x9a5ae0, 0x4ac06a][i]);
  for (let i = 0; i < 3; i++) tree(b, -1.65 + i * 0.25, 0.9 + (i % 2) * 0.2, 1, 'pine', rng);
  antenna(b, 0.5, G + 0.42, 0.3, 0.4, 0xff3030);
}

/** Neural uplink academy: a sleek white needle under a holographic brain, fed by six glowing uplink pods. */
export function neuralAcademy(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0xd8dce6);
  disc(b, 1.4, 0.05, 0xeef0f6, { y: G, seg: 16 });
  b.cyl(1.41, 1.41, 0.015, { color: 0x9a7aff, mat: Mat.Glow, seg: 16, y: G + 0.04, capTop: false });
  b.lathe([[0.42, 0], [0.36, 0.2], [0.18, 0.5], [0.12, 1.4], [0.2, 1.55], [0.001, 1.62]], { color: 0xf6f6fa, mat: Mat.Window, seg: 12, y: G + 0.05 });
  const by = G + 2.05;
  b.sphere(0.32, { color: 0xff7ad8, mat: Mat.Holo, x: -0.15, y: by, z: 0, sx: 0.8, wSeg: 10, hSeg: 6 });
  b.sphere(0.32, { color: 0x7ad8ff, mat: Mat.Holo, x: 0.15, y: by, z: 0, sx: 0.8, wSeg: 10, hSeg: 6 });
  b.torus(0.5, 0.015, { color: 0xffffff, mat: Mat.Glow, seg: 20, tube: 3, y: by - 0.05, rx: 0.3 });
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i / 6) * TAU;
    const x = Math.sin(a) * 1.05, z = Math.cos(a) * 1.05;
    b.group({ x, y: G + 0.05, z, ry: a + Math.PI }, () => {
      b.box(0.2, 0.06, 0.28, { color: 0xeef0f6 });
      b.box(0.18, 0.2, 0.06, { color: 0xeef0f6, y: 0.06, z: -0.11, rx: -0.3 });
      b.sphere(0.07, { color: 0x9a7aff, mat: Mat.Glow, y: 0.3, z: -0.12, wSeg: 6, hSeg: 4 });
      person(b, 0, 0.06, 0x3a3a5a, 0.06, 0.05);
    });
    const dx = -x, dz = -z, len = Math.hypot(dx, dz);
    b.box(0.012, 0.012, len, { color: 0x9a7aff, mat: Mat.Glow, x: x / 2, y: G + 0.6 + (i % 2) * 0.2, z: z / 2, ry: Math.atan2(dx, dz), rx: -0.25, detail: true, paint: false });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    tree(b, Math.sin(a) * 1.85, Math.cos(a) * 1.85, 1, 'alien', rng);
  }
  path(b, 0, 2.3, 0, 1.4, 0.3, 0xeef0f6);
}

// ─────────────────────────────────────────────────────────── culture

/** Public library: colonnaded portico, small dome, giant stacked-books sculpture and a reading garden. */
export function library(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const cv = civic(ctx);
  const wall = mix(cv.wall, SANDSTONE, 0.55);
  lot(b, 1, C.paving);
  b.box(0.8, 0.05, 0.6, { color: C.stone, x: 0, y: G, z: -0.15 });
  steps(b, 0, 0.24, 0.46, 2, 0.025, 0.07, C.stone, G);
  b.box(0.76, 0.38, 0.46, { color: wall, mat: Mat.WindowSmall, top: 0xb8ae98, x: 0, y: G + 0.05, z: -0.24 });
  columns(b, 4, 0.36, 0.32, 0.028, 0.08, 0xf6f2ea, G + 0.05);
  b.box(0.48, 0.04, 0.16, { color: wall, x: 0, y: G + 0.37, z: 0.06 });
  b.gable(0.48, 0.1, 0.16, { color: shade(wall, 0.92), x: 0, y: G + 0.41, z: 0.06, overhang: 0.01 });
  door(b, 0, -0.008, 0.1, 0.18, 0x5a3a2a);
  b.cyl(0.17, 0.17, 0.08, { color: wall, seg: 10, x: 0, y: G + 0.43, z: -0.28 });
  b.dome(0.18, { color: cv.curvy ? cv.glass : 0x6aae98, mat: cv.curvy ? Mat.Glass : Mat.Plain, x: 0, y: G + 0.51, z: -0.28, wSeg: 10, hSeg: 4 });
  // books
  const books = [0xd84a3a, 0x3a6ae0, 0x4ac06a];
  books.forEach((col, i) => b.box(0.2, 0.05, 0.13, { color: col, top: 0xf6f0e0, x: 0.45, y: G + i * 0.05, z: 0.32, ry: 0.3 * (i - 1), paint: false }));
  tree(b, -0.5, 0.25, 0.9, 'round', rng);
  bench(b, -0.32, 0.45, 0);
  lamp(b, 0.25, 0.5);
  if (cv.neon) neonStrip(b, 0, G + 0.4, -0.005, 0.76, cv.accent);
  if (cv.green) bush(b, -0.5, -0.4, 0.1, 0x4f9a3a, G);
}

/** Museum of Old Earth: grand hall with glass pyramids, a blue-green globe, a T-rex and the last rocket off Earth. */
export function museumOldEarth(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.paving);
  const stone = 0xece4d4;
  b.box(2.2, 0.5, 0.95, { color: stone, mat: Mat.WindowSmall, top: 0xb8b0a0, x: 0, y: G, z: -0.75 });
  b.box(2.22, 0.05, 0.97, { color: 0xc9a84a, x: 0, y: G + 0.5, z: -0.75 });
  [0xd84a3a, 0x3a6ae0, 0x4ac06a, 0xffc83a].forEach((col, i) => b.panel(0.14, 0.3, { color: col, x: -0.75 + i * 0.5, y: G + 0.12, z: -0.27, both: true, detail: true, paint: false }));
  // glass pyramids
  b.pyramid(0.9, 0.6, 0.9, { color: 0x8ab8d8, mat: Mat.Glass, x: 0, y: G, z: 0.3 });
  for (const [x, z] of [[-0.75, 0.55], [0.75, 0.55]] as const) b.pyramid(0.3, 0.2, 0.3, { color: 0x8ab8d8, mat: Mat.Glass, x, y: G, z });
  pool(b, rect(0.6, 0.2, 0, 1.0), rect(0.54, 0.14, 0, 1.0), 0.03);
  // the globe
  const gx = -1.35, gz = 0.55;
  b.box(0.3, 0.2, 0.3, { color: 0xc8c0b0, x: gx, y: G, z: gz });
  b.sphere(0.3, { color: 0x2a6ad0, x: gx, y: G + 0.52, z: gz, wSeg: 12, hSeg: 8 });
  for (const [dx, dy, dz, s] of [[0.2, 0.08, 0.16, 0.16], [-0.12, 0.15, 0.22, 0.13], [0.05, -0.12, 0.25, 0.12], [-0.22, -0.02, -0.16, 0.15]] as const)
    b.sphere(s, { color: 0x5aaa44, x: gx + dx, y: G + 0.52 + dy, z: gz + dz, sx: 1.1, sy: 0.9, sz: 1.1, wSeg: 6, hSeg: 4, flat: true });
  b.torus(0.42, 0.008, { color: 0xffd040, mat: Mat.Glow, seg: 20, tube: 3, x: gx, y: G + 0.52, z: gz, rx: 0.4, detail: true });
  b.sphere(0.05, { color: 0xe8e8e0, x: gx + 0.42, y: G + 0.52, z: gz, wSeg: 5, hSeg: 3, detail: true });
  // T-rex skeleton
  const bone = 0xf2ead8;
  b.group({ x: 1.25, y: G, z: 0.55, ry: -0.5 }, () => {
    b.box(0.3, 0.04, 0.2, { color: 0x8a8070 });
    for (const x of [-0.06, 0.06]) {
      b.box(0.035, 0.2, 0.035, { color: bone, x, y: 0.04, z: 0.02, rx: 0.2 });
      b.box(0.035, 0.18, 0.035, { color: bone, x, y: 0.2, z: -0.02, rx: -0.4 });
    }
    b.box(0.12, 0.08, 0.3, { color: bone, y: 0.34, z: 0.05, rx: 0.15 });
    for (let i = 0; i < 3; i++) b.box(0.13, 0.08, 0.02, { color: bone, y: 0.28, z: 0.12 + i * 0.05, detail: true });
    b.box(0.06, 0.06, 0.18, { color: bone, y: 0.42, z: 0.24, rx: -0.7 });
    b.box(0.08, 0.09, 0.17, { color: bone, y: 0.5, z: 0.36 });
    b.box(0.07, 0.03, 0.13, { color: bone, y: 0.46, z: 0.38, rx: 0.3 });
    b.box(0.07, 0.06, 0.24, { color: bone, y: 0.36, z: -0.18, rx: 0.25 });
    b.box(0.05, 0.04, 0.24, { color: bone, y: 0.28, z: -0.4, rx: 0.4 });
    b.box(0.02, 0.06, 0.02, { color: bone, x: 0.05, y: 0.33, z: 0.18, rx: 0.8, detail: true });
  });
  // the last rocket
  const rx = -1.7, rz = -0.15;
  b.cyl(0.13, 0.13, 1.25, { color: 0xf6f6f2, seg: 10, x: rx, y: G + 0.1, z: rz });
  for (const y of [0.3, 0.7, 1.1]) b.cyl(0.132, 0.132, 0.06, { color: 0x1a1a1a, seg: 10, x: rx, y: G + y, z: rz, capTop: false });
  b.cone(0.13, 0.3, { color: 0xf6f6f2, seg: 10, x: rx, y: G + 1.35, z: rz });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    b.box(0.02, 0.22, 0.12, { color: 0x1a1a1a, x: rx + Math.sin(a) * 0.15, y: G, z: rz + Math.cos(a) * 0.15, ry: a });
  }
  for (let i = 0; i < 4; i++) tree(b, 1.75 - i * 0.12, -0.35 + i * 0.3, 1, 'round', rng);
  crowd(b, rng, 0.05, 0.85, 0.5, 9);
  lampRing(b, 1.05, 6, 0.26, C.lamp, 0.3, 0, 0.45);
}

/** Planetarium: midnight-blue star dome with a cyan halo, orbit sculpture and a telescope on the lawn. */
export function planetarium(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.paving);
  b.cyl(0.42, 0.44, 0.18, { color: 0xf2f2f6, mat: Mat.WindowSmall, seg: 14, y: G, z: -0.1 });
  b.cyl(0.445, 0.445, 0.025, { color: C.science, mat: Mat.Glow, seg: 14, y: G + 0.18, z: -0.1, capTop: false });
  b.dome(0.44, { color: 0x1e2a5a, y: G + 0.18, z: -0.1, wSeg: 14, hSeg: 5, h: 0.4 });
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * TAU, t = rng.range(0.15, 1.2);
    b.box(0.018, 0.018, 0.018, { color: 0xfff6d8, mat: Mat.Glow, x: Math.sin(a) * Math.cos(t) * 0.44, y: G + 0.18 + Math.sin(t) * 0.4, z: -0.1 + Math.cos(a) * Math.cos(t) * 0.44, detail: true, paint: false });
  }
  canopy(b, 0, G + 0.16, 0.3, 0.26, 0.1, 0xf2f2f6, C.science);
  door(b, 0, 0.32, 0.1, 0.13, 0x24324a, G, Mat.Glass);
  // orbit sculpture + telescope
  b.cyl(0.03, 0.03, 0.2, { color: C.steel, seg: 5, x: 0.48, y: G, z: 0.3 });
  b.sphere(0.06, { color: 0xffc84a, mat: Mat.Glow, x: 0.48, y: G + 0.28, z: 0.3, wSeg: 6, hSeg: 4 });
  b.torus(0.14, 0.006, { color: 0xd8dce4, mat: Mat.Plain, seg: 14, tube: 3, x: 0.48, y: G + 0.28, z: 0.3, rx: 0.4 });
  b.sphere(0.025, { color: 0x4a8aff, x: 0.62, y: G + 0.24, z: 0.3, wSeg: 5, hSeg: 3 });
  b.group({ x: -0.45, y: G, z: 0.38 }, () => {
    for (let i = 0; i < 3; i++) b.box(0.012, 0.16, 0.012, { color: 0x3a3e46, x: Math.sin((i / 3) * TAU) * 0.04, z: Math.cos((i / 3) * TAU) * 0.04, detail: true });
    b.cyl(0.025, 0.03, 0.22, { color: 0xf4f4f6, seg: 6, y: 0.14, rx: -0.9, detail: true });
  });
  tree(b, -0.55, -0.25, 0.85, 'round', rng);
  tree(b, 0.55, -0.35, 0.85, 'pine', rng);
}

// ─────────────────────────────────────────────────────────── research

/** Research lab: white lab block, glass annex, bubbling glow tank, fume stacks and a crackling Tesla coil. */
export function researchLab(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.paving);
  const top = block(b, 0.56, 0.44, 0.42, { color: 0xf2f4f6, roof: 0xb8bec6, x: -0.14, z: -0.24 });
  b.box(0.57, 0.025, 0.43, { color: C.science, mat: Mat.Glow, x: -0.14, y: G + 0.2, z: -0.24, paint: false });
  b.box(0.36, 0.28, 0.32, { color: 0x6ab8c8, mat: Mat.Glass, top: 0xd0d4d8, x: 0.3, y: G, z: -0.02 });
  sign(b, 0.3, G + 0.29, 0.142, 0.22, 0.04, C.science);
  // glow tank
  const tx = 0.42, tz = -0.38;
  b.cyl(0.1, 0.1, 0.03, { color: C.steel, mat: Mat.Plain, seg: 8, x: tx, y: G, z: tz });
  b.cyl(0.085, 0.085, 0.32, { color: 0x7aff6a, mat: Mat.Glow, seg: 8, x: tx, y: G + 0.03, z: tz, capTop: false });
  b.cyl(0.1, 0.1, 0.03, { color: C.steel, mat: Mat.Plain, seg: 8, x: tx, y: G + 0.35, z: tz });
  b.tube([[tx, G + 0.36, tz], [tx - 0.1, G + 0.42, tz + 0.02], [0.13, G + 0.42, -0.3]], 0.012, { color: C.steel, seg: 4, detail: true, paint: false });
  // fume stacks + roof kit
  for (let i = 0; i < 3; i++) {
    b.cyl(0.025, 0.025, 0.14, { color: 0xd8dce4, mat: Mat.Plain, seg: 5, x: -0.3 + i * 0.1, y: top, z: -0.36 });
    b.cyl(0.04, 0.04, 0.012, { color: 0x9aa0aa, seg: 5, x: -0.3 + i * 0.1, y: top + 0.15, z: -0.36, detail: true });
  }
  dish(b, -0.05, top, -0.15, 0.1, 0.6);
  // Tesla coil
  const cx = -0.45, cz = 0.32;
  b.cyl(0.06, 0.08, 0.06, { color: 0x3a3e46, seg: 6, x: cx, y: G, z: cz });
  b.cyl(0.03, 0.04, 0.32, { color: 0xc87a3a, mat: Mat.Plain, seg: 6, x: cx, y: G + 0.06, z: cz });
  b.torus(0.07, 0.025, { color: 0xd8dce4, mat: Mat.Plain, seg: 10, tube: 4, x: cx, y: G + 0.4, z: cz });
  b.sphere(0.03, { color: 0xbfe8ff, mat: Mat.Glow, x: cx, y: G + 0.44, z: cz, wSeg: 5, hSeg: 3 });
  for (let i = 0; i < 3; i++) b.box(0.008, 0.08, 0.008, { color: 0xbfe8ff, mat: Mat.Glow, x: cx + Math.sin(i * 2.1) * 0.1, y: G + 0.42, z: cz + Math.cos(i * 2.1) * 0.1, rz: Math.sin(i * 2.1) * 0.9, rx: -Math.cos(i * 2.1) * 0.9, detail: true, paint: false });
  person(b, -0.2, 0.3, 0xf4f4f4);
  person(b, 0.12, 0.35, 0xf4f4f4);
  tree(b, 0.5, 0.42, 0.75, 'round', rng);
}

/** Observatory: white dome on a stone drum with the slit open and the telescope peeking out. */
export function observatory(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, 0xc8c2b6);
  b.cyl(0.4, 0.44, 0.32, { color: 0xe8e2d6, mat: Mat.WindowSmall, seg: 12, y: G, z: -0.12 });
  b.dome(0.42, { color: 0xf4f4f6, mat: Mat.Plain, y: G + 0.32, z: -0.12, wSeg: 14, hSeg: 5, h: 0.42 });
  b.group({ x: 0, y: G + 0.32, z: -0.12, rx: -0.25 }, () => b.box(0.12, 0.44, 0.04, { color: 0x1e2230, z: 0.36, rx: -0.55, paint: false }));
  b.cyl(0.06, 0.07, 0.42, { color: 0xd8dce4, mat: Mat.Plain, seg: 8, x: 0, y: G + 0.45, z: 0.0, rx: 0.75 });
  b.cyl(0.072, 0.072, 0.04, { color: 0x2a2e36, seg: 8, x: 0, y: G + 0.71, z: 0.26, rx: 0.75, detail: true });
  // annex + steps
  b.box(0.3, 0.2, 0.26, { color: 0xe8e2d6, mat: Mat.WindowSmall, x: 0.42, y: G, z: 0.15 });
  b.gable(0.3, 0.1, 0.26, { color: 0x6a5a5a, x: 0.42, y: G + 0.2, z: 0.15 });
  steps(b, -0.2, 0.32, 0.18, 2, 0.03, 0.06);
  lamp(b, -0.45, 0.35);
  bench(b, -0.38, 0.55, 0.4);
  tree(b, -0.55, -0.2, 0.85, 'pine', rng);
  tree(b, 0.55, -0.35, 0.8, 'pine', rng);
}

/** Particle collider: a 7-km(ish) ring on pylons with glowing beam markers, a giant detector, control campus. */
export function particleCollider(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 19, C.grass);
  const R = 3.45;
  b.torus(R, 0.13, { color: 0xe8ecf0, seg: 40, tube: 6, y: G + 0.25 });
  const n = b.lod ? 8 : 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = Math.sin(a) * R, z = Math.cos(a) * R;
    b.box(0.12, 0.14, 0.12, { color: 0x9aa0aa, x, y: G, z, ry: a });
    b.box(0.06, 0.03, 0.14, { color: C.science, mat: Mat.Glow, x, y: G + 0.37, z, ry: a, paint: false });
  }
  // detector (lying octagon) where the ring crosses the front-right
  const da = Math.PI / 3;
  b.group({ x: Math.sin(da) * R, y: G + 0.25, z: Math.cos(da) * R, ry: da + Math.PI / 2 }, () => {
    b.prism(8, 0.55, 0.6, { color: 0xf0c03a, mat: Mat.Plain, rz: Math.PI / 2, x: 0.3, top: 0x2a5ad0 });
    b.cyl(0.3, 0.3, 0.64, { color: 0x2a5ad0, seg: 8, rz: Math.PI / 2, x: 0.32 });
    b.cyl(0.16, 0.16, 0.66, { color: 0xff6a3a, mat: Mat.Glow, seg: 8, rz: Math.PI / 2, x: 0.33 });
  });
  b.box(0.9, 0.1, 0.9, { color: 0x9aa0aa, x: Math.sin(da) * R, y: G - 0.04, z: Math.cos(da) * R });
  // experiment hall on the ring (back-left)
  const ha = -2.3;
  b.box(1.2, 0.62, 0.9, { color: 0xeef0f2, mat: Mat.WindowSmall, top: 0xa8b0b8, x: Math.sin(ha) * R, y: G, z: Math.cos(ha) * R, ry: ha + Math.PI / 2 });
  // control campus
  b.plane(2.4, 1.6, { color: C.paving, x: 0, y: G + 0.003, z: 0.2, paint: false });
  block(b, 1.0, 0.62, 0.5, { color: 0xf2f4f6, x: -0.55, z: -0.15 });
  block(b, 0.7, 0.42, 0.6, { color: 0xdfe4ea, x: 0.65, z: 0.55, mat: Mat.Glass });
  b.box(1.01, 0.03, 0.51, { color: C.science, mat: Mat.Glow, x: -0.55, y: G + 0.5, z: -0.15, paint: false });
  for (const [x, z] of [[0.7, -0.9], [1.35, -0.6]] as const) {
    b.lathe([[0.32, 0], [0.22, 0.42], [0.25, 0.72]], { color: 0xd8d4cc, seg: 12, x, y: G, z });
    b.sphere(0.2, { color: 0xffffff, x, y: G + 0.85, z, sy: 0.6, wSeg: 6, hSeg: 3, flat: true, detail: true, paint: false });
  }
  dish(b, -1.3, G, 0.8, 0.25, 0.3);
  antenna(b, -0.8, G + 0.64, -0.3, 0.5, C.science);
  for (let i = 0; i < 10; i++) {
    const a = rng.next() * TAU, d = rng.range(1.7, 2.9);
    tree(b, Math.sin(a) * d, Math.cos(a) * d, 1.05, rng.pick(['round', 'pine', 'birch'] as const), rng, G, i > 6);
  }
  for (let i = 0; i < 4; i++) car(b, -0.3 + i * 0.16, 0.75, 0, FUN[i]);
  crowd(b, rng, 0.0, 0.4, 0.4, 6);
}

/** AI think tank: obsidian server monoliths with cyan data veins around a floating core and holographic mind. */
export function aiThinkTank(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0x3a3e48);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.plane(0.02, 1.6, { color: C.science, mat: Mat.Glow, x: Math.sin(a) * 1.0, y: G + 0.004, z: Math.cos(a) * 1.0, ry: a, paint: false });
  }
  const mono: [number, number, number, number][] = [[-1.0, -0.6, 1.3, 0.4], [1.0, -0.55, 1.0, 0.35], [-0.95, 0.75, 0.85, 0.3], [0.95, 0.8, 1.1, 0.4]];
  for (const [x, z, h, w] of mono) {
    const ry = Math.atan2(x, z);
    b.box(w, h, 0.3, { color: 0x1e2430, mat: Mat.Glass, top: 0x2a3040, x, y: G, z, ry });
    for (let k = 0; k < 3; k++) b.box(0.012, h * 0.85, 0.31, { color: k === 1 ? 0xff7ad8 : C.science, mat: Mat.Glow, x: x + Math.cos(ry) * (k - 1) * w * 0.3, y: G + h * 0.06, z: z - Math.sin(ry) * (k - 1) * w * 0.3, ry, paint: false });
    for (let k = 0; k < 4; k++) b.box(0.03, 0.12, 0.34, { color: 0x6a7280, mat: Mat.Plain, x: x - Math.cos(ry) * (w / 2 + 0.04 + k * 0.05), y: G, z: z + Math.sin(ry) * (w / 2 + 0.04 + k * 0.05), ry, detail: true });
  }
  // core
  b.cyl(0.28, 0.34, 0.12, { color: 0x2a3040, seg: 10, y: G });
  b.cyl(0.24, 0.24, 0.015, { color: C.science, mat: Mat.Glow, seg: 10, y: G + 0.12 });
  b.sphere(0.24, { color: 0xdffaff, mat: Mat.Glow, y: G + 1.15, wSeg: 10, hSeg: 6 });
  b.sphere(0.46, { color: 0x7ad8ff, mat: Mat.Holo, y: G + 1.15, wSeg: 8, hSeg: 6, flat: true });
  b.torus(0.6, 0.02, { color: 0xc8ccd8, mat: Mat.Plain, seg: 20, tube: 3, y: G + 1.15, rx: 1.2 });
  b.torus(0.66, 0.02, { color: 0xc8ccd8, mat: Mat.Plain, seg: 20, tube: 3, y: G + 1.15, rz: 1.0 });
  b.cyl(0.015, 0.015, 0.9, { color: C.science, mat: Mat.Glow, seg: 4, y: G + 0.13, capTop: false });
  sign(b, 0, G + 0.08, 1.9, 0.5, 0.06, C.science);
  for (let i = 0; i < 4; i++) crowd(b, rng, 0, 1.6, 0.4, 1);
}

/** Xenobiology institute: faceted greenhouse domes, an alien garden of glowing flora and a tank with a guest. */
export function xenobiologyInstitute(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.paving);
  const glass = 0x7ad8b8;
  for (const [x, z, r] of [[-0.95, -0.65, 0.68], [0.35, -0.95, 0.5], [1.15, -0.2, 0.42]] as const) {
    b.cyl(r, r, 0.08, { color: 0xd8dce0, seg: 10, x, y: G, z });
    b.dome(r, { color: glass, mat: Mat.Glass, x, y: G + 0.08, z, wSeg: 10, hSeg: 4, flat: true });
    b.sphere(0.05, { color: 0xff7ad8, mat: Mat.Glow, x, y: G + 0.1 + r * 0.95, z, wSeg: 5, hSeg: 3, detail: true });
  }
  // lab block
  block(b, 0.8, 0.42, 0.45, { color: 0xf2f4f6, roof: 0xa8b0b8, x: 1.0, z: 0.75 });
  b.box(0.81, 0.025, 0.46, { color: 0x7aff9a, mat: Mat.Glow, x: 1.0, y: G + 0.2, z: 0.75, paint: false });
  // containment tank with a tentacled resident
  const tx = -0.05, tz = 0.25;
  b.cyl(0.36, 0.36, 0.06, { color: C.steel, mat: Mat.Plain, seg: 12, x: tx, y: G, z: tz });
  b.cyl(0.33, 0.33, 0.48, { color: 0x3aa0c0, mat: Mat.Water, seg: 12, x: tx, y: G + 0.06, z: tz });
  b.cyl(0.35, 0.35, 0.04, { color: C.steel, mat: Mat.Plain, seg: 12, x: tx, y: G + 0.54, z: tz, capTop: false });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.4;
    const ox = Math.sin(a) * 0.12, oz = Math.cos(a) * 0.12;
    b.tube([[tx + ox, G + 0.5, tz + oz], [tx + ox * 2, G + 0.72, tz + oz * 2], [tx + ox * 2.6, G + 0.86, tz + oz * 1.2], [tx + ox * 2.2, G + 0.95, tz]], 0.028 - k * 0.004, { color: 0xb05ad0, seg: 5, paint: false });
  }
  // alien garden
  for (let i = 0; i < 6; i++) tree(b, -1.55 + (i % 3) * 0.35, 0.55 + Math.floor(i / 3) * 0.45, 1.05, 'alien', rng);
  for (const [x, z] of [[-0.55, 1.35], [0.45, 1.4]] as const)
    for (let k = 0; k < 3; k++) b.cone(0.05, 0.22 - k * 0.04, { color: [0x9a7aff, 0xff6ad8, 0x6affd0][k], mat: Mat.Glow, seg: 5, x: x + (k - 1) * 0.07, y: G, z, rz: (k - 1) * 0.3, paint: false });
  b.sphere(0.12, { color: 0x7aff6a, mat: Mat.Glow, x: 0.6, y: G + 0.05, z: 0.95, sy: 0.6, wSeg: 7, hSeg: 4, paint: false });
  for (let i = 0; i < 4; i++) person(b, rng.range(-0.5, 0.6), rng.range(0.6, 1.2), 0xffd23a);
}

