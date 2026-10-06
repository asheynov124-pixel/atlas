/**
 * OWNER: space-post.
 * SunShadows — a tight directional shadow frustum that follows the camera's focus point on the surface.
 * Only on quality tier ≥ 2 with settings.shadows; fades out as the camera zooms away or the focus slips into night
 * (shadow.intensity → 0, map updates skipped). The frustum is texel-snapped (no shimmering when panning), its size is
 * quantised to zoom steps, and the map re-renders only when the camera / sun moved or every 0.25 s (growing
 * buildings), never needlessly.
 */
import { PCFShadowMap, Vector3, type DirectionalLight, type WebGLRenderer } from 'three';

const _right = new Vector3();
const _up = new Vector3();
const _focus = new Vector3();
const STEP = 1.2;

export class SunShadows {
  enabled = false;
  private size = 0;
  private half = 0;
  private timer = 0;
  private lastFocus = new Vector3(Infinity, 0, 0);
  private lastSun = new Vector3();
  private intensity = 0;
  /** snap the fade on the first update after enabling (no visible fade-in on load) */
  private primed = false;

  constructor(
    private light: DirectionalLight,
    private renderer: WebGLRenderer | null,
  ) {
    const s = light.shadow;
    s.autoUpdate = false;
    s.bias = -0.0004;
    s.radius = 2.5;
    s.intensity = 0;
  }

  /** (Re)configure for a quality tier / settings change. Toggling recompiles lit materials, so call rarely. */
  configure(tier: number, wanted: boolean): void {
    const r = this.renderer;
    const on = !!r && wanted && tier >= 2;
    const size = tier >= 3 ? 2048 : 1024;
    if (!r) return;
    if (on) {
      r.shadowMap.type = PCFShadowMap;
      r.shadowMap.autoUpdate = true;
      if (size !== this.size) {
        this.size = size;
        this.light.shadow.mapSize.set(size, size);
        this.light.shadow.map?.dispose();
        this.light.shadow.map = null;
      }
    }
    if (on === this.enabled) return;
    this.enabled = on;
    this.light.castShadow = on;
    r.shadowMap.enabled = on;
    r.shadowMap.needsUpdate = true;
    this.light.shadow.needsUpdate = on;
    this.lastFocus.set(Infinity, 0, 0);
    this.primed = false;
  }

  /**
   * @param focus surface point the camera looks at (world)
   * @param camDistance camera distance above that point
   * @param sunDir planet → sun unit vector
   * @param sunElev dot(focus normal, sunDir)
   */
  update(dt: number, focus: Vector3, camDistance: number, sunDir: Vector3, sunElev: number): void {
    if (!this.enabled) return;
    const s = this.light.shadow;
    const target = (1 - smooth(40, 75, camDistance)) * smooth(-0.03, 0.08, sunElev) * 0.88;
    this.intensity = this.primed ? this.intensity + (target - this.intensity) * Math.min(1, dt * 4) : target;
    this.primed = true;
    s.intensity = this.intensity;
    if (this.intensity < 0.01) return;
    // quantised half-extent of the frustum
    const want = Math.max(5, Math.min(38, camDistance * 0.8));
    const half = 5 * Math.pow(STEP, Math.round(Math.log(want / 5) / Math.log(STEP)));
    const cam = s.camera;
    if (half !== this.half) {
      this.half = half;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.updateProjectionMatrix();
      s.normalBias = (2 * half) / this.size * 1.2;
      s.needsUpdate = true;
    }
    // texel snapping in light space
    _right.crossVectors(sunDir, Math.abs(sunDir.y) > 0.95 ? _up.set(1, 0, 0) : _up.set(0, 1, 0)).normalize();
    _up.crossVectors(_right, sunDir).normalize();
    const texel = (2 * half) / this.size;
    const x = focus.dot(_right);
    const y = focus.dot(_up);
    _focus.copy(focus).addScaledVector(_right, Math.round(x / texel) * texel - x).addScaledVector(_up, Math.round(y / texel) * texel - y);
    const dist = half * 2.5 + 24;
    this.light.target.position.copy(_focus);
    this.light.position.copy(_focus).addScaledVector(sunDir, dist);
    cam.near = 0.5;
    if (cam.far !== dist + half * 2 + 12) {
      cam.far = dist + half * 2 + 12;
      cam.updateProjectionMatrix();
    }
    this.light.target.updateMatrixWorld();
    this.timer -= dt;
    const moved = _focus.distanceToSquared(this.lastFocus) > texel * texel * 0.25;
    const turned = sunDir.dot(this.lastSun) < 0.9999995;
    if (moved || turned || this.timer <= 0) {
      this.timer = 0.25;
      this.lastFocus.copy(_focus);
      this.lastSun.copy(sunDir);
      s.needsUpdate = true;
    }
  }

  dispose(): void {
    if (this.enabled && this.renderer) this.renderer.shadowMap.enabled = false;
    this.light.castShadow = false;
    this.light.shadow.map?.dispose();
    this.light.shadow.map = null;
    this.enabled = false;
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
