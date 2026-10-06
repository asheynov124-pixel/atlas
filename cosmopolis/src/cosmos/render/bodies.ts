/**
 * OWNER: cosmos.
 * Celestial bodies for the system view, all procedural shaders (no textures):
 *   PlanetBody  — rocky worlds (fbm continents, oceans with sun glint, polar caps, lava cracks, drifting clouds,
 *                 night-side city lights on colonies, atmosphere rim + outer glow shell, rings with planet shadow)
 *                 and gas / ice giants (turbulent bands + a great storm). Locked worlds render desaturated.
 *   StarBody    — animated granulated photosphere, limb darkening, corona billboard with flickering rays, wide glare;
 *                 pulsar beams for neutron stars.
 *   BlackHole   — event horizon, swirling Doppler-brightened accretion disc and a lensed photon halo.
 * Shared uniforms (uTime, uStar) are passed in by the view so a whole system updates with two writes per frame.
 */
import { AdditiveBlending, BackSide, Color, ConeGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, ShaderMaterial, SphereGeometry, Vector3, type IUniform } from 'three';
import { PLANET_TYPES } from '../../content/planetTypes';
import { surfacePalette } from '../../render/planet/palette';
import { BILLBOARD_VERT, NOISE, OUTPUT } from './glsl';
import { STAR_INFO, type PlanetEntry } from '../Universe';
import type { PlanetSpec, StarKind } from '../../core/types';
import { hashString } from '../../core/rng';

export interface SharedUniforms {
  uTime: IUniform<number>;
  /** star position (world) */
  uStar: IUniform<Vector3>;
}

let sphereHi: SphereGeometry | null = null;
let sphereLo: SphereGeometry | null = null;
let plane: PlaneGeometry | null = null;
export function sphereGeo(hi: boolean): SphereGeometry {
  if (hi) return (sphereHi ??= new SphereGeometry(1, 72, 48));
  return (sphereLo ??= new SphereGeometry(1, 40, 26));
}
export function planeGeo(): PlaneGeometry {
  return (plane ??= new PlaneGeometry(1, 1));
}

// ───────────────────────────────────────────── planet surface

