/**
 * OWNER: ui-panels.
 * City panel ('city') — the mayor's office. Tabs:
 *   Overview  identity (rename city & mayor, tier, founding date, age), vitals with a happiness ring, what citizens
 *             think (happiness factors), happening-now city events, key stats grid and "meet a citizen"
 *   Demand    R · C · I · O meters with the sim's named causes and blockers, advisor tips, building problems
 *             (tap to fly there)
 *   Planet    world facts (archetype, gravity, temperature, air, oceans, moons, rings, day length, season)
 *             and the city's default architectural style
 */
import { useState } from 'preact/hooks';
import { PLANET_TYPES } from '../../content/planetTypes';
import { STYLES } from '../../content/styles';
import { bus } from '../../core/events';
import type { StyleId } from '../../core/types';
import { game } from '../../game/instance';
import { BarMeter, Chip, EmptyState, Icon, IconButton, IconOrEmoji, SectionHeader, Stat, Tabs, TextInput } from '../core';
import { fmtCompact, fmtInt, fmtMoney } from '../core/format';
import { notify, ui } from '../store';
import { FAMILIES } from './BudgetPanel';
import { Avatar, Ring, fmtAge, fmtDate, flyToTile, isSandbox, planet, safe, sim, useLive } from './common';
import { StylePicker } from './StylePicker';

type Tab = 'overview' | 'demand' | 'planet';
const memo = { tab: 'overview' as Tab };

function tierName(t: number): string {
  return safe(() => game.progression.tierName(t), `Tier ${t}`);
}

function Identity() {
  const p = planet();
  const [editing, setEditing] = useState<'city' | 'mayor' | null>(null);
  const [draft, setDraft] = useState('');
  if (!p) return null;
  const commit = () => {
    const v = draft.trim().slice(0, 32);
    if (v && editing === 'city' && v !== p.city.name) {
      p.city.name = v;
      ui.cityName.value = v;
      safe(() => game.empire.bump('cosmos.renamed'), 0);
      notify({ title: `Welcome to ${v}`, body: 'The sign-makers are already on it.', kind: 'good', icon: 'pencil' });
    } else if (v && editing === 'mayor' && v !== p.city.mayor) {
      p.city.mayor = v;
      notify({ title: `Mayor ${v} sworn in`, body: 'The oath was mostly about potholes.', kind: 'good', icon: 'crown' });
    }
    setEditing(null);
  };
  const start = (what: 'city' | 'mayor') => {
    setDraft(what === 'city' ? p.city.name : p.city.mayor);
    setEditing(what);
  };
  const sandbox = isSandbox();
  return (
    <div class="up-hero up-city-hero">
      <span class="up-city-crest">
        <Icon name={sandbox ? 'sparkles' : 'crown'} size={26} />
      </span>
      <div class="grow up-city-id">
        {editing ? (
          <TextInput
            value={draft}
            onChange={setDraft}
            onSubmit={commit}
            autoFocus
            maxLength={32}
            placeholder={editing === 'city' ? 'City name' : 'Mayor name'}
            trailing={<IconButton icon="check" label="Save name" size="sm" variant="primary" onClick={commit} />}
          />
        ) : (
          <>
            <button type="button" class="up-city-name" onClick={() => start('city')} aria-label="Rename city">
              <span class="ellipsis">{p.city.name}</span>
              <Icon name="pencil" size={14} class="dim" />
            </button>
            <button type="button" class="up-city-mayor" onClick={() => start('mayor')} aria-label="Rename mayor">
              Mayor {p.city.mayor} <Icon name="pencil" size={12} class="dim" />
            </button>
          </>
        )}
        <div class="up-city-tags">
          <Chip size="sm" tone={sandbox ? 'violet' : 'money'} icon={sandbox ? 'sparkles' : 'crown'}>
            {sandbox ? 'Sandbox' : tierName(ui.tier.value)}
          </Chip>
          <Chip size="sm" icon="calendar">
            Founded {fmtDate(p.city.foundedDay)}
          </Chip>
          <Chip size="sm" icon="hourglass">
            {fmtAge(p.city.foundedDay)}
          </Chip>
        </div>
      </div>
    </div>
  );
}

