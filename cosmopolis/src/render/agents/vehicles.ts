/**
 * OWNER: life.
 * Procedural meshes for everything that moves: hover-cars, vans, shuttles, trucks, taxis, police, ambulances, fire
 * engines, garbage compactors, maglev carriages, hyperloop pods, flying cars, delivery drones, air taxis, airliners,
 * VTOL spaceport shuttles, mass-driver sleds, elevator climbers, boats / hovercraft / ferries / container ships,
 * space whales, birds and alien flyers, orbital haulers, a fallback satellite and pedestrians.
 *
 * Built with the shared kit (content/kit.ts) so the building shader gives them lit windows, night-only head and tail
 * lights (Mat.Light), neon underglow (Mat.Glow) and paintable bodies (instance colour = paint job).
 * Local space: +Y up, +Z forward (nose), origin = ground contact centre for ground / water vehicles and the centre of
 * mass for aircraft and creatures. Units: world units (1 ≈ 20 m); sizes are gently exaggerated for readability.
 * Every factory is deterministic and cheap (≤ ~200 triangles for road vehicles, ≤ ~600 for ships and whales).
 */
import type { BufferGeometry } from 'three';
import { Mat, MeshBuilder } from '../../content/kit';

const WHITE = 0xf4f6f9;
const GLASS = 0x1b2633;
const TRIM = 0x2b3038;
const HEAD = 0xfff0cc;
const TAIL = 0xff2b2b;
const UNDER = 0x5ae4ff;
const NP = { paint: false } as const;
const DET = { detail: true } as const;

/** hover gap: road vehicles float this high above the asphalt */
export const HOVER = 0.016;

function lights(b: MeshBuilder, w: number, len: number, y: number, hw = 0.022): void {
  for (const s of [-1, 1]) {
    b.box(hw, 0.011, 0.006, { color: HEAD, mat: Mat.Light, x: s * (w / 2 - hw / 2 - 0.006), y, z: len / 2, ...NP });
    b.box(hw * 0.9, 0.01, 0.006, { color: TAIL, mat: Mat.Light, x: s * (w / 2 - hw / 2 - 0.006), y, z: -len / 2 - 0.006, ...NP });
  }
}

function underglow(b: MeshBuilder, w: number, len: number, color = UNDER): void {
  b.box(w * 0.7, 0.006, len * 0.72, { color, mat: Mat.Glow, y: HOVER * 0.35, bottom: true, ...NP });
}

// ───────────────────────────────────────────────────────────── road vehicles

/** Hover sedan: paintable body, glass cabin, roof, lights, underglow. */
export function sedan(): BufferGeometry {
  const b = new MeshBuilder();
  const W = 0.11, L = 0.24, y0 = HOVER;
  underglow(b, W, L);
  b.box(W, 0.034, L, { color: WHITE, y: y0 });
  b.box(W * 0.86, 0.026, 0.11, { color: GLASS, y: y0 + 0.034, z: -0.018, ...NP });
  b.wedge(W * 0.86, 0.026, 0.045, { color: GLASS, y: y0 + 0.034, z: 0.059, ...NP });
  b.wedge(W * 0.86, 0.022, 0.03, { color: GLASS, y: y0 + 0.034, z: -0.088, ry: Math.PI, ...NP });
  b.box(W * 0.8, 0.005, 0.1, { color: WHITE, y: y0 + 0.06, z: -0.018 });
  lights(b, W, L, y0 + 0.016);
  return b.build();
}

/** Low sporty hover coupe with a tail fin and a light bar. */
export function coupe(): BufferGeometry {
  const b = new MeshBuilder();
  const W = 0.115, L = 0.25, y0 = HOVER;
  underglow(b, W, L, 0xff5ad8);
  b.box(W, 0.026, L, { color: WHITE, y: y0 });
  b.wedge(W, 0.012, 0.07, { color: WHITE, y: y0 + 0.026, z: 0.09 });
  b.box(W * 0.8, 0.022, 0.09, { color: GLASS, y: y0 + 0.026, z: -0.02, ...NP });
  b.wedge(W * 0.8, 0.022, 0.04, { color: GLASS, y: y0 + 0.026, z: 0.045, ...NP });
  b.box(0.008, 0.03, 0.05, { color: WHITE, y: y0 + 0.026, z: -0.1 });
  b.box(W * 0.9, 0.007, 0.006, { color: TAIL, mat: Mat.Glow, y: y0 + 0.016, z: -L / 2 - 0.004, ...NP });
  for (const s of [-1, 1]) b.box(0.024, 0.008, 0.006, { color: HEAD, mat: Mat.Light, x: s * 0.038, y: y0 + 0.014, z: L / 2, ...NP });
  return b.build();
}

/** Boxy family van / MPV. */
export function van(): BufferGeometry {
  const b = new MeshBuilder();
  const W = 0.115, L = 0.22, y0 = HOVER;
  underglow(b, W, L);
  b.box(W, 0.07, L, { color: WHITE, y: y0 });
  b.wedge(W, 0.022, 0.04, { color: WHITE, y: y0 + 0.07, z: 0.09 });
  b.box(W * 0.96, 0.02, 0.15, { color: WHITE, y: y0 + 0.07, z: -0.035 });
  b.box(W + 0.002, 0.022, 0.15, { color: GLASS, y: y0 + 0.045, z: -0.03, ...NP });
  b.box(W * 0.9, 0.03, 0.004, { color: GLASS, y: y0 + 0.05, z: L / 2 + 0.001, ...NP });
  lights(b, W, L, y0 + 0.02);
  return b.build();
}

