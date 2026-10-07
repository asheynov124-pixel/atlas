/**
 * utilities · transit meshes (OWNER: utilities).
 *
 *   shuttle stop · shuttle depot · metro station · maglev station · hyperloop terminal · ferry terminal
 *   · drone port · skyport (airport) · spaceport · mass driver · space elevator anchor · teleporter hub · cargo hub
 *
 * Vehicles parked on site (shuttles, maglev trains, ferries, airliners, rockets, sleds, cargo) make each station
 * read as what it is from any zoom. The space elevator tether climbs 120 world units — visible from orbit — and the
 * mass driver's rail overhangs the back of its plot, high above the neighbours.
 */
import { Mat, mix, shade } from '../../kit';
import {
  C, DET, NP, PAD_TOP, beacon, beam, container, disc, door, factory, fence, glowBox, greenRing, hall, holoDisc, lamp, lattice,
  lobby, pad, parking, patch, pipe, pool, puffs, shrub, stripe, tank, transformers, truck, type U,
} from './common';

// ═══════════════════════════════════════════════════════════════ vehicles

/** City shuttle bus (rounded roof, glazing band, accent livery). Faces +Z after `ry`. */
function shuttle(u: U, x: number, z: number, ry: number, o: { color?: number; y?: number; len?: number } = {}): void {
  const { b } = u;
  const len = o.len ?? 0.5;
  const col = o.color ?? u.accent;
  b.group({ x, z, y: (o.y ?? PAD_TOP) + 0.02, ry }, () => {
    b.box(0.16, 0.1, len, { color: C.white });
    b.box(0.165, 0.045, len * 0.92, { color: 0x2a3a50, y: 0.055, ...NP });
    b.box(0.167, 0.02, len, { color: col, y: 0.02, ...NP, detail: true });
    b.cyl(0.08, 0.08, len, { color: C.white, arc: Math.PI, rz: Math.PI / 2, ry: Math.PI / 2, z: -len / 2, y: 0.1, sx: 0.4, seg: 6, capBottom: true, detail: true });
  });
}

/** Low-poly airliner, nose toward +Z after `ry`. */
function airliner(u: U, x: number, z: number, ry: number, o: { s?: number; livery?: number; y?: number } = {}): void {
  const { b } = u;
  const s = o.s ?? 1;
  const liv = o.livery ?? u.accent;
  b.group({ x, z, y: (o.y ?? PAD_TOP) + 0.1 * s, ry, s }, () => {
    b.cyl(0.08, 0.08, 1.1, { color: C.white, rx: Math.PI / 2, z: -0.55, seg: 8 });
    b.sphere(0.08, { color: C.white, z: 0.55, wSeg: 8, hSeg: 3, sy: 1.8, thetaLength: Math.PI / 2, rx: Math.PI / 2 });
    b.cone(0.08, 0.25, { color: C.white, rx: -Math.PI / 2, z: -0.55, seg: 8 });
    b.box(0.165, 0.02, 0.6, { color: liv, y: 0.02, z: -0.05, ...NP, detail: true });
    for (const sd of [-1, 1]) {
      b.box(0.55, 0.018, 0.2, { color: 0xe4e8ee, x: sd * 0.3, z: 0.0, ry: sd * 0.35, y: -0.02 });
      b.cyl(0.035, 0.035, 0.12, { color: 0xb8c0cc, rx: Math.PI / 2, x: sd * 0.25, z: 0.0, y: -0.06, seg: 6, ...DET });
      b.box(0.2, 0.012, 0.08, { color: 0xe4e8ee, x: sd * 0.1, z: -0.68, ry: sd * 0.3, y: 0.04 });
    }
    b.box(0.015, 0.2, 0.16, { color: liv, z: -0.72, y: 0.04, rx: -0.3 });
  });
}

/** Rocket on its pad: lathe body, interstage bands, fins, glowing engine bells. */
function rocket(u: U, x: number, z: number, h: number, o: { y?: number; body?: number; band?: number } = {}): void {
  const { b } = u;
  const y = o.y ?? PAD_TOP;
  const body = o.body ?? C.white;
  const r = h * 0.07;
  b.lathe([[r * 0.8, 0], [r, h * 0.08], [r, h * 0.7], [r * 0.92, h * 0.78], [r * 0.92, h * 0.86], [r * 0.5, h * 0.96], [0, h]], { color: body, x, z, y, seg: 8 });
  b.cyl(r + 0.004, r + 0.004, h * 0.05, { color: o.band ?? C.iron, x, z, y: y + h * 0.36, seg: 8, capTop: false });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    b.box(0.015, h * 0.14, r * 1.3, { color: o.band ?? C.iron, x: x + Math.sin(a) * r * 1.2, z: z + Math.cos(a) * r * 1.2, y: y + h * 0.02, ry: a });
  }
}

/** Sleek maglev train lying along X (nose at +X), sitting on `y`. */
function maglevTrain(u: U, x: number, y: number, z: number, len: number, o: { color?: number } = {}): void {
  const { b } = u;
  const col = o.color ?? C.white;
  b.box(len, 0.16, 0.2, { color: col, x, y, z });
  b.box(len * 0.96, 0.05, 0.205, { color: 0x2a3a50, x, y: y + 0.08, z, ...NP });
  b.box(len, 0.02, 0.207, { color: u.accent, mat: Mat.Glow, x, y: y + 0.03, z, ...NP, detail: true });
  for (const s of [-1, 1]) b.sphere(0.1, { color: col, x: x + s * len * 0.5, y: y + 0.08, z, wSeg: 8, hSeg: 4, sx: 2.2, sy: 0.8, thetaLength: Math.PI, ...DET });
}

