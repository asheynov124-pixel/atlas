/**
 * OWNER: cosmos.
 * OrbitCam — damped spherical camera used by the system / galaxy / universe views: yaw, pitch and distance around a
 * moving focus point, with smooth "fly to" retargeting, inertia after drags, and zoom overshoot tracking so views
 * can turn a pinch past the limit into a level change (system → galaxy → universe and back).
 */
import { Vector3, type PerspectiveCamera } from 'three';

const _off = new Vector3();

export class OrbitCam {
  readonly target = new Vector3();
  readonly goalTarget = new Vector3();
  yaw = 0.6;
  pitch = 0.45;
  dist = 60;
  goalYaw = 0.6;
  goalPitch = 0.45;
  goalDist = 60;
  minDist = 4;
  maxDist = 200;
  minPitch = -1.2;
  maxPitch = 1.45;
  /** accumulated zoom beyond the limits (log units); views read & reset it */
  overshoot = 0;
  /** idle auto-rotation (rad/s) */
  autoRotate = 0.02;
  private vYaw = 0;
  private vPitch = 0;
  private idle = 0;
  /** stiffness of the damping (higher = snappier) */
  stiffness = 6;
  /**
   * Framing factor applied to the real camera distance (set by the view on resize): portrait phones have a narrow
   * horizontal field of view, so the camera backs off to frame bodies like a landscape screen would. All the
   * distances above (goal, limits) stay in "design units".
   */
  fit = 1;

  constructor(readonly camera: PerspectiveCamera) {}

  set(o: { yaw?: number; pitch?: number; dist?: number; target?: Vector3 }, snap = false): void {
    if (o.yaw !== undefined) this.goalYaw = o.yaw;
    if (o.pitch !== undefined) this.goalPitch = o.pitch;
    if (o.dist !== undefined) this.goalDist = Math.max(this.minDist, Math.min(this.maxDist, o.dist));
    if (o.target) this.goalTarget.copy(o.target);
    if (snap) this.snap();
  }

  snap(): void {
    this.yaw = this.goalYaw;
    this.pitch = this.goalPitch;
    this.dist = this.goalDist;
    this.target.copy(this.goalTarget);
    this.vYaw = this.vPitch = 0;
    this.apply();
  }

  rotate(dxPx: number, dyPx: number, viewH: number): void {
    const k = 3.2 / Math.max(300, viewH);
    this.goalYaw -= dxPx * k;
    this.goalPitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.goalPitch + dyPx * k));
    this.vYaw = -dxPx * k * 30;
    this.vPitch = dyPx * k * 30;
    this.idle = 0;
  }

  /** Release after a drag: keep a little momentum. */
  fling(): void {
    this.goalYaw += this.vYaw * 0.12;
    this.goalPitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.goalPitch + this.vPitch * 0.08));
    this.vYaw = this.vPitch = 0;
  }

  zoom(factor: number): void {
    const want = this.goalDist * factor;
    if (want > this.maxDist) this.overshoot += Math.log(want / this.maxDist);
    else if (want < this.minDist) this.overshoot -= Math.log(this.minDist / want);
    else this.overshoot *= 0.5;
    this.goalDist = Math.max(this.minDist, Math.min(this.maxDist, want));
    this.idle = 0;
  }

  update(dt: number): void {
    this.idle += dt;
    if (this.autoRotate && this.idle > 4) this.goalYaw += this.autoRotate * dt * Math.min(1, (this.idle - 4) / 3);
    const k = 1 - Math.exp(-dt * this.stiffness);
    this.yaw += (this.goalYaw - this.yaw) * k;
    this.pitch += (this.goalPitch - this.pitch) * k;
    // zoom in log space so it feels even at every scale
    const ld = Math.log(this.dist), lg = Math.log(this.goalDist);
    this.dist = Math.exp(ld + (lg - ld) * k);
    this.target.lerp(this.goalTarget, 1 - Math.exp(-dt * this.stiffness * 0.8));
    this.overshoot *= Math.exp(-dt * 2.5);
    this.apply();
  }

  private apply(): void {
    const cp = Math.cos(this.pitch);
    _off.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.dist * this.fit);
    this.camera.position.copy(this.target).add(_off);
    this.camera.lookAt(this.target);
  }

  /** Mark user activity (stops auto-rotation for a while). */
  poke(): void {
    this.idle = 0;
  }
}
