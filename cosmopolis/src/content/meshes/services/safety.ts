/**
 * services · safety meshes — police, justice, fire & rescue, civil defence (OWNER: services).
 *
 * Every factory is a MeshFactory (see content/catalog.ts). Identity colours stay constant (police navy + blue
 * beacons, fire-red brick + orange sirens) while styleable buildings take their walls / roofs / extras from the
 * district style via `civic(ctx)` (curvy styles get domes, green styles roof gardens, neon styles light strips).
 * Budgets: footprint 1 & 7 ≤ 1 500 tris, footprint 19 ≤ 3 000 (checked by audit.ts).
 */
import type { MeshContext } from '../../catalog';
import {
  C, G, FL, TAU, Mat, mix, shade, civic, lot, block, door, canopy, sign, badge, patrolCar, fireTruck, ambulance, car, helipad, drone,
  antenna, dish, acUnit, flag, lamp, lampRing, tree, grove, bush, bench, person, crowd, roofGarden, neonStrip, wall, fence, ngon, path,
  steps, columns, solar, lShape, softHex, plate, rect, disc, carRow, hedge, flowers, stringLights, edging,
} from './parts';

// ─────────────────────────────────────────────────────────── police

/** Neighbourhood police post: two-storey station, blue lamp, patrol cars on the apron. */
export function policePost(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const cv = civic(ctx);
  lot(b, 1, C.paving);
  // apron for the cars
  b.plane(0.42, 0.36, { color: C.asphalt, x: 0.36, y: G + 0.003, z: 0.2, paint: false });
  const top = block(b, 0.62, 2 * FL + 0.02, 0.5, { color: cv.wall, roof: C.police, x: -0.1, z: -0.12 });
  b.box(0.635, 0.035, 0.515, { color: C.police, x: -0.1, y: G + FL - 0.01, z: -0.12, paint: false });
  // garage annex
  const annexTop = block(b, 0.34, FL + 0.04, 0.4, { color: shade(cv.wall, 0.92), roof: cv.roof, x: 0.38, z: -0.16, mat: Mat.WindowSmall });
  door(b, 0.38, 0.042, 0.24, 0.15, 0x3a3e46);
  // entrance
  door(b, -0.1, 0.132, 0.13, 0.15, 0x24324a, G, Mat.Glass);
  canopy(b, -0.1, G + 0.17, 0.13, 0.28, 0.1, C.police, C.policeLight);
  sign(b, -0.1, G + 0.235, 0.134, 0.34, 0.05, C.policeLight);
  badge(b, 0.12, G + 0.33, 0.14, 0.045, 0xffd040);
  // classic blue lamp
  b.box(0.03, 0.3, 0.03, { color: 0x2a2e36, x: -0.5, y: G, z: 0.34, paint: false });
  b.box(0.06, 0.07, 0.06, { color: C.policeLight, mat: Mat.Glow, x: -0.5, y: G + 0.3, z: 0.34, paint: false });
  patrolCar(b, 0.28, 0.24, 0, C.white, C.policeLight);
  patrolCar(b, 0.45, 0.22, 0, C.police, 0xff3040);
  // roof kit
  antenna(b, -0.3, top, -0.28, 0.32, C.policeLight);
  acUnit(b, 0.05, top, -0.22);
  if (cv.green) roofGarden(b, 0.38, annexTop, -0.16, 0.3, 0.34, rng);
  else solar(b, 0.38, annexTop + 0.02, -0.16, 0.26, 0.3);
  if (cv.curvy) b.dome(0.14, { color: cv.glass, mat: Mat.Glass, x: -0.12, y: top, z: -0.12, wSeg: 10, hSeg: 4 });
  if (cv.neon) neonStrip(b, -0.1, top - 0.03, 0.132, 0.62, cv.accent);
  tree(b, -0.5, 0.05, 0.9, 'round', rng);
  bench(b, -0.32, 0.42, 0);
}

