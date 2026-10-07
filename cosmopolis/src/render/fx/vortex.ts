/**
 * OWNER: god.
 * Tornado — a living funnel: two nested twisted cones (dense rope core + translucent outer shroud) whose axis
 * snakes in the wind, rotating noise bands, a debris skirt at the ground and a CPU-driven vortex of rubble,
 * leaves and dust that spirals up the funnel (a few hundred points, written to one buffer per frame).
 * The FX layer drives `base`/`up` as the storm travels; `strength` 0..1 grows / dissipates it.
 */
import {
  BufferAttribute,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  BufferGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { shared } from '../materials';
import { FX_NIGHT, FX_NOISE } from './glsl';
import { fxRand } from './particles';

const FUNNEL_VERT = /* glsl */ `
uniform float uTime;
uniform float uHeight;
uniform float uR0;
uniform float uR1;
uniform float uBend;
uniform float uStrength;
varying vec2 vUv;
varying vec3 vW;
varying vec3 vN;
varying float vY;
void main() {
  float y = position.y; // 0..1
  vUv = uv;
  vY = y;
  float r = mix(uR0, uR1, pow(y, 1.7)) * (0.35 + 0.65 * uStrength);
  r *= 1.0 + 0.08 * sin(uv.x * 6.2831 * 3.0 + uTime * 5.0 + y * 9.0);
  float h = y * uHeight * (0.55 + 0.45 * uStrength);
  // snaking axis (rope tornado)
  vec2 off = vec2(sin(y * 3.1 + uTime * 0.9), cos(y * 2.3 + uTime * 0.7)) * uBend * y * y;
  vec3 dirXZ = normalize(vec3(position.x, 0.0, position.z) + vec3(1e-5));
  vec3 p = vec3(dirXZ.x * r + off.x, h, dirXZ.z * r + off.y);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * dirXZ);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FUNNEL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uSpin;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
varying vec2 vUv;
varying vec3 vW;
varying vec3 vN;
varying float vY;
${FX_NOISE}
${FX_NIGHT}
void main() {
  float u = vUv.x * 6.2831;
  vec2 q = vec2(u * 2.0 + vY * 7.0 - uTime * uSpin, vY * 9.0 - uTime * 1.5);
  float n = fxFbm2(vec2(cos(q.x), sin(q.x)) * 1.6 + vec2(q.y * 0.5, q.y));
  float bands = 0.55 + 0.45 * sin(u * 3.0 + vY * 26.0 - uTime * uSpin * 1.3 + n * 4.0);
  float a = smoothstep(0.25, 0.75, n * 0.8 + bands * 0.5);
  a *= smoothstep(0.0, 0.06, vY) * (1.0 - smoothstep(0.82, 1.0, vY));
  vec3 V = normalize(uCameraPos - vW);
  float rim = 1.0 - abs(dot(normalize(vN), V));
  a *= mix(0.55, 1.0, rim) * uOpacity;
  float lit = 0.35 + 0.65 * max(0.0, dot(normalize(vN), uSunDir));
  vec3 col = mix(uColor2, uColor, n) * lit * mix(1.0, 0.25, fxNight(vW));
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * a, a);
}
`;

const PTS_VERT = /* glsl */ `
attribute float aKind;
attribute float aSize;
uniform float uScale;
varying float vKind;
varying float vSeed;
varying vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 128.0);
  vKind = aKind;
  vSeed = fract(float(gl_VertexID) * 0.618);
}
`;
const PTS_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uSunDir;
varying float vKind;
varying float vSeed;
varying vec3 vW;
${FX_NOISE}
${FX_NIGHT}
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float a;
  vec3 col;
  if (vKind < 0.5) {
    vec2 q = fxRot(vSeed * 6.28 + uTime * (vSeed * 8.0 - 4.0)) * c;
    a = step(max(abs(q.x * (1.0 + vSeed)), abs(q.y)), 0.6);
    col = mix(vec3(0.32, 0.29, 0.26), vec3(0.55, 0.5, 0.44), vSeed);
  } else if (vKind < 1.5) {
    vec2 q = fxRot(vSeed * 6.28 + uTime * 3.0) * c;
    a = step(length(q * vec2(1.0, 2.2)), 0.8);
    col = mix(vec3(0.25, 0.42, 0.16), vec3(0.5, 0.62, 0.22), vSeed);
  } else {
    float r = length(c);
    float n = fxNoise2(c * 2.0 + vSeed * 30.0 + uTime * 0.3);
    a = smoothstep(1.0, 0.3, r + (n - 0.5) * 0.6) * 0.45;
    col = vec3(0.55, 0.5, 0.45);
  }
  a *= uOpacity;
  if (a < 0.02) discard;
  col *= mix(1.0, 0.25, fxNight(vW));
  gl_FragColor = vec4(col * a, a);
}
`;

const N_PTS = 360;
const _q = new Quaternion();
const _y = new Vector3(0, 1, 0);

export class Tornado {
  readonly group = new Group();
  readonly base = new Vector3();
  readonly up = new Vector3(0, 1, 0);
  strength = 0;
  /** 0..1 fade multiplier */
  opacity = 1;
  height = 26;
  private core: Mesh;
  private shroud: Mesh;
  private coreU: Record<string, { value: unknown }>;
  private shroudU: Record<string, { value: unknown }>;
  private pts: Points;
  private ptsU: Record<string, { value: unknown }>;
  private pos: Float32Array;
  private ang: Float32Array;
  private hgt: Float32Array;
  private rad: Float32Array;
  private spd: Float32Array;
  private time = 0;

  constructor(parent: Object3D, private scaleUniform: { value: number }, color = 0x8a8178, color2 = 0x4a443e) {
    const geo = new CylinderGeometry(1, 1, 1, 40, 24, true);
    geo.translate(0, 0.5, 0);
    const mk = (r0: number, r1: number, opacity: number, spin: number, bend: number) => {
      const u = {
        uTime: { value: 0 },
        uHeight: { value: this.height },
        uR0: { value: r0 },
        uR1: { value: r1 },
        uBend: { value: bend },
        uStrength: { value: 0 },
        uOpacity: { value: opacity },
        uSpin: { value: spin },
        uColor: { value: new Color(color) },
        uColor2: { value: new Color(color2) },
      };
      const mat = new ShaderMaterial({
        vertexShader: FUNNEL_VERT,
        fragmentShader: FUNNEL_FRAG,
        uniforms: { ...u, uSunDir: shared.uSunDir, uCameraPos: shared.uCameraPos },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
      });
      const m = new Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = 9;
      return { m, u };
    };
    const a = mk(0.45, 5.2, 0.95, 6, 2.2);
    const b = mk(1.1, 8.5, 0.42, 3.5, 2.6);
    this.core = a.m;
    this.coreU = a.u;
    this.shroud = b.m;
    this.shroudU = b.u;
    this.group.add(this.shroud, this.core);
    // vortex points
    const pg = new BufferGeometry();
    this.pos = new Float32Array(N_PTS * 3);
    const kind = new Float32Array(N_PTS);
    const size = new Float32Array(N_PTS);
    this.ang = new Float32Array(N_PTS);
    this.hgt = new Float32Array(N_PTS);
    this.rad = new Float32Array(N_PTS);
    this.spd = new Float32Array(N_PTS);
    for (let i = 0; i < N_PTS; i++) {
      const k = fxRand();
      kind[i] = k < 0.55 ? 0 : k < 0.75 ? 1 : 2;
      size[i] = kind[i] === 2 ? 2.2 + fxRand() * 2.4 : 0.18 + fxRand() * 0.3;
      this.reset(i, true);
    }
    const pa = new BufferAttribute(this.pos, 3);
    pa.setUsage(DynamicDrawUsage);
    pg.setAttribute('position', pa);
    pg.setAttribute('aKind', new BufferAttribute(kind, 1));
    pg.setAttribute('aSize', new BufferAttribute(size, 1));
    this.ptsU = { uTime: { value: 0 }, uOpacity: { value: 1 }, uScale: this.scaleUniform };
    const pm = new ShaderMaterial({
      vertexShader: PTS_VERT,
      fragmentShader: PTS_FRAG,
      uniforms: { ...this.ptsU, uSunDir: shared.uSunDir },
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    this.pts = new Points(pg, pm);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 10;
    this.group.add(this.pts);
    this.group.name = 'fx-tornado';
    parent.add(this.group);
  }

  private reset(i: number, scatter: boolean): void {
    this.ang[i] = fxRand() * Math.PI * 2;
    this.hgt[i] = scatter ? fxRand() * this.height * 0.9 : fxRand() * 1.5;
    this.rad[i] = 0.6 + fxRand() * 2.5;
    this.spd[i] = 0.6 + fxRand() * 0.8;
  }

  /** Funnel radius at height h (local units), for flyers that orbit it. */
  radiusAt(h: number): number {
    const y = Math.max(0, Math.min(1, h / this.height));
    return (0.45 + (5.2 - 0.45) * Math.pow(y, 1.7)) * (0.35 + 0.65 * this.strength);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    // orient group: base at surface, +Y along up
    this.group.position.copy(this.base);
    _q.setFromUnitVectors(_y, this.up);
    this.group.quaternion.copy(_q);
    const s = this.strength;
    for (const u of [this.coreU, this.shroudU]) {
      u.uTime.value = t;
      u.uStrength.value = s;
      u.uHeight.value = this.height;
    }
    this.coreU.uOpacity.value = 0.95 * this.opacity * Math.min(1, s * 1.5);
    this.shroudU.uOpacity.value = 0.42 * this.opacity * Math.min(1, s * 1.5);
    this.ptsU.uTime.value = t;
    this.ptsU.uOpacity.value = this.opacity * Math.min(1, s * 2);
    // vortex points spiral up the funnel
    const H = this.height * (0.55 + 0.45 * s);
    for (let i = 0; i < N_PTS; i++) {
      let h = this.hgt[i];
      const y = Math.max(0, Math.min(1, h / H));
      const r = this.radiusAt(h) * (0.9 + this.rad[i] * 0.35) + 0.4;
      this.ang[i] += dt * (7.5 - y * 4) * this.spd[i];
      h += dt * (3.5 + y * 6) * this.spd[i] * (0.4 + s);
      this.hgt[i] = h;
      if (h > H * (0.75 + 0.25 * (i % 7) / 7)) this.reset(i, false);
      const bx = Math.sin(y * 3.1 + t * 0.9) * 2.2 * y * y;
      const bz = Math.cos(y * 2.3 + t * 0.7) * 2.2 * y * y;
      this.pos[i * 3] = Math.cos(this.ang[i]) * r + bx;
      this.pos[i * 3 + 1] = h;
      this.pos[i * 3 + 2] = Math.sin(this.ang[i]) * r + bz;
    }
    (this.pts.geometry.attributes.position as BufferAttribute).needsUpdate = true;
  }

  /** Local axis offset (snaking) at height h — matches the shader. */
  axisOffset(h: number, out: Vector3): Vector3 {
    const H = this.height * (0.55 + 0.45 * this.strength);
    const y = Math.max(0, Math.min(1, h / H));
    return out.set(Math.sin(y * 3.1 + this.time * 0.9) * 2.2 * y * y, h, Math.cos(y * 2.3 + this.time * 0.7) * 2.2 * y * y);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.core.geometry.dispose();
    (this.core.material as ShaderMaterial).dispose();
    (this.shroud.material as ShaderMaterial).dispose();
    this.pts.geometry.dispose();
    (this.pts.material as ShaderMaterial).dispose();
  }
}
