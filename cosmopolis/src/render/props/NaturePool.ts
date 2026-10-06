/**
 * OWNER: roads-props.
 * NaturePool — a specialised instancing pool for the thousands of natural feature clusters (one per feature tile).
 *
 * Why not the generic InstancePool? Variety. Forests use several cluster variants per family (mix × density) so
 * neighbouring tiles never look stamped — but far away nobody can tell variants apart. Here, variants exist only at
 * LOD0 (near the camera); at LOD1 every variant of a family collapses into ONE shared instanced mesh. From orbit a
 * whole planet of forests costs ≈ one draw call per family instead of one per variant × LOD.
 *
 * Storage is flat typed arrays (no per-instance objects, no per-frame allocation). Culling (horizon + frustum +
 * LOD choice) runs only when the camera moved or instances changed, exactly like InstancePool, and uses the same
 * shared building material, instance colours (tints) and per-instance `aState` (InstState) attribute.
 *
 *   family(name, variants)                       → family index (register once; geometry asked lazily)
 *   add(family, variant, matrix, color, radius, state) → slot
 *   set(slot, family, variant, matrix, color, state) · setState(slot, s) · remove(slot)
 *   update(camera, planetRadius) · stats() · dispose()
 */
import {
  BufferGeometry,
  Color,
  Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Vector3,
  type Camera,
  type Material,
  type Object3D,
} from 'three';

export type NatureGeometryFn = (family: string, variant: number, lod: 0 | 1) => BufferGeometry | null;

interface Bucket {
  geo: BufferGeometry | null | undefined;
  mesh: InstancedMesh | null;
  count: number;
}

const MAXV = 8;
const _col = new Color();
const _frustum = new Frustum();
const _pv = new Matrix4();
const _cam = new Vector3();

export class NaturePool {
  readonly group = new Group();
  private names: string[] = [];
  private variants: number[] = [];
  private index = new Map<string, number>();
  /** LOD0 buckets [family * MAXV + variant], LOD1 buckets [family] */
  private near: Bucket[] = [];
  private far: Bucket[] = [];

  private cap = 0;
  private alive = new Uint8Array(0);
  private fam = new Uint16Array(0);
  private vari = new Uint8Array(0);
  private mat = new Float32Array(0);
  private col = new Float32Array(0);
  private st = new Float32Array(0);
  /** unit direction (xyz), distance from centre, bounding radius */
  private pos = new Float32Array(0);
  private free: number[] = [];
  private top = 0;
  private live = 0;
  private dirty = true;
  private lastCam = new Float32Array(16);
  private visible = 0;

  constructor(
    parent: Object3D,
    private material: Material,
    private geometryFor: NatureGeometryFn,
    private opts: { lodDistance: number; castShadow: boolean; name: string },
  ) {
    this.group.name = opts.name;
    parent.add(this.group);
    this.grow(1024);
  }

  get size(): number {
    return this.live;
  }

  /** Register (or look up) a family with `variants` LOD0 variants. */
  family(name: string, variants: number): number {
    let f = this.index.get(name);
    if (f !== undefined) return f;
    f = this.names.length;
    this.names.push(name);
    this.variants.push(Math.max(1, Math.min(MAXV, variants)));
    this.index.set(name, f);
    for (let v = 0; v < MAXV; v++) this.near.push({ geo: undefined, mesh: null, count: 0 });
    this.far.push({ geo: undefined, mesh: null, count: 0 });
    return f;
  }

  private grow(n: number): void {
    const cap = Math.max(n, this.cap * 2);
    const g8 = (a: Uint8Array) => {
      const b = new Uint8Array(cap);
      b.set(a);
      return b;
    };
    const gf = (a: Float32Array, k: number) => {
      const b = new Float32Array(cap * k);
      b.set(a);
      return b;
    };
    this.alive = g8(this.alive);
    this.vari = g8(this.vari);
    const f = new Uint16Array(cap);
    f.set(this.fam);
    this.fam = f;
    this.mat = gf(this.mat, 16);
    this.col = gf(this.col, 3);
    this.st = gf(this.st, 1);
    this.pos = gf(this.pos, 5);
    this.cap = cap;
  }

