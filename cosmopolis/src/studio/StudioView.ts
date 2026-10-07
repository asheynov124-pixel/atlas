/**
 * OWNER: studio.
 * StudioView — the Architect Studio stage (implements render/View, kind 'studio').
 *
 *   • A floating pedestal in space: dark metal dais with a glowing rim, the design's hex lot (1 / 7 / 19 tiles) drawn
 *     as luminous outlines plus a dim ring of neighbouring tiles, and a chevron marking the front (the road side).
 *   • Sky: one analytic shader — space gradient, nebula wisps, twinkling stars, a sun glow and the player's own
 *     planet hanging below the platform (day side / night side with city lights, atmosphere rim).
 *   • Soft key / rim / hemisphere lights + a room environment for reflections; real shadows when the renderer
 *     already has shadow maps on (High+), a contact-shadow blob always.
 *   • Day ↔ night: eases lights, sky, and the shared building-shader night factor (lit windows, neon) together.
 *   • Turntable camera: rotate, pinch / wheel zoom, vertical pan, double-tap reset, idle auto-spin (off with reduce
 *     motion), auto-framing that follows the design's size, and a lens shift that centres the model in the visible
 *     "stage" rectangle (the part of the screen not covered by the editor panels).
 *   • The model is built with the very same builder as the city's mesh factory; tap-picking maps triangles → parts,
 *     and the selected part pulses with the shared Highlight state.
 * Shared shader uniforms (sun, planet centre, night lights, apocalypse) are saved on enter() and restored on exit().
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Mat, MeshBuilder } from '../content/kit';
import { PLANET_TYPES } from '../content/planetTypes';
import { settings } from '../core/settings';
import { game } from '../game/instance';
import { getBuildingMaterial, shared } from '../render/materials';
import type { View } from '../render/View';
import { buildDesign, type Layout } from './builder';
import { footprintRadius, type DesignSpec, type Footprint } from './model';

const _v = new Vector3();
const _ndc = new Vector2();
const DAY_SUN = new Vector3(0.52, 0.78, 0.36).normalize();
const NIGHT_SUN = new Vector3(0.52, -0.55, 0.36).normalize();

export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww;
}
`;

const SKY_FRAG = /* glsl */ `
uniform float uNight;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uPlanetDir;
uniform vec3 uOcean;
uniform vec3 uLand;
uniform vec3 uAtmo;
uniform float uHasOcean;
varying vec3 vDir;

float hash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float noise( vec3 x ) {
  vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( hash( i ), hash( i + vec3( 1, 0, 0 ) ), f.x ), mix( hash( i + vec3( 0, 1, 0 ) ), hash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( hash( i + vec3( 0, 0, 1 ) ), hash( i + vec3( 1, 0, 1 ) ), f.x ), mix( hash( i + vec3( 0, 1, 1 ) ), hash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float fbm( vec3 p ) { float a = 0.5, s = 0.0; for ( int i = 0; i < 4; i++ ) { s += a * noise( p ); p *= 2.07; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize( vDir );
  float n = uNight;
  // space gradient: a luminous blue band low in the sky by day, deep indigo by night
  vec3 top = mix( vec3( 0.035, 0.06, 0.16 ), vec3( 0.006, 0.008, 0.028 ), n );
  vec3 hor = mix( vec3( 0.26, 0.36, 0.6 ), vec3( 0.04, 0.05, 0.12 ), n );
  vec3 col = mix( hor, top, smoothstep( -0.25, 0.65, d.y ) );
  // nebula wisps
  float w1 = fbm( d * 2.2 + vec3( 0.0, 0.0, uTime * 0.004 ) );
  float w2 = fbm( d * 3.7 + 7.0 );
  col += vec3( 0.32, 0.12, 0.5 ) * pow( w1, 3.0 ) * mix( 0.35, 0.9, n );
  col += vec3( 0.05, 0.28, 0.42 ) * pow( w2, 4.0 ) * mix( 0.3, 0.8, n );
  // stars (two layers, twinkle)
  for ( int k = 0; k < 2; k++ ) {
    float sc = k == 0 ? 160.0 : 330.0;
    vec3 sp = d * sc;
    vec3 cell = floor( sp );
    vec3 f = fract( sp ) - 0.5;
    float r = hash( cell + float( k ) * 17.0 );
    float s = step( k == 0 ? 0.988 : 0.993, r ) * smoothstep( 0.3, 0.0, length( f ) );
    float tw = 0.65 + 0.35 * sin( uTime * ( 1.5 + r * 3.0 ) + r * 80.0 );
    vec3 tint = mix( vec3( 1.0, 0.85, 0.7 ), vec3( 0.7, 0.85, 1.0 ), fract( r * 13.0 ) );
    col += tint * s * tw * mix( 0.45, 1.3, n );
  }
  // sun disc + glow (daytime)
  float sd = max( 0.0, dot( d, uSun ) );
  col += vec3( 1.0, 0.86, 0.62 ) * ( pow( sd, 900.0 ) * 6.0 + pow( sd, 24.0 ) * 0.35 + pow( sd, 4.0 ) * 0.08 ) * ( 1.0 - n );

  // the player's planet, hanging below the platform
  vec3 C = uPlanetDir * 9.0;
  float Rp = 6.2;
  float b = dot( d, C );
  float disc = b * b - ( dot( C, C ) - Rp * Rp );
  vec3 L = normalize( mix( uSun, vec3( -uSun.x, 0.15, -uSun.z ), n * 0.85 ) );
  if ( disc > 0.0 && b > 0.0 ) {
    float t = b - sqrt( disc );
    vec3 P = d * t;
    vec3 N = normalize( P - C );
    float h = fbm( N * 3.2 + 11.0 ) + 0.35 * fbm( N * 9.0 );
    float sea = uHasOcean > 0.5 ? smoothstep( 0.66, 0.7, h ) : 1.0;
    vec3 surf = mix( uOcean, uLand * ( 0.75 + 0.5 * fbm( N * 14.0 ) ), sea );
    surf = mix( surf, vec3( 0.95 ), smoothstep( 0.82, 0.95, abs( N.y ) ) );
    float cl = smoothstep( 0.55, 0.85, fbm( N * 5.0 + vec3( uTime * 0.01, 0.0, 0.0 ) ) );
    surf = mix( surf, vec3( 0.96 ), cl * 0.7 );
    float lit = max( 0.0, dot( N, L ) );
    vec3 pc = surf * ( 0.04 + lit * 1.1 );
    // city lights on the night side
    float dark = smoothstep( 0.15, -0.05, dot( N, L ) );
    float city = smoothstep( 0.72, 0.9, fbm( N * 26.0 ) ) * sea * ( 1.0 - cl );
    pc += vec3( 1.0, 0.72, 0.38 ) * city * dark * 1.6;
    // atmosphere rim
    float fr = pow( 1.0 - max( 0.0, dot( N, -d ) ), 3.0 );
    pc += uAtmo * fr * ( 0.25 + 0.9 * max( 0.0, dot( N, L ) + 0.3 ) );
    col = pc;
  } else {
    float miss = sqrt( max( 0.0, dot( C, C ) - b * b ) ) - Rp;
    float halo = exp( -max( 0.0, miss ) * 7.0 ) * step( 0.0, b );
    col += uAtmo * halo * ( 0.35 + 0.65 * ( 1.0 - n ) ) * 0.8;
  }
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Axial hex coordinates within `radius` (0 → 1 tile, 1 → 7, 2 → 19). */
function hexes(radius: number, exactRing = false): [number, number][] {
  const out: [number, number][] = [];
  for (let q = -radius; q <= radius; q++)
    for (let r = -radius; r <= radius; r++) {
      const d = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
      if (exactRing ? d === radius : d <= radius) out.push([q, r]);
    }
  return out;
}

/** Axial → object-space centre (neighbour 0 is +Z, TILE_SIZE 2 apart). */
function hexCenter(q: number, r: number): [number, number] {
  return [r * Math.sqrt(3), q * 2 + r];
}

function ringOf(fp: Footprint): number {
  return fp === 1 ? 0 : fp === 7 ? 1 : 2;
}

/** Thin ribbon quads along every edge of each hex (in XZ at height y). */
function hexOutlineGeometry(centres: [number, number][], y: number, width: number, inset = 0.03): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const R = 2 / Math.sqrt(3) - inset;
  for (const [cx, cz] of centres) {
    for (let k = 0; k < 6; k++) {
      const a0 = Math.PI / 6 + (k * Math.PI) / 3, a1 = Math.PI / 6 + ((k + 1) * Math.PI) / 3;
      const x0 = cx + Math.sin(a0) * R, z0 = cz + Math.cos(a0) * R;
      const x1 = cx + Math.sin(a1) * R, z1 = cz + Math.cos(a1) * R;
      // inward offset for the inner edge of the ribbon
      const ix0 = cx + Math.sin(a0) * (R - width), iz0 = cz + Math.cos(a0) * (R - width);
      const ix1 = cx + Math.sin(a1) * (R - width), iz1 = cz + Math.cos(a1) * (R - width);
      const base = pos.length / 3;
      pos.push(x0, y, z0, x1, y, z1, ix1, y, iz1, ix0, y, iz0);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

function hexFillGeometry(centres: [number, number][], y: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const R = 2 / Math.sqrt(3) - 0.06;
  for (const [cx, cz] of centres) {
    const base = pos.length / 3;
    pos.push(cx, y, cz);
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      pos.push(cx + Math.sin(a) * R, y, cz + Math.cos(a) * R);
    }
    for (let k = 0; k < 6; k++) idx.push(base, base + 1 + ((k + 1) % 6), base + 1 + k);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

function blobTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  return t;
}

const smooth = (a: number, b: number, k: number) => a + (b - a) * k;

export class StudioView implements View {
  readonly kind = 'studio' as const;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(36, 1, 0.05, 4000);

  private sky: Mesh<SphereGeometry, ShaderMaterial>;
  private skyMat: ShaderMaterial;
  private pedestal: Mesh;
  private lot = new Group();
  private lotMats: MeshBasicMaterial[] = [];
  private blob: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private model: Mesh;
  private hemi = new HemisphereLight(0xbcd6ff, 0x3a3040, 1.1);
  private key = new DirectionalLight(0xfff1dc, 2.6);
  private rim = new DirectionalLight(0x8fb8ff, 1.2);
  private env: Texture | null = null;
  private raycaster = new Raycaster();

  // camera
  private yaw = 0.7;
  private pitch = 0.3;
  private zoom = 1;
  private panY = 0;
  private gYaw = 0.7;
  private gPitch = 0.3;
  private gZoom = 1;
  private gPanY = 0;
  private dist = 8;
  private targetY = 1;
  private fitDist = 8;
  private fitS = 8;
  private fitY = 1;
  private idle = 0;
  private stage: StageRect = { x: 0, y: 0, w: 1, h: 1 };
  private viewKey = '';

  // design
  private pending: DesignSpec | null = null;
  private footprint: Footprint | 0 = 0;
  private ranges: number[] = [];
  private vranges: number[] = [];
  private selected = -1;
  private layout: Layout | null = null;
  private nightT = 0;
  private nightGoal = 0;
  private time = 0;
  private hasShadows = false;
  /** triangles of the current model (LOD0) */
  triangles = 0;
  height = 0;

  // saved shared uniforms
  private saved = { sun: new Vector3(), center: new Vector3(), night: 1, apoc: 0 };

  constructor() {
    this.scene.background = new Color(0x02030a);
    this.camera.position.set(6, 4, 6);
    // sky
    this.skyMat = new ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uNight: { value: 0 },
        uTime: { value: 0 },
        uSun: { value: DAY_SUN.clone() },
        uPlanetDir: { value: new Vector3(0.35, -0.72, -0.6).normalize() },
        uOcean: { value: new Color(0x1d6fb8) },
        uLand: { value: new Color(0x5f9e4a) },
        uAtmo: { value: new Color(0x6fb6ff) },
        uHasOcean: { value: 1 },
      },
    });
    this.sky = new Mesh(new SphereGeometry(1000, 48, 24), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    // lights
    this.key.position.copy(DAY_SUN).multiplyScalar(30);
    this.rim.position.set(-18, 10, -22);
    this.scene.add(this.hemi, this.key, this.key.target, this.rim);
    // pedestal + lot
    this.pedestal = new Mesh(new BufferGeometry(), getBuildingMaterial());
    this.pedestal.receiveShadow = true;
    this.scene.add(this.pedestal, this.lot);
    // contact shadow
    this.blob = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.6, color: 0x000000 }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.004;
    this.blob.renderOrder = 1;
    this.scene.add(this.blob);
    // model
    this.model = new Mesh(new BufferGeometry(), getBuildingMaterial());
    this.model.castShadow = true;
    this.model.receiveShadow = true;
    this.scene.add(this.model);
  }

  // ───────────────────────────── public API (UI / Studio)

  /** Replace the design (rebuilt on the next frame). */
  setDesign(spec: DesignSpec): void {
    this.pending = spec;
  }

  /** Rebuild a pending design right now (instead of on the next frame). */
  flush(): void {
    if (!this.pending) return;
    const spec = this.pending;
    this.pending = null;
    this.rebuild(spec);
  }

  setSelected(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    this.applyHighlight();
  }

  setNight(on: boolean, instant = false): void {
    this.nightGoal = on ? 1 : 0;
    if (instant) this.nightT = this.nightGoal;
  }

  get night(): boolean {
    return this.nightGoal > 0.5;
  }

  /** The visible stage rectangle (CSS px, viewport coordinates). */
  setStage(r: StageRect): void {
    if (r.w < 4 || r.h < 4) return;
    this.stage = { ...r };
  }

  rotate(dx: number, dy: number): void {
    const h = Math.max(300, this.stage.h);
    const k = 3.4 / h;
    this.gYaw -= dx * k * (settings.value.invertRotate ? -1 : 1) * settings.value.cameraSensitivity;
    this.gPitch = Math.max(-0.15, Math.min(1.45, this.gPitch + dy * k * 0.8));
    this.idle = 0;
  }

  zoomBy(f: number): void {
    this.gZoom = Math.max(0.18, Math.min(3.2, this.gZoom * f));
    this.idle = 0;
  }

  panBy(dyPx: number): void {
    const worldPerPx = (this.dist * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.max(200, game?.engine?.height ?? 800);
    this.gPanY = Math.max(-this.height * 0.6, Math.min(this.height * 0.8, this.gPanY + dyPx * worldPerPx));
    this.idle = 0;
  }

  resetView(): void {
    this.gYaw = Math.round((this.gYaw - 0.7) / (Math.PI * 2)) * Math.PI * 2 + 0.7;
    this.gPitch = 0.3;
    this.gZoom = 1;
    this.gPanY = 0;
    this.idle = 0;
  }

  /** Swoop in from afar (on open). */
  intro(): void {
    this.computeFit();
    this.fitS = this.fitDist;
    this.targetY = this.fitY;
    if (settings.value.reduceMotion) return;
    this.zoom = 2.2;
    this.yaw = this.gYaw - 1.1;
    this.pitch = 0.7;
  }

  /** Part index under a screen point (or -1). */
  pick(clientX: number, clientY: number): number {
    const el = game?.engine?.canvas;
    if (!el || !this.ranges.length) return -1;
    const rect = el.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1);
    this.raycaster.setFromCamera(_ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.model, false);
    const f = hits[0]?.faceIndex;
    if (f === undefined || f === null) return -1;
    for (let i = 0; i < this.ranges.length; i += 2) if (f >= this.ranges[i] && f < this.ranges[i + 1]) return i / 2;
    return -1;
  }

  /** Where a part sits (absolute base / top) — from the last build. */
  partLayout(i: number): { base: number; top: number } | null {
    return this.layout?.parts[i] ?? null;
  }

  // ───────────────────────────── View lifecycle

  enter(): void {
    const s = this.saved;
    s.sun.copy(shared.uSunDir.value);
    s.center.copy(shared.uPlanetCenter.value);
    s.night = shared.uNightLights.value;
    s.apoc = shared.uApocalypse.value;
    this.ensureEnv();
    this.syncPlanetColors();
    this.hasShadows = !!game?.engine?.renderer.shadowMap.enabled;
    this.key.castShadow = this.hasShadows;
    if (this.hasShadows) {
      const sh = this.key.shadow;
      sh.mapSize.set(1024, 1024);
      sh.bias = -0.0006;
      sh.normalBias = 0.02;
      sh.radius = 3;
      sh.intensity = 0.7;
      sh.autoUpdate = true;
    }
    this.idle = 0;
  }

  exit(): void {
    const s = this.saved;
    shared.uSunDir.value.copy(s.sun);
    shared.uPlanetCenter.value.copy(s.center);
    shared.uNightLights.value = s.night;
    shared.uApocalypse.value = s.apoc;
    this.key.castShadow = false;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.pending) {
      const spec = this.pending;
      this.pending = null;
      this.rebuild(spec);
    }
    const rm = settings.value.reduceMotion;
    // night blend
    const nk = rm ? 1 : 1 - Math.exp(-dt * 3.2);
    this.nightT = smooth(this.nightT, this.nightGoal, nk);
    if (Math.abs(this.nightT - this.nightGoal) < 0.002) this.nightT = this.nightGoal;
    this.applyLighting();
    // camera
    this.idle += dt;
    if (!rm && this.idle > 6) this.gYaw += dt * 0.12 * Math.min(1, (this.idle - 6) / 2);
    const k = 1 - Math.exp(-dt * 7);
    this.yaw = smooth(this.yaw, this.gYaw, k);
    this.pitch = smooth(this.pitch, this.gPitch, k);
    this.zoom = smooth(this.zoom, this.gZoom, 1 - Math.exp(-dt * 5));
    this.panY = smooth(this.panY, this.gPanY, k);
    const fk = 1 - Math.exp(-dt * 3);
    this.fitS = smooth(this.fitS, this.fitDist, fk);
    this.dist = this.fitS * this.zoom;
    this.targetY = smooth(this.targetY, this.fitY, fk);
    this.computeFit();
    const ty = this.targetY + this.panY;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(Math.sin(this.yaw) * cp * this.dist, ty + Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * cp * this.dist);
    this.camera.lookAt(0, ty, 0);
    this.camera.near = Math.max(0.03, this.dist * 0.01);
    this.camera.far = 4000;
    this.applyViewOffset();
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);
    // shared uniforms for the building shader
    shared.uTime.value = game?.clock.time ?? this.time;
    shared.uCameraPos.value.copy(this.camera.position);
    this.skyMat.uniforms.uTime.value = this.time;
    try {
      game?.engine?.post.hint({ exposure: 1 + this.nightT * 0.15, warmth: 0.04 * (1 - this.nightT), night: this.nightT });
    } catch {
      /* post hints optional */
    }
  }

  dispose(): void {
    this.model.geometry.dispose();
    this.pedestal.geometry.dispose();
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    this.blob.geometry.dispose();
    this.blob.material.map?.dispose();
    this.blob.material.dispose();
    this.clearLot();
    this.env?.dispose();
    this.env = null;
    this.key.shadow.map?.dispose();
  }

  // ───────────────────────────── internals

  private ensureEnv(): void {
    if (this.env) return;
    const r = game?.engine?.renderer;
    if (!r) return;
    try {
      const pm = new PMREMGenerator(r);
      const room = new RoomEnvironment();
      this.env = pm.fromScene(room, 0.04).texture;
      room.dispose();
      pm.dispose();
      this.scene.environment = this.env;
    } catch (e) {
      console.warn('[studio] no environment map', e);
    }
  }

  private syncPlanetColors(): void {
    const spec = game?.planet?.spec;
    if (!spec) return;
    const arch = PLANET_TYPES[spec.type];
    const u = this.skyMat.uniforms;
    (u.uOcean.value as Color).setHex(spec.oceanColor ?? arch?.oceanColor ?? 0x1d6fb8);
    (u.uLand.value as Color).setHex(spec.palette?.land ?? arch?.palette.land ?? 0x8a7a60);
    (u.uAtmo.value as Color).setHex(spec.atmosphere?.color ?? arch?.atmosphere.color ?? 0x6fb6ff);
    u.uHasOcean.value = spec.hasOcean ? 1 : 0;
  }

  private applyLighting(): void {
    const n = this.nightT;
    this.skyMat.uniforms.uNight.value = n;
    this.hemi.color.setRGB(0.74 - 0.55 * n, 0.84 - 0.6 * n, 1.0 - 0.5 * n);
    this.hemi.groundColor.setRGB(0.23 - 0.19 * n, 0.19 - 0.16 * n, 0.25 - 0.18 * n);
    this.hemi.intensity = 1.05 - 0.8 * n;
    this.key.color.setRGB(1.0 - 0.38 * n, 0.95 - 0.24 * n, 0.86 + 0.14 * n);
    this.key.intensity = 2.6 - 2.25 * n;
    this.rim.color.setRGB(0.56 + 0.1 * n, 0.72 - 0.2 * n, 1.0);
    this.rim.intensity = 1.25 - 0.55 * n;
    this.scene.environmentIntensity = 0.5 - 0.38 * n;
    // building shader: "planet centre" far below → up = +Y; the sun dips below the horizon at night
    _v.copy(DAY_SUN).lerp(NIGHT_SUN, n).normalize();
    shared.uSunDir.value.copy(_v);
    shared.uPlanetCenter.value.set(0, -1e4, 0);
    shared.uNightLights.value = 1;
    shared.uApocalypse.value = 0;
    (this.skyMat.uniforms.uSun.value as Vector3).copy(DAY_SUN);
    // lot outline brightens at night
    if (this.lotMats.length) {
      this.lotMats[0].opacity = 0.7 + 0.25 * n;
      if (this.lotMats[1]) this.lotMats[1].opacity = 0.16 + 0.1 * n;
      if (this.lotMats[2]) this.lotMats[2].opacity = 0.05 + 0.05 * n;
    }
  }

  private computeFit(): void {
    const H = Math.max(0.3, this.height);
    const R = Math.max(footprintRadius((this.footprint || 1) as Footprint) * 1.2, this.layout?.radius ?? 1);
    const W = Math.max(1, game?.engine?.width ?? 800);
    const Hc = Math.max(1, game?.engine?.height ?? 600);
    const tanHalf = Math.tan((this.camera.fov * Math.PI) / 360);
    const sw = Math.min(this.stage.w, W), sh = Math.min(this.stage.h, Hc);
    // half-angle tangent available in the stage (vertical & horizontal)
    const tv = (tanHalf * sh) / Hc;
    const th = (tanHalf * sw) / Hc;
    const radius = 0.5 * Math.hypot(H * 1.05, R * 2);
    const t = Math.max(0.02, Math.min(tv, th));
    this.fitDist = (radius / Math.sin(Math.atan(t))) * 1.06;
    this.fitY = H * 0.46;
  }

  private applyViewOffset(): void {
    const W = Math.max(1, game?.engine?.width ?? window.innerWidth);
    const H = Math.max(1, game?.engine?.height ?? window.innerHeight);
    const cx = this.stage.w > 4 ? this.stage.x + this.stage.w / 2 : W / 2;
    const cy = this.stage.h > 4 ? this.stage.y + this.stage.h / 2 : H / 2;
    const key = `${W}|${H}|${cx.toFixed(1)}|${cy.toFixed(1)}|${this.camera.aspect.toFixed(4)}`;
    if (key === this.viewKey) return;
    this.viewKey = key;
    this.camera.aspect = W / H;
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    this.camera.updateProjectionMatrix();
  }

  private rebuild(spec: DesignSpec): void {
    // pedestal & lot follow the footprint
    if (spec.footprint !== this.footprint) {
      this.footprint = spec.footprint;
      this.buildPedestal(spec.footprint);
    }
    const b = new MeshBuilder(0);
    const ranges: number[] = [];
    let lay: Layout | null = null;
    try {
      lay = buildDesign(b, spec, ranges);
    } catch (e) {
      console.error('[studio] build failed', e);
    }
    const g = b.build();
    const count = g.getAttribute('position').count;
    g.setAttribute('aState', new BufferAttribute(new Float32Array(count), 1));
    // per-part vertex ranges (each part's vertices are contiguous)
    const idx = g.index;
    const vr: number[] = [];
    for (let i = 0; i < ranges.length; i += 2) {
      let lo = Infinity, hi = -1;
      if (idx) for (let t = ranges[i] * 3; t < ranges[i + 1] * 3; t++) {
        const v = idx.getX(t);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      vr.push(hi >= 0 ? lo : 0, hi >= 0 ? hi + 1 : 0);
    }
    const old = this.model.geometry;
    this.model.geometry = g;
    old.dispose();
    this.ranges = ranges;
    this.vranges = vr;
    this.layout = lay;
    this.triangles = b.triangles;
    this.height = lay?.height ?? 0.1;
    const r = Math.max(0.6, lay?.radius ?? 1);
    this.blob.scale.set(r * 2.6, r * 2.6, 1);
    if (this.hasShadows) {
      const sh = this.key.shadow.camera;
      const ext = Math.max(r * 1.6, this.height * 0.8) + 1;
      sh.left = -ext;
      sh.right = ext;
      sh.top = ext;
      sh.bottom = -ext;
      sh.near = 1;
      sh.far = 80;
      sh.updateProjectionMatrix();
    }
    this.key.position.copy(DAY_SUN).multiplyScalar(30);
    this.key.target.position.set(0, this.height * 0.3, 0);
    this.key.target.updateMatrixWorld();
    if (this.selected >= ranges.length / 2) this.selected = -1;
    this.applyHighlight();
  }

  private applyHighlight(): void {
    const a = this.model.geometry.getAttribute('aState') as BufferAttribute | undefined;
    if (!a) return;
    const arr = a.array as Float32Array;
    arr.fill(0);
    const i = this.selected;
    if (i >= 0 && i * 2 + 1 < this.vranges.length) arr.fill(7, this.vranges[i * 2], this.vranges[i * 2 + 1]);
    a.needsUpdate = true;
  }

  private buildPedestal(fp: Footprint): void {
    const ring = ringOf(fp);
    // extent of the outer context ring
    const outer = hexes(ring + 1);
    let ext = 0;
    for (const [q, r] of outer) {
      const [x, z] = hexCenter(q, r);
      ext = Math.max(ext, Math.hypot(x, z));
    }
    const R = ext + 1.3;
    const b = new MeshBuilder(0);
    b.cyl(R, R * 1.02, 0.32, { y: -0.32, seg: 72, color: 0x161b28, mat: Mat.Metal, top: 0x1d2333, topMat: Mat.Plain });
    b.cyl(R * 1.025, R * 1.025, 0.03, { y: -0.13, seg: 72, capTop: false, color: 0x5ef0ff, mat: Mat.Glow });
    b.cyl(R * 0.94, R * 0.98, 0.18, { y: -0.5, seg: 72, color: 0x10141f, mat: Mat.Metal });
    b.cyl(R * 0.7, R * 0.94, 0.14, { y: -0.64, seg: 72, color: 0x0d111a, mat: Mat.Metal });
    b.cyl(R * 0.36, R * 0.36, 0.02, { y: -0.66, seg: 48, color: 0xa77bff, mat: Mat.Glow, capTop: false });
    // front chevron (road side)
    const zf = ext + 0.55;
    b.group({ z: zf, y: 0.006 }, () => {
      for (const s of [-1, 1]) b.box(0.5, 0.004, 0.07, { x: s * 0.17, z: 0, ry: s * 0.6, color: 0xffd36b, mat: Mat.Glow });
    });
    const g = b.build();
    g.setAttribute('aState', new BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
    const old = this.pedestal.geometry;
    this.pedestal.geometry = g;
    old.dispose();
    // lot outlines
    this.clearLot();
    const inner = hexes(ring).map(([q, r]) => hexCenter(q, r));
    const around = hexes(ring + 1, true).map(([q, r]) => hexCenter(q, r));
    const mk = (geo: BufferGeometry, color: number, opacity: number) => {
      const m = new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
      this.lotMats.push(m);
      const mesh = new Mesh(geo, m);
      mesh.renderOrder = 2;
      this.lot.add(mesh);
    };
    mk(hexOutlineGeometry(inner, 0.006, 0.045), 0x5ef0ff, 0.75);
    mk(hexOutlineGeometry(around, 0.005, 0.025), 0x7fa6ff, 0.18);
    mk(hexFillGeometry(inner, 0.004), 0x5ef0ff, 0.06);
  }

  private clearLot(): void {
    for (const c of [...this.lot.children]) {
      const m = c as Mesh;
      m.geometry.dispose();
      this.lot.remove(m);
    }
    for (const m of this.lotMats) m.dispose();
    this.lotMats = [];
  }
}