const PLANET_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vN;
varying vec3 vW;
void main() {
  vObj = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const PLANET_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uStar;
uniform vec3 uLand;
uniform vec3 uLow;
uniform vec3 uHigh;
uniform vec3 uShore;
uniform vec3 uSnow;
uniform vec3 uOcean;
uniform vec3 uAtmo;
uniform vec3 uSeed;
uniform vec3 uG0;
uniform vec3 uG1;
uniform vec3 uG2;
uniform float uSea;
uniform float uIce;
uniform float uCloud;
uniform float uLights;
uniform float uDim;
uniform float uMount;
uniform float uLava;
uniform float uGlow;
uniform float uAtmoK;
uniform float uSel;
uniform float uStorm;
varying vec3 vObj;
varying vec3 vN;
varying vec3 vW;
${NOISE}
void main() {
  vec3 n = normalize(vObj);
  vec3 N = normalize(vN);
  vec3 L = normalize(uStar - vW);
  vec3 V = normalize(cameraPosition - vW);
  float ndl = dot(N, L);
  vec3 col;
  vec3 emis = vec3(0.0);
  float spec = 0.0;
  float land = 0.0;
  float cloud = 0.0;
#ifdef GIANT
  // turbulent latitude bands + a great storm
  vec3 p = n + uSeed;
  float turb = fbm3(vec3(n.x * 2.0, n.y * 9.0, n.z * 2.0) + uSeed + vec3(uTime * 0.004, 0.0, 0.0));
  float b = n.y * 7.5 + turb * 1.1;
  float band = 0.5 + 0.5 * sin(b * 2.3);
  float band2 = 0.5 + 0.5 * sin(b * 5.1 + 1.7);
  col = mix(uG0, uG1, band);
  col = mix(col, uG2, band2 * band2 * 0.45);
  vec3 sc = normalize(vec3(0.75, -0.32, 0.58));
  vec3 dd = n - sc;
  float sd = length(vec3(dd.x, dd.y * 1.9, dd.z));
  float storm = smoothstep(0.24, 0.0, sd) * uStorm;
  float swirl = snoise(n * 14.0 + vec3(0.0, 0.0, uTime * 0.03));
  col = mix(col, uG1 * vec3(1.15, 0.72, 0.6), storm * (0.7 + 0.3 * swirl));
  spec = 0.0;
#else
  vec3 p = n * 1.55 + uSeed;
  float h = fbm4(p) + uMount * 0.32 * (ridge3(p * 2.3) - 0.45);
  float lat = abs(n.y);
  if (h < uSea) {
    float depth = clamp((uSea - h) * 2.6, 0.0, 1.0);
    col = mix(uOcean * 1.35 + vec3(0.03, 0.06, 0.06), uOcean * 0.5, depth);
    vec3 H = normalize(L + V);
    spec = pow(max(dot(N, H), 0.0), 60.0) * 0.9 + pow(max(dot(N, H), 0.0), 8.0) * 0.08;
  } else {
    land = 1.0;
    float t = clamp((h - uSea) / max(0.05, 0.9 - uSea), 0.0, 1.0);
    col = mix(uShore, uLow, smoothstep(0.0, 0.06, t));
    col = mix(col, uLand, smoothstep(0.08, 0.35, t));
    col = mix(col, uHigh, smoothstep(0.45, 0.8, t));
    col *= 0.88 + 0.24 * snoise(p * 6.0);
    // lava cracks in the lowlands
    float crack = smoothstep(0.82, 0.97, 1.0 - abs(snoise(p * 3.2 + vec3(0.0, uTime * 0.01, 0.0))));
    float lava = crack * uLava * (1.0 - smoothstep(0.1, 0.5, t));
    col = mix(col, vec3(0.25, 0.08, 0.02), lava);
    emis += vec3(1.0, 0.34, 0.06) * lava * 1.6;
  }
  float cap = smoothstep(1.0 - uIce - 0.05, 1.0 - uIce + 0.03, lat + 0.07 * snoise(p * 3.0));
  col = mix(col, uSnow, cap);
  cloud = smoothstep(0.12, 0.62, fbm3(p * 2.1 + vec3(uTime * 0.006, 0.0, uTime * 0.003)) * 0.5 + 0.5 - (1.0 - uCloud) * 0.55) * step(0.01, uCloud);
  col = mix(col, vec3(0.96, 0.97, 1.0), cloud * 0.85);
  spec *= 1.0 - cloud;
#endif
  float diff = clamp(ndl * 0.95 + 0.08, 0.0, 1.0);
  float term = smoothstep(-0.12, 0.35, ndl);
  vec3 lit = col * (diff * 1.15 * mix(0.55, 1.0, term) + 0.018) + spec * term;
#ifndef GIANT
  // night-side city lights (colonies)
  float night = smoothstep(0.06, -0.22, ndl);
  float c1 = smoothstep(0.42, 0.82, snoise(p * 7.0) * 0.5 + 0.5);
  float c2 = smoothstep(0.55, 0.95, snoise(p * 23.0) * 0.5 + 0.5);
  float cities = c1 * (0.35 + c2) * land * (1.0 - cloud * 0.7) * (1.0 - cap);
  lit += vec3(1.0, 0.68, 0.32) * cities * night * uLights * 1.7;
#endif
  lit += emis * (1.0 - cloud * 0.6);
  // atmosphere rim (day side + a thin twilight band)
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  lit += uAtmo * fres * smoothstep(-0.35, 0.45, ndl) * uAtmoK * 1.1;
  lit += uAtmo * fres * uSel * 0.45;
  float gray = dot(lit, vec3(0.299, 0.587, 0.114));
  lit = mix(lit, vec3(gray) * vec3(0.8, 0.86, 1.0) * 0.55, uDim * 0.78);
  gl_FragColor = vec4(lit, 1.0);
  ${OUTPUT}
}
`;

// outer atmosphere glow shell (back faces, additive)
const GLOW_VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vC;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vC = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const GLOW_FRAG = /* glsl */ `
uniform vec3 uStar;
uniform vec3 uColor;
uniform float uEdge;
uniform float uStrength;
varying vec3 vW;
varying vec3 vC;
void main() {
  vec3 N = normalize(vW - vC);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(uStar - vC);
  float k = clamp(-dot(N, V) / uEdge, 0.0, 1.0);
  float g = pow(k, 2.2);
  float lightSide = smoothstep(-0.55, 0.5, dot(N, L));
  gl_FragColor = vec4(uColor * g * lightSide * uStrength, 1.0);
  ${OUTPUT}
}
`;

// rings with radial bands and the planet's shadow
const RING_VERT = /* glsl */ `
varying vec3 vW;
varying vec2 vUv;
varying float vR;
uniform float uInner;
uniform float uOuter;
void main() {
  vUv = uv;
  vR = (length(position.xy) - uInner) / (uOuter - uInner);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const RING_FRAG = /* glsl */ `
uniform vec3 uStar;
uniform vec3 uColor;
uniform vec3 uCenter;
uniform float uRadius;
uniform float uOpacity;
uniform float uSeed;
uniform float uDim;
varying vec3 vW;
varying float vR;
float h1(float x) { return fract(sin(x * 127.1 + uSeed) * 43758.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  float r = clamp(vR, 0.0, 1.0);
  float bands = n1(r * 38.0) * 0.55 + n1(r * 110.0) * 0.3 + n1(r * 9.0) * 0.4;
  float gap = smoothstep(0.02, 0.06, abs(r - 0.62)) ;
  float edge = smoothstep(0.0, 0.06, r) * smoothstep(1.0, 0.9, r);
  float a = clamp(bands, 0.0, 1.0) * edge * gap * uOpacity;
  // planet shadow: does the ray towards the star hit the planet?
  vec3 L = normalize(uStar - vW);
  vec3 oc = vW - uCenter;
  float b = dot(oc, L);
  float c = dot(oc, oc) - uRadius * uRadius;
  float disc = b * b - c;
  float shadow = (disc > 0.0 && b < 0.0) ? 0.18 : 1.0;
  vec3 col = uColor * (0.55 + bands * 0.6) * shadow;
  float gray = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(gray) * 0.6, uDim * 0.75);
  gl_FragColor = vec4(col, a);
  ${OUTPUT}
}
`;

function vec(c: number, mul = 1): Color {
  return new Color(c).multiplyScalar(mul);
}

export interface PlanetBodyOptions {
  entry: PlanetEntry;
  spec: PlanetSpec;
  shared: SharedUniforms;
  colony: boolean;
  locked: boolean;
  hi: boolean;
}

export class PlanetBody {
  readonly group = new Group();
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private glow: Mesh | null = null;
  private ring: Mesh | null = null;
  private ringMat: ShaderMaterial | null = null;
  readonly radius: number;
  private spin: number;

  constructor(o: PlanetBodyOptions) {
    const { entry, spec } = o;
    this.radius = entry.size;
    const giant = entry.kind === 'giant' && entry.giant;
    const arch = PLANET_TYPES[spec.type] ?? PLANET_TYPES.terran;
    const pal = surfacePalette(spec);
    const toC = (c: { r: number; g: number; b: number }) => new Color(c.r, c.g, c.b);
    const seed = hashString(spec.id + ':' + spec.seed);
    const sx = ((seed & 1023) / 1023) * 40 - 20, sy = (((seed >> 10) & 1023) / 1023) * 40 - 20, sz = (((seed >> 20) & 1023) / 1023) * 40 - 20;
    // sea threshold: approximate the archetype's ocean coverage on the fbm distribution
    const cover = spec.hasOcean ? Math.max(0, Math.min(0.95, arch.oceanCoverage + spec.oceanLevel * 0.35)) : 0;
    const sea = spec.hasOcean ? -0.42 + cover * 0.84 : -9;
    const cold = spec.temperature < -20 ? 0.55 : spec.temperature < 0 ? 0.32 : spec.temperature < 25 ? 0.16 : spec.temperature < 60 ? 0.06 : 0;
    const atmoK = Math.min(1.2, spec.atmosphere.density * 0.9 + 0.1);
    this.material = new ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      defines: giant ? { GIANT: 1 } : {},
      uniforms: {
        uTime: o.shared.uTime,
        uStar: o.shared.uStar,
        uLand: { value: toC(pal.land) },
        uLow: { value: toC(pal.lowland) },
        uHigh: { value: toC(pal.highland) },
        uShore: { value: toC(pal.shore) },
        uSnow: { value: toC(pal.snow) },
        uOcean: { value: vec(spec.oceanColor, spec.type === 'volcanic' ? 2.2 : 1) },
        uAtmo: { value: vec(spec.atmosphere.color) },
        uSeed: { value: new Vector3(sx, sy, sz) },
        uG0: { value: vec(giant ? entry.giant!.colors[0] : 0) },
        uG1: { value: vec(giant ? entry.giant!.colors[1] : 0) },
        uG2: { value: vec(giant ? entry.giant!.colors[2] : 0) },
        uSea: { value: sea },
        uIce: { value: cold },
        uCloud: { value: giant ? 0 : spec.cloudCover },
        uLights: { value: o.colony ? 1 : 0 },
        uDim: { value: o.locked ? 1 : 0 },
        uMount: { value: spec.mountains },
        uLava: { value: spec.type === 'volcanic' ? 1 : 0 },
        uGlow: { value: 0 },
        uAtmoK: { value: giant ? 0.5 : spec.atmosphere.density < 0.1 ? 0.08 : atmoK },
        uSel: { value: 0 },
        uStorm: { value: giant && entry.giant!.storm ? 1 : 0.35 },
      },
    });
    this.mesh = new Mesh(sphereGeo(o.hi || entry.size > 1.5), this.material);
    this.mesh.scale.setScalar(entry.size);
    this.group.add(this.mesh);
    this.spin = 0.05 + ((seed >> 4) % 100) / 100 * 0.08;
    this.mesh.rotation.z = spec.axialTilt * 0.6;

    // outer glow shell
    const dens = giant ? 0.7 : spec.atmosphere.density;
    if (dens > 0.12) {
      const shell = 1.085 + Math.min(0.06, dens * 0.04);
      const edge = Math.sqrt(1 - 1 / (shell * shell));
      const gm = new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: { uStar: o.shared.uStar, uColor: { value: vec(giant ? entry.giant!.colors[2] : spec.atmosphere.color, o.locked ? 0.35 : 1) }, uEdge: { value: edge }, uStrength: { value: Math.min(1.4, 0.5 + dens * 0.55) } },
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      this.glow = new Mesh(sphereGeo(false), gm);
      this.glow.scale.setScalar(entry.size * shell);
      this.group.add(this.glow);
    }

    // rings
    const rs = spec.rings;
    if (rs) {
      const inner = rs.inner * entry.size, outer = rs.outer * entry.size;
      const rg = new RingGeometry(inner, outer, 128, 1);
      this.ringMat = new ShaderMaterial({
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        uniforms: {
          uStar: o.shared.uStar,
          uColor: { value: vec(rs.color) },
          uCenter: { value: new Vector3() },
          uRadius: { value: entry.size },
          uOpacity: { value: rs.opacity },
          uSeed: { value: (seed % 997) * 0.37 },
          uInner: { value: inner },
          uOuter: { value: outer },
          uDim: { value: o.locked ? 1 : 0 },
        },
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
      });
      this.ring = new Mesh(rg, this.ringMat);
      this.ring.rotation.x = -Math.PI / 2 + rs.tilt;
      this.ring.rotation.y = rs.tilt * 0.4;
      this.ring.renderOrder = 2;
      this.group.add(this.ring);
    }
  }

  setState(colony: boolean, locked: boolean): void {
    this.material.uniforms.uLights.value = colony ? 1 : 0;
    this.material.uniforms.uDim.value = locked ? 1 : 0;
    if (this.ringMat) this.ringMat.uniforms.uDim.value = locked ? 1 : 0;
  }

  setSelected(v: number): void {
    this.material.uniforms.uSel.value = v;
  }

  update(dt: number): void {
    this.mesh.rotation.y += dt * this.spin;
    if (this.ringMat) this.ringMat.uniforms.uCenter.value.copy(this.group.position);
  }

  dispose(): void {
    this.material.dispose();
    if (this.glow) (this.glow.material as ShaderMaterial).dispose();
    if (this.ring) {
      this.ring.geometry.dispose();
      this.ringMat?.dispose();
    }
    this.group.removeFromParent();
  }
}