/** City shuttle bus: long glazed body, roof pods, glowing destination board. Paint = livery. */
export function bus(): BufferGeometry {
  const b = new MeshBuilder();
  const W = 0.13, L = 0.5, y0 = HOVER;
  underglow(b, W, L);
  b.box(W, 0.035, L, { color: WHITE, y: y0 });
  b.box(W + 0.002, 0.045, L * 0.9, { color: GLASS, y: y0 + 0.035, z: -0.01, ...NP });
  b.box(W, 0.045, 0.03, { color: WHITE, y: y0 + 0.035, z: -L / 2 + 0.015 });
  b.box(W * 0.98, 0.018, L, { color: 0xe8ebef, y: y0 + 0.08, ...NP });
  b.box(W * 0.7, 0.012, 0.16, { color: TRIM, y: y0 + 0.098, z: -0.08, ...NP, ...DET });
  b.box(W * 0.6, 0.012, 0.004, { color: 0xffb43a, mat: Mat.Glow, y: y0 + 0.064, z: L / 2 + 0.001, ...NP });
  lights(b, W, L, y0 + 0.018);
  return b.build();
}

/** Cargo hauler: white cab + paintable container trailer. */
export function truck(): BufferGeometry {
  const b = new MeshBuilder();
  const W = 0.12, y0 = HOVER;
  underglow(b, W, 0.4);
  // cab (front)
  b.box(W, 0.075, 0.1, { color: 0xe9ecf0, y: y0, z: 0.15, ...NP });
  b.wedge(W, 0.02, 0.03, { color: 0xe9ecf0, y: y0 + 0.075, z: 0.17, ...NP });
  b.box(W + 0.002, 0.025, 0.05, { color: GLASS, y: y0 + 0.045, z: 0.165, ...NP });
  b.box(W * 0.9, 0.028, 0.004, { color: GLASS, y: y0 + 0.042, z: 0.2, ...NP });
  // container
  b.box(W, 0.1, 0.28, { color: WHITE, y: y0 + 0.004, z: -0.06 });
  for (let k = 0; k < 4; k++) b.box(W + 0.004, 0.09, 0.006, { color: 0xb8bec6, y: y0 + 0.009, z: -0.18 + k * 0.08, ...NP, ...DET });
  for (const s of [-1, 1]) {
    b.box(0.022, 0.011, 0.006, { color: HEAD, mat: Mat.Light, x: s * 0.042, y: y0 + 0.02, z: 0.2, ...NP });
    b.box(0.02, 0.01, 0.006, { color: TAIL, mat: Mat.Light, x: s * 0.045, y: y0 + 0.012, z: -0.203, ...NP });
  }
  return b.build();
}

/** Taxi: sedan body (paint = yellow) with a glowing roof sign and a checker stripe. */
export function taxi(): BufferGeometry {
  const b = new MeshBuilder();
  const W = 0.11, L = 0.24, y0 = HOVER;
  underglow(b, W, L, 0xffd84a);
  b.box(W, 0.034, L, { color: WHITE, y: y0 });
  b.box(W + 0.002, 0.008, L * 0.8, { color: 0x222222, y: y0 + 0.014, ...NP, ...DET });
  b.box(W * 0.86, 0.026, 0.11, { color: GLASS, y: y0 + 0.034, z: -0.018, ...NP });
  b.wedge(W * 0.86, 0.026, 0.045, { color: GLASS, y: y0 + 0.034, z: 0.059, ...NP });
  b.box(W * 0.8, 0.005, 0.1, { color: WHITE, y: y0 + 0.06, z: -0.018 });
  b.box(0.05, 0.014, 0.022, { color: 0xffe27a, mat: Mat.Glow, y: y0 + 0.065, z: -0.01, ...NP });
  lights(b, W, L, y0 + 0.016);
  return b.build();
}

/** Police cruiser: paint = white body, navy doors, light bar (strobes are drawn as sprites). */
export function police(): BufferGeometry {
  const b = new MeshBuilder();
  const W = 0.112, L = 0.245, y0 = HOVER;
  underglow(b, W, L, 0x5a8aff);
  b.box(W, 0.034, L, { color: WHITE, y: y0 });
  b.box(W + 0.003, 0.022, 0.12, { color: 0x1c2f6e, y: y0 + 0.006, z: -0.005, ...NP });
  b.box(W * 0.86, 0.026, 0.11, { color: GLASS, y: y0 + 0.034, z: -0.018, ...NP });
  b.wedge(W * 0.86, 0.026, 0.045, { color: GLASS, y: y0 + 0.034, z: 0.059, ...NP });
  b.box(W * 0.8, 0.005, 0.1, { color: WHITE, y: y0 + 0.06, z: -0.018 });
  b.box(0.075, 0.01, 0.02, { color: TRIM, y: y0 + 0.065, z: -0.012, ...NP });
  b.box(0.03, 0.009, 0.019, { color: 0x3a6aff, mat: Mat.Glow, x: -0.022, y: y0 + 0.066, z: -0.012, ...NP });
  b.box(0.03, 0.009, 0.019, { color: 0xff3a4a, mat: Mat.Glow, x: 0.022, y: y0 + 0.066, z: -0.012, ...NP });
  lights(b, W, L, y0 + 0.016);
  return b.build();
}

