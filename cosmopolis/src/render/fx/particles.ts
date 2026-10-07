/**
 * OWNER: god.
 * GpuParticles — pooled, analytically-simulated GPU point particles. A particle is written ONCE when it is
 * spawned (ring buffer, partial buffer uploads); the vertex shader integrates its whole life:
 *     p(t) = p0 + v0·(1−e^(−k t))/k − n̂·½·g·t²  (+ curl-ish wobble)        n̂ = spawn point's planet normal
 * so there is zero per-particle CPU work per frame. Two systems per FxLayer: additive (fire, sparks, glows,
 * magic) and premultiplied-alpha (smoke, dust, snow, rain, ash, goo), i.e. two draw calls for every particle.
 * Shapes (kind): glow · spark streak · smoke puff · snowflake · rain streak · chunk · twinkle · flame · ring · coin.
 * Smoke and dust darken on the planet's night side; streaks align with their screen-space velocity.
 *
 * Presets (PRESETS) describe colour ramps, sizes, speeds, physics and shape; effects call
 *   emit(preset, pos, dir, count, speedMul?, sizeMul?, lifeMul?)  or  emitAt(preset, x,y,z, vx,vy,vz, sizeMul?, lifeMul?)
 * Capacity per quality tier keeps iPhones smooth (oldest particles are recycled first).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  ShaderMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { shared } from '../materials';
import { FX_NIGHT, FX_NOISE } from './glsl';

export const PK = {
  Glow: 0,
  Spark: 1,
  Smoke: 2,
  Snow: 3,
  Rain: 4,
  Chunk: 5,
  Twinkle: 6,
  Flame: 7,
  Ring: 8,
  Coin: 9,
} as const;

export interface ParticlePreset {
  additive: boolean;
  kind: number;
  /** seconds [min, max] */
  life: [number, number];
  /** world size at birth / death [min, max] */
  size0: [number, number];
  size1: [number, number];
  /** start colour (random mix toward c0b) and alpha */
  c0: number;
  c0b?: number;
  a0: number;
  /** end colour and alpha */
  c1: number;
  c1b?: number;
  a1: number;
  /** initial speed [min, max] along the (spread) direction */
  speed: [number, number];
  /** 0 = exactly along dir · 1 ≈ hemisphere · 2+ ≈ any direction */
  spread: number;
  /** radial acceleration toward the planet centre (negative = buoyant, rises) */
  grav: number;
  /** linear drag coefficient (1/s) */
  drag: number;
  /** wobble amplitude (units/s) */
  turb: number;
  /** spawn position jitter radius */
  jitter: number;
}

const P = (o: Partial<ParticlePreset> & Pick<ParticlePreset, 'kind' | 'life' | 'size0' | 'size1' | 'c0' | 'c1'>): ParticlePreset => ({
  additive: false,
  a0: 1,
  a1: 0,
  speed: [0, 0],
  spread: 0.3,
  grav: 0,
  drag: 0,
  turb: 0,
  jitter: 0,
  ...o,
});

