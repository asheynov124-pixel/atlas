/**
 * utilities · water, air, sanitation and data meshes (OWNER: utilities).
 *
 *   Water: pump station · water tower · desalination · treatment works · ice miner · atmospheric harvester
 *   Air:   oxygen generator · toxin scrubber · algae bioreactor · hydroponic O₂ garden · atmosphere processor
 *   Sanitation: landfill · recycling centre · waste-to-energy incinerator (ski slope included) · matter recycler
 *   Data:  comms tower · data centre · satellite uplink · quantum relay
 *
 * Colour language: water = blue pipes & animated Mat.Water surfaces, air = vivid greens & white vents,
 * sanitation = olive / ochre machinery with colourful bales, data = violet & cyan glow on dark shells.
 */
import { Mat, mix, shade } from '../../kit';
import {
  C, DET, NP, PAD_TOP, basin, beacon, beam, conveyor, container, dish, door, factory, fence, glowBox, greenRing, hall, heap,
  holoDisc, lamp, lattice, lobby, pad, parking, pipe, pool, puffs, ribbon, shrub, stack, tank, transformers, truck,
} from './common';

const PIPE_BLUE = 0x3a8ad8;

// ═══════════════════════════════════════════════════════════════ water

/** Coastal pump station: intake basin at the back, blue mains into the pump house, surge tank. */
export const pumpStation = factory((u) => {
  const { b } = u;
  pad(u);
  pool(u, 0.7, 0.38, 0, -0.5);
  // intake screens
  for (let k = -1; k <= 1; k++) b.box(0.03, 0.14, 0.03, { color: C.steelDark, x: k * 0.2, z: -0.3, y: PAD_TOP + 0.05, ...DET });
  hall(u, 0.56, 0.42, 0.4, { z: 0.28, color: u.wall, shed: true, gear: false });
  door(u, 0.16, 0.2, -0.12, 0.481);
  pipe(u, [[-0.18, PAD_TOP + 0.04, -0.45], [-0.18, PAD_TOP + 0.2, -0.2], [-0.18, PAD_TOP + 0.2, 0.08]], 0.05, PIPE_BLUE);
  pipe(u, [[0.18, PAD_TOP + 0.04, -0.45], [0.18, PAD_TOP + 0.2, -0.2], [0.18, PAD_TOP + 0.2, 0.08]], 0.05, PIPE_BLUE);
  tank(u, 0.16, 0.42, 0.55, -0.05, { color: C.white, band: PIPE_BLUE });
  b.torus(0.05, 0.012, { color: C.red, x: -0.18, y: PAD_TOP + 0.3, z: -0.12, rx: Math.PI / 2, seg: 8, tube: 3, ...DET });
  lamp(u, -0.55, 0.3);
});

/** Water tower: classic tank on legs, or a tulip pedestal for curvy styles. */
export const waterTower = factory((u) => {
  const { b } = u;
  pad(u, { h: 0.03, scale: 0.75 });
  const shell = u.sid === 'cyber' ? 0x4a505e : u.sid === 'classic' ? 0xdfe6ee : u.tank;
  const H = 1.25;
  if (u.curvy >= 0.6) {
    b.lathe([[0.2, 0], [0.13, 0.35], [0.11, 0.9], [0.18, H - 0.05], [0.42, H + 0.12], [0.48, H + 0.32], [0.38, H + 0.5], [0.1, H + 0.6]], { color: shell, y: PAD_TOP, seg: 14 });
  } else {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) beam(u, [sx * 0.32, PAD_TOP, sz * 0.32], [sx * 0.2, PAD_TOP + H + 0.02, sz * 0.2], 0.05, 0.05, { color: C.steelDark });
    b.box(0.5, 0.03, 0.5, { color: C.steelDark, y: PAD_TOP + H * 0.5, ...DET });
    b.cyl(0.035, 0.035, H, { color: PIPE_BLUE, y: PAD_TOP, seg: 6 });
    b.cyl(0.4, 0.4, 0.34, { color: shell, y: PAD_TOP + H, seg: 14 });
    b.sphere(0.4, { color: shell, y: PAD_TOP + H, wSeg: 14, hSeg: 4, thetaLength: Math.PI / 2, sy: -0.4 });
    b.cone(0.42, 0.22, { color: shade(shell, 0.85), y: PAD_TOP + H + 0.34, seg: 14 });
    b.torus(0.405, 0.012, { color: C.iron, y: PAD_TOP + H + 0.16, seg: 14, tube: 3, ...DET });
  }
  // painted band & the city's glowing logo
  b.cyl(0.415, 0.415, 0.08, { color: u.accent, y: PAD_TOP + H + (u.curvy >= 0.6 ? 0.2 : 0.06), seg: 14, capTop: false, sx: u.curvy >= 0.6 ? 1.1 : 1, sz: u.curvy >= 0.6 ? 1.1 : 1 });
  glowBox(u, 0.1, 0.1, 0.02, 0, PAD_TOP + H + 0.24, u.curvy >= 0.6 ? 0.47 : 0.41, 0x7ad8ff, { detail: true });
  beacon(u, 0, PAD_TOP + H + 0.58, 0);
  b.box(0.22, 0.16, 0.18, { color: u.wall, x: 0.45, z: 0.35, y: PAD_TOP, top: u.roof });
});

