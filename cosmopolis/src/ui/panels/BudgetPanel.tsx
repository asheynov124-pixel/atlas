/**
 * OWNER: ui-panels.
 * Budget panel ('budget') — treasury hero with this month's projection and an income trend; tabs:
 *   Overview  income / expense breakdown (live projection vs last month) with proportional bars
 *   Taxes     R · C · I · O sliders (0–30 %) with demand meters, projected revenue and citizen mood lines
 *   Services  department funding sliders (50–150 %) with upkeep and effectiveness; quick "set all"
 *   Loans     active loans (repay) and lender offers (borrow, max 3)
 * Reads game.sim (projectedMonth, lastMonth, taxes, budget, departments, departmentUpkeep, loans, loanOffers).
 */
import { useState } from 'preact/hooks';
import { game } from '../../game/instance';
import { Button, Chip, EmptyState, IconOrEmoji, SectionHeader, Segmented, Slider, BarMeter, Icon } from '../core';
import { fmtMoney, fmtCompact, fmtSigned } from '../core/format';
import { confirmDialog, ui } from '../store';
import { Sparkline, isSandbox, safe, sim, useLive } from './common';

type Tab = 'overview' | 'taxes' | 'services' | 'loans';
const tabMemory = { tab: 'overview' as Tab };

const INCOME_ICON: Record<string, string> = {
  residential: '🏠',
  commercial: '🛍️',
  industrial: '🏭',
  office: '🏢',
  tourism: '📸',
  services: '🚀',
  policies: '📜',
  colonies: '🪐',
  events: '🎁',
};

export const FAMILIES = [
  { k: 'R' as const, name: 'Residential', color: 'var(--zone-r)', key: 'residential', icon: '🏠' },
  { k: 'C' as const, name: 'Commercial', color: 'var(--zone-c)', key: 'commercial', icon: '🛍️' },
  { k: 'I' as const, name: 'Industrial', color: 'var(--zone-i)', key: 'industrial', icon: '🏭' },
  { k: 'O' as const, name: 'Office', color: 'var(--zone-o)', key: 'office', icon: '🏢' },
];

function taxMood(rate: number): { text: string; tone: string } {
  const p = rate * 100;
  if (p <= 3) return { text: 'Basically a gift. Accountants weep.', tone: 'good' };
  if (p <= 7) return { text: 'Generous. Citizens send thank-you cards.', tone: 'good' };
  if (p <= 10) return { text: 'Fair and square.', tone: 'good' };
  if (p <= 13) return { text: 'Grumbling at the water cooler.', tone: 'warn' };
  if (p <= 17) return { text: 'Pitchforks are being sharpened.', tone: 'warn' };
  if (p <= 22) return { text: 'Open revolt on the Hypernet.', tone: 'bad' };
  return { text: 'Mass exodus. Moving vans sold out.', tone: 'bad' };
}

function Breakdown({ title, icon, rows, total, tone, labels, last }: { title: string; icon: string; rows: [string, number][]; total: number; tone: 'good' | 'bad'; labels: Record<string, string>; last?: Record<string, number> | null }) {
  const max = rows.reduce((m, r) => Math.max(m, r[1]), 1);
  const deptIcon = (k: string) => safe(() => game.sim.departments.find((d) => d.id === k)?.icon, '') || INCOME_ICON[k] || (k === 'roads' ? '🛣️' : k === 'loans' ? '🏦' : '•');
  return (
    <section class="up-card up-breakdown">
      <div class="up-breakdown-head">
        <span class={'up-dot tone-' + tone} />
        <h4>{title}</h4>
        <span class={'num up-breakdown-total ' + tone}>{fmtMoney(total)}</span>
      </div>
      {rows.length === 0 ? (
        <div class="up-muted-line">{icon === 'income' ? 'No revenue yet — zone some lots.' : 'Nothing to pay for. Enjoy it while it lasts.'}</div>
      ) : (
        rows.map(([k, v]) => {
          const prev = last?.[k];
          const delta = prev !== undefined ? v - prev : 0;
          return (
            <div key={k} class="up-brow">
              <span class="up-brow-icon">{deptIcon(k)}</span>
              <span class="up-brow-label ellipsis">{labels[k] ?? k}</span>
              <span class="up-brow-bar">
                <span class={'tone-' + tone} style={{ transform: `scaleX(${Math.max(0.02, v / max)})` }} />
              </span>
              <span class="up-brow-val num">
                {fmtCompact(v)}
                {Math.abs(delta) >= 1 && <span class={'up-brow-delta ' + ((delta > 0) === (tone === 'good') ? 'good' : 'bad')}>{delta > 0 ? '▲' : '▼'}</span>}
              </span>
            </div>
          );
        })
      )}
    </section>
  );
}

