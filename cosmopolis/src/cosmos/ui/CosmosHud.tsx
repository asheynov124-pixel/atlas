/**
 * OWNER: cosmos.
 * CosmosHud — the overlay shown while ui.view is system / galaxy / universe:
 *   • gesture layer (drag = orbit, pinch / wheel = zoom, tap = select, double tap = enter) — the planet canvas never
 *     receives cosmos input
 *   • tappable body labels (DomLabels, positioned by the active view every frame)
 *   • breadcrumb  Back · Universe › Galaxy › System
 *   • side controls: zoom out / in, find me, colonies, research (career), Planet Forge (sandbox)
 *   • info card for the selected planet / star / system / galaxy: portrait, status, stats, requirements, CTA
 *     (visit, found colony with confirm, enter system / galaxy)
 *   • idle bar ("Back to <city>") when nothing is selected
 *   • warp HUD + full-screen flash (driven directly by Cosmos via fxHost)
 * Esc: deselect, then back to the planet.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { game } from '../../game/instance';
import { ui, confirmDialog, notify } from '../../ui/store';
import { Icon } from '../../ui/icons';
import { Button } from '../../ui/core/Button';
import { useLayer, uiSound, viewport, openPanel } from '../../ui/core/env';
import { fmtCompact, fmtInt } from '../../ui/core/format';
import { PLANET_TYPES } from '../../content/planetTypes';
import { STAR_INFO, findGalaxy, findSystem, type Galaxy, type PlanetEntry, type StarSystem } from '../Universe';
import { labelHost, type LabelState } from '../render/CosmosView';
import type { ReqStatus } from '../Progression';
import { cx, fxHost } from '../state';
import { DomLabels } from './labels';
import { planetArt } from './planetArt';
import { galaxyArt } from './galaxyArt';

const cosmos = () => game?.cosmos;

function hexCss(c: number, a = 1): string {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

// ───────────────────────────────────────────── gestures

function GestureLayer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = false;
    let start = { x: 0, y: 0, t: 0 };
    let pinch = 0;
    let mid = { x: 0, y: 0 };
    const c = () => cosmos();
    const two = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };
    const down = (e: PointerEvent) => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        moved = false;
        start = { x: e.clientX, y: e.clientY, t: performance.now() };
      } else if (pts.size === 2) {
        const t = two();
        pinch = t.d;
        mid = t.m;
        moved = true;
      }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size === 1) {
        if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7) moved = true;
        if (moved) c()?.rotate(dx, dy);
      } else if (pts.size === 2) {
        const t = two();
        if (pinch > 0 && t.d > 0) c()?.zoom(pinch / t.d);
        c()?.rotate((t.m.x - mid.x) * 0.6, (t.m.y - mid.y) * 0.6);
        pinch = t.d;
        mid = t.m;
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0) {
        if (!moved && performance.now() - start.t < 600) c()?.tap(e.clientX, e.clientY);
        else c()?.fling();
        pinch = 0;
      } else if (pts.size === 1) {
        const [p] = [...pts.values()];
        start = { x: p.x, y: p.y, t: 0 };
        pinch = 0;
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = e.ctrlKey ? 0.01 : 0.0016;
      c()?.zoom(Math.exp(Math.max(-0.6, Math.min(0.6, e.deltaY * k))));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, []);
  return <div class="cx-gesture pe" ref={ref} aria-hidden="true" />;
}

// ───────────────────────────────────────────── portraits

export function PlanetAvatar({ entry, id, size, state }: { entry?: PlanetEntry | null; id: string; size: number; state?: LabelState }) {
  const spec = cosmos()?.planetSpec(id) ?? entry?.spec;
  const url = useMemo(() => {
    if (!spec) return '';
    try {
      return planetArt(spec, { size, giant: entry?.giant, locked: state === 'locked', lights: state === 'colony' || state === 'current' || state === 'home' });
    } catch (e) {
      console.warn('[cosmos] portrait failed', e);
      return '';
    }
  }, [spec, size, state, entry]);
  return url ? <img class="cx-avatar" src={url} width={size} height={size} alt="" draggable={false} /> : <span class="cx-avatar cx-avatar-fallback" style={{ width: size, height: size }} />;
}

function StarAvatar({ sys, size }: { sys: StarSystem; size: number }) {
  const info = STAR_INFO[sys.star];
  if (sys.star === 'blackhole')
    return (
      <span class="cx-star-art is-bh" style={{ width: size, height: size }}>
        <i />
      </span>
    );
  const comp = sys.companion ? STAR_INFO[sys.companion] : null;
  return (
    <span class="cx-star-art" style={{ width: size, height: size, '--c': hexCss(info.color), '--g': hexCss(info.glow, 0.55), '--c2': comp ? hexCss(comp.color) : 'transparent' } as Record<string, string | number>}>
      <i />
      {comp && <b />}
    </span>
  );
}

export function GalaxyAvatar({ g, size, locked }: { g: Galaxy; size: number; locked?: boolean }) {
  const url = useMemo(() => {
    try {
      return galaxyArt(g, size, !!locked);
    } catch (e) {
      console.warn('[cosmos] galaxy portrait failed', e);
      return '';
    }
  }, [g, size, locked]);
  if (url) return <img class="cx-avatar cx-gal-img" src={url} width={size} height={size} alt="" draggable={false} />;
  return (
    <span class={'cx-gal-art kind-' + g.kind + (locked ? ' is-locked' : '')} style={{ width: size, height: size, '--a': hexCss(g.colors[0]), '--b': hexCss(g.colors[1]) } as Record<string, string | number>}>
      <i />
    </span>
  );
}

// ───────────────────────────────────────────── shared bits

function StateChip({ state, text }: { state: LabelState; text?: string }) {
  const map: Record<LabelState, [string, string]> = {
    current: ['locate', 'You are here'],
    home: ['home', 'Homeworld'],
    colony: ['flag', 'Colony'],
    open: ['unlock', 'Open to settlers'],
    locked: ['lock', 'Locked'],
    neutral: ['planet', 'Uninhabitable'],
  };
  const [icon, label] = map[state];
  return (
    <span class={'cx-state is-' + state}>
      <Icon name={icon} size={13} />
      {text ?? label}
    </span>
  );
}

function Reqs({ reqs: all }: { reqs: ReqStatus[] }) {
  // waived requirements (e.g. no such building exists yet) are not worth a line
  const reqs = all.filter((r) => !r.waived);
  if (!reqs.length) return null;
  return (
    <div class="cx-reqs" role="list" aria-label="Requirements">
      {reqs.map((r) => (
        <div class={'cx-req' + (r.ok ? ' is-ok' : '')} role="listitem" key={r.req}>
          <span class="cx-req-icon">
            <Icon name={r.ok ? 'check' : 'lock'} size={13} stroke={2.2} />
          </span>
          <span class="cx-req-label">{r.label}</span>
          {!r.ok && r.need !== undefined && r.have !== undefined && r.need > 1 && (
            <span class="cx-req-val num">
              {fmtCompact(Math.max(0, r.have))}/{fmtCompact(r.need)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Fact({ icon, label, value, tone }: { icon: string; label: string; value: ComponentChildren; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div class={'cx-fact' + (tone ? ' is-' + tone : '')}>
      <span class="cx-fact-v num">{value}</span>
      <span class="cx-fact-l">
        <Icon name={icon} size={12} class="cx-fact-icon" />
        {label}
      </span>
    </div>
  );
}

function CardShell({ art, title, sub, chips, children, actions, onClose }: { art: ComponentChildren; title: string; sub: ComponentChildren; chips?: ComponentChildren; children?: ComponentChildren; actions?: ComponentChildren; onClose: () => void }) {
  return (
    <section class="cx-card glass-strong pe" aria-label={title}>
      <header class="cx-card-head">
        <div class="cx-card-art">{art}</div>
        <div class="cx-card-titles">
          <h2 class="cx-card-title ellipsis">{title}</h2>
          <div class="cx-card-sub ellipsis">{sub}</div>
          {chips && <div class="cx-card-chips">{chips}</div>}
        </div>
        <button type="button" class="cx-card-close" aria-label="Close" onClick={() => (uiSound('close'), onClose())}>
          <Icon name="close" size={18} />
        </button>
      </header>
      <div class="cx-card-body scroll-y">{children}</div>
      {actions && <footer class="cx-card-actions">{actions}</footer>}
    </section>
  );
}

const tempText = (c: number) => `${c > 0 ? '' : c < 0 ? '−' : ''}${Math.abs(Math.round(c))}°C`;

function atmo(e: { atmosphere: { density: number; breathable: boolean } }): { text: string; tone: 'good' | 'warn' | 'bad' } {
  if (e.atmosphere.density < 0.1) return { text: 'None', tone: 'bad' };
  if (e.atmosphere.breathable) return { text: e.atmosphere.density > 1.2 ? 'Rich' : e.atmosphere.density < 0.75 ? 'Thin' : 'Fresh', tone: 'good' };
  return { text: 'Toxic', tone: 'warn' };
}

// ───────────────────────────────────────────── cards

async function foundOrVisit(id: string): Promise<void> {
  const c = cosmos();
  if (!c) return;
  const chk = c.canTravel(id);
  const spec = c.planetSpec(id);
  if (!chk.ok) {
    uiSound('error');
    notify({ title: 'Not yet', body: chk.reason, kind: 'warn', icon: 'lock' });
    return;
  }
  if (!chk.founded && chk.cost > 0) {
    const ok = await confirmDialog({
      title: `Found a colony on ${spec?.name ?? 'this world'}?`,
      body: `Colony charter: ₡${fmtInt(chk.cost)}. The Colonial Office pays a settlers’ grant of ₡${fmtInt(chk.grant)} once the colony reaches 500 citizens. Every colony shares one treasury — and one very busy mayor.`,
      okLabel: `Found colony · ₡${fmtCompact(chk.cost)}`,
    });
    if (!ok) return;
  }
  void c.travelTo(id);
}

function PlanetCard({ id, onClose }: { id: string; onClose: () => void }) {
  void cx.version.value;
  void ui.money.value;
  void ui.tier.value;
  const c = cosmos()!;
  const entry = c.entryOf(id);
  const spec = c.planetSpec(id);
  if (!spec) return null;
  const state: LabelState = entry ? c.planetState(entry) : id === game.planet?.spec.id ? 'current' : 'colony';
  const arch = PLANET_TYPES[spec.type];
  const giant = entry?.kind === 'giant';
  const sys = c.systemOf(id);
  const parent = entry?.parent ? c.entryOf(entry.parent) : null;
  const chk = c.canTravel(id);
  const sandbox = game.empire.sandbox;
  const colony = game.empire.s.colonies[id];
  const moons = sys ? sys.planets.filter((p) => p.parent === id) : [];
  const base = (arch?.name ?? spec.type).replace(/ (Moon|World)$/, '');
  const typeName = giant ? (entry?.giant?.ice ? 'Ice giant' : 'Gas giant') : entry?.kind === 'moon' ? `${base} moon` : `${base} world`;
  const where = parent ? `Moon of ${c.planetSpec(parent.id)?.name ?? parent.name}` : sys ? sys.name : '';
  const tiles = 10 * spec.frequency * spec.frequency + 2;
  let cta: ComponentChildren = null;
  if (giant) cta = null;
  else if (chk.current) cta = <Button variant="primary" size="lg" block icon="planet" onClick={() => c.backToPlanet()}>Return to the surface</Button>;
  else if (chk.founded) cta = <Button variant="primary" size="lg" block icon="rocket" onClick={() => void foundOrVisit(id)}>Travel to {colony?.name || spec.name}</Button>;
  else if (sandbox) cta = <Button variant="primary" size="lg" block icon="rocket" onClick={() => void foundOrVisit(id)}>Land on {spec.name}</Button>;
  else if (chk.ok) cta = <Button variant="primary" size="lg" block icon="flag" onClick={() => void foundOrVisit(id)}>Found colony · ₡{fmtCompact(chk.cost)}</Button>;
  else cta = <Button variant="secondary" size="lg" block icon="lock" disabled>{chk.reason ?? 'Locked'}</Button>;
  const chips = (
    <>
      <StateChip state={state} text={state === 'colony' && colony ? `Colony · ${fmtCompact(colony.population)}` : undefined} />
      {spec.rings && <span class="cx-mini">Ringed</span>}
      {moons.length > 0 && <span class="cx-mini">{moons.length} {moons.length === 1 ? 'moon' : 'moons'}</span>}
    </>
  );
  return (
    <CardShell art={<PlanetAvatar entry={entry} id={id} size={64} state={state} />} title={spec.name} sub={`${typeName}${where ? ' · ' + where : ''}`} chips={chips} onClose={onClose} actions={cta}>
      <p class="cx-card-desc">{entry?.description ?? arch?.description}</p>
      {!giant && (
        <div class="cx-facts">
          <Fact icon="gravity" label="Gravity" value={`${spec.gravity.toFixed(2)} g`} />
          <Fact icon="temperature" label="Mean" value={tempText(spec.temperature)} />
          <Fact icon="oxygen" label="Air" value={atmo(spec).text} tone={atmo(spec).tone} />
          <Fact icon="grid" label="Tiles" value={fmtCompact(tiles)} />
        </div>
      )}
      {!giant && arch && (
        <div class="cx-tags">
          {arch.resources.slice(0, 3).map((r) => (
            <span class="cx-tag is-res" key={r}>
              <Icon name="sparkles" size={12} />
              {r}
            </span>
          ))}
          {arch.hazards.slice(0, 2).map((h) => (
            <span class="cx-tag is-haz" key={h}>
              <Icon name="alert" size={12} />
              {h.replace(/-/g, ' ')}
            </span>
          ))}
          {arch.needsOxygen && (
            <span class="cx-tag is-haz">
              <Icon name="oxygen" size={12} />
              needs O₂
            </span>
          )}
        </div>
      )}
      {colony && state !== 'current' && (
        <div class="cx-colony-stats">
          <Fact icon="population" label="Citizens" value={fmtCompact(colony.population)} />
          <Fact icon="smile" label="Happiness" value={`${colony.happiness}%`} />
          <Fact icon="income" label="Per month" value={`${colony.income >= 0 ? '+' : '−'}₡${fmtCompact(Math.abs(colony.income))}`} />
        </div>
      )}
      {moons.length > 0 && (
        <div class="cx-moons">
          <span class="cx-moons-l">Moons</span>
          {moons.map((m) => (
            <button type="button" class="cx-moon" key={m.id} onClick={() => c.select(m.id)}>
              <PlanetAvatar entry={m} id={m.id} size={26} state={c.planetState(m)} />
              <span>{c.planetSpec(m.id)?.name ?? m.name}</span>
            </button>
          ))}
        </div>
      )}
      {!sandbox && !chk.founded && !giant && <Reqs reqs={chk.reqs.length ? chk.reqs : entry ? game.progression.reqsFor(entry) : []} />}
      {!sandbox && !chk.founded && !giant && chk.ok && chk.grant > 0 && (
        <p class="cx-note">
          <Icon name="sparkles" size={13} /> Settlers’ grant <b class="num">₡{fmtCompact(chk.grant)}</b> when it reaches 500 citizens.
        </p>
      )}
    </CardShell>
  );
}

function StarCard({ id, onClose }: { id: string; onClose: () => void }) {
  const sys = findSystem(cosmos()!.galaxies, id.replace(/\.star$/, ''));
  if (!sys) return null;
  const info = STAR_INFO[sys.star];
  const comp = sys.companion ? STAR_INFO[sys.companion] : null;
  const worlds = sys.planets.filter((p) => !p.parent).length;
  const moons = sys.planets.length - worlds;
  return (
    <CardShell art={<StarAvatar sys={sys} size={64} />} title={sys.name} sub={`${info.name}${comp ? ' + ' + comp.name.toLowerCase() : ''} · ${info.spectral}`} onClose={onClose} actions={<Button variant="secondary" size="lg" block icon="galaxy" onClick={() => cosmos()?.levelUp()}>View the galaxy</Button>}>
      <p class="cx-card-desc">{info.blurb}</p>
      <p class="cx-card-desc dim">{sys.description}</p>
      <div class="cx-facts">
        <Fact icon="planet" label="Worlds" value={worlds} />
        <Fact icon="moon" label="Moons" value={moons} />
        <Fact icon="sun" label="Light" value={`${info.lum.toFixed(1)} L☉`} />
        <Fact icon="flag" label="Colonies" value={sys.planets.filter((p) => cosmos()!.isFounded(p.id)).length} />
      </div>
    </CardShell>
  );
}

function SystemCard({ id, onClose }: { id: string; onClose: () => void }) {
  void cx.version.value;
  void ui.tier.value;
  const c = cosmos()!;
  const sys = findSystem(c.galaxies, id);
  if (!sys) return null;
  const state = c.systemState(sys);
  const info = STAR_INFO[sys.star];
  const reqs = game.empire.sandbox ? [] : game.progression.reqsFor(sys);
  const worlds = sys.planets.filter((p) => !p.parent).length;
  const colonisable = sys.planets.filter((p) => p.colonisable).length;
  const cols = sys.planets.filter((p) => c.isFounded(p.id)).length;
  return (
    <CardShell
      art={<StarAvatar sys={sys} size={64} />}
      title={sys.name}
      sub={`${info.name} · ${info.spectral}`}
      chips={<StateChip state={state} />}
      onClose={onClose}
      actions={
        <Button variant={state === 'locked' ? 'secondary' : 'primary'} size="lg" block icon="starSystem" onClick={() => c.openView('system', sys.id)}>
          {state === 'locked' ? 'Preview system' : 'Enter system'}
        </Button>
      }
    >
      <p class="cx-card-desc">{sys.description}</p>
      <div class="cx-facts">
        <Fact icon="planet" label="Worlds" value={worlds} />
        <Fact icon="flag" label="Livable" value={colonisable} />
        <Fact icon="home" label="Colonies" value={cols} />
        <Fact icon="sun" label="Star" value={info.spectral} />
      </div>
      {state === 'locked' && <Reqs reqs={reqs} />}
    </CardShell>
  );
}

function GalaxyCard({ id, onClose }: { id: string; onClose: () => void }) {
  void cx.version.value;
  void ui.tier.value;
  const c = cosmos()!;
  const g = findGalaxy(c.galaxies, id);
  if (!g) return null;
  const state = c.galaxyState(g);
  const reqs = game.empire.sandbox ? [] : game.progression.reqsFor(g);
  const worlds = g.systems.reduce((n, s) => n + s.planets.filter((p) => p.colonisable).length, 0);
  const kindName = { spiral: 'Spiral galaxy', barred: 'Barred spiral', elliptical: 'Elliptical galaxy', ring: 'Ring galaxy', irregular: 'Irregular galaxy' }[g.kind];
  return (
    <CardShell
      art={<GalaxyAvatar g={g} size={64} locked={state === 'locked'} />}
      title={g.name}
      sub={`${kindName} · ${g.tagline}`}
      chips={<StateChip state={state} />}
      onClose={onClose}
      actions={
        <Button variant={state === 'locked' ? 'secondary' : 'primary'} size="lg" block icon="galaxy" onClick={() => c.openView('galaxy', g.id)}>
          {state === 'locked' ? 'Preview galaxy' : 'Enter galaxy'}
        </Button>
      }
    >
      <p class="cx-card-desc">{g.description}</p>
      <div class="cx-facts">
        <Fact icon="starSystem" label="Systems" value={g.systems.length} />
        <Fact icon="planet" label="Livable" value={worlds} />
        <Fact icon="flag" label="Colonies" value={g.systems.reduce((n, s) => n + s.planets.filter((p) => c.isFounded(p.id)).length, 0)} />
        <Fact icon="star" label="Stars" value={`${Math.round(g.stars / 300)}B`} />
      </div>
      {state === 'locked' && <Reqs reqs={reqs} />}
    </CardShell>
  );
}

/** Report the card's screen rect (and where the top chrome ends) so the 3D view can frame around it. */
function useReportFrame(ref: { current: HTMLElement | null }, key: string): void {
  const vp = viewport.value;
  useLayoutEffect(() => {
    const report = () => {
      const crumbs = document.querySelector('.cx-crumbs');
      const top = crumbs ? crumbs.getBoundingClientRect().bottom + 6 : 110;
      const card = ref.current?.querySelector('.cx-card') as HTMLElement | null;
      if (!card) {
        cosmos()?.setHudFrame(null, top);
        return;
      }
      const r = card.getBoundingClientRect();
      cosmos()?.setHudFrame({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }, top);
    };
    report();
    const card = ref.current?.querySelector('.cx-card');
    const ro = card && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => report()) : null;
    if (card) ro?.observe(card);
    // the entrance animation moves the card a little — measure once more when it has settled
    const t = setTimeout(report, 450);
    return () => {
      ro?.disconnect();
      clearTimeout(t);
    };
  }, [key, vp.w, vp.h]);
}

