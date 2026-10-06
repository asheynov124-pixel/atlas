/**
 * OWNER: roads-props.
 * RoadRenderer — draws the road / rail network from planet.road + planet.roadLinks.
 *
 *   • The planet is split into ~100-tile chunks (nearest cell of a coarse hex grid). Each chunk is ONE merged mesh
 *     with the shared building material (lamps, neon rails and light pools come free from its material channels),
 *     rebuilt only when tiles in or next to it change (tiles:road · tiles:terrain · tiles:flags · planet:sea).
 *     Rebuilds are time-sliced (a few ms per frame) so dragging a road or terraforming never hitches.
 *   • Geometry per tile comes from RoadBuilder (lanes, markings, crosswalks, signals, lamps, bridges, ramps, rails,
 *     tubes) which positions everything through render/roads/lanes.ts — the lane contract the life role drives on.
 *   • Avenue medians and roundabout islands get real swaying trees through a small InstancePool (species follow the
 *     planet type: palms on desert worlds, glowing mushrooms on fungal worlds…).
 *   • Chunks behind the horizon are hidden; three.js frustum-culls the rest with each chunk's bounding sphere.
 *   • Tile flags bake into the per-vertex aState: burning, frozen, goo, irradiated, blessed and scorched roads.
 *
 * CONTRACT: update(dt), dispose(). Extra: `group` (all road meshes), `stats()`, `rebuildAll()`.
 * Lane helpers for traffic: see ./lanes.ts.
 */
import { BufferGeometry, Group, Matrix4, Mesh, Vector3 } from 'three';
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { MeshBuilder } from '../../content/kit';
import { getGeometry } from '../../content/catalog';
import { drawTree, type TreeSpecies } from '../../content/meshes/props/trees';
import { streetTreeFor } from '../../content/meshes/props/nature';
import { getGrid } from '../../world/hexsphere';
import type { Planet } from '../../world/planet';
import { InstancePool } from '../InstancePool';
import { getBuildingMaterial } from '../materials';
import type { PlanetView } from '../PlanetView';
import { GeoWriter } from './GeoWriter';
import { GlowWriter, getGlowMaterial } from './glow';
import { FURN_STRIDE, Furn, buildRoadTile, type RoadBuildOut } from './RoadBuilder';

const _m = new Matrix4();
const _cam = new Vector3();
const TREE_VARIANTS = 3;
/** instanced street furniture → decor catalog item */
const FURN_ITEMS: Record<number, string> = {
  [Furn.Bench]: 'item:decor.bench',
  [Furn.Shelter]: 'item:decor.busstop',
  [Furn.Hydrant]: 'item:decor.hydrant',
  [Furn.Bins]: 'item:decor.bins',
};

interface Chunk {
  tiles: Int32Array;
  /** unit centre direction */
  dir: Vector3;
  /** angular radius (radians) */
  angle: number;
  mesh: Mesh | null;
  /** additive night glow (light pools, halos) */
  glow: Mesh | null;
  trees: number[];
  roads: number;
}

export class RoadRenderer {
  readonly group = new Group();
  private planet: Planet;
  private chunkOf: Uint16Array;
  /** elevation snapshot: tiles:terrain also fires for feature/biome edits, which never affect roads */
  private elev: Int8Array;
  private chunks: Chunk[] = [];
  private dirty = new Set<number>();
  private writer = new GeoWriter();
  private glowWriter = new GlowWriter();
  private treeSpots: number[] = [];
  private trees: InstancePool;
  private treeGeo = new Map<string, BufferGeometry>();
  private species: TreeSpecies;
  private offs: (() => void)[] = [];
  private failed = false;
  private lastCamDir = new Vector3(2, 0, 0);
  private lastCamDist = 0;

