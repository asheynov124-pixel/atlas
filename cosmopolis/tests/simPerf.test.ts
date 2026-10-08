/**
 * Performance budget: 16k tiles (f=40) and ~5k buildings. At speed 4 (12 sim days / s) the per-building pass
 * and the field pass are amortised over frames; this guards the raw cost of one sim day and one field pass.
 */
import { it, expect } from 'vitest';
import { makeHarness, plop } from './simHarness';
import { BuildingState, RoadKind, Zone } from '../src/core/types';
import { growablesFor } from '../src/content/catalog';

it('simulates 5k buildings on 16k tiles within budget', () => {
  const h = makeHarness({ frequency: 40 });
  const p = h.planet;
  const g = p.grid;
  const dist = new Map<number, number>();
  for (let r = 0; r <= 62; r++) for (const t of g.ring(0, r)) dist.set(t, r);
  for (const [t, d] of dist) if (d % 3 === 0) h.ops.buildRoad([t], RoadKind.Street);
  for (let k = 0; k < 40; k++) plop(h, 't_power', 0, 1 + k);
  for (let k = 0; k < 30; k++) plop(h, 't_water', 0, 1 + k);
  for (let k = 0; k < 20; k++) {
    plop(h, 't_police', 0, 2 * k + 1);
    plop(h, 't_fire', 0, 2 * k + 2);
    plop(h, 't_clinic', 0, 2 * k + 1);
    plop(h, 't_school', 0, 2 * k);
    plop(h, 't_landfill', 0, 3 * k + 1);
  }
  const zones = [Zone.ResLow, Zone.ResMed, Zone.ResHigh, Zone.ComLow, Zone.ComHigh, Zone.IndGeneral, Zone.Office, Zone.IndTech];
  let i = 0;
  for (const [t] of dist) {
    if (p.road[t] || p.building[t] >= 0 || p.buildings.size >= 5200) continue;
    const z = zones[i++ % zones.length];
    h.ops.setZone([t], z);
    const def = growablesFor(z).find((d) => (d.growable!.minLevel ?? 1) <= 1)!;
    h.ops.placeBuilding(def.id, t, 0, { level: 1 + (i % 3), state: BuildingState.Active });
  }
  expect(p.count).toBe(16002);
  expect(p.buildings.size).toBeGreaterThan(4900);
  h.days(20); // reach a steady state and warm up the JIT
  const sim = h.sim as unknown as { fields: { pass(ctx: unknown): Generator }; fieldCtx(): unknown; finishDay(): void; flushFields(fresh: boolean): void };
  sim.flushFields(true); // warm the stamp cache like a running game would
  // CPU time (not wall clock): parallel test workers and other processes on a shared machine inflate wall time but
  // much less so CPU time. Each sample is the best of 2; we take several samples and judge the median (typical cost)
  // and the best one (the floor — a real regression raises every sample, contention only some of them).
  const proc = (globalThis as unknown as { process?: { cpuUsage(): { user: number; system: number } } }).process;
  const cpuMs = () => {
    if (!proc) return performance.now();
    const u = proc.cpuUsage();
    return (u.user + u.system) / 1000;
  };
  const sampleField = (): number => {
    let best = Infinity;
    for (let rep = 0; rep < 2; rep++) {
      const t0 = cpuMs();
      const job = sim.fields.pass(sim.fieldCtx());
      steps = 0;
      while (!job.next().done) steps++;
      best = Math.min(best, cpuMs() - t0);
    }
    return best;
  };
  const sampleDay = (): number => {
    let best = Infinity;
    for (let rep = 0; rep < 2; rep++) {
      const t0 = cpuMs();
      for (let k = 0; k < 8; k++) sim.finishDay();
      best = Math.min(best, (cpuMs() - t0) / 8);
    }
    return best;
  };
  let steps = 0;
  const fieldSamples: number[] = [];
  for (let s = 0; s < 3; s++) fieldSamples.push(sampleField());
  // one sim day without the field pass (that one is amortised separately)
  (h.sim as unknown as { nextFieldDay: number }).nextFieldDay = 1e9;
  const daySamples: number[] = [];
  for (let s = 0; s < 3; s++) daySamples.push(sampleDay());
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
  // speed 4 = 12 days/s: per-frame cost at 60 fps ≈ (12·day + 4·field) / 60
  const frame = (day: number, field: number) => (12 * day + 4 * field) / 60;
  const perFrame = frame(median(daySamples), median(fieldSamples));
  const bestFrame = frame(Math.min(...daySamples), Math.min(...fieldSamples));
  console.info(
    `[sim perf] ${p.buildings.size} buildings · day ${median(daySamples).toFixed(2)} ms · field pass ${median(fieldSamples).toFixed(2)} ms in ${steps} slices · pop ${h.sim.stats.population}`,
  );
  // Machine contention (load average above the core count) slows even CPU time through cache / frequency effects:
  // widen the median bound then, but keep the floor bound so a genuine regression still fails.
  let contention = 1;
  try {
    const os = (globalThis as unknown as { process?: { getBuiltinModule?(m: string): { loadavg(): number[]; cpus(): unknown[] } } }).process?.getBuiltinModule?.('os');
    if (os) contention = Math.max(1, os.loadavg()[0] / Math.max(1, os.cpus().length));
  } catch {
    /* not node */
  }
  console.info(`[sim perf] ≈ ${perFrame.toFixed(2)} ms per frame at speed 4 (best ${bestFrame.toFixed(2)} ms, contention ×${contention.toFixed(2)})`);
  expect(bestFrame).toBeLessThan(10); // regression floor; ~1.5–3 ms on a desktop
  expect(perFrame).toBeLessThan(contention > 1.25 ? 25 : 14);
  expect(steps).toBeGreaterThan(5); // the field pass really is sliced
}, 120_000);
