import type { CSSProperties } from 'react';
import { useSpread } from '../reader/context';
import { usePrefs } from '../store/prefs';
import { AUTHORS, type PageSide } from '../model/types';

/** Marginalia: handwritten notes in the margins, coloured by who wrote them. */
export function NotesLayer({ side }: { side: PageSide }) {
  const { placed, decorative } = useSpread();
  const showNotes = usePrefs((s) => s.showNotes);
  const showResolved = usePrefs((s) => s.showResolved);
  if (!showNotes || decorative) return null;
  const notes = placed.spread.notes.filter((n) => n.page === side && (!n.resolved || showResolved));
  if (!notes.length) return null;
  return (
    <div className="notes">
      {notes.map((n) => (
        <aside
          key={n.id}
          className={['note', n.resolved && 'note--resolved'].filter(Boolean).join(' ')}
          data-author={n.author}
          style={{ left: `${n.x}%`, top: `${n.y}%` } as CSSProperties}
          aria-label={`Note from ${AUTHORS[n.author].name}`}
        >
          <p className="note__text">{n.text}</p>
          <span className="note__by">— {AUTHORS[n.author].initial}.</span>
        </aside>
      ))}
    </div>
  );
}
