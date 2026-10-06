/** Simulation: zoned growth, utilities gating, levelling, abandonment, oxygen worlds, sandbox rules. */
import { describe, it, expect } from 'vitest';
import { makeHarness, layoutTown, plop } from './simHarness';
import { BuildingState, Zone } from '../src/core/types';

const familyCount = (h: ReturnType<typeof makeHarness>, zones: Zone[]) => {
  let n = 0;
  for (const b of h.planet.buildings.values()) {
    const z = h.sim.recMap.get(b.id)?.info.zone;
    if (z !== undefined && zones.includes(z)) n++;
  }
  return n;
};

describe('sim growth', () => {
  it('grows a powered, watered town on zoned land', () => {
    const h = makeHarness({ frequency: 20 });
    layoutTown(h, 0);
    plop(h, 't_power', 0, 9);
    plop(h, 't_water', 0, 9);
    plop(h, 't_landfill', 0, 9);
    h.days(150);
    const s = h.sim.stats;
    expect(s.population).toBeGreaterThan(300);
    expect(s.buildings).toBeGreaterThan(30);
    expect(familyCount(h, [Zone.ResLow, Zone.ResMed, Zone.ResHigh])).toBeGreaterThan(20);
    expect(familyCount(h, [Zone.ComLow, Zone.ComHigh])).toBeGreaterThan(2);
    expect(familyCount(h, [Zone.IndGeneral])).toBeGreaterThan(2);
    expect(s.jobs).toBeGreaterThan(50);
    for (const v of Object.values(h.sim.demand)) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    const reasons = h.sim.demandReasons();
    expect(reasons.R.length).toBeGreaterThan(0);
    expect(typeof reasons.R[0].text).toBe('string');
  });

  it('new buildings go through construction before opening', () => {
    const h = makeHarness();
    layoutTown(h, 0);
    plop(h, 't_power', 0, 9);
    h.days(1);
    h.days(1);
    const states = [...h.planet.buildings.values()].filter((b) => h.sim.recMap.get(b.id)?.info.growable).map((b) => b.state);
    expect(states).toContain(BuildingState.Constructing);
    h.days(10);
    const active = [...h.planet.buildings.values()].filter((b) => h.sim.recMap.get(b.id)?.info.growable && b.state === BuildingState.Active);
    expect(active.length).toBeGreaterThan(0);
  });

  it('career zones do not develop without power, and explain why', () => {
    const h = makeHarness();
    layoutTown(h, 0);
    h.days(40);
    expect(h.sim.stats.buildings).toBe(0);
    const blockers = h.sim.demandReasons().R.filter((r) => r.blocker);
    expect(blockers.some((b) => /power/i.test(b.text))).toBe(true);
  });

  it('sandbox zones develop even without power', () => {
    const h = makeHarness({ mode: 'sandbox' });
    layoutTown(h, 0);
    h.days(40);
    expect(h.sim.stats.buildings).toBeGreaterThan(5);
  });

  it('services raise land value and buildings level up', () => {
    const h = makeHarness({ frequency: 20 });
    layoutTown(h, 0);
    plop(h, 't_power', 0, 9);
    plop(h, 't_water', 0, 9);
    for (const id of ['t_police', 't_fire', 't_clinic', 't_school', 't_park', 't_park', 't_landfill']) plop(h, id, 0, 3);
    h.days(420);
    let maxLevel = 0;
    for (const b of h.planet.buildings.values()) if (h.sim.recMap.get(b.id)?.info.growable) maxLevel = Math.max(maxLevel, b.level);
    expect(maxLevel).toBeGreaterThanOrEqual(3);
    expect(h.sim.stats.landValue).toBeGreaterThan(25);
    expect(h.sim.stats.happiness).toBeGreaterThan(50);
  });

  it('a blackout leads to abandonment and eventually collapse', () => {
    const h = makeHarness();
    layoutTown(h, 0);
    const plant = plop(h, 't_power', 0, 9);
    plop(h, 't_water', 0, 9);
    h.days(90);
    const grown = h.sim.stats.buildings;
    expect(grown).toBeGreaterThan(20);
    h.ops.removeBuilding(plant, 'bulldoze');
    h.days(60);
    expect(h.sim.stats.abandoned).toBeGreaterThan(5);
    expect(h.sim.problemsSummary().some((p) => p.id === 'power' || p.id === 'abandoned')).toBe(true);
    h.days(150);
    expect(h.sim.stats.buildings).toBeLessThan(grown);
  });

  it('oxygen worlds need oxygen generators', () => {
    const h = makeHarness({ type: 'barren' });
    expect(h.sim.needsOxygen).toBe(true);
    layoutTown(h, 0);
    plop(h, 't_power', 0, 9);
    plop(h, 't_water', 0, 9);
    h.days(40);
    expect(h.sim.stats.population).toBe(0);
    plop(h, 't_oxygen', 0, 9);
    h.days(60);
    expect(h.sim.stats.population).toBeGreaterThan(50);
    expect(h.sim.stats.oxygenSupply).toBeGreaterThan(0);
  });

  it('policies change the city (high-rise ban caps levels)', () => {
    const h = makeHarness();
    expect(h.sim.policies.length).toBeGreaterThanOrEqual(20);
    expect(h.sim.setPolicy('highrise_ban', true)).toBe(true);
    expect(h.sim.isPolicyOn('highrise_ban')).toBe(true);
    expect(h.sim.maxLevelFor(Zone.ResHigh, 0)).toBe(3);
    expect(h.planet.districts[0].policies).toContain('highrise_ban');
    h.sim.setPolicy('highrise_ban', false);
    expect(h.sim.maxLevelFor(Zone.ResHigh, 0)).toBe(5);
    // district-only policy cannot be city-wide
    expect(h.sim.setPolicy('heritage', true, 0)).toBe(false);
  });

  it('publishes every MetricId', () => {
    const h = makeHarness();
    layoutTown(h, 0);
    plop(h, 't_power', 0, 9);
    h.days(35);
    for (const id of ['population', 'happiness', 'money', 'monthlyIncome', 'research', 'jobs', 'unemployment', 'buildings', 'roadTiles', 'zonedTiles', 'parks', 'landValue', 'pollution', 'crime', 'education', 'health', 'tourism', 'powerSupply', 'waterSupply', 'oxygenSupply', 'districts', 'wonders', 'landmarks', 'planetsColonized', 'systemsVisited', 'galaxiesVisited', 'totalPopulation', 'disastersSurvived', 'customBuildings', 'daysPlayed'] as const) {
      expect(Number.isFinite(h.sim.getMetric(id)), id).toBe(true);
    }
    expect(h.sim.getMetric('roadTiles')).toBeGreaterThan(10);
    expect(h.sim.getMetric('zonedTiles')).toBeGreaterThan(10);
  });
});
