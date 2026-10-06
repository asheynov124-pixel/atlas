import { describe, it, expect } from 'vitest';
import { HexGrid } from '../src/world/hexsphere';

describe('HexGrid', () => {
  for (const f of [1, 2, 5, 16, 40]) {
    it(`frequency ${f} is a valid Goldberg tiling`, () => {
      const g = new HexGrid(f);
      expect(g.count).toBe(10 * f * f + 2);
      let pent = 0;
      for (let i = 0; i < g.count; i++) {
        const d = g.degree(i);
        expect(d === 5 || d === 6).toBe(true);
        if (d === 5) pent++;
        // symmetric adjacency
        for (const j of g.neighbors(i)) expect(g.areNeighbors(j, i)).toBe(true);
        // neighbours are distinct
        expect(new Set(g.neighbors(i)).size).toBe(d);
        // corners are CCW when seen from outside: (c_k - p) x (c_{k+1} - p) · p > 0
        const s = g.start[i];
        const px = g.center[i * 3], py = g.center[i * 3 + 1], pz = g.center[i * 3 + 2];
        for (let k = 0; k < d; k++) {
          const a = (s + k) * 3, b = (s + ((k + 1) % d)) * 3;
          const ax = g.corner[a] - px, ay = g.corner[a + 1] - py, az = g.corner[a + 2] - pz;
          const bx = g.corner[b] - px, by = g.corner[b + 1] - py, bz = g.corner[b + 2] - pz;
          const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
          expect(cx * px + cy * py + cz * pz).toBeGreaterThan(0);
          // neighbour k is across edge (k, k+1): edge midpoint lies between the two centres
          const j = g.nbr[s + k];
          const mx = (g.corner[a] + g.corner[b]) / 2, my = (g.corner[a + 1] + g.corner[b + 1]) / 2, mz = (g.corner[a + 2] + g.corner[b + 2]) / 2;
          const qx = (px + g.center[j * 3]) / 2, qy = (py + g.center[j * 3 + 1]) / 2, qz = (pz + g.center[j * 3 + 2]) / 2;
          expect(Math.hypot(mx - qx, my - qy, mz - qz)).toBeLessThan(g.unitEdge * 0.35);
        }
      }
      expect(pent).toBe(12);
    });
  }
  it('tileAt finds the nearest centre', () => {
    const g = new HexGrid(24);
    for (let t = 0; t < 400; t++) {
      const i = (t * 7919) % g.count;
      const x = g.center[i * 3] + 0.001, y = g.center[i * 3 + 1] - 0.0007, z = g.center[i * 3 + 2];
      expect(g.tileAt(x, y, z, (t * 31) % g.count)).toBe(i);
    }
  });
  it('path connects tiles with adjacent steps', () => {
    const g = new HexGrid(20);
    const p = g.path(5, 3000);
    expect(p[0]).toBe(5);
    expect(p[p.length - 1]).toBe(3000);
    for (let k = 1; k < p.length; k++) expect(g.areNeighbors(p[k - 1], p[k])).toBe(true);
  });
  it('footprints', () => {
    const g = new HexGrid(12);
    let hex = 0;
    while (g.disk(hex, 3).some((t) => g.isPentagon(t))) hex++;
    expect(g.footprint(hex, 7).length).toBe(7);
    expect(g.footprint(hex, 19).length).toBe(19);
  });
});
