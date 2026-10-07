/**
 * OWNER: ui-panels.
 * Registers every deep-dive panel, overlay and HUD button of the UI panels module (imported once by main.tsx).
 *
 *   Panels   city · budget · policies · districts (sheet) — more are registered below as they land.
 */
import { registerPanel } from '../registry';
import { BudgetPanel } from './BudgetPanel';
import { CityPanel } from './CityPanel';
import { DistrictsPanel } from './DistrictsPanel';
import { PoliciesPanel } from './PoliciesPanel';
import './panels.css';

registerPanel({ id: 'city', title: 'City Hall', icon: 'crown', component: CityPanel, kind: 'sheet', menu: true, order: 1 });
registerPanel({ id: 'budget', title: 'Budget', icon: 'budget', component: BudgetPanel, kind: 'sheet', menu: true, order: 2 });
registerPanel({ id: 'policies', title: 'Policies', icon: 'policy', component: PoliciesPanel, kind: 'sheet', menu: true, order: 3 });
registerPanel({ id: 'districts', title: 'Districts', icon: 'district', component: DistrictsPanel, kind: 'sheet', menu: true, order: 4 });
