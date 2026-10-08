/**
 * BuildingRenderer — draws every BuildingInstance of the active planet through one InstancePool (FOUNDATION).
 * Reacts to bus events; supports pop-in animation, per-building visual states and selection highlight.
 */
import { Matrix4 } from 'three';
import { bus } from '../core/events';
import { BuildingState, TileFlag } from '../core/types';
import { getGeometry, getItem, meshKey } from '../content/catalog';
import { tileMatrix } from '../world/geo';
import type { BuildingInstance } from '../world/planet';
import { InstancePool } from './InstancePool';
import { game } from '../game/instance';
import { InstState, getBuildingMaterial } from './materials';
import type { PlanetView } from './PlanetView';

interface KeyInfo {
  defId: string;
  variant: number;
  level: number;
  style: BuildingInstance['style'];
}

const _m = new Matrix4();

export class BuildingRenderer {
  readonly pool: InstancePool;
  private handles = new Map<number, number>();
  private keys = new Map<string, KeyInfo>();
  private anims = new Map<number, { t: number; dur: number }>();
  /** externally forced visual states (god powers) by building id */
  private forced = new Map<number, number>();
  private selected = -1;
  private offs: (() => void)[] = [];
  /** buildings the sim reports without power (blackout look at night) — swept a slice per frame */
  private unpowered = new Set<number>();
  private sweepIds: number[] = [];
  private sweepAt = 0;

  constructor(private view: PlanetView) {
    this.pool = new InstancePool(view.root, getBuildingMaterial(), (key, lod) => this.geometryFor(key, lod), {
      lodDistance: 55,
      name: 'buildings',
      castShadow: true,
      receiveShadow: true,
    });
    const p = view.planet;
    for (const b of p.buildings.values()) this.add(b, false);
    this.offs.push(
      bus.on('building:added', ({ id }) => {
        const b = view.planet.buildings.get(id);
        if (b) this.add(b, true);
      }),
      bus.on('building:removed', ({ id }) => this.remove(id)),
      bus.on('building:updated', ({ id, what }) => this.refresh(id, what === 'level' || what === 'variant' || what === 'style')),
      bus.on('tiles:terrain', ({ tiles }) => this.refreshTiles(tiles)),
      bus.on('tiles:flags', ({ tiles }) => this.refreshTiles(tiles)),
      bus.on('selection:changed', ({ selection }) => {
        const prev = this.selected;
        this.selected = selection?.kind === 'building' ? selection.id : -1;
        if (prev >= 0) this.applyState(prev);
        if (this.selected >= 0) this.applyState(this.selected);
      }),
    );
  }

  /** Geometry key for a building instance. */
  keyFor(b: BuildingInstance): string {
    const def = getItem(b.defId);
    if (!def) return `missing|${b.defId}`;
    const key = meshKey(def, { variant: b.variant, level: b.level, style: b.style });
    if (!this.keys.has(key)) this.keys.set(key, { defId: b.defId, variant: b.variant, level: b.level, style: b.style });
    return key;
  }

  private geometryFor(key: string, lod: 0 | 1) {
    const k = this.keys.get(key);
    if (!k) return null;
    return getGeometry(k.defId, { variant: k.variant, level: k.level, style: k.style, lod });
  }

  /** World matrix for a building (optionally squashed for animations). */
  matrixFor(b: BuildingInstance, out = new Matrix4(), scaleY = 1): Matrix4 {
    const p = this.view.planet;
    const def = getItem(b.defId);
    let s = 1;
    if (def?.footprint === 1) {
      const inr = p.grid.inradius[b.tile] * p.radius;
      s = Math.max(0.78, Math.min(1.08, inr / 1.0));
    }
    return tileMatrix(p, b.tile, b.rot, out, { scale: s, scaleY: scaleY / 1 });
  }

  private add(b: BuildingInstance, animate: boolean): void {
    const key = this.keyFor(b);
    const def = getItem(b.defId);
    const radius = def ? (def.footprint === 1 ? 1.2 : def.footprint === 7 ? 3.2 : 5.2) + (def.height ?? 2) * 0.3 : 1.5;
    const h = this.pool.add(key, this.matrixFor(b, _m, animate ? 0.001 : 1), b.tint ?? 0xffffff, radius, this.stateOf(b));
    this.handles.set(b.id, h);
    if (animate) this.anims.set(b.id, { t: 0, dur: 0.55 + Math.random() * 0.25 });
  }

  private remove(id: number): void {
    const h = this.handles.get(id);
    if (h !== undefined) this.pool.remove(h);
    this.handles.delete(id);
    this.anims.delete(id);
    this.forced.delete(id);
    this.unpowered.delete(id);
  }