/** Ambulance: tall white box, red band, light bar. */
export function ambulance(): BufferGeometry {
  const b = new MeshBuilder();
  const W = 0.12, L = 0.26, y0 = HOVER;
  underglow(b, W, L, 0xff5a5a);
  b.box(W, 0.06, 0.08, { color: WHITE, y: y0, z: 0.09 });
  b.box(W + 0.002, 0.022, 0.05, { color: GLASS, y: y0 + 0.035, z: 0.105, ...NP });
  b.box(W * 0.92, 0.024, 0.004, { color: GLASS, y: y0 + 0.034, z: 0.131, ...NP });
  b.box(W, 0.1, 0.18, { color: WHITE, y: y0, z: -0.04 });
  b.box(W + 0.003, 0.014, 0.18, { color: 0xe0303a, y: y0 + 0.05, z: -0.04, ...NP });
  b.box(0.07, 0.012, 0.02, { color: TRIM, y: y0 + 0.1, z: 0.035, ...NP });
  b.box(0.028, 0.01, 0.019, { color: 0xff3a3a, mat: Mat.Glow, x: -0.02, y: y0 + 0.101, z: 0.035, ...NP });
  b.box(0.028, 0.01, 0.019, { color: 0xffffff, mat: Mat.Glow, x: 0.02, y: y0 + 0.101, z: 0.035, ...NP });
  lights(b, W, L, y0 + 0.018);
  return b.build();
}

/** Fire engine: long red body, ladder rack, lockers. */
export function fireTruck(): BufferGeometry {
  const b = new MeshBuilder();
  const W = 0.13, L = 0.38, y0 = HOVER;
  underglow(b, W, L, 0xff7a3a);
  b.box(W, 0.075, 0.1, { color: WHITE, y: y0, z: 0.14 });
  b.box(W + 0.002, 0.025, 0.06, { color: GLASS, y: y0 + 0.045, z: 0.155, ...NP });
  b.box(W * 0.92, 0.028, 0.004, { color: GLASS, y: y0 + 0.042, z: 0.191, ...NP });
  b.box(W, 0.085, 0.27, { color: WHITE, y: y0, z: -0.055 });
  for (let k = 0; k < 3; k++) b.box(W + 0.003, 0.05, 0.06, { color: 0xc8ccd2, y: y0 + 0.015, z: -0.15 + k * 0.08, ...NP, ...DET });
  // ladder
  for (const s of [-1, 1]) b.box(0.008, 0.008, 0.32, { color: 0xd8dce2, x: s * 0.03, y: y0 + 0.09, z: -0.04, ...NP });
  for (let k = 0; k < 6; k++) b.box(0.06, 0.006, 0.006, { color: 0xd8dce2, y: y0 + 0.09, z: -0.18 + k * 0.055, ...NP, ...DET });
  b.box(0.08, 0.01, 0.02, { color: TRIM, y: y0 + 0.075, z: 0.15, ...NP });
  lights(b, W, L, y0 + 0.02);
  return b.build();
}

/** Garbage compactor: cab + ribbed hopper body (paint = municipal green). */
export function garbageTruck(): BufferGeometry {
  const b = new MeshBuilder();
  const W = 0.125, L = 0.32, y0 = HOVER;
  underglow(b, W, L, 0x7aff7a);
  b.box(W, 0.07, 0.09, { color: 0xeef0f2, y: y0, z: 0.115, ...NP });
  b.box(W + 0.002, 0.024, 0.05, { color: GLASS, y: y0 + 0.04, z: 0.13, ...NP });
  b.box(W, 0.1, 0.22, { color: WHITE, y: y0, z: -0.045 });
  b.wedge(W, 0.03, 0.06, { color: WHITE, y: y0 + 0.1, z: 0.04 });
  for (let k = 0; k < 3; k++) b.box(W + 0.004, 0.08, 0.008, { color: 0xd8dde2, y: y0 + 0.01, z: -0.12 + k * 0.06, ...NP, ...DET });
  b.box(W * 0.9, 0.08, 0.02, { color: 0x50565e, y: y0 + 0.01, z: -0.165, ...NP });
  b.box(0.04, 0.01, 0.015, { color: 0xffa020, mat: Mat.Glow, y: y0 + 0.07, z: 0.12, ...NP });
  lights(b, W, L, y0 + 0.018);
  return b.build();
}

// ───────────────────────────────────────────────────────────── rail