/** Shared presets (sizes in world units; 1 tile ≈ 2 units). */
export const PRESETS = {
  fire: P({ additive: true, kind: PK.Flame, life: [0.5, 1.1], size0: [0.7, 1.3], size1: [0.2, 0.5], c0: 0xffc24a, c0b: 0xff6a1a, a0: 1, c1: 0xff3300, a1: 0, speed: [0.6, 1.6], spread: 0.35, grav: -1.4, drag: 1.2, turb: 0.4, jitter: 0.5 }),
  bigFire: P({ additive: true, kind: PK.Flame, life: [0.8, 1.6], size0: [2, 3.6], size1: [0.6, 1.4], c0: 0xffd36a, c0b: 0xff7a1a, a0: 1, c1: 0xd42400, a1: 0, speed: [1.5, 3.5], spread: 0.4, grav: -2.2, drag: 1, turb: 0.8, jitter: 1.4 }),
  ember: P({ additive: true, kind: PK.Glow, life: [1, 2.4], size0: [0.12, 0.22], size1: [0.04, 0.08], c0: 0xffb347, c0b: 0xff5a1f, a0: 1, c1: 0xff2a00, a1: 0, speed: [1.5, 4], spread: 0.7, grav: -0.6, drag: 0.6, turb: 1.4, jitter: 0.6 }),
  spark: P({ additive: true, kind: PK.Spark, life: [0.35, 0.8], size0: [0.5, 0.9], size1: [0.2, 0.4], c0: 0xfff2c0, c0b: 0xffb04a, a0: 1, c1: 0xff6a1a, a1: 0, speed: [5, 12], spread: 1.2, grav: 9, drag: 1.2, jitter: 0.2 }),
  blueSpark: P({ additive: true, kind: PK.Spark, life: [0.25, 0.6], size0: [0.5, 0.9], size1: [0.2, 0.3], c0: 0xe8f6ff, c0b: 0x8fd2ff, a0: 1, c1: 0x4a8cff, a1: 0, speed: [4, 10], spread: 1.4, grav: 6, drag: 1.6, jitter: 0.2 }),
  smoke: P({ kind: PK.Smoke, life: [2.4, 4.2], size0: [1.2, 2], size1: [4, 6.5], c0: 0x4a4440, c0b: 0x2c2826, a0: 0.75, c1: 0x6d6862, a1: 0, speed: [1, 2.4], spread: 0.3, grav: -0.9, drag: 0.7, turb: 0.5, jitter: 0.8 }),
  darkSmoke: P({ kind: PK.Smoke, life: [3, 5.5], size0: [2, 3.4], size1: [7, 11], c0: 0x1e1b1a, c0b: 0x2d2622, a0: 0.85, c1: 0x3b3633, a1: 0, speed: [1.5, 3.5], spread: 0.3, grav: -1.1, drag: 0.6, turb: 0.7, jitter: 1.4 }),
  steam: P({ kind: PK.Smoke, life: [1.6, 3], size0: [1, 1.6], size1: [3.5, 5.5], c0: 0xf4f8ff, c0b: 0xdfe8f2, a0: 0.55, c1: 0xffffff, a1: 0, speed: [1.5, 3], spread: 0.35, grav: -1.4, drag: 0.8, turb: 0.6, jitter: 0.7 }),
  dust: P({ kind: PK.Smoke, life: [1.6, 3.2], size0: [0.9, 1.6], size1: [3, 5], c0: 0xb59c7c, c0b: 0x8f7b62, a0: 0.7, c1: 0xc8b49a, a1: 0, speed: [1.2, 3.2], spread: 1.1, grav: 0.5, drag: 1.4, turb: 0.4, jitter: 0.8 }),
  bigDust: P({ kind: PK.Smoke, life: [2.5, 4.5], size0: [3, 5], size1: [9, 14], c0: 0xa89276, c0b: 0x7c6a56, a0: 0.75, c1: 0xb8a68e, a1: 0, speed: [3, 7], spread: 1.3, grav: 0.4, drag: 1.1, turb: 0.8, jitter: 2 }),
  ash: P({ kind: PK.Chunk, life: [3, 6], size0: [0.12, 0.22], size1: [0.1, 0.18], c0: 0x3a3634, c0b: 0x8a8580, a0: 0.9, c1: 0x5a5552, a1: 0, speed: [0.4, 1.2], spread: 2, grav: 0.6, drag: 0.9, turb: 1.2, jitter: 6 }),
  rain: P({ kind: PK.Rain, life: [0.7, 1.1], size0: [0.9, 1.3], size1: [0.9, 1.3], c0: 0xbcd4f0, c0b: 0x8fb0d8, a0: 0.55, c1: 0xbcd4f0, a1: 0.4, speed: [14, 18], spread: 0.08, grav: 4, drag: 0, jitter: 0 }),
  acidRain: P({ kind: PK.Rain, life: [0.7, 1.1], size0: [0.9, 1.3], size1: [0.9, 1.3], c0: 0xc8ff5a, c0b: 0x8bea3c, a0: 0.75, c1: 0xb6ff4a, a1: 0.5, speed: [13, 17], spread: 0.08, grav: 4, drag: 0, jitter: 0 }),
  snow: P({ kind: PK.Snow, life: [3, 5], size0: [0.22, 0.36], size1: [0.2, 0.32], c0: 0xffffff, c0b: 0xe2f0ff, a0: 0.95, c1: 0xffffff, a1: 0, speed: [1.4, 2.4], spread: 0.25, grav: 0.2, drag: 0.3, turb: 1.2, jitter: 0 }),
  frost: P({ additive: true, kind: PK.Twinkle, life: [0.8, 1.6], size0: [0.5, 0.9], size1: [0.1, 0.2], c0: 0xe8fbff, c0b: 0x9fe0ff, a0: 1, c1: 0x6cc8ff, a1: 0, speed: [0.3, 1.2], spread: 1.2, grav: -0.2, drag: 1, turb: 0.3, jitter: 0.8 }),
  splash: P({ kind: PK.Smoke, life: [0.9, 1.7], size0: [0.8, 1.4], size1: [2.4, 3.6], c0: 0xf2fbff, c0b: 0xcfe9f6, a0: 0.85, c1: 0xe8f6ff, a1: 0, speed: [4, 9], spread: 0.6, grav: 9, drag: 0.6, turb: 0.2, jitter: 0.6 }),
  spray: P({ kind: PK.Glow, life: [0.6, 1.2], size0: [0.25, 0.45], size1: [0.1, 0.2], c0: 0xf2fbff, c0b: 0xb8e2f8, a0: 0.9, c1: 0xd8f0ff, a1: 0, speed: [5, 11], spread: 0.7, grav: 12, drag: 0.4, jitter: 0.5 }),
  magic: P({ additive: true, kind: PK.Twinkle, life: [1, 2.2], size0: [0.5, 0.9], size1: [0.1, 0.2], c0: 0xfff1b0, c0b: 0xffd36b, a0: 1, c1: 0xffb347, a1: 0, speed: [0.5, 2], spread: 1.4, grav: -0.5, drag: 0.8, turb: 0.8, jitter: 1.2 }),
  holy: P({ additive: true, kind: PK.Glow, life: [1.2, 2.4], size0: [0.35, 0.6], size1: [0.05, 0.12], c0: 0xfff6d0, c0b: 0xffe08a, a0: 1, c1: 0xffc44a, a1: 0, speed: [1.5, 4], spread: 0.25, grav: -1.5, drag: 0.4, turb: 0.4, jitter: 1.4 }),
  gold: P({ additive: false, kind: PK.Coin, life: [1.6, 2.2], size0: [0.45, 0.6], size1: [0.45, 0.6], c0: 0xffd75e, c0b: 0xffb72e, a0: 1, c1: 0xffe27a, a1: 0.4, speed: [0.5, 1.5], spread: 0.3, grav: 6, drag: 0.2, jitter: 0 }),
  petal: P({ kind: PK.Chunk, life: [2.5, 4.5], size0: [0.18, 0.3], size1: [0.16, 0.26], c0: 0xff8fc8, c0b: 0xfff07a, a0: 1, c1: 0xffb8e0, a1: 0, speed: [0.8, 2.2], spread: 1.2, grav: 0.4, drag: 0.8, turb: 1.4, jitter: 1.5 }),
  leaf: P({ kind: PK.Chunk, life: [2, 3.5], size0: [0.16, 0.26], size1: [0.14, 0.22], c0: 0x5fb84a, c0b: 0x9ad65a, a0: 1, c1: 0x7ac24e, a1: 0, speed: [1, 3], spread: 1.2, grav: 1.2, drag: 0.8, turb: 1.4, jitter: 1 }),
  goo: P({ kind: PK.Chunk, life: [0.8, 1.6], size0: [0.16, 0.3], size1: [0.08, 0.14], c0: 0xb8c0c8, c0b: 0x6f7880, a0: 1, c1: 0x9aa4ae, a1: 0, speed: [1, 3], spread: 1.3, grav: 6, drag: 0.5, turb: 0.2, jitter: 0.6 }),
  gooGlint: P({ additive: true, kind: PK.Twinkle, life: [0.3, 0.7], size0: [0.3, 0.5], size1: [0.05, 0.1], c0: 0xe8f4ff, c0b: 0xa8c8ff, a0: 1, c1: 0x80a0ff, a1: 0, speed: [0.2, 1], spread: 1.5, grav: 0, drag: 1, jitter: 0.8 }),
  miasma: P({ kind: PK.Smoke, life: [3, 5], size0: [1.5, 2.5], size1: [4, 6], c0: 0x8fd84a, c0b: 0x5aa83a, a0: 0.42, c1: 0x7ac24e, a1: 0, speed: [0.3, 1], spread: 1.2, grav: -0.15, drag: 0.6, turb: 0.9, jitter: 1.5 }),
  toxicGlow: P({ additive: true, kind: PK.Glow, life: [1, 2], size0: [0.3, 0.5], size1: [0.1, 0.2], c0: 0xb6ff4a, c0b: 0x5aff7a, a0: 0.9, c1: 0x3aff6a, a1: 0, speed: [0.3, 1.2], spread: 1.4, grav: -0.4, drag: 0.8, turb: 0.8, jitter: 1 }),
  plasma: P({ additive: true, kind: PK.Glow, life: [0.4, 0.9], size0: [1.2, 2.2], size1: [0.3, 0.6], c0: 0xd8f4ff, c0b: 0x8fd8ff, a0: 1, c1: 0x5a7aff, a1: 0, speed: [1, 4], spread: 1.5, grav: 0, drag: 1.2, jitter: 0.3 }),
  flash: P({ additive: true, kind: PK.Glow, life: [0.25, 0.4], size0: [6, 9], size1: [12, 18], c0: 0xffffff, c0b: 0xfff2d0, a0: 1, c1: 0xffb347, a1: 0, speed: [0, 0], spread: 0, jitter: 0 }),
  ring: P({ additive: true, kind: PK.Ring, life: [0.5, 0.7], size0: [1, 1.2], size1: [10, 14], c0: 0xffffff, c0b: 0xfff2d0, a0: 0.9, c1: 0xffb347, a1: 0, speed: [0, 0], spread: 0, jitter: 0 }),
  laser: P({ additive: true, kind: PK.Glow, life: [0.18, 0.3], size0: [0.6, 0.9], size1: [0.2, 0.3], c0: 0xff5a8a, c0b: 0xff2a5a, a0: 1, c1: 0xff0040, a1: 0, speed: [0, 0.5], spread: 2, jitter: 0.05 }),
  void: P({ additive: true, kind: PK.Twinkle, life: [0.8, 1.6], size0: [0.6, 1.2], size1: [0.1, 0.3], c0: 0xd6b8ff, c0b: 0x7af0ff, a0: 1, c1: 0xff7ad9, a1: 0, speed: [0.5, 2], spread: 2, grav: -0.3, drag: 0.6, turb: 1, jitter: 1 }),
  star: P({ additive: true, kind: PK.Twinkle, life: [1.2, 2.6], size0: [0.6, 1.4], size1: [0.2, 0.4], c0: 0xffffff, c0b: 0xc8e6ff, a0: 1, c1: 0x9fd0ff, a1: 0, speed: [0.2, 1], spread: 2, drag: 0.5, turb: 0.4, jitter: 2 }),
  bubble: P({ additive: true, kind: PK.Ring, life: [1, 2], size0: [0.3, 0.6], size1: [0.5, 0.9], c0: 0xd8f6ff, c0b: 0xa8e0ff, a0: 0.8, c1: 0xffffff, a1: 0, speed: [1, 2.5], spread: 0.5, grav: -1.2, drag: 0.5, turb: 0.6, jitter: 1 }),
  spore: P({ additive: true, kind: PK.Glow, life: [2.5, 4.5], size0: [0.2, 0.35], size1: [0.1, 0.2], c0: 0xf0a8ff, c0b: 0x9ae6ff, a0: 0.9, c1: 0xd88aff, a1: 0, speed: [0.4, 1.2], spread: 1.6, grav: -0.3, drag: 0.5, turb: 1.6, jitter: 3 }),
  aurora: P({ additive: true, kind: PK.Glow, life: [2, 3.5], size0: [1.2, 2], size1: [2, 3.2], c0: 0x5affa8, c0b: 0x8a6aff, a0: 0.5, c1: 0xff6ad8, a1: 0, speed: [0.2, 0.6], spread: 1, grav: -0.2, drag: 0.4, turb: 0.6, jitter: 3 }),
} satisfies Record<string, ParticlePreset>;
export type PresetName = keyof typeof PRESETS;

