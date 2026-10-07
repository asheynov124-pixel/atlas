/**
 * OWNER: studio
 * Architect Studio UI registration (imported once by main.tsx):
 *   overlay  'studio'          the full-screen editor (StudioOverlay) — visible while the studio view is active
 *   HUD      'studio.open'     right rail "Architect Studio" button (planet view only)
 * The Build sheet's "My Designs" category (ui-core) already shows a "New design" card and an empty state that call
 * game.studio.open(); saved designs appear there as regular items (category 'custom', group 'My Designs').
 * URL hooks are handled by Studio.ts (&studio=1, &studioTpl=…, &studioTab=…, &studioNight=1, &studioDemo=1).
 * Test hook: window.__cosmoStudio = { ui: studioUi signals, studio: game.studio } for screenshot scripts.
 */
import { game } from '../../game/instance';
import { registerHudButton, registerOverlay } from '../../ui/registry';
import { ui } from '../../ui/store';
import { studioUi } from '../state';
import { StudioOverlay } from './StudioOverlay';
import './studio.css';

registerOverlay({ id: 'studio', component: StudioOverlay, order: 30 });

registerHudButton({
  id: 'studio.open',
  icon: 'custom',
  label: 'Architect Studio',
  rail: 'right',
  order: 12,
  onClick: () => {
    try {
      game.studio.open();
    } catch (e) {
      console.error('[studio] open failed', e);
    }
  },
  active: () => studioUi.open.value,
  visible: () => ui.view.value === 'planet' && ui.screen.value === 'game',
});

declare global {
  interface Window {
    __cosmoStudio?: { ui: typeof studioUi; readonly studio: typeof game.studio };
  }
}
try {
  window.__cosmoStudio = {
    ui: studioUi,
    get studio() {
      return game.studio;
    },
  };
} catch {
  /* no window (tests) */
}