/** Police headquarters: L-shaped precinct, rooftop helipad tower, flag plaza, a lot full of cruisers. */
export function policeHQ(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const cv = civic(ctx);
  lot(b, 7, C.paving);
  // parking lot
  b.plane(0.86, 1.5, { color: C.asphalt, x: 1.28, y: G + 0.003, z: 0.22, paint: false });
  for (let i = 0; i < 5; i++) b.plane(0.02, 0.18, { color: 0xe8e8e8, x: 1.28, y: G + 0.006, z: -0.38 + i * 0.3, paint: false });
  for (let r = 0; r < 4; r++) {
    patrolCar(b, 1.08, -0.3 + r * 0.3, Math.PI / 2, r % 2 ? C.police : C.white, C.policeLight);
    if (r !== 2) patrolCar(b, 1.48, -0.3 + r * 0.3, -Math.PI / 2, r % 2 ? C.white : C.police, 0xff3040);
  }
  // main L-block
  const H = 3 * FL + 0.02;
  b.extrude(lShape(2.0, 1.3, 0.8, 0.6, -0.25, -0.45), H, { color: cv.wall, mat: Mat.Window, top: C.police, y: G });
  b.extrude(lShape(2.02, 1.32, 0.8, 0.6, -0.25, -0.45), 0.04, { color: C.police, y: G + FL, paint: false });
  // tower
  const tw = mix(cv.wall, C.police, 0.35);
  const tTop = block(b, 0.72, 7 * FL, 0.72, { color: tw, roof: shade(tw, 0.7), x: -0.78, z: -0.68 });
  helipad(b, -0.78, tTop, -0.68, 0.3);
  badge(b, -0.78, G + 1.15, -0.315, 0.13, 0xffd040);
  b.box(0.74, 0.03, 0.74, { color: C.policeLight, mat: Mat.Glow, x: -0.78, y: tTop - 0.12, z: -0.68, paint: false });
  // atrium entrance
  if (cv.curvy) b.dome(0.34, { color: cv.glass, mat: Mat.Glass, x: 0.05, y: G, z: 0.36, wSeg: 12, hSeg: 4, h: 0.42 });
  else b.box(0.62, 0.42, 0.34, { color: cv.glass, mat: Mat.Glass, x: 0.05, y: G, z: 0.37 });
  sign(b, 0.05, G + 0.43, 0.545, 0.56, 0.07, C.policeLight);
  canopy(b, 0.05, G + 0.18, 0.54, 0.4, 0.14, C.police, C.policeLight);
  // flag plaza
  for (let i = 0; i < 3; i++) flag(b, -1.05 + i * 0.22, 0.62, 0.5, [C.police, 0xffffff, 0xffd040][i]);
  steps(b, 0.05, 0.78, 0.6, 2, 0.02, 0.08);
  // roof gear
  const roofY = G + H;
  antenna(b, 0.48, roofY, -0.85, 0.7, C.policeLight);
  dish(b, 0.15, roofY, -0.9, 0.12, 2.4);
  acUnit(b, -0.2, roofY, -0.3);
  acUnit(b, 0.3, roofY, -0.5);
  if (cv.green) roofGarden(b, -0.05, roofY, -0.1, 0.5, 0.36, rng);
  if (cv.neon) neonStrip(b, -0.25, roofY - 0.04, 0.205, 2.0, cv.accent);
  // greenery
  for (let i = 0; i < 4; i++) tree(b, -1.55 + i * 0.34, 1.05 + (i % 2) * 0.12, 1, 'round', rng);
  lampRing(b, 0.75, 4, 0.28, C.lamp, Math.PI / 4, 0.05, 0.9);
  crowd(b, rng, -0.4, 0.95, 0.25, 4);
  edging(b, rng, 7, 7, ['round', 'pine'], { skip: [[0.4, 2.1], [5.3, 6.3]] });
}

/** Security drone hub: graphite tower with docking arms and a swarm of patrol drones. */
export function droneHub(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, 0x8c9098);
  const gr = 0x5a6070;
  b.cyl(0.6, 0.62, 0.16, { color: gr, mat: Mat.WindowSmall, top: 0x4a505c, seg: 12, y: G });
  b.cyl(0.605, 0.605, 0.02, { color: C.policeLight, mat: Mat.Glow, seg: 12, y: G + 0.13, capTop: false });
  b.lathe([[0.27, 0], [0.22, 0.2], [0.14, 0.45], [0.12, 0.86], [0.21, 0.97], [0.21, 1.04], [0.08, 1.1], [0.001, 1.15]], { color: 0xdfe4ec, seg: 10, y: G + 0.16 });
  for (const yy of [0.5, 0.72]) b.cyl(0.135, 0.135, 0.03, { color: C.science, mat: Mat.Glow, seg: 10, y: G + 0.16 + yy, capTop: false });
  b.sphere(0.05, { color: C.policeLight, mat: Mat.Glow, y: G + 1.33, wSeg: 6, hSeg: 4 });
  // docking arms with pads
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    b.group({ y: G + 1.07, ry: a }, () => {
      b.box(0.04, 0.03, 0.36, { color: C.steel, z: 0.32, paint: false });
      b.cyl(0.085, 0.085, 0.02, { color: 0x2a2e36, seg: 8, z: 0.5, y: 0.01, paint: false });
      b.cyl(0.07, 0.07, 0.006, { color: C.policeLight, mat: Mat.Glow, seg: 8, z: 0.5, y: 0.03, capTop: true, paint: false });
    });
    const x = Math.sin(a) * 0.5, z = Math.cos(a) * 0.5;
    if (i !== 1) drone(b, x, G + 1.17, z, C.policeLight);
  }
  // patrol swarm
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * TAU, d = rng.range(0.45, 0.75);
    drone(b, Math.sin(a) * d, G + rng.range(0.45, 1.45), Math.cos(a) * d, i % 2 ? C.policeLight : 0xff3a5a);
  }
  door(b, 0, 0.6, 0.18, 0.12, 0x24324a, G, Mat.Glass);
  sign(b, 0, G + 0.06, 0.63, 0.22, 0.03, C.policeLight, Mat.Glow, 0, true);
}

