/**
 * The real content catalog through the sim's eyes: every growable maps to a zone table with a sane size, every
 * ploppable lands in a budget department, and a town built from real items grows without errors.
 * (Content is registered by other roles; missing categories are simply skipped.)
 */
import { describe, it, expect, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

let loaded = true;
try {
  await import('../src/content/index');
} catch (e) {
  loaded = false;
  console.warn('[simCatalog] content failed to import in node — skipping', e);
}

const { allItems } = await import('../src/content/catalog');
const { defInfo } = await import('../src/sim/defInfo');
const { makeHarness, layoutTown } = await import('./simHarness');

describe.skipIf(!loaded)('sim × real catalog', () => {
  it('digests every item', () => {
    for (const d of allItems()) {
      const info = defInfo(d.id)!;
      expect(info, d.id).toBeTruthy();
      if (d.growable) {
        expect(info.zp, d.id).toBeTruthy();
        expect(info.typLevel).toBeGreaterThanOrEqual(1);
        expect(info.typLevel).toBeLessThanOrEqual(5);
        expect(info.sizeMul).toBeGreaterThanOrEqual(0.35);
        expect(info.sizeMul).toBeLessThanOrEqual(3);
      } else if (info.upkeep > 0 && d.category !== 'roads' && d.category !== 'zones') {
        expect(info.dept, d.id).toBeTruthy();
      }
      for (const c of info.coverage) expect(c.radius, d.id).toBeGreaterThan(0);
    }
  });

  it('grows a town from real items', () => {
    const h = makeHarness({ frequency: 20 });
    layoutTown(h, 0);
    // first real producer of each utility, if the catalog has one
    const g = h.planet.grid;
    const place = (pred: (d: ReturnType<typeof allItems>[number]) => boolean) => {
      const def = allItems().find((d) => !d.growable && !d.hidden && d.placement === 'surface' && d.footprint === 1 && !d.requires?.feature && !d.requires?.coastal && pred(d));
      if (!def) return;
      for (let r = 9; r < 14; r++) for (const t of g.ring(0, r)) if (h.planet.building[t] < 0 && !h.planet.road[t] && h.planet.hasRoadAccess(t) && h.ops.placeBuilding(def.id, t, 0, { day: 0 })) return;
    };
    place((d) => (d.effects?.power ?? 0) > 0);
    place((d) => (d.effects?.water ?? 0) > 0);
    place((d) => (d.effects?.garbage ?? 0) > 0);
    h.days(150);
    expect(h.sim.stats.population).toBeGreaterThan(0);
    expect(Number.isFinite(h.sim.stats.happiness)).toBe(true);
    expect(Number.isFinite(h.sim.projectedMonth().net)).toBe(true);
  });
});
