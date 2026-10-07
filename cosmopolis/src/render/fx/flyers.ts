/**
 * OWNER: god.
 * Flyers — whole buildings ripped from the ground (tornadoes, UFO tractor beams, black holes, kraken, gravity
 * flips). A flyer is a one-instance InstancedMesh sharing the building's cached geometry and the shared building
 * material (so it keeps its lit windows and can burn / freeze / glow via aState). Effects drive each flyer with
 * a small behaviour callback: `(f, dt) => alive`. Capped count; the oldest flyer is dropped when full.
 */
import { BufferGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { getGeometry, getItem } from '../../content/catalog';
import type { BuildingInstance } from '../../world/planet';
import { getBuildingMaterial } from '../materials';

export interface Flyer {
  mesh: InstancedMesh;
  /** current transform parts (behaviours edit these, the pool composes the matrix) */
  pos: Vector3;
  quat: Quaternion;
  scale: Vector3;
  vel: Vector3;
  spin: Vector3;
  age: number;
  /** free-form numbers for the behaviour */
  data: number[];
  /** building id it came from (gravity flip restores it) */
  sourceId: number;
  /** source geometry (cached building mesh) and current visual state */
  source: BufferGeometry;
  stateId: number;
  behave: (f: Flyer, dt: number) => boolean;
  onEnd?: (f: Flyer) => void;
}

const _m = new Matrix4();
const _c = new Color();
/**
 * Shallow clones of cached building geometries with a constant per-instance aState, keyed by (geometry, state).
 * Shallow clones share the vertex buffers with the building pool, so they must never be disposed (that would
 * free the shared GPU buffers) — the cache is bounded by building types × states.
 */
const stateGeos = new Map<string, BufferGeometry>();
function stateGeometry(src: BufferGeometry, state: number): BufferGeometry {
  const key = src.uuid + '|' + state;
  let g = stateGeos.get(key);
  if (g) return g;
  g = new BufferGeometry();
  for (const name of Object.keys(src.attributes)) if (name !== 'aState') g.setAttribute(name, src.attributes[name]);
  if (src.index) g.setIndex(src.index);
  g.boundingBox = src.boundingBox;
  g.boundingSphere = src.boundingSphere;
  g.setAttribute('aState', new InstancedBufferAttribute(new Float32Array([state]), 1));
  stateGeos.set(key, g);
  return g;
}
const _s = new Vector3();
const _p = new Vector3();
const _q = new Quaternion();

export class Flyers {
  private list: Flyer[] = [];
  constructor(private parent: Object3D, private max = 24) {}

  get count(): number {
    return this.list.length;
  }

  /**
   * Lift a copy of building `b` (whose current world matrix is `matrix`) into the FX layer. The caller usually
   * destroys / hides the real building afterwards.
   */
  launch(b: BuildingInstance, matrix: Matrix4, behave: Flyer['behave'], state = 0, onEnd?: Flyer['onEnd']): Flyer | null {
    const def = getItem(b.defId);
    if (!def) return null;
    let geo: BufferGeometry | null = null;
    try {
      geo = getGeometry(b.defId, { variant: b.variant, level: b.level, style: b.style, lod: 0 });
    } catch {
      geo = null;
    }
    if (!geo) return null;
    return this.launchGeometry(geo, matrix, behave, state, b.id, b.tint ?? 0xffffff, onEnd);
  }

  launchGeometry(geo: BufferGeometry, matrix: Matrix4, behave: Flyer['behave'], state = 0, sourceId = -1, tint = 0xffffff, onEnd?: Flyer['onEnd']): Flyer {
    if (this.list.length >= this.max) this.drop(this.list[0]);
    const mesh = new InstancedMesh(stateGeometry(geo, state), getBuildingMaterial(), 1);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.name = 'fx-flyer';
    mesh.setColorAt(0, _c.setHex(tint));
    const f: Flyer = {
      mesh,
      pos: new Vector3(),
      quat: new Quaternion(),
      scale: new Vector3(1, 1, 1),
      vel: new Vector3(),
      spin: new Vector3(),
      age: 0,
      data: [],
      sourceId,
      source: geo,
      stateId: state,
      behave,
      onEnd,
    };
    matrix.decompose(f.pos, f.quat, f.scale);
    mesh.setMatrixAt(0, matrix);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.parent.add(mesh);
    this.list.push(f);
    return f;
  }

  /** Change a flyer's visual state (InstState) — swaps to the matching shallow geometry clone. */
  setState(f: Flyer, state: number): void {
    if (f.stateId === state) return;
    f.stateId = state;
    f.mesh.geometry = stateGeometry(f.source, state);
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.age += dt;
      let alive = false;
      try {
        alive = f.behave(f, dt);
      } catch (e) {
        console.error('[fx] flyer behaviour failed', e);
      }
      if (!alive) {
        this.drop(f);
        continue;
      }
      _s.copy(f.scale);
      _m.compose(f.pos, f.quat, _s);
      f.mesh.setMatrixAt(0, _m);
      f.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private drop(f: Flyer): void {
    const i = this.list.indexOf(f);
    if (i >= 0) this.list.splice(i, 1);
    try {
      f.onEnd?.(f);
    } catch (e) {
      console.error('[fx] flyer end failed', e);
    }
    f.mesh.removeFromParent();
    // (geometry clones are cached and shared — never disposed here, see stateGeometry)
  }

  clear(): void {
    for (const f of [...this.list]) this.drop(f);
  }

  dispose(): void {
    this.clear();
  }
}

/** Helpers for behaviours. */
export const flyerTmp = { p: _p, q: _q };
