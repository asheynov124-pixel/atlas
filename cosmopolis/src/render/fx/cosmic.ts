/**
 * OWNER: god.
 * Cosmic-scale FX objects for the apocalypse & cosmic powers:
 *
 *   BlackHole   event horizon + gravitational lens + accretion disk + photon ring + polar jets. The lens is a
 *               sphere whose shader bends each view ray around the hole and re-samples the baked deep-sky cube
 *               (borrowed from the sky dome) plus a procedural star layer and an analytic impostor of the planet,
 *               so the background visibly warps into an Einstein ring — no extra render pass needed.
 *   NovaShell   supernova blast front: a vast turbulent plasma sphere expanding from the star.
 *   PlanetSplit the planet cracked in two: the terrain (merged geometry) split by a plane into two drifting halves
 *               with molten cut faces (crust → mantle → white-hot core cross-section) around a glowing core.
 *   Bubble      vacuum decay: an expanding bubble of "new physics" — iridescent thin-film wall, lattice interior.
 *   Portal      a wormhole mouth: swirling accretion vortex with another universe (twisted sky) at its throat.
 *   MoltenOrb   a glowing lava sphere (planet cores, molten moons).
 */
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CubeTexture,
  CustomBlending,
  DoubleSide,
  Group,
  Matrix3,
  Mesh,
  MeshBasicMaterial,
  Points,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { shared } from '../materials';
import { FX_NOISE, FX_TEXNOISE, fxNoiseUniform } from './glsl';
import type { FxObject } from './FxLayer';

const _v = new Vector3();
const _w = new Vector3();

/** The baked deep-sky cube of the planet view (sky dome), if one exists. */
export function findSkyCube(skyGroup: Object3D | null | undefined): { tex: Texture | null; intensity: { value: number } | null } {
  let tex: Texture | null = null;
  let intensity: { value: number } | null = null;
  skyGroup?.traverse((o) => {
    if (tex) return;
    const mat = (o as Mesh).material as ShaderMaterial | undefined;
    const u = mat?.uniforms;
    if (u?.uSky?.value && (u.uSky.value as Texture).isTexture) {
      tex = u.uSky.value as Texture;
      intensity = (u.uIntensity as { value: number }) ?? null;
    }
  });
  return { tex, intensity };
}

const additive = { transparent: true, depthWrite: false, blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor } as const;
const premul = { transparent: true, depthWrite: false, blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor } as const;

// ───────────────────────────────────────────────────────────── black hole

