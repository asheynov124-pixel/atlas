/**
 * OWNER: life agent.
 * OrbitalRenderer — planet.orbitals in motion, plus the ambient traffic of a spacefaring city.
 *
 *   • every OrbitalInstance is drawn with its ItemDef mesh (catalog getGeometry, instanced per def) on an inclined
 *     circular orbit — radius = orbit × planet radius, node Ω, inclination i, phase, speed (× game speed). The
 *     convention matches tools/orbit.ts: N = (cos Ω, 0, sin Ω), n = (−sin Ω sin i, cos i, cos Ω sin i),
 *     pos(u) = R·orbit·(cos u N + sin u (n × N)). Objects keep +Y away from the planet and +Z along their velocity.
 *     Small satellites grow a little with camera distance so they stay readable from orbit. Planet-centred
 *     megastructures (the Orbital Ring: modelled around the planet centre for a reference planet of radius
 *     REF_PLANET_RADIUS = 66, see content/meshes/landmarks/orbital.ts) sit at the planet centre, tilted by their
 *     inclination, scaled by planet.radius / 66 so they fit every world size, and slowly turn about their axis.
 *   • soft orbit trails (additive lines, bright just behind each object, fading around the ring) fade in as the
 *     camera pulls out to orbit
 *   • cargo haulers ply between stations and up from spaceports (engine glow, docking fades)
 *   • launch(defId, from, params, done): the orbit tool's launch hook — a rocket climbs from the pad on a gravity
 *     turn into the insertion point with flame + smoke, then calls done()
 *   • pickOrbital(ray) → id | null for selection (generous touch radius, occluded by the planet; rings are picked
 *     where the ray crosses their plane near the band)
 *   • position(id, out) → world position for camera follow (CameraRig.follow(() => view.orbitals.position(id, v)));
 *     for a ring it is a point on the band that turns with it
 * Reacts to orbital:added / orbital:removed / selection:changed; disposes everything on unload.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  ShaderMaterial,
  Vector3,
  type Ray,
} from 'three';
import { bus } from '../../core/events';
import { getGeometry, getItem } from '../../content/catalog';
import { REF_PLANET_RADIUS, RING_RADIUS } from '../../content/meshes/landmarks/orbital';
import { game } from '../../game/instance';
import type { OrbitalInstance } from '../../world/planet';
import { InstState, SHADER_COMMON, shared } from '../materials';
import type { PlanetView } from '../PlanetView';
import { KitBatch, Particles, SpriteBatch, linHex } from './batch';
import { Cull, FastRng, MOTION_SPEED, bezier3, firstFree, frameFwd, newFrame, smoothstep } from './common';
import { Sites } from './sites';
import { hauler, satellite, shuttle } from './vehicles';

interface Orb {
  id: number;
  key: string;
  /** current angle along the orbit */
  u: number;
  /** orbit clock value when this orbital was first seen (trail shader phase) */
  t0: number;
  phase0: number;
  centred: boolean;
  bound: number;
  /** planet-centred structures: draw scale (planet.radius / REF_PLANET_RADIUS) */
  scale: number;
  /** planet-centred structures: band radius at the reference planet size (picking / follow point) */
  ring: number;
  r: number;
  g: number;
  b: number;
  pos: Vector3;
  vel: Vector3;
}

interface Haul {
  active: boolean;
  /** 0 surface → station · 1 station → station · 2 surface → parking orbit */
  mode: number;
  from: number;
  to: number;
  site: number;
  t: number;
  dur: number;
  pos: Vector3;
  dir: Vector3;
  park: Vector3;
}

interface Launch {
  defId: string;
  from: Vector3;
  params: { orbit: number; inclination: number; node: number; phase: number };
  done: () => void;
  t: number;
  dur: number;
  pos: Vector3;
  dir: Vector3;
  fired: boolean;
}

const TRAIL_SEG = 96;
const _p = new Vector3();
const _q = new Vector3();
const _d = new Vector3();
const _up = new Vector3();
const _N = new Vector3();
const _n = new Vector3();
const _M = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _e = new Vector3();
const _fr = newFrame();

