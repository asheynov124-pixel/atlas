/**
 * Economy — monthly budget: taxes per zone family, service upkeep by department (× budget slider), road
 * maintenance, policy costs, direct income (spaceports, casinos…), tourism, inactive colonies, loans.
 * `report(apply)` computes the same MonthReport for the live projection (budget panel) and the real month end.
 */
import { allItems, getItem } from '../content/catalog';
import { BuildingState } from '../core/types';
import type { Planet } from '../world/planet';
import { DEPARTMENTS, ROAD_UPKEEP, type DeptId } from './params';
import { POLICY_MAP, policyIncomePer1k, type Mods } from './policies';
import type { BRec, Loan, LoanOffer, MonthReport } from './state';

export interface EconomyContext {
  planet: Planet;
  recs: BRec[];
  taxes: { R: number; C: number; I: number; O: number };
  budget: Record<string, number>;
  modsAt(district: number): Mods;
  cityMods: Mods;
  population: number;
  /** population per district id */
  districtPop: ArrayLike<number>;
  visitorsPerMonth: number;
  loans: Loan[];
  /** Σ inactive colonies' monthly income */
  coloniesIncome: number;
  /** customer factor for commercial (0.4..1.2) */
  customerFactor: number;
  /** events / misc direct income this month */
  bonusIncome: number;
  /** road tiles per RoadKind (maintained by the sim) */
  roadCounts: ArrayLike<number>;
}

let roadUpkeepCache: { version: number; perKind: number[] } | null = null;
let catalogStamp = 0;
export function invalidateEconomyCache(): void {
  catalogStamp++;
  roadUpkeepCache = null;
}

function roadUpkeepPerKind(): number[] {
  if (roadUpkeepCache && roadUpkeepCache.version === catalogStamp) return roadUpkeepCache.perKind;
  const perKind = ROAD_UPKEEP.slice();
  for (const d of allItems()) {
    if (!d.road) continue;
    const k = d.road.kind;
    if (d.upkeep > 0) perKind[k] = d.upkeep;
  }
  roadUpkeepCache = { version: catalogStamp, perKind };
  return perKind;
}

export const INCOME_KEYS = ['residential', 'commercial', 'industrial', 'office', 'tourism', 'services', 'policies', 'colonies', 'events'] as const;
export const INCOME_LABELS: Record<string, string> = {
  residential: 'Residential tax',
  commercial: 'Commercial tax',
  industrial: 'Industrial tax',
  office: 'Office tax',
  tourism: 'Tourism',
  services: 'Venues & ports',
  policies: 'Policy revenue',
  colonies: 'Colonies',
  events: 'Windfalls',
};
export const EXPENSE_LABELS: Record<string, string> = {
  ...Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.name])),
  roads: 'Road maintenance',
  policies: 'Policies',
  loans: 'Loan payments',
};

/** Compute this month's report. Does not touch money (caller applies). Also writes rec.taxPaid when `apply`. */
export function computeReport(ctx: EconomyContext, day: number, apply: boolean): MonthReport {
  const income: Record<string, number> = {};
  const expenses: Record<string, number> = {};
  for (const k of INCOME_KEYS) income[k] = 0;
  for (const d of DEPARTMENTS) expenses[d.id] = 0;
  expenses.roads = 0;
  expenses.policies = 0;
  expenses.loans = 0;
  const p = ctx.planet;
  const t = ctx.taxes;
  for (let i = 0; i < ctx.recs.length; i++) {
    const r = ctx.recs[i];
    const b = r.b;
    const info = r.info;
    if (b.state === BuildingState.Abandoned || b.state === BuildingState.Ruined) {
      if (apply) r.taxPaid = 0;
      continue;
    }
    const active = b.state === BuildingState.Active || b.state === BuildingState.Upgrading || b.state === BuildingState.Burning;
    if (info.growable && info.zp) {
      if (!active) continue;
      const mods = ctx.modsAt(p.district[b.tile]);
      const lvl = Math.max(1, Math.min(5, b.level)) - 1;
      const base = info.zp.taxBase[lvl];
      let tax = 0;
      if (info.fam === 0) {
        tax = r.residents * base * (1 + 0.2 * r.edu) * t.R * mods.taxR;
        income.residential += tax;
      } else if (info.fam === 1) {
        tax = r.workers * base * ctx.customerFactor * t.C * mods.taxC;
        income.commercial += tax;
      } else if (info.fam === 2) {
        tax = r.workers * base * t.I * mods.taxI;
        income.industrial += tax;
      } else if (info.fam === 3) {
        tax = r.workers * base * t.O * mods.taxO;
        income.office += tax;
      }
      if (apply) r.taxPaid = tax;
    } else {
      // ploppables: upkeep × budget, direct income
      const dept = info.dept;
      const mul = dept ? ctx.budget[dept] ?? 1 : 1;
      if (dept) expenses[dept] += info.upkeep * mul;
      if (active && info.income > 0) income.services += info.income * Math.min(1.2, 0.6 + 0.4 * mul);
      else if (active && info.income < 0) expenses[dept ?? 'landmarks'] += -info.income;
      // ploppable housing pays residential tax too
      if (active && r.residents > 0) {
        const tax = r.residents * 33 * (1 + 0.2 * r.edu) * t.R;
        income.residential += tax;
        if (apply) r.taxPaid = tax;
      }
    }
  }
  // orbitals
  for (const o of p.orbitals.values()) {
    const def = getItem(o.defId);
    if (!def) continue;
    expenses.orbital += (def.upkeep ?? 0) * (ctx.budget.orbital ?? 1);
    if ((def.effects?.income ?? 0) > 0) income.services += def.effects!.income!;
  }
  // roads
  const perKind = roadUpkeepPerKind();
  let roadCost = 0;
  for (let k = 1; k < ctx.roadCounts.length; k++) roadCost += ctx.roadCounts[k] * (perKind[k] ?? 4);
  expenses.roads = roadCost * (ctx.budget.roads ?? 1);
  // tourism spending (hotels, souvenirs, overpriced space-ice-cream)
  income.tourism = ctx.visitorsPerMonth * 1.1 * (0.6 + t.C * 4);
  // policies
  const pop = ctx.population;
  for (const d of p.districts) {
    if (!d) continue;
    const dPop = d.id === 0 ? pop : ctx.districtPop[d.id] ?? 0;
    for (const id of d.policies) {
      const pol = POLICY_MAP.get(id);
      if (!pol) continue;
      const k = dPop / 1000;
      if (pol.costPer1k > 0) expenses.policies += pol.costPer1k * k;
      const inc = policyIncomePer1k(pol);
      if (inc > 0) income.policies += inc * k;
    }
  }
  income.policies += ctx.cityMods.incomePer1k * (pop / 1000);
  // loans
  for (const l of ctx.loans) expenses.loans += Math.min(l.monthlyPayment, l.remaining * (1 + l.rate / 12));
  income.colonies = ctx.coloniesIncome;
  income.events = ctx.bonusIncome;
  let ti = 0, te = 0;
  for (const k in income) {
    income[k] = Math.round(income[k]);
    ti += income[k];
  }
  for (const k in expenses) {
    expenses[k] = Math.round(expenses[k]);
    te += expenses[k];
  }
  return { day, income, expenses, totalIncome: ti, totalExpenses: te, net: ti - te };
}

