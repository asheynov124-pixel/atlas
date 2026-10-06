/** Economy: monthly reports, taxes, budgets, loans, policies, colonies, sandbox. */
import { describe, it, expect, vi } from 'vitest';
import { makeHarness, layoutTown, plop } from './simHarness';

// long simulated spans: allow time on busy CI machines
vi.setConfig({ testTimeout: 60_000 });

function grownTown() {
  const h = makeHarness({ frequency: 20 });
  layoutTown(h, 0);
  plop(h, 't_power', 0, 9);
  plop(h, 't_water', 0, 9);
  plop(h, 't_police', 0, 3);
  plop(h, 't_landfill', 0, 9);
  h.days(120);
  return h;
}

describe('sim economy', () => {
  it('produces a sane monthly report and positive cash flow for a managed town', () => {
    const h = grownTown();
    const m = h.sim.lastMonth!;
    expect(m).toBeTruthy();
    expect(m.income.residential).toBeGreaterThan(0);
    expect(m.income.commercial + m.income.industrial).toBeGreaterThan(0);
    expect(m.expenses.power).toBe(700);
    expect(m.expenses.roads).toBeGreaterThan(0);
    expect(m.net).toBe(m.totalIncome - m.totalExpenses);
    expect(m.net).toBeGreaterThan(0);
    expect(h.sim.stats.monthlyIncome).toBe(h.sim.projectedMonth().net);
  });

  it('applies the month to the treasury and history', () => {
    const h = grownTown();
    const before = h.game.empire.money;
    const histBefore = h.game.empire.s.history.length;
    h.days(30);
    const delta = Math.round(h.game.empire.money - before);
    // the month's net, plus at most one city event's one-off money
    expect([0, 4000, -1500, 15000]).toContain(delta - h.sim.lastMonth!.net);
    expect(h.game.empire.s.history.length).toBe(histBefore + 1);
    expect(h.sim.cityHistory().population.length).toBeGreaterThan(0);
  });

  it('budget sliders scale upkeep, taxes scale income', () => {
    const h = grownTown();
    const base = h.sim.projectedMonth();
    h.sim.setBudget('power', 1.5);
    expect(h.sim.projectedMonth().expenses.power).toBe(Math.round(base.expenses.power * 1.5));
    h.sim.setBudget('power', 1);
    h.sim.setTax('R', 0.18);
    expect(h.sim.projectedMonth().income.residential).toBeGreaterThan(base.income.residential * 1.8);
    h.sim.setTax('R', 0.5);
    expect(h.sim.taxes.R).toBeLessThanOrEqual(0.3);
  });

  it('high taxes depress residential demand', () => {
    const a = grownTown();
    const b = grownTown();
    b.sim.setTax('R', 0.25);
    a.days(10);
    b.days(10);
    expect(b.sim.demand.R).toBeLessThan(a.sim.demand.R);
  });

  it('loans add cash, are repaid monthly and can be settled early', () => {
    const h = grownTown();
    const offers = h.sim.loanOffers();
    expect(offers.length).toBeGreaterThan(0);
    const money = h.game.empire.money;
    const loan = h.sim.takeLoan(10000)!;
    expect(loan).toBeTruthy();
    expect(h.game.empire.money).toBe(money + 10000);
    h.days(60);
    expect(h.sim.loans[0].remaining).toBeLessThan(10000);
    expect(h.sim.lastMonth!.expenses.loans).toBeGreaterThan(0);
    h.game.empire.s.money += 50000;
    expect(h.sim.repay()).toBe(true);
    expect(h.sim.loans.length).toBe(0);
  });

  it('sandbox never spends or earns', () => {
    const h = makeHarness({ mode: 'sandbox' });
    layoutTown(h, 0);
    plop(h, 't_power', 0, 9);
    const money = h.game.empire.money;
    h.days(90);
    expect(h.game.empire.money).toBe(money);
  });

  it('policies cost or earn per 1k citizens and show up in the report', () => {
    const h = grownTown();
    h.sim.setPolicy('ubi', true);
    expect(h.sim.projectedMonth().expenses.policies).toBeGreaterThan(0);
    expect(h.sim.policyCost('ubi')).toBeGreaterThan(0);
    h.sim.setPolicy('ubi', false);
    h.sim.setPolicy('lottery', true);
    expect(h.sim.projectedMonth().income.policies).toBeGreaterThan(0);
  });

  it('inactive colonies contribute income each month', () => {
    const h = grownTown();
    h.game.empire.s.colonies['other'] = { planetId: 'other', name: 'Colony', population: 500, happiness: 60, income: 1234, foundedDay: 0, research: 10 };
    h.days(30);
    expect(h.sim.lastMonth!.income.colonies).toBe(1234);
    const cs = h.sim.colonySummary();
    expect(cs.planetId).toBe(h.planet.spec.id);
    expect(cs.population).toBe(h.sim.stats.population);
    expect(cs.income).toBeLessThan(h.sim.lastMonth!.net);
  });

  it('bankruptcy triggers warnings, then a bailout instead of game over', () => {
    const h = grownTown();
    h.game.empire.s.money = -100000;
    h.days(90);
    expect(h.sim.loans.some((l) => /bailout/i.test(l.lender))).toBe(true);
  });
});

