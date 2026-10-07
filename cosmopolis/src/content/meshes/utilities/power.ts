/**
 * utilities · power plant meshes (OWNER: utilities).
 *
 *   wind turbine · offshore wind · solar farm · solar power tower · combustion plant · battery bank · geothermal
 *   · tidal barrage · myco-electric grove · fission plant · fusion tokamak · planetary core tap · orbital solar
 *   receiver · antimatter reactor · zero-point tap · Dyson beam receiver
 *
 * Reading order of each site, front (+Z) to back: control building & gate by the road, process plant in the middle,
 * the tall, iconic part (stacks, cooling towers, tower, beam) at the back so it never hides the entrance.
 * Exotic tiers swap concrete for dark plinths and let Mat.Glow / Mat.Holo carry the silhouette at night.
 */
import { Mat, mix, shade } from '../../kit';
import {
  C, DET, NP, PAD_TOP, patch, beacon, beam, conveyor, coolingTower, dish, door, factory, fence, glowBox, greenRing, hall, heap, holoDisc,
  lamp, lattice, lobby, pad, parking, pipe, puffs, pylon, shrub, solarRows, stack, stripe, tank, transformers, truck, turbine,
} from './common';

// ═══════════════════════════════════════════════════════════════ renewables

/** Single onshore wind turbine. Variants turn the rotor so a wind farm never looks cloned. */
export const windTurbine = factory((u) => {
  const { b } = u;
  pad(u, { h: 0.03, scale: 0.55 });
  b.box(0.16, 0.12, 0.12, { color: u.wall, x: 0.3, z: 0.18, y: PAD_TOP, top: u.roof });
  door(u, 0.06, 0.08, 0.3, 0.241);
  turbine(u, 0, -0.05, 3.1, 1.05, { phase: 0.25 + u.ctx.variant * 0.7, yaw: (u.ctx.variant - 1) * 0.25 });
  shrub(u, -0.42, 0.25, 0.1);
  shrub(u, 0.45, -0.35, 0.08);
});

/** Offshore wind turbine on a monopile; the yellow transition deck sits well above the swell. */
export const offshoreWind = factory((u) => {
  const { b } = u;
  const deck = 0.95;
  b.cyl(0.11, 0.13, deck + 2.4, { color: C.steelDark, y: -2.4, seg: 10 });
  b.cyl(0.14, 0.14, 0.22, { color: C.yellow, y: deck - 0.12, seg: 10 });
  b.cyl(0.32, 0.32, 0.04, { color: C.yellow, y: deck + 0.08, seg: 10 });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    b.box(0.012, 0.07, 0.012, { color: C.iron, x: Math.sin(a) * 0.3, z: Math.cos(a) * 0.3, y: deck + 0.12, ...DET });
  }
  b.box(0.12, 0.1, 0.1, { color: C.white, x: 0.14, y: deck + 0.12, z: -0.12 });
  b.box(0.18, 0.02, 0.06, { color: C.iron, x: 0, y: deck - 0.18, z: 0.17, ...DET });
  turbine(u, 0, 0, 3.0, 1.15, { y: deck + 0.12, phase: 0.9 + u.ctx.variant * 0.6 });
  beacon(u, 0.28, deck + 0.14, 0, C.yellow);
});

/** Solar farm: tilted panel tables in rows with gravel aisles, inverter cabin and a perimeter fence. */
export const solarFarm = factory((u) => {
  const { b } = u;
  pad(u, { color: mix(u.ground, C.leaf, 0.45), edge: u.edge });
  patch(u, 0.22, 4.4, 0, 0, mix(u.ground, C.gravel, 0.6), { detail: true });
  solarRows(u, 2.3, 0, -0.05, { rows: 7, tilt: 0.5, panel: 0.36, skip: (x, z) => (x > 0.75 && z > 1.0) || Math.abs(x) < 0.16 });
  // inverter station by the gate
  hall(u, 0.5, 0.26, 0.34, { x: 1.35, z: 1.45, ry: -0.5, gear: false, shed: true });
  transformers(u, 0.75, 1.75, 1, { ry: -0.5 });
  glowBox(u, 0.3, 0.025, 0.01, 1.35 + 0.08, PAD_TOP + 0.2, 1.62, u.accent, { ry: -0.5, detail: true });
  fence(u, 2.42);
  lamp(u, 0.25, 2.1);
  lamp(u, -0.9, 1.9);
});

