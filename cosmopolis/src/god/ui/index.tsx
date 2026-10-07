/**
 * OWNER: god
 * God UI registration (imported once by main.tsx):
 *   panel    'god'          God Mode sheet — categories, magnitude, power cards, Chrono, running effects
 *   overlay  'god'          flashes, dread vignette, title cards, disaster warnings, Rewind offer & transition
 *   HUD      'god.rewind'   right rail, only while a catastrophe can be rewound (quick Chrono access)
 * The God rail button itself is ui-core's built-in 'core.god' (opens this panel), so we don't register a second.
 * URL hooks (handled by GodPowers): &god=<powerId>&godTile=<n>&godIntensity=<0.5..2>&godPath=a,b,c
 *   plus &panel=god opens the panel (ui-panels convention) and &godTab=<category> picks a tab.
 */
import { registerHudButton, registerOverlay, registerPanel } from '../../ui/registry';
import { ui } from '../../ui/store';
import { game } from '../../game/instance';
import { godUi } from '../state';
import { GodPanel } from './GodPanel';
import { GodOverlay } from './GodOverlay';
import './god.css';

registerPanel({ id: 'god', title: 'God Mode', icon: 'god', component: GodPanel, kind: 'sheet', menu: false, order: 60 });
registerOverlay({ id: 'god', component: GodOverlay, order: 40 });

registerHudButton({
  id: 'god.rewind',
  icon: 'rewind',
  label: 'Rewind time',
  rail: 'right',
  order: -9,
  onClick: () => {
    void game.god.chrono.rewind();
  },
  visible: () => !!godUi.snapshot.value && ui.mode.value !== undefined && !godUi.rewind.value,
});

// test hooks: open the panel on a given tab
try {
  const params = new URLSearchParams(location.search);
  const tab = params.get('godTab');
  if (tab) godUi.tab.value = tab;
  if (params.get('godPanel') === '1') {
    const open = () => {
      if (ui.screen.value === 'game') ui.panel.value = 'god';
      else setTimeout(open, 300);
    };
    setTimeout(open, 600);
  }
} catch {
  /* no location (tests) */
}
