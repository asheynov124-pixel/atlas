/**
 * OWNER: god.
 * FxLayer — the disaster & god-power effects layer of a PlanetView. Owns a Group under view.root (planet-fixed,
 * `planetGroup`) and one under view.scene (`worldGroup`, for things in space), plus the shared toolkit:
 *
 *   particles  GpuParticles  — analytic GPU points (fire, smoke, sparks, dust, rain, snow, magic…) · 2 draw calls
 *   debris     Debris        — instanced tumbling chunks with gravity toward the planet centre, bounce & splash
 *   flyers     Flyers        — whole buildings ripped off the ground, driven by behaviour callbacks
 *   beams      BeamPool      — energy cylinders (tractor beams, lasers, divine light, cracker beam, jets)
 *   bolts      Bolts         — forked lightning ribbons
 *   shell()    Shell         — planet-conforming shockwaves, tsunami walls, cyclones, glows, fronts, veils
 *   tornado()  Tornado       — the funnel + CPU vortex debris
 *   cracks     Cracks        — fissures hugging the terrain (lazy; one draw call shared by every effect)
 *   add(obj)                 — any custom FxObject (creatures, black hole, planet halves…) updated & disposed here
 *
 * Time: `time` is the FX clock (seconds) — it advances by dt × `timeScale` (GodPowers freezes it while a photo is
 * composed on a paused game). Particle counts / pools scale with the engine quality tier (Low → Ultra).
 * Everything is disposed with the view; `clearAll()` wipes running visuals (rewind).
 */
import { Group, Vector2, Vector3, type Camera, type PerspectiveCamera } from 'three';
import { game } from '../../game/instance';
import { tileNormal } from '../../world/geo';
import type { Planet } from '../../world/planet';
import { InstState } from '../materials';
import type { PlanetView } from '../PlanetView';
import { BeamPool, Bolts } from './beams';
import { Debris } from './debris';
import { Flyers } from './flyers';
import { Cracks } from './ground';
import { GpuParticles, PRESETS, fxRand } from './particles';
import { Shell, type ShellModeId } from './shells';
import { Tornado } from './vortex';

/** Anything an effect adds to the layer. */
export interface FxObject {
  update(dt: number, time: number): void;
  dispose(): void;
}

const ADD_CAP = [2500, 5000, 9000, 14000];
const ALPHA_CAP = [2000, 4500, 8000, 12000];
const DENSITY = [0.45, 0.75, 1, 1.25];
const DEBRIS_CAP = [80, 150, 260, 400];
const FLYER_CAP = [10, 16, 24, 32];

const _size = new Vector2();
const _v = new Vector3();
const _n = new Vector3();

export class FxLayer {
  readonly planetGroup = new Group();
  readonly worldGroup = new Group();
  readonly planet: Planet;
  readonly particles: GpuParticles;
  readonly debris: Debris;
  readonly flyers: Flyers;
  readonly beams: BeamPool;
  readonly bolts: Bolts;
  /** shared pixel scale for point sprites (world size → pixels at distance 1) */
  readonly pointScale = { value: 600 };
  /** FX clock (seconds) */
  time = 0;
  /** multiplier on dt (0 freezes every effect) */
  timeScale = 1;
  readonly tier: number;
  private objects = new Set<FxObject>();
  private maxPoint = 256;
  private disposed = false;
  private _cracks: Cracks | null = null;
  /** objects that survive clearAll() (moons / rings a god created — they live until the view is rebuilt) */
  private keep = new Set<FxObject>();

  constructor(readonly view: PlanetView) {
    this.planet = view.planet;
    this.planetGroup.name = 'fx-planet';
    this.worldGroup.name = 'fx-world';
    view.root.add(this.planetGroup);
    view.scene.add(this.worldGroup);
    let tier = 2;
    try {
      tier = game?.engine?.tier ?? 2;
    } catch {
      tier = 2;
    }
    this.tier = Math.max(0, Math.min(3, tier));
    this.particles = new GpuParticles(this.planetGroup, ADD_CAP[this.tier], ALPHA_CAP[this.tier]);
    this.particles.density = DENSITY[this.tier];
    this.particles.uniforms.uScale = this.pointScale;
    this.debris = new Debris(this.planetGroup, DEBRIS_CAP[this.tier], this.planet);
    this.flyers = new Flyers(this.planetGroup, FLYER_CAP[this.tier]);
    this.beams = new BeamPool(this.planetGroup);
    this.bolts = new Bolts(this.planetGroup, 8);
    // dust puffs where heavy chunks land
    this.debris.onImpact = (x, y, z, water, speed) => {
      if (fxRand() > 0.35) return;
      _v.set(x, y, z);
      _n.copy(_v).normalize();
      this.particles.emit(water ? PRESETS.splash : PRESETS.dust, _v, _n, water ? 3 : 2, Math.min(1.5, speed / 10), 0.6);
    };
    try {
      const gl = game?.engine?.renderer.getContext();
      const range = gl?.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | undefined;
      if (range && range[1] > 1) this.maxPoint = Math.min(511, range[1]);
    } catch {
      /* default */
    }
  }

  /** Shared fissure ribbons (created on first use). */
  get cracks(): Cracks {
    if (!this._cracks) this._cracks = new Cracks(this.planetGroup, [400, 700, 1000, 1400][this.tier]);
    return this._cracks;
  }

  /** Quality-scaled count helper. */
  q(n: number): number {
    return Math.max(1, Math.round(n * DENSITY[this.tier]));
  }