/** Concentrated solar power: heliostat rings aimed at a blazing receiver on a central tower. */
export const solarTower = factory((u) => {
  const { b } = u;
  pad(u, { color: mix(u.ground, C.sand, 0.35) });
  const H = 3.6;
  // tower
  b.cyl(0.2, 0.32, H, { color: C.offwhite, y: PAD_TOP, seg: 10 });
  b.cyl(0.36, 0.36, 0.1, { color: C.iron, y: PAD_TOP + H - 0.05, seg: 10 });
  b.cyl(0.3, 0.3, 0.5, { color: 0xfff2b0, mat: Mat.Glow, y: PAD_TOP + H + 0.05, seg: 10, ...NP });
  b.cyl(0.36, 0.36, 0.1, { color: C.iron, y: PAD_TOP + H + 0.55, seg: 10 });
  b.cyl(0.12, 0.16, 0.3, { color: C.offwhite, y: PAD_TOP + H + 0.65, seg: 8 });
  beacon(u, 0, PAD_TOP + H + 0.97, 0);
  for (let k = 0; k < 4; k++) b.box(0.05, 0.12, 0.05, { color: C.iron, x: Math.sin(k * 1.571) * 0.34, z: Math.cos(k * 1.571) * 0.34, y: PAD_TOP + H + 0.95, ...DET });
  // heliostat field: rings of mirrors, each tilted to bounce light up to the receiver
  const rings: [number, number][] = [[1.15, 11], [1.75, 16], [2.35, 21], [2.95, 26], [3.55, 30]];
  for (const [r, n] of rings) {
    for (let i = 0; i < n; i++) {
      const a = ((i + (r > 2 ? 0.5 : 0)) / n) * Math.PI * 2;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (z > 2.1 && Math.abs(x) < 1.7) continue; // plant & gate by the road
      const tilt = 0.35 + Math.atan2(H, r) * 0.5;
      if (r < 3) b.cyl(0.012, 0.012, 0.12, { color: C.steelDark, x, z, y: PAD_TOP, seg: 3, capTop: false, ...DET });
      b.group({ x, z, y: PAD_TOP + 0.12, ry: a }, () => b.plane(0.36, 0.24, { color: 0xd6e6f6, rx: -tilt, ...NP }));
    }
  }
  // molten salt tanks + turbine hall by the road
  tank(u, 0.32, 0.42, -0.95, 3.0, { band: C.red, dome: false });
  tank(u, 0.32, 0.42, -0.2, 3.25, { band: C.blue, dome: false });
  hall(u, 0.9, 0.5, 0.5, { x: 0.85, z: 3.05, ry: -0.15, shed: true });
  transformers(u, 1.65, 2.6, 2, { ry: -0.6 });
  pylon(u, 2.45, 2.05, 0.8, { ry: -0.6 });
  pipe(u, [[0, PAD_TOP + 0.05, 0.3], [0, PAD_TOP + 0.05, 2.7], [-0.2, PAD_TOP + 0.05, 2.95]], 0.04, C.steel, { detail: true });
});

/** Combustion plant: brick boiler house, turbine hall, banded twin stacks, coal yard and conveyor. Cheap & sooty. */
export const combustionPlant = factory((u) => {
  const { b } = u;
  pad(u, { color: shade(u.ground, 0.9) });
  const brick = u.sid === 'classic' ? 0x9a5a44 : shade(u.wall2, 0.85);
  const fuel = u.sid === 'solarpunk' || u.sid === 'organic' ? 0x6a5030 : C.coal;
  // turbine hall along the road, boiler house behind it with the furnace glowing through its doors
  hall(u, 1.5, 0.66, 0.72, { x: -0.55, z: 0.95, shed: true });
  door(u, 0.3, 0.3, -0.9, 1.315);
  hall(u, 1.1, 1.3, 0.9, { x: -0.35, z: -0.2, color: brick, roof: C.iron, vault: false, shed: true });
  b.box(0.34, 0.24, 0.02, { color: 0xff8a2a, mat: Mat.Lava, x: 0.215, y: PAD_TOP + 0.06, z: -0.2, ry: Math.PI / 2, ...NP });
  // precipitators, flue and the two banded stacks at the back
  b.box(0.7, 0.55, 0.5, { color: C.steel, x: -0.35, y: PAD_TOP, z: -1.05 });
  for (let k = 0; k < 3; k++) b.box(0.18, 0.12, 0.42, { color: shade(C.steel, 0.85), x: -0.57 + k * 0.22, y: PAD_TOP + 0.55, z: -1.05, ...DET });
  beam(u, [-0.05, PAD_TOP + 0.4, -1.05], [0.45, PAD_TOP + 0.4, -1.5], 0.16, 0.16, { color: C.steelDark });
  beam(u, [-0.65, PAD_TOP + 0.4, -1.05], [-1.05, PAD_TOP + 0.4, -1.45], 0.14, 0.14, { color: C.steelDark });
  stack(u, 0.2, 3.2, 0.5, -1.55, { smoke: C.smoke, puffs: 3 });
  stack(u, 0.17, 2.7, -1.1, -1.5, { smoke: shade(C.smoke, 1.1), puffs: 2 });
  // coal yard by the road: piles, stacker-reclaimer boom and the conveyor up into the boiler
  b.box(1.35, 0.03, 1.45, { color: shade(C.concreteDark, 0.75), x: 1.3, z: 0.45, y: PAD_TOP, ry: 0.2, ...NP });
  heap(u, 0.5, 0.42, 1.45, 0.85, fuel, { seg: 8 });
  heap(u, 0.42, 0.34, 1.05, 0.15, shade(fuel, 1.25));
  heap(u, 0.32, 0.24, 1.75, 0.05, shade(fuel, 1.1), { seg: 6 });
  b.box(0.12, 0.38, 0.12, { color: C.yellow, x: 0.75, z: 0.7, y: PAD_TOP });
  beam(u, [0.75, PAD_TOP + 0.38, 0.7], [1.75, PAD_TOP + 0.6, 0.5], 0.06, 0.06, { color: C.yellow });
  conveyor(u, [0.9, PAD_TOP + 0.08, -0.05], [0.2, PAD_TOP + 1.05, -0.3], { legs: 2 });
  truck(u, 1.95, 1.35, 0.6, { cargo: fuel, color: C.yellow });
  truck(u, 0.55, 1.6, -1.3, { cargo: fuel, color: C.yellow });
  // water tank, switchyard and the line out
  tank(u, 0.3, 0.55, 1.15, -1.0, { band: C.blue });
  tank(u, 0.22, 0.42, 1.7, -0.6, { band: C.blue });
  transformers(u, -1.75, 0.15, 2, { ry: 0.5 });
  pylon(u, -2.2, -0.55, 0.85, { ry: 0.5 });
  parking(u, -0.6, 1.85, 5, { gap: 0.11 });
  fence(u, 2.42);
  lamp(u, -1.4, 1.55);
  lamp(u, 0.3, 2.0);
});

