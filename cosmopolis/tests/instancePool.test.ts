import { describe, it, expect } from 'vitest';
import { Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Vector3, type BufferGeometry } from 'three';
import { MeshBuilder, Mat } from '../src/content/kit';
import { InstancePool } from '../src/render/InstancePool';

const R = 66;

function boxGeo(): BufferGeometry {
  const b = new MeshBuilder(1);
  // a paintable body and a plain roof
  b.box(1, 2, 1, { color: 0x808080, mat: Mat.Plain, paint: true });
  b.box(0.5, 0.2, 0.5, { color: 0xff0000, mat: Mat.Plain, y: 2 });
  return b.build();
}

function camAt(dist: number): PerspectiveCamera {
  const cam = new PerspectiveCamera(50, 1, 0.1, 5000);
  cam.position.set(0, R + dist, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

/** Instance on the sphere near the north pole, +Y up, yawed by `yaw`. */
function onPlanet(x: number, z: number, yaw: number): Matrix4 {
  const up = new Vector3(x, R, z).normalize();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), up).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
  return new Matrix4().compose(up.clone().multiplyScalar(R), q, new Vector3(1, 1, 1));
}

function setup(quietMs = 0) {
  const parent = new Group();
  const geo = boxGeo();
  const pool = new InstancePool(parent, new MeshStandardMaterial(), () => geo, {
    lodDistance: 50,
    merge: { material: new MeshStandardMaterial(), quietMs },
  });
  const hs = [pool.add('a', onPlanet(1, 1, 0), 0x00ff00, 2), pool.add('b', onPlanet(4, 2, Math.PI / 2), 0xffffff, 2), pool.add('c', onPlanet(3, 1, 1.1), 0x0000ff, 2, 3)];
  return { parent, pool, hs, geo };
}

const farMeshes = (pool: InstancePool) => pool.group.children.filter((o): o is Mesh => (o as Mesh).isMesh && !(o as InstancedMesh).isInstancedMesh && o.name.includes(':far:'));
const instancedDrawn = (pool: InstancePool) =>
  pool.group.children.filter((o): o is InstancedMesh => (o as InstancedMesh).isInstancedMesh && o.visible).reduce((n, m) => n + m.count, 0);

describe('InstancePool far merge', () => {
  it('bakes a far chunk into one mesh with world-space positions, normals, tint and state', () => {
    const { pool, geo } = setup();
    pool.update(camAt(300), R);
    const far = farMeshes(pool).filter((m) => m.visible);
    expect(far.length).toBe(1);
    expect(instancedDrawn(pool)).toBe(0);
    const g = far[0].geometry;
    const n = geo.attributes.position.count;
    expect(g.attributes.position.count).toBe(n * 3);
    expect(g.index!.count).toBe(geo.index!.count * 3);
    // entry order follows insertion: the second instance is yawed 90° — compare a vertex and its normal
    const m = onPlanet(4, 2, Math.PI / 2);
    const nm = new Matrix4().copy(m).invert().transpose();
    const P = g.attributes.position.array as Float32Array, N = g.attributes.normal.array as Float32Array;
    const sp = geo.attributes.position.array as Float32Array, sn = geo.attributes.normal.array as Float32Array;
    for (const i of [0, 5, n - 1]) {
      const v = new Vector3(sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]).applyMatrix4(m);
      const o = (n + i) * 3;
      expect(P[o]).toBeCloseTo(v.x, 4);
      expect(P[o + 1]).toBeCloseTo(v.y, 4);
      expect(P[o + 2]).toBeCloseTo(v.z, 4);
      const w = new Vector3(sn[i * 3], sn[i * 3 + 1], sn[i * 3 + 2]).transformDirection(nm);
      expect(N[o]).toBeCloseTo(w.x, 4);
      expect(N[o + 1]).toBeCloseTo(w.y, 4);
      expect(N[o + 2]).toBeCloseTo(w.z, 4);
    }
    // tint only on paintable surfaces; state and origin per vertex
    const C = g.attributes.color.array as Float32Array, M = g.attributes.aMat.array as Float32Array;
    const S = g.attributes.aState.array as Float32Array, O = g.attributes.aOrigin.array as Float32Array;
    const sc = geo.attributes.color.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const paint = M[i] > 99.5;
      expect(C[i * 3]).toBeCloseTo(paint ? 0 : sc[i * 3], 5); // tint 0x00ff00 kills red on paint
      expect(C[i * 3 + 1]).toBeCloseTo(sc[i * 3 + 1], 5);
    }
    expect(S[2 * n]).toBe(3);
    expect(S[0]).toBe(0);
    expect(O[0]).toBeCloseTo(new Vector3(1, R, 1).normalize().x * R, 4);
    expect(Math.hypot(O[0], O[1], O[2])).toBeCloseTo(R, 4);
  });

  it('stays instanced near the camera and while a changed chunk waits to be re-baked', () => {
    const near = setup();
    near.pool.update(camAt(20), R);
    expect(farMeshes(near.pool).filter((m) => m.visible).length).toBe(0);
    expect(instancedDrawn(near.pool)).toBe(3);

    const waiting = setup(1e9);
    waiting.pool.update(camAt(300), R);
    // never quiet long enough: everything drawn instanced
    expect(farMeshes(waiting.pool).filter((m) => m.visible).length).toBe(0);
    expect(instancedDrawn(waiting.pool)).toBe(3);

    const live = setup(0);
    const cam = camAt(300);
    live.pool.update(cam, R);
    expect(instancedDrawn(live.pool)).toBe(0);
    live.pool.setState(live.hs[0], 7);
    live.pool.remove(live.hs[2]);
    live.pool.update(cam, R);
    const far = farMeshes(live.pool).filter((m) => m.visible);
    expect(far.length).toBe(1);
    const S = far[0].geometry.attributes.aState.array as Float32Array;
    expect(S[0]).toBe(7);
    expect(far[0].geometry.attributes.position.count).toBe(live.geo.attributes.position.count * 2);
    live.pool.dispose();
    expect(farMeshes(live.pool).length).toBe(0);
  });
});