  /** Re-sync one building (matrix, colour, state, and geometry key when `rekey`). */
  refresh(id: number, rekey = true): void {
    const b = this.view.planet.buildings.get(id);
    const h = this.handles.get(id);
    if (!b || h === undefined) return;
    if (rekey) {
      this.pool.setKey(h, this.keyFor(b));
      this.anims.set(id, { t: 0, dur: 0.45 });
    }
    this.pool.setMatrix(h, this.matrixFor(b, _m, this.anims.has(id) ? 0.001 : 1));
    this.pool.setColor(h, b.tint ?? 0xffffff);
    this.applyState(id);
  }

  private refreshTiles(tiles: number[]): void {
    const p = this.view.planet;
    const ids = new Set<number>();
    for (const t of tiles) if (p.building[t] >= 0) ids.add(p.building[t]);
    for (const id of ids) this.refresh(id, false);
  }

  private stateOf(b: BuildingInstance): number {
    const forced = this.forced.get(b.id);
    if (forced !== undefined) return forced;
    if (b.id === this.selected) return InstState.Highlight;
    const f = this.view.planet.flags[b.tile];
    if (f & TileFlag.Burning || b.state === BuildingState.Burning) return InstState.Burning;
    if (f & TileFlag.Goo) return InstState.Goo;
    if (f & TileFlag.Frozen) return InstState.Frozen;
    if (f & TileFlag.Irradiated) return InstState.Irradiated;
    if (f & TileFlag.Blessed) return InstState.Blessed;
    if (b.state === BuildingState.Abandoned) return InstState.Dark;
    if (b.state === BuildingState.Constructing || b.state === BuildingState.Upgrading) return InstState.Blueprint;
    if (this.unpowered.has(b.id)) return InstState.NoPower;
    return InstState.Normal;
  }

  private applyState(id: number): void {
    const b = this.view.planet.buildings.get(id);
    const h = this.handles.get(id);
    if (b && h !== undefined) this.pool.setState(h, this.stateOf(b));
  }

  /** Force a visual state (InstState) on a building, or clear with null. */
  forceState(id: number, state: number | null): void {
    if (state === null) this.forced.delete(id);
    else this.forced.set(id, state);
    this.applyState(id);
  }

  /** Hide / show a building (e.g. while an FX mesh replaces it). */
  setVisible(id: number, visible: boolean): void {
    const h = this.handles.get(id);
    if (h !== undefined) this.pool.setVisible(h, visible);
  }

  /** Current world matrix of a building's instance (null if unknown). */
  getMatrix(id: number, out = new Matrix4()): Matrix4 | null {
    const h = this.handles.get(id);
    return h === undefined ? null : this.pool.getMatrix(h, out);
  }

  update(dt: number): void {
    if (this.anims.size) {
      for (const [id, a] of this.anims) {
        a.t += dt;
        const b = this.view.planet.buildings.get(id);
        const h = this.handles.get(id);
        if (!b || h === undefined) {
          this.anims.delete(id);
          continue;
        }
        const x = Math.min(1, a.t / a.dur);
        // ease-out-back pop
        const c1 = 1.70158, c3 = c1 + 1;
        const e = 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
        this.pool.setMatrix(h, this.matrixFor(b, _m, Math.max(0.001, e)));
        if (x >= 1) this.anims.delete(id);
      }
    }
    this.sweepPower();
    this.pool.update(this.view.camera, this.view.planet.radius);
  }

  /** Mirror the sim's "no power" problem into the blackout state, a slice of buildings per frame (~1.5 s per sweep). */
  private sweepPower(): void {
    const sim = game?.sim;
    if (!sim || sim.planet !== this.view.planet) return;
    if (this.sweepAt >= this.sweepIds.length) {
      this.sweepIds = [...this.handles.keys()];
      this.sweepAt = 0;
      if (!this.sweepIds.length) return;
    }
    const end = Math.min(this.sweepIds.length, this.sweepAt + Math.max(40, Math.ceil(this.sweepIds.length / 90)));
    for (; this.sweepAt < end; this.sweepAt++) {
      const id = this.sweepIds[this.sweepAt];
      if (!this.handles.has(id)) continue;
      const off = (sim.problemsOf(id) & 1) !== 0;
      if (off === this.unpowered.has(id)) continue;
      if (off) this.unpowered.add(id);
      else this.unpowered.delete(id);
      this.applyState(id);
    }
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.pool.dispose();
  }
}
