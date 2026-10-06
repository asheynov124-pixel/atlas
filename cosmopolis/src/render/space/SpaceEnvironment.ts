/**
 * OWNER: space-post.
 * SpaceEnvironment — everything around and above the planet, and the light it receives:
 *   • sky: baked nebula / galactic band / distant galaxies cube (SkyDome), a 5–20k star field, the system's other
 *     planets as tiny lit discs, shooting stars at night — the whole sky turns with the day cycle
 *   • the sun: HDR disc + corona (pulsar beams, binary companion, black-hole accretion disc), screen-space glare and
 *     lens flares with analytic planet / moon occlusion
 *   • lighting: sun DirectionalLight + ambient + planet-aware hemisphere light; moody-blue readable nights, golden-hour
 *     warming when the sun is low over the camera's focus, eclipses, star-kind tints, apocalypse tint, god-power flashes
 *   • tight camera-following sun shadows on tier ≥ 2 (SunShadows)
 *   • moons (spec.moons) and planetary rings (spec.rings)
 *
 * CONTRACT
 *   sunLight: DirectionalLight (follows view.sunDir)        update(dt), dispose()
 *   daylight: 0..1 at the camera focus (audio / music / others read it)     golden: 0..1 golden-hour amount
 *   sunVisibility: 0..1 how much of the sun is on screen and unoccluded     star: StarKind
 *   setStar(kind)                       star colour / size / light (cosmos calls this; default from the universe)
 *   flash(color, intensity?, seconds?)  brief world-lighting flash (explosions, supernovae, divine smites…)
 *   sunBoost                            multiplier on sunlight (god powers: dim / scorch the sun)
 *   setLayerVisible(layer, on)          'sky' | 'stars' | 'sun' | 'flares' | 'moons' | 'rings' | 'planets' (photo mode)
 *   moonBodies                          world positions + radii of the moons (read-only)
 *
 * URL params (dev): &star=<StarKind> force a star kind · &rings=1 give the planet rings for testing.
 */
import { AmbientLight, Color, DirectionalLight, Group, HemisphereLight, Quaternion, Vector2, Vector3 } from 'three';
import { bus } from '../../core/events';
import { hashString } from '../../core/rng';
import { settings } from '../../core/settings';
import type { PlanetSpec, PlanetTypeId, StarKind } from '../../core/types';
import { PLANET_TYPES } from '../../content/planetTypes';
import { VISUAL_SPEED } from '../../game/Clock';
import { game } from '../../game/instance';
import { shared } from '../materials';
import type { PlanetView } from '../PlanetView';
import { Meteors } from './Meteors';
import { Moons } from './Moons';
import { PlanetRings } from './Rings';
import { SkyDome, skyLayout } from './SkyDome';
import { SkyPlanets, type SkyPlanetInfo } from './SkyPlanets';
import { Starfield } from './Starfield';
import { STAR_LOOKS, type StarLook } from './stars';
import { LensFlares, SunDisc } from './Sun';
import { SunShadows } from './SunShadows';

export type SpaceLayer = 'sky' | 'stars' | 'sun' | 'flares' | 'moons' | 'rings' | 'planets';

/** Minimal structural view of the universe catalogue (cosmos contract) — read defensively. */
interface CosmosLike {
  galaxies?: {
    id: string;
    colors?: [number, number];
    systems?: { id: string; star?: StarKind; planets?: { id: string; orbit?: number; parent?: string; spec?: PlanetSpec }[] }[];
  }[];
}

interface SystemContext {
  seed: number;
  colors?: [number, number];
  star: StarKind;
  siblings: SkyPlanetInfo[];
}

const STAR_COUNT = [5000, 9000, 14000, 20000];
const _v = new Vector3();
const _w = new Vector3();
const _focus = new Vector3();
const _q = new Quaternion();
const _ndc = new Vector2();
const _c = new Color();
const _c2 = new Color();

