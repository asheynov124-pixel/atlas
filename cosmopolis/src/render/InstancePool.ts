/**
 * InstancePool — many objects, few draw calls (FOUNDATION, CONTRACT).
 *
 * One InstancedMesh per (geometry key, LOD). Each frame (when the camera moved or entries changed) the pool
 * re-packs only the instances that are (a) on the camera's side of the planet (horizon culling) and
 * (b) inside the view frustum, choosing LOD0 within `lodDistance` and LOD1 beyond.
 *
 * Per-instance data: matrix, colour (tint; only paintable surfaces), visual state (InstState in materials.ts).
 * Geometry comes from `geometryFor(key, lod)`; if LOD1 is null an automatic box impostor is generated.
 *
 * Far merge (opt-in, `merge`): seen from orbit a city is hundreds of distinct (item, variant, level, style) keys,
 * one draw call each. With `merge` set, instances are grouped into ~96 planet chunks (cube-sphere cells); a chunk
 * lying wholly beyond `merge.distance` (default: lodDistance, so it would be LOD1 anyway) is drawn as ONE static
 * mesh baked from its members' LOD1 geometry (world-space, tint and state baked per vertex, the instance origin
 * kept in `aOrigin` so per-building shader seeds match). A chunk whose members change falls back to instancing at
 * once and is re-baked once it has been quiet for `merge.quietMs`, within a per-frame time budget.
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
  Mesh,
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
  /** merge far chunks into static meshes (see header). `material` must understand `aOrigin` (createMergedBuildingMaterial). */
  merge?: { material: Material; distance?: number; quietMs?: number; budgetMs?: number };
}

/** A planet cell of instances that can be baked into one mesh when far away. */
interface Chunk {
  id: number;
  handles: Set<number>;
  /** members changed since the last bake (or never baked) */
  dirty: boolean;
  /** performance.now() of the last member change */
  changedAt: number;
  /** bounds need recomputing */
  boundsDirty: boolean;
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  mesh: Mesh | null;
  /** the last bake covered every visible member (false: some geometry could not be baked → stay instanced) */
  bakeable: boolean;
  /** drawn merged this frame (members skipped by the instanced pass) */
  merged: boolean;
}

const CHUNK_N = 4;