/** Desalination: seawater intake channel, reverse-osmosis halls, brine ponds glittering with salt, product tanks. */
export const desalination = factory((u) => {
  const { b } = u;
  pad(u);
  // intake channel along the back (the sea side) + brine ponds
  pool(u, 3.6, 0.42, 0, -1.75, { color: 0x2a78b8 });
  pool(u, 0.9, 0.62, -1.45, -0.85, { color: 0x6ad0d8 });
  pool(u, 0.9, 0.62, -1.45, 0.0, { color: 0x9ae4e0 });
  for (const z of [-0.85, 0.0]) b.box(0.94, 0.02, 0.06, { color: 0xffffff, x: -1.45, z: z + 0.3, y: PAD_TOP + 0.07, ...NP, detail: true });
  // reverse-osmosis halls with barrel roofs
  for (let i = 0; i < 2; i++) {
    const z = -0.95 + i * 0.85;
    hall(u, 1.5, 0.42, 0.6, { x: 0.45, z, color: u.wall, roof: u.roof, vault: true, shed: true });
    for (let k = 0; k < 4; k++) b.cyl(0.035, 0.035, 0.6, { color: PIPE_BLUE, rx: Math.PI / 2, x: -0.2 + k * 0.42, z: z - 0.3, y: PAD_TOP + 0.22, seg: 6, ...DET });
  }
  // product water tanks and pumps by the road
  tank(u, 0.36, 0.55, 1.45, 0.75, { color: C.white, band: PIPE_BLUE });
  tank(u, 0.28, 0.45, 0.75, 1.2, { color: C.white, band: PIPE_BLUE });
  pipe(u, [[1.1, PAD_TOP + 0.2, -1.6], [1.75, PAD_TOP + 0.2, -1.6], [1.75, PAD_TOP + 0.2, 0.5]], 0.06, PIPE_BLUE);
  pipe(u, [[-0.6, PAD_TOP + 0.12, 0.65], [1.1, PAD_TOP + 0.12, 0.65]], 0.05, PIPE_BLUE, { detail: true });
  hall(u, 0.75, 0.36, 0.42, { x: -0.65, z: 1.35 });
  transformers(u, -1.65, 1.0, 1, { ry: 0.5 });
  fence(u, 2.42);
  lamp(u, 0.1, 1.95);
  lamp(u, -1.6, 1.7);
});

/** Treatment works: clarifiers with rotating bridges, aeration lanes, filter beds and the lab building. */
export const treatmentPlant = factory((u) => {
  const { b } = u;
  pad(u);
  basin(u, 0.62, -1.15, -0.95);
  basin(u, 0.62, 0.35, -1.35);
  basin(u, 0.48, 1.55, -0.55, { color: 0x3a9ad0 });
  // aeration lanes (bubbly, lighter water)
  b.box(1.4, 0.07, 1.16, { color: C.concrete, x: -0.85, z: 0.53, y: PAD_TOP, ...NP });
  for (let k = 0; k < 3; k++) b.box(1.3, 0.012, 0.28, { color: 0x8ad0e8, mat: Mat.Water, x: -0.85, z: 0.15 + k * 0.38, y: PAD_TOP + 0.072, ...NP });
  for (let k = 0; k < 3; k++) b.box(0.03, 0.03, 1.1, { color: C.steelDark, x: -1.4 + k * 0.55, z: 0.53, y: PAD_TOP + 0.09, ...DET });
  // filter beds + lab / control building
  pool(u, 0.7, 0.5, 0.75, 0.25, { color: 0x4aa0c8 });
  hall(u, 0.9, 0.42, 0.5, { x: 0.85, z: 1.15 });
  lobby(u, 0.32, 0.26, 0.1, 0.65, 1.45);
  pipe(u, [[-1.15, PAD_TOP + 0.08, -0.32], [-1.15, PAD_TOP + 0.08, -0.1]], 0.04, PIPE_BLUE, { detail: true });
  pipe(u, [[0.35, PAD_TOP + 0.08, -0.72], [0.35, PAD_TOP + 0.08, -0.05], [0.75, PAD_TOP + 0.08, -0.05]], 0.04, PIPE_BLUE, { detail: true });
  tank(u, 0.22, 0.48, 1.7, 0.45, { color: C.white, band: C.green });
  fence(u, 2.42);
  shrub(u, -1.9, 1.3, 0.13);
  shrub(u, -1.55, 1.75, 0.11, { tall: true });
  lamp(u, 0.05, 1.95);
});

/** Ice miner on an ice deposit: drill derrick, ice blocks, melt tank with a glowing heater and steam. */
export const iceMiner = factory((u) => {
  const { b } = u;
  pad(u, { color: 0xd8e8f2, edge: 0x8aa8c0 });
  const ice = 0xbfeaff;
  // exposed ice face
  heap(u, 0.32, 0.26, -0.35, -0.4, ice, { seg: 5 });
  heap(u, 0.22, 0.18, -0.6, -0.05, mix(ice, 0xffffff, 0.4), { seg: 5 });
  for (let k = 0; k < 4; k++) b.box(0.12, 0.1, 0.12, { color: k % 2 ? ice : 0xe6f8ff, x: 0.05 + k * 0.13, z: -0.55 + (k % 2) * 0.1, y: PAD_TOP, ry: k * 0.5, ...NP, detail: true });
  // drill derrick over the bore
  for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1]] as [number, number][]) beam(u, [sx * 0.24 - 0.05, PAD_TOP, sz * 0.24 + 0.1], [-0.05, PAD_TOP + 1.05, 0.1], 0.04, 0.04, { color: C.orange });
  b.box(0.14, 0.12, 0.14, { color: C.orange, x: -0.05, z: 0.1, y: PAD_TOP + 1.0 });
  b.cyl(0.03, 0.03, 0.95, { color: C.steelDark, x: -0.05, z: 0.1, y: PAD_TOP, seg: 5 });
  beacon(u, -0.05, PAD_TOP + 1.16, 0.1);
  // melt tank with heater glow + steam
  tank(u, 0.2, 0.36, 0.45, 0.05, { color: C.white, band: 0x5ad8ff });
  b.box(0.18, 0.06, 0.02, { color: 0xff7a2a, mat: Mat.Lava, x: 0.45, z: 0.255, y: PAD_TOP + 0.08, ...NP });
  puffs(u, 0.45, PAD_TOP + 0.62, 0.05, 0.1, C.steam, 2);
  pipe(u, [[0.45, PAD_TOP + 0.12, 0.25], [0.45, PAD_TOP + 0.12, 0.55], [-0.2, PAD_TOP + 0.12, 0.55]], 0.035, PIPE_BLUE);
  b.box(0.3, 0.2, 0.22, { color: u.wall, x: -0.35, z: 0.5, y: PAD_TOP, top: u.roof });
});

