/**
 * OWNER: space-post.
 * Meteors — the occasional shooting star streaking across the night sky, only when the camera is down in an
 * atmosphere at night (they burn up in air, after all). A tiny pool of camera-centred streaks, one draw call.
 */
import { AdditiveBlending, DoubleSide, BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, Vector3, Vector4 } from 'three';
import { Rng } from '../../core/rng';
import { GLSL_SKY_VERTEX } from './glsl';

const POOL = 3;

const VERT = /* glsl */ `
attribute vec2 aCorner;   // x: 0 tail → 1 head, y: side −1/1
attribute float aIndex;
uniform vec4 uStart[ ${POOL} ];   // xyz start dir, w: arc length (rad)
uniform vec4 uAxis[ ${POOL} ];    // xyz travel tangent, w: progress 0..1 (≥ 1 = dead)
uniform vec4 uLook[ ${POOL} ];    // x brightness, y width (rad), z hue shift
varying float vT;
varying float vAlpha;
varying vec3 vCol;
${GLSL_SKY_VERTEX}
void main() {
  int i = int( aIndex + 0.5 );
  vec4 s = uStart[ i ];
  vec4 ax = uAxis[ i ];
  vec4 lk = uLook[ i ];
  float prog = ax.w;
  float head = prog * s.w;
  float tailLen = s.w * 0.35;
  float a = max( 0.0, head - tailLen * ( 1.0 - aCorner.x ) );
  vec3 dir = normalize( s.xyz * cos( a ) + ax.xyz * sin( a ) );
  vec3 side = normalize( cross( dir, ax.xyz ) );
  dir += side * aCorner.y * lk.y * ( 0.25 + 0.75 * aCorner.x );
  gl_Position = skyClip( dir );
  vT = aCorner.x;
  float life = smoothstep( 0.0, 0.12, prog ) * ( 1.0 - smoothstep( 0.75, 1.0, prog ) );
  vAlpha = prog >= 1.0 ? 0.0 : life * lk.x;
  vCol = mix( vec3( 0.75, 1.0, 0.85 ), vec3( 1.0, 0.82, 0.6 ), lk.z );
}
`;

const FRAG = /* glsl */ `
varying float vT;
varying float vAlpha;
varying vec3 vCol;
void main() {
  float g = vT * vT * vT;
  gl_FragColor = vec4( vCol * ( g * 3.5 + pow( vT, 12.0 ) * 6.0 ) * vAlpha, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface Meteor {
  start: Vector3;
  axis: Vector3;
  arc: number;
  t: number;
  dur: number;
  alive: boolean;
}

const _a = new Vector3();
const _b = new Vector3();

export class Meteors {
  readonly mesh: Mesh;
  private material: ShaderMaterial;
  private rng: Rng;
  private pool: Meteor[] = [];
  private timer = 3;
  private uStart: Vector4[] = [];
  private uAxis: Vector4[] = [];
  private uLook: Vector4[] = [];
  /** 0..1 how many meteors (0 = none); set by the owner from night × inside-atmosphere */
  rate = 0;

  constructor(seed: number) {
    this.rng = new Rng((seed ^ 0x3e7e0) >>> 0);
    const corners = new Float32Array(POOL * 4 * 2);
    const index = new Float32Array(POOL * 4);
    const pos = new Float32Array(POOL * 4 * 3);
    const idx: number[] = [];
    for (let i = 0; i < POOL; i++) {
      const c = [0, -1, 0, 1, 1, -1, 1, 1];
      for (let k = 0; k < 8; k++) corners[i * 8 + k] = c[k];
      for (let k = 0; k < 4; k++) index[i * 4 + k] = i;
      const b = i * 4;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      this.pool.push({ start: new Vector3(), axis: new Vector3(), arc: 0.3, t: 0, dur: 1, alive: false });
      this.uStart.push(new Vector4(1, 0, 0, 0.3));
      this.uAxis.push(new Vector4(0, 1, 0, 2));
      this.uLook.push(new Vector4(1, 0.002, 0, 0));
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aCorner', new BufferAttribute(corners, 2));
    geo.setAttribute('aIndex', new BufferAttribute(index, 1));
    geo.setIndex(idx);
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uStart: { value: this.uStart }, uAxis: { value: this.uAxis }, uLook: { value: this.uLook } },
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = 'meteors';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -15;
    this.mesh.visible = false;
  }

  /**
   * @param up local zenith (world) at the camera
   * @param view camera forward (world) — meteors spawn roughly where the player is looking
   */
  update(dt: number, up: Vector3, view: Vector3): void {
    let any = false;
    for (let i = 0; i < POOL; i++) {
      const m = this.pool[i];
      if (m.alive) {
        m.t += dt / m.dur;
        if (m.t >= 1) m.alive = false;
      }
      this.uAxis[i].w = m.alive ? m.t : 2;
      any ||= m.alive;
    }
    if (this.rate > 0.02) {
      this.timer -= dt * this.rate;
      if (this.timer <= 0) {
        this.timer = this.rng.range(2.5, 9);
        this.spawn(up, view);
        any = true;
      }
    }
    this.mesh.visible = any;
  }

  private spawn(up: Vector3, view: Vector3): void {
    const m = this.pool.find((p) => !p.alive);
    if (!m) return;
    const r = this.rng;
    // start somewhere in front of the camera, 20–65° above the horizon
    _a.copy(view).addScaledVector(up, -view.dot(up));
    if (_a.lengthSq() < 1e-4) _a.set(1, 0, 0).addScaledVector(up, -up.x);
    _a.normalize();
    _b.crossVectors(up, _a).normalize();
    const az = r.range(-0.7, 0.7);
    const el = r.range(0.35, 1.1);
    m.start.copy(_a).multiplyScalar(Math.cos(az)).addScaledVector(_b, Math.sin(az)).multiplyScalar(Math.cos(el)).addScaledVector(up, Math.sin(el)).normalize();
    // travel mostly downward and sideways
    const side = r.chance(0.5) ? 1 : -1;
    _a.copy(_b).multiplyScalar(side * r.range(0.6, 1)).addScaledVector(up, -r.range(0.3, 0.8));
    m.axis.copy(_a).addScaledVector(m.start, -_a.dot(m.start)).normalize();
    m.arc = r.range(0.18, 0.42);
    m.dur = r.range(0.45, 1.0);
    m.t = 0;
    m.alive = true;
    const i = this.pool.indexOf(m);
    this.uStart[i].set(m.start.x, m.start.y, m.start.z, m.arc);
    this.uAxis[i].set(m.axis.x, m.axis.y, m.axis.z, 0);
    this.uLook[i].set(r.range(0.6, 1.3), r.range(0.0012, 0.0026), r.next(), 0);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