/** Cube-sphere cell of a direction: 6 faces × CHUNK_N². */
function chunkIdOf(x: number, y: number, z: number): number {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let f: number, u: number, v: number;
  if (ax >= ay && ax >= az) {
    f = x >= 0 ? 0 : 1;
    u = y / (ax || 1);
    v = z / (ax || 1);
  } else if (ay >= az) {
    f = y >= 0 ? 2 : 3;
    u = x / ay;
    v = z / ay;
  } else {
    f = z >= 0 ? 4 : 5;
    u = x / az;
    v = y / az;
  }
  const i = Math.min(CHUNK_N - 1, Math.max(0, Math.floor((u + 1) * 0.5 * CHUNK_N)));
  const j = Math.min(CHUNK_N - 1, Math.max(0, Math.floor((v + 1) * 0.5 * CHUNK_N)));
  return f * CHUNK_N * CHUNK_N + i * CHUNK_N + j;
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
  /** far-merge chunk (null without `merge`) */
  ch: Chunk | null;
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
  private opts: Required<Omit<InstancePoolOptions, 'merge'>>;
  private visibleCount = 0;
  private merge: { material: Material; distance: number; quietMs: number; budgetMs: number } | null;
  private chunks = new Map<number, Chunk>();
  /** a far chunk is waiting to be (re)baked: keep updating even when nothing moves */
  private pendingBake = false;

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
    const mg = opts.merge;
    this.merge = mg
      ? { material: mg.material, distance: mg.distance ?? this.opts.lodDistance, quietMs: mg.quietMs ?? 250, budgetMs: mg.budgetMs ?? 3 }
      : null;
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
    const e: Entry = { key, m: new Float32Array(16), r: c.r, g: c.g, b: c.b, state, visible: true, px: 0, py: 0, pz: 0, radius, ch: null };
    e.m.set(matrix.elements);
    e.px = matrix.elements[12];
    e.py = matrix.elements[13];
    e.pz = matrix.elements[14];
    this.entries.set(h, e);
    this.placeInChunk(h, e);
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
    if (e.ch) this.placeInChunk(handle, e);
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
    this.touch(e.ch);
  }

  setState(handle: number, state: number): void {
    const e = this.entries.get(handle);
    if (!e || e.state === state) return;
    e.state = state;
    this.dirty = true;
    this.touch(e.ch);
  }

  setVisible(handle: number, visible: boolean): void {
    const e = this.entries.get(handle);
    if (!e || e.visible === visible) return;
    e.visible = visible;
    this.dirty = true;
    this.touch(e.ch);
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
    this.touch(e.ch);
  }

  remove(handle: number): void {
    const e = this.entries.get(handle);
    if (!e) return;
    this.buckets.get(e.key)?.handles.delete(handle);
    if (e.ch) {
      e.ch.handles.delete(handle);
      this.touch(e.ch);
    }
    this.entries.delete(handle);
    this.dirty = true;
  }

  clear(): void {
    this.entries.clear();
    for (const b of this.buckets.values()) b.handles.clear();
    for (const ch of this.chunks.values()) {
      ch.handles.clear();
      this.touch(ch);
    }
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
    for (const ch of this.chunks.values()) this.touch(ch);
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
    if (!moved && !this.dirty && !this.pendingBake) return;
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
    if (this.merge) visible += this.updateChunks(cull, horizonAngle, cx, cy, cz, planetRadius);

    for (const b of this.buckets.values()) {
      if (b.handles.size === 0) {
        if (b.meshes[0]) b.meshes[0].count = 0;
        if (b.meshes[1]) b.meshes[1].count = 0;
        continue;
      }
      const counts = [0, 0];
      for (const h of b.handles) {
        const e = this.entries.get(h)!;
        if (!e.visible || (e.ch !== null && e.ch.merged)) continue;
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

  stats(): { instances: number; visible: number; meshes: number; merged: number } {
    let meshes = 0, merged = 0;
    for (const b of this.buckets.values()) for (const m of b.meshes) if (m && m.visible) meshes++;
    for (const ch of this.chunks.values()) if (ch.mesh && ch.mesh.visible) merged++;
    return { instances: this.entries.size, visible: this.visibleCount, meshes: meshes + merged, merged };
  }

  // ── far merge ────────────────────────────────────────────────────────────────────────────────────────────

  /** Assign (or re-assign after a move) an entry to its planet chunk. */
  private placeInChunk(h: number, e: Entry): void {
    if (!this.merge) return;
    const id = chunkIdOf(e.px, e.py, e.pz);
    if (e.ch && e.ch.id === id) {
      this.touch(e.ch);
      return;
    }
    if (e.ch) {
      e.ch.handles.delete(h);
      this.touch(e.ch);
    }
    let ch = this.chunks.get(id);
    if (!ch) {
      ch = { id, handles: new Set(), dirty: true, changedAt: 0, boundsDirty: true, cx: 0, cy: 0, cz: 0, radius: 0, mesh: null, bakeable: true, merged: false };
      this.chunks.set(id, ch);
    }
    ch.handles.add(h);
    e.ch = ch;
    this.touch(ch);
  }

  /** A member of the chunk changed: its baked mesh is stale (instancing takes over until it is re-baked). */
  private touch(ch: Chunk | null): void {
    if (!ch) return;
    ch.dirty = true;
    ch.boundsDirty = true;
    ch.changedAt = performance.now();
    if (ch.merged) {
      ch.merged = false;
      if (ch.mesh) ch.mesh.visible = false;
    }
  }

  /** Decide per chunk: baked mesh (far, current) or instanced members. Returns the instances drawn merged. */
  private updateChunks(cull: boolean, horizonAngle: number, cx: number, cy: number, cz: number, planetRadius: number): number {
    const mg = this.merge!;
    const now = performance.now();
    const t0 = now;
    let drawn = 0;
    this.pendingBake = false;
    for (const ch of this.chunks.values()) {
      ch.merged = false;
      if (ch.handles.size === 0) {
        if (ch.mesh) this.dropChunkMesh(ch);
        continue;
      }
      if (ch.boundsDirty) this.chunkBounds(ch);
      const dx = ch.cx - _camPos.x, dy = ch.cy - _camPos.y, dz = ch.cz - _camPos.z;
      const far = Math.sqrt(dx * dx + dy * dy + dz * dz) - ch.radius > mg.distance;
      if (!far) {
        if (ch.mesh) ch.mesh.visible = false;
        continue;
      }
      if (ch.dirty) {
        if (now - ch.changedAt < mg.quietMs || performance.now() - t0 > mg.budgetMs) {
          this.pendingBake = true;
          if (ch.mesh) ch.mesh.visible = false;
          continue;
        }
        this.bakeChunk(ch);
      }
      if (!ch.mesh) {
        // nothing drawable (all hidden / no geometry) → nothing to instance either; unbakeable → instanced
        ch.merged = ch.bakeable;
        continue;
      }
      let show = true;
      if (cull) {
        const pl = Math.hypot(ch.cx, ch.cy, ch.cz) || 1;
        const dot = (ch.cx * cx + ch.cy * cy + ch.cz * cz) / pl;
        const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
        show = ang <= horizonAngle + this.opts.horizonMargin + ch.radius / planetRadius;
      }
      ch.mesh.visible = show;
      ch.merged = true;
      if (show) drawn += ch.handles.size;
    }
    return drawn;
  }

  private chunkBounds(ch: Chunk): void {
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const h of ch.handles) {
      const e = this.entries.get(h)!;
      sx += e.px;
      sy += e.py;
      sz += e.pz;
      n++;
    }
    ch.cx = sx / (n || 1);
    ch.cy = sy / (n || 1);
    ch.cz = sz / (n || 1);
    let r = 0;
    for (const h of ch.handles) {
      const e = this.entries.get(h)!;
      r = Math.max(r, Math.hypot(e.px - ch.cx, e.py - ch.cy, e.pz - ch.cz) + e.radius);
    }
    ch.radius = r;
    ch.boundsDirty = false;
  }

  private dropChunkMesh(ch: Chunk): void {
    if (!ch.mesh) return;
    this.group.remove(ch.mesh);
    ch.mesh.geometry.dispose();
    ch.mesh = null;
  }

  /** LOD1 geometry of a key (cached in its bucket, the same one the instanced pass draws). */
  private farGeometry(key: string): BufferGeometry | null {
    const b = this.buckets.get(key);
    if (!b) return null;
    if (b.geos[1] === undefined) {
      let src = this.geometryFor(b.key, 1);
      if (!src) {
        const hi = b.geos[0] === undefined ? this.geometryFor(b.key, 0) : b.geos[0];
        if (hi) src = autoLod(hi);
      }
      b.geos[1] = src ? shallowClone(src) : null;
    }
    return b.geos[1] ?? null;
  }

  /** Bake the chunk's visible members (LOD1, world space) into one static mesh. */
  private bakeChunk(ch: Chunk): void {
    ch.dirty = false;
    ch.bakeable = true;
    this.dropChunkMesh(ch);
    let nv = 0, ni = 0;
    for (const h of ch.handles) {
      const e = this.entries.get(h)!;
      if (!e.visible) continue;
      const g = this.farGeometry(e.key);
      if (!g) continue;
      if (!mergeable(g)) {
        ch.bakeable = false;
        return;
      }
      const n = g.attributes.position.count;
      nv += n;
      ni += g.index ? g.index.count : n;
    }
    if (nv === 0) return;
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), U = new Float32Array(nv * 2);
    const M = new Float32Array(nv), S = new Float32Array(nv), O = new Float32Array(nv * 3);
    const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const h of ch.handles) {
      const e = this.entries.get(h)!;
      if (!e.visible) continue;
      const g = this.farGeometry(e.key);
      if (!g || !mergeable(g)) continue;
      const m = e.m;
      // normal matrix = cofactor of the upper 3×3 (inverse-transpose up to scale; renormalised per vertex)
      const a = m[0], b = m[1], c = m[2], d = m[4], f = m[5], k = m[6], p = m[8], q = m[9], r = m[10];
      const det = a * (f * r - k * q) - d * (b * r - c * q) + p * (b * k - c * f);
      const sg = det < 0 ? -1 : 1;
      const n00 = (f * r - k * q) * sg, n01 = (c * q - b * r) * sg, n02 = (b * k - c * f) * sg;
      const n10 = (k * p - d * r) * sg, n11 = (a * r - c * p) * sg, n12 = (c * d - a * k) * sg;
      const n20 = (d * q - f * p) * sg, n21 = (b * p - a * q) * sg, n22 = (a * f - b * d) * sg;
      const pos = g.attributes.position.array as Float32Array;
      const nrm = g.attributes.normal?.array as Float32Array | undefined;
      const col = g.attributes.color?.array as Float32Array | undefined;
      const uv = g.attributes.uv?.array as Float32Array | undefined;
      const am = g.attributes.aMat?.array as Float32Array | undefined;
      const n = g.attributes.position.count;
      for (let i = 0; i < n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const o = (vo + i) * 3;
        P[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
        P[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        P[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        const nx = nrm ? nrm[i * 3] : 0, ny = nrm ? nrm[i * 3 + 1] : 1, nz = nrm ? nrm[i * 3 + 2] : 0;
        // cofactor matrix: cof(M) = det(M)·M⁻ᵀ, so cof·n is the transformed normal up to scale
        const wx = n00 * nx + n01 * ny + n02 * nz;
        const wy = n10 * nx + n11 * ny + n12 * nz;
        const wz = n20 * nx + n21 * ny + n22 * nz;
        const L = Math.hypot(wx, wy, wz) || 1;
        N[o] = wx / L;
        N[o + 1] = wy / L;
        N[o + 2] = wz / L;
        const mat = am ? am[i] : 0;
        const paint = mat > 99.5;
        C[o] = (col ? col[i * 3] : 1) * (paint ? e.r : 1);
        C[o + 1] = (col ? col[i * 3 + 1] : 1) * (paint ? e.g : 1);
        C[o + 2] = (col ? col[i * 3 + 2] : 1) * (paint ? e.b : 1);
        if (uv) {
          U[(vo + i) * 2] = uv[i * 2];
          U[(vo + i) * 2 + 1] = uv[i * 2 + 1];
        }
        M[vo + i] = mat;
        S[vo + i] = e.state;
        O[o] = e.px;
        O[o + 1] = e.py;
        O[o + 2] = e.pz;
      }
      if (g.index) {
        const src = g.index.array;
        for (let i = 0; i < src.length; i++) I[io++] = src[i] + vo;
      } else for (let i = 0; i < n; i++) I[io++] = vo + i;
      vo += n;
    }
    const geo = new BufferGeometry();
    const attr = (arr: Float32Array, size: number) => new BufferAttribute(arr, size).onUpload(freeArray);
    geo.setAttribute('position', new BufferAttribute(P, 3)); // kept: bounds / raycasts
    geo.setAttribute('normal', attr(N, 3));
    geo.setAttribute('color', attr(C, 3));
    geo.setAttribute('uv', attr(U, 2));
    geo.setAttribute('aMat', attr(M, 1));
    geo.setAttribute('aState', attr(S, 1));
    geo.setAttribute('aOrigin', attr(O, 3));
    geo.setIndex(new BufferAttribute(I, 1).onUpload(freeArray));
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.merge!.material);
    mesh.name = `${this.opts.name}:far:${ch.id}`;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = this.opts.castShadow;
    mesh.receiveShadow = this.opts.receiveShadow;
    mesh.visible = false;
    ch.mesh = mesh;
    this.group.add(mesh);
  }

  dispose(): void {
    for (const ch of this.chunks.values()) this.dropChunkMesh(ch);
    this.chunks.clear();
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

/** GPU copy only: drop the CPU-side array once uploaded (baked chunks are never edited, only rebuilt). */
function freeArray(this: BufferAttribute): void {
  (this as unknown as { array: ArrayLike<number> | null }).array = null;
}

/** Plain (non-interleaved) Float32 kit attributes we know how to bake. */
function mergeable(g: BufferGeometry): boolean {
  const p = g.attributes.position;
  if (!p || (p as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute || !(p.array instanceof Float32Array) || p.itemSize !== 3) return false;
  for (const name of ['normal', 'color', 'uv', 'aMat'] as const) {
    const a = g.attributes[name];
    if (!a) continue;
    if ((a as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute || !(a.array instanceof Float32Array)) return false;
    if (a.itemSize !== (name === 'uv' ? 2 : name === 'aMat' ? 1 : 3)) return false;
  }
  return true;
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
