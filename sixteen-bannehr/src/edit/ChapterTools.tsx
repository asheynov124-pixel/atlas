import { useState } from 'react';
import { useBook } from '../store/book';
import { useNav } from '../store/nav';
import { addChapter, deleteChapter, moveChapter } from '../store/actions';

/** On the Contents spread in Edit mode: move, delete and add chapters in place. */
export function ChapterTools({ chapterId, add }: { chapterId?: string; add?: boolean }) {
  const book = useBook();
  const go = useNav((s) => s.go);
  const [confirm, setConfirm] = useState(false);

  if (add) {
    return (
      <button
        type="button"
        className="toc__add"
        onClick={() => {
          const { spreadId } = addChapter();
          go(spreadId, 0);
        }}
      >
        + Add a chapter
      </button>
    );
  }

  const movable = book.chapters.filter((c) => c.kind !== 'front');
  const i = movable.findIndex((c) => c.id === chapterId);
  const chapter = movable[i];
  if (!chapter) return null;

  return (
    <span className="toc__tools">
      <button type="button" onClick={() => moveChapter(chapter.id, -1)} disabled={i === 0} aria-label={`Move ${chapter.title} up`}>
        ↑
      </button>
      <button type="button" onClick={() => moveChapter(chapter.id, 1)} disabled={i === movable.length - 1} aria-label={`Move ${chapter.title} down`}>
        ↓
      </button>
      {confirm ? (
        <button type="button" className="is-danger" onClick={() => deleteChapter(chapter.id)} onBlur={() => setConfirm(false)} autoFocus>
          Delete {chapter.spreads.length} spreads?
        </button>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} aria-label={`Delete ${chapter.title}`}>
          ×
        </button>
      )}
    </span>
  );
}
