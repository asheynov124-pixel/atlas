/** Disaster interplay: fire spread vs fire coverage, floods, radiation. */
import { describe, it, expect } from 'vitest';
import { makeHarness, layoutTown, plop } from './simHarness';
import { BuildingState, TileFlag } from '../src/core/types';

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
      const homes = [...h.sim.recMap.values()].filter((r) => r.info.growable).slice(0, 6).map((r) => r.b.tile);
      const lost0 = h.sim.hazards!.lost;
      h.ops.setFlags(homes, TileFlag.Burning, true);
      h.days(25);
      results.push(h.sim.hazards!.lost - lost0);
    }
    expect(results[0]).toBeGreaterThan(0);
    expect(results[1]).toBeLessThan(results[0]);
  });

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
