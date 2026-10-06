/**
 * OWNER: cosmos.
 * WarpView — the jump between worlds: ~1 800 instanced star streaks rushing past (length grows with speed²), a
 * tunnel glow tinted by the destination star, a gentle camera roll; and BlendView — a render-target compositor that
 * crossfades / zooms between any two Views (planet ↔ system ↔ galaxy ↔ universe ↔ warp) so level changes feel like
 * one continuous camera move.
 */
import { AdditiveBlending, Color, HalfFloatType, InstancedBufferAttribute, InstancedBufferGeometry, LinearFilter, Mesh, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget, type WebGLRenderer } from 'three';
import type { View } from '../../render/View';
import type { ViewKind } from '../../core/types';
import { Rng } from '../../core/rng';
import { BILLBOARD_VERT, OUTPUT } from './glsl';
import { planeGeo } from './bodies';

const STREAK_VERT = /* glsl */ `
attribute vec3 aOffset;
attribute float aRand;
attribute vec3 aColor;
uniform float uTravel;
uniform float uSpeed;
uniform float uDepth;
varying float vAlong;
varying float vFar;
varying vec3 vColor;
void main() {
  float z = mod(aOffset.z + uTravel * (0.6 + aRand * 0.8), uDepth) - uDepth;
  float len = 0.4 + uSpeed * uSpeed * 34.0 * (0.6 + aRand * 0.6);
  vec2 xy = aOffset.xy;
  vec2 dir = normalize(xy);
  vec2 perp = vec2(-dir.y, dir.x);
  float along = position.y + 0.5;
  vec3 p = vec3(xy + perp * position.x * (0.06 + 0.05 * aRand), z - along * len);
  vAlong = along;
  vFar = clamp(-z / uDepth, 0.0, 1.0);
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const STREAK_FRAG = /* glsl */ `
uniform float uSpeed;
varying float vAlong;
varying float vFar;
varying vec3 vColor;
void main() {
  float a = (1.0 - vAlong) * smoothstep(0.0, 0.08, vAlong);
  a *= (1.0 - vFar) * smoothstep(1.0, 0.75, vFar);
  gl_FragColor = vec4(vColor * a * (0.6 + uSpeed * 2.2), 1.0);
  ${OUTPUT}
}
`;
const TUNNEL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uSpeed;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float core = exp(-r * 9.0) * (0.4 + uSpeed * 2.8);
  float ring = exp(-pow((r - 0.35 - 0.1 * sin(uTime * 2.0)) * 6.0, 2.0)) * 0.25 * uSpeed;
  float halo = exp(-r * 2.5) * 0.3 * uSpeed;
  gl_FragColor = vec4(uColor * (core + ring + halo), 1.0);
  ${OUTPUT}
}
`;

export class WarpView implements View {
  readonly kind: ViewKind;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(72, 1, 0.1, 2000);
  private mat: ShaderMaterial;
  private tunnelMat: ShaderMaterial;
  private geo: InstancedBufferGeometry;
  private t = 0;
  private travel = 0;
  /** 0..1 */
  speed = 0;
  duration = 2.2;

  constructor(kind: ViewKind, color: number, count = 1800) {
    this.kind = kind;
    this.scene.background = new Color(0x000004);
    const rng = new Rng(4242);
    const base = new PlaneGeometry(1, 1);
    this.geo = new InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    const off = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    const col = new Float32Array(count * 3);
    const tint = new Color(color);
    const white = new Color(0xffffff);
    const blue = new Color(0x8fb4ff);
    const c = new Color();
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = 1.2 + Math.pow(rng.next(), 0.7) * 28;
      off[i * 3] = Math.cos(a) * r;
      off[i * 3 + 1] = Math.sin(a) * r;
      off[i * 3 + 2] = -rng.range(0, 300);
      rnd[i] = rng.next();
      c.copy(white).lerp(rng.chance(0.5) ? tint : blue, rng.range(0.2, 0.9));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    this.geo.setAttribute('aOffset', new InstancedBufferAttribute(off, 3));
    this.geo.setAttribute('aRand', new InstancedBufferAttribute(rnd, 1));
    this.geo.setAttribute('aColor', new InstancedBufferAttribute(col, 3));
    this.geo.instanceCount = count;
    this.mat = new ShaderMaterial({ vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG, uniforms: { uTravel: { value: 0 }, uSpeed: { value: 0 }, uDepth: { value: 300 } }, blending: AdditiveBlending, transparent: true, depthWrite: false, depthTest: false });
    const streaks = new Mesh(this.geo, this.mat);
    streaks.frustumCulled = false;
    this.scene.add(streaks);
    this.tunnelMat = new ShaderMaterial({ vertexShader: BILLBOARD_VERT, fragmentShader: TUNNEL_FRAG, uniforms: { uColor: { value: tint.clone().lerp(white, 0.3) }, uSpeed: { value: 0 }, uTime: { value: 0 }, uScale: { value: 220 } }, blending: AdditiveBlending, transparent: true, depthWrite: false, depthTest: false });
    const tunnel = new Mesh(planeGeo(), this.tunnelMat);
    tunnel.position.set(0, 0, -260);
    tunnel.frustumCulled = false;
    tunnel.renderOrder = -1;
    this.scene.add(tunnel);
    this.scene.add(this.camera);
    base.dispose();
  }

