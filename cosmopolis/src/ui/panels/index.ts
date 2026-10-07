/**
 * OWNER: ui-panels.
 * Registers every deep-dive panel, overlay and HUD button of the UI panels module (imported once by main.tsx).
 *
 *   Panels    city (City Hall) · budget · policies · districts · goals · stats · lenses · news (Hypernet) · help ·
 *             settings · saves
 *   Overlays  labels (district & landmark names) · lens-legend (key for the active data lens) · chirps (Hypernet
 *             popups) · tutorial (first-run coach marks) · photo (photo mode)
 *   HUD       left rail: goals · lenses · news (unread badge) · stats · districts
 *             right rail: photo · saves · settings · help
 *
 * URL params (handled here): &panel=<id> opens a panel once the game is on screen · &photo=1 enters photo mode ·
 * &tutorial=1 (&tutorialStep=n) forces the tutorial (Tutorial.tsx).
 * Test hook: window.__cosmoPanels = { open(id), close(), ui, setSettings }.
 */
import { effect } from '@preact/signals';
import { setSettings } from '../../core/settings';
import { registerHudButton, registerOverlay, registerPanel } from '../registry';
import { ui } from '../store';
import { openPanel, uiSound } from '../core/env';
import { BudgetPanel } from './BudgetPanel';
import { CityPanel } from './CityPanel';
import { DistrictsPanel } from './DistrictsPanel';
import { GoalsPanel } from './GoalsPanel';
import { HelpPanel } from './HelpPanel';
import { LensesPanel, LensLegend } from './LensesPanel';
import { Chirps, NewsPanel } from './NewsPanel';
import { Labels } from './Labels';
import { PhotoMode } from './PhotoMode';
import { PoliciesPanel } from './PoliciesPanel';
import { SavesPanel } from './SavesPanel';
import { SettingsPanel } from './SettingsPanel';
import { StatsPanel } from './StatsPanel';
import { Tutorial } from './Tutorial';
import './panels.css';
import './overlays.css';

// ───────────────────────────── panels
registerPanel({ id: 'city', title: 'City Hall', icon: 'crown', component: CityPanel, kind: 'sheet', menu: true, order: 1 });
registerPanel({ id: 'budget', title: 'Budget', icon: 'budget', component: BudgetPanel, kind: 'sheet', menu: true, order: 2 });
registerPanel({ id: 'policies', title: 'Policies', icon: 'policy', component: PoliciesPanel, kind: 'sheet', menu: true, order: 3 });
registerPanel({ id: 'districts', title: 'Districts', icon: 'district', component: DistrictsPanel, kind: 'sheet', menu: true, order: 4 });
registerPanel({ id: 'goals', title: 'Goals', icon: 'trophy', component: GoalsPanel, kind: 'sheet', menu: true, order: 5 });
registerPanel({ id: 'stats', title: 'Statistics', icon: 'stats', component: StatsPanel, kind: 'sheet', menu: true, order: 6 });
registerPanel({ id: 'lenses', title: 'Data Lenses', icon: 'lens', component: LensesPanel, kind: 'sheet', menu: true, order: 7 });
registerPanel({ id: 'news', title: 'Hypernet', icon: 'news', component: NewsPanel, kind: 'side', menu: true, order: 8 });
registerPanel({ id: 'saves', title: 'Saved Cities', icon: 'save', component: SavesPanel, kind: 'modal', menu: true, order: 80 });
registerPanel({ id: 'settings', title: 'Settings', icon: 'settings', component: SettingsPanel, kind: 'side', menu: true, order: 90 });
registerPanel({ id: 'help', title: 'How to Play', icon: 'help', component: HelpPanel, kind: 'modal', menu: true, order: 95 });

// ───────────────────────────── overlays
registerOverlay({ id: 'labels', component: Labels, order: -10 });
registerOverlay({ id: 'lens-legend', component: LensLegend, order: 10 });
registerOverlay({ id: 'chirps', component: Chirps, order: 11 });
registerOverlay({ id: 'tutorial', component: Tutorial, order: 50 });
registerOverlay({ id: 'photo', component: PhotoMode, order: 60 });

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
registerHudButton({
  id: 'panels.photo',
  icon: 'camera',
  label: 'Photo mode',
  rail: 'right',
  order: 10,
  onClick: () => {
    ui.panel.value = null;
    ui.photo.value = true;
    uiSound('camera');
  },
  active: () => ui.photo.value,
  visible: planetOnly,
});
registerHudButton({ id: 'panels.saves', icon: 'save', label: 'Save & load', rail: 'right', order: 20, onClick: toggle('saves'), active: () => ui.panel.value === 'saves', visible: planetOnly });
registerHudButton({ id: 'panels.settings', icon: 'settings', label: 'Settings', rail: 'right', order: 30, onClick: toggle('settings'), active: () => ui.panel.value === 'settings', visible: planetOnly });
registerHudButton({ id: 'panels.help', icon: 'help', label: 'How to play', rail: 'right', order: 40, onClick: toggle('help'), active: () => ui.panel.value === 'help', visible: planetOnly });

// ───────────────────────────── URL params
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(location.search);
  if (params.get('photo') === '1') {
    let shown = false;
    const stopPhoto = effect(() => {
      if (shown || ui.screen.value !== 'game') return;
      shown = true;
      setTimeout(() => {
        ui.photo.value = true;
        stopPhoto();
      }, 800);
    });
  }
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
      setSettings: typeof setSettings;
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
    setSettings,
  };
}
