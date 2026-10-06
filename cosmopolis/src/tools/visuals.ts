/**
 * OWNER: tools.
 * ToolVisuals — everything the tools draw in `view.toolLayer`, created per PlanetView and disposed with it:
 *   ghost       translucent building / prop preview (shared ghost material: mint = valid, coral = invalid),
 *               hovering on a gentle bob with a breathing glow
 *   doomed      red ghosts over buildings a bulldoze would remove (pool)
 *   ribbon      glowing chevron ribbon along road / god paths (preallocated buffers, red where blocked)
 *   reticle     pulsing targeting ring with rotating ticks and a sky beam (god powers, road anchors, orbit sites)
 *   pulses      expanding rings for placement / demolition feedback (pool)
 *   orbitRing   dashed preview of an orbit about to be launched
 *   launches    rocket flares rising from the surface into orbit (orbital tool), then a callback
 * Tile highlights go through `view.surface.overlay.setHighlight` with change detection (no redundant uploads).
 * Nothing allocates per frame; geometries come from the catalog cache (never disposed here) or are owned.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  type MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { getGeometry, type GeoKey } from '../content/catalog';
import { createGhostMaterial } from '../render/materials';
import type { PlanetView } from '../render/PlanetView';

export const TOOL_COLORS = {
  ok: 0x5ef2a0,
  bad: 0xff5a6e,
  accent: 0x5ef0ff,
  violet: 0xa77bff,
  warn: 0xffc65c,
  white: 0xeef4ff,
};

const _m = new Matrix4();
const _t = new Matrix4();
const _s = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();
const _n = new Vector3();
const Z = new Vector3(0, 0, 1);

// ─────────────────────────────────────────────── ghost

class Ghost {
  readonly mesh: Mesh;
  readonly mat: MeshStandardMaterial;
  private empty = new BufferGeometry();
  private key = '';
  private base = new Matrix4();
  private valid = true;
  private scale = 1;
  visible = false;
  private t = Math.random() * 10;

  constructor(parent: Group, private doomed = false) {
    this.mat = createGhostMaterial(doomed ? TOOL_COLORS.bad : TOOL_COLORS.ok, doomed ? 0.42 : 0.55);
    this.mesh = new Mesh(this.empty, this.mat);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    parent.add(this.mesh);
    this.setValid(true, true);
  }

  private setValid(v: boolean, force = false): void {
    if (v === this.valid && !force) return;
    this.valid = v;
    const c = this.doomed ? TOOL_COLORS.bad : v ? TOOL_COLORS.ok : TOOL_COLORS.bad;
    this.mat.emissive.setHex(c);
    this.mat.color.setHex(this.doomed ? 0xff9aa6 : v ? 0xd8fff0 : 0xffb3bc);
  }

  show(defId: string, key: GeoKey, matrix: Matrix4, valid: boolean, scale = 1): boolean {
    const k = `${defId}|${key.variant ?? 0}|${key.level ?? 1}|${key.style ?? '-'}`;
    if (k !== this.key) {
      const geo = getGeometry(defId, { ...key, lod: 0 });
      if (!geo) {
        this.hide();
        return false;
      }
      this.mesh.geometry = geo;
      this.key = k;
    }
    this.base.copy(matrix);
    this.scale = scale;
    this.setValid(valid);
    this.visible = true;
    this.mesh.visible = true;
    this.place();
    return true;
  }

  hide(): void {
    this.visible = false;
    this.mesh.visible = false;
  }

  private place(): void {
    const bob = this.doomed ? 0.02 : 0.07 + Math.sin(this.t * 2.6) * 0.035;
    _t.makeTranslation(0, bob, 0);
    this.mesh.matrix.copy(this.base).multiply(_t);
    if (this.scale !== 1) this.mesh.matrix.multiply(_s.makeScale(this.scale, this.scale, this.scale));
    this.mesh.matrixWorldNeedsUpdate = true;
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.t += dt;
    this.place();
    const breathe = 0.5 + 0.5 * Math.sin(this.t * (this.valid ? 3.2 : 7));
    this.mat.emissiveIntensity = (this.doomed ? 0.7 : 0.42) + breathe * 0.3;
    this.mat.opacity = (this.doomed ? 0.38 : 0.5) + breathe * 0.12;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mat.dispose();
    this.empty.dispose();
  }
}

// ─────────────────────────────────────────────── ribbon

const RIBBON_VERT = /* glsl */ `
attribute float aU;
attribute float aSide;
attribute float aBad;
varying float vU;
varying float vSide;
varying float vBad;
void main() {
  vU = aU; vSide = aSide; vBad = aBad;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RIBBON_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uBad;
uniform float uOpacity;
varying float vU;
varying float vSide;
varying float vBad;
void main() {
  float s = abs(vSide);
  float edge = 1.0 - smoothstep(0.62, 1.0, s);
  float rim = smoothstep(0.55, 0.8, s) * (1.0 - smoothstep(0.85, 1.0, s));
  float c = fract(vU * 0.9 - s * 0.32 - uTime * 1.25);
  float chev = smoothstep(0.0, 0.06, c) * (1.0 - smoothstep(0.26, 0.36, c));
  vec3 col = mix(uColor, uBad, step(0.5, vBad));
  float a = edge * (0.22 + 0.55 * chev) + rim * 0.55;
  gl_FragColor = vec4(col * (1.15 + chev * 0.8), clamp(a, 0.0, 1.0) * uOpacity);
}`;