const LENS_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const LENS_FRAG = /* glsl */ `
uniform vec3 uC;
uniform float uRs;
uniform float uL;
uniform float uStrength;
uniform samplerCube uSky;
uniform float uHasSky;
uniform float uSkyGain;
uniform mat3 uSkyRot;
uniform float uPlanetR;
uniform vec3 uSunDir;
uniform vec3 uAtmo;
uniform vec3 uLand;
uniform vec3 uCameraPos;
uniform float uTime;
varying vec3 vW;
${FX_NOISE}
${FX_TEXNOISE}
vec3 starLayer(vec3 d) {
  vec3 p = d * 140.0;
  vec3 i = floor(p);
  float h = fxHash31(i);
  vec3 f = fract(p) - 0.5 - (vec3(fxHash31(i + 1.3), fxHash31(i + 7.1), fxHash31(i + 3.7)) - 0.5) * 0.6;
  float s = smoothstep(0.09, 0.0, length(f)) * step(0.86, h);
  return mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), fract(h * 7.0)) * s * (0.8 + 3.5 * fract(h * 17.0));
}
vec3 background(vec3 d) {
  vec3 c = starLayer(d);
  if (uHasSky > 0.5) {
    vec3 s = textureCube(uSky, uSkyRot * d).rgb;
    c += pow(s, vec3(2.2)) * 0.6 * uSkyGain;
  } else {
    float n = fxTFbm3(d * 3.0);
    c += vec3(0.25, 0.12, 0.4) * pow(n, 3.0) * 0.6;
  }
  return c;
}
float hitsPlanet(vec3 o, vec3 d) {
  float B = dot(o, d);
  float C = dot(o, o) - uPlanetR * uPlanetR * 1.03;
  float disc = B * B - C;
  return disc > 0.0 && -B - sqrt(disc) > 0.0 ? 1.0 : 0.0;
}
void main() {
  vec3 ro = uCameraPos;
  vec3 rd = normalize(vW - uCameraPos);
  vec3 oc = uC - ro;
  float tca = dot(oc, rd);
  vec3 cp = ro + rd * tca;
  vec3 toC = uC - cp;
  float b = length(toC);
  if (tca < 0.0 || b > uL) discard;
  vec3 ax = toC / max(b, 1e-4);
  // deflection grows as 1/b; capped so rays near the horizon wrap around (Einstein ring)
  float alpha = uStrength * 2.2 * uRs / max(b, 1e-3);
  vec3 d2 = normalize(rd + ax * tan(min(alpha, 1.45)));
  // only the sky is re-drawn bent: where the real planet is visible (or the bent ray ends on it) we stay clear
  float onPlanet = max(hitsPlanet(ro, rd), hitsPlanet(cp, d2));
  vec3 sky = background(d2);
  float horizon = smoothstep(uRs * 1.03, uRs * 0.97, b);
  float ring = exp(-pow((b - uRs * 1.55) / (uRs * 0.09), 2.0));
  float glow = exp(-pow((b - uRs * 1.55) / (uRs * 0.6), 2.0)) * 0.35;
  vec3 ringCol = (ring * 2.2 + glow) * vec3(1.0, 0.82, 0.55) * uStrength;
  float edge = 1.0 - smoothstep(uL * 0.35, uL, b);
  float bg = edge * uStrength * (1.0 - onPlanet) * (1.0 - horizon);
  float a = clamp(max(bg, horizon * uStrength), 0.0, 1.0);
  gl_FragColor = vec4(sky * bg + ringCol * (1.0 - horizon), a);
}
`;

const DISK_VERT = /* glsl */ `
varying vec2 vP;
varying vec3 vW;
void main() {
  vP = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const DISK_FRAG = /* glsl */ `