function Overview() {
  const s = sim();
  if (!s) return null;
  const rep = safe(() => s.projectedMonth(), null);
  const last = s.lastMonth;
  if (!rep) return <EmptyState icon="budget" title="No city yet" body="Found a city to see its finances." />;
  const inc = Object.entries(rep.income).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const exp = Object.entries(rep.expenses).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div class="up-stack-v">
      <div class="up-cols">
        <Breakdown title="Income" icon="income" rows={inc} total={rep.totalIncome} tone="good" labels={s.incomeLabels} last={last?.income} />
        <Breakdown title="Expenses" icon="expense" rows={exp} total={rep.totalExpenses} tone="bad" labels={s.expenseLabels} last={last?.expenses} />
      </div>
      {last && (
        <div class="up-card up-compare">
          <Icon name="calendar" size={16} />
          <span class="grow">Last month closed at</span>
          <b class={'num ' + (last.net >= 0 ? 'good' : 'bad')}>{fmtSigned(last.net, false)}</b>
          <span class="dim num">({fmtCompact(last.totalIncome)} in · {fmtCompact(last.totalExpenses)} out)</span>
        </div>
      )}
    </div>
  );
}

function Taxes() {
  const s = sim();
  if (!s) return null;
  const rep = safe(() => s.projectedMonth(), null);
  const d = ui.demand.value;
  const setAll = (fn: (v: number) => number) => {
    for (const f of FAMILIES) s.setTax(f.k, fn(s.taxes[f.k]));
  };
  return (
    <div class="up-stack-v">
      <div class="up-chiprow">
        <Chip icon="minus" onClick={() => setAll((v) => Math.max(0, v - 0.01))}>All −1%</Chip>
        <Chip icon="refresh" onClick={() => setAll(() => 0.09)}>Reset to 9%</Chip>
        <Chip icon="plus" onClick={() => setAll((v) => Math.min(0.3, v + 0.01))}>All +1%</Chip>
      </div>
      {FAMILIES.map((f) => {
        const rate = s.taxes[f.k];
        const mood = taxMood(rate);
        const revenue = rep?.income[f.key] ?? 0;
        return (
          <section key={f.k} class="up-card up-tax">
            <div class="up-tax-head">
              <span class="up-zone-badge" style={{ background: f.color }}>
                {f.k}
              </span>
              <div class="grow">
                <div class="up-tax-name">{f.name}</div>
                <div class={'up-tax-mood ' + mood.tone}>{mood.text}</div>
              </div>
              <div class="up-tax-right">
                <div class="up-tax-rate num">{(rate * 100).toFixed(1)}%</div>
                <div class="up-tax-rev num">{fmtMoney(revenue, true)}/mo</div>
              </div>
            </div>
            <Slider value={rate * 100} min={0} max={30} step={0.5} ticks={[9]} color={f.color} onChange={(v) => s.setTax(f.k, v / 100)} />
            <div class="up-tax-demand">
              <span class="dim">Demand</span>
              <BarMeter value={d[f.k]} bipolar color={f.color} length={120} thickness={6} />
              <span class={'num ' + (d[f.k] > 0.05 ? 'good' : d[f.k] < -0.05 ? 'bad' : 'dim')}>{d[f.k] > 0 ? '+' : ''}{Math.round(d[f.k] * 100)}</span>
            </div>
          </section>
        );
      })}
      <p class="up-footnote">Every family has its breaking point. Past ~12% buildings start to complain; push further and they pack up and leave.</p>
    </div>
  );
}