export class Ribbon {
  static readonly MAX = 512;
  readonly mesh: Mesh;
  readonly mat: ShaderMaterial;
  private geo = new BufferGeometry();
  private pos = new Float32Array(Ribbon.MAX * 2 * 3);
  private u = new Float32Array(Ribbon.MAX * 2);
  private side = new Float32Array(Ribbon.MAX * 2);
  private bad = new Float32Array(Ribbon.MAX * 2);
  private posAttr: BufferAttribute;
  private uAttr: BufferAttribute;
  private badAttr: BufferAttribute;

  constructor(parent: Group) {
    const idx = new Uint32Array((Ribbon.MAX - 1) * 6);
    for (let i = 0; i < Ribbon.MAX - 1; i++) {
      const a = i * 2, o = i * 6;
      idx[o] = a;
      idx[o + 1] = a + 1;
      idx[o + 2] = a + 2;
      idx[o + 3] = a + 1;
      idx[o + 4] = a + 3;
      idx[o + 5] = a + 2;
    }
    for (let i = 0; i < Ribbon.MAX; i++) {
      this.side[i * 2] = -1;
      this.side[i * 2 + 1] = 1;
    }
    this.posAttr = new BufferAttribute(this.pos, 3);
    this.uAttr = new BufferAttribute(this.u, 1);
    this.badAttr = new BufferAttribute(this.bad, 1);
    this.geo.setIndex(new BufferAttribute(idx, 1));
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aU', this.uAttr);
    this.geo.setAttribute('aSide', new BufferAttribute(this.side, 1));
    this.geo.setAttribute('aBad', this.badAttr);
    this.geo.setDrawRange(0, 0);
    this.mat = new ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      uniforms: { uTime: { value: 0 }, uColor: { value: new Color(TOOL_COLORS.accent) }, uBad: { value: new Color(TOOL_COLORS.bad) }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  /**
   * Points as a flat xyz array (world, already lifted above the surface), per-point blocked flags,
   * ribbon width (world units) and colour.
   */
  set(points: ArrayLike<number>, count: number, bad: ArrayLike<number> | null, width: number, color: number): void {
    const n = Math.min(count, Ribbon.MAX);
    if (n < 2) {
      this.hide();
      return;
    }
    const P = points;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      _v.set(P[i1 * 3] - P[i0 * 3], P[i1 * 3 + 1] - P[i0 * 3 + 1], P[i1 * 3 + 2] - P[i0 * 3 + 2]);
      _n.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).normalize();
      _w.crossVectors(_v, _n).normalize().multiplyScalar(width * 0.5);
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const o = i * 6;
      this.pos[o] = x - _w.x;
      this.pos[o + 1] = y - _w.y;
      this.pos[o + 2] = z - _w.z;
      this.pos[o + 3] = x + _w.x;
      this.pos[o + 4] = y + _w.y;
      this.pos[o + 5] = z + _w.z;
      if (i > 0) acc += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2], P[i * 3 + 2] - P[i * 3 - 1]);
      this.u[i * 2] = this.u[i * 2 + 1] = acc;
      const b = bad ? bad[i] : 0;
      this.bad[i * 2] = this.bad[i * 2 + 1] = b;
    }
    this.posAttr.needsUpdate = true;
    this.uAttr.needsUpdate = true;
    this.badAttr.needsUpdate = true;
    this.posAttr.clearUpdateRanges();
    this.posAttr.addUpdateRange(0, n * 6);
    this.uAttr.clearUpdateRanges();
    this.uAttr.addUpdateRange(0, n * 2);
    this.badAttr.clearUpdateRanges();
    this.badAttr.addUpdateRange(0, n * 2);
    this.geo.setDrawRange(0, (n - 1) * 6);
    (this.mat.uniforms.uColor.value as Color).setHex(color);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
    this.geo.setDrawRange(0, 0);
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ─────────────────────────────────────────────── reticle & rings