const VERT = /* glsl */ `
uniform float uFxTime;
uniform float uScale;
uniform float uMaxSize;
uniform float uAspect;
attribute vec3 aVel;
attribute vec4 aTime;
attribute vec4 aCol0;
attribute vec4 aCol1;
attribute vec4 aPhys;
varying vec4 vCol;
varying float vKind;
varying vec2 vDir;
varying float vSeed;
varying float vAge;
varying vec3 vWPos;
void main() {
  float age = uFxTime - aTime.x;
  float life = max(aTime.y, 1e-3);
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); return; }
  float t = age / life;
  float k = aPhys.y;
  float dragT = k > 0.001 ? (1.0 - exp(-k * age)) / k : age;
  vec3 up = normalize(position + vec3(1e-5));
  float seed = fract(float(gl_VertexID) * 0.6180339887);
  vec3 p = position + aVel * dragT - up * (0.5 * aPhys.x * age * age);
  if (aPhys.z > 0.0) {
    float w = aPhys.z * min(age, 3.0);
    p += w * vec3(sin(age * 1.7 + seed * 43.0), sin(age * 1.3 + seed * 17.0), cos(age * 1.9 + seed * 29.0)) * 0.6;
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWPos = wp.xyz;
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float size = mix(aTime.z, aTime.w, t);
  float depth = max(0.05, -mv.z);
  gl_PointSize = clamp(size * uScale / depth, 0.0, uMaxSize);
  vCol = mix(aCol0, aCol1, t);
  vCol.a *= smoothstep(0.0, 0.04, age) * smoothstep(0.6, 3.0, depth);
  vKind = aPhys.w;
  vSeed = seed;
  vAge = age;
  // screen-space direction of motion (streaks)
  vec3 vel = aVel * exp(-k * age) - up * aPhys.x * age;
  vec4 c2 = projectionMatrix * viewMatrix * (modelMatrix * vec4(p + vel * 0.02, 1.0));
  vec2 d = c2.xy / c2.w - gl_Position.xy / gl_Position.w;
  d.x *= uAspect;
  vDir = length(d) > 1e-7 ? normalize(d) : vec2(0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform float uAdditive;
varying vec4 vCol;
varying float vKind;
varying vec2 vDir;
varying float vSeed;
varying float vAge;
varying vec3 vWPos;
${FX_NOISE}
${FX_NIGHT}
void main() {
  if (vCol.a <= 0.002) discard;
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c.y = -c.y;
  float r = length(c);
  int kind = int(vKind + 0.5);
  float a = 0.0;
  vec3 col = vCol.rgb;
  if (kind == 0) {
    a = exp(-r * r * 3.2) * (1.0 - smoothstep(0.85, 1.0, r));
  } else if (kind == 1 || kind == 4) {
    vec2 perp = vec2(-vDir.y, vDir.x);
    float al = dot(c, vDir), ac = dot(c, perp);
    float thin = kind == 4 ? 220.0 : 90.0;
    a = exp(-ac * ac * thin) * (1.0 - smoothstep(0.15, 1.0, abs(al)));
    if (kind == 1) col += vec3(0.6) * exp(-r * r * 18.0);
  } else if (kind == 2 || kind == 7) {
    vec2 q = fxRot(vSeed * 6.28 + vAge * (vSeed - 0.5) * 0.8) * c;
    float n = fxFbm2(q * 2.1 + vSeed * 19.0 + vAge * 0.35);
    a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.75);
    if (kind == 7) {
      float core = smoothstep(0.7, 0.0, r + (n - 0.5) * 0.4);
      col = mix(col, vec3(1.0, 0.95, 0.75), core * 0.7) * (1.0 + core * 1.6);
      a *= 0.9;
    } else {
      // soft shading: lit rim toward the top of the puff, darker underside
      col *= 0.82 + 0.3 * (c.y * 0.5 + 0.5) - (n - 0.5) * 0.25;
    }
  } else if (kind == 3) {
    vec2 q = fxRot(vSeed * 6.28 + vAge * 0.8) * c;
    float ang = atan(q.y, q.x);
    float arms = abs(cos(ang * 3.0));
    a = smoothstep(0.95, 0.1, r) * (0.35 + 0.65 * smoothstep(0.55, 1.0, arms + (1.0 - r) * 0.45));
  } else if (kind == 5) {
    vec2 q = fxRot(vSeed * 6.28 + vAge * (vSeed * 6.0 - 3.0)) * c;
    q.x *= 1.0 + vSeed;
    a = step(max(abs(q.x), abs(q.y)), 0.62);
    col *= 0.85 + 0.3 * step(0.0, q.y);
  } else if (kind == 6) {
    vec2 q = fxRot(vSeed * 3.14) * c;
    float cross = exp(-abs(q.x) * 14.0) + exp(-abs(q.y) * 14.0);
    a = (exp(-r * r * 9.0) + cross * 0.55 * (1.0 - r)) * (0.75 + 0.25 * sin(vAge * 18.0 + vSeed * 40.0));
  } else if (kind == 8) {
    a = exp(-pow((r - 0.8) * 9.0, 2.0)) + exp(-r * r * 6.0) * 0.15;
  } else {
    // coin: a spinning ellipse with a rim
    float sp = abs(cos(vAge * 7.0 + vSeed * 20.0));
    vec2 q = vec2(c.x / max(0.12, sp), c.y);
    float rr = length(q);
    a = 1.0 - smoothstep(0.78, 0.86, rr);
    col *= mix(1.25, 0.75, smoothstep(0.45, 0.8, rr)) * (0.8 + 0.4 * sp);
    col += vec3(0.5) * pow(max(0.0, 1.0 - length(q - vec2(-0.25, 0.3)) * 2.2), 3.0);
  }
  a *= vCol.a;
  if (a <= 0.003) discard;
  if (uAdditive < 0.5) col *= mix(1.0, 0.2, fxNight(vWPos));
  gl_FragColor = vec4(col * a, uAdditive > 0.5 ? 0.0 : a);
}
`;