/** Atmospheric water harvester: finned condenser towers, a fog-net screen and the collection tank. */
export const atmoHarvester = factory((u) => {
  const { b } = u;
  pad(u);
  for (const [x, z, h] of [[-0.35, -0.25, 1.15], [0.2, -0.45, 0.9]] as [number, number, number][]) {
    b.cyl(0.06, 0.12, h, { color: C.white, x, z, y: PAD_TOP, seg: 8 });
    for (let k = 0; k < 5; k++) b.cyl(0.2 - k * 0.012, 0.2 - k * 0.012, 0.025, { color: k % 2 ? 0xbfe6ff : C.white, x, z, y: PAD_TOP + h * (0.32 + k * 0.14), seg: 10 });
    b.dome(0.14, { color: 0x7ad8ff, mat: Mat.Glow, x, z, y: PAD_TOP + h, h: 0.08, wSeg: 8, hSeg: 2, ...NP });
  }
  // fog net between two posts
  b.box(0.03, 0.75, 0.03, { color: C.steelDark, x: 0.5, z: 0.0, y: PAD_TOP });
  b.box(0.03, 0.75, 0.03, { color: C.steelDark, x: 0.5, z: 0.55, y: PAD_TOP });
  b.group({ x: 0.5, z: 0.275, y: PAD_TOP + 0.2, ry: Math.PI / 2 }, () => b.panel(0.55, 0.5, { color: 0xc8dce8, both: true, ...NP }));
  tank(u, 0.2, 0.3, -0.25, 0.4, { color: C.white, band: PIPE_BLUE });
  pipe(u, [[-0.35, PAD_TOP + 0.08, -0.1], [-0.35, PAD_TOP + 0.08, 0.2]], 0.03, PIPE_BLUE, { detail: true });
  glowBox(u, 0.1, 0.03, 0.01, -0.25, PAD_TOP + 0.22, 0.605, 0x7ad8ff, { detail: true });
});

// ═══════════════════════════════════════════════════════════════ air

/** Oxygen generator: electrolyser stacks glowing cyan, tall O₂ and H₂ cylinders, vents. */
export const oxygenGenerator = factory((u) => {
  const { b } = u;
  pad(u);
  hall(u, 0.62, 0.34, 0.42, { x: -0.1, z: 0.3, shed: true, gear: false });
  for (let k = 0; k < 4; k++) glowBox(u, 0.08, 0.16, 0.01, -0.34 + k * 0.16, PAD_TOP + 0.08, 0.515, 0x5ae8ff, { detail: k > 1 });
  // gas cylinders
  for (const [x, z, band] of [[-0.35, -0.35, 0x4aff7a], [0.0, -0.45, 0x4aff7a], [0.38, -0.25, 0xff5a4a]] as [number, number, number][]) {
    b.cyl(0.13, 0.13, 0.85, { color: C.white, x, z, y: PAD_TOP, seg: 10 });
    b.dome(0.13, { color: C.white, x, z, y: PAD_TOP + 0.85, h: 0.08, wSeg: 10, hSeg: 2 });
    b.cyl(0.135, 0.135, 0.08, { color: band, x, z, y: PAD_TOP + 0.62, seg: 10, capTop: false });
  }
  // vent mushrooms on the roof
  for (const x of [-0.25, 0.08]) {
    b.cyl(0.03, 0.03, 0.14, { color: C.steelDark, x, z: 0.3, y: PAD_TOP + 0.34, seg: 5, ...DET });
    b.cone(0.07, 0.05, { color: C.steelDark, x, z: 0.3, y: PAD_TOP + 0.46, seg: 6, ...DET });
  }
  pipe(u, [[-0.35, PAD_TOP + 0.5, -0.22], [-0.35, PAD_TOP + 0.5, 0.1]], 0.025, C.green, { detail: true });
  shrub(u, 0.55, 0.45, 0.1);
});