/** Maglev carriage. `head` = streamlined nose at +Z. White paint with a glowing cyan stripe and a window band. */
export function maglevCar(head: boolean): BufferGeometry {
  const b = new MeshBuilder();
  const W = 0.105, H = 0.085, L = head ? 0.36 : 0.42, y0 = 0.012;
  const z0 = head ? -0.04 : 0;
  b.box(W, H, L - (head ? 0.06 : 0), { color: WHITE, y: y0, z: z0 - (head ? 0.0 : 0) });
  b.box(W + 0.002, 0.024, (L - (head ? 0.08 : 0.02)), { color: GLASS, y: y0 + 0.045, z: z0, ...NP });
  b.box(W + 0.003, 0.007, L - (head ? 0.06 : 0.01), { color: 0x5ae8ff, mat: Mat.Glow, y: y0 + 0.024, z: z0, ...NP });
  b.box(W * 0.8, 0.008, L - 0.08, { color: 0xc8ced8, y: y0 + H, z: z0, ...NP, ...DET });
  b.box(W * 0.75, 0.01, L - 0.04, { color: 0x3a3f4a, y: y0 - 0.01, z: z0, ...NP });
  if (head) {
    const zf = z0 + (L - 0.06) / 2;
    b.group({ y: y0, z: zf }, () => {
      b.box(W, H * 0.55, 0.07, { color: WHITE, z: 0.035 });
      b.wedge(W, H * 0.45, 0.07, { color: GLASS, y: H * 0.55, z: 0.035, ...NP });
      b.box(W * 0.9, 0.012, 0.006, { color: HEAD, mat: Mat.Light, y: 0.02, z: 0.072, ...NP });
    });
  } else {
    for (const s of [-1, 1]) b.box(W * 0.85, 0.06, 0.012, { color: 0x50565e, y: y0 + 0.01, z: s * (L / 2 + 0.004), ...NP, ...DET });
  }
  return b.build();
}

/** Hyperloop capsule: hidden body inside the tube + a glowing collar slightly wider than the tube (a racing light). */
export function hyperPod(): BufferGeometry {
  const b = new MeshBuilder();
  b.cyl(0.05, 0.05, 0.26, { color: 0xe8ecf2, rx: Math.PI / 2, z: -0.13, seg: 8, ...NP });
  b.cyl(0.078, 0.078, 0.07, { color: 0x9a7aff, mat: Mat.Glow, rx: Math.PI / 2, z: -0.035, seg: 10, capTop: false, ...NP });
  b.cyl(0.074, 0.074, 0.03, { color: 0xbfe6ff, mat: Mat.Glow, rx: Math.PI / 2, z: 0.07, seg: 10, capTop: false, ...NP });
  b.cyl(0.074, 0.074, 0.03, { color: 0xbfe6ff, mat: Mat.Glow, rx: Math.PI / 2, z: -0.15, seg: 10, capTop: false, ...NP });
  return b.build();
}

// ───────────────────────────────────────────────────────────── aircraft (origin = centre of mass)

/** Flying car: lifting body with four ducted glow fans. */
export function flyingCar(): BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.1, 0.035, 0.22, { color: WHITE, y: -0.02 });
  b.wedge(0.1, 0.014, 0.06, { color: WHITE, y: 0.015, z: 0.08 });
  b.box(0.08, 0.03, 0.1, { color: GLASS, y: 0.015, z: -0.01, ...NP });
  b.wedge(0.08, 0.03, 0.05, { color: GLASS, y: 0.015, z: 0.065, ...NP });
  for (const [x, z] of [[-0.075, 0.07], [0.075, 0.07], [-0.075, -0.075], [0.075, -0.075]] as [number, number][]) {
    b.cyl(0.04, 0.04, 0.018, { color: TRIM, x, z, y: -0.012, seg: 8, ...NP });
    b.cyl(0.032, 0.032, 0.004, { color: 0x6af0ff, mat: Mat.Glow, x, z, y: -0.014, seg: 8, ...NP, capTop: false, capBottom: true });
  }
  b.box(0.09, 0.008, 0.006, { color: TAIL, mat: Mat.Glow, y: 0.0, z: -0.113, ...NP });
  b.box(0.06, 0.008, 0.006, { color: HEAD, mat: Mat.Light, y: -0.004, z: 0.111, ...NP });
  return b.build();
}

/** Delivery quad-drone carrying a parcel. */
export function drone(): BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.035, 0.014, 0.05, { color: 0xe8ecf0, y: 0.0, ...NP });
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) {
    b.box(0.006, 0.004, 0.05, { color: TRIM, x: x * 0.022, z: z * 0.022, y: 0.008, ry: Math.atan2(x, z), ...NP });
    b.cyl(0.022, 0.022, 0.003, { color: 0x9aa4b0, x: x * 0.04, z: z * 0.04, y: 0.012, seg: 8, ...NP });
  }
  b.box(0.03, 0.026, 0.03, { color: 0xc89a5a, y: -0.028 });
  b.box(0.032, 0.004, 0.032, { color: 0x6a4a2a, y: -0.012, ...NP });
  b.box(0.012, 0.006, 0.006, { color: 0x5affb0, mat: Mat.Glow, y: 0.0, z: 0.026, ...NP });
  return b.build();
}