const _c0 = new Color();
const _c1 = new Color();
const _v = new Vector3();
const _rnd = new Vector3();

/** Tiny fast RNG for spawn jitter (not deterministic across runs — FX only). */
let seed = 0x2f6b9e17;
function rand(): number {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}
const rr = (a: [number, number]) => a[0] + (a[1] - a[0]) * rand();

/** One ring-buffered point system (additive or alpha). */
export class ParticleBuffer {
  readonly points: Points;
  readonly material: ShaderMaterial;
  readonly capacity: number;
  private head = 0;
  private dirtyStart = -1;
  private dirtyCount = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private time: Float32Array;
  private col0: Uint8Array;
  private col1: Uint8Array;
  private phys: Float32Array;
  private attrs: BufferAttribute[];
  /** fx clock (seconds) — set by the owner before spawning */
  now = 0;

  constructor(parent: Object3D, capacity: number, additive: boolean, uniforms: Record<string, { value: unknown }>) {
    this.capacity = capacity;
    const g = new BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.time = new Float32Array(capacity * 4);
    this.col0 = new Uint8Array(capacity * 4);
    this.col1 = new Uint8Array(capacity * 4);
    this.phys = new Float32Array(capacity * 4);
    // everything starts dead: birth far in the future
    for (let i = 0; i < capacity; i++) this.time[i * 4] = -1e9;
    const mk = (arr: Float32Array | Uint8Array, size: number, norm = false) => {
      const a = new BufferAttribute(arr, size, norm);
      a.setUsage(35048); // DynamicDrawUsage
      return a;
    };
    const aPos = mk(this.pos, 3), aVel = mk(this.vel, 3), aTime = mk(this.time, 4), aC0 = mk(this.col0, 4, true), aC1 = mk(this.col1, 4, true), aPhys = mk(this.phys, 4);
    g.setAttribute('position', aPos);
    g.setAttribute('aVel', aVel);
    g.setAttribute('aTime', aTime);
    g.setAttribute('aCol0', aC0);
    g.setAttribute('aCol1', aC1);
    g.setAttribute('aPhys', aPhys);
    this.attrs = [aPos, aVel, aTime, aC0, aC1, aPhys];
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { ...uniforms, uSunDir: shared.uSunDir, uAdditive: { value: additive ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : CustomBlending,
      blendSrc: OneFactor,
      blendDst: additive ? OneFactor : OneMinusSrcAlphaFactor,
    });
    if (additive) {
      this.material.blending = CustomBlending;
      this.material.blendSrc = OneFactor;
      this.material.blendDst = OneFactor;
    }
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
    this.points.name = additive ? 'fx-particles-add' : 'fx-particles-alpha';
    parent.add(this.points);
  }

