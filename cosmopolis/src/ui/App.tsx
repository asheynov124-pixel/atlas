/**
 * OWNER: UI core agent.
 * App — the shell: loading screen, main menu & new-game flow, HUD (top bar, side rails, bottom dock), build sheet
 * with 3D thumbnails, inspector card, tool options bar, toasts, confirm dialog, registered panels & overlays.
 * (Foundation stub: functional but plain.)
 */
import { useState } from 'preact/hooks';
import { game } from '../game/instance';
import { ui, dismissToast } from './store';
import { panels, overlays } from './registry';
import { itemsByCategory } from '../content/catalog';
import type { Category } from '../core/types';

const CATS: Category[] = ['roads', 'zones', 'power', 'water', 'services', 'education', 'leisure', 'transit', 'industry', 'landmarks', 'orbital', 'decor', 'custom'];

export function App() {
  const screen = ui.screen.value;
  return (
    <div class="app">
      {screen === 'menu' && <Menu />}
      {screen === 'game' && <Hud />}
      {overlays.map((o) => <o.component key={o.id} />)}
      {ui.loading.value && <div class="loading">{ui.loading.value}</div>}
      <Toasts />
    </div>
  );
}

function Menu() {
  return (
    <div class="menu">
      <h1>COSMOPOLIS</h1>
      <button onClick={() => game.newGame('career')}>Career</button>
      <button onClick={() => game.newGame('sandbox')}>Sandbox</button>
      <button onClick={() => void game.load('auto')}>Continue</button>
    </div>
  );
}

function Hud() {
  const [cat, setCat] = useState<Category | null>(null);
  const panelId = ui.panel.value;
  const P = panelId ? panels.get(panelId) : undefined;
  return (
    <>
      <div class="topbar">
        <span>{ui.cityName.value}</span>
        <span>👥 {ui.population.value.toLocaleString()}</span>
        <span>₡ {ui.money.value.toLocaleString()}</span>
        <span>{ui.dateLabel.value}</span>
        {[0, 1, 2, 3].map((s) => (
          <button key={s} class={ui.speed.value === s ? 'on' : ''} onClick={() => game.clock.setSpeed(s)}>
            {s === 0 ? '⏸' : '▶'.repeat(s)}
          </button>
        ))}
      </div>
      {cat && (
        <div class="sheet">
          {itemsByCategory(cat).map((d) => (
            <button key={d.id} onClick={() => game.tools.select({ id: d.zone !== undefined ? 'zone' : d.road ? 'road' : 'plop', itemId: d.id, label: d.name })}>
              {d.icon ?? '▫️'} {d.name}
            </button>
          ))}
        </div>
      )}
      <div class="dock">
        {CATS.map((c) => (
          <button key={c} class={cat === c ? 'on' : ''} onClick={() => setCat(cat === c ? null : c)}>
            {c}
          </button>
        ))}
        <button onClick={() => game.tools.select(null)}>✕</button>
      </div>
      {P && (
        <div class="panel">
          <P.component onClose={() => (ui.panel.value = null)} />
        </div>
      )}
    </>
  );
}

function Toasts() {
  return (
    <div class="toasts">
      {ui.toasts.value.map((t) => (
        <div key={t.id} class="toast" onClick={() => dismissToast(t.id)}>
          {t.icon} <b>{t.title}</b> {t.body}
        </div>
      ))}
    </div>
  );
}