/** Grid battery bank: liquid-cooled cells with status strips, inverter and transformer. */
export const batteryBank = factory((u) => {
  const { b } = u;
  pad(u);
  const cell = u.sid === 'cyber' ? 0x3a3f4e : C.white;
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 3; c++) {
      const x = -0.42 + c * 0.32, z = -0.42 + r * 0.42;
      b.box(0.26, 0.24, 0.3, { color: cell, x, z, y: PAD_TOP, top: shade(cell, 0.9) });
      glowBox(u, 0.2, 0.02, 0.005, x, PAD_TOP + 0.17, z + 0.152, r === 0 && c === 1 ? 0xffc040 : 0x4aff9a, { detail: true });
      b.box(0.18, 0.03, 0.2, { color: C.steel, x, z, y: PAD_TOP + 0.24, ...DET });
    }
  hall(u, 0.36, 0.24, 0.24, { x: 0.45, z: 0.42, gear: false, shed: true });
  transformers(u, -0.3, 0.45, 1);
  pipe(u, [[-0.62, PAD_TOP + 0.2, -0.42], [-0.62, PAD_TOP + 0.2, 0.0], [0.5, PAD_TOP + 0.2, 0.0]], 0.02, u.accent, { detail: true });
  lamp(u, 0.68, 0.0);
  fence(u, 0.9);
});

/** Geothermal plant over a vent: wellheads, separators, looping steam pipes, power house and fan cooling. */
export const geothermalPlant = factory((u) => {
  const { b } = u;
  pad(u, { color: mix(u.ground, 0x8a7a68, 0.25) });
  // the vent itself: glowing borehole and wellhead tree in the centre
  b.cyl(0.42, 0.46, 0.08, { color: C.concreteDark, y: PAD_TOP, seg: 10, ...NP });
  b.cyl(0.32, 0.32, 0.01, { color: 0xff6a1a, mat: Mat.Lava, y: PAD_TOP + 0.08, seg: 10, ...NP });
  b.cyl(0.09, 0.11, 0.42, { color: C.red, y: PAD_TOP + 0.08, seg: 8 });
  for (let k = 0; k < 3; k++) b.cyl(0.13, 0.13, 0.05, { color: C.steelDark, y: PAD_TOP + 0.16 + k * 0.1, seg: 8, ...DET });
  puffs(u, 0.05, PAD_TOP + 0.7, -0.05, 0.2, C.steam, 3);
  // two remote wellheads
  for (const [x, z] of [[-1.5, -1.0], [1.4, -1.25]] as [number, number][]) {
    b.cyl(0.18, 0.2, 0.05, { color: C.concreteDark, x, z, y: PAD_TOP, seg: 8, ...NP });
    b.cyl(0.06, 0.07, 0.3, { color: C.red, x, z, y: PAD_TOP + 0.05, seg: 6 });
    b.box(0.16, 0.05, 0.05, { color: C.steelDark, x, z, y: PAD_TOP + 0.28, ...DET });
  }
  // insulated steam lines with expansion loops (the silver signature of geothermal fields)
  const ly = PAD_TOP + 0.16;
  pipe(u, [[-1.5, ly, -1.0], [-1.0, ly, -1.0], [-1.0, ly, -1.45], [-0.75, ly, -1.45], [-0.75, ly, -0.6], [-0.35, ly, -0.6], [-0.35, ly, 0.35]], 0.045, 0xd8dde4);
  pipe(u, [[1.4, ly, -1.25], [0.95, ly, -1.25], [0.95, ly, -1.6], [0.65, ly, -1.6], [0.65, ly, -0.55], [0.3, ly, -0.55], [0.3, ly, 0.35]], 0.045, 0xd8dde4);
  // separators
  tank(u, 0.17, 0.62, -0.75, 0.55, { color: C.white, band: C.red });
  tank(u, 0.17, 0.62, 0.7, 0.5, { color: C.white, band: C.red });
  // power house
  hall(u, 1.2, 0.5, 0.55, { x: 0, z: 1.25, shed: true });
  door(u, 0.28, 0.24, -0.25, 1.53);
  shrub(u, 1.0, 1.8, 0.13);
  shrub(u, -1.05, 1.75, 0.11, { tall: true });
  shrub(u, -1.8, 1.2, 0.12);
  // mechanical-draft cooling tower block with fan stacks + steam
  b.box(0.9, 0.42, 0.42, { color: 0x8ea0a8, x: -1.55, z: 0.75, y: PAD_TOP, ry: 0.5, top: C.steelDark });
  for (let k = -1; k <= 1; k++) {
    const x = -1.55 + Math.cos(0.5) * k * 0.28, z = 0.75 - Math.sin(0.5) * k * 0.28;
    b.cyl(0.11, 0.12, 0.1, { color: C.steelDark, x, z, y: PAD_TOP + 0.42, seg: 8 });
    if (k !== 0) puffs(u, x, PAD_TOP + 0.65, z, 0.15, C.steam, 2);
  }
  transformers(u, 1.45, 0.95, 2, { ry: -0.5 });
  pylon(u, 2.0, 0.3, 0.85, { ry: -0.5 });
  lamp(u, 0.7, 1.95);
  lamp(u, -0.7, 1.95);
  fence(u, 2.42);
});