// ───────────────────────────────────────────── stars

const STAR_SURF_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uSeed;
varying vec3 vObj;
varying vec3 vN;
varying vec3 vW;
${NOISE}
void main() {
  vec3 n = normalize(vObj);
  vec3 V = normalize(cameraPosition - vW);
  float mu = max(dot(normalize(vN), V), 0.0);
  float g = fbm3(n * 5.0 + vec3(uSeed, uTime * 0.05, -uTime * 0.03));
  float cells = 1.0 - abs(snoise(n * 16.0 + vec3(0.0, uTime * 0.12, uSeed)));
  float spots = smoothstep(0.55, 0.75, snoise(n * 2.2 + vec3(uSeed)) ) * 0.6;
  vec3 col = mix(uColor, uHot, clamp(g * 0.6 + 0.5 + cells * 0.25, 0.0, 1.0));
  col *= 1.0 - spots * 0.5;
  float limb = pow(mu, 0.45);
  col *= (0.55 + 0.75 * limb);
  gl_FragColor = vec4(col * 2.2, 1.0);
  ${OUTPUT}
}
`;

const CORONA_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uSeed;
uniform float uRays;
uniform float uIntensity;
uniform float uCore;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float a = atan(d.y, d.x);
  float glow = exp(-r * 5.0) * 1.35 + exp(-r * 13.0) * uCore + exp(-r * 2.2) * 0.12;
  float rays = pow(abs(snoise(vec3(cos(a) * 2.5, sin(a) * 2.5, uTime * 0.12 + uSeed))), 3.0);
  rays += pow(abs(snoise(vec3(cos(a) * 7.0, sin(a) * 7.0, uTime * 0.2 - uSeed))), 4.0) * 0.6;
  glow += rays * uRays * exp(-r * 3.4) * (1.0 - smoothstep(0.65, 1.0, r));
  glow *= 1.0 - smoothstep(0.82, 1.0, r);
  gl_FragColor = vec4(uColor * glow * uIntensity, 1.0);
  ${OUTPUT}
}
`;

