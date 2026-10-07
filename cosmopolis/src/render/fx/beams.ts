/**
 * OWNER: god.
 * Beams & lightning.
 *   Beam  — an additive energy cylinder between two points (tractor beams, lasers, divine light, the planet
 *           cracker, gamma bursts, relativistic jets): bright view-facing core, scrolling plasma noise, optional
 *           tractor rings. Pooled (`BeamPool.get()` / `beam.release()`).
 *   Bolts — jagged lightning: a midpoint-displaced trunk with forking branches, drawn as camera-facing ribbons
 *           (constant pixel-ish width) that strobe and fade. Pooled, fixed-size buffers, no per-frame allocation.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  OneFactor,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { shared } from '../materials';
import { FX_NOISE } from './glsl';
import { fxRand } from './particles';

// ───────────────────────────────────────────────────────────── beams

const BEAM_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * vec3(position.x, 0.0, position.z));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uIntensity;
uniform float uTime;
uniform float uLen;
uniform float uStyle;
uniform float uSpeed;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform vec3 uCameraPos;
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
${FX_NOISE}
void main() {
  float facing = abs(dot(normalize(vN), normalize(uCameraPos - vW)));
  float core = pow(facing, 2.5);
  float hot = pow(facing, 14.0);
  float n = fxNoise2(vec2(vUv.x * 8.0, vUv.y * uLen * 0.45 - uTime * uSpeed));
  float ends = smoothstep(0.0, uFadeStart, vUv.y) * (1.0 - smoothstep(1.0 - uFadeEnd, 1.0, vUv.y));
  float bands = 1.0;
  if (uStyle > 0.5 && uStyle < 1.5) bands = 0.45 + 0.55 * smoothstep(0.3, 0.9, sin(vUv.y * uLen * 1.4 - uTime * 7.0) * 0.5 + 0.5);
  if (uStyle > 1.5) bands = 0.7 + 0.3 * sin(vUv.x * 6.2831 * 3.0 + vUv.y * uLen * 0.8 - uTime * 9.0);
  float a = (core * (0.55 + 0.45 * n) * bands + hot * 1.2) * ends * uIntensity;
  vec3 col = mix(uColor, uCore, hot);
  gl_FragColor = vec4(col * a, 0.0);
}
`;

const _q = new Quaternion();
const _d = new Vector3();
const UP = new Vector3(0, 1, 0);

export const BeamStyle = { Plain: 0, Tractor: 1, Spiral: 2 } as const;

export class Beam {
  readonly mesh: Mesh;
  readonly u = {
    uColor: { value: new Color(0x8fd8ff) },
    uCore: { value: new Color(0xffffff) },
    uIntensity: { value: 1 },
    uTime: { value: 0 },
    uLen: { value: 10 },
    uStyle: { value: 0 },
    uSpeed: { value: 6 },
    uFadeStart: { value: 0.03 },
    uFadeEnd: { value: 0.05 },
  };
  inUse = false;
  constructor(geo: BufferGeometry, parent: Object3D) {
    const mat = new ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { ...this.u, uCameraPos: shared.uCameraPos },
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 13;
    this.mesh.name = 'fx-beam';
    parent.add(this.mesh);
  }

  /** Span the beam from a to b with radius r. */
  set(a: Vector3, b: Vector3, r: number, color: number, intensity = 1, style = 0): this {
    _d.subVectors(b, a);
    const len = Math.max(1e-3, _d.length());
    _q.setFromUnitVectors(UP, _d.divideScalar(len));
    this.mesh.position.copy(a);
    this.mesh.quaternion.copy(_q);
    this.mesh.scale.set(r, len, r);
    this.u.uLen.value = len;
    this.u.uColor.value.setHex(color);
    this.u.uIntensity.value = intensity;
    this.u.uStyle.value = style;
    this.mesh.visible = intensity > 0.001;
    return this;
  }

  release(): void {
    this.inUse = false;
    this.mesh.visible = false;
  }
}

export class BeamPool {
  private geo: BufferGeometry;
  private beams: Beam[] = [];
  constructor(private parent: Object3D) {
    this.geo = new CylinderGeometry(1, 1, 1, 18, 1, true);
    this.geo.translate(0, 0.5, 0);
  }
  get(): Beam {
    let b = this.beams.find((x) => !x.inUse);
    if (!b) {
      b = new Beam(this.geo, this.parent);
      this.beams.push(b);
    }
    b.inUse = true;
    b.u.uCore.value.setHex(0xffffff);
    b.u.uSpeed.value = 6;
    b.u.uFadeStart.value = 0.03;
    b.u.uFadeEnd.value = 0.05;
    return b;
  }
  update(time: number): void {
    for (const b of this.beams) if (b.inUse) b.u.uTime.value = time;
  }
  releaseAll(): void {
    for (const b of this.beams) b.release();
  }
  dispose(): void {
    for (const b of this.beams) {
      b.mesh.removeFromParent();
      (b.mesh.material as ShaderMaterial).dispose();
    }
    this.beams = [];
    this.geo.dispose();
  }
}

