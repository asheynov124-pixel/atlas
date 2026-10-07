/**
 * OWNER: ui-panels.
 * Statistics panel ('stats') — monthly history as touch-scrubbable SVG line charts (empire: population, treasury,
 * research; city: happiness, net income, jobs, land value, pollution, crime, traffic, tourism) with a 1 y / 5 y / all
 * range, plus zone distribution (zoned lots and grown buildings per R · C · I · O), jobs vs workers by sector and
 * utility supply vs demand.
 */
import { useState } from 'preact/hooks';
import { Zone } from '../../core/types';
import { game } from '../../game/instance';
import { EmptyState, Icon, IconOrEmoji, SectionHeader, Segmented } from '../core';
import { fmtCompact, fmtMoney, fmtSigned } from '../core/format';
import { ui } from '../store';
import { LineChart, StackBar, SupplyMeter, isSandbox, planet, safe, sim, useLive } from './common';

type Range = 12 | 60 | 0;
const memo = { range: 12 as Range };

interface ChartDef {
  id: string;
  title: string;
  icon: string;
  color: string;
  values: number[];
  days: number[];
  format: (v: number) => string;
  /** a rise is good (delta colouring) */
  upGood: boolean;
  zero?: boolean;
  min?: number;
  max?: number;
}

function ChartCard({ c }: { c: ChartDef }) {
  const n = c.values.length;
  const last = n ? c.values[n - 1] : 0;
  const first = n ? c.values[0] : 0;
  const delta = last - first;
  const good = delta === 0 ? null : (delta > 0) === c.upGood;
  return (
    <section class="up-card up-chartcard">
      <div class="up-chartcard-head">
        <span class="up-chartcard-icon" style={{ color: c.color }}>
          <IconOrEmoji value={c.icon} size={16} />
        </span>
        <span class="grow up-chartcard-title">{c.title}</span>
        <span class="up-chartcard-val num">{c.format(last)}</span>
      </div>
      {n > 1 && Math.abs(delta) > 1e-9 && (
        <div class={'up-chartcard-delta num ' + (good ? 'good' : 'bad')}>
          <Icon name={delta > 0 ? 'trendUp' : 'trendDown'} size={12} /> {delta > 0 ? '+' : '−'}
          {c.format(Math.abs(delta)).replace(/^[+−±-]/, '')} over the period
        </div>
      )}
      <LineChart series={[{ values: c.values, color: c.color, label: c.title }]} days={c.days} height={92} format={c.format} zero={c.zero} min={c.min} max={c.max} ariaLabel={`${c.title} history`} />
    </section>
  );
}

function slice<T>(arr: T[], range: Range): T[] {
  return range ? arr.slice(-range) : arr.slice();
}

function countZones(): { R: number; C: number; I: number; O: number } {
  const p = planet();
  const out = { R: 0, C: 0, I: 0, O: 0 };
  if (!p) return out;
  const z = p.zone;
  for (let t = 0; t < z.length; t++) {
    const v = z[t];
    if (!v) continue;
    if (v <= Zone.ResHigh) out.R++;
    else if (v <= Zone.ComLeisure) out.C++;
    else if (v <= Zone.IndTech) out.I++;
    else out.O++;
  }
  return out;
}