const GLARE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  vec2 d = vUv - 0.5;
  float streak = exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 5.0);
  float halo = exp(-length(d) * 9.0) * 0.18;
  float ring = exp(-pow((length(d) - 0.22) * 40.0, 2.0)) * 0.05;
  gl_FragColor = vec4(uColor * (streak * 0.7 + halo + ring) * uIntensity, 1.0);
  ${OUTPUT}
}
`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
void main() {
  float along = vUv.y;
  float fade = pow(1.0 - along, 1.6);
  float flick = 0.75 + 0.25 * sin(uTime * 40.0 + along * 30.0);
  gl_FragColor = vec4(uColor * fade * flick * 0.8, 1.0);
  ${OUTPUT}
}
`;

function billboard(frag: string, uniforms: Record<string, IUniform>, scale: number, order = 5): Mesh {
  const m = new ShaderMaterial({
    vertexShader: BILLBOARD_VERT,
    fragmentShader: frag,
    uniforms: { ...uniforms, uScale: { value: scale } },
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new Mesh(planeGeo(), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  return mesh;
}

export class StarBody {
  readonly group = new Group();
  readonly radius: number;
  private surf: Mesh;
  private mats: ShaderMaterial[] = [];
  private beams: Group | null = null;
  private corona: Mesh;

  constructor(kind: StarKind, shared: SharedUniforms, seed: number, scale = 1) {
    const info = STAR_INFO[kind === 'binary' ? 'yellow' : kind];
    const color = new Color(info.color);
    const hot = new Color(info.color).lerp(new Color(0xffffff), 0.6);
    this.radius = info.radius * scale;
    const sm = new ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: STAR_SURF_FRAG,
      uniforms: { uTime: shared.uTime, uColor: { value: color.clone().multiplyScalar(0.9) }, uHot: { value: hot }, uSeed: { value: (seed % 1000) * 0.13 } },
    });
    this.mats.push(sm);
    this.surf = new Mesh(sphereGeo(true), sm);
    this.surf.scale.setScalar(this.radius);
    this.group.add(this.surf);
    const glow = new Color(info.glow);
    const neutron = kind === 'neutron';
    this.corona = billboard(CORONA_FRAG, { uTime: shared.uTime, uColor: { value: glow }, uSeed: { value: (seed % 777) * 0.21 }, uRays: { value: neutron ? 0.6 : 1.0 }, uIntensity: { value: neutron ? 1.6 : 1.0 }, uCore: { value: neutron ? 3.0 : 1.4 } }, this.radius * (neutron ? 14 : 7.5));
    this.mats.push(this.corona.material as ShaderMaterial);
    this.group.add(this.corona);
    const glare = billboard(GLARE_FRAG, { uColor: { value: glow.clone().lerp(new Color(0xffffff), 0.3) }, uIntensity: { value: neutron ? 1.4 : 0.9 } }, this.radius * 26, 6);
    this.mats.push(glare.material as ShaderMaterial);
    this.group.add(glare);
    if (neutron) {
      // twin pulsar beams along a tilted, precessing axis
      this.beams = new Group();
      const bm = new ShaderMaterial({ vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`, fragmentShader: BEAM_FRAG, uniforms: { uColor: { value: new Color(0x9fd4ff) }, uTime: shared.uTime }, blending: AdditiveBlending, transparent: true, depthWrite: false, side: DoubleSide });
      this.mats.push(bm);
      for (const s of [1, -1]) {
        const cg = new ConeGeometry(this.radius * 2.6, this.radius * 34, 24, 1, true);
        cg.translate(0, -this.radius * 17, 0);
        const cone = new Mesh(cg, bm);
        cone.rotation.z = s > 0 ? Math.PI : 0;
        cone.renderOrder = 4;
        this.beams.add(cone);
      }
      this.beams.rotation.z = 0.5;
      this.group.add(this.beams);
    }
  }

  update(dt: number): void {
    this.surf.rotation.y += dt * 0.03;
    if (this.beams) this.beams.rotation.y += dt * 2.4;
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    if (this.beams) this.beams.children.forEach((c) => (c as Mesh).geometry.dispose());
    this.group.removeFromParent();
  }
}

// ───────────────────────────────────────────── black hole

const DISC_VERT = /* glsl */ `
varying vec3 vW;
varying vec2 vP;
void main() {
  vP = position.xy;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const DISC_FRAG = /* glsl */ `
uniform float uTime;
uniform float uInner;
uniform float uOuter;
varying vec3 vW;
varying vec2 vP;
${NOISE}
void main() {
  float r = length(vP);
  float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
  float a = atan(vP.y, vP.x);
  float swirl = a + uTime * 0.6 / (0.35 + t * 1.6) + log(r) * 3.0;
  float n = fbm3(vec3(cos(swirl) * 2.0, sin(swirl) * 2.0, t * 5.0 + uTime * 0.05)) * 0.5 + 0.5;
  float streak = 0.5 + 0.5 * sin(swirl * 9.0 + n * 6.0);
  vec3 hot = vec3(1.0, 0.95, 0.85);
  vec3 warm = vec3(1.0, 0.62, 0.25);
  vec3 cool = vec3(0.75, 0.18, 0.06);
  vec3 col = mix(hot, warm, smoothstep(0.0, 0.35, t));
  col = mix(col, cool, smoothstep(0.35, 1.0, t));
  // relativistic beaming: the side moving toward the viewer is brighter
  vec3 tangent = normalize(vec3(-sin(a), 0.0, cos(a)));
  vec3 V = normalize(cameraPosition - vW);
  float doppler = 1.0 + 0.75 * dot(tangent, V);
  float inten = (n * 0.7 + streak * 0.35) * pow(1.0 - t, 1.4) * smoothstep(0.0, 0.05, t) * doppler * 2.4;
  gl_FragColor = vec4(col * inten, 1.0);
  ${OUTPUT}
}
`;
const HALO_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float r = length(d);
  float photon = exp(-pow((r - 0.205) * 70.0, 2.0)) * 2.2;
  // lensed far side of the disc arching over and under the shadow
  float arc = exp(-pow((r - 0.27) * 16.0, 2.0)) * (0.35 + 0.65 * smoothstep(0.1, 0.9, abs(d.y) / max(r, 0.001)));
  float glow = exp(-r * 4.0) * 0.25;
  float shadow = smoothstep(0.17, 0.2, r);
  vec3 col = vec3(1.0, 0.72, 0.38) * (arc * 1.4 + glow) + vec3(1.0, 0.9, 0.75) * photon;
  gl_FragColor = vec4(col * shadow, 1.0);
  ${OUTPUT}
}
`;

export class BlackHole {
  readonly group = new Group();
  readonly radius: number;
  private disc: Mesh;
  private mats: ShaderMaterial[] = [];
  private horizon: Mesh;

  constructor(shared: SharedUniforms) {
    this.radius = STAR_INFO.blackhole.radius;
    const r = this.radius;
    const hm = new MeshBasicMaterial({ color: 0x000000 });
    this.horizon = new Mesh(sphereGeo(true), hm);
    this.horizon.scale.setScalar(r);
    this.horizon.renderOrder = 1;
    this.group.add(this.horizon);
    const inner = r * 1.5, outer = r * 5.6;
    const dm = new ShaderMaterial({ vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, uniforms: { uTime: shared.uTime, uInner: { value: inner }, uOuter: { value: outer } }, blending: AdditiveBlending, transparent: true, depthWrite: false, side: DoubleSide });
    this.mats.push(dm);
    this.disc = new Mesh(new RingGeometry(inner, outer, 160, 8), dm);
    this.disc.rotation.x = -Math.PI / 2 + 0.12;
    this.disc.renderOrder = 3;
    this.group.add(this.disc);
    const halo = billboard(HALO_FRAG, { uTime: shared.uTime }, r * 10, 2);
    this.mats.push(halo.material as ShaderMaterial);
    this.group.add(halo);
  }

  update(_dt: number): void {
    /* animated entirely in shaders */
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    (this.horizon.material as MeshBasicMaterial).dispose();
    this.disc.geometry.dispose();
    this.group.removeFromParent();
  }
}

/** Light colour a star casts on its planets. */
export function starLight(kind: StarKind): Color {
  return new Color(STAR_INFO[kind === 'binary' ? 'yellow' : kind].glow).lerp(new Color(0xffffff), 0.55);
}