  /** Write one particle. Colours are sRGB hex. */
  write(px: number, py: number, pz: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c0: Color, a0: number, c1: Color, a1: number, grav: number, drag: number, turb: number, kind: number): void {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    if (this.dirtyStart < 0) this.dirtyStart = i;
    this.dirtyCount = Math.min(this.capacity, this.dirtyCount + 1);
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = px;
    this.pos[i3 + 1] = py;
    this.pos[i3 + 2] = pz;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.time[i4] = this.now;
    this.time[i4 + 1] = life;
    this.time[i4 + 2] = s0;
    this.time[i4 + 3] = s1;
    this.col0[i4] = c0.r * 255;
    this.col0[i4 + 1] = c0.g * 255;
    this.col0[i4 + 2] = c0.b * 255;
    this.col0[i4 + 3] = Math.max(0, Math.min(1, a0)) * 255;
    this.col1[i4] = c1.r * 255;
    this.col1[i4 + 1] = c1.g * 255;
    this.col1[i4 + 2] = c1.b * 255;
    this.col1[i4 + 3] = Math.max(0, Math.min(1, a1)) * 255;
    this.phys[i4] = grav;
    this.phys[i4 + 1] = drag;
    this.phys[i4 + 2] = turb;
    this.phys[i4 + 3] = kind;
  }