/** Toxin scrubber: a tall intake tower that breathes in acid fog and exhales clean white air. */
export const toxinScrubber = factory((u) => {
  const { b } = u;
  pad(u);
  const lime = 0x9aff4a;
  b.cyl(0.3, 0.38, 0.35, { color: 0x5a6070, y: PAD_TOP, seg: 10 });
  b.cyl(0.2, 0.26, 1.5, { color: C.white, y: PAD_TOP + 0.35, seg: 10 });
  for (let k = 0; k < 4; k++) {
    b.cyl(0.27 - k * 0.012, 0.27 - k * 0.012, 0.06, { color: 0x3a3e48, y: PAD_TOP + 0.55 + k * 0.28, seg: 10 });
    b.cyl(0.255 - k * 0.012, 0.255 - k * 0.012, 0.025, { color: lime, mat: Mat.Glow, y: PAD_TOP + 0.62 + k * 0.28, seg: 10, capTop: false, ...NP, detail: k % 2 === 1 });
  }
  b.cyl(0.22, 0.2, 0.12, { color: 0x3a3e48, y: PAD_TOP + 1.85, seg: 10 });
  puffs(u, 0, PAD_TOP + 2.08, 0, 0.17, C.steam, 3);
  // filter cartridges
  for (const [x, z] of [[0.55, -0.2], [0.55, 0.2], [-0.55, 0.15]] as [number, number][]) {
    b.cyl(0.1, 0.1, 0.36, { color: 0xc8d0d8, x, z, y: PAD_TOP, seg: 8 });
    b.cyl(0.105, 0.105, 0.04, { color: lime, x, z, y: PAD_TOP + 0.25, seg: 8, capTop: false, ...DET });
  }
  beacon(u, 0.2, PAD_TOP + 1.95, 0);
});

/** Algae bioreactor: racks of glowing-green photobioreactor tubes, culture columns and a harvest hall. */
export const algaeBioreactor = factory((u) => {
  const { b } = u;
  pad(u);
  const algae = 0x56d24a, deep = 0x2f9a3a;
  // tube racks (rows of horizontal tubes on frames)
  for (let r = 0; r < 4; r++) {
    const z = -1.55 + r * 0.55;
    const len = r === 0 ? 2.6 : 3.4;
    for (let t = 0; t < 3; t++) b.cyl(0.055, 0.055, len, { color: t === 1 ? algae : mix(algae, deep, 0.35), rz: Math.PI / 2, x: len / 2 - 0.35, z, y: PAD_TOP + 0.08 + t * 0.12, seg: 6 });
    for (let k = 0; k < 4; k++) b.box(0.03, 0.36, 0.14, { color: C.steelDark, x: -0.35 - len / 2 + (k + 0.5) * (len / 4), z, y: PAD_TOP, ...DET });
    b.box(len, 0.012, 0.12, { color: 0x9aff7a, mat: Mat.Light, x: -0.35, z, y: PAD_TOP + 0.01, ...NP, detail: true });
  }
  // culture columns
  for (let k = 0; k < 5; k++) {
    const x = 1.55 - (k % 2) * 0.3, z = -1.0 + k * 0.32;
    b.cyl(0.11, 0.11, 0.85, { color: k % 2 ? algae : deep, x, z, y: PAD_TOP, seg: 8 });
    b.cyl(0.12, 0.12, 0.05, { color: C.white, x, z, y: PAD_TOP + 0.85, seg: 8 });
  }
  // harvest hall + O₂ storage by the road
  hall(u, 1.3, 0.48, 0.55, { x: -0.55, z: 1.25, shed: true, garden: true });
  tank(u, 0.24, 0.5, 0.75, 1.35, { color: C.white, band: C.green });
  tank(u, 0.2, 0.42, 1.25, 1.05, { color: C.white, band: C.green });
  fence(u, 2.42);
  lamp(u, 0.25, 1.95);
});

/** Hydroponic O₂ garden: glass biodomes, stepped garden terraces and pergolas — a park that breathes for the city. */
export const hydroponicGarden = factory((u) => {
  const { b } = u;
  pad(u, { color: mix(u.ground, C.leaf, 0.25) });
  const glass = 0x9ad8e8;
  // main biodome + two smaller domes, glazed
  b.dome(1.05, { color: glass, mat: Mat.Glass, x: -0.45, z: -0.55, y: PAD_TOP, h: 0.95, wSeg: 14, hSeg: 5, ...NP });
  b.torus(1.05, 0.04, { color: C.white, x: -0.45, z: -0.55, y: PAD_TOP + 0.02, seg: 18, tube: 3, ...DET });
  b.dome(0.6, { color: glass, mat: Mat.Glass, x: 1.2, z: -0.95, y: PAD_TOP, h: 0.55, wSeg: 12, hSeg: 4, ...NP });
  b.dome(0.48, { color: glass, mat: Mat.Glass, x: 1.25, z: 0.35, y: PAD_TOP, h: 0.42, wSeg: 10, hSeg: 4, ...NP });
  // trees poking up inside the big dome
  shrub(u, -0.45, -0.55, 0.3, { tall: true, color: 0x3f9a3a });
  // planted terraces and hedges
  for (let k = 0; k < 3; k++) b.box(1.6 - k * 0.4, 0.07, 0.36, { color: k % 2 ? 0x6a4a32 : 0x7a5a3e, top: k % 2 ? C.leaf : 0x7ac85a, topMat: Mat.Foliage, x: -0.6, z: 0.85 + k * 0.0, y: PAD_TOP + k * 0.07, ...NP });
  for (let k = 0; k < 4; k++) shrub(u, -1.75 + k * 0.42, 1.35, 0.11, { color: k % 2 ? 0xe86aa0 : 0xf2d24a });
  // pergola walk to the road
  for (let k = 0; k < 3; k++) {
    b.box(0.03, 0.3, 0.03, { color: C.white, x: 0.35, z: 0.9 + k * 0.4, y: PAD_TOP, ...DET });
    b.box(0.03, 0.3, 0.03, { color: C.white, x: 0.75, z: 0.9 + k * 0.4, y: PAD_TOP, ...DET });
  }
  b.box(0.5, 0.04, 1.0, { color: C.leaf, mat: Mat.Foliage, x: 0.55, z: 1.3, y: PAD_TOP + 0.3, ...NP });
  // O₂ compressor house
  hall(u, 0.55, 0.3, 0.36, { x: 1.75, z: 1.15, gear: false, garden: true });
  greenRing(u, 2.3, 8, { skipFront: true, s: 0.12 });
});

