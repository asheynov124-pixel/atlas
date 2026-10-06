/**
 * OWNER: camera & tools agent.
 * CameraRig — planet camera: orbit a target point on the sphere; zoom from street level (looking at the horizon)
 * out to full-planet orbit; heading & tilt; smooth damping; fly-to; shake; cinematic tour; follow a vehicle.
 * (Foundation stub: basic damped orbit camera.)
 *
 * CONTRACT
 *   target: Vector3 (unit dir)   distance: number (above surface)   heading / tilt: radians
 *   attach(view), update(dt), flyTo(tile | dir, opts), shake(intensity, seconds),
 *   rotateBy(dxPixels, dyPixels), zoomBy(factor), tiltBy(rad), headingBy(rad), panBy? (alias rotateBy),
 *   targetTile(): number, zoom01: number (0 = closest … 1 = farthest), startTour(), stopTour(), touring
 */
import { Vector3 } from 'three';
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import type { PlanetView } from './PlanetView';
import { tileNormal } from '../world/geo';

const _up = new Vector3();
const _f = new Vector3();
const _r = new Vector3();
const _p = new Vector3();

export interface FlyOpts {
  distance?: number;
  tilt?: number;
  heading?: number;
  duration?: number;
}

export class CameraRig implements System {
  view: PlanetView | null = null;
  readonly target = new Vector3(0, 0, 1);
  distance = 60;
  heading = 0;
  tilt = 0.75;
  minDistance = 2.5;
  maxDistance = 300;
  touring = false;
  private goal = { target: new Vector3(0, 0, 1), distance: 60, heading: 0, tilt: 0.75 };
  private shakeT = 0;
  private shakeI = 0;

  constructor(private game: Game) {}

  init(): void {}

  attach(view: PlanetView): void {
    this.view = view;
    const R = view.planet.radius;
    this.minDistance = 2.5;
    this.maxDistance = R * 4.5;
    this.distance = this.goal.distance = R * 1.6;
  }

  get zoom01(): number {
    return Math.log(this.distance / this.minDistance) / Math.log(this.maxDistance / this.minDistance);
  }

  targetTile(): number {
    const p = this.view?.planet;
    return p ? p.grid.tileAt(this.target.x, this.target.y, this.target.z) : 0;
  }

  rotateBy(dx: number, dy: number): void {
    const k = (this.goal.distance / (this.view?.planet.radius ?? 50)) * 0.004;
    this.frame(this.goal.target, this.goal.heading);
    this.goal.target.addScaledVector(_r, -dx * k).addScaledVector(_f, dy * k).normalize();
  }
  zoomBy(f: number): void {
    this.goal.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.goal.distance * f));
  }
  tiltBy(d: number): void {
    this.goal.tilt = Math.max(0.05, Math.min(1.45, this.goal.tilt + d));
  }
  headingBy(d: number): void {
    this.goal.heading += d;
  }

  flyTo(where: number | Vector3, o: FlyOpts = {}): Promise<void> {
    if (typeof where === 'number' && this.view) tileNormal(this.view.planet, where, this.goal.target);
    else if (where instanceof Vector3) this.goal.target.copy(where).normalize();
    if (o.distance !== undefined) this.goal.distance = o.distance;
    if (o.tilt !== undefined) this.goal.tilt = o.tilt;
    if (o.heading !== undefined) this.goal.heading = o.heading;
    return Promise.resolve();
  }

  /** Jump instantly (no damping). */
  snap(): void {
    this.target.copy(this.goal.target);
    this.distance = this.goal.distance;
    this.heading = this.goal.heading;
    this.tilt = this.goal.tilt;
  }

  shake(intensity: number, seconds: number): void {
    this.shakeI = Math.max(this.shakeI, intensity);
    this.shakeT = Math.max(this.shakeT, seconds);
  }

  startTour(): void {
    this.touring = true;
  }
  stopTour(): void {
    this.touring = false;
  }

  /** local frame at a target direction: _up, _f (north-ish rotated by heading), _r */
  private frame(target: Vector3, heading: number): void {
    _up.copy(target).normalize();
    _f.set(0, 1, 0).addScaledVector(_up, -_up.y);
    if (_f.lengthSq() < 1e-6) _f.set(0, 0, 1).addScaledVector(_up, -_up.z);
    _f.normalize();
    _r.crossVectors(_f, _up).normalize();
    // rotate by heading around up
    const c = Math.cos(heading), s = Math.sin(heading);
    const fx = _f.x * c + _r.x * s, fy = _f.y * c + _r.y * s, fz = _f.z * c + _r.z * s;
    const rx = _r.x * c - _f.x * s, ry = _r.y * c - _f.y * s, rz = _r.z * c - _f.z * s;
    _f.set(fx, fy, fz);
    _r.set(rx, ry, rz);
  }

  update(dt: number): void {
    const v = this.view;
    if (!v) return;
    const k = 1 - Math.exp(-dt * 7);
    this.target.lerp(this.goal.target, k).normalize();
    this.distance += (this.goal.distance - this.distance) * k;
    this.heading += (this.goal.heading - this.heading) * k;
    this.tilt += (this.goal.tilt - this.tilt) * k;
    const R = v.planet.radius;
    const ground = R + Math.max(0, v.planet.heightOf(this.targetTile()));
    this.frame(this.target, this.heading);
    // tilt: 0 = straight down, ~1.45 = near horizon. Reduce tilt when far away.
    const far = Math.min(1, this.distance / (R * 1.2));
    const tilt = this.tilt * (1 - far * 0.85);
    const look = _p.copy(this.target).multiplyScalar(ground);
    const cam = v.camera;
    cam.position.copy(look).addScaledVector(_up, Math.cos(tilt) * this.distance).addScaledVector(_f, -Math.sin(tilt) * this.distance);
    cam.up.copy(_up);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeI * Math.min(1, this.shakeT) * 0.05 * Math.min(this.distance, 40);
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(look);
    cam.near = Math.max(0.03, this.distance * 0.01);
    cam.far = R * 400;
    cam.updateProjectionMatrix();
  }
}
