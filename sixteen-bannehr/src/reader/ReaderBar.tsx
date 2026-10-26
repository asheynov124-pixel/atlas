import { hrefFor } from '../store/nav';
import { useLayout } from '../store/book';
import { usePrefs, useMode } from '../store/prefs';
import { useNightTheme } from './theme';
import type { LayoutMode } from './context';
import type { Placed } from '../model/pages';

/** The quiet strip under the book: contents, where you are, night, notes, edit. */
export function ReaderBar({
  current,
  total,
  onTurn,
  layout,
}: {
  current: Placed;
  total: number;
  onTurn: (d: 1 | -1) => void;
  layout: LayoutMode;
}) {
  const { placed } = useLayout();
  const contents = placed.find((p) => p.spread.template === 'contents');
  const night = useNightTheme();
  const setTheme = usePrefs((s) => s.setTheme);
  const showNotes = usePrefs((s) => s.showNotes);
  const toggleNotes = usePrefs((s) => s.toggleNotes);
  const editing = useMode((s) => s.editing);
  const setEditing = useMode((s) => s.setEditing);
  const where = current.isCover ? 'Cover' : `${current.verso}–${current.recto}`;
  const notesCount = placed.reduce((n, p) => n + p.spread.notes.filter((x) => !x.resolved).length, 0);

  return (
    <nav className="reader-bar" aria-label="Reading">
      <div className="reader-bar__group">
        {contents ? <a href={hrefFor(contents.spread.id)}>Contents</a> : null}
      </div>
      <div className="reader-bar__folio">
        {layout === 'spread' ? (
          <button className="reader-bar__arrow" onClick={() => onTurn(-1)} disabled={current.index === 0} aria-label="Previous pages">
            ‹
          </button>
        ) : null}
        <span aria-live="polite" aria-atomic="true">
          <span className="visually-hidden">Pages </span>
          {where}
          <span className="visually-hidden"> of {total * 2 - 1}</span>
        </span>
        {layout === 'spread' ? (
          <button className="reader-bar__arrow" onClick={() => onTurn(1)} disabled={current.index >= total - 1} aria-label="Next pages">
            ›
          </button>
        ) : null}
      </div>
      <div className="reader-bar__group reader-bar__group--end">
        <button aria-pressed={night} onClick={() => setTheme(night ? 'day' : 'night')}>
          Night
        </button>
        {notesCount > 0 && layout === 'spread' ? (
          <button aria-pressed={showNotes} onClick={toggleNotes}>
            Notes
          </button>
        ) : null}
        <button aria-pressed={editing} onClick={() => setEditing(!editing)} className="reader-bar__edit">
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
    </nav>
  );
}