function InfoCard() {
  const sel = cx.selected.value;
  const ref = useRef<HTMLDivElement>(null);
  useReportFrame(ref, sel ? sel.kind + ':' + sel.id : '');
  if (!sel) return <IdleBar />;
  const close = () => cosmos()?.select(null);
  const body = sel.kind === 'planet' ? <PlanetCard id={sel.id} onClose={close} /> : sel.kind === 'star' ? <StarCard id={sel.id} onClose={close} /> : sel.kind === 'system' ? <SystemCard id={sel.id} onClose={close} /> : <GalaxyCard id={sel.id} onClose={close} />;
  return (
    <div class="cx-bottom" key={sel.id} ref={ref}>
      {body}
    </div>
  );
}

function IdleBar() {
  const lvl = cx.level.value;
  const hint = lvl === 'system' ? 'Tap a world to inspect it · pinch out for the galaxy' : lvl === 'galaxy' ? 'Tap a star system · pinch out for the universe' : 'Tap a galaxy to inspect it';
  return (
    <div class="cx-bottom is-idle">
      <div class="cx-idle glass pe">
        <span class="cx-idle-hint">{hint}</span>
        <Button variant="primary" icon="planet" onClick={() => cosmos()?.backToPlanet()}>
          Back to {ui.cityName.value || ui.planetName.value || 'your city'}
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── breadcrumb & side controls

function Breadcrumb() {
  const lvl = cx.level.value;
  const c = cosmos();
  if (!c || !lvl) return null;
  const g = findGalaxy(c.galaxies, cx.galaxyId.value);
  const s = findSystem(c.galaxies, cx.systemId.value);
  const items: { level: 'universe' | 'galaxy' | 'system'; label: string; icon: string }[] = [{ level: 'universe', label: 'Universe', icon: 'universe' }];
  if (lvl !== 'universe' && g) items.push({ level: 'galaxy', label: g.name, icon: 'galaxy' });
  if (lvl === 'system' && s) items.push({ level: 'system', label: s.name, icon: 'starSystem' });
  return (
    <nav class="cx-crumbs" aria-label="Location">
      <button type="button" class="cx-back glass" aria-label={`Back to ${ui.cityName.value || 'your planet'}`} title="Back to the surface (Esc)" onClick={() => (uiSound('close'), c.backToPlanet())}>
        <Icon name="arrowLeft" size={20} />
      </button>
      <div class="cx-trail glass">
        {items.map((it, i) => {
          const cur = it.level === lvl;
          // the universe crumb collapses to its icon once there is a deeper level to show
          const iconOnly = i === 0 && !cur;
          return (
            <>
              {i > 0 && <Icon name="chevronRight" size={13} class="cx-trail-sep" key={'s' + i} />}
              <button
                type="button"
                key={it.level}
                class={'cx-trail-item' + (cur ? ' is-current' : '') + (iconOnly ? ' is-icon' : '')}
                aria-label={it.label}
                aria-current={cur ? 'page' : undefined}
                disabled={cur}
                onClick={() => c.openView(it.level, it.level === 'universe' ? cx.galaxyId.value : it.level === 'galaxy' ? cx.systemId.value : undefined)}
              >
                {(i === 0 || cur) && <Icon name={it.icon} size={15} />}
                {!iconOnly && <span class="ellipsis">{it.label}</span>}
              </button>
            </>
          );
        })}
      </div>
    </nav>
  );
}

function SideButton({ icon, label, onClick, disabled, badge }: { icon: string; label: string; onClick: () => void; disabled?: boolean; badge?: number | null }) {
  return (
    <button type="button" class="cx-side-btn glass" aria-label={label} title={label} disabled={disabled} onClick={() => (uiSound('click'), onClick())}>
      <Icon name={icon} size={20} />
      {!!badge && <span class="cz-badge cz-badge-float num">{badge}</span>}
    </button>
  );
}

function SideControls() {
  const lvl = cx.level.value;
  const c = cosmos();
  void cx.version.value;
  void ui.research.value;
  if (!c) return null;
  const career = ui.mode.value === 'career';
  const colonies = Object.keys(game.empire.s.planets).length + (game.planet && !game.empire.s.planets[game.planet.spec.id] ? 1 : 0);
  const findMe = () => {
    const cur = game.planet?.spec.id;
    if (!cur) return;
    if (lvl === 'system') {
      if (c.systemOf(cur)?.id === cx.systemId.value) c.select(cur);
      else c.openView('system', cur);
    } else if (lvl === 'galaxy') {
      const sys = c.systemOf(cur);
      if (sys && sys.galaxyId === cx.galaxyId.value) c.select(sys.id);
      else c.openView('galaxy', cur);
    } else c.select(c.galaxyOf(cur)?.id ?? 'g0');
  };
  return (
    <div class="cx-side">
      <SideButton icon={lvl === 'system' ? 'galaxy' : 'universe'} label={lvl === 'system' ? 'Zoom out to the galaxy' : 'Zoom out to the universe'} onClick={() => c.levelUp()} disabled={lvl === 'universe'} />
      {lvl === 'system' ? (
        <SideButton icon="planet" label={`Back to ${ui.cityName.value || 'the surface'}`} onClick={() => c.backToPlanet()} />
      ) : (
        <SideButton icon={lvl === 'universe' ? 'galaxy' : 'starSystem'} label={lvl === 'universe' ? 'Enter the galaxy' : 'Enter the star system'} onClick={() => c.zoomIn()} />
      )}
      <SideButton icon="locate" label="Find my world" onClick={findMe} />
      <div class="cx-side-gap" />
      <SideButton icon="globe" label="Colonies" onClick={() => openPanel('colonies')} badge={colonies > 1 ? colonies : null} />
      {career && <SideButton icon="research" label="Research" onClick={() => openPanel('research')} badge={game.progression.affordableTechs() || null} />}
      {!career && <SideButton icon="magic" label="Planet Forge" onClick={() => openPanel('forge')} />}
    </div>
  );
}

// ───────────────────────────────────────────── warp

function WarpHud({ w }: { w: NonNullable<typeof cx.warping.value> }) {
  const kind = w.kind === 'local' ? 'Interplanetary jump' : w.kind === 'interstellar' ? 'Interstellar jump' : 'Intergalactic jump';
  return (
    <div class="cx-warp" role="status" aria-live="polite">
      <div class="cx-warp-kicker">{kind}</div>
      <div class="cx-warp-name">{w.name}</div>
      <div class="cx-warp-dist num">{w.distance}</div>
      <div class="cx-warp-bar">
        <i />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── root

export function CosmosHud() {
  const view = ui.view.value;
  const inCosmos = ui.screen.value === 'game' && (view === 'system' || view === 'galaxy' || view === 'universe');
  const warping = cx.warping.value;
  const labelsRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  void viewport.value;
  useEffect(() => {
    fxHost.flash = flashRef.current;
    const el = labelsRef.current;
    if (el) {
      labelHost.sink = new DomLabels(el, (id) => cosmos()?.labelTap(id));
      cosmos()?.refreshLabels();
    }
    return () => {
      fxHost.flash = null;
      labelHost.sink = null;
    };
  }, []);
  // desktop keys while the star map is up: +/- zoom · arrows orbit · Backspace / PageUp level up · PageDown /
  // Enter go in (the global M / Esc keys are ui-core's)
  useEffect(() => {
    if (!inCosmos || warping) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.key === 'Enter' || e.key === ' ') && t?.tagName === 'BUTTON') return;
      if (ui.panel.value || ui.confirm.value) return;
      const c = cosmos();
      if (!c) return;
      let used = true;
      switch (e.key) {
        case '+':
        case '=':
          c.zoom(0.8);
          break;
        case '-':
        case '_':
          c.zoom(1.25);
          break;
        case 'ArrowLeft':
          c.rotate(-40, 0);
          break;
        case 'ArrowRight':
          c.rotate(40, 0);
          break;
        case 'ArrowUp':
          c.rotate(0, -30);
          break;
        case 'ArrowDown':
          c.rotate(0, 30);
          break;
        case 'Backspace':
        case 'PageUp':
          c.levelUp();
          break;
        case 'PageDown':
        case 'Enter': {
          const sel = cx.selected.value;
          if (sel) c.activate(sel.id);
          else c.zoomIn();
          break;
        }
        default:
          used = false;
      }
      if (used) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inCosmos, !!warping]);
  useLayer(inCosmos && !warping, () => {
    const c = cosmos();
    if (!c) return;
    if (cx.selected.value) c.select(null);
    else c.backToPlanet();
  });
  const chrome = inCosmos && !warping && !ui.photo.value && !ui.chromeHidden.value;
  return (
    <div class={'cx-root' + (inCosmos ? ' is-on' : '') + (chrome ? '' : ' no-chrome')}>
      {inCosmos && !warping && <GestureLayer />}
      <div class="cx-labels" ref={labelsRef} aria-label="Bodies" />
      {chrome && (
        <>
          <Breadcrumb />
          <SideControls />
          <InfoCard />
        </>
      )}
      {warping && <WarpHud w={warping} />}
      <div class="cx-flash" ref={flashRef} aria-hidden="true" />
    </div>
  );
}