/** Tidal barrage across its own tidal basin: gate piers, bulb-turbine outflows, gantry crane and control house. */
export const tidalBarrage = factory((u) => {
  const { b } = u;
  pad(u);
  // the basin covers the back of the site; the barrage crosses it, sea side behind
  const wy = PAD_TOP + 0.004;
  b.box(4.6, 0.012, 2.3, { color: C.water, mat: Mat.Water, z: -1.18, y: wy, ...NP });
  b.box(4.7, 0.09, 0.12, { color: C.concreteDark, z: 0.0, y: PAD_TOP, ...NP });
  const dz = -0.95;
  b.box(4.5, 0.2, 0.42, { color: C.concrete, z: dz, y: PAD_TOP, top: shade(C.concrete, 0.95) });
  for (let i = 0; i < 6; i++) {
    const x = -1.9 + i * 0.76;
    b.box(0.2, 0.42, 0.62, { color: shade(C.concrete, 0.92), x, z: dz, y: PAD_TOP + 0.2, top: C.concrete });
    if (i < 5) {
      const gx = x + 0.38;
      b.box(0.54, 0.26, 0.05, { color: u.sid === 'cyber' ? u.accent : 0x3f7fb8, x: gx, z: dz + 0.18, y: PAD_TOP + 0.2, mat: Mat.Metal });
      b.box(0.54, 0.05, 0.42, { color: C.steelDark, x: gx, z: dz, y: PAD_TOP + 0.56, ...DET });
      // outflow wakes on both sides of each turbine bay
      b.box(0.44, 0.014, 0.5, { color: 0xd8f2ff, mat: Mat.Water, x: gx, z: dz - 0.5, y: wy + 0.004, ...NP });
      b.box(0.3, 0.014, 0.3, { color: 0xc8eaff, mat: Mat.Water, x: gx, z: dz + 0.45, y: wy + 0.004, ...NP, detail: true });
      b.cyl(0.12, 0.12, 0.3, { color: C.steelDark, rx: Math.PI / 2, x: gx, z: dz - 0.22, y: PAD_TOP + 0.1, seg: 8, ...DET });
    }
  }
  // turbine hall riding on the barrage
  hall(u, 2.4, 0.34, 0.36, { x: 0.3, z: dz, y: PAD_TOP + 0.62, shed: true, gear: false });
  // gantry crane on rails along the dam
  for (const s of [-1, 1]) b.box(0.06, 0.62, 0.06, { color: C.yellow, x: -1.35, z: dz + s * 0.27, y: PAD_TOP + 0.62 });
  b.box(0.12, 0.08, 0.66, { color: C.yellow, x: -1.35, z: dz, y: PAD_TOP + 1.24 });
  b.box(0.1, 0.1, 0.12, { color: C.white, x: -1.35, z: dz + 0.12, y: PAD_TOP + 1.12, ...DET });
  for (let i = 0; i < 5; i++) beacon(u, -1.52 + i * 0.76, PAD_TOP + 0.66, dz + 0.3, C.lamp, 0.035);
  // control house, switchyard, line out
  hall(u, 1.0, 0.45, 0.5, { x: -1.0, z: 1.15 });
  lobby(u, 0.4, 0.3, 0.12, -1.0, 1.45);
  transformers(u, 0.6, 0.85, 2);
  pylon(u, 1.55, 0.75, 0.85);
  lamp(u, 0.1, 1.85);
  greenRing(u, 2.2, 7, { skipFront: false, s: 0.11 });
});

/** Fungal worlds: giant bioluminescent mushrooms wired to a capacitor pod. Zero emissions, faintly humming. */
export const mycoGrove = factory((u) => {
  const { b } = u;
  pad(u, { color: 0x4a3a52, edge: 0x2e2434 });
  const caps = [0xd06ab0, 0x9a6ae0, 0x6ad0c0, 0xe08a6a];
  const spots: [number, number, number][] = [[-1.1, -0.9, 1.25], [0.9, -1.2, 1.0], [-0.2, -1.65, 0.75], [1.55, 0.05, 0.7], [-1.7, 0.25, 0.65], [0.15, -0.35, 0.55]];
  spots.forEach(([x, z, s], i) => {
    const col = caps[i % caps.length];
    b.lathe([[0.1 * s, 0], [0.075 * s, 0.7 * s], [0.09 * s, 1.25 * s]], { color: 0xf0e2d8, x, z, y: PAD_TOP, seg: 6 });
    // cap: glowing gills underneath, solid dome on top
    b.cyl(0.5 * s, 0.1 * s, 0.14 * s, { color: mix(col, 0xffffff, 0.3), mat: Mat.Glow, x, z, y: PAD_TOP + 1.12 * s, seg: 10, capTop: false, ...NP });
    b.dome(0.5 * s, { color: col, x, z, y: PAD_TOP + 1.26 * s, h: 0.32 * s, wSeg: 10, hSeg: 3 });
    for (let k = 0; k < 2; k++) {
      const a = k * 2.6 + i;
      b.sphere(0.06 * s, { color: 0xfff0f8, x: x + Math.sin(a) * 0.3 * s, z: z + Math.cos(a) * 0.3 * s, y: PAD_TOP + 1.42 * s, wSeg: 5, hSeg: 3, ...NP, detail: true });
    }
    // cable to the capacitor pod
    pipe(u, [[x, PAD_TOP + 0.03, z], [x * 0.5 + 0.45 * 0.5, PAD_TOP + 0.03, z * 0.5 + 1.1 * 0.5], [0.45, PAD_TOP + 0.1, 1.1]], 0.025, 0x6ad0c0, { mat: Mat.Glow, detail: true, seg: 4 });
  });
  // capacitor pod (organic dome) by the road
  b.dome(0.48, { color: 0xe6d0c0, x: 0.45, z: 1.1, y: PAD_TOP, h: 0.5, wSeg: 12, hSeg: 4 });
  b.cyl(0.49, 0.49, 0.05, { color: 0x7affd0, mat: Mat.Glow, x: 0.45, z: 1.1, y: PAD_TOP + 0.06, seg: 12, capTop: false, ...NP });
  b.box(0.22, 0.24, 0.12, { color: 0x5a3a4a, x: 0.45, z: 1.55, y: PAD_TOP });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    b.sphere(0.07, { color: 0x7affd0, mat: Mat.Glow, x: Math.sin(a) * 2.1, z: Math.cos(a) * 2.1 * 0.9, y: PAD_TOP + 0.04, wSeg: 5, hSeg: 3, ...NP, detail: true });
  }
});

// ═══════════════════════════════════════════════════════════════ nuclear & fusion