// ═══════════════════════════════════════════════════════════════ local transit

/** Shuttle stop: glass shelter, bench, a glowing timetable totem and a shuttle pulling in. */
export const shuttleStop = factory((u) => {
  const { b } = u;
  pad(u, { h: 0.03 });
  patch(u, 1.0, 0.38, 0, 0.42, C.asphalt, { y: PAD_TOP - 0.02 });
  stripe(u, 0.9, 0.025, 0, 0.6, { color: C.yellow, y: PAD_TOP - 0.02 });
  // shelter
  b.box(0.62, 0.025, 0.26, { color: u.accent, x: 0, z: -0.15, y: PAD_TOP + 0.28 });
  b.box(0.6, 0.26, 0.015, { color: 0xa8d0e8, mat: Mat.Glass, x: 0, z: -0.27, y: PAD_TOP + 0.02, ...NP });
  for (const s of [-1, 1]) b.box(0.025, 0.28, 0.24, { color: C.iron, x: s * 0.3, z: -0.15, y: PAD_TOP });
  b.box(0.4, 0.04, 0.08, { color: 0x8a6a4a, x: 0, z: -0.2, y: PAD_TOP + 0.08 });
  glowBox(u, 0.22, 0.14, 0.012, 0.16, PAD_TOP + 0.1, -0.26, 0xff5ad0, { detail: true });
  // totem
  b.box(0.06, 0.42, 0.06, { color: C.iron, x: -0.45, z: 0.12, y: PAD_TOP });
  glowBox(u, 0.12, 0.12, 0.02, -0.45, PAD_TOP + 0.36, 0.15, 0x5ae8ff);
  shuttle(u, 0.05, 0.42, Math.PI / 2, { y: PAD_TOP - 0.02 });
  shrub(u, 0.5, -0.35, 0.12);
  lamp(u, 0.45, 0.05);
});

/** Shuttle depot: a multi-bay garage, charging rows of parked shuttles, wash bay and dispatch office. */
export const shuttleDepot = factory((u) => {
  const { b } = u;
  pad(u, { color: C.asphaltLight });
  hall(u, 2.6, 0.6, 1.0, { x: -0.1, z: -1.15, shed: true });
  for (let k = 0; k < 5; k++) door(u, 0.36, 0.38, -1.05 + k * 0.48, -0.645, { color: u.accent });
  // charging rows
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < 6; k++) {
      const x = -1.25 + k * 0.42, z = 0.05 + r * 0.72;
      if (r === 1 && k > 3) continue;
      if ((k + r) % 4 !== 3) shuttle(u, x, z, 0, { color: [0x3ad0a0, 0xff7a3a, 0x5a9aff][(k + r) % 3] });
      b.box(0.05, 0.22, 0.05, { color: C.iron, x: x + 0.13, z: z - 0.32, y: PAD_TOP, ...DET });
      glowBox(u, 0.04, 0.04, 0.012, x + 0.13, PAD_TOP + 0.16, z - 0.29, 0x5aff8a, { detail: true });
      stripe(u, 0.015, 0.6, x + 0.21, z);
    }
  // wash bay + office
  b.box(0.5, 0.36, 0.6, { color: u.wall2, x: 1.45, z: 0.85, y: PAD_TOP, top: u.roof });
  b.box(0.42, 0.3, 0.02, { color: 0x5ab8ff, mat: Mat.Water, x: 1.45, z: 1.155, y: PAD_TOP, ...NP });
  hall(u, 0.7, 0.4, 0.42, { x: 1.35, z: -0.1 });
  fence(u, 2.42);
  lamp(u, -1.6, 1.4);
  lamp(u, 0.4, 1.9);
});

/** Metro station: a glass canopy over the stairs going down, the glowing M totem and a vent kiosk. */
export const metroStation = factory((u) => {
  const { b } = u;
  pad(u, { color: mix(u.ground, 0xffffff, 0.2) });
  // stair well
  b.box(0.42, 0.012, 0.62, { color: 0x1a1c22, x: 0, z: 0.05, y: PAD_TOP + 0.001, ...NP });
  for (let k = 0; k < 4; k++) b.box(0.4, 0.01, 0.06, { color: 0x6a6e78, x: 0, z: -0.2 + k * 0.13, y: PAD_TOP + 0.004 + k * 0.0, ...NP, detail: true });
  for (const s of [-1, 1]) b.box(0.03, 0.12, 0.62, { color: u.trim, x: s * 0.23, z: 0.05, y: PAD_TOP });
  // glass canopy (sloped)
  b.group({ x: 0, z: 0.05, y: PAD_TOP + 0.38 }, () => {
    b.box(0.6, 0.02, 0.8, { color: u.glass, mat: Mat.Glass, rx: -0.18, ...NP });
    b.box(0.62, 0.03, 0.04, { color: u.accent, z: 0.4, rx: -0.18, ...DET });
  });
  for (const s of [-1, 1]) {
    b.box(0.03, 0.42, 0.03, { color: C.iron, x: s * 0.28, z: 0.4, y: PAD_TOP });
    b.box(0.03, 0.32, 0.03, { color: C.iron, x: s * 0.28, z: -0.3, y: PAD_TOP });
  }
  // M totem
  b.box(0.05, 0.62, 0.05, { color: C.iron, x: 0.5, z: 0.35, y: PAD_TOP });
  b.cyl(0.13, 0.13, 0.04, { color: u.sid === 'classic' ? 0xd8423a : u.accent, mat: Mat.Glow, x: 0.5, z: 0.35, y: PAD_TOP + 0.62, rx: Math.PI / 2, seg: 10, ...NP });
  b.box(0.12, 0.1, 0.045, { color: C.white, mat: Mat.Glow, x: 0.5, z: 0.35, y: PAD_TOP + 0.57, ...NP, detail: true });
  // vent kiosk & greenery
  b.box(0.26, 0.3, 0.26, { color: u.wall, x: -0.48, z: -0.35, y: PAD_TOP, top: u.roof });
  for (let k = 0; k < 3; k++) b.box(0.2, 0.025, 0.012, { color: C.iron, x: -0.48, z: -0.215, y: PAD_TOP + 0.08 + k * 0.06, ...DET });
  shrub(u, -0.5, 0.35, 0.12);
  shrub(u, 0.45, -0.4, 0.1, { tall: true });
});

