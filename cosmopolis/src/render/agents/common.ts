/**
 * OWNER: life.
 * Shared helpers for the agent renderers: per-frame culling context (distance + horizon + frustum), orthonormal
 * frames for vehicles / aircraft, the sim-speed factor and small deterministic math. Allocation-free hot paths.
 */
import { Frustum, Matrix4, Sphere, Vector3, type PerspectiveCamera } from 'three';
import { hash2 } from '../../core/rng';

const _pv = new Matrix4();
const _sphere = new Sphere();

/** Agent motion multiplier per clock speed index (0 pause … 4 ludicrous): calm, never frantic. */
export const MOTION_SPEED = [0, 1, 1.45, 1.9, 2.4];

/** Per-frame culling context. Call update() once per frame, then visible() per agent. */
export class Cull {
  readonly cam = new Vector3();
  /** unit direction planet centre → camera */
  readonly camDir = new Vector3();
  camDist = 1;
  R = 1;
  /** acos(R / camDist): horizon angle seen from the camera */
  private horizon = Math.PI;
  private frustum = new Frustum();
  /** 0..1 night amount at the camera's focus (CPU mirror of cNight) */
  night = 0;
  /** camera distance to the planet surface (≈ zoom) */
  altitude = 1;

  update(camera: PerspectiveCamera, R: number, sunDir: Vector3): void {
    camera.updateMatrixWorld();
    this.cam.setFromMatrixPosition(camera.matrixWorld);
    this.camDist = Math.max(1e-3, this.cam.length());
    this.camDir.copy(this.cam).multiplyScalar(1 / this.camDist);
    this.R = R;
    this.horizon = this.camDist > R ? Math.acos(Math.min(1, R / this.camDist)) : Math.PI;
    this.altitude = Math.max(0, this.camDist - R);
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(_pv);
    // the focus is roughly below the camera; good enough for "is it night where we look"
    const d = this.camDir.dot(sunDir);
    this.night = smoothstep(0.1, -0.2, d);
  }

  /** Squared distance from the camera. */
  dist2(x: number, y: number, z: number): number {
    const dx = x - this.cam.x, dy = y - this.cam.y, dz = z - this.cam.z;
    return dx * dx + dy * dy + dz * dz;
  }