  constructor(private view: PlanetView) {
    const p = view.planet;
    this.planet = p;
    this.group.name = 'roads';
    view.root.add(this.group);
    this.species = streetTreeFor(p.spec.type);
    this.trees = new InstancePool(this.group, getBuildingMaterial(), (key, lod) => this.treeGeometry(key, lod), {
      lodDistance: 45,
      castShadow: true,
      name: 'road-trees',
    });

    // ── chunking: nearest cell of a coarse hex grid (~100 tiles per chunk)
    const cf = Math.max(2, Math.round(p.grid.frequency / 10));
    const cg = getGrid(cf);
    this.chunkOf = new Uint16Array(p.count);
    this.elev = Int8Array.from(p.elevation);
    const counts = new Int32Array(cg.count);
    const C = p.grid.center;
    let hint = 0;
    for (let t = 0; t < p.count; t++) {
      const c = cg.tileAt(C[t * 3], C[t * 3 + 1], C[t * 3 + 2], hint);
      hint = c;
      this.chunkOf[t] = c;
      counts[c]++;
    }
    const lists = Array.from(counts, (n) => new Int32Array(n));
    const fill = new Int32Array(cg.count);
    for (let t = 0; t < p.count; t++) {
      const c = this.chunkOf[t];
      lists[c][fill[c]++] = t;
    }
    for (let c = 0; c < cg.count; c++) {
      const dir = new Vector3(cg.center[c * 3], cg.center[c * 3 + 1], cg.center[c * 3 + 2]);
      let minDot = 1;
      for (const t of lists[c]) {
        const d = C[t * 3] * dir.x + C[t * 3 + 1] * dir.y + C[t * 3 + 2] * dir.z;
        if (d < minDot) minDot = d;
      }
      this.chunks.push({ tiles: lists[c], dir, angle: Math.acos(Math.max(-1, Math.min(1, minDot))) + 0.02, mesh: null, glow: null, trees: [], roads: 0 });
    }

    // ── initial build (synchronous: the planet is loading anyway)
    for (let c = 0; c < this.chunks.length; c++) {
      const ch = this.chunks[c];
      for (const t of ch.tiles)
        if (p.road[t]) {
          this.rebuild(c);
          break;
        }
    }

    this.offs.push(
      bus.on('tiles:road', ({ tiles }) => this.markTiles(tiles, true)),
      bus.on('tiles:terrain', ({ tiles }) => this.markTerrain(tiles)),
      bus.on('tiles:flags', ({ tiles }) => this.markTiles(tiles.filter((t) => this.planet.road[t] !== 0), false)),
      bus.on('planet:sea', () => this.markAll()),
    );
  }

  /** Force a full rebuild (e.g. after bulk edits). */
  rebuildAll(): void {
    for (let c = 0; c < this.chunks.length; c++) this.rebuild(c);
  }

  stats(): { chunks: number; triangles: number; trees: number } {
    let chunks = 0, triangles = 0;
    for (const ch of this.chunks)
      if (ch.mesh) {
        chunks++;
        triangles += (ch.mesh.geometry.index?.count ?? 0) / 3;
      }
    return { chunks, triangles, trees: this.trees.size };
  }

  // ───────────────────────────────────────────── invalidation

  private markTiles(tiles: number[], withNeighbours: boolean): void {
    const g = this.planet.grid;
    for (const t of tiles) {
      if (t < 0 || t >= this.planet.count) continue;
      this.dirty.add(this.chunkOf[t]);
      if (withNeighbours) for (let q = g.start[t]; q < g.start[t + 1]; q++) this.dirty.add(this.chunkOf[g.nbr[q]]);
    }
  }

  private markTerrain(tiles: number[]): void {
    const p = this.planet;
    const g = p.grid;
    for (const t of tiles) {
      if (t < 0 || t >= p.count) continue;
      if (this.elev[t] === p.elevation[t]) continue;
      this.elev[t] = p.elevation[t];
      let near = p.road[t] !== 0;
      if (!near) for (let q = g.start[t]; q < g.start[t + 1]; q++) if (p.road[g.nbr[q]]) near = true;
      if (!near) continue;
      this.dirty.add(this.chunkOf[t]);
      for (let q = g.start[t]; q < g.start[t + 1]; q++) this.dirty.add(this.chunkOf[g.nbr[q]]);
    }
  }