function Services() {
  const s = sim();
  if (!s) return null;
  const up = safe(() => s.departmentUpkeep(), {} as Record<string, number>);
  const deps = [...s.departments].sort((a, b) => (up[b.id] ?? 0) - (up[a.id] ?? 0));
  const active = deps.filter((d) => (up[d.id] ?? 0) > 0);
  const idle = deps.filter((d) => !((up[d.id] ?? 0) > 0));
  const total = active.reduce((t, d) => t + (up[d.id] ?? 0), 0);
  const allVal = active.length ? active.reduce((t, d) => t + (s.budget[d.id] ?? 1), 0) / active.length : 1;
  const preset = Math.abs(allVal - 0.75) < 0.01 ? 0.75 : Math.abs(allVal - 1) < 0.01 ? 1 : Math.abs(allVal - 1.25) < 0.01 ? 1.25 : -1;
  return (
    <div class="up-stack-v">
      <div class="up-card up-svc-sum">
        <div class="grow">
          <div class="up-kicker">Service upkeep</div>
          <div class="up-big num bad">{fmtMoney(total)}<span class="up-unit">/mo</span></div>
        </div>
        <Segmented
          size="sm"
          value={preset}
          onChange={(v) => {
            if (v < 0) return;
            for (const d of s.departments) s.setBudget(d.id, v);
          }}
          options={[
            { value: 0.75, label: 'Lean' },
            { value: 1, label: 'Normal' },
            { value: 1.25, label: 'Lavish' },
          ]}
          ariaLabel="Set every department"
        />
      </div>
      {active.length === 0 && <EmptyState icon="services" title="No services yet" body="Build power plants, schools and stations — their funding appears here." />}
      {active.map((d) => {
        const v = s.budget[d.id] ?? 1;
        const eff = Math.round((0.4 + 0.6 * v) * 100);
        return (
          <section key={d.id} class="up-card up-dept">
            <div class="up-dept-head">
              <span class="up-dept-icon">
                <IconOrEmoji value={d.icon} size={18} />
              </span>
              <div class="grow">
                <div class="up-dept-name">{d.name}</div>
                <div class="up-dept-blurb ellipsis">{d.blurb}</div>
              </div>
              <div class="up-tax-right">
                <div class="num up-dept-pct">{Math.round(v * 100)}%</div>
                <div class="num up-tax-rev">{fmtMoney(up[d.id] ?? 0, true)}/mo</div>
              </div>
            </div>
            <Slider value={v * 100} min={50} max={150} step={5} ticks={[100]} onChange={(x) => s.setBudget(d.id, x / 100)} color={v < 0.85 ? 'var(--warn)' : v > 1.15 ? 'var(--accent-2)' : undefined} />
            <div class="up-dept-eff dim">
              Effectiveness <b class={'num ' + (eff < 90 ? 'warn' : eff > 110 ? 'accent' : '')}>{eff}%</b>
              {v < 0.75 ? ' · corners are being cut' : v > 1.3 ? ' · gold-plated everything' : ''}
            </div>
          </section>
        );
      })}
      {idle.length > 0 && (
        <div class="up-idle">
          <span class="dim">Not funded yet:</span>
          {idle.map((d) => (
            <Chip key={d.id} size="sm" icon={d.icon}>
              {d.name}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function Loans() {
  const s = sim();
  if (!s) return null;
  const offers = safe(() => s.loanOffers(), []);
  const loans = s.loans;
  const debt = loans.reduce((t, l) => t + l.remaining, 0);
  const borrow = async (lender: string, amount: number, monthly: number, months: number) => {
    const ok = await confirmDialog({
      title: `Borrow ${fmtMoney(amount)}?`,
      body: `${lender} wants ${fmtMoney(monthly)} a month for ${months} months. Total cost ${fmtMoney(monthly * months)}.`,
      okLabel: 'Sign here',
    });
    if (ok) s.takeLoan(undefined, lender);
  };
  const repay = async (id: number | undefined, amount: number, who: string) => {
    const ok = await confirmDialog({ title: `Repay ${fmtMoney(amount)}?`, body: id === undefined ? 'Clear every loan in one go. The bankers will miss you.' : `Settle your debt with ${who} early.`, okLabel: 'Repay' });
    if (ok) s.repay(id);
  };
  return (
    <div class="up-stack-v">
      <SectionHeader title="Your loans" icon="wallet" subtitle={loans.length ? `${fmtMoney(debt)} outstanding` : 'Debt-free. Your accountant is suspicious.'} action={loans.length > 1 ? <Button size="sm" variant="glass" onClick={() => void repay(undefined, debt, 'everyone')}>Repay all</Button> : undefined} />
      {loans.map((l) => (
        <section key={l.id} class="up-card up-loan">
          <div class="up-loan-head">
            <div class="grow">
              <div class="up-loan-name">{l.lender}</div>
              <div class="dim num">{(l.rate * 100).toFixed(1)}% · {fmtMoney(l.monthlyPayment)}/mo · {l.monthsLeft} months left</div>
            </div>
            <Button size="sm" variant="secondary" disabled={!game.empire.sandbox && game.empire.money < l.remaining} onClick={() => void repay(l.id, l.remaining, l.lender)}>
              Repay
            </Button>
          </div>
          <div class="up-loan-bar">
            <span style={{ transform: `scaleX(${1 - l.remaining / Math.max(1, l.principal)})` }} />
          </div>
          <div class="up-loan-foot num">
            <span>{fmtMoney(l.principal - l.remaining)} paid</span>
            <span>{fmtMoney(l.remaining)} to go</span>
          </div>
        </section>
      ))}
      <SectionHeader title="Lenders" icon="building" subtitle={loans.length >= 3 ? 'Three loans is the legal maximum. Even here.' : 'Credit lines available to your city'} />
      {offers.length === 0 || loans.length >= 3 ? (
        <div class="up-muted-line">No offers right now.</div>
      ) : (
        offers.map((o) => (
          <section key={o.lender} class="up-card up-offer">
            <span class="up-offer-icon">{o.icon}</span>
            <div class="grow">
              <div class="up-loan-name">{o.lender}</div>
              <div class="up-offer-blurb">{o.blurb}</div>
              <div class="up-offer-terms num">
                <b>{fmtMoney(o.amount)}</b> · {(o.rate * 100).toFixed(1)}% · {o.months} mo · {fmtMoney(o.monthlyPayment)}/mo
              </div>
            </div>
            <Button size="sm" variant="primary" onClick={() => void borrow(o.lender, o.amount, o.monthlyPayment, o.months)}>
              Borrow
            </Button>
          </section>
        ))
      )}
    </div>
  );
}

export function BudgetPanel() {
  useLive(700);
  const [tab, setTab] = useState<Tab>(tabMemory.tab);
  const s = sim();
  const rep = s ? safe(() => s.projectedMonth(), null) : null;
  const hist = safe(() => game.empire.s.history.slice(-24).map((h) => h.income), []);
  const sandbox = isSandbox();
  const net = rep?.net ?? 0;
  const change = (t: Tab) => {
    tabMemory.tab = t;
    setTab(t);
  };
  return (
    <div class="up-root up-budget">
      <div class="up-hero up-budget-hero">
        <div class="up-hero-main">
          <div class="up-kicker">Treasury</div>
          <div class={'up-hero-value num ' + (!sandbox && ui.money.value < 0 ? 'bad' : 'money')}>{sandbox ? '₡ ∞' : fmtMoney(ui.money.value)}</div>
          <div class={'up-hero-sub num ' + (net >= 0 ? 'good' : 'bad')}>
            <Icon name={net >= 0 ? 'trendUp' : 'trendDown'} size={14} /> {fmtSigned(net, false)} this month
          </div>
        </div>
        <div class="up-hero-side">
          <Sparkline values={hist} color={net >= 0 ? 'var(--good)' : 'var(--bad)'} width={110} height={40} zero />
          <span class="dim up-hero-cap">net / month</span>
        </div>
      </div>
      {sandbox && (
        <div class="up-banner">
          <Icon name="sparkles" size={16} /> Sandbox: money is infinite, but funding still changes how well services work.
        </div>
      )}
      <Segmented
        block
        value={sandbox && tab === 'loans' ? 'overview' : tab}
        onChange={change}
        sound="tap"
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'taxes', label: 'Taxes' },
          { value: 'services', label: 'Services' },
          ...(sandbox ? [] : [{ value: 'loans' as Tab, label: s?.loans.length ? `Loans · ${s.loans.length}` : 'Loans' }]),
        ]}
        ariaLabel="Budget sections"
      />
      {!s ? <EmptyState icon="budget" title="No city loaded" /> : tab === 'taxes' ? <Taxes /> : tab === 'services' ? <Services /> : tab === 'loans' && !sandbox ? <Loans /> : <Overview />}
    </div>
  );
}