/** Maglev station: an elevated platform on columns with a glass roof, a sleek train at the platform, escalator towers. */
export const maglevStation = factory((u) => {
  const { b } = u;
  pad(u);
  const deckY = PAD_TOP + 0.75;
  // viaduct deck along X
  b.box(4.6, 0.12, 0.9, { color: C.concrete, y: deckY - 0.12, z: -0.35, top: shade(C.concrete, 0.9) });
  for (let k = 0; k < 5; k++) b.cyl(0.09, 0.11, 0.63, { color: C.concrete, x: -1.8 + k * 0.9, z: -0.35, y: PAD_TOP, seg: 8 });
  b.box(4.6, 0.03, 0.06, { color: u.accent, mat: Mat.Glow, y: deckY - 0.09, z: 0.11, ...NP, detail: true });
  // guideway & platform edge
  b.box(4.6, 0.06, 0.24, { color: 0x6a6e78, y: deckY, z: -0.55 });
  b.box(3.2, 0.06, 0.4, { color: 0xd8d4cc, y: deckY, z: -0.12 });
  maglevTrain(u, 0.1, deckY + 0.1, -0.55, 2.8, { color: u.sid === 'cyber' ? 0x3a3f4e : C.white });
  // glass roof on slender columns
  for (let k = 0; k < 4; k++) b.box(0.04, 0.5, 0.04, { color: C.iron, x: -1.35 + k * 0.9, z: 0.03, y: deckY });
  b.group({ y: deckY + 0.5, z: -0.3 }, () => {
    b.box(3.4, 0.03, 0.8, { color: u.glass, mat: Mat.Glass, rx: 0.12, ...NP });
    b.box(3.42, 0.05, 0.05, { color: u.trim, z: 0.4, ...DET });
  });
  // concourse & escalator towers
  hall(u, 1.6, 0.42, 0.6, { x: 0, z: 0.75 });
  lobby(u, 0.5, 0.34, 0.1, 0, 1.1);
  for (const s of [-1, 1]) {
    b.box(0.3, 0.75, 0.3, { color: u.glass, mat: Mat.Glass, x: s * 1.05, z: 0.35, y: PAD_TOP, top: u.trim, ...NP });
  }
  holoDisc(u, 0.16, 0, PAD_TOP + 0.66, 1.06, u.accent);
  parking(u, -1.1, 1.65, 4, { gap: 0.12 });
  greenRing(u, 2.2, 6, { skipFront: true, s: 0.12 });
  lamp(u, 0.9, 1.75);
});

/** Hyperloop terminal: the vacuum tube arrives through glowing pressure rings into a swooping terminal. */
export const hyperloopTerminal = factory((u) => {
  const { b } = u;
  pad(u, { color: mix(u.ground, 0xffffff, 0.25) });
  const ty = PAD_TOP + 0.55;
  const glow = u.sid === 'classic' ? 0x5ae8ff : u.accent;
  // the tube on pylons, entering from the back-left
  b.cyl(0.2, 0.2, 3.2, { color: 0xd8dde4, rz: Math.PI / 2, x: 1.6, y: ty, z: -0.95, seg: 12 });
  for (let k = 0; k < 4; k++) {
    const x = -1.4 + k * 0.85;
    b.cyl(0.23, 0.23, 0.06, { color: glow, mat: Mat.Glow, rz: Math.PI / 2, x: x + 0.03, y: ty, z: -0.95, seg: 12, capTop: false, ...NP });
    b.box(0.1, ty - PAD_TOP - 0.15, 0.14, { color: C.concrete, x, z: -0.95, y: PAD_TOP });
  }
  // a capsule waiting in the open docking section
  b.cyl(0.13, 0.13, 0.7, { color: C.white, rz: Math.PI / 2, x: 1.75, y: ty, z: -0.35, seg: 10, capBottom: true });
  b.box(0.6, 0.04, 0.27, { color: 0x2a3a50, x: 1.4, y: ty + 0.05, z: -0.35, ...NP, detail: true });
  // swooping terminal: a long vault + glass front
  b.cyl(0.75, 0.75, 2.4, { color: C.white, arc: Math.PI, rz: Math.PI / 2, x: 1.2, z: 0.45, y: PAD_TOP, sz: 0.85, capBottom: true, seg: 10 });
  b.box(2.4, 0.5, 0.05, { color: u.glass, mat: Mat.Glass, z: 1.05, y: PAD_TOP, ...NP });
  b.box(2.42, 0.03, 0.06, { color: glow, mat: Mat.Glow, z: 1.07, y: PAD_TOP + 0.5, ...NP });
  holoDisc(u, 0.22, 0, PAD_TOP + 1.05, 0.45, glow);
  // vacuum pumps & tanks
  tank(u, 0.2, 0.5, -1.6, -0.2, { color: C.white, band: glow });
  tank(u, 0.16, 0.4, -1.75, 0.35, { color: C.white, band: glow });
  pipe(u, [[-1.6, PAD_TOP + 0.3, -0.4], [-1.6, ty, -0.75]], 0.04, C.steel, { detail: true });
  parking(u, 1.3, 1.75, 5, { gap: 0.11 });
  lamp(u, -0.6, 1.8);
  lamp(u, 0.6, 1.9);
});