/** Atmosphere processor: a buttressed terraforming spire, glowing intake rings and a towering exhaust plume. */
export const atmosphereProcessor = factory((u) => {
  const { b } = u;
  pad(u, { color: shade(u.ground, 0.85) });
  const body = u.sid === 'cyber' ? 0x3a3f4e : 0x8e96a2;
  const glow = 0x7affc8;
  const H = 4.6;
  b.lathe([[0.95, 0], [0.75, 0.6], [0.55, 1.6], [0.48, 3.2], [0.42, H], [0.5, H + 0.12], [0.36, H + 0.3]], { color: body, y: PAD_TOP, seg: 12, flat: true });
  // buttresses
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    b.group({ ry: a }, () => b.wedge(0.26, 1.7, 1.15, { color: shade(body, 0.85), z: 1.0, y: PAD_TOP }));
  }
  // intake rings
  for (let k = 0; k < 3; k++) {
    const y = PAD_TOP + 1.9 + k * 0.85;
    const r = 0.53 - k * 0.025;
    b.cyl(r + 0.04, r + 0.04, 0.12, { color: 0x2a2e38, y, seg: 12, capTop: false });
    b.cyl(r + 0.05, r + 0.05, 0.04, { color: glow, mat: Mat.Glow, y: y + 0.04, seg: 12, capTop: false, ...NP });
  }
  b.cyl(0.3, 0.3, 0.1, { color: 0xffa040, mat: Mat.Lava, y: PAD_TOP + H + 0.28, seg: 10, ...NP });
  puffs(u, 0.1, PAD_TOP + H + 0.75, 0, 0.42, 0xf4f0ea, 4);
  beacon(u, 0.42, PAD_TOP + H + 0.32, 0);
  beacon(u, -0.42, PAD_TOP + H + 0.32, 0);
  // service halls & landing lights
  hall(u, 1.1, 0.4, 0.45, { x: -0.9, z: 1.65, shed: true });
  hall(u, 0.6, 0.32, 0.4, { x: 1.4, z: 1.2, ry: -0.5 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    beacon(u, Math.sin(a) * 1.9, PAD_TOP + 0.02, Math.cos(a) * 1.9, glow, 0.05);
  }
});

// ═══════════════════════════════════════════════════════════════ sanitation

/** Landfill: terraced garbage mound, part-capped with grass, compactors, a methane flare and the weighbridge. */
export const landfill = factory((u) => {
  const { b } = u;
  pad(u, { color: 0x8a7a5e, edge: 0x5a4e3c, verge: shade(u.verge, 0.9) });
  const trash = [0x8a8270, 0x6a7a8a, 0xa08a6a, 0x7a6a5a, 0x9a9a8a];
  // terraced mound
  b.lathe([[2.05, 0], [1.75, 0.22], [1.45, 0.3], [1.1, 0.55], [0.75, 0.62], [0.3, 0.78], [0, 0.8]], { color: 0x7a7060, x: -0.15, z: -0.35, y: PAD_TOP, seg: 10, flat: true });
  // capped (grassed) cell
  b.lathe([[1.0, 0], [0.8, 0.2], [0.35, 0.3], [0, 0.32]], { color: C.leaf, x: -1.0, z: -0.95, y: PAD_TOP + 0.3, seg: 8, flat: true });
  // fresh dumps
  for (let k = 0; k < 6; k++) {
    const a = k * 1.1 + 0.4, r = 0.55 + (k % 3) * 0.32;
    heap(u, 0.2 + (k % 2) * 0.08, 0.14, -0.15 + Math.sin(a) * r, -0.35 + Math.cos(a) * r, trash[k % trash.length], { seg: 5, y: PAD_TOP + 0.45 + (k % 3 === 0 ? 0.15 : 0) });
  }
  // litter speckles: the colourful bits that make a landfill read as one from orbit
  const bits = [0xd84a3a, 0x3a7ad8, 0xf2d24a, 0xf2f2f2, 0x4ac060, 0xe87ab0];
  for (let k = 0; k < 12; k++) {
    const a = k * 2.4, r = 0.35 + (k % 4) * 0.33;
    const x = -0.15 + Math.sin(a) * r, z = -0.35 + Math.cos(a) * r;
    const yy = r < 0.6 ? 0.66 : r < 0.9 ? 0.55 : r < 1.2 ? 0.32 : 0.24;
    b.box(0.08, 0.04, 0.06, { color: bits[k % bits.length], x, z, y: PAD_TOP + yy, ry: a, ...NP, detail: true });
  }
  // compactor + dozer on top
  truck(u, 0.25, -0.1, 0.8, { color: C.yellow, cargo: C.yellow, y: PAD_TOP + 0.6 });
  truck(u, -0.6, 0.35, -0.6, { color: C.orange, cargo: 0x8a8270, y: PAD_TOP + 0.42 });
  // methane flare
  b.cyl(0.05, 0.06, 0.9, { color: C.steelDark, x: 1.6, z: -1.1, y: PAD_TOP, seg: 6 });
  b.cone(0.07, 0.2, { color: 0xffa040, mat: Mat.Lava, x: 1.6, z: -1.1, y: PAD_TOP + 0.9, seg: 6, ...NP });
  // weighbridge & scale house by the gate
  b.box(0.7, 0.03, 0.26, { color: C.steelDark, x: 0.85, z: 1.55, y: PAD_TOP, ry: 0.2, ...NP });
  hall(u, 0.4, 0.26, 0.32, { x: 1.45, z: 1.35, gear: false });
  truck(u, 0.6, 1.6, 1.8, { color: C.green, cargo: C.green });
  fence(u, 2.42, { color: 0x5a6a5a });
  lamp(u, 1.9, 1.0);
});

