/**
 * OWNER: ui-core.
 * Shortcuts — keyboard & touch cheat sheet, generated from input/shortcuts.ts. Opened with "?" when no "help" panel is registered.
 */
import { signal } from '@preact/signals';
import { Kbd } from '../display';
import { Modal } from '../Modal';
import { Icon } from '../../icons';
import { GESTURES, SHORTCUTS, type ShortcutDef } from '../../../input/shortcuts';

export const shortcutsOpen = signal(false);

// single source of truth: the input module's list (camera, tools, lenses, history) plus touch gestures
const GROUP_ORDER: ShortcutDef['group'][] = ['Build', 'Edit', 'View', 'Camera', 'Time'];
const GROUP_TITLE: Record<ShortcutDef['group'], string> = { Build: 'Build', Edit: 'Edit', View: 'World & view', Camera: 'Camera', Time: 'Time' };
const GROUPS: { title: string; rows: [string[], string][] }[] = GROUP_ORDER.map((g) => ({
  title: GROUP_TITLE[g],
  rows: SHORTCUTS.filter((x) => x.group === g).map((x) => [x.keys, x.label] as [string[], string]),
})).filter((g) => g.rows.length > 0);

export function ShortcutsModal() {
  return (
    <Modal open={shortcutsOpen.value} onClose={() => (shortcutsOpen.value = false)} title="Keyboard shortcuts" icon="keyboard" size="lg">
      <div class="sc-grid">
        {GROUPS.map((g) => (
          <section key={g.title} class="sc-group">
            <h3 class="cz-section-title">{g.title}</h3>
            {g.rows.map(([keys, label]) => (
              <div class="sc-row" key={label}>
                <span class="sc-label">{label}</span>
                <span class="sc-keys">
                  {keys.map((k, i) => (k === '–' ? <span key={i} class="dim">–</span> : <Kbd key={i}>{k}</Kbd>))}
                </span>
              </div>
            ))}
          </section>
        ))}
        <section class="sc-group">
          <h3 class="cz-section-title">Touch</h3>
          {GESTURES.map((g) => (
            <div class="sc-row" key={g.gesture}>
              <span class="sc-label">{g.label}</span>
              <span class="sc-keys">
                <Icon name={g.icon} size={14} /> <span class="dim">{g.gesture}</span>
              </span>
            </div>
          ))}
        </section>
      </div>
    </Modal>
  );
}
