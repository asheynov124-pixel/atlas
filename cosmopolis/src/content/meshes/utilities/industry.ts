/**
 * utilities · resource extractors & special industry meshes (OWNER: utilities).
 *
 *   ore mine · crystal resonator · glacier ice harvester · gas extractor · geothermal heat tap · lava forge
 *   · deep-sea drill · helium-3 regolith miner · spore harvester · ruins excavation · lumber mill · refinery
 *   · foundry · nanofabricator · vertical farm · shipyard
 *
 * Each extractor wears its resource: rust-orange ore heaps, violet crystal clusters, cyan ice blocks, a gas flare,
 * steaming vents, rivers of lava, pale regolith and pink spore sacs — so a planet's industry tells you what the
 * planet is made of. The deep-sea drill stands on legs that reach 2.4 units below its origin, so it reads right
 * whatever the sea depth.
 */
import { Mat, mix, shade } from '../../kit';
import {
  C, DET, NP, PAD_TOP, arch, beacon, beam, container, conveyor, disc, factory, fence, glowBox, greenRing, hall, heap, holoDisc,
  lamp, lattice, lobby, pad, parking, pipe, pipeRack, puffs, shrub, stack, stripe, tank, truck, vessel, type U,
} from './common';

const RUST = 0xa85a36;

/** Mine headframe: two splayed legs + back stay, sheave wheels on top. */
function headframe(u: U, x: number, z: number, h: number, o: { color?: number; ry?: number } = {}): void {
  const { b } = u;
  const col = o.color ?? C.red;
  b.group({ x, z, y: PAD_TOP, ry: o.ry ?? 0 }, () => {
    for (const s of [-1, 1]) {
      beam(u, [s * 0.22, 0, 0.18], [s * 0.1, h, 0], 0.05, 0.05, { color: col });
      beam(u, [s * 0.18, 0, -0.55], [s * 0.1, h * 0.92, 0], 0.045, 0.045, { color: col });
    }
    b.box(0.3, 0.06, 0.14, { color: col, y: h - 0.02 });
    for (const s of [-1, 1]) b.torus(0.12, 0.018, { color: C.iron, x: s * 0.07, y: h + 0.1, rz: Math.PI / 2, seg: 10, tube: 3 });
    b.cyl(0.012, 0.012, h, { color: C.iron, z: 0.05, seg: 3, capTop: false, ...DET });
  });
  beacon(u, x, PAD_TOP + h + 0.24, z);
}