/** Penitentiary: hexagonal perimeter wall, guard towers with searchlights, cell blocks and an exercise yard. */
export function prison(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, 0xa8a69e);
  const outline = ngon(6, 2.18, Math.PI / 6);
  wall(b, outline, 0.26, 0.08, 0xd4d0c6, true, G, 0xb0aca2);
  fence(b, ngon(6, 2.08, Math.PI / 6), 0.33, 0x8a9098, true, G);
  for (const [x, z] of outline) {
    b.cyl(0.09, 0.11, 0.48, { color: 0xc8c4ba, seg: 6, x, y: G, z });
    b.box(0.22, 0.1, 0.22, { color: 0x6a7280, mat: Mat.WindowSmall, x, y: G + 0.48, z });
    b.pyramid(0.28, 0.08, 0.28, { color: 0x4a4e58, x, y: G + 0.58, z });
    b.box(0.05, 0.04, 0.05, { color: 0xfff2c0, mat: Mat.Light, x: x * 0.95, y: G + 0.5, z: z * 0.95, detail: true, paint: false });
  }
  // gatehouse
  b.box(0.6, 0.36, 0.3, { color: 0xd4d0c6, mat: Mat.WindowSmall, x: 0, y: G, z: 1.9 });
  b.box(0.62, 0.04, 0.32, { color: C.police, x: 0, y: G + 0.36, z: 1.9, paint: false });
  door(b, 0, 2.052, 0.24, 0.2, 0x3a3e46);
  path(b, 0, 2.2, 0, 1.0, 0.3, C.asphalt);
  // cell blocks
  const cell = 0xe2ddd2;
  b.box(1.9, 0.58, 0.4, { color: cell, mat: Mat.WindowSmall, top: 0x8a8a8a, x: -0.15, y: G, z: -0.95 });
  b.box(0.4, 0.58, 1.1, { color: cell, mat: Mat.WindowSmall, top: 0x8a8a8a, x: -1.05, y: G, z: -0.05 });
  b.prism(6, 0.36, 0.86, { color: 0xc8c2b4, mat: Mat.Window, top: 0x7a7a7a, x: 0.25, y: G, z: -0.25 });
  b.cyl(0.12, 0.12, 0.2, { color: 0x6a7280, mat: Mat.Glass, seg: 6, x: 0.25, y: G + 0.86, z: -0.25 });
  b.box(0.06, 0.06, 0.06, { color: 0xffe0a0, mat: Mat.Glow, x: 0.25, y: G + 1.06, z: -0.25, paint: false });
  // exercise yard
  b.plane(1.1, 0.75, { color: 0x5a7a62, x: 0.65, y: G + 0.004, z: 0.75, paint: false });
  b.plane(1.0, 0.012, { color: 0xffffff, x: 0.65, y: G + 0.007, z: 0.75, paint: false });
  b.box(0.02, 0.18, 0.02, { color: 0x888888, x: 0.2, y: G, z: 0.75, detail: true, paint: false });
  b.box(0.02, 0.18, 0.02, { color: 0x888888, x: 1.1, y: G, z: 0.75, detail: true, paint: false });
  fence(b, [[0.08, 0.36], [1.22, 0.36], [1.22, 1.14], [0.08, 1.14]], 0.16, 0x8a9098, true);
  for (let i = 0; i < 7; i++) person(b, 0.25 + rng.next() * 0.8, 0.45 + rng.next() * 0.6, 0xff8a1a);
  patrolCar(b, -0.5, 1.2, 0.4, C.white, C.policeLight);
  // searchlight beams from the gatehouse at night
  b.box(0.06, 0.05, 0.06, { color: 0xfff2c0, mat: Mat.Light, x: -0.24, y: G + 0.4, z: 1.9, paint: false });
  b.box(0.06, 0.05, 0.06, { color: 0xfff2c0, mat: Mat.Light, x: 0.24, y: G + 0.4, z: 1.9, paint: false });
}