/** Recycling centre: sorting hall, colourful bale stacks, conveyors, roll-off containers. */
export const recyclingCentre = factory((u) => {
  const { b } = u;
  pad(u);
  const green = 0x3ab060;
  hall(u, 1.9, 0.62, 0.95, { x: -0.25, z: -0.6, color: u.sid === 'classic' ? 0xdfe8e2 : u.wall, roof: green, shed: true });
  b.box(1.95, 0.05, 0.06, { color: green, x: -0.25, z: -0.11, y: PAD_TOP + 0.4 });
  for (let k = 0; k < 3; k++) door(u, 0.32, 0.3, -0.85 + k * 0.6, -0.125);
  // recycling emblem
  b.torus(0.17, 0.03, { color: 0x6aff8a, mat: Mat.Glow, x: 0.55, y: PAD_TOP + 0.95, z: -0.6, rx: Math.PI / 2, seg: 12, tube: 3, ...NP });
  b.cyl(0.02, 0.02, 0.3, { color: C.steelDark, x: 0.55, z: -0.6, y: PAD_TOP + 0.62, seg: 4, ...DET });
  // bale stacks in sorted colours
  const bales = [0x3a7ad8, 0x4ac060, 0xf2f2f2, 0x9a7a4a, 0xd8c040, 0xd85a4a];
  for (let i = 0; i < 6; i++) {
    const x = -1.55 + (i % 3) * 0.45, z = 0.45 + Math.floor(i / 3) * 0.42;
    for (let h = 0; h < 1 + ((i * 7) % 3); h++) b.box(0.3, 0.2, 0.3, { color: shade(bales[i], 1 - h * 0.08), x, z, y: PAD_TOP + h * 0.2, ry: h * 0.1, ...NP });
  }
  // sorting conveyor into the hall + intake hopper
  conveyor(u, [1.35, PAD_TOP + 0.08, 0.4], [0.55, PAD_TOP + 0.45, -0.1], { color: green });
  b.cyl(0.24, 0.12, 0.3, { color: C.steel, x: 1.4, z: 0.45, y: PAD_TOP + 0.05, seg: 6 });
  // roll-off containers and trucks
  container(u, 1.6, PAD_TOP, -0.55, 0x3a7ad8, 0.2);
  container(u, 1.85, PAD_TOP, -0.2, 0x4ac060, 0.2);
  container(u, 1.4, PAD_TOP, -0.95, 0xd8c040, 0.2);
  truck(u, 0.4, 1.45, 1.4, { color: green, cargo: C.white });
  truck(u, 1.05, 1.2, -0.4, { color: green, cargo: green });
  fence(u, 2.42);
  lamp(u, -0.4, 1.95);
});

/** Waste-to-energy incinerator: tipping hall, boiler, a single elegant stack — and a ski slope on the roof. */
export const incinerator = factory((u) => {
  const { b } = u;
  pad(u);
  const clad = u.sid === 'classic' ? 0xa8b4bc : shade(u.wall, 0.9);
  // the main block, stepped so the roof can be a ski slope
  b.box(2.2, 0.9, 1.2, { color: clad, x: 0, z: -0.4, y: PAD_TOP, top: clad });
  b.group({ x: 0, z: -0.4, y: PAD_TOP + 0.9 }, () => {
    b.wedge(1.2, 0.75, 2.2, { color: clad, ry: -Math.PI / 2 });
    b.wedge(0.55, 0.75, 2.16, { color: 0x7ac85a, mat: Mat.Foliage, ry: -Math.PI / 2, z: 0.25, y: 0.03, ...NP });
    b.wedge(0.08, 0.75, 2.16, { color: 0xf4f8ff, ry: -Math.PI / 2, z: 0.25, y: 0.034, ...NP, detail: true });
  });
  // aluminium fins on the facade
  for (let k = 0; k < 9; k++) b.box(0.04, 0.85, 0.06, { color: 0xd8dde2, x: -1.0 + k * 0.25, z: 0.21, y: PAD_TOP + 0.03, ...DET });
  ribbon(u, 2.2, 1.2, PAD_TOP, PAD_TOP + 0.9, { z: -0.4 });
  // ski run lights & lift pylons
  for (let k = 0; k < 4; k++) {
    const t = (k + 0.5) / 4;
    beacon(u, -1.05 + t * 2.1, PAD_TOP + 0.9 + 0.75 * (1 - t) + 0.05, -0.4, C.lamp, 0.035);
  }
  // stack with steam
  stack(u, 0.16, 2.6, 1.35, -1.45, { color: C.offwhite, smoke: C.steam, puffs: 2 });
  // tipping bays & refuse trucks
  for (let k = 0; k < 3; k++) door(u, 0.3, 0.28, -0.75 + k * 0.5, 0.2);
  truck(u, -0.5, 0.75, 0.1, { color: C.green, cargo: C.green });
  truck(u, 0.35, 1.0, 0.6, { color: C.green, cargo: C.green });
  transformers(u, 1.55, 0.5, 2, { ry: -0.5 });
  parking(u, -1.2, 1.55, 5, { gap: 0.11 });
  fence(u, 2.42);
  lamp(u, 0.6, 1.95);
});

