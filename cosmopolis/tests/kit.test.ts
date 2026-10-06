import { describe, it, expect } from 'vitest';
import { MeshBuilder, Mat } from '../src/content/kit';
import type { BufferGeometry } from 'three';

/** For convex shapes centred at c: every triangle's geometric normal and stored normals point away from c. */
function checkOutward(g: BufferGeometry, cx: number, cy: number, cz: number) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), idx = g.index!;
  let bad = 0, badN = 0;
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a);
    const ux = p.getX(b) - ax, uy = p.getY(b) - ay, uz = p.getZ(b) - az;
    const vx = p.getX(c) - ax, vy = p.getY(c) - ay, vz = p.getZ(c) - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue; // degenerate (poles)
    const mx = (ax + p.getX(b) + p.getX(c)) / 3 - cx, my = (ay + p.getY(b) + p.getY(c)) / 3 - cy, mz = (az + p.getZ(b) + p.getZ(c)) / 3 - cz;
    if (nx * mx + ny * my + nz * mz < 0) bad++;
    if (n.getX(a) * mx + n.getY(a) * my + n.getZ(a) * mz < -1e-6) badN++;
  }
  expect(bad).toBe(0);
  expect(badN).toBe(0);
}

describe('MeshBuilder', () => {
  it('box', () => { const b = new MeshBuilder(); b.box(1, 2, 1, { color: 0xff0000, bottom: true }); checkOutward(b.build(), 0, 1, 0); });
  it('cyl smooth + flat', () => {
    const b = new MeshBuilder(); b.cyl(0.5, 0.5, 2, { color: 0xffffff, seg: 16, capBottom: true }); checkOutward(b.build(), 0, 1, 0);
    const f = new MeshBuilder(); f.prism(6, 0.5, 2, { color: 0xffffff, capBottom: true }); checkOutward(f.build(), 0, 1, 0);
  });
  it('sphere', () => { const b = new MeshBuilder(); b.sphere(1, { color: 0xffffff, y: 0 }); checkOutward(b.build(), 0, 0, 0); });
  it('dome', () => { const b = new MeshBuilder(); b.dome(1, { color: 0xffffff }); checkOutward(b.build(), 0, 0, 0); });
  it('torus', () => {
    const b = new MeshBuilder(); b.torus(2, 0.4, { color: 0xffffff });
    const g = b.build(); const p = g.getAttribute('position'), n = g.getAttribute('normal'), idx = g.index!;
    // outward from the tube centre-line
    let bad = 0;
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), bb = idx.getX(t + 1), c = idx.getX(t + 2);
      const ux = p.getX(bb) - p.getX(a), uy = p.getY(bb) - p.getY(a), uz = p.getZ(bb) - p.getZ(a);
      const vx = p.getX(c) - p.getX(a), vy = p.getY(c) - p.getY(a), vz = p.getZ(c) - p.getZ(a);
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (Math.hypot(nx, ny, nz) < 1e-9) continue;
      if (nx * n.getX(a) + ny * n.getY(a) + nz * n.getZ(a) < 0) bad++;
    }
    expect(bad).toBe(0);
  });
  it('lathe', () => { const b = new MeshBuilder(); b.lathe([[0.001, 0], [1, 0.2], [0.8, 1.5], [0.001, 2]], { color: 0xffffff }); checkOutward(b.build(), 0, 1, 0); });
  it('extrude both orientations', () => {
    const sq: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const poly of [sq, [...sq].reverse()]) { const b = new MeshBuilder(); b.extrude(poly, 1, { color: 0xffffff }); checkOutward(b.build(), 0, 0.5, 0); }
  });
  it('pyramid, gable, wedge', () => {
    const b = new MeshBuilder(); b.pyramid(1, 1, 1, { color: 0xffffff }); checkOutward(b.build(), 0, 0.25, 0);
    const c = new MeshBuilder(); c.gable(1, 1, 1, { color: 0xffffff, overhang: 0 }); checkOutward(c.build(), 0, 0.3, 0);
    const w = new MeshBuilder(); w.wedge(1, 1, 1, { color: 0xffffff }); checkOutward(w.build(), 0, 0.3, -0.15);
  });
  it('transforms, paint flag, lod skips detail, window uv rows', () => {
    const b = new MeshBuilder(1);
    b.box(1, 1, 1, { color: 0xffffff, detail: true });
    expect(b.triangles).toBe(0);
    b.group({ y: 2, ry: Math.PI / 4 }, () => b.box(1, 1, 1, { color: 0xffffff, mat: Mat.Window }));
    const g = b.build();
    const m = g.getAttribute('aMat');
    expect(m.getX(0)).toBe(Mat.Window + 100);
    // side-face v coordinates are building-space heights (floor alignment)
    const uv = g.getAttribute('uv');
    let maxV = 0; for (let i = 0; i < uv.count; i++) maxV = Math.max(maxV, uv.getY(i));
    expect(maxV).toBeCloseTo(3, 3);
  });
});