const TRAIL_VERT = /* glsl */ `
${SHADER_COMMON}
attribute float aU;
attribute vec3 aCol;
attribute vec2 aOrb; // phase0, speed
uniform float uClock;
varying float vA;
varying vec3 vCol;
void main() {
  float head = aOrb.x + aOrb.y * uClock;
  float d = aOrb.y >= 0.0 ? head - aU : aU - head;
  d = mod(d, 6.2831853);
  vA = 0.07 + 0.75 * exp(-d * 1.6);
  vCol = aCol;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const TRAIL_FRAG = /* glsl */ `
uniform float uFade;
varying float vA;
varying vec3 vCol;
void main() {
  gl_FragColor = vec4(vCol * vA * uFade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class OrbitalRenderer {
  readonly group = new Group();
  private orbs = new Map<number, Orb>();
  private batches = new Map<string, KitBatch>();
  private hauls: Haul[] = [];
  /** scratch: ids of the orbitals haulers may dock at (rebuilt per frame, never reallocated) */
  private stationIds: number[] = [];
  private launches: Launch[] = [];
  private offs: (() => void)[] = [];
  private clock = 0;
  private trail: LineSegments | null = null;
  private trailMat: ShaderMaterial;
  private trailDirty = true;
  private sprites: SpriteBatch;
  private smoke: Particles;
  private flames: Particles;
  private haulBatch: KitBatch;
  private rocketBatch: KitBatch;
  private cull = new Cull();
  private rng: FastRng;
  private sites: Sites;
  private selected = -1;
  private failed = false;
  private R: number;

  constructor(private view: PlanetView) {
    this.group.name = 'orbitals';
    view.root.add(this.group);
    const planet = view.planet;
    this.R = planet.radius;
    this.rng = new FastRng(planet.spec.seed ^ 0x51a7);
    this.sites = (view as unknown as { life?: { sites?: Sites } }).life?.sites ?? new Sites(view);
    this.trailMat = new ShaderMaterial({
      name: 'orbit-trails',
      uniforms: { ...shared, uClock: { value: 0 }, uFade: { value: 0 } },
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.sprites = new SpriteBatch(this.group, 256, 'orbital-glow', { minPx: 0.0016 });
    this.smoke = new Particles(this.group, 400, 'launch-smoke', false);
    this.flames = new Particles(this.group, 300, 'launch-flames', true);
    this.haulBatch = new KitBatch(this.group, hauler(), 16, 'hauler');
    this.rocketBatch = new KitBatch(this.group, shuttle(), 4, 'rocket');
    for (let i = 0; i < 12; i++) this.hauls.push({ active: false, mode: 0, from: -1, to: -1, site: -1, t: 0, dur: 1, pos: new Vector3(), dir: new Vector3(), park: new Vector3() });
    for (const o of planet.orbitals.values()) this.add(o);
    this.offs.push(
      bus.on('orbital:added', ({ id }) => {
        const o = view.planet.orbitals.get(id);
        if (o) this.add(o);
      }),
      bus.on('orbital:removed', ({ id }) => this.remove(id)),
      bus.on('selection:changed', ({ selection }) => {
        this.selected = selection?.kind === 'orbital' ? selection.id : -1;
      }),
      bus.on('planet:unloading', () => this.flushLaunches()),
    );
  }

  // ───────────────────────────────────────────── orbital bookkeeping

  private keyFor(defId: string): string {
    const def = getItem(defId);
    if (!def?.mesh) return '__satellite';
    return defId;
  }

  private batch(key: string): KitBatch | null {
    let b = this.batches.get(key);
    if (b) return b;
    let geo: BufferGeometry | null = null;
    let owns = false;
    if (key !== '__satellite') {
      try {
        geo = getGeometry(key, { variant: 0, level: 1, lod: 0 });
      } catch {
        geo = null;
      }
    }
    if (!geo) {
      geo = satellite();
      owns = true;
    }
    b = new KitBatch(this.group, geo, 8, 'orb:' + key, owns);
    b.begin();
    this.batches.set(key, b);
    return b;
  }

  private add(o: OrbitalInstance): void {
    const key = this.keyFor(o.defId);
    const b = this.batch(key);
    const bound = b?.radius ?? 1;
    const col = new Float32Array(3);
    linHex(o.tint ?? 0xffffff, col);
    // meshes are modelled at absolute scale: anything bigger than a third of the reference planet must be one of
    // the planet-centred megastructures (stations top out around 10 units)
    const centred = bound > REF_PLANET_RADIUS * 0.4;
    const def = getItem(o.defId);
    this.orbs.set(o.id, {
      id: o.id,
      key,
      u: o.phase,
      t0: this.clock,
      phase0: o.phase - o.speed * this.clock,
      centred,
      bound,
      scale: centred ? this.R / REF_PLANET_RADIUS : 1,
      ring: centred ? (def?.tags?.includes('ring') ? RING_RADIUS : Math.max(1, bound - 2)) : 0,
      r: col[0],
      g: col[1],
      b: col[2],
      pos: new Vector3(),
      vel: new Vector3(),
    });
    this.place(o, this.orbs.get(o.id)!);
    this.trailDirty = true;
  }

  private remove(id: number): void {
    if (this.orbs.delete(id)) this.trailDirty = true;
  }

  /** Orbit basis for an instance: N (ascending node), M = n × N. */
  private basis(o: OrbitalInstance): void {
    const sO = Math.sin(o.node), cO = Math.cos(o.node), sI = Math.sin(o.inclination), cI = Math.cos(o.inclination);
    _N.set(cO, 0, sO);
    _n.set(-sO * sI, cI, cO * sI);
    _M.crossVectors(_n, _N);
  }

  private place(o: OrbitalInstance, orb: Orb): void {
    this.basis(o);
    const rad = this.R * o.orbit;
    const cu = Math.cos(orb.u), su = Math.sin(orb.u);
    orb.pos.copy(_N).multiplyScalar(cu * rad).addScaledVector(_M, su * rad);
    const sgn = o.speed >= 0 ? 1 : -1;
    orb.vel.copy(_N).multiplyScalar(-su * sgn).addScaledVector(_M, cu * sgn);
    // planet-centred: the "position" is a point on the band (local +X) that turns with the structure
    if (orb.centred) orb.pos.copy(_N).multiplyScalar(cu).addScaledVector(_M, su).multiplyScalar(orb.ring * orb.scale);
  }

  private rebuildTrails(): void {
    this.trailDirty = false;
    if (this.trail) {
      this.group.remove(this.trail);
      this.trail.geometry.dispose();
      this.trail = null;
    }
    const list = [...this.orbs.values()].filter((o) => !o.centred);
    if (!list.length) return;
    const n = list.length * TRAIL_SEG * 2;
    const pos = new Float32Array(n * 3), u = new Float32Array(n), col = new Float32Array(n * 3), orb = new Float32Array(n * 2);
    let v = 0;
    for (const o of list) {
      const inst = this.view.planet.orbitals.get(o.id);
      if (!inst) continue;
      this.basis(inst);
      const rad = this.R * inst.orbit;
      const c = new Float32Array(3);
      if (inst.tint !== undefined) linHex(inst.tint, c);
      else linHex(0x7fd8ff, c);
      for (let k = 0; k < TRAIL_SEG; k++) {
        for (let e = 0; e < 2; e++) {
          const a = ((k + e) / TRAIL_SEG) * Math.PI * 2;
          _p.copy(_N).multiplyScalar(Math.cos(a) * rad).addScaledVector(_M, Math.sin(a) * rad);
          pos[v * 3] = _p.x;
          pos[v * 3 + 1] = _p.y;
          pos[v * 3 + 2] = _p.z;
          u[v] = a;
          col[v * 3] = c[0] * 0.8;
          col[v * 3 + 1] = c[1] * 0.8;
          col[v * 3 + 2] = c[2] * 0.8;
          orb[v * 2] = o.phase0;
          orb[v * 2 + 1] = inst.speed;
          v++;
        }
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos.subarray(0, v * 3), 3));
    g.setAttribute('aU', new BufferAttribute(u.subarray(0, v), 1));
    g.setAttribute('aCol', new BufferAttribute(col.subarray(0, v * 3), 3));
    g.setAttribute('aOrb', new BufferAttribute(orb.subarray(0, v * 2), 2));
    const line = new LineSegments(g, this.trailMat);
    line.frustumCulled = false;
    line.renderOrder = 3;
    line.name = 'orbit-trails';
    this.trail = line;
    this.group.add(line);
  }

  // ───────────────────────────────────────────── public API

  /** World position of an orbital (null if unknown). */
  position(id: number, out = new Vector3()): Vector3 | null {
    const o = this.orbs.get(id);
    if (!o) return null;
    return out.copy(o.pos);
  }

  /** Pick the orbital under a ray (nearest hit, generous touch radius, hidden behind the planet = no hit). */
  pickOrbital(ray: Ray): number | null {
    if (!ray) return null;
    let best: number | null = null;
    let bestT = Infinity;
    // planet occlusion distance
    const R = this.R;
    const b = ray.origin.dot(ray.direction);
    const c = ray.origin.lengthSq() - R * R;
    const disc = b * b - c;
    const planetT = disc >= 0 ? -b - Math.sqrt(disc) : Infinity;
    for (const o of this.orbs.values()) {
      if (o.centred) {
        // ring: where the ray crosses the ring plane, close to the band (and in front of the planet)
        const inst = this.view.planet.orbitals.get(o.id);
        if (!inst) continue;
        this.basis(inst);
        const den = ray.direction.dot(_n);
        if (Math.abs(den) < 1e-4) continue;
        const t = -ray.origin.dot(_n) / den;
        if (t <= 0 || t > planetT || t >= bestT) continue;
        _d.copy(ray.origin).addScaledVector(ray.direction, t);
        const tol = 4 * o.scale + t * 0.03;
        if (Math.abs(_d.length() - o.ring * o.scale) <= tol) {
          bestT = t;
          best = o.id;
        }
        continue;
      }
      _d.copy(o.pos).sub(ray.origin);
      const t = _d.dot(ray.direction);
      if (t <= 0 || t > planetT) continue;
      const d2 = _d.lengthSq() - t * t;
      const rad = o.bound * this.scaleFor(o) + t * 0.035;
      if (d2 <= rad * rad && t < bestT) {
        bestT = t;
        best = o.id;
      }
    }
    return best;
  }

  /** Orbit tool hook: fly a rocket from `from` into the orbit described by params, then call done(). */
  launch(defId: string, from: Vector3, params: { orbit: number; inclination: number; node: number; phase: number }, done: () => void): void {
    const alt = this.R * (params.orbit - 1);
    this.launches.push({ defId, from: from.clone(), params: { ...params }, done, t: 0, dur: 3.2 + Math.min(2.5, alt / 40), pos: from.clone(), dir: from.clone().normalize(), fired: false });
  }

  private flushLaunches(): void {
    for (const l of this.launches) this.finish(l);
    this.launches.length = 0;
  }

  private finish(l: Launch): void {
    if (l.fired) return;
    l.fired = true;
    try {
      l.done();
    } catch (e) {
      console.error('[orbitals] launch completion failed', e);
    }
  }

  // ───────────────────────────────────────────── per frame

  private scaleFor(o: Orb): number {
    if (o.centred) return o.scale;
    if (o.bound > 6) return 1;
    const d = Math.sqrt(this.cull.dist2(o.pos.x, o.pos.y, o.pos.z));
    return Math.max(1, Math.min(2.6, d / 80));
  }

  update(dt: number): void {
    try {
      this.frame(dt);
    } catch (e) {
      if (!this.failed) {
        this.failed = true;
        console.error('[orbitals] update failed', e);
      }
    }
  }

  private frame(dt: number): void {
    const view = this.view;
    const planet = view.planet;
    const speed = game?.clock?.speed ?? 1;
    const mdt = dt * (MOTION_SPEED[speed] ?? 1);
    this.clock += mdt;
    this.cull.update(view.camera, this.R, view.sunDir);
    if (this.trailDirty) this.rebuildTrails();
    // orbit positions
    for (const o of this.orbs.values()) {
      const inst = planet.orbitals.get(o.id);
      if (!inst) continue;
      o.u = o.phase0 + inst.speed * this.clock;
      if (o.u > 1e6 || o.u < -1e6) o.u %= Math.PI * 2;
      this.place(inst, o);
    }
    // trails fade in when zoomed out
    this.trailMat.uniforms.uClock.value = this.clock;
    this.trailMat.uniforms.uFade.value = smoothstep(this.R * 0.25, this.R * 1.1, this.cull.altitude);
    if (this.trail) this.trail.visible = this.trailMat.uniforms.uFade.value > 0.01;

    for (const b of this.batches.values()) b.begin();
    this.haulBatch.begin();
    this.rocketBatch.begin();
    this.sprites.begin();
    const rt = shared.uTime.value;
    for (const o of this.orbs.values()) {
      const inst = planet.orbitals.get(o.id);
      if (!inst) continue;
      const b = this.batch(o.key);
      if (!b) continue;
      const state = o.id === this.selected ? InstState.Highlight : 0;
      if (o.centred) {
        // planet-scale structure: centred, tilted by inclination about the node line, slowly turning
        this.basis(inst);
        const a = o.u;
        const ca = Math.cos(a), sa = Math.sin(a);
        // right = N rotated in the orbit plane, up = orbit normal, fwd = right × up (a proper rotation — a mirrored
        // basis would flip the winding and draw the band inside out)
        _a.copy(_N).multiplyScalar(ca).addScaledVector(_M, sa);
        _c.copy(_N).multiplyScalar(sa).addScaledVector(_M, -ca);
        b.push(0, 0, 0, _a.x, _a.y, _a.z, _n.x, _n.y, _n.z, _c.x, _c.y, _c.z, o.scale, o.r, o.g, o.b, state);
        continue;
      }
      _up.copy(o.pos).normalize();
      const fr = frameFwd(_fr, o.vel, _up);
      // keep +Y radial: rebuild with up exact
      fr.u.copy(_up);
      fr.f.copy(o.vel).addScaledVector(_up, -o.vel.dot(_up)).normalize();
      fr.r.crossVectors(fr.u, fr.f).normalize();
      const s = this.scaleFor(o);
      b.push(o.pos.x, o.pos.y, o.pos.z, fr.r.x, fr.r.y, fr.r.z, fr.u.x, fr.u.y, fr.u.z, fr.f.x, fr.f.y, fr.f.z, s, o.r, o.g, o.b, state);
      // a soft beacon so stations read as lights from orbit
      _p.copy(o.pos).addScaledVector(_up, o.bound * s * 0.6);
      this.sprites.push(_p.x, _p.y, _p.z, 0.25 * s, 1.4, 0.3, 0.25, 0.4, 0.7, (o.id * 0.137) % 1, 0.2);
    }
    this.updateHauls(mdt);
    this.updateLaunches(dt, rt);
    for (const b of this.batches.values()) b.end();
    this.haulBatch.end();
    this.rocketBatch.end();
    this.sprites.end();
    this.smoke.flush();
    this.flames.flush();
  }

  // ───────────────────────────────────────────── haulers

  private stationPos(id: number, out: Vector3): boolean {
    const o = this.orbs.get(id);
    if (!o || o.centred) return false;
    out.copy(o.pos);
    return true;
  }

  private updateHauls(dt: number): void {
    this.sites.refresh();
    const ports = this.sites.tagged('spaceport');
    const stations = this.stationIds;
    stations.length = 0;
    for (const o of this.orbs.values()) if (!o.centred) stations.push(o.id);
    const want = Math.min(this.hauls.length, stations.length * 2 + ports.length * 2, stations.length || ports.length ? 10 : 0);
    let n = 0;
    for (const h of this.hauls) if (h.active) n++;
    if (n < want && this.rng.next() < 0.03 + dt) {
      const h = firstFree(this.hauls);
      if (h) {
        const r = this.rng.next();
        if (stations.length >= 2 && (r < 0.5 || !ports.length)) {
          h.mode = 1;
          h.from = stations[Math.floor(this.rng.next() * stations.length)];
          do h.to = stations[Math.floor(this.rng.next() * stations.length)];
          while (h.to === h.from);
          h.dur = 16 + this.rng.next() * 8;
        } else if (ports.length) {
          const site = ports[Math.floor(this.rng.next() * ports.length)];
          h.site = site.id;
          h.from = -1;
          h.mode = stations.length ? 0 : 2;
          h.to = stations.length ? stations[Math.floor(this.rng.next() * stations.length)] : -1;
          // parking orbit point downrange
          _a.set(this.rng.next() - 0.5, this.rng.next() - 0.5, this.rng.next() - 0.5);
          h.park.copy(site.pos).normalize().addScaledVector(_a, 0.9).normalize().multiplyScalar(this.R * (1.45 + this.rng.next() * 0.3));
          h.dur = 14 + this.rng.next() * 6;
        } else h.dur = 0;
        if (h.dur > 0) {
          h.t = 0;
          h.active = true;
        }
      }
    }
    for (const h of this.hauls) {
      if (!h.active) continue;
      h.t += dt;
      const k = h.t / h.dur;
      if (k >= 1) {
        h.active = false;
        continue;
      }
      // endpoints
      let okA = true, okB = true;
      if (h.mode === 1) okA = this.stationPos(h.from, _a);
      else {
        const site = this.sites.get(h.site);
        if (site) _a.copy(site.pos).addScaledVector(site.up, site.top + 0.4);
        else okA = false;
      }
      if (h.mode === 2) _b.copy(h.park);
      else okB = this.stationPos(h.to, _b);
      if (!okA || !okB) {
        h.active = false;
        continue;
      }
      const e = k * k * (3 - 2 * k);
      const ra = _a.length(), rb = _b.length();
      _c.copy(_a).normalize();
      _e.copy(_b).normalize();
      slerp(_c, _e, h.mode === 1 ? e : Math.max(0, (e - 0.15) / 0.85), _p);
      // climb first when leaving the surface
      const rr = h.mode === 1 ? ra + (rb - ra) * e : ra + (rb - ra) * smoothstep(0, 0.55, k);
      const bulge = Math.sin(Math.PI * k) * this.R * (h.mode === 1 ? 0.12 : 0.05);
      _p.multiplyScalar(rr + bulge);
      h.dir.copy(_p).sub(h.pos);
      if (h.dir.lengthSq() < 1e-10) h.dir.copy(_e).sub(_c);
      h.dir.normalize();
      h.pos.copy(_p);
      if (!this.cull.visible(_p.x, _p.y, _p.z, 2, 600)) continue;
      _up.copy(_p).normalize();
      const fr = frameFwd(_fr, h.dir, _up);
      const fade = smoothstep(0, 0.08, k) * (1 - smoothstep(0.9, 1, k));
      const s = Math.max(1, Math.min(2.6, Math.sqrt(this.cull.dist2(_p.x, _p.y, _p.z)) / 70)) * fade;
      this.haulBatch.push(_p.x, _p.y, _p.z, fr.r.x, fr.r.y, fr.r.z, fr.u.x, fr.u.y, fr.u.z, fr.f.x, fr.f.y, fr.f.z, s, 1, 1, 1);
      _q.copy(_p).addScaledVector(fr.f, -0.8 * s);
      this.sprites.push(_q.x, _q.y, _q.z, 0.35 * s, 0.6, 1.4, 2.4, 0);
    }
  }

  // ───────────────────────────────────────────── launches

  private updateLaunches(dt: number, rt: number): void {
    if (!this.launches.length) return;
    const R = this.R;
    for (let i = this.launches.length - 1; i >= 0; i--) {
      const l = this.launches[i];
      l.t += dt;
      const k = Math.min(1, l.t / l.dur);
      const p = l.params;
      // insertion point at the orbit's phase (where the new orbital will appear)
      const sO = Math.sin(p.node), cO = Math.cos(p.node), sI = Math.sin(p.inclination), cI = Math.cos(p.inclination);
      _N.set(cO, 0, sO);
      _n.set(-sO * sI, cI, cO * sI);
      _M.crossVectors(_n, _N);
      const rad = R * p.orbit;
      _b.copy(_N).multiplyScalar(Math.cos(p.phase) * rad).addScaledVector(_M, Math.sin(p.phase) * rad);
      // velocity direction at insertion
      _e.copy(_N).multiplyScalar(-Math.sin(p.phase)).addScaledVector(_M, Math.cos(p.phase));
      _up.copy(l.from).normalize();
      const alt = rad - l.from.length();
      _a.copy(l.from).addScaledVector(_up, alt * 0.55);
      _c.copy(_b).addScaledVector(_e, -alt * 0.45);
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      bezier3(l.from, _a, _c, _b, ease, _p, _d);
      if (_d.lengthSq() < 1e-8) _d.copy(_up);
      _d.normalize();
      l.pos.copy(_p);
      l.dir.copy(_d);
      // rocket: +Y = nose along travel
      _q.copy(_up).addScaledVector(_d, -_up.dot(_d));
      if (_q.lengthSq() < 1e-6) _q.set(1, 0, 0).addScaledVector(_d, -_d.x);
      _q.normalize();
      _a.crossVectors(_d, _q).normalize();
      const sc = 0.9 * (1 - smoothstep(0.88, 1, k)) + 0.05;
      this.rocketBatch.push(_p.x, _p.y, _p.z, _a.x, _a.y, _a.z, _d.x, _d.y, _d.z, _q.x, _q.y, _q.z, sc, 1, 1, 1);
      _q.copy(_p).addScaledVector(_d, -0.15);
      this.sprites.push(_q.x, _q.y, _q.z, 0.6, 3, 1.7, 0.6, 0);
      this.sprites.push(_q.x, _q.y, _q.z, 1.6, 1.0, 0.45, 0.12, 0);
      const n = Math.max(1, Math.round(dt * 40));
      for (let j = 0; j < n; j++) {
        const r = this.rng;
        this.flames.emit(_q.x, _q.y, _q.z, -_d.x * 2.5 + (r.next() - 0.5) * 0.5, -_d.y * 2.5 + (r.next() - 0.5) * 0.5, -_d.z * 2.5 + (r.next() - 0.5) * 0.5, 0.4, 0.15, 0.45, 1.6, 0.9, 0.35, 1, 3);
        if (_q.length() - R < 25) this.smoke.emit(_q.x, _q.y, _q.z, -_d.x * 0.5 + (r.next() - 0.5) * 0.3, -_d.y * 0.5 + (r.next() - 0.5) * 0.3, -_d.z * 0.5 + (r.next() - 0.5) * 0.3, 4, 0.3, 1.6, 0.92, 0.9, 0.88, 0.5, 0.7, 0.02);
      }
      if (k >= 1) {
        // arrival sparkle
        for (let j = 0; j < 14; j++) {
          const r = this.rng;
          this.flames.emit(_b.x, _b.y, _b.z, (r.next() - 0.5) * 3, (r.next() - 0.5) * 3, (r.next() - 0.5) * 3, 0.7, 0.3, 0.05, 0.6, 1.4, 2.2, 1, 2);
        }
        this.finish(l);
        this.launches.splice(i, 1);
      }
    }
    void rt;
  }

  dispose(): void {
    this.flushLaunches();
    this.offs.forEach((f) => f());
    this.offs.length = 0;
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    this.haulBatch.dispose();
    this.rocketBatch.dispose();
    this.sprites.dispose();
    this.smoke.dispose();
    this.flames.dispose();
    if (this.trail) this.trail.geometry.dispose();
    this.trailMat.dispose();
    this.orbs.clear();
    this.group.removeFromParent();
  }
}

function slerp(a: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  const d = Math.max(-1, Math.min(1, a.dot(b)));
  const th = Math.acos(d);
  if (th < 1e-5) return out.copy(a);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);
}
