/**
 * OWNER: cosmos.
 * ColoniesPanel — the empire at a glance ('colonies' panel): totals across every world, one card per colony
 * (portrait, city, where it is, citizens / happiness / income, quick travel or "show on map"), the worlds that are
 * open for settlers right now (sorted by charter cost) and the next frontier with what it takes to get there.
 */
import { game } from '../../game/instance';
import { ui, confirmDialog } from '../../ui/store';
import { Icon } from '../../ui/icons';
import { Button, IconButton } from '../../ui/core/Button';
import { SectionHeader, EmptyState } from '../../ui/core/display';
import { closePanel, uiSound } from '../../ui/core/env';
import { fmtCompact, fmtInt } from '../../ui/core/format';
import { PLANET_TYPES } from '../../content/planetTypes';
import type { ColonyInfo } from '../Cosmos';
import type { PlanetEntry } from '../Universe';
import { cx } from '../state';
import { PlanetAvatar } from './CosmosHud';

function showOnMap(id: string): void {
  closePanel();
  const c = game.cosmos;
  c.openView('system', id);
  setTimeout(() => c.select(id), 60);
}

async function travel(col: ColonyInfo): Promise<void> {
  const c = game.cosmos;
  const ok = await confirmDialog({ title: `Travel to ${col.cityName}?`, body: `Your view jumps to ${col.planetName}. Every colony keeps growing while you are away.`, okLabel: 'Engage warp drive' });
  if (!ok) return;
  closePanel();
  void c.travelTo(col.id);
}

function ColonyCard({ col }: { col: ColonyInfo }) {
  const arch = PLANET_TYPES[col.type];
  const entry = game.cosmos.entryOf(col.id);
  const state = col.current ? 'current' : col.home ? 'home' : 'colony';
  return (
    <article class={'cl-card' + (col.current ? ' is-current' : '')}>
      <div class="cl-art">
        <PlanetAvatar entry={entry} id={col.id} size={56} state={state} />
      </div>
      <div class="cl-main">
        <div class="cl-title-row">
          <h3 class="cl-city ellipsis">{col.cityName}</h3>
          {col.current ? (
            <span class="cl-badge is-here">
              <Icon name="locate" size={12} /> Here
            </span>
          ) : col.home ? (
            <span class="cl-badge is-home">
              <Icon name="home" size={12} /> Home
            </span>
          ) : null}
        </div>
        <div class="cl-where ellipsis">
          {col.planetName} · {arch?.name ?? col.type} · {col.systemName}
          {col.galaxyName && col.galaxyName !== 'Lumen Spiral' ? ` · ${col.galaxyName}` : ''}
        </div>
        <div class="cl-stats">
          <span class="cl-stat">
            <Icon name="population" size={13} />
            <b class="num">{fmtCompact(col.population)}</b>
          </span>
          <span class={'cl-stat ' + (col.happiness >= 65 ? 'good' : col.happiness >= 40 ? 'warn' : 'bad')}>
            <Icon name={col.happiness >= 65 ? 'smile' : col.happiness >= 40 ? 'meh' : 'frown'} size={13} />
            <b class="num">{Math.round(col.happiness)}%</b>
          </span>
          {!game.empire.sandbox && (
            <span class={'cl-stat ' + (col.income >= 0 ? 'good' : 'bad')}>
              <Icon name="income" size={13} />
              <b class="num">
                {col.income >= 0 ? '+' : '−'}₡{fmtCompact(Math.abs(col.income))}
              </b>
            </span>
          )}
        </div>
      </div>
      <div class="cl-actions">
        <IconButton icon="map" label="Show on the star map" variant="glass" onClick={() => showOnMap(col.id)} />
        {!col.current && <IconButton icon="rocket" label={`Travel to ${col.cityName}`} variant="primary" onClick={() => void travel(col)} />}
      </div>
    </article>
  );
}

function WorldRow({ e, cost, reason }: { e: PlanetEntry; cost?: number; reason?: string }) {
  const c = game.cosmos;
  const spec = c.planetSpec(e.id) ?? e.spec;
  const arch = PLANET_TYPES[spec.type];
  const sys = c.systemOf(e.id);
  const locked = !!reason;
  return (
    <button type="button" class={'cl-world' + (locked ? ' is-locked' : '')} onClick={() => (uiSound('tap'), showOnMap(e.id))}>
      <PlanetAvatar entry={e} id={e.id} size={40} state={locked ? 'locked' : 'open'} />
      <span class="cl-world-text">
        <span class="cl-world-name ellipsis">
          {spec.name}
          <span class="cl-world-type"> · {e.kind === 'moon' ? `${arch?.name ?? spec.type} moon` : arch?.name ?? spec.type}</span>
        </span>
        <span class="cl-world-sub ellipsis">{locked ? reason : `${sys?.name ?? ''} · ${arch?.tagline ?? ''}`}</span>
      </span>
      <span class="cl-world-end">
        {locked ? <Icon name="lock" size={16} /> : cost !== undefined && cost > 0 ? <span class="cl-cost num">₡{fmtCompact(cost)}</span> : <span class="cl-cost">Free</span>}
        <Icon name="chevronRight" size={16} />
      </span>
    </button>
  );
}