/** Ferry terminal: a waiting hall with a wave roof, a sheltered basin with a moored ferry, gangway and bollards. */
export const ferryTerminal = factory((u) => {
  const { b } = u;
  pad(u);
  pool(u, 1.3, 0.62, 0, -0.5, { color: 0x2a7ab8 });
  // pier poking out to sea
  b.box(0.22, 0.05, 0.75, { color: 0x8a6a4a, x: 0.52, z: -1.05, y: PAD_TOP, ...NP });
  for (let k = 0; k < 3; k++) b.cyl(0.025, 0.025, 0.3, { color: 0x6a4a32, x: 0.62, z: -0.75 - k * 0.25, y: PAD_TOP - 0.25, seg: 4, ...DET });
  // the ferry
  b.group({ x: -0.08, z: -0.5, y: PAD_TOP + 0.06, ry: Math.PI / 2 }, () => {
    b.extrude([[-0.16, -0.5], [0.16, -0.5], [0.17, 0.25], [0, 0.52], [-0.17, 0.25]], 0.1, { color: C.white, top: 0xc8ccd4 });
    b.box(0.32, 0.012, 0.9, { color: C.navy, y: 0.03, ...NP, detail: true });
    b.box(0.24, 0.12, 0.45, { color: C.white, y: 0.1, z: -0.05 });
    b.box(0.25, 0.04, 0.4, { color: 0x2a3a50, y: 0.15, z: -0.05, ...NP });
    b.box(0.16, 0.08, 0.2, { color: C.white, y: 0.22, z: -0.1 });
    b.cyl(0.03, 0.035, 0.12, { color: u.accent, y: 0.3, z: -0.15, seg: 6 });
  });
  // terminal hall with a wave roof
  b.box(0.8, 0.3, 0.4, { color: u.glass, mat: Mat.Glass, z: 0.45, y: PAD_TOP, top: C.white, ...NP });
  b.cyl(0.3, 0.3, 0.9, { color: C.white, arc: Math.PI, rz: Math.PI / 2, x: 0.45, z: 0.45, y: PAD_TOP + 0.3, sz: 0.75, sx: 0.4, capBottom: true, seg: 8 });
  // gangway, bollards, sign
  beam(u, [0.2, PAD_TOP + 0.12, 0.25], [0.05, PAD_TOP + 0.16, -0.25], 0.08, 0.03, { color: C.steel });
  for (const x of [-0.6, -0.25, 0.25]) b.cyl(0.025, 0.03, 0.06, { color: C.iron, x, z: -0.15, y: PAD_TOP, seg: 5, ...DET });
  b.box(0.04, 0.35, 0.04, { color: C.iron, x: -0.6, z: 0.4, y: PAD_TOP });
  glowBox(u, 0.16, 0.1, 0.02, -0.6, PAD_TOP + 0.35, 0.4, 0x5ae8ff);
});

/** Drone port: a raised rooftop pad with a parked air-taxi, landing lights and a windsock. */
export const dronePort = factory((u) => {
  const { b } = u;
  pad(u);
  // building with a cantilevered pad
  hall(u, 0.7, 0.55, 0.6, { x: 0.05, z: 0.1, gear: false });
  const py = PAD_TOP + 0.56;
  b.cyl(0.5, 0.5, 0.05, { color: 0x3a3e48, y: py, z: -0.05, seg: 12, top: 0x4a4e58 });
  b.torus(0.45, 0.012, { color: C.yellow, y: py + 0.052, z: -0.05, seg: 12, tube: 3, ...NP });
  for (const [x, z, w, d] of [[-0.09, -0.05, 0.035, 0.26], [0.09, -0.05, 0.035, 0.26], [0, -0.05, 0.15, 0.035]] as [number, number, number, number][]) b.box(w, 0.006, d, { color: C.white, x, z, y: py + 0.05, ...NP });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    beacon(u, Math.sin(a) * 0.5, py + 0.05, -0.05 + Math.cos(a) * 0.5, k % 2 ? C.beacon : 0x5aff8a, 0.035);
  }
  // air taxi (quad-rotor) parked off-centre
  b.group({ x: 0.2, z: -0.2, y: py + 0.05 }, () => {
    b.sphere(0.09, { color: C.white, y: 0.06, wSeg: 8, hSeg: 4, sz: 1.5 });
    b.box(0.08, 0.03, 0.1, { color: 0x2a3a50, y: 0.1, z: 0.06, ...NP });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) {
      beam(u, [0, 0.07, 0], [sx * 0.13, 0.1, sz * 0.13], 0.015, 0.015, { color: C.iron, ...DET });
      b.cyl(0.07, 0.07, 0.006, { color: 0x8a9098, x: sx * 0.13, z: sz * 0.13, y: 0.1, seg: 8, ...NP, detail: true });
    }
  });
  // windsock
  b.box(0.02, 0.25, 0.02, { color: C.white, x: -0.4, z: -0.4, y: py + 0.05 });
  b.cone(0.035, 0.14, { color: C.orange, x: -0.4, z: -0.33, y: py + 0.27, rx: Math.PI / 2, seg: 5, ...DET });
  lobby(u, 0.3, 0.26, 0.06, 0.05, 0.42);
  beacon(u, 0.4, py + 0.06, 0.4);
});