/** Fission plant: twin cooling towers, containment dome, turbine hall, vent stack, switchyard and a landscaped campus. */
export const fissionPlant = factory((u) => {
  const { b } = u;
  pad(u);
  // campus ground: access road, lawns
  patch(u, 0.5, 2.5, 0, 2.75, C.asphalt);
  patch(u, 5.6, 0.45, 0, 1.6, C.asphalt);
  patch(u, 1.3, 1.0, -2.55, 2.45, u.verge, { ry: -0.5 });
  patch(u, 1.1, 0.9, 2.55, 2.45, u.verge, { ry: 0.5 });
  coolingTower(u, 1.0, 2.7, -1.9, -1.85, { stripe: C.red, seg: 12 });
  coolingTower(u, 1.0, 2.7, 1.05, -2.55, { stripe: C.red, seg: 12 });
  // containment building
  const dome = u.sid === 'cyber' ? 0x4a4f5e : C.white;
  b.cyl(0.72, 0.72, 1.0, { color: dome, x: -1.05, z: 0.45, y: PAD_TOP, seg: 12, capTop: false });
  b.dome(0.72, { color: dome, x: -1.05, z: 0.45, y: PAD_TOP + 1.0, h: 0.62, wSeg: 12, hSeg: 4 });
  b.cyl(0.735, 0.735, 0.08, { color: u.accent, x: -1.05, z: 0.45, y: PAD_TOP + 0.82, seg: 12, capTop: false, ...DET });
  glowBox(u, 0.22, 0.06, 0.01, -1.05, PAD_TOP + 0.45, 1.17, 0x5ad8ff);
  // auxiliary building and turbine hall
  hall(u, 0.9, 0.6, 0.7, { x: 0.25, z: 0.3, color: u.wall2, shed: true });
  hall(u, 1.8, 0.78, 0.85, { x: 1.85, z: 0.45, shed: true });
  door(u, 0.34, 0.32, 1.3, 0.885);
  // vent stack with guy struts
  b.cyl(0.07, 0.09, 2.2, { color: C.offwhite, x: -0.2, z: -0.6, y: PAD_TOP, seg: 8 });
  b.cyl(0.075, 0.075, 0.1, { color: C.red, x: -0.2, z: -0.6, y: PAD_TOP + 1.9, seg: 8, ...DET });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    beam(u, [-0.2 + Math.sin(a) * 0.32, PAD_TOP, -0.6 + Math.cos(a) * 0.32], [-0.2, PAD_TOP + 1.5, -0.6], 0.025, 0.025, { color: C.steel });
  }
  beacon(u, -0.2, PAD_TOP + 2.24, -0.6);
  // spent-fuel pool building with a blue glow
  b.box(0.7, 0.32, 0.5, { color: u.wall, x: 0.75, z: -0.75, y: PAD_TOP, top: u.roof });
  b.box(0.5, 0.012, 0.3, { color: 0x3ad8ff, mat: Mat.Glow, x: 0.75, z: -0.75, y: PAD_TOP + 0.33, ...NP, detail: true });
  // switchyard & line
  transformers(u, 3.05, -0.5, 3, { ry: -1.0 });
  pylon(u, 3.45, 1.15, 1.0, { ry: -0.9 });
  // admin, parking and lawns by the gate
  hall(u, 0.85, 0.36, 0.45, { x: -1.4, z: 2.55 });
  parking(u, 1.05, 2.55, 5, { gap: 0.13 });
  for (const [x, z] of [[-2.8, 2.25], [-2.3, 2.75], [2.35, 2.2], [2.85, 2.6], [-3.3, 0.9]] as [number, number][]) shrub(u, x, z, 0.15, { tall: x < 0 });
  lamp(u, 0.45, 3.3);
  lamp(u, -0.45, 3.3);
});

/** Fusion tokamak: a ring of plasma caged by toroidal field coils over a cryostat, with beam injectors. */
export const fusionTokamak = factory((u) => {
  const { b } = u;
  pad(u, { inset: 0.62, insetColor: shade(u.ground, 0.82) });
  const cx = 0, cz = -0.35, y0 = PAD_TOP + 0.3;
  b.cyl(1.45, 1.55, 0.3, { color: u.sid === 'cyber' ? 0x3a3f4e : 0xb8c0cc, x: cx, z: cz, y: PAD_TOP, seg: 16, top: u.sid === 'cyber' ? 0x2a2e38 : 0x9aa4b2 });
  b.cyl(1.46, 1.46, 0.04, { color: u.accent, mat: Mat.Glow, x: cx, z: cz, y: PAD_TOP + 0.24, seg: 16, capTop: false, ...NP, detail: true });
  const R = 0.95, yc = y0 + 0.5;
  const plasma = u.sid === 'cyber' ? 0xff4ad8 : u.sid === 'organic' ? 0x7affd0 : 0xd07aff;
  b.torus(R, 0.24, { color: plasma, mat: Mat.Glow, x: cx, z: cz, y: yc, seg: 20, tube: 6, ...NP });
  // vacuum vessel ports & toroidal field coils
  const coil = u.sid === 'cyber' ? 0x4a505e : 0xe8ecf2;
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    b.group({ x: cx + Math.sin(a) * R, z: cz + Math.cos(a) * R, y: yc, ry: a + Math.PI / 2 }, () => {
      b.torus(0.36, 0.06, { color: coil, rx: Math.PI / 2, seg: 8, tube: 3 });
    });
    b.box(0.08, 0.2, 0.08, { color: C.iron, x: cx + Math.sin(a) * R, z: cz + Math.cos(a) * R, y: y0, ...DET });
  }
  // central solenoid
  b.cyl(0.26, 0.26, 1.15, { color: coil, x: cx, z: cz, y: y0, seg: 10 });
  b.cyl(0.27, 0.27, 0.06, { color: u.accent, mat: Mat.Glow, x: cx, z: cz, y: y0 + 0.7, seg: 10, capTop: false, ...NP });
  b.cyl(0.18, 0.18, 0.14, { color: C.iron, x: cx, z: cz, y: y0 + 1.15, seg: 8 });
  holoDisc(u, 0.34, cx, y0 + 1.75, cz, 0x7af0ff);
  // neutral beam injectors aimed at the plasma
  for (const s of [-1, 1]) {
    b.group({ x: cx + s * 1.95, z: cz + 0.55, y: PAD_TOP, ry: s * 0.9 }, () => {
      b.box(0.36, 0.34, 0.7, { color: C.white, top: C.steel });
      b.cyl(0.08, 0.08, 0.6, { color: C.steelDark, rx: Math.PI / 2, y: 0.2, z: -0.35, seg: 8, ...DET });
      glowBox(u, 0.3, 0.03, 0.01, 0, 0.26, 0.355, u.accent, { detail: true });
    });
  }
  // control & cryo plant by the road
  hall(u, 1.3, 0.42, 0.5, { x: -0.6, z: 1.7 });
  tank(u, 0.2, 0.55, 1.2, 1.55, { color: C.white, band: 0x5ad8ff });
  tank(u, 0.16, 0.45, 1.65, 1.2, { color: C.white, band: 0x5ad8ff });
  pylon(u, 2.2, 0.15, 0.9, { ry: -0.5 });
  lamp(u, 0.35, 2.15);
  beacon(u, cx, y0 + 1.32, cz);
});

