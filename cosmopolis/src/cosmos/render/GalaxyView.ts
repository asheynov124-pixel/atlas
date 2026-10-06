/**
 * OWNER: cosmos.
 * GalaxyView — a whole galaxy as ~45–65 k star sprites (spiral arms, bars, halos, rings, clumps) with dark dust
 * lanes, a glowing bulge, scattered nebulae and its named star systems as tappable markers ("you are here" pulse,
 * colonised = gold, open = cyan, locked = dimmed). The disc turns slowly; the camera orbits above it.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Mesh, Points, ShaderMaterial, Vector3 } from 'three';
import type { Galaxy, StarSystem } from '../Universe';
import { STAR_INFO } from '../Universe';
import { CosmosView, type BodyLabel, type LabelState, type Pickable } from './CosmosView';
import { buildGalaxyCloud, setCloudScale, type GalaxyCloud } from './galaxyPoints';
import { SkyDome } from './sky';
import { BILLBOARD_VERT, NOISE, OUTPUT } from './glsl';
import { planeGeo } from './bodies';
import { Rng, hashString } from '../../core/rng';

export interface GalaxyCtx {
  systemState(s: StarSystem): LabelState;
  systemSub(s: StarSystem): string;
  pixelRatio: number;
  seed: number;
  lowPower: boolean;
}

const MARKER_VERT = /* glsl */ `
attribute vec3 color;
attribute float aSel;
attribute float aState;
uniform float uPR;
uniform float uTime;
varying vec3 vColor;
varying float vSel;
varying float vState;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vColor = color;
  vSel = aSel;
  vState = aState;
  float pulse = aState > 2.5 ? 1.0 + 0.18 * sin(uTime * 3.0) : 1.0;
  gl_PointSize = (22.0 + aSel * 14.0) * pulse * uPR;
}
`;
const MARKER_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vColor;
varying float vSel;
varying float vState;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float core = exp(-r * r * 26.0) * 1.6;
  float ring = exp(-pow((r - 0.62) * 9.0, 2.0)) * (0.55 + vSel * 0.6);
  float halo = exp(-r * 3.5) * 0.25;
  float a = core + ring + halo;
  if (vState > 2.5) a += exp(-pow((r - mod(uTime * 0.6, 1.0)) * 7.0, 2.0)) * 0.5 * (1.0 - r);
  float dim = vState < 0.5 ? 0.45 : 1.0;
  gl_FragColor = vec4(vColor * a * dim, 1.0);
  ${OUTPUT}
}
`;
const BULGE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float g = exp(-r * 7.0) * 1.3 + exp(-r * 2.6) * 0.35;
  g *= 1.0 - smoothstep(0.8, 1.0, r);
  gl_FragColor = vec4(uColor * g * uIntensity, 1.0);
  ${OUTPUT}
}
`;
const NEB_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uSeed;
uniform float uTime;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float n = fbm3(vec3(d * 2.4, uSeed + uTime * 0.008)) * 0.5 + 0.5;
  float fall = 1.0 - smoothstep(0.0, 1.0, r);
  float a = fall * fall * (0.35 + 0.65 * smoothstep(0.3, 0.85, n));
  gl_FragColor = vec4(uColor * a * 0.32, 1.0);
  ${OUTPUT}
}
`;

const ZERO = new Vector3();
const STATE_COLORS: Record<LabelState, number> = { current: 0xffffff, home: 0xffd36b, colony: 0xffd36b, open: 0x5ef0ff, locked: 0x8a96b8, neutral: 0xaab6d3 };
const STATE_CODE: Record<LabelState, number> = { locked: 0, neutral: 1, open: 1, colony: 2, home: 2, current: 3 };

export class GalaxyView extends CosmosView {
  readonly kind = 'galaxy' as const;
  private disc = new Group();
  private cloud: GalaxyCloud;
  private sky: SkyDome;
  private markers: Points;
  private markerGeo: BufferGeometry;
  private markerMat: ShaderMaterial;
  private systemPos: Vector3[] = [];
  private mats: ShaderMaterial[] = [];
  private spin: number;
  private flyFrom = new Vector3();
  private flyT = 1;

  constructor(readonly galaxy: Galaxy, private ctx: GalaxyCtx) {
    super(50, 0.5, 20000);
    const seed = hashString(galaxy.id) ^ ctx.seed;
    this.scene.background = new Color(0x010107);
    this.sky = new SkyDome({ seed: seed ^ 0x1234, stars: 1800, radius: 15000, pixelRatio: ctx.pixelRatio, nebula: [galaxy.colors[1], galaxy.colors[0], 0], nebulaIntensity: 0.35, starBrightness: 0.6 });
    this.scene.add(this.sky.group);
    this.scene.add(this.disc);
    const R = galaxy.radius;
    const count = Math.round(galaxy.stars * (ctx.lowPower ? 0.7 : 1));
    this.cloud = buildGalaxyCloud(galaxy, seed, R, count, ctx.pixelRatio, { dust: true, brightness: 0.55, maxPx: 6 });
    this.disc.add(this.cloud.stars);
    if (this.cloud.dust) this.disc.add(this.cloud.dust);
    // bulge glow
    const bulgeColor = new Color(galaxy.colors[0]).lerp(new Color(0xffffff), 0.35);
    const bm = new ShaderMaterial({ vertexShader: BILLBOARD_VERT, fragmentShader: BULGE_FRAG, uniforms: { uColor: { value: bulgeColor }, uIntensity: { value: galaxy.kind === 'ring' ? 0.45 : galaxy.kind === 'elliptical' ? 0.8 : 0.6 }, uScale: { value: R * (galaxy.kind === 'elliptical' ? 1.2 : 0.62) } }, blending: AdditiveBlending, transparent: true, depthWrite: false });
    this.mats.push(bm);
    const bulge = new Mesh(planeGeo(), bm);
    bulge.frustumCulled = false;
    bulge.renderOrder = 0;
    this.disc.add(bulge);
    // nebulae along the disc
    const rng = new Rng(seed ^ 0xbeef);
    const nebColors = [0xff5fa0, 0x5fd0ff, galaxy.colors[1], 0xb07bff];
    for (let i = 0; i < (ctx.lowPower ? 5 : 9); i++) {
      const a = rng.range(0, Math.PI * 2);
      const rn = galaxy.kind === 'ring' ? 0.68 + rng.range(-0.05, 0.05) : rng.range(0.25, 0.85);
      const nm = new ShaderMaterial({ vertexShader: BILLBOARD_VERT, fragmentShader: NEB_FRAG, uniforms: { uColor: { value: new Color(rng.pick(nebColors)) }, uSeed: { value: rng.range(0, 100) }, uTime: this.shared.uTime, uScale: { value: R * rng.range(0.12, 0.22) } }, blending: AdditiveBlending, transparent: true, depthWrite: false });
      this.mats.push(nm);
      const m = new Mesh(planeGeo(), nm);
      m.position.set(Math.cos(a) * rn * R, rng.range(-1, 1) * R * 0.01, Math.sin(a) * rn * R);
      m.frustumCulled = false;
      m.renderOrder = 3;
      this.disc.add(m);
    }
    // system markers
    const n = galaxy.systems.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const sel = new Float32Array(n);
    const st = new Float32Array(n);
    galaxy.systems.forEach((s, i) => {
      pos[i * 3] = s.pos[0];
      pos[i * 3 + 1] = s.pos[1] + 0.4;
      pos[i * 3 + 2] = s.pos[2];
      this.systemPos.push(new Vector3());
    });
    this.markerGeo = new BufferGeometry();
    this.markerGeo.setAttribute('position', new BufferAttribute(pos, 3));
    this.markerGeo.setAttribute('color', new BufferAttribute(col, 3));
    this.markerGeo.setAttribute('aSel', new BufferAttribute(sel, 1));
    this.markerGeo.setAttribute('aState', new BufferAttribute(st, 1));
    this.markerMat = new ShaderMaterial({ vertexShader: MARKER_VERT, fragmentShader: MARKER_FRAG, uniforms: { uPR: { value: ctx.pixelRatio }, uTime: this.shared.uTime }, blending: AdditiveBlending, transparent: true, depthWrite: false, depthTest: false });
    this.markers = new Points(this.markerGeo, this.markerMat);
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 10;
    this.disc.add(this.markers);
    this.disc.rotation.x = 0;
    this.spin = galaxy.kind === 'elliptical' ? 0.002 : 0.006;
    this.cam.minDist = 14;
    this.cam.maxDist = R * 4.2;
    this.cam.minPitch = 0.12;
    this.cam.maxPitch = 1.5;
    this.cam.autoRotate = 0.015;
    this.refreshStates();
    this.focus(null, true);
  }

  refreshStates(): void {
    const col = this.markerGeo.getAttribute('color') as BufferAttribute;
    const st = this.markerGeo.getAttribute('aState') as BufferAttribute;
    const labels: BodyLabel[] = [];
    this.galaxy.systems.forEach((s, i) => {
      const state = this.ctx.systemState(s);
      const star = new Color(STAR_INFO[s.star].glow).lerp(new Color(STATE_COLORS[state]), state === 'locked' ? 0.7 : 0.55);
      col.setXYZ(i, star.r, star.g, star.b);
      st.setX(i, STATE_CODE[state]);
      labels.push({ id: s.id, name: s.name, sub: this.ctx.systemSub(s), state, kind: 'system', priority: state === 'current' ? 0 : 1 });
    });
    col.needsUpdate = true;
    st.needsUpdate = true;
    this.labels = labels;
    this.labelPos = this.systemPos;
    this.refreshLabels();
  }

  override select(id: string | null): void {
    super.select(id);
    const sel = this.markerGeo.getAttribute('aSel') as BufferAttribute;
    this.galaxy.systems.forEach((s, i) => sel.setX(i, s.id === id ? 1 : 0));
    sel.needsUpdate = true;
  }

  protected tick(dt: number): void {
    this.disc.rotation.y += dt * this.spin;
    this.disc.updateMatrixWorld();
    const systems = this.galaxy.systems;
    let idx = -1;
    for (let i = 0; i < systems.length; i++) {
      const sp = systems[i].pos;
      this.systemPos[i].set(sp[0], sp[1], sp[2]).applyMatrix4(this.disc.matrixWorld);
      if (systems[i].id === this.focusId) idx = i;
    }
    this.sky.update(this.camera, this.time);
    setCloudScale(this.cloud, this.height, this.camera.fov, this.ctx.pixelRatio);
    const target = idx >= 0 ? this.systemPos[idx] : ZERO;
    this.flyT = Math.min(1, this.flyT + dt / 1.0);
    const k = 1 - Math.pow(1 - this.flyT, 3);
    this.cam.goalTarget.copy(target);
    this.cam.target.copy(this.flyFrom).lerp(target, k);
  }

  focus(id: string | null, snap = false): void {
    this.focusId = id;
    this.flyFrom.copy(this.cam.target);
    this.flyT = snap ? 1 : 0;
    const R = this.galaxy.radius;
    if (id) this.cam.set({ dist: R * 1.05, pitch: 0.82 }, false);
    else this.cam.set({ dist: R * 2.2, pitch: 0.95, yaw: snap ? 0.4 : this.cam.goalYaw }, false);
    if (snap) {
      const idx = id ? this.galaxy.systems.findIndex((s) => s.id === id) : -1;
      this.disc.updateMatrixWorld();
      if (idx >= 0) this.cam.goalTarget.set(...this.galaxy.systems[idx].pos).applyMatrix4(this.disc.matrixWorld);
      else this.cam.goalTarget.set(0, 0, 0);
      this.cam.snap();
    }
  }

  protected pickables(): Pickable[] {
    return this.galaxy.systems.map((s, i) => ({ id: s.id, pos: this.systemPos[i], radius: 1.5 }));
  }

  protected labelWorld(i: number, out: Vector3): boolean {
    const p = this.systemPos[i];
    if (!p) return false;
    out.copy(p);
    return true;
  }

  dispose(): void {
    this.exit();
    this.cloud.dispose();
    this.markerGeo.dispose();
    this.markerMat.dispose();
    for (const m of this.mats) m.dispose();
    this.sky.dispose();
    this.scene.clear();
  }
}