  private write(slot: number, family: number, variant: number, m: Matrix4, color: number, radius: number, state: number): void {
    this.fam[slot] = family;
    this.vari[slot] = Math.min(variant, this.variants[family] - 1);
    this.mat.set(m.elements, slot * 16);
    _col.setHex(color);
    this.col[slot * 3] = _col.r;
    this.col[slot * 3 + 1] = _col.g;
    this.col[slot * 3 + 2] = _col.b;
    this.st[slot] = state;
    const e = m.elements;
    const d = Math.hypot(e[12], e[13], e[14]) || 1;
    const P = this.pos;
    P[slot * 5] = e[12] / d;
    P[slot * 5 + 1] = e[13] / d;
    P[slot * 5 + 2] = e[14] / d;
    P[slot * 5 + 3] = d;
    P[slot * 5 + 4] = radius;
    this.dirty = true;
  }

  add(family: number, variant: number, m: Matrix4, color: number, radius: number, state = 0): number {
    let slot = this.free.pop();
    if (slot === undefined) {
      if (this.top >= this.cap) this.grow(this.top + 1);
      slot = this.top++;
    }
    this.alive[slot] = 1;
    this.live++;
    this.write(slot, family, variant, m, color, radius, state);
    return slot;
  }

  set(slot: number, family: number, variant: number, m: Matrix4, color: number, radius: number, state = 0): void {
    if (!this.alive[slot]) return;
    this.write(slot, family, variant, m, color, radius, state);
  }

  setState(slot: number, state: number): void {
    if (!this.alive[slot] || this.st[slot] === state) return;
    this.st[slot] = state;
    this.dirty = true;
  }

  remove(slot: number): void {
    if (!this.alive[slot]) return;
    this.alive[slot] = 0;
    this.live--;
    this.free.push(slot);
    this.dirty = true;
  }

  stats(): { instances: number; visible: number; meshes: number } {
    let meshes = 0;
    for (const b of this.near) if (b.mesh?.visible) meshes++;
    for (const b of this.far) if (b.mesh?.visible) meshes++;
    return { instances: this.live, visible: this.visible, meshes };
  }

  private bucketMesh(b: Bucket, family: number, variant: number, lod: 0 | 1, needed: number): InstancedMesh | null {
    if (b.geo === undefined) {
      const src = this.geometryFor(this.names[family], variant, lod);
      if (src) {
        // shallow clone so the per-instance aState attribute never touches the shared geometry
        const g = new BufferGeometry();
        for (const name of Object.keys(src.attributes)) if (name !== 'aState') g.setAttribute(name, src.attributes[name]);
        g.setIndex(src.index);
        g.boundingSphere = src.boundingSphere;
        g.boundingBox = src.boundingBox;
        b.geo = g;
      } else b.geo = null;
    }
    if (!b.geo) return null;
    let mesh = b.mesh;
    if (!mesh || mesh.instanceMatrix.count < needed) {
      let cap = 64;
      while (cap < needed) cap *= 2;
      const old = mesh;
      const oldState = old ? (b.geo.getAttribute('aState') as InstancedBufferAttribute | undefined) : undefined;
      b.geo.setAttribute('aState', new InstancedBufferAttribute(new Float32Array(cap), 1));
      mesh = new InstancedMesh(b.geo, this.material, cap);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      mesh.frustumCulled = false;
      mesh.castShadow = this.opts.castShadow;
      mesh.receiveShadow = false;
      mesh.name = `${this.opts.name}:${this.names[family]}:${lod ? 'far' : variant}`;
      if (old) {
        const n = b.count;
        (mesh.instanceMatrix.array as Float32Array).set((old.instanceMatrix.array as Float32Array).subarray(0, n * 16));
        (mesh.instanceColor.array as Float32Array).set((old.instanceColor!.array as Float32Array).subarray(0, n * 3));
        if (oldState) ((b.geo.getAttribute('aState') as InstancedBufferAttribute).array as Float32Array).set((oldState.array as Float32Array).subarray(0, Math.min(n, oldState.count)));
        this.group.remove(old);
        old.dispose();
      }
      b.mesh = mesh;
      this.group.add(mesh);
    }
    return mesh;
  }