uniform float uTime;
uniform float uInner;
uniform float uOuter;
uniform float uIntensity;
uniform vec3 uCameraPos;
uniform vec3 uAxisX;
uniform vec3 uAxisY;
uniform vec3 uC;
varying vec2 vP;
varying vec3 vW;
${FX_NOISE}
${FX_TEXNOISE}
void main() {
  float r = length(vP);
  float x = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
  float ang = atan(vP.y, vP.x);
  // keplerian shear: inner orbits faster
  float w = uTime * (2.4 / (0.25 + x * 1.6));
  float bands = fxTFbm2(vec2(ang * 3.0 + w, x * 14.0)) ;
  float streaks = fxNoise2(vec2(ang * 18.0 + w * 2.0, x * 60.0));
  float dens = smoothstep(0.0, 0.06, x) * (1.0 - smoothstep(0.55, 1.0, x)) * (0.45 + 0.8 * bands + 0.25 * streaks);
  // relativistic beaming: the side moving toward the camera is brighter & bluer
  vec3 tangent = normalize(-sin(ang) * uAxisX + cos(ang) * uAxisY);
  vec3 toCam = normalize(uCameraPos - vW);
  float dop = dot(tangent, toCam);
  float beam = pow(1.0 + 0.85 * dop, 2.2);
  vec3 hot = vec3(1.0, 0.9, 0.72);
  vec3 warm = vec3(1.0, 0.5, 0.16);
  vec3 cool = vec3(0.7, 0.2, 0.06);
  vec3 col = mix(hot, warm, smoothstep(0.0, 0.35, x));
  col = mix(col, cool, smoothstep(0.35, 0.9, x));
  col = mix(col, col * vec3(0.75, 0.9, 1.25), max(0.0, dop) * 0.6);
  float a = dens * beam * uIntensity;
  // crisp inner edge (ISCO) glow
  float isco = exp(-pow(x / 0.05, 2.0)) * 0.8;
  gl_FragColor = vec4(col * (a * 1.15 + isco * uIntensity), 0.0);
}
`;

const SPIRAL_VERT = /* glsl */ `
attribute float aHeat;
uniform float uScale;
uniform float uStrength;
varying float vHeat;
void main() {
  vHeat = aHeat;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((0.08 + 0.1 * aHeat) * uScale / max(0.1, -mv.z), 1.0, 24.0) * uStrength;
}
`;
const SPIRAL_FRAG = /* glsl */ `
varying float vHeat;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(c, c) * 3.0);
  vec3 col = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.95, 0.8), vHeat);
  gl_FragColor = vec4(col * a * (0.5 + vHeat), 0.0);
}
`;
const N_SPIRAL = 420;

export class BlackHole implements FxObject {
  readonly group = new Group();
  private spiral: Points;
  private sp = { r: new Float32Array(N_SPIRAL), a: new Float32Array(N_SPIRAL), y: new Float32Array(N_SPIRAL) };
  private spPos = new Float32Array(N_SPIRAL * 3);
  private spHeat = new Float32Array(N_SPIRAL);
  private spU = { uScale: { value: 900 }, uStrength: { value: 0 } };
  readonly center = new Vector3();
  /** horizon radius (world units) */
  radius = 1;
  /** 0..1 overall presence */
  strength = 0;
  /** accretion disk tilt normal (world) */
  readonly diskNormal = new Vector3(0.2, 1, 0.1).normalize();
  private horizon: Mesh;
  private lens: Mesh;
  private disk: Mesh;
  private halo: Mesh;
  private lensMat: ShaderMaterial;
  private diskMat: ShaderMaterial;
  private haloMat: ShaderMaterial;
  private skyRot = new Matrix3();
  private skyGroup: Object3D | null;
  private skyGain: { value: number } | null;

  constructor(parent: Object3D, opts: { skyGroup?: Object3D | null; planetR: number; atmo: number; land: number }) {
    this.skyGroup = opts.skyGroup ?? null;
    const sky = findSkyCube(this.skyGroup);
    this.skyGain = sky.intensity;
    this.horizon = new Mesh(new SphereGeometry(1, 32, 20), new MeshBasicMaterial({ color: 0x000000 }));
    this.horizon.renderOrder = 16;
    this.lensMat = new ShaderMaterial({
      vertexShader: LENS_VERT,
      fragmentShader: LENS_FRAG,
      uniforms: {
        uFxNoise: fxNoiseUniform,
        uC: { value: this.center },
        uRs: { value: 1 },
        uL: { value: 6 },
        uStrength: { value: 0 },
        uSky: { value: (sky.tex as CubeTexture | null) ?? null },
        uHasSky: { value: sky.tex ? 1 : 0 },
        uSkyGain: { value: 1 },
        uSkyRot: { value: this.skyRot },
        uPlanetR: { value: opts.planetR },
        uSunDir: shared.uSunDir,
        uAtmo: { value: new Color(opts.atmo) },
        uLand: { value: new Color(opts.land) },
        uCameraPos: shared.uCameraPos,
        uTime: { value: 0 },
      },
      ...premul,
      side: BackSide,
      depthTest: true,
    });
    this.lens = new Mesh(new SphereGeometry(1, 40, 28), this.lensMat);
    this.lens.renderOrder = 17;
    this.diskMat = new ShaderMaterial({
      vertexShader: DISK_VERT,
      fragmentShader: DISK_FRAG,
      uniforms: {
        uFxNoise: fxNoiseUniform,
        uTime: { value: 0 },
        uInner: { value: 1.25 },
        uOuter: { value: 3.6 },
        uIntensity: { value: 0 },
        uCameraPos: shared.uCameraPos,
        uAxisX: { value: new Vector3(1, 0, 0) },
        uAxisY: { value: new Vector3(0, 0, 1) },
        uC: { value: this.center },
      },
      ...additive,
      side: DoubleSide,
    });
    this.disk = new Mesh(new RingGeometry(1.25, 3.6, 160, 8), this.diskMat);
    this.disk.renderOrder = 18;
    // the lensed far side of the disk: a camera-facing halo hugging the photon sphere
    this.haloMat = new ShaderMaterial({
      vertexShader: DISK_VERT,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uIntensity; varying vec2 vP;
        ${FX_NOISE}
${FX_TEXNOISE}
        void main() {
          float r = length(vP);
          float ang = atan(vP.y, vP.x);
          float band = exp(-pow((r - 1.62) / 0.16, 2.0)) * (0.55 + 0.45 * fxNoise2(vec2(ang * 9.0 + uTime * 3.0, r * 9.0)));
          float top = 0.55 + 0.45 * smoothstep(-0.2, 1.0, sin(ang));
          vec3 col = mix(vec3(1.0, 0.5, 0.15), vec3(1.0, 0.95, 0.85), band);
          float a = band * top * uIntensity;
          gl_FragColor = vec4(col * a * 1.3, 0.0);
        }`,
      uniforms: {
        uFxNoise: fxNoiseUniform, uTime: { value: 0 }, uIntensity: { value: 0 } },
      ...additive,
      side: DoubleSide,
    });
    this.halo = new Mesh(new RingGeometry(1.1, 2.3, 96, 2), this.haloMat);
    this.halo.renderOrder = 18;
    // matter spiralling in, in the disk plane (CPU points, local to the disk)
    for (let i = 0; i < N_SPIRAL; i++) {
      this.sp.r[i] = 1.3 + Math.random() * 3.4;
      this.sp.a[i] = Math.random() * Math.PI * 2;
      this.sp.y[i] = (Math.random() - 0.5) * 0.12;
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(this.spPos, 3).setUsage(35048));
    sg.setAttribute('aHeat', new BufferAttribute(this.spHeat, 1).setUsage(35048));
    this.spiral = new Points(sg, new ShaderMaterial({ vertexShader: SPIRAL_VERT, fragmentShader: SPIRAL_FRAG, uniforms: this.spU, ...additive }));
    this.spiral.renderOrder = 18;
    this.disk.add(this.spiral);
    for (const m of [this.horizon, this.lens, this.disk, this.halo, this.spiral]) m.frustumCulled = false;
    this.group.add(this.lens, this.horizon, this.halo, this.disk);
    this.group.name = 'fx-blackhole';
    parent.add(this.group);
  }

  private stepSpiral(dt: number): void {
    const { r, a, y } = this.sp;
    for (let i = 0; i < N_SPIRAL; i++) {
      const w = 1.6 / Math.pow(r[i], 1.5);
      a[i] += w * dt * 2.2;
      r[i] -= dt * (0.08 + 0.5 / (r[i] * r[i]));
      if (r[i] < 1.15) {
        r[i] = 3.6 + Math.random() * 1.4;
        a[i] = Math.random() * Math.PI * 2;
      }
      this.spPos[i * 3] = Math.cos(a[i]) * r[i];
      this.spPos[i * 3 + 1] = Math.sin(a[i]) * r[i];
      this.spPos[i * 3 + 2] = y[i] * r[i];
      this.spHeat[i] = Math.max(0, Math.min(1, (4.2 - r[i]) / 3));
    }
    (this.spiral.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (this.spiral.geometry.attributes.aHeat as BufferAttribute).needsUpdate = true;
  }

  update(_dt: number, time: number): void {
    const s = Math.max(0, this.strength);
    const r = Math.max(1e-3, this.radius * Math.min(1, s * 1.4));
    this.group.position.copy(this.center);
    this.horizon.scale.setScalar(r);
    this.lens.scale.setScalar(r * 6);
    const lu = this.lensMat.uniforms;
    lu.uRs.value = r;
    lu.uL.value = r * 6;
    lu.uStrength.value = Math.min(1, s);
    lu.uTime.value = time;
    if (this.skyGain) lu.uSkyGain.value = 1.4 * Math.max(0.6, this.skyGain.value);
    if (this.skyGroup) {
      this.skyGroup.updateMatrixWorld();
      this.skyRot.setFromMatrix4(this.skyGroup.matrixWorld).invert();
    }
    // disk in its tilted plane
    const n = this.diskNormal;
    _v.set(0, 0, 1);
    this.disk.quaternion.setFromUnitVectors(_v, n);
    this.disk.scale.setScalar(r);
    const du = this.diskMat.uniforms;
    du.uTime.value = time;
    du.uIntensity.value = Math.min(0.55, s * 0.55);
    (du.uAxisX.value as Vector3).set(1, 0, 0).applyQuaternion(this.disk.quaternion);
    (du.uAxisY.value as Vector3).set(0, 1, 0).applyQuaternion(this.disk.quaternion);
    // halo faces the camera
    _w.copy(shared.uCameraPos.value).sub(this.center).normalize();
    this.halo.quaternion.setFromUnitVectors(_v, _w);
    this.halo.scale.setScalar(r);
    this.haloMat.uniforms.uTime.value = time;
    this.haloMat.uniforms.uIntensity.value = Math.min(1, s) * 0.9;
    this.spU.uStrength.value = Math.min(1, s);
    this.spU.uScale.value = 900 * r;
    if (s > 0.002) this.stepSpiral(_dt);
    this.group.visible = s > 0.002;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of [this.horizon, this.lens, this.disk, this.halo, this.spiral]) {
      m.geometry.dispose();
      (m.material as Material).dispose();
    }
  }
}