// ═══════════════════════════════════════════════════════════════ ports

/** Skyport: a runway across the plot, a terminal with jet bridges, a control tower, hangars and airliners. */
export const skyport = factory((u) => {
  const { b } = u;
  pad(u);
  // runway & taxiway
  patch(u, 8.0, 0.75, 0, -1.9, C.asphalt);
  for (let k = 0; k < 9; k++) stripe(u, 0.36, 0.04, -3.2 + k * 0.8, -1.9);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) stripe(u, 0.25, 0.05, s * 3.55, -2.15 + k * 0.17);
  for (let k = 0; k < 9; k++) beacon(u, -3.6 + k * 0.9, PAD_TOP + 0.02, -1.5, k % 2 ? C.lamp : 0x5ad8ff, 0.035);
  patch(u, 0.35, 1.2, -1.2, -0.95, C.asphaltLight);
  patch(u, 4.2, 1.5, 0.6, 0.15, C.asphaltLight);
  // terminal with a wave roof + jet bridges
  b.box(2.6, 0.45, 0.8, { color: u.glass, mat: Mat.Glass, x: 0.7, z: 1.45, y: PAD_TOP, top: C.white, ...NP });
  b.cyl(0.5, 0.5, 2.8, { color: C.white, arc: Math.PI, rz: Math.PI / 2, x: 2.1, z: 1.45, y: PAD_TOP + 0.45, sz: 0.95, sx: 0.4, capBottom: true, seg: 10 });
  for (let k = 0; k < 3; k++) {
    const x = -0.2 + k * 0.9;
    beam(u, [x, PAD_TOP + 0.24, 1.05], [x + 0.15, PAD_TOP + 0.24, 0.55], 0.1, 0.1, { color: 0xd8dde4 });
    b.box(0.04, 0.22, 0.04, { color: C.iron, x: x + 0.15, z: 0.55, y: PAD_TOP, ...DET });
  }
  airliner(u, -0.05, 0.05, Math.PI, { s: 1.0 });
  airliner(u, 1.75, 0.0, Math.PI, { s: 0.85, livery: 0xff7a3a });
  airliner(u, -2.6, -1.9, Math.PI / 2, { s: 1.0, livery: 0x5a9aff });
  // control tower
  b.cyl(0.12, 0.16, 1.7, { color: C.offwhite, x: -1.9, z: 0.9, y: PAD_TOP, seg: 8 });
  b.cyl(0.3, 0.2, 0.25, { color: u.glass, mat: Mat.Glass, x: -1.9, z: 0.9, y: PAD_TOP + 1.7, seg: 8, top: C.white, ...NP });
  b.cyl(0.32, 0.32, 0.05, { color: C.white, x: -1.9, z: 0.9, y: PAD_TOP + 1.95, seg: 8 });
  b.cyl(0.01, 0.01, 0.3, { color: C.iron, x: -1.9, z: 0.9, y: PAD_TOP + 2.0, seg: 3 });
  beacon(u, -1.9, PAD_TOP + 2.3, 0.9);
  // hangars & radar
  b.cyl(0.45, 0.45, 1.1, { color: 0xc8ccd4, arc: Math.PI, rz: Math.PI / 2, ry: Math.PI / 2, x: 3.1, z: -0.2, y: PAD_TOP, capBottom: true, seg: 8 });
  b.box(0.5, 0.32, 0.02, { color: 0x5a5e66, x: 3.1, z: 0.91, y: PAD_TOP, ...DET });
  b.box(0.9, 0.04, 1.1, { color: 0x8a8e96, x: 3.1, z: 0.35, y: PAD_TOP, ...NP });
  b.cyl(0.04, 0.04, 0.5, { color: C.steelDark, x: -3.0, z: 0.3, y: PAD_TOP, seg: 5 });
  b.box(0.36, 0.1, 0.04, { color: C.white, x: -3.0, z: 0.3, y: PAD_TOP + 0.5, ry: 0.7 });
  parking(u, -0.6, 2.4, 6, { gap: 0.12 });
  parking(u, 1.3, 2.45, 5, { gap: 0.12 });
  tank(u, 0.22, 0.35, 3.2, 1.6, { color: C.white, band: C.red });
  lamp(u, -1.4, 2.6);
  lamp(u, 2.9, 2.4);
});

