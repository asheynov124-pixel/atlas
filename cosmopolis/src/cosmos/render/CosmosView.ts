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

  private readonly baseFov: number;
  /** lens shift (CSS px): content moves right by x and up by y so a body is not hidden behind an info card */
  private shift = { x: 0, y: 0, gx: 0, gy: 0, applied: false };
  // label declutter scratch (re-allocated only when the label list changes)
  private lx = new Float32Array(0);
  private ly = new Float32Array(0);
  private lw = new Float32Array(0);
  private lf = new Float32Array(0);
  private lorder: number[] = [];
  private lorderKey = '';

  constructor(fov: number, near: number, far: number) {
    this.baseFov = fov;
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
    this.applyShift(dt);
    if (this.active) this.placeLabels();
  }

  /** Ask for a lens shift in CSS px (content moves right by x, up by y) — eased, so cards slide the view smoothly. */
  setFrameShift(x: number, y: number, snap = false): void {
    this.shift.gx = x;
    this.shift.gy = y;
    if (snap) {
      this.shift.x = x;
      this.shift.y = y;
    }
  }

  private applyShift(dt: number): void {
    const s = this.shift;
    const k = 1 - Math.exp(-dt * 7);
    s.x += (s.gx - s.x) * k;
    s.y += (s.gy - s.y) * k;
    if (Math.abs(s.x) < 0.5 && Math.abs(s.y) < 0.5 && s.gx === 0 && s.gy === 0) {
      if (s.applied) {
        this.camera.clearViewOffset();
        s.applied = false;
      }
      return;
    }
    const w = Math.max(1, Math.round(this.width)), h = Math.max(1, Math.round(this.height));
    this.camera.setViewOffset(w, h, -s.x, s.y, w, h);
    s.applied = true;
  }

  private placeLabels(): void {
    const sink = labelHost.sink;
    if (!sink) return;
    const cam = this.camera;
    cam.updateMatrixWorld();
    const n = this.labels.length;
    if (this.lx.length !== n) {
      this.lx = new Float32Array(n);
      this.ly = new Float32Array(n);
      this.lw = new Float32Array(n);
      this.lf = new Float32Array(n);
      this.lorderKey = '';
    }
    // project every label
    for (let i = 0; i < n; i++) {
      this.lf[i] = 0;
      if (!this.labelWorld(i, _v)) continue;
      const d = _v.distanceTo(cam.position) / this.cam.fit;
      _v.project(cam);
      if (!(_v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.15 && Math.abs(_v.y) < 1.15)) continue;
      this.lx[i] = (_v.x * 0.5 + 0.5) * this.width;
      this.ly[i] = (-_v.y * 0.5 + 0.5) * this.height;
      this.lf[i] = this.labelFade(i, d);
    }
    // declutter: most important first, later labels that collide with a placed one are hidden
    const key = `${n}|${this.selected}|${this.focusId}`;
    if (key !== this.lorderKey) {
      this.lorderKey = key;
      const rank = (i: number) => {
        const l = this.labels[i];
        if (l.id === this.selected) return -3;
        if (l.id === this.focusId) return -2;
        if (l.state === 'current') return -1;
        return l.priority;
      };
      this.lorder = this.labels.map((_, i) => i).sort((a, b) => rank(a) - rank(b) || a - b);
      for (let i = 0; i < n; i++) this.lw[i] = Math.min(190, this.labels[i].name.length * 7.4 + 40) * 0.5;
    }
    const placed = this.lorder;
    for (let a = 0; a < placed.length; a++) {
      const i = placed[a];
      if (this.lf[i] <= 0.01) continue;
      for (let b = 0; b < a; b++) {
        const j = placed[b];
        if (this.lf[j] <= 0.01) continue;
        if (Math.abs(this.lx[i] - this.lx[j]) < this.lw[i] + this.lw[j] - 6 && Math.abs(this.ly[i] - this.ly[j]) < 34) {
          this.lf[i] = 0;
          break;
        }
      }
    }
    for (let i = 0; i < n; i++) sink.place(i, this.lx[i], this.ly[i], this.lf[i] > 0.01, this.lf[i]);
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
    const aspect = w / Math.max(1, h);
    this.camera.aspect = aspect;
    // portrait: open the vertical field of view a little and back the camera off so the narrow horizontal view
    // frames the scene like the landscape design (fit = base vertical half-angle ÷ actual horizontal half-angle)
    const base = this.baseFov;
    this.camera.fov = aspect < 1 ? base + (1 - aspect) * 22 : base;
    const t = Math.tan((base * Math.PI) / 360);
    const th = Math.tan((this.camera.fov * Math.PI) / 360) * aspect;
    this.cam.fit = Math.max(1, Math.min(2.2, t / Math.max(0.05, th)));
    this.camera.updateProjectionMatrix();
  }

  abstract dispose(): void;
}