  update(camera: Camera, planetRadius: number): void {
    camera.updateMatrixWorld();
    const me = camera.matrixWorld.elements;
    let moved = false;
    for (let i = 0; i < 16; i++)
      if (Math.abs(me[i] - this.lastCam[i]) > 1e-3) {
        moved = true;
        break;
      }
    if (!moved && !this.dirty) return;
    this.lastCam.set(me);
    this.dirty = false;

    _cam.setFromMatrixPosition(camera.matrixWorld);
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    const planes = _frustum.planes;
    const camDist = _cam.length() || 1;
    const cx = _cam.x / camDist, cy = _cam.y / camDist, cz = _cam.z / camDist;
    const cull = planetRadius > 0 && camDist > planetRadius;
    const horizon = cull ? Math.acos(Math.min(1, planetRadius / camDist)) : Math.PI;
    const cosLimit = Math.cos(Math.min(Math.PI, horizon + 0.06 + 2.5 / Math.max(1, planetRadius)));
    const lod2 = this.opts.lodDistance * this.opts.lodDistance;

    for (const b of this.near) b.count = 0;
    for (const b of this.far) b.count = 0;
    const P = this.pos, M = this.mat, Cc = this.col, S = this.st;
    let visible = 0;
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      const ux = P[i * 5], uy = P[i * 5 + 1], uz = P[i * 5 + 2], d = P[i * 5 + 3], r = P[i * 5 + 4] * 1.5;
      if (cull && ux * cx + uy * cy + uz * cz < cosLimit) continue;
      const px = ux * d, py = uy * d, pz = uz * d;
      let inside = true;
      for (let k = 0; k < 6; k++) {
        const pl = planes[k];
        if (pl.normal.x * px + pl.normal.y * py + pl.normal.z * pz + pl.constant < -r) {
          inside = false;
          break;
        }
      }
      if (!inside) continue;
      const dx = px - _cam.x, dy = py - _cam.y, dz = pz - _cam.z;
      const lod: 0 | 1 = dx * dx + dy * dy + dz * dz > lod2 ? 1 : 0;
      const f = this.fam[i];
      const v = lod ? 0 : this.vari[i];
      const b = lod ? this.far[f] : this.near[f * MAXV + v];
      const mesh = this.bucketMesh(b, f, v, lod, b.count + 1);
      if (!mesh) continue;
      const j = b.count++;
      const im = mesh.instanceMatrix.array as Float32Array;
      const o = j * 16, s = i * 16;
      for (let q = 0; q < 16; q++) im[o + q] = M[s + q];
      const ic = mesh.instanceColor!.array as Float32Array;
      ic[j * 3] = Cc[i * 3];
      ic[j * 3 + 1] = Cc[i * 3 + 1];
      ic[j * 3 + 2] = Cc[i * 3 + 2];
      ((mesh.geometry.getAttribute('aState') as InstancedBufferAttribute).array as Float32Array)[j] = S[i];
      visible++;
    }
    this.visible = visible;
    const flush = (b: Bucket) => {
      const m = b.mesh;
      if (!m) return;
      m.count = b.count;
      m.visible = b.count > 0;
      if (!b.count) return;
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, b.count * 16);
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.clearUpdateRanges();
      m.instanceColor!.addUpdateRange(0, b.count * 3);
      m.instanceColor!.needsUpdate = true;
      const st = m.geometry.getAttribute('aState') as InstancedBufferAttribute;
      st.clearUpdateRanges();
      st.addUpdateRange(0, b.count);
      st.needsUpdate = true;
    };
    for (const b of this.near) flush(b);
    for (const b of this.far) flush(b);
  }

  dispose(): void {
    for (const b of [...this.near, ...this.far]) {
      if (b.mesh) {
        this.group.remove(b.mesh);
        b.mesh.dispose();
      }
      // the clone shares attributes with the source geometry (disposed by the owner too — double dispose is safe)
      b.geo?.dispose();
      b.geo = undefined;
      b.mesh = null;
    }
    this.group.removeFromParent();
  }
}