/** Spaceport: twin launch pads with service towers and rockets, a vehicle assembly building, landing pad and fuel farm. */
export const spaceport = factory((u) => {
  const { b } = u;
  pad(u);
  const pads: [number, number, number][] = [[-2.0, -1.7, 3.2], [1.0, -2.6, 2.5]];
  for (const [x, z, h] of pads) {
    // pad, flame trench, service tower, rocket
    b.cyl(0.8, 0.9, 0.12, { color: C.concrete, x, z, y: PAD_TOP, seg: 10, top: shade(C.concrete, 0.88) });
    b.box(0.3, 0.012, 1.0, { color: 0x2a2624, x, z: z + 0.65, y: PAD_TOP + 0.002, ...NP });
    lattice(u, h + 0.25, 0.32, 0.26, { x: x + 0.42, z, y: PAD_TOP + 0.12, color: C.red, color2: C.white, levels: 2, r: 0.022 });
    for (let k = 0; k < 2; k++) b.box(0.3, 0.025, 0.05, { color: C.iron, x: x + 0.25, z, y: PAD_TOP + 0.12 + h * (0.45 + k * 0.35), ...DET });
    rocket(u, x, z, h, { y: PAD_TOP + 0.12, body: u.sid === 'cyber' ? 0x3a3f4e : C.white, band: u.sid === 'classic' ? C.iron : u.accent });
    beacon(u, x + 0.42, PAD_TOP + h + 0.42, z);
    puffs(u, x - 0.15, PAD_TOP + 0.25, z + 0.7, 0.16, C.steam, 1);
  }
  // vehicle assembly building with a giant flag stripe and doors
  const vab = u.sid === 'cyber' ? 0x4a4f5e : 0xe8eaee;
  b.box(1.4, 1.9, 1.1, { color: vab, x: 2.35, z: 0.1, y: PAD_TOP, top: shade(vab, 0.9) });
  b.box(0.5, 1.6, 0.02, { color: shade(vab, 0.8), x: 2.35, z: 0.66, y: PAD_TOP, ...DET });
  b.box(0.02, 0.7, 0.4, { color: u.accent, x: 1.64, z: -0.1, y: PAD_TOP + 1.0 });
  b.box(0.02, 0.3, 0.4, { color: C.navy, x: 1.64, z: -0.1, y: PAD_TOP + 1.4 });
  beacon(u, 2.35, PAD_TOP + 1.95, 0.1);
  // crawler-transporter path to the pads
  patch(u, 0.5, 2.4, 1.8, -1.3, 0x8a8478, { ry: -0.6 });
  // landing pad with a returned booster
  disc(u, 0.55, -0.45, 0.35, 0x3a3e48);
  b.cyl(0.49, 0.49, 0.02, { color: C.yellow, x: -0.45, z: 0.35, y: PAD_TOP + 0.002, seg: 12, capTop: false, ...NP, detail: true });
  stripe(u, 0.3, 0.05, -0.45, 0.35, { color: C.yellow });
  b.cyl(0.11, 0.12, 1.1, { color: 0xd8d4cc, x: -0.3, z: 0.35, y: PAD_TOP + 0.02, seg: 8 });
  b.cone(0.11, 0.18, { color: C.iron, x: -0.3, z: 0.35, y: PAD_TOP + 1.12, seg: 8 });
  // fuel farm (cryogenic spheres)
  for (const [x, z, r] of [[-3.2, 0.6, 0.32], [-2.6, 1.1, 0.28]] as [number, number, number][]) {
    b.sphere(r, { color: C.white, x, z, y: PAD_TOP + r + 0.08, wSeg: 8, hSeg: 5 });
    b.cyl(r * 0.5, r * 0.6, 0.08, { color: C.steelDark, x, z, y: PAD_TOP, seg: 8 });
  }
  // mission control by the gate
  hall(u, 1.6, 0.5, 0.7, { x: 0.15, z: 2.65 });
  lobby(u, 0.6, 0.36, 0.12, 0.15, 3.06);
  holoDisc(u, 0.3, 0.15, PAD_TOP + 0.95, 2.65, 0x5ae8ff);
  parking(u, -1.55, 2.75, 5, { gap: 0.14 });
  for (let k = 0; k < 2; k++) b.box(0.03, 0.9, 0.03, { color: C.iron, x: 1.35 + k * 0.25, z: 2.55, y: PAD_TOP, ...DET });
  b.box(0.36, 0.2, 0.012, { color: u.accent, x: 1.48, z: 2.56, y: PAD_TOP + 0.66, ...DET });
  lamp(u, -0.8, 3.4);
  lamp(u, 1.1, 3.3);
});

/** Mass driver: an electromagnetic rail climbing off the back of the plot, coil rings glowing, a sled waiting at the breech. */
export const massDriver = factory((u) => {
  const { b } = u;
  pad(u, { color: shade(u.ground, 0.9) });
  const glow = u.sid === 'classic' ? 0x5ae8ff : u.accent;
  // rail from the breech (z +1.3, low) up and out over the back (z −4.6, high)
  const z0 = 1.3, y0 = PAD_TOP + 0.35, z1 = -4.6, y1 = PAD_TOP + 4.2;
  const at = (t: number): [number, number] => [z0 + (z1 - z0) * t, y0 + (y1 - y0) * t * t * 0.55 + (y1 - y0) * t * 0.45];
  for (let k = 0; k < 6; k++) {
    const [za, ya] = at(k / 6), [zb, yb] = at((k + 1) / 6);
    for (const s of [-1, 1]) beam(u, [s * 0.16, ya + 0.04, za], [s * 0.16, yb + 0.04, zb], 0.06, 0.06, { color: 0x8a909c });
    beam(u, [0, ya - 0.02, za], [0, yb - 0.02, zb], 0.5, 0.07, { color: shade(C.concrete, 0.85) });
    beam(u, [0, ya + 0.0, za], [0, yb + 0.0, zb], 0.08, 0.012, { color: glow, mat: Mat.Glow, ...NP, detail: true });
  }
  // coil rings along the rail
  for (let k = 0; k < 9; k++) {
    const t = (k + 0.5) / 9;
    const [z, y] = at(t);
    const [z2, y2] = at(t + 0.01);
    const pitch = Math.atan2(y2 - y, z - z2);
    b.group({ z, y: y + 0.06 }, () => {
      b.torus(0.27, 0.035, { color: k % 3 === 0 ? glow : 0x3a3f4a, mat: k % 3 === 0 ? Mat.Glow : Mat.Plain, rx: pitch - Math.PI / 2, seg: 10, tube: 3, ...NP });
    });
  }
  // A-frame pylons of rising height
  for (let k = 1; k < 5; k++) {
    const [z, y] = at(k / 5);
    for (const s of [-1, 1]) beam(u, [s * 0.45, PAD_TOP, z], [s * 0.16, y - 0.04, z], 0.07, 0.07, { color: C.concrete });
    b.box(0.5, 0.06, 0.1, { color: C.concrete, z, y: y - 0.1 });
  }
  // breech building, sled with payload, capacitor banks
  hall(u, 1.2, 0.5, 0.7, { x: 0, z: 1.75, shed: true });
  b.box(0.22, 0.12, 0.42, { color: C.white, y: y0 + 0.06, z: z0 - 0.15 });
  b.cone(0.11, 0.2, { color: u.accent, rx: -Math.PI / 2, y: y0 + 0.12, z: z0 - 0.36, seg: 6 });
  for (let k = 0; k < 4; k++) {
    for (const s of [-1, 1]) {
      const x = s * (1.05 + (k % 2) * 0.35), z = 0.6 - Math.floor(k / 2) * 0.55;
      b.cyl(0.14, 0.14, 0.5, { color: 0x3a3f4a, x, z, y: PAD_TOP, seg: 8 });
      b.cyl(0.145, 0.145, 0.04, { color: glow, mat: Mat.Glow, x, z, y: PAD_TOP + 0.4, seg: 8, capTop: false, ...NP });
    }
  }
  transformers(u, -1.45, 1.55, 2, { ry: 0.4 });
  beacon(u, 0, y1 + 0.35, z1 + 0.05);
  lamp(u, 1.3, 1.6);
});