export function ColoniesPanel(_p: { onClose: () => void }) {
  void cx.version.value;
  void ui.population.value;
  void ui.money.value;
  const c = game.cosmos;
  const prog = game.progression;
  const sandbox = game.empire.sandbox;
  const cols = c.colonies();
  const total = cols.reduce((n, x) => n + x.population, 0);
  const income = cols.reduce((n, x) => n + x.income, 0);
  const systems = new Set(cols.map((x) => x.systemName)).size;
  const galaxies = new Set(cols.map((x) => x.galaxyName)).size;

  // worlds open for settlers & the next frontier (known galaxies only)
  const open: { e: PlanetEntry; cost: number }[] = [];
  const next: { e: PlanetEntry; reason: string; weight: number }[] = [];
  for (const g of c.galaxies) {
    const galOpen = prog.meets(g);
    for (const s of g.systems) {
      for (const p of s.planets) {
        if (!p.colonisable || c.isFounded(p.id)) continue;
        const chk = c.canTravel(p.id);
        const reqs = chk.reqs.length ? chk.reqs : prog.reqsFor(p);
        const fail = reqs.find((r) => !r.ok);
        if (!fail) {
          if (galOpen) open.push({ e: p, cost: chk.cost });
        } else if (!sandbox && (g.id === 'g0' || galOpen)) {
          const tierReq = reqs.find((r) => r.req.startsWith('tier:'));
          next.push({ e: p, reason: reqs.filter((r) => !r.ok).map((r) => r.label).join(' · '), weight: (tierReq?.need ?? 9) * 10 + reqs.filter((r) => !r.ok).length + (p.kind === 'moon' ? 0.5 : 0) });
        }
      }
    }
  }
  open.sort((a, b) => a.cost - b.cost || a.e.orbit - b.e.orbit);
  next.sort((a, b) => a.weight - b.weight);

  return (
    <div class="cl-root">
      <div class="cl-totals">
        <div class="cl-total">
          <span class="cl-total-v num">{fmtCompact(Math.max(total, prog.totalPop()))}</span>
          <span class="cl-total-l">citizens</span>
        </div>
        <div class="cl-total">
          <span class="cl-total-v num">{cols.length}</span>
          <span class="cl-total-l">{cols.length === 1 ? 'world' : 'worlds'}</span>
        </div>
        <div class="cl-total">
          <span class="cl-total-v num">{systems}</span>
          <span class="cl-total-l">{systems === 1 ? 'system' : 'systems'}</span>
        </div>
        <div class="cl-total">
          <span class="cl-total-v num">{galaxies}</span>
          <span class="cl-total-l">{galaxies === 1 ? 'galaxy' : 'galaxies'}</span>
        </div>
        {!sandbox && (
          <div class={'cl-total ' + (income >= 0 ? 'good' : 'bad')}>
            <span class="cl-total-v num">
              {income >= 0 ? '+' : '−'}₡{fmtCompact(Math.abs(income))}
            </span>
            <span class="cl-total-l">a month</span>
          </div>
        )}
      </div>

      <SectionHeader title="Your worlds" icon="globe" subtitle="Colonies share one treasury and keep growing while you are away." />
      <div class="cl-list">
        {cols.map((col) => (
          <ColonyCard key={col.id} col={col} />
        ))}
      </div>

      <SectionHeader title={sandbox ? 'Worlds to explore' : 'Open for settlers'} icon="flag" subtitle={sandbox ? 'Sandbox: land anywhere, free of charge.' : open.length ? 'Found a colony from the star map. The Colonial Office pays a settlers’ grant once it reaches 500 citizens.' : undefined} />
      {open.length ? (
        <div class="cl-worlds">
          {open.slice(0, sandbox ? 10 : 8).map((o) => (
            <WorldRow key={o.e.id} e={o.e} cost={o.cost} />
          ))}
        </div>
      ) : (
        <EmptyState icon="telescope" title="No worlds open yet" body="Grow your population and build a spaceport — your moon is waiting." />
      )}

      {!sandbox && next.length > 0 && (
        <>
          <SectionHeader title="Next frontier" icon="telescope" subtitle="What it takes to open the next worlds." />
          <div class="cl-worlds">
            {next.slice(0, 4).map((n) => (
              <WorldRow key={n.e.id} e={n.e} reason={n.reason} />
            ))}
          </div>
        </>
      )}

      <div class="cl-foot">
        <Button variant="secondary" icon="map" block onClick={() => (closePanel(), c.openView('system'))}>
          Open the star map
        </Button>
        {sandbox && (
          <Button variant="primary" icon="magic" block onClick={() => (ui.panel.value = 'forge')}>
            Forge a new world
          </Button>
        )}
      </div>
      <p class="cl-fine num">Treasury ₡{fmtInt(Math.floor(game.empire.money))}</p>
    </div>
  );
}