/** Air taxi: bubble cabin, four rotor booms, skids. */
export function airTaxi(): BufferGeometry {
  const b = new MeshBuilder();
  b.sphere(0.075, { color: WHITE, sz: 1.5, sy: 0.85, wSeg: 10, hSeg: 6 });
  b.sphere(0.06, { color: GLASS, z: 0.04, y: 0.022, sz: 1.2, sy: 0.6, wSeg: 8, hSeg: 4, thetaLength: Math.PI / 2, ...NP });
  b.box(0.03, 0.04, 0.06, { color: WHITE, y: 0.0, z: -0.13 });
  b.box(0.008, 0.035, 0.03, { color: WHITE, y: 0.035, z: -0.15 });
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) {
    b.box(0.008, 0.008, 0.11, { color: 0xc8ccd2, x: x * 0.055, z: z * 0.04, y: 0.03, ry: Math.atan2(x, z) * 0.5, ...NP });
    b.cyl(0.048, 0.048, 0.004, { color: 0x9aa4b0, x: x * 0.09, z: z * 0.075, y: 0.04, seg: 10, ...NP });
    b.cyl(0.012, 0.012, 0.012, { color: TRIM, x: x * 0.09, z: z * 0.075, y: 0.028, seg: 6, ...NP });
  }
  for (const s of [-1, 1]) b.box(0.006, 0.006, 0.14, { color: TRIM, x: s * 0.05, y: -0.07, ...NP, ...DET });
  b.box(0.02, 0.008, 0.006, { color: 0x5affd0, mat: Mat.Glow, y: -0.02, z: 0.11, ...NP });
  return b.build();
}

/** Airliner (matches the skyport's parked fleet): fuselage, swept wings, engines, tail. Paint = livery stripe. */
export function airliner(): BufferGeometry {
  const b = new MeshBuilder();
  b.cyl(0.08, 0.08, 0.95, { color: 0xf6f7f9, rx: Math.PI / 2, z: -0.47, seg: 10, ...NP });
  b.sphere(0.08, { color: 0xf6f7f9, z: 0.48, wSeg: 10, hSeg: 4, sy: 1, sz: 1.8, thetaLength: Math.PI / 2, rx: Math.PI / 2, ...NP });
  b.cone(0.08, 0.28, { color: 0xf6f7f9, rx: -Math.PI / 2, z: -0.47, seg: 10, ...NP });
  for (const s of [-1, 1]) b.box(0.006, 0.026, 0.86, { color: WHITE, x: s * 0.078, y: -0.022, z: -0.05 });
  b.box(0.162, 0.016, 0.62, { color: 0x1c2633, y: 0.028, z: -0.02, ...NP, ...DET });
  // wings
  for (const s of [-1, 1]) {
    b.group({ x: s * 0.33, y: -0.03, z: -0.05, ry: s * -0.45 }, () => {
      b.box(0.6, 0.018, 0.16, { color: 0xdfe3e8, ...NP });
    });
    b.cyl(0.035, 0.035, 0.16, { color: 0xc8ccd2, rx: Math.PI / 2, x: s * 0.24, y: -0.075, z: -0.02, seg: 8, ...NP });
    b.cyl(0.026, 0.026, 0.005, { color: 0x2a2f38, rx: Math.PI / 2, x: s * 0.24, y: -0.075, z: 0.14, seg: 8, ...NP });
    b.group({ x: s * 0.12, y: 0.0, z: -0.68, ry: s * -0.5 }, () => {
      b.box(0.22, 0.012, 0.08, { color: 0xdfe3e8, ...NP });
    });
  }
  b.group({ y: 0.04, z: -0.66 }, () => {
    b.box(0.014, 0.22, 0.16, { color: WHITE, rx: -0.45 });
  });
  return b.build();
}

/** VTOL spaceport shuttle — stands upright (+Y = nose). Black heat-shield belly, canards, glowing engine bell. */
export function shuttle(): BufferGeometry {
  const b = new MeshBuilder();
  const R = 0.14, H = 1.15;
  b.cyl(R, R, H, { color: 0xeef1f5, y: 0, seg: 12, ...NP });
  b.cyl(R + 0.002, R + 0.002, H * 0.92, { color: 0x262a31, y: 0.04, seg: 12, arc: Math.PI, ry: Math.PI / 2, capTop: false, ...NP });
  b.lathe([[R, 0], [R * 0.92, 0.12], [R * 0.7, 0.24], [R * 0.36, 0.34], [0.0, 0.4]], { color: 0xeef1f5, y: H, seg: 12, ...NP });
  b.box(0.04, 0.04, 0.012, { color: GLASS, y: H + 0.12, z: R * 0.78, ...NP, ...DET });
  for (const s of [-1, 1]) {
    b.box(0.2, 0.012, 0.18, { color: 0x262a31, x: s * (R + 0.08), y: 0.12, ry: 0, rz: s * 0.15, ...NP });
    b.box(0.12, 0.01, 0.08, { color: 0x262a31, x: s * (R + 0.04), y: H - 0.05, rz: s * 0.2, ...NP, ...DET });
  }
  b.cyl(R * 0.75, R * 0.55, 0.08, { color: 0x3a3f4a, y: -0.08, seg: 10, ...NP });
  b.cyl(R * 0.62, R * 0.62, 0.01, { color: 0xffb36a, mat: Mat.Glow, y: -0.085, seg: 10, capTop: false, capBottom: true, ...NP });
  b.box(0.03, 0.06, 0.004, { color: 0xffffff, mat: Mat.Light, y: H * 0.7, z: R + 0.002, ...NP, ...DET });
  return b.build();
}

/** Mass-driver cargo sled with a pointed payload fairing. +Z forward. */
export function sled(): BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.22, 0.1, 0.4, { color: 0xeef0f3, y: -0.05, ...NP });
  b.cone(0.11, 0.24, { color: 0xff8a3a, rx: Math.PI / 2, z: 0.2, y: 0.0, seg: 8, ...NP });
  b.box(0.24, 0.014, 0.36, { color: 0x5ae8ff, mat: Mat.Glow, y: -0.064, ...NP });
  return b.build();
}

