/**
 * OWNER: tools. Road pathfinding (tools/pathing).
 */
import { describe, it, expect } from 'vitest';
import { Planet } from '../src/world/planet';
import { Biome, type PlanetSpec } from '../src/core/types';
import { findRoadPath, countBends, isContiguous, chainTiles } from '../src/tools/pathing';

function planet(): Planet {
  const spec: PlanetSpec = {
    id: 'test.path', name: 'Pathia', type: 'terran', seed: 5, frequency: 16, oceanLevel: 0, mountains: 0, temperature: 15, gravity: 1, axialTilt: 0, dayLength: 240,
    atmosphere: { color: 0x88aaff, density: 1, breathable: true }, hasOcean: true, oceanColor: 0x2266aa, cloudCover: 0, rings: null, moons: [],
  };
  const p = new Planet(spec);
  p.elevation.fill(1);
  p.biome.fill(Biome.Grass);
  return p;
}

/** Walk straight across the hex grid. */
function straight(p: Planet, from: number, n: number): number[] {
  const out = [from, p.grid.neighbor(from, 1)];
  while (out.length < n) {
    const prev = out[out.length - 2], cur = out[out.length - 1];
    let best = -1, bd = Infinity;
    for (const q of p.grid.neighbors(cur)) {
      const d = p.grid.dot(q, prev);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    out.push(best);
  }
  return out;
}

describe('findRoadPath', () => {
  it('returns a contiguous path between the endpoints', () => {
    const p = planet();
    const r = findRoadPath(p, 100, 160);
    expect(r.ok).toBe(true);
    expect(r.path[0]).toBe(100);
    expect(r.path[r.path.length - 1]).toBe(160);
    expect(isContiguous(p, r.path)).toBe(true);
  });

  it('follows a straight hex line without bends', () => {
    const p = planet();
    const line = straight(p, 800, 9);
    const r = findRoadPath(p, line[0], line[line.length - 1]);
    expect(r.ok).toBe(true);
    expect(r.path.length).toBe(line.length);
    expect(countBends(p, r.path)).toBe(0);
  });

  it('prefers few bends over zig-zags for off-axis targets', () => {
    const p = planet();
    const a = 1200;
    const line = straight(p, a, 7);
    // step sideways from the end twice
    const side = p.grid.neighbors(line[6]).find((q) => !line.includes(q))!;
    const r = findRoadPath(p, a, side);
    expect(r.ok).toBe(true);
    expect(countBends(p, r.path)).toBeLessThanOrEqual(2);
  });

  it('routes around buildings', () => {
    const p = planet();
    const line = straight(p, 900, 9);
    // wall: block the middle of the straight line and its two side neighbours
    const mid = line[4];
    for (const t of [mid, ...p.grid.neighbors(mid).filter((q) => !line.includes(q))]) p.building[t] = 99;
    p.buildings.set(99, { id: 99, defId: 'x', tile: mid, tiles: [mid], rot: 0, level: 1, variant: 0, style: 'classic', state: 0, builtDay: 0 });
    const r = findRoadPath(p, line[0], line[8]);
    expect(r.ok).toBe(true);
    expect(r.path.some((t) => p.building[t] >= 0)).toBe(false);
    expect(isContiguous(p, r.path)).toBe(true);
  });

  it('flags water and building blockers in the fallback line', () => {
    const p = planet();
    const line = straight(p, 1500, 8);
    // a moat all around the end tile
    const end = line[7];
    for (const t of p.grid.disk(end, 1)) p.elevation[t] = -3;
    p.elevation[end] = -3;
    const r = findRoadPath(p, line[0], end);
    expect(r.ok).toBe(false);
    expect(r.blocked.length).toBeGreaterThan(0);
    expect(r.reason).toMatch(/water/i);
    const bridge = findRoadPath(p, line[0], end, { water: true });
    expect(bridge.ok).toBe(true);
  });

  it('refuses cliffs steeper than maxStep', () => {
    const p = planet();
    const line = straight(p, 2000, 6);
    // a high plateau around the end
    for (const t of p.grid.disk(line[5], 2)) p.elevation[t] = 9;
    const r = findRoadPath(p, line[0], line[5], { maxStep: 2 });
    expect(r.ok).toBe(false);
    const sandbox = findRoadPath(p, line[0], line[5], { maxStep: 99 });
    expect(sandbox.ok).toBe(true);
  });

  it('roadsOnly stays on existing road tiles', () => {
    const p = planet();
    const line = straight(p, 2500, 8);
    for (const t of line) p.road[t] = 2;
    const r = findRoadPath(p, line[0], line[7], { roadsOnly: true, water: true });
    expect(r.ok).toBe(true);
    expect(r.path.every((t) => p.road[t] !== 0)).toBe(true);
  });

  it('chainTiles fills gaps between sampled tiles', () => {
    const p = planet();
    const out: number[] = [];
    chainTiles(p, -1, 300, out);
    chainTiles(p, 300, 340, out);
    expect(out[0]).toBe(300);
    expect(out[out.length - 1]).toBe(340);
    expect(isContiguous(p, out)).toBe(true);
  });
});
