/**
 * Orbital effects in the sim: habitats house residents gradually, stations add jobs, labs research and
 * attractions tourists — and orbital residents survive a save round-trip. Also: the wonder flag only marks
 * real wonders (tag 'wonder' or group 'Wonders'), not every unique landmark.
 */
import { it, expect } from 'vitest';
import { registerItems } from '../src/content/catalog';
import { defInfo } from '../src/sim/defInfo';
import { makeHarness } from './simHarness';

registerItems([
  { id: 't_habitat', name: 'Test Habitat', category: 'orbital', description: '', footprint: 1, placement: 'orbit', cost: 1000, upkeep: 0, tier: 0, effects: { housing: 2000, jobs: 300, research: 50, tourism: 400 }, orbit: { radius: 2, speed: 0.05 } },
  { id: 't_memorial', name: 'Test Memorial', category: 'landmarks', description: '', footprint: 1, placement: 'surface', cost: 1000, upkeep: 0, tier: 0, unique: true },
  { id: 't_wonder', name: 'Test Wonder', category: 'landmarks', group: 'Wonders', description: '', footprint: 1, placement: 'surface', cost: 1000, upkeep: 0, tier: 0, unique: true },
]);

it('only real wonders count as wonders', () => {
  expect(defInfo('t_memorial')!.wonder).toBe(false);
  expect(defInfo('t_wonder')!.wonder).toBe(true);
});

it('orbital habitats house people, employ crews, research and draw tourists', () => {
  const h = makeHarness({ mode: 'sandbox' });
  h.days(3);
  const pop0 = h.sim.getMetric('population');
  const research0 = (h.sim as unknown as { agg: { research: number } }).agg.research;
  const visitors0 = (h.sim as unknown as { agg: { visitors: number } }).agg.visitors;
  h.ops.addOrbital('t_habitat');
  h.days(40);
  const agg = (h.sim as unknown as { agg: { research: number; visitors: number; housingCap: number } }).agg;
  expect(h.sim.getMetric('population') - pop0).toBeGreaterThan(1500);
  expect(agg.research).toBeGreaterThan(research0 + 40);
  expect(agg.visitors).toBeGreaterThan(visitors0 + 300);
  // survives a save / restore
  const saved = JSON.parse(JSON.stringify(h.sim.serialize())) as { orbitalRes?: Record<string, number> };
  expect(Object.values(saved.orbitalRes ?? {})[0]).toBeGreaterThan(1500);
});