/** Space-elevator climber (rides the tether; +Y = up). */
export function climber(): BufferGeometry {
  const b = new MeshBuilder();
  b.prism(6, 0.34, 0.6, { color: 0xf0f2f5, y: -0.3, ...NP });
  b.prism(6, 0.35, 0.06, { color: 0x7ae8ff, mat: Mat.Glow, y: 0.0, capTop: false, ...NP });
  b.cone(0.32, 0.22, { color: 0xf0f2f5, y: 0.3, seg: 6, ...NP });
  b.cone(0.32, 0.16, { color: 0xc8ccd2, y: -0.3, seg: 6, rx: Math.PI, ...NP });
  b.box(0.36, 0.03, 0.05, { color: GLASS, y: 0.1, z: 0.29, ...NP, ...DET });
  return b.build();
}

// ───────────────────────────────────────────────────────────── water (origin = waterline centre)

function hull(b: MeshBuilder, w: number, l: number, h: number, color: number, o: { paint?: boolean; y?: number } = {}): void {
  const hw = w / 2, hl = l / 2;
  b.extrude([[-hw, -hl], [hw, -hl], [hw, hl * 0.45], [0, hl], [-hw, hl * 0.45]], h, { color, y: o.y ?? -h * 0.4, top: 0xd8cfc0, paint: o.paint ?? true });
}

export function speedboat(): BufferGeometry {
  const b = new MeshBuilder();
  hull(b, 0.085, 0.26, 0.035, WHITE);
  b.box(0.07, 0.022, 0.006, { color: GLASS, y: 0.021, z: 0.02, rx: -0.5, ...NP });
  b.box(0.05, 0.02, 0.05, { color: 0x3a3f48, y: 0.021, z: -0.05, ...NP });
  b.box(0.02, 0.008, 0.006, { color: HEAD, mat: Mat.Light, y: 0.024, z: 0.1, ...NP, ...DET });
  return b.build();
}

export function sailboat(): BufferGeometry {
  const b = new MeshBuilder();
  hull(b, 0.09, 0.3, 0.035, WHITE);
  b.box(0.05, 0.02, 0.08, { color: 0xe8e0d0, y: 0.021, z: -0.04, ...NP });
  b.cyl(0.004, 0.004, 0.3, { color: 0xc8ccd2, y: 0.02, z: 0.02, seg: 4, ...NP });
  b.tri([0, 0.05, 0.03], [0, 0.32, 0.024], [0, 0.05, -0.13], { color: 0xfafafa, ...NP }, 0xfafafa, Mat.Plain);
  b.tri([0, 0.05, -0.13], [0, 0.32, 0.024], [0, 0.05, 0.03], { color: 0xfafafa, ...NP }, 0xfafafa, Mat.Plain);
  b.tri([0, 0.06, 0.04], [0, 0.26, 0.032], [0, 0.04, 0.14], { color: 0xfafafa }, 0xffffff, Mat.Plain);
  b.tri([0, 0.04, 0.14], [0, 0.26, 0.032], [0, 0.06, 0.04], { color: 0xfafafa }, 0xffffff, Mat.Plain);
  b.box(0.006, 0.006, 0.006, { color: 0xff3030, mat: Mat.Light, y: 0.33, z: 0.024, ...NP, ...DET });
  return b.build();
}

export function hovercraft(): BufferGeometry {
  const b = new MeshBuilder();
  b.cyl(0.09, 0.1, 0.03, { color: 0x2a2e36, y: -0.005, seg: 10, sz: 1.6, ...NP });
  b.box(0.13, 0.02, 0.26, { color: WHITE, y: 0.025 });
  b.box(0.1, 0.045, 0.12, { color: WHITE, y: 0.045, z: 0.03 });
  b.box(0.102, 0.018, 0.1, { color: GLASS, y: 0.062, z: 0.035, ...NP });
  for (const s of [-1, 1]) {
    b.torus(0.034, 0.008, { color: 0x3a3f48, rx: Math.PI / 2, x: s * 0.038, y: 0.085, z: -0.11, seg: 10, tube: 4, ...NP });
    b.box(0.004, 0.06, 0.03, { color: 0xff8a3a, x: s * 0.038, y: 0.055, z: -0.135, ...NP, ...DET });
  }
  b.box(0.12, 0.004, 0.2, { color: 0x5ae4ff, mat: Mat.Glow, y: 0.006, ...NP });
  return b.build();
}

export function ferry(): BufferGeometry {
  const b = new MeshBuilder();
  hull(b, 0.32, 0.95, 0.1, WHITE);
  b.box(0.33, 0.012, 0.9, { color: 0x1c2f6e, y: 0.03, z: -0.03, ...NP, ...DET });
  b.box(0.24, 0.1, 0.5, { color: 0xfafafa, y: 0.06, z: -0.06, ...NP });
  b.box(0.25, 0.04, 0.44, { color: GLASS, mat: Mat.Window, y: 0.1, z: -0.06, ...NP });
  b.box(0.16, 0.08, 0.2, { color: 0xfafafa, y: 0.16, z: -0.12, ...NP });
  b.box(0.165, 0.025, 0.06, { color: GLASS, y: 0.2, z: -0.04, ...NP });
  b.cyl(0.03, 0.035, 0.12, { color: WHITE, y: 0.24, z: -0.18, seg: 6 });
  b.box(0.02, 0.01, 0.006, { color: HEAD, mat: Mat.Light, y: 0.06, z: 0.47, ...NP, ...DET });
  return b.build();
}

