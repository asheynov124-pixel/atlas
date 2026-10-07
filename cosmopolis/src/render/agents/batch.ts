/**
 * OWNER: life.
 * GPU batches for moving agents — every frame the owner calls begin(), push()es the visible instances, end().
 * No per-frame allocations: instance arrays grow by doubling (rare) and are written in place.
 *
 *   KitBatch      InstancedMesh of a kit geometry (MeshBuilder) drawn with the shared building material, so Mat
 *                 channels (Glow, Light, Window…) and paintable tints work on vehicles exactly like on buildings.
 *   SpriteBatch   additive camera-facing glow dots (head/tail lights, strobes, aviation lights, engine glow) with
 *                 per-instance size, colour, blink (rate, phase, duty) and a night-only factor — one draw call.
 *   DecalBatch    oriented soft quads (additive headlight pools on the asphalt, alpha boat wakes / splash rings).
 *   Particles     GPU-animated puffs (smoke, steam, spray, exhaust): CPU writes a ring-buffer slot on emit, the
 *                 vertex shader moves / grows / fades them from their birth time — zero per-frame CPU per particle.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  type Object3D,
} from 'three';
import { SHADER_COMMON, getBuildingMaterial, shared } from '../materials';

const _c = new Color();

/** Linear RGB of an sRGB hex colour, written into out[0..2]. */
export function linHex(hex: number, out: Float32Array | number[], o = 0): void {
  _c.setHex(hex);
  out[o] = _c.r;
  out[o + 1] = _c.g;
  out[o + 2] = _c.b;
}

// ───────────────────────────────────────────────────────────── KitBatch

export class KitBatch {
  mesh: InstancedMesh;
  private geo: BufferGeometry;
  private cap: number;
  count = 0;
  /** world-space bounding radius of the geometry (for culling helpers) */
  readonly radius: number;
  private srcGeo: BufferGeometry;

  constructor(private parent: Object3D, src: BufferGeometry, capacity: number, readonly name: string, private ownsSource = true) {
    this.cap = Math.max(4, capacity);
    this.geo = shallow(src);
    if (!src.boundingSphere) src.computeBoundingSphere();
    this.radius = src.boundingSphere?.radius ?? 1;
    this.srcGeo = src;
    this.mesh = this.create(this.cap);
    parent.add(this.mesh);
  }

  private create(cap: number): InstancedMesh {
    this.geo.setAttribute('aState', new InstancedBufferAttribute(new Float32Array(cap), 1));
    const m = new InstancedMesh(this.geo, getBuildingMaterial(), cap);
    m.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.frustumCulled = false;
    m.count = 0;
    m.visible = false;
    m.name = 'life:' + this.name;
    return m;
  }

  begin(): void {
    this.count = 0;
  }