/** Space elevator anchor: a stepped citadel, buttresses, an anchor ring and the tether climbing 120 units to orbit. */
export const elevatorBase = factory((u) => {
  const { b } = u;
  pad(u);
  const body = u.sid === 'cyber' ? 0x3a3f4e : 0xe8eaee;
  const glow = u.sid === 'classic' ? 0x7ae8ff : u.accent;
  // stepped octagonal citadel
  for (let k = 0; k < 3; k++) b.prism(8, 2.6 - k * 0.7, 0.35, { color: shade(body, 1 - k * 0.06), y: PAD_TOP + k * 0.35, ry: Math.PI / 8, top: shade(body, 0.9) });
  for (let k = 0; k < 3; k++) b.prism(8, 2.6 - k * 0.7 + 0.01, 0.04, { color: glow, mat: Mat.Glow, y: PAD_TOP + k * 0.35 + 0.28, ry: Math.PI / 8, capTop: false, ...NP, detail: k > 0 });
  // buttresses rising to the socket
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    beam(u, [Math.sin(a) * 2.2, PAD_TOP + 0.35, Math.cos(a) * 2.2], [Math.sin(a) * 0.4, PAD_TOP + 2.6, Math.cos(a) * 0.4], 0.22, 0.22, { color: shade(body, 0.92) });
  }
  b.cyl(0.55, 0.75, 1.6, { color: body, y: PAD_TOP + 1.05, seg: 12 });
  b.cyl(0.42, 0.55, 0.4, { color: shade(body, 0.85), y: PAD_TOP + 2.65, seg: 12 });
  // anchor ring station
  b.torus(1.25, 0.12, { color: body, y: PAD_TOP + 2.35, seg: 20, tube: 5 });
  b.torus(1.25, 0.13, { color: glow, mat: Mat.Glow, y: PAD_TOP + 2.35, seg: 20, tube: 3, sy: 0.25, ...NP });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    beam(u, [Math.sin(a) * 0.5, PAD_TOP + 2.35, Math.cos(a) * 0.5], [Math.sin(a) * 1.15, PAD_TOP + 2.35, Math.cos(a) * 1.15], 0.06, 0.06, { color: shade(body, 0.85) });
  }
  // the tether: 120 units of carbon ribbon, beacon bands every 12 units, a climber on its way up
  const top = 120;
  b.cyl(0.07, 0.11, top, { color: 0x2a2e38, y: PAD_TOP + 3.0, seg: 6, capTop: false });
  for (let k = 1; k <= 9; k++) b.cyl(0.14, 0.14, 0.3, { color: glow, mat: Mat.Glow, y: PAD_TOP + 3.0 + k * 12, seg: 6, capTop: false, ...NP });
  b.group({ y: PAD_TOP + 9.5 }, () => {
    b.prism(6, 0.32, 0.55, { color: C.white, top: shade(C.white, 0.9) });
    b.prism(6, 0.33, 0.06, { color: glow, mat: Mat.Glow, y: 0.24, capTop: false, ...NP });
    b.cone(0.3, 0.2, { color: C.white, y: 0.55, seg: 6 });
  });
  b.sphere(0.25, { color: 0xffffff, mat: Mat.Glow, y: PAD_TOP + 3.0 + top, wSeg: 6, hSeg: 4, ...NP });
  // terminal halls & maglev feeder by the gate
  hall(u, 1.8, 0.5, 0.7, { x: -1.6, z: 2.6, ry: 0.35 });
  hall(u, 1.4, 0.45, 0.6, { x: 1.75, z: 2.55, ry: -0.35 });
  lobby(u, 0.8, 0.4, 0.2, 0, 3.15);
  holoDisc(u, 0.35, 0, PAD_TOP + 1.0, 3.2, glow);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    beacon(u, Math.sin(a) * 2.6, PAD_TOP + 0.38, Math.cos(a) * 2.6, glow, 0.06);
  }
  greenRing(u, 4.0, 10, { skipFront: true, s: 0.15, tall: true });
});

