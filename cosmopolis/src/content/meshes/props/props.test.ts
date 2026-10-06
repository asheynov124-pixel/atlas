/**
 * OWNER: roads-props. Budget, determinism and geometry-contract tests for roads, nature and decor.
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import '../../items/roads';
import '../../items/decor';
import { allItems, getGeometry } from '../../catalog';
import { MeshBuilder } from '../../kit';
import { Rng } from '../../../core/rng';
import { Feature, RoadKind, type PlanetSpec } from '../../../core/types';
import { Planet } from '../../../world/planet';
import { PlanetOps } from '../../../world/ops';
import { MIXES, drawFeature, drawForest } from './nature';
import { TREE_SPECIES, drawTree } from './trees';
import { GeoWriter } from '../../../render/roads/GeoWriter';
import { GlowWriter } from '../../../render/roads/glow';
import { buildRoadTile } from '../../../render/roads/RoadBuilder';
import { ROAD_SPECS, halfSegment, pointOnHalf, travelPoint } from '../../../render/roads/lanes';

const tris = (g: { index: { count: number } | null } | null) => (g?.index ? g.index.count / 3 : 0);

function spec(hasOcean: boolean): PlanetSpec {
  return {
    id: 'test.roads', name: 'Roadia', type: 'terran', seed: 3, frequency: 16, oceanLevel: 0, mountains: 0, temperature: 15, gravity: 1,
    axialTilt: 0, dayLength: 240, atmosphere: { color: 0x88aaff, density: 1, breathable: true }, hasOcean, oceanColor: 0x2266aa,
    cloudCover: 0, rings: null, moons: [],
  };
}

/** Straight-ish line of n tiles starting at `from` heading to neighbour k. */
function line(p: Planet, from: number, k: number, n: number): number[] {
  const g = p.grid;
  const out = [from, g.neighbor(from, k)];
  while (out.length < n) {
    const prev = out[out.length - 2], cur = out[out.length - 1];
    let best = -1, bd = Infinity;
    for (const nb of g.neighbors(cur)) {
      const d = g.dot(nb, prev);
      if (d < bd) {
        bd = d;
        best = nb;
      }
    }
    out.push(best);
  }
  return out;
}

describe('decor items', () => {
  const decor = allItems().filter((d) => d.category === 'decor');
  it('registers at least 45 decor props in the 8 groups', () => {
    expect(decor.length).toBeGreaterThanOrEqual(45);
    const groups = new Set(decor.map((d) => d.group));
    for (const g of ['Trees', 'Plants', 'Furniture', 'Lights', 'Art', 'Signs', 'Sci-Fi', 'Seasonal']) expect(groups.has(g)).toBe(true);
  });
  it('every decor prop is free-placed, footprint 1, ≤ 150 tris and simpler at LOD1', () => {
    for (const d of decor) {
      expect(d.placement).toBe('free');
      expect(d.footprint).toBe(1);
      const g0 = getGeometry(d.id, { lod: 0 });
      const g1 = getGeometry(d.id, { lod: 1 });
      const t0 = tris(g0), t1 = tris(g1);
      expect(t0, d.id).toBeGreaterThan(0);
      expect(t0, d.id).toBeLessThanOrEqual(150);
      expect(t1, d.id).toBeLessThanOrEqual(t0);
      expect(d.description.length).toBeGreaterThan(10);
      expect(d.flavor?.length ?? 0).toBeGreaterThan(5);
    }
  });
});

describe('road items', () => {
  it('registers all six kinds with increasing capacity', () => {
    const roads = allItems().filter((d) => d.road).sort((a, b) => a.road!.kind - b.road!.kind);
    expect(roads.map((r) => r.road!.kind)).toEqual([RoadKind.Path, RoadKind.Street, RoadKind.Avenue, RoadKind.Highway, RoadKind.Maglev, RoadKind.Hyperloop]);
    for (let i = 1; i < roads.length; i++) expect(roads[i].road!.capacity).toBeGreaterThan(roads[i - 1].road!.capacity);
    expect(roads.map((r) => r.tier)).toEqual([0, 0, 1, 2, 4, 6]);
  });
});

