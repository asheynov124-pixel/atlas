/**
 * OWNER: god.
 * Ground FX: Cracks — jagged fissures drawn as ribbons hugging the terrain (earthquakes, rifts, sinkholes, the
 * planet cracker's seam). A crack "unzips" along its length from its birth time, opens to its width, can glow with
 * magma (glow 0..1) and fades out after its life. One pooled mesh for every crack (fixed buffers, partial uploads),
 * one draw call. Points are planet-space surface points; the ribbon is extruded sideways in the vertex shader.
 */
import { BufferAttribute, BufferGeometry, CustomBlending, DynamicDrawUsage, Mesh, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector3, type Object3D } from 'three';
import { shared } from '../materials';
import { FX_NIGHT, FX_NOISE } from './glsl';
import type { FxObject } from './FxLayer';

const VERT = /* glsl */ `
attribute vec3 aSideDir;
attribute vec4 aData; // side (-1..1), u along 0..1, width, glow
attribute vec2 aTime; // birth, life
uniform float uTime;
varying float vSide;
varying float vU;
varying float vGlow;
varying float vFade;
varying vec3 vW;
void main() {
  float age = uTime - aTime.x;
  float unzip = clamp(age / 0.7, 0.0, 1.0);
  float open = smoothstep(aData.y - 0.05, aData.y + 0.05, unzip * 1.1) * smoothstep(0.0, 1.2, age);
  float fade = 1.0 - smoothstep(aTime.y - 1.5, aTime.y, age);
  float w = aData.z * open * (0.8 + 0.2 * sin(aData.y * 37.0 + aTime.x * 3.0));
  vec3 p = position + aSideDir * aData.x * w;
  vSide = aData.x;
  vU = aData.y;
  vGlow = aData.w;
  vFade = fade * step(0.0, age) * open;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
varying float vSide;
varying float vU;
varying float vGlow;
varying float vFade;
varying vec3 vW;
${FX_NOISE}
${FX_NIGHT}
void main() {
  if (vFade <= 0.001) discard;
  float s = abs(vSide);
  float n = fxNoise2(vec2(vU * 60.0, vSide * 2.0));
  float core = 1.0 - smoothstep(0.35 + n * 0.25, 0.95, s);
  if (core <= 0.01) discard;
  vec3 rock = vec3(0.06, 0.05, 0.045);
  float magma = vGlow * (1.0 - smoothstep(0.0, 0.55, s)) * (0.65 + 0.35 * sin(uTime * 3.0 + vU * 40.0));
  vec3 col = mix(rock * mix(1.0, 0.4, fxNight(vW)), vec3(1.0, 0.42, 0.08) * 3.0, magma);
  float a = core * vFade;
  gl_FragColor = vec4(col * a, a);
}
`;

const _a = new Vector3();
const _b = new Vector3();
const _d = new Vector3();
const _s = new Vector3();
const _n = new Vector3();

export class Cracks implements FxObject {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  private pos: Float32Array;
  private side: Float32Array;
  private data: Float32Array;
  private time: Float32Array;
  private attrs: BufferAttribute[];
  private head = 0;
  private now = 0;

  constructor(parent: Object3D, private cap = 900) {
    const g = new BufferGeometry();
    const v = cap * 4;
    this.pos = new Float32Array(v * 3);
    this.side = new Float32Array(v * 3);
    this.data = new Float32Array(v * 4);
    this.time = new Float32Array(v * 2);
    for (let i = 0; i < v; i++) this.time[i * 2] = 1e9;
    const idx = new Uint32Array(cap * 6);
    for (let q = 0; q < cap; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6);
    const mk = (arr: Float32Array, n: number) => new BufferAttribute(arr, n).setUsage(DynamicDrawUsage);
    this.attrs = [mk(this.pos, 3), mk(this.side, 3), mk(this.data, 4), mk(this.time, 2)];
    g.setAttribute('position', this.attrs[0]);
    g.setAttribute('aSideDir', this.attrs[1]);
    g.setAttribute('aData', this.attrs[2]);
    g.setAttribute('aTime', this.attrs[3]);
    g.setIndex(new BufferAttribute(idx, 1));
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uSunDir: shared.uSunDir },
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'fx-cracks';
    parent.add(this.mesh);
  }

  /**
   * Add a crack along planet-space surface points. `width` world units, `glow` 0..1 magma, `life` seconds.
   * The path is jittered sideways for a jagged look. Returns quads written.
   */
  add(points: Vector3[], width = 0.35, glow = 0, life = 30, jag = 0.35, rand: () => number = Math.random): number {
    if (points.length < 2) return 0;
    let written = 0;
    // subdivide each span into a few jagged steps
    const pts: Vector3[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i], p1 = points[i + 1];
      const steps = Math.max(2, Math.round(p0.distanceTo(p1) / 0.45));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const p = new Vector3().lerpVectors(p0, p1, t);
        _n.copy(p).normalize();
        _d.subVectors(p1, p0).normalize();
        _s.crossVectors(_n, _d).normalize();
        if (k > 0 || i > 0) p.addScaledVector(_s, (rand() - 0.5) * jag);
        p.addScaledVector(_n, 0.05);
        pts.push(p);
      }
    }
    pts.push(points[points.length - 1].clone().addScaledVector(_n.copy(points[points.length - 1]).normalize(), 0.05));
    const total = pts.length - 1;
    for (let i = 0; i < total; i++) {
      const a = pts[i], b = pts[i + 1];
      _n.copy(a).normalize();
      _d.subVectors(b, a).normalize();
      _s.crossVectors(_n, _d).normalize();
      const u0 = i / total, u1 = (i + 1) / total;
      const taper = (u: number) => Math.min(1, Math.min(u, 1 - u) * 6 + 0.15);
      this.quad(a, b, _s, u0, u1, width * taper(u0), width * taper(u1), glow, life);
      written++;
    }
    return written;
  }

  private quad(a: Vector3, b: Vector3, side: Vector3, u0: number, u1: number, w0: number, w1: number, glow: number, life: number): void {
    const q = this.head;
    this.head = (this.head + 1) % this.cap;
    const v = q * 4;
    const set = (k: number, p: Vector3, sd: number, u: number, w: number) => {
      const i = v + k;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.side[i * 3] = side.x;
      this.side[i * 3 + 1] = side.y;
      this.side[i * 3 + 2] = side.z;
      this.data[i * 4] = sd;
      this.data[i * 4 + 1] = u;
      this.data[i * 4 + 2] = w;
      this.data[i * 4 + 3] = glow;
      this.time[i * 2] = this.now;
      this.time[i * 2 + 1] = life;
    };
    _a.copy(a);
    _b.copy(b);
    set(0, _a, -1, u0, w0);
    set(1, _a, 1, u0, w0);
    set(2, _b, -1, u1, w1);
    set(3, _b, 1, u1, w1);
    for (const at of this.attrs) at.needsUpdate = true;
  }

  update(_dt: number, time: number): void {
    this.now = time;
    this.mat.uniforms.uTime.value = time;
  }

  clear(): void {
    for (let i = 0; i < this.cap * 4; i++) this.time[i * 2] = 1e9;
    this.attrs[3].needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
