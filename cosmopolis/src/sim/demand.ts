/**
 * RCI(O) demand with readable causes. Each family's demand is a sum of named terms (jobs pull, unemployment,
 * vacancies, shoppers, goods, graduates, taxes, happiness, land value, policies, events…) clamped to −1..1 and
 * eased over a few days. `reasons` keeps every term (sorted by impact) plus "blocker" notes that explain why
 * zoned lots are not developing (power shortage, no road access, no growables for the zone…).
 */
import type { Simulation } from './Simulation';
import type { DemandReason } from './state';

export type Fam = 'R' | 'C' | 'I' | 'O';

export interface DemandResult {
  target: Record<Fam, number>;
  reasons: Record<Fam, DemandReason[]>;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function computeDemand(sim: Simulation): DemandResult {
  const a = sim.agg;
  const mods = sim.cityMods;
  const ev = sim.eventMods;
  const reasons: Record<Fam, DemandReason[]> = { R: [], C: [], I: [], O: [] };
  const push = (f: Fam, text: string, weight: number, icon?: string) => {
    if (Math.abs(weight) >= 0.005) reasons[f].push({ text, weight, icon });
  };
  const pop = a.population;
  const workforce = a.workforce;
  const jobsTotal = a.jobsTotal + a.pipelineJobsTotal;
  const housing = a.housingCap + a.pipelineHousing;
  const vacancy = housing > 0 ? Math.max(0, (housing - pop) / housing) : 0;
  const tax = sim.taxes;

  // ── Residential
  let R = 0;
  const pioneer = pop < 600 ? 0.55 * (1 - pop / 600) + 0.12 : 0.12;
  R += pioneer;
  push('R', pop < 600 ? 'Pioneers want to settle here' : 'Steady stream of newcomers', pioneer, '🚀');
  const futureWorkers = housing * 0.56 * mods.workforce;
  const jobsPull = clamp((jobsTotal - futureWorkers * 0.92) / Math.max(60, futureWorkers), -0.5, 0.6);
  R += jobsPull;
  push('R', jobsPull >= 0 ? 'Open jobs attract workers' : 'Not enough jobs for new residents', jobsPull, '💼');
  const unempPush = -Math.max(0, a.unemploymentFelt - 0.08) * 3;
  R += unempPush;
  push('R', 'Unemployment scares people off', unempPush, '📉');
  const vac = -Math.max(0, vacancy - 0.1) * 2.2 * Math.min(1, housing / 250);
  R += vac;
  push('R', 'Plenty of empty homes', vac, '🏚️');
  if (pop > 50) {
    const happy = (a.happiness - 55) / 90;
    R += happy;
    push('R', happy >= 0 ? 'Happy citizens spread the word' : 'Unhappy citizens warn their friends', happy, happy >= 0 ? '😊' : '😠');
    const lv = clamp((sim.fields!.avgLandValue - 35) / 160, -0.15, 0.25);
    R += lv;
    push('R', lv >= 0 ? 'Desirable neighbourhoods' : 'Low land value', lv, '🏡');
  }
  const taxR = taxTerm(tax.R);
  R += taxR;
  push('R', taxR >= 0 ? 'Low residential tax' : 'Residential tax is high', taxR, '💸');
  if (sim.displaced > 0) {
    const d = Math.min(0.4, sim.displaced / Math.max(200, pop));
    R += d;
    push('R', 'Displaced families need homes', d, '🧳');
  }
  const pr = mods.demandR + ev.demandR;
  R += pr;
  push('R', 'Policies & events', pr, '📜');

  // ── Commercial
  let C = 0;
  const comCap = a.jobs[1] + a.pipelineJobs[1];
  const shoppers = pop * 0.13 + (a.visitors / 30) * 0.35;
  const shop = clamp((shoppers - comCap) / Math.max(25, shoppers) * 1.1, -0.7, 0.8);
  C += shop;
  push('C', shop >= 0 ? 'Shoppers need more stores' : 'Too many shops for the customers', shop, '🛍️');
  if (pop > 0 && pop < 250) {
    C += 0.12;
    push('C', 'Settlers want a general store', 0.12, '🏪');
  }
  if (a.unemploymentFelt > 0.1) {
    const w = Math.min(0.25, (a.unemploymentFelt - 0.1) * 2);
    C += w;
    push('C', 'Plenty of workers looking for jobs', w, '👷');
  }
  if (a.visitors > 300) {
    const tv = Math.min(0.2, a.visitors / 20000);
    C += tv;
    push('C', 'Tourists love to shop', tv, '📸');
  }
  const taxC = taxTerm(tax.C);
  C += taxC;
  push('C', taxC >= 0 ? 'Low commercial tax' : 'Commercial tax is high', taxC, '💸');
  const pc = mods.demandC + ev.demandC;
  C += pc;
  push('C', 'Policies & events', pc, '📜');

  // ── Industrial
  let I = 0;
  const indCap = a.jobs[2] + a.pipelineJobs[2];
  const goodsNeed = comCap * 0.7 + 40 + pop * 0.07;
  const goods = clamp((goodsNeed - indCap) / Math.max(30, goodsNeed) * 1.1, -0.7, 0.8);
  I += goods;
  push('I', goods >= 0 ? 'Shops & exports need goods' : 'Warehouses are full', goods, '📦');
  if (a.unemploymentFelt > 0.06) {
    const w = Math.min(0.5, a.unemploymentFelt * 2.5);
    I += w;
    push('I', 'Workers need jobs', w, '👷');
  }
  if (a.openJobs > Math.max(40, workforce * 0.15)) {
    const s = -Math.min(0.3, a.openJobs / Math.max(100, workforce));
    I += s;
    push('I', "Factories can't find workers", s, '🏭');
  }
  const taxI = taxTerm(tax.I);
  I += taxI;
  push('I', taxI >= 0 ? 'Low industrial tax' : 'Industrial tax is high', taxI, '💸');
  const pi = mods.demandI + ev.demandI;
  I += pi;
  push('I', 'Policies & events', pi, '📜');

  // ── Office
  let O = 0;
  const skilled = a.workforceSkilled;
  const offCap = a.jobs[3] + a.pipelineJobs[3];
  if (skilled > 20 || offCap > 0) {
    const want = skilled * 0.32 + pop * 0.015;
    const grad = clamp((want - offCap) / Math.max(30, want), -0.7, 0.8);
    O += grad;
    push('O', grad >= 0 ? 'Graduates want office jobs' : 'Not enough educated workers', grad, '🎓');
    if (sim.dataSupply <= 0 && pop > 2500) {
      O -= 0.1;
      push('O', 'Offices want a data uplink', -0.1, '📡');
    }
  } else {
    push('O', 'Educate citizens to attract offices', -0.0051, '🎓');
  }
  const taxO = taxTerm(tax.O);
  if (skilled > 20) {
    O += taxO;
    push('O', taxO >= 0 ? 'Low office tax' : 'Office tax is high', taxO, '💸');
  }
  const po = mods.demandO + ev.demandO;
  O += po;
  push('O', 'Policies & events', po, '📜');

  // ── blockers (explanations, weight 0)
  const g = sim.growth!;
  const blocker = (text: string, icon: string) => {
    for (const f of ['R', 'C', 'I', 'O'] as Fam[]) reasons[f].push({ text, weight: 0, icon, blocker: true });
  };
  if (g.blockedPower > 0) blocker('Power shortage is stalling growth — build more power', '⚡');
  if (g.blockedOxygen > 0) blocker('Oxygen shortage is stalling growth', '🫁');
  if (g.noRoad > 0) blocker(`${g.noRoad} zoned lot${g.noRoad > 1 ? 's have' : ' has'} no road access`, '🛣️');
  for (const [f, zones] of [['R', [1, 2, 3]], ['C', [4, 5, 6]], ['I', [7, 8, 9, 10]], ['O', [11]]] as [Fam, number[]][]) {
    if (g.zoned[['R', 'C', 'I', 'O'].indexOf(f)] > 0 && zones.every((z) => g.defsFor(z).length === 0)) reasons[f].push({ text: 'No building designs for this zone yet', weight: 0, icon: '📐', blocker: true });
  }

  const target = { R: clamp(R, -1, 1), C: clamp(C, -1, 1), I: clamp(I, -1, 1), O: clamp(O, -1, 1) };
  if (sim.rules.maxDemand) target.R = target.C = target.I = target.O = 1;
  for (const f of ['R', 'C', 'I', 'O'] as Fam[]) reasons[f].sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight));
  return { target, reasons };
}

/** Demand penalty / bonus from a tax rate (9 % neutral, steeper above 15 %). */
export function taxTerm(rate: number): number {
  const d = rate - 0.09;
  return d <= 0 ? -d * 2.5 : -d * 4 - Math.max(0, rate - 0.15) * 4;
}
