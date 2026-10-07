/**
 * OWNER: ui-panels.
 * Registers every deep-dive panel, overlay and HUD button of the UI panels module (imported once by main.tsx).
 *
 *   Panels    city (City Hall) · budget · policies · districts · goals · stats · lenses · news (Hypernet) · help
 *   Overlays  lens-legend (key for the active data lens) · chirps (Hypernet popups)
 *   HUD       left rail: goals · lenses · news (unread badge) · stats · districts   right rail: help
 *
 * URL params (handled here): &panel=<id> opens a panel once the game is on screen.
 * Test hook: window.__cosmoPanels = { open(id), close(), ui }.
 */
import { effect } from '@preact/signals';
import { registerHudButton, registerOverlay, registerPanel } from '../registry';
import { ui } from '../store';
import { openPanel } from '../core/env';
import { BudgetPanel } from './BudgetPanel';
import { CityPanel } from './CityPanel';
import { DistrictsPanel } from './DistrictsPanel';
import { GoalsPanel } from './GoalsPanel';
import { HelpPanel } from './HelpPanel';
import { LensesPanel, LensLegend } from './LensesPanel';
import { Chirps, NewsPanel } from './NewsPanel';
import { PoliciesPanel } from './PoliciesPanel';
import { StatsPanel } from './StatsPanel';
import './panels.css';

// ───────────────────────────── panels
registerPanel({ id: 'city', title: 'City Hall', icon: 'crown', component: CityPanel, kind: 'sheet', menu: true, order: 1 });
registerPanel({ id: 'budget', title: 'Budget', icon: 'budget', component: BudgetPanel, kind: 'sheet', menu: true, order: 2 });
registerPanel({ id: 'policies', title: 'Policies', icon: 'policy', component: PoliciesPanel, kind: 'sheet', menu: true, order: 3 });
registerPanel({ id: 'districts', title: 'Districts', icon: 'district', component: DistrictsPanel, kind: 'sheet', menu: true, order: 4 });
registerPanel({ id: 'goals', title: 'Goals', icon: 'trophy', component: GoalsPanel, kind: 'sheet', menu: true, order: 5 });
registerPanel({ id: 'stats', title: 'Statistics', icon: 'stats', component: StatsPanel, kind: 'sheet', menu: true, order: 6 });
registerPanel({ id: 'lenses', title: 'Data Lenses', icon: 'lens', component: LensesPanel, kind: 'sheet', menu: true, order: 7 });
registerPanel({ id: 'news', title: 'Hypernet', icon: 'news', component: NewsPanel, kind: 'side', menu: true, order: 8 });
registerPanel({ id: 'help', title: 'How to Play', icon: 'help', component: HelpPanel, kind: 'modal', menu: true, order: 95 });

// ───────────────────────────── overlays
registerOverlay({ id: 'lens-legend', component: LensLegend, order: 10 });
registerOverlay({ id: 'chirps', component: Chirps, order: 11 });

// ───────────────────────────── HUD buttons
const toggle = (id: string) => () => {
  if (ui.panel.value === id) ui.panel.value = null;
  else openPanel(id);
};
const planetOnly = () => ui.view.value === 'planet';

registerHudButton({ id: 'panels.goals', icon: 'trophy', label: 'Goals', rail: 'left', order: 10, onClick: toggle('goals'), active: () => ui.panel.value === 'goals', visible: planetOnly });
registerHudButton({
  id: 'panels.lenses',
  icon: 'lens',
  label: 'Data lenses',
  rail: 'left',
  order: 20,
  onClick: () => (ui.lens.value && ui.panel.value !== 'lenses' ? openPanel('lenses') : toggle('lenses')()),
  active: () => ui.panel.value === 'lenses' || !!ui.lens.value,
  visible: planetOnly,
});
registerHudButton({
  id: 'panels.news',
  icon: 'news',
  label: 'Hypernet',
  rail: 'left',
  order: 30,
  onClick: toggle('news'),
  active: () => ui.panel.value === 'news',
  visible: planetOnly,
  badge: () => {
    const n = ui.unreadNews.value;
    return n > 0 ? (n > 99 ? '99+' : n) : null;
  },
});
registerHudButton({ id: 'panels.stats', icon: 'stats', label: 'Statistics', rail: 'left', order: 50, onClick: toggle('stats'), active: () => ui.panel.value === 'stats', visible: planetOnly });
registerHudButton({ id: 'panels.districts', icon: 'district', label: 'Districts', rail: 'left', order: 60, onClick: toggle('districts'), active: () => ui.panel.value === 'districts' || ui.tool.value?.id === 'district', visible: planetOnly });
registerHudButton({ id: 'panels.help', icon: 'help', label: 'How to play', rail: 'right', order: 40, onClick: toggle('help'), active: () => ui.panel.value === 'help', visible: planetOnly });

// ───────────────────────────── URL params
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(location.search);
  const want = params.get('panel');
  if (want) {
    let done = false;
    const stop = effect(() => {
      if (done || ui.screen.value !== 'game') return;
      done = true;
      setTimeout(() => {
        openPanel(want);
        stop();
      }, 600);
    });
  }
}

// ───────────────────────────── test hooks (screenshot scripts)
declare global {
  interface Window {
    __cosmoPanels?: {
      open: (id: string) => boolean;
      close: () => void;
      ui: typeof ui;
    };
  }
}
if (typeof window !== 'undefined') {
  window.__cosmoPanels = {
    open: (id) => {
      ui.panel.value = null;
      return openPanel(id);
    },
    close: () => (ui.panel.value = null),
    ui,
  };
}
