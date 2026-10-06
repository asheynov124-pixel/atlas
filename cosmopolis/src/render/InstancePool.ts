/**
 * InstancePool — many objects, few draw calls (FOUNDATION, CONTRACT).
 *
 * One InstancedMesh per (geometry key, LOD). Each frame (when the camera moved or entries changed) the pool
 * re-packs only the instances that are (a) on the camera's side of the planet (horizon culling) and
 * (b) inside the view frustum, choosing LOD0 within `lodDistance` and LOD1 beyond.
 *
 * Per-instance data: matrix, colour (tint; only paintable surfaces), visual state (InstState in materials.ts).
 * Geometry comes from `geometryFor(key, lod)`; if LOD1 is null an automatic box impostor is generated.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Sphere,
  Vector3,
  type Camera,
  type Material,
  type Object3D,
} from 'three';
import { MeshBuilder, Mat } from '../content/kit';

export interface InstancePoolOptions {
  /** distance (world units) beyond which LOD1 is used. Default 70. */
  lodDistance?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** disable horizon culling (e.g. for orbitals) */
  noHorizonCull?: boolean;
  /** extra angular margin (radians) for horizon culling. Default 0.06 */
  horizonMargin?: number;
  name?: string;
}

interface Entry {
  key: string;
  m: Float32Array; // 16
  r: number;
  g: number;
  b: number;
  state: number;
  visible: boolean;
  /** world position (for culling) */
  px: number;
  py: number;
  pz: number;
  /** bounding radius (world) */
  radius: number;
}

interface Bucket {
  key: string;
  handles: Set<number>;
  meshes: [InstancedMesh | null, InstancedMesh | null];
  geos: [BufferGeometry | null | undefined, BufferGeometry | null | undefined];
}

const _mat = new Matrix4();
const _col = new Color();
const _frustum = new Frustum();
const _pv = new Matrix4();
const _camPos = new Vector3();
const _sphere = new Sphere();

export class InstancePool {
  readonly group = new Group();
  private entries = new Map<number, Entry>();
  private buckets = new Map<string, Bucket>();
  private nextHandle = 1;
  private dirty = true;
  private lastCam = new Float32Array(16);
  private lastCamPos = new Vector3(Infinity, 0, 0);
  private opts: Required<InstancePoolOptions>;
  private visibleCount = 0;