  private grow(): void {
    const old = this.mesh;
    const cap = this.cap * 2;
    const m = this.create(cap);
    (m.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    (m.instanceColor!.array as Float32Array).set(old.instanceColor!.array as Float32Array);
    this.parent.remove(old);
    old.dispose();
    this.parent.add(m);
    this.mesh = m;
    this.cap = cap;
  }

  /**
   * Push one instance: position p, orthonormal basis right/up/fwd (unit), uniform scale s, linear colour.
   * Returns false when the batch is at its hard ceiling (never happens in practice; capacity doubles).
   */
  push(
    px: number, py: number, pz: number,
    rx: number, ry: number, rz: number,
    ux: number, uy: number, uz: number,
    fx: number, fy: number, fz: number,
    s: number, cr = 1, cg = 1, cb = 1, state = 0,
  ): void {
    if (this.count >= this.cap) {
      if (this.cap >= 16384) return;
      this.grow();
    }
    const i = this.count++;
    const e = this.mesh.instanceMatrix.array as Float32Array;
    const o = i * 16;
    e[o] = rx * s; e[o + 1] = ry * s; e[o + 2] = rz * s; e[o + 3] = 0;
    e[o + 4] = ux * s; e[o + 5] = uy * s; e[o + 6] = uz * s; e[o + 7] = 0;
    e[o + 8] = fx * s; e[o + 9] = fy * s; e[o + 10] = fz * s; e[o + 11] = 0;
    e[o + 12] = px; e[o + 13] = py; e[o + 14] = pz; e[o + 15] = 1;
    const c = this.mesh.instanceColor!.array as Float32Array;
    c[i * 3] = cr; c[i * 3 + 1] = cg; c[i * 3 + 2] = cb;
    if (state) (this.geo.getAttribute('aState').array as Float32Array)[i] = state;
    else (this.geo.getAttribute('aState').array as Float32Array)[i] = 0;
  }

  end(): void {
    const m = this.mesh;
    const n = this.count;
    m.count = n;
    m.visible = n > 0;
    if (!n) return;
    m.instanceMatrix.clearUpdateRanges();
    m.instanceMatrix.addUpdateRange(0, n * 16);
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor!.clearUpdateRanges();
    m.instanceColor!.addUpdateRange(0, n * 3);
    m.instanceColor!.needsUpdate = true;
    const st = this.geo.getAttribute('aState') as InstancedBufferAttribute;
    st.clearUpdateRanges();
    st.addUpdateRange(0, n);
    st.needsUpdate = true;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.geo.dispose();
    if (this.ownsSource) this.srcGeo.dispose();
  }
}

function shallow(src: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const name of Object.keys(src.attributes)) if (name !== 'aState') g.setAttribute(name, src.attributes[name]);
  if (src.index) g.setIndex(src.index);
  g.boundingBox = src.boundingBox;
  g.boundingSphere = src.boundingSphere;
  return g;
}

// ───────────────────────────────────────────────────────────── SpriteBatch

const SPRITE_VERT = /* glsl */ `
${SHADER_COMMON}
attribute vec3 iPos;
attribute vec4 iCol;     // rgb, night-only factor (0 = always, 1 = night only)
attribute vec4 iSize;    // size, blink rate (Hz, 0 = steady), phase, duty (0..1 on-fraction)
uniform float uMinPx;
uniform float uGain;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = position.xy;
  float night = cNight(iPos);
  float k = mix(1.0, night, iCol.a);
  if (iSize.y > 0.0) {
    float f = fract(uTime * iSize.y + iSize.z);
    k *= smoothstep(0.0, 0.04, f) * (1.0 - smoothstep(iSize.w, iSize.w + 0.06, f));
  }
  // dimmer by day, punchy at night
  k *= mix(0.55, 1.0, night) * uGain;
  vCol = iCol.rgb * k;
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float dist = max(0.001, -mv.z);
  float size = max(iSize.x, dist * uMinPx);
  // fade the minimum-size boost so far-away dots don't look huge and bright
  vCol *= clamp(iSize.x / size * 1.6, 0.25, 1.0);
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  if (k < 0.003) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
}
`;

