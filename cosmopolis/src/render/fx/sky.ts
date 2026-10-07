/**
 * OWNER: god.
 * Sky objects for god powers:
 *   Fireball  — a meteor / asteroid: faceted rock core, white-hot plasma sheath, a long additive trail cone and
 *               (optionally) a glowing bow shock. The effect moves it; `heat` drives the glow.
 *   Rainbow   — a soft spectral arc standing on the ground (blessings).
 *   Curtain   — an aurora curtain hanging over a region (folded ribbon, animated rays).
 *   Comet     — nucleus + coma + straight blue ion tail + curved golden dust tail, always pointing away from the sun.
 *   GlowOrb   — a camera-facing additive glow sprite (sun-like flares, explosions, portals).
 */
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  CustomBlending,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Object3D,
  type BufferGeometry,
} from 'three';
import { shared } from '../materials';
import { FX_NOISE, FX_TEXNOISE, fxNoiseUniform } from './glsl';
import type { FxObject } from './FxLayer';

const UP = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _v = new Vector3();

// ───────────────────────────────────────────────────────────── glow (fresnel) material

const GLOW_VERT = /* glsl */ `
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
const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uIntensity;
uniform float uPower;
uniform float uTime;
uniform float uNoise;
uniform vec3 uCameraPos;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
${FX_NOISE}
${FX_TEXNOISE}
void main() {
  vec3 V = normalize(uCameraPos - vW);
  float f = abs(dot(normalize(vN), V));
  float core = pow(f, uPower);
  float n = uNoise > 0.0 ? fxTFbm3(normalize(vL) * 3.0 + vec3(0.0, uTime * 0.8, uTime * 0.5)) : 0.5;
  float a = core * (1.0 - uNoise * 0.6 + uNoise * n * 1.2) * uIntensity;
  vec3 col = mix(uColor, uCore, pow(f, uPower * 2.0));
  gl_FragColor = vec4(col * a, 0.0);
}
`;

export function glowMaterial(color: number, core = 0xffffff, power = 2.2, noise = 0): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: {
      uColor: { value: new Color(color) },
      uCore: { value: new Color(core) },
      uIntensity: { value: 1 },
      uPower: { value: power },
      uTime: { value: 0 },
      uNoise: { value: noise },
      uCameraPos: shared.uCameraPos,
      uFxNoise: fxNoiseUniform,
    },
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
  });
}

// ───────────────────────────────────────────────────────────── trail cone