  /** Upload the ranges written since the last flush. */
  flush(): void {
    if (this.dirtyStart < 0) return;
    const start = this.dirtyStart, n = this.dirtyCount, cap = this.capacity;
    for (const a of this.attrs) {
      const s = a.itemSize;
      a.clearUpdateRanges();
      if (n >= cap) a.addUpdateRange(0, cap * s);
      else if (start + n <= cap) a.addUpdateRange(start * s, n * s);
      else {
        a.addUpdateRange(start * s, (cap - start) * s);
        a.addUpdateRange(0, (start + n - cap) * s);
      }
      a.needsUpdate = true;
    }
    this.dirtyStart = -1;
    this.dirtyCount = 0;
  }

  /** Kill everything (e.g. rewind). */
  clear(): void {
    for (let i = 0; i < this.capacity; i++) this.time[i * 4] = -1e9;
    const a = this.attrs[2];
    a.clearUpdateRanges();
    a.needsUpdate = true;
    this.dirtyStart = -1;
    this.dirtyCount = 0;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

/** The two particle systems + preset-based emission. */
export class GpuParticles {
  readonly add: ParticleBuffer;
  readonly alpha: ParticleBuffer;
  /** global multiplier on emission counts (quality tier) */
  density = 1;
  readonly uniforms = {
    uFxTime: { value: 0 },
    uScale: { value: 600 },
    uMaxSize: { value: 256 },
    uAspect: { value: 1 },
  };

  constructor(parent: Object3D, capacityAdd: number, capacityAlpha: number) {
    this.add = new ParticleBuffer(parent, capacityAdd, true, this.uniforms);
    this.alpha = new ParticleBuffer(parent, capacityAlpha, false, this.uniforms);
  }

  set now(t: number) {
    this.uniforms.uFxTime.value = t;
    this.add.now = t;
    this.alpha.now = t;
  }

  /**
   * Emit `count` particles of a preset at `pos`, flying along `dir` (unit; usually the surface normal) with the
   * preset's spread. Count is scaled by the quality density (fractional counts are dithered).
   */
  emit(pr: ParticlePreset, pos: Vector3, dir: Vector3, count: number, speedMul = 1, sizeMul = 1, lifeMul = 1): void {
    let n = count * this.density;
    const whole = Math.floor(n);
    n = whole + (rand() < n - whole ? 1 : 0);
    const buf = pr.additive ? this.add : this.alpha;
    for (let i = 0; i < n; i++) {
      // direction within the spread cone
      _rnd.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (_rnd.lengthSq() > 1) _rnd.multiplyScalar(0.7);
      _v.copy(dir).addScaledVector(_rnd, pr.spread);
      if (_v.lengthSq() < 1e-6) _v.copy(dir);
      _v.normalize().multiplyScalar(rr(pr.speed) * speedMul);
      const j = pr.jitter * sizeMul;
      this.writePreset(buf, pr, pos.x + (rand() * 2 - 1) * j, pos.y + (rand() * 2 - 1) * j, pos.z + (rand() * 2 - 1) * j, _v.x, _v.y, _v.z, sizeMul, lifeMul);
    }
  }

  /** Emit one particle with an explicit velocity (trails, vortices…). Not density-scaled. */
  emitAt(pr: ParticlePreset, px: number, py: number, pz: number, vx: number, vy: number, vz: number, sizeMul = 1, lifeMul = 1): void {
    this.writePreset(pr.additive ? this.add : this.alpha, pr, px, py, pz, vx, vy, vz, sizeMul, lifeMul);
  }

  /** Same as emitAt but colour-overridden (start/end) — e.g. UFO lasers in a saucer's hue. */
  emitTinted(pr: ParticlePreset, px: number, py: number, pz: number, vx: number, vy: number, vz: number, c0: number, c1: number, sizeMul = 1, lifeMul = 1): void {
    const buf = pr.additive ? this.add : this.alpha;
    _c0.setHex(c0);
    _c1.setHex(c1);
    buf.write(px, py, pz, vx, vy, vz, rr(pr.life) * lifeMul, rr(pr.size0) * sizeMul, rr(pr.size1) * sizeMul, _c0, pr.a0, _c1, pr.a1, pr.grav, pr.drag, pr.turb, pr.kind);
  }

  private writePreset(buf: ParticleBuffer, pr: ParticlePreset, px: number, py: number, pz: number, vx: number, vy: number, vz: number, sizeMul: number, lifeMul: number): void {
    _c0.setHex(pr.c0);
    if (pr.c0b !== undefined) _c1.setHex(pr.c0b), _c0.lerp(_c1, rand());
    const t0r = _c0.r, t0g = _c0.g, t0b = _c0.b;
    _c1.setHex(pr.c1);
    if (pr.c1b !== undefined) _c0.setHex(pr.c1b), _c1.lerp(_c0, rand());
    _c0.setRGB(t0r, t0g, t0b);
    buf.write(px, py, pz, vx, vy, vz, rr(pr.life) * lifeMul, rr(pr.size0) * sizeMul, rr(pr.size1) * sizeMul, _c0, pr.a0, _c1, pr.a1, pr.grav, pr.drag, pr.turb, pr.kind);
  }

  flush(): void {
    this.add.flush();
    this.alpha.flush();
  }

  clear(): void {
    this.add.clear();
    this.alpha.clear();
  }

  dispose(): void {
    this.add.dispose();
    this.alpha.dispose();
  }
}

/** Uniform random in [0,1) shared by FX code (not deterministic). */
export const fxRand = rand;