const RING_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RETICLE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vP;
void main() {
  float r = length(vP);
  float a = atan(vP.y, vP.x);
  float ticks = step(0.55, fract(a * 12.0 / 6.2831853 + uTime * 0.35));
  float outer = smoothstep(0.86, 0.9, r) * (1.0 - smoothstep(0.97, 1.0, r));
  float inner = smoothstep(0.72, 0.75, r) * (1.0 - smoothstep(0.8, 0.83, r)) * ticks;
  float pulse = 0.65 + 0.35 * sin(uTime * 5.0);
  float alpha = (outer * 0.95 + inner * 0.8) * pulse * uAlpha;
  gl_FragColor = vec4(uColor * 1.6, alpha);
}`;
const PULSE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vP;
void main() {
  float r = length(vP);
  float band = smoothstep(0.78, 0.9, r) * (1.0 - smoothstep(0.93, 1.0, r));
  gl_FragColor = vec4(uColor * 1.5, band * uAlpha);
}`;
const ORBIT_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vP;
void main() {
  float a = atan(vP.y, vP.x);
  float dash = step(0.45, fract(a * 48.0 / 6.2831853 - uTime * 0.6));
  gl_FragColor = vec4(uColor * 1.4, (0.25 + 0.6 * dash) * uAlpha);
}`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv2;
void main() {
  float fade = pow(1.0 - vUv2.y, 1.6);
  gl_FragColor = vec4(uColor * 1.4, fade * uAlpha * 0.55);
}`;
const BEAM_VERT = /* glsl */ `
varying vec2 vUv2;
void main() {
  vUv2 = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

function ringMaterial(frag: string, color: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: frag,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(color) }, uAlpha: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

/** Orient an object so its local +Z points along `normal` at `pos`, scaled uniformly. */
function orient(obj: Mesh | Group, pos: Vector3, normal: Vector3, scale: number): void {
  _q.setFromUnitVectors(Z, _n.copy(normal).normalize());
  obj.position.copy(pos);
  obj.quaternion.copy(_q);
  obj.scale.setScalar(scale);
  obj.updateMatrix();
}

export class Reticle {
  readonly group = new Group();
  private ring: Mesh;
  private beam: Mesh;
  private ringMat: ShaderMaterial;
  private beamMat: ShaderMaterial;
  private alpha = 0;
  private want = 0;
  private baseScale = 1;
  private t = 0;

  constructor(parent: Group, ringGeo: RingGeometry) {
    this.ringMat = ringMaterial(RETICLE_FRAG, TOOL_COLORS.violet);
    this.ring = new Mesh(ringGeo, this.ringMat);
    this.ring.frustumCulled = false;
    this.ring.renderOrder = 8;
    const beamGeo = new CylinderGeometry(0.035, 0.12, 1, 10, 1, true);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, 0.5);
    this.beamMat = new ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { uColor: { value: new Color(TOOL_COLORS.violet) }, uAlpha: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    this.beam = new Mesh(beamGeo, this.beamMat);
    this.beam.frustumCulled = false;
    this.group.add(this.ring, this.beam);
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
    parent.add(this.group);
  }

  show(pos: Vector3, normal: Vector3, radius: number, color: number, beam = true): void {
    orient(this.group, _v.copy(normal).multiplyScalar(0.06).add(pos), normal, 1);
    this.baseScale = radius;
    (this.ringMat.uniforms.uColor.value as Color).setHex(color);
    (this.beamMat.uniforms.uColor.value as Color).setHex(color);
    this.beam.visible = beam;
    this.beam.scale.set(radius * 0.6, radius * 0.6, Math.max(6, radius * 9));
    this.want = 1;
    this.group.visible = true;
  }

  hide(): void {
    this.want = 0;
  }

  update(dt: number): void {
    this.t += dt;
    this.alpha += (this.want - this.alpha) * (1 - Math.exp(-dt * 14));
    if (this.alpha < 0.01 && this.want === 0) {
      this.group.visible = false;
      return;
    }
    const s = this.baseScale * (1 + 0.06 * Math.sin(this.t * 5));
    this.ring.scale.setScalar(s);
    this.ring.rotation.z = this.t * 0.6;
    this.ring.updateMatrix();
    this.ringMat.uniforms.uTime.value = this.t;
    this.ringMat.uniforms.uAlpha.value = this.alpha;
    this.beamMat.uniforms.uAlpha.value = this.alpha * (0.75 + 0.25 * Math.sin(this.t * 7));
  }

  dispose(): void {
    this.group.removeFromParent();
    this.ringMat.dispose();
    this.beamMat.dispose();
    this.beam.geometry.dispose();
  }
}

interface Pulse {
  mesh: Mesh;
  mat: ShaderMaterial;
  t: number;
  dur: number;
  r0: number;
  r1: number;
}

interface Launch {
  head: Mesh;
  p0: Vector3;
  p1: Vector3;
  p2: Vector3;
  t: number;
  dur: number;
  done: () => void;
  puff: number;
}

// ─────────────────────────────────────────────── the layer

export class ToolVisuals {
  readonly group = new Group();
  readonly ghost: Ghost;
  readonly ribbon: Ribbon;
  readonly reticle: Reticle;
  readonly anchor: Reticle;
  private doomed: Ghost[] = [];
  private doomedUsed = 0;
  private ringGeo = new RingGeometry(0.0, 1, 64, 1);
  private pulses: Pulse[] = [];
  private orbitRing: Mesh;
  private orbitMat: ShaderMaterial;
  private orbitGeo = new RingGeometry(0.994, 1, 256, 1);
  private launches: Launch[] = [];
  private headGeo = new SphereGeometry(1, 14, 10);
  private headMat: ShaderMaterial;
  private hl = new Map<string, { tiles: number[]; color: number; opacity: number }>();
  private time = 0;

  constructor(readonly view: PlanetView) {
    this.group.name = 'tool-visuals';
    view.toolLayer.add(this.group);
    this.ghost = new Ghost(this.group);
    this.ribbon = new Ribbon(this.group);
    this.reticle = new Reticle(this.group, this.ringGeo);
    this.anchor = new Reticle(this.group, this.ringGeo);
    this.orbitMat = ringMaterial(ORBIT_FRAG, TOOL_COLORS.accent);
    this.orbitRing = new Mesh(this.orbitGeo, this.orbitMat);
    this.orbitRing.frustumCulled = false;
    this.orbitRing.matrixAutoUpdate = false;
    this.orbitRing.visible = false;
    this.group.add(this.orbitRing);
    this.headMat = new ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: /* glsl */ `uniform vec3 uColor; varying vec2 vP; void main(){ float r = length(vP); gl_FragColor = vec4(uColor * 2.2, 1.0 - smoothstep(0.2, 1.0, r)); }`,
      uniforms: { uColor: { value: new Color(0xfff1c2) } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }

  // ── highlights (overlay channels, change-detected)
  highlight(channel: string, tiles: number[] | null, color = TOOL_COLORS.ok, opacity = 0.5): void {
    const prev = this.hl.get(channel);
    if (!tiles || !tiles.length) {
      if (!prev) return;
      this.hl.delete(channel);
      this.view.surface.overlay.setHighlight(channel, null);
      return;
    }
    if (prev && prev.color === color && prev.opacity === opacity && prev.tiles.length === tiles.length) {
      let same = true;
      for (let i = 0; i < tiles.length; i++)
        if (prev.tiles[i] !== tiles[i]) {
          same = false;
          break;
        }
      if (same) return;
    }
    this.hl.set(channel, { tiles: tiles.slice(), color, opacity });
    this.view.surface.overlay.setHighlight(channel, tiles, color, opacity);
  }

  clearHighlights(): void {
    for (const ch of this.hl.keys()) this.view.surface.overlay.setHighlight(ch, null);
    this.hl.clear();
  }

  // ── doomed buildings (bulldoze preview)
  showDoomed(ids: number[]): void {
    let n = 0;
    for (const id of ids) {
      if (n >= 32) break;
      const b = this.view.planet.buildings.get(id);
      if (!b) continue;
      const m = this.view.buildings.getMatrix(id, _m);
      if (!m) continue;
      let g = this.doomed[n];
      if (!g) g = this.doomed[n] = new Ghost(this.group, true);
      if (g.show(b.defId, { variant: b.variant, level: b.level, style: b.style }, m, false, 1.045)) n++;
    }
    for (let i = n; i < this.doomedUsed; i++) this.doomed[i].hide();
    this.doomedUsed = n;
  }

  hideDoomed(): void {
    for (let i = 0; i < this.doomedUsed; i++) this.doomed[i].hide();
    this.doomedUsed = 0;
  }

  // ── pulses
  pulse(pos: Vector3, normal: Vector3, radius: number, color: number, dur = 0.65): void {
    let p = this.pulses.find((x) => x.t >= x.dur);
    if (!p) {
      if (this.pulses.length >= 12) p = this.pulses[0];
      else {
        const mat = ringMaterial(PULSE_FRAG, color);
        const mesh = new Mesh(this.ringGeo, mat);
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        mesh.renderOrder = 8;
        this.group.add(mesh);
        p = { mesh, mat, t: 0, dur, r0: 0, r1: 0 };
        this.pulses.push(p);
      }
    }
    p.t = 0;
    p.dur = dur;
    p.r0 = radius * 0.25;
    p.r1 = radius;
    (p.mat.uniforms.uColor.value as Color).setHex(color);
    orient(p.mesh, _v.copy(normal).multiplyScalar(0.08).add(pos), normal, p.r0);
    p.mesh.visible = true;
  }

  // ── orbit preview
  showOrbit(radius: number, planeNormal: Vector3, color = TOOL_COLORS.accent): void {
    _q.setFromUnitVectors(Z, _n.copy(planeNormal).normalize());
    this.orbitRing.matrix.compose(_v.set(0, 0, 0), _q, _w.set(radius, radius, radius));
    this.orbitRing.matrixWorldNeedsUpdate = true;
    (this.orbitMat.uniforms.uColor.value as Color).setHex(color);
    this.orbitRing.visible = true;
  }

  hideOrbit(): void {
    this.orbitRing.visible = false;
  }

  // ── launches
  launch(from: Vector3, up: Vector3, to: Vector3, done: () => void, dur = 1.7): void {
    const head = new Mesh(this.headGeo, this.headMat);
    head.frustumCulled = false;
    head.renderOrder = 9;
    head.matrixAutoUpdate = false;
    this.group.add(head);
    const p0 = from.clone().addScaledVector(up, 0.2);
    const p2 = to.clone();
    const p1 = p0.clone().addScaledVector(up, (p2.length() - p0.length()) * 0.95);
    this.launches.push({ head, p0, p1, p2, t: 0, dur, done, puff: 0 });
    this.pulse(from, up, 1.6, 0xffd9a0, 0.8);
  }

  hideAll(): void {
    this.ghost.hide();
    this.hideDoomed();
    this.ribbon.hide();
    this.reticle.hide();
    this.anchor.hide();
    this.hideOrbit();
    this.clearHighlights();
  }

  update(dt: number): void {
    this.time += dt;
    this.ghost.update(dt);
    for (let i = 0; i < this.doomedUsed; i++) this.doomed[i].update(dt);
    this.ribbon.update(this.time);
    this.reticle.update(dt);
    this.anchor.update(dt);
    if (this.orbitRing.visible) this.orbitMat.uniforms.uTime.value = this.time;
    for (const p of this.pulses) {
      if (p.t >= p.dur) {
        p.mesh.visible = false;
        continue;
      }
      p.t += dt;
      const s = Math.min(1, p.t / p.dur);
      const e = 1 - Math.pow(1 - s, 3);
      const r = p.r0 + (p.r1 - p.r0) * e;
      // rescale in place (matrix columns are unit * scale)
      const el = p.mesh.matrix.elements;
      const k = r / Math.max(1e-6, Math.hypot(el[0], el[1], el[2]));
      for (let c = 0; c < 3; c++) for (let j = 0; j < 3; j++) el[c * 4 + j] *= k;
      p.mesh.matrixWorldNeedsUpdate = true;
      p.mat.uniforms.uAlpha.value = (1 - s) * 0.9;
    }
    for (let i = this.launches.length - 1; i >= 0; i--) {
      const L = this.launches[i];
      L.t += dt;
      const s = Math.min(1, L.t / L.dur);
      const e = s * s * (1.4 - 0.4 * s);
      const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
      _v.set(L.p0.x * a + L.p1.x * b + L.p2.x * c, L.p0.y * a + L.p1.y * b + L.p2.y * c, L.p0.z * a + L.p1.z * b + L.p2.z * c);
      // stretch along the velocity
      const da = -2 * (1 - e), db = 2 - 4 * e, dc = 2 * e;
      _w.set(L.p0.x * da + L.p1.x * db + L.p2.x * dc, L.p0.y * da + L.p1.y * db + L.p2.y * dc, L.p0.z * da + L.p1.z * db + L.p2.z * dc).normalize();
      _q.setFromUnitVectors(Z, _w);
      const size = 0.28 + 0.25 * Math.sin(s * Math.PI);
      L.head.matrix.compose(_v, _q, _n.set(size, size, size * (2.4 + 3 * Math.sin(s * Math.PI))));
      L.head.matrixWorldNeedsUpdate = true;
      L.puff += dt;
      if (s < 0.5 && L.puff > 0.12) {
        L.puff = 0;
        this.pulse(_v, _n.copy(_v).normalize(), 0.9 + s * 2, 0xffb36b, 0.5);
      }
      if (s >= 1) {
        this.launches.splice(i, 1);
        L.head.removeFromParent();
        this.pulse(L.p2, _n.copy(L.p2).normalize(), 2.4, TOOL_COLORS.accent, 0.9);
        try {
          L.done();
        } catch (err) {
          console.error('[tools] launch callback failed', err);
        }
      }
    }
  }

  dispose(): void {
    this.clearHighlights();
    this.ghost.dispose();
    for (const g of this.doomed) g.dispose();
    this.ribbon.dispose();
    this.reticle.dispose();
    this.anchor.dispose();
    for (const p of this.pulses) p.mat.dispose();
    for (const L of this.launches) L.head.removeFromParent();
    this.launches.length = 0;
    this.ringGeo.dispose();
    this.orbitGeo.dispose();
    this.orbitMat.dispose();
    this.headGeo.dispose();
    this.headMat.dispose();
    this.group.removeFromParent();
  }
}