interface Factor {
  icon: string;
  label: string;
  value: number;
  note: string;
}

function factors(st: Record<string, number>): Factor[] {
  const s = sim();
  const tax = s ? (s.taxes.R + s.taxes.C + s.taxes.I + s.taxes.O) / 4 : 0.09;
  const cl = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  return [
    { icon: '💼', label: 'Jobs', value: cl(100 - (st.unemployment ?? 0) * 4), note: `${st.unemployment ?? 0}% unemployed` },
    { icon: '🏥', label: 'Health', value: cl(st.health ?? 0), note: (st.health ?? 0) < 40 ? 'Queues at the clinic' : 'Mostly hale and hearty' },
    { icon: '🎓', label: 'Education', value: cl(st.education ?? 0), note: `${fmtCompact(st.educated ?? 0)} educated residents` },
    { icon: '🚓', label: 'Safety', value: cl(100 - (st.crime ?? 0)), note: (st.crime ?? 0) > 35 ? 'Lock your hover-bikes' : 'Doors left unlocked' },
    { icon: '🌿', label: 'Clean air', value: cl(100 - (st.pollution ?? 0) * 1.2), note: (st.pollution ?? 0) > 30 ? 'Smog with a view' : 'Fresh and breezy' },
    { icon: '🤫', label: 'Peace & quiet', value: cl(100 - (st.noise ?? 0) * 1.2), note: (st.noise ?? 0) > 35 ? 'Honking intensifies' : 'Birdsong audible' },
    { icon: '🚗', label: 'Commute', value: cl(100 - (st.traffic ?? 0)), note: (st.traffic ?? 0) > 60 ? 'Gridlock is a lifestyle' : 'Traffic flows' },
    { icon: '💸', label: 'Taxes', value: cl(100 - (tax - 0.04) * 420), note: `${(tax * 100).toFixed(1)}% on average` },
    { icon: '💎', label: 'Land value', value: cl(st.landValue ?? 0), note: (st.landValue ?? 0) > 60 ? 'Property brochures glow' : 'Bargains everywhere' },
  ];
}

function toneOf(v: number): string {
  return v >= 66 ? 'good' : v >= 40 ? 'warn' : 'bad';
}

function Citizen() {
  const s = sim();
  const [seed, setSeed] = useState(0);
  const c = s ? safe(() => s.citizenSpotlight(), null) : null;
  void seed;
  if (!c) return null;
  return (
    <section class="up-card up-citizen">
      <Avatar emoji={c.icon} seed={c.name} size={48} />
      <div class="grow">
        <div class="up-citizen-name">
          {c.name}, {c.age}
        </div>
        <div class="dim up-citizen-job">
          {c.job} · mood {c.mood}%
        </div>
        <p class="up-citizen-quote">“{c.quote}”</p>
      </div>
      <div class="up-citizen-actions">
        <IconButton icon="dice" label="Meet someone else" size="sm" variant="glass" onClick={() => setSeed((x) => x + 1)} />
        <IconButton icon="locate" label="Visit their home" size="sm" variant="glass" onClick={() => flyToTile(c.tile, { select: true })} />
      </div>
    </section>
  );
}