/** Hall of Justice: marble podium, colonnade, pediment, copper dome and a statue of blind Justice. */
export function courthouse(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const marble = 0xeee8dc, stone = 0xd8d0c0;
  lot(b, 7, C.paving);
  b.box(2.3, 0.1, 1.6, { color: stone, x: 0, y: G, z: -0.35 });
  steps(b, 0, 0.62, 1.3, 3, 0.035, 0.09, stone, G);
  b.box(1.9, 0.52, 1.1, { color: marble, mat: Mat.WindowSmall, top: 0xb8b0a0, x: 0, y: G + 0.1, z: -0.5 });
  // portico
  columns(b, 6, 1.2, 0.5, 0.045, 0.28, 0xf6f2ea, G + 0.1);
  b.box(1.42, 0.07, 0.42, { color: marble, x: 0, y: G + 0.6, z: 0.24 });
  b.gable(1.42, 0.2, 0.42, { color: 0xe4dccc, x: 0, y: G + 0.67, z: 0.24, overhang: 0.02 });
  // drum + dome + lantern
  b.cyl(0.42, 0.42, 0.24, { color: marble, mat: Mat.WindowSmall, seg: 14, x: 0, y: G + 0.62, z: -0.55 });
  b.dome(0.44, { color: 0x6aae98, x: 0, y: G + 0.86, z: -0.55, wSeg: 14, hSeg: 5, h: 0.4 });
  b.cyl(0.06, 0.07, 0.14, { color: marble, seg: 6, x: 0, y: G + 1.24, z: -0.55 });
  b.cone(0.07, 0.12, { color: 0xffd040, mat: Mat.Metal, seg: 6, x: 0, y: G + 1.38, z: -0.55 });
  // Justice
  b.box(0.16, 0.14, 0.16, { color: stone, x: 0, y: G, z: 1.2 });
  b.box(0.06, 0.22, 0.05, { color: 0xc9a84a, mat: Mat.Metal, x: 0, y: G + 0.14, z: 1.2 });
  b.box(0.2, 0.012, 0.012, { color: 0xc9a84a, mat: Mat.Metal, x: 0, y: G + 0.32, z: 1.2 });
  b.cyl(0.03, 0.03, 0.006, { color: 0xc9a84a, mat: Mat.Metal, seg: 6, x: -0.09, y: G + 0.28, z: 1.2 });
  b.cyl(0.03, 0.03, 0.006, { color: 0xc9a84a, mat: Mat.Metal, seg: 6, x: 0.09, y: G + 0.28, z: 1.2 });
  b.sphere(0.025, { color: 0xc9a84a, mat: Mat.Metal, x: 0, y: G + 0.39, z: 1.2, wSeg: 5, hSeg: 3 });
  for (const x of [-0.75, 0.75]) flag(b, x, 1.05, 0.48, x < 0 ? C.police : 0xffffff);
  for (let i = 0; i < 6; i++) tree(b, (i < 3 ? -1 : 1) * (1.25 + (i % 3) * 0.3), 0.6 - (i % 3) * 0.45, 1, 'cypress', rng);
  lampRing(b, 1.25, 6, 0.26, C.lamp, Math.PI / 6, 0, 0.3);
  crowd(b, rng, 0.4, 1.05, 0.3, 5);
  patrolCar(b, -0.6, 1.55, Math.PI / 2, C.white, C.policeLight);
  edging(b, rng, 7, 6, ['round', 'birch'], { skip: [[0, 1.6], [4.7, 6.3]] });
}