describe('nature clusters', () => {
  it('trees stay within budget and are deterministic', () => {
    for (const sp of TREE_SPECIES) {
      const a = new MeshBuilder(0), b = new MeshBuilder(0);
      drawTree(a, sp, new Rng(5));
      drawTree(b, sp, new Rng(5));
      expect(a.triangles, sp).toBeGreaterThan(0);
      expect(a.triangles, sp).toBeLessThanOrEqual(100);
      expect(a.triangles).toBe(b.triangles);
    }
  });
  it('forest clusters ≤ 680 tris (dense) / 320 (light) and LOD1 is lighter', () => {
    for (const mix of Object.keys(MIXES))
      for (const dense of [false, true])
        for (let v = 0; v < 4; v++) {
          const b0 = new MeshBuilder(0), b1 = new MeshBuilder(1);
          drawForest(b0, mix, dense, new Rng(100 + v));
          drawForest(b1, mix, dense, new Rng(100 + v));
          expect(b0.triangles, `${mix} ${dense}`).toBeLessThanOrEqual(dense ? 680 : 320);
          expect(b1.triangles).toBeLessThan(b0.triangles);
        }
  });
  it('every feature × planet flavour draws something within budget', () => {
    const features = [Feature.Rocks, Feature.Ore, Feature.CrystalDeposit, Feature.IceDeposit, Feature.GasVent, Feature.GeoVent, Feature.Ruins, Feature.Flowers, Feature.AlienFlora, Feature.Kelp, Feature.Rubble, Feature.Crater];
    const flavours = ['terran', 'desert', 'arctic', 'volcanic', 'ocean', 'jungle', 'barren', 'toxic', 'crystal', 'fungal', 'tundra', 'machine', 'terran.snow'];
    for (const f of features)
      for (const fl of flavours) {
        const b = new MeshBuilder(0);
        drawFeature(b, f, fl, new Rng(9));
        expect(b.triangles, `${f} ${fl}`).toBeGreaterThan(0);
        expect(b.triangles, `${f} ${fl}`).toBeLessThanOrEqual(400);
      }
  });
});

describe('road geometry & lanes', () => {
  it('halves meet exactly at the shared edge midpoint (traffic never jumps)', () => {
    const p = new Planet(spec(false));
    const ops = new PlanetOps(p);
    const path = line(p, 100, 0, 8);
    ops.buildRoad(path, RoadKind.Avenue);
    ops.setElevation([path[4]], 2); // a terrace step → ramp
    const a = new Vector3(), b = new Vector3();
    for (let i = 0; i + 1 < path.length; i++) {
      for (const lat of [0, 0.125, -0.255]) {
        travelPoint(p, path[i], path[i + 1], 0.5 - 1e-6, lat, a);
        travelPoint(p, path[i], path[i + 1], 0.5 + 1e-6, lat, b);
        expect(a.distanceTo(b)).toBeLessThan(2e-3);
      }
    }
    // the ramp sits on the lower tile: its edge height equals the higher deck
    const k = p.grid.neighborIndex(path[3], path[4]);
    const seg = halfSegment(p, path[3], k);
    expect(seg.edgeH).toBeGreaterThan(seg.nodeH + 0.3);
    pointOnHalf(p, seg, 1, 0, a);
    expect(a.length() - p.radius).toBeCloseTo(seg.edgeH, 4);
  });
  it('bakes every kind, junctions, dead ends and bridges without throwing', () => {
    const p = new Planet(spec(true));
    const ops = new PlanetOps(p);
    // water on one side
    for (let t = 0; t < p.count; t++) if (p.grid.center[t * 3] > 0.35) p.elevation[t] = -3;
    const w = new GeoWriter(), glow = new GlowWriter();
    const trees: number[] = [];
    for (let kind = RoadKind.Path; kind <= RoadKind.Hyperloop; kind++) {
      const start = 50 + kind * 37;
      const main = line(p, start, 0, 7);
      ops.buildRoad(main, kind, true);
      ops.buildRoad(line(p, main[3], 2, 3), kind, true);
    }
    ops.buildRoad([400], RoadKind.Street);
    let roadTiles = 0;
    for (let t = 0; t < p.count; t++) {
      if (!p.road[t]) continue;
      roadTiles++;
      w.reset();
      glow.reset();
      expect(() => buildRoadTile(p, t, { w, glow, trees })).not.toThrow();
      expect(w.triangles, `kind ${p.road[t]}`).toBeGreaterThan(0);
      expect(w.triangles, `kind ${p.road[t]}`).toBeLessThan(1600);
    }
    expect(roadTiles).toBeGreaterThan(40);
    expect(trees.length % 8).toBe(0);
    expect(ROAD_SPECS[RoadKind.Street].lanes[0]).toBeLessThan(ROAD_SPECS[RoadKind.Street].carriage);
  });
});