  /** 0..1 progress through the jump */
  get progress(): number {
    return Math.min(1, this.t / this.duration);
  }

  update(dt: number): void {
    this.t += dt;
    const p = this.progress;
    // ramp up fast, hold, surge at the end
    this.speed = p < 0.35 ? Math.pow(p / 0.35, 1.6) * 0.8 : 0.8 + 0.2 * Math.min(1, (p - 0.35) / 0.6);
    this.travel += dt * (6 + this.speed * this.speed * 520);
    this.mat.uniforms.uTravel.value = this.travel;
    this.mat.uniforms.uSpeed.value = this.speed;
    this.tunnelMat.uniforms.uSpeed.value = this.speed;
    this.tunnelMat.uniforms.uTime.value = this.t;
    this.camera.rotation.z = Math.sin(this.t * 1.3) * 0.06 * this.speed;
    this.camera.fov = 72 + this.speed * 18;
    this.camera.updateProjectionMatrix();
  }

  onResize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.tunnelMat.dispose();
    this.scene.clear();
  }
}

// ───────────────────────────────────────────── BlendView

const BLEND_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const BLEND_FRAG = /* glsl */ `
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uT;
uniform float uZa;
uniform float uZb;
varying vec2 vUv;
vec4 sampleZ(sampler2D t, vec2 uv, float s) {
  vec2 q = (uv - 0.5) / s + 0.5;
  float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  return texture2D(t, clamp(q, 0.0, 1.0)) * inside;
}
void main() {
  float t = uT;
  vec4 a = sampleZ(tA, vUv, mix(1.0, uZa, t));
  vec4 b = sampleZ(tB, vUv, mix(uZb, 1.0, t));
  float m = smoothstep(0.1, 0.9, t);
  gl_FragColor = vec4(mix(a.rgb, b.rgb, m), 1.0);
  ${OUTPUT}
}
`;

export type BlendMode = 'cross' | 'out' | 'in';

export class BlendView implements View {
  readonly kind: ViewKind;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 10);
  private rtA: WebGLRenderTarget;
  private rtB: WebGLRenderTarget;
  private mat: ShaderMaterial;
  private t = 0;
  private finished = false;
  private size = new Vector2();
  private w = 1;
  private h = 1;

  constructor(
    private renderer: WebGLRenderer,
    readonly from: View,
    readonly to: View,
    private duration: number,
    mode: BlendMode,
    private scale = 1,
  ) {
    this.kind = to.kind;
    const ext = renderer.extensions;
    const half = ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float');
    const opts = { type: half ? HalfFloatType : UnsignedByteType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true, stencilBuffer: false };
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(2, Math.round(this.size.x * scale)), h = Math.max(2, Math.round(this.size.y * scale));
    this.rtA = new WebGLRenderTarget(w, h, opts);
    this.rtB = new WebGLRenderTarget(w, h, opts);
    const za = mode === 'out' ? 0.72 : mode === 'in' ? 1.6 : 1.0;
    const zb = mode === 'out' ? 1.5 : mode === 'in' ? 0.7 : 1.0;
    this.mat = new ShaderMaterial({ vertexShader: BLEND_VERT, fragmentShader: BLEND_FRAG, uniforms: { tA: { value: this.rtA.texture }, tB: { value: this.rtB.texture }, uT: { value: 0 }, uZa: { value: za }, uZb: { value: zb } }, depthTest: false, depthWrite: false });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  get progress(): number {
    return Math.min(1, this.t / this.duration);
  }

  update(dt: number): void {
    this.t += dt;
    const r = this.renderer;
    try {
      this.from.update(dt);
      this.to.update(dt);
      const aspect = this.w / this.h;
      for (const v of [this.from, this.to]) {
        if (v.camera.aspect !== aspect) {
          v.camera.aspect = aspect;
          v.camera.updateProjectionMatrix();
        }
      }
      const prev = r.getRenderTarget();
      r.setRenderTarget(this.rtA);
      r.clear();
      r.render(this.from.scene, this.from.camera);
      r.setRenderTarget(this.rtB);
      r.clear();
      r.render(this.to.scene, this.to.camera);
      r.setRenderTarget(prev);
    } catch (e) {
      console.error('[cosmos] blend render failed', e);
      this.t = this.duration;
    }
    const p = this.progress;
    this.mat.uniforms.uT.value = p * p * (3 - 2 * p);
    if (p >= 1) this.finished = true;
  }

  /** true once the blend reached the target (Cosmos hands over to `to` on its next update) */
  get done(): boolean {
    return this.finished;
  }

  onResize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.renderer.getDrawingBufferSize(this.size);
    const sw = Math.max(2, Math.round(this.size.x * this.scale)), sh = Math.max(2, Math.round(this.size.y * this.scale));
    this.rtA.setSize(sw, sh);
    this.rtB.setSize(sw, sh);
    this.from.onResize?.(w, h);
    this.to.onResize?.(w, h);
  }

  dispose(): void {
    this.rtA.dispose();
    this.rtB.dispose();
    this.mat.dispose();
    (this.scene.children[0] as Mesh | undefined)?.geometry.dispose();
    this.scene.clear();
  }
}