/** Pre-crime precinct: obsidian block, a floating all-seeing eye and a milky pool of precogs. */
export function precogPrecinct(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, 0x4a4e5a);
  const ob = 0x23262e;
  b.extrude(softHex(0.62, Math.PI / 6, 0.2), 0.34, { color: ob, mat: Mat.Glass, top: 0x30343e, y: G });
  b.cyl(0.5, 0.5, 0.025, { color: C.policeLight, mat: Mat.Glow, seg: 12, y: G + 0.3, capTop: false });
  // precog pool
  b.cyl(0.34, 0.36, 0.05, { color: 0xd0d4dc, seg: 12, y: G + 0.34 });
  b.cyl(0.3, 0.3, 0.006, { color: 0xe8f4ff, mat: Mat.Water, seg: 12, y: G + 0.388 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3;
    b.sphere(0.04, { color: 0xf2f0ec, x: Math.sin(a) * 0.16, y: G + 0.4, z: Math.cos(a) * 0.16, wSeg: 6, hSeg: 4 });
  }
  // the eye
  b.torus(0.3, 0.025, { color: 0xc8ccd8, mat: Mat.Plain, seg: 18, tube: 4, y: G + 0.95, rx: Math.PI / 2 });
  b.sphere(0.2, { color: 0xf4f4f6, x: 0, y: G + 0.95, z: 0, wSeg: 12, hSeg: 8 });
  b.cyl(0.11, 0.11, 0.02, { color: C.policeLight, mat: Mat.Glow, seg: 12, x: 0, y: G + 0.95, z: 0.18, rx: Math.PI / 2 });
  b.cyl(0.05, 0.05, 0.02, { color: 0x080a10, seg: 8, x: 0, y: G + 0.95, z: 0.19, rx: Math.PI / 2 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 3;
    b.box(0.03, 0.55, 0.03, { color: C.steel, mat: Mat.Plain, x: Math.sin(a) * 0.32, y: G + 0.39, z: Math.cos(a) * 0.32, rz: Math.sin(a) * -0.2, rx: Math.cos(a) * 0.2 });
  }
  for (let i = 0; i < 3; i++) drone(b, rng.range(-0.6, 0.6), G + rng.range(0.6, 1.3), rng.range(-0.5, 0.5), C.policeLight);
  patrolCar(b, 0.45, 0.45, 0.6, ob, C.policeLight);
}

// ─────────────────────────────────────────────────────────── fire & rescue

const BRICK = 0xc85a3a;

/** Fire station: red-brick double garage, hose-drying tower with siren, an engine on the apron. */
export function fireStation(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const cv = civic(ctx);
  const brick = mix(cv.wall, BRICK, 0.6);
  lot(b, 1, C.paving);
  b.plane(0.62, 0.42, { color: C.asphalt, x: -0.06, y: G + 0.003, z: 0.32, paint: false });
  const top = block(b, 0.72, 2 * FL, 0.5, { color: brick, roof: cv.roof, x: -0.06, z: -0.14, mat: Mat.WindowSmall });
  b.box(0.73, 0.04, 0.51, { color: 0xf2ece0, x: -0.06, y: G + 0.25, z: -0.14, paint: false });
  for (const x of [-0.22, 0.1]) {
    door(b, x, 0.112, 0.25, 0.22, 0x30333a);
    b.box(0.27, 0.02, 0.014, { color: C.fire, x, y: G + 0.22, z: 0.114, paint: false });
  }
  sign(b, -0.06, G + 0.3, 0.114, 0.4, 0.05, C.fireLight);
  // hose tower
  b.box(0.2, 0.86, 0.2, { color: brick, mat: Mat.WindowSmall, x: 0.42, y: G, z: -0.26 });
  b.pyramid(0.26, 0.16, 0.26, { color: C.fire, x: 0.42, y: G + 0.86, z: -0.26 });
  b.box(0.06, 0.05, 0.06, { color: C.fireLight, mat: Mat.Glow, x: 0.42, y: G + 1.02, z: -0.26, paint: false });
  badge(b, 0.42, G + 0.66, -0.155, 0.055, 0xffd040);
  fireTruck(b, -0.22, 0.33, 0);
  // hydrant + crew
  b.cyl(0.02, 0.025, 0.06, { color: C.fire, seg: 6, x: 0.38, y: G, z: 0.42, detail: true, paint: false });
  person(b, 0.1, 0.4, 0x2a2a2a);
  person(b, 0.16, 0.46, 0xf0c040);
  b.box(0.05, 0.03, 0.05, { color: C.fireLight, mat: Mat.Glow, x: -0.3, y: top, z: -0.1, paint: false });
  acUnit(b, 0.05, top, -0.25);
  if (cv.green) roofGarden(b, -0.1, top, -0.2, 0.4, 0.28, rng);
  if (cv.curvy) b.cyl(0.13, 0.13, 0.12, { color: cv.glass, mat: Mat.Glass, seg: 10, x: -0.25, y: top, z: -0.22 });
  if (cv.neon) neonStrip(b, -0.06, top - 0.04, 0.113, 0.72, cv.accent);
  tree(b, -0.52, -0.25, 0.9, 'round', rng);
}

/** Fire headquarters: four-bay engine hall, training tower, helipad with a water-bomber and drill yard. */
export function fireHQ(ctx: MeshContext): void {
  const { b, rng } = ctx;
  const cv = civic(ctx);
  const brick = mix(cv.wall, BRICK, 0.6);
  lot(b, 7, C.paving);
  b.plane(2.0, 0.65, { color: C.asphalt, x: -0.3, y: G + 0.003, z: 0.9, paint: false });
  // engine hall
  const hallTop = block(b, 1.9, 0.42, 0.8, { color: brick, roof: cv.roof, x: -0.3, z: 0.15, mat: Mat.WindowSmall });
  for (let i = 0; i < 4; i++) {
    const x = -1.0 + i * 0.47;
    door(b, x, 0.552, 0.36, 0.3, 0x30333a);
    b.box(0.38, 0.025, 0.014, { color: C.fire, x, y: G + 0.3, z: 0.555, paint: false });
  }
  sign(b, -0.3, G + 0.35, 0.556, 0.9, 0.05, C.fireLight);
  // admin block
  const admTop = block(b, 1.3, 3 * FL, 0.62, { color: shade(cv.wall, 1.02), roof: cv.roof, x: -0.55, z: -0.62 });
  b.box(1.31, 0.03, 0.63, { color: C.fire, x: -0.55, y: G + FL, z: -0.62, paint: false });
  // training tower
  b.box(0.38, 1.4, 0.38, { color: 0xc8c2b6, mat: Mat.WindowSmall, x: 0.95, y: G, z: -0.65 });
  b.box(0.42, 0.04, 0.42, { color: C.fire, x: 0.95, y: G + 1.4, z: -0.65 });
  b.box(0.05, 1.3, 0.02, { color: 0xd8dce4, mat: Mat.Plain, x: 0.95, y: G + 0.05, z: -0.45, detail: true, paint: false });
  flag(b, 0.85, -0.6, 0.35, C.fire, G + 1.44);
  // helipad + water bomber
  helipad(b, 1.3, G, 0.55, 0.42);
  b.group({ x: 1.3, y: G + 0.06, z: 0.55, ry: 0.6 }, () => {
    b.box(0.12, 0.1, 0.5, { color: C.fire, top: 0xf2f2f2 });
    b.box(0.72, 0.02, 0.1, { color: 0xf2f2f2, y: 0.09 });
    b.box(0.2, 0.08, 0.02, { color: C.fire, y: 0.08, z: -0.24 });
    for (const x of [-0.36, 0.36]) b.cyl(0.13, 0.13, 0.01, { color: 0x2a2e36, seg: 8, x, y: 0.12, detail: true, paint: false });
  });
  for (let i = 0; i < 3; i++) fireTruck(b, -1.0 + i * 0.47, 0.98, 0);
  ambulance(b, 0.42, 0.98, 0);
  // drill yard: burnt house + hose spray
  b.box(0.3, 0.2, 0.26, { color: 0x3a3634, x: 1.55, y: G, z: -0.2 });
  b.gable(0.3, 0.12, 0.26, { color: 0x2a2624, x: 1.55, y: G + 0.2, z: -0.2 });
  b.box(0.08, 0.1, 0.02, { color: 0xff7a2a, mat: Mat.Lava, x: 1.55, y: G + 0.06, z: -0.065, paint: false });
  b.tube([[1.3, G + 0.05, 0.1], [1.4, G + 0.25, 0.0], [1.5, G + 0.2, -0.1]], 0.012, { color: 0xaee0ff, mat: Mat.Water, seg: 4, detail: true, paint: false });
  person(b, 1.28, 0.12, 0xf0c040);
  const roofY = admTop;
  antenna(b, -0.95, roofY, -0.75, 0.45, C.fireLight);
  if (cv.green) roofGarden(b, -0.3, hallTop, 0.15, 0.8, 0.5, rng);
  else solar(b, -0.3, hallTop + 0.02, 0.15, 1.2, 0.5);
  if (cv.neon) neonStrip(b, -0.55, roofY - 0.04, -0.305, 1.3, cv.accent);
  if (cv.curvy) b.dome(0.22, { color: cv.glass, mat: Mat.Glass, x: -0.2, y: roofY, z: -0.62, wSeg: 10, hSeg: 4 });
  for (let i = 0; i < 3; i++) tree(b, -1.6 + i * 0.25, -0.2 - i * 0.35, 1, 'round', rng);
  edging(b, rng, 7, 5, ['round', 'pine'], { skip: [[5.4, 6.3], [0, 0.9], [3.6, 5.4]] });
}

/** Emergency response centre: glass rotunda under a holographic city map, three response wings. */
export function emergencyCentre(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.paving);
  b.cyl(0.78, 0.8, 0.46, { color: 0x6a8aa8, mat: Mat.Glass, seg: 16, y: G, z: -0.15 });
  b.cyl(0.86, 0.86, 0.05, { color: C.white, seg: 16, y: G + 0.46, z: -0.15 });
  b.cyl(0.87, 0.87, 0.02, { color: C.science, mat: Mat.Glow, seg: 16, y: G + 0.48, z: -0.15, capTop: false });
  b.dome(0.6, { color: 0x3ad0ff, mat: Mat.Holo, y: G + 0.51, z: -0.15, wSeg: 12, hSeg: 4, h: 0.45 });
  b.cyl(0.08, 0.08, 0.3, { color: C.steel, mat: Mat.Plain, seg: 6, y: G + 0.51, z: -0.15 });
  const wings: [number, number, number, (x: number, z: number, a: number) => void][] = [
    [-0.95, C.fire, C.fireLight, (x, z, a) => fireTruck(b, x, z, a)],
    [0.95, C.cross, 0x4aa0ff, (x, z, a) => ambulance(b, x, z, a)],
    [Math.PI, C.police, C.policeLight, (x, z, a) => patrolCar(b, x, z, a, C.white, C.policeLight)],
  ];
  for (const [a, col, glow, veh] of wings) {
    const cx = Math.sin(a) * 1.25, cz = -0.15 + Math.cos(a) * 1.25;
    b.group({ x: cx, y: G, z: cz, ry: a }, () => {
      b.box(0.62, 0.3, 0.5, { color: 0xeef0f2, mat: Mat.WindowSmall, top: 0x9aa0aa });
      b.box(0.63, 0.04, 0.51, { color: col, y: 0.22, paint: false });
      b.box(0.36, 0.2, 0.012, { color: 0x30333a, z: 0.252, paint: false });
      b.box(0.62, 0.01, 0.01, { color: glow, mat: Mat.Glow, y: 0.3, z: 0.255, paint: false });
    });
    veh(Math.sin(a) * 1.78, -0.15 + Math.cos(a) * 1.78, a);
  }
  // entrance + mast + pad
  b.box(0.5, 0.26, 0.24, { color: 0x6a8aa8, mat: Mat.Glass, y: G, z: 0.72 });
  canopy(b, 0, G + 0.27, 0.84, 0.6, 0.2, C.white, C.science);
  antenna(b, 0.9, G, -1.4, 1.3, 0xff3030);
  dish(b, 0.65, G, -1.55, 0.18, 2.8);
  helipad(b, -0.95, G, -1.25, 0.34);
  lampRing(b, 1.95, 8, 0.26, C.lampCool, 0.2, 0, 0);
  crowd(b, rng, 0.2, 1.1, 0.3, 4);
  for (let i = 0; i < 3; i++) tree(b, 1.45 + i * 0.1, 0.55 - i * 0.3, 1, 'round', rng);
  edging(b, rng, 7, 6, ['round', 'birch'], { skip: [[0.6, 1.3], [2.5, 4.1], [4.98, 5.68]] });
}

