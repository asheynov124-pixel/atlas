/**
 * OWNER: cosmos.
 * UniverseView — the six galaxies as slowly rotating particle discs floating in a faint cosmic web (filaments of
 * thousands of dim points between nodes). Locked galaxies are dimmed; tap one to inspect, pinch in to enter.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Mesh, Points, ShaderMaterial, Vector3 } from 'three';
import type { Galaxy } from '../Universe';
import { CosmosView, type BodyLabel, type LabelState, type Pickable } from './CosmosView';
import { buildGalaxyCloud, setCloudScale, type GalaxyCloud } from './galaxyPoints';
import { SkyDome } from './sky';
import { BILLBOARD_VERT, OUTPUT } from './glsl';
import { planeGeo } from './bodies';
import { Rng } from '../../core/rng';

export interface UniverseCtx {
  galaxyState(g: Galaxy): LabelState;
  galaxySub(g: Galaxy): string;
  pixelRatio: number;
  seed: number;
  lowPower: boolean;
}

const CORE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float g = exp(-r * 8.0) * 1.2 + exp(-r * 3.0) * 0.25;
  g *= 1.0 - smoothstep(0.8, 1.0, r);
  gl_FragColor = vec4(uColor * g * uIntensity, 1.0);
  ${OUTPUT}
}
`;
const WEB_VERT = /* glsl */ `
attribute vec3 color;
attribute float aSize;
uniform float uPR;
uniform float uK;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uK / max(1.0, -mv.z), 1.0, 14.0) * uPR;
  vColor = color;
}
`;
const WEB_FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = exp(-r * r * 4.0);
  gl_FragColor = vec4(vColor * a, 1.0);
  ${OUTPUT}
}
`;

interface GalRec {
  g: Galaxy;
  group: Group;
  spin: Group;
  cloud: GalaxyCloud;
  core: Mesh;
  coreMat: ShaderMaterial;
  pos: Vector3;
  state: LabelState;
}

const GAL_R = 62;

export class UniverseView extends CosmosView {
  readonly kind = 'universe' as const;
  private gals: GalRec[] = [];
  private sky: SkyDome;
  private web: Points;
  private webMat: ShaderMaterial;
  private flyFrom = new Vector3();
  private flyT = 1;
  private zero = new Vector3();

  constructor(readonly galaxies: Galaxy[], private ctx: UniverseCtx) {
    super(50, 1, 40000);
    this.scene.background = new Color(0x010106);
    this.sky = new SkyDome({ seed: ctx.seed ^ 0x9999, stars: 900, radius: 30000, pixelRatio: ctx.pixelRatio, nebula: [0x2a1f5a, 0x0f3550, 0], nebulaIntensity: 0.4, starBrightness: 0.35 });
    this.scene.add(this.sky.group);
    for (const g of galaxies) {
      const group = new Group();
      group.position.set(g.pos[0], g.pos[1], g.pos[2]);
      group.rotation.set(g.tilt, (g.pos[0] * 0.013) % 6.28, g.tilt * 0.3);
      const spin = new Group();
      group.add(spin);
      const cloud = buildGalaxyCloud(g, ctx.seed ^ g.id.charCodeAt(1) * 7919, GAL_R, ctx.lowPower ? 5000 : 8500, ctx.pixelRatio, { dust: false, brightness: 0.9, maxPx: 10 });
      spin.add(cloud.stars);
      const coreMat = new ShaderMaterial({ vertexShader: BILLBOARD_VERT, fragmentShader: CORE_FRAG, uniforms: { uColor: { value: new Color(g.colors[0]).lerp(new Color(0xffffff), 0.3) }, uIntensity: { value: 0.9 }, uScale: { value: GAL_R * (g.kind === 'elliptical' ? 1.3 : 0.7) } }, blending: AdditiveBlending, transparent: true, depthWrite: false });
      const core = new Mesh(planeGeo(), coreMat);
      core.frustumCulled = false;
      group.add(core);
      this.scene.add(group);
      this.gals.push({ g, group, spin, cloud, core, coreMat, pos: new Vector3(g.pos[0], g.pos[1], g.pos[2]), state: 'open' });
    }
    // cosmic web: filaments between random nodes (and the galaxies)
    const rng = new Rng(ctx.seed ^ 0x5eb);
    const nodes: Vector3[] = galaxies.map((g) => new Vector3(...g.pos));
    for (let i = 0; i < 40; i++) nodes.push(new Vector3(rng.range(-1400, 1400), rng.range(-700, 700), rng.range(-1400, 1400)));
    const edges: [number, number][] = [];
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => ({ j, d: a.distanceTo(b) })).filter((x) => x.j !== i).sort((x, y) => x.d - y.d).slice(0, 3);
      for (const n of near) if (!edges.some(([p, q]) => (p === n.j && q === i) || (p === i && q === n.j))) edges.push([i, n.j]);
    });
    const N = ctx.lowPower ? 9000 : 16000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const cA = new Color(0x6f5cff), cB = new Color(0x4fb8ff), cC = new Color(0xff7ad9);
    const tmp = new Color();
    const v = new Vector3();
    for (let i = 0; i < N; i++) {
      const [a, b] = edges[Math.floor(rng.next() * edges.length)];
      const t = rng.next();
      v.copy(nodes[a]).lerp(nodes[b], t);
      const spread = 18 + 40 * Math.sin(t * Math.PI);
      v.x += (rng.next() + rng.next() - 1) * spread;
      v.y += (rng.next() + rng.next() - 1) * spread;
      v.z += (rng.next() + rng.next() - 1) * spread;
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
      tmp.copy(cA).lerp(cB, rng.next());
      if (rng.chance(0.06)) tmp.copy(cC);
      const lum = rng.range(0.05, 0.22);
      col[i * 3] = tmp.r * lum;
      col[i * 3 + 1] = tmp.g * lum;
      col[i * 3 + 2] = tmp.b * lum;
      size[i] = rng.range(3, 9);
    }
    const wg = new BufferGeometry();
    wg.setAttribute('position', new BufferAttribute(pos, 3));
    wg.setAttribute('color', new BufferAttribute(col, 3));
    wg.setAttribute('aSize', new BufferAttribute(size, 1));
    this.webMat = new ShaderMaterial({ vertexShader: WEB_VERT, fragmentShader: WEB_FRAG, uniforms: { uPR: { value: ctx.pixelRatio }, uK: { value: 900 } }, blending: AdditiveBlending, transparent: true, depthWrite: false });
    this.web = new Points(wg, this.webMat);
    this.web.frustumCulled = false;
    this.scene.add(this.web);
    this.cam.minDist = 120;
    this.cam.maxDist = 2600;
    this.cam.minPitch = -1.0;
    this.cam.autoRotate = 0.01;
    this.refreshStates();
    this.focus(null, true);
  }

  refreshStates(): void {
    const labels: BodyLabel[] = [];
    this.labelPos = [];
    for (const r of this.gals) {
      r.state = this.ctx.galaxyState(r.g);
      const locked = r.state === 'locked';
      const u = (r.cloud.stars.material as ShaderMaterial).uniforms;
      u.uAlpha.value = locked ? 0.32 : 1;
      r.coreMat.uniforms.uIntensity.value = locked ? 0.3 : 0.9;
      labels.push({ id: r.g.id, name: r.g.name, sub: this.ctx.galaxySub(r.g), state: r.state, kind: 'galaxy', priority: r.state === 'current' ? 0 : 1 });
      this.labelPos.push(r.pos);
    }
    this.labels = labels;
    this.refreshLabels();
  }

  protected tick(dt: number): void {
    for (const r of this.gals) r.spin.rotation.y += dt * (r.g.kind === 'elliptical' ? 0.01 : 0.03);
    this.sky.update(this.camera, this.time);
    const k = this.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    for (const r of this.gals) setCloudScale(r.cloud, this.height, this.camera.fov, this.ctx.pixelRatio);
    this.webMat.uniforms.uK.value = k;
    const target = this.focusId ? this.gals.find((r) => r.g.id === this.focusId)?.pos ?? this.zero : this.zero;
    this.flyT = Math.min(1, this.flyT + dt / 1.1);
    const e = 1 - Math.pow(1 - this.flyT, 3);
    this.cam.goalTarget.copy(target);
    this.cam.target.copy(this.flyFrom).lerp(target, e);
  }

  focus(id: string | null, snap = false): void {
    this.focusId = id;
    this.flyFrom.copy(this.cam.target);
    this.flyT = snap ? 1 : 0;
    if (id) this.cam.set({ dist: GAL_R * 4.2, pitch: 0.55 }, false);
    else this.cam.set({ dist: 1250, pitch: 0.42, yaw: snap ? 0.3 : this.cam.goalYaw }, false);
    if (snap) {
      const r = id ? this.gals.find((x) => x.g.id === id) : null;
      this.cam.goalTarget.copy(r ? r.pos : this.zero);
      this.cam.snap();
    }
  }

  protected pickables(): Pickable[] {
    return this.gals.map((r) => ({ id: r.g.id, pos: r.pos, radius: GAL_R * 0.75 }));
  }

  protected labelWorld(i: number, out: Vector3): boolean {
    const r = this.gals[i];
    if (!r) return false;
    out.copy(r.pos);
    out.y -= GAL_R * 0.55;
    return true;
  }

  dispose(): void {
    this.exit();
    for (const r of this.gals) {
      r.cloud.dispose();
      r.coreMat.dispose();
    }
    this.web.geometry.dispose();
    this.webMat.dispose();
    this.sky.dispose();
    this.scene.clear();
  }
}