const SPRITE_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float d = length(vUv);
  float core = exp(-d * d * 9.0);
  float halo = exp(-d * d * 2.6) * 0.45;
  float a = (core + halo) * (1.0 - smoothstep(0.75, 1.0, d));
  gl_FragColor = vec4(vCol * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class SpriteBatch {
  readonly mesh: Mesh;
  private geo: InstancedBufferGeometry;
  private pos!: InstancedBufferAttribute;
  private col!: InstancedBufferAttribute;
  private size!: InstancedBufferAttribute;
  private cap: number;
  count = 0;
  readonly material: ShaderMaterial;

  constructor(parent: Object3D, capacity: number, name: string, opts: { minPx?: number } = {}) {
    this.cap = capacity;
    this.geo = new InstancedBufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.alloc(capacity);
    this.material = new ShaderMaterial({
      name: 'life-sprites',
      uniforms: { ...shared, uMinPx: { value: opts.minPx ?? 0.0022 }, uGain: { value: 1 } },
      vertexShader: SPRITE_VERT,
      fragmentShader: SPRITE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'life:' + name;
    parent.add(this.mesh);
  }

  private alloc(cap: number): void {
    const keep = this.pos ? { p: this.pos.array as Float32Array, c: this.col.array as Float32Array, s: this.size.array as Float32Array } : null;
    this.pos = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.col = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.size = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    if (keep) {
      (this.pos.array as Float32Array).set(keep.p);
      (this.col.array as Float32Array).set(keep.c);
      (this.size.array as Float32Array).set(keep.s);
    }
    this.pos.setUsage(DynamicDrawUsage);
    this.col.setUsage(DynamicDrawUsage);
    this.size.setUsage(DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.pos);
    this.geo.setAttribute('iCol', this.col);
    this.geo.setAttribute('iSize', this.size);
    this.cap = cap;
  }

  begin(): void {
    this.count = 0;
  }

  /**
   * Add a glow dot. r,g,b linear (may exceed 1 for HDR punch). night: 0 = always on, 1 = only at night.
   * blink: Hz (0 = steady), phase 0..1, duty = lit fraction of each cycle.
   */
  push(x: number, y: number, z: number, size: number, r: number, g: number, b: number, night = 1, blink = 0, phase = 0, duty = 0.5): void {
    if (this.count >= this.cap) {
      if (this.cap >= 65536) return;
      this.alloc(this.cap * 2);
    }
    const i = this.count++;
    const p = this.pos.array as Float32Array;
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    const c = this.col.array as Float32Array;
    c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = night;
    const s = this.size.array as Float32Array;
    s[i * 4] = size; s[i * 4 + 1] = blink; s[i * 4 + 2] = phase; s[i * 4 + 3] = duty;
  }

  end(): void {
    const n = this.count;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    for (const [a, k] of [[this.pos, 3], [this.col, 4], [this.size, 4]] as [InstancedBufferAttribute, number][]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * k);
      a.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.material.dispose();
  }
}

// ───────────────────────────────────────────────────────────── DecalBatch

const DECAL_VERT = /* glsl */ `
${SHADER_COMMON}
varying vec2 vUv;
varying vec3 vCol;
varying vec3 vWPos;
void main() {
  vUv = uv * 2.0 - 1.0;
  vCol = instanceColor;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/** shape 0 = soft disc, 1 = headlight beam (bright at -v, long fade toward +v), 2 = V wake, 3 = ring */
function decalFrag(shape: number, additive: boolean): string {
  return /* glsl */ `
${SHADER_COMMON}
uniform float uGain;
varying vec2 vUv;
varying vec3 vCol;
varying vec3 vWPos;
void main() {
  vec2 p = vUv;
  float a = 0.0;
  ${
    shape === 0
      ? 'float d = length(p); a = (1.0 - smoothstep(0.0, 1.0, d)); a *= a;'
      : shape === 1
        ? 'float t = p.y * 0.5 + 0.5; float w = 1.0 - smoothstep(0.15 + t * 0.65, 0.35 + t * 0.75, abs(p.x)); a = w * smoothstep(0.0, 0.12, t) * pow(1.0 - t, 1.6);'
        : shape === 2
          ? 'float t = 1.0 - (p.y * 0.5 + 0.5); float spread = 0.08 + t * 0.92; float arm = abs(abs(p.x) - spread * 0.85); a = (1.0 - smoothstep(0.0, 0.08 + t * 0.25, arm)) * (1.0 - t) * smoothstep(0.0, 0.06, t); a += (1.0 - smoothstep(0.0, 0.18, abs(p.x))) * (1.0 - t) * 0.5;'
          : 'float d = length(p); a = smoothstep(0.55, 0.8, d) * (1.0 - smoothstep(0.85, 1.0, d));'
  }
  ${additive ? 'a *= cNight(vWPos) * uNightLights;' : ''}
  a *= uGain;
  if (a < 0.003) discard;
  ${additive ? 'gl_FragColor = vec4(vCol * a, 1.0);' : 'gl_FragColor = vec4(vCol, a);'}
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}

export class DecalBatch {
  mesh: InstancedMesh;
  private geo: PlaneGeometry;
  private cap: number;
  count = 0;
  readonly material: ShaderMaterial;

  constructor(private parent: Object3D, capacity: number, name: string, shape: 0 | 1 | 2 | 3, additive: boolean) {
    this.cap = capacity;
    // unit quad in the XZ plane (local +Y = normal), uv.y grows toward +Z
    this.geo = new PlaneGeometry(1, 1);
    this.geo.rotateX(-Math.PI / 2);
    this.material = new ShaderMaterial({
      name: 'life-decal-' + name,
      uniforms: { ...shared, uGain: { value: 1 } },
      vertexShader: DECAL_VERT,
      fragmentShader: decalFrag(shape, additive),
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: additive ? AdditiveBlending : NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = this.create(capacity);
    parent.add(this.mesh);
    this.name = name;
  }
  readonly name: string;

  private create(cap: number): InstancedMesh {
    const m = new InstancedMesh(this.geo, this.material, cap);
    m.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.frustumCulled = false;
    m.count = 0;
    m.visible = false;
    m.renderOrder = 4;
    m.name = 'life:decal';
    return m;
  }

  begin(): void {
    this.count = 0;
  }

  /** Quad centred at p in the plane (right, fwd) with normal up; half-sizes w (along right) and l (along fwd). */
  push(px: number, py: number, pz: number, rx: number, ry: number, rz: number, ux: number, uy: number, uz: number, fx: number, fy: number, fz: number, w: number, l: number, r: number, g: number, b: number): void {
    if (this.count >= this.cap) {
      if (this.cap >= 16384) return;
      const old = this.mesh;
      const m = this.create(this.cap * 2);
      (m.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      (m.instanceColor!.array as Float32Array).set(old.instanceColor!.array as Float32Array);
      this.parent.remove(old);
      old.dispose();
      this.parent.add(m);
      this.mesh = m;
      this.cap *= 2;
    }
    const i = this.count++;
    const e = this.mesh.instanceMatrix.array as Float32Array;
    const o = i * 16;
    const W = w * 2, L = l * 2;
    e[o] = rx * W; e[o + 1] = ry * W; e[o + 2] = rz * W; e[o + 3] = 0;
    e[o + 4] = ux; e[o + 5] = uy; e[o + 6] = uz; e[o + 7] = 0;
    e[o + 8] = fx * L; e[o + 9] = fy * L; e[o + 10] = fz * L; e[o + 11] = 0;
    e[o + 12] = px; e[o + 13] = py; e[o + 14] = pz; e[o + 15] = 1;
    const c = this.mesh.instanceColor!.array as Float32Array;
    c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b;
  }

  end(): void {
    const m = this.mesh;
    const n = this.count;
    m.count = n;
    m.visible = n > 0;
    if (!n) return;
    m.instanceMatrix.clearUpdateRanges();
    m.instanceMatrix.addUpdateRange(0, n * 16);
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor!.clearUpdateRanges();
    m.instanceColor!.addUpdateRange(0, n * 3);
    m.instanceColor!.needsUpdate = true;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.geo.dispose();
    this.material.dispose();
  }
}

// ───────────────────────────────────────────────────────────── Particles

const PART_VERT = /* glsl */ `
${SHADER_COMMON}
attribute vec4 iP0;    // xyz, birth time
attribute vec4 iVel;   // xyz velocity, life (s)
attribute vec4 iCol;   // rgb, alpha / intensity
attribute vec4 iSz;    // start size, end size, drag, rise (along radial up)
uniform float uMinPx;
varying vec2 vUv;
varying vec4 vCol;
varying float vT;
void main() {
  vUv = position.xy;
  float age = uTime - iP0.w;
  float life = max(0.01, iVel.w);
  float t = age / life;
  if (t < 0.0 || t > 1.0) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); vCol = vec4(0.0); vT = 1.0; return; }
  float k = max(0.01, iSz.z);
  float travel = (1.0 - exp(-k * age)) / k;
  vec3 up = normalize(iP0.xyz - uPlanetCenter);
  vec3 p = iP0.xyz + iVel.xyz * travel + up * iSz.w * age * age * 0.5;
  float size = mix(iSz.x, iSz.y, 1.0 - (1.0 - t) * (1.0 - t));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  size = max(size, -mv.z * uMinPx);
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  float fadeIn = smoothstep(0.0, 0.08, t);
  float fadeOut = 1.0 - t;
  vCol = vec4(iCol.rgb, iCol.a * fadeIn * fadeOut * fadeOut);
  vT = t;
  #ifdef LIT
    float night = cNight(p);
    vCol.rgb *= mix(1.0, 0.22, night);
  #endif
}
`;

const PART_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying float vT;
void main() {
  float d = length(vUv);
  float a = 1.0 - smoothstep(0.35, 1.0, d);
  #ifdef ADDITIVE
    a = exp(-d * d * 4.0);
    gl_FragColor = vec4(vCol.rgb * vCol.a * a, 1.0);
  #else
    // soft, slightly lumpy puff
    float lump = 0.85 + 0.15 * sin(vUv.x * 7.0 + vT * 3.0) * sin(vUv.y * 6.0 - vT * 2.0);
    a *= lump;
    if (a * vCol.a < 0.004) discard;
    gl_FragColor = vec4(vCol.rgb * (0.82 + 0.18 * (1.0 - vUv.y * 0.5)), a * vCol.a);
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Particles {
  readonly mesh: Mesh;
  private geo: InstancedBufferGeometry;
  private p0: InstancedBufferAttribute;
  private vel: InstancedBufferAttribute;
  private col: InstancedBufferAttribute;
  private sz: InstancedBufferAttribute;
  private head = 0;
  private dirtyMin = Infinity;
  private dirtyMax = -1;
  readonly material: ShaderMaterial;

  constructor(parent: Object3D, readonly capacity: number, name: string, additive: boolean) {
    this.geo = new InstancedBufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (k: number) => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * k), k);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.p0 = mk(4);
    this.vel = mk(4);
    this.col = mk(4);
    this.sz = mk(4);
    // everything starts long dead
    const p = this.p0.array as Float32Array;
    for (let i = 0; i < capacity; i++) p[i * 4 + 3] = -1e6;
    this.geo.setAttribute('iP0', this.p0);
    this.geo.setAttribute('iVel', this.vel);
    this.geo.setAttribute('iCol', this.col);
    this.geo.setAttribute('iSz', this.sz);
    this.geo.instanceCount = capacity;
    this.material = new ShaderMaterial({
      name: 'life-particles-' + name,
      uniforms: { ...shared, uMinPx: { value: 0.0015 } },
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      defines: additive ? { ADDITIVE: 1 } : { LIT: 1 },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.mesh = new Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 7 : 6;
    this.mesh.name = 'life:' + name;
    parent.add(this.mesh);
  }

  /**
   * Emit one particle at p with velocity v (world units / s), life seconds, size s0 → s1, linear colour + alpha,
   * drag (1/s, exponential slow-down) and rise (radial acceleration, + floats up, − falls).
   */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, drag = 1, rise = 0): void {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    const t = shared.uTime.value;
    const P = this.p0.array as Float32Array, V = this.vel.array as Float32Array, C = this.col.array as Float32Array, S = this.sz.array as Float32Array;
    P[i * 4] = x; P[i * 4 + 1] = y; P[i * 4 + 2] = z; P[i * 4 + 3] = t;
    V[i * 4] = vx; V[i * 4 + 1] = vy; V[i * 4 + 2] = vz; V[i * 4 + 3] = life;
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a;
    S[i * 4] = s0; S[i * 4 + 1] = s1; S[i * 4 + 2] = drag; S[i * 4 + 3] = rise;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  /** Upload what was emitted this frame. */
  flush(): void {
    if (this.dirtyMax < 0) return;
    const lo = this.dirtyMin, n = this.dirtyMax - this.dirtyMin + 1;
    for (const a of [this.p0, this.vel, this.col, this.sz]) {
      a.clearUpdateRanges();
      a.addUpdateRange(lo * 4, n * 4);
      a.needsUpdate = true;
    }
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
  }

  /** Kill everything (e.g. planet change). */
  clear(): void {
    const p = this.p0.array as Float32Array;
    for (let i = 0; i < this.capacity; i++) p[i * 4 + 3] = -1e6;
    this.p0.clearUpdateRanges();
    this.p0.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.material.dispose();
  }
}
