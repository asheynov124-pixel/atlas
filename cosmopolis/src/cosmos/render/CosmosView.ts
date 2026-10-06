/**
 * OWNER: cosmos.
 * CosmosView — shared base of the System / Galaxy / Universe views (render/View implementations): scene, perspective
 * camera driven by an OrbitCam, the shared shader uniforms, screen-space picking of bodies, and the label bridge to
 * the DOM label layer (the UI registers a LabelSink; views push label lists on enter and positions every frame —
 * no Preact re-render per frame).
 */
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import type { View } from '../../render/View';
import { OrbitCam } from './OrbitCam';
import type { SharedUniforms } from './bodies';

export type LabelState = 'current' | 'home' | 'colony' | 'open' | 'locked' | 'neutral';

export interface BodyLabel {
  id: string;
  name: string;
  sub?: string;
  state: LabelState;
  kind: 'planet' | 'moon' | 'giant' | 'system' | 'galaxy' | 'star';
  /** lower = more important (shown first when crowded) */
  priority: number;
}

export interface LabelSink {
  setLabels(labels: BodyLabel[], selected: string | null): void;
  /** px in CSS pixels; scale 0..1 emphasises / fades */
  place(index: number, x: number, y: number, visible: boolean, fade: number): void;
  setSelected(id: string | null): void;
}

export const labelHost: { sink: LabelSink | null } = { sink: null };

export interface Pickable {
  id: string;
  pos: Vector3;
  /** world radius used for the pick halo */
  radius: number;
}

const _v = new Vector3();

export abstract class CosmosView implements View {
  abstract readonly kind: 'system' | 'galaxy' | 'universe';
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly cam: OrbitCam;
  readonly shared: SharedUniforms = { uTime: { value: 0 }, uStar: { value: new Vector3() } };
  selected: string | null = null;
  /** focused body (camera follows it) */
  focusId: string | null = null;
  width = 1;
  height = 1;
  time = 0;
  /** set by Cosmos: zoom pinched past the limits (+1 out, −1 in) */
  onOvershoot: ((dir: 1 | -1) => void) | null = null;
  protected labels: BodyLabel[] = [];
  protected labelPos: Vector3[] = [];
  protected active = false;
  private overshootCool = 0;

  constructor(fov: number, near: number, far: number) {
    this.camera = new PerspectiveCamera(fov, 1, near, far);
    this.scene.add(this.camera);
    this.cam = new OrbitCam(this.camera);
  }

  /** world positions of pickable bodies (updated every frame by subclasses) */
  protected abstract pickables(): Pickable[];
  /** world position for label i */
  protected abstract labelWorld(i: number, out: Vector3): boolean;
  /** subclass frame update (before the camera) */
  protected abstract tick(dt: number): void;
  abstract focus(id: string | null, snap?: boolean): void;

  enter(): void {
    this.active = true;
    labelHost.sink?.setLabels(this.labels, this.selected);
  }

  exit(): void {
    this.active = false;
    labelHost.sink?.setLabels([], null);
  }

  /** Re-send labels (after data changes, or when the UI mounts late). */
  refreshLabels(): void {
    if (this.active) labelHost.sink?.setLabels(this.labels, this.selected);
  }

  update(dt: number): void {
    this.time += dt;
    this.shared.uTime.value = this.time;
    this.tick(dt);
    this.cam.update(dt);
    if (this.onOvershoot && (this.overshootCool -= dt) <= 0) {
      if (this.cam.overshoot > 0.55) {
        this.cam.overshoot = 0;
        this.overshootCool = 1.5;
        this.onOvershoot(1);
      } else if (this.cam.overshoot < -0.55) {
        this.cam.overshoot = 0;
        this.overshootCool = 1.5;
        this.onOvershoot(-1);
      }
    }
    if (this.active) this.placeLabels();
  }

  private placeLabels(): void {
    const sink = labelHost.sink;
    if (!sink) return;
    const cam = this.camera;
    cam.updateMatrixWorld();
    for (let i = 0; i < this.labels.length; i++) {
      if (!this.labelWorld(i, _v)) {
        sink.place(i, 0, 0, false, 0);
        continue;
      }
      const d = _v.distanceTo(cam.position);
      _v.project(cam);
      const vis = _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.15 && Math.abs(_v.y) < 1.15;
      const x = (_v.x * 0.5 + 0.5) * this.width;
      const y = (-_v.y * 0.5 + 0.5) * this.height;
      sink.place(i, x, y, vis, this.labelFade(i, d));
    }
  }

  /** 0..1 label emphasis by distance (subclasses may override) */
  protected labelFade(_i: number, _dist: number): number {
    return 1;
  }

  /** Screen-space pick at CSS pixel (x, y). */
  pick(x: number, y: number): string | null {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const f = this.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    let best: string | null = null;
    let bestScore = Infinity;
    for (const p of this.pickables()) {
      _v.copy(p.pos);
      const dist = _v.distanceTo(cam.position);
      _v.project(cam);
      if (_v.z > 1 || _v.z < -1) continue;
      const sx = (_v.x * 0.5 + 0.5) * this.width;
      const sy = (-_v.y * 0.5 + 0.5) * this.height;
      const rpx = (p.radius / Math.max(0.001, dist)) * f;
      const d = Math.hypot(sx - x, sy - y);
      const reach = Math.max(26, rpx + 14);
      if (d > reach) continue;
      const score = d - rpx * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = p.id;
      }
    }
    return best;
  }

  select(id: string | null): void {
    this.selected = id;
    labelHost.sink?.setSelected(id);
  }

  rotate(dx: number, dy: number): void {
    this.cam.rotate(dx, dy, this.height);
  }

  zoom(f: number): void {
    this.cam.zoom(f);
  }

  onResize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  abstract dispose(): void;
}