  private markAll(): void {
    for (let c = 0; c < this.chunks.length; c++) if (this.chunks[c].roads > 0 || this.chunks[c].mesh) this.dirty.add(c);
  }

  // ───────────────────────────────────────────── building

  private rebuild(c: number): void {
    const ch = this.chunks[c];
    const p = this.planet;
    const w = this.writer;
    w.reset();
    this.glowWriter.reset();
    this.treeSpots.length = 0;
    const out: RoadBuildOut = { w, glow: this.glowWriter, trees: this.treeSpots };
    let roads = 0;
    for (const t of ch.tiles) {
      if (!p.road[t]) continue;
      roads++;
      try {
        buildRoadTile(p, t, out);
      } catch (err) {
        if (!this.failed) console.error('[roads] tile build failed', t, err);
        this.failed = true;
      }
    }
    ch.roads = roads;
    // swap geometry
    if (ch.mesh) {
      this.group.remove(ch.mesh);
      ch.mesh.geometry.dispose();
      ch.mesh = null;
    }
    if (ch.glow) {
      this.group.remove(ch.glow);
      ch.glow.geometry.dispose();
      ch.glow = null;
    }
    const glowGeo = roads ? this.glowWriter.build() : null;
    if (glowGeo) {
      const gm = new Mesh(glowGeo, getGlowMaterial());
      gm.name = `road-glow:${c}`;
      gm.renderOrder = 2;
      gm.matrixAutoUpdate = false;
      this.group.add(gm);
      ch.glow = gm;
    }
    const geo = roads ? w.build() : null;
    if (geo) {
      const mesh = new Mesh(geo, getBuildingMaterial());
      mesh.name = `roads:${c}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
      ch.mesh = mesh;
    }
    // trees
    for (const h of ch.trees) this.trees.remove(h);
    ch.trees.length = 0;
    const S = this.treeSpots;
    for (let i = 0; i + FURN_STRIDE <= S.length; i += FURN_STRIDE) {
      const kind = S[i];
      const seed = S[i + 11] >>> 0;
      const key = kind === Furn.Tree ? `${this.species}|${seed % TREE_VARIANTS}` : FURN_ITEMS[kind] ?? FURN_ITEMS[Furn.Bins];
      const hasFwd = S[i + 7] !== 0 || S[i + 8] !== 0 || S[i + 9] !== 0;
      if (hasFwd) fwdMatrix(S[i + 1], S[i + 2], S[i + 3], S[i + 4], S[i + 5], S[i + 6], S[i + 7], S[i + 8], S[i + 9], S[i + 10], _m);
      else upMatrix(S[i + 1], S[i + 2], S[i + 3], S[i + 4], S[i + 5], S[i + 6], ((seed >>> 3) % 628) / 100, S[i + 10], _m);
      ch.trees.push(this.trees.add(key, _m, 0xffffff, kind === Furn.Tree ? 0.6 : 0.35));
    }
  }

  private treeGeometry(key: string, lod: 0 | 1): BufferGeometry | null {
    // street furniture reuses the decor catalog meshes (cached & owned by the catalog)
    if (key.startsWith('item:')) return getGeometry(key.slice(5), { lod });
    const k = key + '#' + lod;
    let g = this.treeGeo.get(k);
    if (g) return g;
    const [sp, v] = key.split('|');
    const b = new MeshBuilder(lod);
    try {
      drawTree(b, sp as TreeSpecies, new Rng(1000 + Number(v) * 97), {});
      g = b.build();
    } catch (err) {
      console.error('[roads] tree geometry failed', key, err);
      return null;
    }
    this.treeGeo.set(k, g);
    return g;
  }

  // ───────────────────────────────────────────── frame

  update(_dt: number): void {
    try {
      if (this.dirty.size) {
        const t0 = performance.now();
        for (const c of this.dirty) {
          this.dirty.delete(c);
          this.rebuild(c);
          if (performance.now() - t0 > 5) break;
        }
      }
      this.cullHorizon();
      this.trees.update(this.view.camera, this.planet.radius);
    } catch (err) {
      if (!this.failed) console.error('[roads] update failed', err);
      this.failed = true;
    }
  }

  /** Hide chunks entirely behind the planet's horizon (cheap: only chunks that have a mesh). */
  private cullHorizon(): void {
    const cam = this.view.camera;
    _cam.setFromMatrixPosition(cam.matrixWorld);
    const d = _cam.length();
    if (d < 1e-6) return;
    _cam.multiplyScalar(1 / d);
    if (_cam.distanceToSquared(this.lastCamDir) < 1e-7 && Math.abs(d - this.lastCamDist) < 1e-3) return;
    this.lastCamDir.copy(_cam);
    this.lastCamDist = d;
    const R = this.planet.radius;
    const horizon = d > R ? Math.acos(Math.min(1, R / d)) : Math.PI;
    for (const ch of this.chunks) {
      if (!ch.mesh) continue;
      const a = Math.acos(Math.max(-1, Math.min(1, ch.dir.dot(_cam))));
      ch.mesh.visible = a < horizon + ch.angle + 0.08;
      if (ch.glow) ch.glow.visible = ch.mesh.visible;
    }
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.offs.length = 0;
    for (const ch of this.chunks) {
      if (ch.mesh) {
        ch.mesh.geometry.dispose();
        this.group.remove(ch.mesh);
        ch.mesh = null;
      }
      if (ch.glow) {
        ch.glow.geometry.dispose();
        this.group.remove(ch.glow);
        ch.glow = null;
      }
    }
    this.trees.dispose();
    for (const g of this.treeGeo.values()) g.dispose();
    this.treeGeo.clear();
    this.group.removeFromParent();
  }
}

const _up = new Vector3();
const _f = new Vector3();
const _r = new Vector3();

/** Matrix standing at p with local +Y = up and +Z = forward (projected tangent), uniform scale s. */
function fwdMatrix(px: number, py: number, pz: number, ux: number, uy: number, uz: number, fx: number, fy: number, fz: number, s: number, out: Matrix4): Matrix4 {
  _up.set(ux, uy, uz).normalize();
  _f.set(fx, fy, fz).addScaledVector(_up, -(fx * _up.x + fy * _up.y + fz * _up.z)).normalize();
  _r.crossVectors(_up, _f).normalize();
  out.set(_r.x * s, _up.x * s, _f.x * s, px, _r.y * s, _up.y * s, _f.y * s, py, _r.z * s, _up.z * s, _f.z * s, pz, 0, 0, 0, 1);
  return out;
}

/** Matrix standing at p with local +Y = up, yawed by `yaw`, uniform scale s. */
function upMatrix(px: number, py: number, pz: number, ux: number, uy: number, uz: number, yaw: number, s: number, out: Matrix4): Matrix4 {
  _up.set(ux, uy, uz).normalize();
  _f.set(0, 1, 0);
  if (Math.abs(_up.y) > 0.9) _f.set(1, 0, 0);
  _f.addScaledVector(_up, -_f.dot(_up)).normalize();
  _r.crossVectors(_up, _f).normalize();
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const fx = _f.x * c + _r.x * sn, fy = _f.y * c + _r.y * sn, fz = _f.z * c + _r.z * sn;
  const rx = _r.x * c - _f.x * sn, ry = _r.y * c - _f.y * sn, rz = _r.z * c - _f.z * sn;
  out.set(rx * s, _up.x * s, fx * s, px, ry * s, _up.y * s, fy * s, py, rz * s, _up.z * s, fz * s, pz, 0, 0, 0, 1);
  return out;
}