/** Container ship: long hull, colourful container stacks, bridge tower aft. */
export function cargoShip(): BufferGeometry {
  const b = new MeshBuilder();
  hull(b, 0.32, 1.7, 0.12, 0x2a3a5a, { paint: false });
  b.box(0.325, 0.03, 1.5, { color: 0xb8302a, y: -0.05, z: -0.05, ...NP });
  const cols = [0xd84a3a, 0x3a7ad8, 0xe8b83a, 0x3ab87a, 0xe8e8e8, 0xd87a3a, 0x7a5ad8, 0x2a9ab8];
  let k = 0;
  for (let row = 0; row < 5; row++) {
    const z = 0.48 - row * 0.2;
    const tiers = 1 + ((row * 7 + 3) % 3);
    for (let t = 0; t < tiers; t++) {
      for (const x of [-0.08, 0.08]) b.box(0.15, 0.05, 0.18, { color: cols[k++ % cols.length], x, y: 0.072 + t * 0.052, z, ...NP });
    }
  }
  b.box(0.28, 0.2, 0.18, { color: WHITE, y: 0.07, z: -0.6, ...NP });
  b.box(0.3, 0.035, 0.12, { color: GLASS, mat: Mat.Window, y: 0.22, z: -0.6, ...NP });
  b.box(0.05, 0.12, 0.05, { color: 0x2a2e36, y: 0.27, z: -0.66, ...NP });
  b.box(0.01, 0.01, 0.006, { color: 0x30ff60, mat: Mat.Light, x: 0.15, y: 0.25, z: -0.55, ...NP, ...DET });
  b.box(0.01, 0.01, 0.006, { color: 0xff3030, mat: Mat.Light, x: -0.15, y: 0.25, z: -0.55, ...NP, ...DET });
  return b.build();
}

export function trawler(): BufferGeometry {
  const b = new MeshBuilder();
  hull(b, 0.12, 0.38, 0.05, 0xd84a3a, { paint: false });
  b.box(0.08, 0.06, 0.09, { color: WHITE, y: 0.03, z: 0.05, ...NP });
  b.box(0.082, 0.02, 0.07, { color: GLASS, y: 0.065, z: 0.05, ...NP });
  b.cyl(0.004, 0.004, 0.2, { color: 0xc8ccd2, y: 0.03, z: -0.06, seg: 4, ...NP });
  b.box(0.12, 0.004, 0.004, { color: 0xc8ccd2, y: 0.18, z: -0.06, rz: 0.4, ...NP, ...DET });
  b.box(0.006, 0.006, 0.006, { color: 0xfff0b0, mat: Mat.Light, y: 0.23, z: -0.06, ...NP, ...DET });
  return b.build();
}

/** Space whale: a 3-unit leviathan, violet back, pale belly, rows of glowing spots, fluked tail. +Z = head. */
export function whale(): BufferGeometry {
  const b = new MeshBuilder();
  const back = 0x4c4fb8, belly = 0xc8d4f4;
  b.sphere(0.42, { color: back, sz: 3.4, sy: 0.85, wSeg: 14, hSeg: 8, ...NP });
  b.sphere(0.4, { color: belly, sz: 3.2, sy: 0.7, y: -0.06, wSeg: 12, hSeg: 6, ...NP });
  b.sphere(0.34, { color: back, z: 1.15, y: 0.02, sz: 1.5, sy: 0.85, wSeg: 12, hSeg: 6, ...NP });
  // tail stock & flukes
  b.sphere(0.2, { color: back, z: -1.45, sz: 2.4, sy: 0.7, wSeg: 10, hSeg: 6, ...NP });
  for (const s of [-1, 1]) {
    b.group({ x: s * 0.26, z: -1.98, ry: s * 0.55 }, () => b.box(0.48, 0.035, 0.22, { color: back, ...NP }));
    b.group({ x: s * 0.42, y: -0.18, z: 0.55, ry: s * 0.35, rz: s * -0.5 }, () => b.box(0.5, 0.03, 0.16, { color: back, ...NP }));
  }
  // glowing spots + eye
  for (let k = 0; k < 7; k++) {
    for (const s of [-1, 1]) b.sphere(0.035, { color: 0x7af0ff, mat: Mat.Glow, x: s * 0.32, y: 0.12, z: 0.8 - k * 0.27, wSeg: 4, hSeg: 3, ...NP, ...DET });
  }
  for (const s of [-1, 1]) b.sphere(0.04, { color: 0xffe08a, mat: Mat.Glow, x: s * 0.3, y: 0.05, z: 1.4, wSeg: 4, hSeg: 3, ...NP });
  b.box(0.04, 0.02, 1.6, { color: 0xa8f0ff, mat: Mat.Glow, y: 0.36, z: 0.05, ...NP });
  return b.build();
}

// ───────────────────────────────────────────────────────────── fauna (origin = body centre, +Z = head)