/** Machine worlds: a shaft bored to the planet's core, ringed by heavy frames and glowing conduits. */
export const coreTap = factory((u) => {
  const { b } = u;
  pad(u, { color: 0x2c3038, edge: 0x16181e });
  const cyan = 0x3affea;
  // shaft: octagonal collar, molten core visible far below
  b.prism(8, 1.0, 0.35, { color: 0x3a3f4a, y: PAD_TOP, ry: Math.PI / 8, mat: Mat.Metal, top: 0x23262e });
  b.prism(8, 0.72, 0.36, { color: 0x14161a, y: PAD_TOP, ry: Math.PI / 8 });
  b.cyl(0.6, 0.6, 0.01, { color: 0xffa020, mat: Mat.Lava, y: PAD_TOP + 0.37, seg: 8, ...NP });
  b.torus(0.86, 0.04, { color: cyan, mat: Mat.Glow, y: PAD_TOP + 0.36, seg: 16, tube: 3, ...NP });
  // heavy A-frame gantry with the drill string
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    beam(u, [Math.sin(a) * 1.15, PAD_TOP, Math.cos(a) * 1.15], [Math.sin(a) * 0.25, PAD_TOP + 2.0, Math.cos(a) * 0.25], 0.12, 0.12, { color: 0x4a505c, mat: Mat.Metal });
  }
  b.box(0.6, 0.3, 0.6, { color: 0x3a3f4a, y: PAD_TOP + 1.95, mat: Mat.Metal });
  glowBox(u, 0.62, 0.04, 0.62, 0, PAD_TOP + 2.08, 0, cyan);
  b.cyl(0.1, 0.1, 1.7, { color: 0x6a707c, y: PAD_TOP + 0.3, seg: 8, mat: Mat.Metal });
  beacon(u, 0, PAD_TOP + 2.3, 0, cyan);
  // four conduits running out to converter blocks
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const ex = Math.sin(a) * 1.9, ez = Math.cos(a) * 1.9;
    pipe(u, [[Math.sin(a) * 0.95, PAD_TOP + 0.2, Math.cos(a) * 0.95], [ex, PAD_TOP + 0.2, ez]], 0.09, 0x4a505c);
    b.box(0.07, 0.03, 0.9, { color: cyan, mat: Mat.Glow, x: Math.sin(a) * 1.42, z: Math.cos(a) * 1.42, y: PAD_TOP + 0.28, ry: a, ...NP, detail: true });
    b.group({ x: ex, z: ez, ry: a }, () => {
      b.box(0.55, 0.5, 0.4, { color: 0x3a3f4a, y: PAD_TOP, top: 0x23262e, mat: Mat.Metal });
      glowBox(u, 0.45, 0.04, 0.01, 0, PAD_TOP + 0.38, 0.205, cyan, { detail: true });
      for (const s of [-1, 1]) b.box(0.06, 0.18, 0.06, { color: 0x6a707c, x: s * 0.18, y: PAD_TOP + 0.5, ...DET });
    });
  }
});

/** Orbital solar receiver: a rectenna field catching a microwave beam from an orbital collector. */
export const orbitalReceiver = factory((u) => {
  const { b } = u;
  pad(u, { color: mix(u.ground, C.leaf, 0.3) });
  // rectenna: rings of low mesh panels around the receiver
  for (const [r, n] of [[1.05, 14], [1.45, 19], [1.85, 24], [2.22, 28]] as [number, number][]) {
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (z > 1.2 && Math.abs(x) < 0.9) continue;
      b.group({ x, z, y: PAD_TOP + 0.06, ry: a }, () => b.plane(0.3, 0.22, { color: 0x8c9aac, rx: 0.42, ...NP }));
    }
  }
  // receiver dish facing straight up, the beam coming down into it
  b.cyl(0.18, 0.3, 0.55, { color: C.white, y: PAD_TOP, seg: 10 });
  dish(u, 0.75, 0, PAD_TOP + 0.55, 0, { tilt: 0, seg: 16, feed: false });
  b.cyl(0.07, 0.07, 0.5, { color: C.steelDark, y: PAD_TOP + 0.6, seg: 6 });
  b.sphere(0.12, { color: 0xbff8ff, mat: Mat.Glow, y: PAD_TOP + 1.12, wSeg: 8, hSeg: 6, ...NP });
  b.cyl(0.05, 0.11, 9.0, { color: 0x9ff4ff, mat: Mat.Glow, y: PAD_TOP + 1.2, seg: 8, capTop: false, ...NP });
  b.cyl(0.02, 0.05, 9.0, { color: 0xffffff, mat: Mat.Glow, y: PAD_TOP + 1.2, seg: 6, capTop: false, ...NP, detail: true });
  for (let k = 0; k < 3; k++) b.torus(0.2 + k * 0.05, 0.015, { color: 0xbff8ff, mat: Mat.Glow, y: PAD_TOP + 1.7 + k * 0.9, seg: 12, tube: 3, ...NP, detail: true });
  hall(u, 0.9, 0.36, 0.45, { x: 0, z: 1.85 });
  transformers(u, 1.3, 1.45, 2, { ry: -0.5 });
  pylon(u, -1.55, 1.55, 0.85, { ry: 0.6 });
});