const WARM = new Color(1.0, 0.5, 0.24);
const APOC_LIGHT = new Color(1.0, 0.32, 0.12);
const NIGHT_SKY = new Color(0x5a7cc4);
const NIGHT_GROUND = new Color(0x0b0e18);
const DAY_GROUND = new Color(0x4a4034);
const GOLDEN_SKY = new Color(0xffb48c);

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lookupSystem(spec: PlanetSpec): SystemContext {
  const ctx: SystemContext = { seed: 0, star: 'yellow', siblings: [] };
  const sysId = spec.id.includes('.') ? spec.id.slice(0, spec.id.lastIndexOf('.')) : spec.id;
  ctx.seed = hashString(sysId) ^ 0x1f2e3d;
  try {
    const cosmos = (game as unknown as { cosmos?: CosmosLike } | null)?.cosmos;
    for (const g of cosmos?.galaxies ?? []) {
      for (const s of g.systems ?? []) {
        const me = s.planets?.find((p) => p.id === spec.id || p.spec?.id === spec.id);
        if (!me) continue;
        ctx.seed = hashString(s.id) ^ 0x1f2e3d;
        if (g.colors) ctx.colors = g.colors;
        if (s.star && STAR_LOOKS[s.star]) ctx.star = s.star;
        const myOrbit = me.orbit ?? 0;
        for (const p of s.planets ?? []) {
          if (p === me || p.parent || !p.spec) continue;
          ctx.siblings.push(skyInfo(p.spec.type, !!p.spec.rings, (p.orbit ?? 0) < myOrbit, hashString(p.id)));
          if (ctx.siblings.length >= 6) break;
        }
        return ctx;
      }
    }
  } catch (e) {
    console.warn('[space] universe lookup failed', e);
  }
  // no catalogue (sandbox / forged worlds): a couple of seeded wanderers
  const n = 1 + (ctx.seed % 3);
  const types = Object.keys(PLANET_TYPES) as PlanetTypeId[];
  for (let i = 0; i < n; i++) {
    const h = hashString(sysId + ':' + i);
    ctx.siblings.push(skyInfo(types[h % types.length], h % 5 === 0, i === 0, h));
  }
  return ctx;
}

function skyInfo(type: PlanetTypeId, ringed: boolean, inner: boolean, h: number): SkyPlanetInfo {
  const a = PLANET_TYPES[type] ?? PLANET_TYPES.barren;
  const ocean = a.hasOcean && a.oceanCoverage > 0.5;
  return {
    colorA: ocean ? a.oceanColor : a.palette.land,
    colorB: ocean ? a.palette.land : a.palette.highland,
    size: 0.004 + ((h >>> 8) % 1000) / 1000 * 0.008,
    inner,
    banded: !inner && (h >>> 4) % 3 === 0,
    ringed,
  };
}

export class SpaceEnvironment {
  readonly sunLight: DirectionalLight;
  readonly ambient: AmbientLight;
  readonly hemi: HemisphereLight;
  /** 0 = night … 1 = full day at the camera's focus (blends to the lit fraction of the disc from orbit) */
  daylight = 1;
  /** 0..1 golden-hour amount at the focus */
  golden = 0;
  /** 0..1 how much of the sun is on screen and unoccluded */
  sunVisibility = 0;
  /** god powers: sunlight multiplier */
  sunBoost = 1;
  star: StarKind = 'yellow';

  readonly skyGroup = new Group();
  private sky: SkyDome | null = null;
  private stars: Starfield;
  private meteors: Meteors;
  private skyPlanets: SkyPlanets | null = null;
  private sun: SunDisc;
  private flares: LensFlares;
  private moons: Moons;
  private rings: PlanetRings | null = null;
  private shadows: SunShadows;
  private look: StarLook = STAR_LOOKS.yellow;
  private ctx: SystemContext;
  private flashes: { color: Color; intensity: number; t: number; dur: number }[] = [];
  private flashColor = new Color();
  private vis = 0;
  private layers: Record<SpaceLayer, boolean> = { sky: true, stars: true, sun: true, flares: true, moons: true, rings: true, planets: true };
  private offs: (() => void)[] = [];
  private disposed = false;

