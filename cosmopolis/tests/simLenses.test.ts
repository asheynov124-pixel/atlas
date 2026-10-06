/** Lenses, inspector rows and fields stay in range. */
import { describe, it, expect, vi } from 'vitest';
import { makeHarness, layoutTown, plop } from './simHarness';

// long simulated spans: allow time on busy CI machines
vi.setConfig({ testTimeout: 60_000 });

describe('sim lenses & inspect', () => {
  const h = makeHarness({ frequency: 20 });
  layoutTown(h, 0);
  plop(h, 't_power', 0, 9);
  plop(h, 't_water', 0, 9);
  plop(h, 't_police', 0, 3);
  plop(h, 't_park', 0, 4);
  plop(h, 't_shield', 0, 2);
  h.days(80);

  it('offers at least 18 lenses with values in 0..1 (or NaN = no data)', () => {
    const ids = h.sim.lenses.map((l) => l.id);
    expect(ids.length).toBeGreaterThanOrEqual(18);
    for (const want of ['power', 'water', 'oxygen', 'garbage', 'landValue', 'pollution', 'noise', 'crime', 'police', 'fire', 'health', 'education', 'happiness', 'traffic', 'tourism', 'transit', 'data', 'density', 'wealth', 'resources', 'elevation']) expect(ids).toContain(want);
    for (const lens of h.sim.lenses) {
      const v = lens.values(h.planet);
      expect(v.length).toBe(h.planet.count);
      let data = 0;
      for (let i = 0; i < v.length; i++) {
        const x = v[i];
        if (Number.isNaN(x)) continue;
        data++;
        expect(x, lens.id).toBeGreaterThanOrEqual(0);
        expect(x, lens.id).toBeLessThanOrEqual(1);
      }
      expect(data, lens.id).toBeGreaterThan(0);
      expect(lens.legend.length).toBe(2);
    }
  });

  it('has meaningful coverage and traffic', () => {
    const police = h.sim.lenses.find((l) => l.id === 'police')!.values(h.planet);
    let covered = 0;
    for (let i = 0; i < police.length; i++) if (police[i] > 0.5) covered++;
    expect(covered).toBeGreaterThan(20);
    expect(h.sim.stats.traffic).toBeGreaterThanOrEqual(0);
    const roadTile = h.planet.road.findIndex((r) => r > 0);
    expect(h.sim.trafficAt(roadTile)).toBeGreaterThanOrEqual(0);
  });

  it('inspects buildings and tiles with rich rows', () => {
    const home = [...h.sim.recMap.values()].find((r) => r.info.fam === 0 && r.residents > 0)!;
    const rows = h.sim.inspectBuilding(home.id);
    const labels = rows.map((r) => r.label);
    for (const l of ['Happiness', 'Residents', 'Level', 'Power', 'Water', 'Coverage', 'Land value', 'Taxes paid', 'Built']) expect(labels).toContain(l);
    for (const r of rows) expect(typeof r.value).toBe('string');
    const tileRows = h.sim.inspectTile(home.b.tile);
    expect(tileRows.length).toBeGreaterThan(3);
    const plant = [...h.sim.recMap.values()].find((r) => r.info.id === 't_power')!;
    expect(h.sim.inspectBuilding(plant.id).some((r) => r.label === 'Produces')).toBe(true);
  });

  it('shields give damage resistance near them only', () => {
    const shield = [...h.sim.recMap.values()].find((r) => r.info.id === 't_shield')!;
    expect(h.sim.damageResistance(shield.b.tile)).toBeGreaterThan(0.5);
    const far = h.planet.grid.ring(shield.b.tile, 15)[0];
    expect(h.sim.damageResistance(far)).toBeLessThan(0.2);
  });

  it('summarises problems and advice', () => {
    expect(Array.isArray(h.sim.problemsSummary())).toBe(true);
    const tips = h.sim.advisor();
    expect(tips.length).toBeGreaterThan(0);
    expect(tips[0].text.length).toBeGreaterThan(5);
  });
});

describe('sim fields', () => {
  it('incremental (active-tile) passes agree with a full recompute', () => {
    const h = makeHarness({ frequency: 24 });
    layoutTown(h, 0);
    plop(h, 't_power', 0, 9);
    plop(h, 't_water', 0, 9);
    plop(h, 't_police', 0, 3);
    plop(h, 't_park', 0, 4);
    h.days(90);
    const f = h.sim.fields!;
    const lv = Float32Array.from(f.landValue), pol = Float32Array.from(f.pollution), police = Float32Array.from(f.cov[0]);
    f.fullNext = true;
    const sim = h.sim as unknown as { fieldCtx(): never };
    const job = f.pass(sim.fieldCtx());
    while (!job.next().done);
    let dLv = 0, dPol = 0, dCov = 0;
    for (let t = 0; t < h.planet.count; t++) {
      dLv = Math.max(dLv, Math.abs(lv[t] - f.landValue[t]));
      dPol = Math.max(dPol, Math.abs(pol[t] - f.pollution[t]));
      dCov = Math.max(dCov, Math.abs(police[t] - f.cov[0][t]));
    }
    expect(dCov).toBeLessThan(0.05);
    expect(dPol).toBeLessThan(6);
    expect(dLv).toBeLessThan(6);
  });
});