  /**
   * Is a sphere (x,y,z,radius) worth drawing? Rejects beyond maxDist, behind the planet's horizon (accounting for
   * the point's own altitude) and outside the view frustum.
   */
  visible(x: number, y: number, z: number, radius: number, maxDist: number): boolean {
    const d2 = this.dist2(x, y, z);
    if (d2 > maxDist * maxDist) return false;
    const r = Math.sqrt(x * x + y * y + z * z) || 1;
    if (this.horizon < Math.PI) {
      const cosA = (x * this.camDir.x + y * this.camDir.y + z * this.camDir.z) / r;
      const lift = r > this.R ? Math.acos(Math.min(1, this.R / r)) : 0;
      const lim = this.horizon + lift + 0.02 + radius / this.R;
      if (lim < Math.PI && cosA < Math.cos(lim)) return false;
    }
    _sphere.center.set(x, y, z);
    _sphere.radius = radius;
    return this.frustum.intersectsSphere(_sphere);
  }
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

/** Deterministic 0..1 float from two ints. */
export function hf(a: number, b = 0): number {
  return hash2(a, b) / 4294967296;
}

/** Orthonormal frame scratch: right / up / fwd. */
export interface Frame {
  r: Vector3;
  u: Vector3;
  f: Vector3;
}

export function newFrame(): Frame {
  return { r: new Vector3(), u: new Vector3(), f: new Vector3() };
}

/**
 * Frame with `fwd` kept exactly (unit) and up as close as possible to `upHint` (unit radial).
 * Use for vehicles that pitch with their velocity (ramps, climbing aircraft).
 */
export function frameFwd(out: Frame, fwd: Vector3, upHint: Vector3): Frame {
  out.f.copy(fwd);
  out.u.copy(upHint).addScaledVector(out.f, -upHint.dot(out.f));
  if (out.u.lengthSq() < 1e-8) out.u.set(0, 1, 0).addScaledVector(out.f, -out.f.y);
  out.u.normalize();
  out.r.crossVectors(out.u, out.f).normalize();
  return out;
}

/** Frame with `up` kept exactly and fwd projected onto the tangent plane (level flight / ground vehicles). */
export function frameUp(out: Frame, up: Vector3, fwdHint: Vector3): Frame {
  out.u.copy(up);
  out.f.copy(fwdHint).addScaledVector(up, -fwdHint.dot(up));
  if (out.f.lengthSq() < 1e-8) {
    out.f.set(1, 0, 0).addScaledVector(up, -up.x);
    if (out.f.lengthSq() < 1e-8) out.f.set(0, 0, 1).addScaledVector(up, -up.z);
  }
  out.f.normalize();
  out.r.crossVectors(out.u, out.f).normalize();
  return out;
}

/** Roll a frame around its forward axis by `a` radians (banking; positive rolls the right wing down). */
export function roll(fr: Frame, a: number): Frame {
  if (Math.abs(a) < 1e-4) return fr;
  const c = Math.cos(a), s = Math.sin(a);
  const ux = fr.u.x * c + fr.r.x * s, uy = fr.u.y * c + fr.r.y * s, uz = fr.u.z * c + fr.r.z * s;
  const rx = fr.r.x * c - fr.u.x * s, ry = fr.r.y * c - fr.u.y * s, rz = fr.r.z * c - fr.u.z * s;
  fr.u.set(ux, uy, uz);
  fr.r.set(rx, ry, rz);
  return fr;
}

/** Pitch a frame around its right axis by `a` radians (positive = nose up). */
export function pitch(fr: Frame, a: number): Frame {
  if (Math.abs(a) < 1e-4) return fr;
  const c = Math.cos(a), s = Math.sin(a);
  const fx = fr.f.x * c + fr.u.x * s, fy = fr.f.y * c + fr.u.y * s, fz = fr.f.z * c + fr.u.z * s;
  const ux = fr.u.x * c - fr.f.x * s, uy = fr.u.y * c - fr.f.y * s, uz = fr.u.z * c - fr.f.z * s;
  fr.f.set(fx, fy, fz);
  fr.u.set(ux, uy, uz);
  return fr;
}

/** Quadratic Bézier point + tangent. */
export function bezier2(p0: Vector3, p1: Vector3, p2: Vector3, t: number, out: Vector3, tan?: Vector3): Vector3 {
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
  const x = p0.x * a + p1.x * b + p2.x * c;
  const y = p0.y * a + p1.y * b + p2.y * c;
  const z = p0.z * a + p1.z * b + p2.z * c;
  if (tan) {
    tan.set(
      2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
      2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
      2 * (1 - t) * (p1.z - p0.z) + 2 * t * (p2.z - p1.z),
    );
  }
  return out.set(x, y, z);
}

/** Cubic Bézier point + tangent. */
export function bezier3(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number, out: Vector3, tan?: Vector3): Vector3 {
  const it = 1 - t;
  const a = it * it * it, b = 3 * it * it * t, c = 3 * it * t * t, d = t * t * t;
  const x = p0.x * a + p1.x * b + p2.x * c + p3.x * d;
  const y = p0.y * a + p1.y * b + p2.y * c + p3.y * d;
  const z = p0.z * a + p1.z * b + p2.z * c + p3.z * d;
  if (tan) {
    const ta = 3 * it * it, tb = 6 * it * t, tc = 3 * t * t;
    tan.set(
      ta * (p1.x - p0.x) + tb * (p2.x - p1.x) + tc * (p3.x - p2.x),
      ta * (p1.y - p0.y) + tb * (p2.y - p1.y) + tc * (p3.y - p2.y),
      ta * (p1.z - p0.z) + tb * (p2.z - p1.z) + tc * (p3.z - p2.z),
    );
  }
  return out.set(x, y, z);
}

/** Tiny xorshift for runtime choices that must not allocate (seeded per planet). */
export class FastRng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x2545f491;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, bInclusive: number): number {
    return a + Math.floor(this.next() * (bInclusive - a + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}