  constructor(private view: PlanetView) {
    const scene = view.scene;
    const spec = view.planet.spec;
    const R = view.planet.radius;
    scene.background = null;
    this.sunLight = new DirectionalLight(0xfff1dd, 3.2);
    this.sunLight.name = 'sun';
    this.ambient = new AmbientLight(0x334466, 0.4);
    this.hemi = new HemisphereLight(0x8899bb, 0x111118, 0.3);
    scene.add(this.sunLight, this.sunLight.target, this.ambient, this.hemi);

    this.ctx = lookupSystem(spec);
    const tier = game?.engine?.tier ?? 1;
    const renderer = game?.engine?.renderer;
    // sky
    this.skyGroup.name = 'sky';
    scene.add(this.skyGroup);
    if (renderer) {
      try {
        this.sky = new SkyDome(renderer, { seed: this.ctx.seed, colors: this.ctx.colors }, tier >= 2 ? 1024 : 512);
        this.skyGroup.add(this.sky.mesh);
      } catch (e) {
        console.error('[space] sky dome failed', e);
        this.sky = null;
      }
    }
    const layout = this.sky?.layout ?? skyLayout({ seed: this.ctx.seed, colors: this.ctx.colors });
    this.stars = new Starfield(layout, this.ctx.seed, STAR_COUNT[tier] ?? 9000);
    this.skyGroup.add(this.stars.points);
    if (this.ctx.siblings.length) {
      const e = Math.sin(spec.axialTilt) * 0.9 + 0.12;
      this.skyPlanets = new SkyPlanets(this.ctx.siblings, this.ctx.seed, e);
      this.skyGroup.add(this.skyPlanets.mesh);
    }
    this.meteors = new Meteors(this.ctx.seed);
    scene.add(this.meteors.mesh);
    // sun
    this.sun = new SunDisc();
    this.flares = new LensFlares();
    scene.add(this.sun.mesh, this.flares.mesh);
    // moons & rings
    this.moons = new Moons(scene, spec.moons ?? [], R, spec.atmosphere, tier >= 2 ? 64 : 40);
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    const ringSpec = spec.rings ?? (params?.get('rings') === '1' ? { inner: 1.35, outer: 2.35, color: 0xd8c7a6, opacity: 0.75, tilt: 0.42 } : null);
    if (ringSpec) {
      this.rings = new PlanetRings(ringSpec, R, spec.seed, spec.atmosphere.color);
      scene.add(this.rings.mesh);
    }
    // shadows
    this.shadows = new SunShadows(this.sunLight, renderer ?? null);
    this.shadows.configure(tier, settings.value.shadows);
    const reconfigure = () => {
      if (!this.disposed) this.shadows.configure(game?.engine?.tier ?? tier, settings.value.shadows);
    };
    this.offs.push(bus.on('quality:changed', reconfigure), bus.on('settings:changed', reconfigure));

    const forced = params?.get('star') as StarKind | null;
    this.setStar(forced && STAR_LOOKS[forced] ? forced : this.ctx.star);
    this.update(0);
  }

  /** Change the star (colour, disc, light, specials). */
  setStar(kind: StarKind): void {
    const look = STAR_LOOKS[kind] ?? STAR_LOOKS.yellow;
    this.star = look.kind;
    this.look = look;
    this.sun.setLook(look);
  }

  /** A brief flash of world light (explosions, supernova, lightning, divine smite…). */
  flash(color: number | Color, intensity = 2, seconds = 1.2): void {
    if (this.flashes.length > 8) this.flashes.shift();
    this.flashes.push({ color: new Color().set(color), intensity, t: 0, dur: Math.max(0.05, seconds) });
  }

  /** Photo mode / god powers: hide or show parts of the environment. */
  setLayerVisible(layer: SpaceLayer, on: boolean): void {
    this.layers[layer] = on;
    if (this.sky) this.sky.mesh.visible = this.layers.sky;
    this.stars.points.visible = this.layers.stars;
    this.meteors.mesh.visible = this.meteors.mesh.visible && this.layers.stars;
    this.sun.mesh.visible = this.layers.sun;
    if (!this.layers.flares || !this.layers.sun) this.flares.mesh.visible = false;
    this.moons.setVisible(this.layers.moons);
    if (this.rings) this.rings.mesh.visible = this.layers.rings;
    if (this.skyPlanets) this.skyPlanets.mesh.visible = this.layers.planets;
  }

  /** world positions + radii of the moons */
  get moonBodies(): readonly { pos: Vector3; radius: number }[] {
    return this.moons.bodies;
  }

  update(dt: number): void {
    if (this.disposed) return;
    try {
      this.step(dt);
    } catch (e) {
      console.error('[space] update failed', e);
    }
  }