// ───────────────────────────────────────────────────────────── supernova shell

const NOVA_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
void main() {
  vL = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const NOVA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uCameraPos;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
${FX_NOISE}
${FX_TEXNOISE}
void main() {
  vec3 V = normalize(uCameraPos - vW);
  float f = abs(dot(normalize(vN), V));
  float rim = pow(1.0 - f, 2.2);
  float n = fxTFbm3(normalize(vL) * 5.0 + vec3(uTime * 0.25, -uTime * 0.15, uTime * 0.2));
  float fil = smoothstep(0.42, 0.85, n);
  vec3 col = mix(uColB, uColA, fil) * (0.35 + rim * 2.4) * (0.5 + fil * 1.2);
  float a = (rim * 0.9 + fil * 0.45) * uIntensity;
  gl_FragColor = vec4(col * a, 0.0);
}
`;

export class NovaShell implements FxObject {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  intensity = 1;
  constructor(parent: Object3D, colA = 0xbfe6ff, colB = 0xff7a2a) {
    this.mat = new ShaderMaterial({
      vertexShader: NOVA_VERT,
      fragmentShader: NOVA_FRAG,
      uniforms: {
        uFxNoise: fxNoiseUniform, uTime: { value: 0 }, uIntensity: { value: 1 }, uColA: { value: new Color(colA) }, uColB: { value: new Color(colB) }, uCameraPos: shared.uCameraPos },
      ...additive,
      side: DoubleSide,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 64, 40), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 19;
    parent.add(this.mesh);
  }
  update(_dt: number, time: number): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uIntensity.value = this.intensity;
    this.mesh.visible = this.intensity > 0.002;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// ───────────────────────────────────────────────────────────── molten orb (cores, molten moons)

const LAVA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uCameraPos;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
${FX_NOISE}
${FX_TEXNOISE}
void main() {
  vec3 p = normalize(vL);
  float n = fxTFbm3(p * 4.0 + vec3(0.0, uTime * 0.12, 0.0));
  float cells = fxTFbm3(p * 11.0 - vec3(uTime * 0.05));
  float crust = smoothstep(0.5, 0.62, n + cells * 0.3);
  vec3 hot = fxBlackbody(0.55 + 0.35 * cells);
  vec3 col = mix(hot * 1.25, vec3(0.12, 0.05, 0.03), crust * 0.75);
  vec3 V = normalize(uCameraPos - vW);
  float rim = pow(1.0 - abs(dot(normalize(vN), V)), 2.5);
  col += vec3(1.0, 0.45, 0.1) * rim * 1.5;
  gl_FragColor = vec4(col * uIntensity, 1.0);
}
`;

export function lavaMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: NOVA_VERT,
    fragmentShader: LAVA_FRAG,
    uniforms: {
        uFxNoise: fxNoiseUniform, uTime: { value: 0 }, uIntensity: { value: 1 }, uCameraPos: shared.uCameraPos },
  });
}

