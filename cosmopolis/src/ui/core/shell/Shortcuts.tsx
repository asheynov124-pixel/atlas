/**
 * OWNER: ui-core.
 * Shortcuts — keyboard cheat sheet (desktop). Opened with "?" when no "help" panel is registered.
 */
import { signal } from '@preact/signals';
import { Kbd } from '../display';
import { Modal } from '../Modal';

export const shortcutsOpen = signal(false);

const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'Build',
    rows: [
      [['B'], 'Build menu'],
      [['T'], 'Roads'],
      [['Z'], 'Zones'],
      [['N'], 'Nature & decor'],
      [['L'], 'Terraform'],
      [['X'], 'Bulldoze'],
      [['Esc'], 'Close / cancel'],
    ],
  },
  {
    title: 'World',
    rows: [
      [['M'], 'Star map'],
      [['G'], 'God powers'],
      [['I'], 'City status'],
      [['H'], 'Hide interface'],
      [['Ctrl', 'S'], 'Save'],
    ],
  },
  {
    title: 'Camera & time',
    rows: [
      [['W', 'A', 'S', 'D'], 'Pan'],
      [['Q', 'E'], 'Rotate'],
      [['R', 'F'], 'Tilt'],
      [['Space'], 'Pause'],
      [['1', '–', '4'], 'Game speed'],
      [['Ctrl', 'Z'], 'Undo'],
    ],
  },
];

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
      </div>
    </Modal>
  );
}
