/**
 * OWNER: studio
 * Architect Studio UI registration (imported once by main.tsx):
 *   overlay  'studio'          the full-screen editor (StudioOverlay) — visible while the studio view is active
 *   HUD      'studio.open'     right rail "Architect Studio" button (planet view only)
 *   HUD      'studio.edit'     right rail "Edit this design" — only while one of your designs is selected in the city
 * The Build sheet's "My Designs" category (ui-core) already shows a "New design" card and an empty state that call
 * game.studio.open(); saved designs appear there as regular items (category 'custom', group 'My Designs').
 * URL hooks are handled by Studio.ts (&studio=1, &studioTpl=…, &studioTab=…, &studioNight=1, &studioDemo=1).
 * Test hook: window.__cosmoStudio = { ui: studioUi signals, studio: game.studio } for screenshot scripts.
 */
import { game } from '../../game/instance';
import { registerHudButton, registerOverlay } from '../../ui/registry';
import { ui } from '../../ui/store';
import { designIdOf } from '../model';
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

/** Design id of the selected building when it is one of this city's designs. */
function selectedDesign(): string | null {
  const sel = ui.selection.value;
  if (!sel || sel.kind !== 'building') return null;
  try {
    const b = game.planet?.buildings.get(sel.id);
    const id = b ? designIdOf(b.defId) : null;
    return id && studioUi.designs.value.some((d) => d.id === id) ? id : null;
  } catch {
    return null;
  }
}

registerHudButton({
  id: 'studio.edit',
  icon: 'edit',
  label: 'Edit this design in the Architect Studio',
  rail: 'right',
  order: 11,
  onClick: () => {
    const id = selectedDesign();
    if (id) game.studio.open(id, { tab: 'parts' });
  },
  visible: () => ui.view.value === 'planet' && !!selectedDesign(),
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