export function StatsPanel() {
  useLive(2000);
  const [range, setRange] = useState<Range>(memo.range);
  const s = sim();
  const st = ui.stats.value;
  const eh = safe(() => game.empire.s.history, []);
  const ch = s ? s.history : null;
  const sandbox = isSandbox();
  const ed = slice(eh, range);
  const days = ed.map((h) => h.day);
  const cd = ch ? slice(ch.day, range) : [];
  const cs = (k: keyof NonNullable<typeof ch>) => (ch ? slice(ch[k], range) : []);
  const pct = (v: number) => `${Math.round(v)}%`;
  const num = (v: number) => fmtCompact(v);
  const charts: ChartDef[] = [
    { id: 'pop', title: 'Population', icon: 'population', color: '#5ef0ff', values: ed.map((h) => h.population), days, format: num, upGood: true },
    { id: 'happy', title: 'Happiness', icon: 'smile', color: '#5ef2a0', values: ed.map((h) => h.happiness), days, format: pct, upGood: true, min: 0, max: 100 },
    { id: 'income', title: 'Net income / month', icon: 'income', color: '#ffd977', values: ed.map((h) => h.income), days, format: (v) => fmtSigned(v), upGood: true, zero: true },
  ];
  if (!sandbox) charts.push({ id: 'money', title: 'Treasury', icon: 'money', color: '#ffc65c', values: ed.map((h) => h.money), days, format: (v) => fmtMoney(v, true), upGood: true, zero: true });
  charts.push({ id: 'research', title: 'Research', icon: 'research', color: '#a77bff', values: ed.map((h) => h.research), days, format: num, upGood: true });
  if (ch && cd.length > 1) {
    charts.push(
      { id: 'jobs', title: 'Jobs', icon: 'jobs', color: '#7cc4ff', values: cs('jobs'), days: cd, format: num, upGood: true },
      { id: 'lv', title: 'Land value', icon: 'landValue', color: '#ff7ad9', values: cs('landValue'), days: cd, format: (v) => Math.round(v).toString(), upGood: true },
      { id: 'pol', title: 'Pollution', icon: 'pollution', color: '#c9a27a', values: cs('pollution'), days: cd, format: (v) => Math.round(v).toString(), upGood: false },
      { id: 'crime', title: 'Crime', icon: 'crime', color: '#ff6b81', values: cs('crime'), days: cd, format: (v) => Math.round(v).toString(), upGood: false },
      { id: 'traffic', title: 'Traffic', icon: 'traffic', color: '#ffb84a', values: cs('traffic'), days: cd, format: pct, upGood: false },
      { id: 'tourism', title: 'Tourists / month', icon: 'tourism', color: '#9be564', values: cs('tourism'), days: cd, format: num, upGood: true },
    );
  }
  const zones = countZones();
  const go = (r: Range) => {
    memo.range = r;
    setRange(r);
  };
  const free = st.utilitiesFree ?? 0;
  const enough = ed.length > 1;
  return (
    <div class="up-root up-stats">
      <Segmented
        block
        sound="tap"
        value={range}
        onChange={go}
        ariaLabel="History range"
        options={[
          { value: 12, label: '1 year' },
          { value: 60, label: '5 years' },
          { value: 0, label: 'All time' },
        ]}
      />
      {!enough ? (
        <EmptyState icon="hourglass" title="History is being written" body="Charts fill in at the end of every month. Speed up time and watch the lines climb." />
      ) : (
        <div class="up-chartgrid">
          {charts.map((c) => (
            <ChartCard key={c.id} c={c} />
          ))}
        </div>
      )}
      <SectionHeader title="Zones" icon="zones" subtitle="Painted lots and the buildings that grew on them" />
      <section class="up-card">
        <div class="up-sub-label">Zoned lots</div>
        <StackBar
          parts={[
            { label: 'Residential', value: zones.R, color: 'var(--zone-r)' },
            { label: 'Commercial', value: zones.C, color: 'var(--zone-c)' },
            { label: 'Industrial', value: zones.I, color: 'var(--zone-i)' },
            { label: 'Office', value: zones.O, color: 'var(--zone-o)' },
          ]}
        />
        <div class="up-sub-label up-gap">Grown buildings</div>
        <StackBar
          parts={[
            { label: 'Residential', value: st.residentialBuildings ?? 0, color: 'var(--zone-r)' },
            { label: 'Commercial', value: st.commercialBuildings ?? 0, color: 'var(--zone-c)' },
            { label: 'Industrial', value: st.industrialBuildings ?? 0, color: 'var(--zone-i)' },
            { label: 'Office', value: st.officeBuildings ?? 0, color: 'var(--zone-o)' },
          ]}
        />
      </section>
      <SectionHeader title="Jobs & workers" icon="jobs" subtitle={`${st.unemployment ?? 0}% unemployment · ${fmtCompact(st.openJobs ?? 0)} open positions`} />
      <section class="up-card">
        <div class="up-versus">
          {[
            { label: 'Workforce', v: st.workforce ?? 0, c: 'var(--accent)' },
            { label: 'Jobs', v: st.jobs ?? 0, c: 'var(--info)' },
            { label: 'Employed', v: st.workers ?? 0, c: 'var(--good)' },
            { label: 'Educated', v: st.educated ?? 0, c: 'var(--accent-2)' },
          ].map((x, _i, all) => {
            const max = Math.max(1, ...all.map((a) => a.v));
            return (
              <div key={x.label} class="up-versus-row">
                <span class="up-versus-label">{x.label}</span>
                <span class="up-versus-bar">
                  <span style={{ transform: `scaleX(${Math.max(0.01, x.v / max)})`, background: x.c }} />
                </span>
                <b class="num">{fmtCompact(x.v)}</b>
              </div>
            );
          })}
        </div>
        <div class="up-sub-label up-gap">Jobs by sector</div>
        <StackBar
          parts={[
            { label: 'Commerce', value: st.jobsCommercial ?? 0, color: 'var(--zone-c)' },
            { label: 'Industry', value: st.jobsIndustrial ?? 0, color: 'var(--zone-i)' },
            { label: 'Offices', value: st.jobsOffice ?? 0, color: 'var(--zone-o)' },
            { label: 'Services', value: st.jobsServices ?? 0, color: 'var(--accent)' },
          ]}
        />
      </section>
      <SectionHeader title="Utilities" icon="power" subtitle="Demand against supply across every network" />
      <section class="up-card">
        <SupplyMeter icon="⚡" label="Power" supply={st.powerSupply ?? 0} demand={st.powerDemand ?? 0} unit="MW" free={!!(free & 1)} />
        <SupplyMeter icon="💧" label="Water" supply={st.waterSupply ?? 0} demand={st.waterDemand ?? 0} unit="kL" free={!!(free & 2)} />
        {(st.needsOxygen ?? 0) > 0 && <SupplyMeter icon="🫁" label="Oxygen" supply={st.oxygenSupply ?? 0} demand={st.oxygenDemand ?? 0} unit="u" free={!!(free & 4)} />}
        <SupplyMeter icon="🗑️" label="Garbage" supply={st.garbageCapacity ?? 0} demand={st.garbageProduced ?? 0} unit="t" free={!!(free & 8)} />
        <SupplyMeter icon="📡" label="Data" supply={st.dataCapacity ?? 0} demand={st.dataDemand ?? 0} unit="Tb" free={!!(free & 16)} />
      </section>
    </div>
  );
}