/** Aerial fire-drone tower: a red water-globe on a slender mast, ringed by docked firefighting drones. */
export function fireDroneTower(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.paving);
  b.box(0.56, 0.22, 0.4, { color: 0xe6e0d6, mat: Mat.WindowSmall, top: 0x8a8a8a, x: 0, y: G, z: -0.25 });
  door(b, 0, -0.048, 0.3, 0.17, 0x30333a);
  b.box(0.57, 0.03, 0.41, { color: C.fire, y: G + 0.19, z: -0.25, paint: false });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    b.box(0.03, 0.95, 0.03, { color: C.steel, mat: Mat.Plain, x: Math.sin(a) * 0.12, y: G, z: 0.12 + Math.cos(a) * 0.12, rx: Math.cos(a) * -0.08, rz: Math.sin(a) * 0.08 });
  }
  b.cyl(0.05, 0.06, 0.95, { color: 0xd8dce4, mat: Mat.Plain, seg: 6, y: G, z: 0.12 });
  b.cyl(0.36, 0.36, 0.03, { color: C.steel, mat: Mat.Plain, seg: 12, y: G + 0.9, z: 0.12 });
  b.sphere(0.27, { color: C.fire, y: G + 1.18, z: 0.12, wSeg: 12, hSeg: 8 });
  b.cyl(0.274, 0.274, 0.05, { color: 0xf4f2ee, seg: 12, y: G + 1.15, z: 0.12, capTop: false });
  b.box(0.05, 0.05, 0.05, { color: C.fireLight, mat: Mat.Glow, y: G + 1.45, z: 0.12, paint: false });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    drone(b, Math.sin(a) * 0.3, G + 0.96, 0.12 + Math.cos(a) * 0.3, C.fireLight);
  }
  for (let i = 0; i < 3; i++) drone(b, rng.range(-0.6, 0.6), G + rng.range(0.6, 1.5), rng.range(-0.3, 0.6), C.fireLight, 1.2);
  b.cyl(0.02, 0.025, 0.06, { color: C.fire, seg: 6, x: 0.45, y: G, z: 0.4, detail: true, paint: false });
}