export class MoltenOrb implements FxObject {
  readonly mesh: Mesh;
  readonly mat: ShaderMaterial;
  intensity = 1;
  constructor(parent: Object3D, radius: number) {
    this.mat = lavaMaterial();
    this.mesh = new Mesh(new SphereGeometry(1, 48, 32), this.mat);
    this.mesh.scale.setScalar(radius);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }
  update(_dt: number, time: number): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uIntensity.value = this.intensity;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// ───────────────────────────────────────────────────────────── planet split

const CAP_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const CAP_FRAG = /* glsl */ `
uniform float uTime;
uniform float uR;
uniform float uHeat;
varying vec2 vP;
${FX_NOISE}
${FX_TEXNOISE}
void main() {
  float r = length(vP) / uR;
  float ang = atan(vP.y, vP.x);
  float n = fxTFbm2(vP * 0.35 + vec2(uTime * 0.05, 0.0));
  // crust (dark rock), mantle (orange convection), outer core (yellow), inner core (white)
  float crust = smoothstep(0.9, 0.95, r);
  vec3 mantle = fxBlackbody(0.3 + 0.3 * n + 0.25 * (1.0 - r));
  vec3 core = fxBlackbody(0.85) * 1.15;
  vec3 col = mix(core, mantle * 0.95, smoothstep(0.28, 0.42, r + n * 0.08));
  // convection cells + cracks
  float cells = fxNoise2(vec2(ang * 6.0, r * 14.0 - uTime * 0.3));
  col *= 0.75 + 0.5 * cells;
  vec3 rock = mix(vec3(0.16, 0.12, 0.1), vec3(0.35, 0.27, 0.2), n);
  float seam = smoothstep(0.02, 0.0, abs(fract(r * 9.0 + n) - 0.5) - 0.46) * (1.0 - crust);
  col = mix(col, rock, crust) + vec3(1.0, 0.5, 0.1) * seam * 0.3;
  col *= mix(1.0, 0.35, 1.0 - uHeat);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Split an indexed / non-indexed geometry into the triangles on either side of a plane through the origin. */
function splitByPlane(src: BufferGeometry, n: Vector3): [BufferGeometry, BufferGeometry] {
  const pos = src.getAttribute('position');
  const idx = src.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const a: number[] = [];
  const b: number[] = [];
  const vi = (t: number, k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  for (let t = 0; t < triCount; t++) {
    let s = 0;
    for (let k = 0; k < 3; k++) {
      const v = vi(t, k);
      s += pos.getX(v) * n.x + pos.getY(v) * n.y + pos.getZ(v) * n.z;
    }
    const list = s >= 0 ? a : b;
    list.push(vi(t, 0), vi(t, 1), vi(t, 2));
  }
  const make = (list: number[]) => {
    const g = new BufferGeometry();
    for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.attributes[name]);
    g.setIndex(new BufferAttribute(new Uint32Array(list), 1));
    g.computeBoundingSphere();
    return g;
  };
  return [make(a), make(b)];
}

export class PlanetSplit implements FxObject {
  readonly halves: Group[] = [new Group(), new Group()];
  readonly normal = new Vector3();
  readonly core: MoltenOrb;
  /** separation of each half from the centre along ±normal (world units). Keep small: the terrain shader reads
   *  altitude from |world position|, so big translations would repaint the halves (snow everywhere). */
  separation = 0;
  /** the halves swing open like a split fruit around `axis` (through the centre, in the cut plane), radians */
  hinge = 0;
  /** hinge axis (unit, in the cut plane); the wedge opens on the side of cross(axis, normal) */
  readonly axis = new Vector3();
  heat = 1;
  private src: BufferGeometry;
  private geos: BufferGeometry[];
  private capMats: ShaderMaterial[] = [];
  private caps: Mesh[] = [];
  private group = new Group();

  constructor(parent: Object3D, merged: BufferGeometry, terrainMat: Material, normal: Vector3, R: number) {
    this.src = merged;
    this.normal.copy(normal).normalize();
    this.geos = splitByPlane(merged, this.normal);
    this.axis.set(0, 1, 0);
    if (Math.abs(this.normal.y) > 0.9) this.axis.set(1, 0, 0);
    this.axis.cross(this.normal).normalize();
    this.axis.copy(this.axis);
    for (let i = 0; i < 2; i++) {
      const half = this.halves[i];
      const m = new Mesh(this.geos[i], terrainMat);
      m.frustumCulled = false;
      half.add(m);
      const mat = new ShaderMaterial({
        vertexShader: CAP_VERT,
        fragmentShader: CAP_FRAG,
        uniforms: {
        uFxNoise: fxNoiseUniform, uTime: { value: 0 }, uR: { value: R * 0.99 }, uHeat: { value: 1 } },
        side: DoubleSide,
      });
      this.capMats.push(mat);
      const cap = new Mesh(new CircleGeometry(R * 0.99, 96), mat);
      cap.quaternion.setFromUnitVectors(_v.set(0, 0, 1), _w.copy(this.normal).multiplyScalar(i === 0 ? -1 : 1));
      cap.position.copy(this.normal).multiplyScalar(i === 0 ? 0.02 : -0.02);
      cap.frustumCulled = false;
      half.add(cap);
      this.caps.push(cap);
      this.group.add(half);
    }
    this.core = new MoltenOrb(this.group, R * 0.38);
    this.group.name = 'fx-planet-split';
    parent.add(this.group);
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? 1 : -1;
      const h = this.halves[i];
      h.position.copy(this.normal).multiplyScalar(this.separation * sgn);
      h.quaternion.setFromAxisAngle(this.axis, -this.hinge * sgn);
      this.capMats[i].uniforms.uTime.value = time;
      this.capMats[i].uniforms.uHeat.value = this.heat;
    }
    this.core.intensity = 0.4 + 0.8 * this.heat;
    this.core.update(dt, time);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.core.dispose();
    for (const c of this.caps) c.geometry.dispose();
    for (const m of this.capMats) m.dispose();
    for (const g of this.geos) g.dispose();
    this.src.dispose();
  }
}

// ───────────────────────────────────────────────────────────── vacuum decay bubble

const BUBBLE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uCameraPos;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
${FX_NOISE}
${FX_TEXNOISE}
vec3 spectrum(float x) {
  return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0);
}
void main() {
  vec3 V = normalize(uCameraPos - vW);
  float f = abs(dot(normalize(vN), V));
  float rim = pow(1.0 - f, 3.0);
  vec3 p = normalize(vL);
  // thin-film interference: hue shifts with view angle and swirling thickness
  float thick = fxTFbm3(p * 3.0 + vec3(uTime * 0.2, 0.0, -uTime * 0.15));
  vec3 film = spectrum(fract(f * 1.6 + thick * 1.3 + uTime * 0.05));
  // hexagonal lattice of "new physics" etched on the wall
  vec2 q = vec2(atan(p.z, p.x) * 12.0, acos(clamp(p.y, -1.0, 1.0)) * 12.0);
  vec2 g = abs(fract(q + vec2(0.5 * floor(q.y), 0.0)) - 0.5);
  float lattice = smoothstep(0.06, 0.0, min(g.x, g.y)) * (0.4 + 0.6 * sin(uTime * 2.0 + q.x * 0.3 + q.y * 0.2));
  vec3 col = film * (rim * 2.4 + 0.12) + vec3(0.7, 0.95, 1.0) * lattice * 0.35 * (0.3 + rim);
  float a = (rim * 0.9 + 0.08 + lattice * 0.12) * uIntensity;
  gl_FragColor = vec4(col * a, 0.0);
}
`;

export class Bubble implements FxObject {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  intensity = 1;
  constructor(parent: Object3D) {
    this.mat = new ShaderMaterial({
      vertexShader: NOVA_VERT,
      fragmentShader: BUBBLE_FRAG,
      uniforms: {
        uFxNoise: fxNoiseUniform, uTime: { value: 0 }, uIntensity: { value: 1 }, uCameraPos: shared.uCameraPos },
      ...additive,
      side: DoubleSide,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 64, 40), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 19;
    parent.add(this.mesh);
  }
  update(_dt: number, time: number): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uIntensity.value = this.intensity;
    this.mesh.visible = this.intensity > 0.002 && this.mesh.scale.x > 0.01;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// ───────────────────────────────────────────────────────────── wormhole portal

const PORTAL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform samplerCube uSky;
uniform float uHasSky;
uniform vec3 uTint;
varying vec2 vP;
${FX_NOISE}
${FX_TEXNOISE}
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float ang = atan(vP.y, vP.x);
  float swirl = ang + 3.5 / (r + 0.15) - uTime * 1.6;
  float arms = 0.5 + 0.5 * sin(swirl * 3.0 + fxNoise2(vec2(swirl, r * 6.0)) * 2.0);
  float n = fxTFbm2(vec2(swirl * 1.2, r * 5.0 - uTime * 0.8));
  // the far universe at the throat
  vec3 dir = normalize(vec3(vP * 1.4 * (1.0 + 0.6 * sin(uTime * 0.3)), 1.0));
  dir.xy = fxRot(uTime * 0.2 + (1.0 - r) * 3.0) * dir.xy;
  vec3 far = uHasSky > 0.5 ? pow(textureCube(uSky, dir).rgb, vec3(2.2)) * 2.5 : vec3(0.3, 0.2, 0.6) * fxTFbm2(dir.xy * 4.0);
  float throat = smoothstep(0.42, 0.0, r);
  vec3 col = mix(uTint * (0.6 + 1.6 * arms * n), far + vec3(0.4, 0.6, 1.0) * 0.2, throat);
  float edge = smoothstep(1.0, 0.82, r);
  float rim = exp(-pow((r - 0.9) / 0.06, 2.0));
  col += uTint * rim * 2.0;
  float a = edge * uIntensity * (0.55 + 0.45 * max(arms * n * 1.5, throat));
  gl_FragColor = vec4(col * a, a);
}
`;

export class Portal implements FxObject {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  intensity = 0;
  readonly normal = new Vector3(0, 1, 0);
  constructor(parent: Object3D, radius: number, skyGroup?: Object3D | null, tint = 0x9a6bff) {
    const sky = findSkyCube(skyGroup);
    this.mat = new ShaderMaterial({
      vertexShader: DISK_VERT,
      fragmentShader: PORTAL_FRAG,
      uniforms: {
        uFxNoise: fxNoiseUniform, uTime: { value: 0 }, uIntensity: { value: 0 }, uSky: { value: sky.tex }, uHasSky: { value: sky.tex ? 1 : 0 }, uTint: { value: new Color(tint) } },
      ...premul,
      side: DoubleSide,
    });
    this.mesh = new Mesh(new CircleGeometry(1, 72), this.mat);
    this.mesh.scale.setScalar(radius);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 17;
    parent.add(this.mesh);
  }
  get position(): Vector3 {
    return this.mesh.position;
  }
  update(_dt: number, time: number): void {
    this.mesh.quaternion.setFromUnitVectors(_v.set(0, 0, 1), this.normal);
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uIntensity.value = this.intensity;
    this.mesh.visible = this.intensity > 0.002;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** Additive blending preset for other FX files. */
export const FX_ADDITIVE = additive;