// ═══════════════════════════════════════════════════════════════ exotic

/** Antimatter reactor: a Penning-trap sphere hung in a gimbal between four magnetic pylons, behind blast walls. */
export const antimatterReactor = factory((u) => {
  const { b } = u;
  pad(u, { color: 0x50545e, edge: 0x2a2d35, verge: 0x3a3e48 });
  const mag = 0xff3a8a, cy = 0x5ae8ff;
  const yc = PAD_TOP + 1.25;
  // hazard ring & stepped dais
  b.prism(6, 1.55, 0.14, { color: 0x5a5e6a, y: PAD_TOP, top: 0x3a3e48 });
  b.prism(6, 1.1, 0.12, { color: 0x6a6e7a, y: PAD_TOP + 0.14, top: 0x454a56 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    b.box(0.5, 0.012, 0.08, { color: k % 2 ? C.yellow : 0x1a1a1a, x: Math.sin(a) * 1.32, z: Math.cos(a) * 1.32, y: PAD_TOP + 0.14, ry: a + Math.PI / 2, ...NP, detail: true });
  }
  // containment sphere with glowing seams
  b.sphere(0.48, { color: 0x2a2d35, mat: Mat.Metal, y: yc, wSeg: 14, hSeg: 9 });
  b.torus(0.49, 0.03, { color: mag, mat: Mat.Glow, y: yc, seg: 20, tube: 3, ...NP });
  b.torus(0.4, 0.025, { color: mag, mat: Mat.Glow, y: yc + 0.28, seg: 16, tube: 3, ...NP, detail: true });
  b.torus(0.4, 0.025, { color: mag, mat: Mat.Glow, y: yc - 0.28, seg: 16, tube: 3, ...NP, detail: true });
  // gimbal rings
  b.torus(0.72, 0.045, { color: 0x8a90a0, mat: Mat.Metal, y: yc, rx: Math.PI / 2, seg: 20, tube: 4 });
  b.torus(0.82, 0.045, { color: 0x8a90a0, mat: Mat.Metal, y: yc, rz: Math.PI / 2, ry: 0.6, seg: 20, tube: 4 });
  // magnetic pylons with plasma tips and arcs to the sphere
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.sin(a) * 1.35, z = Math.cos(a) * 1.35 - 0.1;
    b.prism(4, 0.17, 1.65, { color: 0x3a3e48, x, z, y: PAD_TOP, ry: a, mat: Mat.Metal });
    b.cone(0.13, 0.35, { color: 0x3a3e48, x, z, y: PAD_TOP + 1.65, seg: 4, ry: a + Math.PI / 4 });
    b.sphere(0.09, { color: cy, mat: Mat.Glow, x, z, y: PAD_TOP + 2.05, wSeg: 6, hSeg: 4, ...NP });
    beam(u, [x * 0.92, PAD_TOP + 1.95, z * 0.92], [x * 0.22, yc + 0.12, z * 0.22], 0.025, 0.025, { color: cy, mat: Mat.Glow, ...NP, detail: true });
    glowBox(u, 0.04, 1.2, 0.04, x * 1.12, PAD_TOP + 0.3, z * 1.12, mag, { detail: true });
  }
  // blast walls & control bunker
  for (const s of [-1, 1]) b.box(0.9, 0.35, 0.16, { color: 0x8a8e98, x: s * 1.05, z: -1.75, ry: -s * 0.52, y: PAD_TOP, top: 0x6a6e7a });
  b.box(1.2, 0.4, 0.55, { color: 0x5a5e6a, z: 1.75, y: PAD_TOP, top: 0x3a3e48 });
  glowBox(u, 1.0, 0.05, 0.01, 0, PAD_TOP + 0.28, 2.03, cy);
  holoDisc(u, 0.22, 0, PAD_TOP + 0.75, 1.9, mag);
  beacon(u, 0, yc + 0.55, 0, mag);
});