/** Matter recycler: a black disassembler pyramid unmaking trash into glowing element canisters. */
export const matterRecycler = factory((u) => {
  const { b } = u;
  pad(u, { color: 0x5a5e6a, edge: 0x2c3038, verge: 0x3a3e48 });
  const glow = 0xb07aff, cyan = 0x5ae8ff;
  b.prism(4, 1.35, 0.25, { color: 0x4a4e5a, y: PAD_TOP, ry: Math.PI / 4, top: 0x3a3e48 });
  b.pyramid(1.6, 1.7, 1.6, { color: 0x3a3550, y: PAD_TOP + 0.25 });
  // glowing atomizer seam & core
  b.torus(0.78, 0.035, { color: glow, mat: Mat.Glow, y: PAD_TOP + 0.85, seg: 4, tube: 3, ry: Math.PI / 4, ...NP });
  b.torus(0.42, 0.03, { color: cyan, mat: Mat.Glow, y: PAD_TOP + 1.42, seg: 4, tube: 3, ry: Math.PI / 4, ...NP });
  b.sphere(0.13, { color: 0xffffff, mat: Mat.Glow, y: PAD_TOP + 2.08, wSeg: 8, hSeg: 5, ...NP });
  b.torus(0.32, 0.02, { color: glow, mat: Mat.Glow, y: PAD_TOP + 2.08, rx: 1.2, seg: 14, tube: 3, ...NP, detail: true });
  // intake conveyor with trash, output canisters
  conveyor(u, [0, PAD_TOP + 0.15, 2.0], [0, PAD_TOP + 0.35, 0.85], { color: 0x4a4e58 });
  for (let k = 0; k < 3; k++) b.box(0.08, 0.06, 0.08, { color: [0x9a8a6a, 0x6a7a8a, 0xa06a5a][k], x: 0, z: 1.25 + k * 0.22, y: PAD_TOP + 0.24 + (2 - k) * 0.05, ry: k, ...NP, detail: true });
  const elems = [0xff5a4a, 0xffd04a, 0x5aff8a, 0x5ae8ff, 0xb07aff, 0xffffff];
  for (let k = 0; k < 6; k++) {
    const a = -0.9 + (k / 5) * 1.8;
    const x = Math.sin(a + Math.PI) * 1.75, z = Math.cos(a + Math.PI) * 1.75;
    b.cyl(0.13, 0.13, 0.42, { color: 0x3a3e48, x, z, y: PAD_TOP, seg: 8 });
    b.cyl(0.1, 0.1, 0.3, { color: elems[k], mat: Mat.Glow, x, z, y: PAD_TOP + 0.06, seg: 8, ...NP });
    b.cyl(0.14, 0.14, 0.04, { color: 0x5a5e6a, x, z, y: PAD_TOP + 0.42, seg: 8 });
  }
  holoDisc(u, 0.25, 1.5, PAD_TOP + 0.75, 1.3, cyan);
  b.box(0.8, 0.32, 0.4, { color: 0x34373f, x: -1.45, z: 1.3, y: PAD_TOP, ry: 0.5, top: 0x2a2d35 });
  glowBox(u, 0.6, 0.03, 0.01, -1.35, PAD_TOP + 0.22, 1.49, cyan, { ry: 0.5 });
});

// ═══════════════════════════════════════════════════════════════ data

/** Comms tower: red-and-white lattice mast with dishes and panel antennas over an equipment hut. */
export const commsTower = factory((u) => {
  const { b } = u;
  pad(u);
  const H = 2.7;
  lattice(u, H, 0.5, 0.14, { color: C.red, color2: C.white, levels: 6, r: 0.02 });
  for (let k = 0; k < 3; k++) b.box(0.2 - k * 0.03, 0.04, 0.2 - k * 0.03, { color: C.white, y: PAD_TOP + H * (0.3 + k * 0.25), ...DET });
  b.cyl(0.025, 0.025, 0.6, { color: C.white, y: PAD_TOP + H, seg: 5 });
  beacon(u, 0, PAD_TOP + H + 0.62, 0);
  beacon(u, 0.1, PAD_TOP + H * 0.55, 0.1);
  // antennas
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.box(0.06, 0.26, 0.03, { color: C.white, x: Math.sin(a) * 0.12, z: Math.cos(a) * 0.12, y: PAD_TOP + H * 0.82, ry: a });
  }
  dish(u, 0.16, 0.13, PAD_TOP + H * 0.62, 0.0, { tilt: 0.2, ry: Math.PI / 2, seg: 10, feed: false });
  dish(u, 0.12, -0.1, PAD_TOP + H * 0.45, -0.08, { tilt: 0.15, ry: -2.2, seg: 10, feed: false });
  hall(u, 0.42, 0.26, 0.3, { x: 0.35, z: 0.45, gear: false, shed: true });
  b.box(0.22, 0.12, 0.16, { color: C.steel, x: -0.4, z: 0.45, y: PAD_TOP, ...DET });
  fence(u, 0.9);
});

