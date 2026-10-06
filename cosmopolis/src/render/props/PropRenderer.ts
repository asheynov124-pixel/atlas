/**
 * OWNER: roads-props.
 * PropRenderer — the living landscape and the player's decorations.
 *
 *   Nature   one instanced CLUSTER per feature tile (planet.feature): forests whose species follow the biome AND the
 *            planet type (oaks & birches, taiga, palms, baobabs, cacti, jungle giants, willows, giant glowing
 *            mushrooms, crystal trees, toxic bulb plants, machine pylons…), rocks, ore with metallic glints, glowing
 *            crystal deposits, ice, gas vents with holo plumes, geothermal vents, ancient ruins with rune obelisks,
 *            flower meadows, alien flora, kelp & coral underwater, disaster rubble and crater scars.
 *            Geometry: content/meshes/props/nature.ts (4 deterministic variants per kind, LOD0/LOD1).
 *            Each tile gets a stable random yaw, a pentagon-aware scale and a subtle foliage tint (forest variety).
 *            Features are hidden under buildings and roads and come back when those are removed.
 *   Decor    user props from planet.props (u, v, yaw, scale, tint) using each decor item's catalog mesh.
 *   States   tile flags drive per-instance states: burning forests, frozen, goo, irradiated, blessed, scorched (dark);
 *            the selected prop pulses with the highlight state.
 *
 * Events: tiles:terrain · tiles:road · tiles:flags · building:added/removed · prop:added/removed · selection:changed ·
 * catalog:changed. Tile refreshes are batched and flushed once per frame.
 * CONTRACT: update(dt), dispose(). Extra: `nature` / `decor` pools, `stats()`.
 */
import { BufferGeometry, Matrix4 } from 'three';
import { bus } from '../../core/events';
import { Rng, hash2, hashString } from '../../core/rng';
import { Biome, Feature, TileFlag } from '../../core/types';
import { getGeometry, getItem } from '../../content/catalog';
import { MeshBuilder } from '../../content/kit';
import { drawFeature, drawForest, flavourFor, mixFor } from '../../content/meshes/props/nature';
import { game } from '../../game/instance';
import { tileMatrix } from '../../world/geo';
import type { Planet, PropInstance } from '../../world/planet';
import { InstancePool } from '../InstancePool';
import { InstState, getBuildingMaterial } from '../materials';
import type { PlanetView } from '../PlanetView';

const _m = new Matrix4();
const FOREST_VARIANTS = 4;
const FEATURE_VARIANTS = 3;
/** gentle per-tile foliage tints (multiplied into paintable leaves) */
const TINTS = [0xffffff, 0xf2fff0, 0xfffbea, 0xe9f7e6, 0xfaffe2, 0xf0f6ff];

function stateOf(f: number): number {
  if (f & TileFlag.Burning) return InstState.Burning;
  if (f & TileFlag.Goo) return InstState.Goo;
  if (f & TileFlag.Frozen) return InstState.Frozen;
  if (f & TileFlag.Irradiated) return InstState.Irradiated;
  if (f & TileFlag.Blessed) return InstState.Blessed;
  if (f & TileFlag.Scorched) return InstState.Dark;
  return InstState.Normal;
}

export class PropRenderer {
  readonly nature: InstancePool;
  readonly decor: InstancePool;
  private planet: Planet;
  private natureH: Int32Array;
  private decorH = new Map<number, number>();
  private geo = new Map<string, BufferGeometry | null>();
  private pending = new Set<number>();
  private selected = -1;
  private offs: (() => void)[] = [];
  private failed = false;