/** Zero-point tap: a levitating crystal heart inside counter-tilted rings above an obsidian ziggurat. */
export const zeroPointTap = factory((u) => {
  const { b } = u;
  pad(u, { color: 0x1e2028, edge: 0x101116 });
  const glow = 0xb0fff0, ring = 0x9ad8ff;
  // obsidian steps with light inlays
  for (let i = 0; i < 3; i++) {
    const r = 2.1 - i * 0.55;
    b.prism(6, r, 0.16, { color: 0x24262e, y: PAD_TOP + i * 0.16, top: 0x2c2f38, mat: Mat.Metal });
    b.torus(r * 0.96, 0.018, { color: glow, mat: Mat.Glow, y: PAD_TOP + i * 0.16 + 0.17, seg: 6, tube: 3, ...NP, detail: true });
  }
  const yc = PAD_TOP + 1.75;
  // crystal heart (octahedron) + inner core
  b.sphere(0.42, { color: glow, mat: Mat.Holo, y: yc, wSeg: 4, hSeg: 2, flat: true, sy: 1.45, ...NP });
  b.sphere(0.2, { color: 0xffffff, mat: Mat.Glow, y: yc, wSeg: 6, hSeg: 4, ...NP });
  // three tilted levitation rings
  b.torus(0.9, 0.035, { color: ring, mat: Mat.Glow, y: yc, rx: 0.35, seg: 24, tube: 3, ...NP });
  b.torus(1.1, 0.03, { color: ring, mat: Mat.Glow, y: yc, rz: 0.55, ry: 0.8, seg: 24, tube: 3, ...NP });
  b.torus(1.3, 0.05, { color: 0x2c2f38, mat: Mat.Metal, y: yc - 0.25, rx: -0.12, seg: 24, tube: 4 });
  // emitter obelisks with energy threads to the heart
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    const x = Math.sin(a) * 1.85, z = Math.cos(a) * 1.85;
    b.prism(3, 0.14, 1.3, { color: 0x24262e, x, z, y: PAD_TOP, ry: a, mat: Mat.Metal });
    b.cone(0.12, 0.3, { color: glow, mat: Mat.Glow, x, z, y: PAD_TOP + 1.3, seg: 3, ry: a, ...NP });
    beam(u, [x, PAD_TOP + 1.5, z], [x * 0.12, yc, z * 0.12], 0.02, 0.02, { color: glow, mat: Mat.Glow, ...NP, detail: true });
  }
  b.box(0.8, 0.3, 0.35, { color: 0x24262e, z: 2.0, y: PAD_TOP, top: 0x2c2f38, mat: Mat.Metal });
  glowBox(u, 0.6, 0.03, 0.01, 0, PAD_TOP + 0.2, 2.18, glow);
});

/** Dyson beam receiver: a vast upturned bowl catching a golden beam from the swarm around the sun. */
export const dysonReceiver = factory((u) => {
  const { b } = u;
  pad(u, { color: 0xd8d2c4, edge: 0x9a907e });
  const gold = 0xffc84a;
  const yb = PAD_TOP + 1.25;
  // tripod-ring support
  b.cyl(1.1, 1.5, 0.3, { color: 0xe8e4da, y: PAD_TOP, seg: 16 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    beam(u, [Math.sin(a) * 1.45, PAD_TOP + 0.2, Math.cos(a) * 1.45], [Math.sin(a) * 1.9, yb + 0.3, Math.cos(a) * 1.9], 0.14, 0.14, { color: 0xe8e4da });
  }
  // the bowl (white outside, gold mirror inside)
  b.lathe([[0.3, 0], [1.6, 0.32], [2.75, 0.95], [2.9, 1.05]], { color: 0xf2efe8, y: yb, seg: 22 });
  b.lathe([[2.82, 1.06], [2.7, 0.98], [1.55, 0.37], [0.3, 0.06]], { color: 0xf4c86a, y: yb, seg: 22, ...NP });
  b.cyl(0.32, 0.32, 0.07, { color: 0xfff2c0, mat: Mat.Glow, y: yb, seg: 10, ...NP });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    beam(u, [Math.sin(a) * 0.4, yb + 0.12, Math.cos(a) * 0.4], [Math.sin(a) * 2.65, yb + 1.0, Math.cos(a) * 2.65], 0.05, 0.02, { color: 0xffe08a, mat: Mat.Glow, ...NP, detail: true });
  }
  b.torus(2.86, 0.05, { color: gold, mat: Mat.Glow, y: yb + 1.05, seg: 26, tube: 3, ...NP });
  // focal collector and the beam from the sky
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    beam(u, [Math.sin(a) * 2.6, yb + 1.0, Math.cos(a) * 2.6], [0, yb + 2.4, 0], 0.06, 0.06, { color: 0xe8e4da, mat: Mat.Metal });
  }
  b.sphere(0.32, { color: 0xfff2c0, mat: Mat.Glow, y: yb + 2.45, wSeg: 10, hSeg: 6, ...NP });
  b.cyl(0.14, 0.32, 22, { color: gold, mat: Mat.Glow, y: yb + 2.6, seg: 10, capTop: false, ...NP });
  b.cyl(0.06, 0.12, 22, { color: 0xfffbe8, mat: Mat.Glow, y: yb + 2.6, seg: 6, capTop: false, ...NP, detail: true });
  for (let k = 0; k < 3; k++) b.torus(0.42 - k * 0.05, 0.025, { color: gold, mat: Mat.Glow, y: yb + 3.4 + k * 2.2, seg: 10, tube: 3, ...NP, detail: true });
  // converter towers ringing the site
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.sin(a) * 3.55, z = Math.cos(a) * 3.55;
    if (z > 3) continue;
    b.cyl(0.24, 0.32, 1.1, { color: 0xf2efe8, x, z, y: PAD_TOP, seg: 6, capTop: false });
    b.cyl(0.2, 0.2, 0.18, { color: gold, mat: Mat.Glow, x, z, y: PAD_TOP + 1.1, seg: 6, capTop: false, ...NP });
    b.cone(0.24, 0.25, { color: 0xf2efe8, x, z, y: PAD_TOP + 1.28, seg: 6 });
    pipe(u, [[x * 0.8, PAD_TOP + 0.1, z * 0.8], [x * 0.47, PAD_TOP + 0.1, z * 0.47]], 0.06, gold, { mat: Mat.Glow, detail: true });
  }
  hall(u, 1.6, 0.42, 0.6, { x: 0, z: 3.55, color: 0xf2efe8, roof: 0xd8d2c4 });
  glowBox(u, 1.3, 0.04, 0.01, 0, PAD_TOP + 0.32, 3.86, gold);
  lamp(u, -1.2, 3.9);
  lamp(u, 1.2, 3.9);
});