/** Data centre: windowless server halls with accent light bars, rooftop chillers, backup generators. */
export const dataCentre = factory((u) => {
  const { b } = u;
  pad(u);
  const shell = u.sid === 'classic' ? 0x3e4452 : shade(u.wall, u.sid === 'cyber' ? 1 : 0.6);
  const glow = u.sid === 'classic' ? 0x7a8aff : u.accent;
  for (let i = 0; i < 2; i++) {
    const z = -1.05 + i * 0.95;
    b.box(2.6, 0.62, 0.75, { color: shell, x: -0.1, z, y: PAD_TOP, top: shade(shell, 0.8) });
    glowBox(u, 2.62, 0.035, 0.76, -0.1, PAD_TOP + 0.5, z, glow);
    for (let k = 0; k < 6; k++) {
      const x = -1.2 + k * 0.44;
      b.cyl(0.13, 0.13, 0.06, { color: C.steel, x, z, y: PAD_TOP + 0.62, seg: 8 });
      b.cyl(0.1, 0.1, 0.01, { color: C.iron, x, z, y: PAD_TOP + 0.68, seg: 8, ...DET });
    }
  }
  // entrance block + security
  lobby(u, 0.7, 0.34, 0.4, -0.6, 0.95);
  b.box(0.75, 0.04, 0.45, { color: u.trim, x: -0.6, z: 0.95, y: PAD_TOP + 0.34 });
  holoDisc(u, 0.16, -0.6, PAD_TOP + 0.62, 1.1, glow);
  // generators & fuel
  for (let k = 0; k < 3; k++) container(u, 1.0 + k * 0.28, PAD_TOP, 0.9, 0xd8dce2, 0);
  tank(u, 0.16, 0.3, 1.85, 0.45, { color: C.white, band: C.yellow, dome: false });
  transformers(u, 1.6, -0.15, 2, { ry: Math.PI / 2 });
  parking(u, 0.4, 1.75, 6, { gap: 0.1 });
  fence(u, 2.42);
  lamp(u, -1.6, 1.4);
  lamp(u, 1.3, 1.6);
});

/** Satellite uplink: a farm of dishes aimed at the sky, a radome and the network operations centre. */
export const satelliteUplink = factory((u) => {
  const { b } = u;
  pad(u);
  const dishes: [number, number, number, number, number][] = [
    [-1.1, -0.85, 0.85, 0.75, 0.6],
    [0.75, -1.1, 0.65, 0.9, -0.4],
    [1.35, 0.25, 0.45, 0.6, -1.4],
    [-1.65, 0.45, 0.4, 0.8, 1.2],
  ];
  for (const [x, z, r, tilt, ry] of dishes) {
    b.cyl(r * 0.18, r * 0.26, r * 0.7, { color: C.white, x, z, y: PAD_TOP, seg: 8 });
    dish(u, r, x, PAD_TOP + r * 0.7, z, { tilt, ry, seg: 14 });
  }
  // radome
  b.cyl(0.4, 0.42, 0.25, { color: C.white, x: -0.05, z: 0.15, y: PAD_TOP, seg: 12 });
  b.sphere(0.48, { color: C.white, x: -0.05, z: 0.15, y: PAD_TOP + 0.6, wSeg: 10, hSeg: 6, flat: true });
  // operations centre
  hall(u, 1.1, 0.4, 0.5, { x: 0.2, z: 1.4 });
  lobby(u, 0.36, 0.28, 0.1, 0.0, 1.7);
  b.box(0.5, 0.03, 0.02, { color: u.accent, mat: Mat.Glow, x: 0.45, z: 1.655, y: PAD_TOP + 0.3, ...NP, detail: true });
  fence(u, 2.42);
  lamp(u, -0.9, 1.75);
  shrub(u, 1.3, 1.6, 0.12);
});

/** Quantum relay: a cryostat chandelier in a glass column, ringed by levitating entanglement halos. */
export const quantumRelay = factory((u) => {
  const { b } = u;
  pad(u, { color: 0x3a3e48, edge: 0x22252c });
  const violet = 0xb07aff, cyan = 0x7af0ff, gold = 0xf2c66a;
  b.prism(6, 0.62, 0.18, { color: 0x2c3038, y: PAD_TOP, ry: Math.PI / 6, top: 0x34373f });
  // the chandelier (stacked gold plates) in a glass column
  for (let k = 0; k < 4; k++) b.cyl(0.24 - k * 0.04, 0.24 - k * 0.04, 0.03, { color: gold, y: PAD_TOP + 0.35 + k * 0.22, seg: 10 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    b.cyl(0.012, 0.012, 0.7, { color: gold, x: Math.sin(a) * 0.12, z: Math.cos(a) * 0.12, y: PAD_TOP + 0.35, seg: 3, ...DET });
  }
  b.cyl(0.3, 0.3, 1.1, { color: 0x9ad8ff, mat: Mat.Holo, y: PAD_TOP + 0.18, seg: 12, capTop: false, ...NP });
  b.cyl(0.33, 0.33, 0.06, { color: 0x2c3038, y: PAD_TOP + 1.28, seg: 12 });
  // spire with entanglement halos
  b.cone(0.1, 1.5, { color: 0x34373f, y: PAD_TOP + 1.34, seg: 6 });
  b.torus(0.42, 0.02, { color: violet, mat: Mat.Glow, y: PAD_TOP + 1.7, rx: 0.3, seg: 18, tube: 3, ...NP });
  b.torus(0.32, 0.02, { color: cyan, mat: Mat.Glow, y: PAD_TOP + 2.1, rz: 0.4, seg: 16, tube: 3, ...NP });
  b.torus(0.22, 0.02, { color: violet, mat: Mat.Glow, y: PAD_TOP + 2.45, rx: -0.4, seg: 14, tube: 3, ...NP, detail: true });
  b.sphere(0.07, { color: 0xffffff, mat: Mat.Glow, y: PAD_TOP + 2.9, wSeg: 6, hSeg: 4, ...NP });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    b.box(0.08, 0.3, 0.08, { color: 0x34373f, x: Math.sin(a) * 0.62, z: Math.cos(a) * 0.62, y: PAD_TOP });
    glowBox(u, 0.05, 0.05, 0.05, Math.sin(a) * 0.62, PAD_TOP + 0.31, Math.cos(a) * 0.62, cyan);
  }
});