  private step(dt: number): void {
    const view = this.view;
    const planet = view.planet;
    const spec = planet.spec;
    const R = planet.radius;
    const cam = view.camera;
    const sunDir = view.sunDir;
    const look = this.look;
    const time = game?.clock.time ?? 0;
    const reduce = settings.value.reduceMotion;
    const camPos = cam.position;
    const camDist = Math.max(1e-3, camPos.length());
    const camUp = _w.copy(camPos).divideScalar(camDist);
    const altitude = camDist - R;

    // ── focus point (what the player is looking at)
    const rig = game?.camera;
    const attached = !!rig && rig.view === view;
    const focusDir = attached ? _focus.copy(rig.target).normalize() : _focus.copy(camUp);
    const zoomDist = attached ? rig.distance : altitude;
    const sunElev = focusDir.dot(sunDir);
    const far = smooth(R * 0.35, R * 1.3, zoomDist);
    const atmo = Math.min(1, spec.atmosphere.density);

    // ── daylight / golden hour
    const localDay = smooth(-0.14, 0.2, sunElev);
    const orbitDay = 0.5 + 0.5 * camUp.dot(sunDir);
    this.daylight = localDay + (orbitDay - localDay) * far;
    this.golden = smooth(-0.1, 0.06, sunElev) * (1 - smooth(0.08, 0.42, sunElev)) * (1 - far);

    // ── eclipse at the focus (moons crossing the sun)
    let eclipse = 1;
    const bodies = this.moons.bodies;
    if (bodies.length) {
      _v.copy(focusDir).multiplyScalar(R);
      for (const b of bodies) eclipse *= occlusion(_v, sunDir, b.pos, b.radius, look.disc);
    }
    const pulse = look.special === 'pulsar' ? 0.88 + 0.12 * Math.pow(0.5 + 0.5 * Math.sin(time * 7), 6) : 1;
    const apoc = Math.max(0, Math.min(1, shared.uApocalypse.value));

    // ── flashes
    this.flashColor.setRGB(0, 0, 0);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t >= f.dur) {
        this.flashes.splice(i, 1);
        continue;
      }
      const k = f.t / f.dur;
      const env = Math.min(1, k * 12) * Math.pow(1 - k, 2);
      this.flashColor.r += f.color.r * f.intensity * env;
      this.flashColor.g += f.color.g * f.intensity * env;
      this.flashColor.b += f.color.b * f.intensity * env;
    }

    // ── sun light
    const sunUp = smooth(-0.2, 0.05, sunElev);
    const sunFade = sunUp + (1 - sunUp) * far;
    const light = this.sunLight;
    light.color.set(look.light).lerp(WARM, this.golden * 0.75 * (0.4 + 0.6 * atmo)).lerp(APOC_LIGHT, apoc * 0.7);
    light.intensity = look.intensity * sunFade * eclipse * pulse * this.sunBoost * (1 - apoc * 0.25);
    light.position.copy(sunDir).multiplyScalar(R * 6);
    light.target.position.set(0, 0, 0);
    light.target.updateMatrixWorld();
    if (attached && this.shadows.enabled) {
      const tile = rig.targetTile();
      const h = tile >= 0 && tile < planet.count ? Math.max(0, planet.heightOf(tile)) : 0;
      _v.copy(focusDir).multiplyScalar(R + h);
      this.shadows.update(dt, _v, zoomDist, sunDir, sunElev);
    }

    // ── ambient + hemisphere (planet-aware "up" = focus normal)
    const day = this.daylight;
    const atmoCol = _c2.set(spec.atmosphere.color);
    const amb = this.ambient;
    amb.color.set(look.ambient).lerp(_c.set(0x93a6c9).lerp(atmoCol, 0.25), day);
    amb.intensity = 1.55 + (0.42 - 1.55) * day;
    amb.color.lerp(APOC_LIGHT, apoc * 0.4);
    amb.color.r += this.flashColor.r * 0.6;
    amb.color.g += this.flashColor.g * 0.6;
    amb.color.b += this.flashColor.b * 0.6;
    const hemi = this.hemi;
    hemi.position.copy(focusDir);
    hemi.color.copy(NIGHT_SKY).lerp(_c.set(0xb4cdf2).lerp(atmoCol, 0.4), day).lerp(GOLDEN_SKY, this.golden * 0.55);
    hemi.color.lerp(APOC_LIGHT, apoc * 0.5);
    hemi.groundColor.copy(NIGHT_GROUND).lerp(DAY_GROUND, day);
    hemi.intensity = (0.55 + (0.5 - 0.55) * day) * (0.55 + 0.45 * atmo);

    // ── sky
    const insideAtmo = (1 - smooth(R * 0.02, R * 0.35, altitude)) * atmo;
    const camDay = smooth(-0.2, 0.12, camUp.dot(sunDir));
    const wash = insideAtmo * camDay;
    const glare = this.vis * look.glare;
    const skyI = look.sky * (1 - 0.95 * wash) * (1 - 0.5 * glare);
    this.skyGroup.rotation.y = -((game?.clock.timeOfDay ?? 0) * Math.PI * 2);
    this.skyGroup.updateMatrixWorld();
    if (this.sky) {
      this.sky.intensity = skyI * (1 - apoc * 0.4);
      this.sky.tint.setRGB(1, 1, 1).lerp(APOC_LIGHT, apoc * 0.6);
      this.sky.update(dt);
    }
    this.stars.intensity = skyI;
    this.stars.twinkle = reduce ? 0 : 0.06 + 0.4 * insideAtmo;
    this.stars.extinction = insideAtmo;
    this.stars.up.copy(camUp);
    this.stars.update(time, game?.engine?.pixelRatio ?? 1);
    if (this.skyPlanets) {
      _q.copy(this.skyGroup.quaternion).invert();
      _v.copy(sunDir).applyQuaternion(_q);
      this.skyPlanets.update(_v, Math.max(0.15, skyI));
    }
    this.meteors.rate = reduce || !this.layers.stars ? 0 : insideAtmo * (1 - camDay) * (spec.atmosphere.density > 0.15 ? 1 : 0);
    _v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.meteors.update(dt, camUp, _v);
    if (!this.layers.stars) this.meteors.mesh.visible = false;

    // ── sun disc + flares
    const camElev = camUp.dot(sunDir);
    const horizonWarm = (1 - smooth(0.0, 0.3, camElev)) * insideAtmo;
    _c.set(look.color).lerp(APOC_LIGHT, apoc * 0.5);
    this.sun.update(dt, reduce ? 0 : time, sunDir, this.sunBoost * (1 - wash * 0.25), horizonWarm, _c);
    let vis = 0;
    _v.copy(sunDir).transformDirection(cam.matrixWorldInverse);
    if (_v.z < -0.01) {
      const p = cam.projectionMatrix.elements;
      _ndc.set((p[0] * _v.x + p[8] * _v.z) / -_v.z, (p[5] * _v.y + p[9] * _v.z) / -_v.z);
      const edge = 1 - smooth(0.92, 1.5, Math.max(Math.abs(_ndc.x), Math.abs(_ndc.y)));
      if (edge > 0) {
        // planet occlusion (sphere test with a little terrain margin), then moons
        let occ = occlusion(camPos, sunDir, _w.set(0, 0, 0), R + 0.15, look.disc * 1.3);
        for (const b of bodies) occ *= occlusion(camPos, sunDir, b.pos, b.radius, look.disc * 1.3);
        vis = edge * occ;
      }
    }
    this.vis += (vis - this.vis) * Math.min(1, dt * 14 + (dt === 0 ? 1 : 0));
    this.sunVisibility = this.vis;
    const flareOn = this.layers.flares && this.layers.sun && (game?.engine?.tier ?? 1) >= 1;
    _c.set(look.color).lerp(WARM, horizonWarm * 0.6);
    this.flares.update(_ndc, cam.aspect, flareOn ? this.vis * look.glare * this.sunBoost * (1 - wash * 0.35) : 0, _c, reduce ? 0 : cam.rotation.z * 0.5 + time * 0.01);

    // ── moons & rings
    const sunCol = _c.copy(light.color).multiplyScalar((look.intensity * pulse * this.sunBoost) / Math.PI);
    const orbitDt = dt * (VISUAL_SPEED[game?.clock.speed ?? 1] ?? 1);
    this.moons.update(orbitDt, time, sunDir, sunCol);
    this.rings?.update(sunDir, sunCol);

    // ── hint the grade: slightly brighter exposure at night so cities read, a hair warmer at golden hour
    const post = game?.engine?.post as unknown as { hint?: (h: { exposure: number; warmth: number; night: number }) => void } | undefined;
    post?.hint?.({ exposure: 1 + 0.2 * (1 - day) * (1 - far * 0.6), warmth: this.golden * 0.15, night: 1 - day });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs = [];
    this.sky?.dispose();
    this.stars.dispose();
    this.skyPlanets?.dispose();
    this.meteors.dispose();
    this.sun.dispose();
    this.flares.dispose();
    this.moons.dispose();
    this.rings?.dispose();
    this.shadows.dispose();
    this.skyGroup.removeFromParent();
    this.sunLight.removeFromParent();
    this.sunLight.target.removeFromParent();
    this.sunLight.dispose();
    this.ambient.removeFromParent();
    this.hemi.removeFromParent();
  }
}

/**
 * Fraction (0..1) of a star disc of angular radius `disc` seen from `eye` along `dir` that is NOT covered by a sphere
 * at `center` with `radius`. Smooth across the limb.
 */
function occlusion(eye: Vector3, dir: Vector3, center: Vector3, radius: number, disc: number): number {
  const dx = center.x - eye.x;
  const dy = center.y - eye.y;
  const dz = center.z - eye.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= radius) return 0;
  const cosA = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
  if (cosA <= 0) return 1;
  const ang = Math.acos(Math.min(1, cosA));
  const rho = Math.asin(Math.min(1, radius / d));
  return smooth(rho - disc, rho + disc, ang);
}
