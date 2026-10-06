/**
 * OWNER: cosmos agent
 * Cosmos UI registration (imported once by main.tsx):
 *   overlay  'cosmos'    CosmosHud — breadcrumb, info cards, travel / colonise CTA, labels, warp HUD (system / galaxy /
 *                        universe views) + the warp flash
 *   panels   'research'  tech tree (full screen) · 'colonies' empire overview & quick switch · 'forge' sandbox
 *                        Planet Forge (listed in the More menu only in sandbox games)
 *   HUD      'cosmos.research' (left rail, career): research with a badge for affordable techs.
 *            The star-map button itself is ui-core's built-in 'core.map' (it calls cosmos.openView('system')), so we
 *            do not register a second one.
 * URL hooks (handled by Cosmos): &cosmos=system|galaxy|universe · &cosmosSelect=<id> · &cosmosPanel=<panel> ·
 *            &warpTo=<planetId>
 */
import { effect } from '@preact/signals';
import { registerHudButton, registerOverlay, registerPanel, type PanelDef } from '../../ui/registry';
import { ui } from '../../ui/store';
import { openPanel } from '../../ui/core/env';
import { game } from '../../game/instance';
import { CosmosHud } from './CosmosHud';
import { ResearchPanel } from './ResearchPanel';
import { ColoniesPanel } from './ColoniesPanel';
import { ForgePanel } from './ForgePanel';
import './cosmos.css';

registerOverlay({ id: 'cosmos', component: CosmosHud, order: 5 });

registerPanel({ id: 'research', title: 'Research', icon: 'research', component: ResearchPanel, kind: 'full', menu: true, order: 30 });
registerPanel({ id: 'colonies', title: 'Colonies', icon: 'globe', component: ColoniesPanel, kind: 'sheet', menu: true, order: 31 });

const forge: PanelDef = { id: 'forge', title: 'Planet Forge', icon: 'magic', component: ForgePanel, kind: 'sheet', menu: false, order: 32 };
registerPanel(forge);
// the forge is a sandbox tool: only list it in the More menu when it can be used
effect(() => {
  const sandbox = ui.mode.value === 'sandbox';
  if (forge.menu !== sandbox) registerPanel({ ...forge, menu: sandbox });
  forge.menu = sandbox;
});

function affordable(): number {
  try {
    void ui.research.value;
    return game?.progression?.affordableTechs() ?? 0;
  } catch {
    return 0;
  }
}

registerHudButton({
  id: 'cosmos.research',
  icon: 'research',
  label: 'Research',
  rail: 'left',
  order: 40,
  onClick: () => {
    if (ui.panel.value === 'research') ui.panel.value = null;
    else openPanel('research');
  },
  active: () => ui.panel.value === 'research',
  visible: () => ui.mode.value === 'career' && ui.tier.value >= 1,
  badge: () => affordable() || null,
});