/** Bird / flyer with wings at `phase` (-1 down … +1 up). Paint = plumage. `glow` adds luminous wing edges. */
export function flyer(phase: number, glow = false): BufferGeometry {
  const b = new MeshBuilder();
  const span = 0.075, lift = phase * 0.03;
  b.sphere(0.012, { color: WHITE, sz: 2.6, wSeg: 6, hSeg: 4 });
  b.sphere(0.009, { color: WHITE, z: 0.03, y: 0.004, wSeg: 5, hSeg: 3 });
  b.box(0.004, 0.003, 0.012, { color: 0xffb02a, z: 0.042, y: 0.003, ...NP });
  b.tri([0, 0.002, -0.032], [-0.014, 0.0, -0.05], [0.014, 0.0, -0.05], { color: WHITE }, WHITE, Mat.Plain);
  b.tri([0.014, 0.0, -0.05], [-0.014, 0.0, -0.05], [0, 0.002, -0.032], { color: WHITE }, WHITE, Mat.Plain);
  for (const s of [-1, 1]) {
    const inner: number[] = [s * 0.008, 0.002, 0.012], innerB: number[] = [s * 0.008, 0.002, -0.014];
    const mid: number[] = [s * span * 0.55, 0.002 + lift * 0.55, 0.004];
    const tip: number[] = [s * span, lift, -0.02];
    const mat = glow ? Mat.Glow : Mat.Plain;
    // top + bottom faces of the wing (two quads made of tris)
    const A = s > 0 ? [inner, mid, innerB] : [inner, innerB, mid];
    const B = s > 0 ? [mid, tip, innerB] : [mid, innerB, tip];
    b.tri(A[0], A[1], A[2], { color: WHITE }, WHITE, mat);
    b.tri(A[0], A[2], A[1], { color: WHITE }, WHITE, mat);
    b.tri(B[0], B[1], B[2], { color: WHITE }, WHITE, mat);
    b.tri(B[0], B[2], B[1], { color: WHITE }, WHITE, mat);
  }
  return b.build();
}

// ───────────────────────────────────────────────────────────── space (origin = centre, +Z = prow, +Y = away from planet)

/** Orbital cargo hauler: spine, container ring, habitat bow, triple glowing engines. */
export function hauler(): BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.12, 0.12, 1.2, { color: 0xd8dce2, z: 0.0, y: -0.06, ...NP });
  const cols = [0xd84a3a, 0x3a7ad8, 0xe8b83a, 0x3ab87a, 0xe8e8e8];
  for (let k = 0; k < 5; k++) {
    for (const [x, y] of [[-0.14, 0.02], [0.14, 0.02], [-0.14, -0.14], [0.14, -0.14]] as [number, number][]) {
      b.box(0.15, 0.14, 0.16, { color: cols[(k + Math.round(x * 10) + Math.round(y * 10)) % 5], x, y: y - 0.06, z: 0.36 - k * 0.18, ...NP });
    }
  }
  b.sphere(0.16, { color: WHITE, z: 0.68, sz: 1.3, wSeg: 10, hSeg: 6, ...NP });
  b.box(0.2, 0.04, 0.06, { color: GLASS, mat: Mat.Window, y: 0.05, z: 0.78, ...NP });
  for (const x of [-0.1, 0, 0.1]) {
    b.cyl(0.05, 0.07, 0.14, { color: 0x3a3f4a, rx: -Math.PI / 2, x, y: 0, z: -0.6, seg: 8, ...NP });
    b.cyl(0.055, 0.055, 0.01, { color: 0x8ad8ff, mat: Mat.Glow, rx: -Math.PI / 2, x, z: -0.735, seg: 8, ...NP, capBottom: true });
  }
  for (const s of [-1, 1]) b.box(0.5, 0.008, 0.18, { color: 0x1a2a5a, mat: Mat.Solar, x: s * 0.4, y: 0.0, z: -0.3, ...NP });
  return b.build();
}

/** Generic satellite used when an orbital item has no mesh of its own. */
export function satellite(): BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.3, 0.3, 0.4, { color: 0xd8b84a, y: -0.15, ...NP });
  b.cyl(0.05, 0.05, 0.2, { color: 0xc8ccd2, y: 0.15, seg: 6, ...NP });
  b.cone(0.18, 0.1, { color: 0xeeeeee, y: 0.35, seg: 10, rx: Math.PI, ...NP });
  for (const s of [-1, 1]) {
    b.box(0.3, 0.02, 0.02, { color: 0x8a8e96, x: s * 0.3, ...NP });
    b.box(0.6, 0.012, 0.36, { color: 0x1a2a5a, mat: Mat.Solar, x: s * 0.75, ...NP });
  }
  b.box(0.04, 0.04, 0.04, { color: 0xff4a4a, mat: Mat.Glow, y: 0.16, z: 0.2, ...NP });
  return b.build();
}

// ───────────────────────────────────────────────────────────── people

/** Pedestrian: legs, paintable torso (shirt), head. ≈ 1.9 m tall (0.095 units) — readable at street level. */
export function pedestrian(): BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.022, 0.04, 0.014, { color: 0x2a3040, y: 0, ...NP });
  b.box(0.028, 0.035, 0.018, { color: WHITE, y: 0.04 });
  b.sphere(0.011, { color: 0xe0b48a, y: 0.088, wSeg: 6, hSeg: 4, ...NP });
  return b.build();
}