  constructor(private view: PlanetView) {
    const p = view.planet;
    this.planet = p;
    const low = (game?.engine?.tier ?? 2) <= 0;
    this.nature = new InstancePool(view.root, getBuildingMaterial(), (k, lod) => this.natureGeometry(k, lod), {
      lodDistance: low ? 38 : 58,
      castShadow: true,
      name: 'nature',
    });
    this.decor = new InstancePool(view.root, getBuildingMaterial(), (k, lod) => this.decorGeometry(k, lod), {
      lodDistance: low ? 30 : 45,
      castShadow: true,
      name: 'decor',
    });
    this.natureH = new Int32Array(p.count).fill(-1);
    for (let t = 0; t < p.count; t++) if (p.feature[t]) this.syncTile(t);
    for (const pr of p.props.values()) this.addProp(pr);

    const queue = (tiles: number[]) => {
      for (const t of tiles) this.pending.add(t);
    };
    this.offs.push(
      bus.on('tiles:terrain', ({ tiles }) => {
        queue(tiles);
        this.refreshPropsOn(tiles);
      }),
      bus.on('tiles:road', ({ tiles }) => queue(tiles)),
      bus.on('tiles:flags', ({ tiles }) => {
        queue(tiles);
        this.refreshPropsOn(tiles);
      }),
      bus.on('building:added', ({ id }) => {
        const b = this.planet.buildings.get(id);
        if (b) queue(b.tiles);
      }),
      bus.on('building:removed', ({ tiles }) => queue(tiles)),
      bus.on('planet:sea', () => {
        for (let t = 0; t < this.planet.count; t++) if (this.planet.feature[t] === Feature.Kelp) this.pending.add(t);
      }),
      bus.on('prop:added', ({ id }) => {
        const pr = this.planet.props.get(id);
        if (pr) this.addProp(pr);
      }),
      bus.on('prop:removed', ({ id }) => this.removeProp(id)),
      bus.on('selection:changed', ({ selection }) => {
        const prev = this.selected;
        this.selected = selection?.kind === 'prop' ? selection.id : -1;
        if (prev >= 0) this.applyPropState(prev);
        if (this.selected >= 0) this.applyPropState(this.selected);
      }),
      bus.on('catalog:changed', () => this.decor.refreshGeometry('d|')),
    );
  }

  stats(): { nature: number; decor: number; geometries: number } {
    return { nature: this.nature.size, decor: this.decor.size, geometries: this.geo.size };
  }

  // ───────────────────────────────────────────── nature

  /** Geometry key for the natural feature on tile t (null = nothing to draw). */
  private keyFor(t: number): string | null {
    const p = this.planet;
    const f = p.feature[t];
    if (!f) return null;
    const type = p.spec.type;
    const biome = p.biome[t];
    if (f === Feature.Trees || f === Feature.DenseTrees) {
      const dense = f === Feature.DenseTrees ? 1 : 0;
      return `t|${mixFor(type, biome)}|${dense}|${hash2(t, 11) % FOREST_VARIANTS}`;
    }
    const coral = f === Feature.Kelp && biome === Biome.Coral ? 'c' : '';
    return `f|${f}|${flavourFor(type, biome)}|${coral}|${hash2(t, 13) % FEATURE_VARIANTS}`;
  }

  private natureGeometry(key: string, lod: 0 | 1): BufferGeometry | null {
    const ck = key + '#' + lod;
    if (this.geo.has(ck)) return this.geo.get(ck)!;
    const b = new MeshBuilder(lod);
    const rng = new Rng(hashString(key));
    let g: BufferGeometry | null = null;
    try {
      const parts = key.split('|');
      if (parts[0] === 't') drawForest(b, parts[1], parts[2] === '1', rng);
      else drawFeature(b, Number(parts[1]), parts[2], rng, parts[3] === 'c' ? Biome.Coral : -1);
      g = b.triangles > 0 ? b.build() : null;
    } catch (err) {
      console.error('[props] feature geometry failed', key, err);
      g = null;
    }
    this.geo.set(ck, g);
    return g;
  }

