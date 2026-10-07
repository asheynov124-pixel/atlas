/**
 * OWNER: god.
 * The building blocks of every god power:
 *   PowerSpec  — a GodPowerDef + `run(ctx)` that starts an Effect (or applies instantly and returns null)
 *   PowerCtx   — everything a power needs (game, planet, ops, view, fx, resolved target, intensity, rng, god)
 *   Effect     — a running power: `step(dt)` every frame until `done`, then `end()` (always called once, even
 *                when interrupted). Helpers keep effects short: owned FX objects / beams / loops are released
 *                automatically, timers, surface positions, damage report.
 */
import { Vector3 } from 'three';
import type { Game } from '../game/Game';
import type { LoopName, SfxName } from '../core/types';
import type { LoopHandle } from '../audio/AudioEngine';
import { Rng } from '../core/rng';
import { tileNormal } from '../world/geo';
import type { Planet } from '../world/planet';
import type { PlanetOps } from '../world/ops';
import type { PlanetView } from '../render/PlanetView';
import type { FxLayer, FxObject } from '../render/fx/FxLayer';
import type { Beam } from '../render/fx/beams';
import type { GodPowerDef, GodPowers, GodTarget } from './GodPowers';
import type { DamageReport } from './damage';

export interface PowerCtx {
  game: Game;
  god: GodPowers;
  planet: Planet;
  ops: PlanetOps;
  view: PlanetView;
  fx: FxLayer;
  def: PowerSpec;
  /** resolved target: `tile` is always a valid tile for tile/drag powers; `path` for drag powers */
  target: Required<Pick<GodTarget, 'tile'>> & GodTarget;
  /** 0.5 … 2 (God panel slider; random disasters roll their own) */
  intensity: number;
  rng: Rng;
  /** true when the scheduler started it (natural disaster) */
  natural: boolean;
  /** the variant picked in the God panel (powers with `choices`) */
  choice?: string;
}

export interface PowerSpec extends GodPowerDef {
  /** start the power; return an Effect to keep it running, or null when it applied instantly */
  run(ctx: PowerCtx): Effect | null;
  /** optional target fix-up (e.g. tsunami moves the epicentre offshore); return false to refuse */
  resolve?(ctx: PowerCtx): boolean;
}

const _v = new Vector3();

export abstract class Effect {
  /** seconds since start (FX clock) */
  t = 0;
  done = false;
  /** 0..1 for the HUD chip (-1 = indeterminate) */
  progress = -1;
  readonly report: DamageReport = { destroyed: 0, displaced: 0, burned: 0, flooded: 0, frozen: 0, tiles: 0 };
  /** unique key for UI lists */
  readonly key: number;
  private owned: FxObject[] = [];
  private beamsOwned: Beam[] = [];
  private loops: LoopHandle[] = [];
  private timers = new Map<string, number>();
  private ended = false;
  private static seq = 1;

  constructor(readonly ctx: PowerCtx) {
    this.key = Effect.seq++;
  }

  get fx(): FxLayer {
    return this.ctx.fx;
  }
  get planet(): Planet {
    return this.ctx.planet;
  }
  get ops(): PlanetOps {
    return this.ctx.ops;
  }
  get god(): GodPowers {
    return this.ctx.god;
  }
  get rng(): Rng {
    return this.ctx.rng;
  }
  get k(): number {
    return this.ctx.intensity;
  }
  get R(): number {
    return this.ctx.planet.radius;
  }

  /** advance; never throws out (GodPowers catches) */
  abstract step(dt: number): void;
  /** cleanup hook for subclasses (FX owned via own()/beam()/loop() are released automatically) */
  protected cleanup(): void {}

  /** Called exactly once when the effect finishes or is stopped. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    try {
      this.cleanup();
    } catch (e) {
      console.error('[god] effect cleanup failed', e);
    }
    for (const o of this.owned) this.ctx.fx.remove(o);
    for (const b of this.beamsOwned) b.release();
    for (const l of this.loops) {
      try {
        l.stop(0.8);
      } catch {
        /* ignore */
      }
    }
    this.owned = [];
    this.beamsOwned = [];
    this.loops = [];
  }

  // ─────────────────────────────────────────────── helpers

  /** Register an FX object (added to the layer) to be disposed when the effect ends. */
  own<T extends FxObject>(o: T): T {
    this.owned.push(o);
    this.ctx.fx.add(o);
    return o;
  }
  /** Release an owned FX object early. */
  drop(o: FxObject | null | undefined): void {
    if (!o) return;
    const i = this.owned.indexOf(o);
    if (i >= 0) this.owned.splice(i, 1);
    this.ctx.fx.remove(o);
  }
  beam(): Beam {
    const b = this.ctx.fx.beams.get();
    this.beamsOwned.push(b);
    return b;
  }
  releaseBeam(b: Beam | null): void {
    if (!b) return;
    b.release();
    const i = this.beamsOwned.indexOf(b);
    if (i >= 0) this.beamsOwned.splice(i, 1);
  }
  loop(name: LoopName, volume = 0.6): LoopHandle {
    const h = this.ctx.god.loop(name, volume);
    this.loops.push(h);
    return h;
  }
  sfx(name: SfxName, volume = 1, pitch = 1): void {
    this.ctx.god.sfx(name, volume, pitch);
  }

  /** True every `interval` seconds (per key). */
  every(key: string, interval: number, dt: number): boolean {
    const v = (this.timers.get(key) ?? 0) - dt;
    if (v <= 0) {
      this.timers.set(key, v + interval);
      return true;
    }
    this.timers.set(key, v);
    return false;
  }
  /** True once, the first frame t passes `at`. */
  once(key: string, at: number): boolean {
    if (this.t < at || this.timers.has('once:' + key)) return false;
    this.timers.set('once:' + key, 1);
    return true;
  }

  /** Surface position of a tile (terrain top or sea surface) + extra. */
  pos(tile: number, out = new Vector3(), extra = 0): Vector3 {
    return this.ctx.fx.surface(tile, out, extra);
  }
  nrm(tile: number, out = new Vector3()): Vector3 {
    return tileNormal(this.planet, tile, out);
  }
  /** World point on the sphere in direction `dir` at altitude `alt` above sea level. */
  at(dir: Vector3, alt: number, out = new Vector3()): Vector3 {
    return out.copy(dir).normalize().multiplyScalar(this.R + alt);
  }
  /** Tile under a world point. */
  tileAt(p: Vector3): number {
    return this.planet.grid.tileAt(p.x, p.y, p.z);
  }
  /** Random tile within `angle` radians of tile c (uniform-ish on the cap). */
  randomTileNear(c: number, angle: number): number {
    const n = this.nrm(c, _v);
    const a = Math.sqrt(this.rng.next()) * angle;
    const az = this.rng.next() * Math.PI * 2;
    const t1 = new Vector3(0, 1, 0);
    if (Math.abs(n.y) > 0.9) t1.set(1, 0, 0);
    const e1 = t1.cross(n).normalize();
    const e2 = new Vector3().crossVectors(n, e1);
    const d = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(e1, Math.sin(a) * Math.cos(az)).addScaledVector(e2, Math.sin(a) * Math.sin(az));
    return this.planet.grid.tileAt(d.x, d.y, d.z);
  }
}

/** Instant power helper: wrap a function as a run() that returns null. */
export function instant(fn: (ctx: PowerCtx) => void): (ctx: PowerCtx) => null {
  return (ctx) => {
    fn(ctx);
    return null;
  };
}