  constructor(
    parent: Object3D,
    private material: Material,
    private geometryFor: (key: string, lod: 0 | 1) => BufferGeometry | null,
    opts: InstancePoolOptions = {},
  ) {
    this.opts = {
      lodDistance: opts.lodDistance ?? 70,
      castShadow: opts.castShadow ?? false,
      receiveShadow: opts.receiveShadow ?? false,
      noHorizonCull: opts.noHorizonCull ?? false,
      horizonMargin: opts.horizonMargin ?? 0.06,
      name: opts.name ?? 'pool',
    };
    this.group.name = this.opts.name;
    parent.add(this.group);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Add an instance. `radius` = rough bounding radius in world units (for culling). */
  add(key: string, matrix: Matrix4, color: Color | number = 0xffffff, radius = 1.5, state = 0): number {
    const h = this.nextHandle++;
    const c = typeof color === 'number' ? _col.setHex(color) : color;
    const e: Entry = { key, m: new Float32Array(16), r: c.r, g: c.g, b: c.b, state, visible: true, px: 0, py: 0, pz: 0, radius };
    e.m.set(matrix.elements);
    e.px = matrix.elements[12];
    e.py = matrix.elements[13];
    e.pz = matrix.elements[14];
    this.entries.set(h, e);
    let b = this.buckets.get(key);
    if (!b) {
      b = { key, handles: new Set(), meshes: [null, null], geos: [undefined, undefined] };
      this.buckets.set(key, b);
    }
    b.handles.add(h);
    this.dirty = true;
    return h;
  }

  has(handle: number): boolean {
    return this.entries.has(handle);
  }

  setMatrix(handle: number, matrix: Matrix4): void {
    const e = this.entries.get(handle);
    if (!e) return;
    e.m.set(matrix.elements);
    e.px = matrix.elements[12];
    e.py = matrix.elements[13];
    e.pz = matrix.elements[14];
    this.dirty = true;
  }

  getMatrix(handle: number, out = new Matrix4()): Matrix4 | null {
    const e = this.entries.get(handle);
    if (!e) return null;
    return out.fromArray(e.m);
  }

  setColor(handle: number, color: Color | number): void {
    const e = this.entries.get(handle);
    if (!e) return;
    const c = typeof color === 'number' ? _col.setHex(color) : color;
    e.r = c.r;
    e.g = c.g;
    e.b = c.b;
    this.dirty = true;
  }

  setState(handle: number, state: number): void {
    const e = this.entries.get(handle);
    if (!e || e.state === state) return;
    e.state = state;
    this.dirty = true;
  }

  setVisible(handle: number, visible: boolean): void {
    const e = this.entries.get(handle);
    if (!e || e.visible === visible) return;
    e.visible = visible;
    this.dirty = true;
  }

  /** Change the geometry key of an existing instance (e.g. building levelled up). */
  setKey(handle: number, key: string): void {
    const e = this.entries.get(handle);
    if (!e || e.key === key) return;
    this.buckets.get(e.key)?.handles.delete(handle);
    e.key = key;
    let b = this.buckets.get(key);
    if (!b) {
      b = { key, handles: new Set(), meshes: [null, null], geos: [undefined, undefined] };
      this.buckets.set(key, b);
    }
    b.handles.add(handle);
    this.dirty = true;
  }

  remove(handle: number): void {
    const e = this.entries.get(handle);
    if (!e) return;
    this.buckets.get(e.key)?.handles.delete(handle);
    this.entries.delete(handle);
    this.dirty = true;
  }

  clear(): void {
    this.entries.clear();
    for (const b of this.buckets.values()) b.handles.clear();
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Forget cached geometry for keys starting with prefix (e.g. after a custom item was edited). */
  refreshGeometry(prefix = ''): void {
    for (const b of this.buckets.values()) {
      if (!b.key.startsWith(prefix)) continue;
      for (let l = 0; l < 2; l++) {
        const m = b.meshes[l];
        if (m) {
          this.group.remove(m);
          m.geometry.dispose();
          m.dispose();
        }
        b.meshes[l] = null;
        b.geos[l] = undefined;
      }
    }
    this.dirty = true;
  }

  /**
   * Cull + upload. Call once per frame; cheap when nothing changed.
   * @param planetRadius used for horizon culling (0 disables)
   */
  update(camera: Camera, planetRadius: number): void {
    camera.updateMatrixWorld();
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    const me = camera.matrixWorld.elements;
    let moved = false;
    for (let i = 0; i < 16; i++) {
      if (Math.abs(me[i] - this.lastCam[i]) > 1e-3) {
        moved = true;
        break;
      }
    }
    if (!moved && !this.dirty) return;
    this.lastCam.set(me);
    this.lastCamPos.copy(_camPos);
    this.dirty = false;

    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    const camDist = _camPos.length();
    const cull = !this.opts.noHorizonCull && planetRadius > 0 && camDist > planetRadius;
    const horizonAngle = cull ? Math.acos(Math.min(1, planetRadius / camDist)) : Math.PI;
    const cx = _camPos.x / camDist, cy = _camPos.y / camDist, cz = _camPos.z / camDist;
    const lodD2 = this.opts.lodDistance * this.opts.lodDistance;
    let visible = 0;

    for (const b of this.buckets.values()) {
      if (b.handles.size === 0) {
        if (b.meshes[0]) b.meshes[0].count = 0;
        if (b.meshes[1]) b.meshes[1].count = 0;
        continue;
      }
      const counts = [0, 0];
      for (const h of b.handles) {
        const e = this.entries.get(h)!;
        if (!e.visible) continue;
        if (cull) {
          const pl = Math.hypot(e.px, e.py, e.pz) || 1;
          const dot = (e.px * cx + e.py * cy + e.pz * cz) / pl;
          const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
          const margin = this.opts.horizonMargin + (e.radius * 2.5) / planetRadius;
          if (ang > horizonAngle + margin) continue;
        }
        _sphere.center.set(e.px, e.py, e.pz);
        _sphere.radius = e.radius * 1.5;
        if (!_frustum.intersectsSphere(_sphere)) continue;
        const dx = e.px - _camPos.x, dy = e.py - _camPos.y, dz = e.pz - _camPos.z;
        const lod: 0 | 1 = dx * dx + dy * dy + dz * dz > lodD2 ? 1 : 0;
        const mesh = this.ensureMesh(b, lod, counts[lod] + 1);
        if (!mesh) continue;
        const i = counts[lod]++;
        (mesh.instanceMatrix.array as Float32Array).set(e.m, i * 16);
        const ic = mesh.instanceColor!.array as Float32Array;
        ic[i * 3] = e.r;
        ic[i * 3 + 1] = e.g;
        ic[i * 3 + 2] = e.b;
        const st = mesh.geometry.getAttribute('aState') as InstancedBufferAttribute;
        (st.array as Float32Array)[i] = e.state;
        visible++;
      }
      for (let l = 0; l < 2; l++) {
        const m = b.meshes[l];
        if (!m) continue;
        m.count = counts[l];
        m.visible = counts[l] > 0;
        if (counts[l] > 0) {
          m.instanceMatrix.clearUpdateRanges();
          m.instanceMatrix.addUpdateRange(0, counts[l] * 16);
          m.instanceMatrix.needsUpdate = true;
          m.instanceColor!.clearUpdateRanges();
          m.instanceColor!.addUpdateRange(0, counts[l] * 3);
          m.instanceColor!.needsUpdate = true;
          const st = m.geometry.getAttribute('aState') as InstancedBufferAttribute;
          st.clearUpdateRanges();
          st.addUpdateRange(0, counts[l]);
          st.needsUpdate = true;
        }
      }
    }
    this.visibleCount = visible;
  }

  stats(): { instances: number; visible: number; meshes: number } {
    let meshes = 0;
    for (const b of this.buckets.values()) for (const m of b.meshes) if (m && m.visible) meshes++;
    return { instances: this.entries.size, visible: this.visibleCount, meshes };
  }

  dispose(): void {
    for (const b of this.buckets.values())
      for (const m of b.meshes)
        if (m) {
          m.geometry.dispose();
          m.dispose();
        }
    this.buckets.clear();
    this.entries.clear();
    this.group.removeFromParent();
  }

  private ensureMesh(b: Bucket, lod: 0 | 1, needed: number): InstancedMesh | null {
    let geo = b.geos[lod];
    if (geo === undefined) {
      let src = this.geometryFor(b.key, lod);
      if (!src && lod === 1) {
        const hi = b.geos[0] === undefined ? this.geometryFor(b.key, 0) : b.geos[0];
        if (hi) src = autoLod(hi);
      }
      // shallow clone so we can attach a per-instance attribute without touching the shared cache
      geo = src ? shallowClone(src) : null;
      b.geos[lod] = geo;
    }
    if (!geo) return null;
    let mesh = b.meshes[lod];
    if (!mesh || mesh.instanceMatrix.count < needed) {
      const cap = Math.max(16, nextPow2(Math.max(needed, b.handles.size)));
      const old = mesh;
      geo.setAttribute('aState', new InstancedBufferAttribute(new Float32Array(cap), 1));
      mesh = new InstancedMesh(geo, this.material, cap);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      mesh.frustumCulled = false;
      mesh.castShadow = this.opts.castShadow;
      mesh.receiveShadow = this.opts.receiveShadow;
      mesh.name = `${this.opts.name}:${b.key}:${lod}`;
      mesh.count = 0;
      if (old) {
        // carry over already-written instances this pass
        (mesh.instanceMatrix.array as Float32Array).set((old.instanceMatrix.array as Float32Array).subarray(0, old.instanceMatrix.count * 16));
        (mesh.instanceColor.array as Float32Array).set((old.instanceColor!.array as Float32Array).subarray(0, old.instanceMatrix.count * 3));
        this.group.remove(old);
        old.dispose();
      }
      b.meshes[lod] = mesh;
      this.group.add(mesh);
      this.dirty = true;
    }
    return mesh;
  }
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function shallowClone(src: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    if (name === 'aState') continue;
    g.setAttribute(name, src.attributes[name]);
  }
  if (src.index) g.setIndex(src.index);
  g.boundingBox = src.boundingBox;
  g.boundingSphere = src.boundingSphere;
  return g;
}

/** Box impostor from a detailed geometry: same bounds, averaged colours, windows if the source had any. */
export function autoLod(src: BufferGeometry): BufferGeometry {
  if (!src.boundingBox) src.computeBoundingBox();
  const bb = src.boundingBox!;
  const col = src.getAttribute('color') as BufferAttribute | undefined;
  const mat = src.getAttribute('aMat') as BufferAttribute | undefined;
  const nrm = src.getAttribute('normal') as BufferAttribute | undefined;
  let sr = 0, sg = 0, sb = 0, n = 0, tr = 0, tg = 0, tb = 0, tn = 0;
  let windows = 0, glow = 0;
  const count = src.getAttribute('position').count;
  for (let i = 0; i < count; i++) {
    const r = col ? col.getX(i) : 0.8, g = col ? col.getY(i) : 0.8, b = col ? col.getZ(i) : 0.8;
    const up = nrm ? nrm.getY(i) > 0.7 : false;
    if (up) {
      tr += r; tg += g; tb += b; tn++;
    } else {
      sr += r; sg += g; sb += b; n++;
    }
    const m = mat ? mat.getX(i) % 100 : 0;
    if (m === Mat.Window || m === Mat.Glass || m === Mat.WindowSmall) windows++;
    if (m === Mat.Glow) glow++;
  }
  const lin2hex = (r: number, g: number, b: number) => _col.setRGB(r, g, b).getHex();
  const side = n ? lin2hex(sr / n, sg / n, sb / n) : 0xcccccc;
  const top = tn ? lin2hex(tr / tn, tg / tn, tb / tn) : side;
  const w = Math.max(0.05, bb.max.x - bb.min.x), h = Math.max(0.05, bb.max.y - bb.min.y), d = Math.max(0.05, bb.max.z - bb.min.z);
  const b = new MeshBuilder(1);
  const useWin = windows > count * 0.15;
  b.box(w * 0.92, h, d * 0.92, {
    color: side,
    top,
    mat: useWin ? Mat.Window : glow > count * 0.3 ? Mat.Glow : Mat.Plain,
    x: (bb.max.x + bb.min.x) / 2,
    y: bb.min.y,
    z: (bb.max.z + bb.min.z) / 2,
  });
  return b.build();
}