// ───────────────────────────────────────────────────────────── lightning

const BOLT_VERT = /* glsl */ `
attribute vec3 aOther;
attribute vec2 aSide;
uniform float uWidth;
varying float vSide;
varying float vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 wo = modelMatrix * vec4(aOther, 1.0);
  vec3 dir = normalize(wo.xyz - wp.xyz + vec3(1e-6));
  vec3 view = normalize(cameraPosition - wp.xyz);
  vec3 side = normalize(cross(dir, view) + vec3(1e-6));
  float dist = length(cameraPosition - wp.xyz);
  float w = uWidth * aSide.y * clamp(dist * 0.012, 0.35, 4.0);
  wp.xyz += side * aSide.x * w;
  vSide = aSide.x;
  vW = aSide.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const BOLT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying float vSide;
varying float vW;
void main() {
  float s = abs(vSide);
  float core = exp(-s * s * 18.0);
  float glow = exp(-s * s * 2.5) * 0.45;
  vec3 col = mix(uColor, vec3(1.0), core);
  float a = (core * 1.6 + glow) * uIntensity * min(1.0, vW * 1.6);
  gl_FragColor = vec4(col * a, 0.0);
}
`;

const MAX_SEG = 160;

interface BoltState {
  mesh: Mesh;
  pos: Float32Array;
  other: Float32Array;
  side: Float32Array;
  geo: BufferGeometry;
  age: number;
  life: number;
  strobes: number;
  active: boolean;
  intensity: { value: number };
  color: { value: Color };
}

const _a = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _perp1 = new Vector3();
const _perp2 = new Vector3();
const _pts: Vector3[] = Array.from({ length: 70 }, () => new Vector3());

export class Bolts {
  private bolts: BoltState[] = [];
  constructor(private parent: Object3D, count = 6) {
    for (let i = 0; i < count; i++) this.bolts.push(this.make());
  }