/** Teleporter hub: a standing ring gate humming with light over a glyph-ringed dais, flanked by emitter pylons. */
export const teleporterHub = factory((u) => {
  const { b } = u;
  pad(u, { color: 0xd8dce6, edge: 0x8a90a0 });
  const glow = u.sid === 'classic' ? 0x7af0ff : u.accent;
  const glow2 = 0xc08aff;
  // dais
  b.cyl(1.35, 1.5, 0.18, { color: 0x4a4e5a, y: PAD_TOP, seg: 16, top: 0x5a5e6a });
  b.torus(1.2, 0.025, { color: glow, mat: Mat.Glow, y: PAD_TOP + 0.185, seg: 20, tube: 3, ...NP });
  b.cyl(0.85, 0.85, 0.02, { color: glow, mat: Mat.Holo, y: PAD_TOP + 0.18, seg: 16, ...NP });
  // the ring gate
  b.group({ y: PAD_TOP + 1.25, z: -0.1 }, () => {
    b.torus(1.0, 0.13, { color: 0xe8ecf2, rx: Math.PI / 2, seg: 22, tube: 6 });
    b.torus(0.88, 0.04, { color: glow, mat: Mat.Glow, rx: Math.PI / 2, seg: 22, tube: 3, ...NP });
    b.cyl(0.84, 0.84, 0.01, { color: glow2, mat: Mat.Holo, rx: Math.PI / 2, seg: 18, ...NP });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.box(0.14, 0.22, 0.32, { color: 0x4a4e5a, x: Math.sin(a) * 1.08, y: Math.cos(a) * 1.08, rz: -a, ...DET });
    }
  });
  for (const s of [-1, 1]) b.box(0.3, 0.3, 0.4, { color: 0x4a4e5a, x: s * 0.95, z: -0.1, y: PAD_TOP + 0.15 });
  // emitter pylons
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.sin(a) * 1.95, z = Math.cos(a) * 1.95;
    b.prism(4, 0.14, 1.2, { color: 0xe8ecf2, x, z, y: PAD_TOP, ry: a });
    b.sphere(0.1, { color: glow, mat: Mat.Glow, x, z, y: PAD_TOP + 1.32, wSeg: 6, hSeg: 4, ...NP });
    beam(u, [x, PAD_TOP + 1.32, z], [x * 0.4, PAD_TOP + 1.25, z * 0.4 - 0.1], 0.02, 0.02, { color: glow, mat: Mat.Glow, ...NP, detail: true });
  }
  // queue pavilion by the road
  hall(u, 1.2, 0.36, 0.45, { x: 0, z: 1.85, color: 0xf4f6fa, roof: 0xd8dce6 });
  glowBox(u, 1.0, 0.03, 0.01, 0, PAD_TOP + 0.3, 2.08, glow);
});

/** Cargo hub: a container yard with a rubber-tyred gantry, cross-dock warehouse, truck bays and a drone rack. */
export const cargoHub = factory((u) => {
  const { b } = u;
  pad(u, { color: C.asphaltLight });
  const cols = [0xd8423a, 0x2f7fd6, 0xf2c230, 0x3aa060, 0xe87a2a, 0x8a5ad8, 0xe8e8e8];
  // container stacks
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 5; k++) {
      const x = -1.55 + k * 0.32, z = -1.45 + r * 0.42;
      const h = 1 + ((k * 3 + r * 5) % 3);
      for (let l = 0; l < h; l++) container(u, x, PAD_TOP + l * 0.07, z, cols[(k * 2 + r * 3 + l) % cols.length], Math.PI / 2);
    }
  // rubber-tyred gantry crane over the stacks
  for (const s of [-1, 1]) {
    b.box(0.08, 0.5, 0.08, { color: C.yellow, x: -0.9 + s * 0.95, z: -1.65, y: PAD_TOP });
    b.box(0.08, 0.5, 0.08, { color: C.yellow, x: -0.9 + s * 0.95, z: -0.6, y: PAD_TOP });
    b.box(0.08, 0.06, 1.15, { color: C.yellow, x: -0.9 + s * 0.95, z: -1.12, y: PAD_TOP + 0.5 });
  }
  b.box(2.0, 0.08, 0.1, { color: C.yellow, x: -0.9, z: -1.12, y: PAD_TOP + 0.56 });
  b.box(0.18, 0.12, 0.16, { color: C.white, x: -0.5, z: -1.12, y: PAD_TOP + 0.47 });
  // cross-dock warehouse with truck bays
  hall(u, 1.3, 0.55, 1.6, { x: 1.25, z: -0.55, shed: true });
  for (let k = 0; k < 4; k++) door(u, 0.3, 0.26, 0.59, -1.15 + k * 0.4, { color: u.accent, ry: Math.PI / 2 });
  for (let k = 0; k < 3; k++) truck(u, 0.35, -1.0 + k * 0.42, -Math.PI / 2, { color: [C.red, C.blue, C.green][k], cargo: C.white });
  // drone launch rack
  b.box(0.5, 0.35, 0.3, { color: 0x3a3e48, x: 1.35, z: 1.05, y: PAD_TOP });
  for (let k = 0; k < 3; k++) {
    b.box(0.12, 0.03, 0.12, { color: C.white, x: 1.2 + k * 0.15, z: 1.05, y: PAD_TOP + 0.36, ...DET });
    glowBox(u, 0.04, 0.02, 0.04, 1.2 + k * 0.15, PAD_TOP + 0.4, 1.05, 0x5aff8a, { detail: true });
  }
  truck(u, -0.6, 0.6, 0.5, { color: C.blue, cargo: cols[4] });
  truck(u, -1.3, 0.9, 1.2, { color: C.red, cargo: cols[1] });
  hall(u, 0.6, 0.3, 0.36, { x: -0.3, z: 1.6, gear: false });
  fence(u, 2.42);
  lamp(u, 0.4, 1.9);
  lamp(u, -1.7, 1.2);
});