/** Coast guard station: candy-striped lighthouse, boathouse and an orange rescue cutter on the slipway. */
export function coastGuard(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.paving);
  const lx = -0.32, lz = -0.22;
  b.cyl(0.2, 0.22, 0.08, { color: 0xd8d2c4, seg: 10, x: lx, y: G, z: lz });
  for (let i = 0; i < 4; i++) {
    const r0 = 0.15 - i * 0.012, r1 = 0.15 - (i + 1) * 0.012;
    b.cyl(r1, r0, 0.22, { color: i % 2 ? 0xf4f2ee : 0xd23a2a, seg: 10, x: lx, y: G + 0.08 + i * 0.22, z: lz, capTop: i === 3 });
  }
  const top = G + 0.08 + 0.88;
  b.cyl(0.15, 0.15, 0.03, { color: 0x2a2e36, seg: 10, x: lx, y: top, z: lz });
  b.cyl(0.08, 0.08, 0.12, { color: 0xfff2c0, mat: Mat.Light, seg: 8, x: lx, y: top + 0.03, z: lz });
  b.cone(0.11, 0.1, { color: 0xd23a2a, seg: 8, x: lx, y: top + 0.15, z: lz });
  // boathouse + slipway
  b.box(0.48, 0.26, 0.44, { color: 0xf2ece0, mat: Mat.WindowSmall, x: 0.24, y: G, z: -0.18 });
  b.gable(0.48, 0.16, 0.44, { color: 0xd23a2a, x: 0.24, y: G + 0.26, z: -0.18 });
  door(b, 0.24, 0.042, 0.26, 0.2, 0x30333a);
  b.wedge(0.3, 0.05, 0.42, { color: 0x9a9690, x: 0.24, y: G, z: 0.25 });
  b.group({ x: 0.24, y: G + 0.03, z: 0.22, rx: 0.1 }, () => {
    b.box(0.13, 0.05, 0.32, { color: 0xff7a1a });
    b.box(0.09, 0.06, 0.12, { color: 0xf4f4f4, mat: Mat.WindowSmall, y: 0.05, z: -0.04 });
    b.box(0.03, 0.012, 0.03, { color: C.policeLight, mat: Mat.Glow, y: 0.11, z: -0.04, paint: false });
  });
  b.torus(0.04, 0.012, { color: 0xff5a2a, seg: 8, tube: 4, x: -0.05, y: G + 0.16, z: 0.03, rx: Math.PI / 2, detail: true, paint: false });
  flag(b, -0.5, 0.25, 0.42, 0xff7a1a);
  bench(b, -0.15, 0.45, 0.3);
  tree(b, -0.55, 0.05, 0.8, 'palm', rng);
}

// ─────────────────────────────────────────────────────────── civil defence

