/**
 * OWNER: ui-panels.
 * Policies panel ('policies') — every sim policy as a card with its effects, live monthly cost (or income) at the
 * current population and an enact switch. Scope: city-wide or one district (district-scoped policies stack on top
 * inside it). Category filter, active-only filter and a running total. Career mode gates policies by tier.
 */
import { useState } from 'preact/hooks';
import type { SimPolicyDef } from '../../sim/Simulation';
import { game } from '../../game/instance';
import { Chip, EmptyState, Icon, Tabs, Toggle, type Tone } from '../core';
import { fmtMoney } from '../core/format';
import { ui } from '../store';
import { css as _css, isSandbox, planet, safe, sim, useLive } from './common';
import { policyScope } from './state';

const BAD_SUBJECT = /pollution|crime|noise|traffic|garbage|power use|water use|fire spread|sickness|commute/i;

/** Colour an effect line: improvements green, drawbacks amber, tax tweaks neutral. */
function effectTone(e: string): Tone {
  if (/tax/i.test(e)) return 'neutral';
  if (/slower|ban|no |max level/i.test(e)) return 'warn';
  const up = /^[+×]/.test(e.trim());
  const down = /^[−-]/.test(e.trim());
  if (!up && !down) return 'neutral';
  const bad = BAD_SUBJECT.test(e);
  return up !== bad ? 'good' : 'warn';
}

const CATS = [
  { id: 'all', label: 'All', icon: 'grid' },
  { id: 'economy', label: 'Economy', icon: 'money' },
  { id: 'society', label: 'Society', icon: 'population' },
  { id: 'environment', label: 'Environment', icon: 'tree' },
  { id: 'safety', label: 'Safety', icon: 'police' },
  { id: 'transport', label: 'Transport', icon: 'transit' },
  { id: 'tech', label: 'Tech', icon: 'research' },
  { id: 'active', label: 'Active', icon: 'check' },
] as const;
type Cat = (typeof CATS)[number]['id'];
const memo = { cat: 'all' as Cat };

function tierName(t: number): string {
  return safe(() => game.progression.tierName(t), `Tier ${t}`);
}

export function PoliciesPanel() {
  useLive(1000);
  const [cat, setCat] = useState<Cat>(memo.cat);
  const s = sim();
  const p = planet();
  if (!s || !p) return <EmptyState icon="policy" title="No city to govern" body="Start a game to pass some laws." />;
  const districts = p.districts.filter((d, i) => i > 0 && !!d);
  let scope = policyScope.value;
  if (scope > 0 && !p.districts[scope]) scope = policyScope.value = 0;
  const list = (s.policies as SimPolicyDef[]).filter((d) => (scope === 0 ? d.scope !== 'district' : d.scope !== 'city'));
  const on = (id: string) => safe(() => s.isPolicyOn(id, scope), false);
  const shown = list.filter((d) => (cat === 'all' ? true : cat === 'active' ? on(d.id) : d.category === cat));
  const active = list.filter((d) => on(d.id));
  const total = active.reduce((t, d) => t + safe(() => s.policyCost(d.id, scope), 0), 0);
  const career = !isSandbox();
  const tier = ui.tier.value;
  const go = (c: Cat) => {
    memo.cat = c;
    setCat(c);
  };
  const scopeName = scope === 0 ? p.city.name : p.districts[scope]?.name ?? '';
  return (
    <div class="up-root up-policies">
      {districts.length > 0 && (
        <div class="up-scope scroll-x" role="radiogroup" aria-label="Where policies apply">
          <button type="button" role="radio" aria-checked={scope === 0} class={'up-scope-opt' + (scope === 0 ? ' is-active' : '')} onClick={() => (policyScope.value = 0)}>
            <Icon name="crown" size={15} /> City-wide
          </button>
          {districts.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={scope === d.id} class={'up-scope-opt' + (scope === d.id ? ' is-active' : '')} onClick={() => (policyScope.value = d.id)}>
              <i class="up-swatch-dot" style={{ background: _css(d.color) }} /> {d.name}
              {d.policies.length > 0 && <span class="up-scope-n num">{d.policies.length}</span>}
            </button>
          ))}
        </div>
      )}
      <div class="up-hero up-policy-hero">
        <div class="grow">
          <div class="up-kicker">{scope === 0 ? 'City-wide laws' : 'District ordinances'}</div>
          <div class="up-policy-scope ellipsis">{scopeName}</div>
          <div class="dim">
            {active.length} of {list.length} enacted
          </div>
        </div>
        <div class="up-tax-right">
          <div class={'num up-big ' + (total > 0 ? 'bad' : total < 0 ? 'good' : '')}>{total > 0 ? '−' : total < 0 ? '+' : ''}{fmtMoney(Math.abs(total)).replace('−', '')}</div>
          <div class="dim">per month</div>
        </div>
      </div>
      <Tabs value={cat} onChange={go} tabs={CATS.map((c) => ({ id: c.id, label: c.label, icon: c.icon, badge: c.id === 'active' ? active.length || null : null }))} ariaLabel="Policy categories" />
      {shown.length === 0 ? (
        <EmptyState icon="policy" title={cat === 'active' ? 'No policies enacted' : 'Nothing here'} body={cat === 'active' ? 'Flip a switch — democracy is just a toggle away.' : 'Try another category.'} />
      ) : (
        <div class="up-policy-grid">
          {shown.map((d) => {
            const enabled = on(d.id);
            const cost = safe(() => s.policyCost(d.id, scope), 0);
            const locked = career && (d.tier ?? 0) > tier;
            return (
              <section key={d.id} class={'up-card up-policy' + (enabled ? ' is-on' : '') + (locked ? ' is-locked' : '')}>
                <div class="up-policy-head">
                  <span class="up-policy-icon">{d.icon}</span>
                  <div class="grow">
                    <div class="up-policy-name">
                      {d.name}
                      {d.satire && (
                        <span class="up-wink" title="Satire">
                          😉
                        </span>
                      )}
                    </div>
                    <div class={'num up-policy-cost ' + (cost < 0 ? 'good' : cost > 0 ? 'warn' : 'dim')}>
                      {cost === 0 ? (d.costPer1k === 0 ? 'Free' : 'Free until people move in') : cost > 0 ? `${fmtMoney(cost)}/mo` : `+${fmtMoney(-cost)}/mo`}
                    </div>
                  </div>
                  {locked ? (
                    <span class="up-policy-lock">
                      <Icon name="lock" size={15} /> {tierName(d.tier ?? 0)}
                    </span>
                  ) : (
                    <Toggle checked={enabled} onChange={(v) => s.setPolicy(d.id, v, scope)} />
                  )}
                </div>
                <p class="up-policy-desc">{d.description}</p>
                {d.effects?.length > 0 && (
                  <div class="up-policy-fx">
                    {d.effects.map((e) => (
                      <Chip key={e} size="sm" tone={effectTone(e)}>
                        {e}
                      </Chip>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