/** Bucket-wheel excavator (giant mining crawler). */
function bucketWheel(u: U, x: number, z: number, ry: number, o: { color?: number } = {}): void {
  const { b } = u;
  const col = o.color ?? C.yellow;
  b.group({ x, z, y: PAD_TOP, ry }, () => {
    for (const s of [-1, 1]) b.box(0.18, 0.12, 0.7, { color: C.iron, x: s * 0.2 });
    b.box(0.5, 0.28, 0.5, { color: col, y: 0.12 });
    b.box(0.3, 0.2, 0.3, { color: shade(col, 0.9), y: 0.4, z: -0.05 });
    beam(u, [0, 0.35, 0.1], [0, 0.6, 1.0], 0.1, 0.1, { color: col });
    beam(u, [0, 0.55, -0.1], [0, 0.45, -0.75], 0.08, 0.08, { color: col });
    b.box(0.2, 0.12, 0.2, { color: C.iron, y: 0.4, z: -0.82 });
    b.group({ y: 0.62, z: 1.05 }, () => {
      b.torus(0.3, 0.04, { color: col, rz: Math.PI / 2, seg: 12, tube: 3 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        b.box(0.06, 0.08, 0.1, { color: C.iron, y: Math.cos(a) * 0.3 - 0.04, z: Math.sin(a) * 0.3, rx: -a, ...DET });
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════ extraction

/** Ore mine: terraced open pit, headframe over the shaft, winding house, ore heaps and conveyor. */
export const oreMine = factory((u) => {
  const { b } = u;
  pad(u, { color: mix(u.ground, 0x9a7a5a, 0.4) });
  const ore = u.sid === 'crystal' ? 0x9a7ae0 : RUST;
  // open pit (back left)
  const prof: [number, number][] = [[1.25, 0], [1.12, 0.3], [0.98, 0.3], [0.95, 0.21], [0.78, 0.21], [0.75, 0.12], [0.56, 0.12], [0.53, 0.02], [0.32, 0.02]];
  b.lathe(prof, { color: mix(0x8a6a4a, ore, 0.35), x: -0.75, z: -0.75, y: PAD_TOP, seg: 10, flat: true, ...NP });
  b.cyl(0.33, 0.33, 0.01, { color: shade(ore, 0.7), x: -0.75, z: -0.75, y: PAD_TOP + 0.015, seg: 10, ...NP });
  truck(u, -0.75, -0.6, 1.2, { cargo: ore, y: PAD_TOP + 0.02 });
  // headframe + winding house
  headframe(u, 1.0, -0.65, 1.6, { color: u.sid === 'cyber' ? u.accent : C.red });
  hall(u, 0.7, 0.45, 0.5, { x: 1.0, z: -1.6, shed: true, gear: false });
  pipe(u, [[1.0, PAD_TOP + 1.7, -0.6], [1.0, PAD_TOP + 0.4, -1.4]], 0.01, C.iron, { detail: true, seg: 3 });
  // ore processing + heaps
  hall(u, 1.0, 0.6, 0.6, { x: 0.65, z: 0.55, shed: true, color: shade(u.wall2, 0.9) });
  conveyor(u, [1.0, PAD_TOP + 0.1, -0.4], [0.8, PAD_TOP + 0.55, 0.3], { legs: 1 });
  conveyor(u, [0.2, PAD_TOP + 0.5, 0.55], [-0.55, PAD_TOP + 0.1, 0.9], { legs: 1 });
  heap(u, 0.45, 0.4, -0.75, 0.95, ore, { seg: 7 });
  heap(u, 0.3, 0.25, -1.35, 0.4, shade(ore, 1.2), { seg: 6 });
  heap(u, 0.25, 0.2, 1.65, 0.45, 0x7a7a7a, { seg: 6 });
  truck(u, -0.05, 1.55, 0.3, { cargo: ore });
  b.box(0.5, 0.03, 0.2, { color: C.steelDark, x: 0.85, z: 1.5, y: PAD_TOP, ...NP });
  fence(u, 2.42);
  lamp(u, 1.7, 1.2);
  lamp(u, -1.6, 1.4);
});

/** Crystal resonator: a singing crystal cluster held in a tuning ring, humming out research and riches. */
export const crystalResonator = factory((u) => {
  const { b } = u;
  pad(u, { color: 0xc8c0e0, edge: 0x8a7ab8 });
  const cols = [0xc89aff, 0x9affff, 0xff9ae6, 0xb0a0ff];
  const shards: [number, number, number, number, number][] = [
    [0, 0, 0.17, 0.95, 0], [0.18, 0.12, 0.1, 0.6, 0.35], [-0.16, 0.1, 0.12, 0.7, -0.3], [0.05, -0.2, 0.1, 0.55, -0.25], [-0.12, -0.18, 0.07, 0.4, 0.4], [0.22, -0.1, 0.06, 0.35, 0.5],
  ];
  shards.forEach(([x, z, r, h, tilt], i) => {
    b.cyl(r * 0.25, r, h, { color: cols[i % cols.length], mat: Mat.Glow, x, z, y: PAD_TOP, seg: i % 2 ? 5 : 6, flat: true, rz: tilt, rx: tilt * 0.5, ...NP });
  });
  // tuning ring and forks
  b.torus(0.58, 0.035, { color: C.white, y: PAD_TOP + 0.55, rx: Math.PI / 2, seg: 18, tube: 4 });
  for (const s of [-1, 1]) {
    b.box(0.05, 0.55, 0.05, { color: C.white, x: s * 0.6, y: PAD_TOP });
    b.box(0.04, 0.24, 0.12, { color: 0xd8dce4, x: s * 0.6, y: PAD_TOP + 0.8, ...DET });
    glowBox(u, 0.03, 0.03, 0.03, s * 0.6, PAD_TOP + 1.06, 0, 0x9affff);
  }
  b.box(0.3, 0.18, 0.2, { color: 0xe8e4f4, x: 0.45, z: 0.55, y: PAD_TOP, top: 0xb0a0d8 });
  glowBox(u, 0.2, 0.02, 0.01, 0.45, PAD_TOP + 0.12, 0.655, 0xc89aff, { detail: true });
});

/** Glacier ice harvester: cut terraces of ice, a gantry saw, stacked blocks and a refrigerated warehouse. */
export const glacierHarvester = factory((u) => {
  const { b } = u;
  pad(u, { color: 0xe6f0f8, edge: 0x9ab8d0, verge: 0xf4f8fc });
  const ice = 0xa8e2f8, ice2 = 0xd6f2ff;
  // cut ice face: stepped blocks
  for (let k = 0; k < 3; k++) b.box(2.4 - k * 0.5, 0.22, 0.6, { color: k % 2 ? ice : ice2, x: -0.35, z: -1.45 + k * 0.32, y: PAD_TOP + (2 - k) * 0.22, top: 0xf2fbff, ...NP });
  b.box(2.4, 0.66, 0.3, { color: ice, x: -0.35, z: -1.85, y: PAD_TOP, top: 0xf2fbff, ...NP });
  // gantry saw spanning the face
  for (const s of [-1, 1]) b.box(0.07, 0.95, 0.07, { color: C.yellow, x: -0.35 + s * 1.3, z: -1.2, y: PAD_TOP });
  b.box(2.75, 0.09, 0.12, { color: C.yellow, x: -0.35, z: -1.2, y: PAD_TOP + 0.95 });
  b.box(0.16, 0.14, 0.16, { color: C.white, x: 0.15, z: -1.2, y: PAD_TOP + 0.82 });
  b.cyl(0.13, 0.13, 0.015, { color: C.steel, x: 0.15, z: -1.12, y: PAD_TOP + 0.72, rx: Math.PI / 2, seg: 10, ...DET });
  // block stacks waiting for the trucks
  for (let i = 0; i < 6; i++) {
    const x = 0.95 + (i % 3) * 0.3, z = -0.15 + Math.floor(i / 3) * 0.32;
    for (let h = 0; h < 2 - (i % 2); h++) b.box(0.24, 0.18, 0.24, { color: h % 2 ? ice2 : ice, x, z, y: PAD_TOP + h * 0.18, ...NP });
  }
  // refrigerated warehouse + snowcat
  hall(u, 1.3, 0.5, 0.6, { x: -0.7, z: 0.9, color: 0xf4f8fc, roof: 0x9ab8d0, shed: true, vault: false });
  for (let k = 0; k < 3; k++) b.box(0.12, 0.08, 0.08, { color: C.steel, x: -1.1 + k * 0.35, z: 0.9, y: PAD_TOP + 0.5, ...DET });
  truck(u, 0.75, 1.15, 0.4, { color: C.red, cargo: ice });
  truck(u, 1.45, 0.75, -0.9, { color: C.orange, cargo: C.white });
  lamp(u, 0.3, 1.8);
  lamp(u, -1.7, 0.3);
});

/** Gas extractor: wellhead on a vent, flare stack, Horton spheres and a compressor. */
export const gasExtractor = factory((u) => {
  const { b } = u;
  pad(u);
  // wellhead
  b.cyl(0.12, 0.14, 0.06, { color: C.concreteDark, x: -0.25, z: -0.35, y: PAD_TOP, seg: 8, ...NP });
  for (let k = 0; k < 3; k++) b.cyl(0.06 - k * 0.008, 0.06 - k * 0.008, 0.1, { color: k % 2 ? C.yellow : C.red, x: -0.25, z: -0.35, y: PAD_TOP + 0.06 + k * 0.1, seg: 6 });
  b.box(0.22, 0.04, 0.04, { color: C.steelDark, x: -0.25, z: -0.35, y: PAD_TOP + 0.22, ...DET });
  // spheres on legs
  for (const [x, z, r] of [[0.32, -0.3, 0.22], [0.42, 0.22, 0.17]] as [number, number, number][]) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      b.box(0.025, r + 0.06, 0.025, { color: C.steelDark, x: x + Math.sin(a) * r * 0.7, z: z + Math.cos(a) * r * 0.7, y: PAD_TOP, ...DET });
    }
    b.sphere(r, { color: C.white, x, z, y: PAD_TOP + r + 0.06, wSeg: 10, hSeg: 6 });
    b.cyl(r + 0.004, r + 0.004, 0.03, { color: u.accent, x, z, y: PAD_TOP + r + 0.05, seg: 10, capTop: false, ...DET });
  }
  // flare stack
  b.cyl(0.03, 0.045, 1.25, { color: C.steelDark, x: -0.55, z: 0.25, y: PAD_TOP, seg: 6 });
  b.cone(0.07, 0.24, { color: 0xffa040, mat: Mat.Lava, x: -0.55, z: 0.25, y: PAD_TOP + 1.25, seg: 6, ...NP });
  beacon(u, -0.52, PAD_TOP + 1.2, 0.25);
  // compressor + pipes
  b.box(0.3, 0.2, 0.22, { color: C.blue, x: -0.15, z: 0.45, y: PAD_TOP, top: C.steelDark });
  pipe(u, [[-0.25, PAD_TOP + 0.12, -0.28], [-0.25, PAD_TOP + 0.12, 0.35]], 0.025, C.yellow, { detail: true });
  pipe(u, [[-0.0, PAD_TOP + 0.08, 0.45], [0.32, PAD_TOP + 0.08, 0.22]], 0.025, C.yellow, { detail: true });
});

/** Geothermal heat tap: a finned steam dome over a vent feeding insulated mains and a heated greenhouse. */
export const heatTap = factory((u) => {
  const { b } = u;
  pad(u, { color: mix(u.ground, 0x8a7a68, 0.3) });
  b.cyl(0.3, 0.34, 0.06, { color: C.concreteDark, y: PAD_TOP, seg: 10, ...NP });
  b.cyl(0.24, 0.24, 0.01, { color: 0xff6a1a, mat: Mat.Lava, y: PAD_TOP + 0.06, seg: 10, ...NP });
  b.cyl(0.18, 0.2, 0.3, { color: C.copper, y: PAD_TOP + 0.04, seg: 10 });
  b.dome(0.2, { color: C.copper, y: PAD_TOP + 0.34, h: 0.14, wSeg: 10, hSeg: 2 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.box(0.015, 0.22, 0.12, { color: shade(C.copper, 0.8), x: Math.sin(a) * 0.22, z: Math.cos(a) * 0.22, y: PAD_TOP + 0.08, ry: a, ...DET });
  }
  b.cyl(0.03, 0.03, 0.25, { color: C.steelDark, y: PAD_TOP + 0.46, seg: 5 });
  puffs(u, 0.03, PAD_TOP + 0.8, 0, 0.11, C.steam, 3);
  pipe(u, [[0.15, PAD_TOP + 0.12, 0.15], [0.45, PAD_TOP + 0.12, 0.15], [0.45, PAD_TOP + 0.12, 0.5]], 0.04, 0xd8dde4);
  pipe(u, [[-0.15, PAD_TOP + 0.12, -0.15], [-0.55, PAD_TOP + 0.12, -0.15]], 0.04, 0xd8dde4);
  // heated greenhouse
  b.box(0.42, 0.22, 0.3, { color: 0x9ad8e8, mat: Mat.Glass, x: -0.35, z: 0.42, y: PAD_TOP, top: 0xbfe8f4, ...NP });
  b.gable(0.42, 0.12, 0.3, { color: 0xbfe8f4, x: -0.35, z: 0.42, y: PAD_TOP + 0.22, ...NP });
  shrub(u, -0.45, 0.42, 0.06, { color: 0x5aa04a });
});

/** Volcanic worlds: lava is channelled into crucibles in a basalt forge hall; glowing ingots stack outside. */
export const lavaForge = factory((u) => {
  const { b } = u;
  pad(u, { color: 0x3a302c, edge: 0x221a18, verge: 0x2c2420 });
  const basalt = 0x4a3e38;
  // lava channel snaking in from the back
  b.box(0.36, 0.06, 1.6, { color: basalt, x: -1.25, z: -1.3, y: PAD_TOP, ry: 0.5, ...NP });
  b.box(0.26, 0.01, 1.6, { color: 0xff6a1a, mat: Mat.Lava, x: -1.25, z: -1.3, y: PAD_TOP + 0.06, ry: 0.5, ...NP });
  b.box(0.36, 0.06, 1.0, { color: basalt, x: -0.55, z: -0.75, y: PAD_TOP, ry: 1.3, ...NP });
  b.box(0.26, 0.01, 1.0, { color: 0xff6a1a, mat: Mat.Lava, x: -0.55, z: -0.75, y: PAD_TOP + 0.06, ry: 1.3, ...NP });
  // forge hall with glowing openings and roof vents
  b.box(1.9, 0.95, 1.0, { color: basalt, x: 0.35, z: -0.45, y: PAD_TOP, top: 0x2c2420 });
  for (let k = 0; k < 4; k++) b.box(0.28, 0.32, 0.02, { color: 0xff8a2a, mat: Mat.Lava, x: -0.3 + k * 0.45, z: 0.06, y: PAD_TOP + 0.08, ...NP });
  for (let k = 0; k < 3; k++) {
    b.cyl(0.11, 0.14, 0.45, { color: 0x3a302c, x: -0.15 + k * 0.55, z: -0.55, y: PAD_TOP + 0.95, seg: 8 });
    b.cyl(0.08, 0.08, 0.01, { color: 0xffa040, mat: Mat.Lava, x: -0.15 + k * 0.55, z: -0.55, y: PAD_TOP + 1.4, seg: 8, ...NP });
  }
  puffs(u, 0.4, PAD_TOP + 1.7, -0.55, 0.22, 0x8a8078, 3);
  // ladle crane gantry & crucible pouring
  for (const s of [-1, 1]) b.box(0.08, 0.9, 0.08, { color: 0x3a3e48, x: 1.6, z: -0.45 + s * 0.55, y: PAD_TOP });
  b.box(0.12, 0.1, 1.2, { color: C.orange, x: 1.6, z: -0.45, y: PAD_TOP + 0.9 });
  b.cyl(0.16, 0.12, 0.22, { color: 0x3a3e48, x: 1.6, z: 0.0, y: PAD_TOP + 0.45, seg: 8 });
  b.cyl(0.13, 0.13, 0.01, { color: 0xffb040, mat: Mat.Lava, x: 1.6, z: 0.0, y: PAD_TOP + 0.665, seg: 8, ...NP });
  // glowing ingots & slag
  for (let i = 0; i < 6; i++) b.box(0.22, 0.06, 0.1, { color: i < 2 ? 0xff8a2a : 0x8a7a6a, mat: i < 2 ? Mat.Lava : Mat.Metal, x: 0.6 + (i % 3) * 0.26, z: 0.75 + Math.floor(i / 3) * 0.16, y: PAD_TOP + (i % 2) * 0.06, ...NP });
  heap(u, 0.4, 0.32, -1.1, 0.7, 0x2a2420, { seg: 6 });
  heap(u, 0.28, 0.2, -1.6, 0.2, 0x3a2e28, { seg: 5 });
  truck(u, -0.2, 1.35, 0.4, { color: C.orange, cargo: 0x6a6a6a });
  stack(u, 0.14, 2.1, 1.15, -1.45, { color: 0x3a302c, bands: false, smoke: 0x7a7068, puffs: 2 });
  lamp(u, 0.35, 1.9, 0.32, { color: 0xffb070 });
});

/** Deep-sea drill: a jack-up rig on lattice legs with derrick, helipad, cranes and a flare boom. */
export const seaDrill = factory((u) => {
  const { b } = u;
  const deck = 1.35;
  // three lattice legs down through the sea to the bed
  for (const [x, z] of [[-1.3, -0.9], [1.3, -0.9], [0, 1.25]] as [number, number][]) {
    lattice(u, deck + 2.4 + 0.5, 0.3, 0.3, { x, z, y: -2.4, color: C.yellow, levels: 4, r: 0.03 });
    b.box(0.36, 0.08, 0.36, { color: C.iron, x, z, y: deck + 0.5 });
  }
  // hull / deck
  b.extrude([[-1.7, -1.3], [1.7, -1.3], [1.7, 0.7], [0.5, 1.55], [-0.5, 1.55], [-1.7, 0.7]], 0.32, { color: 0xb8bcc4, top: 0x7a8088, y: deck });
  b.box(3.3, 0.04, 0.05, { color: C.yellow, y: deck + 0.32, z: -1.31, ...DET });
  // derrick
  lattice(u, 1.6, 0.6, 0.18, { x: -0.2, z: -0.25, y: deck + 0.32, color: C.white, color2: C.red, levels: 5, r: 0.025 });
  b.box(0.7, 0.18, 0.7, { color: 0x8a9098, x: -0.2, z: -0.25, y: deck + 0.32 });
  beacon(u, -0.2, deck + 1.98, -0.25);
  // accommodation block + helipad
  hall(u, 0.9, 0.5, 0.55, { x: 1.0, z: 0.45, y: deck + 0.32, color: C.white, roof: C.orange });
  b.cyl(0.42, 0.42, 0.04, { color: 0x3a6a4a, x: 1.05, z: 0.45, y: deck + 0.82, seg: 10, top: 0x3a5a3a });
  b.box(0.04, 0.012, 0.22, { color: C.white, x: 0.98, z: 0.45, y: deck + 0.86, ...NP, detail: true });
  b.box(0.04, 0.012, 0.22, { color: C.white, x: 1.12, z: 0.45, y: deck + 0.86, ...NP, detail: true });
  b.box(0.14, 0.012, 0.04, { color: C.white, x: 1.05, z: 0.45, y: deck + 0.86, ...NP, detail: true });
  // pedestal crane
  b.cyl(0.08, 0.1, 0.4, { color: C.orange, x: -1.15, z: 0.55, y: deck + 0.32, seg: 6 });
  beam(u, [-1.15, deck + 0.7, 0.55], [-0.3, deck + 1.1, 1.2], 0.06, 0.06, { color: C.orange });
  // flare boom reaching out over the sea
  beam(u, [1.7, deck + 0.3, -1.1], [2.6, deck + 0.85, -1.6], 0.05, 0.05, { color: C.steelDark });
  b.cone(0.1, 0.32, { color: 0xffa040, mat: Mat.Lava, x: 2.6, z: -1.6, y: deck + 0.85, seg: 6, ...NP });
  tank(u, 0.16, 0.36, -1.15, -0.85, { y: deck + 0.32, color: C.white, band: C.red, dome: false });
  tank(u, 0.16, 0.36, -0.75, -0.95, { y: deck + 0.32, color: C.white, band: C.red, dome: false });
  container(u, 0.45, deck + 0.32, -0.95, C.blue, Math.PI / 2);
  container(u, 0.45, deck + 0.39, -0.95, C.orange, Math.PI / 2);
  for (const [x, z] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 0.6], [1.6, 0.6]] as [number, number][]) beacon(u, x, deck + 0.36, z, C.lamp, 0.04);
});

/** Barren worlds: a bucket-wheel crawler strips glittering regolith; domes refine helium-3 into cryo-spheres. */
export const he3Miner = factory((u) => {
  const { b } = u;
  pad(u, { color: 0xb8b4ac, edge: 0x7a766e, verge: 0x9a968e });
  const regolith = 0xa8a49c;
  // strip-mined trench at the back
  b.box(3.6, 0.012, 1.1, { color: shade(regolith, 0.75), x: 0, z: -1.45, y: PAD_TOP, ...NP });
  for (let k = 0; k < 3; k++) b.box(3.4 - k * 0.6, 0.012, 0.08, { color: shade(regolith, 0.6), x: 0.2 * k, z: -1.75 + k * 0.28, y: PAD_TOP + 0.012, ...NP, detail: true });
  bucketWheel(u, -0.6, -0.65, Math.PI + 0.25, { color: 0xf2c230 });
  heap(u, 0.42, 0.32, 1.25, -1.25, mix(regolith, 0xffffff, 0.2), { seg: 7 });
  // refinery domes & cryo spheres
  b.dome(0.55, { color: C.white, x: 0.95, z: 0.1, y: PAD_TOP, h: 0.5, wSeg: 12, hSeg: 4 });
  b.dome(0.4, { color: C.white, x: 1.6, z: 0.75, y: PAD_TOP, h: 0.36, wSeg: 10, hSeg: 3 });
  b.torus(0.55, 0.03, { color: 0x5ad8ff, mat: Mat.Glow, x: 0.95, z: 0.1, y: PAD_TOP + 0.05, seg: 14, tube: 3, ...NP });
  for (const [x, z] of [[-0.25, 0.85], [0.2, 1.15], [-0.7, 1.25]] as [number, number][]) {
    b.sphere(0.2, { color: 0xe8ecf2, x, z, y: PAD_TOP + 0.22, wSeg: 8, hSeg: 5 });
    b.cyl(0.205, 0.205, 0.03, { color: 0x5ad8ff, x, z, y: PAD_TOP + 0.2, seg: 8, capTop: false, ...DET });
    b.cyl(0.1, 0.14, 0.04, { color: C.steelDark, x, z, y: PAD_TOP, seg: 6, ...DET });
  }
  pipe(u, [[0.4, PAD_TOP + 0.1, 0.25], [-0.25, PAD_TOP + 0.1, 0.85]], 0.03, C.steel, { detail: true });
  conveyor(u, [-0.2, PAD_TOP + 0.4, -0.5], [0.55, PAD_TOP + 0.2, -0.1], { legs: 1 });
  // landing pad
  disc(u, 0.42, -1.55, 0.55, 0x5a5e66);
  stripe(u, 0.3, 0.04, -1.55, 0.55);
  for (let k = 0; k < 4; k++) beacon(u, -1.55 + Math.sin(k * 1.571) * 0.42, PAD_TOP + 0.03, 0.55 + Math.cos(k * 1.571) * 0.42, 0x5ad8ff, 0.035);
});

/** Fungal worlds: cultivation domes, funnelled spore towers and glowing sacs of harvested spores. */
export const sporeHarvester = factory((u) => {
  const { b } = u;
  pad(u, { color: 0x5a4a62, edge: 0x3a2e40, verge: 0x6a4a7a });
  const pink = 0xe87ad0, violet = 0x9a6ae0, glow = 0xffb0f0;
  // cultivation domes with ribs
  for (const [x, z, r] of [[-1.0, -0.8, 0.75], [0.55, -1.2, 0.55], [-1.55, 0.55, 0.45]] as [number, number, number][]) {
    b.dome(r, { color: 0xe6d0e0, x, z, y: PAD_TOP, h: r * 0.8, wSeg: 12, hSeg: 4 });
    for (let k = 0; k < 2; k++) arch(u, r * 1.0, 0.025, x, PAD_TOP, z, { ry: (k / 2) * Math.PI + 0.4, color: violet, seg: 10, tube: 3, detail: true, flat: false });
    b.cyl(r * 0.25, r * 0.25, 0.05, { color: glow, mat: Mat.Glow, x, z, y: PAD_TOP + r * 0.78, seg: 8, ...NP });
  }
  // spore collector towers: stalk + inverted funnel
  for (const [x, z, h] of [[0.6, 0.15, 1.5], [1.35, -0.35, 1.15]] as [number, number, number][]) {
    b.lathe([[0.1, 0], [0.07, h * 0.7], [0.08, h]], { color: 0xf0e2d8, x, z, y: PAD_TOP, seg: 6 });
    b.cyl(0.38, 0.08, 0.3, { color: pink, x, z, y: PAD_TOP + h - 0.05, seg: 10 });
    b.cyl(0.3, 0.3, 0.02, { color: glow, mat: Mat.Glow, x, z, y: PAD_TOP + h + 0.25, seg: 10, ...NP });
  }
  // harvested spore sacs
  for (let k = 0; k < 5; k++) b.sphere(0.13, { color: k % 2 ? glow : 0xd8a0ff, mat: Mat.Glow, x: -0.2 + k * 0.28, z: 1.0 + (k % 2) * 0.18, y: PAD_TOP + 0.13, wSeg: 7, hSeg: 4, ...NP });
  hall(u, 0.8, 0.36, 0.42, { x: 1.3, z: 1.1, color: 0xe6d0c0, roof: violet, gear: false });
  pipe(u, [[0.6, PAD_TOP + 0.08, 0.15], [0.6, PAD_TOP + 0.08, 0.9]], 0.04, violet, { detail: true });
});

/** Ruins excavation: alien monoliths and a half-buried arch inside a dig grid, tents, sieves and a visitor pavilion. */
export const ruinsDig = factory((u) => {
  const { b } = u;
  pad(u, { color: 0xb89a74, edge: 0x7a6248, verge: 0x8a9a5a });
  const stone = 0xb8ac90, dark = 0x8a7e66, glyph = 0x5affd8;
  // dig pit
  b.box(2.6, 0.012, 1.9, { color: 0x9a7e5e, x: -0.2, z: -0.65, y: PAD_TOP, ...NP });
  for (let k = 0; k < 5; k++) b.box(0.012, 0.03, 1.9, { color: C.white, x: -1.4 + k * 0.6, z: -0.65, y: PAD_TOP + 0.015, ...NP, detail: true });
  for (let k = 0; k < 4; k++) b.box(2.6, 0.03, 0.012, { color: C.white, x: -0.2, z: -1.5 + k * 0.56, y: PAD_TOP + 0.015, ...NP, detail: true });
  // half-buried arch
  arch(u, 0.62, 0.11, -0.5, PAD_TOP - 0.1, -1.05, { color: stone, seg: 9, tube: 4, flat: true });
  // monoliths, one toppled
  for (const [x, z, h, rz] of [[0.5, -0.9, 0.95, 0], [0.95, -0.35, 0.7, 0.12], [0.2, -0.2, 0.5, -0.1]] as [number, number, number, number][]) {
    b.box(0.18, h, 0.12, { color: stone, x, z, y: PAD_TOP, rz, top: dark });
    glowBox(u, 0.06, h * 0.5, 0.01, x, PAD_TOP + h * 0.25, z + 0.062, glyph, { detail: true });
  }
  b.box(0.75, 0.14, 0.2, { color: dark, x: -1.2, z: -0.1, y: PAD_TOP, ry: 0.4 });
  // glowing glyph stone at the heart of the dig
  b.cyl(0.18, 0.22, 0.12, { color: dark, x: -0.5, z: -0.6, y: PAD_TOP, seg: 6 });
  b.cyl(0.12, 0.12, 0.02, { color: glyph, mat: Mat.Glow, x: -0.5, z: -0.6, y: PAD_TOP + 0.12, seg: 6, ...NP });
  // tents, sieves, floodlight
  for (const [x, z, c] of [[1.35, 0.55, 0xf2e6c8], [1.75, 0.0, 0x6aa0d8]] as [number, number, number][]) {
    b.box(0.4, 0.04, 0.32, { color: c, x, z, y: PAD_TOP, ...NP });
    b.gable(0.4, 0.22, 0.32, { color: c, x, z, y: PAD_TOP + 0.04, ...NP });
  }
  b.box(0.3, 0.1, 0.2, { color: 0x8a6a4a, x: 0.75, z: 0.45, y: PAD_TOP + 0.08, rx: 0.3, ...DET });
  b.box(0.025, 0.9, 0.025, { color: C.iron, x: -1.7, z: 0.4, y: PAD_TOP });
  b.box(0.18, 0.08, 0.06, { color: C.lamp, mat: Mat.Light, x: -1.7, z: 0.42, y: PAD_TOP + 0.9, ...NP });
  // visitor pavilion with a holographic reconstruction
  hall(u, 1.1, 0.34, 0.5, { x: -0.6, z: 1.45, color: 0xf4efe4, roof: 0xd8c8a8 });
  holoDisc(u, 0.3, -0.6, PAD_TOP + 0.75, 1.45, glyph);
  parking(u, 0.85, 1.6, 4, { gap: 0.12 });
  shrub(u, -1.75, 1.05, 0.13);
  shrub(u, 1.95, 1.1, 0.12, { tall: true });
});

/** Lumber mill on a woodland tile: log decks, a sawmill shed, a log crane and stacked boards. */
export const lumberMill = factory((u) => {
  const { b } = u;
  pad(u, { color: mix(u.ground, 0x8a6a4a, 0.35) });
  const log = 0x8a5a36, end = 0xd8b07a;
  // log decks
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < 6 - r; k++)
      b.cyl(0.07, 0.07, 1.2, { color: log, top: end, rz: Math.PI / 2, x: -0.9 + 0.6, z: -1.4 + k * 0.15 + r * 0.075, y: PAD_TOP + 0.07 + r * 0.12, seg: 6 });
  for (let k = 0; k < 5; k++) b.cyl(0.07, 0.07, 1.0, { color: log, top: end, rx: Math.PI / 2, x: 1.0 + k * 0.15, z: -1.2, y: PAD_TOP + 0.07, seg: 6, ...DET });
  // sawmill shed with a sloped roof + sawdust
  hall(u, 1.5, 0.5, 0.7, { x: -0.4, z: 0.15, color: u.sid === 'classic' ? 0xb07a4a : u.wall, roof: 0x5a6a5a, shed: true });
  b.gable(1.5, 0.25, 0.7, { color: 0x5a6a5a, x: -0.4, z: 0.15, y: PAD_TOP + 0.5 });
  heap(u, 0.25, 0.18, 0.75, 0.35, 0xe0c08a, { seg: 6 });
  conveyor(u, [-0.3, PAD_TOP + 0.08, -0.85], [-0.3, PAD_TOP + 0.3, -0.25], { legs: 1, color: C.orange });
  // log crane
  b.cyl(0.08, 0.1, 0.9, { color: C.yellow, x: 0.95, z: -0.45, y: PAD_TOP, seg: 6 });
  beam(u, [0.95, PAD_TOP + 0.9, -0.45], [0.2, PAD_TOP + 1.05, -1.2], 0.06, 0.06, { color: C.yellow });
  // stacked boards & truck
  for (let k = 0; k < 3; k++) b.box(0.45, 0.16, 0.3, { color: 0xe0b878, x: 1.0 + (k % 2) * 0.1, z: 0.75 + k * 0.0, y: PAD_TOP + k * 0.16, ...NP, ry: k * 0.1 });
  truck(u, 0.25, 1.45, 0.3, { color: C.green, cargo: log });
  greenRing(u, 2.25, 9, { tall: true, s: 0.16, skipFront: true, color: 0x3e7a34 });
  lamp(u, -1.3, 1.5);
});

// ═══════════════════════════════════════════════════════════════ heavy industry

/** Refinery: distillation columns with platforms, a tank farm, pipe racks, a flare and the cracking unit. */
export const refinery = factory((u) => {
  const { b } = u;
  pad(u);
  // distillation columns
  for (const [x, z, r, h] of [[-0.85, -0.85, 0.16, 2.0], [-0.4, -1.15, 0.12, 1.55], [-1.25, -0.35, 0.11, 1.3]] as [number, number, number, number][]) {
    b.cyl(r, r, h, { color: C.white, x, z, y: PAD_TOP, seg: 8 });
    for (let k = 1; k < 4; k++) b.cyl(r + 0.05, r + 0.05, 0.02, { color: C.yellow, x, z, y: PAD_TOP + (h * k) / 4, seg: 8, ...DET });
    b.cone(r, 0.12, { color: C.white, x, z, y: PAD_TOP + h, seg: 8 });
    beacon(u, x, PAD_TOP + h + 0.12, z);
  }
  // tank farm (floating-roof tanks)
  for (const [x, z, r] of [[0.75, -1.25, 0.42], [1.6, -0.6, 0.38], [0.75, -0.3, 0.32]] as [number, number, number][]) {
    b.cyl(r, r, 0.35, { color: u.tank, x, z, y: PAD_TOP, seg: 12, top: shade(u.tank, 0.85) });
    b.cyl(r + 0.004, r + 0.004, 0.05, { color: C.red, x, z, y: PAD_TOP + 0.24, seg: 12, capTop: false, ...DET });
  }
  // cracking unit + reactors
  vessel(u, 0.1, 0.6, -0.15, PAD_TOP + 0.35, 0.3, { color: C.steel });
  tank(u, 0.14, 0.7, 0.35, 0.65, { color: C.steel, band: C.yellow });
  pipeRack(u, [-0.95, 0.2], [1.4, 0.2], 0.35, { colors: [C.yellow, C.steel], frames: 4 });
  pipeRack(u, [-0.55, -0.6], [0.4, -0.6], 0.3, { colors: [C.steel, C.red], frames: 2 });
  // flare stack + control room
  b.cyl(0.04, 0.06, 2.3, { color: C.steelDark, x: 1.85, z: 0.5, y: PAD_TOP, seg: 6 });
  b.cone(0.1, 0.34, { color: 0xffa040, mat: Mat.Lava, x: 1.85, z: 0.5, y: PAD_TOP + 2.3, seg: 6, ...NP });
  puffs(u, 1.85, PAD_TOP + 2.75, 0.5, 0.12, C.smoke, 2);
  hall(u, 0.9, 0.36, 0.45, { x: -0.8, z: 1.25 });
  truck(u, 0.6, 1.4, 0.4, { cargo: u.tank, color: C.red });
  fence(u, 2.42);
  lamp(u, 0.1, 1.95);
});

/** Foundry: blast furnace with downcomers, hot-blast stoves, the casting hall glowing at its doors, ore & coke. */
export const foundry = factory((u) => {
  const { b } = u;
  pad(u, { color: shade(u.ground, 0.88) });
  const iron = 0x5a5e66;
  // blast furnace
  b.lathe([[0.42, 0], [0.48, 0.5], [0.38, 1.5], [0.26, 2.0], [0.28, 2.2]], { color: iron, x: -0.6, z: -0.7, y: PAD_TOP, seg: 10 });
  b.box(0.9, 0.06, 0.9, { color: C.steelDark, x: -0.6, z: -0.7, y: PAD_TOP + 1.15, ...DET });
  for (const s of [-1, 1]) pipe(u, [[-0.6 + s * 0.12, PAD_TOP + 2.2, -0.7], [-0.6 + s * 0.3, PAD_TOP + 2.45, -0.7], [-0.6 + s * 0.55, PAD_TOP + 1.2, -0.7]], 0.06, iron);
  b.box(0.3, 0.2, 0.02, { color: 0xff8a2a, mat: Mat.Lava, x: -0.6, z: -0.25, y: PAD_TOP + 0.1, ...NP });
  // hot-blast stoves
  for (let k = 0; k < 3; k++) {
    const x = 0.45 + k * 0.42, z = -1.35;
    b.cyl(0.18, 0.18, 1.3, { color: 0x8a8e96, x, z, y: PAD_TOP, seg: 10 });
    b.dome(0.18, { color: 0x8a8e96, x, z, y: PAD_TOP + 1.3, h: 0.14, wSeg: 10, hSeg: 2 });
  }
  pipe(u, [[0.45, PAD_TOP + 1.0, -1.15], [1.29, PAD_TOP + 1.0, -1.15]], 0.05, iron, { detail: true });
  pipe(u, [[0.45, PAD_TOP + 1.0, -1.15], [-0.3, PAD_TOP + 1.0, -0.85]], 0.06, iron);
  stack(u, 0.15, 2.5, 1.75, -0.55, { color: 0x9a9690, smoke: C.smoke, puffs: 2 });
  // casting hall with molten glow in its open doors
  hall(u, 1.8, 0.7, 0.75, { x: 0.35, z: 0.5, color: shade(u.wall2, 0.8), shed: true });
  for (let k = 0; k < 3; k++) b.box(0.3, 0.32, 0.02, { color: 0xff8a2a, mat: Mat.Lava, x: -0.25 + k * 0.6, z: 0.885, y: PAD_TOP, ...NP });
  // raw material piles + conveyor up to the furnace top
  heap(u, 0.45, 0.35, -1.45, 0.2, RUST, { seg: 7 });
  heap(u, 0.38, 0.3, -1.4, 0.95, C.coal, { seg: 6 });
  conveyor(u, [-1.3, PAD_TOP + 0.1, 0.0], [-0.75, PAD_TOP + 1.2, -0.5], { legs: 2 });
  // steel coils & a truck
  for (let k = 0; k < 4; k++) b.cyl(0.08, 0.08, 0.1, { color: 0xa0a8b4, mat: Mat.Metal, x: 1.15 + (k % 2) * 0.2, z: 1.35 + Math.floor(k / 2) * 0.2, y: PAD_TOP + 0.08, rx: Math.PI / 2, seg: 8, ...DET });
  truck(u, 0.3, 1.55, 0.3, { color: C.orange, cargo: 0xa0a8b4 });
  fence(u, 2.42);
  lamp(u, -0.7, 1.9);
});

/** Nanofabricator: a sleek clean-room factory, robot arms over a glowing assembly line, drone pads. */
export const nanofabricator = factory((u) => {
  const { b } = u;
  pad(u, { color: 0xe8ecf0, edge: 0xa8b0bc });
  const white = u.sid === 'cyber' ? 0x4a4f5e : 0xf4f6fa;
  const glow = u.sid === 'classic' ? 0x5ae8ff : u.accent;
  // main fab with a curved glass front
  b.box(2.4, 0.7, 1.05, { color: white, x: -0.1, z: -0.85, y: PAD_TOP, top: shade(white, 0.92) });
  b.cyl(0.52, 0.52, 0.7, { color: u.glass, mat: Mat.Glass, x: 1.1, z: -0.85, y: PAD_TOP, seg: 10, arc: Math.PI, ry: 0, top: shade(white, 0.92), ...NP });
  glowBox(u, 2.42, 0.03, 1.07, -0.1, PAD_TOP + 0.6, -0.85, glow);
  for (let k = 0; k < 4; k++) b.box(0.3, 0.06, 0.3, { color: 0xc8d0dc, x: -1.0 + k * 0.55, z: -0.85, y: PAD_TOP + 0.7, ...DET });
  // open assembly line with robot arms
  b.box(2.2, 0.08, 0.3, { color: 0x3a3e48, x: -0.2, z: 0.4, y: PAD_TOP });
  b.box(2.2, 0.012, 0.12, { color: glow, mat: Mat.Glow, x: -0.2, z: 0.4, y: PAD_TOP + 0.08, ...NP });
  for (let k = 0; k < 4; k++) {
    const x = -1.0 + k * 0.55;
    b.cyl(0.05, 0.07, 0.12, { color: C.orange, x, z: 0.68, y: PAD_TOP, seg: 6 });
    beam(u, [x, PAD_TOP + 0.12, 0.68], [x + 0.06, PAD_TOP + 0.38, 0.55], 0.04, 0.04, { color: C.orange });
    beam(u, [x + 0.06, PAD_TOP + 0.38, 0.55], [x + 0.02, PAD_TOP + 0.2, 0.42], 0.03, 0.03, { color: C.orange });
    b.box(0.12, 0.06, 0.12, { color: k % 2 ? 0xd8dce4 : 0x8a6aff, x: x + 0.15, z: 0.4, y: PAD_TOP + 0.09, ...NP, detail: true });
  }
  // drone pads
  for (const [x, z] of [[1.45, 0.75], [1.05, 1.35]] as [number, number][]) {
    disc(u, 0.24, x, z, 0x3a3e48);
    b.torus(0.2, 0.012, { color: glow, mat: Mat.Glow, x, z, y: PAD_TOP + 0.015, seg: 10, tube: 3, ...NP, detail: true });
  }
  holoDisc(u, 0.3, -0.1, PAD_TOP + 1.1, -0.3, glow);
  lobby(u, 0.6, 0.32, 0.3, -1.25, 1.3);
  parking(u, -0.2, 1.6, 6, { gap: 0.1 });
  lamp(u, 0.6, 1.95);
});

/** Vertical farm: a slim tower of glowing grow-floors, terraced greens and a rooftop wind spinner. */
export const verticalFarm = factory((u) => {
  const { b } = u;
  pad(u);
  const floors = 7;
  const fh = 0.2;
  for (let k = 0; k < floors; k++) {
    const y = PAD_TOP + k * fh;
    const w = 0.85 - (k % 2) * 0.06;
    b.box(w, fh - 0.03, w, { color: 0xb8e8c8, mat: Mat.Glass, y, top: 0xe8f0e8, ...NP });
    b.box(w + 0.1, 0.045, w + 0.1, { color: k % 2 ? 0x5ab84a : 0x7ad25a, mat: Mat.Foliage, y: y - 0.005, ...NP });
    b.box(w + 0.04, 0.03, w + 0.04, { color: u.trim, y: y + fh - 0.03 });
  }
  b.box(0.14, floors * fh, 0.14, { color: u.wall, x: 0.36, z: 0.36, y: PAD_TOP });
  // pink grow-light bands glow at night
  for (let k = 0; k < floors; k += 2) b.box(0.88, 0.02, 0.88, { color: 0xff7ad8, mat: Mat.Light, y: PAD_TOP + k * fh + 0.13, ...NP, detail: true });
  // rooftop garden & spinner
  b.box(0.7, 0.04, 0.7, { color: C.leaf, mat: Mat.Foliage, y: PAD_TOP + floors * fh, ...NP });
  b.cyl(0.02, 0.02, 0.35, { color: C.white, y: PAD_TOP + floors * fh, seg: 4 });
  for (let k = 0; k < 3; k++) b.box(0.03, 0.25, 0.08, { color: C.white, y: PAD_TOP + floors * fh + 0.24, ry: (k / 3) * Math.PI * 2, x: 0.05, ...DET });
  b.box(0.3, 0.16, 0.22, { color: u.wall2, x: -0.45, z: 0.45, y: PAD_TOP, top: u.roof });
});

/** Shipyard: a flooded dry dock with a hull under construction, a goliath crane, fab sheds and plate stacks. */
export const shipyard = factory((u) => {
  const { b } = u;
  pad(u);
  // dry dock running front-to-back, open to the sea at the back
  b.box(1.5, 0.1, 4.2, { color: C.concreteDark, x: -0.5, z: -0.35, y: PAD_TOP, ...NP });
  b.box(1.3, 0.012, 4.1, { color: C.water, mat: Mat.Water, x: -0.5, z: -0.4, y: PAD_TOP + 0.02, ...NP });
  // the ship: hull, deck, superstructure
  const hullCol = u.sid === 'cyber' ? 0x3a3f4e : 0xb8342a;
  const hullPoly: [number, number][] = [[-0.4, -1.6], [0.4, -1.6], [0.42, 0.7], [0.0, 1.5], [-0.42, 0.7]];
  b.extrude(hullPoly, 0.2, { color: hullCol, top: hullCol, x: -0.5, y: PAD_TOP + 0.02 });
  b.extrude(hullPoly, 0.2, { color: 0x2e3440, top: 0x7a828c, x: -0.5, y: PAD_TOP + 0.22, sx: 1.0 });
  b.box(0.7, 0.012, 2.0, { color: 0x9aa2ac, x: -0.5, z: -0.1, y: PAD_TOP + 0.42, ...NP, detail: true });
  for (let k = 0; k < 3; k++) container(u, -0.5 + (k - 1) * 0.12, PAD_TOP + 0.42, 0.25, [C.blue, C.orange, C.green][k], 0);
  b.box(0.6, 0.34, 0.45, { color: C.white, x: -0.5, z: -1.25, y: PAD_TOP + 0.42 });
  b.box(0.4, 0.16, 0.32, { color: C.white, x: -0.5, z: -1.25, y: PAD_TOP + 0.76 });
  b.box(0.62, 0.04, 0.1, { color: 0x2a3a5a, x: -0.5, z: -1.04, y: PAD_TOP + 0.85, ...DET });
  b.cyl(0.07, 0.09, 0.25, { color: C.orange, x: -0.5, z: -1.42, y: PAD_TOP + 0.92, seg: 6 });
  // scaffolding & sparks at the bow
  for (let k = 0; k < 3; k++) b.box(0.02, 0.45, 0.02, { color: C.steelDark, x: -0.95, z: 0.4 + k * 0.3, y: PAD_TOP, ...DET });
  glowBox(u, 0.04, 0.04, 0.04, -0.9, PAD_TOP + 0.3, 0.7, 0xfff0a0, { detail: true });
  // goliath crane straddling the dock
  for (const s of [-1, 1]) {
    b.box(0.1, 1.55, 0.1, { color: C.red, x: -0.5 + s * 0.95, z: -0.2, y: PAD_TOP });
    b.box(0.1, 0.05, 0.6, { color: C.red, x: -0.5 + s * 0.95, z: -0.2, y: PAD_TOP, ...DET });
  }
  b.box(2.1, 0.22, 0.22, { color: C.white, x: -0.5, z: -0.2, y: PAD_TOP + 1.55 });
  b.box(0.25, 0.18, 0.3, { color: C.red, x: -0.35, z: -0.2, y: PAD_TOP + 1.37 });
  b.cyl(0.008, 0.008, 0.9, { color: C.iron, x: -0.35, z: -0.2, y: PAD_TOP + 0.47, seg: 3, ...DET });
  beacon(u, -1.45, PAD_TOP + 1.8, -0.2);
  beacon(u, 0.45, PAD_TOP + 1.8, -0.2);
  // fab sheds, plate stacks, containers
  hall(u, 1.0, 0.7, 1.2, { x: 1.25, z: -0.75, shed: true });
  hall(u, 0.8, 0.45, 0.6, { x: 1.25, z: 0.65, shed: true, color: u.wall2 });
  for (let k = 0; k < 3; k++) b.box(0.4, 0.04 + k * 0.02, 0.25, { color: 0x8a8e96, x: 0.55, z: 1.15 + k * 0.0, y: PAD_TOP + k * 0.05, ...NP });
  container(u, 1.65, PAD_TOP, 1.25, C.blue, Math.PI / 2);
  container(u, 1.65, PAD_TOP + 0.07, 1.25, C.orange, Math.PI / 2);
  lamp(u, 0.35, 1.9);
  lamp(u, -1.45, 1.6);
  fence(u, 2.42);
});

