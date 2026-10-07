/**
 * OWNER: ui-panels.
 * Data lenses — the 'lenses' panel (every game.sim lens as a card, grouped, with its colour ramp; tapping one sets
 * ui.lens and closes the sheet so the map is visible) and the 'lens-legend' overlay shown while a lens is active:
 * name, gradient key with low/high labels, previous / next lens and close. The legend sits above the dock and
 * moves under the top bar while a tool or the inspector occupies the bottom of the screen.
 */
import type { ColorRamp } from '../../render/planet/PlanetSurface';
import type { LensDef } from '../../sim/Simulation';
import { game } from '../../game/instance';
import { EmptyState, Icon, IconOrEmoji } from '../core';
import { closePanel, openPanel, uiSound } from '../core/env';
import { ui } from '../store';
import { css, safe } from './common';

/** Mirror of the terrain overlay's ramp stops (render/planet/TileData.ts) for CSS gradients. */
const RAMP_STOPS: Record<string, number[]> = {
  heat: [0x1a2a6c, 0x2f6fd0, 0x5fd6c8, 0xf6e05a, 0xf98a2e, 0xd7263d],
  good: [0xd7263d, 0xf3722c, 0xf9d84a, 0x9be564, 0x2fbf71],
  bad: [0x2fbf71, 0xb8e05a, 0xf9d84a, 0xf3722c, 0xd7263d, 0x8a1d5c],
  cool: [0x0b1d51, 0x1f5fa8, 0x37b6e0, 0x9eeaf9, 0xf0fbff],
  rainbow: [0xe63946, 0xf4a261, 0xf9e45b, 0x52d681, 0x3fa7f0, 0x7b5cff, 0xd65db1],
};

/** CSS linear-gradient for a lens ramp. */
export function rampGradient(ramp: ColorRamp): string {
  let stops: number[];
  if (typeof ramp === 'function') {
    stops = [];
    for (let i = 0; i <= 6; i++) stops.push(safe(() => ramp(i / 6), 0x888888));
  } else stops = RAMP_STOPS[ramp] ?? RAMP_STOPS.heat;
  return `linear-gradient(90deg, ${stops.map((c, i) => `${css(c)} ${Math.round((i / (stops.length - 1)) * 100)}%`).join(', ')})`;
}

export function lenses(): LensDef[] {
  return safe(() => game.sim.lenses, []);
}

export function setLens(id: string | null): void {
  if (ui.lens.value === id) return;
  ui.lens.value = id;
  uiSound(id ? 'toggle' : 'close');
}

export function LensesPanel() {
  const list = lenses();
  const active = ui.lens.value;
  if (!list.length) return <EmptyState icon="lens" title="No lenses available" body="Data lenses appear once a city is running." />;
  const groups = new Map<string, LensDef[]>();
  for (const l of list) {
    const g = l.group ?? 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(l);
  }
  const pick = (id: string | null) => {
    setLens(id);
    closePanel();
  };
  return (
    <div class="up-root up-lenses">
      <p class="up-footnote">Lenses paint the planet with data. Pick one to see where power runs out, where crime creeps in, or where the land is worth a fortune.</p>
      {active && (
        <button type="button" class="up-lens-off" onClick={() => pick(null)}>
          <Icon name="eyeOff" size={18} /> Turn off the {list.find((l) => l.id === active)?.name ?? ''} lens
        </button>
      )}
      {[...groups.entries()].map(([g, ls]) => (
        <section key={g} class="up-lens-group">
          <h4 class="up-lens-group-title">{g}</h4>
          <div class="up-lens-grid">
            {ls.map((l) => (
              <button key={l.id} type="button" class={'up-lens' + (l.id === active ? ' is-active' : '')} aria-pressed={l.id === active} onClick={() => pick(l.id === active ? null : l.id)}>
                <span class="up-lens-icon">
                  <IconOrEmoji value={l.icon} size={20} />
                </span>
                <span class="up-lens-name">{l.name}</span>
                <span class="up-lens-desc">{l.description}</span>
                <span class="up-lens-ramp" style={{ background: rampGradient(l.ramp) }} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Overlay: the key for the active lens. */
export function LensLegend() {
  const id = ui.lens.value;
  if (!id || ui.view.value !== 'planet' || ui.photo.value || ui.chromeHidden.value || ui.screen.value !== 'game' || ui.panel.value) return null;
  const list = lenses();
  const i = list.findIndex((l) => l.id === id);
  const l = list[i];
  if (!l) return null;
  const top = !!ui.tool.value || !!ui.selection.value;
  const step = (d: number) => {
    const n = list.length;
    setLens(list[(i + d + n) % n].id);
  };
  return (
    <div class={'up-legend pe glass-strong' + (top ? ' is-top' : '')} role="region" aria-label={`${l.name} lens legend`}>
      <button type="button" class="up-legend-nav" aria-label="Previous lens" onClick={() => step(-1)}>
        <Icon name="chevronLeft" size={18} />
      </button>
      <button type="button" class="up-legend-main" onClick={() => openPanel('lenses')} aria-label="All lenses">
        <span class="up-legend-title">
          <IconOrEmoji value={l.icon} size={15} />
          <b>{l.name}</b>
        </span>
        <span class="up-legend-ramp" style={{ background: rampGradient(l.ramp) }} />
        <span class="up-legend-labels">
          <span>{l.legend[0]}</span>
          <span>{l.legend[1]}</span>
        </span>
      </button>
      <button type="button" class="up-legend-nav" aria-label="Next lens" onClick={() => step(1)}>
        <Icon name="chevronRight" size={18} />
      </button>
      <button type="button" class="up-legend-close" aria-label="Close lens" onClick={() => setLens(null)}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