const TRAIL_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const TRAIL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uIntensity;
uniform float uTime;
uniform vec3 uCameraPos;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
${FX_NOISE}
void main() {
  // uv.y: 0 at the tail tip … 1 at the head (cone apex points away from the head)
  float along = vUv.y;
  float f = abs(dot(normalize(vN), normalize(uCameraPos - vW)));
  float n = fxNoise2(vec2(vUv.x * 10.0, along * 14.0 + uTime * 9.0));
  float a = pow(along, 1.6) * pow(f, 1.4) * (0.6 + 0.6 * n) * uIntensity;
  vec3 col = mix(uColor, uCore, pow(along, 4.0) * f);
  gl_FragColor = vec4(col * a, 0.0);
}
`;

/** A meteor / asteroid with plasma sheath and trail. Position + velocity direction are set by the effect. */
export class Fireball implements FxObject {
  readonly group = new Group();
  readonly dir = new Vector3(0, -1, 0);
  /** 0..1 glow amount (atmospheric entry) */
  heat = 1;
  private rock: Mesh;
  private sheath: Mesh;
  private halo: Mesh;
  private trail: Mesh;
  private trailMat: ShaderMaterial;
  private sheathMat: ShaderMaterial;
  private haloMat: ShaderMaterial;
  private rockGeo: BufferGeometry;
  private spin = new Vector3(Math.random(), Math.random(), Math.random()).normalize();
  private angle = 0;

  constructor(parent: Object3D, readonly radius: number, trailLength: number, color = 0xff8a3a, core = 0xfff4d8, rockColor = 0x4a3f38) {
    this.rockGeo = new IcosahedronGeometry(1, 1);
    // knobbly rock
    const pa = this.rockGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa, i);
      const k = 0.8 + 0.35 * Math.abs(Math.sin(_v.x * 5.1 + _v.y * 3.7) * Math.cos(_v.z * 4.3));
      _v.multiplyScalar(k);
      pa.setXYZ(i, _v.x, _v.y, _v.z);
    }
    this.rockGeo.computeVertexNormals();
    this.rock = new Mesh(this.rockGeo, new MeshStandardMaterial({ color: rockColor, roughness: 0.95, flatShading: true, emissive: new Color(0xff5a1a), emissiveIntensity: 0.6 }));
    this.rock.scale.setScalar(radius);
    this.sheathMat = glowMaterial(color, core, 1.2, 0.6);
    this.sheath = new Mesh(new SphereGeometry(1, 24, 16), this.sheathMat);
    this.sheath.scale.setScalar(radius * 1.45);
    this.haloMat = glowMaterial(color, 0xffd9a0, 3.5, 0);
    this.halo = new Mesh(new SphereGeometry(1, 24, 16), this.haloMat);
    this.halo.scale.setScalar(radius * 3.2);
    const tg = new ConeGeometry(1, 1, 24, 1, true);
    // apex at -Y (tail), base at +Y (head) → translate so the base sits at the origin, tail along -Y
    tg.rotateX(Math.PI);
    tg.translate(0, -0.5, 0);
    this.trailMat = new ShaderMaterial({
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      uniforms: { uColor: { value: new Color(color) }, uCore: { value: new Color(core) }, uIntensity: { value: 1 }, uTime: { value: 0 }, uCameraPos: shared.uCameraPos },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
    });
    this.trail = new Mesh(tg, this.trailMat);
    this.trail.scale.set(radius * 1.5, trailLength, radius * 1.5);
    for (const m of [this.rock, this.sheath, this.halo, this.trail]) m.frustumCulled = false;
    this.sheath.renderOrder = 15;
    this.halo.renderOrder = 15;
    this.trail.renderOrder = 15;
    this.group.add(this.rock, this.trail, this.sheath, this.halo);
    this.group.name = 'fx-fireball';
    parent.add(this.group);
  }

  get position(): Vector3 {
    return this.group.position;
  }

  setTrail(length: number): void {
    this.trail.scale.y = length;
  }

  update(dt: number, time: number): void {
    this.angle += dt * 2.5;
    this.rock.quaternion.setFromAxisAngle(this.spin, this.angle);
    // trail points opposite the motion: our cone tail is along local -Y → align +Y with dir
    _q.setFromUnitVectors(UP, this.dir);
    this.trail.quaternion.copy(_q);
    const h = Math.max(0, this.heat);
    this.sheathMat.uniforms.uIntensity.value = 0.25 + 1.6 * h;
    this.sheathMat.uniforms.uTime.value = time;
    this.haloMat.uniforms.uIntensity.value = 0.15 + 0.9 * h;
    this.trailMat.uniforms.uIntensity.value = 0.1 + 1.9 * h;
    this.trailMat.uniforms.uTime.value = time;
    (this.rock.material as MeshStandardMaterial).emissiveIntensity = 0.2 + h * 1.5;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.rockGeo.dispose();
    (this.rock.material as MeshStandardMaterial).dispose();
    this.sheath.geometry.dispose();
    this.halo.geometry.dispose();
    this.trail.geometry.dispose();
    this.sheathMat.dispose();
    this.haloMat.dispose();
    this.trailMat.dispose();
  }
}

// ───────────────────────────────────────────────────────────── rainbow

const RAINBOW_FRAG = /* glsl */ `
uniform float uIntensity;
varying vec2 vUv;
vec3 spectrum(float x) {
  return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0);
}
void main() {
  // vUv.y runs around the tube cross-section → use it as the spectral coordinate
  float x = fract(vUv.y);
  float band = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
  float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  vec3 col = spectrum(1.0 - x) * 1.1;
  float a = band * ends * uIntensity * 0.55;
  gl_FragColor = vec4(col * a, 0.0);
}
`;

export class Rainbow implements FxObject {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  intensity = 0;
  constructor(parent: Object3D, center: Vector3, up: Vector3, radius: number, facing: Vector3) {
    const geo = new TorusGeometry(radius, radius * 0.06, 6, 72, Math.PI);
    this.mat = new ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: RAINBOW_FRAG,
      uniforms: { uIntensity: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
    });
    this.mesh = new Mesh(geo, this.mat);
    // torus lies in XY with the arc above the X axis: X → tangent across, Y → up, Z → facing
    const x = new Vector3().crossVectors(up, facing).normalize();
    const z = new Vector3().crossVectors(x, up).normalize();
    const m = this.mesh.matrix;
    m.makeBasis(x, up, z).setPosition(center);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    parent.add(this.mesh);
  }
  update(): void {
    this.mat.uniforms.uIntensity.value = this.intensity;
    this.mesh.visible = this.intensity > 0.002;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// ───────────────────────────────────────────────────────────── aurora curtain

const CURTAIN_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  p.z += sin(uv.x * 9.0 + uTime * 0.6) * 1.6 + sin(uv.x * 23.0 - uTime * 0.9) * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const CURTAIN_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColA;
uniform vec3 uColB;
varying vec2 vUv;
${FX_NOISE}
void main() {
  float rays = fxNoise2(vec2(vUv.x * 60.0 + uTime * 0.8, uTime * 0.25));
  rays = pow(rays, 2.0);
  float base = smoothstep(0.0, 0.08, vUv.y) * pow(1.0 - vUv.y, 1.6);
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  vec3 col = mix(uColA, uColB, smoothstep(0.25, 0.95, vUv.y));
  float a = base * edge * (0.35 + rays * 1.4) * uIntensity;
  gl_FragColor = vec4(col * a, 0.0);
}
`;