/** Monthly upkeep of each department at the current budget (for the budget panel). */
export function departmentUpkeep(ctx: Pick<EconomyContext, 'recs' | 'budget' | 'planet'>): Record<DeptId, number> {
  const out = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, 0])) as Record<DeptId, number>;
  for (const r of ctx.recs) {
    const d = r.info.dept;
    if (d && r.b.state !== BuildingState.Abandoned && r.b.state !== BuildingState.Ruined) out[d] += r.info.upkeep * (ctx.budget[d] ?? 1);
  }
  for (const o of ctx.planet.orbitals.values()) out.orbital += (getItem(o.defId)?.upkeep ?? 0) * (ctx.budget.orbital ?? 1);
  for (const k in out) out[k as DeptId] = Math.round(out[k as DeptId]);
  return out;
}

// ─────────────────────────────────────────────── loans

export const LENDERS = [
  { lender: 'Orbital Credit Union', icon: '🏦', rate: 0.03, months: 36, factor: 0.5, blurb: 'Sensible, boring, reliable. Their logo is a beige circle.' },
  { lender: 'Nebula Bank & Trust', icon: '🌌', rate: 0.055, months: 60, factor: 1, blurb: 'Bigger loans, longer terms, glossier brochures.' },
  { lender: 'Andromeda Shark Capital', icon: '🦈', rate: 0.12, months: 24, factor: 2, blurb: 'No questions asked. Several questions later.' },
];

export function loanOffers(population: number, loans: Loan[]): LoanOffer[] {
  const base = 20_000 + population * 40;
  return LENDERS.filter((l) => !loans.some((x) => x.lender === l.lender)).map((l) => {
    const amount = Math.round((base * l.factor) / 1000) * 1000;
    return { lender: l.lender, icon: l.icon, amount, rate: l.rate, months: l.months, monthlyPayment: annuity(amount, l.rate, l.months), blurb: l.blurb };
  });
}

export function annuity(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12;
  if (r <= 0) return Math.ceil(principal / months);
  return Math.ceil((principal * r) / (1 - Math.pow(1 + r, -months)));
}

/** Advance loans by one month; returns interest paid. Mutates loans (removes finished ones). */
export function payLoans(loans: Loan[]): { paid: number; finished: Loan[] } {
  let paid = 0;
  const finished: Loan[] = [];
  for (let i = loans.length - 1; i >= 0; i--) {
    const l = loans[i];
    const interest = l.remaining * (l.rate / 12);
    const pay = Math.min(l.monthlyPayment, l.remaining + interest);
    l.remaining = Math.max(0, l.remaining + interest - pay);
    l.monthsLeft--;
    paid += pay;
    if (l.remaining <= 0.5 || l.monthsLeft <= 0) {
      finished.push(l);
      loans.splice(i, 1);
    }
  }
  return { paid, finished };
}