  // ─────────────────────────────────────────────── objects

  add<T extends FxObject>(o: T): T {
    this.objects.add(o);
    return o;
  }

  /** Add an object that outlives running effects (cleared only when the view is disposed). */
  addPersistent<T extends FxObject>(o: T): T {
    this.keep.add(o);
    return this.add(o);
  }

  remove(o: FxObject | null | undefined): void {
    if (!o || !this.objects.has(o)) return;
    this.objects.delete(o);
    this.keep.delete(o);
    try {
      o.dispose();
    } catch (e) {
      console.error('[fx] dispose failed', e);
    }
  }

  /** A planet-conforming shell effect (auto-updated clock). Remove with `remove(shell)`. */
  shell(mode: ShellModeId, radial = 48, around = 192): Shell & FxObject {
    const s = new Shell(this.planetGroup, mode, radial, around) as Shell & FxObject;
    s.update = (_dt: number, time: number) => {
      s.u.uTime.value = time;
    };
    return this.add(s);
  }

  tornado(color?: number, color2?: number): Tornado & FxObject {
    const t = new Tornado(this.planetGroup, this.pointScale, color, color2) as Tornado & FxObject;
    const upd = t.update.bind(t);
    t.update = (dt: number) => upd(dt);
    return this.add(t);
  }

  // ─────────────────────────────────────────────── helpers

  /** Surface point of a tile (top of terrain or sea surface) + extra height. */
  surface(tile: number, out = new Vector3(), extra = 0): Vector3 {
    const p = this.planet;
    tileNormal(p, tile, out);
    const h = p.isWater(tile) ? p.waterHeight : p.heightOf(tile);
    return out.multiplyScalar(p.radius + h + extra);
  }

  /** A generic explosion: flash, fireball, smoke, sparks, a ground ring and burning chunks. */
  blast(pos: Vector3, normal: Vector3, size = 1, o: { debris?: number; smoke?: boolean; color?: number } = {}): void {
    const P = this.particles;
    P.emit(PRESETS.flash, pos, normal, 1, 0, size);
    P.emit(PRESETS.ring, pos, normal, 1, 0, size);
    P.emit(PRESETS.bigFire, pos, normal, 6 * size, size, Math.sqrt(size));
    P.emit(PRESETS.spark, pos, normal, 14 * size, Math.sqrt(size));
    P.emit(PRESETS.ember, pos, normal, 10 * size, Math.sqrt(size));
    if (o.smoke !== false) P.emit(PRESETS.darkSmoke, pos, normal, 5 * size, Math.sqrt(size), Math.sqrt(size));
    const n = o.debris ?? Math.round(6 * size);
    if (n > 0) this.debris.burst(pos, normal, Math.min(n, 40), 7 + 5 * Math.sqrt(size), { state: InstState.Burning, color: o.color ?? 0x5a5048, size: 0.3 + 0.15 * size }, 0.9);
  }

  /** Dust burst for collapses (no fire). */
  collapse(pos: Vector3, normal: Vector3, size = 1, color = 0x8a8378): void {
    const P = this.particles;
    P.emit(PRESETS.bigDust, pos, normal, 4 * size, Math.sqrt(size), Math.sqrt(size));
    P.emit(PRESETS.dust, pos, normal, 8 * size, Math.sqrt(size));
    this.debris.burst(pos, normal, Math.min(24, Math.round(5 * size)), 4 + 2 * size, { color, size: 0.28 + 0.1 * size }, 1.1);
  }

  // ─────────────────────────────────────────────── frame

  update(dt: number): void {
    if (this.disposed) return;
    const fdt = dt * this.timeScale;
    this.time += fdt;
    const t = this.time;
    // point sprite pixel scale
    try {
      const r = game?.engine?.renderer;
      const cam = this.view.camera as PerspectiveCamera & Camera;
      if (r) {
        r.getDrawingBufferSize(_size);
        this.pointScale.value = _size.y * 0.5 * cam.projectionMatrix.elements[5];
        this.particles.uniforms.uMaxSize.value = Math.min(this.maxPoint, _size.y * 0.45);
        this.particles.uniforms.uAspect.value = cam.projectionMatrix.elements[5] / Math.max(1e-6, cam.projectionMatrix.elements[0]);
      }
    } catch {
      /* keep last */
    }
    this.particles.now = t;
    try {
      this.debris.update(fdt);
      this.flyers.update(fdt);
      this.bolts.update(fdt);
      this.beams.update(t);
      this._cracks?.update(fdt, t);
    } catch (e) {
      console.error('[fx] toolkit update failed', e);
    }
    for (const o of this.objects) {
      try {
        o.update(fdt, t);
      } catch (e) {
        console.error('[fx] object update failed', e);
        this.remove(o);
      }
    }
    this.particles.flush();
  }

  /** Remove every running visual (rewind / planet change). */
  clearAll(): void {
    for (const o of [...this.objects]) if (!this.keep.has(o)) this.remove(o);
    this.particles.clear();
    this.debris.clear();
    this.flyers.clear();
    this.bolts.clear();
    this.beams.releaseAll();
    this._cracks?.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const o of [...this.objects]) this.remove(o);
    this.particles.dispose();
    this.debris.dispose();
    this.flyers.dispose();
    this.beams.dispose();
    this.bolts.dispose();
    this._cracks?.dispose();
    this._cracks = null;
    this.planetGroup.removeFromParent();
    this.worldGroup.removeFromParent();
  }
}