export class Curtain implements FxObject {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  intensity = 0;
  constructor(parent: Object3D, center: Vector3, up: Vector3, along: Vector3, width: number, height: number, colA = 0x4dffa6, colB = 0xb26bff) {
    const geo = new PlaneGeometry(width, height, 64, 4);
    geo.translate(0, height / 2, 0);
    this.mat = new ShaderMaterial({
      vertexShader: CURTAIN_VERT,
      fragmentShader: CURTAIN_FRAG,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uColA: { value: new Color(colA) }, uColB: { value: new Color(colB) } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    this.mat.blending = CustomBlending;
    this.mat.blendSrc = OneFactor;
    this.mat.blendDst = OneFactor;
    this.mesh = new Mesh(geo, this.mat);
    const x = along.clone().normalize();
    const z = new Vector3().crossVectors(x, up).normalize();
    this.mesh.matrix.makeBasis(x, up, z).setPosition(center);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
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

// ───────────────────────────────────────────────────────────── comet

const TAIL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;
${FX_NOISE}
void main() {
  float along = vUv.y;           // 0 head … 1 tail end
  float across = abs(vUv.x - 0.5) * 2.0;
  float width = mix(0.25, 1.0, along);
  float n = fxNoise2(vec2(vUv.x * 12.0, along * 6.0 - uTime * 0.6));
  float a = (1.0 - smoothstep(0.0, width, across)) * pow(1.0 - along, 1.3) * (0.6 + 0.6 * n) * uIntensity;
  gl_FragColor = vec4(uColor * a, 0.0);
}
`;

export class Comet implements FxObject {
  readonly group = new Group();
  private head: Mesh;
  private coma: Mesh;
  private ion: Mesh;
  private dust: Mesh;
  private mats: ShaderMaterial[] = [];
  intensity = 1;
  readonly sunDir = new Vector3(1, 0, 0);
  readonly vel = new Vector3(0, 0, 1);

  constructor(parent: Object3D, size: number) {
    this.head = new Mesh(new SphereGeometry(size * 0.35, 16, 12), glowMaterial(0xdff4ff, 0xffffff, 1.2));
    this.coma = new Mesh(new SphereGeometry(size * 2.2, 24, 16), glowMaterial(0x7fd8ff, 0xe8fbff, 2.4));
    const mk = (color: number, len: number, w: number) => {
      const geo = new PlaneGeometry(w, len, 4, 24);
      geo.translate(0, -len / 2, 0);
      const mat = new ShaderMaterial({
        vertexShader: `varying vec2 vUv; void main(){ vUv = vec2(uv.x, 1.0 - uv.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: TAIL_FRAG,
        uniforms: { uColor: { value: new Color(color) }, uIntensity: { value: 1 }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneFactor,
      });
      this.mats.push(mat);
      return new Mesh(geo, mat);
    };
    this.ion = mk(0x6ec8ff, size * 60, size * 5);
    this.dust = mk(0xffd9a0, size * 42, size * 9);
    for (const m of [this.head, this.coma, this.ion, this.dust]) {
      m.frustumCulled = false;
      m.renderOrder = 15;
    }
    this.group.add(this.dust, this.ion, this.coma, this.head);
    parent.add(this.group);
  }

  get position(): Vector3 {
    return this.group.position;
  }

  update(_dt: number, time: number, camera?: Vector3): void {
    // ion tail straight away from the sun; dust tail curves back along the orbit
    const anti = _v.copy(this.sunDir).negate().normalize();
    _q.setFromUnitVectors(new Vector3(0, -1, 0), anti);
    this.ion.quaternion.copy(_q);
    const dustDir = anti.clone().multiplyScalar(0.75).addScaledVector(this.vel.clone().normalize(), -0.45).normalize();
    _q.setFromUnitVectors(new Vector3(0, -1, 0), dustDir);
    this.dust.quaternion.copy(_q);
    // billboard the tails around their own axis toward the camera
    const cam = camera ?? shared.uCameraPos.value;
    for (const [m, axis] of [[this.ion, anti], [this.dust, dustDir]] as const) {
      const toCam = cam.clone().sub(this.group.position).normalize();
      const side = new Vector3().crossVectors(axis, toCam).normalize();
      const normal = new Vector3().crossVectors(side, axis).normalize();
      m.matrix.makeBasis(side, axis.clone().negate(), normal);
      m.matrixAutoUpdate = false;
      m.matrix.setPosition(0, 0, 0);
    }
    for (const mat of this.mats) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uIntensity.value = this.intensity;
    }
    for (const m of [this.head, this.coma]) {
      const mat = m.material as ShaderMaterial;
      mat.uniforms.uIntensity.value = this.intensity * (m === this.coma ? 0.7 : 1.4);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of [this.head, this.coma, this.ion, this.dust]) {
      m.geometry.dispose();
      (m.material as ShaderMaterial).dispose();
    }
  }
}

// ───────────────────────────────────────────────────────────── glow orb

export class GlowOrb implements FxObject {
  readonly mesh: Mesh;
  readonly mat: ShaderMaterial;
  intensity = 1;
  constructor(parent: Object3D, radius: number, color: number, core = 0xffffff, power = 2, noise = 0) {
    this.mat = glowMaterial(color, core, power, noise);
    this.mesh = new Mesh(new SphereGeometry(1, 32, 20), this.mat);
    this.mesh.scale.setScalar(radius);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
    parent.add(this.mesh);
  }
  get position(): Vector3 {
    return this.mesh.position;
  }
  update(_dt: number, time: number): void {
    this.mat.uniforms.uIntensity.value = this.intensity;
    this.mat.uniforms.uTime.value = time;
    this.mesh.visible = this.intensity > 0.002;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** Alpha-blended material helper for solid-ish FX (dust walls, clouds). */
export const ALPHA_BLEND = { blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor } as const;