/** Disaster shelter: grass-roofed bunker mound, round blast door, mushroom vents, siren mast. */
export function disasterShelter(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 1, C.paving);
  b.dome(0.66, { color: C.grass, y: G, z: -0.12, wSeg: 12, hSeg: 4, h: 0.3, flat: true });
  b.box(0.44, 0.27, 0.34, { color: 0xbab6ae, x: 0, y: G, z: 0.36 });
  b.box(0.46, 0.03, 0.36, { color: 0x9a968e, x: 0, y: G + 0.27, z: 0.36 });
  for (let i = 0; i < 6; i++) b.box(0.07, 0.03, 0.012, { color: i % 2 ? 0x1a1a1a : C.yellow, x: -0.175 + i * 0.07, y: G + 0.225, z: 0.532, paint: false });
  b.cyl(0.1, 0.1, 0.03, { color: C.yellow, mat: Mat.Plain, seg: 10, x: 0, y: G + 0.12, z: 0.53, rx: Math.PI / 2 });
  b.box(0.12, 0.016, 0.02, { color: 0x6a6a6a, mat: Mat.Plain, x: 0, y: G + 0.115, z: 0.565, paint: false });
  sign(b, 0.3, G + 0.18, 0.4, 0.12, 0.1, 0x3aff7a, Mat.Glow, 0.4);
  for (const [x, z] of [[-0.3, -0.25], [0.25, -0.35], [0.05, -0.5]] as const) {
    b.cyl(0.025, 0.025, 0.36, { color: 0x9a9690, seg: 5, x, y: G, z });
    b.cyl(0.06, 0.04, 0.04, { color: 0x7a7670, seg: 6, x, y: G + 0.36, z });
  }
  // siren mast
  b.box(0.03, 0.62, 0.03, { color: C.steel, x: -0.45, y: G, z: 0.15 });
  b.cone(0.06, 0.08, { color: 0xd8d8d8, seg: 6, x: -0.45, y: G + 0.56, z: 0.2, rx: -Math.PI / 2 });
  b.box(0.04, 0.04, 0.04, { color: 0xff3020, mat: Mat.Glow, x: -0.45, y: G + 0.64, z: 0.15, paint: false });
  for (let i = 0; i < 3; i++) b.box(0.08, 0.06, 0.06, { color: 0x6a7a4a, x: 0.36 + (i % 2) * 0.09, y: G + (i === 2 ? 0.06 : 0), z: 0.15, detail: true, paint: false });
  bush(b, -0.55, -0.1, 0.08, 0x4f9a3a);
  tree(b, 0.55, -0.15, 0.8, 'pine', rng);
}

/** Weather control station: radar globe on a tapering mast, a floating ionizer ring and its very own pet cloud. */
export function weatherStation(ctx: MeshContext): void {
  const { b, rng } = ctx;
  lot(b, 7, C.paving);
  // control building
  block(b, 1.0, 0.36, 0.55, { color: 0xeef0f4, x: -1.05, z: 0.75 });
  b.box(1.01, 0.03, 0.56, { color: C.science, mat: Mat.Glow, x: -1.05, y: G + 0.3, z: 0.75, paint: false });
  // mast + radome
  b.lathe([[0.5, 0], [0.34, 0.25], [0.17, 1.35], [0.22, 1.62], [0.12, 1.72]], { color: 0xdfe4ea, seg: 6, flat: true, y: G });
  b.cyl(0.42, 0.42, 0.04, { color: C.steel, mat: Mat.Plain, seg: 12, y: G + 1.6 });
  b.sphere(0.36, { color: 0xf4f6fa, y: G + 2.0, wSeg: 10, hSeg: 6, flat: true });
  b.box(0.04, 0.04, 0.04, { color: 0xff3030, mat: Mat.Glow, y: G + 2.37, paint: false });
  // ionizer ring
  b.torus(0.78, 0.04, { color: C.science, mat: Mat.Glow, seg: 24, tube: 4, y: G + 2.65 });
  b.torus(0.6, 0.02, { color: 0x9a7aff, mat: Mat.Glow, seg: 20, tube: 3, y: G + 2.6, rx: 0.4, detail: true });
  // pet cloud with a tiny bolt
  const cy = G + 3.25;
  const puffs: [number, number, number, number][] = [[0, 0, 0, 0.3], [0.28, -0.05, 0.05, 0.22], [-0.27, -0.06, -0.02, 0.2], [0.05, 0.12, -0.08, 0.2]];
  for (const [x, y, z, r] of puffs) b.sphere(r, { color: 0xf6f8ff, x, y: cy + y, z, sy: 0.7, wSeg: 7, hSeg: 4, flat: true, paint: false });
  b.box(0.04, 0.16, 0.02, { color: 0xfff27a, mat: Mat.Glow, x: 0.05, y: cy - 0.38, z: 0, rz: 0.4, detail: true, paint: false });
  b.box(0.04, 0.16, 0.02, { color: 0xfff27a, mat: Mat.Glow, x: 0.02, y: cy - 0.5, z: 0, rz: -0.4, detail: true, paint: false });
  // cloud-seeding cannons
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 3 + (i / 3) * TAU;
    const x = Math.sin(a) * 1.55, z = Math.cos(a) * 1.55;
    b.group({ x, y: G, z, ry: a }, () => {
      b.cyl(0.16, 0.18, 0.12, { color: 0x9aa0aa, seg: 8 });
      b.cyl(0.05, 0.06, 0.55, { color: 0xdfe4ea, mat: Mat.Plain, seg: 6, y: 0.1, rx: 0.6 });
      b.box(0.03, 0.03, 0.03, { color: C.science, mat: Mat.Glow, y: 0.56, z: 0.32, paint: false });
    });
  }
  dish(b, 1.0, G, 0.85, 0.22, 0.4);
  dish(b, 0.55, G, -1.3, 0.16, 3.0);
  for (let i = 0; i < 4; i++) solar(b, -1.25 + (i % 2) * 0.45, G + 0.04, -0.75 - Math.floor(i / 2) * 0.35, 0.38, 0.26);
  for (let i = 0; i < 4; i++) tree(b, 1.6 - i * 0.18, -0.35 - i * 0.3, 1, 'pine', rng);
  lampRing(b, 0.9, 6, 0.24, C.lampCool, 0, 0, 0);
  edging(b, rng, 7, 5, ['pine', 'round'], { skip: [[0.6, 1.4], [2.5, 3.6], [4.9, 5.7], [1.6, 2.4]] });
}

