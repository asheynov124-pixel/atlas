/** Save / restore round-trip through planet.serialize() + JSON. */
import { describe, it, expect, vi } from 'vitest';
import { makeHarness, layoutTown, plop } from './simHarness';
import { Planet } from '../src/world/planet';
import { footprintOf } from '../src/content/catalog';

// long simulated spans: allow time on busy CI machines
vi.setConfig({ testTimeout: 60_000 });

describe('sim persistence', () => {
  it('restores the city exactly enough to keep playing', () => {
    const a = makeHarness({ frequency: 20 });
    layoutTown(a, 0);
    plop(a, 't_power', 0, 9);
    plop(a, 't_water', 0, 9);
    plop(a, 't_police', 0, 3);
    a.days(100);
    a.sim.setTax('C', 0.12);
    a.sim.setBudget('police', 1.3);
    a.sim.setPolicy('recycling', true);
    a.sim.takeLoan(5000);
    a.days(5);
    const json = JSON.parse(JSON.stringify(a.planet.serialize()));
    expect(json.simData.sim.v).toBe(1);
    const planet = Planet.deserialize(json, footprintOf);
    const b = makeHarness({ planet, frequency: 20 });
    b.game.clock.day = a.game.clock.day;
    expect(b.sim.stats.population).toBe(a.sim.stats.population);
    expect(b.sim.taxes.C).toBeCloseTo(0.12);
    expect(b.sim.budget.police).toBeCloseTo(1.3);
    expect(b.sim.isPolicyOn('recycling')).toBe(true);
    expect(b.sim.loans.length).toBe(1);
    expect(b.sim.day).toBe(a.sim.day);
    for (const [id, ra] of a.sim.recMap) {
      const rb = b.sim.recMap.get(id)!;
      expect(rb).toBeTruthy();
      expect(rb.happiness).toBeCloseTo(ra.happiness, 1);
      expect(rb.lvlProgress).toBeCloseTo(ra.lvlProgress, 1);
      expect(rb.edu).toBeCloseTo(ra.edu, 1);
    }
    for (let t = 0; t < a.planet.count; t += 37) expect(Math.abs(b.sim.fields!.landValue[t] - a.sim.fields!.landValue[t])).toBeLessThan(1);
    a.days(30);
    b.days(30);
    const pa = a.sim.stats.population, pb = b.sim.stats.population;
    expect(Math.abs(pa - pb)).toBeLessThanOrEqual(Math.max(10, pa * 0.1));
  });

  it('survives a fresh planet without simData and an unload/reload cycle', () => {
    const a = makeHarness();
    layoutTown(a, 0);
    plop(a, 't_power', 0, 9);
    a.days(40);
    a.sim.onPlanetUnloading(a.planet);
    const plain = a.planet.simData.sim as { toJSON?: unknown; recs: { id: number[] } };
    expect(typeof plain.toJSON).toBe('undefined');
    expect(plain.recs.id.length).toBe(a.planet.buildings.size);
    a.sim.onPlanetLoaded(a.planet);
    a.days(5);
    expect(a.sim.stats.buildings).toBeGreaterThan(0);
  });
});

describe('sim persistence edge cases', () => {
  it('a structuredClone of an active planet does not throw and restores to sane defaults', () => {
    const a = makeHarness();
    layoutTown(a, 0);
    plop(a, 't_power', 0, 9);
    a.days(20);
    const clone = structuredClone(a.planet.serialize());
    const planet = Planet.deserialize(clone, footprintOf);
    const b = makeHarness({ planet });
    expect(b.sim.taxes.R).toBeCloseTo(0.09);
    expect(b.sim.stats.buildings).toBe(a.planet.buildings.size);
    b.days(5);
    expect(Number.isFinite(b.sim.day)).toBe(true);
  });
});
