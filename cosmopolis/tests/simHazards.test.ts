/** Disaster interplay: fire spread vs fire coverage, floods, radiation. */
import { describe, it, expect, vi } from 'vitest';
import { makeHarness, layoutTown, plop } from './simHarness';
import { BuildingState, TileFlag } from '../src/core/types';

// long simulated spans: allow time on busy CI machines
vi.setConfig({ testTimeout: 60_000 });

function town(withFire: boolean) {
  const h = makeHarness({ frequency: 20 });
  layoutTown(h, 0);
  plop(h, 't_power', 0, 9);
  plop(h, 't_water', 0, 9);
  if (withFire) for (let k = 0; k < 3; k++) plop(h, 't_fire', 0, 2 + k * 3);
  h.days(100);
  return h;
}

describe('sim hazards', () => {
  it('fires spread and destroy buildings without fire cover; firefighters contain them', () => {
    const results: number[] = [];
    for (const withFire of [false, true]) {
      const h = town(withFire);
      const lost0 = h.sim.hazards!.lost;
      // three separate outbreaks, 8 burning buildings each
      for (let k = 0; k < 3; k++) {
        const homes = [...h.sim.recMap.values()].filter((r) => r.info.growable && r.b.state === BuildingState.Active).slice(k * 8, k * 8 + 8).map((r) => r.b.tile);
        h.ops.setFlags(homes, TileFlag.Burning, true);
        h.days(20);
      }
      results.push(h.sim.hazards!.lost - lost0);
    }
    expect(results[0]).toBeGreaterThan(3);
    expect(results[1]).toBeLessThan(results[0]);
  }, 30_000);

  it('flooded buildings are abandoned, then destroyed if the water stays', () => {
    const h = town(false);
    const r = [...h.sim.recMap.values()].find((x) => x.info.growable && x.b.state === BuildingState.Active)!;
    const id = r.id;
    h.ops.setFlags(r.b.tiles, TileFlag.Flooded, true);
    h.days(7);
    expect(h.planet.buildings.get(id)?.state).toBe(BuildingState.Abandoned);
  });

  it('radiation drives residents out', () => {
    const h = town(false);
    const homes = [...h.sim.recMap.values()].filter((x) => x.info.fam === 0 && x.b.state === BuildingState.Active).slice(0, 5);
    h.ops.setFlags(homes.map((x) => x.b.tile), TileFlag.Irradiated, true);
    h.days(6);
    const abandoned = homes.filter((x) => h.planet.buildings.get(x.id)?.state === BuildingState.Abandoned).length;
    expect(abandoned).toBeGreaterThanOrEqual(3);
  });
});
