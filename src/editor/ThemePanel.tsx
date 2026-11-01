import { DEFAULT_THEME, type Theme } from '@/book/types';
import { resetTheme, setNightColor, setThemeColor } from '@/state/actions';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import { useEditSession } from './session';
import { Sheet, sheetStyles } from './Sheet';
import styles from './Panels.module.css';

const DAY: Array<[keyof Omit<Theme, 'night'>, string]> = [
  ['paper', 'Paper'],
  ['ink', 'Ink'],
  ['muted', 'Muted ink'],
  ['sage', 'Sage, the siding'],
  ['olive', 'Olive, the shutters'],
  ['oak', 'Oak'],
  ['clay', 'Clay'],
  ['hairline', 'Hairline'],
];
const NIGHT: Array<[keyof Theme['night'], string]> = [
  ['paper', 'Night paper'],
  ['ink', 'Night ink'],
  ['muted', 'Night muted'],
  ['hairline', 'Night hairline'],
];

/** The book's colours are data; this edits them. */
export function ThemePanel() {
  const theme = useBookStore((s) => s.book.theme);
  const setPanel = useUiStore((s) => s.setPanel);
  const { change, end } = useEditSession();
  return (
    <Sheet title="Theme" onClose={() => setPanel(null)} testId="theme-panel">
      <p className={sheetStyles.hint}>Colours taken from the house. Change one and every page follows.</p>
      <div>
        {DAY.map(([key, label]) => (
          <label key={key} className={styles.swatchRow}>
            <span>{label}</span>
            <span className={styles.hex}>{theme[key]}</span>
            <input type="color" value={theme[key]} onChange={(e) => change(() => setThemeColor(key, e.target.value))} onBlur={end} aria-label={label} />
          </label>
        ))}
      </div>
      <p className="t-label">Night</p>
      <div>
        {NIGHT.map(([key, label]) => (
          <label key={key} className={styles.swatchRow}>
            <span>{label}</span>
            <span className={styles.hex}>{theme.night[key]}</span>
            <input type="color" value={theme.night[key]} onChange={(e) => change(() => setNightColor(key, e.target.value))} onBlur={end} aria-label={label} />
          </label>
        ))}
      </div>
      <div className={sheetStyles.row}>
        <button type="button" className={sheetStyles.button} data-quiet="true" onClick={() => resetTheme(DEFAULT_THEME)}>Back to the house palette</button>
      </div>
    </Sheet>
  );
}