function Overview() {
  const st = ui.stats.value;
  const s = sim();
  const happy = ui.happiness.value;
  const f = factors(st);
  const events = s?.events ?? [];
  return (
    <div class="up-stack-v">
      <Identity />
      <section class="up-card up-vitals">
        <Ring value={happy / 100} size={92} stroke={8} color={`var(--${toneOf(happy)})`}>
          <span class="up-ring-val num">{happy}%</span>
          <span class="up-ring-cap">happy</span>
        </Ring>
        <div class="up-vitals-grid">
          <Stat compact icon="population" label="Citizens" value={fmtCompact(ui.population.value)} />
          <Stat compact icon="jobs" label="Jobs" value={fmtCompact(st.jobs ?? 0)} tone="info" />
          <Stat compact icon="money" label="Treasury" value={isSandbox() ? '∞' : fmtMoney(ui.money.value, true)} tone="money" />
          {st.approval !== undefined ? <Stat compact icon="flag" label="Approval" value={`${st.approval}%`} tone="violet" /> : <Stat compact icon="research" label="Research" value={fmtCompact(ui.research.value)} tone="violet" />}
        </div>
      </section>
      {events.length > 0 && (
        <>
          <SectionHeader title="Happening now" icon="bell" />
          <div class="up-events">
            {events.map((e) => (
              <button key={e.id} type="button" class="up-event" onClick={() => e.tile !== undefined && flyToTile(e.tile)} disabled={e.tile === undefined}>
                <span class="up-event-icon">{e.icon}</span>
                <span class="grow">
                  <b>{e.name}</b>
                  <span class="dim up-event-desc">{e.description}</span>
                </span>
                <span class="num dim">{Math.max(0, Math.ceil(e.daysLeft))}d</span>
              </button>
            ))}
          </div>
        </>
      )}
      <SectionHeader title="What citizens think" icon="chat" subtitle="Each bar is one ingredient of happiness" />
      <section class="up-card up-factors">
        {f.map((x) => (
          <div key={x.label} class={'up-factor tone-' + toneOf(x.value)}>
            <span class="up-factor-icon">{x.icon}</span>
            <span class="up-factor-label">{x.label}</span>
            <span class="up-factor-bar">
              <span style={{ transform: `scaleX(${Math.max(0.03, x.value / 100)})` }} />
            </span>
            <span class="up-factor-note dim ellipsis">{x.note}</span>
          </div>
        ))}
      </section>
      <SectionHeader title="Key numbers" icon="stats" />
      <div class="up-statgrid">
        <Stat icon="housing" label="Housing" value={fmtCompact(st.housing ?? 0)} />
        <Stat icon="user" label="Workforce" value={fmtCompact(st.workforce ?? 0)} />
        <Stat icon="jobs" label="Open jobs" value={fmtCompact(st.openJobs ?? 0)} tone="info" />
        <Stat icon="building" label="Buildings" value={fmtInt(st.buildings ?? 0)} />
        <Stat icon="roads" label="Road tiles" value={fmtInt(st.roadTiles ?? 0)} />
        <Stat icon="zones" label="Zoned lots" value={fmtInt(st.zonedTiles ?? 0)} />
        <Stat icon="park" label="Parks" value={fmtInt(st.parks ?? 0)} tone="good" />
        <Stat icon="tourism" label="Tourists / mo" value={fmtCompact(st.tourism ?? 0)} tone="violet" />
        <Stat icon="landmarks" label="Landmarks" value={fmtInt((st.landmarks ?? 0) + (st.wonders ?? 0))} tone="money" />
        <Stat icon="district" label="Districts" value={fmtInt(st.districts ?? 0)} />
        <Stat icon="policy" label="Policies" value={fmtInt(st.policies ?? 0)} />
        <Stat icon="research" label="Research / mo" value={fmtCompact(st.researchRate ?? 0)} tone="violet" />
      </div>
      <Citizen />
    </div>
  );
}