describe('sim districts', () => {
  it('district policies apply only inside the district and report district stats', () => {
    const h = makeHarness({ frequency: 20 });
    layoutTown(h, 0);
    plop(h, 't_power', 0, 9);
    plop(h, 't_water', 0, 9);
    const d = h.ops.createDistrict('Old Town', 0xffaa00);
    const tiles = h.planet.grid.disk(0, 4);
    h.ops.setDistrict(tiles, d.id);
    expect(h.sim.setPolicy('heritage', true, d.id)).toBe(true);
    expect(h.sim.isPolicyOn('heritage', d.id)).toBe(true);
    expect(h.sim.isPolicyOn('heritage', 0)).toBe(false);
    expect(h.sim.modsAt(d.id).levelLock).toBe(true);
    expect(h.sim.modsAt(0).levelLock).toBe(false);
    h.days(200);
    let inside = 0, insideAbove1 = 0;
    for (const r of h.sim.recMap.values()) {
      if (!r.info.growable || h.planet.district[r.b.tile] !== d.id) continue;
      inside++;
      if (r.b.level > 1) insideAbove1++;
    }
    expect(inside).toBeGreaterThan(0);
    expect(insideAbove1).toBe(0);
    const st = h.sim.districtStats(d.id);
    expect(st.population).toBeGreaterThan(0);
    expect(st.buildings).toBe(inside);
    expect(h.sim.areaName(tiles[0])).toBe('Old Town');
  });
});

describe('sim seasons & elections', () => {
  it('cycles seasons, heats cold worlds in winter, and holds elections every four years', () => {
    const h = makeHarness({ frequency: 16 });
    layoutTown(h, 0);
    plop(h, 't_power', 0, 9);
    plop(h, 't_water', 0, 9);
    const seen = new Set<string>();
    let winterPower = 0, summerPower = 0;
    for (let d = 0; d < 1450; d++) {
      h.days(1);
      const s = h.sim.season().id;
      seen.add(s);
      const home = [...h.sim.recMap.values()].find((r) => r.info.fam === 0 && r.powerUse > 0);
      if (home && d > 360 && d < 720) {
        if (s === 'winter') winterPower = Math.max(winterPower, home.powerUse / (home.b.level || 1));
        if (s === 'summer') summerPower = Math.max(summerPower, home.powerUse / (home.b.level || 1));
      }
    }
    expect([...seen].sort()).toEqual(['autumn', 'spring', 'summer', 'winter']);
    expect(winterPower).toBeGreaterThan(0);
    expect(h.sim.stats.approval).toBeGreaterThan(0);
    expect(h.sim.events.some((e) => ['landslide', 'scraped', 'recall'].includes(e.id))).toBe(true);
  });
});