  private syncTile(t: number): void {
    const p = this.planet;
    const h = this.natureH[t];
    const key = p.building[t] < 0 && p.road[t] === 0 ? this.keyFor(t) : null;
    if (!key) {
      if (h >= 0) this.nature.remove(h);
      this.natureH[t] = -1;
      return;
    }
    const inr = p.grid.inradius[t] * p.radius;
    const scale = Math.max(0.72, Math.min(1.1, inr));
    // kelp grows up to (not through) the sea surface
    let scaleY = 1;
    if (p.feature[t] === Feature.Kelp && p.isWater(t)) scaleY = Math.max(0.25, Math.min(1, (p.waterHeight - p.heightOf(t) - 0.04) / 0.95));
    tileMatrix(p, t, 0, _m, { yaw: (hash2(t, 7) % 6283) / 1000, scale, scaleY });
    const tint = TINTS[hash2(t, 3) % TINTS.length];
    const state = stateOf(p.flags[t]);
    if (h >= 0) {
      this.nature.setKey(h, key);
      this.nature.setMatrix(h, _m);
      this.nature.setColor(h, tint);
      this.nature.setState(h, state);
    } else this.natureH[t] = this.nature.add(key, _m, tint, 1.0 * scale, state);
  }

  // ───────────────────────────────────────────── decor props

  private decorGeometry(key: string, lod: 0 | 1): BufferGeometry | null {
    if (!key.startsWith('d|')) return null;
    return getGeometry(key.slice(2), { lod });
  }

  private propMatrix(pr: PropInstance): Matrix4 {
    return tileMatrix(this.planet, pr.tile, 0, _m, { u: pr.u, v: pr.v, yaw: pr.yaw, scale: pr.scale || 1 });
  }

  private addProp(pr: PropInstance): void {
    const def = getItem(pr.defId);
    if (!def?.mesh || pr.tile < 0 || pr.tile >= this.planet.count) return;
    const old = this.decorH.get(pr.id);
    if (old !== undefined) this.decor.remove(old);
    const radius = Math.max(0.4, (def.height ?? 0.4) * (pr.scale || 1) + 0.2);
    const h = this.decor.add(`d|${pr.defId}`, this.propMatrix(pr), pr.tint ?? 0xffffff, radius, this.propState(pr));
    this.decorH.set(pr.id, h);
  }

  private removeProp(id: number): void {
    const h = this.decorH.get(id);
    if (h !== undefined) this.decor.remove(h);
    this.decorH.delete(id);
    if (this.selected === id) this.selected = -1;
  }

  private propState(pr: PropInstance): number {
    if (pr.id === this.selected) return InstState.Highlight;
    return stateOf(this.planet.flags[pr.tile]);
  }

  private applyPropState(id: number): void {
    const pr = this.planet.props.get(id);
    const h = this.decorH.get(id);
    if (pr && h !== undefined) this.decor.setState(h, this.propState(pr));
  }

  /** Re-seat props on tiles whose height / flags changed. */
  private refreshPropsOn(tiles: number[]): void {
    if (!this.decorH.size) return;
    const set = new Set(tiles);
    for (const pr of this.planet.props.values()) {
      if (!set.has(pr.tile)) continue;
      const h = this.decorH.get(pr.id);
      if (h === undefined) continue;
      this.decor.setMatrix(h, this.propMatrix(pr));
      this.decor.setState(h, this.propState(pr));
    }
  }

  // ───────────────────────────────────────────── frame

  update(_dt: number): void {
    try {
      if (this.pending.size) {
        for (const t of this.pending) if (t >= 0 && t < this.planet.count) this.syncTile(t);
        this.pending.clear();
      }
      const cam = this.view.camera;
      const R = this.planet.radius;
      this.nature.update(cam, R);
      this.decor.update(cam, R);
    } catch (err) {
      if (!this.failed) console.error('[props] update failed', err);
      this.failed = true;
    }
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.offs.length = 0;
    this.nature.dispose();
    this.decor.dispose();
    for (const g of this.geo.values()) g?.dispose();
    this.geo.clear();
    this.decorH.clear();
  }
}