function Demand() {
  const s = sim();
  const d = ui.demand.value;
  const reasons = s ? safe(() => s.demandReasons(), null) : null;
  const tips = s ? safe(() => s.advisor(), []) : [];
  const probs = s ? safe(() => s.problemsSummary(), []) : [];
  return (
    <div class="up-stack-v">
      <div class="up-demand-grid">
        {FAMILIES.map((f) => {
          const list = (reasons?.[f.k] ?? []).slice(0, 4);
          const v = d[f.k];
          return (
            <section key={f.k} class="up-card up-demand">
              <div class="up-demand-head">
                <span class="up-zone-badge" style={{ background: f.color }}>
                  {f.k}
                </span>
                <span class="grow up-demand-name">{f.name}</span>
                <span class={'num up-demand-val ' + (v > 0.05 ? 'good' : v < -0.05 ? 'bad' : 'dim')}>
                  {v > 0 ? '+' : ''}
                  {Math.round(v * 100)}
                </span>
              </div>
              <BarMeter value={v} bipolar color={f.color} length={260} thickness={8} class="up-demand-meter" />
              <ul class="up-reasons">
                {list.length === 0 && <li class="dim">No strong opinions yet.</li>}
                {list.map((r, i) => (
                  <li key={i} class={r.blocker ? 'is-blocker' : r.weight >= 0 ? 'is-up' : 'is-down'}>
                    <span class="up-reason-icon">{r.blocker ? '⛔' : r.icon ?? '•'}</span>
                    <span class="grow">{r.text}</span>
                    {!r.blocker && (
                      <span class="num up-reason-w">
                        {r.weight > 0 ? '+' : '−'}
                        {Math.round(Math.abs(r.weight) * 100)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <SectionHeader title="Advisor" icon="info" subtitle="Your chief of staff has thoughts" />
      {tips.map((t, i) => (
        <section key={i} class={'up-card up-tip tone-' + t.tone}>
          <span class="up-tip-icon">{t.icon}</span>
          <span class="grow">{t.text}</span>
          {t.tile !== undefined && t.tile >= 0 && <IconButton icon="locate" label="Show me" size="sm" variant="glass" onClick={() => flyToTile(t.tile)} />}
        </section>
      ))}
      <SectionHeader title="Problems" icon="alert" subtitle={probs.length ? 'Tap one to fly there' : undefined} />
      {probs.length === 0 ? (
        <div class="up-muted-line">No complaints on file. Suspicious, but nice.</div>
      ) : (
        <div class="up-problems">
          {probs.map((pr) => (
            <button key={pr.id} type="button" class={'up-problem' + (pr.severe ? ' is-severe' : '')} onClick={() => flyToTile(pr.tile, { select: true })} disabled={pr.tile < 0}>
              <span class="up-problem-icon">{pr.icon}</span>
              <span class="grow">
                <b>{pr.label}</b>
                <span class="dim up-problem-fix">{pr.fix}</span>
              </span>
              <span class="up-problem-count num">{fmtInt(pr.count)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanetFacts() {
  const p = planet();
  const s = sim();
  if (!p) return <EmptyState icon="planet" title="No planet loaded" />;
  const spec = p.spec;
  const arch = PLANET_TYPES[spec.type];
  const season = s ? safe(() => s.season(), null) : null;
  const needsO2 = arch?.needsOxygen || !spec.atmosphere.breathable;
  const water = (() => {
    let n = 0;
    for (let t = 0; t < p.count; t += 7) if (p.isWater(t)) n++;
    return Math.round((n / Math.ceil(p.count / 7)) * 100);
  })();
  const facts: { icon: string; label: string; value: string; tone?: string }[] = [
    { icon: 'gravity', label: 'Gravity', value: `${spec.gravity.toFixed(2)} g`, tone: spec.gravity > 1.3 ? 'warn' : '' },
    { icon: 'temperature', label: 'Mean temperature', value: `${Math.round(spec.temperature)} °C`, tone: spec.temperature < -20 || spec.temperature > 45 ? 'warn' : '' },
    { icon: 'oxygen', label: 'Air', value: needsO2 ? 'Not breathable — build oxygen' : 'Breathable', tone: needsO2 ? 'bad' : 'good' },
    { icon: 'water', label: 'Oceans', value: spec.hasOcean ? `${water}% of the surface` : 'None', tone: '' },
    { icon: 'clock', label: 'Day length', value: `${Math.max(1, Math.round(spec.dayLength / 60))} min (at 1×)` },
    { icon: 'planet', label: 'Moons', value: spec.moons.length ? spec.moons.map((m) => m.name).join(', ') : 'None' },
    { icon: 'orbital', label: 'Rings', value: spec.rings ? 'Yes — gorgeous at dusk' : 'None' },
    { icon: 'grid', label: 'Surface', value: `${fmtInt(p.count)} hex tiles` },
  ];
  if (season) facts.push({ icon: 'calendar', label: 'Season', value: `${season.icon} ${season.name}` });
  const hazards = arch?.hazards ?? [];
  const city = p.city;
  return (
    <div class="up-stack-v">
      <section class="up-hero up-planet-hero">
        <div class="up-planet-orb" style={{ background: `radial-gradient(circle at 32% 30%, #ffffff55, transparent 42%), radial-gradient(circle at 50% 50%, #${(arch?.palette.land ?? 0x4a8).toString(16).padStart(6, '0')}, #${(spec.oceanColor ?? 0x123).toString(16).padStart(6, '0')} 78%)`, boxShadow: `0 0 0 3px #${spec.atmosphere.color.toString(16).padStart(6, '0')}55, 0 0 30px #${spec.atmosphere.color.toString(16).padStart(6, '0')}66` }} />
        <div class="grow">
          <div class="up-kicker">{arch?.name ?? spec.type} world</div>
          <div class="up-planet-name">{spec.name}</div>
          <div class="up-planet-tag">{arch?.tagline}</div>
        </div>
      </section>
      <section class="up-card up-facts">
        {facts.map((f) => (
          <div key={f.label} class="up-fact">
            <span class="up-fact-icon">
              <IconOrEmoji value={f.icon} size={17} />
            </span>
            <span class="up-fact-label">{f.label}</span>
            <span class={'up-fact-val ' + (f.tone ?? '')}>{f.value}</span>
          </div>
        ))}
      </section>
      {arch && <p class="up-footnote">{arch.description}</p>}
      {hazards.length > 0 && (
        <div class="up-chiprow">
          <span class="dim up-chiprow-label">Local hazards</span>
          {hazards.map((h) => (
            <Chip key={h} size="sm" tone="warn">
              {h}
            </Chip>
          ))}
        </div>
      )}
      <SectionHeader title="Architecture" icon="building" subtitle={`New buildings default to ${STYLES[city.style]?.name ?? city.style}. Districts can override it.`} />
      <StylePicker
        value={city.style}
        onChange={(sid: StyleId) => {
          city.style = sid;
          bus.emit('catalog:changed', {});
          notify({ title: `${STYLES[sid].name} it is`, body: 'New buildings will rise in this style.', kind: 'good', icon: 'building' });
        }}
      />
    </div>
  );
}

export function CityPanel() {
  useLive(1000);
  const [tab, setTab] = useState<Tab>(memo.tab);
  const go = (t: Tab) => {
    memo.tab = t;
    setTab(t);
  };
  if (!planet()) return <EmptyState icon="crown" title="No city yet" body="Start or load a game to visit the mayor's office." />;
  return (
    <div class="up-root up-city">
      <Tabs
        value={tab}
        onChange={go}
        ariaLabel="City sections"
        tabs={[
          { id: 'overview', label: 'Overview', icon: 'crown' },
          { id: 'demand', label: 'Demand', icon: 'chart', dot: safe(() => game.sim.problemsSummary().some((p) => p.severe), false) },
          { id: 'planet', label: 'Planet', icon: 'planet' },
        ]}
      />
      {tab === 'overview' ? <Overview /> : tab === 'demand' ? <Demand /> : <PlanetFacts />}
    </div>
  );
}
