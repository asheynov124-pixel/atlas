/**
 * OWNER: god.
 * Shell — planet-conforming effects drawn on a "polar grid" around an epicentre: the vertex shader maps a unit
 * grid (u = angular distance from the epicentre, v = azimuth) onto the sphere between angles uA0..uA1, so the
 * resolution always sits where the effect is (a thin moving band for shockwaves and tsunamis, a cap for storms).
 *
 * Modes
 *   RING    additive shockwave band (bright leading edge, heat-haze wake)
 *   WAVE    the tsunami: a displaced wall of water (steep foaming front, long trough), lit by the sun
 *   SPIRAL  a planet-scale cyclone: spiral cloud bands around a clear eye, rotating, lit + night side dark
 *   GLOW    additive cap glow with shimmer (irradiation, blessings, scorched hemispheres)
 *   FIRE    additive flame field over a cap (firestorms, lava seas)
 *   FRONT   alpha band with a bright edge (freeze fronts, terraform / goo waves)
 *   VEIL    alpha cap of soft cloud (dust winter, ash, spore clouds) lit by the sun
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, CustomBlending, Mesh, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector3, type Object3D } from 'three';
import { shared } from '../materials';
import { FX_NOISE } from './glsl';

export const ShellMode = { Ring: 0, Wave: 1, Spiral: 2, Glow: 3, Fire: 4, Front: 5, Veil: 6 } as const;
export type ShellModeId = (typeof ShellMode)[keyof typeof ShellMode];

const geoCache = new Map<string, BufferGeometry>();
/** Unit polar grid: uv.x radial 0..1, uv.y around 0..1 (closed seam). */
function polarGrid(radial: number, around: number): BufferGeometry {
  const key = radial + 'x' + around;
  let g = geoCache.get(key);
  if (g) return g;
  const n = (radial + 1) * (around + 1);
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let k = 0;
  for (let i = 0; i <= radial; i++)
    for (let j = 0; j <= around; j++, k++) {
      uv[k * 2] = i / radial;
      uv[k * 2 + 1] = j / around;
      pos[k * 3] = i / radial;
      pos[k * 3 + 1] = 0;
      pos[k * 3 + 2] = j / around;
    }
  const idx: number[] = [];
  for (let i = 0; i < radial; i++)
    for (let j = 0; j < around; j++) {
      const a = i * (around + 1) + j, b = a + around + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(idx);
  geoCache.set(key, g);
  return g;
}

const VERT = /* glsl */ `
uniform vec3 uCenter;
uniform vec3 uE1;
uniform vec3 uE2;
uniform float uA0;
uniform float uA1;
uniform float uR;
uniform float uMode;
uniform float uAngle;
uniform float uWidth;
uniform float uHeight;
uniform float uTime;
varying vec3 vN;
varying vec3 vW;
varying float vAng;
varying float vAz;
varying float vH;
${FX_NOISE}
float waveProfile(float x) {
  // x > 0 behind the front (toward the epicentre), x < 0 ahead of it
  return x < 0.0 ? exp(-x * x * 9.0) : exp(-x * 0.9) * (0.92 + 0.08 * cos(x * 5.0)) - exp(-x * 4.0) * 0.0;
}
void main() {
  float ang = mix(uA0, uA1, uv.x);
  float az = uv.y * 6.2831853;
  vec3 side = cos(az) * uE1 + sin(az) * uE2;
  vec3 dir = cos(ang) * uCenter + sin(ang) * side;
  float h = 0.0;
  vec3 n = dir;
  if (uMode > 0.5 && uMode < 1.5) {
    float wob = 0.75 + 0.25 * fxNoise2(vec2(az * 9.0, uTime * 0.4)) + 0.12 * sin(az * 31.0 + uTime);
    float x = (uAngle - ang) / max(uWidth, 1e-4);
    float e = 0.02;
    float h0 = waveProfile(x);
    float h1 = waveProfile(x + e);
    h = uHeight * wob * h0;
    // slope along the arc (toward the epicentre is +x)
    float dhds = uHeight * wob * (h1 - h0) / e / max(uWidth * uR, 1e-3);
    vec3 toward = normalize(uCenter - dir * dot(uCenter, dir) + vec3(1e-6));
    n = normalize(dir - toward * dhds);
  }
  vH = h;
  vAng = ang;
  vAz = az;
  vec3 p = dir * (uR + h);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uIntensity;
uniform float uMode;
uniform float uAngle;
uniform float uWidth;
uniform float uHeight;
uniform float uTime;
uniform float uSpin;
uniform float uA1;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
varying vec3 vN;
varying vec3 vW;
varying float vAng;
varying float vAz;
varying float vH;
${FX_NOISE}
void main() {
  int mode = int(uMode + 0.5);
  vec3 col = uColor;
  float a = 0.0;
  vec3 V = normalize(uCameraPos - vW);
  float sun = dot(normalize(vW), uSunDir);
  float day = smoothstep(-0.25, 0.2, sun);
  if (mode == 0) {
    float d = (vAng - uAngle) / max(uWidth, 1e-4);
    float lead = exp(-d * d * 3.0);
    float wake = d < 0.0 ? exp(d * 0.9) * 0.28 : 0.0;
    float n = fxNoise2(vec2(vAz * 24.0, vAng * 60.0 - uTime * 3.0));
    a = (lead * (0.75 + 0.5 * n) + wake * n);
    col = mix(uColor2, uColor, lead);
    gl_FragColor = vec4(col * a * uIntensity, 0.0);
    return;
  } else if (mode == 1) {
    float x = (uAngle - vAng) / max(uWidth, 1e-4);
    float crest = smoothstep(0.08, 0.6, vH / max(uHeight, 1e-3));
    vec3 N = normalize(vN);
    float diff = max(0.0, dot(N, uSunDir)) * 0.8 + 0.25;
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(0.0, dot(N, H)), 80.0) * 1.6 * day;
    float fres = pow(1.0 - max(0.0, dot(N, V)), 3.0);
    vec3 deep = uColor2;
    vec3 body = mix(deep, uColor, smoothstep(0.0, 1.0, vH / max(uHeight, 1e-3)));
    float foamN = fxFbm2(vec2(vAz * 70.0, vAng * 260.0 - uTime * 2.2));
    float foam = smoothstep(0.55, 0.95, crest + foamN * 0.5) * smoothstep(1.5, -0.3, x);
    foam = max(foam, smoothstep(0.25, 0.0, abs(x + 0.15)) * smoothstep(0.35, 0.7, foamN) * crest);
    col = body * diff * mix(0.35, 1.0, day) + vec3(spec) + fres * vec3(0.25, 0.4, 0.5) * day;
    col = mix(col, vec3(0.92, 0.97, 1.0) * mix(0.25, 1.0, day), foam);
    a = smoothstep(0.02, 0.25, crest) * uIntensity;
    a = max(a, foam * uIntensity);
  } else if (mode == 2) {
    // spiral storm in local polar coords (rho = angular distance, az)
    float rho = vAng / max(uA1, 1e-4);
    float arms = 3.0;
    float sp = vAz * arms + log(max(rho, 0.02)) * 4.2 - uTime * uSpin;
    vec2 q = vec2(cos(sp), sin(sp)) * (0.6 + rho * 2.0) + vec2(vAz * 0.0, rho * 6.0);
    float n = fxFbm2(q * 2.4 + vec2(uTime * 0.05, 0.0));
    float bands = 0.5 + 0.5 * sin(sp * 1.0);
    float cloud = smoothstep(0.35, 0.8, n * 0.7 + bands * 0.55);
    float eye = smoothstep(0.035, 0.11, rho);
    float edge = 1.0 - smoothstep(0.6, 1.0, rho);
    a = cloud * eye * edge * uIntensity;
    float wall = exp(-pow((rho - 0.11) * 14.0, 2.0));
    a = max(a, wall * eye * 0.9 * uIntensity);
    float lit = max(0.0, dot(normalize(vN), uSunDir));
    col = mix(uColor2, uColor, cloud) * (0.18 + 0.95 * lit) + vec3(0.05);
    col *= mix(0.15, 1.0, day);
  } else if (mode == 3) {
    float rho = vAng / max(uAngle, 1e-4);
    float edge = 1.0 - smoothstep(0.7, 1.0, rho);
    float n = fxFbm2(vec2(vAz * 8.0 + uTime * 0.2, vAng * 40.0 - uTime * 0.6));
    a = edge * (0.55 + 0.45 * n) * uIntensity;
    col = mix(uColor2, uColor, n);
    gl_FragColor = vec4(col * a, 0.0);
    return;
  } else if (mode == 4) {
    float rho = vAng / max(uAngle, 1e-4);
    float edge = 1.0 - smoothstep(0.75, 1.0, rho);
    vec2 q = vec2(vAz * 30.0, vAng * 160.0);
    float n = fxFbm2(q + vec2(0.0, -uTime * 1.8));
    float f = smoothstep(0.42, 0.85, n);
    a = edge * f * uIntensity;
    col = mix(uColor2, uColor, f) * (1.0 + f);
    gl_FragColor = vec4(col * a, 0.0);
    return;
  } else if (mode == 5) {
    float d = (vAng - uAngle) / max(uWidth, 1e-4);
    float n = fxNoise2(vec2(vAz * 40.0, vAng * 90.0 - uTime));
    float inside = 1.0 - smoothstep(-0.3, 0.6, d + (n - 0.5) * 0.8);
    float edge = exp(-d * d * 4.0);
    a = (inside * 0.35 + edge * 0.9) * uIntensity;
    col = mix(uColor2, uColor, edge) * mix(0.35, 1.0, day) + uColor * edge * 0.6;
  } else {
    float rho = vAng / max(uAngle, 1e-4);
    float edge = 1.0 - smoothstep(0.55, 1.0, rho);
    float n = fxFbm2(vec2(vAz * 6.0, vAng * 22.0) + vec2(uTime * 0.04, -uTime * 0.02));
    a = edge * smoothstep(0.25, 0.75, n) * uIntensity;
    float lit = max(0.0, dot(normalize(vN), uSunDir));
    col = mix(uColor2, uColor, n) * (0.2 + 0.9 * lit) * mix(0.25, 1.0, day);
  }
  if (a <= 0.003) discard;
  gl_FragColor = vec4(col * a, a);
}
`;

const _tmp = new Vector3();

export class Shell {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  readonly u: {
    uCenter: { value: Vector3 };
    uE1: { value: Vector3 };
    uE2: { value: Vector3 };
    uA0: { value: number };
    uA1: { value: number };
    uR: { value: number };
    uMode: { value: number };
    uAngle: { value: number };
    uWidth: { value: number };
    uHeight: { value: number };
    uTime: { value: number };
    uSpin: { value: number };
    uColor: { value: Color };
    uColor2: { value: Color };
    uIntensity: { value: number };
  };

  constructor(parent: Object3D, mode: ShellModeId, radial = 48, around = 192) {
    const additive = mode === ShellMode.Ring || mode === ShellMode.Glow || mode === ShellMode.Fire;
    this.u = {
      uCenter: { value: new Vector3(0, 1, 0) },
      uE1: { value: new Vector3(1, 0, 0) },
      uE2: { value: new Vector3(0, 0, 1) },
      uA0: { value: 0 },
      uA1: { value: 0.3 },
      uR: { value: 1 },
      uMode: { value: mode },
      uAngle: { value: 0.1 },
      uWidth: { value: 0.03 },
      uHeight: { value: 0 },
      uTime: { value: 0 },
      uSpin: { value: 1 },
      uColor: { value: new Color(0xffffff) },
      uColor2: { value: new Color(0xffffff) },
      uIntensity: { value: 1 },
    };
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { ...this.u, uSunDir: shared.uSunDir, uCameraPos: shared.uCameraPos },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : CustomBlending,
    });
    this.material.blending = CustomBlending;
    this.material.blendSrc = OneFactor;
    this.material.blendDst = additive ? OneFactor : OneMinusSrcAlphaFactor;
    this.mesh = new Mesh(polarGrid(radial, around), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = mode === ShellMode.Wave ? 6 : 10;
    this.mesh.name = 'fx-shell';
    parent.add(this.mesh);
  }

  /** Centre the polar grid on a unit direction. */
  setCenter(dir: Vector3): this {
    const c = this.u.uCenter.value.copy(dir).normalize();
    _tmp.set(0, 1, 0);
    if (Math.abs(c.y) > 0.9) _tmp.set(1, 0, 0);
    this.u.uE1.value.crossVectors(c, _tmp).normalize();
    this.u.uE2.value.crossVectors(c, this.u.uE1.value).normalize();
    return this;
  }

  /** Angular range drawn (radians from the centre). */
  range(a0: number, a1: number): this {
    this.u.uA0.value = Math.max(0, Math.min(Math.PI, a0));
    this.u.uA1.value = Math.max(this.u.uA0.value + 1e-4, Math.min(Math.PI, a1));
    return this;
  }

  colors(c1: number, c2 = c1): this {
    this.u.uColor.value.setHex(c1);
    this.u.uColor2.value.setHex(c2);
    return this;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.material.dispose();
  }
}