  private make(): BoltState {
    const geo = new BufferGeometry();
    const pos = new Float32Array(MAX_SEG * 4 * 3);
    const other = new Float32Array(MAX_SEG * 4 * 3);
    const side = new Float32Array(MAX_SEG * 4 * 2);
    const idx = new Uint16Array(MAX_SEG * 6);
    for (let s = 0; s < MAX_SEG; s++) {
      const v = s * 4;
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], s * 6);
    }
    const pa = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage);
    const oa = new BufferAttribute(other, 3).setUsage(DynamicDrawUsage);
    const sa = new BufferAttribute(side, 2).setUsage(DynamicDrawUsage);
    geo.setAttribute('position', pa);
    geo.setAttribute('aOther', oa);
    geo.setAttribute('aSide', sa);
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    const intensity = { value: 0 };
    const color = { value: new Color(0xb9a8ff) };
    const mat = new ShaderMaterial({
      vertexShader: BOLT_VERT,
      fragmentShader: BOLT_FRAG,
      uniforms: { uColor: color, uIntensity: intensity, uWidth: { value: 0.09 } },
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      side: DoubleSide,
    });
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 14;
    mesh.name = 'fx-bolt';
    this.parent.add(mesh);
    return { mesh, pos, other, side, geo, age: 0, life: 0, strobes: 1, active: false, intensity, color };
  }

  /**
   * Strike from `from` to `to`. `jag` = sideways roughness as a fraction of the length; `branches` forks.
   * Returns the bolt index (or -1).
   */
  strike(from: Vector3, to: Vector3, o: { color?: number; width?: number; jag?: number; branches?: number; life?: number; strobes?: number } = {}): number {
    let i = this.bolts.findIndex((b) => !b.active);
    if (i < 0) {
      i = 0;
      let oldest = -1;
      this.bolts.forEach((b, k) => {
        if (b.age / Math.max(b.life, 1e-3) > oldest) {
          oldest = b.age / Math.max(b.life, 1e-3);
          i = k;
        }
      });
    }
    const b = this.bolts[i];
    b.color.value.setHex(o.color ?? 0xc4b5ff);
    (b.mesh.material as ShaderMaterial).uniforms.uWidth.value = o.width ?? 0.09;
    let seg = 0;
    const len = from.distanceTo(to);
    const jag = (o.jag ?? 0.12) * len;
    seg = this.writePath(b, seg, from, to, 32, jag, 1);
    const branches = o.branches ?? 3;
    for (let k = 0; k < branches && seg < MAX_SEG - 20; k++) {
      // fork from a random point along the trunk
      const t = 0.2 + fxRand() * 0.55;
      _a.lerpVectors(from, to, t);
      _a.addScaledVector(randPerp(from, to), (fxRand() - 0.5) * jag);
      _b.copy(_a).addScaledVector(_p.subVectors(to, from), 0.15 + fxRand() * 0.3).addScaledVector(randPerp(from, to), (fxRand() - 0.5) * len * 0.35);
      seg = this.writePath(b, seg, _a, _b, 14, jag * 0.45, 0.55);
    }
    b.geo.setDrawRange(0, seg * 6);
    (b.geo.attributes.position as BufferAttribute).needsUpdate = true;
    (b.geo.attributes.aOther as BufferAttribute).needsUpdate = true;
    (b.geo.attributes.aSide as BufferAttribute).needsUpdate = true;
    b.age = 0;
    b.life = o.life ?? 0.55;
    b.strobes = o.strobes ?? 3;
    b.active = true;
    b.mesh.visible = true;
    b.intensity.value = 1.4;
    return i;
  }

  private writePath(b: BoltState, seg: number, from: Vector3, to: Vector3, n: number, jag: number, width: number): number {
    n = Math.min(n, _pts.length - 1, MAX_SEG - seg);
    if (n < 1) return seg;
    // midpoint displacement into _pts[0..n]
    _pts[0].copy(from);
    _pts[n].copy(to);
    const fill = (lo: number, hi: number, amp: number) => {
      if (hi - lo < 2) return;
      const mid = (lo + hi) >> 1;
      _pts[mid].lerpVectors(_pts[lo], _pts[hi], 0.5).addScaledVector(randPerp(from, to), (fxRand() - 0.5) * amp);
      fill(lo, mid, amp * 0.55);
      fill(mid, hi, amp * 0.55);
    };
    fill(0, n, jag);
    for (let k = 0; k < n; k++) {
      const p0 = _pts[k], p1 = _pts[k + 1];
      const w0 = width * (1 - (k / n) * 0.6), w1 = width * (1 - ((k + 1) / n) * 0.6);
      const v = seg * 4;
      setV(b, v, p0, p1, -1, w0);
      setV(b, v + 1, p0, p1, 1, w0);
      setV(b, v + 2, p1, p0, 1, w1);
      setV(b, v + 3, p1, p0, -1, w1);
      seg++;
    }
    return seg;
  }

  update(dt: number): void {
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.age += dt;
      const t = b.age / b.life;
      if (t >= 1) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }
      // strobe: a few re-flashes decaying
      const ph = t * b.strobes;
      const f = Math.pow(1 - (ph - Math.floor(ph)), 2.2);
      b.intensity.value = (0.35 + 1.6 * f) * (1 - t * 0.8);
    }
  }

  clear(): void {
    for (const b of this.bolts) {
      b.active = false;
      b.mesh.visible = false;
    }
  }

  dispose(): void {
    for (const b of this.bolts) {
      b.mesh.removeFromParent();
      b.geo.dispose();
      (b.mesh.material as ShaderMaterial).dispose();
    }
    this.bolts = [];
  }
}

function setV(b: BoltState, v: number, p: Vector3, other: Vector3, side: number, w: number): void {
  b.pos[v * 3] = p.x;
  b.pos[v * 3 + 1] = p.y;
  b.pos[v * 3 + 2] = p.z;
  b.other[v * 3] = other.x;
  b.other[v * 3 + 1] = other.y;
  b.other[v * 3 + 2] = other.z;
  // "other" for the second end points backwards: flip side so the ribbon stays consistent
  const flip = v % 4 >= 2 ? -1 : 1;
  b.side[v * 2] = side * flip;
  b.side[v * 2 + 1] = w;
}

/** A random unit vector perpendicular to (to − from). */
function randPerp(from: Vector3, to: Vector3): Vector3 {
  _perp1.subVectors(to, from).normalize();
  _perp2.set(fxRand() - 0.5, fxRand() - 0.5, fxRand() - 0.5);
  _perp2.addScaledVector(_perp1, -_perp2.dot(_perp1));
  if (_perp2.lengthSq() < 1e-6) _perp2.set(1, 0, 0);
  return _perp2.normalize();
}
